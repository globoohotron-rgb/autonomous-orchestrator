// =============================================================================
// V1+V2: External Acceptance Audit + Audit Decision
// Конвертовано з: control_center/standards/audit/std-acceptance-audit.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
  InputReference,
} from "../../types";
import type { AuditVerdict, DefectSeverity, Defect } from "../../types";

// =============================================================================
// 1. Types (специфічні для V1/V2 Acceptance Audit)
// =============================================================================

/** Статус очікування покупця */
type ExpectationStatus = "PASS" | "PARTIAL" | "FAIL" | "NOT_TESTABLE";

/** Категорія очікування */
type ExpectationCategory =
  | "functional"
  | "nonfunctional"
  | "integration"
  | "value"
  | "performance";

/** Одне очікування покупця (§4.2) */
interface BuyerExpectation {
  id: number;
  description: string;
  category: ExpectationCategory;
  status: ExpectationStatus;
  evidence: string;
}

/** Збіг endpoint'ів (§4.2a Крок 1) */
interface EndpointMapping {
  id: number;
  client_location: string;
  method: string;
  client_url: string;
  server_location: string;
  match: boolean;
}

/** Збіг полів (§4.2a Крок 2) */
interface FieldMapping {
  id: number;
  form_location: string;
  client_fields: string[];
  api_handler_location: string;
  api_fields: string[];
  mismatches: string[];
}

/** Результат одного user flow (§4.3.1b) */
type FlowResult = "FLOW_PASS" | "FLOW_FAIL";

interface FlowWalkthrough {
  id: number;
  flow_name: string;
  steps: FlowStep[];
  result: FlowResult;
}

interface FlowStep {
  description: string;
  http_request: string;
  status_code: number;
  response_summary: string;
  response_time_ms: number;
  matches_spec: boolean;
}

/** Категорія тесту (§4.3b) */
type TestCategory =
  | "shallow_mock"
  | "silent_skip"
  | "real_integration"
  | "unit_with_logic";

/** Зведення якості тестів */
interface TestQualityAssessment {
  total: number;
  shallow_mock: number;
  silent_skip: number;
  real_integration: number;
  unit_with_logic: number;
  files_checked: string[];
}

/** Знахідка заглушки (§4.3c) */
interface StubFinding {
  id: number;
  file_location: string;
  type: "alert" | "coming_soon" | "todo" | "fixme" | "hack" | "not_implemented" | "dead_component";
  text: string;
  severity: DefectSeverity;
}

/** Статус acceptance criterion (§4.4) */
type AcceptanceCriterionStatus = "MET" | "NOT_MET" | "PARTIALLY_MET";

interface AcceptanceCriterionCheck {
  id: number;
  criterion: string;
  status: AcceptanceCriterionStatus;
  evidence: string;
}

/** Статус регресії (§4.5) */
interface RegressionCheck {
  id: number;
  previous_defect: string;
  fixed: boolean;
  status: "PASS" | "REGRESSION";
}

/** Зведений результат V1 */
interface AcceptanceAuditResult {
  date: string;
  expectations: BuyerExpectation[];
  endpoint_mappings: EndpointMapping[];
  field_mappings: FieldMapping[];
  flows: FlowWalkthrough[];
  test_quality: TestQualityAssessment;
  stubs: StubFinding[];
  acceptance_criteria: AcceptanceCriterionCheck[];
  regressions: RegressionCheck[];
  defects: Defect[];
  verdict: AuditVerdict;
  report_path: string;
}

/** Результат V2 рішення (§4.8) */
interface AuditDecisionResult {
  verdict: AuditVerdict;
  critical_count: number;
  major_count: number;
  minor_count: number;
  validation_attempts: number;
  next_step: "E1" | "V3";
  decision_path: string;
}

/** Параметри для генерації шаблону V1 */
interface V1TemplateParams {
  date: string;
  product_name: string;
  is_repeat: boolean;
  previous_report_path: string | null;
  expectations: BuyerExpectation[];
  endpoint_mappings: EndpointMapping[];
  field_mappings: FieldMapping[];
  app_start_command: string;
  app_start_result: string;
  flows: FlowWalkthrough[];
  test_quality: TestQualityAssessment;
  stubs: StubFinding[];
  dead_components: StubFinding[];
  acceptance_criteria: AcceptanceCriterionCheck[];
  regressions: RegressionCheck[];
  defects: Defect[];
  stats: AuditStatistics;
  verdict: AuditVerdict;
  verdict_rationale: string;
}

interface AuditStatistics {
  expectations_total: number;
  expectations_pass: number;
  expectations_partial: number;
  expectations_fail: number;
  expectations_not_testable: number;
  ac_met: number;
  ac_not_met: number;
  ac_partially_met: number;
  endpoints_match: number;
  field_mismatches: number;
  flows_pass: number;
  flows_fail: number;
  tests_total: number;
  tests_shallow_mock: number;
  tests_silent_skip: number;
  tests_real_integration: number;
  stubs_found: number;
  dead_components_found: number;
  defects_critical: number;
  defects_major: number;
  defects_minor: number;
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS — V1 (§3 POKA-YOKE — 6 передумов)
// =============================================================================

const V1_PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "state_field",
    field: "isolation_mode",
    expected_value: true,
    description:
      "P1: Ізоляція встановлена на V0 (чистий контекст без історії розробки). Якщо V0 не ізольований — агент отримує інструкцію: 'Забудь весь попередній контекст розробки. Ти — незалежний зовнішній аудитор.'",
  },
  {
    type: "file_exists",
    path: "control_center/final_view/project_description.md",
    description:
      "P2: Файли final_view/ існують і не порожні. Без опису продукту аудит неможливий.",
  },
  {
    type: "dir_not_empty",
    path: "control_center/final_view",
    description:
      "P3: Існує фактичний код/продукт для аудиту. Без продукту аудит неможливий.",
  },
  {
    type: "state_field",
    field: "current_step",
    expected_value: "V1",
    description: "P4: Поточний крок у state.json = V1. Порушення послідовності циклу.",
  },
  {
    type: "artifact_registered",
    artifact_key: "ui_review",
    description:
      "P5: Існує artifacts.ui_review (не null) — артефакт V0 має бути виконаний перед V1.",
  },
  {
    type: "artifact_registered",
    artifact_key: "acceptance_report",
    description:
      "P6: Якщо повторний аудит — prev_cycle_artifacts.acceptance_report не null. Попередження (не блок): використати для перевірки виправлень.",
  },
];

// =============================================================================
// 3. PRECONDITIONS — V2 (§4.8 — перевірка вхідних даних)
// =============================================================================

const V2_PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "artifact_registered",
    artifact_key: "acceptance_report",
    description:
      "Acceptance report (V1) створений і зареєстрований в state.json.",
  },
  {
    type: "state_field",
    field: "current_step",
    expected_value: "V2",
    description: "Поточний крок = V2.",
  },
];

// =============================================================================
// 4. INPUTS — V1 (§2 — 7 вхідних даних)
// =============================================================================

const V1_INPUTS: InputReference[] = [
  {
    source: "file",
    path: "control_center/final_view/project_description.md",
    description:
      "Purpose, Vision, Scope, Core modules, Acceptance criteria, Nonfunctional requirements. Первинне джерело вимог — написане людиною.",
    required: true,
  },
  {
    source: "file",
    path: "control_center/final_view/behavior_spec.md",
    description:
      "User flows, data model, API contracts, edge cases, state management. Визначає як система працює.",
    required: true,
  },
  {
    source: "file",
    path: "control_center/final_view/design_spec.md",
    description:
      "Візуальні вимоги: layout, кольори, типографіка, компоненти.",
    required: true,
  },
  {
    source: "directory",
    path: ".",
    description:
      "Фактичний код та файли проєкту. Зчитувати через інструменти, не з пам'яті.",
    required: true,
  },
  {
    source: "artifact",
    artifact_key: "acceptance_report",
    description:
      "Попередній acceptance_report (якщо не null) — для перевірки виправлення раніше знайдених дефектів.",
    required: false,
  },
  {
    source: "artifact",
    artifact_key: "ui_review",
    description:
      "Результат V0 UI Baseline Review. Обов'язковий вхід. UI_FAIL → CRITICAL дефекти; UI_PARTIAL → MAJOR дефекти; UI_PASS → UI не є пріоритетом аудиту.",
    required: true,
  },
];

// =============================================================================
// 5. INPUTS — V2 (§4.8)
// =============================================================================

const V2_INPUTS: InputReference[] = [
  {
    source: "artifact",
    artifact_key: "acceptance_report",
    description: "Щойно створений acceptance report (V1).",
    required: true,
  },
  {
    source: "state",
    field: "validation_attempts",
    description: "Лічильник спроб валідації.",
    required: true,
  },
  {
    source: "directory",
    path: "control_center/final_view/",
    description: "Для звірки критичності знахідок.",
    required: true,
  },
  {
    source: "artifact",
    artifact_key: "validation_conclusions",
    description:
      "Попередні validation_conclusions (якщо validation_attempts > 0). Містить 'Must Fix' та 'Out of Scope' списки. Дефекти зі списку 'Out of Scope' класифікуються як DEFERRED — не рахуються в CRITICAL/MAJOR.",
    required: false,
  },
];

// =============================================================================
// 6. ALGORITHM — V1 (§4.1–§4.7 — 3 проходи, multi-pass)
// =============================================================================

const V1_ALGORITHM: AlgorithmStep[] = [
  // --- §4.1 Підтвердження ізоляції ---
  {
    order: 1,
    instruction:
      "Підтвердити ізоляцію. Роль: 'Вимогливий професійний покупець, який оцінює продукт для купівлі. Критикує будь-яку незавершеність. Не знає історії розробки.' Ігнорувати плани розробки, задачі, внутрішні рішення. Оцінювати ТІЛЬКИ фактичний стан продукту.",
  },
  // --- ПРОХІД 1: §4.2 Формування очікувань покупця (Blind Expectations) ---
  {
    order: 2,
    instruction:
      "ПРОХІД 1: Зчитати project_description.md та behavior_spec.md повністю. ЗАБОРОНЕНО читати completion_checklist.md. Сформувати 7–15 фундаментальних очікувань покупця мовою результату.",
    substeps: [
      "Функціональні — основні модулі та функції з Core modules",
      "Нефункціональні — надійність, безпека, продуктивність з Nonfunctional requirements",
      "Інтеграційні — зовнішні інтерфейси, формати даних з Interfaces",
      "Ціннісні — мінімум 2 обов'язково: реальна цінність для кінцевого користувача",
      "Продуктивність — мінімум 1 обов'язково: сторінка < 3с, API < 500мс",
    ],
  },
  {
    order: 3,
    instruction:
      "💾 ПРОХІД 1 ЗАВЕРШЕНО. Зберегти проміжний файл acceptance_report_DD.MM.YY-HH-MM.md із заповненою секцією 1 (Очікування) та порожніми заготовками секцій 2-8. Захист від втрати даних при переповненні контексту.",
    contract_check:
      "Файл записаний на диск з мінімум 7 очікуваннями, включаючи ≥2 ціннісних та ≥1 продуктивність.",
  },
  // --- ПРОХІД 2: §4.2a Contract Verification ---
  {
    order: 4,
    instruction:
      "ПРОХІД 2, Крок 1: Endpoint Mapping (клієнт → сервер). Зчитати клієнтський API-клієнт, витягнути кожен HTTP-виклик (метод + URL). Зчитати серверні route-файли, витягнути кожен зареєстрований endpoint. Зіставити 1:1.",
    substeps: [
      "Кожен endpoint клієнта без серверного → CRITICAL: 404 для кожного користувача",
      "Кожен endpoint сервера без клієнта → зафіксувати як спостереження",
    ],
    contract_check:
      "Client endpoint path = Server registered route для КОЖНОГО виклику.",
  },
  {
    order: 5,
    instruction:
      "ПРОХІД 2, Крок 2: Field Name Mapping. Для кожної форми/компонента (POST, PATCH, PUT): знайти request body клієнта → порівняти з деструктуризацією request.body сервера.",
    substeps: [
      "Неспівпадіння імен полів → CRITICAL: дані втрачаються або запит відхиляється",
      "Відсутнє обов'язкове поле (API required, клієнт не надає) → CRITICAL: кожен запит 400",
    ],
    contract_check:
      "Client field names = Server handler field names для всіх write-операцій.",
  },
  {
    order: 6,
    instruction:
      "ПРОХІД 2, Крок 3: Зіставлення з behavior_spec. Для кожного endpoint зі специфікації перевірити чи поля API handler збігаються зі специфікацією. Розбіжність → MAJOR.",
  },
  // --- ПРОХІД 2: §4.3 Reality Check ---
  {
    order: 7,
    instruction:
      "ПРОХІД 2: Runtime Smoke Test. 1a) Запустити додаток (docker-compose up / npm run dev). 1b) Пройти мінімум 3 user flows з behavior_spec через HTTP-запити. 1c) Візуальна верифікація з design_spec.",
    substeps: [
      "1a: Запуск додатку. Якщо не стартує → CRITICAL. Продовжити як code review.",
      "1b: Для кожного flow: payload → HTTP запит → статус-код, тіло, час → порівняти з spec. 4xx/5xx на Happy Path → CRITICAL. Невідповідність → MAJOR.",
      "1c: Відкрити у браузері, порівняти з design_spec. Зафіксувати візуальні дефекти.",
      "npm test / vitest run — це НЕ Runtime Smoke Test. Тести окремо в 4.3b.",
    ],
    contract_check:
      "PASS вимагає: (a) код існує, (b) endpoint збіг (4.2a), (c) поля збіг (4.2a), (d) runtime підтвердження або реальний integration тест.",
  },
  {
    order: 8,
    instruction:
      "ПРОХІД 2: Для КОЖНОГО очікування з кроку 2 — перевірити фактичний стан. Код існує? Endpoint збігається? Поля збігаються? Працює в runtime? Реалізує заявлену поведінку?",
    substeps: [
      "PASS — всі умови одночасно: код є, endpoint збіг, поля збіг, runtime підтвердження",
      "PARTIAL — код є, але розбіжність у полях/endpoints, або тест тільки mocked, або частково реалізовано",
      "FAIL — код відсутній, або 4xx/5xx на happy path, або placeholder (alert, console.log, 'coming soon')",
      "NOT_TESTABLE — неможливо перевірити автоматично (потрібен ручний тест)",
    ],
    contract_check:
      "Наявність файлу з кодом ≠ працюючий функціонал. Мокований тест ≠ доказ працездатності.",
  },
  // --- ПРОХІД 2: §4.3b Test Quality Assessment ---
  {
    order: 9,
    instruction:
      "ПРОХІД 2: Test Quality Assessment. Виконати тести (npm test). Вибірково прочитати мінімум 5 тестових файлів з різних модулів. Класифікувати: shallow_mock / silent_skip / real_integration / unit_with_logic.",
    substeps: [
      "shallow_mock: мокає API/fetch повністю → ❌ низька діагностична цінність",
      "silent_skip: if (!apiAvailable) return → ❌ нульова цінність, тест-фантом",
      "real_integration: app.inject(), реальний HTTP → ✅ висока цінність",
      "unit_with_logic: чиста функція без зовнішніх залежностей → ⚠️ середня",
      ">50% shallow-mock або silent-skip → MAJOR: тестове покриття переважно мокове",
      "silent-skip як PASS → MAJOR: N тестів тихо пропускаються, false positive",
      "ЗАБОРОНЕНО: 'N/N tests pass' без класифікації",
    ],
  },
  // --- ПРОХІД 2: §4.3c Stub Detection ---
  {
    order: 10,
    instruction:
      "ПРОХІД 2: Stub Detection. Grep по кодовій базі: 'coming soon', TODO, FIXME, HACK, placeholder, 'not implemented', alert(. Перевірити мертві компоненти (існують в components/ але не імпортуються жодною сторінкою).",
    substeps: [
      "alert('...') замість реальної функціональності → MAJOR",
      "'coming soon' / 'not implemented' у видимому UI → MAJOR",
      "TODO / FIXME в бізнес-логіці → MINOR",
      "Компонент не імпортується жодною сторінкою → MAJOR: мертвий код",
    ],
  },
  {
    order: 11,
    instruction:
      "💾 ПРОХІД 2 ЗАВЕРШЕНО. Дописати результати Contract Verification (4.2a), Runtime Smoke Test (4.3), Test Quality (4.3b), Stub Detection (4.3c) в acceptance_report. Зберегти на диск.",
    contract_check:
      "Файл містить секції 1-5 після збереження.",
  },
  // --- ПРОХІД 3: §4.4–§4.7 ---
  {
    order: 12,
    instruction:
      "ПРОХІД 3: Перевірити Acceptance Criteria виключно з project_description.md. ЗАБОРОНЕНО брати критерії з completion_checklist.md. Для кожного критерію: MET / NOT_MET / PARTIALLY_MET.",
  },
  {
    order: 13,
    instruction:
      "ПРОХІД 3: Перевірити регресії (якщо повторний аудит). Якщо prev_cycle_artifacts.acceptance_report не null — для кожного попереднього дефекту перевірити виправлення. Невиправлений → REGRESSION (критичність +1 рівень).",
  },
  {
    order: 14,
    instruction:
      "ПРОХІД 3: Формування вердикту. Порахувати PASS/PARTIAL/FAIL/NOT_TESTABLE та MET/NOT_MET. Присвоїти категорію кожному дефекту: CRITICAL / MAJOR / MINOR. Кожну MAJOR-знахідку підкласифікувати: MAJOR_FUNC (порушує user flow) або MAJOR_DESIGN (візуальне відхилення, не блокує дію).",
    substeps: [
      "Для кожного MAJOR: 'Чи заважає це користувачу виконати дію або отримати правильний результат?' — так → MAJOR_FUNC, ні → MAJOR_DESIGN",
      "Підрахунок: CRITICAL, MAJOR_FUNC, MAJOR_DESIGN, MINOR — окремо",
      "Фінальна таблиця: | ID | Опис | Severity | Sub-category | Файл |  — обов'язково для кожного дефекту",
      "ЗАБОРОНЕНО PASS якщо хоча б один AC = NOT_MET (крім DEFERRED ACs)",
    ],
    contract_check:
      "Кожен MAJOR має підкатегорію FUNC/DESIGN. Вердикт за формальним правилом V2.",
  },
  {
    order: 15,
    instruction:
      "ПРОХІД 3: Зберегти фінальний acceptance_report_DD.MM.YY-HH-MM.md (секції 6-10). Оновити state.json: last_artifact → шлях, current_step → V2.",
    contract_check:
      "Файл містить всі 10 секцій. Якщо файл з датою існує — додати суфікс .2.md.",
  },
];

// =============================================================================
// 7. ALGORITHM — V2 (§4.8 Audit Decision — автоматичне рішення)
// =============================================================================

const V2_ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Крок 1: Класифікувати кожну знахідку з acceptance_report за severity: CRITICAL = функція непрацездатна, endpoint повертає 4xx/5xx, нульова реалізація (0 коду), дані втрачаються. MAJOR = суттєва прогалина, ядро працює. MINOR = косметичне. При сумніві — обрати ВИЩУ категорію.",
  },
  {
    order: 2,
    instruction:
      "Крок 2: Кожну MAJOR-знахідку підкласифікувати як MAJOR_FUNC або MAJOR_DESIGN. " +
      "MAJOR_FUNC = поведінка зламана, endpoint відсутній або повертає помилку, безпекова прогалина, дані некоректні, auth/авторизація не працює, тестове покриття нульове для критичних бізнес-функцій. " +
      "MAJOR_DESIGN = неправильний CSS-токен (hardcode замість var()), відсутня анімація, layout відхилення від spec, відступи/типографіка, accessibility косметична (div замість button), missing UI-компонент який не блокує жодний user flow. " +
      "Критерій: 'Чи заважає це користувачу виконати дію або отримати правильний результат?' — так → MAJOR_FUNC, ні → MAJOR_DESIGN.",
  },
  {
    order: 3,
    instruction:
      "Крок 3: Якщо validation_attempts > 0 (повторний аудит) — прочитати prev_cycle_artifacts.validation_conclusions. " +
      "Перевірити: чи всі дефекти зі списку 'Must Fix' виправлені? Зафіксувати: N_FIXED / N_MUST_FIX. " +
      "Дефекти зі списку 'Explicitly Out of Scope' → не рахувати як CRITICAL (позначити DEFERRED в таблиці рішення).",
  },
  {
    order: 4,
    instruction:
      "Крок 4: Застосувати правило рішення. " +
      "ANTI-LOOP GUARD: якщо validation_attempts >= 2 (це 3-й+ прохід валідації) І CRITICAL == 0 І MAJOR_FUNC == 0 → автоматичний PASS незалежно від MAJOR_DESIGN. Записати: 'PASS (anti-loop: 3rd validation cycle, no critical/functional defects remain)'. " +
      "CRITICAL (за вирахуванням DEFERRED) > 0 → FAIL (завжди, без виключень). " +
      "CRITICAL == 0 AND MAJOR_FUNC > 0 → FAIL (функціональні прогалини блокують реліз). " +
      "CRITICAL == 0 AND MAJOR_FUNC == 0 AND MAJOR_DESIGN ≤ 5 → PASS (до 5 design-відхилень допускаються, записати у рішенні перелік що залишилось). " +
      "CRITICAL == 0 AND MAJOR_FUNC == 0 AND MAJOR_DESIGN > 5 → FAIL (забагато design-відхилень). " +
      "Повторний аудит: якщо всі Must Fix із попереднього V3 виправлені і немає нових CRITICAL/MAJOR_FUNC → це сильний сигнал для PASS.",
    contract_check:
      "Рішення ТІЛЬКИ за формальним правилом з підкатегоріями. Жодних суб'єктивних 'в цілому нормально'.",
  },
  {
    order: 5,
    instruction:
      "Крок 5: Оновити validation_attempts. Якщо FAIL: validation_attempts += 1.",
  },
  {
    order: 6,
    instruction:
      "Крок 6: Маршрутизація. PASS → status = 'awaiting_human_decision', current_step = 'E1' (людський acceptance test перед E1). FAIL → current_step = 'V3', validation_attempts +1.",
    substeps: [
      "PASS: Додати до звіту секцію 'Human Acceptance Test' з переліком 3 flows для людини",
      "PASS + security_scan в issues/active/ → awaiting_human_decision (S-block чи E1?)",
      "FAIL → V3 (HANSEI + validation conclusions) → СТОП (людське рішення) → D1",
    ],
  },
  {
    order: 7,
    instruction:
      "Крок 7: Зберегти рішення — додати секцію 'Audit Decision' до acceptance_report або окремий audit_decision_DD.MM.YY-HH-MM.md. " +
      "У рішенні обов'язково зазначити: CRITICAL=N, MAJOR_FUNC=N, MAJOR_DESIGN=N, DEFERRED=N, MINOR=N.",
  },
];

// =============================================================================
// 8. CONSTRAINTS — V1 (§8 — 17 обмежень)
// =============================================================================

const V1_CONSTRAINTS: string[] = [
  "Заборонено проводити V0/V1 у тій самій сесії, що й розробку (без явної ізоляції на V0).",
  "Заборонено ставити PASS без фактичної перевірки через інструменти.",
  "Заборонено зчитувати задачі, плани, hansei-звіти, issues перед аудитом — лише final_view/ та фактичний код проєкту.",
  "Заборонено писати код, створювати задачі або виправляти дефекти під час аудиту.",
  "Заборонено ставити PASS при наявності хоча б одного Acceptance criterion зі статусом NOT_MET.",
  "Заборонено пом'якшувати категорію дефекту без обґрунтування фактами.",
  "Заборонено формувати менше 7 очікувань покупця — це ознака поверхневого аудиту.",
  "Заборонено формувати менше 2 ціннісних очікувань — аудит без перевірки цінності не виявляє ключову прогалину.",
  "Заборонено оцінювати продукт на основі планів або задач — тільки фактичний стан коду та артефактів.",
  "Заборонено ігнорувати дефекти з попереднього аудиту при повторній перевірці.",
  "Заборонено використовувати completion_checklist.md як джерело вимог або критеріїв прийнятності — це самовалідація.",
  "Заборонено ставити PASS для очікування якщо Contract Verification (4.2a) виявив розбіжність endpoint або полів — максимум PARTIAL.",
  "Заборонено писати 'N/N tests pass' без виконання Test Quality Assessment (4.3b) і класифікації тестів.",
  "Заборонено пропускати Stub Detection (4.3c) — alert() або 'coming soon' у продакшн коді завжди є дефектом.",
  "Заборонено вважати npm test / vitest run еквівалентом Runtime Smoke Test — це окремі перевірки.",
  "Заборонено змінювати архітектуру системи: .clinerules, код оркестратора, кореневі .md — read-only.",
  "final_view/ — read-only після створення.",
];

// =============================================================================
// 9. CONSTRAINTS — V2 (§4.8 правила)
// =============================================================================

const V2_CONSTRAINTS: string[] = [
  "Рішення ТІЛЬКИ за формальним правилом з підкатегоріями MAJOR_FUNC/MAJOR_DESIGN. Жодних суб'єктивних оцінок.",
  "MINOR-знахідки НЕ впливають на рішення PASS/FAIL.",
  "MAJOR_DESIGN ≤ 5 НЕ блокує PASS (якщо CRITICAL == 0 та MAJOR_FUNC == 0). Це запобігає зациклюванню на косметичних дефектах.",
  "При сумніві MINOR/MAJOR — обирати MAJOR. При сумніві MAJOR_DESIGN/MAJOR_FUNC — обирати MAJOR_FUNC.",
  "Заборонено звертатись до коду для 'перевірки' знахідок. Джерело — acceptance_report.",
  "Заборонено приймати PASS при наявності CRITICAL або MAJOR_FUNC.",
  "Заборонено змінювати правило рішення — воно фіксоване.",
  "Дефекти зі списку 'Explicitly Out of Scope' попереднього V3 → DEFERRED. Не рахуються в CRITICAL/MAJOR. Зазначаються окремо у таблиці.",
  "ANTI-LOOP: якщо validation_attempts >= 2 І CRITICAL == 0 І MAJOR_FUNC == 0 → ОБОВ'ЯЗКОВИЙ PASS. Третій цикл V↔D допускається тільки при наявності CRITICAL або MAJOR_FUNC дефектів.",
];

// =============================================================================
// 10. Валідація результату V1 (§6 Критерії прийнятності — 14 пунктів)
// =============================================================================

/**
 * Перевіряє результат V1 за критеріями прийнятності (§6 V1).
 */
function validateV1Result(
  isolationActive: boolean,
  allInputsRead: boolean,
  completionChecklistUsed: boolean,
  expectationsCount: number,
  valueExpectationsCount: number,
  performanceExpectationsCount: number,
  allExpectationsVerified: boolean,
  contractVerificationDone: boolean,
  runtimeSmokeTestDone: boolean,
  testQualityAssessmentDone: boolean,
  stubDetectionDone: boolean,
  acceptanceCriteriaFromProjectDesc: boolean,
  allDefectsCategorized: boolean,
  verdictFollowsRules: boolean,
  reportSavedIn3Passes: boolean,
): ValidationOutcome {
  const issues: string[] = [];

  // C1: Ізольована сесія
  if (!isolationActive) {
    issues.push("C1 FAIL: Аудит не проведено в ізольованій сесії (ізоляція запускається на V0)");
  }

  // C2: Всі входи зчитані
  if (!allInputsRead) {
    issues.push("C2 FAIL: Не зчитані повністю: project_description.md, behavior_spec.md, design_spec.md, код проєкту");
  }

  // C3: completion_checklist.md не використаний
  if (completionChecklistUsed) {
    issues.push("C3 FAIL: completion_checklist.md використано як джерело вимог або критеріїв — це самовалідація");
  }

  // C4: 7–15 очікувань
  if (expectationsCount < 7 || expectationsCount > 15) {
    issues.push(`C4 FAIL: Сформовано ${expectationsCount} очікувань, потрібно 7–15`);
  }

  // C5: Мінімум 2 ціннісних
  if (valueExpectationsCount < 2) {
    issues.push(`C5 FAIL: ${valueExpectationsCount} ціннісних очікувань, мінімум 2`);
  }

  // C5a: Мінімум 1 продуктивність
  if (performanceExpectationsCount < 1) {
    issues.push(`C5a FAIL: ${performanceExpectationsCount} очікувань продуктивності, мінімум 1`);
  }

  // C6: Кожне очікування перевірено
  if (!allExpectationsVerified) {
    issues.push("C6 FAIL: Не кожне очікування перевірено через інструменти (не з пам'яті)");
  }

  // C7: Contract Verification
  if (!contractVerificationDone) {
    issues.push("C7 FAIL: Contract Verification (4.2a) не виконаний: endpoint mapping + field mapping для всіх write-операцій");
  }

  // C8: Runtime Smoke Test
  if (!runtimeSmokeTestDone) {
    issues.push("C8 FAIL: Runtime Smoke Test (4.3.1b) не виконаний: мінімум 3 user flows через HTTP");
  }

  // C9: Test Quality Assessment
  if (!testQualityAssessmentDone) {
    issues.push("C9 FAIL: Test Quality Assessment (4.3b) не виконаний: тести не класифіковані");
  }

  // C10: Stub Detection
  if (!stubDetectionDone) {
    issues.push("C10 FAIL: Stub Detection (4.3c) не виконаний: grep на placeholder/alert/coming soon + dead components");
  }

  // C11: AC з project_description
  if (!acceptanceCriteriaFromProjectDesc) {
    issues.push("C11 FAIL: Acceptance criteria не взяті з project_description.md");
  }

  // C12: Дефекти категоризовані
  if (!allDefectsCategorized) {
    issues.push("C12 FAIL: Не кожен дефект має категорію CRITICAL / MAJOR / MINOR");
  }

  // C13: Вердикт за правилами
  if (!verdictFollowsRules) {
    issues.push("C13 FAIL: Вердикт не відповідає правилам §4.6.3");
  }

  // C14: 3 проходи
  if (!reportSavedIn3Passes) {
    issues.push("C14 FAIL: Звіт не збережений у 3 проходи з проміжним збереженням");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 11. Валідація результату V2 (§6 Критерії прийнятності V2 — 4 пункти)
// =============================================================================

/**
 * Перевіряє результат V2 за критеріями прийнятності.
 */
function validateV2Result(
  allFindingsClassified: boolean,
  decisionFollowsRule: boolean,
  validationAttemptsUpdated: boolean,
  stateUpdated: boolean,
): ValidationOutcome {
  const issues: string[] = [];

  // VC1: Знахідки класифіковані
  if (!allFindingsClassified) {
    issues.push("VC1 FAIL: Не кожна знахідка класифікована з обґрунтуванням");
  }

  // VC2: Рішення за правилом
  if (!decisionFollowsRule) {
    issues.push("VC2 FAIL: Рішення PASS/FAIL не за формальним правилом (§4.8)");
  }

  // VC3: validation_attempts оновлений
  if (!validationAttemptsUpdated) {
    issues.push("VC3 FAIL: validation_attempts не оновлений");
  }

  // VC4: state.json оновлений
  if (!stateUpdated) {
    issues.push("VC4 FAIL: state.json не оновлений відповідно до рішення");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 12. Допоміжна логіка вердикту V2 (§4.8 Крок 2)
// =============================================================================

/**
 * Визначає вердикт V2 за формальним правилом.
 * CRITICAL == 0 І MAJOR == 0 → PASS, інакше → FAIL.
 */
/**
 * Max MAJOR_DESIGN defects allowed for PASS verdict.
 * Prevents infinite loops on cosmetic issues while keeping strict functional checks.
 */
const MAX_MAJOR_DESIGN_FOR_PASS = 5;

function computeVerdict(
  criticalCount: number,
  majorFuncCount: number,
  majorDesignCount: number,
): AuditVerdict {
  // Any CRITICAL → always FAIL
  if (criticalCount > 0) return "FAIL";
  // Any functional MAJOR → FAIL (user flow broken)
  if (majorFuncCount > 0) return "FAIL";
  // Too many design MAJORs → FAIL (needs polish cycle)
  if (majorDesignCount > MAX_MAJOR_DESIGN_FOR_PASS) return "FAIL";
  // 0 CRITICAL, 0 MAJOR_FUNC, ≤5 MAJOR_DESIGN → PASS
  return "PASS";
}

/**
 * Визначає наступний крок після V2.
 * PASS → E1 (через awaiting_human_decision).
 * FAIL → V3.
 */
function computeNextStep(verdict: AuditVerdict): "E1" | "V3" {
  return verdict === "PASS" ? "E1" : "V3";
}

// =============================================================================
// 13. Шаблон артефакту V1 (§A — multi-pass)
// =============================================================================

/**
 * Генерує шаблон acceptance report.
 */
function generateTemplate(params: V1TemplateParams): string {
  const expectationRows = params.expectations
    .map(
      (e) =>
        `| ${e.id} | ${e.description} | ${capitalize(e.category)} | ${e.status} | ${e.evidence} |`
    )
    .join("\n");

  const endpointRows = params.endpoint_mappings
    .map(
      (ep) =>
        `| ${ep.id} | ${ep.client_location} | ${ep.method} | ${ep.client_url} | ${ep.server_location} | ${ep.match ? "✅" : "❌"} |`
    )
    .join("\n") || "| — | — | — | — | — | — |";

  const fieldRows = params.field_mappings
    .map(
      (f) =>
        `| ${f.id} | ${f.form_location} | ${f.client_fields.join(", ")} | ${f.api_handler_location} | ${f.api_fields.join(", ")} | ${f.mismatches.join("; ") || "—"} |`
    )
    .join("\n") || "| — | — | — | — | — | — |";

  const flowRows = params.flows
    .flatMap((flow) =>
      flow.steps.map(
        (step) =>
          `| ${flow.id} | ${flow.flow_name} | ${step.description} | ${step.http_request} | ${step.status_code} | ${step.response_summary} | ${step.response_summary} | ${flow.result} |`
      )
    )
    .join("\n") || "| — | — | — | — | — | — | — | — |";

  const stubRows = params.stubs
    .map(
      (s) =>
        `| ${s.id} | ${s.file_location} | ${s.type} | ${s.text} | ${s.severity} |`
    )
    .join("\n") || "| — | — | — | — | — |";

  const deadComponentRows = params.dead_components
    .map(
      (d) =>
        `| ${d.id} | ${d.file_location} | Ні | ${d.severity} |`
    )
    .join("\n") || "| — | — | — | — |";

  const acRows = params.acceptance_criteria
    .map(
      (ac) =>
        `| ${ac.id} | ${ac.criterion} | ${ac.status} | ${ac.evidence} |`
    )
    .join("\n") || "| — | — | — | — |";

  const regressionRows = params.regressions
    .map(
      (r) =>
        `| ${r.id} | ${r.previous_defect} | ${r.fixed ? "Так" : "Ні"} | ${r.status} |`
    )
    .join("\n") || "| — | — | — | — |";

  const defectRows = params.defects
    .map(
      (d) =>
        `| ${d.id} | ${d.description} | ${d.severity} | ${d.location}: ${d.evidence} |`
    )
    .join("\n") || "| — | — | — | — |";

  return `# Acceptance Report ${params.date}

> **Аудитор:** Незалежна сесія
> **Продукт:** ${params.product_name}
> **Тип:** Приймальний аудит (V1)
> **Повторний:** ${params.is_repeat ? `Так (попередній: ${params.previous_report_path})` : "Ні"}

---

## 1. Очікування покупця

| # | Очікування | Категорія | Статус | Доказ |
|---|-----------|-----------|--------|-------|
${expectationRows}

---

## 2. Contract Verification (клієнт ↔ сервер)

### 2.1 Endpoint Mapping

| # | Клієнт (файл:рядок) | Метод | URL (клієнт) | URL (сервер, файл:рядок) | Збіг? |
|---|---------------------|-------|-------------|--------------------------|-------|
${endpointRows}

### 2.2 Field Name Mapping (write operations)

| # | Форма (файл:рядок) | Поля клієнта | API handler (файл:рядок) | Поля API | Неспівпадіння |
|---|---------------------|-------------|--------------------------|----------|---------------|
${fieldRows}

---

## 3. Runtime Smoke Test

### 3.1 Запуск додатку
- **Команда:** ${params.app_start_command}
- **Результат:** ${params.app_start_result}

### 3.2 User Flow Walkthrough

| # | Flow (з behavior_spec) | Крок | HTTP запит | Статус-код | Очікувана відповідь | Фактична відповідь | Результат |
|---|------------------------|------|-----------|-----------|--------------------|--------------------|----------|
${flowRows}

---

## 4. Test Quality Assessment

| Метрика | Значення |
|---------|----------|
| Тестів всього | ${params.test_quality.total} |
| Shallow Mock (мокають API/fetch) | ${params.test_quality.shallow_mock} |
| Silent Skip (auto-skip без сервера) | ${params.test_quality.silent_skip} |
| Real Integration (app.inject / real HTTP) | ${params.test_quality.real_integration} |
| Unit with Logic (чисті функції) | ${params.test_quality.unit_with_logic} |

**Файли перевірені:** ${params.test_quality.files_checked.join(", ")}

---

## 5. Stub Detection

| # | Файл:рядок | Тип | Текст | Дефект |
|---|-----------|-----|-------|--------|
${stubRows}

### Мертві компоненти (існують але не імпортуються)

| # | Компонент | Імпортується? | Дефект |
|---|-----------|---------------|--------|
${deadComponentRows}

---

## 6. Acceptance Criteria

| # | Критерій (з final_view/) | Статус | Доказ |
|---|--------------------------|--------|-------|
${acRows}

## 7. Регресії (якщо повторний аудит)

| # | Дефект з попереднього звіту | Виправлено? | Статус |
|---|----------------------------|-------------|--------|
${regressionRows}

## 8. Перелік дефектів

| # | Дефект | Категорія | Опис |
|---|--------|-----------|------|
${defectRows}

## 9. Статистика

| Метрика | Значення |
|---------|----------|
| Очікувань всього | ${params.stats.expectations_total} |
| PASS | ${params.stats.expectations_pass} |
| PARTIAL | ${params.stats.expectations_partial} |
| FAIL | ${params.stats.expectations_fail} |
| NOT_TESTABLE | ${params.stats.expectations_not_testable} |
| Acceptance Criteria MET | ${params.stats.ac_met} |
| Acceptance Criteria NOT_MET | ${params.stats.ac_not_met} |
| Contract Verification: endpoints збіг | ${params.stats.endpoints_match} |
| Contract Verification: field розбіжності | ${params.stats.field_mismatches} |
| Runtime Flows: FLOW_PASS | ${params.stats.flows_pass} |
| Runtime Flows: FLOW_FAIL | ${params.stats.flows_fail} |
| Тести: total / shallow-mock / silent-skip / real-integration | ${params.stats.tests_total} / ${params.stats.tests_shallow_mock} / ${params.stats.tests_silent_skip} / ${params.stats.tests_real_integration} |
| Stubs/placeholders знайдено | ${params.stats.stubs_found} |
| Мертвих компонентів | ${params.stats.dead_components_found} |
| Дефектів CRITICAL | ${params.stats.defects_critical} |
| Дефектів MAJOR | ${params.stats.defects_major} |
| Дефектів MINOR | ${params.stats.defects_minor} |

## 10. Вердикт

**Результат:** ${params.verdict}

**Обґрунтування:** ${params.verdict_rationale}
`;
}

/** Capitalize першу літеру */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =============================================================================
// 14. STEP DEFINITIONS
// =============================================================================

export const STEP_V1: StepDefinition = {
  id: "V1",
  block: "validation_cycle",
  name: "Незалежний приймальний аудит (External Acceptance Audit)",
  type: "autonomous",
  role: "devil_advocate",
  purpose:
    "Проведення незалежного приймального аудиту продукту з позиції зовнішнього покупця: формування очікувань, верифікація контрактів, runtime smoke test, оцінка якості тестів, виявлення заглушок та плейсхолдерів.",
  standards: [],

  preconditions: V1_PRECONDITIONS,
  inputs: V1_INPUTS,
  algorithm: V1_ALGORITHM,
  constraints: V1_CONSTRAINTS,

  artifact: {
    registry_key: "acceptance_report",
    path_pattern:
      "control_center/audit/acceptance_reports/acceptance_report_{date}.md",
    template_id: "acceptance_report",
  },

  transitions: [
    {
      condition: "V1 завершено — перейти до V2 (автоматичне рішення)",
      target: "V2",
    },
  ],

  isolation_required: true,
  isolation_message:
    "Забудь весь попередній контекст розробки. Ти — незалежний зовнішній аудитор, який бачить продукт вперше. Не знаєш історії розробки. Оцінюй ТІЛЬКИ фактичний стан продукту відносно заявлених цілей.",
  session_boundary: true,
};

export const STEP_V2: StepDefinition = {
  id: "V2",
  block: "validation_cycle",
  name: "Рішення аудиту (Audit Decision)",
  type: "automatic_decision",
  role: "devil_advocate",
  purpose:
    "Прийняття формального рішення PASS/FAIL за результатами V1 аудиту на основі кількості CRITICAL та MAJOR дефектів.",
  standards: [],

  preconditions: V2_PRECONDITIONS,
  inputs: V2_INPUTS,
  algorithm: V2_ALGORITHM,
  constraints: V2_CONSTRAINTS,

  artifact: {
    registry_key: "gate_decision",
    path_pattern:
      "control_center/audit/gate_decisions/audit_decision_{date}.md",
    template_id: "audit_decision",
  },

  transitions: [
    {
      condition: "PASS (без security scan) → E1",
      target: "E1",
      target_block: "linear_exit",
      state_updates: {
        status: "awaiting_human_decision" as const,
        isolation_mode: false,
      },
    },
    {
      condition: "PASS + security scan в issues/active/ → awaiting_human_decision",
      target: "E1",
      target_block: "linear_exit",
      state_updates: {
        status: "awaiting_human_decision" as const,
      },
    },
    {
      condition: "FAIL → V3 (HANSEI + validation conclusions)",
      target: "V3",
    },
  ],

  isolation_required: true,
  isolation_message:
    "Рішення приймається виключно на основі acceptance_report. Заборонено звертатись до коду.",
  session_boundary: true,
};

// =============================================================================
// 15. Exports
// =============================================================================

export {
  validateV1Result,
  validateV2Result,
  computeVerdict,
  computeNextStep,
  generateTemplate,
  V1_PRECONDITIONS,
  V2_PRECONDITIONS,
  V1_INPUTS,
  V2_INPUTS,
  V1_ALGORITHM,
  V2_ALGORITHM,
  V1_CONSTRAINTS,
  V2_CONSTRAINTS,
};

export type {
  ExpectationStatus,
  ExpectationCategory,
  BuyerExpectation,
  EndpointMapping,
  FieldMapping,
  FlowResult,
  FlowWalkthrough,
  FlowStep,
  TestCategory,
  TestQualityAssessment,
  StubFinding,
  AcceptanceCriterionStatus,
  AcceptanceCriterionCheck,
  RegressionCheck,
  AcceptanceAuditResult,
  AuditDecisionResult,
  V1TemplateParams,
  AuditStatistics,
  ValidationOutcome,
};
