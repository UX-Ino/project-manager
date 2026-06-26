import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

interface WbsRowPayload {
  row_order: number;
  level: number;
  task_l1: string | null;
  task_l2: string | null;
  task_l3: string | null;
  task_l4: string | null;
  description: string | null;
  assignee: string | null;
  status: string;
  plan_start: string | null;
  plan_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  plan_progress: number;
  actual_progress: number;
}

interface SyncPayload {
  sheet_url: string;
  rows: WbsRowPayload[];
  weeks?: { week_num: number; label: string; date_range: string }[];
}

// ─── 유효성 검사 헬퍼 ───────────────────────────────────────────────────────

function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function isValidRow(row: WbsRowPayload): boolean {
  return (
    typeof row.row_order === 'number' &&
    typeof row.level === 'number' &&
    row.level >= 1 &&
    ['미진행', '진행중', '완료'].includes(row.status) &&
    typeof row.plan_progress === 'number' &&
    typeof row.actual_progress === 'number'
  );
}

// ─── POST 핸들러 ─────────────────────────────────────────────────────────────

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
    let body: SyncPayload;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: '요청 바디가 유효한 JSON이 아닙니다.' },
        { status: 400 }
      );
    }

    const { sheet_url, rows, weeks } = body;

    // 3. sheet_url 검증 및 Spreadsheet ID 추출
    if (!sheet_url) {
      return NextResponse.json(
        { error: 'sheet_url 필드가 필요합니다.' },
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

    // 4. rows 검증
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'rows 배열이 비어있거나 올바른 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    const invalidRows = rows.filter(r => !isValidRow(r));
    if (invalidRows.length > 0) {
      return NextResponse.json(
        { error: `유효하지 않은 행이 ${invalidRows.length}개 있습니다.`, invalidRows },
        { status: 400 }
      );
    }

    // 5. Supabase 서비스 롤 클라이언트 생성 (RLS 우회)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase 환경변수(SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 5.1. 구글 시트 URL 기반 프로젝트 검색
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .ilike('wbs_sheet_url', `%${spreadsheetId}%`)
      .maybeSingle();

    if (projectError) {
      console.error('[wbs-sync] 프로젝트 조회 오류:', projectError);
      return NextResponse.json(
        { error: `데이터베이스 조회 실패: ${projectError.message}` },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json(
        { error: `해당 구글 시트 주소가 등록된 프로젝트를 찾을 수 없습니다. 웹 앱 화면(프로젝트 수정)에서 구글 시트 URL을 먼저 등록해 주세요.` },
        { status: 404 }
      );
    }

    const project_id = project.id;

    // 6. 기존 WBS 행 전체 삭제 후 새 데이터 삽입 (덮어쓰기 방식)
    const { error: deleteError } = await supabase
      .from('wbs_rows')
      .delete()
      .eq('project_id', project_id);

    if (deleteError) {
      console.error('[wbs-sync] 기존 데이터 삭제 오류:', deleteError);
      return NextResponse.json(
        { error: `기존 데이터 삭제 실패: ${deleteError.message}` },
        { status: 500 }
      );
    }

    const insertData = rows.map(row => {
      let task_l4 = row.task_l4;
      let description = row.description;
      if (row.level >= 5 && !task_l4 && description) {
        task_l4 = description;
        description = null;
      }
      return {
        ...row,
        task_l4,
        description,
        project_id,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: insertError, count } = await supabase
      .from('wbs_rows')
      .insert(insertData, { count: 'exact' });

    if (insertError) {
      console.error('[wbs-sync] 데이터 삽입 오류:', insertError);
      return NextResponse.json(
        { error: `데이터 삽입 실패: ${insertError.message}` },
        { status: 500 }
      );
    }

    // 7.1. 주차 정보가 전달된 경우 projects 테이블의 wbs_weeks에 업데이트
    if (weeks && Array.isArray(weeks)) {
      const { error: updateProjectError } = await supabase
        .from('projects')
        .update({ wbs_weeks: weeks })
        .eq('id', project_id);
      
      if (updateProjectError) {
        console.error('[wbs-sync] 프로젝트 주차 업데이트 실패:', updateProjectError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `WBS 동기화 완료: ${count ?? rows.length}개 행이 삽입되었습니다.`,
      project_id,
      synced_at: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('[wbs-sync] 예상치 못한 오류:', message);
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
    endpoint: '/api/wbs-sync',
    method: 'POST',
    description: 'Google Sheets WBS → Supabase DB 동기화 API',
  });
}
