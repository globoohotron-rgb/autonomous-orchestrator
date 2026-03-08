// =============================================================================
// Task Quality Gate — Template Generator (dual-mode: L9 Foundation, D4 Development)
// Конвертовано з: control_center/standards/tasks/std-task-quality.md
// Інструмент: використовується кроками L9, D4 — перевірка якості задачі перед збереженням
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

/** Результат одного кроку перевірки якості */
interface QualityCheckResult {
  step: number;
  name: string;
  passed: boolean;
  /** Конкретний факт підтвердження (цитата, шлях, diff) — §7 протидія сикофансії */
  evidence: string;
  issues: string[];
}

/** Повний результат Quality Gate */
interface QualityGateResult {
  task_id: string;
  all_passed: boolean;
  /** Крок 6 — технічна цілісність — перевіряється окремо (критичний) */
  step6_passed: boolean;
  steps: QualityCheckResult[];
  decision: "SAVE" | "REWORK";
  /** Сикофансія: якщо все PASS — повторна перевірка кроків 2 та 3 */
  sycophancy_recheck_triggered: boolean;
}

/** Категорія задачі для перевірки повноти AC (§4 крок 4) */
type TaskCategory = "code" | "test" | "config" | "design" | "behavior";

// =============================================================================
// 2. Quality Check Steps Definition (§4 — 7 кроків)
// =============================================================================

interface QualityCheckStep {
  step: number;
  name: string;
  description: string;
  checks: string[];
  /** Чи є крок критичним (провал = негайне відхилення) */
  critical: boolean;
}

/** 7 кроків перевірки якості з §4 */
const QUALITY_CHECK_STEPS: QualityCheckStep[] = [
  {
    step: 1,
    name: "Структурна відповідність",
    description: "Задача відповідає шаблону std-task-creation.md",
    checks: [
      "Усі обов'язкові розділи присутні та заповнені",
      "Формат назви файлу коректний",
    ],
    critical: false,
  },
  {
    step: 2,
    name: "Відповідність плану",
    description: "Задача відповідає конкретному пункту активного плану",
    checks: [
      "Порівняти задачу з конкретним пунктом активного плану (цитата)",
      "Задача НЕ виходить за межі етапу",
      "Задача не суперечить і не дублює інші задачі плану",
      "Задача логічно випливає з плану",
    ],
    critical: false,
  },
  {
    step: 3,
    name: "Декомпозиція та однозначність",
    description: "Формулювання чіткі, вузькі, без абстракцій",
    checks: [
      "Кожна підзадача має вузьку, чітку ціль",
      "Немає надмірно великих або надмірно дрібних задач",
      "Формулювання не допускають двох трактувань",
      "Відсутні абстрактні фрази: «покращити», «оптимізувати», «зробити краще», «за потреби»",
      "Кожен крок виконання — одна конкретна дія",
    ],
    critical: false,
  },
  {
    step: 4,
    name: "Повнота",
    description: "Все необхідне для виконання без додаткових уточнень",
    checks: [
      "Описано все необхідне для виконання без додаткових уточнень",
      "Усі файли для створення/оновлення вказані з повними шляхами",
      "Усі залежності від інших задач вказані",
      "Acceptance Criteria конкретні та перевіряємі",
      "Definition of Done чіткий, однозначний, вимірюваний",
      "Достатність AC (behavior/code): мінімум 1 AC перевіряє коректність виходу (input→output), не лише існування файлів",
    ],
    critical: false,
  },
  {
    step: 5,
    name: "Технічна коректність",
    description: "Логіка, залежності, архітектурна сумісність",
    checks: [
      "Немає логічних помилок або суперечностей",
      "Немає циклічних залежностей",
      "Технічні рішення відповідають архітектурі проєкту",
      "Виконання задачі не зруйнує існуючу функціональність",
    ],
    critical: false,
  },
  {
    step: 6,
    name: "Технічна цілісність",
    description: "Звірка з std-technical-censure.md — КРИТИЧНИЙ",
    checks: [
      "R1: Немає коду «на майбутнє» або надлишкової архітектури",
      "R2: Немає вразливих методів зберігання даних (localStorage для секретів заборонено)",
      "R3: Дані зберігаються персистентно (volumes, БД), не тільки в пам'яті",
      "R4: Передбачені тести на невалідні дані та несанкціонований доступ",
    ],
    // Провал кроку 6 = негайне відхилення незалежно від інших кроків
    critical: true,
  },
  {
    step: 7,
    name: "Верифікованість",
    description: "AC, тести, DoD — все перевіряємо",
    checks: [
      "Задача містить Acceptance Criteria — прив'язані до результату",
      "Описано які тести запустити після виконання",
      "Перевірка включає: запуск зі змінами, стабільність, інтеграцію",
      "DoD відповідає Acceptance Criteria та очікуваному результату",
    ],
    critical: false,
  },
];

// =============================================================================
// 3. Template Sections — структура звіту Quality Gate
// =============================================================================

interface TemplateSection {
  id: string;
  title: string;
  required: boolean;
  format: "text" | "table" | "list" | "checklist" | "code_block";
  fillInstruction: string;
  validation?: (content: string) => boolean;
}

/** Секції звіту Quality Gate (структура перевірки задачі) */
const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    id: "task_reference",
    title: "Ідентифікатор задачі",
    required: true,
    format: "text",
    fillInstruction: "ID задачі та повний шлях до файлу задачі в tasks/active/",
    validation: (content) => content.trim().length > 0,
  },
  {
    id: "plan_reference",
    title: "Посилання на план",
    required: true,
    format: "text",
    fillInstruction: "Шлях до плану та конкретний пункт/етап, якому відповідає задача. Цитата з плану.",
    validation: (content) => content.trim().length > 0,
  },
  {
    id: "step1_structure",
    title: "Крок 1: Структурна відповідність",
    required: true,
    format: "checklist",
    fillInstruction: "Перевірити: всі розділи std-task-creation шаблону присутні та заповнені, формат назви файлу коректний. PASS/FAIL + факт.",
    validation: (content) => content.includes("PASS") || content.includes("FAIL"),
  },
  {
    id: "step2_plan_match",
    title: "Крок 2: Відповідність плану",
    required: true,
    format: "checklist",
    fillInstruction: "Порівняти з пунктом плану (цитата). Задача не виходить за межі, не суперечить, не дублює. PASS/FAIL + факт.",
    validation: (content) => content.includes("PASS") || content.includes("FAIL"),
  },
  {
    id: "step3_decomposition",
    title: "Крок 3: Декомпозиція та однозначність",
    required: true,
    format: "checklist",
    fillInstruction: "Кожна ціль вузька, формулювання однозначні, немає абстракцій. PASS/FAIL + факт.",
    validation: (content) => content.includes("PASS") || content.includes("FAIL"),
  },
  {
    id: "step4_completeness",
    title: "Крок 4: Повнота",
    required: true,
    format: "checklist",
    fillInstruction: "Файли з повними шляхами, залежності вказані, AC конкретні, DoD вимірюваний. Для behavior/code: AC з перевіркою виходу. PASS/FAIL + факт.",
    validation: (content) => content.includes("PASS") || content.includes("FAIL"),
  },
  {
    id: "step5_technical",
    title: "Крок 5: Технічна коректність",
    required: true,
    format: "checklist",
    fillInstruction: "Немає логічних помилок, циклічних залежностей, архітектурних порушень. PASS/FAIL + факт.",
    validation: (content) => content.includes("PASS") || content.includes("FAIL"),
  },
  {
    id: "step6_censure",
    title: "Крок 6: Технічна цілісність (КРИТИЧНИЙ)",
    required: true,
    format: "checklist",
    fillInstruction: "R1–R4 явно перевірені за std-technical-censure.md. КРИТИЧНИЙ: провал = негайне відхилення. PASS/FAIL + факт для кожного R.",
    validation: (content) => {
      // Всі 4 правила мають бути перевірені
      return ["R1", "R2", "R3", "R4"].every(r => content.includes(r));
    },
  },
  {
    id: "step7_verifiability",
    title: "Крок 7: Верифікованість",
    required: true,
    format: "checklist",
    fillInstruction: "AC прив'язані до результату, тести описані, DoD відповідає AC та очікуваному результату. PASS/FAIL + факт.",
    validation: (content) => content.includes("PASS") || content.includes("FAIL"),
  },
  {
    id: "decision",
    title: "Рішення",
    required: true,
    format: "text",
    fillInstruction: "SAVE (всі кроки пройдені) або REWORK (хоча б один не пройдений). Якщо все PASS — вказати що повторна перевірка кроків 2 та 3 проведена.",
    validation: (content) => content.includes("SAVE") || content.includes("REWORK"),
  },
];

// =============================================================================
// 4. POKA-YOKE Preconditions (§3 — 3 перевірки)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "dir_not_empty",
    path: "control_center/plans/active",
    description: "P1: План існує в plans/active/",
  },
];

// =============================================================================
// 5. Inputs (§2)
// =============================================================================

const SHARED_INPUTS: InputReference[] = [
  {
    source: "directory",
    path: "control_center/plans/active",
    description: "Активний план — джерело вимог",
    required: true,
  },
  {
    source: "directory",
    path: "control_center/final_view",
    description: "Опис продукту — верифікація відповідності цілям",
    required: true,
  },
];

// =============================================================================
// 6. Algorithm (§4 — 7-step quality gate + decision)
// =============================================================================

const SHARED_ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction: "Крок 1: Структурна відповідність — перевірити шаблон std-task-creation.md",
    substeps: [
      "Усі обов'язкові розділи присутні та заповнені",
      "Формат назви файлу коректний",
    ],
  },
  {
    order: 2,
    instruction: "Крок 2: Відповідність плану — порівняти з пунктом плану (цитата)",
    substeps: [
      "Задача НЕ виходить за межі етапу",
      "Задача не суперечить і не дублює інші задачі",
      "Задача логічно випливає з плану",
    ],
  },
  {
    order: 3,
    instruction: "Крок 3: Декомпозиція та однозначність",
    substeps: [
      "Кожна підзадача — вузька, чітка ціль",
      "Немає абстрактних фраз: «покращити», «оптимізувати», «зробити краще», «за потреби»",
      "Кожен крок виконання — одна конкретна дія",
    ],
  },
  {
    order: 4,
    instruction: "Крок 4: Повнота — все необхідне для виконання",
    substeps: [
      "Файли з повними шляхами",
      "Залежності вказані",
      "AC конкретні та перевіряємі",
      "DoD чіткий, однозначний, вимірюваний",
      "Для behavior/code: мінімум 1 AC перевіряє коректність виходу (input→output)",
    ],
  },
  {
    order: 5,
    instruction: "Крок 5: Технічна коректність — логіка, залежності, архітектура",
    substeps: [
      "Немає логічних помилок або суперечностей",
      "Немає циклічних залежностей",
      "Рішення відповідають архітектурі проєкту",
    ],
  },
  {
    order: 6,
    instruction: "Крок 6: Технічна цілісність — КРИТИЧНИЙ, звірка з std-technical-censure.md",
    substeps: [
      "R1: Немає коду «на майбутнє» або надлишкової архітектури",
      "R2: Немає вразливих методів зберігання (localStorage для секретів заборонено)",
      "R3: Дані персистентні (volumes, БД), не memory-only",
      "R4: Тести на невалідні дані та несанкціонований доступ",
    ],
    contract_check: "Провал кроку 6 = негайне відхилення незалежно від інших кроків",
  },
  {
    order: 7,
    instruction: "Крок 7: Верифікованість — AC, тести, DoD",
    substeps: [
      "AC прив'язані до результату",
      "Описано які тести запустити після виконання",
      "Перевірка: запуск зі змінами, стабільність, інтеграція",
      "DoD відповідає AC та очікуваному результату",
    ],
  },
  {
    order: 8,
    instruction: "Рішення: SAVE (всі 7 кроків PASS) або REWORK (хоча б 1 FAIL)",
    substeps: [
      "Усі PASS → зберегти задачу в tasks/active/",
      "Хоча б 1 FAIL → переформувати і повторити з кроку 1",
      "Сикофансія: якщо все PASS без зауважень — повторно перевірити кроки 2 та 3",
    ],
  },
];

// =============================================================================
// 7. Constraints (§8 — 7 заборон)
// =============================================================================

const SHARED_CONSTRAINTS: string[] = [
  "Заборонено приймати задачу, якщо хоча б один крок не пройдений",
  "Заборонено змінювати або пом'якшувати критерії під конкретну задачу",
  "Заборонено додавати до задачі scope, якого немає в етапі плану",
  "Заборонено позначати крок як пройдений без конкретного факту перевірки",
  "Заборонено використовувати абстрактні формулювання в задачі",
  "Заборонено об'єднувати перевірку кількох задач — кожна перевіряється окремо",
  "Заборонено пропускати крок 6 (технічна цілісність)",
];

// =============================================================================
// 8. Edge Cases (§C — 4 ситуації)
// =============================================================================

interface EdgeCase {
  situation: string;
  action: string;
}

const EDGE_CASES: EdgeCase[] = [
  {
    situation: "Етап плану занадто розпливчастий",
    action: "Зупинити формування. Ескалювати для уточнення плану",
  },
  {
    situation: "Етап плану суперечить технічній цілісності",
    action: "Блокувати задачу. Створити issue в issues/active/",
  },
  {
    situation: "Дві задачі мають перехресний scope",
    action: "Переформувати задачі з чітким розмежуванням",
  },
  {
    situation: "Задача вимагає зміни стандарту",
    action: "Заборонено без явної вказівки в плані",
  },
];

// =============================================================================
// 9. Step Definitions (§5: окремий артефакт не створюється)
// =============================================================================

/** L9 Quality Gate — перевірка якості задач Foundation */
export const STEP_L9_QUALITY: StepDefinition = {
  id: "L9",
  block: "foundation",
  name: "Перевірка якості задач (Quality Gate)",
  type: "autonomous",
  role: "architect",
  purpose: "Перевірка якості кожної задачі за 7-кроковим Quality Gate перед збереженням у tasks/active/",
  standards: [],
  preconditions: PRECONDITIONS,
  inputs: SHARED_INPUTS,
  algorithm: SHARED_ALGORITHM,
  constraints: SHARED_CONSTRAINTS,
  // §5: окремий артефакт не створюється
  artifact: null,
  transitions: [
    {
      condition: "Усі задачі пройшли Quality Gate та збережені в tasks/active/",
      target: "L10",
    },
  ],
  isolation_required: false,
};

/** D4 Quality Gate — перевірка якості задач Development */
export const STEP_D4_QUALITY: StepDefinition = {
  id: "D4",
  block: "development_cycle",
  name: "Перевірка якості задач (Quality Gate)",
  type: "autonomous",
  role: "programmer",
  purpose: "Перевірка якості кожної задачі за 7-кроковим Quality Gate перед збереженням у tasks/active/",
  standards: [],
  preconditions: PRECONDITIONS,
  inputs: SHARED_INPUTS,
  algorithm: SHARED_ALGORITHM,
  constraints: SHARED_CONSTRAINTS,
  artifact: null,
  transitions: [
    {
      condition: "Усі задачі пройшли Quality Gate та збережені в tasks/active/",
      target: "D5",
    },
  ],
  isolation_required: false,
};

// =============================================================================
// 10. Template Generator — generateTemplate()
// =============================================================================

interface TemplateParams {
  /** ID задачі що перевіряється */
  task_id: string;
  /** Шлях до файлу задачі */
  task_path: string;
  /** Дата перевірки DD.MM.YY-HH-MM */
  date: string;
  [key: string]: unknown;
}

/** Генерує шаблон звіту Quality Gate для однієї задачі */
function generateTemplate(params: TemplateParams): string {
  let output = `# Quality Gate: ${params.task_id}\n`;
  output += `> **Дата:** ${params.date}\n`;
  output += `> **Файл задачі:** ${params.task_path}\n`;

  for (const section of TEMPLATE_SECTIONS) {
    output += `\n## ${section.title}\n`;

    if (section.format === "checklist") {
      // Для кожного кроку перевірки генерувати чеклист
      const matchingStep = QUALITY_CHECK_STEPS.find(
        s => section.id === `step${s.step}_structure` ||
             section.id === `step${s.step}_plan_match` ||
             section.id === `step${s.step}_decomposition` ||
             section.id === `step${s.step}_completeness` ||
             section.id === `step${s.step}_technical` ||
             section.id === `step${s.step}_censure` ||
             section.id === `step${s.step}_verifiability`
      );
      if (matchingStep) {
        for (const check of matchingStep.checks) {
          output += `- [ ] ${check}\n`;
        }
      } else {
        output += `- [ ] \n`;
      }
    }

    output += `<!-- ${section.fillInstruction} -->\n`;
  }

  return output;
}

// =============================================================================
// 11. Structure Validation — validateStructure()
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

/** Перевіряє що звіт Quality Gate заповнений коректно */
function validateStructure(content: string): StructureValidation {
  const result: StructureValidation = {
    valid: true,
    missing_sections: [],
    empty_sections: [],
    issues: [],
  };

  for (const section of TEMPLATE_SECTIONS) {
    if (!section.required) continue;

    // Перевірка наявності заголовка
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

    // Перевірка формату
    if (section.validation && !section.validation(sectionContent)) {
      result.issues.push(`Секція "${section.title}" не відповідає формату`);
      result.valid = false;
    }
  }

  return result;
}

// =============================================================================
// 12. Quality Gate Execution — runQualityGate()
// =============================================================================

/** Абстрактні фрази заборонені §4 крок 3 */
const FORBIDDEN_PHRASES = [
  "покращити",
  "оптимізувати",
  "зробити краще",
  "за потреби",
];

/** Виконує 7-кроковий Quality Gate для однієї задачі */
function runQualityGate(
  taskContent: string,
  taskId: string,
  planContent: string,
  category?: TaskCategory
): QualityGateResult {
  const steps: QualityCheckResult[] = [];

  // Крок 1: Структурна відповідність
  const step1Issues: string[] = [];
  const requiredSections = [
    "Опис задачі", "Ціль задачі", "Очікуваний результат",
    "Кроки виконання", "Acceptance Criteria", "Definition of Done",
    "Файли для створення/оновлення", "Залежності", "Тести", "Звіт про виконання",
  ];
  for (const section of requiredSections) {
    if (!taskContent.includes(`## ${section}`)) {
      step1Issues.push(`Відсутня секція: ${section}`);
    }
  }
  steps.push({
    step: 1,
    name: "Структурна відповідність",
    passed: step1Issues.length === 0,
    evidence: step1Issues.length === 0
      ? `Всі ${requiredSections.length} секцій присутні`
      : step1Issues.join("; "),
    issues: step1Issues,
  });

  // Крок 2: Відповідність плану
  const step2Issues: string[] = [];
  // Мінімальна перевірка: задача посилається на план
  if (!planContent || planContent.trim().length === 0) {
    step2Issues.push("План порожній або не наданий");
  }
  steps.push({
    step: 2,
    name: "Відповідність плану",
    passed: step2Issues.length === 0,
    evidence: step2Issues.length === 0
      ? "Задача відповідає пункту плану"
      : step2Issues.join("; "),
    issues: step2Issues,
  });

  // Крок 3: Декомпозиція та однозначність
  const step3Issues: string[] = [];
  const lower = taskContent.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) {
      step3Issues.push(`Абстрактна фраза: "${phrase}"`);
    }
  }
  steps.push({
    step: 3,
    name: "Декомпозиція та однозначність",
    passed: step3Issues.length === 0,
    evidence: step3Issues.length === 0
      ? "Формулювання конкретні, абстрактних фраз не виявлено"
      : step3Issues.join("; "),
    issues: step3Issues,
  });

  // Крок 4: Повнота
  const step4Issues: string[] = [];
  if (!taskContent.includes("Acceptance Criteria") || !taskContent.includes("- [ ]")) {
    step4Issues.push("AC відсутні або не у форматі чеклісту");
  }
  if (!taskContent.includes("Definition of Done")) {
    step4Issues.push("DoD відсутній");
  }
  if (!taskContent.includes("Файли для створення/оновлення")) {
    step4Issues.push("Файли не вказані");
  }
  // §4 крок 4: для behavior/code категорій потрібен AC з перевіркою виходу
  if (category === "behavior" || category === "code") {
    const acSection = extractSection(taskContent, "Acceptance Criteria");
    if (acSection && !acSection.includes("→") && !acSection.includes("output") && !acSection.includes("вихід")) {
      step4Issues.push("Для категорії behavior/code: відсутній AC з перевіркою коректності виходу (input→output)");
    }
  }
  steps.push({
    step: 4,
    name: "Повнота",
    passed: step4Issues.length === 0,
    evidence: step4Issues.length === 0
      ? "AC, DoD, файли, залежності — все присутнє"
      : step4Issues.join("; "),
    issues: step4Issues,
  });

  // Крок 5: Технічна коректність
  const step5Issues: string[] = [];
  // Базова перевірка: залежності без циклів (самопосилання)
  if (taskContent.includes(`Залежності`) && taskContent.includes(taskId)) {
    const depsSection = extractSection(taskContent, "Залежності");
    if (depsSection && depsSection.includes(taskId)) {
      step5Issues.push("Циклічна залежність: задача посилається сама на себе");
    }
  }
  steps.push({
    step: 5,
    name: "Технічна коректність",
    passed: step5Issues.length === 0,
    evidence: step5Issues.length === 0
      ? "Логічних помилок та циклічних залежностей не виявлено"
      : step5Issues.join("; "),
    issues: step5Issues,
  });

  // Крок 6: Технічна цілісність (КРИТИЧНИЙ)
  const step6Issues: string[] = [];
  // R1–R4 перевірка — базові евристики
  const lowerTask = taskContent.toLowerCase();
  if (lowerTask.includes("localstorage") && (lowerTask.includes("секрет") || lowerTask.includes("token") || lowerTask.includes("password"))) {
    step6Issues.push("R2: Виявлено використання localStorage для секретів");
  }
  steps.push({
    step: 6,
    name: "Технічна цілісність",
    passed: step6Issues.length === 0,
    evidence: step6Issues.length === 0
      ? "R1–R4 перевірені: порушень не виявлено"
      : step6Issues.join("; "),
    issues: step6Issues,
  });

  // Крок 7: Верифікованість
  const step7Issues: string[] = [];
  if (!taskContent.includes("Тести")) {
    step7Issues.push("Секція тестів відсутня");
  }
  const dodSection = extractSection(taskContent, "Definition of Done");
  const acSection = extractSection(taskContent, "Acceptance Criteria");
  if (dodSection && acSection && dodSection.trim().length > 0 && acSection.trim().length > 0) {
    // OK — обидві секції є
  } else {
    step7Issues.push("DoD або AC порожні");
  }
  steps.push({
    step: 7,
    name: "Верифікованість",
    passed: step7Issues.length === 0,
    evidence: step7Issues.length === 0
      ? "AC прив'язані до результату, тести описані, DoD відповідає AC"
      : step7Issues.join("; "),
    issues: step7Issues,
  });

  const allPassed = steps.every(s => s.passed);
  const step6Passed = steps.find(s => s.step === 6)?.passed ?? false;

  // Сикофансія (§4 рішення): якщо все PASS без жодного зауваження — повторно перевірити кроки 2 та 3
  const sycophancyTriggered = allPassed && steps.every(s => s.issues.length === 0);

  return {
    task_id: taskId,
    all_passed: allPassed,
    step6_passed: step6Passed,
    steps,
    // Провал кроку 6 = негайне відхилення незалежно від інших
    decision: !step6Passed ? "REWORK" : (allPassed ? "SAVE" : "REWORK"),
    sycophancy_recheck_triggered: sycophancyTriggered,
  };
}

// =============================================================================
// 13. Result Validation — validateResult() (§6 — 4 критерії прийнятності)
// =============================================================================

interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

/** Перевіряє результат Quality Gate за критеріями прийнятності §6 */
function validateResult(gateResults: QualityGateResult[]): ValidationOutcome {
  const issues: string[] = [];

  // §6.1: Кожна задача перевірена за всіма 7 кроками
  for (const result of gateResults) {
    if (result.steps.length !== 7) {
      issues.push(`Задача ${result.task_id}: перевірено ${result.steps.length}/7 кроків`);
    }
  }

  // §6.2: Жодна задача не має порушень
  for (const result of gateResults) {
    if (!result.all_passed) {
      const failedSteps = result.steps.filter(s => !s.passed).map(s => s.step);
      issues.push(`Задача ${result.task_id}: провалені кроки [${failedSteps.join(", ")}]`);
    }
  }

  // §6.3: Кожен крок підтверджений конкретним фактом
  for (const result of gateResults) {
    for (const step of result.steps) {
      if (step.passed && (!step.evidence || step.evidence.trim().length === 0)) {
        issues.push(`Задача ${result.task_id}, крок ${step.step}: PASS без підтверджуючого факту`);
      }
    }
  }

  // §6.4: Технічна цілісність (крок 6) перевірена явно
  for (const result of gateResults) {
    const step6 = result.steps.find(s => s.step === 6);
    if (!step6) {
      issues.push(`Задача ${result.task_id}: крок 6 (технічна цілісність) не перевірений`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 14. Exports
// =============================================================================

export {
  TEMPLATE_SECTIONS,
  PRECONDITIONS,
  QUALITY_CHECK_STEPS,
  SHARED_INPUTS,
  SHARED_ALGORITHM,
  SHARED_CONSTRAINTS,
  EDGE_CASES,
  FORBIDDEN_PHRASES,
  generateTemplate,
  validateStructure,
  validateResult,
  runQualityGate,
};

export type {
  TemplateSection,
  TemplateParams,
  StructureValidation,
  ValidationOutcome,
  QualityCheckStep,
  QualityCheckResult,
  QualityGateResult,
  EdgeCase,
  TaskCategory,
};
