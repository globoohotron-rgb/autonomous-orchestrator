// =============================================================================
// D6: Plan Completion Verification — Верифікація повноти плану — Process Algorithm
// Конвертовано з: control_center/standards/audit/std-plan-verify.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
  InputReference,
  PlanItemVerdict,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для D6 Plan Completion Verification)
// =============================================================================

/** Статус верифікації окремого пункту плану */
type PlanItemStatus = PlanItemVerdict; // "✅" | "⚠️" | "❌"

/** Результат верифікації одного пункту плану */
interface PlanItemCheck {
  /** Номер пункту плану */
  item_number: number;
  /** Текст пункту */
  item_text: string;
  /** Статус верифікації */
  status: PlanItemStatus;
  /** Доказ виконання або опис відсутнього */
  evidence: string;
}

/** Результат Cross-cutting Flow Check */
interface FlowCheckStep {
  /** Крок flow */
  flow_step: string;
  /** Client файл:рядок */
  client_location: string;
  /** Server файл:рядок */
  server_location: string;
  /** Чи збігаються endpoint/field names */
  match: boolean;
  /** OK або BREAK */
  status: "OK" | "BREAK";
}

/** Зведений результат верифікації */
interface PlanVerificationSummary {
  total_items: number;
  completed: number;
  partial: number;
  missed: number;
  flow_check_passed: boolean;
}

/** Довиконавча задача */
interface RemediationTask {
  /** Назва задачі */
  name: string;
  /** Номер пункту плану */
  plan_item_number: number;
  /** Пріоритет */
  priority: "high" | "medium";
}

/** Повний результат кроку D6 */
interface PlanVerifyResult {
  plan_name: string;
  items: PlanItemCheck[];
  flow_check: FlowCheckStep[];
  summary: PlanVerificationSummary;
  remediation_tasks: RemediationTask[];
  next_step: "D7";
}

/** Параметри для генерації шаблону звіту */
interface TemplateParams {
  planName: string;
  date: string;
  iteration: number;
  totalItems: number;
  completed: number;
  partial: number;
  missed: number;
  items: PlanItemCheck[];
  flowCheck: FlowCheckStep[];
  remediationTasks: RemediationTask[];
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 3 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "state_field",
    field: "status",
    description:
      "P1: Система не заблокована. D6 не може працювати при status=blocked.",
  },
  {
    type: "artifact_registered",
    artifact_key: "plan",
    description:
      "P2: Артефакт плану зареєстрований у state. D3 має записати шлях до плану.",
  },
  {
    type: "dir_not_empty",
    path: "control_center/tasks/done",
    description:
      "P3: Папка tasks/done/[Назва плану]/ існує і не порожня. Задачі не були виконані.",
  },
];

// =============================================================================
// 3. INPUTS (§2 — 5 вхідних даних)
// =============================================================================

const INPUTS: InputReference[] = [
  {
    source: "file",
    path: "control_center/plans/active/plan_*_DD.MM.YY-HH-MM.md",
    description: "Активний план — перелік пунктів для верифікації",
    required: true,
  },
  {
    source: "directory",
    path: "control_center/tasks/done/",
    description: "Виконані задачі — звіти виконання кожної задачі",
    required: true,
  },
  {
    source: "directory",
    path: "control_center/issues/active/",
    description: "Issues (активні) — перевірка чи всі issues закриті",
    required: false,
  },
];

// =============================================================================
// 4. ALGORITHM (§4 — 6 кроків: Крок 1–5 + Крок 3a)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати план з plans/active/. Скласти пронумерований список УСІХ пунктів плану (включно з Test Strategy, якщо є).",
  },
  {
    order: 2,
    instruction:
      "Зчитати звіти виконання задач з tasks/done/[Назва плану]/. Зафіксувати, які пункти плану покриті кожною задачею.",
  },
  {
    order: 3,
    instruction:
      "Для КОЖНОГО пункту плану: визначити очікуваний результат → перевірити фактичний стан через інструменти (read file, run test, curl) → класифікувати ✅/⚠️/❌. Статус ✅ ТІЛЬКИ з фактичним доказом.",
    substeps: [
      "Файл/модуль існує → зчитати, переконатись у наявності",
      "Код реалізовано → знайти відповідний код, перевірити відповідність пункту",
      "Тести існують і проходять → запустити тести",
      "Runtime працює → якщо пункт стосується HTTP endpoint / UI / API — виконати curl або аналогічну перевірку. Наявність коду без runtime = максимум ⚠️ Частково",
      "Артефакт створено → перевірити наявність і вміст",
    ],
    contract_check:
      "Статус ✅ без фактичного підтвердження через інструменти — порушення стандарту. Твердження з пам'яті або контексту попередніх кроків НЕ є доказом.",
  },
  {
    order: 4,
    instruction:
      "Cross-cutting Flow Check (ОБОВ'ЯЗКОВИЙ): Взяти Flow 1 з behavior_spec.md (Happy Path). Для кожного кроку flow перевірити endpoint paths + field names client↔server.",
    substeps: [
      "Взяти Flow 1 з behavior_spec.md (Happy Path)",
      "Для кожного кроку flow відкрити відповідний client-файл і server-файл",
      "Перевірити: endpoint path клієнта = зареєстрований route на сервері",
      "Перевірити: field names в body = field names в handler",
      "Перевірити: handler викликає API (не лише setState)",
      "Якщо будь-який перехід = BREAK → plan completion = ❗ Частково (навіть якщо всі пункти плану ✅)",
      "Сформувати довиконавчу задачу на виправлення contract mismatch при BREAK",
    ],
    contract_check:
      "Client endpoint path = Server registered route; Client field names = Server handler field names. Мета: ловити дефекти що не входили в scope плану, але зламують продукт.",
  },
  {
    order: 5,
    instruction:
      "Сформувати звіт plan_completion_check_DD.MM.YY-HH-MM.md у control_center/audit/plan_completion/ за шаблоном.",
  },
  {
    order: 6,
    instruction:
      "Tech Debt Check (ОБОВ'ЯЗКОВО): після верифікації пунктів плану — перевірити технічне здоров'я коду. Результати додати у звіт plan_completion_check.",
    substeps: [
      "Pattern Consistency: чи всі модулі використовують однаковий стиль? (barrel exports: або всі мають index.ts, або жоден; error handling: однаковий підхід; naming: camelCase/snake_case — єдиний стиль)",
      "Module Boundaries: чи є прямі імпорти з internal файлів інших модулів (обхід barrel export)? Кожен = tech debt.",
      "Duplication: чи є copy-paste код між модулями? (однакова логіка в 2+ місцях, яка має бути в shared/utils). Метод: grep по характерних рядках.",
      "Test Coverage: чи кожен модуль/feature має хоча б один тест-файл? Модулі без тестів — перерахувати.",
      "Dead Code: чи є exports які ніхто не імпортує? Файли які не імпортуються жодним іншим файлом?",
      "Якщо знайдено КРИТИЧНИЙ tech debt (circular deps, >5 pattern violations, >3 boundary violations) → додати remediation задачу.",
    ],
  },
  {
    order: 7,
    instruction:
      "Обробка пропусків: якщо всі пункти ✅ І tech debt не критичний → перейти до D7. Якщо є ⚠️ або ❌ або критичний tech debt → сформувати довиконавчі задачі в tasks/active/, виконати згідно std-task-execution.md, перемістити в done/. Повторну верифікацію НЕ проводити. Перейти до D7.",
    substeps: [
      "Сформувати довиконавчі задачі безпосередньо в control_center/tasks/active/. Окремий план НЕ створювати",
      "КОЖНА довиконавча задача МУСИТЬ містити всі 13 секцій шаблону задачі включно з 'Контекст коду' (реальні сніпети + БУЛО→СТАЛО), 'Заборони', 'Validation Script'",
      "Виконати задачі згідно алгоритму виконання задач (вбудовано в оркестратор)",
      "Перемістити виконані задачі в control_center/tasks/done/[Назва плану]/",
      "Повторну верифікацію НЕ проводити — перейти до D7",
    ],
  },
];

// =============================================================================
// 5. CONSTRAINTS (§8 — 7 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено проводити повторну верифікацію після довиконання (захист від нескінченного циклу).",
  "Заборонено створювати окремий план для довиконавчих задач — лише задачі напряму в tasks/active/.",
  "Заборонено класифікувати пункт як ✅ без фактичної перевірки через інструменти.",
  "Заборонено змінювати або доповнювати план на цьому кроці — тільки верифікація існуючих пунктів.",
  "Заборонено ігнорувати Test Strategy — тести перевіряються нарівні з кодом.",
  "Заборонено виконувати довиконавчі задачі до завершення формування звіту (спочатку повний звіт, потім виконання).",
  "Бажано виконувати у чистій сесії для зменшення bias самоперевірки.",
];

// =============================================================================
// 6. Валідація результату (§6 Критерії прийнятності — 6 пунктів)
// =============================================================================

/**
 * Перевіряє результат D6 за критеріями прийнятності (§6).
 */
function validateResult(
  items: PlanItemCheck[],
  remediationTasks: RemediationTask[],
  reportPath: string | null,
  summary: PlanVerificationSummary | null,
): ValidationOutcome {
  const issues: string[] = [];

  // C1: Кожен пункт плану має явний статус (✅ / ⚠️ / ❌)
  const withoutStatus = items.filter(
    (i) => i.status !== "✅" && i.status !== "⚠️" && i.status !== "❌"
  );
  if (withoutStatus.length > 0) {
    issues.push(
      `C1 FAIL: ${withoutStatus.length} пунктів без явного статусу`
    );
  }

  // C2: Для кожного ✅ вказано фактичний доказ
  const completedWithoutEvidence = items.filter(
    (i) => i.status === "✅" && (!i.evidence || i.evidence.trim() === "")
  );
  if (completedWithoutEvidence.length > 0) {
    issues.push(
      `C2 FAIL: ${completedWithoutEvidence.length} пунктів зі статусом ✅ без фактичного доказу`
    );
  }

  // C3: Для кожного ⚠️ / ❌ вказано конкретно що відсутнє
  const failedWithoutEvidence = items.filter(
    (i) =>
      (i.status === "⚠️" || i.status === "❌") &&
      (!i.evidence || i.evidence.trim() === "")
  );
  if (failedWithoutEvidence.length > 0) {
    issues.push(
      `C3 FAIL: ${failedWithoutEvidence.length} пунктів зі статусом ⚠️/❌ без опису відсутнього`
    );
  }

  // C4: Довиконавчі задачі сформовані (якщо є пропуски)
  const hasGaps = items.some((i) => i.status === "⚠️" || i.status === "❌");
  if (hasGaps && remediationTasks.length === 0) {
    issues.push(
      "C4 FAIL: Є пропуски (⚠️/❌), але довиконавчі задачі не сформовані"
    );
  }

  // C5: Звіт збережено за правильним шляхом і з правильною назвою
  if (!reportPath || !reportPath.includes("audit/plan_completion/plan_completion_check_")) {
    issues.push(
      `C5 FAIL: Звіт не збережено або неправильний шлях: "${reportPath ?? "null"}"`
    );
  }

  // C6: Підсумкова статистика відповідає детальній таблиці
  if (summary) {
    const actualCompleted = items.filter((i) => i.status === "✅").length;
    const actualPartial = items.filter((i) => i.status === "⚠️").length;
    const actualMissed = items.filter((i) => i.status === "❌").length;
    if (
      summary.completed !== actualCompleted ||
      summary.partial !== actualPartial ||
      summary.missed !== actualMissed ||
      summary.total_items !== items.length
    ) {
      issues.push(
        `C6 FAIL: Підсумкова статистика (${summary.completed}/${summary.partial}/${summary.missed} з ${summary.total_items}) не відповідає детальній таблиці (${actualCompleted}/${actualPartial}/${actualMissed} з ${items.length})`
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 7. Шаблон артефакту (§A — Plan Completion Check)
// =============================================================================

/**
 * Генерує шаблон звіту верифікації плану.
 */
function generateTemplate(params: TemplateParams): string {
  const itemRows = params.items
    .map(
      (item) =>
        `| ${item.item_number} | ${item.item_text} | ${item.status} | ${item.evidence} |`
    )
    .join("\n");

  const flowRows = params.flowCheck
    .map(
      (step) =>
        `| ${step.flow_step} | ${step.client_location} | ${step.server_location} | ${step.match ? "✅" : "❌"} | ${step.status} |`
    )
    .join("\n");

  const remediationRows =
    params.remediationTasks.length > 0
      ? params.remediationTasks
          .map(
            (task, i) =>
              `| ${i + 1} | ${task.name} | #${task.plan_item_number} | ${task.priority} |`
          )
          .join("\n")
      : "| — | Немає | — | — |";

  return `# Plan Completion Check

> **План:** ${params.planName}
> **Дата:** ${params.date}
> **Ітерація:** ${params.iteration}

---

## Підсумок

| Показник | Значення |
|----------|----------|
| Всього пунктів плану | ${params.totalItems} |
| ✅ Виконано | ${params.completed} |
| ⚠️ Частково | ${params.partial} |
| ❌ Пропущено | ${params.missed} |

---

## Детальна верифікація

| # | Пункт плану | Статус | Доказ / що відсутнє |
|---|-------------|--------|---------------------|
${itemRows}

---

## Cross-cutting Flow Check

| Крок flow | Client файл:рядок | Server файл:рядок | Match? | Статус |
|---|---|---|---|---|
${flowRows}

---

## Довиконавчі задачі (якщо є)

| # | Задача | Пункт плану | Пріоритет |
|---|--------|-------------|-----------|
${remediationRows}

---
`;
}

// =============================================================================
// 8. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_D6: StepDefinition = {
  id: "D6",
  block: "development_cycle",
  name: "Plan Completion Verification — Верифікація повноти плану",
  type: "autonomous",
  role: "programmer",
  purpose:
    "Одноразова верифікація повноти виконання плану після завершення всіх задач (D5). Порівняння кожного пункту плану з фактичним станом коду та артефактів. Виявлення пропущених або частково виконаних пунктів. Формування довиконавчих задач при необхідності.",
  standards: [],

  preconditions: PRECONDITIONS,
  inputs: INPUTS,
  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: "plan_completion",
    path_pattern:
      "control_center/audit/plan_completion/plan_completion_check_{date}.md",
    template_id: "plan_completion_check",
  },

  additional_artifacts: [
    {
      registry_key: null,
      path_pattern: "control_center/tasks/active/{task_name}.md",
      template_id: "task",
    },
  ],

  transitions: [
    {
      condition: "Всі пункти ✅ — перейти до D7",
      target: "D7",
    },
    {
      condition: "Є ⚠️ або ❌ — довиконання + перейти до D7",
      target: "D7",
    },
  ],

  isolation_required: false,
};

// =============================================================================
// 9. Exports
// =============================================================================

export {
  validateResult,
  generateTemplate,
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  INPUTS,
};

export type {
  PlanItemStatus,
  PlanItemCheck,
  FlowCheckStep,
  PlanVerificationSummary,
  RemediationTask,
  PlanVerifyResult,
  TemplateParams,
  ValidationOutcome,
};
