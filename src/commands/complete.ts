// =============================================================================
// Command: complete — завершити поточний крок
// Конвертовано з: orchestrator.template.md → Module 1 dispatch
// Реєструє артефакт, визначає наступний крок, просуває стан.
//
// Логіка переходів:
//   human_decision steps (L4, GATE1, D9, V3) → set awaiting_human_decision
//   autonomous steps з gate transitions (E1, S5) → derive decision
//   automatic_decision steps (V2) → derive decision з артефакту
//   regular steps → лінійний перехід через getNextStep()
//   ALWAYS transitions (D1) → автоматичний перехід
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type {
  SystemState,
  OrchestratorConfig,
  CLIOutput,
  CompleteData,
  StepDefinition,
} from "../types";
import { STEP_NAMES } from "../types";
import { getStep, hasStep } from "../step-registry";
import {
  registerArtifactFromOutput,
  updateLastArtifact,
  resolveAbsolutePath,
} from "../artifacts/manager";
import { getNextStep, advanceState } from "../state-machine";
import {
  readGateDecision,
  isDecisionMade,
} from "../gates/protocol";
import { validateArtifactFile } from "../validators/artifact-file";
import { isCodeStep, checkCodeHealth } from "../validators/code-health";
import { isPlanStep, runPlanCensure } from "../validators/censure-gate";
import { checkPreconditions } from "../validators/preconditions";
import { appendTransition } from "../artifacts/transition-log";
import { evaluateGate } from "../gates/auto-gate";
import { getValidDecisions } from "../gates/protocol";
import { collectStepComplete, collectStepFail, collectCodeHealth, collectGateDecision } from "../learning/metrics-collector";
import { applyAllHooks } from "./lifecycle-hooks";

// =============================================================================
// handleComplete — головна функція
// =============================================================================

/**
 * Обробник команди `complete`.
 *
 * 1. Валідація: blocked, step exists, artifact required
 * 2. Реєстрація артефакту в state.artifacts (якщо step має artifact output)
 * 3. Визначення переходу:
 *    - Лінійний (getNextStep без decision) → advance
 *    - Human gate (L4, GATE1) → awaiting_human_decision
 *    - Autonomous gate (D1, E1, S5) → derive decision з контексту
 *    - Automatic gate (V2) → derive decision з артефакту
 * 4. Просування стану (advanceState)
 *
 * Помилки:
 * - BLOCKED: status = "blocked"
 * - STEP_NOT_FOUND: невідомий крок
 * - ARTIFACT_NOT_FOUND: step потребує артефакт, але --artifact не вказано (H-CL-03)
 */
export function handleComplete(
  state: SystemState,
  config: OrchestratorConfig,
  artifact?: string,
): CLIOutput<CompleteData> {
  // ── Blocked → BLOCKED error ──
  if (state.status === "blocked") {
    return {
      success: false,
      command: "complete",
      error: "BLOCKED",
      message: `Система заблокована (JIDOKA) на кроці ${state.current_step}. Вирішіть блокер вручну.`,
    };
  }

  // ── Step not found ──
  if (!hasStep(state.current_step)) {
    return {
      success: false,
      command: "complete",
      error: "STEP_NOT_FOUND",
      message: `Крок '${state.current_step}' не знайдено в реєстрі кроків.`,
    };
  }

  const stepDef = getStep(state.current_step);

  // ── Artifact required check (H-CL-03) ──
  if (stepDef.artifact && !artifact) {
    return {
      success: false,
      command: "complete",
      error: "ARTIFACT_NOT_FOUND",
      message: `Крок ${state.current_step} потребує артефакт. Вкажіть --artifact <path>.`,
    };
  }

  // ── Precondition enforcement (POKA-YOKE) ──
  // Перевіряємо передумови — якщо хоча б одна не виконана, блокуємо complete
  const preconditionCheck = checkPreconditions(state, config);
  if (!preconditionCheck.all_passed) {
    const failedChecks = preconditionCheck.results
      .filter((r) => !r.passed)
      .map((r) => `  - ${r.check}: ${r.reason ?? "FAIL"}`)
      .join("\n");
    return {
      success: false,
      command: "complete",
      error: "PRECONDITION_FAILED",
      message: `Передумови кроку ${state.current_step} не виконані:\n${failedChecks}\n\nВиправте проблеми та повторіть \'complete\'.`,
    };
  }

  // ── Artifact file validation (файл існує, не порожній, має структуру) ──
  if (artifact) {
    const fileValidation = validateArtifactFile(artifact, config);
    if (!fileValidation.valid) {
      return {
        success: false,
        command: "complete",
        error: "ARTIFACT_INVALID",
        message: fileValidation.error ?? `Артефакт "${artifact}" не пройшов валідацію.`,
      };
    }
  }

  // ── Code Health Check — для кроків що змінюють код (L10, D5, S3) ──
  if (isCodeStep(state.current_step)) {
    const codeHealth = checkCodeHealth(config);
    // Г3: збір метрики code_health
    try { collectCodeHealth(config, state.current_step, state.cycle, codeHealth); } catch { /* non-blocking */ }
    if (!codeHealth.healthy) {
      const failedDetails = codeHealth.checks
        .filter((c) => !c.passed)
        .map((c) => `[${c.type}] ${c.target}:\n${c.output ?? "no output"}`)
        .join("\n---\n");
      // Г3: збір метрики step_fail
      try { collectStepFail(config, state.current_step, state.cycle, "CODE_HEALTH_FAILED", codeHealth.summary); } catch { /* non-blocking */ }
      return {
        success: false,
        command: "complete",
        error: "CODE_HEALTH_FAILED",
        message: `${codeHealth.summary}\n\nВиправте помилки перед завершенням кроку:\n${failedDetails}`,
      };
    }
  }

  // ── Technical Censure Gate — для кроків-планів (L8, D3) ──
  // Автоматично перевіряє план за правилами D6/D7 та іншими.
  // BLOCK = план не зберігається, агент змушений виправити.
  if (isPlanStep(state.current_step) && artifact) {
    const censure = runPlanCensure(artifact, config);
    if (!censure.passed) {
      // Г3: збір метрики step_fail
      try { collectStepFail(config, state.current_step, state.cycle, "CENSURE_BLOCKED", censure.summary); } catch { /* non-blocking */ }
      return {
        success: false,
        command: "complete",
        error: "CENSURE_BLOCKED",
        message: censure.summary,
      };
    }
  }

  // ── Artifact path pattern validation (GUARD: tasks must be in correct directory) ──
  if (artifact && stepDef.artifact?.path_pattern) {
    const patternDir = stepDef.artifact.path_pattern.split("/").slice(0, -1).join("/");
    const normalizedArtifact = artifact.replace(/\\/g, "/");
    if (patternDir && !normalizedArtifact.includes(patternDir)) {
      return {
        success: false,
        command: "complete",
        error: "ARTIFACT_PATH_MISMATCH",
        message: `Артефакт "${artifact}" не відповідає очікуваному шляху. Очікується директорія: ${patternDir}/. Задачі МУСЯТЬ бути збережені саме там.`,
      };
    }
  }

  // ── Task creation post-condition (GUARD: tasks/active/ must have files after D4/L9) ──
  if (state.current_step === "D4" || state.current_step === "L9") {
    const tasksActiveDir = path.join(config.control_center_path, "tasks", "active");
    const taskFiles = fs.existsSync(tasksActiveDir)
      ? fs.readdirSync(tasksActiveDir).filter(f => f.endsWith(".md"))
      : [];
    if (taskFiles.length === 0) {
      return {
        success: false,
        command: "complete",
        error: "POSTCONDITION_FAILED",
        message: `Крок ${state.current_step} створює задачі, але tasks/active/ порожня (0 .md файлів). Всі задачі МУСЯТЬ бути збережені в control_center/tasks/active/. Перемістіть файли та повторіть complete.`,
      };
    }

    // GUARD: кожна задача МУСИТЬ містити всі 13 обов'язкових секцій
    const REQUIRED_SECTIONS = [
      "Опис задачі",
      "Ціль задачі",
      "Очікуваний результат",
      "Кроки виконання",
      "Acceptance Criteria",
      "Definition of Done",
      "Файли для створення/оновлення",
      "Залежності",
      "Тести",
      "Звіт про виконання",
      "Контекст коду",
      "Заборони",
      "Validation Script",
    ];

    const invalidTasks: string[] = [];
    for (const file of taskFiles) {
      const content = fs.readFileSync(path.join(tasksActiveDir, file), "utf-8");
      const missing = REQUIRED_SECTIONS.filter(s => !content.includes(`## ${s}`));
      if (missing.length > 0) {
        invalidTasks.push(`${file}: відсутні секції [${missing.join(", ")}]`);
      }
    }

    if (invalidTasks.length > 0) {
      return {
        success: false,
        command: "complete",
        error: "POSTCONDITION_FAILED",
        message: `Задачі не відповідають шаблону 13 секцій:\n${invalidTasks.join("\n")}\nКожна задача МУСИТЬ містити секції: Контекст коду, Заборони, Validation Script.`,
      };
    }
  }

  // ── Register artifact (primary + additional) ──
  const stateUpdates: string[] = [];

  if (artifact) {
    if (stepDef.artifact) {
      registerArtifactFromOutput(state, stepDef.artifact, artifact);
      if (stepDef.artifact.registry_key) {
        stateUpdates.push(
          `artifacts.${stepDef.artifact.registry_key} = ${artifact}`,
        );
      }
    } else {
      updateLastArtifact(state, artifact);
    }
    stateUpdates.push(`last_artifact = ${artifact}`);
  }

  // Register additional_artifacts if the step defines them and state has paths
  if (stepDef.additional_artifacts && stepDef.additional_artifacts.length > 0) {
    for (const addArt of stepDef.additional_artifacts) {
      if (!addArt.registry_key) continue; // skip null keys
      const existingPath = state.artifacts[addArt.registry_key];
      // If agent already wrote directly → keep it. Otherwise try to derive path.
      if (!existingPath && addArt.path_pattern) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yy = String(today.getFullYear()).slice(-2);
        const HH = String(today.getHours()).padStart(2, '0');
        const MM = String(today.getMinutes()).padStart(2, '0');
        const dateSuffix = `${dd}.${mm}.${yy}-${HH}-${MM}`;
        const derivedPath = addArt.path_pattern.replace("{date}", dateSuffix);
        // Check if file exists at derived path
        try {
          const fs = require("fs");
          const fullPath = require("path").resolve(config.control_center_path, "..", derivedPath);
          if (fs.existsSync(fullPath)) {
            state.artifacts[addArt.registry_key!] = derivedPath;
            stateUpdates.push(`artifacts.${addArt.registry_key} = ${derivedPath}`);
          }
        } catch { /* non-blocking */ }
      }
    }
  }

  const completedStep = state.current_step;

  // ── Try linear/ALWAYS transition first ──
  const transition = getNextStep(state);

  if (!transition.error) {
    // Успішний перехід (лінійний або ALWAYS)
    return applyTransitionAndRespond(
      state,
      config,
      transition,
      completedStep,
      artifact ?? null,
      stateUpdates,
    );
  }

  // ── Decision required — determine strategy by step type ──
  if (stepDef.type === "human_decision") {
    // Try auto-gate ONLY if auto_gates is enabled
    if (state.auto_gates) {
      const autoGate = evaluateGate(state.current_step, state, config);

      // OPT-1: Apply state_patches from gate evaluation (stagnation tracking)
      if (autoGate.state_patches) {
        Object.assign(state, autoGate.state_patches);
      }

      if (autoGate.auto_decided && autoGate.decision) {
        const retryTransition = getNextStep(state, autoGate.decision);
        if (!retryTransition.error) {
          stateUpdates.push(`auto_gate = ${autoGate.decision}`);
          stateUpdates.push(`auto_rationale = ${autoGate.rationale}`);
          return applyTransitionAndRespond(
            state,
            config,
            retryTransition,
            completedStep,
            artifact ?? null,
            stateUpdates,
            autoGate.decision,
            (autoGate.analysis?.done_percent as number | undefined) ?? null,
          );
        }
      }

      // Auto-gate can't decide → escalate to human
      return setAwaitingAndRespond(
        state,
        completedStep,
        artifact ?? null,
        stateUpdates,
        stepDef,
        autoGate.rationale,
        config,
      );
    }

    // auto_gates disabled → always escalate to human
    return setAwaitingAndRespond(
      state,
      completedStep,
      artifact ?? null,
      stateUpdates,
      stepDef,
      undefined,
      config,
    );
  }

  // Autonomous or automatic_decision: try to derive the decision
  const derivedDecision = deriveDecisionForStep(state, config, stepDef);

  if (derivedDecision) {
    const retryTransition = getNextStep(state, derivedDecision);
    if (!retryTransition.error) {
      stateUpdates.push(`derived_decision = ${derivedDecision}`);
      return applyTransitionAndRespond(
        state,
        config,
        retryTransition,
        completedStep,
        artifact ?? null,
        stateUpdates,
        derivedDecision,
      );
    }
  }

  // Can't derive decision → fallback to awaiting
  return setAwaitingAndRespond(
    state,
    completedStep,
    artifact ?? null,
    stateUpdates,
    stepDef,
    undefined,
    config,
  );
}

// =============================================================================
// applyTransitionAndRespond — застосувати перехід і сформувати відповідь
// =============================================================================

import type { TransitionResult } from "../state-machine";

function applyTransitionAndRespond(
  state: SystemState,
  config: OrchestratorConfig,
  transition: TransitionResult,
  completedStep: SystemState["current_step"],
  artifactRegistered: string | null,
  stateUpdates: string[],
  decision?: string,
  donePercent?: number | null,
): CLIOutput<CompleteData> {
  // Apply transition to state (mutate in place for caller to save)
  const updatedState = advanceState(state, transition);
  Object.assign(state, updatedState);

  // Log transition
  try {
    appendTransition(config, {
      from: completedStep,
      to: updatedState.current_step,
      timestamp: new Date().toISOString(),
      decision,
      artifact: artifactRegistered ?? undefined,
    });
  } catch {
    // Transition log write failure is non-blocking
  }

  // Lifecycle hooks: D1 rotation/cycle, V0 isolation/rotation, V2 attempts, V3 isolation-off
  const hookUpdates = applyAllHooks(completedStep, decision, state, config);
  stateUpdates.push(...hookUpdates);

  // Г3: збір метрики step_complete
  try { collectStepComplete(config, completedStep, state.cycle, artifactRegistered, updatedState.current_step, decision); } catch { /* non-blocking */ }

  // Г3: збір метрики gate_decision (auto-gate)
  if (decision) {
    try { collectGateDecision(config, completedStep, state.cycle, decision, true, "auto-derived", donePercent); } catch { /* non-blocking */ }
  }

  // Collect state update descriptions
  if (transition.nextStep) {
    stateUpdates.push(`current_step = ${transition.nextStep}`);
  }
  if (transition.block && transition.block !== updatedState.current_block) {
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
  const nextStepName = hasStep(nextStep)
    ? (STEP_NAMES[nextStep] ?? "")
    : `Unknown: ${nextStep}`;

  const data: CompleteData = {
    completed_step: completedStep,
    artifact_registered: artifactRegistered,
    next_step: nextStep,
    next_step_name: nextStepName,
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

  // Session boundary enforcement: heavy steps require fresh session
  // НЕ перезаписуємо awaiting_human_decision — людське рішення має пріоритет
  const completedStepDef = hasStep(completedStep) ? getStep(completedStep) : null;
  if (completedStepDef?.session_boundary && !transition.killed && !transition.completed) {
    data.session_boundary = true;
    if (updatedState.status !== "awaiting_human_decision") {
      nextAction = `⛔ SESSION_BOUNDARY: Крок ${completedStep} завершено. Цей крок потребує значного контексту — продовження в тій же сесії призведе до деградації якості. ЗУПИНІТЬСЯ і запустіть НОВУ СЕСІЮ для кроку ${nextStep}.`;
    } else {
      nextAction += ` ⛔ SESSION_BOUNDARY: Запустіть нову сесію.`;
    }
  }

  // Write signal file for Session Bridge — triggers new Cline session
  // Always write when there's a next step (not killed/completed)
  // awaiting_human_decision with auto_gates also gets a signal (handled in setAwaitingAndRespond)
  if (!transition.killed && !transition.completed
      && updatedState.status !== "awaiting_human_decision"
      && updatedState.status !== "blocked") {
    writeCompleteSignal(config, completedStep, nextStep, nextStepName, updatedState);
  }

  // BUG FIX: When transition itself sets awaiting_human_decision (e.g. D9→D1 ALWAYS),
  // setAwaitingAndRespond is never called, so writeGateSignal was never reached.
  // Write gate signal here for Session Bridge to auto-decide.
  if (!transition.killed && !transition.completed
      && updatedState.status === "awaiting_human_decision"
      && updatedState.auto_gates && config) {
    // OPT-15: Also record gate decision start time for timeout tracking
    state.gate_decision_started_at = new Date().toISOString();
    const gateStepDef = hasStep(nextStep) ? getStep(nextStep) : null;
    if (gateStepDef) {
      writeGateSignal(updatedState, config, gateStepDef);
    }
  }

  return {
    success: true,
    command: "complete",
    data,
    next_action: nextAction,
  };
}

// =============================================================================
// setAwaitingAndRespond — встановити awaiting_human_decision
// Для human_decision steps або fallback коли рішення не вдалося визначити
// =============================================================================

function setAwaitingAndRespond(
  state: SystemState,
  completedStep: SystemState["current_step"],
  artifactRegistered: string | null,
  stateUpdates: string[],
  stepDef: StepDefinition,
  escalationRationale?: string,
  config?: OrchestratorConfig,
): CLIOutput<CompleteData> {
  state.status = "awaiting_human_decision";
  state.last_completed_step = completedStep;
  // OPT-15: Record when gate decision waiting started
  state.gate_decision_started_at = new Date().toISOString();
  stateUpdates.push("status = awaiting_human_decision");

  const data: CompleteData = {
    completed_step: completedStep,
    artifact_registered: artifactRegistered,
    next_step: state.current_step,
    next_step_name: STEP_NAMES[state.current_step] ?? stepDef.name,
    state_updates: stateUpdates,
  };

  const reason = escalationRationale
    ? ` Причина ескалації: ${escalationRationale}`
    : "";

  // Auto-gates: write signal file for Session Bridge to auto-analyze and decide
  if (state.auto_gates && config) {
    writeGateSignal(state, config, stepDef, escalationRationale);
  }

  return {
    success: true,
    command: "complete",
    data,
    next_action: state.auto_gates
      ? `Очікує авто-рішення агента. Session Bridge запустить нову сесію для аналізу.${reason}`
      : `Очікує рішення людини. Заповніть файл рішення та виконайте \`decide\`.${reason}`,
  };
}

// =============================================================================
// deriveDecisionForStep — визначити рішення для autonomous/automatic steps
//
// D1 (autonomous):
//   - Перший цикл (gate_decision = null) → CONTINUE
//   - Наступні: читає minigate файл → рішення
//
// D1 (autonomous):
//   - ALWAYS → D2 (pass-through, rotation handled by hooks)
//   - No decision derivation needed — getNextStep handles ALWAYS transitions
//
// D9 (human_decision):
//   - Mini-GATE — handled by evaluateGate auto-gate, not deriveDecision
//
// V3 (human_decision):
//   - Validation decision — always requires human → handled by evaluateGate
//
// V2 (automatic_decision):
//   - Читає щойно зареєстрований артефакт як gate decision
//
// E1 (autonomous):
//   - Читає артефакт релізу як gate decision (READY/NOT_READY)
//
// S5 (autonomous):
//   - Завжди потребує рішення людини → null (fallback to awaiting)
// =============================================================================

function deriveDecisionForStep(
  state: SystemState,
  config: OrchestratorConfig,
  _stepDef: StepDefinition,
): string | null {
  switch (state.current_step) {
    // ── V2: Audit Decision (automatic) ──
    // Agent writes decision to artifact during step execution
    case "V2": {
      return tryReadDecisionFromLastArtifact(state, config);
    }

    // ── E1: Release Readiness ──
    // Agent writes verdict to artifact during step execution
    case "E1": {
      return tryReadDecisionFromLastArtifact(state, config);
    }

    // ── S5: Security Block closure ──
    // Always requires human decision → null
    case "S5":
      return null;

    default:
      return null;
  }
}

// =============================================================================
// tryReadDecisionFromLastArtifact — спроба прочитати рішення з last_artifact
// =============================================================================

function tryReadDecisionFromLastArtifact(
  state: SystemState,
  config: OrchestratorConfig,
): string | null {
  if (!state.last_artifact) return null;

  try {
    const absPath = resolveAbsolutePath(config.control_center_path, state.last_artifact);
    const decision = readGateDecision(absPath);
    if (isDecisionMade(decision)) {
      return String(decision.decision);
    }
  } catch {
    // Not a gate decision file or can't read → null
  }

  return null;
}

// =============================================================================
// writeGateSignal — записати сигнал для Session Bridge з аналітичним промптом
// Session Bridge запустить нову сесію Cline яка проаналізує і викличе decide
// =============================================================================

function writeGateSignal(
  state: SystemState,
  config: OrchestratorConfig,
  stepDef: StepDefinition,
  escalationRationale?: string,
): void {
  try {
    const fs = require("fs");
    const pathMod = require("path");
    const signalPath = pathMod.resolve(
      config.control_center_path, "system_state", "session_boundary.signal"
    );

    const step = state.current_step;
    const validDecisions = getValidDecisions(step);
    const artifactsList = buildArtifactsList(state);

    const promptLines = [
      `# Автоматичне прийняття рішення на гейті ${step}`,
      ``,
      `## Контекст`,
      `- Крок: **${step}** — ${stepDef.name}`,
      `- Блок: **${state.current_block}**`,
      `- Цикл: ${state.cycle}`,
      `- Статус: awaiting_human_decision`,
      escalationRationale ? `- Причина ескалації: ${escalationRationale}` : "",
      ``,
      `## Допустимі рішення`,
      `\`${validDecisions.join("` | `")}\``,
      ``,
      `## Артефакти для аналізу`,
      ...artifactsList,
      ``,
      `## Алгоритм`,
      `1. Прочитай артефакти зазначені вище`,
      `2. Проаналізуй стан проекту відносно критеріїв гейту`,
      buildGateSpecificGuidance(step),
      `3. Прийми обґрунтоване рішення`,
      `4. Виконай: \`npx ts-node src/orchestrator.ts decide <РІШЕННЯ>\``,
      ``,
      `## ВАЖЛИВО`,
      `- Ти МУСИШ викликати \`decide\` з одним із допустимих рішень`,
      `- Не пропускай аналіз — прочитай артефакти перед рішенням`,
      `- Якщо сумніваєшся — обирай консервативний варіант`,
    ].filter(Boolean).join("\n");

    const signal = JSON.stringify({
      prompt: promptLines,
      type: "gate_decision",
      gate_step: step,
      valid_decisions: validDecisions,
      block: state.current_block,
      cycle: state.cycle,
      timestamp: new Date().toISOString(),
    });

    fs.writeFileSync(signalPath, signal, "utf-8");
  } catch {
    // non-blocking: extension may not be installed
  }
}

function buildArtifactsList(state: SystemState): string[] {
  const lines: string[] = [];
  const artifacts = state.artifacts;
  if (!artifacts) return ["- Немає зареєстрованих артефактів"];

  for (const [key, value] of Object.entries(artifacts)) {
    if (value) {
      lines.push(`- **${key}**: \`${value}\``);
    }
  }
  return lines.length > 0 ? lines : ["- Немає зареєстрованих артефактів"];
}

function buildGateSpecificGuidance(step: string): string {
  switch (step) {
    case "L4":
      return [
        `   **L4 — Discovery Gate (GO/REWORK/KILL):**`,
        `   - GO: Discovery brief + design brief повні, market research зроблений, design identity визначена`,
        `   - REWORK: Є прогалини в discovery артефактах, потрібно доопрацювати`,
        `   - KILL: Ринковий аналіз показує що проект нежиттєздатний`,
      ].join("\n");
    case "GATE1":
      return [
        `   **GATE1 — Foundation Gate (GO/NO_GO/REWORK):**`,
        `   - GO: Всі P0 AC = PASS, completion_checklist без MISMATCH`,
        `   - REWORK: Є FAIL/PARTIAL серед P0 AC`,
        `   - NO_GO: Фундаментальні проблеми архітектури`,
      ].join("\n");
    case "D9":
      return [
        `   **D9 — Mini-GATE (CONTINUE/VALIDATE/AMEND_SPEC/KILL):**`,
        `   - CONTINUE: Є незавершені задачі, прогрес нормальний`,
        `   - VALIDATE: >80% задач виконано, готово до аудиту`,
        `   - AMEND_SPEC: Потрібна зміна специфікації`,
        `   - KILL: Прогрес незадовільний після багатьох циклів`,
      ].join("\n");
    case "S5":
      return [
        `   **S5 — Security Block Decision (FIX/ACCEPT_RISK/REWORK):**`,
        `   - FIX: Є security issues що потрібно виправити`,
        `   - ACCEPT_RISK: Ризики прийнятні, можна продовжити`,
        `   - REWORK: Потрібен повний security rework`,
      ].join("\n");
    default:
      return `   Проаналізуй артефакти та обери найкраще рішення.`;
  }
}

// =============================================================================
// writeCompleteSignal — записати сигнал для Session Bridge після complete
// Запускає нову сесію Cline для продовження з наступним кроком
// =============================================================================

function writeCompleteSignal(
  config: OrchestratorConfig,
  completedStep: string,
  nextStep: string,
  nextStepName: string,
  updatedState: SystemState,
): void {
  try {
    const fs = require("fs");
    const pathMod = require("path");
    const signalPath = pathMod.resolve(
      config.control_center_path, "system_state", "session_boundary.signal"
    );

    const nextStepDef = hasStep(nextStep) ? getStep(nextStep) : null;
    const nextStepRole = nextStepDef?.role || "";
    const nextStepNameStr = nextStepDef?.name || nextStepName || nextStep;
    const blockName = updatedState.current_block || "";
    const cycle = updatedState.cycle || "";
    const lastArtifact = updatedState.last_artifact || "";

    const promptLines = [
      `# Продовження роботи — автоматичний перезапуск сесії`,
      ``,
      `Попередній крок **${completedStep}** завершено успішно.`,
      lastArtifact ? `Артефакт: \`${lastArtifact}\`` : "",
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
      type: "step_complete",
      completed_step: completedStep,
      next_step: nextStep,
      next_step_name: nextStepNameStr,
      block: blockName,
      cycle,
      timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(signalPath, signal, "utf-8");
  } catch {
    // non-blocking: extension may not be installed
  }
}
