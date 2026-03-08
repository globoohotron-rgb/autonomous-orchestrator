// =============================================================================
// L13: Формування верифікованого чеклісту (Completion Checklist) — Process Algorithm
// Конвертовано з: control_center/standards/product/std-completion-checklist.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для L13 Completion Checklist)
// =============================================================================

/** Тип перевірки критерію */
type CriterionType =
  | "file_exists"
  | "code_contains"
  | "test_passes"
  | "output_matches"
  | "contract_crosscheck"
  | "value_delivers"
  | "tenant_isolation"
  | "onboarding_flow"
  | "rbac_enforced";

/** Один верифікований критерій для AC */
interface VerifiedCriterion {
  id: string;
  description: string;
  type: CriterionType;
  pattern: string;
  status: "PASS" | "FAIL";
}

/** Пріоритет AC */
type ACPriority = "P0" | "P1" | "P2";

/** Одна ціль — Acceptance Criterion з верифікованими критеріями */
interface ACEntry {
  ac_id: string;
  name: string;
  priority: ACPriority;
  criteria: VerifiedCriterion[];
  status: "DONE" | "NOT_DONE";
}

/** Contract crosscheck результат (Крок 2a) */
interface CrosscheckResult {
  endpoint: string;
  method: string;
  client_component: string;
  server_route: string;
  result: "MATCH" | "MISMATCH";
  details?: string;
}

/** Результат кроку L13 */
interface CompletionChecklistResult {
  ac_entries: ACEntry[];
  crosscheck_results: CrosscheckResult[];
  total_ac: number;
  done_ac: number;
  not_done_ac: number;
}

/** Параметри для генерації шаблону */
interface TemplateParams {
  projectName: string;
  date: string;
  ac_entries: ACEntry[];
  [key: string]: unknown;
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 5 передумов)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/final_view/project_description.md",
    description:
      "P1: Існує project_description.md — без опису продукту чекліст неможливий.",
  },
  {
    type: "step_completed",
    step: "L11",
    description:
      "P2: L11 (Завершення плану + HANSEI) завершено — state.json → last_completed_step = L11. Без HANSEI немає повної картини.",
  },
  {
    type: "dir_empty",
    path: "control_center/tasks/active",
    description:
      "P3: tasks/active/ порожній — всі задачі фундаменту виконані. Незавершені задачі = неповна база коду.",
  },
  {
    type: "step_completed",
    step: "L10",
    description:
      "P4: Кодова база проєкту існує (є файли коду). Без коду верифіковані критерії неможливі.",
  },
  {
    type: "file_exists",
    path: "control_center/final_view/behavior_spec.md",
    description:
      "P5: Існує behavior_spec.md — без behavior_spec контрактна верифікація неможлива.",
  },
];

// =============================================================================
// 3. ALGORITHM (§4 — 7 кроків + крок 2a)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати Acceptance Criteria з project_description.md → витягти повний список AC (AC1, AC2, ...). Для кожного AC зафіксувати: назву, опис, метод перевірки.",
    substeps: [
      "B2B Auto-AC (якщо project_description містить B2B Model):",
      "  Якщо в AC списку НЕМАє жодного AC з типом tenant_isolation/onboarding_flow/rbac_enforced:",
      "  — Автоматично додати AC-B2B-1: 'Tenant data isolation' (P0, tenant_isolation)",
      "  — Автоматично додати AC-B2B-2: 'Onboarding flow complete' (P1, onboarding_flow)",
      "  — Автоматично додати AC-B2B-3: 'RBAC enforcement' (P1, rbac_enforced)",
      "  Позначити ці AC як [auto-generated: B2B Model detected].",
    ],
  },
  {
    order: 2,
    instruction:
      "Розвідати фактичну структуру коду через інструменти (file_search, list_dir, grep).",
    substeps: [
      "Які файли/компоненти реально створено під час фундаменту (L10)",
      "Які тести існують",
      "Яка структура директорій (src/, components/, tests/, тощо)",
      "Які фреймворки/бібліотеки використовуються (package.json, requirements.txt, тощо)",
    ],
    contract_check:
      "Використовувати ТІЛЬКИ реальні шляхи та імена файлів. Не вигадувати паттерни.",
  },
  {
    order: 3,
    instruction:
      "Spec-to-Code Contract Crosscheck (ОБОВ'ЯЗКОВИЙ). Перевірити що побудований код відповідає контрактам з behavior_spec.md.",
    substeps: [
      "Прочитати behavior_spec.md → секція 3 «API / Integration Contracts» → витягти таблицю ендпоінтів (метод, шлях, вхідні поля, вихідні поля)",
      "Для кожного ендпоінту: відкрити route-файл серверу → перевірити HTTP метод, шлях та імена полів",
      "Відкрити відповідний клієнтський компонент → перевірити що клієнт відправляє ті самі імена полів на той самий шлях",
      "Зафіксувати результат: MATCH або MISMATCH з деталями",
      "Для кожного user flow з секції 1 behavior_spec.md — перевірити чи клієнтський компонент реально викликає API",
    ],
    contract_check:
      "Якщо знайдено ≥1 MISMATCH — кожен стає обов'язковим критерієм типу contract_crosscheck у відповідному AC.",
  },
  {
    order: 4,
    instruction:
      "Сформувати верифіковані критерії для кожного AC.",
    substeps: [
      "Визначити які файли/модулі реалізують цей AC (з Кроку 2)",
      "file_exists: конкретний шлях/паттерн на основі реальної структури",
      "code_contains: конкретний паттерн на основі реальних імен змінних/функцій",
      "test_passes: конкретний шлях тесту на основі реальних тестових файлів",
      "output_matches: перевірка виходу при вході через реальний HTTP/CLI запит — обов'язковий для AC бізнес-логіки",
      "contract_crosscheck: для AC з MISMATCH — компонент → endpoint → поля збігаються",
      "value_delivers: для AC з типом VALUE — опис перевірки цінності для користувача",
      "Кожен критерій — бінарний: PASS або FAIL. Ніяких суб'єктивних оцінок",
      "B2B Criteria (якщо project_description містить B2B Model):",
      "  — tenant_isolation: тест-сценарій де tenant A створює запис → tenant B НЕ бачить його. Паттерн: test file + assertion.",
      "  — onboarding_flow: від /register до першого корисного екрану. Паттерн: наявність route + компонентів onboarding.",
      "  — rbac_enforced: restricted endpoint → 403 для viewer role, 200 для admin. Паттерн: middleware + test.",
      "  Ці типи ОБОВ'ЯЗКОВІ для B2B проектів як P0 або P1 criteria.",
    ],
    contract_check:
      "Паттерни file_exists базовані на реальній структурі. Для ще не створених файлів — конвенції проєкту з Кроку 2.",
  },
  {
    order: 5,
    instruction:
      "Призначити пріоритети AC на основі project_description.md → Priority roadmap.",
    substeps: [
      "P0 (Ядро) — AC з пріоритетом Високий, ядро продукту (без них продукт не працює). Розробляти першими",
      "P1 (USP) — AC з пріоритетом Високий, диференціатор. Розробляти після P0",
      "P2 (Допоміжне) — AC з пріоритетом Середній та Низький. Розробляти останніми",
      "Якщо пріоритети не чіткі — P0 = від чого залежить все інше; P1 = що створює цінність; P2 = решта",
      "B2B Priority Rules (додатково до базових):",
      "  — AC з tenant_isolation → завжди P0 (data leak = критичний ризик)",
      "  — AC з rbac_enforced → P0 якщо є sensitive data, інакше P1",
      "  — AC з onboarding_flow → P1 (value delivery залежить від onboarding)",
      "  — AC з billing integration → P1 (revenue залежить від billing)",
    ],
  },
  {
    order: 6,
    instruction:
      "Самоперевірка: для кожного file_exists — перевірити що шлях/паттерн відповідає реальній структурі. Для code_contains — перевірити що паттерн знаходить результат у існуючому коді. Для ще не реалізованих AC — переконатися що паттерн послідовний з конвенціями проєкту.",
  },
  {
    order: 7,
    instruction:
      "Зберегти артефакт як control_center/final_view/completion_checklist.md.",
  },
  {
    order: 8,
    instruction:
      "BLOCK SUMMARY: Згенерувати control_center/final_view/block_summary_foundation.md — компактний підсумок блоку Foundation (<500 токенів).",
    substeps: [
      "Секція ## Що побудовано: архітектура, код, тести — перелік модулів/файлів з 1-рядковим описом",
      "Секція ## HANSEI висновки: 2–3 ключові уроки з l12-hansei",
      "Секція ## Checklist стан: кількість AC, розподіл P0/P1/P2, скільки PASS/FAIL",
      "Секція ## Технічний борг: якщо є — 1–3 рядки",
      "Секція ## B2B Foundation: якщо B2B — перерахувати: tenant model (schema/RLS/middleware), auth model (roles), onboarding status, billing status. 1-2 рядки.",
      "ОБМЕЖЕННЯ: файл НЕ БІЛЬШЕ 500 токенів. Деталі — у повних артефактах.",
    ],
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 5 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО вигадувати шляхи файлів без перевірки через інструменти.",
  "ЗАБОРОНЕНО створювати критерії типу PARTIAL — тільки PASS/FAIL.",
  "ЗАБОРОНЕНО додавати AC, яких немає в project_description.md.",
  "ЗАБОРОНЕНО змінювати project_description.md.",
  "ЗАБОРОНЕНО залишати пріоритет без AC.",
];

// =============================================================================
// 5. Генератор шаблону — generateTemplate()
// =============================================================================

/**
 * Генерує шаблон completion_checklist.md.
 * §A — шаблон артефакту з пріоритетами AC та верифікованими критеріями.
 */
function generateTemplate(params: TemplateParams): string {
  const projectName = params.projectName || "[Назва проєкту]";

  // Формуємо таблицю пріоритетів
  const p0 = params.ac_entries.filter((ac) => ac.priority === "P0");
  const p1 = params.ac_entries.filter((ac) => ac.priority === "P1");
  const p2 = params.ac_entries.filter((ac) => ac.priority === "P2");

  const priorityRows = [
    p0.length > 0
      ? `| P0 (Ядро) | Ядро продукту | ${p0.map((a) => a.ac_id).join(", ")} |`
      : "",
    p1.length > 0
      ? `| P1 (USP)  | Диференціатор | ${p1.map((a) => a.ac_id).join(", ")} |`
      : "",
    p2.length > 0
      ? `| P2 (Доп.) | Допоміжне     | ${p2.map((a) => a.ac_id).join(", ")} |`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Формуємо секції AC
  const acSections = params.ac_entries
    .map((ac) => {
      const criteriaRows = ac.criteria
        .map(
          (c) =>
            `| ${c.id} | ${c.description} | \`${c.type}: ${c.pattern}\` |`
        )
        .join("\n");

      return `### ${ac.ac_id}: ${ac.name} — ${ac.priority}
| # | Критерій | Тип перевірки |
|---|----------|---------------|
${criteriaRows}`;
    })
    .join("\n\n---\n\n");

  return `# Completion Checklist — ${projectName}

> Цей файл є машино-зчитуваним маяком для агента. Кожна ціль має
> **верифіковані критерії** — конкретні файли, функції або тести,
> які мають існувати. Агент перевіряє їх через інструменти
> (файлова система, запуск тестів), а не інтерпретує текст.

---

## Пріоритети AC

| Пріоритет | Назва | AC |
|-----------|-------|-----|
${priorityRows}

**Правило:** Агент планує роботу за пріоритетом: P0 спочатку, потім P1, потім P2. Фокус на якості, а не на кількості.

---

${acSections}

---

## Правила верифікації

1. **\`file_exists\`** — агент перевіряє через list_dir / file_search. Файл або існує, або ні.
2. **\`code_contains\`** — агент шукає через grep. Паттерн або знайдено, або ні.
3. **\`test_passes\`** — агент запускає тест. Тест або проходить, або ні.
4. **\`output_matches\`** — перевірка конкретного виходу при конкретному вході через реальний запит. PASS тільки з доказом.
5. **\`value_delivers\`** — перевірка цінності для користувача. PASS тільки з конкретним доказом цінності.
6. **\`contract_crosscheck\`** — клієнтський компонент відправляє запит на правильний endpoint з правильними іменами полів. PASS тільки якщо endpoint path + всі обов'язкові поля збігаються.
7. **\`tenant_isolation\`** — тест-сценарій: tenant A створює запис, tenant B не бачить його. PASS тільки з доказом ізоляції.
8. **\`onboarding_flow\`** — від /register до першого корисного екрану. PASS якщо route + компоненти існують.
9. **\`rbac_enforced\`** — restricted endpoint → 403 для viewer, 200 для admin. PASS тільки з middleware + test.
10. Статус критерію: \`PASS\` (доказ знайдено) або \`FAIL\` (доказ не знайдено). **Немає \`PARTIAL\`.**
11. AC вважається \`DONE\` коли **всі** його критерії = \`PASS\`.
12. AC вважається \`NOT_DONE\` коли **хоча б один** критерій = \`FAIL\`.
`;
}

// =============================================================================
// 6. Валідація результату (§6 Критерії прийнятності — 9 пунктів)
// =============================================================================

/**
 * Перевіряє заповнений completion_checklist.md за критеріями прийнятності (§6).
 */
function validateResult(content: string): ValidationOutcome {
  const issues: string[] = [];

  // C1: Кожен AC з project_description.md присутній у чеклісті
  // (Потребує project_description для порівняння — агент перевіряє процедурно)
  if (!content.includes("###")) {
    issues.push("C1 FAIL: Жодного AC не знайдено у чеклісті (відсутні підзаголовки ###)");
  }

  // C2: Кожен AC має мінімум 2 верифіковані критерії
  const acSections = content.split("###").slice(1);
  for (const section of acSections) {
    const firstLine = section.trim().split("\n")[0];
    const criterionRows = section
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("Критерій"));
    if (criterionRows.length < 2) {
      issues.push(
        `C2 FAIL: AC "${firstLine.trim()}" має менше 2 критеріїв (знайдено: ${criterionRows.length})`
      );
    }
  }

  // C3: Кожен критерій — бінарний (PASS/FAIL), без суб'єктивних оцінок
  // (Структурна перевірка: типи із дозволеного списку — фактично перевіряється агентом)

  // C4: Паттерни file_exists базуються на реальній структурі проєкту
  // (Агент перевіряє процедурно на Кроці 6)

  // C5: Паттерни code_contains базуються на реальних іменах з кодової бази
  // (Агент перевіряє процедурно на Кроці 6)

  // C6: AC розподілені за пріоритетами (P0, P1, P2) з обґрунтуванням
  if (!content.includes("Пріоритети AC")) {
    issues.push("C6 FAIL: Секція 'Пріоритети AC' відсутня");
  }
  const hasP0 = content.includes("P0");
  const hasP1 = content.includes("P1");
  if (!hasP0 && !hasP1) {
    issues.push("C6 FAIL: Жоден пріоритет (P0/P1) не знайдено");
  }

  // C7: Крок 2a виконано — кожен API ендпоінт з behavior_spec.md перевірено
  // (Агент перевіряє процедурно — contract_crosscheck критерії мають бути присутні)

  // C8: Кожен MISMATCH з Кроку 2a має відповідний contract_crosscheck критерій
  // (Агент перевіряє процедурно)

  // C9: Файл збережено у final_view/ — перевіряється оркестратором

  // Перевірка секції "Правила верифікації"
  if (!content.includes("Правила верифікації")) {
    issues.push("Структурна помилка: відсутня секція 'Правила верифікації'");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 7. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L13: StepDefinition = {
  id: "L13",
  block: "foundation",
  name: "Формування верифікованого чеклісту (Completion Checklist)",
  type: "autonomous",
  role: "architect",
  purpose:
    "Формування верифікованого чеклісту цілей продукту на основі project_description.md та фактичної структури коду. Результат — незмінний маяк completion_checklist.md у final_view/ з пріоритетами AC та бінарними критеріями.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "file",
      path: "control_center/final_view/project_description.md",
      description: "Опис продукту — джерело AC, модулів, scope, пріоритетів",
      required: true,
    },
    {
      source: "file",
      path: "control_center/final_view/behavior_spec.md",
      description: "Поведінкова специфікація — API contracts, data model, user flows — еталон контрактів",
      required: true,
    },
    {
      source: "artifact",
      artifact_key: "hansei",
      description: "HANSEI фундаменту — уроки, що працює, що ні",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/final_view/completion_checklist.md",
    template_id: "l13_completion_checklist_template",
  },

  transitions: [
    {
      condition: "Артефакт completion_checklist.md створено, критерії прийнятності §6 пройдено, збережено у final_view/",
      target: "GATE1",
    },
  ],

  isolation_required: false,
};

// =============================================================================
// 8. Exports
// =============================================================================

export {
  // Генерація шаблону
  generateTemplate,
  // Валідація результату (§6 критерії)
  validateResult,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
};

export type {
  CriterionType,
  VerifiedCriterion,
  ACPriority,
  ACEntry,
  CrosscheckResult,
  CompletionChecklistResult,
  TemplateParams,
  ValidationOutcome,
};
