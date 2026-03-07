-- ============================================================
-- MENTOR IA PERSONAL — MIGRATION v2
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- ============================================================

-- ── PROFILES TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ── USER CONFIG TABLE ────────────────────────────────────────
-- work_days_json: day numbers (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
-- work_start / work_end: "HH:MM" format
-- work_default_mode: 'presencial' | 'remoto' | 'mixto'
-- presential_days_json: days within mixto that are normally presential
CREATE TABLE IF NOT EXISTS user_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_days_json JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  work_start TEXT NOT NULL DEFAULT '09:00',
  work_end TEXT NOT NULL DEFAULT '18:00',
  work_default_mode TEXT NOT NULL DEFAULT 'presencial'
    CHECK (work_default_mode IN ('presencial', 'remoto', 'mixto')),
  presential_days_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE user_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own config" ON user_config
  FOR ALL USING (auth.uid() = user_id);

-- ── CLASS SCHEDULE TABLE ─────────────────────────────────────
-- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
-- start_time / end_time: "HH:MM" format
-- These entries are injected as fixed 'class' blocks in the daily plan
CREATE TABLE IF NOT EXISTS class_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  modality TEXT NOT NULL DEFAULT 'presencial'
    CHECK (modality IN ('presencial', 'virtual')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE class_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own class schedule" ON class_schedule
  FOR ALL USING (auth.uid() = user_id);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_class_schedule_user_day
  ON class_schedule(user_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_user_config_user
  ON user_config(user_id);

-- ============================================================
-- HOW TO USE:
-- 1. Run this entire script in Supabase SQL Editor
-- 2. New signups will automatically create a profile row
-- 3. Existing users can be backfilled with:
--    INSERT INTO profiles (id, email)
--    SELECT id, email FROM auth.users
--    ON CONFLICT (id) DO NOTHING;
-- ============================================================
