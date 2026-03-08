// =============================================================================
// S-Block: Security Fix Cycle (S1–S5) — Ізольований блок усунення CVE
// Конвертовано з: control_center/standards/system/std-security-fix-cycle.md
// =============================================================================

import type {
  StepDefinition,
  PreconditionCheck,
  AlgorithmStep,
  InputReference,
  ArtifactRotation,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для S-Block)
// =============================================================================

/** Severity рівні CVE */
type CVESeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/** Тип виправлення CVE */
type FixType =
  | "base_image_update"
  | "npm_update"
  | "apk_upgrade"
  | "config_change";

/** Одна CVE запис */
interface CVEEntry {
  cve_id: string;
  package_name: string;
  current_version: string;
  fix_version: string;
  target_file: string;
  fix_type: FixType;
  severity: CVESeverity;
}

/** Результат S-блоку (зведення для S5) */
interface SBlockResult {
  scan_file: string;
  tasks_executed: number;
  cve_critical: number;
  cve_high: number;
  changes_summary: string[];
  build_verified: boolean;
  audit_passed: boolean;
  decision_file_path: string;
}

/** Параметри шаблону задачі */
interface TaskTemplateParams {
  task_number: number;
  short_description: string;
  scan_file: string;
  cve_entries: CVEEntry[];
  actions: string[];
}

/** Параметри шаблону рішення */
interface DecisionTemplateParams {
  date: string;
  scan_file: string;
  tasks_executed: number;
  cve_critical: number;
  cve_high: number;
  changes_summary: string[];
}

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 7 перевірок)
// =============================================================================

const PRECONDITIONS_S1: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/issues/active/security_scan_*.md",
    description: "P1: Є файл security_scan_*.md у issues/active/ (не порожній)",
  },
  {
    type: "state_field",
    field: "status",
    expected_value: "in_progress",
    description:
      "P2: У файлі є хоча б одна CRITICAL або HIGH вразливість",
  },
  {
    type: "dir_empty",
    path: "control_center/tasks/active",
    description: "P3: tasks/active/ порожній — інший блок незавершений",
  },
  {
    type: "dir_empty",
    path: "control_center/plans/active",
    description: "P4: plans/active/ порожній — інший блок незавершений",
  },
  {
    type: "state_field",
    field: "current_step",
    expected_value: "S1",
    description:
      "P5: Стандарт зчитаний у поточній сесії (S1) — робота по пам'яті заборонена",
  },
];

const PRECONDITIONS_S2: PreconditionCheck[] = [
  {
    type: "step_completed",
    step: "S1",
    description: "S1 завершено — CVE список сформовано",
  },
  {
    type: "state_field",
    field: "status",
    expected_value: "in_progress",
    description:
      "P6: Кожна задача посилається на CVE ID — не створювати задачі без CVE обґрунтування",
  },
];

const PRECONDITIONS_S3: PreconditionCheck[] = [
  {
    type: "step_completed",
    step: "S2",
    description: "S2 завершено — задачі створені",
  },
  {
    type: "state_field",
    field: "status",
    expected_value: "in_progress",
    description:
      "P7: Зміни не торкаються final_view/, docs/ — незмінні файли",
  },
];

const PRECONDITIONS_S4: PreconditionCheck[] = [
  {
    type: "step_completed",
    step: "S3",
    description: "S3 завершено — задачі виконані",
  },
];

const PRECONDITIONS_S5: PreconditionCheck[] = [
  {
    type: "step_completed",
    step: "S4",
    description: "S4 завершено — аудит пройдений",
  },
  {
    type: "dir_empty",
    path: "control_center/tasks/active",
    description: "Усі задачі переміщені в tasks/done/",
  },
];

// =============================================================================
// 3. INPUTS
// =============================================================================

const INPUTS_S1: InputReference[] = [
  {
    source: "file",
    path: "control_center/issues/active/security_scan_*.md",
    description: "Список CVE для усунення",
    required: true,
  },
];

const INPUTS_S3: InputReference[] = [
  {
    source: "directory",
    path: "control_center/tasks/active",
    description: "Задачі для виконання (створені на S2)",
    required: true,
  },
  {
    source: "file",
    path: "server/Dockerfile",
    description: "Dockerfile для виправлення base image",
    required: false,
  },
  {
    source: "file",
    path: "app/Dockerfile",
    description: "Dockerfile для виправлення base image",
    required: false,
  },
  {
    source: "file",
    path: "server/package.json",
    description: "Файл для виправлення npm-залежностей",
    required: false,
  },
  {
    source: "file",
    path: "app/package.json",
    description: "Файл для виправлення npm-залежностей",
    required: false,
  },
  {
    source: "file",
    path: "docker-compose.yml",
    description: "Файл для виправлення конфігурацій",
    required: false,
  },
];

const INPUTS_S4: InputReference[] = [
  {
    source: "file",
    path: "control_center/issues/active/security_scan_*.md",
    description: "Оригінальний scan-файл для порівняння покриття CVE",
    required: true,
  },
  {
    source: "directory",
    path: "control_center/tasks/done",
    description: "Виконані задачі для перевірки покриття",
    required: true,
  },
];

const INPUTS_S5: InputReference[] = [
  {
    source: "artifact",
    artifact_key: "security_scan",
    description: "Scan file для переміщення в issues/done/",
    required: true,
  },
  {
    source: "directory",
    path: "control_center/tasks/active",
    description: "Перевірка що порожній (всі задачі виконані)",
    required: true,
  },
];

// =============================================================================
// 4. ALGORITHMS
// =============================================================================

const ALGORITHM_S1: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Зчитати алгоритм security fix cycle з оркестратора (POKA-YOKE: робота по пам'яті заборонена).",
  },
  {
    order: 2,
    instruction:
      "Прочитати файл security_scan_*.md з issues/active/ повністю.",
  },
  {
    order: 3,
    instruction: "Витягнути всі CRITICAL та HIGH CVE.",
  },
  {
    order: 4,
    instruction:
      "Для кожної CVE визначити: пакет + поточна версія, Fix Version, файл для зміни, тип виправлення (оновлення base image / npm update / apk upgrade / конфіг).",
    substeps: [
      "Пакет + поточна версія",
      "Версія що виправляє (Fix Version)",
      "Файл для зміни (server/Dockerfile, app/Dockerfile, server/package.json, app/package.json, docker-compose.yml, тощо)",
      "Тип виправлення (оновлення base image / npm update / apk upgrade / конфіг)",
    ],
  },
  {
    order: 5,
    instruction:
      "Оновити state.json: current_block → 'security_fix_cycle', current_step → 'S1', status → 'in_progress', artifacts.security_scan → шлях до файлу security_scan_*.md.",
  },
  {
    order: 6,
    instruction:
      "Ротація (при повторному S-блоці): якщо artifacts.security_scan або artifacts.s_block_decision вже не null — скопіювати їх у prev_cycle_artifacts, потім встановити в null перед записом нового шляху.",
  },
];

const ALGORITHM_S2: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Згрупувати CVE за логічними одиницями роботи (за файлом змін або за типом виправлення).",
  },
  {
    order: 2,
    instruction:
      "Для кожної групи створити файл задачі в tasks/active/ за шаблоном S[N]_security_fix_DD.MM.YY-HH-MM.md.",
    substeps: [
      "Кожна задача посилається на мінімум один CVE ID",
      "Немає задач без CVE-обґрунтування",
      "tasks/active/ було порожнім перед створенням задач",
    ],
  },
  {
    order: 3,
    instruction: "Оновити state.json: current_step → 'S2'.",
  },
];

const ALGORITHM_S3: AlgorithmStep[] = [
  {
    order: 1,
    instruction: "Прочитати задачу з tasks/active/.",
  },
  {
    order: 2,
    instruction:
      "Виконати дії зазначені в задачі. Мінімальні зміни — тільки те, що потрібно для усунення CVE.",
    substeps: [
      "Вразливий base image → оновити FROM node:X-alpine → безпечну версію у Dockerfile",
      "Системні пакети в образі → додати/оновити RUN apk upgrade --no-cache (Alpine)",
      "npm-залежність → npm install <package>@<safe_version> або npm update <package>",
      "Відкритий порт / config → виправити docker-compose.yml або Dockerfile",
    ],
  },
  {
    order: 3,
    instruction:
      "Позначити acceptance criteria як виконані. Перемістити задачу з tasks/active/ у tasks/done/[Назва групи]/.",
  },
  {
    order: 4,
    instruction: "Повторити для наступної задачі.",
  },
  {
    order: 5,
    instruction:
      "S3a Build Verification: якщо terminal доступний — виконати docker compose build. Якщо SUCCESS — продовжити до S4. Якщо FAIL — створити додаткову задачу для виправлення збірки, виконати її, повторити build. Якщо terminal недоступний — записати [BUILD NOT VERIFIED] у S4 аудит.",
    substeps: [
      "Terminal доступний + build SUCCESS → продовжити до S4",
      "Terminal доступний + build FAIL → додаткова задача → виправити → повторити build",
      "Terminal недоступний → записати [BUILD NOT VERIFIED] у S4 аудит, продовжити до S4",
    ],
  },
  {
    order: 6,
    instruction: "Оновити state.json: current_step → 'S3'.",
  },
];

const ALGORITHM_S4: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Перечитати оригінальний security_scan_*.md з issues/active/.",
  },
  {
    order: 2,
    instruction:
      "Для кожної CRITICAL та HIGH CVE перевірити: чи існує виконана задача що адресує цю CVE? Чи фактично внесені зміни у відповідний файл?",
    substeps: [
      "Чи існує виконана задача що адресує цю CVE?",
      "Чи фактично внесені зміни у відповідний файл?",
    ],
  },
  {
    order: 3,
    instruction:
      "Якщо всі CVE покриті — перейти до S5.",
  },
  {
    order: 4,
    instruction:
      "Якщо є непокриті CVE: створити додаткову задачу в tasks/active/ для непокритих CVE, виконати її (як на S3), перемістити в tasks/done/, повторити аудит одноразово (без нескінченного циклу).",
    substeps: [
      "Створити додаткову задачу в tasks/active/ для непокритих CVE",
      "Виконати задачу (як на S3)",
      "Перемістити в tasks/done/",
      "Повторити аудит одноразово — без нескінченного циклу",
    ],
  },
  {
    order: 5,
    instruction: "Оновити state.json: current_step → 'S4'.",
  },
];

const ALGORITHM_S5: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "5.1 Перенос документації: переконатися що tasks/active/ порожній. Перемістити security_scan_*.md з issues/active/ → issues/done/.",
    substeps: [
      "Переконатися що tasks/active/ порожній (всі задачі в tasks/done/)",
      "Перемістити security_scan_*.md з issues/active/ → issues/done/",
    ],
  },
  {
    order: 2,
    instruction:
      "5.2 Перевірка артефактів: усі задачі переміщені в tasks/done/, issue-файл переміщено в issues/done/, жодних 'висячих' файлів в active/.",
    substeps: [
      "Всі задачі переміщені в tasks/done/",
      "Issue-файл переміщено в issues/done/",
      "Жодних 'висячих' файлів в active/",
    ],
  },
  {
    order: 3,
    instruction:
      "5.3 Оновити state.json: current_block → 'security_fix_cycle', current_step → 'S5', status → 'awaiting_human_decision', last_artifact → шлях до файлу рішення, artifacts.s_block_decision → шлях до файлу рішення.",
  },
  {
    order: 4,
    instruction:
      "5.4 Створити файл рішення: audit/gate_decisions/s_block_decision_DD.MM.YY-HH-MM.md за шаблоном. Варіанти: REPEAT / VALIDATE / STOP.",
  },
  {
    order: 5,
    instruction:
      "5.5 Зупинка: агент зупиняється і не продовжує. Чекає рішення людини.",
  },
];

// =============================================================================
// 5. CONSTRAINTS (§8 — 6 обмежень)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено запускати S-блок під час D-циклу. Завершити D-цикл, потім запустити.",
  "Заборонено вносити зміни бізнес-логіки — тільки CVE-фікси.",
  "Заборонено додавати нові залежності, не пов'язані з CVE.",
  "Заборонено змінювати final_view/, docs/.",
  "Заборонено скидати iteration або cycle_counter D-блоку — S-блок повністю ізольований.",
  "Заборонено продовжувати після S5 без рішення людини.",
];

// =============================================================================
// 6. S-Block Rotation (при повторному S-блоці — S5 REPEAT → S1)
// =============================================================================

const S_BLOCK_ROTATION: ArtifactRotation = {
  description:
    "При повторному S-блоці: security_scan та s_block_decision копіюються в prev_cycle_artifacts, потім обнулюються.",
  archive_keys: [],
  copy_to_prev_keys: ["security_scan", "s_block_decision"],
  nullify_keys: ["security_scan", "s_block_decision"],
};

// =============================================================================
// 7. Step Definitions (S1–S5)
// =============================================================================

// --- S1: Зчитати issue та стандарт ---

export const STEP_S1: StepDefinition = {
  id: "S1",
  block: "security_fix_cycle",
  name: "Зчитати issue та стандарт",
  type: "autonomous",
  role: "surgeon",
  purpose:
    "Прочитати файл сканування з issues/active/ та стандарт std-security-fix-cycle.md, витягнути всі CRITICAL та HIGH CVE.",
  standards: [],
  preconditions: PRECONDITIONS_S1,
  inputs: INPUTS_S1,
  algorithm: ALGORITHM_S1,
  constraints: CONSTRAINTS,
  artifact: null, // Внутрішня модель (список CVE → дії), не окремий файл
  transitions: [
    { condition: "CVE список сформовано", target: "S2" },
  ],
  isolation_required: false,
  rotation: S_BLOCK_ROTATION,
};

// --- S2: Сформувати задачі ---

export const STEP_S2: StepDefinition = {
  id: "S2",
  block: "security_fix_cycle",
  name: "Сформувати задачі",
  type: "autonomous",
  role: "surgeon",
  purpose:
    "На основі аналізу з S1 створити задачі-файли у tasks/active/. Нові функції заборонені — тільки CVE-фікси.",
  standards: [],
  preconditions: PRECONDITIONS_S2,
  inputs: [],
  algorithm: ALGORITHM_S2,
  constraints: CONSTRAINTS,
  artifact: null, // Задачі створюються у tasks/active/, не реєструються окремо
  transitions: [
    { condition: "Задачі створені у tasks/active/", target: "S3" },
  ],
  isolation_required: false,
};

// --- S3: Виконання задач ---

export const STEP_S3: StepDefinition = {
  id: "S3",
  block: "security_fix_cycle",
  name: "Виконання задач",
  type: "autonomous",
  role: "surgeon",
  purpose:
    "Послідовне виконання кожної задачі з tasks/active/. Мінімальні зміни — тільки те, що потрібно для усунення CVE.",
  standards: [],
  preconditions: PRECONDITIONS_S3,
  inputs: INPUTS_S3,
  algorithm: ALGORITHM_S3,
  constraints: CONSTRAINTS,
  artifact: null, // Задачі переміщуються в tasks/done/
  transitions: [
    { condition: "Усі задачі виконані + Build verification пройдений", target: "S4" },
  ],
  isolation_required: false,
  session_boundary: true,
};

// --- S4: Внутрішній аудит ---

export const STEP_S4: StepDefinition = {
  id: "S4",
  block: "security_fix_cycle",
  name: "Внутрішній аудит",
  type: "autonomous",
  role: "surgeon",
  purpose:
    "Перевірити що кожна проблема з issue-файлу покрита виконаною задачею. Якщо є пропуски — дофіксити.",
  standards: [],
  preconditions: PRECONDITIONS_S4,
  inputs: INPUTS_S4,
  algorithm: ALGORITHM_S4,
  constraints: CONSTRAINTS,
  artifact: null, // Внутрішній звіт аудиту, не окремий файл
  transitions: [
    { condition: "Усі CVE покриті, аудит пройдений", target: "S5" },
  ],
  isolation_required: false,
};

// --- S5: Закриття та рішення людини ---

export const STEP_S5: StepDefinition = {
  id: "S5",
  block: "security_fix_cycle",
  name: "Закриття та рішення людини",
  type: "autonomous",
  role: "surgeon",
  purpose:
    "Перенос документації, перевірка артефактів, оновлення state.json, формування файлу рішення для людини. Зупинка.",
  standards: [],
  preconditions: PRECONDITIONS_S5,
  inputs: INPUTS_S5,
  algorithm: ALGORITHM_S5,
  constraints: CONSTRAINTS,
  artifact: {
    registry_key: "s_block_decision",
    path_pattern:
      "control_center/audit/gate_decisions/s_block_decision_{date}.md",
    template_id: "s_block_decision",
  },
  transitions: [
    {
      condition: "Рішення REPEAT — є залишкові CRITICAL/HIGH CVE",
      target: "S1",
      target_block: "security_fix_cycle",
      state_updates: {
        status: "in_progress",
      } as any,
    },
    {
      condition: "Рішення VALIDATE — 0 CRITICAL, 0 HIGH → V-блок",
      target: "V1",
      target_block: "validation_cycle",
      state_updates: {
        status: "in_progress",
      } as any,
    },
    {
      condition: "Рішення STOP — повернення до D-блоку або пауза",
      target: "D1",
      target_block: "development_cycle",
      state_updates: {
        status: "in_progress",
      } as any,
    },
  ],
  isolation_required: false,
};

// =============================================================================
// 8. Validate Result (§6 Критерії прийнятності — 8 перевірок)
// =============================================================================

function validateResult(result: SBlockResult): ValidationOutcome {
  const issues: string[] = [];

  // §6.1: Стандарт зчитаний повністю на S1
  // (перевіряється у runtime через preconditions S1)

  // §6.2: Усі CRITICAL та HIGH CVE з scan-файлу покриті задачами
  if (result.cve_critical + result.cve_high > 0 && result.tasks_executed === 0) {
    issues.push("CVE знайдені але жодна задача не виконана");
  }

  // §6.3: Кожна задача посилається на конкретний CVE ID
  // (перевіряється на S2 через preconditions)

  // §6.4: Усі задачі виконані та переміщені в tasks/done/
  if (result.tasks_executed === 0) {
    issues.push("Жодна задача не виконана");
  }

  // §6.5: S4 аудит підтвердив повне покриття CVE
  if (!result.audit_passed) {
    issues.push("S4 аудит не підтвердив повне покриття CVE");
  }

  // §6.6: Issue-файл переміщено в issues/done/
  if (!result.scan_file) {
    issues.push("Scan file не вказаний");
  }

  // §6.7: Файл рішення створений для людини
  if (!result.decision_file_path) {
    issues.push("Файл рішення не створений");
  }

  // §6.8: state.json оновлений до awaiting_human_decision
  // (перевіряється оркестратором)

  return { valid: issues.length === 0, issues };
}

// =============================================================================
// 9. Template: Security Fix Task (§A)
// =============================================================================

function generateTaskTemplate(params: TaskTemplateParams): string {
  const cveRows = params.cve_entries
    .map(
      (cve) =>
        `| ${cve.cve_id} | ${cve.package_name} | ${cve.current_version} | ${cve.fix_version} | ${cve.target_file} |`
    )
    .join("\n");

  const actions = params.actions
    .map((action, i) => `${i + 1}. ${action}`)
    .join("\n");

  const criteria = params.cve_entries
    .map((cve) => `- [ ] ${cve.cve_id} усунено (пакет оновлено до safe version)`)
    .join("\n");

  return `# S${params.task_number} — ${params.short_description}

**Блок:** S (Security Fix Cycle)
**Джерело:** \`${params.scan_file}\`

## CVE що адресуються

| CVE ID | Пакет | Поточна версія | Fix Version | Файл |
|--------|-------|----------------|-------------|------|
${cveRows}

## Дії
${actions}

## Acceptance Criteria
${criteria}
- [ ] \`docker compose build\` не зламано (якщо перевірка доступна)

## Заборонено
- Зміни бізнес-логіки
- Нові залежності не пов'язані з CVE
- Зміни \`final_view/\`, \`docs/\`
`;
}

// =============================================================================
// 10. Template: S-Block Decision (§A)
// =============================================================================

function generateDecisionTemplate(params: DecisionTemplateParams): string {
  const changesList = params.changes_summary
    .map((change) => `- ${change}`)
    .join("\n");

  return `# S-Block Decision — ${params.date}

**Scan file:** \`${params.scan_file}\`
**Tasks executed:** ${params.tasks_executed}
**CVE addressed:** ${params.cve_critical} CRITICAL, ${params.cve_high} HIGH

## Підсумок виконаних змін
${changesList}

## Наступний крок (рішення людини)

> Людина: запустіть \`.\scan-docker.ps1\` для повторного сканування.
> На основі результатів оберіть рішення:

decision:
rationale:
comments:

## Варіанти рішення
- **REPEAT** — є залишкові CRITICAL/HIGH CVE → людина створює новий \`security_scan_*.md\` в \`issues/active/\` → агент запускає S-блок повторно
- **VALIDATE** — 0 CRITICAL, 0 HIGH → перехід до V-блоку (валідація)
- **STOP** — зупинка (повернення до D-блоку або пауза)
`;
}

// =============================================================================
// 11. Edge Cases (§4, §8 — взаємодія з іншими блоками)
// =============================================================================

const EDGE_CASES: string[] = [
  "S-блок перед D-циклом: після STOP → D1 стартує чисто",
  "S-блок між D-циклами: після STOP → повернення до D1",
  "S-блок під час D-циклу: ЗАБОРОНЕНО",
  "CVE знайдено під час D5: D5 адресує CVE inline (std-security-scan.md), не запускає S-блок",
  "S3a Build FAIL: створити додаткову задачу для виправлення збірки, виконати, повторити build",
  "S3a Terminal недоступний: записати [BUILD NOT VERIFIED] у S4 аудит, продовжити до S4",
  "S4 непокриті CVE: створити додаткову задачу, виконати, повторити аудит одноразово",
];

// =============================================================================
// 12. Exports
// =============================================================================

export {
  PRECONDITIONS_S1,
  PRECONDITIONS_S2,
  PRECONDITIONS_S3,
  PRECONDITIONS_S4,
  PRECONDITIONS_S5,
  CONSTRAINTS,
  S_BLOCK_ROTATION,
  EDGE_CASES,
  validateResult,
  generateTaskTemplate,
  generateDecisionTemplate,
};
