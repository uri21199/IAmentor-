-- ============================================================
-- FEATURES 4, 5, 6 — Schema migrations
-- Run this in Supabase SQL Editor after schema.sql
-- ============================================================

-- ── Feature 4: Topic completion tracking for hallucination detection ──────────

CREATE TABLE IF NOT EXISTS topic_completions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id        UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_name      TEXT NOT NULL,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Challenge data (populated when hallucination threshold is triggered)
  challenge_question      TEXT,
  challenge_options       JSONB,          -- string[] — 4 MCQ options
  challenge_correct_index SMALLINT,       -- index into challenge_options (server-side)
  challenge_user_answer   TEXT,           -- free text or selected option text
  challenge_result        TEXT CHECK (challenge_result IN ('passed', 'failed', 'skipped')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE topic_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topic_completions: user owns"
  ON topic_completions FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_topic_completions_user_time
  ON topic_completions(user_id, completed_at DESC);

-- ── Feature 5: Daily progress snapshots for heatmap ───────────────────────────

CREATE TABLE IF NOT EXISTS progress_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL,
  health_score    DECIMAL(5,4) NOT NULL DEFAULT 0,   -- 0.0000 to 1.0000
  topics_json     JSONB NOT NULL DEFAULT '[]',        -- [{id, status}]
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject_id, snapshot_date)
);

ALTER TABLE progress_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_snapshots: user owns"
  ON progress_snapshots FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_progress_snapshots_user_date
  ON progress_snapshots(user_id, snapshot_date DESC);
