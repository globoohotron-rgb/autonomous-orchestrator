// =============================================================================
// Command: instructions — інструкції для поточного кроку
// Конвертовано з: orchestrator.template.md → Module 1 dispatch
// Повертає InstructionsData з resolved inputs, algorithm, constraints.
// =============================================================================

import * as path from "path";
import type {
  SystemState,
  OrchestratorConfig,
  CLIOutput,
  InstructionsData,
  ResolvedInput,
  InputReference,
} from "../types";
import { STEP_NAMES, AGENT_ROLES } from "../types";
import { getStep, hasStep } from "../step-registry";
import { getArtifactPath } from "../artifacts/manager";
import { isPlanStep } from "../validators/censure-gate";
import { generateCensureHints } from "../validators/censure-hints";
import { getLastCycleSummary } from "../learning/cycle-report-summary";

// =============================================================================
// Шляхи що тепер вбудовані в код (standards/ та system_cycle.md видалені)
// =============================================================================

const EMBEDDED_PATTERNS = [
  "standards/",
  "control_center/standards/",
  "docs/system_cycle.md",
  "control_center/docs/system_cycle.md",
];

function isEmbeddedPath(p: string): boolean {
  return EMBEDDED_PATTERNS.some((pat) =>
    p === pat || p.startsWith(pat) || p.includes("/standards/")
  );
}

// =============================================================================
// handleInstructions — головна функція
// =============================================================================

/**
 * Обробник команди `instructions`.
 *
 * Повертає повну інструкцію для виконання поточного кроку:
 * - role (AgentRole): яку роль агент має прийняти
 * - purpose: призначення кроку
 * - inputs: розрезолвлені входи (artifact → path, file → path)
 * - algorithm: кроки алгоритму
 * - constraints: обмеження/заборони
 * - artifact_path: шаблон шляху вихідного артефакту
 * - isolation_required: чи потрібна ізоляція контексту (V-блок)
 *
 * Помилки:
 * - BLOCKED: status = "blocked"
 * - STEP_NOT_FOUND: невідомий крок (H-EH-06)
 */
export function handleInstructions(
  state: SystemState,
  config: OrchestratorConfig,
): CLIOutput<InstructionsData> {
  // ── Blocked → BLOCKED error ──
  if (state.status === "blocked") {
    return {
      success: false,
      command: "instructions",
      error: "BLOCKED",
      message: `Система заблокована (JIDOKA) на кроці ${state.current_step}. Вирішіть блокер вручну.`,
    };
  }

  // ── Step not found → STEP_NOT_FOUND error (H-EH-06) ──
  if (!hasStep(state.current_step)) {
    return {
      success: false,
      command: "instructions",
      error: "STEP_NOT_FOUND",
      message: `Крок '${state.current_step}' не знайдено в реєстрі кроків.`,
    };
  }

  const stepDef = getStep(state.current_step);
  const role = AGENT_ROLES[stepDef.role];

  // ── Resolve inputs ──
  const resolvedInputs = stepDef.inputs.map((input) =>
    resolveInput(input, state, config),
  );

  // ── Resolve artifact paths ──
  let artifactPath: string | null = null;
  let additionalArtifactPaths: string[] | undefined;

  if (stepDef.artifact) {
    artifactPath = stepDef.artifact.path_pattern;
  }

  if (stepDef.additional_artifacts && stepDef.additional_artifacts.length > 0) {
    additionalArtifactPaths = stepDef.additional_artifacts.map(
      (a) => a.path_pattern,
    );
  }

  // ── Build InstructionsData ──
  const data: InstructionsData = {
    step: state.current_step,
    name: STEP_NAMES[state.current_step] ?? stepDef.name,
    role,
    purpose: stepDef.purpose,
    inputs: resolvedInputs,
    algorithm: stepDef.algorithm,
    constraints: stepDef.constraints,
    artifact_path: artifactPath,
    additional_artifact_paths: additionalArtifactPaths,
    isolation_required: stepDef.isolation_required,
    isolation_message: stepDef.isolation_message,
  };

  // ── OPT-2: Censure Hints for plan steps (D3, L8) ──
  // Додає обов'язкові секції + історію порушень у prompt
  if (isPlanStep(state.current_step)) {
    try {
      const hints = generateCensureHints(config, state.project_name);
      data.censure_hints = hints.prompt_block;
    } catch { /* non-blocking — hints are advisory */ }
  }

  // ── OPT-18: Cycle Report Feedback Loop for D2/D3 ──
  // Додає summary останніх циклів (completion trend, bottlenecks, censure rate)
  if (["D2", "D3"].includes(state.current_step)) {
    try {
      const cycleSummary = getLastCycleSummary(config, 3);
      if (cycleSummary) data.cycle_history_summary = cycleSummary;
    } catch { /* non-blocking — summary is advisory */ }
  }

  return {
    success: true,
    command: "instructions",
    data,
    next_action: buildNextAction(state, stepDef.type),
  };
}

// =============================================================================
// resolveInput — InputReference → ResolvedInput
// Розрезолвлює шлях до входу на основі джерела (artifact, file, directory, state)
// =============================================================================

function resolveInput(
  input: InputReference,
  state: SystemState,
  config: OrchestratorConfig,
): ResolvedInput {
  let resolvedPath: string | null = null;

  switch (input.source) {
    case "artifact": {
      // Шлях беремо з state.artifacts[key] (єдине джерело правди)
      if (input.artifact_key) {
        resolvedPath = getArtifactPath(state, input.artifact_key);
      }
      break;
    }

    case "file":
    case "directory": {
      // Фіксований шлях — resolve відносно project_root
      // Шляхи до видалених стандартів → позначити як вбудовані
      if (input.path && isEmbeddedPath(input.path)) {
        resolvedPath = "(вбудовано в код оркестратора)";
      } else if (input.path) {
        resolvedPath = path.resolve(config.project_root, input.path);
      }
      break;
    }

    case "state": {
      // Значення поля з state.json
      if (input.field) {
        const value = state[input.field];
        resolvedPath =
          value !== null && value !== undefined ? String(value) : null;
      }
      break;
    }
  }

  return {
    description: input.description,
    path: resolvedPath,
    required: input.required,
  };
}

// =============================================================================
// buildNextAction — підказка на основі типу кроку
// =============================================================================

function buildNextAction(
  state: SystemState,
  stepType: string,
): string {
  if (state.status === "awaiting_human_decision") {
    return "Очікує рішення людини. Заповніть файл рішення та виконайте `decide`.";
  }

  if (stepType === "human_decision") {
    return "Створіть артефакт рішення воріт і виконайте `complete --artifact <path>`.";
  }

  return "Виконайте крок згідно алгоритму та виконайте `complete --artifact <path>`.";
}
