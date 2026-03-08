// =============================================================================
// M1. Metrics Collector — збір метрик з точок оркестратора
//
// Функції-обгортки, які викликаються з hooks у існуючих модулях.
// Кожна функція створює MetricEvent з правильним event_type та data,
// і передає в metrics-store для збереження.
//
// Горизонт 3 — Самонавчання (Фаза 1: збір даних)
// =============================================================================

import type { OrchestratorConfig } from "../types";
import type { Step } from "../types/base";
import type { CodeHealthResult } from "../validators/code-health";
import type { CheckData } from "../types/cli";
import {
  appendMetric,
  generateMetricId,
} from "./metrics-store";
import type { MetricEvent } from "./metrics-store";

// =============================================================================
// Helper — створити base MetricEvent
// =============================================================================

function createEvent(
  eventType: MetricEvent["event_type"],
  step: Step,
  cycle: number,
  data: Record<string, unknown>,
): MetricEvent {
  return {
    id: generateMetricId(),
    timestamp: new Date().toISOString(),
    event_type: eventType,
    step,
    cycle,
    data,
  };
}

// =============================================================================
// 1. Step Complete — після успішного завершення кроку
// Hook: commands/complete.ts → applyTransitionAndRespond (success path)
// =============================================================================

export function collectStepComplete(
  config: OrchestratorConfig,
  step: Step,
  cycle: number,
  artifact: string | null,
  nextStep: Step,
  decision?: string,
): void {
  const event = createEvent("step_complete", step, cycle, {
    artifact,
    next_step: nextStep,
    decision: decision ?? null,
  });
  appendMetric(config, event);
}

// =============================================================================
// 2. Step Fail — при помилці завершення кроку
// Hook: commands/complete.ts → error returns (CODE_HEALTH_FAILED, etc.)
// =============================================================================

export function collectStepFail(
  config: OrchestratorConfig,
  step: Step,
  cycle: number,
  errorCode: string,
  errorMessage: string,
): void {
  const event = createEvent("step_fail", step, cycle, {
    error_code: errorCode,
    error_message: errorMessage,
  });
  appendMetric(config, event);
}

// =============================================================================
// 3. Gate Decision — рішення на воротах
// Hook: commands/decide.ts → success, auto-gate в complete.ts
// =============================================================================

export function collectGateDecision(
  config: OrchestratorConfig,
  step: Step,
  cycle: number,
  decision: string,
  autoDecided: boolean,
  rationale?: string,
  donePercent?: number | null,
): void {
  const event = createEvent("gate_decision", step, cycle, {
    decision,
    auto_decided: autoDecided,
    rationale: rationale ?? null,
    done_percent: donePercent ?? null,
  });
  appendMetric(config, event);
}

// =============================================================================
// 4. Jidoka Stop — зупинка конвеєра
// Hook: validators/jidoka.ts → checkJidoka (verdict === STOP)
// =============================================================================

export function collectJidokaStop(
  config: OrchestratorConfig,
  step: Step,
  cycle: number,
  triggeredCriteria: string[],
  description: string,
): void {
  const event = createEvent("jidoka_stop", step, cycle, {
    triggered_criteria: triggeredCriteria,
    description,
  });
  appendMetric(config, event);
}

// =============================================================================
// 5. Code Health — результат перевірки коду
// Hook: validators/code-health.ts → checkCodeHealth (result)
// =============================================================================

export function collectCodeHealth(
  config: OrchestratorConfig,
  step: Step,
  cycle: number,
  result: CodeHealthResult,
): void {
  const event = createEvent("code_health", step, cycle, {
    healthy: result.healthy,
    checks_count: result.checks.length,
    checks_passed: result.checks.filter(c => c.passed).length,
    checks_failed: result.checks.filter(c => !c.passed).length,
    summary: result.summary,
    total_duration_ms: result.checks.reduce((sum, c) => sum + c.duration_ms, 0),
  });
  appendMetric(config, event);
}

// =============================================================================
// 6. Precondition Fail — передумова не виконана
// Hook: commands/check.ts → checkPreconditions (all_passed === false)
// =============================================================================

export function collectPreconditionFail(
  config: OrchestratorConfig,
  step: Step,
  cycle: number,
  checkData: CheckData,
): void {
  const failedChecks = checkData.results
    .filter(r => !r.passed)
    .map(r => ({ check: r.check, reason: r.reason ?? "unknown" }));

  const event = createEvent("precondition_fail", step, cycle, {
    total_checks: checkData.results.length,
    failed_checks: failedChecks,
  });
  appendMetric(config, event);
}

// =============================================================================
// 7. Cycle Transition — перехід між циклами (D1 increment)
// Hook: state-machine.ts → incrementCycleCounter
// =============================================================================

export function collectCycleTransition(
  config: OrchestratorConfig,
  step: Step,
  oldCycle: number,
  newCycle: number,
): void {
  const event = createEvent("cycle_transition", step, oldCycle, {
    old_cycle: oldCycle,
    new_cycle: newCycle,
  });
  appendMetric(config, event);
}
