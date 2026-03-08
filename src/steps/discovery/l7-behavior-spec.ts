// =============================================================================
// L7: BEHAVIOR SPECIFICATION — Поведінкова специфікація — Template Generator
// Конвертовано з: control_center/standards/product/std-behavior-spec.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Типи (специфічні для L7 Behavior Specification)
// =============================================================================

/** Секція шаблону behavior_spec.md */
interface TemplateSection {
  id: string;
  title: string;
  required: boolean;
  format: "text" | "table" | "list" | "checklist" | "code_block";
  fillInstruction: string;
  validation?: (content: string) => boolean;
}

/** Параметри для генерації шаблону */
interface TemplateParams {
  date: string;
  projectName?: string;
  [key: string]: unknown;
}

/** Результат валідації структури */
interface StructureValidation {
  valid: boolean;
  missing_sections: string[];
  empty_sections: string[];
  issues: string[];
}

/** Результат валідації за критеріями прийнятності (§6) */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 4 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/final_view/project_description.md",
    description:
      "P1: Існує project_description.md у control_center/final_view/. Project Description відсутній → Блок: виконайте L5 спочатку.",
  },
  {
    type: "file_exists",
    path: "control_center/final_view/design_spec.md",
    description:
      "P2: Існує design_spec.md у control_center/final_view/. Design Spec відсутній → Блок: виконайте L6 спочатку.",
  },
  {
    type: "step_completed",
    step: "L5",
    description:
      "P3: project_description.md містить секції Core modules, Acceptance criteria, Interfaces. Якщо секції порожні — ескалація: Project Description неповний.",
  },

];

// =============================================================================
// 3. ALGORITHM (§4 — 8 кроків)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати project_description.md, design_spec.md, discovery_brief.md повністю. НЕ покладатись на часткове зчитування.",
  },
  {
    order: 2,
    instruction:
      "Визначити User Flows на основі MVP scope з discovery_brief та модулів з project_description.",
    substeps: [
      "Для кожної ключової фічі MVP — описати покроковий user flow",
      "Кожен крок: що робить користувач → що показує система → який стан змінюється",
      "Включити: happy path, error path, edge cases",
      "Використовувати компоненти з design_spec для опису UI-станів",
    ],
    contract_check:
      "User flows базуються ТІЛЬКИ на фічах з MVP scope. Не вигадувати додаткових сценаріїв.",
  },
  {
    order: 3,
    instruction:
      "Визначити Data Model на основі модулів та AC з project_description.",
    substeps: [
      "Визначити сутності (entities) — що зберігається",
      "Для кожної сутності: поля, типи, обов'язковість",
      "Зв'язки між сутностями",
      "Визначити де зберігаються дані: localStorage, API/DB, session",
    ],
    contract_check:
      "Data model повинна покривати ВСІ AC з project_description. Кожен AC має мати сутність, яка його реалізує.",
  },
  {
    order: 4,
    instruction:
      "Визначити API/Integration Contracts (якщо продукт має API або зовнішні інтеграції).",
    substeps: [
      "Для кожного ендпоінту: метод, шлях, вхідні дані, вихідні дані, коди помилок",
      "Для зовнішніх API: що відправляємо, що отримуємо, як обробляємо помилки",
      "Формат даних (JSON schema або текстовий опис)",
    ],
    contract_check:
      "Контракти базуються на Interfaces з project_description. Не вигадувати ендпоінтів, яких немає у вимогах.",
  },
  {
    order: 5,
    instruction:
      "Визначити State Management.",
    substeps: [
      "Які дані зберігаються на клієнті (localStorage, memory)",
      "Які дані зберігаються на сервері (DB)",
      "Як синхронізуються (якщо є)",
      "Що відбувається при втраті з'єднання, при перезавантаженні сторінки",
      "DATA LIFECYCLE (ОБОВ'ЯЗКОВО): для кожної сутності — retention policy (скільки зберігається), cleanup strategy (auto-archive/delete), що відбувається при досягненні ліміту. Без retention policy масштабування неможливе.",
    ],
  },
  {
    order: 6,
    instruction:
      "Визначити Edge Cases та Error Handling для кожного user flow.",
    substeps: [
      "Що якщо input пустий? Занадто довгий? Невалідний?",
      "Що якщо API не відповідає? Timeout?",
      "Що якщо дані пошкоджені? Немає даних?",
      "Що якщо юзер не авторизований?",
      "Для кожного edge case: очікувана поведінка системи (error message, fallback, retry)",
      "SECURITY CHECKLIST (ОБОВ'ЯЗКОВО): Rate limiting (глобальний + per-endpoint для auth/billing), CSRF protection, XSS sanitization, abuse prevention (bulk requests). Для кожного — конкретний механізм та ліміти.",
    ],
  },
  {
    order: 7,
    instruction:
      "Самоперевірка — пройти чекліст (§6 C1–C9). Кожна фіча MVP покрита user flow? Кожен AC має сутність в data model? Кожна інтеграція має контракт? Edge cases описані?",
  },
  {
    order: 8,
    instruction:
      "Зберегти артефакт як control_center/final_view/behavior_spec.md.",
  },
  {
    order: 9,
    instruction:
      "BLOCK SUMMARY: Згенерувати control_center/final_view/block_summary_discovery.md — компактний підсумок блоку Discovery (<500 токенів).",
    substeps: [
      "Секція ## Що побудовано: перелік артефактів (project_description, design_spec, behavior_spec) з 1-рядковим описом кожного",
      "Секція ## Ключові рішення: 3–5 найважливіших рішень, прийнятих у Discovery",
      "Секція ## MVP Scope: стислий перелік фіч та AC (імена, без деталей)",
      "Секція ## Відкриті ризики: якщо є — 1–3 рядки",
      "ОБМЕЖЕННЯ: файл НЕ БІЛЬШЕ 500 токенів. Деталі — у повних артефактах.",
    ],
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 8 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО вигадувати фічі, модулі або API, яких немає в project_description.md.",
  "ЗАБОРОНЕНО суперечити design_spec.md — компоненти та стани мають бути узгоджені.",
  "ЗАБОРОНЕНО суперечити project_description.md — scope та AC мають бути узгоджені.",
  "ЗАБОРОНЕНО додавати \"на майбутнє\" — тільки поточний MVP.",
  "ЗАБОРОНЕНО пропускати секції шаблону.",
  "ЗАБОРОНЕНО зберігати без проходження чеклісту (секція 6).",
  "ЗАБОРОНЕНО змінювати behavior_spec.md після збереження у final_view/ — він стає незмінним маяком.",
  "ЗАБОРОНЕНО реалізовувати код на цьому кроці — тільки специфікація.",
];

// =============================================================================
// 5. TEMPLATE SECTIONS (§A — Шаблон артефакту behavior_spec.md — 5 секцій)
// =============================================================================

const TEMPLATE_SECTIONS: TemplateSection[] = [
  // --- 1: User Flows ---
  {
    id: "user_flows",
    title: "User Flows",
    required: true,
    format: "text",
    fillInstruction:
      "Для кожної ключової фічі MVP: назва фічі (# з discovery_brief), компоненти (з design_spec). Happy Path — таблиця: Крок | Дія користувача | Відповідь системи | Стан UI. Error Path — таблиця: Крок | Ситуація | Відповідь системи | Стан UI. Edge Cases — таблиця: # | Умова | Очікувана поведінка. Мінімум 2 шляхи на flow (happy + error), мінімум 2 edge cases на flow.",
    validation: (content) => {
      // C1: кожна фіча має flow — мінімум один підзаголовок
      const hasFlows = content.includes("###");
      // C2: happy path + error path
      const hasHappy = content.toLowerCase().includes("happy path");
      const hasError = content.toLowerCase().includes("error path");
      return hasFlows && hasHappy && hasError;
    },
  },
  // --- 2: Data Model ---
  {
    id: "data_model",
    title: "Data Model",
    required: true,
    format: "text",
    fillInstruction:
      "Сутності — таблиця: Сутність | Поля | Зв'язки | Де зберігається (localStorage / API+DB / session). ER-діаграма (текстова). Маппінг AC → Сутності — таблиця: AC | Сутність | Поле/зв'язок. Кожен AC з project_description має мати відповідну сутність.",
    validation: (content) => {
      // C3: data model покриває AC — має таблиці
      const hasTables = content.includes("|");
      // Має містити сутності та маппінг AC
      const hasEntities = content.toLowerCase().includes("сутніст") || content.includes("###");
      return hasTables && hasEntities;
    },
  },
  // --- 3: API / Integration Contracts ---
  {
    id: "api_contracts",
    title: "API / Integration Contracts",
    required: true,
    format: "table",
    fillInstruction:
      "Внутрішні API — таблиця: Метод | Шлях | Вхід | Вихід | Помилки. Зовнішні API — таблиця: Сервіс | Що відправляємо | Що отримуємо | Timeout | Fallback. 1:1 з Interfaces з project_description. Не вигадувати ендпоінтів яких немає у вимогах.",
    validation: (content) => {
      // C4: контракти мають таблиці
      return content.includes("|") && content.split("\n").length >= 3;
    },
  },
  // --- 4: State Management ---
  {
    id: "state_management",
    title: "State Management",
    required: true,
    format: "text",
    fillInstruction:
      "Клієнтський стан — таблиця: Дані | Де зберігається | Час життя | Синхронізація. Серверний стан — таблиця: Дані | Де зберігається | Backup | Доступ. Перезавантаження сторінки — що зберігається, що втрачається, як відновлюється.",
    validation: (content) => {
      // C6: state management визначений — клієнт/сервер розмежовані
      const hasClient = content.toLowerCase().includes("клієнт") || content.toLowerCase().includes("client");
      const hasServer = content.toLowerCase().includes("сервер") || content.toLowerCase().includes("server");
      return hasClient || hasServer || content.includes("|");
    },
  },
  // --- 5: Edge Cases & Error Handling ---
  {
    id: "edge_cases",
    title: "Edge Cases & Error Handling",
    required: true,
    format: "table",
    fillInstruction:
      "Глобальні — таблиця: # | Ситуація | Поведінка | UI (мінімум: немає інтернету, API timeout, невалідний input). Per-flow edge cases — посилання на edge cases з секції User Flows.",
    validation: (content) => {
      // C5: edge cases описані
      return content.includes("|") && content.split("\n").length >= 4;
    },
  },
];

// =============================================================================
// 6. Генератор шаблону — generateTemplate()
// =============================================================================

/**
 * Генерує порожній/частково заповнений шаблон behavior_spec.md.
 * §A — шаблон артефакту з усіма секціями.
 */
function generateTemplate(params: TemplateParams): string {
  const projectName = params.projectName ?? "[Назва продукту]";

  return `# Behavior Specification — ${projectName}

> **Дата:** ${params.date}
> **Джерело:** project_description.md, design_spec.md

---

## User Flows

### Flow 1: [Назва фічі]
**Фіча MVP:** [# та назва з discovery_brief]
**Компоненти:** [з design_spec]

#### Happy Path
| Крок | Дія користувача | Відповідь системи | Стан UI |
|------|----------------|-------------------|---------|
| 1 | [Дія] | [Реакція] | [Компонент → стан] |
| 2 | [Дія] | [Реакція] | [Компонент → стан] |

#### Error Path
| Крок | Ситуація | Відповідь системи | Стан UI |
|------|----------|-------------------|---------|
| 1 | [Помилка] | [Реакція] | [Компонент → стан] |

#### Edge Cases
| # | Умова | Очікувана поведінка |
|---|-------|---------------------|
| 1 | [Умова] | [Поведінка] |

---

## Data Model

### Сутності
| Сутність | Поля | Зв'язки | Де зберігається |
|----------|------|---------|-----------------|
| [Назва] | [field: type (required/optional)] | [→ Інша сутність] | localStorage / API+DB / session |

### ER-діаграма (текстова)
\`\`\`
[Сутність A] 1──M [Сутність B] M──1 [Сутність C]
\`\`\`

### Маппінг AC → Сутності
| AC | Сутність | Поле/зв'язок |
|----|----------|-------------|
| AC1 | [Сутність] | [Що реалізує цей AC] |

---

## API / Integration Contracts

### Внутрішні API
| Метод | Шлях | Вхід | Вихід | Помилки |
|-------|------|------|-------|---------|
| POST | /api/[endpoint] | \`{field: type}\` | \`{field: type}\` | 400: [опис], 500: [опис] |

### Зовнішні API
| Сервіс | Що відправляємо | Що отримуємо | Timeout | Fallback |
|--------|----------------|-------------|---------|----------|
| [Назва] | [Формат] | [Формат] | [ms] | [Що робимо при помилці] |

---

## State Management

### Клієнтський стан
| Дані | Де зберігається | Час життя | Синхронізація |
|------|-----------------|-----------|---------------|
| [Що] | localStorage / sessionStorage / memory | [Коли зникає] | [Як синхронізується з сервером] |

### Серверний стан
| Дані | Де зберігається | Backup | Доступ |
|------|-----------------|--------|--------|
| [Що] | [DB / файл] | [Стратегія] | [Хто має доступ] |

### Перезавантаження сторінки
[Що зберігається, що втрачається, як відновлюється]

---

## Edge Cases & Error Handling

### Глобальні
| # | Ситуація | Поведінка | UI |
|---|----------|----------|-----|
| 1 | Немає інтернету | [Що відбувається] | [Що бачить юзер] |
| 2 | API timeout | [Що відбувається] | [Що бачить юзер] |
| 3 | Невалідний input | [Що відбувається] | [Що бачить юзер] |

### Per-flow edge cases
[Посилання на edge cases з секції User Flows]
`;
}

// =============================================================================
// 7. Валідація структури — validateStructure()
// =============================================================================

/** Витягує контент секції між заголовками */
function extractSection(content: string, title: string): string | null {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `## ${escapedTitle}\\n([\\s\\S]*?)(?=\\n## |$)`
  );
  const match = content.match(regex);
  return match ? match[1] : null;
}

/**
 * Перевіряє що агент заповнив всі обов'язкові секції behavior_spec.md.
 * Кожна TemplateSection.required=true має бути присутня і непорожня.
 */
function validateStructure(content: string): StructureValidation {
  const result: StructureValidation = {
    valid: true,
    missing_sections: [],
    empty_sections: [],
    issues: [],
  };

  for (const section of TEMPLATE_SECTIONS) {
    if (!section.required) continue;

    // Перевіряємо присутність заголовка
    if (!content.includes(section.title)) {
      result.missing_sections.push(section.id);
      result.valid = false;
      continue;
    }

    // Витягуємо контент секції
    const sectionContent = extractSection(content, section.title);
    if (!sectionContent || sectionContent.trim().length === 0) {
      result.empty_sections.push(section.id);
      result.valid = false;
      continue;
    }

    // Перевіряємо чи контент не є лише плейсхолдером
    const stripped = sectionContent
      .replace(/<!--.*?-->/gs, "")
      .replace(/\[.*?\]/g, "")
      .trim();
    if (stripped.length === 0) {
      result.empty_sections.push(section.id);
      result.valid = false;
      continue;
    }

    // Custom validation
    if (section.validation && !section.validation(sectionContent)) {
      result.issues.push(
        `Секція "${section.title}" не відповідає очікуваному формату`
      );
      result.valid = false;
    }
  }

  return result;
}

// =============================================================================
// 8. Валідація результату (§6 Критерії прийнятності C1–C9)
// =============================================================================

/**
 * Перевіряє заповнений behavior_spec.md за критеріями прийнятності (§6).
 */
function validateResult(content: string): ValidationOutcome {
  const issues: string[] = [];

  // Структурна валідація
  const structureCheck = validateStructure(content);
  if (!structureCheck.valid) {
    if (structureCheck.missing_sections.length > 0) {
      issues.push(
        `C7 FAIL: Відсутні секції: ${structureCheck.missing_sections.join(", ")}`
      );
    }
    if (structureCheck.empty_sections.length > 0) {
      issues.push(
        `C7 FAIL: Порожні секції: ${structureCheck.empty_sections.join(", ")}`
      );
    }
  }

  // C1: Кожна фіча MVP має user flow — 1:1 відповідність з MVP scope
  const userFlows = extractSection(content, "User Flows");
  if (!userFlows || !userFlows.includes("###")) {
    issues.push(
      "C1 FAIL: User Flows не містить жодного flow (очікуються підзаголовки ### Flow)"
    );
  }

  // C2: Кожен user flow має happy path + error path — мінімум 2 шляхи на flow
  if (userFlows) {
    const hasHappy = userFlows.toLowerCase().includes("happy path");
    const hasError = userFlows.toLowerCase().includes("error path");
    if (!hasHappy) {
      issues.push("C2 FAIL: User Flows не містить Happy Path");
    }
    if (!hasError) {
      issues.push("C2 FAIL: User Flows не містить Error Path");
    }
  }

  // C3: Data model покриває всі AC — кожен AC має сутність
  const dataModel = extractSection(content, "Data Model");
  if (!dataModel || !dataModel.includes("|")) {
    issues.push(
      "C3 FAIL: Data Model не містить таблиці сутностей"
    );
  } else {
    // Перевіряємо наявність маппінгу AC → Сутності
    if (!dataModel.includes("AC")) {
      issues.push(
        "C3 FAIL: Data Model не містить маппінг AC → Сутності"
      );
    }
  }

  // C4: Кожна зовнішня інтеграція має контракт — 1:1 з Interfaces
  const apiContracts = extractSection(content, "API / Integration Contracts");
  if (!apiContracts || !apiContracts.includes("|")) {
    issues.push(
      "C4 FAIL: API / Integration Contracts не містить таблиці контрактів"
    );
  }

  // C5: Edge cases описані для кожного user flow — мінімум 2 edge cases на flow
  const edgeCases = extractSection(content, "Edge Cases & Error Handling");
  if (!edgeCases || !edgeCases.includes("|")) {
    issues.push(
      "C5 FAIL: Edge Cases & Error Handling не містить таблиці edge cases"
    );
  }

  // C6: State management визначений — клієнт/сервер розмежовані
  const stateManagement = extractSection(content, "State Management");
  if (!stateManagement || !stateManagement.includes("|")) {
    issues.push(
      "C6 FAIL: State Management не містить таблиці"
    );
  }

  // C8: Зміст відповідає project_description та design_spec — не суперечить іншим маякам
  // (фактична перевірка відповідності — процедурна, виконується агентом)

  // C9: Файл збережено у final_view/ — перевіряється оркестратором

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 9. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L7: StepDefinition = {
  id: "L7",
  block: "discovery",
  name: "BEHAVIOR SPECIFICATION — Поведінкова специфікація",
  type: "autonomous",
  role: "researcher",
  purpose:
    "Формування поведінкової специфікації продукту — user flows, data model, API contracts, state management, edge cases. Результат — незмінний маяк behavior_spec.md у final_view/.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "file",
      path: "control_center/final_view/project_description.md",
      description: "Опис продукту — модулі, AC, scope, інтерфейси",
      required: true,
    },
    {
      source: "file",
      path: "control_center/final_view/design_spec.md",
      description: "Дизайн-специфікація — компоненти, сторінки, стани",
      required: true,
    },
    {
      source: "file",
      path: "control_center/project_description/discovery_brief.md",
      description: "Discovery Brief — MVP scope, user pain, retention hook",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/final_view/behavior_spec.md",
    template_id: "l7_behavior_spec_template",
  },

  transitions: [
    {
      condition: "Артефакт behavior_spec.md створено, чекліст §6 пройдено, збережено у final_view/",
      target: "L8",
      target_block: "foundation",
    },
  ],

  isolation_required: false,
};

// =============================================================================
// 10. Exports
// =============================================================================

export {
  // Генерація шаблону
  generateTemplate,
  // Валідація структури
  validateStructure,
  // Валідація результату (§6 критерії C1–C9)
  validateResult,
  // Допоміжна функція
  extractSection,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  TEMPLATE_SECTIONS,
};

export type {
  TemplateSection,
  TemplateParams,
  StructureValidation,
  ValidationOutcome,
};
