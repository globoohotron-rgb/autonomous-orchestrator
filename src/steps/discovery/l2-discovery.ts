// =============================================================================
// L2: DISCOVERY — Дослідження продукту — Template Generator
// Конвертовано з: control_center/standards/product/std-discovery.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Типи (специфічні для L2 Discovery)
// =============================================================================

/** Секція шаблону discovery_brief.md */
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
    type: "step_completed",
    step: "L1",
    description:
      "P1: Людина має початкову ідею або область інтересу — описала хоча б 1 реченням що хоче побудувати або яку проблему вирішити",
  },
  {
    type: "file_exists",
    path: "control_center/project_description/",
    description:
      "P2: Папка control_center/project_description/ існує і доступна для запису",
  },

];

// =============================================================================
// 3. ALGORITHM (§4 — 6 кроків)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Pain Discovery — Визначення болю. Людина описує ідею, область або проблему у вільній формі.",
    substeps: [
      "ШІ допомагає конкретизувати: Хто саме страждає? Як часто? Як вирішують зараз?",
      "ШІ пропонує варіанти формулювання болю — людина обирає або коригує",
      "Визначити цільову аудиторію: хто, скільки, де",
      "Біль описується конкретно: «X людей витрачають Y годин на Z» — не абстрактно",
    ],
  },
  {
    order: 2,
    instruction:
      "Market & Competitor Analysis — Аналіз ринку та конкурентів.",
    substeps: [
      "Обов'язковий web-пошук (якщо доступний). Якщо недоступний — позначити [⚠️ web-пошук недоступний]",
      "Знайти мінімум 3 конкуренти з реальними URL та цінами (або тимчасова позначка [потребує верифікації])",
      "Для кожного: URL, ціна, ключові фічі, цільова аудиторія, відгуки, слабкі місця",
      "Безкоштовні альтернативи (обов'язкова секція): що користувач може зробити БЕЗКОШТОВНО",
      "Тест конкурентоспроможності: «Чому хтось заплатить за наш продукт замість безкоштовної альтернативи?»",
      "ВЕРИФІКАЦІЯ ЦІН (ОБОВ'ЯЗКОВО): людина перевіряє URL та ціни. НЕ більше 50% конкурентів з позначкою [потребує верифікації]. Ціновий діапазон продукту НЕМОЖЛИВО визначити без реальних цін конкурентів.",
    ],
  },
  {
    order: 3,
    instruction:
      "USP Formation — Формулювання унікальної цінності на основі болю (Крок 1) + слабких місць конкурентів (Крок 2).",
    substeps: [
      "ШІ генерує 3-5 варіантів USP",
      "Для кожного — вказує який біль він вирішує краще за конкурентів",
      "Людина обирає USP або формулює свій",
      "Перевірка реалістичності: чи технічно можливо реалізувати перевагу",
      "Фіналізація в 1 реченні: «[Продукт] — єдиний, що [USP], на відміну від [конкурент], де [слабкість]»",
    ],
  },
  {
    order: 4,
    instruction:
      "Solution Sketch — Ескіз рішення. Людина + ШІ спільно визначають параметри.",
    substeps: [
      "Формат: web / mobile / desktop / CLI / API / плагін / інше",
      "MVP scope: 5-7 ключових фічей, кожна пов'язана з болем або USP",
      "Revenue model: підписка / одноразова покупка / freemium / рекламна / B2B-ліцензія",
      "Ризики: що може піти не так (технічні обмеження, ринкові, ресурсні)",
      "Retention hook: що змусить користувача ПОВЕРНУТИСЯ до продукту",
      "5-second test: чи зможе людина зрозуміти цінність за 5 секунд на landing page",
      "Правило: якщо фіча не вирішує біль з Кроку 1 і не підтримує USP з Кроку 3 — NOT in MVP",
      "B2B Assessment: визначити тип продукту — solo-user чи B2B (multi-user/team). Якщо B2B:",
      "  - ICP (Ideal Customer Profile): розмір компанії, індустрія, бюджет, хто платить",
      "  - Buyer Map: хто приймає рішення (Decision Maker) vs хто використовує (User) vs хто рекомендує (Champion)",
      "  - Sales Model: self-serve / sales-assisted / enterprise? Це визначає complexity",
      "  - Retention Model: що утримує клієнта (data lock-in, workflow dependency, switching cost, integration depth)",
    ],
  },
  {
    order: 5,
    instruction:
      "Brief Assembly — Заповнити шаблон discovery_brief.md (generateTemplate) за матеріалами кроків 1-4. Людина перевіряє і затверджує.",
  },
  {
    order: 6,
    instruction:
      "Readiness Check — Пройти чекліст готовності (секція B). Якщо будь-який обов'язковий пункт не пройдений — повернутися до відповідного кроку.",
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 7 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО ШІ-асистенту приймати фінальні рішення за людину (вибір болю, USP, MVP scope, revenue model).",
  "ЗАБОРОНЕНО вигадувати конкурентів або статистику — тільки реальні дані або позначка [потребує верифікації].",
  "ЗАБОРОНЕНО пропускати кроки алгоритму — кожен крок обов'язковий.",
  "ЗАБОРОНЕНО формувати бриф без валідації людиною на кожному кроці.",
  "ЗАБОРОНЕНО включати в MVP scope більше 7 фічей.",
  "ЗАБОРОНЕНО переходити до L4 без проходження чеклісту готовності (Крок 6).",
  "ЗАБОРОНЕНО ШІ-асистенту ігнорувати проблеми ідеї заради угоди з людиною — чесна оцінка обов'язкова.",
];

// =============================================================================
// 5. TEMPLATE SECTIONS (§A — Шаблон артефакту discovery_brief.md)
// =============================================================================

const TEMPLATE_SECTIONS: TemplateSection[] = [
  // --- Секція 1: Pain — Біль ---
  {
    id: "pain_problem",
    title: "Pain — Біль",
    required: true,
    format: "text",
    fillInstruction:
      "Конкретний опис: Хто страждає? Від чого? Як часто? Які наслідки? Формат «X людей витрачають Y годин на Z».",
    validation: (content) => content.trim().length >= 20,
  },
  {
    id: "target_audience",
    title: "Цільова аудиторія",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Хто | Кількість | Де знаходяться | Як вирішують зараз. Конкретна група людей/бізнесів.",
    validation: (content) =>
      content.includes("|") && content.split("\n").filter((l) => l.includes("|")).length >= 3,
  },
  // --- Секція 2: Market — Ринок та конкуренти ---
  {
    id: "competitors",
    title: "Конкуренти",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Конкурент | URL | Ціна | Ключові фічі | Сильні сторони | Слабкі сторони. Мінімум 3 рядки. URL реальний або [потребує верифікації].",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      return rows.length >= 5; // header + separator + min 3 data rows
    },
  },
  {
    id: "free_alternatives",
    title: "Безкоштовні альтернативи",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: # | Альтернатива | Що робить | Чого НЕ може. Мінімум 1 безкоштовна альтернатива.",
    validation: (content) =>
      content.includes("|") && content.split("\n").filter((l) => l.includes("|")).length >= 3,
  },
  {
    id: "competitiveness_test",
    title: "Тест конкурентоспроможності",
    required: true,
    format: "text",
    fillInstruction:
      "Конкретна відповідь: чому хтось заплатить за наш продукт замість безкоштовної альтернативи? Не загальна фраза.",
    validation: (content) => content.trim().length >= 20,
  },
  {
    id: "market_trends",
    title: "Тренди ринку",
    required: false,
    format: "text",
    fillInstruction:
      "Коротко: куди рухається ринок, які зміни відбуваються.",
  },
  // --- Секція 3: USP — Унікальна цінність ---
  {
    id: "usp",
    title: "USP — Унікальна цінність",
    required: true,
    format: "text",
    fillInstruction:
      "Формулювання в 1 реченні: «[Продукт] — єдиний, що [USP], на відміну від [конкурент], де [слабкість]». + Обґрунтування реалізовності.",
    validation: (content) => content.trim().length >= 15,
  },
  // --- Секція 4: Solution — Рішення ---
  {
    id: "solution_format",
    title: "Формат",
    required: true,
    format: "text",
    fillInstruction:
      "web / mobile / desktop / CLI / API / плагін / інше.",
    validation: (content) => content.trim().length >= 2,
  },
  {
    id: "mvp_scope",
    title: "MVP Scope (ключові фічі)",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: # | Фіча | Яку біль вирішує | Зв'язок з USP. 5-7 рядків. Кожна фіча прив'язана до болю або USP.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      // header + separator + 5-7 data rows → 7-9 total rows with pipes
      return rows.length >= 7 && rows.length <= 11;
    },
  },
  {
    id: "retention_hook",
    title: "Retention Hook",
    required: true,
    format: "text",
    fillInstruction:
      "Що змусить користувача повернутися? Якщо одноразовий інструмент — вказати явно.",
    validation: (content) => content.trim().length >= 10,
  },
  {
    id: "five_second_pitch",
    title: "5-Second Pitch",
    required: true,
    format: "text",
    fillInstruction:
      "Одне речення, яке пояснює цінність продукту за 5 секунд.",
    validation: (content) => content.trim().length >= 10,
  },
  {
    id: "tech_direction",
    title: "Технічний напрямок",
    required: false,
    format: "text",
    fillInstruction:
      "Технології, обмеження платформи, якщо визначені.",
  },
  // --- Секція 5: Revenue — Модель монетизації ---
  {
    id: "revenue",
    title: "Revenue — Модель монетизації",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: Модель | Ціновий діапазон | Обґрунтування. Конкретна модель (підписка / одноразово / freemium / B2B / рекламна).",
    validation: (content) =>
      content.includes("|") && content.split("\n").filter((l) => l.includes("|")).length >= 3,
  },
  // --- Секція 6: Risks — Ризики ---
  {
    id: "risks",
    title: "Risks — Ризики",
    required: true,
    format: "table",
    fillInstruction:
      "Таблиця: # | Ризик | Ймовірність | Вплив | Мітигація. Мінімум 2 ризики.",
    validation: (content) => {
      const rows = content.split("\n").filter((l) => l.includes("|"));
      return rows.length >= 4; // header + separator + min 2 data rows
    },
  },
  // --- Секція 7: B2B Assessment ---
  {
    id: "b2b_assessment",
    title: "B2B Assessment",
    required: false,
    format: "table",
    fillInstruction:
      "Якщо продукт B2B — заповнити: ICP (хто покупець), Buyer Map (Decision Maker/User/Champion), Sales Model (self-serve/sales-assisted/enterprise), Retention Model (що утримує). Якщо solo-user — вказати 'Solo-user product, B2B assessment не стосується'.",
  },
  // --- Секція 8: Notes ---
  {
    id: "notes",
    title: "Notes",
    required: false,
    format: "text",
    fillInstruction:
      "Додаткові думки, ідеї на майбутнє, речі для дослідження пізніше.",
  },
];

// =============================================================================
// 6. READINESS CHECKLIST (§B — 13 пунктів)
// =============================================================================

const READINESS_CHECKLIST: ReadinessCheckItem[] = [
  { id: "R1", description: "Біль описана конкретно (хто, що, як часто, наслідки)", mandatory: true },
  { id: "R2", description: "Цільова аудиторія визначена (хто, скільки, де)", mandatory: true },
  { id: "R3", description: "Знайдено мінімум 3 конкуренти з аналізом", mandatory: true },
  { id: "R4", description: "USP сформульовано в 1 реченні", mandatory: true },
  { id: "R5", description: "USP підтверджено: технічно реалізовано і відрізняє від конкурентів", mandatory: true },
  { id: "R6", description: "MVP scope: 5-7 фічей, кожна прив'язана до болю", mandatory: true },
  { id: "R7", description: "Revenue model визначена та обґрунтована", mandatory: true },
  { id: "R8", description: "Мінімум 2 ризики описані з мітигаціями", mandatory: true },
  { id: "R9", description: "Всі секції шаблону заповнені", mandatory: true },
  { id: "R10", description: "Людина перевірила та затвердила кожну секцію", mandatory: true },
  { id: "R11", description: "Ви самі б купили цей продукт? (чесна відповідь)", mandatory: false },
  { id: "R12", description: "Aha-moment тест: чи можете описати конкретний момент, коли користувач скаже «це того варте»?", mandatory: false },
  { id: "R13", description: "Тест конкурентної цінності: чому обрати цей продукт замість безкоштовної альтернативи?", mandatory: false },
  { id: "R14", description: "URL та ціни конкурентів верифіковані вручну — НЕ більше 50% записів містять [потребує верифікації]. Якщо web-пошук недоступний — людина верифікує ВСІ ціни.", mandatory: true },
  { id: "RC-B2B", description: "Якщо B2B: ICP визначений, buyer types описані, sales model обраний", mandatory: false },
];

// =============================================================================
// 7. EDGE CASES (§C — 6 крайніх випадків)
// =============================================================================

interface EdgeCase {
  situation: string;
  resolution: string;
}

const EDGE_CASES: EdgeCase[] = [
  {
    situation: "Людина не може сформулювати біль",
    resolution:
      "ШІ пропонує 5-10 варіантів болю в обраній ніші. Людина обирає або коригує. Якщо жоден не резонує — переглянути нішу.",
  },
  {
    situation: "Конкурентів не знайдено",
    resolution:
      "Або ринок дуже новий (позначити як ризик), або пошук недостатній. Спробувати суміжні ніші. Позначити в ризиках.",
  },
  {
    situation: "USP не формулюється",
    resolution:
      "Повернутися до Кроку 2 — глибше аналіз слабких місць конкурентів. Якщо конкуренти покривають все — переглянути біль або нішу.",
  },
  {
    situation: "MVP scope перевищує 7 фічей",
    resolution:
      "Ранжувати фічі за впливом на біль. Відрізати все нижче порогу. Залишки — в секцію Notes для майбутніх ітерацій.",
  },
  {
    situation: "Людина хоче пропустити дослідження",
    resolution:
      "Заборонено. Чекліст (секція B) блокує перехід до L4 без заповнення обов'язкових пунктів.",
  },
  {
    situation: "REWORK після L4 (повернення для доопрацювання)",
    resolution:
      "Зчитати існуючий discovery_brief.md, виправити конкретні зауваження з gate_entry_decision. Стара версія зберігається як discovery_brief_v[N].md.",
  },
];

// =============================================================================
// 8. Генератор шаблону — generateTemplate()
// =============================================================================

/**
 * Генерує порожній/частково заповнений шаблон discovery_brief.md.
 * §A — шаблон артефакту з усіма секціями.
 */
function generateTemplate(params: TemplateParams): string {
  const productName = params.productName ?? "[Назва продукту/ідеї]";
  const authorName = params.authorName ?? "[Ім'я]";
  const aiAssisted = params.aiAssisted !== false ? "Так" : "Ні";

  return `# Discovery Brief — ${productName}

> **Дата:** ${params.date}
> **Автор:** ${authorName}
> **ШІ-асистент:** ${aiAssisted}

---

## 1. Pain — Біль

### Проблема
<!-- ${TEMPLATE_SECTIONS[0].fillInstruction} -->

### Цільова аудиторія
| Параметр | Опис |
|----------|------|
| Хто | [Конкретна група людей/бізнесів] |
| Кількість | [Оцінка розміру аудиторії] |
| Де знаходяться | [Канали, платформи, спільноти] |
| Як вирішують зараз | [Поточні рішення / workarounds] |

---

## 2. Market — Ринок та конкуренти

### Конкуренти
| Конкурент | URL | Ціна | Ключові фічі | Сильні сторони | Слабкі сторони |
|-----------|-----|------|---------------|----------------|----------------|
| [Назва 1] | [URL або позначка] | [Ціна або позначка] | [Фічі] | [Плюси] | [Мінуси] |
| [Назва 2] | [URL або позначка] | [Ціна або позначка] | [Фічі] | [Плюси] | [Мінуси] |
| [Назва 3] | [URL або позначка] | [Ціна або позначка] | [Фічі] | [Плюси] | [Мінуси] |

### Безкоштовні альтернативи
| # | Альтернатива | Що робить | Чого НЕ може |
|---|--------------|-------------|---------------|
| 1 | [Назва] | [Можливості] | [Обмеження] |

**Тест конкурентоспроможності:** <!-- ${TEMPLATE_SECTIONS[4].fillInstruction} -->

### Тренди ринку
<!-- ${TEMPLATE_SECTIONS[5].fillInstruction} -->

---

## 3. USP — Унікальна цінність

**Формулювання:** [Продукт] — єдиний, що [USP], на відміну від [конкурент], де [слабкість].

**Обґрунтування:** [Чому це реально реалізувати і чому конкуренти цього не зробили]

---

## 4. Solution — Рішення

### Формат
<!-- ${TEMPLATE_SECTIONS[7].fillInstruction} -->

### MVP Scope (ключові фічі)
| # | Фіча | Яку біль вирішує | Зв'язок з USP |
|---|-------|-------------------|---------------|
| 1 | [Фіча] | [Біль] | [Так/Ні — опис] |
| 2 | [Фіча] | [Біль] | [Так/Ні — опис] |
| 3 | [Фіча] | [Біль] | [Так/Ні — опис] |

### Retention Hook
<!-- ${TEMPLATE_SECTIONS[9].fillInstruction} -->

### 5-Second Pitch
<!-- ${TEMPLATE_SECTIONS[10].fillInstruction} -->

### Технічний напрямок
<!-- ${TEMPLATE_SECTIONS[11].fillInstruction} -->

---

## 5. Revenue — Модель монетизації

| Параметр | Опис |
|----------|------|
| Модель | [підписка / одноразово / freemium / B2B / рекламна / інше] |
| Ціновий діапазон | [Очікуваний рівень ціни] |
| Обґрунтування | [Чому ця модель підходить для цієї аудиторії] |

---

## 6. Risks — Ризики

| # | Ризик | Ймовірність | Вплив | Мітигація |
|---|-------|-------------|-------|-----------|
| 1 | [Ризик] | Висока/Середня/Низька | Високий/Середній/Низький | [Захід] |
| 2 | [Ризик] | Висока/Середня/Низька | Високий/Середній/Низький | [Захід] |

---

## 7. B2B Assessment
<!-- Якщо продукт B2B — заповнити таблицю. Якщо solo-user — вказати "Solo-user product, B2B assessment не стосується". -->

| Параметр | Опис |
|----------|------|
| Тип продукту | [Solo-user / B2B (multi-user/team)] |
| ICP (Ideal Customer Profile) | [Розмір компанії, індустрія, бюджет, хто платить] |
| Buyer Map | [Decision Maker / User / Champion] |
| Sales Model | [self-serve / sales-assisted / enterprise] |
| Retention Model | [data lock-in / workflow dependency / switching cost / integration depth] |

---

## 8. Notes
<!-- Додаткові думки, ідеї на майбутнє, речі для дослідження пізніше -->
`;
}

// =============================================================================
// 9. Валідація структури — validateStructure()
// =============================================================================

/** Витягує контент секції між заголовками */
function extractSection(content: string, title: string): string | null {
  // Шукаємо заголовок будь-якого рівня (##, ###)
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `#{2,3}\\s+${escapedTitle}\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|$)`
  );
  const match = content.match(regex);
  return match ? match[1] : null;
}

/**
 * Перевіряє що агент заповнив всі обов'язкові секції discovery_brief.md.
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
// 10. Валідація результату (§6 Критерії прийнятності C1–C8)
// =============================================================================

/**
 * Перевіряє заповнений discovery_brief.md за критеріями прийнятності (§6).
 */
function validateResult(content: string): ValidationOutcome {
  const issues: string[] = [];

  // C1: Біль сформульована конкретно (хто, що, скільки)
  const painSection = extractSection(content, "Проблема");
  if (!painSection || painSection.trim().length < 20) {
    issues.push("C1 FAIL: Біль не сформульована конкретно (хто, що, скільки)");
  }

  // C2: Цільова аудиторія визначена
  const audienceSection = extractSection(content, "Цільова аудиторія");
  if (!audienceSection || !audienceSection.includes("|")) {
    issues.push("C2 FAIL: Цільова аудиторія не визначена (хто, скільки, де)");
  }

  // C3: Проаналізовано мінімум 3 конкуренти з URL та цінами
  const competitorsSection = extractSection(content, "Конкуренти");
  if (competitorsSection) {
    const dataRows = competitorsSection
      .split("\n")
      .filter((l) => l.includes("|") && !l.includes("---") && !l.includes("Конкурент"));
    if (dataRows.length < 3) {
      issues.push("C3 FAIL: Менше 3 конкурентів з URL та цінами");
    }
  } else {
    issues.push("C3 FAIL: Секція конкурентів відсутня");
  }

  // C3.1: Безкоштовні альтернативи описані
  const freeAltSection = extractSection(content, "Безкоштовні альтернативи");
  if (!freeAltSection || !freeAltSection.includes("|")) {
    issues.push("C3.1 FAIL: Безкоштовні альтернативи не описані");
  }
  // Тест конкурентоспроможності
  if (!content.includes("Тест конкурентоспроможності")) {
    issues.push("C3.1 FAIL: Тест конкурентоспроможності відсутній");
  }

  // C3.2: Retention hook визначено
  const retentionSection = extractSection(content, "Retention Hook");
  if (!retentionSection || retentionSection.trim().length < 10) {
    issues.push("C3.2 FAIL: Retention hook не визначено");
  }

  // C4: USP сформульовано в 1 реченні
  const uspSection = extractSection(content, "USP — Унікальна цінність");
  if (!uspSection || uspSection.trim().length < 15) {
    issues.push("C4 FAIL: USP не сформульовано");
  }

  // C5: MVP scope — не більше 7 ключових фічей
  const mvpSection = extractSection(content, "MVP Scope (ключові фічі)");
  if (mvpSection) {
    const mvpRows = mvpSection
      .split("\n")
      .filter((l) => l.includes("|") && !l.includes("---") && !l.includes("Фіча"));
    if (mvpRows.length > 7) {
      issues.push(`C5 FAIL: MVP scope перевищує 7 фічей (${mvpRows.length})`);
    }
    if (mvpRows.length === 0) {
      issues.push("C5 FAIL: MVP scope порожній");
    }
  } else {
    issues.push("C5 FAIL: Секція MVP scope відсутня");
  }

  // C6: Revenue model визначена
  const revenueSection = extractSection(content, "Revenue — Модель монетизації");
  if (!revenueSection || revenueSection.trim().length < 10) {
    issues.push("C6 FAIL: Revenue model не визначена");
  }

  // C7: Ризики описані — мінімум 2
  const risksSection = extractSection(content, "Risks — Ризики");
  if (risksSection) {
    const riskRows = risksSection
      .split("\n")
      .filter((l) => l.includes("|") && !l.includes("---") && !l.includes("Ризик") && !l.includes("#"));
    if (riskRows.length < 2) {
      issues.push("C7 FAIL: Менше 2 ризиків описано");
    }
  } else {
    issues.push("C7 FAIL: Секція ризиків відсутня");
  }

  // C8: Всі секції шаблону заповнені — делегуємо до validateStructure
  const structureCheck = validateStructure(content);
  if (!structureCheck.valid) {
    if (structureCheck.missing_sections.length > 0) {
      issues.push(`C8 FAIL: Відсутні секції: ${structureCheck.missing_sections.join(", ")}`);
    }
    if (structureCheck.empty_sections.length > 0) {
      issues.push(`C8 FAIL: Порожні секції: ${structureCheck.empty_sections.join(", ")}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 11. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_L2: StepDefinition = {
  id: "L2",
  block: "discovery",
  name: "DISCOVERY — Дослідження продукту",
  type: "collaborative",
  role: "researcher",
  purpose:
    "Дослідження перед запуском проєкту: визначення болю, аналіз ринку та конкурентів, формулювання USP, ескіз рішення. Результат — discovery_brief.md.",
  standards: [],

  preconditions: PRECONDITIONS,

  inputs: [
    {
      source: "state",
      field: "notes",
      description:
        "Ідея/інтерес людини — початкова точка, область, ніша або біль",
      required: true,
    },
  ],

  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: null,
    path_pattern: "control_center/project_description/discovery_brief.md",
    template_id: "l2_discovery_template",
  },

  transitions: [
    {
      condition: "Артефакт discovery_brief.md створено, чекліст готовності пройдено",
      target: "L3",
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
