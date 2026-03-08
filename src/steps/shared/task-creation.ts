// =============================================================================
// Task Creation — Template Generator (dual-mode: L9 Foundation, D4 Development)
// Конвертовано з: control_center/standards/tasks/std-task-creation.md
// Інструмент: використовується кроками L9, D4
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  InputReference,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Types
// =============================================================================

/** Контекст виконання — визначається з current_step */
type TaskCreationContext = "foundation" | "development";

/** Маппінг крок → контекст */
const STEP_TO_CONTEXT: Record<string, TaskCreationContext> = {
  L9: "foundation",
  D4: "development",
};

/** Категорія задачі (§4.2) */
type TaskCategory = "code" | "test" | "config" | "design" | "behavior";

/** Правила для категорій задач */
interface TaskCategoryRule {
  id: TaskCategory;
  description: string;
  /** Спеціальні AC для категорії */
  special_ac?: string;
  /** Необхідний spec-файл; якщо відсутній — категорія не застосовується */
  requires_spec?: string;
}

/** 5 категорій задач з §4.2 */
const TASK_CATEGORIES: TaskCategoryRule[] = [
  {
    id: "code",
    description: "Технічна реалізація (логіка, API, дані)",
  },
  {
    id: "test",
    description: "Написання/оновлення тестів",
    special_ac: "AC включають coverage",
  },
  {
    id: "config",
    description: "Конфігурація, env, інфраструктура",
    special_ac: "AC включають перевірку запуску",
  },
  {
    id: "design",
    description: "UI-компоненти, стилі, layout",
    special_ac: "Обов'язковий design_matches AC: «Компонент X відповідає специфікації Y з design_spec.md (стилі, стани, responsive)»",
    requires_spec: "design_spec.md",
  },
  {
    id: "behavior",
    description: "Реалізація user flow, API, data model",
    special_ac: "Обов'язковий behavior_matches AC: «User flow X відповідає специфікації Y з behavior_spec.md (happy path, error path, edge cases)»",
    requires_spec: "behavior_spec.md",
  },
];

// =============================================================================
// 2. Decomposition Rules (§4.2)
// =============================================================================

interface DecompositionRule {
  id: string;
  rule: string;
}

/** 9 правил декомпозиції плану на задачі */
const DECOMPOSITION_RULES: DecompositionRule[] = [
  { id: "DR1", rule: "Один етап → одна або кілька задач" },
  { id: "DR2", rule: "Кожна задача має одну чітку, вузьку ціль" },
  { id: "DR3", rule: "Задача виконувана агентом без додаткових уточнень" },
  { id: "DR4", rule: "Задачі не перетинаються між собою" },
  { id: "DR5", rule: "Занадто велика задача (>1 файл або >1 функціональний блок) → розбити" },
  { id: "DR6", rule: "Занадто дрібна задача (окремий рядок, імпорт) → об'єднати з суміжною" },
  { id: "DR7", rule: "Кожна задача — автономна одиниця роботи з повним описом" },
  { id: "DR8", rule: "Ідентифікатор: [Літера етапу][Номер] (A1, A2, B1…)" },
  { id: "DR9", rule: "Визначити порядок виконання та залежності між задачами" },
  { id: "DR10", rule: "Module Isolation: одна задача працює в межах ОДНОГО модуля/feature. Якщо задача потребує змін у 2+ модулях — розбити на окремі задачі з явною залежністю" },
  { id: "DR11", rule: "Shared Code: зміни у shared/common коді (утиліти, типи, конфіги) = ОКРЕМА задача-залежність, яка виконується ПЕРШОЮ. Задачі модулів залежать від неї" },
  { id: "DR12", rule: "File Ownership: один файл НЕ може змінюватись більш ніж однією задачею (виняток: shared типи/утиліти через DR11). Якщо 2 задачі правлять один файл — об'єднати або виділити shared задачу" },
];

// =============================================================================
// 3. Template Sections (§A — шаблон артефакту задачі)
// =============================================================================

interface TemplateSection {
  id: string;
  title: string;
  required: boolean;
  format: "text" | "table" | "list" | "checklist" | "code_block";
  fillInstruction: string;
  validation?: (content: string) => boolean;
}

/** 10 обов'язкових секцій шаблону задачі */
const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    id: "task_description",
    title: "Опис задачі",
    required: true,
    format: "text",
    fillInstruction: "Що зробити — 1–3 речення. Без деталей реалізації.",
    validation: (content) => {
      const trimmed = content.trim();
      return trimmed.length > 0 && trimmed.length <= 500;
    },
  },
  {
    id: "task_goal",
    title: "Ціль задачі",
    required: true,
    format: "text",
    fillInstruction: "Одна, однозначна, вимірювана ціль. Заборонено: «покращити», «оптимізувати», «зробити краще».",
    validation: (content) => {
      const forbidden = ["покращити", "оптимізувати", "зробити краще"];
      return content.trim().length > 0 && !forbidden.some(f => content.toLowerCase().includes(f));
    },
  },
  {
    id: "expected_result",
    title: "Очікуваний результат",
    required: true,
    format: "text",
    fillInstruction: "Що має існувати після виконання. Конкретні артефакти.",
    validation: (content) => content.trim().length > 0,
  },
  {
    id: "execution_steps",
    title: "Кроки виконання",
    required: true,
    format: "list",
    fillInstruction: "Послідовний перелік конкретних дій. Кожен крок = одна дія. Формат: нумерований список.",
    validation: (content) => {
      const steps = content.split("\n").filter(l => /^\d+\.\s/.test(l.trim()));
      return steps.length >= 1;
    },
  },
  {
    id: "acceptance_criteria",
    title: "Acceptance Criteria",
    required: true,
    format: "checklist",
    fillInstruction: "Перевіряльні умови (pass/fail). Для design: включити design_matches. Для behavior: включити behavior_matches.",
    validation: (content) => content.includes("- [ ]"),
  },
  {
    id: "definition_of_done",
    title: "Definition of Done",
    required: true,
    format: "checklist",
    fillInstruction: "Набір умов завершення задачі.",
    validation: (content) => content.includes("- [ ]"),
  },
  {
    id: "files_to_modify",
    title: "Файли для створення/оновлення",
    required: true,
    format: "table",
    fillInstruction: "Таблиця: Дія | Шлях. Повні шляхи від кореня проєкту. Мінімум 1 рядок даних.",
    validation: (content) => {
      const rows = content.split("\n").filter(l => l.includes("|"));
      // header + separator + at least 1 data row
      return rows.length >= 3;
    },
  },
  {
    id: "dependencies",
    title: "Залежності",
    required: true,
    format: "list",
    fillInstruction: "Від якої задачі залежить, або «Немає». Залежності без циклів.",
  },
  {
    id: "tests",
    title: "Тести",
    required: true,
    format: "text",
    fillInstruction: "Опис тестів: що запустити, що перевірити, критерії проходження.",
    validation: (content) => content.trim().length > 0,
  },
  {
    id: "execution_report",
    title: "Звіт про виконання",
    required: true,
    format: "text",
    fillInstruction: "Зберегти у control_center/tasks/done/[Назва плану]/[Назва задачі].md. Якщо виявлено несправності — створити issue у control_center/issues/active/.",
  },
  // --- Нові секції для самодостатності задачі (Variant 2 + Validation) ---
  {
    id: "code_context",
    title: "Контекст коду",
    required: true,
    format: "code_block",
    fillInstruction: "Для КОЖНОГО файлу з 'Файли для створення/оновлення': вставити РЕАЛЬНИЙ сніпет поточного коду (10-30 рядків навколо місця зміни) з номерами рядків та шляхом файлу. Під кожним сніпетом — блок 'Що змінити:' з конкретним описом трансформації у форматі БУЛО→СТАЛО з кодом. Якщо файл створюється з нуля — показати повний скелет з усіма імпортами та структурою.",
    validation: (content) => {
      // Має містити хоча б один блок коду та опис зміни
      return content.includes("```") && (content.toLowerCase().includes("змінити") || content.toLowerCase().includes("створити") || content.toLowerCase().includes("додати"));
    },
  },
  {
    id: "prohibitions",
    title: "Заборони",
    required: true,
    format: "list",
    fillInstruction: "Список КОНКРЕТНИХ заборон для цієї задачі. ОБОВ'ЯЗКОВІ заборони (включати завжди): 1) НЕ міняти .toBe() на .toContain(), .toBeGreaterThanOrEqual(), .toBeDefined() — якщо тест падає, виправити КОД, не assertion. 2) НЕ використовувати масиви варіантів: expect(['a','b']).toContain(x) ЗАБОРОНЕНО. 3) НЕ додавати .skip або .todo до існуючих тестів. 4) НЕ змінювати файли за межами списку 'Файли для створення/оновлення'. Додатково: domain-специфічні заборони для конкретної задачі.",
    validation: (content) => {
      // Має містити хоча б 4 заборони
      const items = content.split("\n").filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l));
      return items.length >= 4;
    },
  },
  {
    id: "validation_script",
    title: "Validation Script",
    required: true,
    format: "code_block",
    fillInstruction: "Bash/PowerShell команди які агент ПОВИНЕН запустити ПІСЛЯ виконання задачі для самоперевірки. Включає: 1) Команду запуску тестів (npx vitest run <шлях> --reporter=verbose). 2) Grep-перевірку на слабкі assertions: шукати toBeGreaterThanOrEqual, toBeDefined де має бути toBe, toContain з масивами. 3) Очікуваний результат: скільки тестів має пройти, 0 skipped, 0 failed. Якщо validation script показує FAIL — задача НЕ ЗАВЕРШЕНА.",
    validation: (content) => {
      return content.includes("```") && (content.includes("vitest") || content.includes("test") || content.includes("grep") || content.includes("PASS") || content.includes("FAIL"));
    },
  },
];

// =============================================================================
// 4. POKA-YOKE Preconditions (§3 — 4 перевірки)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "dir_not_empty",
    path: "control_center/plans/active",
    description: "У plans/active/ існує рівно один файл плану",
  },
  {
    type: "artifact_registered",
    artifact_key: "plan",
    description: "Файл плану не порожній і містить пункти/етапи для декомпозиції",
  },
  {
    type: "dir_not_empty",
    path: "control_center/final_view",
    description: "final_view/ містить файли опису продукту",
  },
  {
    type: "dir_empty",
    path: "control_center/tasks/active",
    description: "tasks/active/ порожній — немає задач від попереднього плану",
  },
];

// =============================================================================
// 5. Shared Step Configuration (L9 / D4)
// =============================================================================

/** Вхідні дані (§2) — спільні для обох контекстів */
const SHARED_INPUTS: InputReference[] = [
  {
    source: "artifact",
    artifact_key: "plan",
    description: "Активний план (єдиний файл у plans/active/) — ЄДИНЕ ДЖЕРЕЛО для створення задач",
    required: true,
  },
];

/** Алгоритм (§4 — 8 кроків) */
const SHARED_ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction: "Зчитати план з plans/active/ ПОВНІСТЮ",
    substeps: [
      "Відкрити файл плану",
      "Зчитати весь план",
      "Виділити перелік етапів/пунктів плану",
      "Для кожного етапу витягнути: суть, очікуваний результат, технічний контекст, обсяг робіт",
    ],
  },
  {
    order: 2,
    instruction: "Декомпозиція плану на задачі (за DECOMPOSITION_RULES)",
    substeps: [
      "Визначити кількість задач для кожного етапу",
      "Декомпозиція за scope: кожен модуль/файл із scope етапу → окрема задача (DR10 Module Isolation). Якщо етап має 3 модулі в scope → мінімум 3 задачі. Shared-залежності між модулями → окрема задача-залежність (DR11). Тести для кожного модуля → окрема задача (DR2).",
      "Кожна задача — одна чітка, вузька ціль",
      "Задачі не перетинаються",
      "Визначити порядок виконання та залежності",
      "Присвоїти ідентифікатори: [Літера етапу][Номер]",
      "ОБОВ'ЯЗКОВО: для кожної задачі ПРОЧИТАТИ реальний код файлів які будуть змінюватись та включити сніпети в задачу. Задача без контексту коду = невалідна задача.",
    ],
  },
  {
    order: 3,
    instruction: "Визначити категорію кожної задачі (code/test/config/design/behavior)",
    substeps: [
      "Для design — обов'язкове посилання на design_spec.md (якщо існує)",
      "Для behavior — обов'язкове посилання на behavior_spec.md (якщо існує)",
    ],
  },
  {
    order: 4,
    instruction: "Згенерувати шаблон задачі (generateTemplate) — шаблон тепер включає 13 секцій: 10 базових + Контекст коду + Заборони + Validation Script",
  },
  {
    order: 5,
    instruction: "Заповнити всі секції шаблону згідно з fillInstructions. КРИТИЧНО: задача повинна бути САМОДОСТАТНЬОЮ — агент в чистій сесії без контексту повинен змогти виконати її від початку до кінця.",
    substeps: [
      "Всі 13 секцій мають бути заповнені (10 базових + Контекст коду + Заборони + Validation Script)",
      "Для design категорії — додати design_matches AC",
      "Для behavior категорії — додати behavior_matches AC",
      "КОНТЕКСТ КОДУ: для кожного файлу з таблиці 'Файли для створення/оновлення' — ПРОЧИТАТИ реальний код файлу та вставити сніпет (10-30 рядків) навколо місця зміни. Для кожного сніпету написати БУЛО→СТАЛО з конкретним кодом.",
      "ЗАБОРОНИ: включити 4 обов'язкові заборони (не послаблювати assertions, не використовувати масиви в toContain, не skip/todo, не виходити за межі файлів) + специфічні для задачі",
      "VALIDATION SCRIPT: написати конкретну команду запуску тестів + grep на слабкі assertions + очікуваний результат (кількість тестів pass)",
    ],
  },
  {
    order: 6,
    instruction: "Перевірити технічну цілісність за std-technical-censure.md (§4.4)",
    substeps: [
      "Архітектурна гігієна (заборона over-engineering, заборона hardcode)",
      "Конституція безпеки (cookies замість localStorage, персистентність секретів)",
      "Дані зберігаються персистентно (volumes, файли/БД, не memory-only)",
      "Задача містить тести на невалідні дані та несанкціонований доступ",
    ],
  },
  {
    order: 7,
    instruction: "Перевірити якість задачі за std-task-quality.md (§4.5)",
    substeps: [
      "Пройти Quality Gate (кроки 1–7)",
      "Якщо не пройшла — переформувати і повторити перевірку",
    ],
  },
  {
    order: 8,
    instruction: "Перевірити структуру (validateStructure) і зберегти у tasks/active/",
    substeps: [
      "Формат: Markdown",
      "Назва файлу: [ID] [Назва плану] DD.MM.YY-HH-MM.md",
    ],
  },
];

/** Обмеження (§8 — 9 заборон) */
const SHARED_CONSTRAINTS: string[] = [
  "НЕ виконує задачі — тільки формує їх",
  "НЕ змінює логіку плану — працює з планом як з незмінним входом",
  "НЕ вигадує зміст етапу — бере тільки те, що написано в плані",
  "НЕ створює задачі, які виходять за межі плану",
  "НЕ пропускає етапи плану — кожен етап має бути покритий задачами",
  "НЕ змінює стандарти, структуру control_center/ або файли final_view/",
  "НЕ зберігає задачу, яка не пройшла перевірку за std-technical-censure.md або Quality Gate за std-task-quality.md",
  "НЕ додає функціональність «на майбутнє» або задачі «для покращення», яких немає в плані",
  "НЕ використовує абстрактні формулювання: «покращити», «оптимізувати», «зробити краще»",
];

// =============================================================================
// 6. Step Definitions
// =============================================================================

/** L9 — Формування задач (Foundation) */
export const STEP_L9: StepDefinition = {
  id: "L9",
  block: "foundation",
  name: "Формування задач",
  type: "autonomous",
  role: "architect",
  purpose: "Декомпозиція нульового плану (Foundation) на набір задач, готових до виконання",
  standards: [],
  preconditions: PRECONDITIONS,
  inputs: SHARED_INPUTS,
  algorithm: SHARED_ALGORITHM,
  constraints: SHARED_CONSTRAINTS,
  artifact: {
    registry_key: null,
    path_pattern: "control_center/tasks/active/{id} {plan_name} {date}.md",
    template_id: "task_creation_template",
  },
  transitions: [
    {
      condition: "Всі задачі створені, пройшли Quality Gate та цензуру",
      target: "L10",
    },
  ],
  isolation_required: false,
};

/** D4 — Формування задач (Development) */
export const STEP_D4: StepDefinition = {
  id: "D4",
  block: "development_cycle",
  name: "Формування задач",
  type: "autonomous",
  role: "programmer",
  purpose: "Декомпозиція плану розвитку на набір задач, готових до виконання",
  standards: [],
  preconditions: PRECONDITIONS,
  inputs: SHARED_INPUTS,
  algorithm: SHARED_ALGORITHM,
  constraints: SHARED_CONSTRAINTS,
  artifact: {
    registry_key: null,
    path_pattern: "control_center/tasks/active/{id} {plan_name} {date}.md",
    template_id: "task_creation_template",
  },
  transitions: [
    {
      condition: "Всі задачі створені, пройшли Quality Gate та цензуру",
      target: "D5",
    },
  ],
  isolation_required: false,
};

// =============================================================================
// 7. Template Generator — generateTemplate()
// =============================================================================

interface TemplateParams {
  /** Ідентифікатор задачі (A1, B2 тощо) */
  task_id: string;
  /** Назва плану */
  plan_name: string;
  /** Дата у форматі DD.MM.YY-HH-MM */
  date: string;
  /** Категорія задачі */
  category?: TaskCategory;
  [key: string]: unknown;
}

/** Генерує порожній Markdown-шаблон задачі (§A) */
function generateTemplate(params: TemplateParams): string {
  let output = `# ${params.task_id} ${params.plan_name} ${params.date}\n`;

  for (const section of TEMPLATE_SECTIONS) {
    output += `\n## ${section.title}\n`;

    if (section.format === "table" && section.id === "files_to_modify") {
      output += `| Дія | Шлях |\n|-----|------|\n`;
    } else if (section.format === "checklist") {
      output += `- [ ] \n`;
    } else if (section.format === "list") {
      output += `1. \n`;
    }

    // Спеціальні AC для design/behavior категорій
    if (section.id === "acceptance_criteria" && params.category) {
      const catRule = TASK_CATEGORIES.find(c => c.id === params.category);
      if (catRule?.special_ac) {
        output += `<!-- УВАГА: ${catRule.special_ac} -->\n`;
      }
    }

    output += `<!-- ${section.fillInstruction} -->\n`;
  }

  return output;
}

// =============================================================================
// 8. Structure Validation — validateStructure()
// =============================================================================

interface StructureValidation {
  valid: boolean;
  missing_sections: string[];
  empty_sections: string[];
  issues: string[];
}

/** Витягує вміст секції між ## заголовками */
function extractSection(content: string, title: string): string | null {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`## ${escapedTitle}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1] : null;
}

/** Перевіряє що агент заповнив всі обов'язкові секції шаблону задачі */
function validateStructure(content: string): StructureValidation {
  const result: StructureValidation = {
    valid: true,
    missing_sections: [],
    empty_sections: [],
    issues: [],
  };

  for (const section of TEMPLATE_SECTIONS) {
    if (!section.required) continue;

    // Перевірка наявності заголовка секції
    if (!content.includes(`## ${section.title}`)) {
      result.missing_sections.push(section.id);
      result.valid = false;
      continue;
    }

    // Перевірка що секція не порожня
    const sectionContent = extractSection(content, section.title);
    if (!sectionContent || sectionContent.trim().length === 0) {
      result.empty_sections.push(section.id);
      result.valid = false;
      continue;
    }

    // Перевірка формату (якщо є validation)
    if (section.validation && !section.validation(sectionContent)) {
      result.issues.push(`Секція "${section.title}" не відповідає формату`);
      result.valid = false;
    }
  }

  return result;
}

// =============================================================================
// 9. Result Validation — validateResult() (§6 — 12 критеріїв прийнятності)
// =============================================================================

interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

/** Перевіряє набір задач за критеріями прийнятності §6 */
function validateResult(tasks: string[], planStages: string[]): ValidationOutcome {
  const issues: string[] = [];

  // §6.1: Кожен етап плану покритий хоча б однією задачею
  if (planStages.length > 0 && tasks.length === 0) {
    issues.push("План має етапи, але задачі не сформовані");
  }

  // §6.2: Жоден етап не пропущений — перевіряється на рівні декомпозиції

  // §6.3: Кожна задача заповнена за шаблоном — усі розділи присутні
  for (let i = 0; i < tasks.length; i++) {
    const structureResult = validateStructure(tasks[i]);
    if (!structureResult.valid) {
      issues.push(
        `Задача #${i + 1} не відповідає шаблону: ` +
        `missing=[${structureResult.missing_sections.join(", ")}], ` +
        `empty=[${structureResult.empty_sections.join(", ")}], ` +
        `issues=[${structureResult.issues.join(", ")}]`
      );
    }
  }

  // §6.4: Формулювання однозначні — жодних абстракцій
  const FORBIDDEN_WORDS = ["покращити", "оптимізувати", "зробити краще"];
  for (let i = 0; i < tasks.length; i++) {
    for (const word of FORBIDDEN_WORDS) {
      if (tasks[i].toLowerCase().includes(word)) {
        issues.push(`Задача #${i + 1}: абстрактне формулювання "${word}"`);
      }
    }
  }

  // §6.5: Кожен крок виконання — одна конкретна дія (перевіряється validateStructure)

  // §6.6: Залежності без циклів — потребує графового аналізу, базова перевірка
  // (повна перевірка циклів виконується оркестратором)

  // §6.7: Файли з повними шляхами (перевіряється validateStructure → files_to_modify)

  // §6.8: Технічна цілісність за std-technical-censure (виконується окремим валідатором)
  // §6.9: Quality Gate за std-task-quality (виконується окремим валідатором)

  // §6.10: Задачі не перетинаються — перевіряється на рівні декомпозиції

  // §6.11: Задачі не виходять за межі плану — перевіряється на рівні декомпозиції

  // §6.12: Загальна кількість задач адекватна обсягу плану
  if (planStages.length > 0 && tasks.length > planStages.length * 8) {
    issues.push(
      `Забагато задач (${tasks.length}) для ${planStages.length} етапів плану`
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 10. Exports
// =============================================================================

export {
  TEMPLATE_SECTIONS,
  PRECONDITIONS,
  TASK_CATEGORIES,
  DECOMPOSITION_RULES,
  STEP_TO_CONTEXT,
  SHARED_INPUTS,
  SHARED_ALGORITHM,
  SHARED_CONSTRAINTS,
  generateTemplate,
  validateStructure,
  validateResult,
};

export type {
  TemplateSection,
  TemplateParams,
  StructureValidation,
  ValidationOutcome,
  TaskCategory,
  TaskCategoryRule,
  TaskCreationContext,
  DecompositionRule,
};
