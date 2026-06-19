/**
 * ============================================================
 *  WBS 구글 시트 → Supabase DB 동기화 스크립트
 *  웹접근성 PM 체크리스트 툴 연동용
 * ============================================================
 *
 * 📋 설치 방법:
 *  1. 구글 시트 열기
 *  2. 확장 프로그램 → Apps Script 클릭
 *  3. 이 파일의 내용을 전체 복사하여 붙여넣기
 *  4. 아래 CONFIG 섹션에 실제 값 입력
 *  5. 저장(Ctrl+S) 후 syncWbsToSupabase 함수 실행
 *
 * 🔧 CONFIG 섹션 필수 입력값:
 *  - API_ENDPOINT : 배포된 Next.js 앱 URL + /api/wbs-sync
 *  - SYNC_SECRET  : .env.local의 WBS_SYNC_SECRET 값과 동일하게 설정
 *  - PROJECT_ID   : Supabase DB의 프로젝트 UUID
 *                   (앱에서 프로젝트 선택 후 URL 또는 Supabase 대시보드에서 확인)
 *
 * 📌 시트 구조 (gid=878328870 기준):
 *  - 13행까지: 헤더 (자동 스킵)
 *  - 14행부터: 실제 WBS 데이터
 *  - 컬럼 순서: [A]카테고리 [B]No [C]Level [D]L1 [E]L2 [F]L3 [G]L4
 *               [H]Description [I]R/R [J]Status [K]계획시작 [L]계획완료
 *               [M]실제시작 [N]실제완료 [O]계획% [P]실제%
 * ============================================================
 */

// ─── ⚙️ CONFIG (여기만 수정하세요) ─────────────────────────────────────────

var CONFIG = {
  // 배포된 앱 URL (로컬 테스트: http://localhost:3000)
  API_ENDPOINT: "https://vdaychixyxhjavjgvioq.supabase.co/rest/v1/wbs_rows",

  // .env.local 의 WBS_SYNC_SECRET 값
  SYNC_SECRET:
    "220497c27a8c9051f6518a6743a0e6689f3e2f043ff66f82181c0be5737da604",

  // Supabase DB 프로젝트 UUID (앱 URL 파라미터 또는 대시보드에서 확인)
  PROJECT_ID: "f2dbcf00-fdbc-46fa-a1c9-4b1cb6e77fde",

  // 데이터가 시작되는 행 번호 (1-indexed, 기본값: 14)
  DATA_START_ROW: 14,

  // 시트 이름 (빈 문자열이면 현재 활성 시트 사용)
  SHEET_NAME: "WBS",
};

// ─── 컬럼 인덱스 (0-indexed) ────────────────────────────────────────────────
var COL = {
  ROW_ID: 1, // B열: No (행 번호)
  LEVEL: 2, // C열: Level (1~4)
  TASK_L1: 3, // D열: Task Level 1
  TASK_L2: 4, // E열: Task Level 2
  TASK_L3: 5, // F열: Task Level 3
  TASK_L4: 6, // G열: Task Level 4
  DESCRIPTION: 7, // H열: Description/Outputs
  ASSIGNEE: 8, // I열: R/R (담당자)
  STATUS: 9, // J열: Status
  PLAN_START: 10, // K열: 계획 시작
  PLAN_END: 11, // L열: 계획 완료
  ACTUAL_START: 12, // M열: 실제 시작
  ACTUAL_END: 13, // N열: 실제 완료
  PLAN_PROG: 14, // O열: 계획 진척율(%)
  ACTUAL_PROG: 15, // P열: 실제 진척율(%)
};

// ─── 메인 동기화 함수 ────────────────────────────────────────────────────────

/**
 * WBS 시트 데이터를 읽어 Supabase DB에 동기화합니다.
 * Apps Script 편집기에서 이 함수를 실행하거나 트리거에 연결하세요.
 */
function syncWbsToSupabase() {
  // 1. 설정 검증
  if (!validateConfig()) return;

  // 2. 시트 가져오기
  var sheet = getSheet();
  if (!sheet) return;

  // 3. 데이터 읽기
  var rows = readWbsRows(sheet);
  if (rows.length === 0) {
    showAlert("오류", "동기화할 데이터가 없습니다. 시트를 확인해 주세요.");
    return;
  }

  Logger.log("[WBS Sync] 읽은 행 수: " + rows.length);

  // 4. API 호출
  var result = callSyncApi(rows);

  // 5. 결과 표시
  if (result.success) {
    showAlert(
      "✅ 동기화 완료",
      result.message + "\n\n동기화 시각: " + new Date().toLocaleString("ko-KR"),
    );
    Logger.log("[WBS Sync] 성공: " + result.message);
  } else {
    showAlert("❌ 동기화 실패", "오류 내용:\n" + result.error);
    Logger.log("[WBS Sync] 실패: " + result.error);
  }
}

// ─── 시트에 동기화 버튼 추가 ────────────────────────────────────────────────

/**
 * 시트에 "DB 동기화" 버튼을 추가합니다. (최초 1회 실행)
 */
function addSyncButton() {
  var sheet = getSheet();
  if (!sheet) return;

  var drawings = sheet.getDrawings();
  for (var i = 0; i < drawings.length; i++) {
    if (
      drawings[i].getContainerInfo().getAnchorCell().getA1Notation() === "R2"
    ) {
      showAlert("알림", "이미 동기화 버튼이 존재합니다.");
      return;
    }
  }

  var button = sheet.insertButton("🔄 DB 동기화", "syncWbsToSupabase", 2, 1);
  Logger.log("[WBS Sync] 버튼 추가 완료: " + button.toString());
  showAlert("완료", "시트에 DB 동기화 버튼이 추가되었습니다.");
}

// ─── 내부 헬퍼 함수들 ───────────────────────────────────────────────────────

function validateConfig() {
  if (CONFIG.API_ENDPOINT.includes("your-app.vercel.app")) {
    showAlert(
      "설정 오류",
      "CONFIG.API_ENDPOINT를 실제 배포 URL로 변경해 주세요.",
    );
    return false;
  }
  if (CONFIG.SYNC_SECRET === "YOUR_SYNC_SECRET_HERE") {
    showAlert(
      "설정 오류",
      "CONFIG.SYNC_SECRET을 .env.local의 WBS_SYNC_SECRET 값으로 변경해 주세요.",
    );
    return false;
  }
  if (CONFIG.PROJECT_ID.startsWith("xxxxxxxx")) {
    showAlert(
      "설정 오류",
      "CONFIG.PROJECT_ID를 실제 Supabase 프로젝트 UUID로 변경해 주세요.",
    );
    return false;
  }
  return true;
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    showAlert("오류", "스프레드시트를 찾을 수 없습니다.");
    return null;
  }

  var sheet = CONFIG.SHEET_NAME
    ? ss.getSheetByName(CONFIG.SHEET_NAME)
    : ss.getActiveSheet();

  if (!sheet) {
    showAlert("오류", '"' + CONFIG.SHEET_NAME + '" 시트를 찾을 수 없습니다.');
    return null;
  }

  return sheet;
}

function readWbsRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return [];

  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  var range = sheet.getRange(CONFIG.DATA_START_ROW, 1, numRows, 17);
  var values = range.getValues();

  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    // 행 번호(No)가 없으면 스킵
    var rowId = parseInt(row[COL.ROW_ID]);
    if (isNaN(rowId) || rowId <= 0) continue;

    // 레벨이 1~4 범위 밖이면 스킵
    var level = parseInt(row[COL.LEVEL]);
    if (isNaN(level) || level < 1 || level > 4) continue;

    rows.push({
      row_order: rowId,
      level: level,
      task_l1: parseText(row[COL.TASK_L1]),
      task_l2: parseText(row[COL.TASK_L2]),
      task_l3: parseText(row[COL.TASK_L3]),
      task_l4: parseText(row[COL.TASK_L4]),
      description: parseText(row[COL.DESCRIPTION]),
      assignee: parseText(row[COL.ASSIGNEE]),
      status: parseStatus(row[COL.STATUS]),
      plan_start: parseDate(row[COL.PLAN_START]),
      plan_end: parseDate(row[COL.PLAN_END]),
      actual_start: parseDate(row[COL.ACTUAL_START]),
      actual_end: parseDate(row[COL.ACTUAL_END]),
      plan_progress: parsePercent(row[COL.PLAN_PROG]),
      actual_progress: parsePercent(row[COL.ACTUAL_PROG]),
    });
  }

  return rows;
}

function callSyncApi(rows) {
  var payload = JSON.stringify({
    project_id: CONFIG.PROJECT_ID,
    rows: rows,
  });

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + CONFIG.SYNC_SECRET,
    },
    payload: payload,
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(CONFIG.API_ENDPOINT, options);
    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 200 && body.success) {
      return { success: true, message: body.message };
    } else {
      return {
        success: false,
        error: "[HTTP " + code + "] " + (body.error || "알 수 없는 오류"),
      };
    }
  } catch (e) {
    return { success: false, error: "네트워크 오류: " + e.message };
  }
}

// ─── 데이터 파싱 헬퍼 ───────────────────────────────────────────────────────

/** 텍스트 값 파싱: 빈 문자열이면 null 반환 */
function parseText(val) {
  if (val === null || val === undefined) return null;
  var str = String(val).trim();
  return str.length > 0 ? str : null;
}

/**
 * 날짜 파싱: 여러 형식 지원
 *  - Date 객체 → "YYYY-MM-DD"
 *  - "2026. 5. 6" → "2026-05-06"
 *  - "26.05.06" → "2026-05-06"
 *  - "2026-05-06" → 그대로
 */
function parseDate(val) {
  if (!val || val === "" || val === "—") return null;

  // Date 객체인 경우 (구글 시트가 날짜를 자동 변환)
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, "0");
    var d = String(val.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  var str = String(val).trim();
  if (!str || str === "—") return null;

  // "2026. 5. 6" 형식
  var korMatch = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (korMatch) {
    var y2 = korMatch[1];
    var m2 = korMatch[2].padStart(2, "0");
    var d2 = korMatch[3].padStart(2, "0");
    return y2 + "-" + m2 + "-" + d2;
  }

  // "YYYY-MM-DD" 형식 그대로
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return null;
}

/**
 * 진척율 파싱: "49%" → 49, 0.49 → 49, "49" → 49
 */
function parsePercent(val) {
  if (val === null || val === undefined || val === "") return 0;

  // 숫자형 (구글 시트에서 0~1 범위 또는 0~100 범위)
  if (typeof val === "number") {
    if (val <= 1.0 && val > 0) return Math.round(val * 100); // 0.49 → 49
    return Math.min(100, Math.max(0, Math.round(val)));
  }

  // 문자열 "49%" → 49
  var str = String(val).trim().replace("%", "");
  var num = parseFloat(str);
  if (isNaN(num)) return 0;

  // 0~1 범위면 100 곱하기
  if (num <= 1.0 && num > 0) return Math.round(num * 100);
  return Math.min(100, Math.max(0, Math.round(num)));
}

/**
 * 상태값 정규화: 구글 시트의 다양한 표기 → "미진행"/"진행중"/"완료"
 */
function parseStatus(val) {
  if (!val) return "미진행";
  var str = String(val).trim();

  if (str === "완료" || str === "Done" || str === "DONE" || str === "Completed")
    return "완료";
  if (
    str === "진행중" ||
    str === "진행 중" ||
    str === "In Progress" ||
    str === "WIP"
  )
    return "진행중";
  return "미진행";
}

function showAlert(title, message) {
  try {
    SpreadsheetApp.getUi().alert(
      title,
      message,
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch (e) {
    // UI를 사용할 수 없는 환경 (트리거 실행 등)
    Logger.log("[Alert] " + title + ": " + message);
  }
}
