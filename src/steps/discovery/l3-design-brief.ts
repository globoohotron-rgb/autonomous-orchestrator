// =============================================================================
// L3: DESIGN BRIEF — Дизайн-бриф — Template Generator
// Конвертовано з: control_center/standards/product/std-design-brief.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Типи (специфічні для L3 Design Brief)
// =============================================================================

/** Секція шаблону design_brief.md */
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
  productName?: string;
  authorName?: string;
  aiAssisted?: boolean;
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

/** Пункт чекліста готовності (§B) */
interface ReadinessCheckItem {
  id: string;
  description: string;
  mandatory: boolean;
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 3 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/project_description/discovery_brief.md",
    description:
      "P1: Існує discovery_brief.md у control_center/project_description/. Discovery Brief відсутній — виконайте L2 спочатку.",
  },
  {
    type: "step_completed",
    step: "L2",
    description:
      "P2: Discovery Brief містить секції Pain, Market, USP, Solution. Якщо секції порожні або відсутні — ескалація: Brief неповний, неможливо створити дизайн-концепцію.",
  },

];

// =============================================================================
// 3. ALGORITHM (§4 — 8 кроків)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Mood & References — Визначити візуальний настрій та референси.",
    substeps: [
      "На основі ЦА та конкурентів з discovery_brief — запропонувати 3-5 описів візуальних референсів (конкуренти або натхнення)",
      "Запропонувати загальний настрій: professional / playful / minimal / bold / warm / corporate",
      "Вказати що подобається у конкурентів (візуально) і що НЕ подобається",
      "Людина обирає настрій, коригує",
    ],
  },
  {
    order: 2,
    instruction:
      "Color System — Визначити палітру кольорів з обґрунтуванням.",
    substeps: [
      "Запропонувати primary color з обґрунтуванням (психологія кольору для ЦА)",
      "Запропонувати secondary + accent",
      "Запропонувати background / surface кольори",
      "Визначити semantic colors: success, warning, error, info",
      "Правило: мінімум 6 кольорів, максимум 12. Кожен з обґрунтуванням",
      "Людина затверджує або коригує палітру",
    ],
  },
  {
    order: 3,
    instruction:
      "Typography — Визначити шрифти та шкалу розмірів.",
    substeps: [
      "Запропонувати heading font (або system font з обґрунтуванням чому system font краще)",
      "Запропонувати body font",
      "Mono font (якщо потрібен для коду/цифр)",
      "Визначити шкалу розмірів (h1–h6, body, small, caption)",
      "Людина затверджує",
    ],
  },
  {
    order: 4,
    instruction:
      "Layout Concept — Визначити структуру сторінки.",
    substeps: [
      "Описати desktop layout (текстовий опис або ASCII)",
      "Описати mobile layout",
      "Визначити max-width контейнера",
      "Запропонувати grid system (columns, gap)",
      "Визначити breakpoints",
      "Людина затверджує",
    ],
  },
  {
    order: 5,
    instruction:
      "Component Inventory — Визначити UI-компоненти на базі MVP scope.",
    substeps: [
      "На основі MVP scope з discovery_brief — перелічити всі UI-компоненти",
      "Для кожного: стани (default, hover, active, disabled, error)",
      "Спеціальні компоненти (графіки, слайдери, карти тощо)",
      "Людина додає/видаляє компоненти",
    ],
  },
  {
    order: 6,
    instruction:
      "Interaction Patterns — Визначити анімації та мікроінтеракції.",
    substeps: [
      "Анімації: які елементи, тип (fade/slide/scale), тривалість",
      "Мікроінтеракції: hover effects, click feedback",
      "Loading states, empty states, error states",
      "Людина затверджує",
    ],
  },
  {
    order: 7,
    instruction:
      "Accessibility Requirements — Визначити вимоги доступності.",
    substeps: [
      "Визначити мінімальний контраст (WCAG AA = 4.5:1)",
      "Focus indicators",
      "Screen reader considerations",
      "Правило: WCAG AA — обов'язковий мінімум. Перевірити контраст primary кольору на фоні",
    ],
  },
  {
    order: 8,
    instruction:
      "Readiness Check — Пройти чекліст (секція B). Всі 7 секцій заповнені → людина затвердила → перехід до L4.",
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 5 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО ШІ-асистенту приймати фінальні рішення щодо візуалу за людину.",
  "ЗАБОРОНЕНО пропускати секції шаблону — всі 7 обов'язкові.",
  "ЗАБОРОНЕНО використовувати кольори без перевірки контрасту (WCAG AA).",
  "ЗАБОРОНЕНО додавати компоненти, яких немає у MVP scope без згоди людини.",
  "ЗАБОРОНЕНО переходити до L4 без проходження чеклісту готовності (Крок 8).",
];

// =============================================================================
// 5. TEMPLATE SECTIONS (§A — Шаблон артефакту design_brief.md — 7 секцій)
// =============================================================================

const TEMPLATE_SECTIONS: TemplateSection[] = [
  // --- Секція 1: Mood & References ---
  {
    id: "mood_references",
    title: "Mood & References",
    required: true,
    format: "text",
    fillInstruction:
      "Визначити настрій (professional / playful / minimal / bold / warm / corporate). Таблиця референсів: # | Опис/URL | Що подобається | Що НЕ подобається. 3-5 референсів.",
    validation: (content) => content.trim().length >= 15,
  },
  // --- Секція 2: Color System ---
  {
    id: "color_system",
    title: "Color System",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Token | Значення (#hex) | Обґрунтування. Мінімум 6, максимум 12 кольорів. Включити: primary, secondary, accent, background, surface, text, success, warning, error, info. + Перевірка контрасту WCAG AA.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + min 6 colour rows
      return rows.length >= 8;
    },
  },
  // --- Секція 3: Typography ---
  {
    id: "typography",
    title: "Typography",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Елемент | Font | Size | Weight | Line-height. Мінімум: h1, h2, h3, body, small, caption, mono. Heading + body font обов'язкові.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + min 2 rows (heading + body)
      return rows.length >= 4;
    },
  },
  // --- Секція 4: Layout Concept ---
  {
    id: "layout_concept",
    title: "Layout Concept",
    required: true,
    format: "text",
    fillInstruction:
      "Desktop layout (опис або ASCII). Mobile layout (опис або ASCII). Grid: max-width, columns, gap, breakpoints (sm/md/lg/xl).",
    validation: (content) => content.trim().length >= 20,
  },
  // --- Секція 5: Component Inventory ---
  {
    id: "component_inventory",
    title: "Component Inventory",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: # | Компонент | Стани (default, hover, active, disabled) | Зв'язок з фічею MVP. Кожна фіча з discovery_brief покрита компонентами.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + at least 1 component
      return rows.length >= 3;
    },
  },
  // --- Секція 6: Interaction Patterns ---
  {
    id: "interaction_patterns",
    title: "Interaction Patterns",
    required: true,
    format: "text",
    fillInstruction:
      "Анімації (таблиця: Елемент | Тип | Тривалість | Easing). States: Loading, Empty, Error — опис кожного.",
    validation: (content) => content.trim().length >= 15,
  },
  // --- Секція 7: Accessibility ---
  {
    id: "accessibility",
    title: "Accessibility",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Вимога | Значення. Обов'язково: Min contrast WCAG AA (4.5:1), Focus indicator, Screen reader (aria-labels).",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      return rows.length >= 3;
    },
  },
];

// =============================================================================
// 6. READINESS CHECKLIST (§B — 7 пунктів)
// =============================================================================

const READINESS_CHECKLIST: ReadinessCheckItem[] = [
  { id: "R1", description: "Настрій визначено та обґрунтовано", mandatory: true },
  { id: "R2", description: "Палітра: 6–12 кольорів", mandatory: true },
  { id: "R3", description: "WCAG AA контраст пройдено", mandatory: true },
  { id: "R4", description: "Heading + body font визначені", mandatory: true },
  { id: "R5", description: "Desktop + mobile layout описані", mandatory: true },
  { id: "R6", description: "Component inventory прив'язаний до MVP scope", mandatory: true },
  { id: "R7", description: "Людина затвердила всі секції", mandatory: true },
];

// =============================================================================
// 7. Генератор шаблону — generateTemplate()
// =============================================================================

/**
 * Генерує порожній/частково заповнений шаблон design_brief.md.
 * §A — шаблон артефакту з усіма 7 секціями.
 */
function generateTemplate(params: TemplateParams): string {
  const productName = params.productName ?? "[Назва продукту]";
  const authorName = params.authorName ?? "[Ім'я]";
  const aiAssisted = params.aiAssisted !== false ? "Так" : "Ні";

  return `# Design Brief — ${productName}

> **Дата:** ${params.date}
> **Автор:** ${authorName}
> **ШІ-асистент:** ${aiAssisted}

---

## 1. Mood & References

### Настрій
<!-- ${TEMPLATE_SECTIONS[0].fillInstruction} -->
[professional / playful / minimal / bold / warm / corporate]

### Референси
| # | Опис / URL | Що подобається | Що НЕ подобається |
|---|-----------|----------------|-------------------|
| 1 | [Опис] | [Плюси] | [Мінуси] |
| 2 | [Опис] | [Плюси] | [Мінуси] |
| 3 | [Опис] | [Плюси] | [Мінуси] |

---

## 2. Color System

| Token | Значення | Обґрунтування |
|-------|---------|---------------|
| --color-primary | #______ | [Чому цей колір для ЦА] |
| --color-secondary | #______ | [Обґрунтування] |
| --color-accent | #______ | [Обґрунтування] |
| --color-background | #______ | |
| --color-surface | #______ | |
| --color-text | #______ | |
| --color-success | #______ | |
| --color-warning | #______ | |
| --color-error | #______ | |
| --color-info | #______ | |

### Контраст (WCAG AA)
| Пара | Ratio | Pass/Fail |
|------|-------|-----------|
| text on background | __:1 | |
| primary on background | __:1 | |

---

## 3. Typography

| Елемент | Font | Size | Weight | Line-height |
|---------|------|------|--------|-------------|
| h1 | [Font] | [Size] | [Weight] | [LH] |
| h2 | | | | |
| h3 | | | | |
| body | [Font] | [Size] | [Weight] | [LH] |
| small | | | | |
| caption | | | | |
| mono | [Font] | | | |

---

## 4. Layout Concept

### Desktop
<!-- Опис або ASCII-схема -->

### Mobile
<!-- Опис або ASCII-схема -->

### Grid
| Параметр | Значення |
|----------|----------|
| Max-width | [px] |
| Columns | [число] |
| Gap | [px/rem] |
| Breakpoints | [sm/md/lg/xl значення] |

---

## 5. Component Inventory

| # | Компонент | Стани | Зв'язок з фічею |
|---|-----------|-------|-----------------|
| 1 | [Назва] | default, hover, active, disabled | [Яка фіча MVP] |
| 2 | [Назва] | | |

---

## 6. Interaction Patterns

### Анімації
| Елемент | Тип | Тривалість | Easing |
|---------|-----|-----------|--------|
| [Елемент] | fade/slide/scale | [ms] | [ease/ease-in-out/...] |

### States
| Стан | Опис |
|------|------|
| Loading | [Як виглядає] |
| Empty | [Як виглядає] |
| Error | [Як виглядає] |

---

## 7. Accessibility

| Вимога | Значення |
|--------|----------|
| Min contrast (WCAG) | AA (4.5:1) |
| Focus indicator | [Опис стилю] |
| Screen reader | [Основні aria-labels] |
`;
}

// =============================================================================
// 8. Валідація структури — validateStructure()
// =============================================================================

/** Витягує контент секції між заголовками */
function extractSection(content: string, title: string): string | null {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `#{2,3}\\s+${escapedTitle}\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|$)`
  );
  const match = content.match(regex);
  return match ? match[1] : null;
}

/**
 * Перевіряє що агент заповнив всі обов'язкові секції design_brief.md.
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
// 9. Валідація результату (§6 Критерії прийнятності C1–C7)
// =============================================================================

/**
 * Перевіряє заповнений design_brief.md за критеріями прийнятності (§6).
 */
function validateResult(content: string): ValidationOutcome {
  const issues: string[] = [];

  // C1: Всі 7 секцій шаблону заповнені — жодна секція не порожня
  const structureCheck = validateStructure(content);
  if (!structureCheck.valid) {
    if (structureCheck.missing_sections.length > 0) {
      issues.push(`C1 FAIL: Відсутні секції: ${structureCheck.missing_sections.join(", ")}`);
    }
    if (structureCheck.empty_sections.length > 0) {
      issues.push(`C1 FAIL: Порожні секції: ${structureCheck.empty_sections.join(", ")}`);
    }
  }

  // C2: Color system: 6–12 кольорів з обґрунтуванням
  const colorSection = extractSection(content, "Color System");
  if (colorSection) {
    const colorRows = colorSection
      .split("\n")
      .filter((l) => l.includes("|") && l.includes("#") && !l.includes("---") && !l.includes("Token"));
    if (colorRows.length < 6) {
      issues.push(`C2 FAIL: Менше 6 кольорів у палітрі (${colorRows.length})`);
    }
    if (colorRows.length > 12) {
      issues.push(`C2 FAIL: Більше 12 кольорів у палітрі (${colorRows.length})`);
    }
  } else {
    issues.push("C2 FAIL: Секція Color System відсутня");
  }

  // C3: Typography: мінімум heading + body font
  const typographySection = extractSection(content, "Typography");
  if (!typographySection || !typographySection.includes("|")) {
    issues.push("C3 FAIL: Typography не визначена (мінімум heading + body font)");
  }

  // C4: Layout: desktop + mobile описані
  const layoutSection = extractSection(content, "Layout Concept");
  if (layoutSection) {
    const hasDesktop = layoutSection.toLowerCase().includes("desktop");
    const hasMobile = layoutSection.toLowerCase().includes("mobile");
    if (!hasDesktop || !hasMobile) {
      issues.push("C4 FAIL: Не описані desktop та/або mobile layouts");
    }
  } else {
    issues.push("C4 FAIL: Секція Layout Concept відсутня");
  }

  // C5: Component inventory відповідає MVP scope
  const componentSection = extractSection(content, "Component Inventory");
  if (!componentSection || !componentSection.includes("|")) {
    issues.push("C5 FAIL: Component inventory порожній або відсутній");
  }

  // C6: WCAG AA контраст перевірено — primary color на background ≥ 4.5:1
  if (colorSection) {
    const contrastSection = extractSection(content, "Контраст (WCAG AA)");
    if (!contrastSection || !contrastSection.includes("|")) {
      issues.push("C6 FAIL: Перевірка контрасту WCAG AA відсутня");
    }
  }

  // C7: Людина затвердила кожну секцію — перевіряється процедурно, не програмно
  // Це перевірка на рівні оркестратора (кожен крок алгоритму потребує затвердження)

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 10. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L3: StepDefinition = {
  id: "L3",
  block: "discovery",
  name: "DESIGN BRIEF — Дизайн-бриф",
  type: "collaborative",
  role: "researcher",
  purpose:
    "Формування візуальної концепції продукту ДО написання коду: палітра, типографіка, layout, компоненти та патерни взаємодії. Результат — design_brief.md.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "file",
      path: "control_center/project_description/discovery_brief.md",
      description:
        "Discovery Brief — ЦА, формат, конкуренти, настрій продукту",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/project_description/design_brief.md",
    template_id: "l3_design_brief_template",
  },

  transitions: [
    {
      condition: "Артефакт design_brief.md створено, чекліст готовності пройдено, людина затвердила",
      target: "L4",
    },
  ],

  isolation_required: false,
};

// =============================================================================
// 11. Exports
// =============================================================================

export {
  // Генерація шаблону
  generateTemplate,
  // Валідація структури
  validateStructure,
  // Валідація результату (§6 критерії)
  validateResult,
  // Допоміжна функція
  extractSection,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  TEMPLATE_SECTIONS,
  READINESS_CHECKLIST,
};

export type {
  TemplateSection,
  TemplateParams,
  StructureValidation,
  ValidationOutcome,
  ReadinessCheckItem,
};
