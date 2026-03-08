// =============================================================================
// Lifecycle Hooks — cross-cutting logic that runs after specific transitions
//
// Problem solved: complete.ts and decide.ts both can resolve gate decisions
// (complete via auto-gate/deriveDecision, decide via human). Both need to:
//   D9 CONTINUE/AMEND_SPEC: rotate artifacts + increment cycle counter
//   D9 VALIDATE:            set isolation_mode + rotate V-keys (on V0 entry)
//   V2 FAIL:                increment validation_attempts
//   V3 CONTINUE/AMEND_SPEC: rotate artifacts + increment cycle counter + clear isolation
//   V3 KILL:                clear isolation_mode
//
// This module centralises that logic so it's never missed.
// =============================================================================

import type { SystemState, OrchestratorConfig, Step } from "../types";
import { incrementCycleCounter, incrementValidationAttempts, setIsolationMode } from "../state-machine";
import { rotateD1, rotateV0 } from "../artifacts/rotation";

// =============================================================================
// Constants
// =============================================================================

const ROTATION_DECISIONS = new Set(["CONTINUE", "AMEND_SPEC"]);

/** Max validation attempts before circuit breaker escalates to human */
export const MAX_VALIDATION_ATTEMPTS = 3;

// =============================================================================
// applyD1Hooks — artifact rotation + cycle increment on D9 or V3 decisions
//
// Called AFTER advanceState() when a D9 or V3 decision (CONTINUE/AMEND_SPEC)
// transitions the system to D1. D1 is now a pass-through (ALWAYS → D2),
// so rotation happens here when the decision gate advances.
//
// Returns list of stateUpdate descriptions for CLI output.
// =============================================================================

export function applyD1Hooks(
  completedStep: Step,
  decision: string | undefined,
  state: SystemState,
  config: OrchestratorConfig,
): string[] {
  const hookUpdates: string[] = [];

  // Only run on D9 or V3 with CONTINUE or AMEND_SPEC
  if (completedStep !== "D9" && completedStep !== "V3") return hookUpdates;
  if (!decision || !ROTATION_DECISIONS.has(decision)) return hookUpdates;

  // 1. Artifact rotation: prev_cycle ← current, current ← null
  try {
    const gateDecisionPath = state.artifacts?.gate_decision ?? null;
    const { result } = rotateD1(state, config.control_center_path, gateDecisionPath);
    hookUpdates.push(`rotation: ${result.archived.length} archived, ${result.skipped.length} skipped`);
  } catch {
    hookUpdates.push("rotation: FAILED (non-blocking)");
  }

  // 2. Cycle counter increment
  try {
    const updated = incrementCycleCounter(config, state);
    // Merge incremented cycle/iteration back into state (state is mutated by caller)
    state.cycle = updated.cycle;
    state.iteration = updated.iteration;
    hookUpdates.push(`cycle = ${updated.cycle}, iteration = ${updated.iteration}`);
  } catch {
    hookUpdates.push("cycle increment: FAILED (non-blocking)");
  }

  return hookUpdates;
}

// =============================================================================
// applyV0Hooks — isolation mode + V-key rotation on V0 entry
//
// Called AFTER advanceState() when entering V0 (from D9 VALIDATE or S5 VALIDATE).
// 1. Enable isolation_mode
// 2. Rotate V-keys if validation_attempts > 0 (re-entry)
// =============================================================================

export function applyV0Hooks(
  completedStep: Step,
  decision: string | undefined,
  state: SystemState,
  config: OrchestratorConfig,
): string[] {
  const hookUpdates: string[] = [];

  // Trigger on transitions that land on V0
  // D9 VALIDATE → V0, S5 VALIDATE → V0
  const goesToV0 =
    (completedStep === "D9" && decision === "VALIDATE") ||
    (completedStep === "S5" && decision === "VALIDATE");
  if (!goesToV0) return hookUpdates;

  // 1. Enable isolation mode
  try {
    const updated = setIsolationMode(state, true);
    state.isolation_mode = updated.isolation_mode;
    hookUpdates.push("isolation_mode = true");
  } catch {
    hookUpdates.push("isolation_mode: FAILED (non-blocking)");
  }

  // 2. V-key rotation only on re-entry (validation_attempts > 0)
  if ((state.validation_attempts ?? 0) > 0) {
    try {
      const { result } = rotateV0(state, config.control_center_path);
      hookUpdates.push(`V0 rotation: ${result.archived.length} archived, ${result.skipped.length} skipped`);
    } catch {
      hookUpdates.push("V0 rotation: FAILED (non-blocking)");
    }
  }

  return hookUpdates;
}

// =============================================================================
// applyV2Hooks — increment validation_attempts on V2 FAIL
//
// Called AFTER advanceState() when V2 produces FAIL decision.
// =============================================================================

export function applyV2Hooks(
  completedStep: Step,
  decision: string | undefined,
  state: SystemState,
  _config: OrchestratorConfig,
): string[] {
  const hookUpdates: string[] = [];

  if (completedStep !== "V2") return hookUpdates;
  if (decision !== "FAIL") return hookUpdates;

  // Increment validation_attempts
  try {
    const updated = incrementValidationAttempts(state);
    state.validation_attempts = updated.validation_attempts;
    hookUpdates.push(`validation_attempts = ${updated.validation_attempts}`);
  } catch {
    hookUpdates.push("validation_attempts increment: FAILED (non-blocking)");
  }

  return hookUpdates;
}

// =============================================================================
// applyV3Hooks — clear isolation_mode when V3 decides
//
// Called AFTER advanceState() when V3 decision is applied.
// V3 is now a gate step with decisions (CONTINUE/AMEND_SPEC/KILL).
// =============================================================================

export function applyV3Hooks(
  completedStep: Step,
  _decision: string | undefined,
  state: SystemState,
  _config: OrchestratorConfig,
): string[] {
  const hookUpdates: string[] = [];

  if (completedStep !== "V3") return hookUpdates;

  // Clear isolation mode
  try {
    const updated = setIsolationMode(state, false);
    state.isolation_mode = updated.isolation_mode;
    hookUpdates.push("isolation_mode = false");
  } catch {
    hookUpdates.push("isolation_mode clear: FAILED (non-blocking)");
  }

  return hookUpdates;
}

// =============================================================================
// applyAllHooks — run all lifecycle hooks for a completed step
//
// Single entry point: complete.ts and decide.ts call this instead of
// individual hooks. Returns combined list of state updates.
// =============================================================================

export function applyAllHooks(
  completedStep: Step,
  decision: string | undefined,
  state: SystemState,
  config: OrchestratorConfig,
): string[] {
  return [
    ...applyD1Hooks(completedStep, decision, state, config),
    ...applyV0Hooks(completedStep, decision, state, config),
    ...applyV2Hooks(completedStep, decision, state, config),
    ...applyV3Hooks(completedStep, decision, state, config),
  ];
}

// =============================================================================
// checkCircuitBreaker — prevent infinite validation loops
//
// Called BEFORE processing D1 VALIDATE decisions. If validation_attempts >= MAX,
// returns a warning message for the human instead of auto-validating.
// =============================================================================

export function checkCircuitBreaker(
  state: SystemState,
): { blocked: boolean; message: string } {
  const attempts = state.validation_attempts ?? 0;
  if (attempts >= MAX_VALIDATION_ATTEMPTS) {
    return {
      blocked: true,
      message:
        `⚠️ Circuit breaker: ${attempts} validation спроб без PASS. ` +
        `Ліміт ${MAX_VALIDATION_ATTEMPTS} досягнуто. ` +
        `Рішення потрібне від людини: CONTINUE (ще раз допрацювати), ` +
        `VALIDATE (примусово спробувати), або KILL.`,
    };
  }
  return { blocked: false, message: "" };
}
