-- ================================================
-- WBS rows 테이블 (구글 시트 WBS 시트 구조 기반)
-- ================================================
create table if not exists wbs_rows (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade,
  row_order    int not null default 0,
  level        int not null default 1,  -- 1~4 depth 계층
  task_l1      text,                    -- Level 1 대분류
  task_l2      text,                    -- Level 2
  task_l3      text,                    -- Level 3
  task_l4      text,                    -- Level 4 세부
  description  text,                   -- Description/Outputs
  assignee     text,                   -- R/R (담당)
  status       text default '미진행',  -- 미진행/진행중/완료
  plan_start   date,
  plan_end     date,
  actual_start date,
  actual_end   date,
  plan_progress int default 0,         -- 계획 진척율 (%)
  actual_progress int default 0,       -- 실제 진척율 (%)
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- RLS 활성화
alter table wbs_rows enable row level security;

create policy "Allow authenticated users on wbs_rows"
  on wbs_rows for all
  to authenticated
  using (true)
  with check (true);

-- 인덱스
create index if not exists idx_wbs_rows_project_id on wbs_rows(project_id, row_order);
