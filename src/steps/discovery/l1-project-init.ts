// =============================================================================
// L1: PROJECT INIT — Ініціалізація проєкту
// Конвертовано з: control_center/standards/system/std-project-init.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Типи (специфічні для L1 Project Init)
// =============================================================================

/** Повний перелік папок що мають бути створені */
interface DirectoryEntry {
  /** Відносний шлях від project root */
  path: string;
}

/** Початковий стан state.json згідно §4 крок 3 */
interface InitialStateJson {
  current_block: "discovery";
  current_step: "L1";
  iteration: number;
  validation_attempts: number;
  last_updated: string;
  status: "in_progress";
  last_completed_step: null;
  last_artifact: null;
}

/** Результат перевірки файлових операцій (§4 крок 5) */
interface FileOpsCheckResult {
  read_ok: boolean;
  write_ok: boolean;
  delete_ok: boolean;
  error?: string;
}

/** Результат виконання L1 ініціалізації */
interface ProjectInitResult {
  success: boolean;
  directories_created: string[];
  directories_skipped: string[];
  state_json_created: boolean;
  state_json_already_existed: boolean;
  cycle_counter_created: boolean;
  cycle_counter_already_existed: boolean;
  file_ops_check: FileOpsCheckResult;
  message: string;
  error?: string;
}

/** Вхідні дані для execute() */
interface ProjectInitInput {
  /** Чи існує .clinerules */
  clinerules_exists: boolean;
  /** Чи .clinerules не порожній */
  clinerules_not_empty: boolean;
  /** Чи оркестратор доступний (вбудовано в код) */
  orchestrator_available: boolean;
  /** Чи terminal доступний */
  terminal_available: boolean;
  /** Чи state.json вже існує */
  state_json_exists: boolean;
  /** Чи cycle_counter.md вже існує */
  cycle_counter_exists: boolean;
  /** Які з директорій вже існують */
  existing_directories: string[];
}

/** Результат валідації (§6 Критерії прийнятності) */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 3 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: ".clinerules",
    description:
      "P1: Файл .clinerules існує і не порожній. Якщо ні — ескалація: «.clinerules не знайдено або порожній». НЕ створювати самостійно.",
  },
  {
    type: "dir_not_empty",
    path: "standards/",
    description:
      "P2: Папка standards/ існує і містить файли. Якщо ні — ескалація: «Стандарти відсутні. Система не готова до запуску.»",
  },
  {
    type: "state_field",
    field: "status",
    expected_value: "in_progress",
    description:
      "P3: Система в статусі in_progress (terminal доступний — підтверджено запуском оркестратора).",
  },
];

// =============================================================================
// 3. ALGORITHM (§4 — 6 кроків)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Перевірити передумови P1–P3: .clinerules існує і не порожній, оркестратор доступний, terminal доступний",
    substeps: [
      "P1: Зчитати .clinerules, перевірити існування і непорожність",
      "P2: Оркестратор вбудований — перевірка не потрібна",
      "P3: Виконати echo test для перевірки terminal",
    ],
  },
  {
    order: 2,
    instruction:
      "Створити структуру control_center/ — перелік папок. Якщо папка вже існує — пропустити без помилки. НЕ видаляти існуючий вміст. НЕ створювати .gitkeep файли.",
    substeps: [
      "plans/active/, plans/done/",
      "tasks/active/, tasks/done/",
      "issues/active/, issues/done/",
      "audit/gate_decisions/, audit/hansei/, audit/goals_check/",
      "audit/observe/, audit/plan_completion/, audit/ui_reviews/",
      "audit/acceptance_reports/, audit/validation_conclusions/",
      "project_description/, final_view/, system_state/",
    ],
  },
  {
    order: 3,
    instruction:
      'Ініціалізувати state.json у control_center/system_state/state.json. Якщо вже існує — НЕ перезаписувати, ескалація: "state.json вже існує"',
    substeps: [
      'current_block: "discovery", current_step: "L1", iteration: 0',
      "validation_attempts: 0, status: in_progress",
      "last_completed_step: null, last_artifact: null",
    ],
  },
  {
    order: 4,
    instruction:
      'Ініціалізувати cycle_counter.md у control_center/system_state/cycle_counter.md з вмістом "0". Якщо файл вже існує — НЕ перезаписувати.',
  },
  {
    order: 5,
    instruction:
      "Перевірити доступність файлових операцій: read .clinerules, write тестовий файл _init_test.md, delete тестовий файл",
    substeps: [
      "Прочитати .clinerules (read)",
      "Створити control_center/system_state/_init_test.md (write)",
      "Видалити тестовий файл (delete)",
      "Якщо будь-яка операція не вдалась — записати в лог та ескалювати",
    ],
  },
  {
    order: 6,
    instruction:
      'Оновити state.json: current_step = "L1", status = "in_progress", last_completed_step = "L1", оновити last_updated',
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 5 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО створювати .clinerules — тільки перевіряти існування.",
  "ЗАБОРОНЕНО перезаписувати існуючий state.json або cycle_counter.md.",
  "ЗАБОРОНЕНО додавати папки або файли поза визначеною структурою.",
  "ЗАБОРОНЕНО виконувати будь-які кроки циклу (L2+) на цьому етапі — тільки ініціалізація.",
  "ЗАБОРОНЕНО модифікувати існуючий вміст control_center/ якщо він уже існує.",
];

// =============================================================================
// 5. Визначення структури директорій (§4 крок 2)
// =============================================================================

/** Повний перелік директорій для ініціалізації control_center/ */
const REQUIRED_DIRECTORIES: DirectoryEntry[] = [
  { path: "control_center/plans/active" },
  { path: "control_center/plans/done" },
  { path: "control_center/tasks/active" },
  { path: "control_center/tasks/done" },
  { path: "control_center/issues/active" },
  { path: "control_center/issues/done" },
  { path: "control_center/audit/gate_decisions" },
  { path: "control_center/audit/hansei" },
  { path: "control_center/audit/goals_check" },
  { path: "control_center/audit/observe" },
  { path: "control_center/audit/plan_completion" },
  { path: "control_center/audit/ui_reviews" },
  { path: "control_center/audit/acceptance_reports" },
  { path: "control_center/audit/validation_conclusions" },
  { path: "control_center/project_description" },
  { path: "control_center/final_view" },
  { path: "control_center/system_state" },
];

// =============================================================================
// 6. Початковий state.json (§4 крок 3)
// =============================================================================

/** Створити початковий state.json згідно специфікації */
function buildInitialStateJson(dateStr: string): InitialStateJson {
  return {
    current_block: "discovery",
    current_step: "L1",
    iteration: 0,
    validation_attempts: 0,
    last_updated: dateStr,
    status: "in_progress",
    last_completed_step: null,
    last_artifact: null,
  };
}

// =============================================================================
// 7. Головний алгоритм — execute()
// =============================================================================

/**
 * Виконує ініціалізацію проєкту (L1).
 * Послідовність: preconditions → create dirs → init state.json →
 * init cycle_counter.md → file ops check → update state.
 */
function execute(input: ProjectInitInput): ProjectInitResult {
  // --- Крок 1: Перевірка передумов ---
  if (!input.clinerules_exists || !input.clinerules_not_empty) {
    return {
      success: false,
      directories_created: [],
      directories_skipped: [],
      state_json_created: false,
      state_json_already_existed: false,
      cycle_counter_created: false,
      cycle_counter_already_existed: false,
      file_ops_check: { read_ok: false, write_ok: false, delete_ok: false },
      message: "P1 порушено: .clinerules не знайдено або порожній.",
      error: "ESCALATION: .clinerules не знайдено або порожній. НЕ створювати самостійно.",
    };
  }

  // P2: Оркестратор вбудований — перевірка автоматично пройдена

  if (!input.terminal_available) {
    return {
      success: false,
      directories_created: [],
      directories_skipped: [],
      state_json_created: false,
      state_json_already_existed: false,
      cycle_counter_created: false,
      cycle_counter_already_existed: false,
      file_ops_check: { read_ok: false, write_ok: false, delete_ok: false },
      message: "P3 порушено: Terminal недоступний.",
      error: "ESCALATION: Terminal недоступний для виконання команд.",
    };
  }

  // --- Крок 2: Створення структури директорій ---
  const existingSet = new Set(input.existing_directories);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const dir of REQUIRED_DIRECTORIES) {
    if (existingSet.has(dir.path)) {
      skipped.push(dir.path);
    } else {
      created.push(dir.path);
    }
  }

  // --- Крок 3: Ініціалізація state.json ---
  let stateCreated = false;
  let stateAlreadyExisted = false;

  if (input.state_json_exists) {
    // §4 крок 3: Якщо state.json вже існує — НЕ перезаписувати. Ескалація.
    stateAlreadyExisted = true;
  } else {
    stateCreated = true;
  }

  // --- Крок 4: Ініціалізація cycle_counter.md ---
  let counterCreated = false;
  let counterAlreadyExisted = false;

  if (input.cycle_counter_exists) {
    // §4 крок 4: Якщо файл вже існує — НЕ перезаписувати
    counterAlreadyExisted = true;
  } else {
    counterCreated = true;
  }

  // --- Крок 5: Перевірка файлових операцій ---
  // У реальному runtime тут будуть фактичні файлові операції.
  // Ця функція моделює перевірку: якщо preconditions пройшли і terminal доступний,
  // вважаємо read/write/delete доступними.
  const fileOps: FileOpsCheckResult = {
    read_ok: input.clinerules_exists,
    write_ok: input.terminal_available,
    delete_ok: input.terminal_available,
  };

  if (!fileOps.read_ok || !fileOps.write_ok || !fileOps.delete_ok) {
    return {
      success: false,
      directories_created: created,
      directories_skipped: skipped,
      state_json_created: stateCreated,
      state_json_already_existed: stateAlreadyExisted,
      cycle_counter_created: counterCreated,
      cycle_counter_already_existed: counterAlreadyExisted,
      file_ops_check: fileOps,
      message: "Файлові операції недоступні.",
      error: "ESCALATION: read/write/delete перевірка не пройшла.",
    };
  }

  // Ескалація якщо state.json вже існує (після всіх перевірок)
  if (stateAlreadyExisted) {
    return {
      success: false,
      directories_created: created,
      directories_skipped: skipped,
      state_json_created: false,
      state_json_already_existed: true,
      cycle_counter_created: counterCreated,
      cycle_counter_already_existed: counterAlreadyExisted,
      file_ops_check: fileOps,
      message: "state.json вже існує. Можливо, проєкт ініціалізовано раніше.",
      error: "ESCALATION: state.json вже існує. Можливо, проєкт ініціалізовано раніше.",
    };
  }

  // --- Крок 6: Оновити state.json ---
  // На цьому етапі state.json створено та оновлено відповідно до §4 крок 6

  return {
    success: true,
    directories_created: created,
    directories_skipped: skipped,
    state_json_created: true,
    state_json_already_existed: false,
    cycle_counter_created: counterCreated,
    cycle_counter_already_existed: counterAlreadyExisted,
    file_ops_check: fileOps,
    message: `Ініціалізацію завершено. Створено ${created.length} директорій, пропущено ${skipped.length}.`,
  };
}

// =============================================================================
// 8. Валідація результату (§6 Критерії прийнятності C1–C6)
// =============================================================================

function validateResult(result: ProjectInitResult): ValidationOutcome {
  const issues: string[] = [];

  // C1: Всі папки control_center/ створені
  const totalDirs = result.directories_created.length + result.directories_skipped.length;
  if (totalDirs < REQUIRED_DIRECTORIES.length) {
    issues.push(
      `C1 FAIL: Створено/пропущено ${totalDirs} з ${REQUIRED_DIRECTORIES.length} директорій`
    );
  }

  // C2: state.json існує з валідним JSON
  if (!result.state_json_created && !result.state_json_already_existed) {
    issues.push("C2 FAIL: state.json не створено");
  }

  // C3: cycle_counter.md існує
  if (!result.cycle_counter_created && !result.cycle_counter_already_existed) {
    issues.push("C3 FAIL: cycle_counter.md не створено");
  }

  // C4: .clinerules перевірено (якщо execute пройшов — вже перевірено)
  if (!result.success && result.error?.includes("clinerules")) {
    issues.push("C4 FAIL: .clinerules не перевірено або відсутній");
  }

  // C5: File operations працюють
  if (
    !result.file_ops_check.read_ok ||
    !result.file_ops_check.write_ok ||
    !result.file_ops_check.delete_ok
  ) {
    issues.push("C5 FAIL: Файлові операції (read/write/delete) не працюють");
  }

  // C6: state.json позначено як L1 completed
  // Перевіряється зовнішнім оркестратором після виконання
  if (!result.success) {
    issues.push("C6 FAIL: Ініціалізація не завершена успішно — state.json не оновлено");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 9. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L1: StepDefinition = {
  id: "L1",
  block: "discovery",
  name: "PROJECT INIT — Ініціалізація проєкту",
  type: "autonomous",
  role: "researcher",
  purpose:
    "Автоматична ініціалізація робочого простору проєкту: створення структури папок control_center/, ініціалізація state.json та cycle_counter.md, перевірка доступності інструментів.",
  standards: [],
  preconditions: PRECONDITIONS,
  inputs: [
    {
      source: "file",
      path: ".clinerules",
      description: "Конфігурація правил агента — перевірити існування",
      required: true,
    },
  ],
  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,
  artifact: {
    registry_key: null,
    path_pattern: "control_center/system_state/state.json",
  },
  additional_artifacts: [
    {
      registry_key: null,
      path_pattern: "control_center/system_state/cycle_counter.md",
    },
  ],
  transitions: [
    {
      condition: "Ініціалізація успішна",
      target: "L2",
    },
  ],
  isolation_required: false,
};

// =============================================================================
// 10. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Валідація
  validateResult,
  // Фабрика початкового стану
  buildInitialStateJson,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  REQUIRED_DIRECTORIES,
};

export type {
  ProjectInitInput,
  ProjectInitResult,
  InitialStateJson,
  FileOpsCheckResult,
  DirectoryEntry,
  ValidationOutcome,
};
