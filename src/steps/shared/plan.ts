// =============================================================================
// Plan (Unified) — Dual-mode: L8 (Foundation), D3 (Development)
// Конвертовано з: control_center/standards/plans/std-plan.md
// Інструмент: використовується кроками L8 (Foundation Plan), D3 (Development Plan)
// =============================================================================

import type {
  SystemState,
  Block,
  Step,
  PreconditionCheck,
  AlgorithmStep,
  ArtifactKey,
  StepDefinition,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для plan)
// =============================================================================

/** Контекст виконання плану — визначається з current_step */
type PlanContext = "foundation" | "development";

/** Маппінг крок → контекст */
const STEP_TO_CONTEXT: Record<string, PlanContext> = {
  L8: "foundation",
  D3: "development",
};

/** Перевірка Infrastructure Verification (§4 Крок 3.5) */
interface InfraVerificationItem {
  id: string; // I1–I6
  check: string;
  done_criteria: string;
}

/** Етап плану */
interface PlanStage {
  order: number;
  name: string;
  description: string;
  /** Посилання на AC з completion_checklist (Development) або дефект (Audit) */
  reference?: string;
}

/** Test Strategy елемент */
interface TestStrategyItem {
  order: number;
  component: string;
  expected_result: string;
  type: "positive" | "negative";
}

/** Повний результат виконання Plan */
interface PlanResult {
  success: boolean;
  context: PlanContext;
  step: Step;
  stages: PlanStage[];
  test_strategy: TestStrategyItem[];
  infra_verification: InfraVerificationItem[];
  censure_passed: boolean;
  artifact_path: string;
  state_updates: Partial<SystemState>;
  message: string;
  error?: string;
}

/** Вхідні дані для execute() */
interface PlanInput {
  /** Поточний стан системи */
  state: SystemState;
  /** Поточна дата у форматі DD.MM.YY-HH-MM */
  date: string;
  /** Вміст final_view/* */
  final_view_content: string;
  /** Вміст plans/done/ (для уникнення дублювання) */
  completed_plans: string[];
  /** Чи існує completion_checklist.md (Foundation L8 — може не існувати) */
  completion_checklist_exists: boolean;
  /** Вміст completion_checklist.md (якщо існує) */
  completion_checklist?: string;
  /** Чи існує design_spec.md */
  design_spec_exists: boolean;
  /** Development only: observe_report вміст */
  observe_report?: string;
  /** Development only: HANSEI вміст */
  hansei?: string;
  /** Development only: задачі з tasks/done/ */
  tasks_done?: string[];
  /** Development only: validation_conclusions вміст (якщо існує) */
  validation_conclusions?: string;
  /** Development only: номер циклу з cycle_counter.md */
  cycle_number?: number;
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

/** Параметри шаблону Foundation */
interface FoundationTemplateParams {
  date: string;
  stages: PlanStage[];
  test_strategy: TestStrategyItem[];
  has_design_spec: boolean;
}

/** Параметри шаблону Development */
interface DevelopmentTemplateParams {
  date: string;
  iteration: number;
  observe_report_ref: string;
  hansei_ref: string;
  project_state: string;
  focus: string;
  stages: PlanStage[];
  test_strategy: TestStrategyItem[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE)
// =============================================================================

/** Загальні передумови (обидва контексти) */
const PRECONDITIONS_COMMON: PreconditionCheck[] = [
  {
    type: "dir_not_empty",
    path: "control_center/final_view",
    description: "P1: Файли final_view/ існують і не порожні — без маяка планування неможливе",
  },
  {
    type: "dir_empty",
    path: "control_center/plans/active",
    description: "P2: plans/active/ порожній — два активних плани одночасно заборонені",
  },
];

/** Додаткові передумови Foundation (L8) */
const PRECONDITIONS_FOUNDATION: PreconditionCheck[] = [
  {
    type: "state_field",
    field: "current_step",
    expected_value: "L8",
    description: "Foundation: state.json → current_step = L8",
  },
];

/** Додаткові передумови Development (D3) */
const PRECONDITIONS_DEVELOPMENT: PreconditionCheck[] = [
  {
    type: "artifact_registered",
    artifact_key: "observe_report" as ArtifactKey,
    description: "Development: Існує observe_report поточної ітерації (D2 завершено)",
  },
  {
    type: "artifact_registered",
    artifact_key: "hansei" as ArtifactKey,
    description: "Development: Існує HANSEI попередньої ітерації",
  },
];

/** Повний масив передумов (обидва контексти, для export) */
const PRECONDITIONS: PreconditionCheck[] = [
  ...PRECONDITIONS_COMMON,
  ...PRECONDITIONS_FOUNDATION,
  ...PRECONDITIONS_DEVELOPMENT,
];

// =============================================================================
// 3. Constants
// =============================================================================

/** Infrastructure Verification елементи (§4 Крок 3.5) */
const INFRA_VERIFICATION_ITEMS: InfraVerificationItem[] = [
  { id: "I1", check: "Додаток запускається", done_criteria: "npm run dev / docker-compose up — без помилок" },
  { id: "I2", check: "БД підключена", done_criteria: "SELECT 1 повертає результат (або in-memory DB працює)" },
  { id: "I3", check: "Міграції виконані", done_criteria: "Таблиці існують, схема відповідає коду" },
  { id: "I4", check: "Зовнішні API ключі", done_criteria: ".env.local містить всі необхідні змінні (або fallback mode працює)" },
  { id: "I5", check: "Базовий endpoint", done_criteria: "curl http://localhost:[port]/ повертає НЕ 500" },
  { id: "I6", check: "Fallback mode", done_criteria: "Якщо зовнішня залежність недоступна — graceful degradation, а не crash" },
  { id: "I7", check: "B2B Tenant Isolation", done_criteria: "Запит від tenant A не повертає дані tenant B (якщо multi-tenancy)" },
];

/** Маппінг контексту → шаблон назви артефакту */
const ARTIFACT_PATH_PATTERNS: Record<PlanContext, string> = {
  foundation: "control_center/plans/active/plan_foundation_{date}.md",
  development: "control_center/plans/active/plan_dev_{date}.md",
};

/** Кількість етапів за контекстом */
const STAGE_COUNTS: Record<PlanContext, { min: number; max: number }> = {
  foundation: { min: 6, max: 10 }, // 6–10
  development: { min: 5, max: 10 }, // 5–10
};

/** Маппінг контексту → назва для заголовків */
const CONTEXT_LABELS: Record<PlanContext, string> = {
  foundation: "Foundation",
  development: "Development",
};

/** Переходи після збереження плану */
const PLAN_TRANSITIONS: Record<string, { next_step: Step; next_block: Block }> = {
  L8: { next_step: "L9", next_block: "foundation" },
  D3: { next_step: "D4", next_block: "development_cycle" },
};

/** Блоки цензури (§4 Крок 5) */
const CENSURE_BLOCKS = [
  { id: "A", name: "Архітектура", check: "Бритва Оккама, немає надлишкових абстракцій і «на майбутнє»" },
  { id: "B", name: "Безпека", check: "Секрети в .env/HttpOnly Cookies, немає hardcode credentials" },
  { id: "C", name: "Персистентність", check: "Docker-сумісність, crash recovery" },
  { id: "D", name: "Верифікація", check: "Негативні тести, тести доступу" },
  { id: "E", name: "B2B Readiness", check: "Multi-tenancy, RBAC, Onboarding, Billing — якщо B2B Model в project_description" },
] as const;

// =============================================================================
// 4. Algorithm Steps (§4)
// =============================================================================

/** Алгоритм Foundation */
const ALGORITHM_FOUNDATION: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати контекст: final_view/* повністю. Витягнути: призначення продукту, стек, функціональні блоки, нефункціональні вимоги.",
  },
  {
    order: 2,
    instruction:
      "Побудувати модель стану: стан = нульовий. Визначити склад фундаменту: структура репозиторію, базова архітектура, середовище, фундаментальні тести, підготовка до розвитку.",
    substeps: [
      "2a. ARCHITECTURE DECISION (ОБОВ'ЯЗКОВО): прийняти та зафіксувати конкретні архітектурні рішення ДО формування етапів:",
      "— Файлова структура: feature-based (src/features/auth/, src/features/leads/) АБО layer-based (src/controllers/, src/services/, src/models/). Обрати ОДНУ.",
      "— Module boundaries: кожен модуль/feature має чіткий public API (index.ts / barrel export). Прямі імпорти з внутрішніх файлів іншого модуля ЗАБОРОНЕНІ.",
      "— State management pattern: local state, context, zustand, redux — обрати ОДИН підхід для UI state.",
      "— API pattern: REST + fetch, tRPC, GraphQL — обрати ОДИН.",
      "— Рішення записується у ПЕРШУ секцію плану як 'Architecture Decisions'. Етапи B-F ОБОВ'ЯЗКОВО слідують цим рішенням.",
      "— ANTIPATTERN: 'визначимо пізніше' або 'гнучка архітектура' = ЗАБОРОНЕНО. Кожне рішення — конкретне.",
      "— B2B Architecture (якщо B2B Model в project_description.md):",
      "  — Multi-tenancy strategy: tenant-per-schema / shared-table-with-tenant_id / separate-DB. Обрати ОДНУ.",
      "  — Auth model: SSO/SAML support, team invites, role hierarchy (owner→admin→member→viewer)",
      "  — Data isolation: tenant data NEVER leaks between tenants. Row-Level Security або middleware filter.",
      "  — Onboarding flow: empty states → guided setup → first value. Визначити кроки.",
      "  — Billing integration point: Stripe subscription з per-seat / usage metering.",
    ],
  },
  {
    order: 3,
    instruction:
      "Сформувати 6–10 етапів. Етап A = Infrastructure (I1–I6). Останній етап = Design Foundation (якщо є design_spec.md). Кожен етап прив'язаний до конкретних P0/P1 AC.",
    substeps: [
      "Кожен етап ОБОВ'ЯЗКОВО містить: назва (коротка, іменник), AC_IDs які покриваються, опис (3–5 речень що реалізувати), scope (модулі, файли, компоненти які торкає).",
      "1 великий функціональний блок (>3 файлів) → 2+ етапи. Кілька дрібних AC (1–2 файли) → можна об'єднати.",
      "P0 COVERAGE (ОБОВ'ЯЗКОВО): кожен P0 AC повинен мати відповідний етап. P0 AC без покриття = порушення. P1/P2 можуть чекати D-cycle.",
      "Етап A = Infrastructure Verification (I1–I6). Обов'язково перший.",
      "Останній етап = Design Foundation (якщо є design_spec.md). Якщо design_spec.md НЕ існує — етап не обов'язковий, 5 етапів допустимо.",
      "Логічна послідовність: кожен наступний будується на попередньому.",
    ],
  },
  {
    order: 4,
    instruction:
      "Test Strategy: визначити системні тести після виконання. Мінімум: тест запуску додатку, тест API (якщо є), тест БД (якщо є), тести на відмову (невалідні дані, збої).",
  },
  {
    order: 5,
    instruction:
      "Верифікація за Технічною Цензурою (std-technical-censure.md): перевірити КОЖЕН етап за блоками A–E. Якщо порушення — переформувати етап. Збереження з порушеннями ЗАБОРОНЕНО.",
    substeps: [
      "A — Архітектура: Бритва Оккама, немає надлишкових абстракцій.",
      "B — Безпека: секрети в .env/HttpOnly Cookies, немає hardcode credentials.",
      "C — Персистентність: Docker-сумісність, crash recovery.",
      "D — Верифікація: негативні тести, тести доступу.",
      "E — B2B Readiness: якщо B2B Model — multi-tenancy, RBAC, onboarding, billing.",
      "Design Compliance: якщо є design_spec.md — кожен UI-етап посилається на конкретну секцію.",
    ],
  },
  {
    order: 6,
    instruction:
      "Самоперевірка: етапи спрямовані на фундамент? перший етап = Infrastructure Verification (I1–I6)? логічна послідовність? немає дублювання з plans/done/? узгоджений з final_view/? Test Strategy з тестами на відмову? цензура пройдена?",
  },
  {
    order: 7,
    instruction:
      "Зберегти артефакт: control_center/plans/active/plan_foundation_DD.MM.YY-HH-MM.md. Якщо файл з такою датою вже існує — додати суфікс _2, _3.",
  },
];

/** Алгоритм Development */
const ALGORITHM_DEVELOPMENT: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати контекст: final_view/* (цілі продукту), observe_report (поточний стан vs цілі), HANSEI (уроки), plans/done/ (що зроблено), tasks/done/ (обсяг реалізованого), cycle_counter.md (номер циклу). Якщо є validation_conclusions — зчитати: план формується ТІЛЬКИ на основі дефектів звідти.",
    substeps: [
      "Зчитати final_view/* — цілі продукту.",
      "Зчитати observe_report — поточний стан vs цілі.",
      "Зчитати HANSEI — уроки попередньої ітерації.",
      "Зчитати plans/done/ — що вже зроблено.",
      "Зчитати заголовки задач з tasks/done/ — обсяг реалізованого.",
      "Зчитати номер циклу з cycle_counter.md.",
      "Якщо існує validation_conclusions — план ТІЛЬКИ на основі дефектів. Нові AC заборонені.",
    ],
  },
  {
    order: 2,
    instruction:
      "Побудувати модель стану: які цілі досягнуті, які залишились, які уроки HANSEI врахувати, які розбіжності з observe_report. B2B Health Check: якщо project_description містить B2B Model — перевірити наявність multi-tenancy, RBAC, onboarding flow, billing integration в поточному стані. Відсутні B2B компоненти → додати до scope (якщо не audit). Якщо є validation_conclusions — scope обмежується ТІЛЬКИ виправленням дефектів. Audit: для кожного дефекту знайти кореневу причину з hansei_audit, згрупувати за причинами, CRITICAL — першочергово.",
  },
  {
    order: 3,
    instruction:
      "Scope Floor Check (§4 Крок 2a): захист від колапсу scope. План виключно з косметичних/CSS задач = BLOCK якщо є AC з contract_matches/runtime_check/output_matches/value_delivers без доказу runtime.",
    substeps: [
      "Переглянути observe_report — скільки характеристик «Реалізовано».",
      "Переглянути completion_checklist.md — чи є AC з критеріями contract_matches/runtime_check/output_matches/value_delivers.",
      "Чи є доказ виконання цих критеріїв в попередньому goals_check?",
      "Якщо є AC без доказу runtime → план ОБОВ'ЯЗКОВО включає етап Integration Flow Verification.",
      "Якщо observe 0 NOT_DONE AC і план тільки cosmetic → додати Integration Flow Test + перевірку імпортів компонентів.",
    ],
  },
  {
    order: 4,
    instruction:
      "Сформувати 5–10 етапів. Кожен етап прив'язаний до конкретного AC або групи пов'язаних AC з completion_checklist за пріоритетом (P0 first). Якщо один AC великий (>3 файлів або >2 модулів) — розбити на кілька етапів. Якщо validation_conclusions → кожен етап = група дефектів за кореневою причиною, CRITICAL → перші етапи. Перший етап починається з Infrastructure Verification (I1–I5).",
    substeps: [
      "Кожен етап ОБОВ'ЯЗКОВО містить: назва (коротка, іменник), AC_IDs або дефекти які покриваються, опис (3–5 речень що саме реалізувати/змінити), scope (перелік конкретних модулів, компонентів або файлів які торкає етап).",
      "1 великий AC (>3 файлів або >2 модулів) → 2+ етапи. Кілька дрібних AC (1–2 файли кожен) → можна об'єднати в один етап.",
      "Логічна послідовність: кожен наступний будується на попередньому.",
      "Перший етап включає перевірку I1–I5. Якщо FAIL — виправлення як блокуюча передумова.",
      "Audit: кожна коренева причина з validation_conclusions = окремий етап, CRITICAL першими. Якщо >10 груп → об'єднати споріднені до ≤10.",
      "B2B Coverage: якщо є B2B Model — хоча б один етап покриває multi-tenancy або onboarding або billing. Тільки CSS/UI етапи без B2B coverage для B2B проекту = BLOCK.",
    ],
  },
  {
    order: 5,
    instruction:
      "Test Strategy: визначити системні тести після виконання. Мінімум: тест ключового API/ендпоінту, тест БД (якщо є), тести на відмову.",
  },
  {
    order: 6,
    instruction:
      "Верифікація за Технічною Цензурою (std-technical-censure.md): перевірити КОЖЕН етап за блоками A–E. Якщо порушення — переформувати. Збереження з порушеннями ЗАБОРОНЕНО. Design Compliance: кожен UI-етап посилається на конкретну секцію design_spec.md.",
  },
  {
    order: 7,
    instruction:
      "Самоперевірка: етапи спрямовані на нарощування/виправлення? перший етап = Infrastructure Verification? логічна послідовність? немає дублювання? план узгоджений з final_view? Test Strategy з тестами на відмову? цензура пройдена? HANSEI уроки враховані? observe розбіжності адресовані? Якщо validation_conclusions — кожен CRITICAL/MAJOR покритий, нових AC не додано?",
  },
  {
    order: 8,
    instruction:
      "Зберегти артефакт: control_center/plans/active/plan_dev_DD.MM.YY-HH-MM.md. Якщо файл з такою датою вже існує — додати суфікс _2, _3.",
  },
];

// =============================================================================
// 5. Constraints (§8 Обмеження — 11 правил)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено створювати задачі — це наступний крок (L9 / D4).",
  "Заборонено виконувати план — це крок після задач (L10 / D5).",
  "Заборонено змінювати final_view/ — маяк незмінний.",
  "Заборонено мати більше одного плану в plans/active/.",
  "Заборонено зберігати план без цензури.",
  "Заборонено додавати деталі реалізації (код, конфіги, команди).",
  "Заборонено вигадувати вимоги, яких немає в final_view/.",
  "Заборонено дублювати вже виконані етапи.",
  "Заборонено ігнорувати уроки HANSEI.",
  "Заборонено при наявності validation_conclusions додавати нові фічі, які не пов'язані з виявленими дефектами. Виправлення дефекту може включати реалізацію функціоналу, якщо дефект = «функціонал відсутній» (AC NOT_MET) — тільки виправлення дефектів.",
  "Foundation: Заборонено використовувати історію — Plan 0 не має попередників.",
];

// =============================================================================
// 6. Step Definitions (dual-mode)
// =============================================================================

/** L8: Foundation Plan — Нульовий план */
export const STEP_L8: StepDefinition = {
  id: "L8",
  block: "foundation",
  name: "Нульовий план (Foundation Plan)",
  type: "autonomous",
  role: "architect",
  purpose: "Формування першого плану фундаменту проєкту на основі final_view/ без історії.",
  standards: [],
  preconditions: [
    ...PRECONDITIONS_COMMON,
    ...PRECONDITIONS_FOUNDATION,
  ],
  inputs: [
    { source: "directory", path: "control_center/final_view", description: "Опис продукту (маяк) — незмінний орієнтир", required: true },
  ],
  algorithm: ALGORITHM_FOUNDATION,
  constraints: [
    ...CONSTRAINTS,
  ],
  artifact: {
    registry_key: "plan",
    path_pattern: "control_center/plans/active/plan_foundation_{date}.md",
    template_id: "plan_foundation",
  },
  transitions: [
    { condition: "План збережено, цензура пройдена", target: "L9" },
  ],
  isolation_required: false,
};

/** D3: Development Plan — План розвитку */
export const STEP_D3: StepDefinition = {
  id: "D3",
  block: "development_cycle",
  name: "План розвитку (Development Plan)",
  type: "autonomous",
  role: "architect",
  purpose: "Ітеративне планування розвитку або виправлення дефектів після аудиту на основі observe_report, HANSEI та validation_conclusions.",
  standards: [],
  preconditions: [
    ...PRECONDITIONS_COMMON,
    ...PRECONDITIONS_DEVELOPMENT,
  ],
  inputs: [
    { source: "directory", path: "control_center/plans/done", description: "ТІЛЬКИ list_dir (назви файлів) — НЕ читати вміст. Потрібно для уникнення дублювання з попередніми планами.", required: true },
    { source: "artifact", artifact_key: "observe_report", description: "Observe report поточної ітерації (D2 завершено) — ГОЛОВНЕ ДЖЕРЕЛО КОНТЕКСТУ", required: true },
    { source: "artifact", artifact_key: "hansei", description: "HANSEI попередньої ітерації — уроки", required: true },
    { source: "artifact", artifact_key: "validation_conclusions", description: "Validation conclusions (якщо існує) — scope обмежується ТІЛЬКИ виправленням дефектів", required: false },
    { source: "file", path: "control_center/system_state/cycle_counter.md", description: "Номер циклу", required: false },
    { source: "file", path: "control_center/final_view/block_summary_foundation.md", description: "Компактний підсумок Foundation (<500 токенів) — швидкий контекст замість перечитування всіх артефактів", required: false },
  ],
  algorithm: ALGORITHM_DEVELOPMENT,
  constraints: [
    ...CONSTRAINTS,
  ],
  artifact: {
    registry_key: "plan",
    path_pattern: "control_center/plans/active/plan_dev_{date}.md",
    template_id: "plan_development",
  },
  transitions: [
    { condition: "План збережено, цензура пройдена", target: "D4" },
  ],
  isolation_required: false,
};

// =============================================================================
// 7. Helpers
// =============================================================================

/** Визначити контекст плану з поточного кроку */
function resolveContext(step: Step): PlanContext | null {
  return STEP_TO_CONTEXT[step] ?? null;
}

/** Побудувати шлях до артефакту */
function resolveArtifactPath(context: PlanContext, date: string, suffix?: number): string {
  const base = ARTIFACT_PATH_PATTERNS[context].replace("{date}", date);
  if (suffix && suffix > 1) {
    return base.replace(".md", `_${suffix}.md`);
  }
  return base;
}

/** Перевірити кількість етапів за контекстом */
function validateStageCount(context: PlanContext, count: number): { valid: boolean; message: string } {
  const { min, max } = STAGE_COUNTS[context];
  if (context === "foundation" && count >= 5 && count < STAGE_COUNTS[context].min) {
    // 5 допустимо якщо design_spec.md не існує
    return { valid: true, message: "5 етапів допустимо (design_spec.md не існує)" };
  }
  if (count < min || count > max) {
    return {
      valid: false,
      message: `${CONTEXT_LABELS[context]} потребує ${min}–${max} етапів, є: ${count}`,
    };
  }
  return { valid: true, message: "OK" };
}

/** Перевірити чи план містить Infrastructure Verification */
function hasInfraVerification(stages: PlanStage[]): boolean {
  if (stages.length === 0) return false;
  const first = stages[0];
  // Перший етап повинен містити згадку інфраструктури
  const keywords = ["infrastructure", "інфраструктур", "I1", "I2", "I3", "запуск", "launch"];
  const text = `${first.name} ${first.description}`.toLowerCase();
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

/** Перевірити Scope Floor — чи план не колапсував у cosmetic-only (§4 Крок 2a) */
function checkScopeFloor(input: {
  stages: PlanStage[];
  has_unproven_runtime_ac: boolean;
  observe_all_done: boolean;
}): { passed: boolean; message: string } {
  const { stages, has_unproven_runtime_ac, observe_all_done } = input;

  // Перевірити чи всі етапи — cosmetic
  const cosmeticKeywords = ["css", "color", "token", "aria", "style", "font", "cosmetic", "spacing"];
  const allCosmetic = stages.every((s) => {
    const text = `${s.name} ${s.description}`.toLowerCase();
    return cosmeticKeywords.some((kw) => text.includes(kw));
  });

  if (has_unproven_runtime_ac && allCosmetic) {
    return {
      passed: false,
      message: "BLOCK: План виключно cosmetic/CSS, але є AC з contract_matches/runtime_check без доказу runtime. Потрібен Integration Flow Verification.",
    };
  }

  if (observe_all_done && allCosmetic) {
    return {
      passed: false,
      message: "BLOCK: observe показує 0 NOT_DONE AC і план тільки cosmetic. Розширити scope: Integration Flow Test + перевірка імпортів.",
    };
  }

  return { passed: true, message: "OK" };
}

/** Визначити перехід після збереження плану */
function resolveTransition(
  step: Step,
): { next_step: Step; next_block: Block; state_updates: Partial<SystemState> } {
  const transition = PLAN_TRANSITIONS[step];
  if (!transition) {
    return {
      next_step: step,
      next_block: "foundation" as Block,
      state_updates: {},
    };
  }

  return {
    next_step: transition.next_step,
    next_block: transition.next_block,
    state_updates: {
      current_block: transition.next_block,
      current_step: transition.next_step,
      status: "in_progress",
      last_completed_step: step,
    },
  };
}

// =============================================================================
// 8. Main Execute Function
// =============================================================================

/**
 * Головна точка входу Plan.
 * Виконує алгоритм планування: зчитує контекст, будує модель стану, формує етапи.
 */
function execute(input: PlanInput): PlanResult {
  const { state, date, final_view_content, validation_conclusions } = input;

  // Крок 1: Визначити контекст
  const context = resolveContext(state.current_step);
  if (!context) {
    return {
      success: false,
      context: "foundation",
      step: state.current_step,
      stages: [],
      test_strategy: [],
      infra_verification: [],
      censure_passed: false,
      artifact_path: "",
      state_updates: {},
      message: "",
      error: `Поточний крок ${state.current_step} не є Plan кроком. Очікується L8 або D3.`,
    };
  }

  // POKA-YOKE P1: final_view не порожній
  if (!final_view_content || final_view_content.trim().length === 0) {
    return {
      success: false,
      context,
      step: state.current_step,
      stages: [],
      test_strategy: [],
      infra_verification: [],
      censure_passed: false,
      artifact_path: "",
      state_updates: {},
      message: "",
      error: "P1: final_view/ порожній або не існує. Без маяка планування неможливе.",
    };
  }

  // Development-специфічні перевірки
  if (context === "development") {
    if (!input.observe_report) {
      return {
        success: false,
        context,
        step: state.current_step,
        stages: [],
        test_strategy: [],
        infra_verification: [],
        censure_passed: false,
        artifact_path: "",
        state_updates: {},
        message: "",
        error: "Development: observe_report не існує. D2 не завершено.",
      };
    }
    if (!input.hansei) {
      return {
        success: false,
        context,
        step: state.current_step,
        stages: [],
        test_strategy: [],
        infra_verification: [],
        censure_passed: false,
        artifact_path: "",
        state_updates: {},
        message: "",
        error: "Development: HANSEI попередньої ітерації не існує.",
      };
    }
  }

  // Артефакт
  const artifactPath = resolveArtifactPath(context, date);

  // Перехід
  const transition = resolveTransition(state.current_step);

  // Формуємо повідомлення
  const hasVC = context === "development" && !!validation_conclusions;
  const scopeNote = hasVC
    ? " Scope обмежено validation_conclusions — тільки виправлення дефектів."
    : "";

  const message = `План (${CONTEXT_LABELS[context]}) сформовано. Артефакт: ${artifactPath}. Перехід до ${transition.next_step}.${scopeNote}`;

  // State updates
  const stateUpdates: Partial<SystemState> = {
    ...transition.state_updates,
    last_artifact: artifactPath,
  };

  return {
    success: true,
    context,
    step: state.current_step,
    stages: [], // Агент заповнює на основі зібраних даних
    test_strategy: [],
    infra_verification: INFRA_VERIFICATION_ITEMS,
    censure_passed: false, // Агент підтверджує після перевірки
    artifact_path: artifactPath,
    state_updates: stateUpdates,
    message,
  };
}

// =============================================================================
// 9. Validation (§6 Критерії прийнятності)
// =============================================================================

/** Валідувати результат Plan */
function validateResult(result: PlanResult): ValidationOutcome {
  const issues: string[] = [];

  if (!result.success) {
    issues.push("План не сформовано успішно.");
    return { valid: false, issues };
  }

  // §6.1: Зчитані всі обов'язкові вхідні дані контексту
  // (Перевіряється при виклику execute)

  // §6.2: Перший етап = Infrastructure Verification (I1–I6)
  if (!hasInfraVerification(result.stages)) {
    issues.push("Перший етап не містить Infrastructure Verification (I1–I6).");
  }

  // §6.3: Кількість етапів відповідає контексту
  const stageCheck = validateStageCount(result.context, result.stages.length);
  if (!stageCheck.valid) {
    issues.push(stageCheck.message);
  }

  // §6.4: Кожен етап — стратегічний рівень, без деталей реалізації
  for (const stage of result.stages) {
    if (stage.description.length < 10) {
      issues.push(`Етап ${stage.order} "${stage.name}" — опис занадто короткий (має бути 3–5 речень).`);
    }
  }

  // §6.5: Test Strategy присутня з тестами на відмову
  if (result.test_strategy.length === 0) {
    issues.push("Test Strategy порожня — потрібні мінімум тести запуску та тести на відмову.");
  } else {
    const hasNegative = result.test_strategy.some((t) => t.type === "negative");
    if (!hasNegative) {
      issues.push("Test Strategy не містить тестів на відмову (negative).");
    }
  }

  // §6.6: Цензура за std-technical-censure.md пройдена
  if (!result.censure_passed) {
    issues.push("Цензура за std-technical-censure.md не пройдена або не підтверджена.");
  }

  // §6.7: Немає дублювання з виконаними планами
  // (Перевіряється агентом при формуванні)

  // §6.8: План узгоджений з маяком (final_view/)
  // (Перевіряється агентом при формуванні)

  // §6.9: Артефакт за правильним шляхом
  if (!result.artifact_path) {
    issues.push("Артефакт не створений (шлях порожній).");
  }

  return { valid: issues.length === 0, issues };
}

// =============================================================================
// 10. Template — Foundation Plan (§A)
// =============================================================================

/** Генерує шаблон Foundation плану */
function generateFoundationTemplate(params: FoundationTemplateParams): string {
  const { date, stages, test_strategy, has_design_spec } = params;

  let stagesText = "";
  const labels = ["A", "B", "C", "D", "E", "F"];
  for (const stage of stages) {
    const label = labels[stage.order - 1] ?? String(stage.order);
    stagesText += `## Etap ${label} — ${stage.name}
${stage.description}

`;
  }

  // Якщо design_spec і немає 6-го етапу — нотатка
  if (!has_design_spec && stages.length < 6) {
    stagesText += `> _Примітка: Етап F (Design Foundation) відсутній — design_spec.md не існує._

`;
  }

  // Test Strategy
  let testTable = `## Test Strategy
| # | Що перевіряється | Очікуваний результат | Тип |
|---|-----------------|---------------------|-----|
`;
  if (test_strategy.length > 0) {
    for (const t of test_strategy) {
      testTable += `| ${t.order} | ${t.component} | ${t.expected_result} | ${t.type === "positive" ? "Позитивний" : "Негативний"} |\n`;
    }
  } else {
    testTable += `| 1 | [Компонент/сценарій] | [Результат] | Позитивний |
| 2 | [Сценарій відмови] | [Поведінка при відмові] | Негативний |
`;
  }

  return `# Plan Foundation — ${date}

${stagesText}${testTable}`;
}

/** Генерує шаблон Development плану */
function generateDevelopmentTemplate(params: DevelopmentTemplateParams): string {
  const { date, iteration, observe_report_ref, hansei_ref, project_state, focus, stages, test_strategy } = params;

  let stagesText = "";
  const labels = ["A", "B", "C", "D", "E"];
  for (const stage of stages) {
    const label = labels[stage.order - 1] ?? String(stage.order);
    const refText = stage.reference ? ` (${stage.reference})` : "";
    stagesText += `## Etap ${label} — ${stage.name}
${stage.description}${refText}

`;
  }

  // Test Strategy
  let testTable = `## Test Strategy
[Які системні тести повинні існувати після виконання]
`;
  if (test_strategy.length > 0) {
    testTable = `## Test Strategy
| # | Що перевіряється | Очікуваний результат | Тип |
|---|-----------------|---------------------|-----|
`;
    for (const t of test_strategy) {
      testTable += `| ${t.order} | ${t.component} | ${t.expected_result} | ${t.type === "positive" ? "Позитивний" : "Негативний"} |\n`;
    }
  }

  return `# Plan Dev ${date}

## Контекст ітерації
- **Ітерація №:** ${iteration}
- **Observe report:** ${observe_report_ref}
- **HANSEI:** ${hansei_ref}
- **Стан проекту:** ${project_state}
- **Фокус ітерації:** ${focus}

${testTable}

${stagesText}## Верифікація цензури
- [ ] Архітектурна цензура пройдена
- [ ] Технічна безпека перевірена
- [ ] Виробничий реалізм підтверджено
- [ ] Негативне тестування передбачено
`;
}

// =============================================================================
// 11. Edge Cases (§B)
// =============================================================================

const EDGE_CASES: string[] = [
  "Foundation: design_spec.md не існує — Етап F не обов'язковий, 5 етапів допустимо.",
  "Development: observe вказує 0 прогресу — перевірити реальний стан через інструменти, план адресує базові блокери.",
  "Audit: >5 груп дефектів (при validation_conclusions) — об'єднати за логікою до ≤5 етапів, CRITICAL першими.",
  "HANSEI вказує на системну проблему — етап має бути системним (архітектурна зміна), не локальним патчем.",
  "Конфлікт між HANSEI та observe — пріоритет: факти observe > інтерпретації HANSEI.",
];

// =============================================================================
// 12. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Валідація
  validateResult,
  // Хелпери
  resolveContext,
  resolveArtifactPath,
  resolveTransition,
  validateStageCount,
  hasInfraVerification,
  checkScopeFloor,
  // Templates
  generateFoundationTemplate,
  generateDevelopmentTemplate,
  // Дані
  PRECONDITIONS,
  PRECONDITIONS_COMMON,
  PRECONDITIONS_FOUNDATION,
  PRECONDITIONS_DEVELOPMENT,
  ALGORITHM_FOUNDATION,
  ALGORITHM_DEVELOPMENT,
  CONSTRAINTS,
  EDGE_CASES,
  INFRA_VERIFICATION_ITEMS,
  ARTIFACT_PATH_PATTERNS,
  CONTEXT_LABELS,
  PLAN_TRANSITIONS,
  STAGE_COUNTS,
  CENSURE_BLOCKS,
};

// Re-export типів
export type {
  PlanContext,
  PlanInput,
  PlanResult,
  PlanStage,
  TestStrategyItem,
  InfraVerificationItem,
  FoundationTemplateParams,
  DevelopmentTemplateParams,
  ValidationOutcome,
};
