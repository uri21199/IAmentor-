-- ============================================================
-- Migration: grades table (2026-03-21)
-- Tracks student grades for parciales, TPs, finals, etc.
-- ============================================================

create table if not exists grades (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users not null,
  subject_id  uuid        references subjects(id) on delete cascade not null,
  event_id    uuid        references academic_events(id) on delete set null,
  title       text        not null,
  grade_type  text        not null default 'parcial',
  score       numeric,
  max_score   numeric     not null default 10,
  notes       text,
  exam_date   date,
  created_at  timestamptz not null default now()
);

alter table grades enable row level security;

create policy "grades_own_select" on grades
  for select using (user_id = auth.uid());

create policy "grades_own_insert" on grades
  for insert with check (user_id = auth.uid());

create policy "grades_own_update" on grades
  for update using (user_id = auth.uid());

create policy "grades_own_delete" on grades
  for delete using (user_id = auth.uid());

-- Index for fast queries by subject
create index if not exists grades_subject_idx on grades (user_id, subject_id);
