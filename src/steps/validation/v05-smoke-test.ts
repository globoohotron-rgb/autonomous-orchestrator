// =============================================================================
// V0.5: Smoke Test — UI Interaction Verifier
// Product-agnostic автоматичний тест всіх інтерактивних елементів.
//
// Запускає Playwright headless browser, знаходить ВСІ кнопки/лінки/форми,
// клікає кожен, перевіряє реакцію (network request, navigation, DOM change).
// Результат: smoke_test_{date}.md зі списком живих/мертвих елементів.
//
// Verdict:
//   SMOKE_PASS  — всі елементи реагують
//   SMOKE_WARN  — є мертві лінки або console warnings
//   SMOKE_FAIL  — є мертві кнопки або JS errors → блокує V1
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
  InputReference,
} from "../../types";

// =============================================================================
// PRECONDITIONS
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "state_field",
    field: "isolation_mode",
    expected_value: true,
    description:
      "P1: Isolation Mode активний (V-block). Smoke test виконується незалежно.",
  },
  {
    type: "artifact_registered",
    artifact_key: "ui_review",
    description:
      "P2: UI Review (V0) завершено — є baseline перед smoke test.",
  },
];

// =============================================================================
// INPUTS
// =============================================================================

const INPUTS: InputReference[] = [
  {
    source: "artifact",
    artifact_key: "ui_review",
    description: "UI Review результат — знати які сторінки очікуються",
    required: true,
  },
  {
    source: "state",
    field: "current_block",
    description: "Підтвердити що ми у validation_cycle",
    required: true,
  },
];

// =============================================================================
// ALGORITHM
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Перевірити що Docker сервіси запущені (docker ps). Якщо app контейнер не running — запустити docker-compose up -d. Визначити APP_URL (з .env або docker-compose ports).",
    substeps: [
      "docker ps → знайти контейнер app → визначити порт",
      "Якщо не запущений: docker-compose up -d && sleep 15",
      "curl APP_URL → переконатись що 200 OK",
    ],
  },
  {
    order: 2,
    instruction:
      "Встановити Playwright якщо ще не встановлений: npx playwright install chromium --with-deps",
    substeps: [
      "Перевірити чи є node_modules/playwright у control_center/",
      "Якщо ні: Set-Location control_center; npm install playwright",
      "npx playwright install chromium",
    ],
  },
  {
    order: 3,
    instruction:
      "Запустити smoke test: Set-Location control_center; npx tsx smoke-test.ts APP_URL",
    substeps: [
      "Скрипт автоматично знаходить всі сторінки (рекурсивний обхід <a href>)",
      "На кожній сторінці знаходить button, a, input[submit], [role=button], [onclick]",
      "Клікає кожен елемент і перевіряє реакцію: network request, navigation, DOM mutation",
      "Генерує smoke_test_{date}.md та smoke_test_{date}.json",
    ],
  },
  {
    order: 4,
    instruction:
      "B2B Flow Test (якщо project_description містить B2B Model): запустити додаткові сценарії поверх product-agnostic тесту.",
    substeps: [
      "Flow 1 — Registration → Onboarding → First Value:",
      "  Знайти /register або /signup → заповнити форму → submit → перевірити redirect",
      "  Шукати onboarding wizard/checklist → пройти перший крок → перевірити progress",
      "  Дістатись до основного функціоналу → перевірити що не empty state",
      "Flow 2 — Billing/Upgrade:",
      "  Знайти Settings/Billing в навігації → перевірити що сторінка доступна",
      "  Знайти 'Upgrade' або 'Plan' CTA → клікнути → перевірити реакцію (redirect або modal)",
      "Flow 3 — Team Invite:",
      "  Знайти Settings/Team або /team → перевірити що сторінка доступна",
      "  Знайти 'Invite' CTA → клікнути → перевірити реакцію (form або modal)",
      "Flow 4 — Data Export:",
      "  Знайти 'Export' або 'Download' CTA в основних списках → перевірити реакцію",
      "Кожен flow: якщо елемент НЕ знайдено → WARN (missing B2B feature)",
      "Кожен flow: якщо елемент знайдено але dead → FAIL (broken B2B feature)",
    ],
    contract_check:
      "B2B flows тестуються ПІСЛЯ product-agnostic smoke. Результати додаються до загального звіту.",
  },
  {
    order: 5,
    instruction:
      "Прочитати згенерований звіт. Класифікувати результат: SMOKE_PASS / SMOKE_WARN / SMOKE_FAIL. Зареєструвати артефакт smoke_test у state.json.",
    substeps: [
      "SMOKE_PASS: всі елементи alive/navigation/skipped → V1 дозволено",
      "SMOKE_WARN: є dead links або console warnings → V1 дозволено з приміткою",
      "SMOKE_FAIL: є dead buttons або JS errors → V1 заблоковано, потрібен fix cycle",
      "B2B Flow Results:",
      "  — Всі 4 flows PASS або WARN (missing) → B2B не впливає на verdict",
      "  — Будь-який flow FAIL (broken) → додається до dead buttons → може стати SMOKE_FAIL",
      "  — ≥3 flows WARN (missing) → додати note: 'B2B features largely missing'",
    ],
    contract_check:
      "SMOKE_FAIL з dead buttons блокує V1. Мертва кнопка = критичний UX дефект.",
  },
  {
    order: 6,
    instruction:
      "Записати smoke_test_{date}.md у control_center/audit/smoke_tests/. Зареєструвати шлях у state.json → artifacts.smoke_test.",
  },
];

// =============================================================================
// STEP DEFINITION
// =============================================================================

export const STEP_V0_5: StepDefinition = {
  id: "V0_5",
  block: "validation_cycle",
  name: "Smoke Test — UI Interaction Verifier",
  type: "autonomous",
  role: "notary",
  purpose:
    "Автоматична перевірка що всі інтерактивні елементи продукту реагують на клік. " +
    "Product-agnostic: знаходить кнопки заново кожен раз. Мертва кнопка = FAIL.",
  standards: [],
  preconditions: PRECONDITIONS,
  inputs: INPUTS,
  algorithm: ALGORITHM,
  constraints: [
    "НЕ хардкодити жодних селекторів конкретного продукту — скрипт product-agnostic",
    "НЕ модифікувати продукт під час тесту — тільки читання/клік",
    "Timeout per element: 5 секунд. Timeout per page: 10 секунд",
    "Max pages: 30. Max elements per page: 200 (safety limits)",
    "External links (інший origin) — skip, не тестувати",
    "Disabled/hidden елементи — skip, не вважати dead",
    "SMOKE_FAIL з мертвими кнопками блокує V1",
    "B2B flow тести використовують heuristic selectors (text content 'Invite', 'Export', 'Upgrade', 'Settings', 'Team') — product-agnostic підхід зберігається",
  ],
  artifact: {
    registry_key: "smoke_test",
    path_pattern: "control_center/audit/smoke_tests/smoke_test_{date}.md",
  },
  transitions: [
    {
      condition: "Smoke test завершено (PASS або WARN) → V1",
      target: "V1",
    },
  ],
  isolation_required: true,
  isolation_message:
    "Smoke test виконується автоматично. Не втручайся в процес. Оцінюй тільки результати.",
  session_boundary: false, // Lightweight step — no need for fresh session
};
