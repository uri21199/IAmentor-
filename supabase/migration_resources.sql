-- Migration: subject_resources table
-- Feature 6.3: Links/resources per subject
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS subject_resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  unit_id     UUID REFERENCES units(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS subject_resources_user_id_idx ON subject_resources(user_id);
CREATE INDEX IF NOT EXISTS subject_resources_subject_id_idx ON subject_resources(subject_id);

-- RLS
ALTER TABLE subject_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own resources"
  ON subject_resources
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
