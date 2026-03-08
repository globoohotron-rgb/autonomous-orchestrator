// =============================================================================
// State — інтерфейси для state.json
// Зберігає snake_case для сумісності з поточним control_center/system_state/state.json
// =============================================================================

import { Block, Step, Status, ArtifactRegistry } from "./base";

export type { Status, ArtifactRegistry };
export type ArtifactKey = keyof ArtifactRegistry;

// --- Запис у transition log ---

export interface TransitionEntry {
  from: Step;
  to: Step;
  timestamp: string;
  decision?: string;
  artifact?: string;
  duration_ms?: number;
}

// --- Повний стан системи (state.json) ---

export interface SystemState {
  current_block: Block;
  current_step: Step;
  last_completed_step: Step | null;
  last_artifact: string | null;
  last_updated: string;
  status: Status;
  cycle: number;
  iteration: number;
  validation_attempts: number;
  isolation_mode: boolean;
  notes: string;
  artifacts: ArtifactRegistry;
  prev_cycle_artifacts: ArtifactRegistry;
  // Мікро-цикли: поточна задача та прогрес (для L10/D5)
  current_task: string | null;
  tasks_completed: number;
  tasks_total: number;
  // Лічильники для метрик
  jidoka_stops: number;
  issues_created: number;
  // Daemon
  daemon_active: boolean;
  // Auto-gates: агент сам аналізує і приймає рішення на гейтах
  auto_gates: boolean;
  /** OPT-16: Назва поточного проєкту — використовується як project_id для scoped censure history */
  project_name?: string;
  // OPT-1: Stagnation detection — % DONE попереднього циклу та лічильник стагнації
  prev_done_percent?: number | null;
  stagnation_count?: number;
  // OPT-4: Timestamp початку поточного кроку (ISO string) для watchdog
  step_started_at?: string | null;
  // OPT-6: Infrastructure vs code blocker classification
  /** Відсоток code-complete (без infra blockers). Null = не обчислено */
  code_complete_percent?: number | null;
  /** Кількість AC із infrastructure-only блокерами */
  infra_blocked_count?: number;
  /** OPT-10: Censure block tracking per rule across cycles */
  censure_block_tracker?: CensureBlockTracker;
  /** OPT-13: Фаза циклу розробки (визначається динамічно з cycle) */
  cycle_phase?: "early" | "mid" | "late";
  /** OPT-15: Timestamp коли виставлено awaiting_human_decision (ISO string) */
  gate_decision_started_at?: string | null;
  /** OPT-22: Лічильник S-block циклів (S5 REPEAT → S1). Скидається при виході з S-блоку. */
  s_block_cycles?: number;
}

/** OPT-10: Трекер CENSURE блокувань для retry limit */
export interface CensureBlockTracker {
  /** rule_id → кількість блокувань з початку сесії */
  per_rule: Record<string, number>;
  /** Загальна кількість CENSURE blocks у поточному run */
  total_blocks: number;
  /** rule_ids що були escalated (issue створено) */
  escalated_rules: string[];
}

// --- Фабрика порожнього реєстру артефактів ---

export function createEmptyArtifactRegistry(): ArtifactRegistry {
  return {
    observe_report: null,
    plan: null,
    plan_completion: null,
    hansei: null,
    goals_check: null,
    gate_decision: null,
    ui_review: null,
    smoke_test: null,
    acceptance_report: null,
    hansei_audit: null,
    validation_conclusions: null,
    security_scan: null,
    s_block_decision: null,
  };
}

// --- Фабрика початкового стану ---

export function createInitialState(): SystemState {
  return {
    current_block: "discovery",
    current_step: "L1",
    last_completed_step: null,
    last_artifact: null,
    last_updated: new Date().toISOString(),
    status: "in_progress",
    cycle: 0,
    iteration: 0,
    validation_attempts: 0,
    isolation_mode: false,
    notes: "",
    artifacts: createEmptyArtifactRegistry(),
    prev_cycle_artifacts: createEmptyArtifactRegistry(),
    current_task: null,
    tasks_completed: 0,
    tasks_total: 0,
    jidoka_stops: 0,
    issues_created: 0,
    daemon_active: false,
    auto_gates: false,
    step_started_at: null,
  };
}

// --- Конфігурація оркестратора ---

export interface OrchestratorConfig {
  /** Шлях до control_center/ (live data: state.json, артефакти, плани, задачі) */
  control_center_path: string;

  /** Шлях до кореня проєкту (для відносних шляхів файлів продукту) */
  project_root: string;
}
