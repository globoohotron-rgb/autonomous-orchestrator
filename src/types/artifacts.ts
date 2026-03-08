// =============================================================================
// Artifacts — іменування, шляхи, конвенції артефактів
// =============================================================================

import type { ArtifactKey } from "./base";

// --- Правило іменування артефакту ---

export interface ArtifactNamingRule {
  /** Ключ реєстрації в state.json (null = не реєструється) */
  registry_key: ArtifactKey | null;
  /** Тип артефакту */
  type: string;
  /** Шаблон імені файлу. Плейсхолдери: {date}, {cycle}, {context}, {description} */
  name_pattern: string;
  /** Папка збереження (відносно control_center/) */
  directory: string;
  /** Папка архіву (якщо є) */
  archive_directory?: string;
  /** Приклад */
  example: string;
}

// --- Всі конвенції іменування артефактів ---

export const ARTIFACT_NAMING_RULES: ArtifactNamingRule[] = [
  // Plans
  {
    registry_key: "plan",
    type: "plan",
    name_pattern: "plan_{context}_{date}.md",
    directory: "plans/active",
    archive_directory: "plans/done/archive",
    example: "plan_foundation_11.02.26.md",
  },
  // Observe reports
  {
    registry_key: "observe_report",
    type: "observe_report",
    name_pattern: "observe_report_cycle{cycle}_{date}.md",
    directory: "audit/observe",
    archive_directory: "audit/observe/archive",
    example: "observe_report_cycle5_11.02.26.md",
  },
  // HANSEI (development)
  {
    registry_key: "hansei",
    type: "hansei",
    name_pattern: "hansei_{context}_{date}.md",
    directory: "audit/hansei",
    archive_directory: "audit/hansei/archive",
    example: "hansei_dev_cycle5_11.02.26.md",
  },
  // HANSEI (audit)
  {
    registry_key: "hansei_audit",
    type: "hansei_audit",
    name_pattern: "hansei_audit_{date}.md",
    directory: "audit/hansei",
    archive_directory: "audit/hansei/archive",
    example: "hansei_audit_11.02.26.md",
  },
  // Goals check
  {
    registry_key: "goals_check",
    type: "goals_check",
    name_pattern: "goals_check_cycle{cycle}_{date}.md",
    directory: "audit/goals_check",
    archive_directory: "audit/goals_check/archive",
    example: "goals_check_cycle5_11.02.26.md",
  },
  // Plan completion check
  {
    registry_key: "plan_completion",
    type: "plan_completion",
    name_pattern: "plan_completion_check_cycle{cycle}_{date}.md",
    directory: "audit/plan_completion",
    archive_directory: "audit/plan_completion/archive",
    example: "plan_completion_check_cycle5_11.02.26.md",
  },
  // Gate decisions
  {
    registry_key: "gate_decision",
    type: "gate_decision",
    name_pattern: "gate_{context}_decision_{date}.md",
    directory: "audit/gate_decisions",
    archive_directory: "audit/gate_decisions/archive",
    example: "gate_entry_decision_11.02.26.md",
  },
  // Mini-GATE decision
  {
    registry_key: "gate_decision",
    type: "mini_gate_decision",
    name_pattern: "mini_gate_decision_cycle{cycle}_{date}.md",
    directory: "audit/gate_decisions",
    archive_directory: "audit/gate_decisions/archive",
    example: "mini_gate_decision_cycle5_11.02.26.md",
  },
  // UI review
  {
    registry_key: "ui_review",
    type: "ui_review",
    name_pattern: "ui_review_{date}.md",
    directory: "audit/ui_reviews",
    archive_directory: "audit/ui_reviews/archive",
    example: "ui_review_11.02.26.md",
  },
  // Acceptance report
  {
    registry_key: "acceptance_report",
    type: "acceptance_report",
    name_pattern: "acceptance_report_{date}.md",
    directory: "audit/acceptance_reports",
    archive_directory: "audit/acceptance_reports/archive",
    example: "acceptance_report_11.02.26.md",
  },
  // Validation conclusions
  {
    registry_key: "validation_conclusions",
    type: "validation_conclusions",
    name_pattern: "validation_conclusions_{date}.md",
    directory: "audit/validation_conclusions",
    archive_directory: "audit/validation_conclusions/archive",
    example: "validation_conclusions_11.02.26.md",
  },
  // V3 decision
  {
    registry_key: null,
    type: "v3_decision",
    name_pattern: "v3_decision_{date}.md",
    directory: "audit/gate_decisions",
    archive_directory: "audit/gate_decisions/archive",
    example: "v3_decision_22.02.26.md",
  },
  // Issues
  {
    registry_key: null,
    type: "issue",
    name_pattern: "issue_{description}_{date}.md",
    directory: "issues/active",
    archive_directory: "issues/done/archive",
    example: "issue_auth_failure_11.02.26.md",
  },
  // Security scan
  {
    registry_key: "security_scan",
    type: "security_scan",
    name_pattern: "security_scan_{date}.md",
    directory: "issues/active",
    archive_directory: "issues/done/archive",
    example: "security_scan_22.02.26.md",
  },
  // Security fix tasks
  {
    registry_key: null,
    type: "security_fix_task",
    name_pattern: "S{n}_security_fix_{date}.md",
    directory: "tasks/active",
    archive_directory: undefined,
    example: "S1_security_fix_22.02.26.md",
  },
  // S-block decision
  {
    registry_key: "s_block_decision",
    type: "s_block_decision",
    name_pattern: "s_block_decision_{date}.md",
    directory: "audit/gate_decisions",
    archive_directory: undefined,
    example: "s_block_decision_22.02.26.md",
  },
  // Release checklist
  {
    registry_key: null,
    type: "release_checklist",
    name_pattern: "release_checklist_{date}.md",
    directory: "audit",
    archive_directory: undefined,
    example: "release_checklist_11.02.26.md",
  },
];

// --- Незмінні файли (invariants) ---

export const IMMUTABLE_PATHS: string[] = [
  "docs/START.md",
  "docs/scaling_guide.md",
  // final_view/ після створення
  "control_center/final_view/",
  // Код оркестратора — не змінювати під час виконання
  "control_center_code/src/",
];

// --- Ключі артефактів V-блоку (для ротації) ---

export const V_BLOCK_ARTIFACT_KEYS: ArtifactKey[] = [
  "ui_review",
  "smoke_test",
  "acceptance_report",
  "hansei_audit",
  "validation_conclusions",
];

// --- Ключі артефактів S-блоку (для ротації) ---

export const S_BLOCK_ARTIFACT_KEYS: ArtifactKey[] = [
  "security_scan",
  "s_block_decision",
];

// --- Всі ключі артефактів (для повної ротації D1) ---

export const ALL_ARTIFACT_KEYS: ArtifactKey[] = [
  "observe_report",
  "plan",
  "plan_completion",
  "hansei",
  "goals_check",
  "gate_decision",
  "ui_review",
  "smoke_test",
  "acceptance_report",
  "hansei_audit",
  "validation_conclusions",
  "security_scan",
  "s_block_decision",
];

// --- Папки архіву ---

export const ARCHIVE_DIRECTORIES: Record<string, string> = {
  "audit/observe": "audit/observe/archive",
  "audit/hansei": "audit/hansei/archive",
  "audit/goals_check": "audit/goals_check/archive",
  "audit/plan_completion": "audit/plan_completion/archive",
  "audit/gate_decisions": "audit/gate_decisions/archive",
  "audit/ui_reviews": "audit/ui_reviews/archive",
  "audit/smoke_tests": "audit/smoke_tests/archive",
  "audit/acceptance_reports": "audit/acceptance_reports/archive",
  "audit/validation_conclusions": "audit/validation_conclusions/archive",
  "plans/done": "plans/done/archive",
  "tasks/done": "tasks/done/archive",
  "issues/done": "issues/done/archive",
};

// --- Утиліта: форматування дати для імені файлу ---

export function formatDateForArtifact(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year}-${hours}-${minutes}`;
}

// --- Утиліта: розгортання шаблону імені ---

export function resolveArtifactName(
  pattern: string,
  params: {
    date?: string;
    cycle?: number;
    context?: string;
    description?: string;
    n?: number;
  }
): string {
  let result = pattern;
  if (params.date) result = result.replace("{date}", params.date);
  if (params.cycle !== undefined) result = result.replace("{cycle}", String(params.cycle));
  if (params.context) result = result.replace("{context}", params.context);
  if (params.description) result = result.replace("{description}", params.description);
  if (params.n !== undefined) result = result.replace("{n}", String(params.n));
  return result;
}
