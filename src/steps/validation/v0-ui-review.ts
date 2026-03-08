// =============================================================================
// V0: UI Baseline Review — Перший крок валідації (запускає Isolation Mode)
// Конвертовано з: control_center/standards/audit/std-ui-review.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
  InputReference,
  ArtifactRotation,
} from "../../types";
import type { UIVerdict } from "../../types";

// =============================================================================
// 1. Types (специфічні для V0 UI Baseline Review)
// =============================================================================

/** Статус окремого токена */
type TokenStatus = "✅" | "⚠️" | "❌";

/** Рівень відхилення */
type DeviationSeverity = "CRITICAL" | "MAJOR" | "MINOR";

/** Результат перевірки одного токена */
interface TokenCheck {
  name: string;
  expected_value: string;
  actual_value: string;
  status: TokenStatus;
}

/** Результат перевірки одного компонента */
interface ComponentCheck {
  name: string;
  css_tokens: TokenStatus;
  aria: TokenStatus;
  loading_state: TokenStatus | "—";
  error_state: TokenStatus | "—";
  dead_or_stub: string;
  empty_state: TokenStatus | "—";
  onboarding_hint: TokenStatus | "—";
  overall: TokenStatus | "MAJOR" | "MINOR";
}

/** Результат перевірки однієї сторінки */
interface PageCheck {
  name: string;
  layout: TokenStatus;
  spacing: TokenStatus;
  responsive: TokenStatus;
  navigation: TokenStatus;
  empty_state_cta: TokenStatus | "—";
  settings_accessible: TokenStatus | "—";
  overall: TokenStatus | "MAJOR" | "MINOR" | "CRITICAL";
}

/** Окреме відхилення */
interface Deviation {
  id: string;
  severity: DeviationSeverity;
  location: string;
  description: string;
  expected: string;
  actual: string;
}

/** Зведений результат V0 */
interface UIReviewResult {
  date: string;
  tokens: TokenCheck[];
  components: ComponentCheck[];
  pages: PageCheck[];
  deviations: Deviation[];
  critical_count: number;
  major_count: number;
  minor_count: number;
  verdict: UIVerdict;
  report_path: string;
}

/** Параметри для генерації шаблону */
interface TemplateParams {
  date: string;
  pages_count: number;
  components_count: number;
  tokens: TokenCheck[];
  tokens_match_count: number;
  tokens_total: number;
  tokens_percent: number;
  components: ComponentCheck[];
  pages: PageCheck[];
  criticals: Deviation[];
  majors: Deviation[];
  minors: Deviation[];
  critical_count: number;
  major_count: number;
  minor_count: number;
  verdict: UIVerdict;
  v1_summary: string;
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 4 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "state_field",
    field: "isolation_mode",
    expected_value: true,
    description:
      "P1: Агент виконує V0 в чистій сесії (Isolation Mode). state.isolation_mode має бути true.",
  },
  {
    type: "file_exists",
    path: "control_center/final_view/design_spec.md",
    description:
      "P2: design_spec.md існує і не порожній. Без специфікації перевірка неможлива.",
  },
  {
    type: "dir_not_empty",
    path: "app/styles",
    description:
      "P3: app/styles/ існує — CSS для перевірки.",
  },
  {
    type: "dir_not_empty",
    path: "app/app",
    description:
      "P4: app/app/ існує — сторінки для перевірки.",
  },
];

// =============================================================================
// 3. INPUTS (§2 — 5 вхідних даних)
// =============================================================================

const INPUTS: InputReference[] = [
  {
    source: "file",
    path: "control_center/final_view/design_spec.md",
    description:
      "Design tokens, компонентна бібліотека, page layouts, типографіка, відступи, кольори, aria-вимоги",
    required: true,
  },
  {
    source: "directory",
    path: "app/styles/",
    description: "Актуальні CSS/globals — порівняти з очікуваними токенами",
    required: true,
  },
  {
    source: "directory",
    path: "app/app/",
    description: "Next.js App Router — page-level layout, структура, навігація",
    required: true,
  },
  {
    source: "directory",
    path: "app/components/",
    description:
      "Компоненти — відповідність іменуванню, пропсам, aria-атрибутам",
    required: true,
  },
  {
    source: "artifact",
    artifact_key: "ui_review",
    description:
      "Попередні UI review звіти — перевірити чи виправлені попередні відхилення",
    required: false,
  },
];

// =============================================================================
// 4. ALGORITHM (§4 — 9 кроків: Крок 0–8, два проходи)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 0,
    instruction:
      "Вхід у режим ізоляції (Isolation Mode). Запускає ізоляцію для всього Блоку 4 (V0→V1→V2→V3). Прийняти роль незалежного зовнішнього інспектора. Ігнорувати плани, задачі, issue, внутрішні рішення.",
    substeps: [
      "Роль: 'Незалежний зовнішній інспектор, який бачить продукт вперше. Не знає історії розробки.'",
      "Ігнорувати: плани розробки, задачі, issues, внутрішні рішення команди",
      "Оцінювати ТІЛЬКИ фактичний стан продукту відносно специфікації",
    ],
  },
  // --- ПРОХІД 1: Tokens + CSS ---
  {
    order: 1,
    instruction:
      "ПРОХІД 1: Зчитати design_spec.md повністю. Витягти: Design Tokens (CSS custom properties), Компонентну бібліотеку, Page Layouts, Typography scale, Accessibility вимоги.",
  },
  {
    order: 2,
    instruction:
      "Перевірити CSS tokens: читати app/styles/globals.css (або еквівалент). Для кожного токена: чи визначений? чи значення збігається? Позначити: ✅ відповідає / ⚠️ розходження / ❌ відсутній.",
  },
  {
    order: 3,
    instruction:
      "💾 ЗБЕРЕГТИ проміжний результат: записати ui_review_DD.MM.YY-HH-MM.md з заповненою секцією 1 (Design Tokens) та порожніми заготовками секцій 2-6. Файл ПОВИНЕН бути на диску перед Проходом 2.",
    contract_check:
      "Файл записаний на диск. Захист від втрати даних при переповненні контексту.",
  },
  // --- ПРОХІД 2: Components + Pages ---
  {
    order: 4,
    instruction:
      "ПРОХІД 2: Перевірити компоненти (по 3-4 файли за раз). Для кожного: CSS custom properties замість hardcode? Обов'язкові aria-атрибути? Структура відповідає spec? Loading/error/empty стани?",
    substeps: [
      "Grep на hex/px literals замість var(--...) — hardcode detection",
      "Читання JSX — role, aria-label, aria-describedby",
      "Порівняти з описом компонента у design_spec",
      "Умовний рендер — loading/error/empty стани",
      "B2B UX (якщо B2B продукт):",
      "  — Empty states: кожен список/таблиця/дашборд має empty state з CTA (не просто 'No data')",
      "  — Loading states: skeleton screens або spinner з пояснювальним текстом",
      "  — Error states: user-readable повідомлення, retry button, не raw error",
      "  — Onboarding hints: нові features мають tooltip або first-use guide",
    ],
  },
  {
    order: 5,
    instruction:
      "Перевірити мертві компоненти та заглушки (Dead Components & Stubs). Для кожного файлу у components/: grep по pages/ та App.jsx. Компонент без імпорту → DEAD → MAJOR. Grep на alert(, 'coming soon', TODO, FIXME → записати.",
    substeps: [
      "Мертві компоненти: grep import/usage в pages/ та App.jsx. Без імпорту → MAJOR: мертвий код",
      "alert() замість реальної дії → MAJOR: placeholder alert",
      "'coming soon' у видимому UI → MAJOR: функція не реалізована",
      "TODO / FIXME → MINOR: зафіксувати як спостереження",
    ],
  },
  {
    order: 6,
    instruction:
      "Перевірити сторінки: для кожного файлу app/app/ перевірити Layout структуру (sidebar, topbar, container), Spacing (var(--spacing-*) чи hardcode), Responsive (media queries), Navigation (routes відповідають специфікації).",
    substeps: [
      "Layout: sidebar, topbar, container — відповідність design_spec",
      "Spacing: var(--spacing-*) чи hardcode px",
      "Responsive: media queries, breakpoints з spec",
      "Navigation: routes відповідають специфікації",
      "B2B Page Requirements (якщо B2B продукт):",
      "  — Settings/Billing page: доступна з головної навігації, має breadcrumbs",
      "  — Team management page: invite flow, role display, member list",
      "  — Dashboard: KPI metrics видимі, data freshness indicator",
      "  — Onboarding flow: wizard або checklist для нових users visible на dashboard",
    ],
  },
  {
    order: 7,
    instruction:
      "Класифікувати відхилення та визначити рейтинг. CRITICAL > 0 → UI_FAIL. CRITICAL = 0, MAJOR > 0 → UI_PARTIAL. CRITICAL = 0, MAJOR = 0 → UI_PASS. Дописати у файл звіту секції 2-6.",
    substeps: [
      "CRITICAL: сторінка/компонент повністю не відповідає spec; accessibility порушена; layout зламаний",
      "MAJOR: значна розбіжність кольорів/типографіки; hardcode замість токенів; missing loading/error states; мертві компоненти; заглушки",
      "MINOR: незначні відхилення відступів; косметичні розбіжності; опціональні aria",
      "B2B Severity Rules (додатково до базових):",
      "  — Empty state без CTA для основного списку → MAJOR",
      "  — Settings/Billing недоступні з навігації → MAJOR",
      "  — Raw error message замість user-friendly → MAJOR",
      "  — Відсутній loading state для async операцій → MINOR",
      "  — Onboarding checklist відсутній → MINOR (якщо є B2B Model)",
      "💾 Дописати фінальний звіт: секції 2-6. Перевірити: файл містить всі 6 секцій",
    ],
    contract_check:
      "Рейтинг визначається строго за формулою: CRITICAL>0→UI_FAIL, MAJOR>0→UI_PARTIAL, інакше→UI_PASS.",
  },
  {
    order: 8,
    instruction:
      "Оновити state.json: current_step → V1, last_completed_step → V0, last_artifact → шлях до ui_review, status → in_progress. Результат V0 є обов'язковим вхідним контекстом для V1.",
  },
];

// =============================================================================
// 5. CONSTRAINTS (§8 — 4 обмеження)
// =============================================================================

const CONSTRAINTS: string[] = [
  "ЗАБОРОНЕНО запускати браузер, сервер або будь-який код.",
  "ЗАБОРОНЕНО виконувати V0 без Isolation Mode (Крок 0) — V0 запускає ізоляцію для всього Блоку 4.",
  "ЗАБОРОНЕНО виставляти UI_PASS без перевірки кожної сторінки та кожного компонента.",
  "ЗАБОРОНЕНО ігнорувати CRITICAL відхилення — вони мають бути у acceptance_report V1.",
];

// =============================================================================
// 6. V-Block Artifact Rotation
// =============================================================================

const V_BLOCK_ROTATION: ArtifactRotation = {
  description:
    "V0 при re-entry (validation_attempts > 0): ротує тільки V-keys. D-keys залишаються незмінними.",
  archive_keys: [
    "ui_review",
    "acceptance_report",
    "hansei_audit",
    "validation_conclusions",
  ],
  copy_to_prev_keys: [
    "ui_review",
    "acceptance_report",
    "hansei_audit",
    "validation_conclusions",
  ],
  nullify_keys: [
    "ui_review",
    "acceptance_report",
    "hansei_audit",
    "validation_conclusions",
  ],
};

// =============================================================================
// 7. Валідація результату (§6 Критерії прийнятності — 8 пунктів)
// =============================================================================

/**
 * Перевіряє результат V0 за критеріями прийнятності (§6).
 */
function validateResult(
  isolationModeActive: boolean,
  designSpecRead: boolean,
  allTokensCompared: boolean,
  allPagesChecked: boolean,
  allComponentsChecked: boolean,
  deviationsClassified: boolean,
  verdict: UIVerdict | null,
  reportPath: string | null,
): ValidationOutcome {
  const issues: string[] = [];

  // C1: Isolation Mode запущено
  if (!isolationModeActive) {
    issues.push("C1 FAIL: Isolation Mode не запущено (чиста сесія або явна інструкція)");
  }

  // C2: design_spec.md зчитаний повністю
  if (!designSpecRead) {
    issues.push("C2 FAIL: design_spec.md не зчитаний повністю");
  }

  // C3: Всі токени порівняні
  if (!allTokensCompared) {
    issues.push("C3 FAIL: Не всі токени порівняні");
  }

  // C4: Всі сторінки перевірені
  if (!allPagesChecked) {
    issues.push("C4 FAIL: Не всі сторінки перевірені (мінімум заголовок + структура)");
  }

  // C5: Всі компоненти перевірені
  if (!allComponentsChecked) {
    issues.push("C5 FAIL: Не всі компоненти перевірені (мінімум aria + token usage)");
  }

  // C6: Кожне відхилення класифіковане
  if (!deviationsClassified) {
    issues.push("C6 FAIL: Не кожне відхилення класифіковане CRITICAL / MAJOR / MINOR");
  }

  // C7: Підсумковий рейтинг визначений
  if (!verdict) {
    issues.push("C7 FAIL: Підсумковий рейтинг UI_PASS / UI_PARTIAL / UI_FAIL не визначений");
  }

  // C8: Артефакт збережений
  if (!reportPath || !reportPath.includes("audit/ui_reviews/ui_review_")) {
    issues.push(
      `C8 FAIL: Артефакт не збережений або неправильний шлях: "${reportPath ?? "null"}"`
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 8. Шаблон артефакту (§A)
// =============================================================================

/**
 * Генерує шаблон UI Review звіту.
 */
function generateTemplate(params: TemplateParams): string {
  const tokenRows = params.tokens
    .map(
      (t) => `| ${t.name} | ${t.expected_value} | ${t.actual_value} | ${t.status} |`
    )
    .join("\n");

  const componentRows = params.components
    .map(
      (c) =>
        `| ${c.name} | ${c.css_tokens} | ${c.aria} | ${c.loading_state} | ${c.error_state} | ${c.dead_or_stub} | ${c.empty_state} | ${c.onboarding_hint} | ${c.overall} |`
    )
    .join("\n");

  const pageRows = params.pages
    .map(
      (p) =>
        `| ${p.name} | ${p.layout} | ${p.spacing} | ${p.responsive} | ${p.navigation} | ${p.empty_state_cta} | ${p.settings_accessible} | ${p.overall} |`
    )
    .join("\n");

  const criticalRows =
    params.criticals.length > 0
      ? params.criticals
          .map(
            (d) =>
              `| ${d.id} | ${d.location} | ${d.description} | ${d.expected} | ${d.actual} |`
          )
          .join("\n")
      : "| — | — | — | — | — |";

  const majorRows =
    params.majors.length > 0
      ? params.majors
          .map(
            (d) =>
              `| ${d.id} | ${d.location} | ${d.description} | ${d.expected} | ${d.actual} |`
          )
          .join("\n")
      : "| — | — | — | — | — |";

  const minorRows =
    params.minors.length > 0
      ? params.minors
          .map((d) => `| ${d.id} | ${d.location} | ${d.description} |`)
          .join("\n")
      : "| — | — | — |";

  return `# UI Baseline Review — ${params.date}

## Мета
Порівняння реалізованого UI з \`design_spec.md\`.

## Вхідні дані
- design_spec.md: ${params.date}
- Кількість сторінок перевірено: ${params.pages_count}
- Кількість компонентів перевірено: ${params.components_count}

## 1. Design Tokens

| Токен | Очікуване значення | Фактичне значення | Статус |
|-------|--------------------|-------------------|--------|
${tokenRows}

**Підсумок токенів:** ${params.tokens_match_count}/${params.tokens_total} відповідають (${params.tokens_percent}%)

## 2. Компоненти

| Компонент | CSS tokens | Aria | Loading state | Error state | Dead/Stub | Empty state | Onboarding hint | Статус |
|-----------|-----------|------|---------------|-------------|-----------|-------------|-----------------|--------|
${componentRows}

## 3. Сторінки

| Сторінка | Layout | Spacing | Responsive | Navigation | Empty CTA | Settings | Статус |
|----------|--------|---------|------------|------------|-----------|----------|--------|
${pageRows}

## 4. Перелік відхилень

### CRITICAL (${params.critical_count})
| ID | Компонент/Сторінка | Опис | Очікувано | Фактично |
|----|-------------------|------|-----------|---------|
${criticalRows}

### MAJOR (${params.major_count})
| ID | Компонент/Сторінка | Опис | Очікувано | Фактично |
|----|-------------------|------|-----------|---------|
${majorRows}

### MINOR (${params.minor_count})
| ID | Компонент/Сторінка | Опис |
|----|-------------------|------|
${minorRows}

## 5. Статистика
- CRITICAL: ${params.critical_count}
- MAJOR: ${params.major_count}
- MINOR: ${params.minor_count}
- **Рейтинг UI: ${params.verdict}**

## 6. Висновок для V1 аудитора
${params.v1_summary}
`;
}

// =============================================================================
// 9. STEP DEFINITION (конфіг кроку для оркестратора)
// =============================================================================

export const STEP_V0: StepDefinition = {
  id: "V0",
  block: "validation_cycle",
  name: "UI Baseline Review — Перевірка відповідності UI специфікації",
  type: "autonomous",
  role: "devil_advocate",
  purpose:
    "Перший крок валідації. Запускає Isolation Mode для всього Блоку 4. Агент як незалежний інспектор перевіряє відповідність реалізованого UI вимогам design_spec.md через читання файлів (без runtime).",
  standards: [],

  preconditions: PRECONDITIONS,
  inputs: INPUTS,
  algorithm: ALGORITHM,
  constraints: CONSTRAINTS,

  artifact: {
    registry_key: "ui_review",
    path_pattern:
      "control_center/audit/ui_reviews/ui_review_{date}.md",
    template_id: "ui_review",
  },

  transitions: [
    {
      condition: "V0 завершено — перейти до smoke test V0.5",
      target: "V0_5",
    },
  ],

  isolation_required: true,
  isolation_message:
    "Забудь весь попередній контекст розробки. Ти — незалежний зовнішній аудитор, який бачить продукт вперше. Не знаєш історії розробки — ні планів, ні прийнятих компромісів, ні внутрішніх рішень. Оцінюй ТІЛЬКИ фактичний стан продукту відносно специфікації.",
  session_boundary: true,

  rotation: V_BLOCK_ROTATION,
};

// =============================================================================
// 10. Exports
// =============================================================================

export {
  validateResult,
  generateTemplate,
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  INPUTS,
  V_BLOCK_ROTATION,
};

export type {
  TokenStatus,
  DeviationSeverity,
  TokenCheck,
  ComponentCheck,
  PageCheck,
  Deviation,
  UIReviewResult,
  TemplateParams,
  ValidationOutcome,
};
