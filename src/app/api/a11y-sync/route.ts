import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

interface A11yRowPayload {
  group_name: string;
  text: string;
  checked: boolean;
  assignee: string | null;
  due_date: string | null;
  memo: string | null;
  sort_order: number;
  tag: string | null;
  image_url: string | null;
}

interface SyncPayload {
  sheet_url: string;
  rows: A11yRowPayload[];
}

// ─── 유효성 검사 헬퍼 ───────────────────────────────────────────────────────

function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function isValidRow(row: A11yRowPayload): boolean {
  return (
    typeof row.group_name === 'string' &&
    row.group_name.trim().length > 0 &&
    typeof row.text === 'string' &&
    row.text.trim().length > 0 &&
    typeof row.checked === 'boolean' &&
    typeof row.sort_order === 'number'
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

    const { sheet_url, rows } = body;

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
        { error: `유효하지 않은 행이 ${invalidRows.length}개 있습니다. (지침 원칙 및 검증 기준 요약은 필수입니다)`, invalidRows },
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
      .ilike('a11y_sheet_url', `%${spreadsheetId}%`)
      .maybeSingle();

    if (projectError) {
      console.error('[a11y-sync] 프로젝트 조회 오류:', projectError);
      return NextResponse.json(
        { error: `데이터베이스 조회 실패: ${projectError.message}` },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json(
        { error: `해당 구글 시트 주소가 등록된 프로젝트를 찾을 수 없습니다. 웹 앱 화면(접근성 점검리스트)에서 구글 시트 URL을 먼저 등록해 주세요.` },
        { status: 404 }
      );
    }

    const project_id = project.id;

    // 6. 기존 접근성(accessibility) 체크리스트 행 전체 삭제 후 새 데이터 삽입 (덮어쓰기 방식)
    const { error: deleteError } = await supabase
      .from('checklist')
      .delete()
      .eq('project_id', project_id)
      .eq('phase', 'accessibility');

    if (deleteError) {
      console.error('[a11y-sync] 기존 데이터 삭제 오류:', deleteError);
      return NextResponse.json(
        { error: `기존 데이터 삭제 실패: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // 7. 새 데이터 삽입
    const insertData = rows.map(row => ({
      project_id,
      phase: 'accessibility',
      group_name: row.group_name,
      text: row.text,
      checked: row.checked,
      assignee: row.assignee,
      due_date: row.due_date || null,
      memo: row.memo,
      tag: row.tag || null,
      image_url: row.image_url || null,
      sort_order: row.sort_order,
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError, count } = await supabase
      .from('checklist')
      .insert(insertData, { count: 'exact' });

    if (insertError) {
      console.error('[a11y-sync] 데이터 삽입 오류:', insertError);
      return NextResponse.json(
        { error: `데이터 삽입 실패: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `접근성 점검리스트 동기화 완료: ${count ?? rows.length}개 항목이 삽입되었습니다.`,
      project_id,
      synced_at: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('[a11y-sync] 예상치 못한 오류:', message);
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
    endpoint: '/api/a11y-sync',
    method: 'POST',
    description: 'Google Sheets Accessibility → Supabase DB 동기화 API',
  });
}
