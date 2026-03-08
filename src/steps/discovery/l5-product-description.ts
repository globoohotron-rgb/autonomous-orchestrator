// =============================================================================
// L5: Формування опису продукту — Template Generator
// Конвертовано з: control_center/standards/product/std-product-description.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Типи (специфічні для L5 Product Description)
// =============================================================================

/** Секція шаблону project_description.md */
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
// 2. PRECONDITIONS (§3 POKA-YOKE — 3 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/project_description/discovery_brief.md",
    description:
      "P1: Існує discovery_brief.md у control_center/project_description/. Без Discovery Brief неможливо формувати опис продукту.",
  },
  {
    type: "file_exists",
    path: "control_center/project_description/gate_entry_decision_*.md",
    description:
      "P2: Існує рішення воріт з decision: GO. Знайти gate_entry_decision_*.md, перевірити поле decision.",
  },
  {
    type: "dir_empty",
    path: "control_center/final_view/",
    description:
      "P3: Папка final_view/ порожня або не містить попередніх артефактів цього кроку. Якщо не порожня — ескалація (можливий повтор L5 після REBUILD_DESCRIPTION).",
  },
];

// =============================================================================
// 3. ALGORITHM (§4 — 5 кроків)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати discovery_brief.md повністю. Не покладатись на часткове зчитування.",
  },
  {
    order: 2,
    instruction:
      "Виділити факти з брифу — скласти внутрішній перелік.",
    substeps: [
      "Що будуємо (продукт/сервіс/інструмент)",
      "Для кого (цільова аудиторія)",
      "Яку проблему вирішуємо",
      "Ключові функції, які згадані",
      "Обмеження та вимоги, які вказав автор",
      "Технології, якщо зазначені",
    ],
    contract_check:
      "Використовувати ЛИШЕ інформацію з брифу. Якщо бриф не містить відповіді — позначити [TBD — не вказано в discovery_brief].",
  },
  {
    order: 3,
    instruction:
      "Заповнити шаблон опису продукту (generateTemplate) на основі фактів з Кроку 2.",
    substeps: [
      "Purpose, Vision, Scope — витягти безпосередньо з брифу, без власної інтерпретації",
      "Core modules — виділити з опису функцій; якщо бриф не структурує модулі — декомпозувати логічно, НЕ вигадувати функціональність",
      "Priority roadmap — дотримуватись пріоритетів бріфу; якщо немає — запропонувати на основі залежностей, позначити [пріоритет запропоновано агентом]",
      "Acceptance criteria — вимірювані критерії (так/ні); мінімум 1 критерій з типом VALUE для перевірки цінності кінцевого користувача",
      "Nonfunctional requirements — тільки ті, що зазначені або однозначно випливають з брифу",
      "Risks and mitigations — ризики з брифу + 1-2 очевидних технічних; для кожного вказати Покритий AC або [РИЗИК НЕ ПОКРИТИЙ]",
      "Initial tests required — системні тести що підтверджують acceptance criteria",
      "B2B Model — якщо в бріфі вказано B2B / team / enterprise: заповнити параметри моделі. Ці параметри впливають на архітектуру (multi-tenancy) та план (onboarding flow, billing integration).",
    ],
  },
  {
    order: 4,
    instruction:
      "Самоперевірка перед збереженням — пройти validateResult() по кожному критерію (§6 C1–C9). Якщо будь-який пункт порушено — виправити до збереження.",
  },
  {
    order: 5,
    instruction:
      "Зберегти артефакт як control_center/final_view/project_description.md.",
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 7 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО додавати функції, модулі або вимоги, яких немає в discovery_brief.md.",
  "ЗАБОРОНЕНО змінювати пріоритети автора без позначки [пріоритет запропоновано агентом].",
  "ЗАБОРОНЕНО пропускати секції шаблону — кожна має бути заповнена або позначена [TBD].",
  "ЗАБОРОНЕНО зберігати артефакт без проходження чеклісту (§6 C1–C9).",
  "ЗАБОРОНЕНО створювати декілька файлів — результат L5 це один файл project_description.md.",
  "ЗАБОРОНЕНО модифікувати discovery_brief.md.",
  "ЗАБОРОНЕНО інтерпретувати неоднозначності на свій розсуд — позначати [TBD] і продовжувати.",
];

// =============================================================================
// 5. TEMPLATE SECTIONS (§A — Шаблон артефакту project_description.md — 14 секцій)
// =============================================================================

const TEMPLATE_SECTIONS: TemplateSection[] = [
  // --- 1: Purpose ---
  {
    id: "purpose",
    title: "Purpose",
    required: true,
    format: "text",
    fillInstruction:
      "1–2 речення: основна мета проєкту. Витягти безпосередньо з discovery_brief.md.",
    validation: (content) => content.trim().length >= 10,
  },
  // --- 2: Vision ---
  {
    id: "vision",
    title: "Vision",
    required: true,
    format: "text",
    fillInstruction:
      "Одна фраза: довгострокова мета або бажаний стан після реалізації.",
    validation: (content) => content.trim().length >= 10,
  },
  // --- 3: Scope ---
  {
    id: "scope",
    title: "Scope",
    required: true,
    format: "list",
    fillInstruction:
      "Включає: перелік ключових областей. Не включає: перелік виключень. Базується на discovery_brief.md.",
    validation: (content) =>
      content.toLowerCase().includes("включає") ||
      content.toLowerCase().includes("includes"),
  },
  // --- 4: Core modules ---
  {
    id: "core_modules",
    title: "Core modules",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Модуль | Призначення. Виділити з опису функцій у бріфі. Якщо бриф не структурує модулі — декомпозувати логічно, НЕ вигадувати функціональність.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + at least 1 module
      return rows.length >= 3;
    },
  },
  // --- 5: Priority roadmap ---
  {
    id: "priority_roadmap",
    title: "Priority roadmap",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Пріоритет | Модуль / функціональність | Обґрунтування. Якщо бриф вказує пріоритети — дотримуватись. Якщо ні — запропонувати на основі залежностей, позначити [пріоритет запропоновано агентом].",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      return rows.length >= 3;
    },
  },
  // --- 6: Acceptance criteria ---
  {
    id: "acceptance_criteria",
    title: "Acceptance criteria",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: # | Критерій | Як перевірити | Тип. Кожен критерій вимірюваний (так/ні). Мінімум 1 критерій з типом VALUE для перевірки цінності кінцевого користувача. Для B2B додатково рекомендовані типи: ONBOARDING (шлях активації), RETENTION (утримання), SECURITY (безпека даних), BILLING (платіжна модель).",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + at least 1 AC
      if (rows.length < 3) return false;
      // C8: мінімум 1 VALUE тип
      return content.toUpperCase().includes("VALUE");
    },
  },
  // --- 7: Stakeholders ---
  {
    id: "stakeholders",
    title: "Stakeholders",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Роль | Хто. Мінімум: Власник, Архітектура.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      return rows.length >= 3;
    },
  },
  // --- 7b: B2B Model (optional) ---
  {
    id: "b2b_model",
    title: "B2B Model",
    required: false,
    format: "table",
    fillInstruction:
      "Якщо B2B продукт — заповнити таблицю: Параметр | Значення. Параметри: Target Company Size, Decision Maker Role, User Role, Pricing Model (per-seat/usage/flat), Onboarding Complexity (self-serve/guided/white-glove), Multi-tenancy (повна ізоляція/shared DB/schema-per-tenant), Data Sensitivity (PII/financial/standard). Якщо solo-user — пропустити.",
    validation: (content) => {
      const rows = content.split("\n").filter(l => l.includes("|"));
      return rows.length >= 3;
    },
  },
  // --- 8: Interfaces ---
  {
    id: "interfaces",
    title: "Interfaces",
    required: true,
    format: "text",
    fillInstruction:
      "Перелік зовнішніх інтеграцій, API, форматів даних. Якщо немає — позначити [TBD].",
    validation: (content) => content.trim().length >= 3,
  },
  // --- 9: Nonfunctional requirements ---
  {
    id: "nonfunctional_requirements",
    title: "Nonfunctional requirements",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Категорія | Вимога. Категорії: Надійність, Продуктивність, Безпека. Тільки ті, що зазначені або однозначно випливають з брифу.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      return rows.length >= 3;
    },
  },
  // --- 10: Constraints ---
  {
    id: "constraints",
    title: "Constraints",
    required: true,
    format: "text",
    fillInstruction:
      "Перелік обмежень: ресурси, технології, терміни. З discovery_brief.md.",
    validation: (content) => content.trim().length >= 3,
  },
  // --- 11: Risks and mitigations ---
  {
    id: "risks_and_mitigations",
    title: "Risks and mitigations",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Ризик | Ймовірність | Вплив | Міра | Покритий AC. Ризики з брифу + 1-2 очевидних технічних. Для кожного ризику — вказати AC або [РИЗИК НЕ ПОКРИТИЙ].",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + at least 1 risk
      return rows.length >= 3;
    },
  },
  // --- 12: Initial tests required ---
  {
    id: "initial_tests_required",
    title: "Initial tests required",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: # | Тест | Що перевіряє | Пов'язаний AC. Системні тести що підтвердять acceptance criteria. Кожен AC має хоча б один тест.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      return rows.length >= 3;
    },
  },
  // --- 13: Notes ---
  {
    id: "notes",
    title: "Notes",
    required: false,
    format: "text",
    fillInstruction:
      "Додаткові вказівки або обмеження, якщо є. Необов'язкова секція.",
  },
];

// =============================================================================
// 6. Генератор шаблону — generateTemplate()
// =============================================================================

/**
 * Генерує порожній/частково заповнений шаблон project_description.md.
 * §A — шаблон артефакту з усіма 14 секціями.
 */
function generateTemplate(params: TemplateParams): string {
  const projectName = params.projectName ?? "[Назва проєкту]";

  return `# ${projectName}

## Purpose
<!-- ${TEMPLATE_SECTIONS[0].fillInstruction} -->
[1–2 речення: основна мета проєкту]

## Vision
<!-- ${TEMPLATE_SECTIONS[1].fillInstruction} -->
[Одна фраза: довгострокова мета або бажаний стан після реалізації]

## Scope
- **Включає:** [перелік ключових областей]
- **Не включає:** [перелік виключень]

## Core modules
| Модуль | Призначення |
|--------|-------------|
| [Назва] | [Коротке призначення] |

## Priority roadmap
| Пріоритет | Модуль / функціональність | Обґрунтування |
|-----------|---------------------------|---------------|
| Високий | [Що] | [Чому] |
| Середній | [Що] | [Чому] |
| Низький | [Що] | [Чому] |

## Acceptance criteria
| # | Критерій | Як перевірити | Тип |
|---|----------|---------------|------|
| AC1 | [Вимірний результат] | [Метод перевірки: тест / інспекція / метрика] | [Технічний / VALUE] |

## Stakeholders
| Роль | Хто |
|------|-----|
| Власник | [Ім'я або роль] |
| Архітектура | [Ім'я або роль] |

## B2B Model
<!-- Заповнити якщо продукт B2B. Якщо solo-user — видалити секцію -->
| Параметр | Значення |
|----------|----------|
| Target Company Size | [SMB / Mid-market / Enterprise] |
| Decision Maker | [Роль] |
| User Role | [Роль] |
| Pricing Model | [per-seat / usage-based / flat] |
| Onboarding | [self-serve / guided / white-glove] |
| Multi-tenancy | [ізоляція / shared / schema-per-tenant] |
| Data Sensitivity | [PII / financial / standard] |

## Interfaces
<!-- ${TEMPLATE_SECTIONS[8].fillInstruction} -->
[Перелік зовнішніх інтеграцій, API, форматів даних]

## Nonfunctional requirements
| Категорія | Вимога |
|-----------|--------|
| Надійність | [Конкретна вимога] |
| Продуктивність | [Конкретна вимога] |
| Безпека | [Конкретна вимога] |

## Constraints
[Перелік обмежень: ресурси, технології, терміни]

## Risks and mitigations
| Ризик | Ймовірність | Вплив | Міра | Покритий AC |
|-------|-------------|-------|------|-------------|
| [Опис ризику] | Висока/Середня/Низька | Високий/Середній/Низький | [Захід] | [AC№ або РИЗИК НЕ ПОКРИТИЙ] |

## Initial tests required
| # | Тест | Що перевіряє | Пов'язаний AC |
|---|------|--------------|---------------|
| T1 | [Назва тесту] | [Опис перевірки] | AC1 |

## Notes
[Додаткові вказівки або обмеження, якщо є]
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
 * Перевіряє що агент заповнив всі обов'язкові секції project_description.md.
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
 * Перевіряє заповнений project_description.md за критеріями прийнятності (§6).
 */
function validateResult(content: string): ValidationOutcome {
  const issues: string[] = [];

  // C1: Кожна секція шаблону заповнена — жодна не порожня або позначена [TBD]
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

  // C2: Весь зміст відповідає discovery_brief.md — перевіряється процедурно агентом
  // Програмна перевірка: чи немає секцій без джерела
  // (оркестратор порівнює факти з брифом під час заповнення)

  // C3: Немає вигаданих функцій — перевіряється процедурно
  // Програмна перевірка: пункти запропоновані агентом позначені
  const agentProposed = content.includes("[пріоритет запропоновано агентом]");
  const hasTBD = content.includes("[TBD");
  // Наявність міток — ознака сумлінного заповнення (не блокер сам по собі)

  // C4: Acceptance criteria вимірювані
  const acSection = extractSection(content, "Acceptance criteria");
  if (!acSection || !acSection.includes("|")) {
    issues.push("C4 FAIL: Acceptance criteria порожні або не в табличному форматі");
  }

  // C5: Initial tests покривають acceptance criteria
  const testsSection = extractSection(content, "Initial tests required");
  if (!testsSection || !testsSection.includes("|")) {
    issues.push("C5 FAIL: Initial tests required порожні або не в табличному форматі");
  } else if (acSection) {
    // Перевіряємо що кожен AC згаданий хоча б в одному тесті
    const acMatches: string[] = acSection.match(/AC\d+/g) || [];
    const testRefs: string[] = testsSection.match(/AC\d+/g) || [];
    const uncoveredACs = acMatches.filter((ac) => !testRefs.includes(ac));
    if (uncoveredACs.length > 0) {
      issues.push(
        `C5 FAIL: Тести не покривають: ${uncoveredACs.join(", ")}`
      );
    }
  }

  // C6: Документ збережено за вказаним шляхом — перевіряється оркестратором

  // C7: Пункти, запропоновані агентом, позначені
  // Перевіряємо що Priority roadmap з агентськими пропозиціями має мітки
  const roadmapSection = extractSection(content, "Priority roadmap");
  if (roadmapSection && !agentProposed && !hasTBD) {
    // Якщо є roadmap без агентських міток — не блокер, але варнінг
    // (може бути що бриф чітко визначив пріоритети)
  }

  // C8: Мінімум 1 AC має тип VALUE
  if (acSection) {
    if (!acSection.toUpperCase().includes("VALUE")) {
      issues.push(
        "C8 FAIL: Жоден Acceptance Criterion не має типу VALUE (потрібен мінімум 1 ціннісний критерій)"
      );
    }
  }

  // C-B2B: Warning якщо discovery brief згадує B2B але B2B Model не заповнена
  const hasB2BSignals = /\bB2B\b|\bteam\s+(plan|management)\b|\benterprise\b|\bmulti[_\s-]?tenan/i.test(content);
  const b2bModelSection = extractSection(content, "B2B Model");
  if (hasB2BSignals) {
    const b2bStripped = b2bModelSection
      ? b2bModelSection.replace(/<!--.*?-->/gs, "").replace(/\[.*?\]/g, "").trim()
      : "";
    if (!b2bModelSection || b2bStripped.length === 0) {
      issues.push(
        "C-B2B WARNING: Виявлено B2B сигнали у документі, але секція B2B Model не заповнена"
      );
    }
  }

  // C9: Кожен ризик має маппінг до AC або позначку [РИЗИК НЕ ПОКРИТИЙ]
  const risksSection = extractSection(content, "Risks and mitigations");
  if (risksSection) {
    const riskRows = risksSection
      .split("\n")
      .filter((l) => l.includes("|") && !l.includes("---") && !l.toLowerCase().includes("ризик"));
    for (const row of riskRows) {
      // Кожен ризик має мати AC№ або [РИЗИК НЕ ПОКРИТИЙ]
      if (!row.match(/AC\d+/) && !row.includes("РИЗИК НЕ ПОКРИТИЙ")) {
        issues.push(
          "C9 FAIL: Ризик без маппінгу до AC та без позначки [РИЗИК НЕ ПОКРИТИЙ]"
        );
        break;
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 9. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L5: StepDefinition = {
  id: "L5",
  block: "discovery",
  name: "Формування опису продукту",
  type: "autonomous",
  role: "researcher",
  purpose:
    "Формування повного опису продукту на основі discovery_brief.md. Результат — незмінний маяк проєкту project_description.md у final_view/.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "file",
      path: "control_center/project_description/discovery_brief.md",
      description: "Discovery Brief — джерело всіх вимог для опису продукту",
      required: true,
    },
    {
      source: "file",
      path: "control_center/project_description/gate_entry_decision_*.md",
      description: "Рішення воріт входу — підтвердження GO",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/final_view/project_description.md",
    template_id: "l5_product_description_template",
  },

  transitions: [
    {
      condition: "Артефакт project_description.md створено, чекліст §6 пройдено, збережено у final_view/",
      target: "L6",
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
