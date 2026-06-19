-- 1. deploy_slides 테이블 생성
create table if not exists deploy_slides (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references projects(id) on delete cascade,
  slide_title    text not null,
  slide_url      text not null,
  created_at     timestamptz default now()
);

-- 2. RLS 활성화
alter table deploy_slides enable row level security;

-- 3. RLS 정책 설정 (인증된 유저에게 전체 CRUD 권한 부여)
drop policy if exists "Allow authenticated users on deploy_slides" on deploy_slides;
create policy "Allow authenticated users on deploy_slides" 
  on deploy_slides for all 
  to authenticated 
  using (true) 
  with check (true);
