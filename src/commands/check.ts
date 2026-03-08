// =============================================================================
// Command: check — перевірка передумов поточного кроку (POKA-YOKE dispatch)
// Конвертовано з: orchestrator.template.md → Module 1 dispatch
// Делегує до validators/preconditions.ts → checkPreconditions()
// =============================================================================

import type {
  SystemState,
  OrchestratorConfig,
  CLIOutput,
  CheckData,
} from "../types";
import { hasStep } from "../step-registry";
import { checkPreconditions } from "../validators/preconditions";
import { collectPreconditionFail } from "../learning/metrics-collector";

// =============================================================================
// handleCheck — головна функція
// =============================================================================

/**
 * Обробник команди `check`.
 *
 * Перевіряє передумови (preconditions) поточного кроку:
 * - file_exists, dir_empty, dir_not_empty
 * - artifact_registered, artifact_null
 * - step_completed, state_field
 *
 * Повертає CheckData з результатами кожної перевірки.
 * success: true навіть якщо all_passed = false (H-EH-03).
 *
 * Помилки:
 * - BLOCKED: status = "blocked" (H-CL-05)
 * - STEP_NOT_FOUND: невідомий крок (H-EH-06)
 */
export function handleCheck(
  state: SystemState,
  config: OrchestratorConfig,
): CLIOutput<CheckData> {
  // ── Blocked → BLOCKED error (H-CL-05) ──
  if (state.status === "blocked") {
    return {
      success: false,
      command: "check",
      error: "BLOCKED",
      message: `Система заблокована (JIDOKA) на кроці ${state.current_step}. Вирішіть блокер вручну.`,
    };
  }

  // ── Step not found → STEP_NOT_FOUND error (H-EH-06) ──
  if (!hasStep(state.current_step)) {
    return {
      success: false,
      command: "check",
      error: "STEP_NOT_FOUND",
      message: `Крок '${state.current_step}' не знайдено в реєстрі кроків.`,
    };
  }

  // ── Dispatch to POKA-YOKE precondition checker ──
  const data = checkPreconditions(state, config);

  // Г3: збір метрики precondition_fail
  if (!data.all_passed) {
    try { collectPreconditionFail(config, state.current_step, state.cycle, data); } catch { /* non-blocking */ }
  }

  const nextAction = data.all_passed
    ? "Усі передумови виконані. Виконайте `instructions` для отримання інструкцій кроку."
    : "Передумови не виконані. Виправте проблеми та повторіть `check`.";

  return {
    success: true,
    command: "check",
    data,
    next_action: nextAction,
  };
}
