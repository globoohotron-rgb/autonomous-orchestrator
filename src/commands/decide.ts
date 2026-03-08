// =============================================================================
// Command: decide — прийняти рішення на воротах (Gate Decision)
// Конвертовано з: orchestrator.template.md → Module 1 dispatch
// Валідує рішення, маршрутизує через gates/decisions.ts, просуває стан.
//
// Протокол воріт (Gate Decision Protocol):
//   Phase 1: Агент створює файл рішення → complete → awaiting
//   Phase 2: Людина заповнює → decide → маршрутизація → наступний крок
//
// Підтримані ворота (HUMAN_GATE_STEPS):
//   L4 (Entry Gate): GO / REWORK / KILL
//   GATE1 (Foundation Gate): GO / REBUILD_PLAN / REBUILD_DESCRIPTION / KILL
//   D9 (Mini-GATE): CONTINUE / VALIDATE / AMEND_SPEC / KILL
//   V3 (Validation Audit): CONTINUE / AMEND_SPEC / KILL
//   S5 (S-Block closure): REPEAT / VALIDATE / STOP
//   E1 (Release): D1 / KILL
// =============================================================================

import type {
  SystemState,
  OrchestratorConfig,
  CLIOutput,
  DecideData,
  AnyGateDecision,
} from "../types";
import { STEP_NAMES } from "../types";
import { hasStep } from "../step-registry";
import { advanceState, getNextStep } from "../state-machine";
import { routeGateDecision } from "../gates/decisions";
import { validateDecision, getValidDecisions } from "../gates/protocol";
import { appendTransition } from "../artifacts/transition-log";
import { collectGateDecision } from "../learning/metrics-collector";
import { applyAllHooks } from "./lifecycle-hooks";
import { getStep } from "../step-registry";

// =============================================================================
// handleDecide — головна функція
// =============================================================================

/**
 * Обробник команди `decide`.
 *
 * 1. Перевіряє що status = "awaiting_human_decision" (H-CL-04)
 * 2. Перевіряє що decision arg вказано
 * 3. Валідує decision проти допустимих значень (H-EH-05)
 * 4. Маршрутизує рішення через routeGateDecision
 * 5. Просуває стан через getNextStep + advanceState
 *
 * Помилки:
 * - AWAITING_HUMAN: status !== "awaiting_human_decision" (H-CL-04)
 * - STEP_NOT_FOUND: невідомий крок (H-EH-06)
 * - INVALID_DECISION: невідоме/недопустиме рішення (H-EH-05)
 * - BLOCKED: status = "blocked"
 */
export function handleDecide(
  state: SystemState,
  config: OrchestratorConfig,
  decision?: string,
): CLIOutput<DecideData> {
  // ── Blocked → BLOCKED error ──
  if (state.status === "blocked") {
    return {
      success: false,
      command: "decide",
      error: "BLOCKED",
      message: `Система заблокована (JIDOKA) на кроці ${state.current_step}. Вирішіть блокер вручну.`,
    };
  }

  // ── Not awaiting → AWAITING_HUMAN error (H-CL-04) ──
  if (state.status !== "awaiting_human_decision") {
    return {
      success: false,
      command: "decide",
      error: "AWAITING_HUMAN",
      message: `Команда 'decide' доступна тільки коли status = "awaiting_human_decision". Поточний: "${state.status}".`,
    };
  }

  // ── Step not found ──
  if (!hasStep(state.current_step)) {
    return {
      success: false,
      command: "decide",
      error: "STEP_NOT_FOUND",
      message: `Крок '${state.current_step}' не знайдено в реєстрі кроків.`,
    };
  }

  // ── Decision arg required ──
  if (!decision) {
    const validOptions = getValidDecisions(state.current_step);
    return {
      success: false,
      command: "decide",
      error: "INVALID_DECISION",
      message: `Рішення не вказано. Вкажіть --decision <value>. Допустимі: ${validOptions.join(", ")}.`,
    };
  }

  // ── Validate decision value (H-EH-05) ──
  if (!validateDecision(state.current_step, decision)) {
    const validOptions = getValidDecisions(state.current_step);
    return {
      success: false,
      command: "decide",
      error: "INVALID_DECISION",
      message: `Невідоме рішення "${decision}" для кроку ${state.current_step}. Допустимі: ${validOptions.join(", ")}.`,
    };
  }

  // ── Route decision through gates/decisions.ts ──
  const route = routeGateDecision(state.current_step, decision, state);

  // OPT-15: Clear gate decision timeout timestamp
  state.gate_decision_started_at = null;

  if (!route) {
    return {
      success: false,
      command: "decide",
      error: "INVALID_DECISION",
      message: `Не вдалося маршрутизувати рішення "${decision}" для кроку ${state.current_step}. Крок не є воротами.`,
    };
  }

  // ── Advance state via state-machine ──
  const appliedToStep = state.current_step;
  const stateUpdates: string[] = [];

  // Use getNextStep with the decision to get the transition
  const transition = getNextStep(state, decision);

  if (transition.error) {
    // Fallback: apply route directly if getNextStep fails
    // This shouldn't happen for validated decisions, but is a safety net.
    return applyRouteDirectly(
      state,
      config,
      route,
      appliedToStep,
      decision,
      stateUpdates,
    );
  }

  // Apply transition
  const updatedState = advanceState(state, transition);
  Object.assign(state, updatedState);

  // Log transition
  try {
    appendTransition(config, {
      from: appliedToStep,
      to: updatedState.current_step,
      timestamp: new Date().toISOString(),
      decision,
    });
  } catch {
    // Transition log failure is non-blocking
  }

  // Lifecycle hooks: D1 rotation/cycle, V0 isolation/rotation, V2 attempts, V3 isolation-off
  const hookUpdates = applyAllHooks(appliedToStep, decision, state, config);
  stateUpdates.push(...hookUpdates);

  // Г3: збір метрики gate_decision (людина)
  try { collectGateDecision(config, appliedToStep, state.cycle, decision, false); } catch { /* non-blocking */ }

  // Collect state update descriptions
  if (transition.nextStep) {
    stateUpdates.push(`current_step = ${transition.nextStep}`);
  }
  if (transition.block) {
    stateUpdates.push(`current_block = ${transition.block}`);
  }
  if (transition.stateUpdates?.status) {
    stateUpdates.push(`status = ${transition.stateUpdates.status}`);
  }
  if (transition.killed) {
    stateUpdates.push("status = cancelled");
  }
  if (transition.completed) {
    stateUpdates.push("status = completed");
  }

  const nextStep = updatedState.current_step;
  const nextBlock = updatedState.current_block;
  const nextStepName = hasStep(nextStep)
    ? (STEP_NAMES[nextStep] ?? "")
    : `Unknown: ${nextStep}`;

  const data: DecideData = {
    decision: decision as AnyGateDecision,
    applied_to_step: appliedToStep,
    next_step: nextStep,
    next_step_name: nextStepName,
    next_block: nextBlock,
    state_updates: stateUpdates,
  };

  let nextAction: string;
  if (transition.killed) {
    nextAction = "Проєкт скасовано (KILL).";
  } else if (transition.completed) {
    nextAction = "Проєкт завершено. Фінальний реліз готовий.";
  } else if (updatedState.status === "awaiting_human_decision") {
    nextAction =
      "Очікує рішення людини. Заповніть файл рішення та виконайте `decide`.";
  } else {
    nextAction =
      "Виконайте `check` для перевірки передумов наступного кроку.";
  }

  // Write signal for Session Bridge to continue with next step
  if (!transition.killed && !transition.completed) {
    writeDecideSignal(state, config, appliedToStep, decision, nextStep);
  }

  return {
    success: true,
    command: "decide",
    data,
    next_action: nextAction,
  };
}

// =============================================================================
// writeDecideSignal — записати сигнал для Session Bridge після decide
// Щоб нова сесія Cline автоматично продовжила роботу з наступним кроком
// =============================================================================

function writeDecideSignal(
  state: SystemState,
  config: OrchestratorConfig,
  appliedToStep: string,
  decision: string,
  nextStep: string,
): void {
  try {
    const fs = require("fs");
    const pathMod = require("path");
    const signalPath = pathMod.resolve(
      config.control_center_path, "system_state", "session_boundary.signal"
    );

    const nextStepDef = hasStep(nextStep) ? getStep(nextStep) : null;
    const nextStepNameStr = nextStepDef?.name || STEP_NAMES[nextStep as keyof typeof STEP_NAMES] || nextStep;
    const nextStepRole = nextStepDef?.role || "";
    const blockName = state.current_block || "";
    const cycle = state.cycle || "";

    const promptLines = [
      `# Продовження роботи — після рішення ${decision} на ${appliedToStep}`,
      ``,
      `Рішення **${decision}** прийнято на гейті **${appliedToStep}**.`,
      ``,
      `## Поточний стан`,
      `- Блок: **${blockName}**`,
      `- Наступний крок: **${nextStep}** — ${nextStepNameStr}`,
      `- Цикл: ${cycle}`,
      nextStepRole ? `- Роль: ${nextStepRole}` : "",
      ``,
      `## Що робити`,
      `1. Виконай \`npx ts-node src/orchestrator.ts status\``,
      `2. Виконай \`npx ts-node src/orchestrator.ts check\``,
      `3. Виконай \`npx ts-node src/orchestrator.ts instructions\``,
      `4. Виконай роботу згідно інструкцій`,
      `5. Виконай \`npx ts-node src/orchestrator.ts complete <artifact_path>\``,
    ].filter(Boolean).join("\n");

    const signal = JSON.stringify({
      prompt: promptLines,
      type: "post_decide",
      decided_step: appliedToStep,
      decision,
      next_step: nextStep,
      block: blockName,
      cycle,
      timestamp: new Date().toISOString(),
    });

    fs.writeFileSync(signalPath, signal, "utf-8");
  } catch {
    // non-blocking
  }
}

// =============================================================================
// applyRouteDirectly — fallback: застосувати DecisionRoute напряму
// Використовується якщо getNextStep не може маршрутизувати
// (наприклад: крок не зареєстрований у SPECIAL_TRANSITIONS)
// =============================================================================

import type { DecisionRoute } from "../gates/decisions";

function applyRouteDirectly(
  state: SystemState,
  config: OrchestratorConfig,
  route: DecisionRoute,
  appliedToStep: SystemState["current_step"],
  decision: string,
  stateUpdates: string[],
): CLIOutput<DecideData> {
  // Apply route state updates
  state.last_completed_step = appliedToStep;
  state.current_step = route.next_step;
  state.status = route.status;

  if (route.next_block) {
    state.current_block = route.next_block;
  }

  if (route.state_updates) {
    Object.assign(state, route.state_updates);
  }

  // Log transition
  try {
    appendTransition(config, {
      from: appliedToStep,
      to: route.next_step,
      timestamp: new Date().toISOString(),
      decision,
    });
  } catch {
    // Non-blocking
  }

  // Lifecycle hooks: D1 rotation/cycle, V0 isolation/rotation, V2 attempts, V3 isolation-off
  const hookUpdates2 = applyAllHooks(appliedToStep, decision, state, config);
  stateUpdates.push(...hookUpdates2);

  stateUpdates.push(`current_step = ${route.next_step}`);
  stateUpdates.push(`status = ${route.status}`);
  if (route.next_block) {
    stateUpdates.push(`current_block = ${route.next_block}`);
  }

  const nextStepName = hasStep(route.next_step)
    ? (STEP_NAMES[route.next_step] ?? "")
    : `Unknown: ${route.next_step}`;

  const data: DecideData = {
    decision: decision as AnyGateDecision,
    applied_to_step: appliedToStep,
    next_step: route.next_step,
    next_step_name: nextStepName,
    next_block: route.next_block ?? state.current_block,
    state_updates: stateUpdates,
  };

  const nextAction =
    route.status === "cancelled"
      ? "Проєкт скасовано (KILL)."
      : "Виконайте `check` для перевірки передумов наступного кроку.";

  // Write signal for Session Bridge to continue with next step
  if (route.status !== "cancelled") {
    writeDecideSignal(state, config, appliedToStep, decision, route.next_step);
  }

  return {
    success: true,
    command: "decide",
    data,
    next_action: nextAction,
  };
}
