// =============================================================================
// D1: Cycle Checkpoint — Контрольна точка циклу (pass-through)
// D1 є простим прохідним кроком. Рішення приймається на D9 (Mini-GATE).
// D1 автоматично переходить до D2 без жодних зупинок та рішень.
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
  ArtifactRotation,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для D1 Cycle Checkpoint)
// =============================================================================

/** Результат читання cycle_counter.md */
interface CycleCounterResult {
  current_cycle: number;
  is_first_iteration: boolean;
  raw_value: string | null;
}

/** Результат кроку D1 */
interface CycleCheckpointResult {
  cycle_number: number;
  next_step: "D2";
}

/** Параметри для генерації шаблону */
interface TemplateParams {
  date: string;
  cycle: number;
  [key: string]: unknown;
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 4 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "dir_not_empty",
    path: "control_center/final_view",
    description:
      "P1: Файли у control_center/final_view/ існують і непорожні. Без еталону цілей перевірка неможлива.",
  },
  {
    type: "file_exists",
    path: "control_center/system_state/cycle_counter.md",
    description:
      "P2: cycle_counter.md доступний (існує або може бути створений). Якщо не існує — створити з вмістом '1'. Це перша ітерація.",
  },
  {
    type: "file_exists",
    path: "control_center/system_state/state.json",
    description:
      "P3: state.json існує і валідний. Ескалація до людини згідно std-session-management.md при порушенні.",
  },
  {
    type: "step_completed",
    step: "GATE1",
    description:
      "P4: Попередній крок завершений (GATE1 для першої ітерації, D9 для наступних). Крок блокується при порушенні.",
  },
];

// =============================================================================
// 3. ALGORITHM (D1 — прохідний крок, без рішень)
// D1 НЕ є воротами. Рішення приймається на D9 (кінець блоку).
// D1 лише зчитує лічильник та автоматично переходить до D2.
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 0,
    instruction:
      "Зчитати лічильник: control_center/system_state/cycle_counter.md.",
    substeps: [
      "Файл не існує або порожній → записати 0, поточний цикл = 1",
      "Файл містить число N → це номер останнього завершеного циклу. Поточний цикл = N + 1",
      "Файл містить нечислове значення → ескалація до людини",
    ],
  },
  {
    order: 1,
    instruction:
      "Автоматичний перехід до D2 — жодних рішень або зупинок.",
    substeps: [
      "Оновити state.json: current_step → D2, last_completed_step → D1",
      "Перейти до D2",
    ],
    contract_check:
      "D1 ЗАВЖДИ переходить до D2. Ніколи не зупиняється. Ніколи не чекає рішення.",
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 12 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "D1 НЕ є воротами — жодних рішень не приймається на D1.",
  "D1 ЗАВЖДИ автоматично переходить до D2 без зупинки.",
  "ЗАБОРОНЕНО встановлювати status: awaiting_human_decision на D1.",
  "ЗАБОРОНЕНО читати mini_gate_decision або v3_decision файли на D1.",
  "ЗАБОРОНЕНО змінювати файли у control_center/final_view/.",
  "ЗАБОРОНЕНО записувати у cycle_counter.md будь-що крім одного цілого числа.",
  "ЗАБОРОНЕНО скидувати cycle_counter.md до 0 або зменшувати його значення. Лічильник тільки зростає.",
  "ЗАБОРОНЕНО пропускати оновлення state.json перед переходом до наступного кроку.",
  "Рішення про продовження/валідацію/скасування приймається на D9 (кінець блоку), НЕ на D1 (початок).",
];

// =============================================================================
// 5. EDGE CASES (§C — 7 крайніх випадків)
// =============================================================================

interface EdgeCase {
  situation: string;
  action: string;
}

const EDGE_CASES: EdgeCase[] = [
  {
    situation: "cycle_counter.md містить нечислове значення",
    action: "Ескалація до людини. Не намагатись інтерпретувати.",
  },
  {
    situation: "cycle_counter.md = 0 або не існує",
    action: "Перша ітерація. Записати 0, перейти до D2.",
  },
  {
    situation: "Людина вручну змінила cycle_counter.md",
    action: "Прийняти значення без питань. Людина має найвищий пріоритет.",
  },
  {
    situation: "state.json вказує status: blocked",
    action: "Не виконувати D1. Зупинитись, повідомити людині про блокування.",
  },
];

// =============================================================================
// 6. Artifact Rotation (§4 Крок 5 — повна ротація артефактів)
// =============================================================================

const ROTATION: ArtifactRotation = {
  description:
    "D1 не виконує ротацію. Ротація артефактів виконується lifecycle hooks при завершенні D9/V3.",
  archive_keys: [],
  copy_to_prev_keys: [],
  nullify_keys: [],
};

// =============================================================================
// 7. Валідація результату (§6 Критерії прийнятності — 5 пунктів)
// =============================================================================

/**
 * Перевіряє результат D1 за критеріями прийнятності.
 * D1 — прохідний крок, перевіряємо лише cycle_counter та state update.
 */
function validateResult(
  cycleCounterContent: string,
  stateUpdated: boolean,
): ValidationOutcome {
  const issues: string[] = [];

  // C1: cycle_counter.md містить коректний номер циклу (ціле число ≥ 0)
  const cycleNum = parseInt(cycleCounterContent.trim(), 10);
  if (isNaN(cycleNum) || cycleNum < 0) {
    issues.push(
      `C1 FAIL: cycle_counter.md має містити ціле число ≥ 0, знайдено: "${cycleCounterContent.trim()}"`
    );
  }

  // C2: state.json оновлено ДО переходу до наступного кроку
  if (!stateUpdated) {
    issues.push(
      "C2 FAIL: state.json не оновлено перед переходом"
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 8. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_D1: StepDefinition = {
  id: "D1",
  block: "development_cycle",
  name: "Cycle Checkpoint — Контрольна точка циклу (pass-through)",
  type: "autonomous",
  role: "programmer",
  purpose:
    "Прохідний крок на початку кожної ітерації. Зчитує лічильник циклу та автоматично переходить до D2. Рішення приймається на D9 (Mini-GATE) в кінці блоку, не тут.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "file",
      path: "control_center/system_state/cycle_counter.md",
      description: "Лічильник циклів — номер поточного циклу",
      required: true,
    },
    {
      source: "file",
      path: "control_center/system_state/state.json",
      description: "Стан системи",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/system_state/cycle_counter.md",
  },

  transitions: [
    {
      condition: "ALWAYS — автоматичний перехід до D2",
      target: "D2",
    },
  ],

  isolation_required: false,

  rotation: ROTATION,
};

// =============================================================================
// 9. Exports
// =============================================================================

export {
  // Валідація результату
  validateResult,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  EDGE_CASES,
  ROTATION,
};

export type {
  CycleCounterResult,
  CycleCheckpointResult,
  TemplateParams,
  ValidationOutcome,
  EdgeCase,
};
