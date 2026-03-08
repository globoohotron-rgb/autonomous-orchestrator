// =============================================================================
// B2B Detection — єдине джерело правди для визначення B2B проектів
//
// Імпортується в: technical-censure.ts, censure-hints.ts, auto-gate.ts
// Використовується текстовими інструкціями в: plan.ts, d2-d9-goals-check.ts
// =============================================================================

import * as fs from "fs";
import * as path from "path";

/**
 * Канонічний regex для B2B detection.
 * Єдине джерело правди — НЕ дублювати в інших файлах.
 *
 * Матчить:
 * - "## B2B Model" (секція з Plan #4 L5)
 * - "multi-tenancy", "multi-tenant", "multi_tenant"
 * - "team plan", "team management"
 * - "enterprise"
 * - "B2B" як окреме слово
 * - "організаці" (укр)
 * - "billing", "per-seat", "subscription plan"
 */
export const B2B_DETECTION_REGEX =
  /## B2B Model|\bmulti[_\s-]?tenan|\bteam[_\s-]?(plan|management)|\benterprise\b|\bB2B\b|організаці|\bbilling\b|\bper[_\s-]?seat|\bsubscription[_\s-]?plan/i;

/**
 * Визначає чи проект B2B на основі project_description.md у final_view/.
 *
 * @param projectRoot — корінь проекту (де є control_center/)
 * @returns true якщо project_description.md містить B2B сигнали
 */
export function detectB2BProject(projectRoot: string): boolean {
  const descPath = path.join(
    projectRoot,
    "control_center",
    "final_view",
    "project_description.md",
  );
  if (!fs.existsSync(descPath)) return false;

  const content = fs.readFileSync(descPath, "utf-8");
  return B2B_DETECTION_REGEX.test(content);
}

/**
 * Threshold constants для B2B проектів.
 * Імпортуються в auto-gate.ts замість хардкоду.
 */
export const B2B_THRESHOLDS = {
  /** % DONE для auto-VALIDATE (solo: 80) */
  VALIDATE_DONE_PERCENT: 85,
  /** Мінімум циклів для auto-VALIDATE (solo: 2) */
  VALIDATE_MIN_CYCLES: 3,
  /** Максимум B2B gaps для auto-VALIDATE */
  VALIDATE_MAX_GAPS: 2,
  /** % code-complete для OPT-6 auto-VALIDATE (solo: 90) */
  CODE_COMPLETE_PERCENT: 93,
} as const;
