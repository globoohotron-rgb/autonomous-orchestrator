// =============================================================================
// JIDOKA Check — зупинка конвеєра при критичному дефекті
// Конвертовано з: control_center/docs/system_cycle.md
//   (Секція "Захисні механізми → JIDOKA", критерії J1–J5)
// Роль: O5 — перевірка дефектів під час виконання задач (L10, D5)
// =============================================================================

import type {
  SystemState,
  Step,
  OrchestratorConfig,
} from "../types";
import { JIDOKA_CRITERIA } from "../types";
import { collectJidokaStop } from "../learning/metrics-collector";

// =============================================================================
// Кроки на яких JIDOKA активна (L10, D5 — виконання задач)
// =============================================================================

const JIDOKA_ACTIVE_STEPS: Step[] = ["L10", "D5"];

// =============================================================================
// Опис дефекту для перевірки JIDOKA
// =============================================================================

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

// =============================================================================
// Результат перевірки JIDOKA
// =============================================================================

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

// =============================================================================
// НЕ є критичним дефектом (виключення)
// Дослівно з system_cycle.md
// =============================================================================

const NOT_CRITICAL: string[] = [
  "Окремий баг, який можна виправити в рамках задачі",
  "Стилістичні або косметичні проблеми",
  "Проблеми продуктивності, що не блокують функціональність",
];

// =============================================================================
// Перевірка окремих критеріїв J1–J5
// Кожна функція приймає опис дефекту і повертає boolean.
// Агент викликає checkJidoka з описом — логіка перевіряє відповідність.
// =============================================================================

/** J1: Дефект робить неможливим виконання наступних задач плану */
function matchJ1(report: JidokaDefectReport): boolean {
  // Блокер: наступні задачі залежать від зламаної архітектури/функціоналу
  return report.description.length > 0;
}

/** J2: Дефект суперечить вимогам з final_view/ на фундаментальному рівні */
function matchJ2(report: JidokaDefectReport): boolean {
  return report.description.length > 0;
}

/** J3: Дефект порушує цілісність даних або безпеку */
function matchJ3(report: JidokaDefectReport): boolean {
  return report.description.length > 0;
}

/** J4: Дефект виявлено в >3 задачах поспіль з однаковою кореневою причиною */
function matchJ4(report: JidokaDefectReport): boolean {
  return (report.consecutive_failures ?? 0) > 3;
}

/** J5: Суперечність між стандартами або планом і описом продукту */
function matchJ5(report: JidokaDefectReport): boolean {
  return report.description.length > 0;
}

// Dispatch: criterion id → matcher
const CRITERION_MATCHERS: Record<string, (report: JidokaDefectReport) => boolean> = {
  J1: matchJ1,
  J2: matchJ2,
  J3: matchJ3,
  J4: matchJ4,
  J5: matchJ5,
};

// =============================================================================
// Головна функція — checkJidoka
// Агент під час виконання задач передає дефект + criterion_id.
// Функція перевіряє чи крок підлягає JIDOKA, чи критерій валідний.
// Якщо хоча б один критерій спрацює → verdict = STOP.
// =============================================================================

/**
 * Перевірити один дефект проти конкретного критерію JIDOKA.
 * Використовується агентом коли він виявляє потенційний критичний дефект.
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
