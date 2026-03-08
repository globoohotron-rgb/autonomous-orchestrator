// =============================================================================
// HANSEI — Структурована рефлексія (L11/L12, D7/D8, V3)
// Конвертовано з: control_center/standards/audit/std-hansei.md
// Інструмент: використовується кроками L11 (Foundation, merged L12), D7 (Development, merged D8), V3 (Audit)
// =============================================================================

import type {
  SystemState,
  Status,
  Block,
  Step,
  PreconditionCheck,
  AlgorithmStep,
  ArtifactKey,
  DefectSeverity,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для hansei)
// =============================================================================

/** Контекст виконання HANSEI — визначається з current_step */
type HanseiContext = "foundation" | "dev" | "audit";

/** Маппінг крок → контекст */
const STEP_TO_CONTEXT: Record<string, HanseiContext> = {
  L11: "foundation",
  L12: "foundation",
  D7: "dev",
  D8: "dev",
  V3: "audit",
};

/** Елемент блоку A — Plan vs Reality */
interface PlanVsRealityItem {
  order: number;
  plan_item: string;
  status: "completed" | "deviation";
  deviation?: string;
}

/** Елемент блоку B — Проблема */
interface ProblemItem {
  order: number;
  problem: string;
  source_file: string;
  root_cause: string; // Ланцюжок "Чому? → Чому?" мінімум 2 рівні
}

/** Блок C — Якість задач */
interface TaskQualityBlock {
  unclear_tasks: string[];
  incomplete_acceptance_criteria: string[];
  unaccounted_dependencies: string[];
}

/** Тренд (блок D) */
interface TrendItem {
  description: string;
  is_recurring: boolean; // true = ⚠ ТРЕНД
}

/** Рекомендація (блок E) */
interface RecommendationItem {
  order: number;
  recommendation: string; // Формат: "Зробити X замість Y"
  references_problem: string; // "Блок B, #N" / "Блок C" / "Блок D"
}

/** Елемент блоку F — Сліпа зона */
interface BlindSpotItem {
  id: string; // F1–F5
  question: string;
  answer: string; // Конкретний факт
}

/** Повний результат HANSEI */
interface HanseiResult {
  success: boolean;
  context: HanseiContext;
  step: Step;
  plan_vs_reality: PlanVsRealityItem[];
  problems: ProblemItem[];
  jidoka_stops: { occurred: boolean; details: string };
  task_quality: TaskQualityBlock;
  trends: TrendItem[];
  recommendations: RecommendationItem[];
  blind_spots: BlindSpotItem[];
  artifact_path: string;
  /** Тільки V3: шлях до validation_conclusions */
  validation_conclusions_path?: string;
  /** Тільки V3: шлях до файлу рішення */
  v3_decision_path?: string;
  state_updates: Partial<SystemState>;
  message: string;
  error?: string;
}

/** Вхідні дані для execute() */
interface HanseiInput {
  /** Поточний стан системи */
  state: SystemState;
  /** Поточна дата у форматі DD.MM.YY-HH-MM */
  date: string;
  /** Завершений план (назва/шлях) */
  completed_plan: string;
  /** Задачі з tasks/done/[Назва плану]/ */
  completed_tasks: Array<{ name: string; status: string; problems: string[] }>;
  /** Issues з issues/done/ та issues/active/ */
  issues: Array<{ name: string; description: string; resolved: boolean }>;
  /** Попередній HANSEI (з prev_cycle_artifacts.hansei) */
  previous_hansei?: string | null;
  /** Тільки V3: Звіт аудиту (з artifacts.acceptance_report) */
  acceptance_report?: string | null;
  /** Тільки V3: кількість CRITICAL, MAJOR, MINOR дефектів */
  defect_counts?: { critical: number; major: number; minor: number };
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

/** Параметри шаблону */
interface HanseiTemplateParams {
  context: HanseiContext;
  date: string;
  step: string;
  plan_name: string;
  iteration?: number;
  plan_vs_reality: PlanVsRealityItem[];
  problems: ProblemItem[];
  jidoka_stops: { occurred: boolean; details: string };
  task_quality: TaskQualityBlock;
  trends: TrendItem[];
  recommendations: RecommendationItem[];
  blind_spots: BlindSpotItem[];
}

/** Параметри шаблону validation_conclusions (V3 only) */
interface ValidationConclusionsTemplateParams {
  date: string;
  attempt_number: number;
  acceptance_report_path: string;
  hansei_path: string;
  defects: Array<{
    order: number;
    description: string;
    category: DefectSeverity;
    root_cause: string;
    priority: string;
  }>;
  additional_observations: string;
}

/** Параметри шаблону v3_decision */
interface V3DecisionTemplateParams {
  date: string;
  defect_summary: string;
  validation_attempts: number;
  validation_conclusions_path: string;
  smoke_test_result: string;
  open_questions: string;
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 4 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "dir_empty",
    path: "control_center/tasks/active",
    description: "P2: tasks/active/ порожній — немає невиконаних задач",
  },
  {
    type: "artifact_registered",
    artifact_key: "plan" as ArtifactKey,
    description: "P1: План переміщено у plans/done/ (спочатку завершити план через L11/D7)",
  },
  {
    type: "file_exists",
    description: "P3 (V3 only): acceptance_report існує в audit/ — аудит завершено",
  },
  {
    type: "state_field",
    field: "current_step",
    description: "P4 (V3 only): рішення V2 = FAIL — HANSEI аудиту виконується тільки при провалі (current_step = V3)",
  },
];

// =============================================================================
// 3. Constants
// =============================================================================

/** Маппінг контексту → шаблон назви артефакту */
const ARTIFACT_PATH_PATTERNS: Record<HanseiContext, string> = {
  foundation: "control_center/audit/hansei/hansei_foundation_{date}.md",
  dev: "control_center/audit/hansei/hansei_dev_{date}.md",
  audit: "control_center/audit/hansei/hansei_audit_{date}.md",
};

/** Маппінг контексту → назва контексту для заголовка */
const CONTEXT_LABELS: Record<HanseiContext, string> = {
  foundation: "Foundation",
  dev: "Development",
  audit: "Audit",
};

/** Переходи після HANSEI для кожного кроку */
const HANSEI_TRANSITIONS: Record<string, { next_step: Step; next_block: Block }> = {
  L11: { next_step: "L13", next_block: "foundation" },
  L12: { next_step: "L13", next_block: "foundation" },
  D7: { next_step: "D9", next_block: "development_cycle" },
  D8: { next_step: "D9", next_block: "development_cycle" },
  // V3 має спеціальну логіку переходу (§4.6)
};

/** Обов'язкові питання блоку F (сліпі зони) */
const BLIND_SPOT_QUESTIONS: Array<{ id: string; question: string }> = [
  {
    id: "F1",
    question:
      "Які user flows з behavior_spec.md НЕ мали runtime перевірки (реальний HTTP, curl, браузер)?",
  },
  {
    id: "F2",
    question:
      "Які client↔server з'єднання не перевірені на field match (field names клієнта = field names сервера)?",
  },
  {
    id: "F3",
    question:
      "Мертві компоненти: чи є файли в components/ що не імпортуються жодною сторінкою?",
  },
  {
    id: "F4",
    question:
      "Stubs/placeholder код: alert(), 'coming soon', TODO, FIXME в app/ та server/src/?",
  },
  {
    id: "F5",
    question:
      "% тестів shallow mock vs integration? Якщо >70% мокі — це ризик.",
  },
];

/** Заборонені фрази у HANSEI (сикофансія — §7 #3) */
const FORBIDDEN_PHRASES: string[] = [
  "в цілому добре",
  "загалом успішно",
  "без суттєвих проблем",
];

// =============================================================================
// 4. Algorithm Steps (§4)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Визначити контекст: зчитати state.json → current_step. L12 → foundation, D8 → dev, V3 → audit.",
  },
  {
    order: 2,
    instruction:
      "Зібрати фактичні дані: відкрити завершений план з plans/done/, зафіксувати кожен пункт плану.",
    substeps: [
      "Відкрити всі задачі з tasks/done/[Назва плану]/. Для кожної: статус, проблеми, час.",
      "Відкрити всі issues з issues/done/ та issues/active/ що стосуються цього плану.",
      "V3: Відкрити acceptance_report — зафіксувати кожен дефект.",
      "Якщо prev_cycle_artifacts.hansei не null — зчитати попередній hansei для порівняння трендів.",
    ],
  },
  {
    order: 3,
    instruction:
      "Блок B (Проблеми) заповнюється ПЕРШИМ. Якщо issues існують — вони ОБОВ'ЯЗКОВО перелічені. Для кожної проблеми — ланцюжок 'Чому?' мінімум 2 рівні.",
  },
  {
    order: 4,
    instruction:
      "Блок A (План vs Реальність): для кожного пункту плану — виконано точно чи відхилення.",
  },
  {
    order: 5,
    instruction:
      "Блок C (Якість задач): нечіткі задачі, неповні acceptance criteria, невраховані залежності.",
  },
  {
    order: 6,
    instruction:
      "Блок D (Тренди): порівняти з попередніми HANSEI. Повторювана проблема = ⚠ ТРЕНД.",
  },
  {
    order: 7,
    instruction:
      "Блок E (Уроки): конкретні дії формату 'Зробити X замість Y'. Кожна рекомендація — посилання на проблему з B–D.",
  },
  {
    order: 8,
    instruction:
      "Блок F (Сліпі зони) — ОБОВ'ЯЗКОВИЙ. Відповісти на 5 питань з конкретними фактами. HANSEI без блоку F = порушення стандарту.",
    substeps: [
      "F1: Які user flows НЕ перевірялись runtime?",
      "F2: Які client↔server з'єднання не перевірені на field match?",
      "F3: Мертві компоненти (components/ без імпорту)?",
      "F4: Stubs: alert(), 'coming soon', TODO, FIXME?",
      "F5: % тестів shallow mock vs integration?",
    ],
  },
  {
    order: 9,
    instruction:
      "Сформувати артефакт за шаблоном (секція A). Зберегти: L12 → hansei_foundation_DD.MM.YY-HH-MM.md, D8 → hansei_dev_DD.MM.YY-HH-MM.md, V3 → hansei_audit_DD.MM.YY-HH-MM.md.",
  },
  {
    order: 10,
    instruction:
      "V3 only: Створити validation_conclusions_DD.MM.YY-HH-MM.md за шаблоном (секція A.2). Scope наступного плану ТІЛЬКИ виправлення дефектів. Нові AC заборонені.",
  },
  {
    order: 11,
    instruction:
      "Оновити state.json: last_completed_step → поточний крок, last_artifact → шлях до hansei.",
  },
  {
    order: 12,
    instruction:
      "V3 only (§4.6): Створити файл рішення v3_decision_DD.MM.YY-HH-MM.md. Оновити state: current_block → development_cycle, current_step → D1, status → awaiting_human_decision. ЗУПИНИТИСЯ.",
    substeps: [
      "Якщо файл з такою датою вже існує — додати суфікс: v3_decision_DD.MM.YY-HH-MM.2.md.",
      "cycle_counter.md НЕ скидується — лічильник тільки зростає.",
      "Повідомити людину: 'V3 завершено. Файл рішення створено. Заповніть рішення для продовження.'",
      "При наступному запуску D1 автоматично обробить рішення через Крок 0 std-cycle-check.md.",
    ],
  },
];

// =============================================================================
// 5. Constraints (§8 Обмеження — 7 правил)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено пропускати HANSEI або формувати порожній звіт.",
  "Заборонено формувати HANSEI де всі блоки A–E позитивні і блок F порожній. Мінімум 1 конкретна відповідь у блоку F обов'язкова.",
  "Заборонено змінювати артефакти попередніх кроків (плани, задачі, issues) під час HANSEI.",
  "Заборонено додавати нові задачі або плани. HANSEI — тільки аналіз.",
  "Заборонено оцінювати роботу суб'єктивно (добре/погано). Тільки факти та конкретні дані.",
  "Заборонено ігнорувати попередні HANSEI-звіти при аналізі трендів.",
  "Заборонено використовувати HANSEI для ескалації нових проблем. Для цього є JIDOKA та issues.",
];

// =============================================================================
// 6. Helpers
// =============================================================================

/** Визначити контекст HANSEI з поточного кроку */
function resolveContext(step: Step): HanseiContext | null {
  return STEP_TO_CONTEXT[step] ?? null;
}

/** Побудувати шлях до артефакту */
function resolveArtifactPath(context: HanseiContext, date: string): string {
  return ARTIFACT_PATH_PATTERNS[context].replace("{date}", date);
}

/** Побудувати шлях до validation_conclusions (V3 only) */
function resolveValidationConclusionsPath(date: string): string {
  return `control_center/audit/validation_conclusions/validation_conclusions_${date}.md`;
}

/** Побудувати шлях до v3_decision */
function resolveV3DecisionPath(date: string, suffix?: number): string {
  const base = `control_center/audit/gate_decisions/v3_decision_${date}`;
  if (suffix && suffix > 1) {
    return `${base}.${suffix}.md`;
  }
  return `${base}.md`;
}

/** Перевірити наявність заборонених фраз у тексті */
function containsForbiddenPhrases(text: string): string[] {
  return FORBIDDEN_PHRASES.filter((phrase) =>
    text.toLowerCase().includes(phrase.toLowerCase()),
  );
}

/** Перевірити сикофансію: всі F-відповіді "все перевірено" — підозра */
function checkSycophancySignal(blindSpots: BlindSpotItem[]): boolean {
  const allClean = blindSpots.every(
    (bs) =>
      bs.answer.toLowerCase().includes("все перевірено") ||
      bs.answer.toLowerCase().includes("нічого не знайдено"),
  );
  return allClean;
}

// =============================================================================
// 7. Transition Logic
// =============================================================================

/** Визначити перехід після завершення HANSEI */
function resolveTransition(
  step: Step,
  date: string,
  state: SystemState,
): { next_step: Step; next_block: Block; state_updates: Partial<SystemState> } {
  // V3 — спеціальна логіка (§4.6)
  if (step === "V3") {
    return {
      next_step: "D1",
      next_block: "development_cycle",
      state_updates: {
        current_block: "development_cycle" as Block,
        current_step: "D1" as Step,
        status: "awaiting_human_decision" as Status,
        last_completed_step: step,
        last_artifact: `audit/gate_decisions/v3_decision_${date}.md`,
      },
    };
  }

  // L12 → L13, D8 → D9
  const transition = HANSEI_TRANSITIONS[step];
  if (!transition) {
    return {
      next_step: state.current_step,
      next_block: state.current_block,
      state_updates: {},
    };
  }

  return {
    next_step: transition.next_step,
    next_block: transition.next_block,
    state_updates: {
      current_block: transition.next_block,
      current_step: transition.next_step,
      status: "in_progress" as Status,
      last_completed_step: step,
    },
  };
}

// =============================================================================
// 8. Main Execute Function
// =============================================================================

/**
 * Головна точка входу HANSEI.
 * Виконує алгоритм рефлексії та формує артефакт.
 */
function execute(input: HanseiInput): HanseiResult {
  const { state, date, acceptance_report } = input;

  // Крок 1 (§4.1): Визначити контекст
  const context = resolveContext(state.current_step);
  if (!context) {
    return {
      success: false,
      context: "foundation",
      step: state.current_step,
      plan_vs_reality: [],
      problems: [],
      jidoka_stops: { occurred: false, details: "" },
      task_quality: { unclear_tasks: [], incomplete_acceptance_criteria: [], unaccounted_dependencies: [] },
      trends: [],
      recommendations: [],
      blind_spots: [],
      artifact_path: "",
      state_updates: {},
      message: "",
      error: `Поточний крок ${state.current_step} не є HANSEI кроком. Очікується L12, D8, або V3.`,
    };
  }

  // POKA-YOKE P3+P4: V3-специфічні перевірки
  if (context === "audit") {
    if (!acceptance_report) {
      return {
        success: false,
        context,
        step: state.current_step,
        plan_vs_reality: [],
        problems: [],
        jidoka_stops: { occurred: false, details: "" },
        task_quality: { unclear_tasks: [], incomplete_acceptance_criteria: [], unaccounted_dependencies: [] },
        trends: [],
        recommendations: [],
        blind_spots: [],
        artifact_path: "",
        state_updates: {},
        message: "",
        error: "P3: acceptance_report не існує. Аудит не завершено.",
      };
    }
  }

  // Крок 2 (§4.2): Зібрати фактичні дані — передано через input

  // Крок 3 (§4.3 Блок B): Проблеми — заповнюються ПЕРШИМ
  // Агент формує на основі issues та completed_tasks
  // Тут перевіряємо що якщо issues є — вони мають бути перелічені (валідація в validateResult)

  // Артефакт шлях
  const artifactPath = resolveArtifactPath(context, date);

  // Перехід
  const transition = resolveTransition(state.current_step, date, state);

  // V3-специфічні артефакти
  let validationConclusionsPath: string | undefined;
  let v3DecisionPath: string | undefined;

  if (context === "audit") {
    validationConclusionsPath = resolveValidationConclusionsPath(date);
    v3DecisionPath = resolveV3DecisionPath(date);
  }

  // State updates
  const stateUpdates: Partial<SystemState> = {
    ...transition.state_updates,
    last_artifact: context === "audit"
      ? `audit/gate_decisions/v3_decision_${date}.md`
      : artifactPath,
  };

  // V3 message
  const message = context === "audit"
    ? `V3 завершено. Файл рішення створено: audit/gate_decisions/v3_decision_${date}.md. Заповніть рішення для продовження.`
    : `HANSEI (${CONTEXT_LABELS[context]}) завершено. Артефакт: ${artifactPath}. Перехід до ${transition.next_step}.`;

  return {
    success: true,
    context,
    step: state.current_step,
    plan_vs_reality: [], // Агент заповнює на основі зібраних даних
    problems: [],
    jidoka_stops: { occurred: false, details: "" },
    task_quality: { unclear_tasks: [], incomplete_acceptance_criteria: [], unaccounted_dependencies: [] },
    trends: [],
    recommendations: [],
    blind_spots: [],
    artifact_path: artifactPath,
    validation_conclusions_path: validationConclusionsPath,
    v3_decision_path: v3DecisionPath,
    state_updates: stateUpdates,
    message,
  };
}

// =============================================================================
// 9. Validation (§6 Критерії прийнятності)
// =============================================================================

/** Валідувати результат HANSEI */
function validateResult(result: HanseiResult): ValidationOutcome {
  const issues: string[] = [];

  if (!result.success) {
    issues.push("HANSEI не завершено успішно.");
    return { valid: false, issues };
  }

  // §6.1: Кожен пункт завершеного плану згаданий у блоці A
  if (result.plan_vs_reality.length === 0) {
    issues.push("Блок A (План vs Реальність) порожній — кожен пункт плану має бути згаданий.");
  }

  // §6.2: Кожен issue згаданий у блоці B з кореневою причиною
  // (Перевіряється при наявності issues — в execute вони передаються)

  // §6.3: Блок D містить порівняння з попередніми HANSEI
  if (result.trends.length === 0) {
    issues.push("Блок D (Тренди) порожній — має містити порівняння або 'Перший HANSEI, попередніх немає.'");
  }

  // §6.4: Блок E містить ≥1 рекомендацію з посиланням
  if (result.recommendations.length === 0) {
    issues.push("Блок E (Рекомендації) порожній — потрібна ≥1 конкретна рекомендація з посиланням на проблему.");
  }

  // Блок F — ОБОВ'ЯЗКОВИЙ (§4.3 Блок F + §8 обмеження)
  if (result.blind_spots.length === 0) {
    issues.push("Блок F (Сліпі зони) порожній — HANSEI без блоку F = порушення стандарту.");
  }

  // Сикофансія: всі блоки A-E позитивні + F порожній = порушення
  if (
    result.problems.length === 0 &&
    result.blind_spots.length === 0
  ) {
    issues.push("Всі блоки A-E позитивні і блок F порожній — порушення стандарту (підозра на сикофансію).");
  }

  // Сигнал сикофансії: всі F-відповіді = "все перевірено"
  if (result.blind_spots.length > 0 && checkSycophancySignal(result.blind_spots)) {
    issues.push("Сигнал сикофансії: всі 5 питань F = 'все перевірено, нічого не знайдено'. Повторно перевірити F1 і F2.");
  }

  // §6.5: Жодне твердження не базується на припущеннях
  // (Це перевіряється семантично — тут можна перевірити заборонені фрази)

  // §6.6: Артефакт за правильним шляхом
  if (!result.artifact_path) {
    issues.push("Артефакт не створений (шлях порожній).");
  }

  // V3-специфічні перевірки
  if (result.context === "audit") {
    if (!result.validation_conclusions_path) {
      issues.push("V3: validation_conclusions не створений.");
    }
    if (!result.v3_decision_path) {
      issues.push("V3: файл рішення v3_decision не створений.");
    }
  }

  return { valid: issues.length === 0, issues };
}

// =============================================================================
// 10. Template — HANSEI артефакт (§A шаблон)
// =============================================================================

/** Генерує шаблон HANSEI артефакту */
function generateTemplate(params: HanseiTemplateParams): string {
  const { context, date, step, plan_name, iteration, plan_vs_reality, problems, jidoka_stops, task_quality, trends, recommendations, blind_spots } = params;

  const contextLabel = CONTEXT_LABELS[context];

  // Блок A — Plan vs Reality
  let planTable = `| # | Пункт плану | Статус | Розбіжність (якщо є) |
|---|-------------|--------|----------------------|
`;
  if (plan_vs_reality.length > 0) {
    for (const item of plan_vs_reality) {
      const statusLabel = item.status === "completed" ? "Виконано" : "Відхилення";
      planTable += `| ${item.order} | ${item.plan_item} | ${statusLabel} | ${item.deviation ?? "—"} |\n`;
    }
  } else {
    planTable += `| 1 | ... | Виконано / Відхилення | ... |\n`;
  }

  // Блок B — Problems
  let problemsTable = `| # | Проблема | Джерело (файл) | Коренева причина (Чому? → Чому?) |
|---|----------|-----------------|----------------------------------|
`;
  if (problems.length > 0) {
    for (const p of problems) {
      problemsTable += `| ${p.order} | ${p.problem} | ${p.source_file} | ${p.root_cause} |\n`;
    }
  } else {
    problemsTable += `| — | Issues не зафіксовано. Перевірено: issues/done/ — 0 файлів, issues/active/ — 0 файлів. | — | — |\n`;
  }

  const jidokaText = jidoka_stops.occurred
    ? `**JIDOKA-зупинки:** були. ${jidoka_stops.details}`
    : "**JIDOKA-зупинки:** не були.";

  // Блок C — Task Quality
  const unclearTasks = task_quality.unclear_tasks.length > 0
    ? task_quality.unclear_tasks.join(", ")
    : "немає";
  const incompleteCriteria = task_quality.incomplete_acceptance_criteria.length > 0
    ? task_quality.incomplete_acceptance_criteria.join(", ")
    : "немає";
  const unaccountedDeps = task_quality.unaccounted_dependencies.length > 0
    ? task_quality.unaccounted_dependencies.join(", ")
    : "немає";

  // Блок D — Trends
  let trendsText = "";
  if (trends.length > 0) {
    for (const t of trends) {
      const prefix = t.is_recurring ? "⚠ ТРЕНД: " : "- ";
      trendsText += `${prefix}${t.description}\n`;
    }
  } else {
    trendsText = "Перший HANSEI, попередніх немає.";
  }

  // Блок E — Recommendations
  let recsTable = `| # | Рекомендація | Посилання на проблему |
|---|-------------|----------------------|
`;
  if (recommendations.length > 0) {
    for (const r of recommendations) {
      recsTable += `| ${r.order} | ${r.recommendation} | ${r.references_problem} |\n`;
    }
  } else {
    recsTable += `| 1 | ... | Блок B, #N / Блок C / Блок D |\n`;
  }

  // Блок F — Blind Spots
  let blindSpotsTable = `| # | Питання | Відповідь (конкретний факт) |
|---|---------|-----|
`;
  if (blind_spots.length > 0) {
    for (const bs of blind_spots) {
      blindSpotsTable += `| ${bs.id} | ${bs.question} | ${bs.answer} |\n`;
    }
  } else {
    for (const q of BLIND_SPOT_QUESTIONS) {
      blindSpotsTable += `| ${q.id} | ${q.question} | [перелік] |\n`;
    }
  }

  return `# HANSEI — ${contextLabel}

> **Дата:** ${date}
> **Крок циклу:** ${step}
> **План:** ${plan_name}
> **Ітерація:** ${iteration ?? "N/A"}

---

## A. План vs Реальність

${planTable}
---

## B. Проблеми та дефекти

${problemsTable}
${jidokaText}

---

## C. Якість задач

- Нечіткі задачі: ${unclearTasks}
- Неповні acceptance criteria: ${incompleteCriteria}
- Невраховані залежності: ${unaccountedDeps}

---

## D. Тренди (порівняння з попередніми HANSEI)

${trendsText}

---

## E. Уроки та рекомендації

${recsTable}
---

## F. Сліпі зони (ОБОВ'ЯЗКОВИЙ)

${blindSpotsTable}`;
}

// =============================================================================
// 11. Template — validation_conclusions (§A.2, V3 only)
// =============================================================================

/** Генерує шаблон validation_conclusions */
function generateValidationConclusionsTemplate(
  params: ValidationConclusionsTemplateParams,
): string {
  const { date, attempt_number, acceptance_report_path, hansei_path, defects, additional_observations } = params;

  let defectsTable = `| # | Дефект (з acceptance_report) | Категорія | Коренева причина (з HANSEI) | Пріоритет |
|---|------------------------------|-----------|----------------------------|-----------|
`;
  for (const d of defects) {
    defectsTable += `| ${d.order} | ${d.description} | ${d.category} | ${d.root_cause} | ${d.priority} |\n`;
  }

  return `# Validation Conclusions — ${date}

> **Аудит:** FAIL (спроба #${attempt_number} з 3)
> **Acceptance report:** \`${acceptance_report_path}\`
> **HANSEI:** \`${hansei_path}\`

## Scope наступного циклу розвитку

⚠️ **D3 (план розвитку) формується ТІЛЬКИ на основі цього файлу. Нові AC заборонені.**

## Дефекти для виправлення

${defectsTable}
## Додаткові спостереження

${additional_observations || "[Системні проблеми, що потребують архітектурного рішення, а не локального патчу]"}`;
}

// =============================================================================
// 12. Template — v3_decision (§A.3, V3 only)
// =============================================================================

/** Генерує шаблон файлу рішення V3 */
function generateV3DecisionTemplate(params: V3DecisionTemplateParams): string {
  const { date, defect_summary, validation_attempts, validation_conclusions_path, smoke_test_result, open_questions } = params;

  return `# V3 Human Decision — ${date}

> **Тип:** Зупинка після V3 (HANSEI + validation_conclusions)
> **Результат:** FAIL — ${defect_summary}
> **validation_attempts:** ${validation_attempts}
> **validation_conclusions:** \`${validation_conclusions_path}\`

---

## Контекст для рішення

### Дефекти для виправлення (scope наступного циклу)
${defect_summary}

### Smoke test
${smoke_test_result || "[Результат тестів: N/N PASS]"}

### Відкриті питання (якщо є)
${open_questions || "[немає]"}

---

## ✍️ РІШЕННЯ ЛЮДИНИ (заповнити нижче)

> Обери варіант (постав \`x\` у відповідному рядку) та за потреби залиш коментар.

[ ] CONTINUE    — повернення до розробки (виправлення дефектів з validation_conclusions)
[ ] AMEND_SPEC  — оновити специфікацію перед продовженням
[ ] KILL        — зупинити проект

**amend_target** (тільки якщо AMEND_SPEC): [файл у final_view/ та секція]

**Коментар / інструкції для наступного кроку:**

(пиши тут)

---

_Статус: \`awaiting_human_decision\`_`;
}

// =============================================================================
// 13. Edge Cases
// =============================================================================

const EDGE_CASES: string[] = [
  "Перший HANSEI (немає попередніх) — блок D записує 'Перший HANSEI, попередніх немає.'",
  "Issues не зафіксовано — блок B явно записує 'Issues не зафіксовано. Перевірено: issues/done/ — 0 файлів, issues/active/ — 0 файлів.'",
  "Блок F: всі 5 відповідей 'все перевірено, нічого не знайдено' — сигнал сикофансії, повторно перевірити F1 і F2.",
  "V3: файл v3_decision з такою датою вже існує — додати суфікс .2.md.",
  "V3: cycle_counter.md НЕ скидується — лічильник тільки зростає.",
  "Заборонені фрази: 'в цілому добре', 'загалом успішно', 'без суттєвих проблем' — тільки конкретні факти.",
  "V3 after-transition: D1 автоматично обробить рішення через Крок 0 std-cycle-check.md.",
];

// =============================================================================
// 14. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Валідація
  validateResult,
  // Хелпери
  resolveContext,
  resolveArtifactPath,
  resolveValidationConclusionsPath,
  resolveV3DecisionPath,
  resolveTransition,
  containsForbiddenPhrases,
  checkSycophancySignal,
  // Templates
  generateTemplate,
  generateValidationConclusionsTemplate,
  generateV3DecisionTemplate,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  EDGE_CASES,
  BLIND_SPOT_QUESTIONS,
  FORBIDDEN_PHRASES,
  ARTIFACT_PATH_PATTERNS,
  CONTEXT_LABELS,
  HANSEI_TRANSITIONS,
  STEP_TO_CONTEXT,
};

// Re-export типів
export type {
  HanseiContext,
  HanseiInput,
  HanseiResult,
  HanseiTemplateParams,
  ValidationConclusionsTemplateParams,
  V3DecisionTemplateParams,
  PlanVsRealityItem,
  ProblemItem,
  TaskQualityBlock,
  TrendItem,
  RecommendationItem,
  BlindSpotItem,
  ValidationOutcome,
};
