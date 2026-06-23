-- 1. projects 테이블에 slug 컬럼 임시 추가 (기존 데이터 호환을 위해 nullable로 추가)
ALTER TABLE projects ADD COLUMN slug text;

-- 2. 기존 프로젝트의 slug에 임시로 UUID 앞자리 부여 (중복 방지 및 마이그레이션 완료)
UPDATE projects SET slug = split_part(id::text, '-', 1) WHERE slug IS NULL;

-- 3. slug 컬럼을 NOT NULL 및 UNIQUE 제약 조건으로 변경
ALTER TABLE projects ALTER COLUMN slug SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_slug_unique UNIQUE (slug);

-- 4. 프로젝트 생성 RPC 함수 갱신 (project_name과 project_slug를 모두 받도록 수정)
create or replace function create_project_with_defaults(project_name text, project_slug text)
returns uuid as $$
declare
  new_project_id uuid;
begin
  -- 프로젝트 생성 시 name과 slug 함께 저장 (소문자 및 좌우 공백 제거 처리)
  insert into projects (name, slug)
  values (project_name, lower(trim(project_slug)))
  returning id into new_project_id;

  -- 2. 해당 프로젝트에 대한 기본 체크리스트 데이터 삽입 (기획서 9항 기준)
  -- 착수 전
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'pre', '계약 & 범위', '웹 페이지 수 / 앱 뷰 수 기준으로 심사 범위 확정 후 계약 진행', null, 1),
  (new_project_id, 'pre', '계약 & 범위', '심사비 납부 주체 확인 (발주처 vs 에이전시)', 'risk', 2),
  (new_project_id, 'pre', '계약 & 범위', '웹와치 신청 시 사이트 소유·운영 기관 정보 클라이언트에게 수령', 'doc', 3),
  (new_project_id, 'pre', '외부 솔루션 사전 식별', '자체 수정 불가 외부 솔루션 목록화 — 보안 키패드, 결제 iframe, 유튜브 자막 등', 'ext', 4),
  (new_project_id, 'pre', '외부 솔루션 사전 식별', '외부 솔루션별 접근성 지원 여부 확인 — 착수 즉시 벤더사 문의 시작', 'ext', 5),
  (new_project_id, 'pre', '개발 환경 사전 신청', 'GitLab/GitHub 계정 신청 및 권한 부여', null, 6),
  (new_project_id, 'pre', '개발 환경 사전 신청', 'STG 서버 접근 계정 발급 (VPN/방화벽 포함)', null, 7),
  (new_project_id, 'pre', '개발 환경 사전 신청', '테스트플라이트 계정 등록 및 앱 배포 초대 확인', null, 8),
  (new_project_id, 'pre', '개발 환경 사전 신청', '테스트용 서비스 로그인 계정 생성', null, 9),
  (new_project_id, 'pre', '개발 환경 사전 신청', '클라이언트 측 배포 스케줄 공유 요청', 'risk', 10),
  (new_project_id, 'pre', '개발 환경 사전 신청', '모바일 테스트 환경 구축 (Android USB 디버깅, iOS VoiceOver)', null, 11),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', 'Figma 원본 파일 Edit 권한 공유 요청', null, 12),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', '디자인 가이드 문서 수령 (컬러, 타이포, 컴포넌트)', 'doc', 13),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', '브랜드 가이드라인 수령 (로고, 컬러 팔레트 HEX/RGB)', null, 14),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', '아이콘·이미지 에셋 원본 요청 (SVG/PNG)', null, 15),
  (new_project_id, 'pre', 'WBS 작성', 'WBS 초안 수립 — 사전 진단 → 개선 → 심사 신청 → 1차 심사 → 재심사 → 인증', 'doc', 16);

  return new_project_id;
end;
$$ language plpgsql;
