-- ============================================================
-- migrations_v3.sql — Tablas requeridas por e2e-flow.ts + extras
-- Ejecutar DESPUÉS de schema.sql en Supabase SQL Editor
-- ============================================================

-- Migration v3a: Add perceived_effort to workouts
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS perceived_effort TEXT
  CHECK (perceived_effort IN ('easy', 'good', 'hard', 'exhausting'));

-- Migration v3b: Profiles table (espejo de auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage own profile" ON profiles FOR ALL USING (auth.uid() = id);

-- Migration v3c: User config (horario de trabajo)
CREATE TABLE IF NOT EXISTS user_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  work_days_json JSONB DEFAULT '[1,2,3,4,5]'::jsonb,
  work_start TEXT NOT NULL DEFAULT '09:00',
  work_end TEXT NOT NULL DEFAULT '18:00',
  work_default_mode TEXT DEFAULT 'remoto' CHECK (work_default_mode IN ('presencial','remoto','mixto')),
  presential_days_json JSONB DEFAULT '[]'::jsonb,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage own config" ON user_config FOR ALL USING (auth.uid() = user_id);

-- Migration v3d: Class schedule (clases fijas semanales)
CREATE TABLE IF NOT EXISTS class_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  modality TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial','virtual','mixto')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE class_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage own class schedule" ON class_schedule FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_class_schedule_day ON class_schedule(user_id, day_of_week);

-- Migration v3e: Notifications log
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);

-- Migration v3f: Auto-create profile trigger on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
