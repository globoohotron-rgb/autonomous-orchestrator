// =============================================================================
// Gate Decisions — decision routing (step + decision → next state)
// Конвертовано з: system_cycle.md → "Ворота (Gates) — зведення"
//              + std-gate-decision.md (Фаза 2 → переходи)
// =============================================================================
//
// Routing table (from "Ворота — зведення"):
// ┌──────────────────┬─────────────────────┬────────────────────────────────┐
// │ Ворота           │ Рішення             │ Перехід                        │
// ├──────────────────┼─────────────────────┼────────────────────────────────┤
// │ Entry Gate (L4)  │ GO                  │ → L5                          │
// │                  │ REWORK              │ → L2 (awaiting_human)         │
// │                  │ KILL                │ → cancelled                   │
// ├──────────────────┼─────────────────────┼────────────────────────────────┤
// │ GATE 1           │ GO                  │ → D1 (development_cycle)      │
// │                  │ REBUILD_PLAN        │ → L8 (foundation)             │
// │                  │ REBUILD_DESCRIPTION │ → L5 (discovery)              │
// │                  │ KILL                │ → cancelled                   │
// ├──────────────────┼─────────────────────┼────────────────────────────────┤
// │ D9 (Mini-GATE)   │ CONTINUE            │ → D1 (rotation) → D2          │
// │                  │ VALIDATE            │ → V0 (validation_cycle)       │
// │                  │ AMEND_SPEC          │ → D1 (rotation) → D2          │
// │                  │ KILL                │ → cancelled                   │
// ├──────────────────┼─────────────────────┼────────────────────────────────┤
// │ V3 (Validation)  │ CONTINUE            │ → D1 (development_cycle)      │
// │                  │ AMEND_SPEC          │ → D1 (development_cycle)      │
// │                  │ KILL                │ → cancelled                   │
// ├──────────────────┼─────────────────────┼────────────────────────────────┤
// │ V2 (Audit)       │ PASS                │ → E1 (linear_exit)            │
// │                  │ PASS_WITH_SECURITY  │ → awaiting (S-block rec.)     │
// │                  │ FAIL                │ → V3                          │
// ├──────────────────┼─────────────────────┼────────────────────────────────┤
// │ S5 (S-Block)     │ REPEAT              │ → S1                          │
// │                  │ VALIDATE            │ → V0 (validation_cycle)       │
// │                  │ STOP                │ → D1 (development_cycle)      │
// ├──────────────────┼─────────────────────┼────────────────────────────────┤
// │ E1 (Release)     │ D1                  │ → D1 (development_cycle)      │
// │                  │ KILL                │ → cancelled                   │
// └──────────────────┴─────────────────────┴────────────────────────────────┘
// =============================================================================

import type {
  Step,
  Block,
  Status,
  SystemState,
  EntryGateDecision,
  FoundationGateDecision,
  MiniGateDecision,
  V3Decision,
  SBlockDecision,
  ReleaseDecision,
} from "../types";

// =============================================================================
// Decision Route — result of routing a gate decision
// =============================================================================

/** Describes the state transition resulting from a gate decision */
export interface DecisionRoute {
  /** Decision value that was applied */
  decision: string;
  /** Target step to transition to */
  next_step: Step;
  /** Target block if cross-block transition */
  next_block?: Block;
  /** New status after transition */
  status: Status;
  /** State fields to update (applied by state machine) */
  state_updates: Partial<SystemState>;
  /** Human-readable description of the transition */
  message: string;
}

// =============================================================================
// V2 Audit Decision type (automatic, not human)
// =============================================================================

/** V2 audit result — determined by agent, not human */
export type AuditDecisionResult = "PASS" | "PASS_WITH_SECURITY" | "FAIL";

// =============================================================================
// Kill Route — reused across all gates
// =============================================================================

/** Cancellation route for any KILL decision */
function killRoute(currentStep: Step): DecisionRoute {
  return {
    decision: "KILL",
    next_step: currentStep,
    status: "cancelled",
    state_updates: {
      status: "cancelled",
    },
    message: "Проєкт скасовано за рішенням людини.",
  };
}

// =============================================================================
// L4 — Entry Gate (GO / REWORK / KILL)
// Source: system_cycle.md L4 + std-gate-decision.md Фаза 2
//
// GO → L5 (формування опису продукту)
// REWORK → L2 (людина доопрацьовує discovery_brief)
// KILL → cancelled
// =============================================================================

function routeEntryGate(decision: EntryGateDecision): DecisionRoute {
  switch (decision) {
    case "GO":
      return {
        decision: "GO",
        next_step: "L5",
        status: "in_progress",
        state_updates: {
          current_step: "L5",
          status: "in_progress",
        },
        message: "GO: перехід до формування опису продукту (L5).",
      };

    case "REWORK":
      // std-gate-decision.md: зберегти discovery_brief як discovery_brief_v[N].md,
      // status → awaiting_human_decision, людина оновлює discovery_brief.md
      return {
        decision: "REWORK",
        next_step: "L2",
        status: "awaiting_human_decision",
        state_updates: {
          current_step: "L2",
          status: "awaiting_human_decision",
        },
        message:
          "REWORK: Discovery Brief потребує доопрацювання. " +
          "Оновіть discovery_brief.md, потім змініть status на in_progress.",
      };

    case "KILL":
      return killRoute("L4");
  }
}

// =============================================================================
// GATE1 — Foundation Gate (GO / REBUILD_PLAN / REBUILD_DESCRIPTION / KILL)
// Source: system_cycle.md GATE1 + std-gate-decision.md Фаза 2
//
// GO → D1 (development_cycle, iteration reset to 0)
// REBUILD_PLAN → L8 (plan reset, product description kept)
// REBUILD_DESCRIPTION → L5 (rebuild product description in discovery)
// KILL → cancelled
// =============================================================================

function routeFoundationGate(decision: FoundationGateDecision): DecisionRoute {
  switch (decision) {
    case "GO":
      // std-gate-decision.md: iteration → 0
      return {
        decision: "GO",
        next_step: "D1",
        next_block: "development_cycle",
        status: "in_progress",
        state_updates: {
          current_block: "development_cycle",
          current_step: "D1",
          iteration: 0,
          status: "in_progress",
        },
        message: "GO: перехід до кола розвитку (D1).",
      };

    case "REBUILD_PLAN":
      // Plan is reset — agent forms new plan from scratch at L8
      return {
        decision: "REBUILD_PLAN",
        next_step: "L8",
        next_block: "foundation",
        status: "in_progress",
        state_updates: {
          current_block: "foundation",
          current_step: "L8",
          status: "in_progress",
        },
        message:
          "REBUILD_PLAN: скинути план і переформувати з нуля (L8). " +
          "Опис продукту зберігається.",
      };

    case "REBUILD_DESCRIPTION":
      // Rebuild product description from discovery
      return {
        decision: "REBUILD_DESCRIPTION",
        next_step: "L5",
        next_block: "discovery",
        status: "in_progress",
        state_updates: {
          current_block: "discovery",
          current_step: "L5",
          status: "in_progress",
        },
        message: "REBUILD_DESCRIPTION: переформувати опис продукту (L5).",
      };

    case "KILL":
      return killRoute("GATE1");
  }
}

// =============================================================================
// D9 — Mini-GATE (єдині ворота блоку D)
// Source: system_cycle.md D9 + "Ворота — зведення" (Mini-GATE row)
//
// MiniGateDecision = CONTINUE | VALIDATE | AMEND_SPEC | KILL
//
// CONTINUE → D1 (rotation at D1, then D1 ALWAYS → D2)
// VALIDATE → V0 (validation_cycle)
// AMEND_SPEC → D1 (rotation at D1, then D1 ALWAYS → D2)
// KILL → cancelled
// =============================================================================

function routeMiniGateDecision(decision: MiniGateDecision): DecisionRoute {
  switch (decision) {
    case "CONTINUE":
      // D9 → D1 (rotation happens at D1) → D2
      return {
        decision: "CONTINUE",
        next_step: "D1",
        status: "in_progress",
        state_updates: {
          current_step: "D1",
          status: "in_progress",
        },
        message: "CONTINUE: продовжити розробку (D1 → D2). Ротація артефактів виконується на D1.",
      };

    case "VALIDATE":
      return {
        decision: "VALIDATE",
        next_step: "V0",
        next_block: "validation_cycle",
        status: "in_progress",
        state_updates: {
          current_block: "validation_cycle",
          current_step: "V0",
          status: "in_progress",
        },
        message: "VALIDATE: перехід до валідації (V0).",
      };

    case "AMEND_SPEC":
      // Human has already updated final_view/; D9 → D1 (rotation) → D2
      return {
        decision: "AMEND_SPEC",
        next_step: "D1",
        status: "in_progress",
        state_updates: {
          current_step: "D1",
          status: "in_progress",
        },
        message:
          "AMEND_SPEC: специфікацію оновлено, продовження розробки (D1 → D2). " +
          "Ротація артефактів виконується на D1.",
      };

    case "KILL":
      return killRoute("D9");
  }
}

// =============================================================================
// V3 — Validation Decision (після FAIL аудиту)
// Source: system_cycle.md V3 + "Ворота — зведення"
//
// V3Decision = CONTINUE | AMEND_SPEC | KILL
//
// CONTINUE → D1 (development_cycle, rotation at D1, then D2)
// AMEND_SPEC → D1 (development_cycle, rotation at D1, then D2)
// KILL → cancelled
// =============================================================================

function routeV3Decision(decision: V3Decision): DecisionRoute {
  switch (decision) {
    case "CONTINUE":
      return {
        decision: "CONTINUE",
        next_step: "D1",
        next_block: "development_cycle",
        status: "in_progress",
        state_updates: {
          current_block: "development_cycle",
          current_step: "D1",
          status: "in_progress",
        },
        message: "CONTINUE: повернення до розробки (D1 → D2). Scope обмежений validation_conclusions.",
      };

    case "AMEND_SPEC":
      return {
        decision: "AMEND_SPEC",
        next_step: "D1",
        next_block: "development_cycle",
        status: "in_progress",
        state_updates: {
          current_block: "development_cycle",
          current_step: "D1",
          status: "in_progress",
        },
        message: "AMEND_SPEC: специфікацію оновлено, повернення до розробки (D1 → D2).",
      };

    case "KILL":
      return killRoute("V3");
  }
}

// =============================================================================
// V2 — Audit Decision (automatic, agent-driven)
// Source: system_cycle.md V2 + "Ворота — зведення" (Audit Decision row)
//
// NOT routed through `decide` CLI — determined by agent based on audit result.
// PASS (no security) → E1 (linear_exit)
// PASS_WITH_SECURITY → STOP, awaiting_human_decision (recommend S-block)
// FAIL → V3
// =============================================================================

function routeAuditDecision(decision: AuditDecisionResult): DecisionRoute {
  switch (decision) {
    case "PASS":
      return {
        decision: "PASS",
        next_step: "E1",
        next_block: "linear_exit",
        status: "in_progress",
        state_updates: {
          current_block: "linear_exit",
          current_step: "E1",
          status: "in_progress",
        },
        message: "PASS: аудит пройдено. Перехід до E1 (Release Readiness).",
      };

    case "PASS_WITH_SECURITY":
      // Security scan found in issues/active/ — recommend S-block before release
      return {
        decision: "PASS_WITH_SECURITY",
        next_step: "V2",
        status: "awaiting_human_decision",
        state_updates: {
          status: "awaiting_human_decision",
        },
        message:
          "PASS: аудит пройдено. Виявлено security_scan у issues/active/. " +
          "Рекомендовано запустити S-блок перед релізом. Ваше рішення?",
      };

    case "FAIL":
      return {
        decision: "FAIL",
        next_step: "V3",
        status: "in_progress",
        state_updates: {
          current_step: "V3",
          status: "in_progress",
        },
        message: "FAIL: аудит не пройдено. Перехід до V3 (HANSEI + validation conclusions).",
      };
  }
}

// =============================================================================
// S5 — S-Block Decision (REPEAT / VALIDATE / STOP)
// Source: system_cycle.md S5 + "Ворота — зведення" (S-Block Decision row)
//
// REPEAT → S1 (human does rescan, creates new security_scan_*.md)
// VALIDATE → V0 (validation_cycle)
// STOP → D1 (development_cycle) — return to D-block
// =============================================================================

function routeSBlockDecision(decision: SBlockDecision): DecisionRoute {
  switch (decision) {
    case "REPEAT":
      return {
        decision: "REPEAT",
        next_step: "S1",
        status: "in_progress",
        state_updates: {
          current_step: "S1",
          status: "in_progress",
        },
        message: "REPEAT: повторити S-блок (S1). Людина робить rescan.",
      };

    case "VALIDATE":
      return {
        decision: "VALIDATE",
        next_step: "V0",
        next_block: "validation_cycle",
        status: "in_progress",
        state_updates: {
          current_block: "validation_cycle",
          current_step: "V0",
          status: "in_progress",
        },
        message: "VALIDATE: перехід до валідації (V0).",
      };

    case "STOP":
      // Return to development cycle
      return {
        decision: "STOP",
        next_step: "D1",
        next_block: "development_cycle",
        status: "in_progress",
        state_updates: {
          current_block: "development_cycle",
          current_step: "D1",
          status: "in_progress",
        },
        message: "STOP: повернення до D-блоку (D1).",
      };
  }
}

// =============================================================================
// E1 — Release Decision (D1 / KILL)
// Source: system_cycle.md E1 → NOT_READY exits
//
// D1 → return to development_cycle (D1)
// KILL → cancelled
// =============================================================================

function routeReleaseDecision(decision: ReleaseDecision | "READY" | "NOT_READY"): DecisionRoute {
  switch (decision) {
    case "READY":
      return {
        decision: "READY",
        next_step: "E2",
        next_block: "linear_exit",
        status: "in_progress",
        state_updates: {
          current_step: "E2",
          status: "in_progress",
        },
        message: "READY: реліз готовий. Перехід до E2 (Product Ready).",
      };

    case "NOT_READY":
      return {
        decision: "NOT_READY",
        next_step: "E1",
        status: "awaiting_human_decision",
        state_updates: {
          status: "awaiting_human_decision",
        },
        message: "NOT_READY: реліз не готовий. Людина вирішує: D1 (новий цикл) або KILL.",
      };

    case "D1":
      return {
        decision: "D1",
        next_step: "D1",
        next_block: "development_cycle",
        status: "in_progress",
        state_updates: {
          current_block: "development_cycle",
          current_step: "D1",
          status: "in_progress",
        },
        message: "D1: повернення до development_cycle (D1).",
      };

    case "KILL":
      return killRoute("E1");
  }
}

// =============================================================================
// Main Dispatcher — route human gate decisions (via `decide` CLI)
// =============================================================================

/**
 * Route a human gate decision to its target state.
 * Returns null if the step is not a human gate step.
 *
 * ASSUMES decision value is already validated by protocol.ts/validateDecision().
 * Validation must happen BEFORE calling this function.
 *
 * Called by: commands/decide.ts after protocol Phase 2 validates the decision.
 */
export function routeGateDecision(
  step: Step,
  decision: string,
  _state: SystemState,
): DecisionRoute | null {
  switch (step) {
    case "L4":
      return routeEntryGate(decision as EntryGateDecision);
    case "GATE1":
      return routeFoundationGate(decision as FoundationGateDecision);
    case "D9":
      return routeMiniGateDecision(decision as MiniGateDecision);
    case "V3":
      return routeV3Decision(decision as V3Decision);
    case "V2":
      return routeAuditDecision(decision as AuditDecisionResult);
    case "S5":
      return routeSBlockDecision(decision as SBlockDecision);
    case "E1":
      return routeReleaseDecision(decision as ReleaseDecision);
    default:
      return null;
  }
}

// =============================================================================
// V2 Audit Routing — automatic gate (not via `decide` CLI)
// =============================================================================

/**
 * Route V2 audit decision result.
 * Called by V2 step execution, not by `decide` CLI command.
 *
 * V2 is automatic:
 *   1. Agent reads acceptance_report verdict (PASS/FAIL)
 *   2. If PASS → check issues/active/ for security_scan_*.md
 *      - Found → PASS_WITH_SECURITY (STOP + recommend S-block)
 *      - Not found → PASS (→ E1)
 *   3. If FAIL → V3
 */
export function routeAuditDecisionResult(
  decision: AuditDecisionResult,
): DecisionRoute {
  return routeAuditDecision(decision);
}

// =============================================================================
// Gate Step Classification
// =============================================================================

/** Steps where human gate decisions are routed (via `decide` CLI command) */
export const HUMAN_GATE_STEPS: readonly Step[] = [
  "L4", "GATE1", "D9", "V3", "S5", "E1",
];

/** V2 is an automatic gate (agent decides based on audit verdicts) */
export const AUTO_GATE_STEPS: readonly Step[] = ["V2"];

/** All steps participating in gate decision routing */
export const ALL_GATE_STEPS: readonly Step[] = [
  ...HUMAN_GATE_STEPS,
  ...AUTO_GATE_STEPS,
];

/** Check if a step supports human gate decision routing */
export function isHumanGateStep(step: Step): boolean {
  return (HUMAN_GATE_STEPS as readonly string[]).includes(step);
}

/** Check if a step has automatic gate routing */
export function isAutoGateStep(step: Step): boolean {
  return (AUTO_GATE_STEPS as readonly string[]).includes(step);
}
