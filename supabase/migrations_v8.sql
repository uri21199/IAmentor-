-- ============================================================
-- migrations_v8.sql — Pomodoro sessions table
-- Run this in the Supabase SQL Editor
-- ============================================================

create table if not exists pomodoro_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- block_id is a string reference to the id field inside daily_plans.plan_json
  -- (not a true FK since blocks live in JSONB, not their own table)
  block_id            text,
  subject_id          uuid references subjects(id) on delete set null,
  topic_id            uuid references topics(id) on delete set null,
  started_at          timestamptz not null,
  completed_at        timestamptz,
  duration_minutes    int,
  was_completed       boolean not null default false,
  topic_status_after  text check (topic_status_after in ('red', 'yellow', 'green')),
  created_at          timestamptz not null default now()
);

alter table pomodoro_sessions enable row level security;

create policy "Users manage own pomodoro sessions"
  on pomodoro_sessions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for stats queries (user sessions by date)
create index if not exists idx_pomodoro_user_date
  on pomodoro_sessions (user_id, created_at desc);

-- Index for per-topic history
create index if not exists idx_pomodoro_topic
  on pomodoro_sessions (user_id, topic_id)
  where topic_id is not null;
