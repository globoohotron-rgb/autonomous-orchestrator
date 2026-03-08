// =============================================================================
// L3b: DESIGN IDENTITY — Візуальна ідентичність продукту
// Новий крок: між L3 (Design Brief) та L4 (Gate)
// Мета: додати «душу» до технічного дизайн-брифу — персональність, емоційне
// ядро, signature moment, anti-design, motion philosophy, content voice, visual details.
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Типи (специфічні для L3b Design Identity)
// =============================================================================

/** Секція шаблону design_identity.md */
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
  [key: string]: unknown;
}

/** Результат валідації структури */
interface StructureValidation {
  valid: boolean;
  missing_sections: string[];
  empty_sections: string[];
  issues: string[];
}

/** Результат валідації за критеріями прийнятності */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

/** Пункт чекліста готовності */
interface ReadinessCheckItem {
  id: string;
  description: string;
  mandatory: boolean;
}

// =============================================================================
// 2. PRECONDITIONS (3 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/project_description/design_brief.md",
    description:
      "P1: Існує design_brief.md у control_center/project_description/. Design Brief відсутній — виконайте L3 спочатку.",
  },
  {
    type: "file_exists",
    path: "control_center/project_description/discovery_brief.md",
    description:
      "P2: Існує discovery_brief.md — потрібна ЦА, конкуренти, USP для формування ідентичності.",
  },

];

// =============================================================================
// 3. ALGORITHM (8 кроків)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Product Personality — Визначити персональність продукту. Якщо б продукт був людиною — хто це?",
    substeps: [
      "Зчитати discovery_brief.md (ЦА, конкуренти, USP) та design_brief.md (настрій, референси)",
      "ШІ пропонує 3 варіанти «персони» — для кожного: 2-3 прикметники, аналогія з реальним брендом, як це впливає на UI",
      "Приклади персон: 'Точний інженер (Linear) — мінімум зайвого, кожен піксель обґрунтований', 'Привітний консультант (Notion) — запрошує, не тисне', 'Елегантний технар (Stripe) — складне виглядає просто'",
      "Людина обирає або формулює свою персону",
      "ANTIPATTERN GUARD: ЗАБОРОНЕНО 'professional and clean' або 'modern and intuitive' як відповідь — це НЕ персона, це відсутність вибору. Персона = конкретний характер з конкретним впливом на UI",
    ],
  },
  {
    order: 2,
    instruction:
      "Emotional Tension — Два протилежних слова, які створюють унікальну напругу продукту.",
    substeps: [
      "ШІ аналізує обрану персону + USP з discovery_brief → пропонує 3-5 пар",
      "Приклади: 'потужний + простий' (Linear), 'хаотичний веб + спокій' (Arc), 'складний фінтех + легкість' (Stripe), 'серйозні дані + грайливість' (Mixpanel)",
      "Кожна пара — з поясненням як вона проявляється у UI (конкретний приклад)",
      "Людина обирає пару",
      "ПЕРЕВІРКА: обрана пара ВІДРІЗНЯЄТЬСЯ від головного конкурента. Якщо ні — повернутись і обрати іншу",
    ],
  },
  {
    order: 3,
    instruction:
      "Signature Moment — Один мікро-досвід, який запам'ятається користувачу і прив'язаний до USP.",
    substeps: [
      "ШІ аналізує MVP scope + USP + обрану персону → пропонує 3-5 кандидатів",
      "Для кожного: що відбувається, як виглядає, які емоції викликає, чому запам'ятається",
      "Приклади: 'момент коли новий лід з'являється з pulse-анімацією і звуком', 'перший dashboard з живими даними після 15 хв очікування', 'onboarding wizard який закінчується за 3 кліки'",
      "Людина обирає або придумує свій",
      "ПЕРЕВІРКА: signature moment прив'язаний до USP — якщо USP = 'AI intent classification', signature moment має показувати саме це",
    ],
  },
  {
    order: 4,
    instruction:
      "Anti-Design — Свідомі візуальні відмови. Чого продукт НЕ робить — і чому.",
    substeps: [
      "ШІ аналізує конкурентів з discovery_brief → визначає їхні візуальні патерни",
      "Пропонує 3-5 антипатернів — речі які конкуренти роблять, а ми свідомо НЕ робимо",
      "Для кожного: що саме відмовляємо, який конкурент це робить, ЧОМУ відмовляємо (обґрунтування через персону/ЦА)",
      "Приклади: 'НЕ використовуємо градієнти (на відміну від X) — наша персона = точність, не декоративність', 'НЕ робимо gamification/badges (на відміну від Y) — ЦА = серйозні B2B, не casual users'",
      "Людина затверджує або додає свої відмови",
      "МІНІМУМ 3 свідомих відмови обов'язкові",
    ],
  },
  {
    order: 5,
    instruction:
      "Motion Philosophy — Визначити ЩО рух означає у продукті, а не лише ms + easing.",
    substeps: [
      "ШІ пропонує 3 варіанти філософії руху на основі обраної персони:",
      "Варіант A: 'Рух = швидкість та ефективність' — ease-out, короткі transitions (100-200ms), мінімум декоративних анімацій. Стиль Linear.",
      "Варіант B: 'Рух = живість та зв'язок' — spring animations, овershoot, елементи 'дихають'. Стиль Apple/Framer.",
      "Варіант C: 'Мінімальний рух = фокус на даних' — лише fade для появи/зникнення, таблиці та графіки без анімацій. Стиль Bloomberg Terminal.",
      "Для обраного варіанту — визначити конкретні приклади: hover на карточці, поява toast, перехід між сторінками, skeleton loading",
      "Людина обирає або комбінує",
    ],
  },
  {
    order: 6,
    instruction:
      "Content Voice & Empty States — Як продукт «говорить» та що бачить юзер коли немає даних.",
    substeps: [
      "Тон комунікації: ШІ пропонує 3 варіанти тону на основі персони",
      "Для кожного — конкретні приклади фраз: success message, error message, empty state, onboarding tooltip, CTA button text",
      "Правило: тон УЗГОДЖЕНИЙ з персоною. Якщо персона = 'точний інженер', тон НЕ може бути 'Hey buddy! 🎉'",
      "Empty states: для КОЖНОГО ключового екрана з MVP scope — конкретний текст + опис візуалу (ілюстрація / іконка / мінімалізм)",
      "Мінімум: dashboard empty, list empty, search no results, first-time onboarding",
      "Людина затверджує або коригує фрази",
    ],
  },
  {
    order: 7,
    instruction:
      "Visual Details — Іконки, ілюстрації, тіні, візуалізація даних.",
    substeps: [
      "Icon style: rounded vs sharp corners, filled vs outlined, stroke width (1.5px / 2px), бібліотека (Lucide / Phosphor / Heroicons / custom) чи відповідність персоні",
      "Illustration strategy: flat / isometric / 3D / hand-drawn / abstract / 'ніяких ілюстрацій — тільки дані'",
      "Shadow & depth: flat (без тіней) / subtle elevation (card lift) / glass (backdrop-blur) / neumorphic",
      "Data visualization identity (якщо продукт data-heavy): стиль графіків, колірна палітра для charts (окремо від основної палітри), grid lines чи ні, legend style",
      "ШІ пропонує варіанти для кожного, людина обирає",
      "ПЕРЕВІРКА: обрані деталі узгоджені з персоною та emotional tension",
    ],
  },
  {
    order: 8,
    instruction:
      "Readiness Check — Пройти чекліст (секція B). Всі 7 секцій заповнені → людина затвердила → перехід до L4.",
  },
];

// =============================================================================
// 4. CONSTRAINTS (6 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО обирати generic описи без конкретики: 'professional', 'clean', 'modern', 'intuitive' без пояснення ЧИМ саме це проявляється у UI. Ці слова — порожні без контексту.",
  "ЗАБОРОНЕНО копіювати personality головного конкурента — продукт ОБОВ'ЯЗКОВО відрізняється. Emotional tension != конкурентна.",
  "ЗАБОРОНЕНО ШІ-асистенту приймати фінальні рішення — людина обирає з варіантів або формулює свій.",
  "ЗАБОРОНЕНО пропускати Anti-Design — мінімум 3 свідомих візуальних відмови обов'язкові.",
  "ЗАБОРОНЕНО визначати motion без конкретних прикладів (конкретних елементів UI та їхньої поведінки).",
  "ЗАБОРОНЕНО empty states без конкретних текстів — 'placeholder' або '[текст]' не рахується.",
];

// =============================================================================
// 5. TEMPLATE SECTIONS (7 секцій design_identity.md)
// =============================================================================

const TEMPLATE_SECTIONS: TemplateSection[] = [
  // --- Секція 1: Product Personality ---
  {
    id: "product_personality",
    title: "Product Personality",
    required: true,
    format: "text",
    fillInstruction:
      "Персона продукту: 2-3 прикметники, аналогія з брендом, як впливає на UI. НЕ 'professional and clean'. Конкретний характер: 'Точний і зібраний — як хірург: кожен елемент на місці, жодного зайвого пікселя, data-first'.",
    validation: (content) => {
      const stripped = content.toLowerCase();
      // Antipattern: generic descriptions without specifics
      const hasGenericOnly =
        (stripped.includes("professional") || stripped.includes("clean") || stripped.includes("modern")) &&
        !stripped.includes("тому що") && !stripped.includes("бо ") && !stripped.includes("означає") &&
        !stripped.includes("проявляється") && !stripped.includes("наприклад");
      return content.trim().length >= 30 && !hasGenericOnly;
    },
  },
  // --- Секція 2: Emotional Tension ---
  {
    id: "emotional_tension",
    title: "Emotional Tension",
    required: true,
    format: "text",
    fillInstruction:
      "Два протилежних слова + пояснення як напруга проявляється у UI. Формат: '[Слово A] + [Слово B]' → [пояснення]. Приклад: 'Потужний + Простий → складні дані подаються через мінімалістичний інтерфейс, потужність ховається за clean surface'.",
    validation: (content) => {
      // Має містити два слова з'єднані + або "та"/"і"/"vs"
      const hasTension = content.includes("+") || content.includes(" vs ") ||
        (content.includes("→") || content.includes("—"));
      return content.trim().length >= 20 && hasTension;
    },
  },
  // --- Секція 3: Signature Moment ---
  {
    id: "signature_moment",
    title: "Signature Moment",
    required: true,
    format: "text",
    fillInstruction:
      "Один мікро-досвід який запам'ятається. Описати: що відбувається, як виглядає, які емоції, зв'язок з USP. Конкретно, не абстрактно.",
    validation: (content) => content.trim().length >= 30,
  },
  // --- Секція 4: Anti-Design ---
  {
    id: "anti_design",
    title: "Anti-Design",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: # | Що НЕ робимо | Хто робить (конкурент) | Чому відмовляємо (обґрунтування через персону/ЦА). Мінімум 3 рядки.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + min 3 data rows = 5 lines with pipes
      return rows.length >= 5;
    },
  },
  // --- Секція 5: Motion Philosophy ---
  {
    id: "motion_philosophy",
    title: "Motion Philosophy",
    required: true,
    format: "text",
    fillInstruction:
      "Філософія руху (одне речення) + таблиця прикладів: Елемент UI | Тип анімації | Тривалість | Easing | ЩО означає цей рух. Мінімум 4 приклади: hover, toast, page transition, loading.",
    validation: (content) => {
      const hasTable = content.includes("|");
      const hasPhilosophy = content.trim().length >= 40;
      return hasTable && hasPhilosophy;
    },
  },
  // --- Секція 6: Content Voice & Empty States ---
  {
    id: "content_voice",
    title: "Content Voice & Empty States",
    required: true,
    format: "text",
    fillInstruction:
      "Тон (одне речення) + приклади фраз (success, error, empty, CTA) + Empty states для ключових екранів (dashboard, list, search, onboarding) з конкретними текстами та описом візуалу.",
    validation: (content) => {
      // Має містити конкретні приклади фраз (не плейсхолдери)
      const hasExamples = content.trim().length >= 50;
      // Має згадувати empty states
      const hasEmpty = content.toLowerCase().includes("empty") ||
        content.toLowerCase().includes("порожн") ||
        content.toLowerCase().includes("немає даних") ||
        content.toLowerCase().includes("no data");
      return hasExamples && hasEmpty;
    },
  },
  // --- Секція 7: Visual Details ---
  {
    id: "visual_details",
    title: "Visual Details",
    required: true,
    format: "text",
    fillInstruction:
      "Іконки: стиль (rounded/sharp, filled/outlined, stroke width, бібліотека). Ілюстрації: стратегія (flat/isometric/3D/hand-drawn/none). Тіні: підхід (flat/elevation/glass). Data viz (якщо data-heavy): стиль графіків, палітра charts.",
    validation: (content) => {
      const hasIcons = content.toLowerCase().includes("ікон") || content.toLowerCase().includes("icon");
      const hasShadow = content.toLowerCase().includes("тін") || content.toLowerCase().includes("shadow") ||
        content.toLowerCase().includes("elevation") || content.toLowerCase().includes("flat");
      return content.trim().length >= 30 && (hasIcons || hasShadow);
    },
  },
];

// =============================================================================
// 6. READINESS CHECKLIST (8 пунктів)
// =============================================================================

const READINESS_CHECKLIST: ReadinessCheckItem[] = [
  { id: "R1", description: "Персона визначена конкретно (НЕ generic 'professional')", mandatory: true },
  { id: "R2", description: "Emotional tension — два слова, відрізняється від конкурента", mandatory: true },
  { id: "R3", description: "Signature moment прив'язаний до USP", mandatory: true },
  { id: "R4", description: "Anti-design: мінімум 3 свідомих відмови з обґрунтуванням", mandatory: true },
  { id: "R5", description: "Motion philosophy з конкретними прикладами (≥4 елементи)", mandatory: true },
  { id: "R6", description: "Content voice узгоджений з персоною, empty states з конкретними текстами", mandatory: true },
  { id: "R7", description: "Visual details: іконки, ілюстрації, тіні визначені", mandatory: true },
  { id: "R8", description: "Людина затвердила всі секції", mandatory: true },
];

// =============================================================================
// 7. Генератор шаблону — generateTemplate()
// =============================================================================

/**
 * Генерує порожній/частково заповнений шаблон design_identity.md.
 */
function generateTemplate(params: TemplateParams): string {
  const productName = params.productName ?? "[Назва продукту]";

  return `# Design Identity — ${productName}

> **Дата:** ${params.date}
> **Джерело:** discovery_brief.md + design_brief.md
> **Мета:** Визначити «душу» продукту — не ЩО (кольори, шрифти), а ЧОМУ і ЯК ВІДЧУВАЄТЬСЯ

---

## 1. Product Personality

### Персона продукту
<!-- Якщо б продукт був людиною — хто це? 2-3 прикметники + аналогія з брендом -->
<!-- ЗАБОРОНЕНО: "professional and clean" — це не персона, це відсутність вибору -->

[Конкретний характер з конкретним впливом на UI]

### Як персона впливає на UI
| Аспект UI | Прояв персони |
|-----------|--------------|
| Щільність інформації | [dense / balanced / spacious] — тому що [обґрунтування] |
| Тон кнопок/CTA | [direct / inviting / subtle] — тому що [обґрунтування] |
| Кількість кольорів на екрані | [монохром + 1 accent / багатокольоровий / ...] |

---

## 2. Emotional Tension

### Формула
**[Слово A] + [Слово B]**

### Як проявляється
[Пояснення: як ця напруга створює унікальність]

### Перевірка: відмінність від конкурента
| Наш продукт | Головний конкурент | Різниця |
|-------------|-------------------|---------|
| [наша пара] | [їхня візуальна ідентичність] | [чим відрізняємось] |

---

## 3. Signature Moment

### Момент
[Один мікро-досвід який запам'ятається]

### Деталі
| Параметр | Значення |
|----------|----------|
| Що відбувається | [дія/подія] |
| Як виглядає | [візуальний опис] |
| Які емоції | [що відчуває юзер] |
| Зв'язок з USP | [як це підсилює USP] |

---

## 4. Anti-Design

### Свідомі відмови
| # | Що НЕ робимо | Хто робить | Чому відмовляємо |
|---|-------------|-----------|-----------------|
| 1 | [Патерн] | [Конкурент] | [Обґрунтування через персону/ЦА] |
| 2 | [Патерн] | [Конкурент] | [Обґрунтування] |
| 3 | [Патерн] | [Конкурент] | [Обґрунтування] |

---

## 5. Motion Philosophy

### Філософія
> [Одне речення: що рух ОЗНАЧАЄ у нашому продукті]

### Приклади
| Елемент UI | Тип анімації | Тривалість | Easing | Що означає |
|-----------|-------------|-----------|--------|-----------|
| Hover на карточці | [тип] | [ms] | [easing] | [значення] |
| Поява toast | [тип] | [ms] | [easing] | [значення] |
| Перехід між сторінками | [тип] | [ms] | [easing] | [значення] |
| Skeleton loading | [тип] | [ms] | [easing] | [значення] |

---

## 6. Content Voice & Empty States

### Тон комунікації
[Одне речення: як продукт «говорить»]

### Приклади фраз
| Ситуація | Фраза | Тон |
|----------|-------|-----|
| Success | [конкретний текст] | [як звучить] |
| Error | [конкретний текст] | [як звучить] |
| Empty state | [конкретний текст] | [як звучить] |
| Onboarding tooltip | [конкретний текст] | [як звучить] |
| CTA button | [конкретний текст] | [як звучить] |

### Empty States
| Екран | Текст | Візуал | CTA |
|-------|-------|--------|-----|
| Dashboard (немає лідів) | [текст] | [ілюстрація/іконка/мінімалізм] | [кнопка] |
| Список (порожній) | [текст] | [візуал] | [кнопка] |
| Пошук (0 результатів) | [текст] | [візуал] | [підказка] |
| Onboarding (перший візит) | [текст] | [візуал] | [наступний крок] |

---

## 7. Visual Details

### Іконки
| Параметр | Значення |
|----------|----------|
| Стиль | [rounded / sharp] |
| Filled / Outlined | [вибір] |
| Stroke width | [1.5px / 2px / ...] |
| Бібліотека | [Lucide / Phosphor / Heroicons / custom / ...] |
| Обґрунтування | [чому саме ця — зв'язок з персоною] |

### Ілюстрації
| Параметр | Значення |
|----------|----------|
| Стратегія | [flat / isometric / 3D / hand-drawn / abstract / none] |
| Де використовуються | [empty states / onboarding / landing / ніде] |
| Обґрунтування | [зв'язок з персоною] |

### Shadow & Depth
| Параметр | Значення |
|----------|----------|
| Підхід | [flat / subtle elevation / glass / neumorphic] |
| Де видно | [cards / modals / hover / ...] |
| Обґрунтування | [зв'язок з персоною] |

### Data Visualization (якщо data-heavy продукт)
| Параметр | Значення |
|----------|----------|
| Стиль графіків | [мінімалістичний / кольоровий / gamified] |
| Палітра charts | [кольори — окремо від основної палітри] |
| Grid lines | [так / ні / subtle] |
| Legend style | [inline / external / tooltip] |

---

## Readiness Checklist

- [ ] Персона конкретна (НЕ generic "professional")
- [ ] Emotional tension відрізняється від конкурента
- [ ] Signature moment прив'язаний до USP
- [ ] Anti-design: ≥3 свідомих відмови з обґрунтуванням
- [ ] Motion philosophy з ≥4 конкретними прикладами
- [ ] Content voice узгоджений з персоною, empty states з текстами
- [ ] Visual details: іконки, ілюстрації, тіні визначені
- [ ] Людина затвердила всі секції

---

*Design Identity v1.0 — ${productName} | ${params.date}*
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
 * Перевіряє що агент заповнив всі обов'язкові секції design_identity.md.
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
// 9. Валідація результату (Критерії прийнятності C1–C7)
// =============================================================================

/**
 * Перевіряє заповнений design_identity.md за критеріями прийнятності.
 */
function validateResult(content: string): ValidationOutcome {
  const issues: string[] = [];

  // C1: Всі 7 секцій заповнені
  const structureCheck = validateStructure(content);
  if (!structureCheck.valid) {
    if (structureCheck.missing_sections.length > 0) {
      issues.push(`C1 FAIL: Відсутні секції: ${structureCheck.missing_sections.join(", ")}`);
    }
    if (structureCheck.empty_sections.length > 0) {
      issues.push(`C1 FAIL: Порожні секції: ${structureCheck.empty_sections.join(", ")}`);
    }
    if (structureCheck.issues.length > 0) {
      issues.push(...structureCheck.issues);
    }
  }

  // C2: Personality не generic
  const personalitySection = extractSection(content, "Product Personality");
  if (personalitySection) {
    const lower = personalitySection.toLowerCase();
    const genericTerms = ["professional and clean", "modern and intuitive", "clean and simple"];
    const isGeneric = genericTerms.some(term => lower.includes(term));
    if (isGeneric) {
      issues.push("C2 FAIL: Personality є generic ('professional and clean' тощо) — потрібен конкретний характер");
    }
  }

  // C3: Emotional tension — має два полюси
  const tensionSection = extractSection(content, "Emotional Tension");
  if (tensionSection) {
    const hasTension = tensionSection.includes("+") || tensionSection.includes(" vs ");
    if (!hasTension) {
      issues.push("C3 FAIL: Emotional tension не містить двох протилежних полюсів (формат: 'A + B')");
    }
  }

  // C4: Anti-design — мінімум 3 рядки
  const antiSection = extractSection(content, "Anti-Design");
  if (antiSection) {
    const rows = antiSection.split("\n").filter(l =>
      l.includes("|") && !l.includes("---") && !l.includes("Що НЕ")
    );
    if (rows.length < 3) {
      issues.push(`C4 FAIL: Anti-design менше 3 позицій (${rows.length})`);
    }
  }

  // C5: Motion philosophy — має таблицю з прикладами
  const motionSection = extractSection(content, "Motion Philosophy");
  if (motionSection) {
    const rows = motionSection.split("\n").filter(l =>
      l.includes("|") && !l.includes("---") && !l.includes("Елемент UI")
    );
    if (rows.length < 4) {
      issues.push(`C5 FAIL: Motion philosophy менше 4 прикладів (${rows.length})`);
    }
  }

  // C6: Empty states — конкретні тексти (не плейсхолдери)
  const voiceSection = extractSection(content, "Content Voice & Empty States");
  if (voiceSection) {
    const hasPlaceholders = (voiceSection.match(/\[текст\]/gi) || []).length > 2;
    if (hasPlaceholders) {
      issues.push("C6 FAIL: Empty states містять плейсхолдери '[текст]' замість конкретних фраз");
    }
  }

  // C7: Visual details — іконки визначені
  const visualSection = extractSection(content, "Visual Details");
  if (visualSection) {
    const hasIcons = visualSection.toLowerCase().includes("lucide") ||
      visualSection.toLowerCase().includes("phosphor") ||
      visualSection.toLowerCase().includes("heroicons") ||
      visualSection.toLowerCase().includes("custom") ||
      visualSection.toLowerCase().includes("rounded") ||
      visualSection.toLowerCase().includes("sharp");
    if (!hasIcons) {
      issues.push("C7 FAIL: Icon style не визначений (rounded/sharp, бібліотека)");
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 10. EDGE CASES (5 крайніх випадків)
// =============================================================================

interface EdgeCase {
  situation: string;
  resolution: string;
}

const EDGE_CASES: EdgeCase[] = [
  {
    situation: "Людина не може визначити персону — все здається generic",
    resolution:
      "ШІ пропонує антиприклади: 'Ваш продукт ТОЧНО не є [X]. А чим відрізняється від [Y]?' Метод виключення допомагає знайти характер.",
  },
  {
    situation: "Emotional tension збігається з конкурентом",
    resolution:
      "Повернутися до Кроку 2. Спробувати інший ракурс: не функціональний (потужний+простий), а емоційний (тривожний+заспокійливий) або тактильний (важкий+легкий).",
  },
  {
    situation: "Signature moment занадто складний для MVP",
    resolution:
      "Спростити до мінімальної версії. Signature moment може бути простим (правильний текст у правильний момент), не обов'язково складна анімація.",
  },
  {
    situation: "Людина хоче скопіювати стиль конкурента повністю",
    resolution:
      "Дозволено як СТАРТОВУ ТОЧКУ, але Anti-Design (Крок 4) обов'язково створює мінімум 3 відмінності. Копія з 3+ свідомими відмінностями = вже не копія.",
  },
  {
    situation: "Продукт не data-heavy — Data Visualization непотрібна",
    resolution:
      "Секція Visual Details дозволяє пропустити Data Visualization з поясненням 'N/A — продукт не data-heavy'. Решта підсекцій обов'язкові.",
  },
];

// =============================================================================
// 11. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L3b: StepDefinition = {
  id: "L3b",
  block: "discovery",
  name: "DESIGN IDENTITY — Візуальна ідентичність",
  type: "collaborative",
  role: "researcher",
  purpose:
    "Формування «душі» продукту: персональність, емоційне ядро, signature moment, anti-design, motion philosophy, content voice, visual details. Результат — design_identity.md. Без цього кроку дизайн буде generic 'ще один SaaS dashboard'.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "file",
      path: "control_center/project_description/discovery_brief.md",
      description:
        "Discovery Brief — ЦА, конкуренти, USP для формування ідентичності",
      required: true,
    },
    {
      source: "file",
      path: "control_center/project_description/design_brief.md",
      description:
        "Design Brief — палітра, типографіка, layout, референси (технічна база)",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/project_description/design_identity.md",
    template_id: "l3b_design_identity_template",
  },

  transitions: [
    {
      condition: "Артефакт design_identity.md створено, чекліст готовності пройдено, людина затвердила",
      target: "L4",
    },
  ],

  isolation_required: false,
};

// =============================================================================
// 12. Exports
// =============================================================================

export {
  // Генерація шаблону
  generateTemplate,
  // Валідація структури
  validateStructure,
  // Валідація результату
  validateResult,
  // Допоміжна функція
  extractSection,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  TEMPLATE_SECTIONS,
  READINESS_CHECKLIST,
  EDGE_CASES,
};

export type {
  TemplateSection,
  TemplateParams,
  StructureValidation,
  ValidationOutcome,
  ReadinessCheckItem,
  EdgeCase,
};
