// =============================================================================
// Security Scan — обробка результатів Docker security scan (Trivy)
// Конвертовано з: control_center/standards/system/std-security-scan.md
// Інструмент: використовується кроком D5 (обробка scan результатів)
// =============================================================================

import type {
  SystemState,
  PreconditionCheck,
  AlgorithmStep,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для security scan)
// =============================================================================

/** Severity рівень CVE з Trivy */
type CVESeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/** Пріоритет у плані відповідно до severity */
type PlanPriority = "P0" | "P1" | "known_limitation";

/** Тип вразливості (§4.3) */
type VulnerabilityType =
  | "base_image"       // Вразливий base image (напр. node:18-alpine)
  | "npm_dependency"   // Вразлива npm-залежність
  | "os_package"       // Вразлива системна залежність в образі
  | "config";          // Відкритий порт / конфігурація

/** Де знаходиться вразливість */
type VulnerabilityLocation =
  | "server/Dockerfile"
  | "app/Dockerfile"
  | "server/package.json"
  | "app/package.json"
  | "docker-compose.yml"
  | string;

/** Одна CVE запис з scan-файлу (§4.1) */
interface CVEEntry {
  /** CVE ідентифікатор, напр. CVE-2024-XXXX */
  cve_id: string;
  /** Пакет з вразливістю */
  package_name: string;
  /** Поточна версія пакету */
  current_version: string;
  /** Версія що виправляє (з Trivy, або null якщо невідома) */
  fix_version: string | null;
  /** Severity з scan-файлу — агент НЕ змінює класифікацію Trivy */
  severity: CVESeverity;
  /** Де знаходиться вразливість */
  location: VulnerabilityLocation;
}

/** Класифікована CVE з пріоритетом у плані (§4.2) */
interface ClassifiedCVE extends CVEEntry {
  /** Пріоритет у плані */
  priority: PlanPriority;
  /** Тип виправлення */
  fix_type: VulnerabilityType;
  /** Конкретне виправлення (§4.3) */
  fix_action: string;
  /** Блокує перехід до V1? CRITICAL > 0 → блокує */
  blocks_v1: boolean;
}

/** Результат аналізу scan-файлу (§4.1–4.2) */
interface ScanAnalysis {
  /** Шлях до scan-файлу */
  scan_file_path: string;
  /** Дата сканування */
  scan_date: string;
  /** Усі знайдені CVE */
  all_cves: CVEEntry[];
  /** Статистика по severity */
  stats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

/** Рекомендація щодо обробки (§4.4, §5) */
type RecommendationType =
  | "include_in_d_plan"   // CVE-фікси включити в D-план (D3)
  | "recommend_s_block"   // Рекомендувати запуск S-блоку
  | "no_action";          // Немає CRITICAL/HIGH — лише документація

/** Вхід для execute() */
interface SecurityScanInput {
  state: SystemState;
  /** Фаза обробки */
  phase: "read" | "classify" | "plan" | "full";
  /** Вміст scan-файлу (raw markdown) */
  scan_file_content?: string;
  /** Шлях до scan-файлу */
  scan_file_path?: string;
  /** Дата сканування (з заголовка файлу) */
  scan_date?: string;
  /** Вже розпарсені CVE (для фази classify, якщо read вже зроблено) */
  parsed_cves?: CVEEntry[];
}

/** Результат execute() */
interface SecurityScanResult {
  success: boolean;
  /** Фаза що була виконана */
  phase: SecurityScanInput["phase"];
  /** Аналіз scan-файлу */
  analysis: ScanAnalysis | null;
  /** Класифіковані CVE з пріоритетами */
  classified_cves: ClassifiedCVE[];
  /** Рекомендація */
  recommendation: RecommendationType;
  /** Повідомлення про результат */
  message: string;
  /** Чи блокує перехід до V1 (CRITICAL > 0) */
  blocks_v1: boolean;
  /** Помилка (якщо виникла) */
  error?: string;
}

/** Результат валідації */
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
    path: "control_center/issues/active/security_scan_*.md",
    description:
      "P1: Файл security_scan_*.md присутній в issues/active/. Якщо відсутній — немає вхідних даних, агент не обробляє CVE.",
  },
  {
    type: "state_field",
    field: "status",
    expected_value: "in_progress",
    description:
      "P2: Файл не порожній, містить секції CRITICAL та/або HIGH. Якщо порожній — немає що фіксити.",
  },
];

// =============================================================================
// 3. ALGORITHM (§4 — 4 кроки)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  {
    order: 1,
    instruction:
      "Читання scan-файлу: при виявленні security_scan_*.md у issues/active/ — прочитати файл повністю.",
    substeps: [
      "Знайти файл security_scan_*.md у issues/active/",
      "Прочитати файл повністю (дослівно, без припущень)",
      "Витягти всі CVE записи з таблиць CRITICAL та HIGH",
      "Зафіксувати статистику: кількість CRITICAL, HIGH, MEDIUM, LOW",
    ],
  },
  {
    order: 2,
    instruction:
      "Класифікація та пріоритизація: CRITICAL → P0 (блокує V1), HIGH → P1 (не блокує), MEDIUM/LOW → known_limitations.",
    substeps: [
      "CRITICAL → fix у поточному або наступному циклі як P0; блокує перехід до V1 якщо > 0",
      "HIGH → fix у наступному циклі як P1; не блокує, але включається в план",
      "MEDIUM/LOW → документуються як known_limitations; не включаються автоматично в план",
      "Severity береться з файлу — агент НЕ змінює класифікацію Trivy",
    ],
  },
  {
    order: 3,
    instruction:
      "Визначити тип виправлення для кожної CVE залежно від типу вразливості.",
    substeps: [
      "Вразливий base image (напр. node:18-alpine) → оновити до node:20-alpine або node:lts-alpine у Dockerfile",
      "Вразлива npm-залежність → npm update <package> або npm install <package>@<safe_version>",
      "Вразлива система в образі → оновити base image або додати RUN apk upgrade --no-cache",
      "Відкритий порт / конфігурація → виправити docker-compose.yml або Dockerfile",
    ],
  },
  {
    order: 4,
    instruction:
      "Формування плану: при плануванні (D3) якщо security issue присутній — перший або другий етап плану = Security Fix.",
    substeps: [
      "Перший або другий етап плану = Security Fix (усунення CRITICAL/HIGH CVE)",
      "План має включати: назву CVE, пакет, версію що виправляє, конкретний файл для зміни",
      "Після виправлення людина повторно запускає сканування → видаляє або переміщує issue до issues/done/",
      "Альтернатива: замість включення CVE в D-план, людина може запустити S-блок (std-security-fix-cycle.md)",
    ],
  },
];

// =============================================================================
// 4. CONSTRAINTS (§8 — 4 обмеження)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Агент не запускає сканування самостійно — тільки людина.",
  "Агент не видаляє issue — тільки переміщує до done/ після підтвердження виправлення.",
  "Сканування рекомендується проводити: після кожного оновлення залежностей, перед кожним V-блоком.",
  "Для цільового усунення CVE поза D-блоком — використовувати S-блок (std-security-fix-cycle.md).",
];

// =============================================================================
// 5. EDGE_CASES
// =============================================================================

const EDGE_CASES: string[] = [
  "Scan-файл порожній або без CRITICAL/HIGH секцій → no_action, тільки документація known_limitations.",
  "Fix Version невідома (null) → не припускати версію, зафіксувати як 'unknown fix version', ескалювати до людини.",
  "Декілька scan-файлів в issues/active/ → обробляти найновіший (за датою у назві файлу).",
  "CRITICAL CVE виявлена на етапі V1 → JIDOKA блокування переходу. Повернення до D-блоку або запуск S-блоку.",
  "CVE вже виправлена в поточному циклі → перевірити fix_version в пакетах. Якщо відповідає — пропустити.",
];

// =============================================================================
// 6. Severity → Priority mapping (§4.2)
// =============================================================================

/** Маппінг severity → priority + plan behavior */
const SEVERITY_MAP: Record<CVESeverity, { priority: PlanPriority; blocks_v1: boolean; auto_include_in_plan: boolean }> = {
  CRITICAL: { priority: "P0", blocks_v1: true, auto_include_in_plan: true },
  HIGH:     { priority: "P1", blocks_v1: false, auto_include_in_plan: true },
  MEDIUM:   { priority: "known_limitation", blocks_v1: false, auto_include_in_plan: false },
  LOW:      { priority: "known_limitation", blocks_v1: false, auto_include_in_plan: false },
};

// =============================================================================
// 7. Fix Type Detection (§4.3)
// =============================================================================

/**
 * Визначає тип виправлення за вразливістю.
 * Логіка з §4.3: чотири типи вразливостей → чотири типи виправлень.
 */
function detectFixType(cve: CVEEntry): VulnerabilityType {
  const loc = cve.location.toLowerCase();

  // Dockerfile + base image pattern
  if (loc.includes("dockerfile")) {
    // Якщо це npm пакет в Dockerfile context → npm_dependency
    if (cve.package_name.startsWith("npm:") || cve.package_name.includes("/")) {
      return "npm_dependency";
    }
    // Образ або системна залежність
    if (
      cve.package_name.includes("node") ||
      cve.package_name.includes("alpine") ||
      cve.package_name.includes("debian") ||
      cve.package_name.includes("ubuntu")
    ) {
      return "base_image";
    }
    // Інші системні пакети в образі
    return "os_package";
  }

  // package.json → npm dependency
  if (loc.includes("package.json")) {
    return "npm_dependency";
  }

  // docker-compose.yml → config
  if (loc.includes("docker-compose") || loc.includes("compose")) {
    return "config";
  }

  // Default: OS package (conservative)
  return "os_package";
}

/**
 * Генерує конкретну дію виправлення (§4.3).
 */
function generateFixAction(cve: CVEEntry, fix_type: VulnerabilityType): string {
  switch (fix_type) {
    case "base_image":
      if (cve.fix_version) {
        return `Оновити base image до версії з fix: ${cve.fix_version} у ${cve.location}`;
      }
      return `Оновити base image до останньої LTS версії у ${cve.location}`;

    case "npm_dependency":
      if (cve.fix_version) {
        return `npm install ${cve.package_name}@${cve.fix_version} (${cve.location})`;
      }
      return `npm update ${cve.package_name} до безпечної версії (${cve.location})`;

    case "os_package":
      if (cve.fix_version) {
        return `Оновити ${cve.package_name} до ${cve.fix_version} або додати RUN apk upgrade --no-cache у ${cve.location}`;
      }
      return `Оновити base image або додати RUN apk upgrade --no-cache у ${cve.location}`;

    case "config":
      return `Виправити конфігурацію ${cve.package_name} у ${cve.location}`;
  }
}

// =============================================================================
// 8. CVE Classification (§4.2)
// =============================================================================

/**
 * Класифікує одну CVE: додає priority, fix_type, fix_action, blocks_v1.
 * Severity береться з файлу — агент НЕ змінює класифікацію Trivy.
 */
function classifyCVE(cve: CVEEntry): ClassifiedCVE {
  const severityInfo = SEVERITY_MAP[cve.severity];
  const fix_type = detectFixType(cve);
  const fix_action = generateFixAction(cve, fix_type);

  return {
    ...cve,
    priority: severityInfo.priority,
    fix_type,
    fix_action,
    blocks_v1: severityInfo.blocks_v1,
  };
}

/**
 * Класифікує масив CVE та визначає рекомендацію.
 */
function classifyAllCVEs(cves: CVEEntry[]): { classified: ClassifiedCVE[]; recommendation: RecommendationType; blocks_v1: boolean } {
  const classified = cves.map(classifyCVE);

  const criticalCount = classified.filter((c) => c.severity === "CRITICAL").length;
  const highCount = classified.filter((c) => c.severity === "HIGH").length;
  const blocks_v1 = criticalCount > 0;

  let recommendation: RecommendationType;
  if (criticalCount > 0 || highCount > 0) {
    // §4.4: при наявності CRITICAL/HIGH — включити в D-план або рекомендувати S-блок
    recommendation = "include_in_d_plan";
  } else {
    // Тільки MEDIUM/LOW — документація, без дій
    recommendation = "no_action";
  }

  return { classified, recommendation, blocks_v1 };
}

// =============================================================================
// 9. Scan File Analysis (§4.1)
// =============================================================================

/**
 * Аналізує scan-файл: підраховує статистику.
 * Парсинг scan-файлу виконує агент (зчитує markdown), ця функція — для оркестратора.
 */
function analyzeScanFile(
  scan_file_path: string,
  scan_date: string,
  cves: CVEEntry[]
): ScanAnalysis {
  const stats = {
    critical: cves.filter((c) => c.severity === "CRITICAL").length,
    high: cves.filter((c) => c.severity === "HIGH").length,
    medium: cves.filter((c) => c.severity === "MEDIUM").length,
    low: cves.filter((c) => c.severity === "LOW").length,
    total: cves.length,
  };

  return {
    scan_file_path,
    scan_date,
    all_cves: cves,
    stats,
  };
}

// =============================================================================
// 10. Plan Formation Helpers (§4.4)
// =============================================================================

/**
 * Формує план-записи для CVE, що мають потрапити до D-плану.
 * Повертає лише CRITICAL (P0) та HIGH (P1) — інші = known_limitations.
 */
function buildPlanEntries(classified: ClassifiedCVE[]): ClassifiedCVE[] {
  return classified.filter((c) => SEVERITY_MAP[c.severity].auto_include_in_plan);
}

/**
 * Визначає чи варто рекомендувати S-блок замість включення в D-план.
 * S-блок краще коли CVE багато або вони складні.
 */
function shouldRecommendSBlock(classified: ClassifiedCVE[]): boolean {
  const criticalCount = classified.filter((c) => c.severity === "CRITICAL").length;
  // Рекомендуємо S-блок якщо > 3 CRITICAL CVE (занадто багато для D-плану)
  return criticalCount > 3;
}

// =============================================================================
// 11. Validate Result (§6 — 5 критеріїв прийнятності)
// =============================================================================

/**
 * Перевіряє результат обробки scan-файлу.
 * Кожен [ ] з секції 6 → одна перевірка.
 */
function validateResult(result: SecurityScanResult): ValidationOutcome {
  const issues: string[] = [];

  // §6.1: Файл security_scan_*.md прочитаний при обробці issues
  if (!result.analysis) {
    issues.push("Scan-файл не прочитаний (analysis = null).");
  }

  // §6.2: CRITICAL CVE → включені в P0 план поточного або наступного циклу
  const criticalCVEs = result.classified_cves.filter((c) => c.severity === "CRITICAL");
  const criticalInPlan = criticalCVEs.filter((c) => c.priority === "P0");
  if (criticalCVEs.length > 0 && criticalInPlan.length !== criticalCVEs.length) {
    issues.push(
      `Не всі CRITICAL CVE мають пріоритет P0: ${criticalCVEs.length} CRITICAL, ${criticalInPlan.length} P0.`
    );
  }

  // §6.3: HIGH CVE → включені в P1 план
  const highCVEs = result.classified_cves.filter((c) => c.severity === "HIGH");
  const highInPlan = highCVEs.filter((c) => c.priority === "P1");
  if (highCVEs.length > 0 && highInPlan.length !== highCVEs.length) {
    issues.push(
      `Не всі HIGH CVE мають пріоритет P1: ${highCVEs.length} HIGH, ${highInPlan.length} P1.`
    );
  }

  // §6.4: Після виправлення → людина повторно сканує і переміщує issue до done
  // (перевіряється runtime, тут лише маркер)

  // §6.5: CRITICAL у issues/active → блокує перехід до V1
  if (criticalCVEs.length > 0 && !result.blocks_v1) {
    issues.push("CRITICAL CVE присутні, але blocks_v1 = false. Має бути true.");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// =============================================================================
// 12. Template — шаблон артефакту (§A)
// =============================================================================

/** Параметри для генерації scan issue файлу */
interface ScanTemplateParams {
  date: string;
  trivy_version: string;
  images_scanned: string[];
  critical_cves: CVEEntry[];
  high_cves: CVEEntry[];
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  responsible_cycle?: string;
}

/**
 * Генерує Markdown шаблон security scan issue для issues/active/.
 * Шаблон з Appendix A стандарту.
 */
function generateTemplate(params: ScanTemplateParams): string {
  const criticalRows = params.critical_cves
    .map(
      (c) =>
        `| ${c.cve_id} | ${c.package_name} | ${c.current_version} | ${c.fix_version ?? "N/A"} | ${c.location} |`
    )
    .join("\n");

  const highRows = params.high_cves
    .map(
      (c) =>
        `| ${c.cve_id} | ${c.package_name} | ${c.current_version} | ${c.fix_version ?? "N/A"} | ${c.location} |`
    )
    .join("\n");

  return `# Security Scan — ${params.date}

**Інструмент:** Trivy ${params.trivy_version}
**Образи скановані:**
${params.images_scanned.map((img) => `- ${img}`).join("\n")}

**Загальна статистика:**
- CRITICAL: ${params.critical_cves.length}
- HIGH: ${params.high_cves.length}

---

## CRITICAL вразливості

| CVE ID | Пакет | Версія | Fix Version | Де |
|--------|-------|--------|-------------|-----|
${criticalRows || "| — | — | — | — | — |"}

## HIGH вразливості

| CVE ID | Пакет | Версія | Fix Version | Де |
|--------|-------|--------|-------------|-----|
${highRows || "| — | — | — | — | — |"}

---

**Статус:** ${params.status}
**Відповідальний цикл розробки:** ${params.responsible_cycle ?? "(заповнює агент при плануванні)"}
`;
}

// =============================================================================
// 13. Main Execute Function
// =============================================================================

/**
 * Головна точка входу. Обробляє security scan за фазами або повністю.
 *
 * Фази:
 * - "read": Читання + парсинг scan-файлу (§4.1)
 * - "classify": Класифікація + пріоритизація CVE (§4.2–4.3)
 * - "plan": Формування рекомендацій для плану (§4.4)
 * - "full": Всі кроки послідовно
 */
function execute(input: SecurityScanInput): SecurityScanResult {
  const emptyResult: SecurityScanResult = {
    success: false,
    phase: input.phase,
    analysis: null,
    classified_cves: [],
    recommendation: "no_action",
    message: "",
    blocks_v1: false,
  };

  // Validate minimal input
  if (!input.scan_file_content && !input.parsed_cves) {
    return {
      ...emptyResult,
      error: "Немає вхідних даних: потрібен scan_file_content або parsed_cves.",
      message: "P1 порушено: scan-файл не надано.",
    };
  }

  // Phase: read — аналіз scan-файлу
  if (input.phase === "read" || input.phase === "full") {
    if (!input.scan_file_path) {
      return {
        ...emptyResult,
        error: "scan_file_path обов'язковий для фази read.",
        message: "Шлях до scan-файлу не вказано.",
      };
    }

    // Парсинг виконує агент — ми отримуємо вже parsed_cves
    // Цей блок фіксує аналіз (§4.1)
    const cves = input.parsed_cves ?? [];
    const scan_date = input.scan_date ?? new Date().toISOString().split("T")[0];
    const analysis = analyzeScanFile(input.scan_file_path, scan_date, cves);

    if (input.phase === "read") {
      return {
        ...emptyResult,
        success: true,
        analysis,
        message: `Scan-файл прочитано: ${analysis.stats.total} CVE (${analysis.stats.critical} CRITICAL, ${analysis.stats.high} HIGH).`,
      };
    }
  }

  // Phase: classify — класифікація CVE
  const cves = input.parsed_cves ?? [];
  const scan_date = input.scan_date ?? new Date().toISOString().split("T")[0];
  const scan_file_path = input.scan_file_path ?? "unknown";
  const analysis = analyzeScanFile(scan_file_path, scan_date, cves);

  if (cves.length === 0) {
    return {
      ...emptyResult,
      success: true,
      analysis,
      recommendation: "no_action",
      message: "P2: Файл не містить CVE. Немає що фіксити.",
    };
  }

  const { classified, recommendation: autoRecommendation, blocks_v1 } = classifyAllCVEs(cves);

  // Перевіряємо чи S-блок краще
  const recommendation = shouldRecommendSBlock(classified) ? "recommend_s_block" : autoRecommendation;

  if (input.phase === "classify") {
    return {
      success: true,
      phase: "classify",
      analysis,
      classified_cves: classified,
      recommendation,
      blocks_v1,
      message: `Класифіковано ${classified.length} CVE. ${blocks_v1 ? "⚠️ CRITICAL CVE блокують перехід до V1." : "V1 не заблокований."}`,
    };
  }

  // Phase: plan або full — формування рекомендацій
  const planEntries = buildPlanEntries(classified);
  const knownLimitations = classified.filter((c) => !SEVERITY_MAP[c.severity].auto_include_in_plan);

  let message: string;
  if (recommendation === "recommend_s_block") {
    message = `Рекомендовано S-блок: ${classified.filter((c) => c.severity === "CRITICAL").length} CRITICAL CVE. Запустіть std-security-fix-cycle.md.`;
  } else if (recommendation === "include_in_d_plan") {
    message = `Включити в D-план: ${planEntries.length} CVE (${planEntries.filter((c) => c.priority === "P0").length} P0, ${planEntries.filter((c) => c.priority === "P1").length} P1). ${knownLimitations.length > 0 ? `${knownLimitations.length} CVE → known_limitations.` : ""}`;
  } else {
    message = `Тільки MEDIUM/LOW CVE (${knownLimitations.length}). Документувати як known_limitations. Немає дій у плані.`;
  }

  if (blocks_v1) {
    message += " ⚠️ CRITICAL CVE блокують перехід до V1.";
  }

  return {
    success: true,
    phase: input.phase,
    analysis,
    classified_cves: classified,
    recommendation,
    blocks_v1,
    message,
  };
}

// =============================================================================
// 14. Helper Functions
// =============================================================================

/**
 * Чи належить крок до тих, що використовують security scan.
 * Security scan використовується при D5 (обробка scan результатів)
 */
function isSecurityScanStep(step: string): boolean {
  return step === "D5";
}

/**
 * Чи є CRITICAL CVE що блокують V1.
 * Використовується JIDOKA-перевіркою.
 */
function hasCriticalCVEs(classified: ClassifiedCVE[]): boolean {
  return classified.some((c) => c.severity === "CRITICAL");
}

/**
 * Фільтрує CVE для включення в план (тільки CRITICAL + HIGH).
 */
function getCVEsForPlan(classified: ClassifiedCVE[]): ClassifiedCVE[] {
  return buildPlanEntries(classified);
}

/**
 * Фільтрує CVE що є known limitations (MEDIUM + LOW).
 */
function getKnownLimitations(classified: ClassifiedCVE[]): ClassifiedCVE[] {
  return classified.filter((c) => !SEVERITY_MAP[c.severity].auto_include_in_plan);
}

// =============================================================================
// 15. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Під-алгоритми
  analyzeScanFile,
  classifyCVE,
  classifyAllCVEs,
  detectFixType,
  generateFixAction,
  buildPlanEntries,
  shouldRecommendSBlock,
  // Валідація
  validateResult,
  // Template
  generateTemplate,
  // Хелпери
  isSecurityScanStep,
  hasCriticalCVEs,
  getCVEsForPlan,
  getKnownLimitations,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  EDGE_CASES,
  SEVERITY_MAP,
};

// Re-export типів
export type {
  CVESeverity,
  PlanPriority,
  VulnerabilityType,
  VulnerabilityLocation,
  CVEEntry,
  ClassifiedCVE,
  ScanAnalysis,
  RecommendationType,
  SecurityScanInput,
  SecurityScanResult,
  ValidationOutcome,
  ScanTemplateParams,
};
