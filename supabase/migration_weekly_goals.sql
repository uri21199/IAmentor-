-- Weekly study goals: committed study plan saved from the weekly planner.
-- When a user generates a weekly plan and taps "Agregar a la semana",
-- each day's study goals are persisted here.
-- The daily plan generator reads these to honour the user's weekly commitments.

CREATE TABLE IF NOT EXISTS weekly_study_goals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users NOT NULL,
  plan_date     date        NOT NULL,
  subject_name  text        NOT NULL,
  topics        text[]      NOT NULL DEFAULT '{}',
  minutes       integer     NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, plan_date, subject_name)
);

ALTER TABLE weekly_study_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wsg_select" ON weekly_study_goals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "wsg_insert" ON weekly_study_goals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "wsg_update" ON weekly_study_goals FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "wsg_delete" ON weekly_study_goals FOR DELETE USING (user_id = auth.uid());

-- Index for the daily plan lookup (most frequent query)
CREATE INDEX IF NOT EXISTS weekly_study_goals_user_date
  ON weekly_study_goals (user_id, plan_date);
