-- projects 테이블에 wbs_weeks 컬럼(JSONB) 추가
-- 이 SQL을 Supabase SQL Editor에서 실행해 주세요.

alter table projects add column if not exists wbs_weeks jsonb default '[]'::jsonb;
