-- ============================================================
-- migrations_v7.sql
-- Soft-delete para materias: registra cuándo y por qué se eliminó
-- ============================================================

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Comentario: los valores posibles para deletion_reason son:
--   'mistake'   → el usuario se equivocó al cargarla
--   'dropped'   → dejó la materia
--   'passed'    → aprobó la materia
--   'other:<texto>'  → otro motivo (texto libre)
