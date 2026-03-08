// =============================================================================
// Session Management — наскрізний алгоритм управління сесіями агента
// Конвертовано з: control_center/standards/system/std-session-management.md
// Інструмент: використовується кроками L11, D7 та наскрізно всіма кроками циклу
// =============================================================================

import type {
  SystemState,
  Status,
  Block,
  Step,
  PreconditionCheck,
  ArtifactRegistry,
  ArtifactKey,
  AlgorithmStep,
} from "../../types";

import { createEmptyArtifactRegistry } from "../../types";

// =============================================================================
// 1. Types (специфічні для session management)
// =============================================================================

/** Raw state.json до валідації — може містити null/невалідні значення */
interface RawStateJson {
  current_block?: string | null;
  current_step?: string | null;
  cycle?: number;
  iteration?: number;
  validation_attempts?: number;
  last_updated?: string;
  status?: string;
  last_completed_step?: string | null;
  last_artifact?: string | null;
  notes?: string;
  artifacts?: Record<string, string | null>;
  prev_cycle_artifacts?: Record<string, string | null>;
  isolation_mode?: boolean;
}

/** Дія, визначена алгоритмом старту сесії */
type SessionAction =
  | "continue_step"
  | "wait_discovery"
  | "wait_decision"
  | "wait_unblock"
  | "system_complete"
  | "escalate"
  | "start_fresh";

/** Тип очікування рішення людини (§4.2a) */
type AwaitingDecisionType =
  | "rework"
  | "gate"
  | "audit_fail"
  | "mini_gate"
  | "s_block_recommendation"
  | "s_block_decision"
  | "release_not_ready";

/** Результат старту/відновлення сесії */
interface SessionContext {
  state: SystemState | null;
  action: SessionAction;
  message: string;
  awaiting_type?: AwaitingDecisionType;
}

/** Вхід для старту сесії */
interface SessionStartInput {
  state_json_raw: string | null;
  control_center_exists: boolean;
  state_file_exists: boolean;
}

/** Вхід для переходу між кроками (§4.4) */
interface StepTransitionInput {
  current_state: SystemState;
  completed_step: Step;
  artifact_path: string | null;
  artifact_registry_key: ArtifactKey | null;
  next_step: Step;
  next_block: Block;
}

/** Результат переходу між кроками */
interface StepTransitionResult {
  new_state: SystemState;
  success: boolean;
}

/** Вхід для Plan Closure (§4.7 — L11, D7) */
interface PlanClosureInput {
  current_state: SystemState;
  plan_name: string;
  tasks_active_empty: boolean;
  tasks_done_has_tasks: boolean;
  /** Для D7: plan_completion_check повинен існувати */
  plan_completion_exists?: boolean;
}

/** Результат Plan Closure */
interface PlanClosureResult {
  success: boolean;
  error?: string;
  actions: PlanClosureAction[];
}

/** Окрема дія Plan Closure */
type PlanClosureAction =
  | { type: "move_plan"; from: string; to: string }
  | { type: "verify_move"; path: string }
  | { type: "update_state"; updates: Partial<SystemState> };

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 5 передумов)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/",
    description:
      "P1: control_center/ існує як директорія. Якщо ні → створити + порожній state.json, почати з L2.",
  },
  {
    type: "file_exists",
    path: "control_center/system_state/state.json",
    description:
      "P2: state.json існує. Якщо ні → створити за шаблоном (not_started), почати з L2.",
  },
  {
    type: "state_field",
    field: "status",
    description:
      "P3: state.json є валідним JSON з усіма обов'язковими полями. Якщо пошкоджений → ескалація до людини.",
  },
  {
    type: "state_field",
    field: "current_step",
    description:
      "P4: current_step відповідає відомому кроку (L1–L13, GATE1, D1–D9, V0–V3, S1–S5, E1–E2) або null.",
  },
  {
    type: "state_field",
    field: "status",
    description:
      "P5: status є одним з: not_started, in_progress, awaiting_human_decision, blocked, completed.",
  },
];

// =============================================================================
// 3. Constants — допустимі значення (§A + таблиця допустимих значень)
// =============================================================================

/** Всі допустимі блоки */
const VALID_BLOCKS: readonly string[] = [
  "discovery",
  "foundation",
  "development_cycle",
  "validation_cycle",
  "security_fix_cycle",
  "linear_exit",
];

/** Всі допустимі ідентифікатори кроків */
const VALID_STEPS: readonly string[] = [
  "L1", "L2", "L3", "L4", "L5", "L6", "L7",
  "L8", "L9", "L10", "L11", "L12", "L13", "GATE1",
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "V0", "V1", "V2", "V3",
  "S1", "S2", "S3", "S4", "S5",
  "E1", "E2",
];

/** Допустимі статуси (включає "not_started" з Markdown + "cancelled" з TypeScript) */
const VALID_STATUSES: readonly string[] = [
  "not_started",
  "in_progress",
  "awaiting_human_decision",
  "blocked",
  "completed",
  "cancelled",
];

/** Обов'язкові поля верхнього рівня state.json */
const REQUIRED_STATE_FIELDS: readonly string[] = [
  "current_block",
  "current_step",
  "cycle",
  "iteration",
  "validation_attempts",
  "last_updated",
  "status",
  "last_completed_step",
  "last_artifact",
  "notes",
  "artifacts",
  "prev_cycle_artifacts",
];

/** 12 ключів реєстру артефактів */
const ARTIFACT_KEYS: readonly ArtifactKey[] = [
  "observe_report",
  "plan",
  "plan_completion",
  "hansei",
  "goals_check",
  "gate_decision",
  "ui_review",
  "acceptance_report",
  "hansei_audit",
  "validation_conclusions",
  "security_scan",
  "s_block_decision",
];

// =============================================================================
// 4. State JSON Template (§A — шаблон state.json)
// =============================================================================

/** Генерує порожній state.json відповідно до шаблону Markdown */
function createStateJsonTemplate(): RawStateJson {
  return {
    current_block: null,
    current_step: null,
    cycle: 0,
    iteration: 0,
    validation_attempts: 0,
    last_updated: "",
    status: "not_started",
    last_completed_step: null,
    last_artifact: null,
    notes: "",
    artifacts: Object.fromEntries(ARTIFACT_KEYS.map((k) => [k, null])),
    prev_cycle_artifacts: Object.fromEntries(
      ARTIFACT_KEYS.map((k) => [k, null]),
    ),
  };
}

// =============================================================================
// 5. Validation Helpers
// =============================================================================

function isValidBlock(value: unknown): value is Block {
  return typeof value === "string" && VALID_BLOCKS.includes(value);
}

function isValidStep(value: unknown): value is Step {
  return typeof value === "string" && VALID_STEPS.includes(value);
}

function isValidStatus(value: unknown): boolean {
  return typeof value === "string" && VALID_STATUSES.includes(value);
}

/** P3: Валідація raw JSON — перевірка обов'язкових полів і типів */
function validateRawState(raw: unknown): { valid: boolean; error?: string } {
  if (raw === null || typeof raw !== "object") {
    return { valid: false, error: "state.json is not a valid JSON object" };
  }

  const obj = raw as Record<string, unknown>;

  // Перевірка наявності обов'язкових полів
  for (const field of REQUIRED_STATE_FIELDS) {
    if (!(field in obj)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Перевірка типів
  if (typeof obj.cycle !== "number") {
    return { valid: false, error: "cycle must be a number" };
  }
  if (typeof obj.iteration !== "number") {
    return { valid: false, error: "iteration must be a number" };
  }
  if (typeof obj.validation_attempts !== "number") {
    return { valid: false, error: "validation_attempts must be a number" };
  }
  if (typeof obj.status !== "string") {
    return { valid: false, error: "status must be a string" };
  }
  if (typeof obj.notes !== "string") {
    return { valid: false, error: "notes must be a string" };
  }
  if (typeof obj.artifacts !== "object" || obj.artifacts === null) {
    return { valid: false, error: "artifacts must be an object" };
  }
  if (
    typeof obj.prev_cycle_artifacts !== "object" ||
    obj.prev_cycle_artifacts === null
  ) {
    return { valid: false, error: "prev_cycle_artifacts must be an object" };
  }

  // P4: current_step повинен бути валідним (або null)
  if (obj.current_step !== null && !isValidStep(obj.current_step)) {
    return {
      valid: false,
      error: `Unknown current_step: ${String(obj.current_step)}`,
    };
  }

  // P5: status повинен бути валідним
  if (!isValidStatus(obj.status)) {
    return {
      valid: false,
      error: `Unknown status: ${String(obj.status)}`,
    };
  }

  return { valid: true };
}

// =============================================================================
// 6. ALGORITHM (§4 — усі кроки алгоритму, 9 операцій)
// =============================================================================

const ALGORITHM: readonly AlgorithmStep[] = [
  {
    order: 1,
    instruction: "Session Start: зчитати state.json, валідувати, визначити дію (§4.1)",
    substeps: [
      "Зчитати control_center/system_state/state.json",
      "Якщо файл не існує → P2 (створити за шаблоном, почати з L2)",
      "Якщо файл пошкоджений → P3 (ескалація до людини, НЕ лагодити)",
      "Валідувати всі поля (P4, P5)",
      "Зафіксувати: current_block, current_step, status",
    ],
  },
  {
    order: 2,
    instruction: "Context Recovery: відновити контекст за статусом (§4.2)",
    substeps: [
      "not_started → чекати DISCOVERY (L2), не виконувати жодних кроків",
      "in_progress → продовжити current_step, зчитати стандарт + last_artifact",
      "awaiting_human_decision → визначити тип очікування за §4.2a",
      "blocked → перевірити issues/active/, якщо вирішено → in_progress",
      "completed → повідомити: Продукт готовий. Цикл завершено.",
    ],
  },
  {
    order: 3,
    instruction: "Step Context: зчитати контекст поточного кроку (§4.3)",
    substeps: [
      "Стандарт(и) поточного кроку (з system_cycle.md)",
      "Артефакти-залежності — шляхи з state.json → artifacts (НЕ скануванням папок!)",
      "Активний план з plans/active/ (якщо крок пов'язаний з планом)",
      "Активні задачі з tasks/active/ (якщо крок = виконання задач)",
      "Активні issues з issues/active/ (перевірка блокерів)",
    ],
  },
  {
    order: 4,
    instruction:
      "State Transition: атомарне оновлення state.json при переході (§4.4, 7 кроків)",
    substeps: [
      "1. last_completed_step → current_step",
      "2. last_artifact → шлях створеного артефакту",
      "3. Зареєструвати артефакт у artifacts[ключ] (якщо крок створює 📝 артефакт)",
      "4. Визначити наступний крок за system_cycle.md",
      "5. Оновити current_step, current_block",
      "6. last_updated → ISO 8601 (YYYY-MM-DDTHH:MM:SS)",
      "7. Записати state.json ДО початку нового кроку",
    ],
  },
  {
    order: 5,
    instruction: "Gate Handling: оновлення state.json при воротах (§4.5)",
    substeps: [
      "status → awaiting_human_decision",
      "current_step → назва ворота (GATE 1, L4)",
      "Записати state.json",
      "ЗУПИНИТИСЬ. Не виконувати наступний крок.",
    ],
  },
  {
    order: 6,
    instruction: "JIDOKA Handling: оновлення при блокуванні (§4.6)",
    substeps: [
      "status → blocked",
      "current_step залишається без змін (крок з проблемою)",
      "Записати state.json",
      "Створити issue в issues/active/ згідно std-issue-management.md",
      "ЗУПИНИТИСЬ.",
    ],
  },
  {
    order: 7,
    instruction: "Plan Closure (L11, D7): архівація завершеного плану (§4.7)",
    substeps: [
      "Передумови: tasks/active/ порожній, plans/active/ має план, tasks/done/[Назва] має задачі",
      "Для D7: plan_completion_check існує",
      "Зчитати назву → перемістити plans/active/ → plans/done/",
      "Верифікувати: файл у done/, active/ порожній",
      "Оновити state.json: last_completed_step, last_artifact, current_step",
      "Заборонено: закривати з непорожнім tasks/active/, видаляти/модифікувати план",
    ],
  },
  {
    order: 8,
    instruction: "Iteration Counters (§4.8)",
    substeps: [
      "При першому вході в Development Cycle (D1): iteration → 0, D1 встановить правильне",
      "validation_attempts інкрементується ТІЛЬКИ std-acceptance-audit (V2 FAIL), НЕ session management",
    ],
  },
  {
    order: 9,
    instruction: "Session Termination (§4.9)",
    substeps: [
      "Завершення при: воротах, JIDOKA, E2 завершений, ліміт контекстного вікна",
      "Оновити state.json з актуальним станом",
      "Перевірити last_completed_step і last_artifact відповідають реальності",
      "Якщо крок частковий → зберегти current_step, status → in_progress",
    ],
  },
];

// =============================================================================
// 7. Session Start (§4.1)
// =============================================================================

function startSession(input: SessionStartInput): SessionContext {
  // §4.1.1: Зчитати state.json (передано через input)

  // §4.1.2: Якщо control_center/ не існує → P1
  if (!input.control_center_exists) {
    return {
      state: null,
      action: "start_fresh",
      message:
        "control_center/ не існує. Створити директорію та state.json за шаблоном. Почати з L2.",
    };
  }

  // §4.1.2: Якщо state.json не існує → P2
  if (!input.state_file_exists || input.state_json_raw === null) {
    return {
      state: null,
      action: "start_fresh",
      message:
        "state.json не існує. Створити за шаблоном (status=not_started). Очікувати L2 (DISCOVERY).",
    };
  }

  // §4.1.3: Парсинг JSON
  let raw: unknown;
  try {
    raw = JSON.parse(input.state_json_raw);
  } catch {
    // P3: Пошкоджений JSON → ескалація
    return {
      state: null,
      action: "escalate",
      message:
        "state.json пошкоджений (невалідний JSON). Ескалація до людини. НЕ намагатись полагодити.",
    };
  }

  // §4.1.4: Валідація полів (P3, P4, P5)
  const validation = validateRawState(raw);
  if (!validation.valid) {
    return {
      state: null,
      action: "escalate",
      message: `state.json невалідний: ${validation.error}. Ескалація до людини.`,
    };
  }

  const rawState = raw as RawStateJson;

  // Обробка "not_started" (є в Markdown, немає в TypeScript Status type)
  if (rawState.status === "not_started") {
    return {
      state: null,
      action: "wait_discovery",
      message:
        "Система чекає на DISCOVERY (L2). Очікую discovery_brief.md. Не виконувати жодних кроків.",
    };
  }

  // §4.1.5: Конвертація в типізований стан і відновлення контексту
  const state = rawToSystemState(rawState);
  return recoverContext(state);
}

// =============================================================================
// 8. Конвертація Raw → SystemState
// =============================================================================

/** Конвертує валідований raw JSON у типізований SystemState */
function rawToSystemState(raw: RawStateJson): SystemState {
  return {
    current_block: (raw.current_block as Block) || "discovery",
    current_step: (raw.current_step as Step) || "L1",
    last_completed_step: (raw.last_completed_step as Step) || null,
    last_artifact: raw.last_artifact ?? null,
    last_updated: raw.last_updated || "",
    status: (raw.status as Status) || "in_progress",
    cycle: raw.cycle ?? 0,
    iteration: raw.iteration ?? 0,
    validation_attempts: raw.validation_attempts ?? 0,
    isolation_mode: raw.isolation_mode ?? false,
    notes: raw.notes || "",
    artifacts: parseArtifactRegistry(raw.artifacts),
    prev_cycle_artifacts: parseArtifactRegistry(raw.prev_cycle_artifacts),
    current_task: (raw as Record<string, unknown>).current_task as string | null ?? null,
    tasks_completed: Number((raw as Record<string, unknown>).tasks_completed) || 0,
    tasks_total: Number((raw as Record<string, unknown>).tasks_total) || 0,
    jidoka_stops: Number((raw as Record<string, unknown>).jidoka_stops) || 0,
    issues_created: Number((raw as Record<string, unknown>).issues_created) || 0,
    daemon_active: Boolean((raw as Record<string, unknown>).daemon_active) || false,
    auto_gates: Boolean((raw as Record<string, unknown>).auto_gates) || false,
  };
}

function parseArtifactRegistry(
  raw?: Record<string, string | null>,
): ArtifactRegistry {
  if (!raw) return createEmptyArtifactRegistry();
  const registry = createEmptyArtifactRegistry();
  for (const key of ARTIFACT_KEYS) {
    if (key in raw) {
      registry[key] = raw[key] ?? null;
    }
  }
  return registry;
}

// =============================================================================
// 9. Context Recovery (§4.2)
// =============================================================================

function recoverContext(state: SystemState): SessionContext {
  switch (state.status) {
    case "in_progress":
      return {
        state,
        action: "continue_step",
        message: `Продовжити виконання кроку ${state.current_step}. Зчитати стандарт кроку та last_artifact для контексту.`,
      };

    case "awaiting_human_decision":
      return handleAwaitingDecision(state);

    case "blocked":
      return {
        state,
        action: "wait_unblock",
        message: `Система заблокована на кроці ${state.current_step}. Перевірити issues/active/. Якщо issue вирішено → змінити статус на in_progress.`,
      };

    case "completed":
      return {
        state,
        action: "system_complete",
        message: "Продукт готовий. Цикл завершено.",
      };

    case "cancelled":
      return {
        state,
        action: "system_complete",
        message: "Проєкт скасовано (KILL).",
      };

    default:
      return {
        state,
        action: "escalate",
        message: `Невідомий статус: ${state.status}. Ескалація до людини.`,
      };
  }
}

// =============================================================================
// 10. Awaiting Human Decision Handlers (§4.2a — 7 типів очікування)
// =============================================================================

function handleAwaitingDecision(state: SystemState): SessionContext {
  const step = state.current_step;

  // L2: REWORK (повернення з L4)
  if (step === "L2") {
    return {
      state,
      action: "wait_decision",
      awaiting_type: "rework",
      message:
        "REWORK: Очікую оновлення discovery_brief.md. Після завершення — змініть status на in_progress у state.json.",
    };
  }

  // V2: FAIL після аудиту або PASS + security_scan рекомендація
  if (step === "V2") {
    // V2 PASS + security_scan → рекомендація S-блоку
    if (state.notes.includes("security_scan")) {
      return {
        state,
        action: "wait_decision",
        awaiting_type: "s_block_recommendation",
        message: "Очікую рішення: запустити S-блок або перейти до E1.",
      };
    }
    // V2 FAIL → V3 + D1
    return {
      state,
      action: "wait_decision",
      awaiting_type: "audit_fail",
      message:
        "V2 FAIL: Перейти до V3 (рефлексія), потім D1 (новий цикл). validation_attempts — лічильник для документації.",
    };
  }

  // D1: Mini-GATE (цикли 4 і 7)
  if (step === "D1") {
    return {
      state,
      action: "wait_decision",
      awaiting_type: "mini_gate",
      message:
        "Очікую рішення Mini-GATE у файлі mini_gate_decision_*.md в audit/gate_decisions/.",
    };
  }

  // L4, GATE1: Ворота
  if (step === "L4" || step === "GATE1") {
    return {
      state,
      action: "wait_decision",
      awaiting_type: "gate",
      message: `Очікую рішення ворота ${step} у відповідному файлі рішення.`,
    };
  }

  // S5: S-block decision (REPEAT→S1, VALIDATE→V0, STOP→D1)
  if (step === "S5") {
    return {
      state,
      action: "wait_decision",
      awaiting_type: "s_block_decision",
      message:
        "Очікую рішення S-блоку у файлі s_block_decision_*.md (REPEAT→S1, VALIDATE→V0, STOP→D1).",
    };
  }

  // E1: NOT_READY (D1 або KILL)
  if (step === "E1") {
    return {
      state,
      action: "wait_decision",
      awaiting_type: "release_not_ready",
      message: "Release NOT_READY. Очікую рішення: D1 або KILL.",
    };
  }

  // Default: невідомий крок з awaiting_human_decision
  return {
    state,
    action: "wait_decision",
    message: `Очікую рішення для кроку ${step}.`,
  };
}

// =============================================================================
// 11. Step Transition (§4.4 — атомарна 7-крокова послідовність)
// =============================================================================

function transitionStep(input: StepTransitionInput): StepTransitionResult {
  const {
    current_state,
    completed_step,
    artifact_path,
    artifact_registry_key,
    next_step,
    next_block,
  } = input;

  // Immutable update
  const new_state: SystemState = {
    ...current_state,
    artifacts: { ...current_state.artifacts },
    prev_cycle_artifacts: { ...current_state.prev_cycle_artifacts },
  };

  // Крок 1: Зафіксувати завершення кроку
  new_state.last_completed_step = completed_step;

  // Крок 2: Зафіксувати останній артефакт
  new_state.last_artifact = artifact_path;

  // Крок 3: Зареєструвати артефакт у artifacts[key] (якщо крок створює 📝)
  if (artifact_registry_key && artifact_path) {
    new_state.artifacts[artifact_registry_key] = artifact_path;
  }

  // Кроки 4-5: Наступний крок + блок (визначається caller'ом за system_cycle.md)
  new_state.current_step = next_step;
  new_state.current_block = next_block;

  // Крок 6: Timestamp ISO 8601
  new_state.last_updated = new Date().toISOString().slice(0, 19);

  // Крок 7: Записати state.json ДО початку нового кроку (enforced by caller)
  return { new_state, success: true };
}

// =============================================================================
// 12. Gate Handling (§4.5 — 4 кроки)
// =============================================================================

function handleGate(state: SystemState): SystemState {
  return {
    ...state,
    // Крок 1: status → awaiting_human_decision
    status: "awaiting_human_decision",
    // Крок 2: current_step залишається (gate step — встановлюється caller'ом)
    // Крок 3: Записати state.json
    last_updated: new Date().toISOString().slice(0, 19),
    // Крок 4: ЗУПИНИТИСЬ (enforced by orchestrator)
  };
}

// =============================================================================
// 13. JIDOKA Handling (§4.6 — 5 кроків)
// =============================================================================

function handleJidoka(
  state: SystemState,
  issueDescription: string,
): SystemState {
  return {
    ...state,
    // Крок 1: status → blocked
    status: "blocked",
    // Крок 2: current_step залишається без змін (крок з проблемою)
    // Крок 3: Записати state.json
    last_updated: new Date().toISOString().slice(0, 19),
    notes: issueDescription,
    // Крок 4: Створити issue в issues/active/ (orchestrator via std-issue-management)
    // Крок 5: ЗУПИНИТИСЬ (enforced by orchestrator)
  };
}

// =============================================================================
// 14. Plan Closure (§4.7 — L11, D7)
// =============================================================================

function planClosure(input: PlanClosureInput): PlanClosureResult {
  const {
    current_state,
    plan_name,
    tasks_active_empty,
    tasks_done_has_tasks,
    plan_completion_exists,
  } = input;

  // Передумова: tasks/active/ повинен бути порожнім
  if (!tasks_active_empty) {
    return {
      success: false,
      error: "Заборонено закривати план з непорожнім tasks/active/.",
      actions: [],
    };
  }

  // Передумова: tasks/done/[Назва плану]/ повинен мати задачі
  if (!tasks_done_has_tasks) {
    return {
      success: false,
      error: `tasks/done/${plan_name}/ не містить виконаних задач.`,
      actions: [],
    };
  }

  // Для D7: plan_completion_check повинен існувати
  if (current_state.current_step === "D7" && !plan_completion_exists) {
    return {
      success: false,
      error: "Для D7: plan_completion_check не існує.",
      actions: [],
    };
  }

  // §4.7 Алгоритм
  const actions: PlanClosureAction[] = [
    // Кроки 1-2: Зчитати назву плану + верифікувати (done via input)
    // Крок 3: Перемістити план active → done
    {
      type: "move_plan",
      from: `control_center/plans/active/${plan_name}`,
      to: `control_center/plans/done/${plan_name}`,
    },
    // Крок 4: Верифікувати переміщення
    {
      type: "verify_move",
      path: `control_center/plans/done/${plan_name}`,
    },
    // Крок 5: Оновити state.json
    {
      type: "update_state",
      updates: {
        last_completed_step: current_state.current_step,
        last_artifact: `plans/done/${plan_name}`,
      },
    },
  ];

  return { success: true, actions };
}

// =============================================================================
// 15. Iteration Counters (§4.8)
// =============================================================================

/** §4.8: При першому вході в Development Cycle → iteration = 0. D1 встановить правильне. */
function initIterationCounter(
  state: SystemState,
  entering_development: boolean,
): SystemState {
  if (entering_development) {
    return { ...state, iteration: 0 };
  }
  return state;
}

// §4.8: validation_attempts інкрементується ТІЛЬКИ std-acceptance-audit (V2 FAIL).
// Session management НЕ змінює validation_attempts при переходах між кроками.

// =============================================================================
// 16. Session Termination (§4.9)
// =============================================================================

/** Коректне завершення сесії з оновленням state.json */
function terminateSession(
  state: SystemState,
  partial_step: boolean,
): SystemState {
  const updated: SystemState = {
    ...state,
    last_updated: new Date().toISOString().slice(0, 19),
  };

  // Якщо крок виконано частково → зберегти current_step, status → in_progress
  if (partial_step) {
    updated.status = "in_progress";
  }

  return updated;
}

// =============================================================================
// 17. Constraints (§8 — 7 обмежень, ДОСЛІВНО з Markdown)
// =============================================================================

const CONSTRAINTS: readonly string[] = [
  "Заборонено виконувати будь-який крок циклу без попереднього зчитування state.json.",
  "Заборонено визначати поточний крок «з пам'яті» або за контекстом розмови — тільки з файлу.",
  "Заборонено змінювати state.json заднім числом (ставити last_completed_step, який насправді не завершений).",
  "Заборонено продовжувати роботу при status: awaiting_human_decision або blocked без зняття блокування.",
  "Заборонено видаляти або перезаписувати state.json повністю — тільки оновлення окремих полів.",
  "Заборонено пропускати кроки циклу. Послідовність визначається system_cycle.md.",
  "Заборонено ігнорувати розходження між state.json і реальним станом файлової системи — при виявленні → ескалація до людини.",
];

// =============================================================================
// 18. Edge Cases (§C — 6 крайніх випадків)
// =============================================================================

const EDGE_CASES: ReadonlyArray<{ scenario: string; action: string }> = [
  {
    scenario: "state.json не існує, але артефакти вже є (хтось видалив файл)",
    action:
      "Ескалація до людини. НЕ намагатись відновити стан автоматично — ризик хибного визначення кроку.",
  },
  {
    scenario: "state.json вказує на D5, але tasks/active/ порожній",
    action:
      "Перевірити tasks/done/. Якщо задачі виконані → D5 завершено, перейти до D6. Якщо теж порожній → ескалація.",
  },
  {
    scenario: "last_artifact вказує на файл, якого не існує",
    action:
      "Ескалація до людини. Артефакт міг бути видалений вручну.",
  },
  {
    scenario: "Людина змінила state.json вручну",
    action:
      "Прийняти зміни без питань, якщо всі поля валідні. Людина має найвищий пріоритет (std-instruction-hierarchy).",
  },
  {
    scenario: "Контекстне вікно наближається до ліміту",
    action:
      "Завершити поточний атомарний крок, оновити state.json, завершити сесію.",
  },
  {
    scenario: "Два файли рішень ворота для одного GATE",
    action: "Використовувати файл з найпізнішою датою у назві.",
  },
];

// =============================================================================
// 19. Acceptance Criteria Validation (§6 — 8 критеріїв)
// =============================================================================

function validateResult(
  state: SystemState | null,
  stateFileExists: boolean,
): ValidationOutcome {
  const issues: string[] = [];

  // C1: state.json існує з валідним JSON
  if (!stateFileExists || state === null) {
    issues.push("state.json не існує або невалідний.");
    return { valid: false, issues };
  }

  // C3: current_step відповідає реальному кроку
  if (!isValidStep(state.current_step)) {
    issues.push(
      `current_step (${state.current_step}) не відповідає жодному відомому кроку.`,
    );
  }

  // C6: status коректно відображає стан
  if (!isValidStatus(state.status)) {
    issues.push(`status (${state.status}) невалідний.`);
  }

  // C7: state.json оновлюється ДО початку нового кроку (process constraint, runtime)

  // C8: лічильники невід'ємні
  if (state.iteration < 0) {
    issues.push("iteration не може бути від'ємним.");
  }
  if (state.validation_attempts < 0) {
    issues.push("validation_attempts не може бути від'ємним.");
  }

  return { valid: issues.length === 0, issues };
}

// =============================================================================
// 20. Main execute() — Session Start + Context Recovery (§4.1–§4.2)
// =============================================================================

/** Головна точка входу: старт сесії + відновлення контексту */
function execute(input: SessionStartInput): SessionContext {
  return startSession(input);
}

// =============================================================================
// 21. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Під-алгоритми
  transitionStep,
  handleGate,
  handleJidoka,
  planClosure,
  terminateSession,
  initIterationCounter,
  // Валідація
  validateResult,
  validateRawState,
  // Хелпери
  rawToSystemState,
  createStateJsonTemplate,
  isValidBlock,
  isValidStep,
  isValidStatus,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  EDGE_CASES,
  VALID_BLOCKS,
  VALID_STEPS,
  VALID_STATUSES,
  REQUIRED_STATE_FIELDS,
  ARTIFACT_KEYS,
};

// Re-export типів
export type {
  SessionContext,
  SessionStartInput,
  SessionAction,
  AwaitingDecisionType,
  StepTransitionInput,
  StepTransitionResult,
  PlanClosureInput,
  PlanClosureResult,
  PlanClosureAction,
  ValidationOutcome,
  RawStateJson,
};
