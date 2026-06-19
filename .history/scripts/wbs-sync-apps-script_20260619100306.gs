/**
 * ============================================================
 *  WBS 구글 시트 → Supabase DB 직접 동기화 스크립트
 *  (Next.js API 없이 Supabase REST API 직접 호출)
 * ============================================================
 *
 * 📋 설치 방법:
 *  1. 구글 시트 열기
 *  2. 확장 프로그램 → Apps Script 클릭
 *  3. 이 파일의 내용을 전체 복사하여 붙여넣기
 *  4. 아래 CONFIG 섹션에 실제 값 3가지 입력
 *  5. 저장(Ctrl+S) → syncWbsToSupabase 함수 실행
 *
 * 🔑 SUPABASE_KEY 얻는 법:
 *  Supabase 대시보드 → Settings → API
 *  → "service_role" 키 복사 (RLS 우회, 외부 노출 금지)
 *  anon key는 RLS 때문에 사용 불가
 *
 * 📌 시트 구조 (gid=878328870 기준):
 *  - 13행까지: 헤더 (자동 스킵)
 *  - 14행부터: 실제 WBS 데이터
 *  - 컬럼: [A]카테고리 [B]No [C]Level [D]L1 [E]L2 [F]L3 [G]L4
 *          [H]Description [I]R/R [J]Status [K]계획시작 [L]계획완료
 *          [M]실제시작 [N]실제완료 [O]계획% [P]실제%
 * ============================================================
 */

// ─── ⚙️ CONFIG (여기만 수정) ─────────────────────────────────────────────────

var CONFIG = {
  // Supabase 프로젝트 URL (대시보드 Settings → API → Project URL)
  SUPABASE_URL: 'https://vdaychixyxhjavjgvioq.supabase.co',

  // Supabase service_role 키 (Settings → API → service_role → Reveal)
  // ⚠️ RLS 우회용 — 절대 외부 공개 금지. Apps Script는 구글 계정으로 보호됨.
  SUPABASE_KEY: 'YOUR_SERVICE_ROLE_KEY_HERE',

  // Supabase DB 프로젝트 UUID
  PROJECT_ID: 'f2dbcf00-fdbc-46fa-a1c9-4b1cb6e77fde',

  // 데이터 시작 행 번호 (1-indexed)
  DATA_START_ROW: 14,

  // 시트 이름 (빈 문자열 = 현재 활성 시트)
  SHEET_NAME: '',
};

// ─── 컬럼 인덱스 (0-indexed) ────────────────────────────────────────────────

var COL = {
  ROW_ID:       1,   // B열: No
  LEVEL:        2,   // C열: Level (1~4)
  TASK_L1:      3,   // D열: Task L1
  TASK_L2:      4,   // E열: Task L2
  TASK_L3:      5,   // F열: Task L3
  TASK_L4:      6,   // G열: Task L4
  DESCRIPTION:  7,   // H열: Description/Outputs
  ASSIGNEE:     8,   // I열: R/R (담당자)
  STATUS:       9,   // J열: Status
  PLAN_START:   10,  // K열: 계획 시작
  PLAN_END:     11,  // L열: 계획 완료
  ACTUAL_START: 12,  // M열: 실제 시작
  ACTUAL_END:   13,  // N열: 실제 완료
  PLAN_PROG:    14,  // O열: 계획 진척율(%)
  ACTUAL_PROG:  15,  // P열: 실제 진척율(%)
};

// ─── 메인 함수 ───────────────────────────────────────────────────────────────

function syncWbsToSupabase() {
  // 1. 설정 검증
  if (!validateConfig()) return;

  // 2. 시트 가져오기
  var sheet = getSheet();
  if (!sheet) return;

  // 3. 시트 데이터 읽기
  var rows = readWbsRows(sheet);
  if (rows.length === 0) {
    showAlert('오류', '동기화할 데이터가 없습니다. 시트를 확인해 주세요.');
    return;
  }

  Logger.log('[WBS Sync] 읽은 행 수: ' + rows.length);

  // 4. 기존 데이터 삭제
  var deleteResult = deleteExistingRows();
  if (!deleteResult.success) {
    showAlert('❌ 삭제 실패', deleteResult.error);
    return;
  }

  // 5. 새 데이터 삽입
  var insertResult = insertRows(rows);
  if (insertResult.success) {
    showAlert(
      '✅ 동기화 완료',
      rows.length + '개 행이 Supabase에 저장되었습니다.\n\n' +
      '시각: ' + new Date().toLocaleString('ko-KR')
    );
    Logger.log('[WBS Sync] 완료: ' + rows.length + '행 삽입');
  } else {
    showAlert('❌ 삽입 실패', insertResult.error);
  }
}

// ─── Supabase REST API 호출 ──────────────────────────────────────────────────

/** 공통 Supabase 헤더 */
function getHeaders() {
  return {
    'apikey': CONFIG.SUPABASE_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

/** 기존 wbs_rows 행 전체 삭제 (해당 project_id만) */
function deleteExistingRows() {
  var url = CONFIG.SUPABASE_URL + '/rest/v1/wbs_rows?project_id=eq.' + CONFIG.PROJECT_ID;

  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'delete',
      headers: getHeaders(),
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    // 200, 204 모두 성공
    if (code === 200 || code === 204) {
      Logger.log('[WBS Sync] 기존 데이터 삭제 완료 (HTTP ' + code + ')');
      return { success: true };
    }

    var body = response.getContentText();
    return { success: false, error: '[HTTP ' + code + '] 삭제 실패: ' + body };

  } catch (e) {
    return { success: false, error: '네트워크 오류 (삭제): ' + e.message };
  }
}

/** 새 wbs_rows 행 삽입 (100개씩 배치) */
function insertRows(rows) {
  var url = CONFIG.SUPABASE_URL + '/rest/v1/wbs_rows';
  var BATCH_SIZE = 100;

  for (var i = 0; i < rows.length; i += BATCH_SIZE) {
    var batch = rows.slice(i, i + BATCH_SIZE);

    // project_id 추가
    var payload = batch.map(function(row) {
      return Object.assign({ project_id: CONFIG.PROJECT_ID }, row);
    });

    try {
      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: getHeaders(),
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      var code = response.getResponseCode();
      if (code !== 200 && code !== 201) {
        var body = response.getContentText();
        return { success: false, error: '[HTTP ' + code + '] 삽입 실패 (배치 ' + Math.floor(i/BATCH_SIZE + 1) + '): ' + body };
      }

      Logger.log('[WBS Sync] 배치 삽입 완료: ' + batch.length + '행 (HTTP ' + code + ')');

    } catch (e) {
      return { success: false, error: '네트워크 오류 (삽입): ' + e.message };
    }
  }

  return { success: true };
}

// ─── 시트 데이터 읽기 ────────────────────────────────────────────────────────

function readWbsRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return [];

  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  var values = sheet.getRange(CONFIG.DATA_START_ROW, 1, numRows, 17).getValues();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    var rowId = parseInt(row[COL.ROW_ID]);
    if (isNaN(rowId) || rowId <= 0) continue;

    var level = parseInt(row[COL.LEVEL]);
    if (isNaN(level) || level < 1 || level > 4) continue;

    rows.push({
      row_order:       rowId,
      level:           level,
      task_l1:         parseText(row[COL.TASK_L1]),
      task_l2:         parseText(row[COL.TASK_L2]),
      task_l3:         parseText(row[COL.TASK_L3]),
      task_l4:         parseText(row[COL.TASK_L4]),
      description:     parseText(row[COL.DESCRIPTION]),
      assignee:        parseText(row[COL.ASSIGNEE]),
      status:          parseStatus(row[COL.STATUS]),
      plan_start:      parseDate(row[COL.PLAN_START]),
      plan_end:        parseDate(row[COL.PLAN_END]),
      actual_start:    parseDate(row[COL.ACTUAL_START]),
      actual_end:      parseDate(row[COL.ACTUAL_END]),
      plan_progress:   parsePercent(row[COL.PLAN_PROG]),
      actual_progress: parsePercent(row[COL.ACTUAL_PROG]),
    });
  }

  return rows;
}

// ─── 데이터 파싱 헬퍼 ───────────────────────────────────────────────────────

function parseText(val) {
  if (val === null || val === undefined) return null;
  var str = String(val).trim();
  return str.length > 0 ? str : null;
}

function parseDate(val) {
  if (!val || val === '' || val === '—') return null;

  // 구글 시트가 자동 변환한 Date 객체
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, '0');
    var d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  var str = String(val).trim();

  // "2026. 5. 6" 형식
  var m1 = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m1) return m1[1] + '-' + m1[2].padStart(2,'0') + '-' + m1[3].padStart(2,'0');

  // "YYYY-MM-DD" 그대로
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return null;
}

function parsePercent(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    if (val > 0 && val <= 1) return Math.round(val * 100); // 0.49 → 49
    return Math.min(100, Math.max(0, Math.round(val)));
  }
  var str = String(val).trim().replace('%', '');
  var num = parseFloat(str);
  if (isNaN(num)) return 0;
  if (num > 0 && num <= 1) return Math.round(num * 100);
  return Math.min(100, Math.max(0, Math.round(num)));
}

function parseStatus(val) {
  if (!val) return '미진행';
  var str = String(val).trim();
  if (['완료', 'Done', 'DONE', 'Completed'].indexOf(str) >= 0) return '완료';
  if (['진행중', '진행 중', 'In Progress', 'WIP'].indexOf(str) >= 0) return '진행중';
  return '미진행';
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : ss.getActiveSheet();
  if (!sheet) {
    showAlert('오류', '"' + CONFIG.SHEET_NAME + '" 시트를 찾을 수 없습니다.');
    return null;
  }
  return sheet;
}

function validateConfig() {
  if (CONFIG.SUPABASE_KEY === 'YOUR_SERVICE_ROLE_KEY_HERE') {
    showAlert(
      '설정 오류',
      'CONFIG.SUPABASE_KEY를 입력해 주세요.\n\n' +
      '얻는 법: Supabase 대시보드 → Settings → API\n' +
      '→ "service_role" 섹션 → Reveal → 복사'
    );
    return false;
  }
  return true;
}

function showAlert(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log('[Alert] ' + title + ': ' + message);
  }
}
