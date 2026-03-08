// =============================================================================
// D2+D9: Goals Check (Unified) — Dual-mode: OBSERVE (D2) + Full Goals Check (D9)
// Конвертовано з: control_center/standards/audit/std-goals-check.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
  InputReference,
} from "../../types";
import type { GoalsCheckVerdict } from "../../types";

// =============================================================================
// 1. Types (специфічні для D2/D9 Goals Check)
// =============================================================================

/** Статус характеристики у D2 (OBSERVE) */
type ObserveFeatureStatus =
  | "Реалізовано"
  | "Частково"
  | "Не реалізовано"
  | "Розходження";

/** Статус AC у D9 (Goals Check) */
type GoalStatus = "DONE" | "PARTIAL" | "NOT_STARTED";

/** Статус AC з урахуванням регресу */
type GoalStatusWithRegression = GoalStatus | "REGRESSION";

/** Результат перевірки одного критерію */
interface CriterionCheck {
  id: string;
  description: string;
  check_type:
    | "file_exists"
    | "code_contains"
    | "test_passes"
    | "contract_matches"
    | "runtime_check"
    | "output_matches";
  result: "PASS" | "FAIL";
  evidence: string;
}

/** Результат перевірки однієї цілі (AC) */
interface GoalCheck {
  number: number;
  goal_text: string;
  criteria: CriterionCheck[];
  status: GoalStatus;
  evidence: string;
}

/** Динаміка порівняння з попереднім goals_check */
interface DynamicsComparison {
  previous_file: string | null;
  previous_progress: number;
  current_progress: number;
  new_done: string[];
  regressions: string[];
  baseline_reset: boolean;
}

/** Результат contract walkthrough (D2 Крок 4a) */
interface ContractWalkthroughStep {
  flow_step: string;
  client_file_line: string;
  api_endpoint: string;
  server_handler_line: string;
  field_match: boolean;
  status: "OK" | "BREAK";
}

/** Зведений результат D2 OBSERVE */
interface ObserveResult {
  iteration: number;
  date: string;
  features_implemented: number;
  features_partial: number;
  features_not_implemented: number;
  features_diverged: number;
  total_features: number;
  progress_percent: number;
  contract_walkthrough: ContractWalkthroughStep[];
  dead_components: string[];
  stubs: string[];
  recommendations_for_d3: string[];
  report_path: string;
  b2b_health?: {
    multi_tenancy_implemented: boolean;
    rbac_implemented: boolean;
    onboarding_flow_exists: boolean;
    empty_states_coverage_percent: number;
    error_handling_coverage_percent: number;
    billing_integration_exists: boolean;
    data_export_exists: boolean;
  };
}

/** Зведений результат D9 Goals Check */
interface GoalsCheckResult {
  iteration: number;
  date: string;
  goals: GoalCheck[];
  total_goals: number;
  done_count: number;
  partial_count: number;
  not_started_count: number;
  progress_percent: number;
  dynamics: DynamicsComparison | null;
  verdict: GoalsCheckVerdict;
  mini_gate_decision_path: string;
  goals_check_path: string;
}

/** Параметри для генерації шаблону D2 */
interface ObserveTemplateParams {
  date: string;
  iteration: number;
  implemented: Array<{
    num: number;
    feature: string;
    evidence: string;
  }>;
  partial: Array<{
    num: number;
    feature: string;
    done: string;
    missing: string;
  }>;
  not_implemented: Array<{
    num: number;
    feature: string;
    priority: string;
    dependencies: string;
  }>;
  diverged: Array<{
    num: number;
    feature: string;
    spec_description: string;
    actual_state: string;
    impact: string;
  }>;
  issues: Array<{
    num: number;
    issue: string;
    file: string;
    impact: string;
  }>;
  hansei_lessons: string[];
  total_features: number;
  implemented_count: number;
  progress_percent: number;
  main_gaps: string;
  critical_dependencies: string;
  recommendations: string[];
  contract_walkthrough: ContractWalkthroughStep[];
  dead_components: string[];
  stubs: string[];
  spec_divergences: Array<{
    num: number;
    file: string;
    section: string;
    description: string;
    criticality: string;
  }>;
}

/** Параметри для генерації шаблону D9 */
interface GoalsCheckTemplateParams {
  date: string;
  block: string;
  iteration: number;
  total_goals: number;
  done_count: number;
  partial_count: number;
  not_started_count: number;
  progress_percent: number;
  goals: GoalCheck[];
  regressions: Array<{
    num: number;
    goal: string;
    prev_status: string;
    curr_status: string;
    reason: string;
  }>;
  dynamics: DynamicsComparison | null;
  verdict: GoalsCheckVerdict;
  rationale: string;
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS
// =============================================================================

// --- D2 preconditions (§3 — загальні P1, P2 + D2-specific P3) ---

const D2_PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "dir_not_empty",
    path: "control_center/final_view",
    description:
      "P1: Файли у control_center/final_view/ існують. Без еталону перевірка неможлива.",
  },
  {
    type: "state_field",
    field: "status",
    description:
      "P2: state.json існує і status ≠ 'blocked'. Ескалація до людини при порушенні.",
  },
  {
    type: "step_completed",
    step: "D1",
    description:
      "P3: Попередній крок завершено (last_completed_step = D1). Не можна починати ітерацію без контрольної точки.",
  },
];

// --- D9 preconditions (§3 — загальні P1, P2 + D9-specific P3, P4) ---

const D9_PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "dir_not_empty",
    path: "control_center/final_view",
    description:
      "P1: Файли у control_center/final_view/ існують. Без еталону перевірка неможлива.",
  },
  {
    type: "state_field",
    field: "status",
    description:
      "P2: state.json існує і status ≠ 'blocked'. Ескалація до людини при порушенні.",
  },
  {
    type: "artifact_registered",
    artifact_key: "hansei",
    description:
      "P3: HANSEI звіт поточної ітерації існує. Без HANSEI — goals_check НЕ виконується. (Перевіряється оркестратором, НЕ читається інспектором.)",
  },
  {
    type: "dir_empty",
    path: "control_center/tasks/active",
    description:
      "P4: tasks/active/ порожній. Незавершені задачі = неповна картина.",
  },
];

// =============================================================================
// 3. INPUTS
// =============================================================================

// --- D2 inputs (§2 — загальні + D2-specific) ---

const D2_INPUTS: InputReference[] = [
  {
    source: "directory",
    path: "control_center/final_view/",
    description: "Опис продукту (маяк) — еталонні цілі, вимоги, функції",
    required: true,
  },
  {
    source: "file",
    path: "control_center/final_view/completion_checklist.md",
    description: "Checklist маяк — верифіковані критерії та пріоритети AC",
    required: true,
  },
  {
    source: "state",
    field: "current_step",
    description: "state.json — поточний блок та ітерація",
    required: true,
  },
  {
    source: "file",
    path: "control_center/final_view/behavior_spec.md",
    description: "Behavior spec — user flows, API contracts",
    required: true,
  },
  {
    source: "file",
    path: "control_center/final_view/block_summary_foundation.md",
    description: "Компактний підсумок Foundation (<500 токенів) — замість читання всіх артефактів",
    required: false,
  },
];

// --- D9 inputs (§2 — загальні + D9-specific) ---

const D9_INPUTS: InputReference[] = [
  {
    source: "directory",
    path: "control_center/final_view/",
    description: "Опис продукту (маяк) — еталонні цілі, вимоги, функції. ЄДИНЕ ДЖЕРЕЛО ВИМОГ.",
    required: true,
  },
  {
    source: "file",
    path: "control_center/final_view/completion_checklist.md",
    description: "Checklist маяк — верифіковані критерії та пріоритети AC. ЄДИНЕ ДЖЕРЕЛО AC.",
    required: true,
  },
  {
    source: "state",
    field: "current_step",
    description: "state.json — поточний блок та ітерація",
    required: true,
  },
  {
    source: "artifact",
    artifact_key: "goals_check",
    description: "Попередній goals_check — ТІЛЬКИ для динаміки прогресу (prev_cycle_artifacts). ЗАБОРОНЕНО копіювати статуси.",
    required: false,
  },
];

// =============================================================================
// 4. ALGORITHMS
// =============================================================================

// --- D2 Algorithm (§4 D2 — 7 кроків) ---

const D2_ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати final_view/* повністю. Скласти перелік цільових характеристик.",
  },
  {
    order: 2,
    instruction:
      "Перевірити фактичний стан проєкту через інструменти (file reads, directory listing, grep): які модулі/файли існують, які функції реалізовані, які тести написані, стан issues/active/.",
  },
  {
    order: 3,
    instruction:
      "Зафіксувати контекст: issues/active/ стан, кількість файлів у проєкті, загальний обсяг коду. НЕ читати plans/done/, hansei, goals_check — D2 працює виключно з фактичним станом коду.",
  },
  {
    order: 4,
    instruction:
      "Для кожної характеристики визначити статус: Реалізовано (підтверджено файлом + runtime-перевіркою), Частково (є код але працездатність не підтверджена), Не реалізовано, Розходження. Наявність файлу без runtime = максимум Частково.",
    substeps: [
      "Файл з кодом без перевірки працездатності = максимум Частково",
      "Для Реалізовано потрібен runtime-доказ (запуск тесту, HTTP-запит, або лог)",
    ],
  },
  {
    order: 5,
    instruction:
      "Contract Walkthrough (ОБОВ'ЯЗКОВИЙ): Взяти Flow 1 з behavior_spec.md (Happy Path). Для кожного кроку flow перевірити 3 контрактні точки: endpoint path, field names, API call exists.",
    substeps: [
      "Відкрити відповідний client-файл і знайти функцію/handler",
      "Endpoint path: шлях в клієнтському api.js = зареєстрований route в API?",
      "Field names: назви полів у body/params клієнта = очікувані server handler?",
      "API call exists: handler дійсно викликає HTTP запит (не лише setState)?",
      "Якщо будь-який перехід = BREAK → відповідний AC = максимум Частково",
    ],
    contract_check:
      "Обхід 'по пам'яті' заборонений. Агент зобов'язаний відкрити кожен файл і процитувати рядок.",
  },
  {
    order: 6,
    instruction:
      "Виявити ризики, залежності, актуальні проблеми з HANSEI. Перевірити мертві компоненти (grep імпорти) та заглушки (grep TODO/FIXME/placeholder/alert/coming soon). Записати знахідки.",
    substeps: [
      "Перевірка мертвих компонентів: для кожного компонента перевірити чи імпортований хоча б одним файлом",
      "Перевірка заглушок: grep по alert(, console.log('TODO'), coming soon, // TODO, // FIXME, placeholder",
      "Кожна заглушка = feature НЕ реалізовано (не Реалізовано)",
    ],
  },
  {
    order: 7,
    instruction:
      "Code Health Snapshot (ОБОВ'ЯЗКОВО): оцінити технічний стан кодової бази. Результат записати у окрему секцію observe_report.",
    substeps: [
      "Файли >300 рядків: перерахувати всі файли з кодом >300 рядків (виключаючи node_modules, .lock). Кожен = кандидат на розбиття.",
      "TODO/FIXME/HACK count: grep по TODO, FIXME, HACK, XXX у всіх src/ файлах. Зафіксувати загальну кількість та файли-лідери.",
      "Circular dependencies: перевірити чи є циклічні імпорти (A→B→A або A→B→C→A). Метод: для кожного зміненого модуля пройти ланцюг imports.",
      "Файли без тестів: для кожного модуля/feature перевірити наявність відповідного тест-файлу (*.test.ts, *.spec.ts). Зафіксувати модулі без тестів.",
      "Pattern consistency: чи всі модулі дотримуються однакового стилю (barrel exports, naming conventions, error handling pattern). Зафіксувати відхилення.",
      "Сформувати секцію '## Code Health' з метриками: files_over_300_lines, todo_count, circular_deps, modules_without_tests, pattern_violations. Кожна метрика з конкретними файлами.",
      "B2B Health Check (якщо project_description містить B2B Model):",
      "  — Multi-tenancy: grep по tenant_id, tenantId, RLS, row level security. Чи є middleware filter?",
      "  — RBAC: grep по role, permission, canAccess, isAdmin, useAuth. Чи є role-based routing?",
      "  — Onboarding: grep по onboarding, welcome, setup, wizard, checklist. Чи є dedicated flow?",
      "  — Empty States: для кожного компонента з list/table — чи є conditional render для empty? % coverage",
      "  — Error Handling: для кожного fetch/API call — чи є catch/error state? % coverage",
      "  — Billing: grep по stripe, subscription, plan, upgrade, billing. Чи інтегровано?",
      "  — Data Export: grep по export, download, csv, pdf. Чи є endpoint?",
      "Записати результат у секцію '## B2B Health' observe report з метриками.",
    ],
  },
  {
    order: 8,
    instruction:
      "Зберегти observe_report_DD.MM.YY-HH-MM.md у audit/observe/. Оновити state.json: current_step → D3, last_completed_step → D2, artifacts.observe_report → шлях.",
    substeps: [
      "Якщо multi_tenancy_implemented = false → додати 'Implement tenant isolation (multi-tenancy)' до recommendations_for_d3",
      "Якщо empty_states_coverage_percent < 80 → додати 'Add empty states with CTA to remaining lists' до recommendations_for_d3",
      "Якщо error_handling_coverage_percent < 90 → додати 'Add error handling to uncovered API calls' до recommendations_for_d3",
    ],
  },
];

// --- D9 Algorithm (§4 D9 — 8 кроків) ---

const D9_ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "⛔ ІЗОЛЯЦІЯ: Ти — незалежний інспектор якості. Ти НЕ знаєш хто писав цей код і що було зроблено. ЗАБОРОНЕНО читати plans/, tasks/, hansei, observe_report або будь-які артефакти розробки. ЄДИНІ джерела вимог: final_view/ та completion_checklist.md.",
    substeps: [
      "Зчитати ВСІ файли з final_view/, включно з completion_checklist.md",
      "Перелік цілей формувати ВИКЛЮЧНО з completion_checklist.md — кожен критерій (AC1.1, AC1.2, ...) є окремою ціллю",
      "ЗАБОРОНЕНО: читати plans/done/, tasks/done/, audit/hansei/, audit/observe/ — це контекст розробника",
    ],
  },
  {
    order: 2,
    instruction:
      "Перевірити фактичний стан коду ВИКЛЮЧНО через інструменти. Для кожного AC — незалежна перевірка з нуля. НЕ використовувати жодних знань крім того, що видно через інструменти прямо зараз.",
    substeps: [
      "Для кожного AC: визначити що саме потрібно перевірити (з completion_checklist.md)",
      "Виконати перевірку через інструменти: read_file, grep_search, list_dir, run_command",
      "Запустити тести (якщо є) для підтвердження — ts-node, npm test тощо",
      "ЗАБОРОНЕНО: приймати статус DONE на основі того, що 'файл існує' — потрібен runtime-доказ",
    ],
  },
  {
    order: 3,
    instruction:
      "Порівняти ціль-за-ціллю: для КОЖНОГО критерію з completion_checklist.md виконати перевірку за типом (file_exists, code_contains, test_passes, contract_matches, runtime_check, output_matches). PASS тільки з доказом.",
    substeps: [
      "file_exists → перевірити через файлову систему",
      "code_contains → перевірити через grep_search",
      "test_passes → запустити тест",
      "contract_matches → відкрити обидва файли (client+server), порівняти field names/endpoints, цитати обов'язкові",
      "runtime_check → пройти user flow through code (client→API→DB), PASS тільки якщо повний ланцюг без розривів",
      "output_matches → надіслати реальний запит з конкретними доменними даними, перевірити семантичну коректність",
      "AC статус: DONE (всі критерії PASS) або NOT_DONE (хоча б один FAIL)",
      "B2B AC перевірка (якщо є AC з типами ONBOARDING, RETENTION, SECURITY, BILLING):",
      "  — ONBOARDING AC: пройти flow register → setup → first value. Кожен крок documented.",
      "  — RETENTION AC: перевірити що retention mechanism exists (data lock-in, notification, re-engagement).",
      "  — SECURITY AC: перевірити tenant isolation (запит від tenant A не повертає дані tenant B).",
      "  — BILLING AC: перевірити subscription lifecycle (create, upgrade, cancel) через API або Stripe test mode.",
    ],
    contract_check:
      "file_exists + code_contains без runtime_check = максимум PARTIAL, не DONE. output_matches FAIL → AC = NOT_DONE незалежно від інших.",
  },
  {
    order: 4,
    instruction:
      "Обчислити прогрес: (кількість DONE / загальна кількість цілей) × 100%. Окремо порахувати: DONE, PARTIAL, NOT_STARTED.",
  },
  {
    order: 5,
    instruction:
      "Порівняти з попереднім goals_check (prev_cycle_artifacts.goals_check). Визначити динаміку: які цілі змінили статус, чи є регрес. AMEND_SPEC baseline reset: якщо між goals_check було AMEND_SPEC — НЕ фіксувати зміни як REGRESSION.",
    substeps: [
      "Перевірити наявність _v[N].md файлів у final_view/ з датою після останнього goals_check",
      "Якщо AMEND_SPEC було — baseline скинуто, не фіксувати як REGRESSION",
      "Якщо AC було DONE а стало NOT_DONE — позначити REGRESSION",
    ],
  },
  {
    order: 6,
    instruction:
      "Сформувати висновок: READY_FOR_AUDIT (всі AC = DONE), NEEDS_ITERATION (є незавершені AC), REGRESSION_DETECTED (раніше DONE стало NOT_DONE). Поріг Good Enough: якщо всі P0 DONE і ≥60% загальних DONE — зазначити як примітку.",
    substeps: [
      "B2B Readiness Note: якщо project B2B і b2b_health відсутній або gaps > 3 → додати note 'B2B readiness incomplete' до goals_check report.",
    ],
  },
  {
    order: 7,
    instruction:
      "Зберегти goals_check_DD.MM.YY-HH-MM.md у audit/goals_check/. Оновити state.json: artifacts.goals_check → шлях, last_artifact → шлях. Перевірити: файл існує і непорожній.",
  },
  {
    order: 8,
    instruction:
      "Mini-GATE: створити mini_gate_decision_cycle[N]_DD.MM.YY-HH-MM.md у audit/gate_decisions/ з шаблоном рішення. ОБОВ'ЯЗКОВО включити секцію '## System Recommendation' з автоматичною рекомендацією.",
    substeps: [
      "Прочитати cycle_counter.md — визначити номер циклу [N]",
      "Порахувати метрики: progress_percent, cycle_number, jidoka_stops (з state.json), issues_created (з state.json)",
      "Сформувати рекомендацію за порогами: >80% DONE + cycles >= 2 → VALIDATE; <50% DONE + cycles >= 5 → KILL або PIVOT; інакше → CONTINUE",
      "B2B Factor: якщо project B2B → підвищити threshold для VALIDATE: потрібно >85% DONE + b2b_health gaps ≤ 2",
      "Створити файл з секціями: ## System Recommendation (progress %, cycles, jidoka stops, recommendation), ## Decision (порожнє для людини), ## Rationale, ## Comments",
      "Перевірити: файл існує і непорожній",
      "Оновити state.json → status: awaiting_human_decision, current_step: D1",
      "Усна команда ('продовжуй') НЕ замінює файл рішення",
    ],
  },
];

// =============================================================================
// 5. CONSTRAINTS (§8 — 9 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО змінювати файли у control_center/final_view/. Вони є незмінним маяком.",
  "ЗАБОРОНЕНО присвоювати статус DONE / Реалізовано без фактичного доказу (файл, тест, артефакт).",
  "ЗАБОРОНЕНО пропускати цілі з final_view/ — навіть якщо вони здаються несуттєвими.",
  "ЗАБОРОНЕНО формувати нові задачі або плани на цьому кроці. Goals Check / OBSERVE тільки фіксує стан.",
  "ЗАБОРОНЕНО видаляти або змінювати попередні goals_check_*.md або observe_report_*.md файли.",
  "ЗАБОРОНЕНО пропускати Крок 8 (Mini-GATE). D9 ОБОВ'ЯЗКОВО завершується створенням mini_gate_decision + STOP.",
  "ЗАБОРОНЕНО продовжувати виконання після Кроку 8. Усна команда ('продовжуй') НЕ замінює файл рішення.",
  "D2 (OBSERVE): ЗАБОРОНЕНО змінювати код, задачі, плани. Тільки спостереження та фіксація.",
  "D2 (OBSERVE): ЗАБОРОНЕНО ставити статус 'Реалізовано' без перевірки працездатності. Наявність файлу = максимум 'Частково'. Для 'Реалізовано' потрібен runtime-доказ.",
  "D9 (ІЗОЛЯЦІЯ): ЗАБОРОНЕНО читати plans/done/, tasks/done/, audit/hansei/, audit/observe/. Це контекст розробника — інспектор якості НЕ повинен його знати.",
  "D9 (ІЗОЛЯЦІЯ): ЗАБОРОНЕНО копіювати статуси з попереднього goals_check. Кожен AC перевіряється з нуля через інструменти.",
  "D9 (ІЗОЛЯЦІЯ): Статус DONE тільки з runtime-доказом (запуск тесту, HTTP-запит, перевірка output). file_exists = максимум PARTIAL.",
];

// =============================================================================
// 6. Валідація результату (§6 Критерії прийнятності — 9 пунктів)
// =============================================================================

/**
 * Перевіряє результат D9 за критеріями прийнятності (§6).
 * Також застосовується до D2 де релевантно.
 */
function validateResult(
  goals: GoalCheck[],
  totalGoalsInFinalView: number,
  progressPercent: number,
  hasPrevGoalsCheck: boolean,
  dynamicsRecorded: boolean,
  verdict: GoalsCheckVerdict | null,
  goalsCheckPath: string | null,
  miniGateDecisionPath: string | null,
  stateStatus: string | null,
  stateCurrentStep: string | null,
  agentStopped: boolean,
): ValidationOutcome {
  const issues: string[] = [];

  // C1: Кожна ціль/вимога з final_view/ має рядок у таблиці звіту
  if (goals.length < totalGoalsInFinalView) {
    issues.push(
      `C1 FAIL: Таблиця має ${goals.length} цілей, але final_view/ містить ${totalGoalsInFinalView}`
    );
  }

  // C2: Жоден статус DONE не присвоєно без конкретного доказу
  const doneWithoutEvidence = goals.filter(
    (g) => g.status === "DONE" && (!g.evidence || g.evidence.trim() === "")
  );
  if (doneWithoutEvidence.length > 0) {
    issues.push(
      `C2 FAIL: ${doneWithoutEvidence.length} цілей зі статусом DONE без конкретного доказу`
    );
  }

  // C3: Відсоток прогресу обчислено коректно
  const expectedPercent =
    goals.length > 0
      ? Math.round(
          (goals.filter((g) => g.status === "DONE").length / goals.length) * 100
        )
      : 0;
  if (Math.abs(progressPercent - expectedPercent) > 1) {
    issues.push(
      `C3 FAIL: Прогрес ${progressPercent}% не відповідає обчисленому ${expectedPercent}%`
    );
  }

  // C4: При наявності попереднього goals_check — динаміка зафіксована
  if (hasPrevGoalsCheck && !dynamicsRecorded) {
    issues.push(
      "C4 FAIL: Попередній goals_check існує, але динаміка не зафіксована"
    );
  }

  // C5: Висновок (recommendation) сформульовано
  if (!verdict) {
    issues.push("C5 FAIL: Висновок (recommendation) не сформульовано");
  }

  // C6: Файл збережено з коректною назвою та шляхом
  if (
    !goalsCheckPath ||
    !goalsCheckPath.includes("audit/goals_check/goals_check_")
  ) {
    issues.push(
      `C6 FAIL: Файл goals_check не збережено або неправильний шлях: "${goalsCheckPath ?? "null"}"`
    );
  }

  // C7: mini_gate_decision створено у audit/gate_decisions/
  if (
    !miniGateDecisionPath ||
    !miniGateDecisionPath.includes("audit/gate_decisions/mini_gate_decision_cycle")
  ) {
    issues.push(
      `C7 FAIL: mini_gate_decision не створено або неправильний шлях: "${miniGateDecisionPath ?? "null"}"`
    );
  }

  // C8: state.json має status: awaiting_human_decision і current_step: D1
  if (stateStatus !== "awaiting_human_decision") {
    issues.push(
      `C8 FAIL: state.json status має бути 'awaiting_human_decision', є: '${stateStatus ?? "null"}'`
    );
  }
  if (stateCurrentStep !== "D1") {
    issues.push(
      `C8 FAIL: state.json current_step має бути 'D1', є: '${stateCurrentStep ?? "null"}'`
    );
  }

  // C9: Агент зупинився і не продовжує виконання
  if (!agentStopped) {
    issues.push(
      "C9 FAIL: Агент не зупинився після Кроку 8 (Mini-GATE)"
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 7. Шаблони артефактів
// =============================================================================

// --- A.1. Observe Report (D2) ---

function generateObserveTemplate(params: ObserveTemplateParams): string {
  const implementedRows = params.implemented
    .map((f) => `| ${f.num} | ${f.feature} | Реалізовано | ${f.evidence} |`)
    .join("\n");

  const partialRows = params.partial
    .map((f) => `| ${f.num} | ${f.feature} | ${f.done} | ${f.missing} |`)
    .join("\n");

  const notImplRows = params.not_implemented
    .map(
      (f) => `| ${f.num} | ${f.feature} | ${f.priority} | ${f.dependencies} |`
    )
    .join("\n");

  const divergedRows = params.diverged
    .map(
      (f) =>
        `| ${f.num} | ${f.feature} | ${f.spec_description} | ${f.actual_state} | ${f.impact} |`
    )
    .join("\n");

  const issueRows = params.issues
    .map((i) => `| ${i.num} | ${i.issue} | ${i.file} | ${i.impact} |`)
    .join("\n");

  const contractRows = params.contract_walkthrough
    .map(
      (c) =>
        `| ${c.flow_step} | ${c.client_file_line} | ${c.api_endpoint} | ${c.server_handler_line} | ${c.field_match ? "✅" : "❌"} | ${c.status} |`
    )
    .join("\n");

  const deadCompList =
    params.dead_components.length > 0
      ? params.dead_components.map((c) => `- ${c}`).join("\n")
      : "- Немає";

  const stubsList =
    params.stubs.length > 0
      ? params.stubs.map((s) => `- ${s}`).join("\n")
      : "- Немає";

  const specDivRows = params.spec_divergences
    .map(
      (d) =>
        `| ${d.num} | ${d.file} | ${d.section} | ${d.description} | ${d.criticality} |`
    )
    .join("\n");

  return `# OBSERVE Report — ${params.date}

**Ітерація:** ${params.iteration}
**Дата:** ${params.date}

---

## 1. Стан проєкту

### Реалізовані характеристики
| # | Характеристика (з final_view) | Статус | Підтвердження (файл/модуль) |
|---|-------------------------------|--------|-----------------------------|
${implementedRows || "| — | — | — | — |"}

### Частково реалізовані
| # | Характеристика | Що зроблено | Що відсутнє |
|---|----------------|-------------|-------------|
${partialRows || "| — | — | — | — |"}

### Не реалізовані
| # | Характеристика | Пріоритет (high/medium/low) | Залежності |
|---|----------------|----------------------------|------------|
${notImplRows || "| — | — | — | — |"}

### Розходження
| # | Характеристика | Опис в final_view | Фактичний стан | Вплив |
|---|----------------|-------------------|----------------|-------|
${divergedRows || "| — | — | — | — | — |"}

---

## Контрактний обхід (Flow 1)
| Крок flow | Client файл:рядок | API endpoint | Server handler:рядок | Field match? | Статус |
|---|---|---|---|---|---|
${contractRows || "| — | — | — | — | — | — |"}

---

## Мертві компоненти
${deadCompList}

## Заглушки
${stubsList}

---

## 2. Відкриті issues
| # | Issue | Файл | Вплив |
|---|-------|------|-------|
${issueRows || "| — | — | — | — |"}

---

## 3. Уроки з попередньої ітерації (з HANSEI)
${params.hansei_lessons.map((l) => `- ${l}`).join("\n") || "- Немає"}

---

## 4. Загальна оцінка прогресу
**Реалізовано:** ${params.implemented_count} з ${params.total_features} характеристик (~${params.progress_percent}%)
**Основні прогалини:** ${params.main_gaps}
**Критичні залежності:** ${params.critical_dependencies}

---

## 5. Рекомендації для D3
${params.recommendations.map((r) => `- ${r}`).join("\n") || "- Немає"}

### Розходження, що потребують поправок маяка
| # | Файл у final_view/ | Секція | Опис розходження | Критичність (high/medium/low) |
|---|---------------------|--------|------------------|-------------------------------|
${specDivRows || "| — | — | — | — | — |"}

> Якщо таблиця не порожня — передати людині на Mini-GATE з рекомендацією AMEND_SPEC.
`;
}

// --- A.2. Goals Check (D9) ---

function generateGoalsCheckTemplate(params: GoalsCheckTemplateParams): string {
  const goalRows = params.goals
    .map(
      (g) => `| ${g.number} | ${g.goal_text} | ${g.status} | ${g.evidence} |`
    )
    .join("\n");

  const regressionRows =
    params.regressions.length > 0
      ? params.regressions
          .map(
            (r) =>
              `| ${r.num} | ${r.goal} | ${r.prev_status} | ${r.curr_status} | ${r.reason} |`
          )
          .join("\n")
      : "| — | — | — | — | — |";

  const dynamicsSection = params.dynamics
    ? `- Попередній goals_check: ${params.dynamics.previous_file ?? "відсутній"}
- Прогрес попередній → поточний: ${params.dynamics.previous_progress}% → ${params.dynamics.current_progress}%
- Нові DONE з минулого разу: ${params.dynamics.new_done.length > 0 ? params.dynamics.new_done.join(", ") : "немає"}
- Регрес: ${params.dynamics.regressions.length > 0 ? "є" : "немає"}${params.dynamics.baseline_reset ? "\n- Baseline скинуто після AMEND_SPEC" : ""}`
    : "- Попередній goals_check: відсутній\n- Перша перевірка цілей";

  return `# Goals Check — ${params.date}

**Блок:** ${params.block}
**Ітерація:** ${params.iteration}
**Крок циклу:** D9

---

## Прогрес

| Всього цілей | DONE | PARTIAL | NOT_STARTED | Прогрес |
|-------------|------|---------|-------------|---------|
| ${params.total_goals} | ${params.done_count} | ${params.partial_count} | ${params.not_started_count} | ${params.progress_percent}% |

---

## Деталізація по цілях

| # | Ціль / вимога (з final_view) | Статус | Доказ / коментар |
|---|------------------------------|--------|------------------|
${goalRows}

---

## Регрес (якщо є)

| # | Ціль | Попередній статус | Поточний статус | Причина |
|---|------|-------------------|-----------------|---------|
${regressionRows}

---

## Динаміка (порівняння з попереднім goals_check)

${dynamicsSection}

---

## Висновок

**Recommendation:** ${params.verdict}
**Обґрунтування:** ${params.rationale}
`;
}

// =============================================================================
// 8. STEP DEFINITIONS (dual-mode: D2 + D9)
// =============================================================================

export const STEP_D2: StepDefinition = {
  id: "D2",
  block: "development_cycle",
  name: "OBSERVE — Спостереження стану проєкту (легкий режим Goals Check)",
  type: "autonomous",
  role: "programmer",
  purpose:
    "Швидке спостереження стану проєкту для побудови контексту перед плануванням (D3). Артефакт: observe_report.",
  standards: [],

  preconditions: D2_PRECONDITIONS,
  inputs: D2_INPUTS,
  algorithm: D2_ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: "observe_report",
    path_pattern:
      "control_center/audit/observe/observe_report_{date}.md",
    template_id: "observe_report",
  },

  transitions: [
    {
      condition: "Спостереження завершено — перейти до планування",
      target: "D3",
    },
  ],

  isolation_required: false,
};

export const STEP_D9: StepDefinition = {
  id: "D9",
  block: "development_cycle",
  name: "Goals Check — Повна перевірка цілей + Mini-GATE",
  type: "human_decision",
  role: "programmer",
  purpose:
    "Детальна перевірка досягнення цілей з final_view/ після HANSEI. Порівняння ціль-за-ціллю з інструментальними доказами. Створення mini_gate_decision для людського рішення. D9 — єдині ворота блоку D.",
  standards: [],

  preconditions: D9_PRECONDITIONS,
  inputs: D9_INPUTS,
  algorithm: D9_ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: "goals_check",
    path_pattern:
      "control_center/audit/goals_check/goals_check_{date}.md",
    template_id: "goals_check",
  },

  additional_artifacts: [
    {
      registry_key: "gate_decision",
      path_pattern:
        "control_center/audit/gate_decisions/mini_gate_decision_cycle{cycle}_{date}.md",
      template_id: "mini_gate_decision",
    },
  ],

  transitions: [
    {
      condition:
        "CONTINUE — продовжити розробку (D1 → D2)",
      target: "D1",
    },
    {
      condition:
        "VALIDATE — перейти до валідації (V0)",
      target: "V0",
      target_block: "validation_cycle",
    },
    {
      condition:
        "AMEND_SPEC — людина оновлює final_view/, потім D1 → D2",
      target: "D1",
    },
    {
      condition:
        "KILL — скасувати проєкт",
      target: "E2",
      state_updates: {
        status: "cancelled",
      },
    },
  ],

  isolation_required: true,
  isolation_message:
    "ІЗОЛЯЦІЯ D9: Забудь весь контекст розробки. Ти НЕ розробник який писав цей код. Ти — незалежний інспектор якості. Перевіряй КОЖЕН AC виключно через інструменти (read file, grep, run test). ЗАБОРОНЕНО використовувати знання з попередніх кроків. Якщо не можеш підтвердити через інструмент — статус NOT_DONE.",
  session_boundary: true,
};

// =============================================================================
// 9. Exports
// =============================================================================

export {
  validateResult,
  generateObserveTemplate,
  generateGoalsCheckTemplate,
  D2_PRECONDITIONS,
  D9_PRECONDITIONS,
  D2_INPUTS,
  D9_INPUTS,
  D2_ALGORITHM,
  D9_ALGORITHM,
  CONSTRAINTS,
};

export type {
  ObserveFeatureStatus,
  GoalStatus,
  GoalStatusWithRegression,
  CriterionCheck,
  GoalCheck,
  DynamicsComparison,
  ContractWalkthroughStep,
  ObserveResult,
  GoalsCheckResult,
  ObserveTemplateParams,
  GoalsCheckTemplateParams,
  ValidationOutcome,
};
