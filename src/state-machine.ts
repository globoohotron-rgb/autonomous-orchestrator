// =============================================================================
// State Machine — переходи між кроками та блоками
// Конвертовано з: control_center/docs/system_cycle.md
//   Секції: "Структура циклу", "Послідовність кроків у кожному блоці",
//   "Ворота (Gates) — зведення", "State Tracking" (правила 1–5),
//   "Лічильники циклів"
// Роль: O1 — state transitions, block navigation, state I/O
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type {
  SystemState,
  Block,
  Step,
  Status,
  OrchestratorConfig,
} from "./types";
import { collectCycleTransition } from "./learning/metrics-collector";

// =============================================================================
// Block Sequences — послідовність кроків у кожному блоці
// З секції "Послідовність кроків у кожному блоці" system_cycle.md
// =============================================================================

export const BLOCK_SEQUENCES: Record<Block, Step[]> = {
  // Блок 1 — Дослідження: L1→L2→L3→L3b→L4→L5→L6→L7
  discovery: ["L1", "L2", "L3", "L3b", "L4", "L5", "L6", "L7"],

  // Блок 2 — Фундамент: L8→L9→L10→L10b→L11(+HANSEI)→L13→GATE1  (L12 merged into L11)
  foundation: ["L8", "L9", "L10", "L10b", "L11", "L13", "GATE1"],

  // Блок 3 — Коло розвитку: D1→D2→D3→D4→D5→D6→D7(+HANSEI)→D9  (D8 merged into D7)
  development_cycle: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D9"],

  // Блок 4 — Коло валідації: V0→V0.5→V1→V2→V3
  validation_cycle: ["V0", "V0_5", "V1", "V2", "V3"],

  // Блок 5 — Security Fix Cycle: S1→S2→S3→S4→S5
  security_fix_cycle: ["S1", "S2", "S3", "S4", "S5"],

  // Блок 6 — Лінійний вихід: E1→E2
  linear_exit: ["E1", "E2"],
};

// =============================================================================
// Block order — порядок блоків (для документації)
// =============================================================================

export const BLOCK_ORDER: Block[] = [
  "discovery",
  "foundation",
  "development_cycle",
  "validation_cycle",
  "security_fix_cycle",
  "linear_exit",
];

// =============================================================================
// Special Transitions — нелінійні переходи (gates, decisions, loops)
// З описів кроків L4, GATE1, D1, D9, V2, V3, S5, E1 у system_cycle.md
// та "Ворота (Gates) — зведення"
//
// УВАГА: StateMachineTransition — внутрішній для state-machine.ts.
// НЕ плутати з Transition з types/steps.ts (той — per-step, без from).
// =============================================================================

interface StateMachineTransition {
  from: Step;
  condition: string;
  target: Step | "KILL" | "COMPLETED";
  block_change?: Block;
  state_updates?: Partial<SystemState>;
}

export const SPECIAL_TRANSITIONS: StateMachineTransition[] = [
  // =========================================================================
  // L4 GATE (Entry Gate) — після DISCOVERY
  // system_cycle.md → "GO/REWORK/KILL — Ворота входу"
  // GO → L5, REWORK → L2 (перезапис brief), KILL → скасовано
  // =========================================================================
  { from: "L4", condition: "GO", target: "L5" },
  { from: "L4", condition: "REWORK", target: "L2" },
  { from: "L4", condition: "KILL", target: "KILL" },

  // =========================================================================
  // L7 → foundation block change
  // system_cycle.md → "Після завершення L7: current_block → foundation"
  // =========================================================================
  {
    from: "L7",
    condition: "ALWAYS",
    target: "L8",
    block_change: "foundation",
  },

  // =========================================================================
  // GATE1 (Foundation Gate) — після фундаменту
  // system_cycle.md → "GATE 1 — Ворота фундаменту"
  // GO → D1 (development_cycle), REBUILD_PLAN → L8,
  // REBUILD_DESCRIPTION → L5 (discovery), KILL → скасовано
  // =========================================================================
  {
    from: "GATE1",
    condition: "GO",
    target: "D1",
    block_change: "development_cycle",
  },
  { from: "GATE1", condition: "REBUILD_PLAN", target: "L8" },
  {
    from: "GATE1",
    condition: "REBUILD_DESCRIPTION",
    target: "L5",
    block_change: "discovery",
  },
  { from: "GATE1", condition: "KILL", target: "KILL" },

  // =========================================================================
  // D1 (Cycle Checkpoint) — pass-through: ротація артефактів + D2
  // D1 більше НЕ є воротами. Рішення приймається на D9 (Mini-GATE).
  // =========================================================================
  { from: "D1", condition: "ALWAYS", target: "D2" },

  // =========================================================================
  // D9 (Mini-GATE — єдині ворота блоку D)
  // system_cycle.md → "D9. Перевірка цілей + Mini-GATE (СТОП)"
  // CONTINUE → D1 (ротація) → D2, VALIDATE → V0,
  // AMEND_SPEC → D1 (ротація) → D2, KILL → скасовано
  // =========================================================================
  { from: "D9", condition: "CONTINUE", target: "D1" },
  {
    from: "D9",
    condition: "VALIDATE",
    target: "V0",
    block_change: "validation_cycle",
  },
  { from: "D9", condition: "AMEND_SPEC", target: "D1" },
  { from: "D9", condition: "KILL", target: "KILL" },

  // =========================================================================
  // V2 (Audit Decision — automatic)
  // system_cycle.md → "V2. Рішення аудиту"
  // PASS → E1 (linear_exit), PASS_WITH_SECURITY → STOP (awaiting),
  // FAIL → V3
  // =========================================================================
  {
    from: "V2",
    condition: "PASS",
    target: "E1",
    block_change: "linear_exit",
  },
  {
    from: "V2",
    condition: "PASS_WITH_SECURITY",
    target: "V2",
    state_updates: { status: "awaiting_human_decision" as Status },
  },
  { from: "V2", condition: "FAIL", target: "V3" },

  // =========================================================================
  // V3 (HANSEI + Висновки валідації — ворота V-блоку)
  // system_cycle.md → "V3. HANSEI – Рефлексія аудиту + Висновки валідації"
  // CONTINUE → D1 (development_cycle), AMEND_SPEC → D1, KILL → скасовано
  // =========================================================================
  {
    from: "V3",
    condition: "CONTINUE",
    target: "D1",
    block_change: "development_cycle",
  },
  {
    from: "V3",
    condition: "AMEND_SPEC",
    target: "D1",
    block_change: "development_cycle",
  },
  { from: "V3", condition: "KILL", target: "KILL" },

  // =========================================================================
  // S5 (S-Block closure + STOP)
  // system_cycle.md → "S5. Закриття та рішення людини"
  // REPEAT → S1 (human rescans), VALIDATE → V0 (validation),
  // STOP → D1 (development) або пауза
  // =========================================================================
  { from: "S5", condition: "REPEAT", target: "S1" },
  {
    from: "S5",
    condition: "VALIDATE",
    target: "V0",
    block_change: "validation_cycle",
  },
  {
    from: "S5",
    condition: "STOP",
    target: "D1",
    block_change: "development_cycle",
  },

  // =========================================================================
  // E1 (Release Readiness)
  // system_cycle.md → "E1. RELEASE READINESS"
  // READY → E2, NOT_READY → awaiting_human_decision
  // Human decides: D1 (new dev cycle) or KILL
  // =========================================================================
  { from: "E1", condition: "READY", target: "E2" },
  {
    from: "E1",
    condition: "NOT_READY",
    target: "E1",
    state_updates: { status: "awaiting_human_decision" as Status },
  },
  // Рішення людини після NOT_READY
  {
    from: "E1",
    condition: "D1",
    target: "D1",
    block_change: "development_cycle",
  },
  { from: "E1", condition: "KILL", target: "KILL" },

  // =========================================================================
  // E2 — термінальний крок, цикл завершено
  // =========================================================================
  {
    from: "E2",
    condition: "ALWAYS",
    target: "COMPLETED",
    state_updates: { status: "completed" as Status },
  },
];

// =============================================================================
// Transition Result
// =============================================================================

export interface TransitionResult {
  /** Наступний крок (undefined якщо помилка або KILL/COMPLETED) */
  nextStep?: Step;
  /** Блок наступного кроку */
  block?: Block;
  /** State updates що треба застосувати */
  stateUpdates?: Partial<SystemState>;
  /** Помилка якщо перехід неможливий */
  error?: string;
  /** Проєкт скасовано (KILL) */
  killed?: boolean;
  /** Цикл завершено (COMPLETED) */
  completed?: boolean;
}

// =============================================================================
// getNextStep — основна функція переходу
// Визначає наступний крок на основі поточного стану та рішення
// =============================================================================

export function getNextStep(
  state: SystemState,
  decision?: string
): TransitionResult {
  // 1. Перевірити спеціальні переходи для поточного кроку
  const special = SPECIAL_TRANSITIONS.filter(
    (t) => t.from === state.current_step
  );

  if (special.length > 0) {
    // Крок має нелінійний перехід — потрібне рішення або ALWAYS
    const matched = special.find(
      (t) => t.condition === decision || t.condition === "ALWAYS"
    );

    if (!matched) {
      const options = special.map((t) => t.condition).join(", ");
      return {
        error: `Decision required for ${state.current_step}. Options: ${options}`,
      };
    }

    return applyTransition(state, matched);
  }

  // 2. Лінійний перехід — наступний крок у блоці
  const sequence = BLOCK_SEQUENCES[state.current_block];
  if (!sequence) {
    return { error: `Unknown block: ${state.current_block}` };
  }

  const currentIndex = sequence.indexOf(state.current_step);
  if (currentIndex === -1) {
    return {
      error: `Step ${state.current_step} not found in block ${state.current_block}`,
    };
  }

  if (currentIndex < sequence.length - 1) {
    return {
      nextStep: sequence[currentIndex + 1],
      block: state.current_block,
    };
  }

  // Кінець блоку без special transition — помилка
  return {
    error: `End of block ${state.current_block} without transition for step ${state.current_step}`,
  };
}

// =============================================================================
// applyTransition — застосувати спеціальний перехід
// =============================================================================

function applyTransition(
  state: SystemState,
  transition: StateMachineTransition
): TransitionResult {
  if (transition.target === "KILL") {
    return {
      killed: true,
      stateUpdates: { status: "cancelled" as Status },
    };
  }

  if (transition.target === "COMPLETED") {
    return {
      completed: true,
      stateUpdates: {
        status: "completed" as Status,
        ...transition.state_updates,
      },
    };
  }

  const targetBlock = transition.block_change ?? state.current_block;

  return {
    nextStep: transition.target,
    block: targetBlock,
    stateUpdates: transition.state_updates,
  };
}

// =============================================================================
// getValidDecisions — повертає допустимі рішення для поточного кроку
// =============================================================================

export function getValidDecisions(step: Step): string[] {
  const transitions = SPECIAL_TRANSITIONS.filter((t) => t.from === step);
  if (transitions.length === 0) return [];

  return transitions
    .map((t) => t.condition)
    .filter((c) => c !== "ALWAYS");
}

// =============================================================================
// isGateStep — чи є крок воротами (потребує рішення людини)
// =============================================================================

export function isGateStep(step: Step): boolean {
  const transitions = SPECIAL_TRANSITIONS.filter((t) => t.from === step);
  // Ворота = має спец. переходи й жоден з них не є ALWAYS
  return transitions.length > 0 && !transitions.some((t) => t.condition === "ALWAYS");
}

// =============================================================================
// isTerminalStep — чи є крок термінальним (E2)
// =============================================================================

export function isTerminalStep(step: Step): boolean {
  return step === "E2";
}

// =============================================================================
// getBlockForStep — визначити блок за кроком
// =============================================================================

export function getBlockForStep(step: Step): Block | null {
  for (const [block, steps] of Object.entries(BLOCK_SEQUENCES)) {
    if ((steps as Step[]).includes(step)) {
      return block as Block;
    }
  }
  return null;
}

// =============================================================================
// State I/O — завантаження/збереження state.json
// Правила з system_cycle.md → "Відстеження стану (State Tracking)":
//   1. При старті сесії першим кроком читає state.json і продовжує
//   2. Якщо state.json не існує — створює початковий стан (L1)
//   3. Якщо state.json пошкоджений — ескалація до людини
//   4. Кожен перехід фіксується ПЕРЕД початком нового кроку
//   5. Детальний алгоритм — std-session-management.md
// =============================================================================

/**
 * Повертає абсолютний шлях до state.json
 */
export function getStatePath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", "state.json");
}

/**
 * Завантажити стан з state.json
 * Правило 1: першим кроком читаємо state.json
 * Правило 2: якщо не існує — створити початковий стан (current_step = L1)
 * Правило 3: якщо пошкоджений — спробувати .bak, потім повернути помилку для ескалації
 */
export function loadState(
  config: OrchestratorConfig
): { state: SystemState } | { error: "STATE_NOT_FOUND" | "STATE_CORRUPTED"; message: string } {
  const statePath = getStatePath(config);

  if (!fs.existsSync(statePath)) {
    // Правило 2: state.json не існує — повертаємо помилку
    // (створення — відповідальність orchestrator.ts або комandi init)
    return {
      error: "STATE_NOT_FOUND",
      message: `state.json not found at ${statePath}`,
    };
  }

  // Спробувати завантажити основний файл
  const mainResult = tryLoadStateFile(statePath);
  if (mainResult) return { state: mainResult };

  // Основний файл пошкоджений — спробувати backup
  const bakPath = statePath + ".bak";
  if (fs.existsSync(bakPath)) {
    const bakResult = tryLoadStateFile(bakPath);
    if (bakResult) {
      // Відновлено з backup — перезаписати основний файл
      try {
        fs.writeFileSync(statePath, JSON.stringify(bakResult, null, 2), "utf-8");
      } catch {
        // Не вдалося перезаписати — повертаємо стан з бекапу
      }
      return { state: bakResult };
    }
  }

  // Ні основний, ні backup не валідні
  return {
    error: "STATE_CORRUPTED",
    message: `state.json and state.json.bak are both corrupted at ${statePath}`,
  };
}

/**
 * Спроба завантажити та валідувати state з файлу. Повертає null при помилці.
 */
function tryLoadStateFile(filePath: string): SystemState | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) return null;
    return parsed as SystemState;
  } catch {
    return null;
  }
}

/**
 * Зберегти стан до state.json
 * Правило 4: оновити ПЕРЕД початком нового кроку
 *
 * BACKUP: перед кожним записом створює state.json.bak.
 * При пошкодженні state.json — loadState спробує .bak автоматично.
 */
export function saveState(
  config: OrchestratorConfig,
  state: SystemState
): void {
  const statePath = getStatePath(config);
  const dir = path.dirname(statePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Backup поточний state.json перед перезаписом
  if (fs.existsSync(statePath)) {
    try {
      fs.copyFileSync(statePath, statePath + ".bak");
    } catch {
      // Backup failed — не блокуємо запис основного файлу
    }
  }

  // Оновити timestamp
  state.last_updated = new Date().toISOString();

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

// =============================================================================
// advanceState — перемістити стан до наступного кроку
// Правило 4: оновити state.json ПЕРЕД початком нового кроку
// =============================================================================

export function advanceState(
  state: SystemState,
  transition: TransitionResult
): SystemState {
  const updated = { ...state };

  // Зафіксувати поточний крок як завершений
  updated.last_completed_step = state.current_step;

  if (transition.killed) {
    updated.status = "cancelled";
    return updated;
  }

  if (transition.completed) {
    updated.status = "completed";
    updated.current_step = "E2";
    updated.current_block = "linear_exit";
    return updated;
  }

  if (transition.nextStep) {
    updated.current_step = transition.nextStep;
  }

  if (transition.block) {
    updated.current_block = transition.block;
  }

  // Застосувати додаткові state_updates
  if (transition.stateUpdates) {
    Object.assign(updated, transition.stateUpdates);
  }

  // Скинути статус на in_progress якщо не встановлено інакше через stateUpdates
  if (!transition.stateUpdates?.status) {
    updated.status = "in_progress";
  }

  // OPT-4: записати час початку нового кроку для step watchdog
  updated.step_started_at = new Date().toISOString();

  // OPT-22: інкрементувати s_block_cycles при S5 REPEAT → S1
  if (state.current_step === "S5" && transition.nextStep === "S1") {
    updated.s_block_cycles = (updated.s_block_cycles ?? 0) + 1;
  }
  // OPT-22: скинути s_block_cycles при виході з S-блоку (S5 → V0 або S5 → D1)
  if (state.current_step === "S5" && transition.nextStep !== "S1") {
    updated.s_block_cycles = 0;
  }

  return updated;
}

// =============================================================================
// Cycle Counters — лічильники циклів
// system_cycle.md → "Лічильники циклів"
//   - cycle_counter.md: інкрементується на D1 (нумерація артефактів)
//   - validation_attempts: інкрементується при кожному V2 FAIL
// =============================================================================

/**
 * Інкрементувати лічильник циклу розвитку (D1)
 * Не обмежує ітерації — людина вирішує на Mini-GATE
 */
export function incrementCycleCounter(
  config: OrchestratorConfig,
  state: SystemState
): SystemState {
  const updated = { ...state };
  updated.cycle = (updated.cycle || 0) + 1;
  updated.iteration = (updated.iteration || 0) + 1;

  // Оновити cycle_counter.md
  const counterPath = path.join(
    config.control_center_path,
    "system_state",
    "cycle_counter.md"
  );
  const content = `# Cycle Counter\n\nCurrent cycle: ${updated.cycle}\nIteration: ${updated.iteration}\nLast updated: ${new Date().toISOString()}\n`;

  const dir = path.dirname(counterPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(counterPath, content, "utf-8");

  // --- Metrics hook: cycle_transition ---
  try {
    collectCycleTransition(
      config,
      state.current_step,
      state.cycle || 0,
      updated.cycle,
    );
  } catch { /* non-blocking */ }

  return updated;
}

/**
 * Інкрементувати лічильник спроб валідації (V2 FAIL)
 * cycle_counter.md НЕ скидується — тільки зростає
 */
export function incrementValidationAttempts(
  state: SystemState
): SystemState {
  return {
    ...state,
    validation_attempts: (state.validation_attempts || 0) + 1,
  };
}

// =============================================================================
// Isolation mode — для V-блоку (validation_cycle)
// system_cycle.md → V0 "Вимога ізоляції (Isolation Mode)"
// При переході до V0: isolation_mode = true
// Після V-блоку: isolation_mode = false
// =============================================================================

/**
 * Встановити режим ізоляції при вході у V-блок
 */
export function setIsolationMode(
  state: SystemState,
  enabled: boolean
): SystemState {
  return {
    ...state,
    isolation_mode: enabled,
  };
}

// =============================================================================
// State validation
// =============================================================================

/**
 * Базова валідація структури state.json
 */
function isValidState(obj: unknown): obj is SystemState {
  if (typeof obj !== "object" || obj === null) return false;
  const s = obj as Record<string, unknown>;

  // Перевірка обов'язкових полів
  const requiredFields: Array<keyof SystemState> = [
    "current_block",
    "current_step",
    "status",
    "artifacts",
    "prev_cycle_artifacts",
  ];

  for (const field of requiredFields) {
    if (!(field in s)) return false;
  }

  // Перевірка що current_block — відомий блок
  const validBlocks: Block[] = [
    "discovery",
    "foundation",
    "development_cycle",
    "validation_cycle",
    "security_fix_cycle",
    "linear_exit",
  ];
  if (!validBlocks.includes(s.current_block as Block)) return false;

  // Перевірка що status — відомий статус
  const validStatuses: Status[] = [
    "in_progress",
    "awaiting_human_decision",
    "blocked",
    "completed",
    "cancelled",
  ];
  if (!validStatuses.includes(s.status as Status)) return false;

  return true;
}

/**
 * Перевірити чи крок належить до поточного блоку
 */
export function isStepInBlock(step: Step, block: Block): boolean {
  const sequence = BLOCK_SEQUENCES[block];
  return sequence ? sequence.includes(step) : false;
}

/**
 * Отримати індекс кроку в блоці (для порівняння порядку)
 */
export function getStepOrdinal(step: Step): number {
  let ordinal = 0;
  for (const block of BLOCK_ORDER) {
    const sequence = BLOCK_SEQUENCES[block];
    const index = sequence.indexOf(step);
    if (index !== -1) {
      return ordinal + index;
    }
    ordinal += sequence.length;
  }
  return -1; // unknown step
}

/**
 * Перевірити чи крок A завершено відносно кроку B
 * (A має менший ординал ніж B)
 */
export function isStepCompletedBefore(
  completedStep: Step | null,
  referenceStep: Step
): boolean {
  if (!completedStep) return false;
  return getStepOrdinal(completedStep) >= getStepOrdinal(referenceStep);
}
