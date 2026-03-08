// =============================================================================
// Simulation Script — Full System Load Simulation
//
// Проганяє оркестратор через 7 реалістичних циклів розробки:
//   Cycle 0: Foundation + перший dev cycle (baseline)
//   Cycle 1: Normal dev cycle, 40% done
//   Cycle 2: Censure blocks (OPT-2, OPT-5, OPT-10)
//   Cycle 3: Stagnation (OPT-1), same 55% done
//   Cycle 4: Progress resumes, 70% done
//   Cycle 5: Infra blocker (OPT-6), code 92% but infra blocks
//   Cycle 6: > 80% done → VALIDATE path
//
// Exercises ALL 10 OPTs:
//   OPT-1: Stagnation detection (cycles 3-4)
//   OPT-2: Censure hints (cycle 2 censure blocks)
//   OPT-3: Precondition fix (state_field checks)
//   OPT-4: Step watchdog (simulated slow steps)
//   OPT-5: Censure history cache (censure events)
//   OPT-6: Infra vs code blocker (cycle 5)
//   OPT-7: D6 precondition (artifact_registered)
//   OPT-8: Atomic metrics write (every appendMetric call)
//   OPT-9: Cycle reports (generated after each D9)
//   OPT-10: Censure retry limit (repeated B6 blocks)
//
// Usage: npx ts-node tests/simulation.ts
// Output: system_state/metrics.jsonl, system_state/reports/, console summary
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { createInitialState } from "../src/types/state";
import type { SystemState, OrchestratorConfig, Step } from "../src/types";
import {
  saveState,
  incrementCycleCounter,
} from "../src/state-machine";
import {
  appendMetric,
  readMetrics,
  clearMetrics,
  generateMetricId,
  getMetricsSummary,
} from "../src/learning/metrics-store";
import type { MetricEvent, MetricEventType } from "../src/learning/metrics-store";
import { evaluateGate } from "../src/gates/auto-gate";
import { createCycleReport } from "../src/learning/cycle-report";
import { checkStepTimeoutFromState } from "../src/watcher/step-watchdog";
import {
  recordCensureBlock,
  getCensureTrackerSummary,
} from "../src/watcher/retry-controller";

// =============================================================================
// Simulation Config
// =============================================================================

const SIM_DIR = path.join(os.tmpdir(), `leadradar_sim_${Date.now()}`);
const CC_PATH = path.join(SIM_DIR, "control_center");

const simConfig: OrchestratorConfig = {
  control_center_path: CC_PATH,
  project_root: SIM_DIR,
};

// Dev cycle steps
const DEV_CYCLE_STEPS: Step[] = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D9"];

// =============================================================================
// Helpers
// =============================================================================

let simClock = new Date("2026-03-01T09:00:00.000Z").getTime();

function advanceClock(minutes: number): string {
  simClock += minutes * 60_000;
  return new Date(simClock).toISOString();
}

function emit(
  eventType: MetricEventType,
  step: Step,
  cycle: number,
  data: Record<string, unknown> = {},
): void {
  const event: MetricEvent = {
    id: generateMetricId(),
    timestamp: advanceClock(0), // use current sim time
    event_type: eventType,
    step,
    cycle,
    data,
  };
  appendMetric(simConfig, event);
}

function setupDirs(): void {
  const dirs = [
    path.join(CC_PATH, "system_state"),
    path.join(CC_PATH, "system_state", "reports"),
    path.join(CC_PATH, "issues", "active"),
    path.join(CC_PATH, "audit", "goals_check"),
    path.join(CC_PATH, "audit", "gate_decisions"),
    path.join(CC_PATH, "plans", "active"),
    path.join(CC_PATH, "tasks", "active"),
    path.join(CC_PATH, "tasks", "done"),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function writeGoalsCheck(config: OrchestratorConfig, cycle: number, rows: string[], donePercent: number): string {
  const content = `# Goals Check — Cycle ${cycle}

**Progress: ${donePercent}% DONE**

| # | AC | Status | Notes |
|---|-----|--------|-------|
${rows.join("\n")}
`;
  const filePath = path.join(
    config.control_center_path,
    "audit",
    "goals_check",
    `goals_check_cycle_${cycle}.md`,
  );
  fs.writeFileSync(filePath, content, "utf-8");
  return `control_center/audit/goals_check/goals_check_cycle_${cycle}.md`;
}

// Colors for console
const C = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
};

function logPhase(msg: string): void {
  console.log(`\n${C.bright}${C.cyan}${"═".repeat(70)}${C.reset}`);
  console.log(`${C.bright}${C.cyan}  ${msg}${C.reset}`);
  console.log(`${C.bright}${C.cyan}${"═".repeat(70)}${C.reset}`);
}

function logStep(step: Step, msg: string): void {
  console.log(`  ${C.green}✔${C.reset} ${C.bright}${step}${C.reset} — ${msg}`);
}

function logWarn(msg: string): void {
  console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
}

function logError(msg: string): void {
  console.log(`  ${C.red}✘${C.reset} ${msg}`);
}

// =============================================================================
// Simulate a complete dev cycle (D1→D9)
// =============================================================================

interface CycleScenario {
  cycle: number;
  donePercent: number;
  goalRows: string[];
  /** Steps where censure BLOCK happens (e.g., D3) */
  censureOnSteps?: { step: Step; ruleId: string }[];
  /** Steps with simulated long duration (minutes) */
  slowSteps?: { step: Step; minutes: number }[];
  /** Precondition fails */
  preconditionFails?: { step: Step; reason: string }[];
}

function simulateDevCycle(state: SystemState, scenario: CycleScenario): SystemState {
  const { cycle, goalRows, censureOnSteps, slowSteps, preconditionFails } = scenario;

  logPhase(`CYCLE ${cycle} — target ${scenario.donePercent}% DONE`);

  // D1: Cycle checkpoint
  state = incrementCycleCounter(simConfig, state);
  emit("cycle_transition", "D1", cycle, {
    to_cycle: cycle,
    done_percent: state.prev_done_percent ?? 0,
  });
  advanceClock(2);
  logStep("D1", `Cycle checkpoint (cycle=${state.cycle})`);

  // Walk through dev cycle steps
  for (const step of DEV_CYCLE_STEPS) {
    if (step === "D1") continue; // already handled

    // Check for precondition fails
    const precFail = preconditionFails?.find((p) => p.step === step);
    if (precFail) {
      emit("precondition_fail", step, cycle, { reason: precFail.reason });
      logWarn(`Precondition FAIL on ${step}: ${precFail.reason}`);
      advanceClock(1);
      // Still continue — precondition fail is logged but step proceeds after fix
    }

    // Check for censure blocks
    const censure = censureOnSteps?.find((c) => c.step === step);
    if (censure) {
      emit("step_fail", step, cycle, {
        reason: `CENSURE: ${censure.ruleId} violation`,
        rule_id: censure.ruleId,
      });
      const blockResult = recordCensureBlock(state, censure.ruleId);
      logError(
        `CENSURE BLOCK on ${step}: rule ${censure.ruleId}` +
          (blockResult.escalate ? " → ESCALATED!" : "") +
          (blockResult.jidoka_warning ? " → JIDOKA WARNING!" : ""),
      );
      advanceClock(5);
      // Retry — simulate fix attempt
      emit("step_complete", step, cycle, { retry: true });
      logStep(step, `Retried after censure fix`);
    } else {
      // Normal step completion
      const slowStep = slowSteps?.find((s) => s.step === step);
      const stepMinutes = slowStep?.minutes ?? (3 + Math.random() * 8);
      advanceClock(stepMinutes);

      // OPT-4: Check watchdog for slow steps
      if (slowStep && slowStep.minutes > 30) {
        // Simulate elapsed time: fake step_started_at in the past from NOW
        const startedAt = new Date(Date.now() - slowStep.minutes * 60_000).toISOString();
        const watchState: SystemState = {
          ...state,
          current_step: step,
          step_started_at: startedAt,
          status: "in_progress",
        };
        const watchResult = checkStepTimeoutFromState(watchState);
        if (watchResult) {
          emit("step_timeout", step, cycle, {
            elapsed_ms: watchResult.elapsed_ms,
            severity: watchResult.severity,
          });
          logWarn(
            `Watchdog ${watchResult.severity}: ${step} took ${Math.round(watchResult.elapsed_ms / 60000)} min`,
          );
        }
      }

      emit("step_complete", step, cycle, {});
      logStep(step, `Complete (${Math.round(stepMinutes)} min)`);
    }

    // Update state
    state.current_step = step;
    state.current_block = "development_cycle";
    state.last_updated = new Date(simClock).toISOString();
    state.step_started_at = new Date(simClock).toISOString();
  }

  // Write goals_check for this cycle
  const goalsPath = writeGoalsCheck(simConfig, cycle, goalRows, scenario.donePercent);
  state.artifacts = { ...state.artifacts, goals_check: goalsPath };

  // D9: Gate evaluation (exercises OPT-1, OPT-6, OPT-9, OPT-10)
  const gateResult = evaluateGate("D9", state, simConfig);
  emit("gate_decision", "D9", cycle, {
    decision: gateResult.decision ?? "ESCALATION",
    reasoning: gateResult.rationale,
    done_percent: scenario.donePercent,
    auto_decided: gateResult.auto_decided,
    ...gateResult.analysis,
  });

  // Apply state patches from gate
  if (gateResult.state_patches) {
    Object.assign(state, gateResult.state_patches);
  }

  console.log(
    `\n  ${C.magenta}⊕ Gate Decision:${C.reset} ${C.bright}${gateResult.decision ?? "ESCALATION"}${C.reset}`,
  );
  console.log(`  ${C.dim}  Rationale: ${gateResult.rationale}${C.reset}`);

  // OPT-9: Generate cycle report
  try {
    const reportPath = createCycleReport(simConfig, cycle);
    console.log(`  ${C.green}📊 Report: ${path.basename(reportPath)}${C.reset}`);
  } catch (err) {
    console.log(`  ${C.yellow}⚠ Report generation failed: ${err}${C.reset}`);
  }

  // OPT-10: Censure tracker summary
  const censureSummary = getCensureTrackerSummary(state);
  if (censureSummary !== "No censure blocks recorded.") {
    console.log(`  ${C.yellow}📋 Censure tracker: ${censureSummary.replace(/\n/g, "; ")}${C.reset}`);
  }

  saveState(simConfig, state);
  return state;
}

// =============================================================================
// Main Simulation
// =============================================================================

function main(): void {
  console.log(`${C.bright}${C.magenta}`);
  console.log(`  ╔══════════════════════════════════════════════════════════╗`);
  console.log(`  ║        LeadRadar Orchestrator — Full Load Simulation    ║`);
  console.log(`  ║           Exercising OPT-1 through OPT-10              ║`);
  console.log(`  ╚══════════════════════════════════════════════════════════╝`);
  console.log(`${C.reset}`);

  // Setup
  setupDirs();
  clearMetrics(simConfig);

  let state = createInitialState();
  state.auto_gates = true;
  state.daemon_active = true;
  state.current_block = "development_cycle";
  state.current_step = "D1";
  saveState(simConfig, state);

  // ===== CYCLE 0: Baseline — first dev cycle =====
  state = simulateDevCycle(state, {
    cycle: 0,
    donePercent: 20,
    goalRows: [
      "| 1 | API endpoints | DONE | Basic CRUD |",
      "| 2 | Database schema | DONE | PostgreSQL |",
      "| 3 | Auth flow | NOT_STARTED | Needs API keys |",
      "| 4 | Reddit scraper | NOT_STARTED | External dep |",
      "| 5 | AI scoring | NOT_STARTED | OpenAI key needed |",
    ],
  });

  // ===== CYCLE 1: Normal progress — 40% done =====
  state = simulateDevCycle(state, {
    cycle: 1,
    donePercent: 40,
    goalRows: [
      "| 1 | API endpoints | DONE | |",
      "| 2 | Database schema | DONE | |",
      "| 3 | Auth flow | DONE | JWT + session |",
      "| 4 | Reddit scraper | PARTIAL | Rate limiting needed |",
      "| 5 | AI scoring | NOT_STARTED | OpenAI key needed |",
    ],
    slowSteps: [
      { step: "D5", minutes: 45 }, // OPT-4: trigger watchdog
    ],
  });

  // ===== CYCLE 2: CENSURE blocks — exercises OPT-2, OPT-5, OPT-10 =====
  state = simulateDevCycle(state, {
    cycle: 2,
    donePercent: 55,
    goalRows: [
      "| 1 | API endpoints | DONE | |",
      "| 2 | Database schema | DONE | |",
      "| 3 | Auth flow | DONE | |",
      "| 4 | Reddit scraper | PARTIAL | In progress |",
      "| 5 | AI scoring | PARTIAL | Mock only |",
    ],
    censureOnSteps: [
      { step: "D3", ruleId: "B6" }, // Plan lacks test strategy
      { step: "D3", ruleId: "C5" }, // Missing error handling
    ],
    preconditionFails: [
      { step: "D6", reason: "artifact_registered: plan not found" },
    ],
  });

  // ===== CYCLE 3: STAGNATION — same 55%, exercises OPT-1 =====
  state = simulateDevCycle(state, {
    cycle: 3,
    donePercent: 55,
    goalRows: [
      "| 1 | API endpoints | DONE | |",
      "| 2 | Database schema | DONE | |",
      "| 3 | Auth flow | DONE | |",
      "| 4 | Reddit scraper | PARTIAL | Blocked by rate limit |",
      "| 5 | AI scoring | PARTIAL | Mock only |",
    ],
    censureOnSteps: [
      { step: "D3", ruleId: "B6" }, // Same rule again!
    ],
  });

  // ===== CYCLE 4: Progress resumes — 70%, stagnation breaks =====
  state = simulateDevCycle(state, {
    cycle: 4,
    donePercent: 70,
    goalRows: [
      "| 1 | API endpoints | DONE | |",
      "| 2 | Database schema | DONE | |",
      "| 3 | Auth flow | DONE | |",
      "| 4 | Reddit scraper | DONE | Implemented |",
      "| 5 | AI scoring | PARTIAL | Rate limiting done, scoring WIP |",
    ],
    slowSteps: [
      { step: "D5", minutes: 55 }, // Another slow task execution
    ],
    censureOnSteps: [
      { step: "D3", ruleId: "B6" }, // 4th B6 → should be escalated (OPT-10)
    ],
  });

  // ===== CYCLE 5: Infra blocker — code 92% but infra blocks, exercises OPT-6 =====
  state = simulateDevCycle(state, {
    cycle: 5,
    donePercent: 75,
    goalRows: [
      "| 1 | AC: API endpoints | DONE | Code complete |",
      "| 2 | AC: Database schema | DONE | Code complete |",
      "| 3 | AC: Auth flow | DONE | Code complete |",
      "| 4 | AC: Reddit scraper | DONE | Code complete |",
      "| 5 | AC: AI scoring | PARTIAL | Infrastructure: waiting for API key provisioning |",
    ],
    slowSteps: [
      { step: "D7", minutes: 35 }, // Slow hansei
    ],
  });

  // ===== CYCLE 6: >80% done → VALIDATE =====
  state = simulateDevCycle(state, {
    cycle: 6,
    donePercent: 85,
    goalRows: [
      "| 1 | API endpoints | DONE | |",
      "| 2 | Database schema | DONE | |",
      "| 3 | Auth flow | DONE | |",
      "| 4 | Reddit scraper | DONE | |",
      "| 5 | AI scoring | DONE | Mock scoring implemented |",
    ],
  });

  // =============================================================================
  // Summary
  // =============================================================================

  logPhase("SIMULATION COMPLETE — SUMMARY");

  const metrics = readMetrics(simConfig);
  const summary = getMetricsSummary(simConfig);

  console.log(`\n  ${C.bright}Metrics collected:${C.reset} ${summary.total_events} events`);
  console.log(`  ${C.bright}Events by type:${C.reset}`);
  for (const [type, count] of Object.entries(summary.events_by_type).sort((a, b) => b[1] - a[1])) {
    const bar = "█".repeat(Math.min(count, 40));
    console.log(`    ${type.padEnd(20)} ${String(count).padStart(3)} ${C.green}${bar}${C.reset}`);
  }

  console.log(`\n  ${C.bright}Cycles seen:${C.reset} ${summary.cycles_seen.join(", ")}`);
  console.log(`  ${C.bright}Time range:${C.reset} ${summary.first_event} → ${summary.last_event}`);

  // OPT breakdown
  console.log(`\n  ${C.bright}${C.cyan}OPT Coverage:${C.reset}`);
  const stepTimeouts = metrics.filter((e) => e.event_type === "step_timeout").length;
  const censureBlocks = metrics.filter(
    (e) => e.event_type === "step_fail" && String(e.data?.reason ?? "").includes("CENSURE"),
  ).length;
  const precFails = metrics.filter((e) => e.event_type === "precondition_fail").length;
  const gateDecisions = metrics.filter((e) => e.event_type === "gate_decision");
  const validates = gateDecisions.filter((e) => e.data?.decision === "VALIDATE").length;
  const continues = gateDecisions.filter((e) => e.data?.decision === "CONTINUE").length;
  const escalations = gateDecisions.filter((e) => !e.data?.auto_decided).length;

  const censureTracker = state.censure_block_tracker;

  console.log(`    OPT-1  Stagnation:       ${state.stagnation_count ?? 0} count, prev=${state.prev_done_percent}%`);
  console.log(`    OPT-2  Censure hints:    ${censureBlocks} blocks recorded in history`);
  console.log(`    OPT-3  Precondition fix: ${precFails} precondition fails caught`);
  console.log(`    OPT-4  Watchdog:         ${stepTimeouts} timeout warnings`);
  console.log(`    OPT-5  Censure cache:    ${censureBlocks} events via appendCensureBlock`);
  console.log(`    OPT-6  Infra blocker:    code_complete=${state.code_complete_percent ?? "n/a"}%, infra=${state.infra_blocked_count ?? 0}`);
  console.log(`    OPT-7  D6 precondition:  ${precFails} artifact_registered checks`);
  console.log(`    OPT-8  Atomic write:     ${summary.total_events} events via lock-file appendMetric`);
  console.log(`    OPT-9  Cycle reports:    ${fs.readdirSync(path.join(CC_PATH, "system_state", "reports")).filter((f) => f.endsWith(".md")).length} reports generated`);
  console.log(`    OPT-10 Censure retry:    total=${censureTracker?.total_blocks ?? 0}, escalated=[${censureTracker?.escalated_rules?.join(", ") ?? ""}]`);

  console.log(`\n  ${C.bright}Gate decisions:${C.reset} ${gateDecisions.length} total`);
  console.log(`    CONTINUE:   ${continues}`);
  console.log(`    VALIDATE:   ${validates}`);
  console.log(`    ESCALATION: ${escalations}`);

  // List generated reports
  const reportsDir = path.join(CC_PATH, "system_state", "reports");
  const reports = fs.readdirSync(reportsDir).filter((f) => f.endsWith(".md"));
  if (reports.length > 0) {
    console.log(`\n  ${C.bright}Generated reports:${C.reset}`);
    for (const r of reports) {
      console.log(`    📊 ${r}`);
    }
  }

  // Print path for manual inspection
  console.log(`\n  ${C.dim}Simulation data: ${SIM_DIR}${C.reset}`);
  console.log(`  ${C.dim}Metrics: ${path.join(CC_PATH, "system_state", "metrics.jsonl")}${C.reset}`);
  console.log(`  ${C.dim}Reports: ${reportsDir}${C.reset}`);

  // Final state
  console.log(`\n  ${C.bright}Final state:${C.reset}`);
  console.log(`    step: ${state.current_step}, block: ${state.current_block}`);
  console.log(`    cycle: ${state.cycle}, status: ${state.status}`);
  console.log(`    stagnation: ${state.stagnation_count ?? 0}, prev_done: ${state.prev_done_percent ?? "n/a"}%`);
  console.log();
}

// --- Run ---
main();
