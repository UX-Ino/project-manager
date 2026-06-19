-- ============================================================
-- 웹 접근성 점검리스트 연동을 위한 projects 테이블 컬럼 추가
-- ============================================================

-- projects 테이블에 a11y_sheet_url 컬럼 추가 (구글 시트 연동 주소 보관용)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS a11y_sheet_url text;
