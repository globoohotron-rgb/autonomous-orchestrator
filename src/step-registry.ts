// =============================================================================
// Step Registry — всі StepDefinition індексовані за Step ID
// Конвертовано з: control_center/docs/system_cycle.md (секція "Реєстр артефактів",
//   опис кроків по блоках, секція 5 CONVERSION_PLAN.md)
// Роль: O3 — збирає всі StepDefinition з конвертованих стандартів +
//   створює StepDefinition для кроків що використовують лише інструменти
// =============================================================================

import type { StepDefinition, Step, Block } from "./types";

// --- Імпорти з конвертованих стандартів (кроки з окремими файлами) ---

// Discovery (Блок 1)
import { STEP_L1 } from "./steps/discovery/l1-project-init";
import { STEP_L2 } from "./steps/discovery/l2-discovery";
import { STEP_L3 } from "./steps/discovery/l3-design-brief";
import { STEP_L3b } from "./steps/discovery/l3b-design-identity";
import { STEP_L5 } from "./steps/discovery/l5-product-description";
import { STEP_L6 } from "./steps/discovery/l6-design-spec";
import { STEP_L7 } from "./steps/discovery/l7-behavior-spec";

// Foundation (Блок 2)
import { STEP_L8 } from "./steps/shared/plan";           // dual-mode: Foundation
import { STEP_L9 } from "./steps/shared/task-creation";  // dual-mode: Foundation
import { STEP_L13 } from "./steps/foundation/l13-completion-checklist";

// Development Cycle (Блок 3)
import { STEP_D1 } from "./steps/development/d1-cycle-check";
import { STEP_D2, STEP_D9 } from "./steps/development/d2-d9-goals-check";
import { STEP_D3 } from "./steps/shared/plan";           // dual-mode: Development
import { STEP_D4 } from "./steps/shared/task-creation";  // dual-mode: Development
import { STEP_D6 } from "./steps/development/d6-plan-verify";

// Validation (Блок 4)
import { STEP_V0 } from "./steps/validation/v0-ui-review";
import { STEP_V0_5 } from "./steps/validation/v05-smoke-test";
import { STEP_V1, STEP_V2 } from "./steps/validation/v1-acceptance-audit";

// Security Fix (Блок 5)
import { STEP_S1, STEP_S2, STEP_S3, STEP_S4, STEP_S5 } from "./steps/security/s-block";

// Linear Exit (Блок 6)
import { STEP_E1 } from "./steps/exit/e1-release-check";

// =============================================================================
// Кроки що НЕ мають окремого файлу —
// використовують лише інструменти (gate-decision, session-management, hansei,
// task-execution, issue-management, security-scan).
// Їхні StepDefinition створюються тут як прості об'єкти.
// =============================================================================

// --- L4: Entry Gate (GO / REWORK / KILL) ---
// Маршрутизація: std-gate-decision (B2)
const STEP_L4: StepDefinition = {
  id: "L4",
  block: "discovery",
  name: "GO / REWORK / KILL — Ворота входу",
  type: "human_decision",
  role: "architect",
  purpose: "Оцінка discovery_brief — чи варто починати проєкт (entry gate після Discovery)",
  standards: [],
  preconditions: [
    {
      type: "file_exists",
      path: "control_center/project_description/discovery_brief.md",
      description: "Discovery brief існує (результат L2)",
    },
    {
      type: "file_exists",
      path: "control_center/project_description/design_brief.md",
      description: "Дизайн-бриф існує (результат L3)",
    },
    {
      type: "file_exists",
      path: "control_center/project_description/design_identity.md",
      description: "Design Identity існує (результат L3b)",
    },
  ],
  inputs: [
    {
      source: "file",
      path: "control_center/project_description/discovery_brief.md",
      description: "Discovery brief для оцінки",
      required: true,
    },
    {
      source: "file",
      path: "control_center/project_description/design_brief.md",
      description: "Дизайн-бриф для оцінки",
      required: true,
    },
    {
      source: "file",
      path: "control_center/project_description/design_identity.md",
      description: "Design Identity — візуальна ідентичність (результат L3b)",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Створити шаблон файлу рішення gate_entry_decision_{date}.md з секціями: ## System Analysis (перерахувати ключові знахідки з discovery_brief, design_brief, design_identity), ## Recommendation (РЕКОМЕНДАЦІЯ системи на основі повноти документів), ## Decision (порожнє для людини — decision, rationale, comments)",
    },
    {
      order: 2,
      instruction: "Оновити state.json: status → 'awaiting_human_decision'",
    },
    {
      order: 3,
      instruction: "ЗУПИНИТИСЯ — очікувати рішення людини",
    },
    {
      order: 4,
      instruction: "При наступному запуску: прочитати файл рішення, виконати відповідний перехід",
    },
  ],
  constraints: [
    "Агент НЕ приймає рішення самостійно",
    "Усна команда не замінює файл рішення",
    "Файл рішення має обов'язкові поля: decision, rationale, comments",
  ],
  artifact: {
    registry_key: "gate_decision",
    path_pattern: "control_center/audit/gate_decisions/gate_entry_decision_{date}.md",
  },
  transitions: [
    { condition: "GO", target: "L5" },
    { condition: "REWORK", target: "L2" },
    { condition: "KILL", target: "L1", state_updates: { status: "cancelled" } },
  ],
  isolation_required: false,
};

// --- L10: Виконання задач (Foundation) ---
// Інструменти: std-task-execution (B6), std-issue-management (B3)
const STEP_L10: StepDefinition = {
  id: "L10",
  block: "foundation",
  name: "Виконання задач",
  type: "autonomous",
  role: "architect",
  purpose: "Послідовне виконання кожної задачі з фундаментного плану з контрактною перевіркою UI↔API проти behavior_spec.md",
  standards: [],
  preconditions: [
    {
      type: "dir_not_empty",
      path: "control_center/tasks/active/",
      description: "Є задачі у tasks/active/ для виконання",
    },
  ],
  inputs: [
    {
      source: "directory",
      path: "control_center/tasks/active/",
      description: "Задачі для виконання",
      required: true,
    },
    {
      source: "file",
      path: "control_center/final_view/behavior_spec.md",
      description: "Поведінкова специфікація для Contract Check (UI↔API)",
      required: false,
    },
    {
      source: "directory",
      path: "control_center/issues/active/",
      description: "Перевірка на наявність issues після кожної задачі",
      required: false,
    },
  ],
  algorithm: [
    {
      order: 0,
      instruction: "QUEUE INIT: виконати `queue scan` → побудувати чергу задач з tasks/active/. Записати state.json → tasks_total, tasks_completed = 0. Якщо state.json вже має tasks_completed > 0 — відновлення після crash.",
    },
    {
      order: 1,
      instruction: "Виконати `queue next` → отримати наступну готову задачу. Виконати `queue start --task <ID>` → позначити як in_progress.",
    },
    {
      order: 2,
      instruction: "Прочитати файл задачі ПОВНІСТЮ. Обов'язкові секції для виконання:",
      substeps: [
        "'Контекст коду' — містить РЕАЛЬНІ сніпети файлів які змінюються + опис трансформації БУЛО→СТАЛО. Виконувати ТОЧНО згідно цих інструкцій.",
        "'Заборони' — список дій які ЗАБОРОНЕНО робити. Порушення будь-якої заборони = невалідне виконання.",
        "'Кроки виконання' — покрокова інструкція з конкретним кодом.",
        "'Acceptance Criteria' — чекліст який КОЖЕН пункт має бути ✅ після виконання.",
        "'Validation Script' — команди для самоперевірки які ОБОВ'ЯЗКОВО запустити ПІСЛЯ виконання.",
        "Contract Check: якщо задача створює/змінює UI-компонент що відправляє дані на API → перевірити endpoint path та імена полів проти behavior_spec.md.",
      ],
    },
    {
      order: 3,
      instruction: "Виконати задачу згідно 'Кроків виконання' та 'Контексту коду'. Якщо тест падає — виправити КОД (не assertion). Перевіряти відповідність 'Заборонам' на кожному кроці.",
    },
    {
      order: 4,
      instruction: "JIDOKA: при критичному дефекті (J1–J5) → зупинити виконання, створити issue в issues/active/, ескалювати. state.json → jidoka_stops += 1.",
    },
    {
      order: 5,
      instruction: "ОБОВ'ЯЗКОВО запустити 'Validation Script' з файлу задачі. Якщо validation показує FAIL — задача НЕ ЗАВЕРШЕНА, повернутись до кроку 3 і виправити.",
    },
    {
      order: 6,
      instruction: "Після успішної валідації: `queue done --task <ID>`. Перемістити файл задачі в tasks/done/[Plan Name]/. Session Bridge автоматично запустить нову сесію для наступної задачі. state.json → tasks_completed += 1.",
    },
    {
      order: 7,
      instruction: "ФІНАЛ: коли `queue done` повертає 'Всі задачі плану виконано!' — виконати `complete` для переходу на L10b.",
    },
  ],
  constraints: [
    "Contract Check обов'язковий для UI↔API задач",
    "Розбіжність endpoint/field = JIDOKA зупинка",
    "Security scan перевірка після кожної задачі",
    "CRITICAL CVE = P0 пріоритет",
    "Виконання issues негайне — перед продовженням наступної задачі",
  ],
  artifact: null,
  transitions: [
    { condition: "Всі задачі виконані, tasks/active/ порожній", target: "L10b" },
  ],
  isolation_required: false,
  session_boundary: true,
};

// --- L10b: Foundation Plan Verification ---
// Аналог D6 для Foundation блоку
const STEP_L10b: StepDefinition = {
  id: "L10b",
  block: "foundation",
  name: "Foundation Plan Verification",
  type: "autonomous",
  role: "architect",
  purpose: "Верифікація повноти виконання фундаментного плану — поетапна перевірка з доказами через інструменти",
  standards: [],
  preconditions: [
    {
      type: "dir_empty",
      path: "control_center/tasks/active/",
      description: "Всі задачі виконані та переміщені в tasks/done/",
    },
    {
      type: "step_completed",
      step: "L10",
      description: "Виконання задач завершено",
    },
  ],
  inputs: [
    {
      source: "directory",
      path: "control_center/plans/active/",
      description: "Поточний план для верифікації",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/tasks/done/",
      description: "Виконані задачі — зіставлення з планом",
      required: true,
    },
    {
      source: "file",
      path: "control_center/final_view/behavior_spec.md",
      description: "Поведінкова специфікація для Cross-cutting Flow Check",
      required: false,
    },
    {
      source: "directory",
      path: "control_center/final_view/",
      description: "Маяк продукту — для верифікації відповідності",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Зчитати план з plans/active/. Скласти пронумерований список УСІХ пунктів плану (включно з Test Strategy, якщо є).",
    },
    {
      order: 2,
      instruction: "Зчитати звіти виконання задач з tasks/done/[Назва плану]/. Зафіксувати, які пункти плану покриті кожною задачею.",
    },
    {
      order: 3,
      instruction: "Для КОЖНОГО пункту плану: визначити очікуваний результат → перевірити фактичний стан через інструменти (read file, run test, curl) → класифікувати ✅/⚠️/❌. Статус ✅ ТІЛЬКИ з фактичним доказом.",
      substeps: [
        "Файл/модуль існує → зчитати, переконатись у наявності",
        "Код реалізовано → знайти відповідний код, перевірити відповідність пункту",
        "Тести існують і проходять → запустити тести",
        "Runtime працює → якщо пункт стосується HTTP endpoint / UI / API — виконати curl або аналогічну перевірку. Наявність коду без runtime = максимум ⚠️ Частково",
        "Артефакт створено → перевірити наявність і вміст",
      ],
      contract_check: "Статус ✅ без фактичного підтвердження через інструменти — порушення стандарту.",
    },
    {
      order: 4,
      instruction: "Cross-cutting Flow Check (ОБОВ'ЯЗКОВИЙ): Взяти Flow 1 з behavior_spec.md (Happy Path). Для кожного кроку flow перевірити endpoint paths + field names client↔server.",
      substeps: [
        "Взяти Flow 1 з behavior_spec.md (Happy Path)",
        "Для кожного кроку flow відкрити відповідний client-файл і server-файл",
        "Перевірити: endpoint path клієнта = зареєстрований route на сервері",
        "Перевірити: field names в body = field names в handler",
        "Якщо будь-який перехід = BREAK → plan completion = ❗ Частково",
        "Сформувати довиконавчу задачу на виправлення contract mismatch при BREAK",
      ],
    },
    {
      order: 5,
      instruction: "Tech Debt Check (ОБОВ'ЯЗКОВО): перевірити технічне здоров'я коду.",
      substeps: [
        "Pattern Consistency: чи всі модулі використовують однаковий стиль?",
        "Module Boundaries: чи є прямі імпорти з internal файлів інших модулів?",
        "Duplication: чи є copy-paste код між модулями?",
        "Test Coverage: чи кожен модуль/feature має хоча б один тест-файл?",
        "Dead Code: чи є exports які ніхто не імпортує?",
        "Якщо знайдено КРИТИЧНИЙ tech debt → додати remediation задачу.",
      ],
    },
    {
      order: 6,
      instruction: "Сформувати звіт plan_completion_check_foundation_{date}.md у control_center/audit/plan_completion/ за шаблоном: перелік пунктів зі статусами, Contract Flow Check результати, Tech Debt результати, Summary (✅/⚠️/❌ count).",
    },
    {
      order: 7,
      instruction: "Обробка пропусків: якщо всі пункти ✅ І tech debt не критичний → перейти до L11. Якщо є ⚠️ або ❌ або критичний tech debt → сформувати довиконавчі задачі в tasks/active/, виконати згідно std-task-execution.md, перемістити в done/. Повторну верифікацію НЕ проводити. Перейти до L11.",
      substeps: [
        "Сформувати довиконавчі задачі безпосередньо в control_center/tasks/active/. Окремий план НЕ створювати",
        "КОЖНА довиконавча задача МУСИТЬ містити всі 13 секцій шаблону задачі включно з 'Контекст коду' (реальні сніпети + БУЛО→СТАЛО), 'Заборони', 'Validation Script'",
        "Виконати задачі згідно алгоритму виконання задач",
        "Перемістити виконані задачі в control_center/tasks/done/[Назва плану]/",
        "Повторну верифікацію НЕ проводити — перейти до L11",
      ],
    },
  ],
  constraints: [
    "Заборонено проводити повторну верифікацію після довиконання (захист від нескінченного циклу).",
    "Заборонено створювати окремий план для довиконавчих задач — лише задачі напряму в tasks/active/.",
    "Заборонено класифікувати пункт як ✅ без фактичної перевірки через інструменти.",
    "Заборонено змінювати або доповнювати план на цьому кроці — тільки верифікація існуючих пунктів.",
    "Заборонено ігнорувати Test Strategy — тести перевіряються нарівні з кодом.",
    "Бажано виконувати у чистій сесії для зменшення bias самоперевірки.",
  ],
  artifact: {
    registry_key: "plan_completion",
    path_pattern: "control_center/audit/plan_completion/plan_completion_check_foundation_{date}.md",
  },
  transitions: [
    { condition: "Верифікація завершена, довиконавчі задачі (якщо були) виконані", target: "L11" },
  ],
  isolation_required: false,
};

// --- L11: Завершення плану (Foundation) ---
// Інструмент: std-session-management §4.7 (B1)
const STEP_L11: StepDefinition = {
  id: "L11",
  block: "foundation",
  name: "Завершення плану",
  type: "autonomous",
  role: "architect",
  purpose: "Архівація виконаного фундаментного плану: переміщення з plans/active/ до plans/done/",
  standards: [],
  preconditions: [
    {
      type: "dir_empty",
      path: "control_center/tasks/active/",
      description: "Всі задачі виконані та переміщені в tasks/done/[Назва плану]/",
    },
  ],
  inputs: [
    {
      source: "directory",
      path: "control_center/plans/active/",
      description: "Поточний план для архівації",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/tasks/done/",
      description: "ТІЛЬКИ list_dir — перевірити що папка [Назва плану] існує і не порожня. НЕ читати вміст задач.",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Перевірити що всі задачі плану переміщені у tasks/done/[Назва плану]/ — ТІЛЬКИ list_dir перевірка (папка існує + не порожня), НЕ читати вміст файлів задач.",
    },
    {
      order: 2,
      instruction: "Перемістити план з plans/active/ у plans/done/",
    },
    {
      order: 3,
      instruction: "--- HANSEI (вбудовано з L12) --- Відкрити стандарт std-hansei.md, прочитати повністю",
    },
    {
      order: 4,
      instruction: "Проаналізувати: що було заплановано vs що вийшло",
    },
    {
      order: 5,
      instruction: "Визначити задачі що були сформовані погано",
    },
    {
      order: 6,
      instruction: "Визначити кроки що зайняли більше часу ніж очікувалось",
    },
    {
      order: 7,
      instruction: "Сформувати уроки для наступної ітерації",
    },
    {
      order: 8,
      instruction: "Створити артефакт hansei_foundation_{date}.md",
    },
  ],
  constraints: [
    "Не продовжувати якщо tasks/active/ не порожній",
    "Рефлексія має бути чесною",
    "Зберігається як артефакт для аналізу трендів",
  ],
  artifact: {
    registry_key: "hansei",
    path_pattern: "control_center/audit/hansei/hansei_foundation_{date}.md",
  },
  transitions: [
    { condition: "План архівовано + HANSEI завершено", target: "L13" },
  ],
  isolation_required: false,
};

// --- L12: DEPRECATED — merged into L11 (backward compat) ---
const STEP_L12: StepDefinition = {
  id: "L12",
  block: "foundation",
  name: "[DEPRECATED → L11] HANSEI — Рефлексія",
  type: "autonomous",
  role: "architect",
  purpose: "DEPRECATED: HANSEI тепер вбудовано в L11. Цей крок пропускається в BLOCK_SEQUENCES.",
  standards: [],
  preconditions: [
    {
      type: "step_completed",
      step: "L11",
      description: "Завершення плану виконано",
    },
  ],
  inputs: [],
  algorithm: [
    {
      order: 1,
      instruction: "DEPRECATED — HANSEI вбудовано в L11. Виконайте complete для переходу до L13.",
    },
  ],
  constraints: [],
  artifact: {
    registry_key: "hansei",
    path_pattern: "control_center/audit/hansei/hansei_foundation_{date}.md",
  },
  transitions: [
    { condition: "HANSEI завершено", target: "L13" },
  ],
  isolation_required: false,
};

// --- GATE1: Ворота фундаменту ---
// Маршрутизація: std-gate-decision (B2)
const STEP_GATE1: StepDefinition = {
  id: "GATE1",
  block: "foundation",
  name: "Ворота фундаменту (GATE 1)",
  type: "human_decision",
  role: "architect",
  purpose: "Оцінка чи фундамент побудовано достатньо для переходу до розвитку",
  standards: [],
  preconditions: [
    {
      type: "step_completed",
      step: "L13",
      description: "Completion checklist створено",
    },
    {
      type: "file_exists",
      path: "control_center/final_view/completion_checklist.md",
      description: "Чекліст існує",
    },
    {
      type: "step_completed",
      step: "L13",
      description: "Completion Checklist завершено (L13 = останній крок перед GATE1)",
    },
  ],
  inputs: [
    {
      source: "directory",
      path: "control_center/final_view/",
      description: "Маяк продукту",
      required: true,
    },
    {
      source: "artifact",
      artifact_key: "hansei",
      description: "Рефлексія фундаменту",
      required: true,
    },
    {
      source: "file",
      path: "control_center/final_view/completion_checklist.md",
      description: "Чекліст завершеності",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Створити шаблон файлу рішення gate1_decision_{date}.md з секціями: ## Foundation Readiness Report (зчитати plan_completion_check_foundation з audit/plan_completion/, порахувати ✅/⚠️/❌ пунктів плану, Progress %: (✅ count / total) × 100), ## Contract Integrity (зчитати flow check з plan_completion_check: скільки BREAK / OK), ## Tech Debt Summary (зчитати tech debt секцію: critical / warnings), ## Metrics (tasks_completed, jidoka_stops, issues_created з state.json), ## System Recommendation (якщо progress ≥ 80% і 0 ❌ і 0 BREAK → 'GO recommended'; якщо progress < 50% або ≥2 ❌ → 'REBUILD_PLAN recommended'; інакше → 'Review required'), ## Decision (порожнє для людини — decision, rationale, comments)",
    },
    {
      order: 2,
      instruction: "Оновити state.json: status → 'awaiting_human_decision'",
    },
    {
      order: 3,
      instruction: "ЗУПИНИТИСЯ — очікувати рішення людини",
    },
    {
      order: 4,
      instruction: "При наступному запуску: прочитати файл рішення, виконати відповідний перехід",
    },
  ],
  constraints: [
    "Агент НЕ приймає рішення самостійно",
    "Усна команда не замінює файл рішення",
    "Gate Protocol: обов'язкові поля decision/rationale/comments",
  ],
  artifact: {
    registry_key: "gate_decision",
    path_pattern: "control_center/audit/gate_decisions/gate1_decision_{date}.md",
  },
  transitions: [
    { condition: "GO", target: "D1", target_block: "development_cycle" },
    { condition: "REBUILD_PLAN", target: "L8" },
    { condition: "REBUILD_DESCRIPTION", target: "L5", target_block: "discovery" },
    { condition: "KILL", target: "L1", state_updates: { status: "cancelled" } },
  ],
  isolation_required: false,
};

// --- D5: Виконання задач (Development) ---
// Інструменти: std-task-execution (B6), std-issue-management (B3), std-security-scan (B7)
const STEP_D5: StepDefinition = {
  id: "D5",
  block: "development_cycle",
  name: "Виконання задач",
  type: "autonomous",
  role: "programmer",
  purpose: "Послідовне виконання кожної задачі з плану розвитку з JIDOKA та security scan перевірками",
  standards: [],
  preconditions: [
    {
      type: "dir_not_empty",
      path: "control_center/tasks/active/",
      description: "Є задачі у tasks/active/ для виконання",
    },
  ],
  inputs: [
    {
      source: "directory",
      path: "control_center/tasks/active/",
      description: "Задачі для виконання",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/issues/active/",
      description: "Перевірка на наявність issues та security scans після кожної задачі",
      required: false,
    },
  ],
  algorithm: [
    {
      order: 0,
      instruction: "QUEUE INIT: виконати `queue scan` → побудувати чергу задач з tasks/active/.",
    },
    {
      order: 1,
      instruction: "Виконати `queue next` → отримати наступну готову задачу. Виконати `queue start --task <ID>` → позначити як in_progress.",
    },
    {
      order: 2,
      instruction: "Прочитати файл задачі ПОВНІСТЮ. Обов'язкові секції для виконання:",
      substeps: [
        "'Контекст коду' — містить РЕАЛЬНІ сніпети файлів які змінюються + опис трансформації БУЛО→СТАЛО. Виконувати ТОЧНО згідно цих інструкцій.",
        "'Заборони' — список дій які ЗАБОРОНЕНО робити. Порушення будь-якої заборони = невалідне виконання.",
        "'Кроки виконання' — покрокова інструкція з конкретним кодом.",
        "'Acceptance Criteria' — чекліст який КОЖЕН пункт має бути ✅ після виконання.",
        "'Validation Script' — команди для самоперевірки які ОБОВ'ЯЗКОВО запустити ПІСЛЯ виконання.",
      ],
    },
    {
      order: 3,
      instruction: "Виконати задачу згідно 'Кроків виконання' та 'Контексту коду'. Якщо тест падає — виправити КОД (не assertion). Перевіряти відповідність 'Заборонам' на кожному кроці.",
    },
    {
      order: 4,
      instruction: "JIDOKA: при критичному дефекті (J1–J5) → зупинити виконання, створити issue в issues/active/, ескалювати. state.json → jidoka_stops += 1.",
    },
    {
      order: 5,
      instruction: "ОБОВ'ЯЗКОВО запустити 'Validation Script' з файлу задачі. Якщо validation показує FAIL — задача НЕ ЗАВЕРШЕНА, повернутись до кроку 3 і виправити.",
    },
    {
      order: 6,
      instruction: "Після успішної валідації: `queue done --task <ID>`. Перемістити файл задачі в tasks/done/[Plan Name]/. Session Bridge автоматично запустить нову сесію для наступної задачі.",
    },
    {
      order: 7,
      instruction: "ФІНАЛ: коли `queue done` повертає 'Всі задачі плану виконано!' — виконати `complete` для переходу на D6.",
    },
  ],
  constraints: [
    "JIDOKA обов'язкова при критичних дефектах (J1–J5)",
    "Security scan перевірка після кожної задачі",
    "CRITICAL CVE = P0 пріоритет",
    "Виконання issues негайне — перед продовженням наступної задачі",
  ],
  artifact: null,
  transitions: [
    { condition: "Всі задачі виконані, tasks/active/ порожній", target: "D6" },
  ],
  isolation_required: false,
  session_boundary: true,
};

// --- D7: Завершення плану (Development) ---
// Інструмент: std-session-management §4.7 (B1)
const STEP_D7: StepDefinition = {
  id: "D7",
  block: "development_cycle",
  name: "Завершення плану",
  type: "autonomous",
  role: "programmer",
  purpose: "Архівація виконаного плану розвитку: переміщення з plans/active/ до plans/done/",
  standards: [],
  preconditions: [
    {
      type: "dir_empty",
      path: "control_center/tasks/active/",
      description: "Всі задачі виконані та переміщені в tasks/done/[Назва плану]/",
    },
    {
      type: "artifact_registered",
      artifact_key: "plan_completion",
      description: "Plan completion check створено (D6 завершено)",
    },
  ],
  inputs: [
    {
      source: "directory",
      path: "control_center/plans/active/",
      description: "Поточний план для архівації",
      required: true,
    },
    {
      source: "directory",
      path: "control_center/tasks/done/",
      description: "ТІЛЬКИ list_dir — перевірити що папка [Назва плану] існує і не порожня. НЕ читати вміст задач.",
      required: true,
    },
    {
      source: "artifact",
      artifact_key: "plan_completion",
      description: "Plan completion check (D6)",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Перевірити що всі задачі плану переміщені у tasks/done/[Назва плану]/",
    },
    {
      order: 2,
      instruction: "Перемістити план з plans/active/ у plans/done/",
    },
    {
      order: 3,
      instruction: "--- HANSEI (вбудовано з D8) --- Проаналізувати згідно алгоритму HANSEI (std-hansei.md)",
    },
    {
      order: 4,
      instruction: "Проаналізувати: що було заплановано vs що вийшло",
    },
    {
      order: 5,
      instruction: "Визначити задачі що були сформовані погано",
    },
    {
      order: 6,
      instruction: "Визначити кроки що зайняли більше часу ніж очікувалось",
    },
    {
      order: 7,
      instruction: "Сформувати уроки для наступної ітерації",
    },
    {
      order: 8,
      instruction: "Створити артефакт hansei_dev_{date}.md та зареєструвати в state.json → artifacts.hansei",
    },
  ],
  constraints: [
    "Не продовжувати якщо tasks/active/ не порожній",
    "Не продовжувати якщо plan_completion_check не створено",
    "Рефлексія має бути чесною",
  ],
  artifact: {
    registry_key: "hansei",
    path_pattern: "control_center/audit/hansei/hansei_dev_{date}.md",
  },
  transitions: [
    { condition: "План архівовано + HANSEI завершено", target: "D9" },
  ],
  isolation_required: false,
  session_boundary: true,
};

// --- D8: DEPRECATED — merged into D7 (backward compat) ---
const STEP_D8: StepDefinition = {
  id: "D8",
  block: "development_cycle",
  name: "[DEPRECATED → D7] HANSEI — Рефлексія",
  type: "autonomous",
  role: "programmer",
  purpose: "DEPRECATED: HANSEI тепер вбудовано в D7. Цей крок пропускається в BLOCK_SEQUENCES.",
  standards: [],
  preconditions: [
    {
      type: "step_completed",
      step: "D7",
      description: "Plan closure завершено",
    },
  ],
  inputs: [],
  algorithm: [
    {
      order: 1,
      instruction: "DEPRECATED — HANSEI вбудовано в D7. Виконайте complete для переходу до D9.",
    },
  ],
  constraints: [],
  artifact: {
    registry_key: "hansei",
    path_pattern: "control_center/audit/hansei/hansei_dev_{date}.md",
  },
  transitions: [
    { condition: "HANSEI завершено", target: "D9" },
  ],
  isolation_required: false,
};

// --- V3: HANSEI + Висновки валідації ---
// Інструмент: std-hansei (B4)
const STEP_V3: StepDefinition = {
  id: "V3",
  block: "validation_cycle",
  name: "HANSEI + Висновки валідації",
  type: "human_decision",
  role: "devil_advocate",
  purpose: "Аналіз причин провалу аудиту, формування validation_conclusions зі структурованим переліком дефектів та кореневих причин",
  standards: [],
  preconditions: [
    {
      type: "artifact_registered",
      artifact_key: "acceptance_report",
      description: "Acceptance report існує (результат V1)",
    },
  ],
  inputs: [
    {
      source: "artifact",
      artifact_key: "acceptance_report",
      description: "Звіт аудиту (FAIL) для аналізу дефектів",
      required: true,
    },
    {
      source: "state",
      field: "status",
      description: "Поточний стан (V2 = FAIL)",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Проаналізувати згідно алгоритму HANSEI (вбудовано в оркестратор)",
    },
    {
      order: 2,
      instruction: "Проаналізувати причини провалу аудиту на основі acceptance_report",
    },
    {
      order: 3,
      instruction:
        "ДЕТЕКЦІЯ ЗАЦИКЛЕННЯ: Прочитати prev_cycle_artifacts.validation_conclusions (якщо існує). " +
        "Порівняти поточні дефекти з попередніми. Для кожного дефекта визначити: НОВИЙ (вперше), ПОВТОРНИЙ (був у попередньому аудиті і не виправлений), РЕГРЕСІЯ (був виправлений але з'явився знову). " +
        "Якщо дефект ПОВТОРНИЙ і НЕ був у Must Fix попереднього висновку → це ознака structural scope mismatch — зазначити у HANSEI.",
    },
    {
      order: 4,
      instruction: "Створити hansei_audit_{date}.md. Включити секцію '§ Persistent Defects' з переліком дефектів що повторюються 2+ цикли поспіль.",
    },
    {
      order: 5,
      instruction:
        "Створити validation_conclusions_{date}.md зі структурованим переліком дефектів та кореневих причин. " +
        "Обов'язкові секції: 'Must Fix' (блокує PASS), 'Should Fix' (зменшує MAJOR), 'Explicitly Out of Scope' (будуть DEFERRED при наступному V2 — НЕ блокуватимуть PASS). " +
        "Для кожного дефекту в Must Fix: позначити MAJOR_FUNC або MAJOR_DESIGN. " +
        "Умова PASS наступного аудиту: CRITICAL==0, MAJOR_FUNC==0, MAJOR_DESIGN ≤ 5.",
    },
    {
      order: 6,
      instruction: "Зареєструвати шляхи в state.json → artifacts.hansei_audit та artifacts.validation_conclusions",
    },
    {
      order: 7,
      instruction: "Оновити state.json: current_block → 'development_cycle', current_step → 'D1', status → 'awaiting_human_decision'",
    },
    {
      order: 8,
      instruction: "СТОП — не переходити до D1 автоматично, людина заповнює файл рішення",
    },
  ],
  constraints: [
    "cycle_counter.md НЕ скидується — лічильник тільки зростає",
    "Агент не переходить до D1 автоматично",
    "Усна команда не замінює файл рішення",
    "validation_conclusions обмежує scope наступного D3-плану тільки виправленням дефектів",
  ],
  artifact: {
    registry_key: "hansei_audit",
    path_pattern: "control_center/audit/hansei/hansei_audit_{date}.md",
  },
  additional_artifacts: [
    {
      registry_key: "validation_conclusions",
      path_pattern: "control_center/audit/validation_conclusions/validation_conclusions_{date}.md",
    },
  ],
  transitions: [
    { condition: "CONTINUE", target: "D1", target_block: "development_cycle" },
    { condition: "AMEND_SPEC", target: "D1", target_block: "development_cycle" },
    { condition: "KILL", target: "L1", state_updates: { status: "cancelled" } },
  ],
  isolation_required: true,
  isolation_message: "Ти — незалежний аудитор. Аналізуй причини провалу аудиту виключно на підставі acceptance_report.",
  session_boundary: true,
};

// --- E2: ПРОДУКТ ГОТОВИЙ (Terminal Step) ---
const STEP_E2: StepDefinition = {
  id: "E2",
  block: "linear_exit",
  name: "ПРОДУКТ ГОТОВИЙ",
  type: "autonomous",
  role: "notary",
  purpose: "Фінальний термінальний крок — цикл завершено, продукт готовий",
  standards: [],
  preconditions: [
    {
      type: "step_completed",
      step: "E1",
      description: "Release readiness пройшла",
    },
  ],
  inputs: [
    {
      source: "state",
      field: "status",
      description: "Перевірити що E1 = READY",
      required: true,
    },
  ],
  algorithm: [
    {
      order: 1,
      instruction: "Оновити state.json: status → 'completed', current_step → 'E2'",
    },
    {
      order: 2,
      instruction: "Зафіксувати час завершення",
    },
  ],
  constraints: [
    "Це термінальний крок — після E2 подальші кроки неможливі",
  ],
  artifact: null,
  transitions: [],
  isolation_required: false,
};

// =============================================================================
// Step Registry — індекс усіх 34 кроків
// =============================================================================

const STEP_REGISTRY: Record<Step, StepDefinition> = {
  // Discovery (Блок 1)
  L1: STEP_L1,
  L2: STEP_L2,
  L3: STEP_L3,
  L3b: STEP_L3b,
  L4: STEP_L4,
  L5: STEP_L5,
  L6: STEP_L6,
  L7: STEP_L7,

  // Foundation (Блок 2)
  L8: STEP_L8,
  L9: STEP_L9,
  L10: STEP_L10,
  L10b: STEP_L10b,
  L11: STEP_L11,
  L12: STEP_L12,
  L13: STEP_L13,
  GATE1: STEP_GATE1,

  // Development Cycle (Блок 3)
  D1: STEP_D1,
  D2: STEP_D2,
  D3: STEP_D3,
  D4: STEP_D4,
  D5: STEP_D5,
  D6: STEP_D6,
  D7: STEP_D7,
  D8: STEP_D8,
  D9: STEP_D9,

  // Validation (Блок 4)
  V0: STEP_V0,
  V0_5: STEP_V0_5,
  V1: STEP_V1,
  V2: STEP_V2,
  V3: STEP_V3,

  // Security Fix (Блок 5)
  S1: STEP_S1,
  S2: STEP_S2,
  S3: STEP_S3,
  S4: STEP_S4,
  S5: STEP_S5,

  // Linear Exit (Блок 6)
  E1: STEP_E1,
  E2: STEP_E2,
};

// =============================================================================
// Public API
// =============================================================================

/** Отримати StepDefinition за Step ID */
export function getStep(id: Step): StepDefinition {
  const step = STEP_REGISTRY[id];
  if (!step) {
    throw new Error(`Step '${id}' not found in registry`);
  }
  return step;
}

/** Отримати всі StepDefinition для конкретного блоку */
export function getStepsForBlock(block: Block): StepDefinition[] {
  return Object.values(STEP_REGISTRY).filter((s) => s.block === block);
}

/** Отримати всі Step ID */
export function getAllStepIds(): Step[] {
  return Object.keys(STEP_REGISTRY) as Step[];
}

/** Перевірити чи існує крок у реєстрі */
export function hasStep(id: string): id is Step {
  return id in STEP_REGISTRY;
}

/** Повний реєстр (read-only) */
export const REGISTRY = STEP_REGISTRY;
