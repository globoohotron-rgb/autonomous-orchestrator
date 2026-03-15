// JIDOKA Check — stop-the-line on critical defects
// Active during task execution steps (L10, D5).
// 5 criteria (J1–J5): if any match → STOP pipeline.

import type {
  SystemState,
  Step,
  OrchestratorConfig,
} from "../types";
import { JIDOKA_CRITERIA } from "../types";
import { collectJidokaStop } from "../learning/metrics-collector";

const JIDOKA_ACTIVE_STEPS: Step[] = ["L10", "D5"];

export interface JidokaDefectReport {
  /** Опис дефекту виявленого агентом */
  description: string;
  /** Крок на якому виявлено */
  step: Step;
  /** Контекст: які задачі/файли стосуються */
  context: string;
  /** Скільки задач поспіль мають спільну причину (для J4) */
  consecutive_failures?: number;
}

export type JidokaVerdict = "STOP" | "CONTINUE";

export interface JidokaMatchResult {
  criterion_id: string;
  matched: boolean;
  reason: string;
}

export interface JidokaCheckResult {
  verdict: JidokaVerdict;
  /** Які критерії спрацювали */
  triggered: JidokaMatchResult[];
  /** Всі перевірені критерії */
  all_checks: JidokaMatchResult[];
  /** Чи крок взагалі підлягає JIDOKA */
  jidoka_applicable: boolean;
}

/** Defect descriptions matching these terms are NOT critical */
const NOT_CRITICAL: string[] = [
  "Окремий баг, який можна виправити в рамках задачі",
  "Стилістичні або косметичні проблеми",
  "Проблеми продуктивності, що не блокують функціональність",
];

// Criterion matchers J1–J5

/** J1: Дефект робить неможливим виконання наступних задач плану */
function matchJ1(report: JidokaDefectReport): boolean {
  const text = `${report.description} ${report.context}`.toLowerCase();
  const blockerKeywords = [
    "block", "cannot proceed", "impossible to continue",
    "breaks downstream", "architecture broken", "dependency missing",
    "circular dependency", "deadlock", "unrecoverable",
  ];
  return blockerKeywords.some((kw) => text.includes(kw));
}

/** J2: Дефект суперечить вимогам з final_view/ на фундаментальному рівні */
function matchJ2(report: JidokaDefectReport): boolean {
  const text = `${report.description} ${report.context}`.toLowerCase();
  const specKeywords = [
    "contradicts specification", "contradicts requirement",
    "violates product spec", "fundamentally wrong",
    "opposite of requirement", "spec mismatch",
  ];
  return specKeywords.some((kw) => text.includes(kw));
}

/** J3: Дефект порушує цілісність даних або безпеку */
function matchJ3(report: JidokaDefectReport): boolean {
  const text = `${report.description} ${report.context}`.toLowerCase();
  const securityKeywords = [
    "data integrity", "data loss", "data corruption",
    "security breach", "security vulnerability", "injection",
    "unauthorized access", "credential leak", "token exposed",
  ];
  return securityKeywords.some((kw) => text.includes(kw));
}

/** J4: Дефект виявлено в >3 задачах поспіль з однаковою кореневою причиною */
function matchJ4(report: JidokaDefectReport): boolean {
  return (report.consecutive_failures ?? 0) > 3;
}

/** J5: Суперечність між стандартами або планом і описом продукту */
function matchJ5(report: JidokaDefectReport): boolean {
  const text = `${report.description} ${report.context}`.toLowerCase();
  const inconsistencyKeywords = [
    "contradicts plan", "contradicts standard",
    "inconsistent with", "plan mismatch",
    "standard violation", "conflicts with design",
  ];
  return inconsistencyKeywords.some((kw) => text.includes(kw));
}

// Dispatch: criterion id → matcher
const CRITERION_MATCHERS: Record<string, (report: JidokaDefectReport) => boolean> = {
  J1: matchJ1,
  J2: matchJ2,
  J3: matchJ3,
  J4: matchJ4,
  J5: matchJ5,
};

/**
 * Evaluate a single JIDOKA criterion against a defect report.
 */
export function evaluateCriterion(
  criterionId: string,
  report: JidokaDefectReport,
): JidokaMatchResult {
  const criterion = JIDOKA_CRITERIA.find((c) => c.id === criterionId);
  if (!criterion) {
    return {
      criterion_id: criterionId,
      matched: false,
      reason: `Unknown JIDOKA criterion: ${criterionId}`,
    };
  }

  const matcher = CRITERION_MATCHERS[criterionId];
  if (!matcher) {
    return {
      criterion_id: criterionId,
      matched: false,
      reason: `No matcher for criterion: ${criterionId}`,
    };
  }

  const matched = matcher(report);
  return {
    criterion_id: criterionId,
    matched,
    reason: matched
      ? criterion.description
      : `Criterion ${criterionId} not triggered`,
  };
}

/**
 * Перевірити дефект проти ВСІХ 5 критеріїв JIDOKA.
 * Якщо поточний крок не в JIDOKA_ACTIVE_STEPS → jidoka_applicable = false, verdict = CONTINUE.
 * Якщо хоча б один критерій matched → verdict = STOP.
 *
 * Протокол при STOP:
 * 1. Створити issue в issues/active/ (std-issue-management)
 * 2. Оновити state.json: status → "blocked"
 * 3. Ескалювати до людини
 */
export function checkJidoka(
  state: SystemState,
  report: JidokaDefectReport,
  config?: OrchestratorConfig,
): JidokaCheckResult {
  const applicable = JIDOKA_ACTIVE_STEPS.includes(state.current_step);

  if (!applicable) {
    return {
      verdict: "CONTINUE",
      triggered: [],
      all_checks: [],
      jidoka_applicable: false,
    };
  }

  const allChecks: JidokaMatchResult[] = [];
  const triggered: JidokaMatchResult[] = [];

  for (const criterion of JIDOKA_CRITERIA) {
    const result = evaluateCriterion(criterion.id, report);
    allChecks.push(result);
    if (result.matched) {
      triggered.push(result);
    }
  }

  const verdict: JidokaVerdict = triggered.length > 0 ? "STOP" : "CONTINUE";

  // --- Metrics hook: jidoka_stop ---
  if (verdict === "STOP" && config) {
    try {
      collectJidokaStop(
        config,
        state.current_step,
        state.cycle || 0,
        triggered.map(t => t.criterion_id),
        report.description,
      );
    } catch { /* non-blocking */ }
  }

  return {
    verdict,
    triggered,
    all_checks: allChecks,
    jidoka_applicable: true,
  };
}

/**
 * Швидка перевірка: чи поточний крок підлягає JIDOKA.
 */
export function isJidokaApplicable(step: Step): boolean {
  return JIDOKA_ACTIVE_STEPS.includes(step);
}

// =============================================================================
// Exports
// =============================================================================

export {
  JIDOKA_ACTIVE_STEPS,
  NOT_CRITICAL,
  CRITERION_MATCHERS,
};
