-- Migration v6: is_employed en user_config + push_subscriptions + dedup notifications

-- v6a: Agregar columna is_employed a user_config
ALTER TABLE user_config
  ADD COLUMN IF NOT EXISTS is_employed BOOLEAN DEFAULT true;

-- v6b: Tabla de suscripciones push (Web Push / VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage own push subs" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- v6c: UNIQUE constraint en notifications para evitar duplicados
-- (omitir si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_user_type_unique'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_user_type_unique
      UNIQUE (user_id, type, title);
  END IF;
END $$;
