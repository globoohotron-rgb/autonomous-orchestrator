// =============================================================================
// L6: DESIGN SPECIFICATION — Дизайн-специфікація — Template Generator
// Конвертовано з: control_center/standards/product/std-design-spec.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Типи (специфічні для L6 Design Specification)
// =============================================================================

/** Секція шаблону design_spec.md */
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
  cssNamingConvention?: string;
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
    path: "control_center/project_description/design_brief.md",
    description:
      "P1: Існує design_brief.md у control_center/project_description/. Design Brief відсутній → Блок: виконайте L3 спочатку.",
  },
  {
    type: "file_exists",
    path: "control_center/final_view/project_description.md",
    description:
      "P2: Існує project_description.md у control_center/final_view/. Project Description відсутній → Блок: виконайте L5 спочатку.",
  },
  {
    type: "step_completed",
    step: "L3",
    description:
      "P3: Design Brief містить секції Color System, Typography, Layout, Component Inventory. Якщо секції порожні — ескалація: Design Brief неповний.",
  },

  {
    type: "file_exists",
    path: "control_center/project_description/design_identity.md",
    description:
      "P5: Існує design_identity.md (результат L3b). Design Identity відсутній → Блок: виконайте L3b спочатку.",
  },
];

// =============================================================================
// 3. ALGORITHM (§4 — 8 кроків)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати design_brief.md, design_identity.md та project_description.md повністю. НЕ покладатись на часткове зчитування. Design identity визначає motion philosophy, empty states, icon style, content voice — інтегрувати у відповідні секції spec.",
  },
  {
    order: 2,
    instruction:
      "Сформувати CSS Custom Properties (design tokens) на основі Color System та Typography з design_brief.",
    substeps: [
      "Colors: primary, secondary, accent, background, surface, text, success, warning, error, info",
      "Typography: heading, body, mono",
      "Spacing: xs, sm, md, lg, xl",
      "Border radius: sm, md, lg",
      "Shadows: sm, md, lg",
      "Transitions: fast, normal, slow",
      "Responsive breakpoints: sm, md, lg, xl (ОБОВ'ЯЗКОВО якщо продукт responsive). Без визначених breakpoints responsive-поведінка компонентів невизначена.",
    ],
    contract_check:
      "Кожен token має відповідати конкретному значенню з design_brief. НЕ вигадувати значення яких немає в брифі — використовувати стандартні дефолти з позначкою [default — не вказано в design_brief].",
  },
  {
    order: 3,
    instruction:
      "Сформувати Component Specifications для кожного компонента з Component Inventory (design_brief).",
    substeps: [
      "HTML-структура (семантичні теги)",
      "CSS class naming convention (одна конвенція на весь проєкт: BEM / utility / module)",
      "Стани: default, hover, active, disabled, error, loading",
      "Responsive behavior per breakpoint",
      "Animation specs (property, duration, easing) — з Interaction Patterns",
    ],
    contract_check:
      "Компоненти мають відповідати модулям з project_description. Якщо компонент є в design_brief але відсутній в project_description — позначити [EXTRA — не в project_description].",
  },
  {
    order: 4,
    instruction:
      "Сформувати Page Layouts для кожної сторінки/view з project_description.",
    substeps: [
      "Grid structure (з Layout Concept)",
      "Component placement",
      "Responsive stacking order",
    ],
  },
  {
    order: 5,
    instruction:
      "Сформувати Global Styles.",
    substeps: [
      "Reset/normalize стратегія",
      "Базові елементи (body, a, button, input)",
      "Utility classes (якщо використовуються)",
    ],
  },
  {
    order: 6,
    instruction:
      "Dark Mode (якщо визначено в design_brief). Color token overrides. Стратегія: CSS custom properties swap.",
  },
  {
    order: 7,
    instruction:
      "Самоперевірка — пройти чекліст (§6 C1–C8). Якщо порушено — виправити до збереження.",
  },
  {
    order: 8,
    instruction:
      "Зберегти артефакт як control_center/final_view/design_spec.md.",
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 5 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО вигадувати кольори, шрифти або розміри яких немає в design_brief.",
  "ЗАБОРОНЕНО додавати компоненти яких немає в Component Inventory design_brief.",
  "ЗАБОРОНЕНО змінювати project_description.md — тільки читати.",
  "ЗАБОРОНЕНО реалізовувати CSS/код на цьому кроці — тільки специфікація. Код пишеться на L10/D5.",
  "ЗАБОРОНЕНО змінювати design_spec.md після збереження у final_view/ — він стає незмінним маяком.",
];

// =============================================================================
// 5. TEMPLATE SECTIONS (§A — Шаблон артефакту design_spec.md — 5 секцій)
// =============================================================================

const TEMPLATE_SECTIONS: TemplateSection[] = [
  // --- 1: CSS Custom Properties (Design Tokens) ---
  {
    id: "css_custom_properties",
    title: "CSS Custom Properties (Design Tokens)",
    required: true,
    format: "code_block",
    fillInstruction:
      "CSS :root блок з tokens. Colors (10): primary, secondary, accent, background, surface, text, success, warning, error, info. Typography (3): heading, body, mono. Spacing (5): xs–xl. Border radius (3): sm, md, lg. Shadows (3): sm, md, lg. Transitions (3): fast, normal, slow. Кожен token — значення з design_brief або позначка [default — не вказано в design_brief].",
    validation: (content) => {
      // C1: всі кольори з design_brief
      const hasColors = content.includes("--color-primary");
      // C2: typography tokens
      const hasTypography = content.includes("--font-heading") &&
        content.includes("--font-body") &&
        content.includes("--font-mono");
      // C3: spacing scale
      const hasSpacing = content.includes("--spacing-xs") &&
        content.includes("--spacing-xl");
      // C4: responsive breakpoints (обов'язково для responsive продуктів)
      const hasBreakpoints = content.includes("--bp-sm") || content.includes("breakpoint");
      return hasColors && hasTypography && hasSpacing && hasBreakpoints;
    },
  },
  // --- 2: Component Specifications ---
  {
    id: "component_specifications",
    title: "Component Specifications",
    required: true,
    format: "text",
    fillInstruction:
      "Для кожного компонента з Component Inventory design_brief: HTML-структура (семантичні теги), CSS class naming convention (BEM / utility / module — єдина для проєкту), стани (default, hover, active, disabled, error, loading), responsive behavior per breakpoint, animation specs (property, duration, easing). Якщо компонент є в design_brief але не в project_description → позначити [EXTRA — не в project_description].",
    validation: (content) => {
      // C4: кожен компонент має специфікацію — мінімум один підзаголовок
      return content.includes("###");
    },
  },
  // --- 3: Page Layouts ---
  {
    id: "page_layouts",
    title: "Page Layouts",
    required: true,
    format: "text",
    fillInstruction:
      "Для кожної сторінки/view з project_description: Grid structure (з Layout Concept), component placement, responsive stacking order.",
    validation: (content) => {
      // C5: кожна сторінка має layout
      return content.includes("###") || content.includes("Grid");
    },
  },
  // --- 4: Global Styles ---
  {
    id: "global_styles",
    title: "Global Styles",
    required: true,
    format: "text",
    fillInstruction:
      "Reset/normalize стратегія. Базові елементи: body (font, color, bg), a (color, text-decoration), button, input. Utility classes якщо використовуються.",
    validation: (content) => {
      // Має згадувати базові елементи
      return content.includes("body") || content.includes("reset") || content.includes("normalize");
    },
  },
  // --- 5: Dark Mode ---
  {
    id: "dark_mode",
    title: "Dark Mode",
    required: false,
    format: "code_block",
    fillInstruction:
      "Тільки якщо визначено в design_brief. Color token overrides з [data-theme=\"dark\"] selector. Стратегія: CSS custom properties swap.",
  },
];

// =============================================================================
// 6. Генератор шаблону — generateTemplate()
// =============================================================================

/**
 * Генерує порожній/частково заповнений шаблон design_spec.md.
 * §A — шаблон артефакту з усіма секціями.
 */
function generateTemplate(params: TemplateParams): string {
  const projectName = params.projectName ?? "[Назва продукту]";
  const cssNaming = params.cssNamingConvention ?? "[BEM / utility / module]";

  return `# Design Specification — ${projectName}

> **Дата:** ${params.date}
> **Джерело:** design_brief.md
> **CSS Naming Convention:** ${cssNaming}

---

## CSS Custom Properties (Design Tokens)

\`\`\`css
:root {
  /* Colors */
  --color-primary: #______;
  --color-secondary: #______;
  --color-accent: #______;
  --color-background: #______;
  --color-surface: #______;
  --color-text: #______;
  --color-success: #______;
  --color-warning: #______;
  --color-error: #______;
  --color-info: #______;

  /* Typography */
  --font-heading: '______', sans-serif;
  --font-body: '______', sans-serif;
  --font-mono: '______', monospace;

  /* Spacing */
  --spacing-xs: ___rem;
  --spacing-sm: ___rem;
  --spacing-md: ___rem;
  --spacing-lg: ___rem;
  --spacing-xl: ___rem;

  /* Border Radius */
  --radius-sm: ___px;
  --radius-md: ___px;
  --radius-lg: ___px;

  /* Shadows */
  --shadow-sm: ______;
  --shadow-md: ______;
  --shadow-lg: ______;

  /* Transitions */
  --transition-fast: ___ms ease;
  --transition-normal: ___ms ease;
  --transition-slow: ___ms ease;

  /* Responsive Breakpoints */
  --bp-sm: ___px;    /* mobile */
  --bp-md: ___px;    /* tablet */
  --bp-lg: ___px;    /* desktop */
  --bp-xl: ___px;    /* wide desktop */
}
\`\`\`

---

## Component Specifications

### [Компонент 1]
- **HTML:** \`<section class="...">\`
- **Стани:**
  | Стан | Опис стилю |
  |------|-----------|
  | default | |
  | hover | |
  | active | |
  | disabled | |
  | error | |
- **Responsive:**
  | Breakpoint | Поведінка |
  |-----------|----------|
  | mobile | |
  | tablet | |
  | desktop | |
- **Анімація:** [property] [duration] [easing]

---

## Page Layouts

### [Сторінка 1]
- **Grid:** [columns] × [gap]
- **Компоненти:** [список з порядком]
- **Mobile stacking:** [порядок]

---

## Global Styles

### Reset Strategy
[normalize.css / CSS reset / browser defaults]

### Base Elements
| Елемент | Стиль |
|---------|-------|
| body | font: var(--font-body); color: var(--color-text); bg: var(--color-background) |
| a | color: var(--color-primary); text-decoration: ... |
| button | ... |
| input | ... |

### Utility Classes
[Якщо використовуються]

---

## Dark Mode

\`\`\`css
[data-theme="dark"] {
  --color-background: #______;
  --color-surface: #______;
  --color-text: #______;
  /* ... overrides ... */
}
\`\`\`
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
 * Перевіряє що агент заповнив всі обов'язкові секції design_spec.md.
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
// 8. Валідація результату (§6 Критерії прийнятності C1–C8)
// =============================================================================

/**
 * Перевіряє заповнений design_spec.md за критеріями прийнятності (§6).
 */
function validateResult(content: string): ValidationOutcome {
  const issues: string[] = [];

  // Структурна валідація (перевіряє наявність всіх обов'язкових секцій)
  const structureCheck = validateStructure(content);
  if (!structureCheck.valid) {
    if (structureCheck.missing_sections.length > 0) {
      issues.push(
        `C1 FAIL: Відсутні секції: ${structureCheck.missing_sections.join(", ")}`
      );
    }
    if (structureCheck.empty_sections.length > 0) {
      issues.push(
        `C1 FAIL: Порожні секції: ${structureCheck.empty_sections.join(", ")}`
      );
    }
  }

  const tokensSection = extractSection(content, "CSS Custom Properties (Design Tokens)");

  // C1: Всі кольори з design_brief трансформовані в CSS tokens
  if (tokensSection) {
    const colorTokens = [
      "--color-primary", "--color-secondary", "--color-accent",
      "--color-background", "--color-surface", "--color-text",
      "--color-success", "--color-warning", "--color-error", "--color-info",
    ];
    const missingColors = colorTokens.filter((t) => !tokensSection.includes(t));
    if (missingColors.length > 0) {
      issues.push(
        `C1 FAIL: Відсутні color tokens: ${missingColors.join(", ")}`
      );
    }
  } else {
    issues.push("C1 FAIL: Секція CSS Custom Properties відсутня");
  }

  // C2: Typography tokens визначені (heading, body, mono — мінімум 3)
  if (tokensSection) {
    const fontTokens = ["--font-heading", "--font-body", "--font-mono"];
    const missingFonts = fontTokens.filter((t) => !tokensSection.includes(t));
    if (missingFonts.length > 0) {
      issues.push(
        `C2 FAIL: Відсутні typography tokens: ${missingFonts.join(", ")}`
      );
    }
  }

  // C3: Spacing scale визначена (xs–xl, 5 значень)
  if (tokensSection) {
    const spacingTokens = [
      "--spacing-xs", "--spacing-sm", "--spacing-md",
      "--spacing-lg", "--spacing-xl",
    ];
    const missingSpacing = spacingTokens.filter((t) => !tokensSection.includes(t));
    if (missingSpacing.length > 0) {
      issues.push(
        `C3 FAIL: Відсутні spacing tokens: ${missingSpacing.join(", ")}`
      );
    }
  }

  // C4: Кожен компонент з design_brief має специфікацію — 1:1 відповідність
  const componentSection = extractSection(content, "Component Specifications");
  if (!componentSection || !componentSection.includes("###")) {
    issues.push(
      "C4 FAIL: Component Specifications не містить жодної специфікації компонента (очікуються підзаголовки ###)"
    );
  }

  // C5: Кожна сторінка/view має layout — 1:1 з project_description
  const layoutSection = extractSection(content, "Page Layouts");
  if (!layoutSection || !layoutSection.includes("###")) {
    issues.push(
      "C5 FAIL: Page Layouts не містить жодного layout (очікуються підзаголовки ###)"
    );
  }

  // C6: CSS class naming convention визначена і єдина
  if (!content.includes("CSS Naming Convention")) {
    issues.push(
      "C6 FAIL: CSS class naming convention не визначена у заголовку документа"
    );
  }

  // C7: Tokens не вигадані — кожен має джерело (design_brief або [default])
  // Програмна перевірка: наявність [default] міток де потрібно
  // (фактична перевірка відповідності design_brief — процедурна, виконується агентом)

  // C8: Файл збережено у final_view/ — перевіряється оркестратором

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 9. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L6: StepDefinition = {
  id: "L6",
  block: "discovery",
  name: "DESIGN SPECIFICATION — Дизайн-специфікація",
  type: "autonomous",
  role: "researcher",
  purpose:
    "Трансформація дизайн-брифу у технічну специфікацію для коду. Результат — незмінний маяк design_spec.md у final_view/ з CSS tokens, component specs, page layouts, global styles.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "file",
      path: "control_center/project_description/design_brief.md",
      description: "Design Brief — візуальна концепція (кольори, шрифти, layout, компоненти)",
      required: true,
    },
    {
      source: "file",
      path: "control_center/final_view/project_description.md",
      description: "Project Description — модулі, AC, структура продукту",
      required: true,
    },
    {
      source: "file",
      path: "control_center/project_description/design_identity.md",
      description: "Design Identity — motion philosophy, empty states, icon style, content voice, anti-design (L3b)",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/final_view/design_spec.md",
    template_id: "l6_design_spec_template",
  },

  transitions: [
    {
      condition: "Артефакт design_spec.md створено, чекліст §6 пройдено, збережено у final_view/",
      target: "L7",
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
  // Валідація результату (§6 критерії C1–C8)
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
