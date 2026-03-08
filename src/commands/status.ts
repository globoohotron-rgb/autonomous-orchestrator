// =============================================================================
// Command: status — поточний стан системи
// Конвертовано з: orchestrator.template.md → Module 1 dispatch
// Роль: Повертає StatusData з усіма полями SystemState.
// ЗАВЖДИ успішний — навіть при status = "blocked" (H-JD-01, H-CL-01).
// =============================================================================

import type {
  SystemState,
  OrchestratorConfig,
  CLIOutput,
  StatusData,
} from "../types";
import { STEP_NAMES } from "../types";
import { hasStep } from "../step-registry";

// =============================================================================
// handleStatus — головна функція
// =============================================================================

/**
 * Обробник команди `status`.
 *
 * Повертає всі ключові поля стану системи:
 * current_block, current_step, step_name, status, cycle/iteration,
 * validation_attempts, last_completed_step, last_artifact, isolation_mode.
 *
 * Не перевіряє blocked/awaiting — завжди повертає success: true.
 * Це єдина команда яка працює у будь-якому стані.
 */
export function handleStatus(
  state: SystemState,
  _config: OrchestratorConfig,
): CLIOutput<StatusData> {
  // Визначити назву кроку з реєстру (fallback якщо крок невідомий)
  const stepName = hasStep(state.current_step)
    ? STEP_NAMES[state.current_step]
    : `Unknown step: ${state.current_step}`;

  const data: StatusData = {
    current_block: state.current_block,
    current_step: state.current_step,
    step_name: stepName,
    status: state.status,
    cycle: state.cycle,
    iteration: state.iteration,
    validation_attempts: state.validation_attempts,
    last_completed_step: state.last_completed_step,
    last_artifact: state.last_artifact,
    isolation_mode: state.isolation_mode,
    current_task: state.current_task ?? null,
    tasks_completed: state.tasks_completed ?? 0,
    tasks_total: state.tasks_total ?? 0,
    jidoka_stops: state.jidoka_stops ?? 0,
    issues_created: state.issues_created ?? 0,
  };

  return {
    success: true,
    command: "status",
    data,
    next_action: resolveNextAction(state),
  };
}

// =============================================================================
// resolveNextAction — підказка агенту що робити далі
// =============================================================================

function resolveNextAction(state: SystemState): string {
  switch (state.status) {
    case "blocked":
      return "Система заблокована (JIDOKA). Перевірте issues/active/ та вирішіть блокер вручну.";

    case "awaiting_human_decision":
      return "Очікує рішення людини. Заповніть файл рішення воріт та виконайте `decide`.";

    case "completed":
      return "Проєкт завершено. Фінальний реліз готовий.";

    case "cancelled":
      return "Проєкт скасовано (KILL).";

    case "in_progress":
      return "Виконайте `check` для перевірки передумов поточного кроку.";

    default:
      return "Виконайте `check` для перевірки передумов.";
  }
}
