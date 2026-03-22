// ============================================================
// DATABASE TYPES
// ============================================================

export interface Semester {
  id: string
  user_id: string
  name: string
  start_date: string
  end_date: string
  is_active: boolean
  created_at: string
}

export interface Subject {
  id: string
  semester_id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface Unit {
  id: string
  subject_id: string
  name: string
  order_index: number
  created_at: string
}

export type TopicStatus = 'red' | 'yellow' | 'green'

export interface Topic {
  id: string
  unit_id: string
  name: string          // short, max 4 words
  full_description: string
  status: TopicStatus
  last_studied: string | null
  next_review: string | null
  created_at: string
}

export type AcademicEventType = 'parcial' | 'parcial_intermedio' | 'entrega_tp' | 'medico' | 'personal' | 'recuperatorio'

export interface AcademicEvent {
  id: string
  subject_id: string | null
  user_id: string
  type: AcademicEventType
  title: string
  date: string
  /** JSON-encoded object { time?, aula?, topic_ids?, _notes? } or plain string */
  notes: string | null
  created_at: string
}

export type StressLevel = 'low' | 'medium' | 'high'
export type WorkMode = 'presencial' | 'remoto' | 'no_work' | 'libre'

export interface TravelSegment {
  origin: string
  destination: string
  duration_minutes: number
  departure_time?: string  // "HH:MM"
  arrival_time?: string    // "HH:MM"
}

export interface MicroReview {
  topic: string
  pills: string[]   // 3 quick concepts
  self_test: string // self-evaluation question
}

export interface CheckIn {
  id: string
  user_id: string
  date: string
  sleep_quality: number       // 1-5
  energy_level: number        // 1-5
  stress_level: StressLevel
  work_mode: WorkMode
  has_faculty: boolean
  faculty_mode: 'presencial' | 'remoto' | null
  faculty_subject: string | null
  travel_route_json: TravelSegment[]
  unexpected_events: string | null
  created_at: string
}

export type BlockType = 'work' | 'class' | 'study' | 'travel' | 'gym' | 'rest' | 'free' | 'exam'

export interface TimeBlock {
  id: string
  start_time: string   // "HH:MM"
  end_time: string     // "HH:MM"
  type: BlockType
  title: string
  description: string
  subject_id?: string
  topic_id?: string
  travel_segment?: TravelSegment
  micro_review?: MicroReview  // AI-generated content for travel blocks
  completed: boolean
  priority?: 'low' | 'medium' | 'high' | 'exam'
  manually_edited?: boolean  // true when user manually edited title/desc/time
  deleted?: boolean          // soft-delete: keeps time slot free, AI won't regenerate
  _streaming?: boolean       // transient: true while block is being streamed
}

export interface DailyPlan {
  id: string
  user_id: string
  date: string
  plan_json: TimeBlock[]
  completion_percentage: number
  created_at: string
}

export interface ClassLog {
  id: string
  user_id: string
  subject_id: string
  date: string
  topics_covered_json: string[]
  understanding_level: number  // 1-5
  has_homework: boolean
  homework_description: string | null
  due_date: string | null       // added in migrations_v5 — date when homework is due
  created_at: string
}

export type WorkoutType = 'empuje' | 'jale' | 'piernas' | 'cardio' | 'movilidad'

export interface Exercise {
  name: string
  sets?: number
  reps?: string
  duration_seconds?: number
  rest_seconds?: number
  notes?: string
}

export interface Workout {
  id: string
  user_id: string
  date: string
  type: WorkoutType
  duration_minutes: number
  energy_used: number
  completed: boolean
  exercises_json: Exercise[]
  perceived_effort?: string | null
  created_at: string
}

export interface StudiedSegment {
  segment_index: number
  studied: boolean
  subject_id: string | null
  topic_id: string | null
}


// ============================================================
// APP STATE TYPES
// ============================================================

export interface SubjectWithDetails extends Subject {
  units: UnitWithTopics[]
  upcoming_events: AcademicEvent[]
}

export interface UnitWithTopics extends Unit {
  topics: Topic[]
}

export interface CheckInFormData {
  sleep_quality: number
  energy_level: number
  stress_level: StressLevel
  work_mode: WorkMode
  has_faculty: boolean
  faculty_mode: 'presencial' | 'remoto' | null
  faculty_subject: string | null
  travel_route: TravelSegment[]
  unexpected_events: string
}

// ============================================================
// AI / PLANNING TYPES
// ============================================================

export interface StudyPriorityResult {
  subject_id: string
  subject_name: string
  priority: 'low' | 'medium' | 'high' | 'exam'
  priority_score: number
  days_to_event: number | null
  event_type: AcademicEventType | null
  weak_topics: Topic[]
  recommended_topics: Topic[]
  study_mode: 'exam_prep' | 'active_review' | 'normal' | 'light'
}

export interface RecentClassLog {
  subject_id: string
  subject_name: string
  /** YYYY-MM-DD */
  date: string
  days_ago: number
  /** 1–5, lower = more urgent to review */
  understanding_level: number
  topics: { id: string; name: string }[]
}

export interface WeeklyStudyGoal {
  subject_name: string
  topics: string[]
  minutes: number
}

export interface PlanGenerationContext {
  checkin: CheckIn
  calendar_events: GoogleCalendarEvent[]
  subjects_with_topics: SubjectWithDetails[]
  academic_events: AcademicEvent[]
  energy_history: { date: string; energy_level: number }[]
  study_priorities: StudyPriorityResult[]
  fixed_blocks: TimeBlock[]
  /** Class logs from the last 14 days, enriched with topic names */
  recent_class_logs: RecentClassLog[]
  /**
   * Most urgent academic event scheduled for today (parcial, TP, etc.).
   * Null when no such event exists today.
   */
  today_academic_event: AcademicEvent | null
  /**
   * True when today has an academic event AND the next 2 days do NOT.
   * When true the prompt instructs Claude to suppress study blocks —
   * the user's cognitive energy is focused on today's event.
   */
  suppress_study_blocks: boolean
  /**
   * Study commitments the user saved from the weekly planner for today.
   * Claude uses these as soft targets when generating the day's study blocks.
   */
  weekly_study_goals?: WeeklyStudyGoal[]
}

// ============================================================
// USER CONFIG & CLASS SCHEDULE TYPES
// ============================================================

export type WorkDefaultMode = 'presencial' | 'remoto' | 'mixto'
export type ClassModality = 'presencial' | 'virtual'

export interface UserConfig {
  id: string
  user_id: string
  work_days_json: number[]
  work_start: string
  work_end: string
  work_default_mode: WorkDefaultMode
  presential_days_json: number[]
  created_at: string
  updated_at: string
}

export interface ClassScheduleEntry {
  id: string
  user_id: string
  subject_id: string
  subject?: { name: string; color: string }
  day_of_week: number
  start_time: string
  end_time: string
  modality: ClassModality
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface GoogleCalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  description?: string
  location?: string
}

// ============================================================
// WORKOUT TYPES
// ============================================================


// ============================================================
// STATS TYPES
// ============================================================

export interface DailyStats {
  date: string
  completion_percentage: number
  energy_level: number
  sleep_quality: number
  workout_completed: boolean
  travel_studied_percentage: number
}

export interface WeeklyInsight {
  week_start: string
  avg_energy: number
  avg_completion: number
  total_workouts: number
  travel_studied_ratio: number
  ai_insight: string
}

export interface SubjectProgress {
  subject_id: string
  subject_name: string
  total_topics: number
  green_topics: number
  yellow_topics: number
  red_topics: number
  mastery_percentage: number
}

// ============================================================
// UI TYPES
// ============================================================

export interface NavItem {
  href: string
  label: string
  icon: string
}

export type Theme = 'dark'

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export type NotificationType =
  | 'post_class'
  | 'energy_boost'
  | 'exam_alert'
  | 'early_win'
  | 'exam_approaching'
  | 'deadline_approaching'
  | 'exam_today'

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  /** Short title — "[Materia] — [Tipo] en N días" */
  title: string | null
  /** Rich body with academic context */
  body: string | null
  /** Legacy single-field message (kept for older notification types) */
  message: string
  target_path: string | null
  read_status: boolean
  triggered_at: string
  expires_at: string | null
  metadata: Record<string, unknown>
  /** Snapshot of topics + sessions at alert time */
  context_json: DeadlineAlertContext
  /** True once push was delivered to device */
  push_sent: boolean
  event_id: string | null
  subject_id: string | null
  /** Which day-before trigger fired (14 | 10 | 7 | 5 | 1 | 0) */
  trigger_days_before: number | null
  created_at: string
}

export interface DeadlineAlertContext {
  red_topics?: number
  yellow_topics?: number
  green_topics?: number
  days_remaining?: number
  planned_study_sessions?: number
}

// ============================================================
// FEATURE 4: HALLUCINATION DETECTION TYPES
// ============================================================

export interface TopicCompletion {
  id: string
  user_id: string
  topic_id: string
  subject_id: string
  topic_name: string
  completed_at: string
  challenge_question: string | null
  challenge_options: string[] | null
  challenge_correct_index: number | null
  challenge_user_answer: string | null
  challenge_result: 'passed' | 'failed' | 'skipped' | null
  created_at: string
}

/** Returned by /api/topics/complete when hallucination threshold is exceeded */
export interface HallucinationChallenge {
  completion_id: string
  topic_id: string
  topic_name: string
  question: string
  options: string[]   // 4 options; correct_index is kept server-side
}

// ============================================================
// GRADES TYPES
// ============================================================

export type GradeType = 'parcial' | 'parcial_intermedio' | 'tp' | 'final' | 'laboratorio'

export interface Grade {
  id: string
  user_id: string
  subject_id: string
  event_id: string | null
  title: string
  grade_type: GradeType
  score: number | null
  max_score: number
  notes: string | null
  exam_date: string | null
  created_at: string
}


// ============================================================
// FEATURE 5: PROGRESS SNAPSHOT TYPES
// ============================================================

export interface ProgressSnapshot {
  id: string
  user_id: string
  subject_id: string
  snapshot_date: string   // "YYYY-MM-DD"
  health_score: number    // 0–1
  topics_json: Array<{ id: string; status: TopicStatus }>
  created_at: string
}

/** Aggregated weekly health per subject — used by DomainHeatmap */
export interface WeeklySubjectHealth {
  subject_id: string
  subject_name: string
  subject_color: string
  /** ISO week key e.g. "2026-W12" */
  week: string
  /** Human label e.g. "Mar 9" (Monday of that week) */
  week_label: string
  /** 0–1 average health score; null = no data that week */
  average_score: number | null
  /** True if there was at least one activity entry that week */
  has_activity: boolean
}

/** Re-exported from lib/study-priority for convenient importing */
export type StudyMode = 'exam_prep' | 'active_review' | 'normal' | 'light'

// ============================================================
// POMODORO TYPES
// ============================================================

export type TopicComprehension = 'red' | 'yellow' | 'green'

export interface PomodoroSession {
  id: string
  user_id: string
  block_id: string | null
  subject_id: string | null
  topic_id: string | null
  started_at: string
  completed_at: string | null
  duration_minutes: number | null
  was_completed: boolean
  topic_status_after: TopicComprehension | null
  created_at: string
}
