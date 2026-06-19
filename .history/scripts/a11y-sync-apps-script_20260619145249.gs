/**
 * ==================================================================
 *  [통합 스크립트] 배포리스트 슬라이드 자동화 & 웹 접근성 DB 동기화
 * ==================================================================
 *
 * 📋 안내:
 *  기존의 슬라이드 생성 스크립트와 웹 접근성 동기화 스크립트를 충돌 없이 통합한 버전입니다.
 *  구글 시트의 [확장 프로그램] -> [Apps Script] 편집기에 이 파일 전체를 붙여넣으시면 됩니다.
 */

// ==================================================================
//  PART 1. 배포리스트 슬라이드 자동 생성 스크립트 (기존 기능 보존)
// ==================================================================

// ⚙️ SLIDE CONFIG
var CONFIG = {
  TEMPLATE_SLIDE_ID: "1w4YDXGnQZ2p35GmbUdhf_Aq_0yQ-Vggg7ETVk9gsNqw",
  SHEET_NAME: "배포리스트",
  DATA_START_ROW: 2,
  FOLDER_ID: "1Vhm3ovn3fXtXBbDEFNjvg6jVZrOFnw8J",
  MAX_ROWS_PER_SLIDE: 13,
  DATA_COLUMNS: 9, // A~I열 (9개)
  TIMEZONE: "Asia/Seoul",
  DATE_FORMAT: "yyyy.MM.dd",

  // 컬럼 인덱스 (1-based)
  COL: {
    NO: 2,
    CATEGORY: 3,
    CONTENT: 4,
    WORKER: 5,
    URL: 6,
    IMAGE: 7,
    IMAGE_URL: 8,
    COMMENT: 9,
  },

  // 슬라이드 인덱스 (0-based)
  SLIDE: {
    COVER: 0,
    LIST: 2,
  },

  // 상세 슬라이드 텍스트 태그
  TAG: {
    DATE: "{오늘날짜 데이터}",
    CATEGORY: "{분류}",
    WORKER: "{작업자}",
    CONTENT: "{수정내용}",
    COMMENT: "{주석명}",
    URL: "{url}",
  },
};

/**
 * 슬라이드 전체 생성 프로세스를 실행합니다.
 */
function createWeeklySlide() {
  var ui = SpreadsheetApp.getUi();
  try {
    var tasks = _loadTasks();
    _assertNotEmpty(tasks, "시트에 데이터가 없습니다.");

    _extractAndWriteImageUrls(tasks); // 배치 쓰기 포함

    var pres = _cloneTemplate();
    var todayStr = _getTodayString();

    _updateCoverSlide(pres, todayStr);
    var listPageCount = _updateListSlides(pres, tasks);
    _updateDetailSlides(pres, tasks, listPageCount);

    _moveToFolder(DriveApp.getFileById(pres.getId()));
    _showCompletionDialog(ui, pres, tasks.length);
  } catch (e) {
    _handleFatalError(ui, e);
  }
}

/**
 * 이미지 URL 추출만 단독으로 실행합니다.
 */
function extractImageUrlsOnly() {
  try {
    var tasks = _loadTasks();
    _assertNotEmpty(tasks, "시트에 데이터가 없습니다.");
    _extractAndWriteImageUrls(tasks);
    SpreadsheetApp.getUi().alert("✅ 이미지 URL 추출 작업이 완료되었습니다.");
  } catch (e) {
    _handleFatalError(SpreadsheetApp.getUi(), e);
  }
}

/**
 * 배열이 비어있으면 사용자 친화적 에러를 던집니다.
 */
function _assertNotEmpty(arr, message) {
  if (!arr || !arr.length) throw new Error(message);
}

/**
 * 복구 불가능한 최상위 에러를 처리합니다.
 */
function _handleFatalError(ui, e) {
  Logger.log("[FATAL] " + e.message + "\n" + e.stack);
  ui.alert(
    "❌ 오류 발생\n\n" +
      e.message +
      "\n\n자세한 내용은 실행 로그를 확인하세요.",
  );
}

/**
 * 복구 가능한 경고성 에러를 로그에 남깁니다.
 */
function _logWarning(context, message) {
  Logger.log("[WARN] [" + context + "] " + message);
}

/** "yyyy.MM.dd" 형식의 오늘 날짜 문자열을 반환합니다. */
function _getTodayString() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
}

/** 템플릿 파일 복제 */
function _cloneTemplate() {
  var fileName = "배포리스트_" + _getTodayString().replace(/\./g, "");
  var newFile = DriveApp.getFileById(CONFIG.TEMPLATE_SLIDE_ID).makeCopy(
    fileName,
  );
  return SlidesApp.openById(newFile.getId());
}

/** 파일 이동 */
function _moveToFolder(file) {
  if (!CONFIG.FOLDER_ID) return;
  try {
    DriveApp.getFolderById(CONFIG.FOLDER_ID).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    _logWarning("moveToFolder", "폴더 이동 실패: " + e.message);
  }
}

/** 완료 팝업 표시 */
function _showCompletionDialog(ui, pres, taskCount) {
  var html = HtmlService.createHtmlOutput(
    '<div style="text-align:center;font-family:sans-serif;padding:20px;">' +
      '  <h3 style="color:#1a73e8;">생성 완료!</h3>' +
      "  <p>총 <b>" +
      taskCount +
      "</b>개의 작업 내역이 변환되었습니다.</p>" +
      '  <a href="' +
      pres.getUrl() +
      '" target="_blank"' +
      '     style="background:#1a73e8;color:white;padding:10px 20px;' +
      '            text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px;">' +
      "    슬라이드 열기" +
      "  </a>" +
      "</div>",
  )
    .setWidth(320)
    .setHeight(220);
  ui.showModalDialog(html, "작업 완료");
}

/** 시트 데이터 일괄 로드 */
function _loadTasks() {
  var sheet = _getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return [];

  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  var data = sheet
    .getRange(CONFIG.DATA_START_ROW, 1, numRows, CONFIG.DATA_COLUMNS)
    .getValues();

  return data.reduce(function (acc, row, i) {
    if (!row[0] && !row[2]) return acc; // A열, C열 모두 비어있으면 스킵

    acc.push({
      rowNum: CONFIG.DATA_START_ROW + i,
      no: String(row[COL_IDX.NO]),
      category: String(row[COL_IDX.CATEGORY]),
      content: String(row[COL_IDX.CONTENT]),
      worker: String(row[COL_IDX.WORKER]),
      url: String(row[COL_IDX.URL]),
      imageUrl: String(row[COL_IDX.IMAGE_URL]),
      comment: String(row[COL_IDX.COMMENT]),
    });
    return acc;
  }, []);
}

var COL_IDX = {
  NO: CONFIG.COL.NO - 1,
  CATEGORY: CONFIG.COL.CATEGORY - 1,
  CONTENT: CONFIG.COL.CONTENT - 1,
  WORKER: CONFIG.COL.WORKER - 1,
  URL: CONFIG.COL.URL - 1,
  IMAGE: CONFIG.COL.IMAGE - 1,
  IMAGE_URL: CONFIG.COL.IMAGE_URL - 1,
  COMMENT: CONFIG.COL.COMMENT - 1,
};

function _getSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.SHEET_NAME,
  );
  if (!sheet)
    throw new Error("'" + CONFIG.SHEET_NAME + "' 시트를 찾을 수 없습니다.");
  return sheet;
}

/** 이미지 URL 추출 및 일괄 쓰기 */
function _extractAndWriteImageUrls(tasks) {
  var sheet = _getSheet();
  var updates = [];

  tasks.forEach(function (task) {
    if (_isValidUrl(task.imageUrl)) return;

    var url = _extractUrlFromCell(sheet, task.rowNum);
    if (!url) return;

    task.imageUrl = url;
    updates.push({ rowNum: task.rowNum, url: url });
  });

  updates.forEach(function (update) {
    sheet.getRange(update.rowNum, CONFIG.COL.IMAGE_URL).setValue(update.url);
  });

  if (updates.length) {
    Logger.log("[INFO] 이미지 URL " + updates.length + "건 업데이트 완료");
  }
}

function _extractUrlFromCell(sheet, rowNum) {
  try {
    var cell = sheet.getRange(rowNum, CONFIG.COL.IMAGE);
    var val = cell.getValue();

    if (val && typeof val.getContentUrl === "function") {
      return val.getContentUrl();
    }

    var match = cell.getFormula().match(/=IMAGE\s*\(\s*["'](.+?)["']/i);
    return match ? match[1] : "";
  } catch (e) {
    _logWarning(
      "extractUrlFromCell",
      "행 " + rowNum + " 이미지 추출 실패: " + e.message,
    );
    return "";
  }
}

function _isValidUrl(str) {
  return typeof str === "string" && str.indexOf("http") === 0;
}

function _updateCoverSlide(pres, todayStr) {
  pres
    .getSlides()
    [CONFIG.SLIDE.COVER].replaceAllText(CONFIG.TAG.DATE, todayStr);
}

function _updateListSlides(pres, tasks) {
  var chunks = _chunkArray(tasks, CONFIG.MAX_ROWS_PER_SLIDE);
  var listTemplate = pres.getSlides()[CONFIG.SLIDE.LIST];
  var slides = _duplicateSlide(
    pres,
    listTemplate,
    CONFIG.SLIDE.LIST,
    chunks.length,
  );

  chunks.forEach(function (chunk, idx) {
    _fillListTable(slides[idx], chunk);
  });

  return chunks.length;
}

function _fillListTable(slide, chunk) {
  var tables = slide.getTables();
  if (!tables.length) {
    _logWarning("fillListTable", "슬라이드에 테이블이 없습니다.");
    return;
  }

  var table = tables[0];

  chunk.forEach(function (task, rowIdx) {
    var r = rowIdx + 1;
    if (r >= table.getNumRows()) table.appendRow();

    var cells = [
      table.getCell(r, 0),
      table.getCell(r, 1),
      table.getCell(r, 2),
      table.getCell(r, 3),
      table.getCell(r, 4),
    ];
    cells[0].getText().setText(task.no);
    cells[1].getText().setText(task.category);
    cells[2].getText().setText(task.comment);
    cells[3].getText().setText(task.worker);
    cells[4].getText().setText(_getUrlPath(task.url));
  });

  var totalRows = table.getNumRows();
  for (var r = chunk.length + 1; r < totalRows; r++) {
    for (var c = 0; c < 5; c++) {
      table.getCell(r, c).getText().setText("");
    }
  }
}

function _getUrlPath(url) {
  if (!url) return "";
  var match = url.match(/https?:\/\/[^\/]+(.*)/);
  return match && match[1] ? match[1] : url;
}

function _updateDetailSlides(pres, tasks, listPageCount) {
  var templateIdx = CONFIG.SLIDE.LIST + listPageCount;
  var detailTemplate = pres.getSlides()[templateIdx];

  tasks.forEach(function (task) {
    var newSlide = pres.insertSlide(
      pres.getSlides().length - 1,
      detailTemplate,
    );
    _replaceDetailText(newSlide, task);
    _replaceSlideImage(newSlide, task.imageUrl);
  });

  detailTemplate.remove();
}

function _replaceDetailText(slide, task) {
  var tag = CONFIG.TAG;
  slide.replaceAllText(tag.CATEGORY, task.category);
  slide.replaceAllText(tag.WORKER, task.worker);
  slide.replaceAllText(tag.CONTENT, task.content);
  slide.replaceAllText(tag.COMMENT, task.comment);
  slide.replaceAllText(tag.URL, task.url);
}

function _replaceSlideImage(slide, url) {
  if (!_isValidUrl(url)) return;

  var images = slide.getImages();
  if (!images.length) return;

  var target = _getLargestImage(images);
  var left = target.getLeft();
  var top = target.getTop();
  var width = target.getWidth();
  target.remove();

  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = response.getResponseCode();

    if (code !== 200) {
      _logWarning(
        "replaceSlideImage",
        "이미지 로드 실패 (HTTP " + code + "): " + url,
      );
      return;
    }

    var newImg = slide.insertImage(response.getBlob());
    var ratio = newImg.getHeight() / newImg.getWidth();
    newImg
      .setLeft(left)
      .setTop(top)
      .setWidth(width)
      .setHeight(width * ratio);
  } catch (e) {
    _logWarning(
      "replaceSlideImage",
      "이미지 삽입 실패: " + url + " → " + e.message,
    );
  }
}

function _getLargestImage(images) {
  return images.reduce(function (prev, curr) {
    return prev.getWidth() * prev.getHeight() >=
      curr.getWidth() * curr.getHeight()
      ? prev
      : curr;
  });
}

function _chunkArray(arr, size) {
  var result = [];
  for (var i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function _duplicateSlide(pres, templateSlide, baseIdx, count) {
  var slides = [templateSlide];
  for (var i = 1; i < count; i++) {
    slides.push(pres.insertSlide(baseIdx + i, templateSlide));
  }
  return slides;
}

// ==================================================================
//  PART 2. 웹 접근성 점검리스트 Supabase DB 동기화 (A11y_ 접두사 사용)
// ==================================================================

// ⚙️ ACCESSIBILITY CONFIG
var A11Y_CONFIG = {
  // 배포된 앱 API 주소 또는 터널 주소
  API_ENDPOINT: "https://f98ded102d879b.lhr.life/api/a11y-sync",

  // .env.local 의 WBS_SYNC_SECRET 값
  SYNC_SECRET:
    "220497c27a8c9051f6518a6743a0e6689f3e2f043ff66f82181c0be5737da604",

  // 데이터가 시작되는 행 번호 (1-indexed, 기본값: 2)
  DATA_START_ROW: 2,

  // 시트 이름 (빈 문자열이면 현재 활성 시트 사용)
  SHEET_NAME: "",
};

// ─── 컬럼 인덱스 (0-indexed) ────────────────────────────────────────────────
var A11Y_COL = {
  A: 0, // A열: Depth 1 (메뉴 depth 1)
  B: 1, // B열: Depth 2 (메뉴 depth 2)
  C: 2, // C열: Depth 3 (메뉴 depth 3)
  G: 6, // G열: 검사항목 번호 (지침 번호)
  H: 7, // H열: 지침명 (지침명)
  I: 8, // I열: 유형 (오류사항)
  M: 12, // M열: 담당자 (담당자)
  P: 15, // P열: 배포 현황 (배포상태)
  S: 18, // S열: 이미지 (이미지)
  T: 19, // T열: 점검 상태 (점검상태)
  U: 20, // U열: 비고 2 (비고)
};

/**
 * 접근성 시트 데이터를 읽어 Next.js API를 통해 Supabase DB에 동기화합니다.
 */
function syncA11yToSupabase() {
  if (!_a11yValidateConfig()) return;

  var sheet = _a11yGetSheet();
  if (!sheet) return;

  Logger.log("[A11y Sync] 시트 데이터 읽기 시작...");
  var rows = _a11yReadRows(sheet);
  Logger.log("[A11y Sync] 읽은 행 수: " + rows.length);

  if (rows.length === 0) {
    var lastRow = sheet.getLastRow();
    var sampleRows = [];
    if (lastRow >= A11Y_CONFIG.DATA_START_ROW) {
      var numRows = Math.min(5, lastRow - A11Y_CONFIG.DATA_START_ROW + 1);
      var maxCols = Math.min(25, sheet.getLastColumn());
      var rangeVal = sheet
        .getRange(A11Y_CONFIG.DATA_START_ROW, 1, numRows, maxCols)
        .getValues();
      for (var k = 0; k < rangeVal.length; k++) {
        sampleRows.push(
          "행 " +
            (A11Y_CONFIG.DATA_START_ROW + k) +
            ": [" +
            rangeVal[k].join(" | ") +
            "]",
        );
      }
    }
    var msg =
      "동기화할 유효한 데이터가 없습니다.\n\n" +
      '현재 로드된 시트: "' +
      sheet.getName() +
      '"\n' +
      "데이터 시작행(DATA_START_ROW): " +
      A11Y_CONFIG.DATA_START_ROW +
      "\n" +
      "시트의 마지막 행 번호: " +
      lastRow +
      "행\n\n" +
      "처음 " +
      sampleRows.length +
      "개 행 데이터 샘플:\n" +
      sampleRows.join("\n") +
      "\n\n" +
      "※ H열(지침명)과 J열(오류 사항)이 비어 있으면 데이터 수집에서 스킵됩니다.\n" +
      "스프레드시트 탭이 접근성 템플릿 탭이 맞는지 확인해 주세요. (탭이 맞지 않다면 접근성 탭으로 전환 후 재실행해 주세요)";
    _a11yShowAlert("동기화 취소 (유효 데이터 없음)", msg);
    return;
  }

  Logger.log("[A11y Sync] API 서버로 동기화 요청 중...");
  var result = _a11yCallSyncApi(rows);

  if (result.success) {
    Logger.log("[A11y Sync] 성공: " + result.message);
    _a11yShowAlert("동기화 성공", result.message);
  } else {
    Logger.log("[A11y Sync] 실패: " + result.error);
    _a11yShowAlert("동기화 실패", result.error);
  }
}

function _a11yValidateConfig() {
  if (A11Y_CONFIG.API_ENDPOINT.startsWith("https://your-")) {
    _a11yShowAlert(
      "설정 오류",
      "A11Y_CONFIG.API_ENDPOINT를 실제 API 엔드포인트 URL로 변경해 주세요.",
    );
    return false;
  }
  if (A11Y_CONFIG.SYNC_SECRET === "YOUR_SYNC_SECRET_HERE") {
    _a11yShowAlert(
      "설정 오류",
      "A11Y_CONFIG.SYNC_SECRET을 .env.local의 WBS_SYNC_SECRET 값으로 변경해 주세요.",
    );
    return false;
  }
  return true;
}

function _a11yGetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    _a11yShowAlert("오류", "스프레드시트를 찾을 수 없습니다.");
    return null;
  }

  // 1. CONFIG에 지정된 이름이 있으면 우선 사용
  if (A11Y_CONFIG.SHEET_NAME) {
    var sheet = ss.getSheetByName(A11Y_CONFIG.SHEET_NAME);
    if (sheet) return sheet;
  }

  // 2. 시트 목록 중 이름에 '접근성' 또는 'a11y'가 포함된 시트가 있으면 자동 선택
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName().toLowerCase();
    if (name.indexOf("접근성") !== -1 || name.indexOf("a11y") !== -1) {
      return sheets[i];
    }
  }

  // 3. 찾지 못하면 현재 활성화된 시트 사용
  return ss.getActiveSheet();
}

function _a11yReadRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < A11Y_CONFIG.DATA_START_ROW) return [];

  var numRows = lastRow - A11Y_CONFIG.DATA_START_ROW + 1;
  var maxCols = Math.min(25, sheet.getLastColumn());
  var range = sheet.getRange(A11Y_CONFIG.DATA_START_ROW, 1, numRows, maxCols);
  var values = range.getValues();

  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    // G, H, I열이 모두 비어 있으면 무효 행으로 스킵 처리
    var gVal = _a11yParseText(row[A11Y_COL.G]);
    var hVal = _a11yParseText(row[A11Y_COL.H]);
    var iVal = _a11yParseText(row[A11Y_COL.I]);
    if (!gVal && !hVal && !iVal) continue;

    // 1. 메뉴: A, B, C열의 depth 1~3 값을 병합하여 'a > b > c' 형식으로 작성 (빈 필드는 생략)
    var aVal = _a11yParseText(row[A11Y_COL.A]);
    var bVal = _a11yParseText(row[A11Y_COL.B]);
    var cVal = _a11yParseText(row[A11Y_COL.C]);
    var menuParts = [];
    if (aVal) menuParts.push(aVal);
    if (bVal) menuParts.push(bVal);
    if (cVal) menuParts.push(cVal);
    var groupName = menuParts.join(" > ");
    if (!groupName) groupName = "기타";

    // 2. 지침명: G, H열의 내용을 g-h 형식으로 작성
    var text = "";
    if (gVal && hVal) {
      text = gVal + "-" + hVal;
    } else {
      text = gVal || hVal || "내용 없음";
    }

    // 3. 담당자: M열의 내용 작성
    var assignee = _a11yParseText(row[A11Y_COL.M]);

    // 4. 배포상태: P열의 내용 작성 -> tag
    var tag = _a11yParseText(row[A11Y_COL.P]);

    // 5. 이미지: S열의 내용 작성 -> image_url
    var imageUrl = _a11yParseText(row[A11Y_COL.S]);

    // 6. 점검상태: T열의 내용 작성
    var tVal = _a11yParseText(row[A11Y_COL.T]);
    var checked = _a11yParseChecked(tVal); // 완료/적합 등 여부 판단

    // 7. 비고: U열의 내용 작성
    var uVal = _a11yParseText(row[A11Y_COL.U]);

    // 오류사항(iVal), 점검상태(tVal), 비고(uVal)를 JSON 문자열 형태로 패킹하여 memo에 저장
    var memoObj = {
      error_msg: iVal || "",
      check_status: tVal || "",
      comment: uVal || "",
    };
    var memo = JSON.stringify(memoObj);

    rows.push({
      group_name: groupName,
      text: text,
      checked: checked,
      assignee: assignee,
      due_date: null, // 이번 개편에서는 조치일이 컬럼 목록에서 제외되므로 null 처리
      memo: memo,
      tag: tag,
      image_url: imageUrl,
      sort_order: i + 1,
    });
  }

  return rows;
}

function _a11yCallSyncApi(rows) {
  var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetUrl = activeSpreadsheet.getUrl();

  var payload = JSON.stringify({
    sheet_url: sheetUrl,
    rows: rows,
  });

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + A11Y_CONFIG.SYNC_SECRET,
    },
    payload: payload,
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(A11Y_CONFIG.API_ENDPOINT, options);
    var code = response.getResponseCode();
    var contentText = response.getContentText();

    var body;
    try {
      body = JSON.parse(contentText);
    } catch (e) {
      return {
        success: false,
        error:
          "[HTTP " +
          code +
          "] 서버가 JSON을 반환하지 않았습니다: " +
          contentText,
      };
    }

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

function _a11yParseChecked(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === "boolean") return val;

  var str = String(val).trim().toUpperCase();
  return (
    str === "TRUE" ||
    str === "O" ||
    str === "적합" ||
    str === "완료" ||
    str === "PASS" ||
    str === "Y" ||
    str === "YES"
  );
}

function _a11yParseText(val) {
  if (val === null || val === undefined) return null;
  var str = String(val).trim();
  return str.length > 0 ? str : null;
}

function _a11yParseDate(val) {
  if (!val || val === "" || val === "—") return null;

  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, "0");
    var d = String(val.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  var str = String(val).trim();
  if (!str || str === "—") return null;

  var korMatch = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (korMatch) {
    var y2 = korMatch[1];
    var m2 = korMatch[2].padStart(2, "0");
    var d2 = korMatch[3].padStart(2, "0");
    return y2 + "-" + m2 + "-" + d2;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return null;
}

function _a11yShowAlert(title, message) {
  try {
    SpreadsheetApp.getUi().alert(
      title,
      message,
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch (e) {
    Logger.log("[Alert] " + title + ": " + message);
  }
}

// ==================================================================
//  PART 3. 통합 메뉴 생성 (onOpen 단일화)
// ==================================================================

/**
 * 스프레드시트가 열릴 때 슬라이드 자동화 메뉴와 접근성 동기화 메뉴를 함께 추가합니다.
 */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();

    // 1. 슬라이드 자동화 메뉴 추가
    ui.createMenu("🖼️ 슬라이드 자동화")
      .addItem("▶ 슬라이드 생성 실행", "createWeeklySlide")
      .addSeparator()
      .addItem("🔍 이미지 URL만 추출", "extractImageUrlsOnly")
      .addToUi();

    // 2. 접근성 동기화 메뉴 추가
    ui.createMenu("🔄 접근성 동기화")
      .addItem("DB로 접근성 동기화 실행", "syncA11yToSupabase")
      .addToUi();
  } catch (e) {
    Logger.log("메뉴 생성 실패 (UI를 지원하지 않는 환경입니다): " + e.message);
  }
}
