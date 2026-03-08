// =============================================================================
// Release Readiness — E1 чекліст готовності до релізу (14 пунктів)
// Конвертовано з: control_center/standards/audit/std-release-check.md
// =============================================================================

import type {
  PreconditionCheck,
  StepDefinition,
  ReleaseVerdict,
} from "../../types";

// --- Метадані ---
// Фінальна перевірка готовності продукту до релізу. Агент проходить
// контрольний список C1–C14, верифікуючи: аудит пройдено, артефакти закриті,
// середовище чисте, продукт відповідає final_view/, тести проходять.
// Результат — release_checklist з вердиктом READY / NOT_READY.
// Крок циклу: E1 (Блок 5 — Лінійний вихід). Роль: Нотаріус.

// =============================================================================
// 1. Типи (специфічні для цього валідатора)
// =============================================================================

interface ReleaseCheckRule {
  id: string;
  name: string;
  check_description: string;
  /** Обов'язковий для вердикту READY */
  required: boolean;
}

type CheckItemVerdict = "PASS" | "FAIL" | "N/A";

interface ReleaseCheckResult {
  rule_id: string;
  verdict: CheckItemVerdict;
  /** Конкретний доказ: ім'я файлу, результат тестів, вміст директорії */
  evidence: string;
}

interface ReleaseCheckReport {
  overall_verdict: ReleaseVerdict;
  results: ReleaseCheckResult[];
  passed_count: number;
  failed_count: number;
  na_count: number;
  known_limitations: KnownLimitation[];
}

interface KnownLimitation {
  issue_id: string;
  description: string;
  /** Обґрунтування чому не блокує реліз */
  rationale: string;
}

interface ReleaseCheckInputContext {
  // C1: Аудит
  acceptance_report_exists: boolean;
  acceptance_report_verdict: "PASS" | "FAIL" | null;
  acceptance_report_path: string | null;
  // C2, C7: Issues
  active_issues_count: number;
  active_issues_all_documented: boolean;
  known_limitations: KnownLimitation[];
  // C3: Плани
  active_plans_empty: boolean;
  done_plans_count: number;
  // C4: Задачі
  active_tasks_empty: boolean;
  done_tasks_count: number;
  // C5: Відповідність final_view/
  final_view_matches: boolean;
  runtime_verified: boolean;
  // C6: Тести
  tests_passed: number;
  tests_failed: number;
  tests_skipped: number;
  /** 100% vi.mock → ризик, фіксується у відомих обмеженнях */
  all_tests_mocked: boolean;
  // C8: state.json
  state_json_valid: boolean;
  // C9: Production build
  production_build_success: boolean;
  // C10: Інструкція розгортання
  deploy_instructions_exist: boolean;
  deploy_instructions_reproducible: boolean;
  // C11: Змінні середовища
  env_vars_documented: boolean;
  // C12: БД (опціонально)
  has_database: boolean;
  migrations_idempotent: boolean;
  backup_instructions_exist: boolean;
  // C13: SEO (опціонально)
  is_web_product: boolean;
  has_seo_basics: boolean;
  // C14: Моніторинг помилок
  error_monitoring_configured: boolean;
}

// =============================================================================
// 2. Правила (C1–C14, ДОСЛІВНО з таблиці контрольного списку Markdown)
// =============================================================================

const RULES: ReleaseCheckRule[] = [
  {
    id: "C1",
    name: "Аудит пройдено",
    check_description:
      "Зчитати acceptance_report_DD.MM.YY-HH-MM.md, знайти вердикт PASS",
    required: true,
  },
  {
    id: "C2",
    name: "Issues закриті",
    check_description:
      "Перевірити issues/active/ — якщо порожній → ОК. Якщо є файли → зчитати кожен, класифікувати як «відоме обмеження» або «незакритий дефект»",
    required: true,
  },
  {
    id: "C3",
    name: "Всі плани в plans/done/",
    check_description:
      "Перевірити: plans/active/ порожній, plans/done/ містить файли",
    required: true,
  },
  {
    id: "C4",
    name: "Всі задачі в tasks/done/",
    check_description:
      "Перевірити: tasks/active/ порожній, tasks/done/ містить підпапки з виконаними задачами",
    required: true,
  },
  {
    id: "C5",
    name: "Стан відповідає final_view/",
    check_description:
      "Зчитати final_view/, порівняти ключові вимоги з фактичним станом проекту. Обов'язково: запустити додаток і перевірити хоча б 1 реальний API endpoint або сторінку (runtime verification)",
    required: true,
  },
  {
    id: "C6",
    name: "Тести проходять",
    check_description:
      "Запустити тести проекту. Зафіксувати результат: кількість passed / failed / skipped. Увага: якщо всі тести мокані (100% vi.mock) — зафіксувати як ризик у секції «Відомі обмеження»",
    required: true,
  },
  {
    id: "C7",
    name: "issues/active/ оброблений",
    check_description:
      "Кожен залишений issue має позначку «відоме обмеження» з обґрунтуванням, чому не блокує реліз",
    required: false,
  },
  {
    id: "C8",
    name: "state.json актуальний",
    check_description:
      "Перевірити, що state.json існує і коректний",
    required: true,
  },
  {
    id: "C9",
    name: "Production build",
    check_description:
      "Запустити npm run build (або еквівалент). Збірка завершується без помилок",
    required: true,
  },
  {
    id: "C10",
    name: "Інструкція розгортання",
    check_description:
      "Файл з кроками deploy існує (README або docs/). Перевірити, що кроки відтворювані",
    required: true,
  },
  {
    id: "C11",
    name: "Змінні середовища задокументовані",
    check_description:
      ".env.example або документація містить ВСІ необхідні env vars з описом",
    required: true,
  },
  {
    id: "C12",
    name: "Міграції та бекап БД",
    check_description:
      "Міграції ідемпотентні, є інструкція для backup/restore (якщо є БД)",
    required: false,
  },
  {
    id: "C13",
    name: "SEO-базис",
    check_description:
      "<title>, мета-опис, Open Graph теги, robots.txt присутні (для web-продуктів)",
    required: false,
  },
  {
    id: "C14",
    name: "Моніторинг помилок",
    check_description:
      "Налаштовано error logging (console → файл/сервіс). Необроблені винятки не втрачаються",
    required: true,
  },
];

// IDs обов'язкових пунктів — READY вимагає проходження кожного
const MANDATORY_RULE_IDS: string[] = RULES
  .filter((r) => r.required)
  .map((r) => r.id);

// =============================================================================
// 3. Preconditions (POKA-YOKE) — P1–P4
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/audit/acceptance_reports/",
    description:
      "P1: Аудит пройдено — існує acceptance_report_DD.MM.YY-HH-MM.md з вердиктом PASS",
  },
  {
    type: "artifact_registered",
    artifact_key: "acceptance_report",
    description:
      "P2: Рішення аудиту — PASS — зафіксовано в state.json або артефакті аудиту",
  },
  {
    type: "dir_empty",
    path: "control_center/plans/active/",
    description: "P3: plans/active/ порожній",
  },
  {
    type: "dir_empty",
    path: "control_center/tasks/active/",
    description: "P4: tasks/active/ порожній",
  },
];

// =============================================================================
// 4. Helpers
// =============================================================================

function makePass(ruleId: string, evidence: string): ReleaseCheckResult {
  return { rule_id: ruleId, verdict: "PASS", evidence };
}

function makeFail(ruleId: string, evidence: string): ReleaseCheckResult {
  return { rule_id: ruleId, verdict: "FAIL", evidence };
}

function makeNA(ruleId: string, evidence: string): ReleaseCheckResult {
  return { rule_id: ruleId, verdict: "N/A", evidence };
}

// =============================================================================
// 5. Оцінка окремого пункту чекліста
// =============================================================================

function evaluateRule(
  rule: ReleaseCheckRule,
  context: ReleaseCheckInputContext,
): ReleaseCheckResult {
  switch (rule.id) {
    // C1: Аудит пройдено (PASS у acceptance_report)
    case "C1": {
      if (!context.acceptance_report_exists) {
        return makeFail("C1", "Файл acceptance_report не знайдено");
      }
      if (context.acceptance_report_verdict !== "PASS") {
        return makeFail(
          "C1",
          `Вердикт аудиту: ${context.acceptance_report_verdict ?? "відсутній"}`,
        );
      }
      return makePass(
        "C1",
        `Файл: ${context.acceptance_report_path}, вердикт: PASS`,
      );
    }

    // C2: Issues закриті або задокументовані як відомі обмеження
    case "C2": {
      if (context.active_issues_count === 0) {
        return makePass("C2", "issues/active/ порожній");
      }
      if (context.active_issues_all_documented) {
        return makePass(
          "C2",
          `${context.active_issues_count} відомих обмежень, всі задокументовані`,
        );
      }
      return makeFail(
        "C2",
        `${context.active_issues_count} активних issues, не всі задокументовані як відомі обмеження`,
      );
    }

    // C3: Всі плани в plans/done/
    case "C3": {
      if (!context.active_plans_empty) {
        return makeFail("C3", "plans/active/ не порожній");
      }
      if (context.done_plans_count === 0) {
        return makeFail("C3", "plans/done/ не містить завершених планів");
      }
      return makePass(
        "C3",
        `plans/active/ порожній, plans/done/ містить ${context.done_plans_count} планів`,
      );
    }

    // C4: Всі задачі в tasks/done/
    case "C4": {
      if (!context.active_tasks_empty) {
        return makeFail("C4", "tasks/active/ не порожній");
      }
      if (context.done_tasks_count === 0) {
        return makeFail("C4", "tasks/done/ не містить виконаних задач");
      }
      return makePass(
        "C4",
        `tasks/active/ порожній, tasks/done/ містить ${context.done_tasks_count} підпапок`,
      );
    }

    // C5: Стан відповідає final_view/ + runtime verification
    case "C5": {
      if (!context.final_view_matches) {
        return makeFail(
          "C5",
          "Фактичний стан проекту не відповідає final_view/",
        );
      }
      if (!context.runtime_verified) {
        return makeFail(
          "C5",
          "Runtime verification не виконана — обов'язково перевірити хоча б 1 endpoint/сторінку",
        );
      }
      return makePass(
        "C5",
        "Стан відповідає final_view/, runtime verification пройдена",
      );
    }

    // C6: Тести проходять
    case "C6": {
      if (context.tests_failed > 0) {
        return makeFail(
          "C6",
          `${context.tests_passed} passed, ${context.tests_failed} failed, ${context.tests_skipped} skipped`,
        );
      }
      let evidence = `${context.tests_passed} passed, ${context.tests_failed} failed, ${context.tests_skipped} skipped`;
      // WP-1 захист: 100% mock = ризик, фіксується окремо
      if (context.all_tests_mocked) {
        evidence +=
          " ⚠️ РИЗИК: всі тести мокані (100% vi.mock) — зафіксувати як відоме обмеження";
      }
      return makePass("C6", evidence);
    }

    // C7: issues/active/ оброблений
    case "C7": {
      if (context.active_issues_count === 0) {
        return makeNA("C7", "Немає активних issues");
      }
      if (context.active_issues_all_documented) {
        return makePass(
          "C7",
          `${context.known_limitations.length} відомих обмежень, всі мають обґрунтування`,
        );
      }
      return makeFail(
        "C7",
        "Не всі активні issues мають позначку «відоме обмеження» з обґрунтуванням",
      );
    }

    // C8: state.json актуальний
    case "C8": {
      if (!context.state_json_valid) {
        return makeFail(
          "C8",
          "state.json відсутній або має некоректну структуру",
        );
      }
      return makePass("C8", "state.json існує, структура коректна");
    }

    // C9: Production build
    case "C9": {
      if (!context.production_build_success) {
        return makeFail("C9", "npm run build завершився з помилками");
      }
      return makePass("C9", "npm run build exit code 0");
    }

    // C10: Інструкція розгортання
    case "C10": {
      if (!context.deploy_instructions_exist) {
        return makeFail("C10", "Інструкція розгортання не знайдена");
      }
      if (!context.deploy_instructions_reproducible) {
        return makeFail(
          "C10",
          "Інструкція розгортання існує, але кроки не відтворювані",
        );
      }
      return makePass(
        "C10",
        "Інструкція розгортання існує, кроки відтворювані",
      );
    }

    // C11: Змінні середовища задокументовані
    case "C11": {
      if (!context.env_vars_documented) {
        return makeFail(
          "C11",
          ".env.example або документація з env vars відсутня",
        );
      }
      return makePass(
        "C11",
        ".env.example або документація з env vars наявна",
      );
    }

    // C12: Міграції та бекап БД (N/A якщо немає БД)
    case "C12": {
      if (!context.has_database) {
        return makeNA("C12", "Проект не використовує БД");
      }
      if (!context.migrations_idempotent) {
        return makeFail("C12", "Міграції не ідемпотентні");
      }
      if (!context.backup_instructions_exist) {
        return makeFail("C12", "Немає інструкції для backup/restore");
      }
      return makePass(
        "C12",
        "Міграції ідемпотентні, інструкція backup/restore наявна",
      );
    }

    // C13: SEO-базис (N/A якщо не web-продукт)
    case "C13": {
      if (!context.is_web_product) {
        return makeNA("C13", "Не web-продукт");
      }
      if (!context.has_seo_basics) {
        return makeFail(
          "C13",
          "Відсутні SEO-базис: title, meta, OG теги або robots.txt",
        );
      }
      return makePass(
        "C13",
        "title, meta, OG теги, robots.txt присутні",
      );
    }

    // C14: Моніторинг помилок
    case "C14": {
      if (!context.error_monitoring_configured) {
        return makeFail(
          "C14",
          "Error logging не налаштовано, необроблені винятки можуть втратитись",
        );
      }
      return makePass("C14", "Error logging налаштовано");
    }

    default:
      return makeFail(rule.id, `Невідомий пункт перевірки: ${rule.id}`);
  }
}

// =============================================================================
// 6. Основна функція валідації
// =============================================================================

/**
 * Валідація готовності до релізу за 14 пунктами чекліста.
 *
 * Алгоритм:
 * 1. Послідовна оцінка кожного пункту C1–C14
 * 2. Визначення вердикту:
 *    - READY: всі обов'язкові (C1–C6, C8–C11, C14) = PASS, опціональні = PASS | N/A
 *    - NOT_READY: хоча б один обов'язковий не пройшов
 *
 * WP-1 захист: кожен пункт перевіряється фактично (evidence ≠ припущення).
 * WP-3 захист: FAIL не замасковується — evidence фіксує конкретну проблему.
 * WP-7 захист: рівно 14 пунктів — ні більше, ні менше.
 */
function validate(context: ReleaseCheckInputContext): ReleaseCheckReport {
  const results: ReleaseCheckResult[] = [];

  // Оцінити кожен пункт C1–C14
  for (const rule of RULES) {
    results.push(evaluateRule(rule, context));
  }

  // Визначити вердикт: обов'язкові пункти мають бути PASS
  const mandatoryFailed = results.some(
    (r) => MANDATORY_RULE_IDS.includes(r.rule_id) && r.verdict !== "PASS",
  );
  // Опціональні (C7, C12, C13): дозволено N/A, але FAIL = NOT_READY
  const anyFailed = results.some((r) => r.verdict === "FAIL");

  const overall_verdict: ReleaseVerdict =
    !mandatoryFailed && !anyFailed ? "READY" : "NOT_READY";

  return {
    overall_verdict,
    results,
    passed_count: results.filter((r) => r.verdict === "PASS").length,
    failed_count: results.filter((r) => r.verdict === "FAIL").length,
    na_count: results.filter((r) => r.verdict === "N/A").length,
    known_limitations: context.known_limitations,
  };
}

// =============================================================================
// 7. Обмеження (ДОСЛІВНО з секції 8 Markdown)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено виставляти вердикт READY, якщо хоча б один обов'язковий пункт (C1–C6, C8–C11, C14) не пройшов.",
  "Заборонено закривати issues без перевірки — залишені файли в issues/active/ мають бути зчитані та класифіковані.",
  "Заборонено пропускати запуск тестів (C6) — «тести проходили раніше» не є підставою.",
  "Заборонено модифікувати або видаляти будь-які артефакти під час цього кроку. Крок є лише перевіркою.",
  "Заборонено переходити до E2 при вердикті NOT_READY.",
  "Заборонено робити припущення про стан директорій — тільки фактична перевірка через інструменти.",
];

// =============================================================================
// 8. StepDefinition — E1 (Release Readiness)
// =============================================================================

export const STEP_E1: StepDefinition = {
  id: "E1",
  block: "linear_exit",
  name: "RELEASE READINESS — Чекліст готовності",
  type: "autonomous",
  role: "notary",
  purpose:
    "Фінальна перевірка готовності продукту до релізу за 14 пунктами контрольного списку",
  standards: [],
  preconditions: PRECONDITIONS,
  inputs: [
    {
      source: "artifact",
      artifact_key: "acceptance_report",
      description: "Звіт аудиту (PASS) — acceptance_report_DD.MM.YY-HH-MM.md",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/final_view/",
      description: "Еталон для порівняння з фактичним станом проекту",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/issues/active/",
      description: "Перевірка: всі issues закриті або задокументовані",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/plans/active/",
      description: "Має бути порожнім",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/tasks/active/",
      description: "Має бути порожнім",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/plans/done/",
      description: "ТІЛЬКИ list_dir — перевірити що папка не порожня (≥1 план). НЕ читати вміст планів.",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/tasks/done/",
      description: "ТІЛЬКИ list_dir — перевірити що папка не порожня (≥1 підпапка з задачами). НЕ читати вміст задач.",
      required: true,
    },
    {
      source: "state",
      field: "status",
      description: "Поточний стан циклу з state.json",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Зчитати всі вхідні дані із секції «Вхідні дані»",
    },
    {
      order: 2,
      instruction: "Пройти контрольний список C1–C14",
      substeps: [
        "C1: Зчитати acceptance_report, знайти вердикт PASS",
        "C2: Перевірити issues/active/ — порожній або класифікувати кожен issue",
        "C3: Перевірити plans/active/ порожній, plans/done/ містить файли",
        "C4: Перевірити tasks/active/ порожній, tasks/done/ містить підпапки",
        "C5: Зчитати final_view/, порівняти з фактичним станом, запустити runtime verification",
        "C6: Запустити тести, зафіксувати passed/failed/skipped",
        "C7: Кожен залишений issue має позначку «відоме обмеження»",
        "C8: Перевірити state.json існує і коректний",
        "C9: Запустити npm run build",
        "C10: Перевірити наявність інструкції розгортання",
        "C11: Перевірити документацію env vars",
        "C12: Перевірити міграції та бекап БД (якщо застосовно)",
        "C13: Перевірити SEO-базис (якщо web-продукт)",
        "C14: Перевірити налаштування моніторингу помилок",
      ],
    },
    {
      order: 3,
      instruction:
        "Сформувати вердикт: READY (всі обов'язкові C1–C6, C8–C11, C14 пройшли) або NOT_READY",
    },
    {
      order: 4,
      instruction:
        "Створити артефакт release_checklist_DD.MM.YY-HH-MM.md за шаблоном секції A",
    },
    {
      order: 5,
      instruction: "Оновити state.json відповідно до вердикту",
      substeps: [
        "READY: current_step → E2, status → completed, last_artifact → шлях чекліста",
        "NOT_READY: status → awaiting_human_decision, зафіксувати причину в notes. Ескалація: D1 (новий цикл) або KILL",
      ],
    },
  ],
  constraints: CONSTRAINTS,
  artifact: {
    registry_key: null,
    path_pattern: "control_center/audit/release_checklist_{date}.md",
  },
  transitions: [
    { condition: "READY", target: "E2" },
    {
      condition: "NOT_READY → D1 (рішення людини: повернення до development)",
      target: "D1",
      target_block: "development_cycle",
    },
  ],
  isolation_required: false,
};

// =============================================================================
// 9. Exports
// =============================================================================

export {
  RULES,
  MANDATORY_RULE_IDS,
  PRECONDITIONS,
  CONSTRAINTS,
  validate,
  evaluateRule,
};

export type {
  ReleaseCheckRule,
  CheckItemVerdict,
  ReleaseCheckResult,
  ReleaseCheckReport,
  KnownLimitation,
  ReleaseCheckInputContext,
};
