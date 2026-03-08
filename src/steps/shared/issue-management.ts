// =============================================================================
// Issue Management — життєвий цикл issues: створення, класифікація, JIDOKA, закриття
// Конвертовано з: control_center/standards/system/std-issue-management.md
// Інструмент: використовується кроками L10, D5 (виконання задач) та JIDOKA
// =============================================================================

import type {
  SystemState,
  Status,
  Step,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

import { JIDOKA_CRITERIA } from "../../types";

// =============================================================================
// 1. Types (специфічні для issue management)
// =============================================================================

/** Класифікація дефекту */
type DefectClassification = "critical" | "non_critical";

/** ID критерію JIDOKA (J1–J5) */
type JidokaCriterionId = "J1" | "J2" | "J3" | "J4" | "J5";

/** Опис виявленого дефекту */
interface DetectedDefect {
  /** Короткий опис дефекту */
  description: string;
  /** Де виявлено: файл, функція, поведінка */
  location: string;
  /** Коренева причина (якщо відома) */
  root_cause?: string;
  /** Вплив на інші компоненти */
  impact: string;
}

/** Вхідні дані для класифікації дефекту */
interface ClassifyInput {
  defect: DetectedDefect;
  /** Чи блокує виконання наступних задач плану (J1) */
  blocks_next_tasks: boolean;
  /** Чи суперечить вимогам final_view/ на фундаментальному рівні (J2) */
  contradicts_final_view: boolean;
  /** Чи порушує цілісність даних або безпеку (J3) */
  data_integrity_breach: boolean;
  /** Кількість задач поспіль з однаковою кореневою причиною (J4 = >3) */
  consecutive_root_cause_count: number;
  /** Чи є суперечність між стандартами або планом і описом продукту (J5) */
  standards_contradiction: boolean;
}

/** Результат класифікації дефекту */
interface ClassificationResult {
  classification: DefectClassification;
  /** Яка саме критерія JIDOKA спрацювала (null для non_critical) */
  jidoka_criterion: JidokaCriterionId | null;
  /** Пояснення класифікації */
  reason: string;
}

/** Вхідні дані для JIDOKA (створення issue + зупинка конвеєра) */
interface JidokaInput {
  state: SystemState;
  defect: DetectedDefect;
  classification: ClassificationResult;
  /** Назва задачі, при виконанні якої виявлено */
  task_name: string;
  /** Поточна дата у форматі DD.MM.YY-HH-MM */
  date: string;
}

/** Результат JIDOKA */
interface JidokaResult {
  success: boolean;
  /** Шлях до створеного issue */
  issue_path: string;
  /** Оновлення state.json */
  state_updates: Partial<SystemState>;
  /** Повідомлення для виводу */
  message: string;
  error?: string;
}

/** Вхідні дані для відновлення після JIDOKA J4 (§4.3a) */
interface J4RecoveryInput {
  state: SystemState;
  /** Коренева причина з JIDOKA issue */
  root_cause: string;
  /** Назва поточного плану */
  plan_name: string;
  /** Завершені задачі, що побудовані на зламаній архітектурі */
  affected_tasks: string[];
  /** Загальна кількість задач плану */
  total_plan_tasks: number;
}

/** Результат відновлення J4 */
interface J4RecoveryResult {
  success: boolean;
  /** Задачі перевиконання що створені */
  rework_tasks: ReworkTask[];
  /** Чи потрібна ескалація (scope >50%) */
  escalation_required: boolean;
  /** Повідомлення */
  message: string;
}

/** Задача перевиконання */
interface ReworkTask {
  /** Ім'я файлу задачі */
  filename: string;
  /** Посилання на оригінальну задачу */
  original_task: string;
  /** Що саме потребує переробки */
  rework_description: string;
}

/** Вхідні дані для перевірки issues після виконання задачі (§4.4) */
interface PostTaskCheckInput {
  state: SystemState;
  /** Список файлів у issues/active/ */
  active_issues: string[];
}

/** Результат перевірки issues після задачі */
interface PostTaskCheckResult {
  /** Чи є issues що потребують уваги */
  has_issues: boolean;
  /** Кількість issues */
  issue_count: number;
  /** Дія: proceed (немає issues) або fix (виправити перед продовженням) */
  action: "proceed" | "fix";
  /** Шляхи issues для виправлення (пріоритизовані: спочатку блокуючі) */
  issues_to_fix: string[];
  message: string;
}

/** Вхідні дані для закриття issue (§4.5) */
interface CloseIssueInput {
  /** Шлях до issue */
  issue_path: string;
  /** Що зроблено для виправлення */
  fix_description: string;
  /** Які файли змінено */
  changed_files: string[];
  /** Перевірка: який тест/команда підтвердить виправлення */
  verification: string;
  /** Дата закриття */
  date: string;
}

/** Результат закриття issue */
interface CloseIssueResult {
  success: boolean;
  /** Шлях де issue тепер знаходиться (issues/done/) */
  new_path: string;
  message: string;
}

/** Головний вхід для execute() */
interface IssueManagementInput {
  state: SystemState;
  /** Фаза: classify, jidoka, j4_recovery, post_task_check, close */
  phase: "classify" | "jidoka" | "j4_recovery" | "post_task_check" | "close";
  /** Дані класифікації (phase = classify) */
  classify?: ClassifyInput;
  /** Дані JIDOKA (phase = jidoka) */
  jidoka?: JidokaInput;
  /** Дані відновлення J4 (phase = j4_recovery) */
  j4_recovery?: J4RecoveryInput;
  /** Дані перевірки після задачі (phase = post_task_check) */
  post_task_check?: PostTaskCheckInput;
  /** Дані закриття issue (phase = close) */
  close?: CloseIssueInput;
}

/** Результат execute() */
type IssueManagementResult =
  | ClassificationResult
  | JidokaResult
  | J4RecoveryResult
  | PostTaskCheckResult
  | CloseIssueResult;

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
    expected_value: "in_progress",
    description:
      "P1: state.json існує і status = 'in_progress'. Якщо ні — зчитати стан, з'ясувати причину.",
  },
  {
    type: "dir_not_empty",
    path: "control_center/tasks/active",
    description:
      "P2: Є хоча б одна задача в tasks/active/ АБО issue в issues/active/. Інакше — перехід до наступного кроку.",
  },
  {
    type: "file_exists",
    description:
      "P3: Поточна задача має acceptance criteria. Неможливо оцінити результат без критеріїв.",
  },
];

// =============================================================================
// 3. Algorithm Steps (§4)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  // --- 4.1 Виявлення дефекту ---
  {
    order: 1,
    instruction:
      "Виявити проблему під час виконання задачі: помилка компіляції, збій тесту, порушення вимоги.",
  },
  {
    order: 2,
    instruction:
      "Класифікувати дефект за таблицею критичності J1–J5. Якщо жоден критерій не виконано — некритичний.",
    substeps: [
      "J1: Блокує виконання наступних задач плану",
      "J2: Суперечить вимогам final_view/ на фундаментальному рівні",
      "J3: Порушення цілісності даних або безпеки",
      "J4: Однакова коренева причина у >3 задачах поспіль",
      "J5: Суперечність між стандартами або планом і описом продукту",
    ],
  },
  {
    order: 3,
    instruction:
      "Некритичний дефект → виправити в рамках поточної задачі. Не створювати issue.",
  },
  {
    order: 4,
    instruction:
      "Критичний дефект → JIDOKA: зупинити виконання → створити issue в issues/active/ → оновити state.json (status → blocked) → ескалювати до людини.",
    substeps: [
      "Ім'я файлу: issue_[короткий_опис]_DD.MM.YY-HH-MM.md",
      "state.json: status → blocked, last_artifact → шлях до issue",
      "Вивести: JIDOKA: конвеєр зупинено. Issue: [шлях]. Критерій: [J#]. Очікую рішення людини.",
    ],
  },
  // --- 4.3a Відновлення після J4 ---
  {
    order: 5,
    instruction:
      "Якщо JIDOKA був J4 (системна коренева причина >3 задач): після розблокування — визначити постраждалі задачі і створити задачі перевиконання [REWORK].",
    substeps: [
      "Зчитати issue — визначити коренову причину",
      "Переглянути tasks/done/[План]/ — знайти задачі на зламаній архітектурі",
      "Для кожної постраждалої — створити [REWORK] задачу в tasks/active/",
      "REWORK виконуються ПЕРЕД залишеними оригінальними задачами",
      "Якщо scope >50% — ескалювати: 'JIDOKA recovery scope > 50%. Рекомендується перепланування.'",
    ],
  },
  // --- 4.4 Перевірка issues після виконання задачі ---
  {
    order: 6,
    instruction:
      "Після КОЖНОЇ завершеної задачі (L10, D5): перевірити issues/active/. Порожньо → наступна задача. Є issues → виправити послідовно (починаючи з блокуючих).",
    substeps: [
      "Зчитати кожен issue",
      "Виконати виправлення згідно плану дій в issue",
      "Заповнити секцію 'Результат виправлення'",
      "Перемістити issue з issues/active/ у issues/done/",
    ],
  },
  // --- 4.5 Закриття issue ---
  {
    order: 7,
    instruction:
      "Закриття issue: перевірити що дефект усунений → заповнити секцію результату → перемістити issues/active/ → issues/done/.",
  },
];

// =============================================================================
// 4. Constraints (§8 Обмеження — 7 правил)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено ігнорувати або видаляти issues з issues/active/ без виправлення.",
  "Заборонено змінювати класифікацію дефекту з критичного на некритичний після створення issue.",
  "Заборонено продовжувати виконання задач після JIDOKA без рішення людини.",
  "Заборонено створювати issue без заповнення всіх обов'язкових полів шаблону.",
  "Заборонено виправляти тести замість коду для усунення дефекту.",
  "Заборонено залишати issues/active/ неперевіреним після завершення задачі.",
  "Заборонено модифікувати файли в final_view/ при виправленні issues.",
];

// =============================================================================
// 5. Classification Logic (§4.2)
// =============================================================================

/**
 * Класифікувати дефект за критеріями JIDOKA J1–J5.
 * Якщо жоден критерій не спрацював — некритичний.
 */
function classifyDefect(input: ClassifyInput): ClassificationResult {
  // J1: Блокує виконання наступних задач плану
  if (input.blocks_next_tasks) {
    return {
      classification: "critical",
      jidoka_criterion: "J1",
      reason: `Дефект блокує виконання наступних задач плану: ${input.defect.description}`,
    };
  }

  // J2: Суперечить вимогам final_view/ на фундаментальному рівні
  if (input.contradicts_final_view) {
    return {
      classification: "critical",
      jidoka_criterion: "J2",
      reason: `Дефект суперечить вимогам final_view/ на фундаментальному рівні: ${input.defect.description}`,
    };
  }

  // J3: Порушення цілісності даних або безпеки
  if (input.data_integrity_breach) {
    return {
      classification: "critical",
      jidoka_criterion: "J3",
      reason: `Порушення цілісності даних або безпеки: ${input.defect.description}`,
    };
  }

  // J4: Однакова коренева причина у >3 задачах поспіль
  if (input.consecutive_root_cause_count > 3) {
    return {
      classification: "critical",
      jidoka_criterion: "J4",
      reason: `Системна коренева причина у ${input.consecutive_root_cause_count} задачах поспіль (>3): ${input.defect.root_cause || input.defect.description}`,
    };
  }

  // J5: Суперечність між стандартами або планом і описом продукту
  if (input.standards_contradiction) {
    return {
      classification: "critical",
      jidoka_criterion: "J5",
      reason: `Суперечність між стандартами або планом і описом продукту: ${input.defect.description}`,
    };
  }

  // Некритичний — виправляється inline
  return {
    classification: "non_critical",
    jidoka_criterion: null,
    reason: `Дефект не відповідає жодному критерію JIDOKA (J1–J5). Виправити в рамках поточної задачі.`,
  };
}

// =============================================================================
// 6. JIDOKA — зупинка конвеєра (§4.3)
// =============================================================================

/**
 * JIDOKA: зупинити конвеєр, створити issue, оновити state.json.
 * Агент НЕ продовжує виконання — ескалація до людини.
 */
function executeJidoka(input: JidokaInput): JidokaResult {
  const { defect, classification, date } = input;

  // Перевірка: дефект має бути критичним
  if (classification.classification !== "critical") {
    return {
      success: false,
      issue_path: "",
      state_updates: {},
      message: "",
      error: "JIDOKA викликано для некритичного дефекту. Використовуйте inline fix.",
    };
  }

  // Побудувати ім'я файлу issue
  const shortDesc = defect.description
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9]+/gi, "_")
    .substring(0, 40);
  const issuePath = `control_center/issues/active/issue_${shortDesc}_${date}.md`;

  // Оновлення state.json: status → blocked, last_artifact → issue path
  const stateUpdates: Partial<SystemState> = {
    status: "blocked" as Status,
    last_artifact: issuePath,
  };

  const criterion = classification.jidoka_criterion;
  const message = `JIDOKA: конвеєр зупинено. Issue: ${issuePath}. Критерій: ${criterion}. Очікую рішення людини.`;

  return {
    success: true,
    issue_path: issuePath,
    state_updates: stateUpdates,
    message,
  };
}

// =============================================================================
// 7. J4 Recovery (§4.3a — відновлення після системної кореневої причини)
// =============================================================================

/**
 * Відновлення після JIDOKA J4: створити задачі перевиконання для постраждалих задач.
 * Виконується коли людина розблокувала стан (status → in_progress).
 */
function executeJ4Recovery(input: J4RecoveryInput): J4RecoveryResult {
  const { root_cause, plan_name, affected_tasks, total_plan_tasks } = input;

  // Створити REWORK задачі для кожної постраждалої завершеної задачі
  const reworkTasks: ReworkTask[] = affected_tasks.map((taskName) => ({
    filename: `[REWORK] ${taskName}.md`,
    original_task: `control_center/tasks/done/${plan_name}/${taskName}.md`,
    rework_description: `Перевиконання через JIDOKA J4. Коренева причина: ${root_cause}`,
  }));

  // Визначити чи scope >50%
  const reworkPercentage =
    total_plan_tasks > 0 ? (affected_tasks.length / total_plan_tasks) * 100 : 0;
  const escalationRequired = reworkPercentage > 50;

  let message = `J4 Recovery: створено ${reworkTasks.length} задач перевиконання. Виконуються ПЕРЕД залишеними задачами плану.`;
  if (escalationRequired) {
    message += ` ЕСКАЛАЦІЯ: JIDOKA recovery scope ${reworkPercentage.toFixed(0)}% > 50%. Рекомендується перепланування.`;
  }

  return {
    success: true,
    rework_tasks: reworkTasks,
    escalation_required: escalationRequired,
    message,
  };
}

// =============================================================================
// 8. Post-Task Issue Check (§4.4)
// =============================================================================

/**
 * Перевірка issues/active/ після кожної завершеної задачі.
 * Якщо порожньо → proceed. Якщо є → fix (послідовно, блокуючі першими).
 */
function executePostTaskCheck(input: PostTaskCheckInput): PostTaskCheckResult {
  const { active_issues } = input;

  if (active_issues.length === 0) {
    return {
      has_issues: false,
      issue_count: 0,
      action: "proceed",
      issues_to_fix: [],
      message: "issues/active/ порожньо. Перехід до наступної задачі.",
    };
  }

  return {
    has_issues: true,
    issue_count: active_issues.length,
    action: "fix",
    issues_to_fix: active_issues,
    message: `Знайдено ${active_issues.length} issue(s) в issues/active/. Виправити послідовно перед продовженням.`,
  };
}

// =============================================================================
// 9. Close Issue (§4.5)
// =============================================================================

/**
 * Закриття issue: перевірити що дефект усунено → заповнити результат → перемістити в done.
 */
function closeIssue(input: CloseIssueInput): CloseIssueResult {
  const { issue_path, fix_description } = input;

  // Побудувати новий шлях (issues/active/ → issues/done/)
  const newPath = issue_path.replace("issues/active/", "issues/done/");

  return {
    success: true,
    new_path: newPath,
    message: `Issue закрито. Переміщено: ${issue_path} → ${newPath}. Виправлення: ${fix_description}`,
  };
}

// =============================================================================
// 10. Main Execute Function
// =============================================================================

/**
 * Головна точка входу. Делегує на відповідну фазу залежно від input.phase.
 */
function execute(input: IssueManagementInput): IssueManagementResult {
  switch (input.phase) {
    case "classify": {
      if (!input.classify) {
        return {
          classification: "non_critical",
          jidoka_criterion: null,
          reason: "Помилка: classify input не надано.",
        } as ClassificationResult;
      }
      return classifyDefect(input.classify);
    }

    case "jidoka": {
      if (!input.jidoka) {
        return {
          success: false,
          issue_path: "",
          state_updates: {},
          message: "",
          error: "Помилка: jidoka input не надано.",
        } as JidokaResult;
      }
      return executeJidoka(input.jidoka);
    }

    case "j4_recovery": {
      if (!input.j4_recovery) {
        return {
          success: false,
          rework_tasks: [],
          escalation_required: false,
          message: "Помилка: j4_recovery input не надано.",
        } as J4RecoveryResult;
      }
      return executeJ4Recovery(input.j4_recovery);
    }

    case "post_task_check": {
      if (!input.post_task_check) {
        return {
          has_issues: false,
          issue_count: 0,
          action: "proceed" as const,
          issues_to_fix: [],
          message: "Помилка: post_task_check input не надано.",
        } as PostTaskCheckResult;
      }
      return executePostTaskCheck(input.post_task_check);
    }

    case "close": {
      if (!input.close) {
        return {
          success: false,
          new_path: "",
          message: "Помилка: close input не надано.",
        } as CloseIssueResult;
      }
      return closeIssue(input.close);
    }
  }
}

// =============================================================================
// 11. Validation (§6 Критерії прийнятності — 7 перевірок)
// =============================================================================

/**
 * Валідація результатів issue management.
 * Кожен чекпоінт з §6 → одна перевірка.
 */
function validateResult(
  result: IssueManagementResult,
  phase: IssueManagementInput["phase"],
): ValidationOutcome {
  const issues: string[] = [];

  switch (phase) {
    case "classify": {
      const r = result as ClassificationResult;
      // §6.1: Дефект класифіковано за таблицею критичності
      if (!r.classification) {
        issues.push("Дефект не класифіковано.");
      }
      if (r.classification === "critical" && !r.jidoka_criterion) {
        issues.push("Критичний дефект без зазначеного критерію JIDOKA (J1–J5).");
      }
      break;
    }

    case "jidoka": {
      const r = result as JidokaResult;
      // §6.2: Критичний дефект → issue створено, JIDOKA активовано, state.json оновлено
      if (!r.success) {
        issues.push(`JIDOKA не завершено: ${r.error || "невідома помилка"}`);
        break;
      }
      if (!r.issue_path) {
        issues.push("Issue не створено (шлях порожній).");
      }
      if (r.state_updates.status !== "blocked") {
        issues.push("state.json не оновлено: status має бути 'blocked'.");
      }
      if (!r.state_updates.last_artifact) {
        issues.push("state.json не оновлено: last_artifact має вказувати на issue.");
      }
      break;
    }

    case "j4_recovery": {
      const r = result as J4RecoveryResult;
      if (!r.success) {
        issues.push("J4 Recovery не завершено.");
      }
      break;
    }

    case "post_task_check": {
      const r = result as PostTaskCheckResult;
      // §6.7: issues/active/ перевірено після кожної завершеної задачі
      if (r.has_issues && r.action !== "fix") {
        issues.push("Є issues в active/, але action не 'fix'.");
      }
      break;
    }

    case "close": {
      const r = result as CloseIssueResult;
      // §6.5: Після виправлення issue містить заповнену секцію результату
      // §6.6: Виправлений issue переміщено до issues/done/
      if (!r.success) {
        issues.push("Issue не закрито.");
      }
      if (!r.new_path || !r.new_path.includes("issues/done/")) {
        issues.push("Issue не переміщено до issues/done/.");
      }
      break;
    }
  }

  return { valid: issues.length === 0, issues };
}

// =============================================================================
// 12. Template (§A — шаблон артефакту issue)
// =============================================================================

/** Параметри генерації шаблону issue */
interface IssueTemplateParams {
  /** Короткий опис дефекту */
  short_description: string;
  /** Дата у форматі DD.MM.YY-HH-MM */
  date: string;
  /** Крок циклу: L10 або D5 */
  cycle_step: "L10" | "D5";
  /** Назва задачі при виконанні якої виявлено */
  task_name: string;
  /** Критичність: Критичний (J#) або Некритичний */
  criticality: string;
  /** Опис дефекту */
  defect_description: string;
  /** Коренева причина */
  root_cause: string;
  /** Вплив */
  impact: string;
  /** План дій — кроки виправлення */
  action_plan: string[];
}

/** Генерує шаблон файлу issue за стандартом (§A) */
function generateTemplate(params: IssueTemplateParams): string {
  const actionPlanText = params.action_plan
    .map((step, i) => `${i + 1}. ${step}`)
    .join("\n");

  return `# Issue: ${params.short_description}

> **Дата:** ${params.date}
> **Крок циклу:** ${params.cycle_step}
> **Задача:** ${params.task_name}
> **Критичність:** ${params.criticality}

---

## Опис дефекту

${params.defect_description}

## Коренева причина

${params.root_cause}

## Вплив

${params.impact}

## План дій

${actionPlanText}

## Результат виправлення

> Заповнюється після усунення дефекту.

- **Що зроблено:** 
- **Змінені файли:** 
- **Перевірка:** 
- **Дата закриття:** 
`;
}

// =============================================================================
// 13. Helpers
// =============================================================================

/** Перевірити чи крок є кроком виконання задач (L10 або D5) */
function isTaskExecutionStep(step: Step): boolean {
  return step === "L10" || step === "D5";
}

/** Отримати опис критерію JIDOKA за ID */
function getJidokaCriterionDescription(id: JidokaCriterionId): string {
  const criterion = JIDOKA_CRITERIA.find((c) => c.id === id);
  return criterion ? criterion.description : `Невідомий критерій: ${id}`;
}

/** Побудувати ім'я файлу issue з короткого опису та дати */
function buildIssueFilename(shortDescription: string, date: string): string {
  const sanitized = shortDescription
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9]+/gi, "_")
    .substring(0, 40);
  return `issue_${sanitized}_${date}.md`;
}

/** Побудувати шлях до REWORK задачі */
function buildReworkTaskFilename(originalTaskName: string): string {
  return `[REWORK] ${originalTaskName}.md`;
}

// =============================================================================
// 14. Edge Cases (§C)
// =============================================================================

const EDGE_CASES: string[] = [
  "Issue створено, але людина не відповідає (JIDOKA) → залишатися в стані blocked. Не продовжувати. При наступному запуску — повторити повідомлення.",
  "Декілька issues в issues/active/ одночасно → виправляти послідовно. Починати з тих, що мають найвищий вплив (блокують інші задачі).",
  "Issue неможливо виправити в рамках поточного плану → ескалювати до людини (JIDOKA). Зафіксувати в issue причину неможливості.",
  "Виправлення issue породжує новий дефект → класифікувати новий дефект за таблицею (4.2). Створити окремий issue якщо критичний.",
  "issues/active/ містить issue з попередньої сесії → зчитати issue, виконати виправлення перед продовженням поточних задач.",
  "Дефект виявлено, але незрозуміло чи він критичний → вважати критичним. Створити issue, ескалювати.",
];

// =============================================================================
// 15. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Під-алгоритми
  classifyDefect,
  executeJidoka,
  executeJ4Recovery,
  executePostTaskCheck,
  closeIssue,
  // Валідація
  validateResult,
  // Template
  generateTemplate,
  // Хелпери
  isTaskExecutionStep,
  getJidokaCriterionDescription,
  buildIssueFilename,
  buildReworkTaskFilename,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  EDGE_CASES,
};

// Re-export типів
export type {
  DefectClassification,
  JidokaCriterionId,
  DetectedDefect,
  ClassifyInput,
  ClassificationResult,
  JidokaInput,
  JidokaResult,
  J4RecoveryInput,
  J4RecoveryResult,
  ReworkTask,
  PostTaskCheckInput,
  PostTaskCheckResult,
  CloseIssueInput,
  CloseIssueResult,
  IssueManagementInput,
  IssueManagementResult,
  IssueTemplateParams,
  ValidationOutcome,
};
