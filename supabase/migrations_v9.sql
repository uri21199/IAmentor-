-- ============================================================
-- migrations_v9.sql — Smart deadline alerts
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add new columns to notifications table
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS event_id    UUID REFERENCES academic_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_id  UUID REFERENCES subjects(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_days_before INT,
  ADD COLUMN IF NOT EXISTS title       TEXT,
  ADD COLUMN IF NOT EXISTS body        TEXT,
  ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS push_sent   BOOLEAN NOT NULL DEFAULT false;

-- 2. Replace old dedup constraint (user_id, type, title) with event-based one.
--    The old constraint references a column that may or may not exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_user_type_unique'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_user_type_unique;
  END IF;
END $$;

-- 3. New UNIQUE constraint for deadline-type notifications
--    Prevents sending the same trigger (e.g. "7 days before parcial X") twice.
--    NULL values are treated as distinct in PG unique constraints, so
--    legacy rows (event_id IS NULL) are not affected.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_event_trigger_unique'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_event_trigger_unique
      UNIQUE (user_id, event_id, trigger_days_before);
  END IF;
END $$;

-- 4. Index to speed up unread-notifications queries
CREATE INDEX IF NOT EXISTS idx_notifications_unread_v2
  ON notifications (user_id, read_status, triggered_at DESC)
  WHERE read_status = false;
