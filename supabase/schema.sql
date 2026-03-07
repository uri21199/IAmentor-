-- ============================================================
-- MENTOR IA PERSONAL — SUPABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS semesters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  full_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'red' CHECK (status IN ('red', 'yellow', 'green')),
  last_studied TIMESTAMPTZ,
  next_review TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('parcial', 'parcial_intermedio', 'entrega_tp')),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sleep_quality INTEGER NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  energy_level INTEGER NOT NULL CHECK (energy_level BETWEEN 1 AND 5),
  stress_level TEXT NOT NULL CHECK (stress_level IN ('low', 'medium', 'high')),
  work_mode TEXT NOT NULL CHECK (work_mode IN ('presencial', 'remoto', 'no_work', 'libre')),
  has_faculty BOOLEAN DEFAULT false,
  faculty_mode TEXT CHECK (faculty_mode IN ('presencial', 'remoto')),
  faculty_subject TEXT,
  travel_route_json JSONB DEFAULT '[]'::jsonb,
  unexpected_events TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS daily_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  plan_json JSONB DEFAULT '[]'::jsonb,
  completion_percentage NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS class_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  topics_covered_json JSONB DEFAULT '[]'::jsonb,
  understanding_level INTEGER NOT NULL CHECK (understanding_level BETWEEN 1 AND 5),
  has_homework BOOLEAN DEFAULT false,
  homework_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('empuje', 'jale', 'piernas', 'cardio', 'movilidad')),
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  energy_used INTEGER NOT NULL CHECK (energy_used BETWEEN 1 AND 5),
  completed BOOLEAN DEFAULT false,
  exercises_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS travel_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  segments_json JSONB DEFAULT '[]'::jsonb,
  studied_during_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Google Calendar token storage
CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- Semesters policies
DROP POLICY IF EXISTS "Users can manage own semesters" ON semesters;
CREATE POLICY "Users can manage own semesters" ON semesters
  FOR ALL USING (auth.uid() = user_id);

-- Subjects policies
DROP POLICY IF EXISTS "Users can manage own subjects" ON subjects;
CREATE POLICY "Users can manage own subjects" ON subjects
  FOR ALL USING (auth.uid() = user_id);

-- Units — via subject ownership
DROP POLICY IF EXISTS "Users can manage own units" ON units;
CREATE POLICY "Users can manage own units" ON units
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM subjects s WHERE s.id = units.subject_id AND s.user_id = auth.uid()
    )
  );

-- Topics — via unit → subject ownership
DROP POLICY IF EXISTS "Users can manage own topics" ON topics;
CREATE POLICY "Users can manage own topics" ON topics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN subjects s ON s.id = u.subject_id
      WHERE u.id = topics.unit_id AND s.user_id = auth.uid()
    )
  );

-- Academic events
DROP POLICY IF EXISTS "Users can manage own academic events" ON academic_events;
CREATE POLICY "Users can manage own academic events" ON academic_events
  FOR ALL USING (auth.uid() = user_id);

-- Check-ins
DROP POLICY IF EXISTS "Users can manage own checkins" ON checkins;
CREATE POLICY "Users can manage own checkins" ON checkins
  FOR ALL USING (auth.uid() = user_id);

-- Daily plans
DROP POLICY IF EXISTS "Users can manage own daily plans" ON daily_plans;
CREATE POLICY "Users can manage own daily plans" ON daily_plans
  FOR ALL USING (auth.uid() = user_id);

-- Class logs
DROP POLICY IF EXISTS "Users can manage own class logs" ON class_logs;
CREATE POLICY "Users can manage own class logs" ON class_logs
  FOR ALL USING (auth.uid() = user_id);

-- Workouts
DROP POLICY IF EXISTS "Users can manage own workouts" ON workouts;
CREATE POLICY "Users can manage own workouts" ON workouts
  FOR ALL USING (auth.uid() = user_id);

-- Travel logs
DROP POLICY IF EXISTS "Users can manage own travel logs" ON travel_logs;
CREATE POLICY "Users can manage own travel logs" ON travel_logs
  FOR ALL USING (auth.uid() = user_id);

-- User integrations
DROP POLICY IF EXISTS "Users can manage own integrations" ON user_integrations;
CREATE POLICY "Users can manage own integrations" ON user_integrations
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_subjects_semester ON subjects(semester_id);
CREATE INDEX IF NOT EXISTS idx_units_subject ON units(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_unit ON topics(unit_id);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_academic_events_date ON academic_events(date);

-- ============================================================
-- SEED DATA FUNCTION (call after first user signup)
-- ============================================================
-- NOTE: Replace 'YOUR_USER_ID' with the actual user's UUID from auth.users
-- You can get this from Supabase > Authentication > Users after signup

CREATE OR REPLACE FUNCTION seed_initial_data(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_semester_id UUID;
  v_quimica_id UUID;
  v_anatomia_id UUID;
  v_fisica_id UUID;
  v_algoritmos_id UUID;

  -- Quimica units
  v_q_sistemas UUID;
  v_q_uniones UUID;
  v_q_estados UUID;
  v_q_reacciones UUID;

  -- Anatomia units
  v_a_embrio UUID;
  v_a_locomotor UUID;
  v_a_viscerales UUID;
  v_a_nervioso UUID;
  v_a_histologia UUID;

  -- Fisica units
  v_f_medicion UUID;
  v_f_mecanica UUID;
  v_f_fluidos UUID;
  v_f_ondas UUID;

  -- Algoritmos units
  v_al_fundamentos UUID;
  v_al_estructuras UUID;
  v_al_archivos UUID;
  v_al_avanzado UUID;
BEGIN
  -- ── SEMESTER ─────────────────────────────────────────────
  INSERT INTO semesters (user_id, name, start_date, end_date, is_active)
  VALUES (p_user_id, '1er Cuatrimestre 2025', '2025-03-01', '2025-07-31', true)
  RETURNING id INTO v_semester_id;

  -- ── SUBJECTS ─────────────────────────────────────────────
  INSERT INTO subjects (semester_id, user_id, name, color)
  VALUES (v_semester_id, p_user_id, 'Química Básica', '#10B981')
  RETURNING id INTO v_quimica_id;

  INSERT INTO subjects (semester_id, user_id, name, color)
  VALUES (v_semester_id, p_user_id, 'Anatomía e Histología', '#06B6D4')
  RETURNING id INTO v_anatomia_id;

  INSERT INTO subjects (semester_id, user_id, name, color)
  VALUES (v_semester_id, p_user_id, 'Física de Partículas', '#F59E0B')
  RETURNING id INTO v_fisica_id;

  INSERT INTO subjects (semester_id, user_id, name, color)
  VALUES (v_semester_id, p_user_id, 'Algoritmos y Programación', '#3B82F6')
  RETURNING id INTO v_algoritmos_id;

  -- ── QUÍMICA — UNITS & TOPICS ─────────────────────────────
  INSERT INTO units (subject_id, name, order_index) VALUES (v_quimica_id, 'Sistemas materiales', 1) RETURNING id INTO v_q_sistemas;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_q_sistemas, 'Sustancias y mezclas', 'Clasificación de la materia: sustancias puras, mezclas homogéneas y heterogéneas, métodos de separación'),
    (v_q_sistemas, 'Teorías atómicas', 'Evolución de los modelos atómicos: Dalton, Thomson, Rutherford, Bohr, modelo cuántico'),
    (v_q_sistemas, 'Tabla periódica', 'Organización de los elementos, períodos y grupos, propiedades periódicas'),
    (v_q_sistemas, 'Magnitudes atómicas', 'Número atómico, número másico, isótopos, masa atómica relativa');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_quimica_id, 'Uniones y compuestos', 2) RETURNING id INTO v_q_uniones;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_q_uniones, 'Uniones químicas', 'Enlace iónico, covalente (simple, doble, triple), metálico, regla del octeto, estructuras de Lewis'),
    (v_q_uniones, 'Compuestos inorgánicos', 'Nomenclatura IUPAC: óxidos, hidróxidos, ácidos, sales. Funciones químicas inorgánicas'),
    (v_q_uniones, 'Compuestos orgánicos', 'Hidrocarburos, grupos funcionales, isomería. Nomenclatura IUPAC orgánica básica');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_quimica_id, 'Estados de la materia', 3) RETURNING id INTO v_q_estados;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_q_estados, 'Gases y líquidos', 'Leyes de los gases ideales (Boyle, Charles, Gay-Lussac), ecuación de estado, propiedades de líquidos, tensión superficial'),
    (v_q_estados, 'Sólidos', 'Cristalografía básica, sólidos iónicos, metálicos, moleculares y covalentes, propiedades'),
    (v_q_estados, 'Diagramas de fase', 'Cambios de estado, curvas de calentamiento/enfriamiento, punto triple, punto crítico');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_quimica_id, 'Reacciones', 4) RETURNING id INTO v_q_reacciones;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_q_reacciones, 'Estequiometría', 'Mol, masa molar, relaciones estequiométricas, rendimiento de reacción, reactivo limitante'),
    (v_q_reacciones, 'Soluciones y acidez', 'Concentración (M, m, % p/v), pH, escala de pH, ácidos y bases de Arrhenius y Brønsted-Lowry, neutralización'),
    (v_q_reacciones, 'Equilibrio químico', 'Constante de equilibrio Kc y Kp, principio de Le Chatelier, equilibrio ácido-base'),
    (v_q_reacciones, 'Electroquímica', 'Reacciones redox, celda galvánica, electrólisis, potencial de celda, número de oxidación');

  -- ── ANATOMÍA — UNITS & TOPICS ────────────────────────────
  INSERT INTO units (subject_id, name, order_index) VALUES (v_anatomia_id, 'Embriología', 1) RETURNING id INTO v_a_embrio;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_a_embrio, 'Fecundación', 'Proceso de fertilización, capacitación del espermatozoide, reacción acrosómica, bloqueo de polispermia'),
    (v_a_embrio, 'Diferenciación celular', 'Segmentación, mórula, blástula, implantación, disco bilaminar'),
    (v_a_embrio, 'Gastrulación', 'Formación de las tres capas germinales, notocorda, neurulación primaria');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_anatomia_id, 'Aparato locomotor', 2) RETURNING id INTO v_a_locomotor;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_a_locomotor, 'Osteología', 'Clasificación de huesos, estructura del tejido óseo, osificación, esqueleto axial y apendicular'),
    (v_a_locomotor, 'Artrología', 'Tipos de articulaciones: fibrosas, cartilaginosas, sinoviales. Movimientos articulares'),
    (v_a_locomotor, 'Miología', 'Tipos de músculo, estructura del músculo esquelético, grupos musculares principales, origen e inserción');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_anatomia_id, 'Sistemas viscerales', 3) RETURNING id INTO v_a_viscerales;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_a_viscerales, 'Sistema respiratorio', 'Vías aéreas superiores e inferiores, pulmones, pleura, mecánica ventilatoria'),
    (v_a_viscerales, 'Sistema cardiovascular', 'Corazón (cámaras, válvulas, ciclo cardíaco), circulación mayor y menor, grandes vasos'),
    (v_a_viscerales, 'Sistema digestivo', 'Tubo digestivo desde boca a ano, glándulas anexas (hígado, páncreas), digestión y absorción'),
    (v_a_viscerales, 'Sistema urinario', 'Riñón (nefrona, filtración glomerular), uréteres, vejiga, uretra'),
    (v_a_viscerales, 'Sistema reproductor', 'Aparato reproductor masculino y femenino, ciclo menstrual, gametogénesis');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_anatomia_id, 'Sistema nervioso', 4) RETURNING id INTO v_a_nervioso;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_a_nervioso, 'SNC', 'Encéfalo (cerebro, cerebelo, tronco encefálico), médula espinal, meninges, líquido cefalorraquídeo'),
    (v_a_nervioso, 'SNP', 'Nervios craneales (12 pares), nervios espinales, plexos nerviosos, SNAutónomo (simpático y parasimpático)'),
    (v_a_nervioso, 'Sistema endocrino', 'Hipotálamo, hipófisis, tiroides, suprarrenales, páncreas endocrino. Hormonas principales');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_anatomia_id, 'Histología', 5) RETURNING id INTO v_a_histologia;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_a_histologia, 'Tejido epitelial', 'Clasificación (simple, estratificado, pseudoestratificado), funciones, uniones celulares'),
    (v_a_histologia, 'Tejido conectivo', 'Componentes (células, fibras, sustancia fundamental), tipos (laxo, denso, adiposo)'),
    (v_a_histologia, 'Tejido óseo y cartílago', 'Células del tejido óseo (osteoblasto, osteocito, osteoclasto), matriz ósea, tipos de cartílago'),
    (v_a_histologia, 'Tejido muscular', 'Músculo esquelético, cardíaco y liso: estructura, ultraestructura y función');

  -- ── FÍSICA — UNITS & TOPICS ──────────────────────────────
  INSERT INTO units (subject_id, name, order_index) VALUES (v_fisica_id, 'Medición', 1) RETURNING id INTO v_f_medicion;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_f_medicion, 'Mediciones e incertezas', 'Magnitudes físicas, sistema SI, errores de medición, cifras significativas, notación científica'),
    (v_f_medicion, 'Análisis dimensional', 'Dimensiones de magnitudes físicas, verificación de fórmulas, conversión de unidades'),
    (v_f_medicion, 'Técnicas experimentales', 'Instrumentos de medición, calibración, propagación de errores, representación gráfica de datos');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_fisica_id, 'Mecánica', 2) RETURNING id INTO v_f_mecanica;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_f_mecanica, 'Sistemas de partículas', 'Dinámica de sistemas de partículas, fuerzas internas y externas, ecuaciones de movimiento'),
    (v_f_mecanica, 'Centro de masa', 'Definición, cálculo del CM para sistemas discretos y continuos, movimiento del CM'),
    (v_f_mecanica, 'Momento cinético', 'Momento angular de partícula y sistema, torque, conservación del momento angular'),
    (v_f_mecanica, 'Conservación de energía', 'Energía cinética, potencial (gravitatoria, elástica), trabajo-energía, sistemas conservativos'),
    (v_f_mecanica, 'Colisiones', 'Colisiones elásticas e inelásticas, conservación de momento lineal, coeficiente de restitución');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_fisica_id, 'Fluidos y cuerpo rígido', 3) RETURNING id INTO v_f_fluidos;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_f_fluidos, 'Fluidodinámica', 'Presión, ecuación de continuidad, ecuación de Bernoulli, viscosidad, número de Reynolds'),
    (v_f_fluidos, 'Estática del CR', 'Condiciones de equilibrio del cuerpo rígido, diagrama de cuerpo libre, momento de fuerzas'),
    (v_f_fluidos, 'Momento de inercia', 'Definición, cálculo para geometrías básicas (barra, disco, cilindro, esfera)'),
    (v_f_fluidos, 'Teorema de Steiner', 'Teorema de ejes paralelos, aplicaciones en cálculo de momentos de inercia'),
    (v_f_fluidos, 'Rototraslación', 'Movimiento combinado de rotación y traslación, rodadura sin deslizamiento, energía cinética total');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_fisica_id, 'Ondas', 4) RETURNING id INTO v_f_ondas;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_f_ondas, 'Movimiento ondulatorio', 'Parámetros de onda (amplitud, longitud, frecuencia, velocidad), ecuación de onda'),
    (v_f_ondas, 'Ondas mecánicas', 'Ondas transversales y longitudinales, velocidad en cuerdas y medios elásticos, intensidad'),
    (v_f_ondas, 'Efecto Doppler', 'Cambio de frecuencia por movimiento relativo, aplicaciones médicas y tecnológicas'),
    (v_f_ondas, 'Superposición y resonancia', 'Principio de superposición, interferencia constructiva y destructiva, ondas estacionarias, resonancia');

  -- ── ALGORITMOS — UNITS & TOPICS ──────────────────────────
  INSERT INTO units (subject_id, name, order_index) VALUES (v_algoritmos_id, 'Fundamentos', 1) RETURNING id INTO v_al_fundamentos;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_al_fundamentos, 'Variables y operadores', 'Tipos de datos (int, float, char, bool), declaración, operadores aritméticos, relacionales y lógicos'),
    (v_al_fundamentos, 'Estructuras de control', 'Secuencia, selección (if-else, switch), iteración (for, while, do-while), anidamiento'),
    (v_al_fundamentos, 'Representación de datos', 'Sistemas numéricos (binario, octal, hexadecimal), conversiones, representación en complemento a dos'),
    (v_al_fundamentos, 'Operaciones de bits', 'Operadores bit a bit (AND, OR, XOR, NOT, shifts), máscaras, aplicaciones prácticas');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_algoritmos_id, 'Estructuras de datos', 2) RETURNING id INTO v_al_estructuras;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_al_estructuras, 'Arreglos y matrices', 'Arreglos unidimensionales y bidimensionales, acceso por índice, recorrido, búsqueda'),
    (v_al_estructuras, 'Punteros', 'Dirección de memoria, operador &, operador *, aritmética de punteros, puntero nulo'),
    (v_al_estructuras, 'Modularización', 'Funciones: parámetros por valor y referencia, valor de retorno, prototipo, ámbito de variables'),
    (v_al_estructuras, 'Estructuras', 'Struct en C: definición, acceso a campos, arrays de estructuras, punteros a estructuras'),
    (v_al_estructuras, 'Memoria dinámica', 'malloc/calloc/realloc/free, manejo de memoria heap, detección de memory leaks');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_algoritmos_id, 'Archivos y algoritmos', 3) RETURNING id INTO v_al_archivos;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_al_archivos, 'Archivos de texto', 'Apertura, lectura y escritura de archivos de texto en C (fopen, fprintf, fscanf, fclose)'),
    (v_al_archivos, 'Archivos binarios', 'fread, fwrite, fseek, registros binarios, comparación con archivos de texto'),
    (v_al_archivos, 'Ordenamiento', 'Bubble sort, selection sort, insertion sort, quicksort. Análisis de complejidad'),
    (v_al_archivos, 'Búsqueda', 'Búsqueda lineal y binaria, precondiciones, análisis de eficiencia'),
    (v_al_archivos, 'Recursividad', 'Concepto de recursión, caso base, pila de llamadas, ejemplos: factorial, Fibonacci, torres de Hanoi');

  INSERT INTO units (subject_id, name, order_index) VALUES (v_algoritmos_id, 'Avanzado', 4) RETURNING id INTO v_al_avanzado;
  INSERT INTO topics (unit_id, name, full_description) VALUES
    (v_al_avanzado, 'TAD y aplicaciones', 'Tipos abstractos de datos, especificación e implementación, ocultamiento de información'),
    (v_al_avanzado, 'Listas, pilas y colas', 'Listas enlazadas simples y dobles, pila (LIFO), cola (FIFO): implementación con punteros'),
    (v_al_avanzado, 'Entorno Linux y Git', 'Comandos básicos de Linux, sistema de archivos, Git: init, add, commit, push, pull, branches'),
    (v_al_avanzado, 'Calidad de software', 'Buenas prácticas, estilo de código, documentación, pruebas unitarias, debugging'),
    (v_al_avanzado, 'Complejidad computacional', 'Notación Big-O, análisis de tiempo y espacio, comparación de algoritmos'),
    (v_al_avanzado, 'POO', 'Paradigma orientado a objetos, clases, objetos, encapsulamiento, herencia, polimorfismo en C++');

END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- HOW TO USE:
-- 1. Run this entire script in Supabase SQL Editor
-- 2. After signing up your first user, run:
--    SELECT seed_initial_data('YOUR-USER-UUID-HERE');
-- ============================================================
