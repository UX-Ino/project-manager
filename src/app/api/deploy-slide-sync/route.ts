import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface SlideSyncPayload {
  sheet_url: string;
  slide_title: string;
  slide_url: string;
}

function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    // 1. 인증 토큰 확인
    const syncSecret = process.env.WBS_SYNC_SECRET;
    if (!syncSecret) {
      return NextResponse.json(
        { error: 'WBS_SYNC_SECRET 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token || token !== syncSecret) {
      return NextResponse.json(
        { error: '인증 실패: 유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    // 2. 요청 바디 파싱
    let body: SlideSyncPayload;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: '요청 바디가 유효한 JSON이 아닙니다.' },
        { status: 400 }
      );
    }

    const { sheet_url, slide_title, slide_url } = body;

    // 3. 필드 검증
    if (!sheet_url || !slide_title || !slide_url) {
      return NextResponse.json(
        { error: 'sheet_url, slide_title, slide_url 필드는 모두 필수입니다.' },
        { status: 400 }
      );
    }

    const spreadsheetId = extractSpreadsheetId(sheet_url);
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: '유효한 구글 스프레드시트 URL 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    // 4. Supabase 서비스 롤 클라이언트 생성 (RLS 우회하여 작업 내역 저장)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 5. 구글 시트 URL 기반 프로젝트 검색 (wbs_sheet_url 또는 a11y_sheet_url 매핑)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .or(`a11y_sheet_url.ilike.%${spreadsheetId}%,wbs_sheet_url.ilike.%${spreadsheetId}%`)
      .maybeSingle();

    if (projectError) {
      console.error('[deploy-slide-sync] 프로젝트 조회 오류:', projectError);
      return NextResponse.json(
        { error: `데이터베이스 조회 실패: ${projectError.message}` },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json(
        { error: '해당 구글 시트 주소가 등록된 프로젝트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const project_id = project.id;

    // 6. deploy_slides 테이블에 생성 내역 삽입
    const { error: insertError } = await supabase
      .from('deploy_slides')
      .insert({
        project_id,
        slide_title,
        slide_url,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[deploy-slide-sync] 슬라이드 이력 삽입 오류:', insertError);
      return NextResponse.json(
        { error: `슬라이드 이력 저장 실패: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `배포 슬라이드가 성공적으로 등록되었습니다: ${slide_title}`,
      project_id,
      slide_url
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('[deploy-slide-sync] 예상치 못한 오류:', message);
    return NextResponse.json(
      { error: `서버 오류: ${message}` },
      { status: 500 }
    );
  }
}

// GET — 엔드포인트 상태 확인용
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/deploy-slide-sync',
    method: 'POST',
    description: 'Google Sheets Slide Automation → Supabase DB 생성 이력 저장 API',
  });
}
