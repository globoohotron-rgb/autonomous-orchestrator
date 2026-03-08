// =============================================================================
// Task Execution — послідовне виконання задач з активного плану
// Конвертовано з: control_center/standards/tasks/std-task-execution.md
// Інструмент: використовується кроками L10 (Foundation), D5 (Development Cycle)
// =============================================================================

import type {
  SystemState,
  Step,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для task execution)
// =============================================================================

/** Режим виконання: L10 (Foundation) або D5 (Development) */
type ExecutionMode = "foundation" | "development";

/** Обов'язкові секції файлу задачі (P2) */
type RequiredTaskSection =
  | "name"
  | "description"
  | "goal"
  | "steps"
  | "acceptance_criteria"
  | "definition_of_done";

const REQUIRED_TASK_SECTIONS: RequiredTaskSection[] = [
  "name",
  "description",
  "goal",
  "steps",
  "acceptance_criteria",
  "definition_of_done",
];

/** Вхідні дані для отримання задачі (§4.1) */
interface TaskAcquisitionInput {
  /** Список файлів у tasks/active/ */
  active_task_files: string[];
  /** Вміст файлу задачі (якщо вже зчитано) */
  task_content?: string;
}

/** Розпарсена задача (§4.1.3) */
interface ParsedTask {
  name: string;
  description: string;
  goal: string;
  expected_result: string;
  steps: TaskStep[];
  acceptance_criteria: string[];
  definition_of_done: string[];
  files_to_create: string[];
  files_to_update: string[];
  dependencies: string[];
  factory_test: string;
}

/** Крок задачі */
interface TaskStep {
  order: number;
  instruction: string;
  completed: boolean;
}

/** Результат отримання задачі */
interface TaskAcquisitionResult {
  success: boolean;
  task: ParsedTask | null;
  task_path: string;
  message: string;
  error?: string;
}

/** Вхідні дані для перевірки передумов задачі (§4.2) */
interface TaskPreconditionInput {
  state: SystemState;
  /** Чи є задачі в tasks/active/ */
  has_active_tasks: boolean;
  /** Розпарсена задача */
  task: ParsedTask;
  /** Задачі-залежності: ключ = ім'я залежності, значення = чи виконана */
  dependencies_met: Record<string, boolean>;
  /** Файли у issues/active/ */
  active_issues: string[];
  /** Для Infrastructure Gate: чи всі задачі Етапу A в tasks/done/ */
  infra_stage_complete?: boolean;
  /** Чи задача належить до етапу після А (використовується з infra_stage_complete) */
  is_post_infra_stage?: boolean;
}

/** Результат перевірки передумов */
interface TaskPreconditionResult {
  all_passed: boolean;
  /** Деталі по кожній перевірці */
  checks: PreconditionCheckResult[];
  /** Причина блокування (якщо є) */
  block_reason?: string;
}

/** Результат однієї перевірки */
interface PreconditionCheckResult {
  id: string;
  description: string;
  passed: boolean;
  reason?: string;
}

/** Результат виконання кроку задачі (§4.3) */
interface TaskStepResult {
  step_order: number;
  instruction: string;
  completed: boolean;
  /** Файли створені/оновлені */
  files_changed: string[];
  /** Тести пройшли */
  tests_passed: boolean;
  /** JIDOKA виявлено */
  jidoka_triggered: boolean;
  /** Якщо JIDOKA — який критерій */
  jidoka_criterion?: string;
  message: string;
}

/** Вхідні дані для виконання кроку задачі */
interface TaskStepInput {
  state: SystemState;
  task: ParsedTask;
  step_order: number;
}

/** Contract Check результат (§4.4 крок 2a) */
interface ContractCheckResult {
  /** Чи є задача UI↔API */
  applicable: boolean;
  /** Endpoint path збігається */
  endpoint_match: boolean;
  /** HTTP method збігається */
  method_match: boolean;
  /** Всі поля body/params мають handler */
  fields_match: boolean;
  /** Клієнт дійсно викликає HTTP */
  client_calls_http: boolean;
  /** Цитати з файлів */
  client_evidence: string;
  server_evidence: string;
  /** Загальний результат */
  result: "MATCH" | "MISMATCH" | "NOT_APPLICABLE";
  detail?: string;
}

/** Вхідні дані для Contract Check */
interface ContractCheckInput {
  /** Чи задача має UI↔API взаємодію */
  has_ui_api_interaction: boolean;
  /** Шлях до client component */
  client_path?: string;
  /** Рядок запиту з клієнта */
  client_request_line?: string;
  /** Шлях до server route */
  server_path?: string;
  /** Рядок handler з сервера */
  server_handler_line?: string;
  /** Endpoint path клієнта */
  client_endpoint?: string;
  /** Endpoint path сервера */
  server_endpoint?: string;
  /** HTTP method клієнта */
  client_method?: string;
  /** HTTP method сервера */
  server_method?: string;
  /** Поля body клієнта */
  client_fields?: string[];
  /** Поля handler на сервері */
  server_fields?: string[];
  /** Чи клієнт дійсно робить HTTP виклик */
  client_actually_calls_http?: boolean;
}

/** Factory Test результат (§4.4) */
interface FactoryTestResult {
  success: boolean;
  /** Contract Check (§4.4 крок 2a) */
  contract_check: ContractCheckResult;
  /** Runtime Smoke Test — базовий (§4.4 крок 3) */
  smoke_test_passed: boolean;
  /** Smoke test вивід (обов'язково — текстовий опис без виводу не є доказом) */
  smoke_test_output: string;
  /** Infrastructure Gate результати (§4.4 крок 6) — якщо задача завершує Етап A */
  infra_gate?: InfraGateResult;
  message: string;
}

/** Infrastructure Gate результат (§4.4 крок 6: I1–I5) */
interface InfraGateResult {
  /** I1: Запустити додаток → без помилок */
  i1_app_starts: boolean;
  /** I2: Підключитися до БД → SELECT 1 повертає результат */
  i2_db_connection: boolean;
  /** I3: Перевірити міграції → таблиці існують */
  i3_migrations_applied: boolean;
  /** I4: Перевірити .env → змінні присутні */
  i4_env_vars: boolean;
  /** I5: curl до базового endpoint → НЕ 500 */
  i5_base_endpoint: boolean;
  /** Загальний результат */
  all_passed: boolean;
}

/** Вхідні дані для Factory Test */
interface FactoryTestInput {
  task: ParsedTask;
  /** Contract Check вхід */
  contract_check: ContractCheckInput;
  /** Smoke test output */
  smoke_test_output: string;
  smoke_test_passed: boolean;
  /** Чи задача завершує Infrastructure Stage (Етап A) */
  completes_infra_stage: boolean;
  /** Infrastructure Gate — якщо потрібен */
  infra_gate?: InfraGateResult;
}

/** Фінальна перевірка відповідності (§4.5) */
interface FinalComplianceResult {
  /** Опис задачі відповідає */
  description_matched: boolean;
  /** Ціль задачі досягнута */
  goal_matched: boolean;
  /** Очікуваний результат досягнуто */
  expected_result_matched: boolean;
  /** Acceptance criteria виконані */
  acceptance_criteria_met: boolean;
  /** Definition of done виконано */
  definition_of_done_met: boolean;
  /** Все відповідає */
  all_matched: boolean;
  /** Деталі невідповідностей */
  mismatches: string[];
}

/** Звіт виконання задачі (§4.6 + шаблон секції A) */
interface ExecutionReport {
  date: string;
  cycle_step: "L10" | "D5";
  actions_done: string[];
  files_created: string[];
  files_updated: string[];
  factory_test_results: FactoryTestResult;
  acceptance_criteria: Array<{ criterion: string; met: boolean }>;
  definition_of_done: Array<{ item: string; met: boolean }>;
  issues_found: string[];
}

/** Головний вхід для execute() */
interface TaskExecutionInput {
  state: SystemState;
  /** Фаза виконання */
  phase:
    | "acquire_task"
    | "check_preconditions"
    | "execute_step"
    | "factory_test"
    | "contract_check"
    | "final_compliance"
    | "generate_report"
    | "check_issues"
    | "next_task";
  /** Дані для acquire_task */
  acquire_task?: TaskAcquisitionInput;
  /** Дані для check_preconditions */
  check_preconditions?: TaskPreconditionInput;
  /** Дані для execute_step */
  execute_step?: TaskStepInput;
  /** Дані для factory_test */
  factory_test?: FactoryTestInput;
  /** Дані для contract_check */
  contract_check?: ContractCheckInput;
  /** Дані для final_compliance */
  final_compliance?: FinalComplianceInput;
  /** Дані для generate_report */
  generate_report?: ExecutionReportInput;
  /** Дані для check_issues */
  check_issues?: CheckIssuesInput;
}

/** Вхід для фінальної перевірки */
interface FinalComplianceInput {
  task: ParsedTask;
  /** Чи досягнуто ціль */
  goal_achieved: boolean;
  /** Чи відповідає очікуваному результату */
  expected_result_achieved: boolean;
  /** Статус кожного acceptance criterion */
  acceptance_statuses: boolean[];
  /** Статус кожного DoD пункту */
  dod_statuses: boolean[];
}

/** Вхід для генерації звіту */
interface ExecutionReportInput {
  task: ParsedTask;
  task_path: string;
  plan_name: string;
  date: string;
  cycle_step: "L10" | "D5";
  actions_done: string[];
  files_created: string[];
  files_updated: string[];
  factory_test_results: FactoryTestResult;
  acceptance_statuses: boolean[];
  dod_statuses: boolean[];
  issues_found: string[];
}

/** Вхід для перевірки issues після задачі (§4.7) */
interface CheckIssuesInput {
  /** Файли в issues/active/ */
  active_issues: string[];
}

/** Результат однієї фази */
type TaskExecutionResult =
  | TaskAcquisitionResult
  | TaskPreconditionResult
  | TaskStepResult
  | FactoryTestResult
  | ContractCheckResult
  | FinalComplianceResult
  | ExecutionReportResult
  | CheckIssuesResult
  | NextTaskResult;

/** Результат генерації звіту */
interface ExecutionReportResult {
  success: boolean;
  /** Звіт markdown */
  report_content: string;
  /** Шлях задачі в tasks/done/ */
  done_path: string;
  message: string;
}

/** Результат перевірки issues після задачі (§4.7) */
interface CheckIssuesResult {
  has_issues: boolean;
  issue_count: number;
  action: "proceed" | "fix_issues";
  issues_to_fix: string[];
  message: string;
}

/** Результат перевірки наступної задачі (§4.8) */
interface NextTaskResult {
  has_next: boolean;
  message: string;
}

/** Валідація результату */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 6 передумов)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  // P1: tasks/active/ містить хоча б одну задачу
  {
    type: "dir_not_empty",
    path: "control_center/tasks/active",
    description:
      "P1: tasks/active/ містить хоча б одну задачу.",
  },
  // P2: Файл задачі містить обов'язкові секції
  {
    type: "file_exists",
    description:
      "P2: Файл задачі містить обов'язкові секції: назва, опис, ціль, кроки, acceptance criteria, definition of done.",
  },
  // P3: Залежності задачі виконані
  {
    type: "file_exists",
    description:
      "P3: Розділ «Залежності» задачі — всі залежності виконані (файли існують, попередні задачі завершені).",
  },
  // P4: Немає незакритих issues
  {
    type: "dir_empty",
    path: "control_center/issues/active",
    description:
      "P4: issues/active/ не містить незакритих issues (якщо містить — виконати їх спочатку).",
  },
  // P5: state.json status не blocked/awaiting_human_decision
  {
    type: "state_field",
    field: "status",
    expected_value: "in_progress",
    description:
      "P5: state.json → status не дорівнює 'blocked' або 'awaiting_human_decision'.",
  },
  // P6: Infrastructure Gate
  {
    type: "state_field",
    description:
      "P6: Infrastructure Gate — якщо в плані є Етап A і його задачі ще НЕ в tasks/done/, задачі наступних етапів БЛОКОВАНІ.",
  },
];

// =============================================================================
// 3. Algorithm Steps (§4)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  // §4.1 Отримання задачі
  {
    order: 1,
    instruction:
      "Зчитати наступну задачу з tasks/active/. Прочитати файл повністю. Витягнути: назву, опис, ціль, очікуваний результат, кроки виконання, acceptance criteria, definition of done, файли для створення/оновлення, залежності, factory test.",
    substeps: [
      "Зчитати файл задачі ПОВНІСТЮ",
      "Витягнути всі обов'язкові секції",
      "Якщо будь-який крок неясний або суперечливий — ЗУПИНИТИ виконання, повідомити",
    ],
  },
  // §4.2 Перевірка передумов
  {
    order: 2,
    instruction:
      "Виконати всі перевірки POKA-YOKE (P1–P6). Перевірити розділ «Залежності» задачі. Якщо залежності не виконані — ЗУПИНИТИ.",
  },
  // §4.3 Виконання кроків задачі (послідовно, без пропусків)
  {
    order: 3,
    instruction:
      "Для КОЖНОГО кроку задачі послідовно: (a) виконати одну дію, (b) перевірити результат + тести, (c) JIDOKA перевірка на J1-J5, (d) не переходити далі поки поточний крок не завершено.",
    substeps: [
      "a) Виконати рівно одну дію, описану в кроці. Перед зміною файлу — зчитати повністю, зберегти стиль.",
      "b) Переконатися що зміна не порушує систему. Запустити тести. Якщо тести не проходять — виправити КОД, не тести.",
      "c) JIDOKA: якщо критичний дефект (J1–J5) → зупинити, створити issue, status → blocked. НЕ продовжувати.",
      "d) Не переходити до наступного кроку поки поточний не завершено і перевірено.",
    ],
  },
  // §4.4 Factory Test
  {
    order: 4,
    instruction:
      "Виконати Factory Test: (1) тест за описом у задачі, (2a) Contract Check для UI↔API задач, (3) Runtime Smoke Test — ОБОВ'ЯЗКОВИЙ для КОЖНОЇ задачі, (4-5) виправити якщо тест FAIL, вставити вивід команди як доказ, (6) Infrastructure Gate якщо завершує Етап A.",
    substeps: [
      "1. Виконати тест фабрики згідно з описом у задачі",
      "2a. Contract Check: відкрити обидва файли (client + server), порівняти endpoint path, HTTP method, поля body/params, перевірити що client дійсно викликає HTTP",
      "2b. Architecture Guard (ОБОВ'ЯЗКОВО): перевірити що код задачі не порушує архітектурну цілісність. (1) Circular imports: жоден новий/змінений файл не створює циклічну залежність (A→B→A). (2) File size: жоден файл >400 рядків (якщо >400 — розбити на модулі). (3) Module boundary: імпорти з інших модулів тільки через barrel export (index.ts), прямі імпорти internal файлів = FAIL. (4) Pattern consistency: якщо модуль A використовує певний патерн (naming, export style) — новий код дотримується того ж патерну. Порушення = виправити ДО переходу до Runtime Smoke Test.",
      "3. Runtime Smoke Test: curl до endpoint, HTTP-код не 500. Мокані тести НЕ є заміною. Escape clause ЗАБОРОНЕНО.",
      "4. Якщо FAIL — виправити код, повторити тест",
      "5. Зафіксувати результати — ОБОВ'ЯЗКОВО вставити ФАКТИЧНИЙ вивід термінальної команди (stdout/stderr). Текстовий опис 'тест пройшов' БЕЗ виводу = НЕ є доказом. Мінімум: команда + її вивід.",
      "6. Infrastructure Gate (I1–I5) якщо задача завершує Етап A",
    ],
    contract_check:
      "Client endpoint path = Server registered route; Client HTTP method = Server handler method; Client body fields = Server handler fields; Client actually calls HTTP",
  },
  // §4.5 Фінальна перевірка відповідності
  {
    order: 5,
    instruction:
      "Звірити результат із: описом задачі, ціллю, очікуваним результатом, acceptance criteria, definition of done. Якщо щось не відповідає — повернутися і виправити ДО формування звіту.",
  },
  // §4.6 Формування звіту + CHECKPOINT
  {
    order: 6,
    instruction:
      "Оновити файл задачі, додавши звіт виконання (за шаблоном секції A). Перемістити задачу: tasks/active/ → tasks/done/[Назва плану]/. CHECKPOINT: оновити state.json → tasks_completed += 1, current_task → null. Це дозволяє відновити виконання при crash.",
  },
  // §4.7 Перевірка issues
  {
    order: 7,
    instruction:
      "Перевірити issues/active/. Якщо є файли — виконати їх негайно (усунути дефект), потім повернутися до наступної задачі.",
  },
  // §4.8 Наступна задача
  {
    order: 8,
    instruction:
      "Повторити з кроку 4.1 для наступної задачі з tasks/active/. Коли tasks/active/ порожній — виконання кроку завершено.",
    substeps: [
      "При початку кожної задачі: state.json → current_task = назва файлу задачі",
      "При відновленні після crash: перевірити state.json → current_task, tasks_completed, tasks_total. Продовжити з поточної задачі.",
      "Порівняти tasks_completed з tasks_total — якщо рівні, перевірити що tasks/active/ порожній",
    ],
  },
];

// =============================================================================
// 4. Constraints (§8 Обмеження — 12 правил)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Змінювати тести (виправляти код, а не тести).",
  "Змінювати стандарти.",
  "Змінювати файли задач (окрім додавання звіту виконання).",
  "Змінювати плани.",
  "Вигадувати нові кроки, не описані в задачі.",
  "Пропускати кроки задачі.",
  "Створювати файли, не вказані в задачі.",
  "Змінювати структуру проєкту без прямої вказівки в задачі.",
  "Виконувати дії поза межами поточної задачі.",
  "Позначати крок виконаним без фактичного результату.",
  "Продовжувати виконання після виявлення критичного дефекту (JIDOKA).",
  "Ігнорувати незакриті issues в issues/active/.",
  "Позначати Factory Test як PASS без фактичного виводу команди (stdout/stderr). Слова 'тест пройдений' або 'все працює' без терміналного виводу = FAIL.",
];

// =============================================================================
// 5. Task Acquisition (§4.1)
// =============================================================================

/**
 * Отримати наступну задачу з tasks/active/.
 * Зчитати файл повністю, витягнути всі обов'язкові поля.
 */
function acquireTask(input: TaskAcquisitionInput): TaskAcquisitionResult {
  const { active_task_files } = input;

  // P1: tasks/active/ має містити задачу
  if (active_task_files.length === 0) {
    return {
      success: false,
      task: null,
      task_path: "",
      message: "tasks/active/ порожньо. Виконання кроку завершено.",
    };
  }

  // Взяти першу задачу (послідовне виконання)
  const taskPath = active_task_files[0];

  // Якщо вміст не надано — повернути шлях для зчитування
  if (!input.task_content) {
    return {
      success: false,
      task: null,
      task_path: taskPath,
      message: `Задачу знайдено: ${taskPath}. Необхідно зчитати файл повністю.`,
      error: "task_content не надано — зчитати файл задачі.",
    };
  }

  // Парсинг задачі — структурний (контент вже прочитаний)
  const task = parseTaskContent(input.task_content);

  if (!task) {
    return {
      success: false,
      task: null,
      task_path: taskPath,
      message: `Не вдалось розпарсити задачу: ${taskPath}`,
      error: "Файл задачі не відповідає очікуваній структурі.",
    };
  }

  return {
    success: true,
    task,
    task_path: taskPath,
    message: `Задача отримана: ${task.name}. Кроків: ${task.steps.length}. AC: ${task.acceptance_criteria.length}. DoD: ${task.definition_of_done.length}.`,
  };
}

/**
 * Парсинг вмісту файлу задачі.
 * Витягує обов'язкові секції: назва, опис, ціль, кроки, AC, DoD тощо.
 */
function parseTaskContent(content: string): ParsedTask | null {
  if (!content || content.trim().length === 0) {
    return null;
  }

  // Базовий парсинг — витягти заголовок як назву
  const nameMatch = content.match(/^#\s+(.+)/m);
  const name = nameMatch ? nameMatch[1].trim() : "";

  if (!name) {
    return null;
  }

  // Витягти секції (шукаємо ## заголовки)
  const sections = extractSections(content);

  const description = sections["опис"] || sections["description"] || "";
  const goal = sections["ціль"] || sections["goal"] || "";
  const expectedResult = sections["очікуваний результат"] || sections["expected result"] || "";
  const factoryTest = sections["factory test"] || sections["тест фабрики"] || "";

  // Кроки виконання
  const stepsSection = sections["кроки виконання"] || sections["кроки"] || sections["steps"] || "";
  const steps = parseSteps(stepsSection);

  // Acceptance Criteria
  const acSection = sections["acceptance criteria"] || sections["критерії прийнятності"] || "";
  const acceptanceCriteria = parseChecklistItems(acSection);

  // Definition of Done
  const dodSection = sections["definition of done"] || "";
  const definitionOfDone = parseChecklistItems(dodSection);

  // Файли
  const filesToCreate = extractFilesList(sections["файли для створення"] || sections["створити файли"] || "");
  const filesToUpdate = extractFilesList(sections["файли для оновлення"] || sections["оновити файли"] || "");

  // Залежності
  const depsSection = sections["залежності"] || sections["dependencies"] || "";
  const dependencies = parseChecklistItems(depsSection);

  return {
    name,
    description,
    goal,
    expected_result: expectedResult,
    steps,
    acceptance_criteria: acceptanceCriteria,
    definition_of_done: definitionOfDone,
    files_to_create: filesToCreate,
    files_to_update: filesToUpdate,
    dependencies,
    factory_test: factoryTest,
  };
}

/** Витягнути секції з Markdown — повертає map заголовок→контент */
function extractSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split("\n");
  let currentHeader = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headerMatch) {
      if (currentHeader) {
        sections[currentHeader.toLowerCase()] = currentContent.join("\n").trim();
      }
      currentHeader = headerMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentHeader) {
    sections[currentHeader.toLowerCase()] = currentContent.join("\n").trim();
  }

  return sections;
}

/** Парсити нумеровані кроки з секції */
function parseSteps(stepsText: string): TaskStep[] {
  if (!stepsText) return [];

  const steps: TaskStep[] = [];
  const lines = stepsText.split("\n");
  let order = 0;

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) {
      order++;
      steps.push({
        order,
        instruction: match[1].trim(),
        completed: false,
      });
    }
  }

  return steps;
}

/** Парсити чекліст або список пунктів */
function parseChecklistItems(text: string): string[] {
  if (!text) return [];

  const items: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Підтримка: - [ ] item, - item, * item, 1. item
    const match = line.match(/^[\s]*[-*]\s*(?:\[.\])?\s*(.+)/);
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (match) {
      items.push(match[1].trim());
    } else if (numMatch) {
      items.push(numMatch[1].trim());
    }
  }

  return items;
}

/** Витягнути список файлів */
function extractFilesList(text: string): string[] {
  if (!text) return [];

  const files: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/[-*]\s*`?([^\s`]+)`?/);
    if (match) {
      files.push(match[1].trim());
    }
  }

  return files;
}

// =============================================================================
// 6. Precondition Check (§4.2 + §3)
// =============================================================================

/**
 * Перевірити всі передумови перед виконанням задачі.
 * Якщо будь-яка не виконана — зупинити, зафіксувати причину.
 */
function checkPreconditions(input: TaskPreconditionInput): TaskPreconditionResult {
  const checks: PreconditionCheckResult[] = [];

  // P1: tasks/active/ має задачі
  checks.push({
    id: "P1",
    description: "tasks/active/ містить хоча б одну задачу",
    passed: input.has_active_tasks,
    reason: input.has_active_tasks ? undefined : "tasks/active/ порожньо",
  });

  // P2: Файл задачі має обов'язкові секції
  const hasRequiredSections = input.task.name !== "" &&
    input.task.description !== "" &&
    input.task.goal !== "" &&
    input.task.steps.length > 0 &&
    input.task.acceptance_criteria.length > 0 &&
    input.task.definition_of_done.length > 0;

  checks.push({
    id: "P2",
    description: "Файл задачі містить обов'язкові секції",
    passed: hasRequiredSections,
    reason: hasRequiredSections ? undefined : "Відсутні обов'язкові секції у файлі задачі",
  });

  // P3: Залежності виконані
  const allDepsMet = Object.values(input.dependencies_met).every((v) => v);
  const failedDeps = Object.entries(input.dependencies_met)
    .filter(([, met]) => !met)
    .map(([name]) => name);

  checks.push({
    id: "P3",
    description: "Всі залежності задачі виконані",
    passed: allDepsMet,
    reason: allDepsMet ? undefined : `Невиконані залежності: ${failedDeps.join(", ")}`,
  });

  // P4: Немає незакритих issues
  const noIssues = input.active_issues.length === 0;
  checks.push({
    id: "P4",
    description: "issues/active/ не містить незакритих issues",
    passed: noIssues,
    reason: noIssues
      ? undefined
      : `Знайдено ${input.active_issues.length} незакритих issues. Виконати їх спочатку.`,
  });

  // P5: status = in_progress
  const statusOk =
    input.state.status !== "blocked" &&
    input.state.status !== "awaiting_human_decision";
  checks.push({
    id: "P5",
    description: "state.json status не blocked/awaiting_human_decision",
    passed: statusOk,
    reason: statusOk ? undefined : `status = '${input.state.status}'`,
  });

  // P6: Infrastructure Gate
  let infraOk = true;
  if (input.is_post_infra_stage && input.infra_stage_complete === false) {
    infraOk = false;
  }
  checks.push({
    id: "P6",
    description: "Infrastructure Gate — задачі Етапу A завершені перед переходом до Етапу B+",
    passed: infraOk,
    reason: infraOk
      ? undefined
      : "Задачі Етапу A (Infrastructure) не завершені. Перехід до наступних етапів БЛОКОВАНО.",
  });

  const allPassed = checks.every((c) => c.passed);
  const firstFailed = checks.find((c) => !c.passed);

  return {
    all_passed: allPassed,
    checks,
    block_reason: firstFailed ? `${firstFailed.id}: ${firstFailed.reason}` : undefined,
  };
}

// =============================================================================
// 7. Task Step Execution (§4.3)
// =============================================================================

/**
 * Виконати один крок задачі.
 * Повертає результат: completed, files_changed, tests, JIDOKA.
 */
function executeTaskStep(input: TaskStepInput): TaskStepResult {
  const { task, step_order } = input;

  // Знайти крок
  const step = task.steps.find((s) => s.order === step_order);

  if (!step) {
    return {
      step_order,
      instruction: "",
      completed: false,
      files_changed: [],
      tests_passed: false,
      jidoka_triggered: false,
      message: `Крок ${step_order} не знайдено в задачі.`,
    };
  }

  // Крок виконується агентом — тут повертаємо структуру для оркестратора
  return {
    step_order,
    instruction: step.instruction,
    completed: false, // Оркестратор оновить після фактичного виконання
    files_changed: [],
    tests_passed: false,
    jidoka_triggered: false,
    message: `Крок ${step_order}: ${step.instruction}. Очікує виконання агентом.`,
  };
}

// =============================================================================
// 8. Contract Check (§4.4 крок 2a)
// =============================================================================

/**
 * Contract Check: порівняти UI↔API контракт.
 * Обов'язковий для задач з UI↔API взаємодією.
 */
function executeContractCheck(input: ContractCheckInput): ContractCheckResult {
  // Не застосовний — задача не має UI↔API
  if (!input.has_ui_api_interaction) {
    return {
      applicable: false,
      endpoint_match: true,
      method_match: true,
      fields_match: true,
      client_calls_http: true,
      client_evidence: "",
      server_evidence: "",
      result: "NOT_APPLICABLE",
    };
  }

  // Перевірити endpoint path
  const endpointMatch = input.client_endpoint === input.server_endpoint;

  // Перевірити HTTP method
  const methodMatch = input.client_method === input.server_method;

  // Перевірити поля body/params
  const clientFields = input.client_fields || [];
  const serverFields = input.server_fields || [];
  const fieldsMatch = clientFields.every((f) => serverFields.includes(f));

  // Перевірити що клієнт дійсно викликає HTTP
  const clientCallsHttp = input.client_actually_calls_http !== false;

  const allMatch = endpointMatch && methodMatch && fieldsMatch && clientCallsHttp;

  const details: string[] = [];
  if (!endpointMatch) details.push(`Endpoint mismatch: client=${input.client_endpoint} server=${input.server_endpoint}`);
  if (!methodMatch) details.push(`Method mismatch: client=${input.client_method} server=${input.server_method}`);
  if (!fieldsMatch) {
    const missing = clientFields.filter((f) => !serverFields.includes(f));
    details.push(`Fields mismatch: missing on server: ${missing.join(", ")}`);
  }
  if (!clientCallsHttp) details.push("Client does not actually call HTTP");

  return {
    applicable: true,
    endpoint_match: endpointMatch,
    method_match: methodMatch,
    fields_match: fieldsMatch,
    client_calls_http: clientCallsHttp,
    client_evidence: input.client_request_line || "",
    server_evidence: input.server_handler_line || "",
    result: allMatch ? "MATCH" : "MISMATCH",
    detail: details.length > 0 ? details.join("; ") : undefined,
  };
}

// =============================================================================
// 9. Factory Test (§4.4)
// =============================================================================

/**
 * Виконати Factory Test: тест задачі + contract check + smoke test + infra gate.
 */
function executeFactoryTest(input: FactoryTestInput): FactoryTestResult {
  // Contract Check
  const contractResult = executeContractCheck(input.contract_check);

  // Загальний результат
  const contractOk = contractResult.result !== "MISMATCH";
  const smokeOk = input.smoke_test_passed;

  // Infrastructure Gate — якщо потрібен
  let infraGate: InfraGateResult | undefined;
  if (input.completes_infra_stage && input.infra_gate) {
    infraGate = {
      ...input.infra_gate,
      all_passed:
        input.infra_gate.i1_app_starts &&
        input.infra_gate.i2_db_connection &&
        input.infra_gate.i3_migrations_applied &&
        input.infra_gate.i4_env_vars &&
        input.infra_gate.i5_base_endpoint,
    };
  }

  const infraOk = !infraGate || infraGate.all_passed;
  const allPassed = contractOk && smokeOk && infraOk;

  const messages: string[] = [];
  if (!contractOk) messages.push(`Contract Check: MISMATCH — ${contractResult.detail}`);
  if (!smokeOk) messages.push("Runtime Smoke Test: FAIL");
  if (!infraOk) messages.push("Infrastructure Gate: FAIL");

  return {
    success: allPassed,
    contract_check: contractResult,
    smoke_test_passed: smokeOk,
    smoke_test_output: input.smoke_test_output,
    infra_gate: infraGate,
    message: allPassed
      ? "Factory Test: PASS"
      : `Factory Test: FAIL — ${messages.join("; ")}`,
  };
}

// =============================================================================
// 10. Final Compliance Check (§4.5)
// =============================================================================

/**
 * Фінальна перевірка: результат відповідає задачі.
 * Перевіряє опис, ціль, очікуваний результат, AC, DoD.
 */
function checkFinalCompliance(input: FinalComplianceInput): FinalComplianceResult {
  const { task, goal_achieved, expected_result_achieved, acceptance_statuses, dod_statuses } = input;

  const mismatches: string[] = [];

  // Опис — завжди true (перевіряється семантично агентом)
  const descriptionMatched = true;

  // Ціль
  if (!goal_achieved) {
    mismatches.push(`Ціль задачі не досягнута: ${task.goal}`);
  }

  // Очікуваний результат
  if (!expected_result_achieved) {
    mismatches.push(`Очікуваний результат не досягнуто: ${task.expected_result}`);
  }

  // Acceptance Criteria
  const acMet = acceptance_statuses.length > 0 && acceptance_statuses.every((s) => s);
  if (!acMet) {
    const failedIndices = acceptance_statuses
      .map((s, i) => (!s ? i : -1))
      .filter((i) => i >= 0);
    for (const idx of failedIndices) {
      mismatches.push(`Acceptance criterion не виконано: ${task.acceptance_criteria[idx] || `#${idx + 1}`}`);
    }
  }

  // Definition of Done
  const dodMet = dod_statuses.length > 0 && dod_statuses.every((s) => s);
  if (!dodMet) {
    const failedIndices = dod_statuses
      .map((s, i) => (!s ? i : -1))
      .filter((i) => i >= 0);
    for (const idx of failedIndices) {
      mismatches.push(`DoD пункт не виконано: ${task.definition_of_done[idx] || `#${idx + 1}`}`);
    }
  }

  const allMatched = descriptionMatched && goal_achieved && expected_result_achieved && acMet && dodMet;

  return {
    description_matched: descriptionMatched,
    goal_matched: goal_achieved,
    expected_result_matched: expected_result_achieved,
    acceptance_criteria_met: acMet,
    definition_of_done_met: dodMet,
    all_matched: allMatched,
    mismatches,
  };
}

// =============================================================================
// 11. Execution Report (§4.6 + шаблон секції A)
// =============================================================================

/**
 * Генерувати звіт виконання задачі та шлях переміщення.
 */
function generateReport(input: ExecutionReportInput): ExecutionReportResult {
  const {
    task,
    task_path,
    plan_name,
    date,
    cycle_step,
    actions_done,
    files_created,
    files_updated,
    factory_test_results,
    acceptance_statuses,
    dod_statuses,
    issues_found,
  } = input;

  // Побудувати шлях tasks/done/[Plan]/[Task].md
  const taskFilename = task_path.split("/").pop() || task_path;
  const donePath = `control_center/tasks/done/${plan_name}/${taskFilename}`;

  // AC рядки
  const acLines = task.acceptance_criteria.map((criterion, i) => {
    const met = acceptance_statuses[i] ? "виконано" : "НЕ виконано";
    return `- [${acceptance_statuses[i] ? "x" : " "}] ${criterion} — ${met}`;
  });

  // DoD рядки
  const dodLines = task.definition_of_done.map((item, i) => {
    const met = dod_statuses[i] ? "виконано" : "НЕ виконано";
    return `- [${dod_statuses[i] ? "x" : " "}] ${item} — ${met}`;
  });

  // Issues рядки
  const issuesText =
    issues_found.length > 0
      ? issues_found.map((issue) => `- ${issue}`).join("\n")
      : "- Проблем не виявлено";

  const reportContent = `---

## Звіт виконання

- **Дата:** ${date}
- **Крок циклу:** ${cycle_step}

### Що зроблено
${actions_done.map((a) => `- ${a}`).join("\n")}

### Створені файли
${files_created.length > 0 ? files_created.map((f) => `- ${f}`).join("\n") : "- (немає)"}

### Оновлені файли
${files_updated.length > 0 ? files_updated.map((f) => `- ${f}`).join("\n") : "- (немає)"}

### Результати Factory Test
- Тест: Factory Test — ${factory_test_results.success ? "PASS" : "FAIL"}
- Contract Check: ${factory_test_results.contract_check.result}
- Smoke Test: ${factory_test_results.smoke_test_passed ? "PASS" : "FAIL"}
${factory_test_results.smoke_test_output ? `- Вивід: ${factory_test_results.smoke_test_output}` : ""}

### Acceptance Criteria
${acLines.join("\n")}

### Definition of Done
${dodLines.join("\n")}

### Виявлені проблеми
${issuesText}
`;

  return {
    success: true,
    report_content: reportContent,
    done_path: donePath,
    message: `Звіт сформовано. Задача переміщена: ${task_path} → ${donePath}`,
  };
}

// =============================================================================
// 12. Check Issues After Task (§4.7)
// =============================================================================

/**
 * Перевірити issues/active/ після завершення задачі.
 * Якщо є — виконати негайно, потім повернутися до наступної задачі.
 */
function checkIssuesAfterTask(input: CheckIssuesInput): CheckIssuesResult {
  const { active_issues } = input;

  if (active_issues.length === 0) {
    return {
      has_issues: false,
      issue_count: 0,
      action: "proceed",
      issues_to_fix: [],
      message: "issues/active/ порожньо. Переходимо до наступної задачі.",
    };
  }

  return {
    has_issues: true,
    issue_count: active_issues.length,
    action: "fix_issues",
    issues_to_fix: active_issues,
    message: `Знайдено ${active_issues.length} issue(s) в issues/active/. Виконати негайно перед наступною задачею.`,
  };
}

// =============================================================================
// 13. Check Next Task (§4.8)
// =============================================================================

/**
 * Перевірити чи є наступна задача в tasks/active/.
 */
function checkNextTask(activeTaskFiles: string[]): NextTaskResult {
  if (activeTaskFiles.length === 0) {
    return {
      has_next: false,
      message: "tasks/active/ порожньо. Виконання кроку завершено.",
    };
  }

  return {
    has_next: true,
    message: `Залишилось ${activeTaskFiles.length} задач в tasks/active/. Повторити з кроку 4.1.`,
  };
}

// =============================================================================
// 14. Main Execute Function
// =============================================================================

/**
 * Головна точка входу. Делегує на відповідну фазу.
 */
function execute(input: TaskExecutionInput): TaskExecutionResult {
  switch (input.phase) {
    case "acquire_task": {
      if (!input.acquire_task) {
        return {
          success: false,
          task: null,
          task_path: "",
          message: "Помилка: acquire_task input не надано.",
        } as TaskAcquisitionResult;
      }
      return acquireTask(input.acquire_task);
    }

    case "check_preconditions": {
      if (!input.check_preconditions) {
        return {
          all_passed: false,
          checks: [],
          block_reason: "Помилка: check_preconditions input не надано.",
        } as TaskPreconditionResult;
      }
      return checkPreconditions(input.check_preconditions);
    }

    case "execute_step": {
      if (!input.execute_step) {
        return {
          step_order: 0,
          instruction: "",
          completed: false,
          files_changed: [],
          tests_passed: false,
          jidoka_triggered: false,
          message: "Помилка: execute_step input не надано.",
        } as TaskStepResult;
      }
      return executeTaskStep(input.execute_step);
    }

    case "factory_test": {
      if (!input.factory_test) {
        return {
          success: false,
          contract_check: {
            applicable: false,
            endpoint_match: false,
            method_match: false,
            fields_match: false,
            client_calls_http: false,
            client_evidence: "",
            server_evidence: "",
            result: "NOT_APPLICABLE" as const,
          },
          smoke_test_passed: false,
          smoke_test_output: "",
          message: "Помилка: factory_test input не надано.",
        } as FactoryTestResult;
      }
      return executeFactoryTest(input.factory_test);
    }

    case "contract_check": {
      if (!input.contract_check) {
        return {
          applicable: false,
          endpoint_match: false,
          method_match: false,
          fields_match: false,
          client_calls_http: false,
          client_evidence: "",
          server_evidence: "",
          result: "NOT_APPLICABLE" as const,
        } as ContractCheckResult;
      }
      return executeContractCheck(input.contract_check);
    }

    case "final_compliance": {
      if (!input.final_compliance) {
        return {
          description_matched: false,
          goal_matched: false,
          expected_result_matched: false,
          acceptance_criteria_met: false,
          definition_of_done_met: false,
          all_matched: false,
          mismatches: ["Помилка: final_compliance input не надано."],
        } as FinalComplianceResult;
      }
      return checkFinalCompliance(input.final_compliance);
    }

    case "generate_report": {
      if (!input.generate_report) {
        return {
          success: false,
          report_content: "",
          done_path: "",
          message: "Помилка: generate_report input не надано.",
        } as ExecutionReportResult;
      }
      return generateReport(input.generate_report);
    }

    case "check_issues": {
      if (!input.check_issues) {
        return {
          has_issues: false,
          issue_count: 0,
          action: "proceed" as const,
          issues_to_fix: [],
          message: "Помилка: check_issues input не надано.",
        } as CheckIssuesResult;
      }
      return checkIssuesAfterTask(input.check_issues);
    }

    case "next_task": {
      // Без окремого input — перевіряє acquire_task
      return {
        has_next: false,
        message: "Використовуйте phase 'acquire_task' для перевірки наступної задачі.",
      } as NextTaskResult;
    }
  }
}

// =============================================================================
// 15. Validation (§6 Критерії прийнятності — 11 перевірок)
// =============================================================================

/**
 * Валідація результатів виконання задачі.
 * Кожен чекпоінт з §6 → одна перевірка.
 */
function validateResult(
  result: TaskExecutionResult,
  phase: TaskExecutionInput["phase"],
): ValidationOutcome {
  const issues: string[] = [];

  switch (phase) {
    case "acquire_task": {
      const r = result as TaskAcquisitionResult;
      if (!r.success && !r.error) {
        issues.push("Задача не отримана.");
      }
      break;
    }

    case "check_preconditions": {
      const r = result as TaskPreconditionResult;
      // §6: Всі кроки задачі виконані, тести проходять, factory test пройдено...
      if (!r.all_passed) {
        issues.push(`Передумови не виконані: ${r.block_reason}`);
      }
      break;
    }

    case "execute_step": {
      const r = result as TaskStepResult;
      // §6.1: Всі кроки виконані послідовно, жоден не пропущено
      if (r.jidoka_triggered) {
        issues.push(`JIDOKA спрацювала (${r.jidoka_criterion}). Виконання зупинено.`);
      }
      break;
    }

    case "factory_test": {
      const r = result as FactoryTestResult;
      // §6.3: Factory test виконаний успішно
      if (!r.success) {
        issues.push(`Factory Test не пройдений: ${r.message}`);
      }
      // §6.4: Система працює стабільно
      if (!r.smoke_test_passed) {
        issues.push("Runtime Smoke Test: FAIL — система нестабільна.");
      }
      // Contract check
      if (r.contract_check.result === "MISMATCH") {
        issues.push(`Contract Check: MISMATCH — ${r.contract_check.detail}`);
      }
      // Smoke test output обов'язковий
      if (!r.smoke_test_output) {
        issues.push("Smoke test output відсутній. Текстовий опис без реального виводу НЕ є доказом.");
      }
      break;
    }

    case "final_compliance": {
      const r = result as FinalComplianceResult;
      // §6.5: Acceptance criteria виконані
      if (!r.acceptance_criteria_met) {
        issues.push("Не всі acceptance criteria виконані.");
      }
      // §6.6: Definition of done виконано
      if (!r.definition_of_done_met) {
        issues.push("Не всі пункти definition of done виконані.");
      }
      // §6.2: Ціль задачі досягнута
      if (!r.goal_matched) {
        issues.push("Ціль задачі не досягнута.");
      }
      break;
    }

    case "generate_report": {
      const r = result as ExecutionReportResult;
      // §6.7: Звіт виконання додано
      if (!r.success) {
        issues.push("Звіт виконання не сформовано.");
      }
      // §6.8: Задача переміщена
      if (!r.done_path || !r.done_path.includes("tasks/done/")) {
        issues.push("Задача не переміщена до tasks/done/.");
      }
      break;
    }

    case "check_issues": {
      const r = result as CheckIssuesResult;
      // §6.9: Issues створені (якщо виявлені дефекти)
      if (r.has_issues && r.action !== "fix_issues") {
        issues.push("Є issues в active/ але action не 'fix_issues'.");
      }
      break;
    }

    default:
      break;
  }

  return { valid: issues.length === 0, issues };
}

// =============================================================================
// 16. Template — Execution Report (§A)
// =============================================================================

/** Параметри генерації шаблону звіту виконання */
interface ReportTemplateParams {
  date: string;
  cycle_step: "L10" | "D5";
  actions_done: string[];
  files_created: string[];
  files_updated: string[];
  factory_test_name: string;
  factory_test_result: "PASS" | "FAIL";
  factory_test_details: string;
  acceptance_criteria: Array<{ text: string; met: boolean }>;
  definition_of_done: Array<{ text: string; met: boolean }>;
  issues_found: string[];
}

/** Генерує шаблон звіту виконання задачі (§A) */
function generateTemplate(params: ReportTemplateParams): string {
  const acLines = params.acceptance_criteria
    .map((ac) => `- [${ac.met ? "x" : " "}] ${ac.text} — ${ac.met ? "виконано" : "НЕ виконано"}`)
    .join("\n");

  const dodLines = params.definition_of_done
    .map((d) => `- [${d.met ? "x" : " "}] ${d.text} — ${d.met ? "виконано" : "НЕ виконано"}`)
    .join("\n");

  const issuesText =
    params.issues_found.length > 0
      ? params.issues_found.map((i) => `- ${i}`).join("\n")
      : "- Проблем не виявлено";

  return `---

## Звіт виконання

- **Дата:** ${params.date}
- **Крок циклу:** ${params.cycle_step}

### Що зроблено
${params.actions_done.map((a) => `- ${a}`).join("\n")}

### Створені файли
${params.files_created.length > 0 ? params.files_created.map((f) => `- ${f}`).join("\n") : "- (немає)"}

### Оновлені файли
${params.files_updated.length > 0 ? params.files_updated.map((f) => `- ${f}`).join("\n") : "- (немає)"}

### Результати Factory Test
- Тест: ${params.factory_test_name} — ${params.factory_test_result}
${params.factory_test_details ? `- ${params.factory_test_details}` : ""}

### Acceptance Criteria
${acLines}

### Definition of Done
${dodLines}

### Виявлені проблеми
${issuesText}
`;
}

// =============================================================================
// 17. Helpers
// =============================================================================

/** Визначити режим виконання за кроком */
function getExecutionMode(step: Step): ExecutionMode {
  return step === "L10" ? "foundation" : "development";
}

/** Перевірити чи крок є кроком виконання задач (L10 або D5) */
function isTaskExecutionStep(step: Step): boolean {
  return step === "L10" || step === "D5";
}

/** Визначити крок циклу для звіту */
function getCycleStep(step: Step): "L10" | "D5" {
  return step === "L10" ? "L10" : "D5";
}

/** Перевірити чи задача має всі обов'язкові секції */
function hasAllRequiredSections(task: ParsedTask): boolean {
  return (
    task.name !== "" &&
    task.description !== "" &&
    task.goal !== "" &&
    task.steps.length > 0 &&
    task.acceptance_criteria.length > 0 &&
    task.definition_of_done.length > 0
  );
}

/** Побудувати шлях переміщення задачі в tasks/done/ */
function buildDonePath(taskPath: string, planName: string): string {
  const taskFilename = taskPath.split("/").pop() || taskPath;
  return `control_center/tasks/done/${planName}/${taskFilename}`;
}

// =============================================================================
// 18. Edge Cases
// =============================================================================

const EDGE_CASES: string[] = [
  "Задача має неясний або суперечливий крок → ЗУПИНИТИ виконання, повідомити. Не інтерпретувати самостійно.",
  "Тести не проходять після зміни → виправляти КОД, НЕ тести. Тести є контрактом.",
  "JIDOKA (J1–J5) виявлено → негайно зупинити, створити issue, status → blocked. Не продовжувати.",
  "Runtime Smoke Test — мокані тести НЕ є заміною. Escape clause ЗАБОРОНЕНО.",
  "Smoke test output обов'язковий — текстовий опис без реального виводу НЕ є доказом.",
  "Infrastructure Gate (I1–I5) провалено → задача НЕ переміщується в tasks/done/.",
  "tasks/active/ порожньо → виконання кроку завершено. Нічого не робити.",
  "Залежності задачі не виконані → ЗУПИНИТИ. Не намагатися виконати залежність самостійно.",
  "Issues в issues/active/ → виконати їх НЕГАЙНО перед наступною задачею.",
  "Contract Check MISMATCH → Factory Test = FAIL. Виправити код до продовження.",
  "Для фреймворків де GET / завжди 200 (напр. Next.js) — базовий smoke test доповнити запитом до реального API ендпоїнту.",
];

// =============================================================================
// 19. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Під-алгоритми
  acquireTask,
  checkPreconditions,
  executeTaskStep,
  executeContractCheck,
  executeFactoryTest,
  checkFinalCompliance,
  generateReport,
  checkIssuesAfterTask,
  checkNextTask,
  // Парсинг
  parseTaskContent,
  extractSections,
  parseSteps,
  parseChecklistItems,
  extractFilesList,
  // Валідація
  validateResult,
  // Template
  generateTemplate,
  // Хелпери
  getExecutionMode,
  isTaskExecutionStep,
  getCycleStep,
  hasAllRequiredSections,
  buildDonePath,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  EDGE_CASES,
  REQUIRED_TASK_SECTIONS,
};

// Re-export типів
export type {
  ExecutionMode,
  RequiredTaskSection,
  TaskAcquisitionInput,
  TaskAcquisitionResult,
  ParsedTask,
  TaskStep,
  TaskPreconditionInput,
  TaskPreconditionResult,
  PreconditionCheckResult,
  TaskStepInput,
  TaskStepResult,
  ContractCheckInput,
  ContractCheckResult,
  FactoryTestInput,
  FactoryTestResult,
  InfraGateResult,
  FinalComplianceInput,
  FinalComplianceResult,
  ExecutionReport,
  ExecutionReportInput,
  ExecutionReportResult,
  CheckIssuesInput,
  CheckIssuesResult,
  NextTaskResult,
  TaskExecutionInput,
  TaskExecutionResult,
  ReportTemplateParams,
  ValidationOutcome,
};
