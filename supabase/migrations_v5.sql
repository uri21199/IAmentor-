-- Migration v5: Add due_date to class_logs for homework task tracking
-- Run in Supabase SQL Editor: https://supabase.com/dashboard

ALTER TABLE class_logs
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Optional: index for querying upcoming homework by due_date
CREATE INDEX IF NOT EXISTS idx_class_logs_due_date
  ON class_logs(user_id, due_date)
  WHERE due_date IS NOT NULL;
