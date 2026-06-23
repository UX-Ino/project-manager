-- 1. projects 테이블 생성
create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text unique not null,
  wbs_sheet_url  text,
  a11y_sheet_url text,
  created_at     timestamptz default now()
);

-- 2. checklist 테이블 생성
create table if not exists checklist (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade,
  phase        text not null,       -- pre / in_progress / review / done
  group_name   text not null,
  text         text not null,
  tag          text,                -- risk / doc / ext / null
  checked      boolean default false,
  image_url    text,
  memo         text,                -- 심사 지적사항 상세 및 추가 조치 메모
  due_date     date,                -- 완료 마감일 (역산 일정 수립용)
  assignee     text,                -- 담당 실무자 이름
  sort_order   integer default 0,
  updated_at   timestamptz default now()
);

-- 3. RLS 활성화
alter table projects enable row level security;
alter table checklist enable row level security;

-- 4. RLS 정책 설정 (인증된 사내 유저만 모든 CRUD 권한 부여)
drop policy if exists "Allow authenticated users on projects" on projects;
create policy "Allow authenticated users on projects" 
  on projects for all 
  to authenticated 
  using (true) 
  with check (true);

drop policy if exists "Allow authenticated users on checklist" on checklist;
create policy "Allow authenticated users on checklist" 
  on checklist for all 
  to authenticated 
  using (true) 
  with check (true);

-- 5. 기본 체크리스트 자동 삽입을 위한 RPC 함수 정의
create or replace function create_project_with_defaults(project_name text, project_slug text)
returns uuid as $$
declare
  new_project_id uuid;
begin
  -- 1. 프로젝트 생성 및 ID 반환
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
  (new_project_id, 'pre', 'WBS 작성', 'WBS 초안 수립 — 사전 진단 → 개선 → 심사 신청 → 1차 심사 → 재심사 → 인증', 'doc', 16),
  (new_project_id, 'pre', 'WBS 작성', '포지션별 투입 인원 확정 (퍼블리셔, 스크립터, 개발자, 디자이너, QA)', null, 17),
  (new_project_id, 'pre', 'WBS 작성', '클라이언트 담당 PM 및 실무 창구 확인', null, 18);

  -- 진행 중
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'in_progress', '보고 & 커뮤니케이션', '주간 보고 체계 수립 — 포지션별 완료 항목 집계 + 이슈 공유', 'doc', 19),
  (new_project_id, 'in_progress', '보고 & 커뮤니케이션', '진척 지연 시 지연 사유 + 만회 가능성 함께 브리핑', null, 20),
  (new_project_id, 'in_progress', '보고 & 커뮤니케이션', '내부 이슈 에스컬레이션 기준 사전 정의', null, 21),
  (new_project_id, 'in_progress', '이슈 관리', '외부 솔루션 벤더사 협의 진행 상황 추적', 'ext', 22),
  (new_project_id, 'in_progress', '이슈 관리', '클라이언트 배포 일정과 수정 완료 시점 싱크 관리', 'risk', 23),
  (new_project_id, 'in_progress', '이슈 관리', '이슈 로그 관리 — 발견 → 담당자 배분 → 수정 확인', 'doc', 24),
  (new_project_id, 'in_progress', '디자인 & 협업', '디자인 가이드 및 Figma 권한 수령 확인 (미수령 시 재요청)', null, 25),
  (new_project_id, 'in_progress', '디자인 & 협업', '디자이너-퍼블리셔 간 피드백 루프 조율 (PM이 중간 창구)', null, 26);

  -- 심사
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'review', '심사 신청', '웹와치 심사 방식 최종 협의 (원격/파견, APK/테스트플라이트) — 심사 한 달 전', null, 27),
  (new_project_id, 'review', '심사 신청', '웹와치 심사 신청 (웹/앱 각각 별도 신청)', null, 28),
  (new_project_id, 'review', '심사 신청', '심사용 계정 별도 생성 요청', null, 29),
  (new_project_id, 'review', '심사 신청', '심사 당일 웹와치 담당자 연락 채널 확보', null, 30),
  (new_project_id, 'review', '심사 후 대응', '1차 심사 리포트 수령 후 지적 항목 포지션별 배분', 'doc', 31),
  (new_project_id, 'review', '심사 후 대응', '재심사 일정(약 1주) 역산하여 수정 마감 설정', 'risk', 32),
  (new_project_id, 'review', '심사 후 대응', '재심사 전 수정 항목 전수 확인 — QA와 교차 확인', null, 33);

  -- 완료 후
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'done', '산출물 정리', '완료 보고서 작성 (AS-IS/TO-BE, 개선율, 인증 마크 3종)', 'doc', 34),
  (new_project_id, 'done', '산출물 정리', '사용자 매뉴얼 / 디자인 가이드 등 인수인계 문서 작성', 'doc', 35),
  (new_project_id, 'done', '산출물 정리', '내부 상급자 검토 → 승인 후 클라이언트 PM 전달 (순서 준수)', null, 36),
  (new_project_id, 'done', '클라이언트 인계', '인증 마크 게시 위치 및 갱신 일정 클라이언트에 안내', null, 37),
  (new_project_id, 'done', '클라이언트 인계', '회고 작성 — 이슈 원인 및 다음 프로젝트 개선점', 'doc', 38);

  return new_project_id;
end;
$$ language plpgsql;

-- 6. deploy_slides 테이블 생성 (슬라이드 생성 이력 관리)
create table if not exists deploy_slides (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references projects(id) on delete cascade,
  slide_title    text not null,
  slide_url      text not null,
  created_at     timestamptz default now()
);

-- RLS 활성화 및 인증된 사내 유저에게 전체 CRUD 권한 부여
alter table deploy_slides enable row level security;

drop policy if exists "Allow authenticated users on deploy_slides" on deploy_slides;
create policy "Allow authenticated users on deploy_slides" 
  on deploy_slides for all 
  to authenticated 
  using (true) 
  with check (true);

