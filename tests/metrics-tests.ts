// =============================================================================
// Tests — Metrics (Горизонт 3, Фаза 1)
//
// 8 тестових сценаріїв:
//   1. Metrics Store — append + read
//   2. Metrics Store — filtering
//   3. Metrics Store — summary
//   4. Metrics Store — clear
//   5. Metrics Store — malformed lines resilient
//   6. Metrics Collector — all 7 collectors
//   7. Analyze command — metrics subcommand
//   8. Analyze command — clear subcommand
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  appendMetric,
  readMetrics,
  getMetricsSummary,
  clearMetrics,
  generateMetricId,
} from "../src/learning/metrics-store";
import type { MetricEvent } from "../src/learning/metrics-store";
import {
  collectStepComplete,
  collectStepFail,
  collectGateDecision,
  collectJidokaStop,
  collectCodeHealth,
  collectPreconditionFail,
  collectCycleTransition,
} from "../src/learning/metrics-collector";
import { handleAnalyze } from "../src/commands/analyze";
import type { OrchestratorConfig, SystemState } from "../src/types";
import type { CodeHealthResult } from "../src/validators/code-health";
import type { CheckData } from "../src/types/cli";

// =============================================================================
// Test framework (мінімальний)
// =============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (match) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${message}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ──`);
}

// =============================================================================
// Test config — ізольована тимчасова директорія
// =============================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-test-"));
const ccDir = path.join(tmpDir, "control_center");
fs.mkdirSync(path.join(ccDir, "system_state"), { recursive: true });

const testConfig: OrchestratorConfig = {
  control_center_path: ccDir,
  project_root: tmpDir,
};

import { createInitialState } from "../src/types/state";
const testState: SystemState = {
  ...createInitialState(),
  current_block: "development_cycle",
  current_step: "D1",
  status: "in_progress",
  cycle: 3,
  iteration: 5,
};

// =============================================================================
// 1. Metrics Store — append + read
// =============================================================================

section("1. Metrics Store — append + read");

{
  clearMetrics(testConfig);

  const event1: MetricEvent = {
    id: "M-1-001",
    timestamp: "2026-02-27T10:00:00.000Z",
    event_type: "step_complete",
    step: "L10",
    cycle: 1,
    data: { artifact: "test.md", next_step: "D1" },
  };

  const event2: MetricEvent = {
    id: "M-1-002",
    timestamp: "2026-02-27T10:01:00.000Z",
    event_type: "gate_decision",
    step: "D1",
    cycle: 1,
    data: { decision: "GO", auto_decided: true },
  };

  appendMetric(testConfig, event1);
  appendMetric(testConfig, event2);

  const all = readMetrics(testConfig);
  assertEq(all.length, 2, "append + read: 2 events stored");
  assertEq(all[0].id, "M-1-001", "first event id correct");
  assertEq(all[1].event_type, "gate_decision", "second event type correct");
}

// =============================================================================
// 2. Metrics Store — filtering
// =============================================================================

section("2. Metrics Store — filtering");

{
  // Continue with existing 2 events from test 1
  const byType = readMetrics(testConfig, { event_type: "step_complete" });
  assertEq(byType.length, 1, "filter by event_type: 1 match");
  assertEq(byType[0].id, "M-1-001", "filter by event_type: correct event");

  const byStep = readMetrics(testConfig, { step: "D1" });
  assertEq(byStep.length, 1, "filter by step: 1 match for D1");

  const byCycle = readMetrics(testConfig, { cycle: 1 });
  assertEq(byCycle.length, 2, "filter by cycle: 2 matches for cycle 1");

  const byCycle2 = readMetrics(testConfig, { cycle: 99 });
  assertEq(byCycle2.length, 0, "filter by non-existing cycle: 0 matches");

  const byDate = readMetrics(testConfig, {
    from_date: "2026-02-27T10:00:30.000Z",
  });
  assertEq(byDate.length, 1, "filter from_date: 1 event after cutoff");

  const byDateTo = readMetrics(testConfig, {
    to_date: "2026-02-27T10:00:30.000Z",
  });
  assertEq(byDateTo.length, 1, "filter to_date: 1 event before cutoff");
}

// =============================================================================
// 3. Metrics Store — summary
// =============================================================================

section("3. Metrics Store — summary");

{
  const summary = getMetricsSummary(testConfig);
  assertEq(summary.total_events, 2, "summary: total_events = 2");
  assertEq(summary.events_by_type["step_complete"], 1, "summary: 1 step_complete");
  assertEq(summary.events_by_type["gate_decision"], 1, "summary: 1 gate_decision");
  assertEq(summary.cycles_seen, [1], "summary: cycles = [1]");
  assert(summary.steps_seen.includes("L10"), "summary: steps includes L10");
  assert(summary.steps_seen.includes("D1"), "summary: steps includes D1");
  assertEq(summary.first_event, "2026-02-27T10:00:00.000Z", "summary: first_event");
  assertEq(summary.last_event, "2026-02-27T10:01:00.000Z", "summary: last_event");
}

// =============================================================================
// 4. Metrics Store — clear
// =============================================================================

section("4. Metrics Store — clear");

{
  clearMetrics(testConfig);
  const after = readMetrics(testConfig);
  assertEq(after.length, 0, "clear: 0 events after clear");

  const summary = getMetricsSummary(testConfig);
  assertEq(summary.total_events, 0, "clear: summary shows 0");
  assertEq(summary.first_event, null, "clear: first_event is null");
}

// =============================================================================
// 5. Metrics Store — malformed lines resilient
// =============================================================================

section("5. Metrics Store — malformed lines resilient");

{
  clearMetrics(testConfig);

  // Write a valid event, then a malformed line
  const event: MetricEvent = {
    id: "M-2-001",
    timestamp: "2026-02-27T12:00:00.000Z",
    event_type: "step_fail",
    step: "D5",
    cycle: 2,
    data: { error_code: "CODE_HEALTH_FAILED" },
  };
  appendMetric(testConfig, event);

  // Manually append malformed line
  const metricsPath = path.join(ccDir, "system_state", "metrics.jsonl");
  fs.appendFileSync(metricsPath, "this is not valid json\n", "utf-8");
  fs.appendFileSync(metricsPath, "{also broken\n", "utf-8");

  const events = readMetrics(testConfig);
  assertEq(events.length, 1, "malformed: only 1 valid event returned");
  assertEq(events[0].id, "M-2-001", "malformed: valid event preserved");
}

// =============================================================================
// 6. Metrics Collector — all 7 collectors
// =============================================================================

section("6. Metrics Collector — all 7 collectors");

{
  clearMetrics(testConfig);

  // 1. collectStepComplete
  collectStepComplete(testConfig, "L10", 3, "artifact.md", "D1", "GO");
  let events = readMetrics(testConfig);
  assertEq(events.length, 1, "collectStepComplete: 1 event");
  assertEq(events[0].event_type, "step_complete", "collectStepComplete: type");
  assertEq(events[0].data["artifact"], "artifact.md", "collectStepComplete: artifact in data");
  assertEq(events[0].data["next_step"], "D1", "collectStepComplete: next_step in data");

  // 2. collectStepFail
  collectStepFail(testConfig, "D5", 3, "CODE_HEALTH_FAILED", "tsc errors");
  events = readMetrics(testConfig);
  assertEq(events.length, 2, "collectStepFail: 2 events total");
  assertEq(events[1].event_type, "step_fail", "collectStepFail: type");
  assertEq(events[1].data["error_code"], "CODE_HEALTH_FAILED", "collectStepFail: error_code");

  // 3. collectGateDecision
  collectGateDecision(testConfig, "D1", 3, "GO", true, "auto-approved");
  events = readMetrics(testConfig);
  assertEq(events.length, 3, "collectGateDecision: 3 events total");
  assertEq(events[2].event_type, "gate_decision", "collectGateDecision: type");
  assertEq(events[2].data["auto_decided"], true, "collectGateDecision: auto_decided");

  // 4. collectJidokaStop
  collectJidokaStop(testConfig, "D5", 3, ["J1", "J3"], "critical defect found");
  events = readMetrics(testConfig);
  assertEq(events.length, 4, "collectJidokaStop: 4 events total");
  assertEq(events[3].event_type, "jidoka_stop", "collectJidokaStop: type");
  assertEq(
    (events[3].data["triggered_criteria"] as string[]).length,
    2,
    "collectJidokaStop: 2 criteria",
  );

  // 5. collectCodeHealth
  const healthResult: CodeHealthResult = {
    healthy: true,
    checks: [
      { type: "tsc", target: "tsconfig.json", passed: true, duration_ms: 500, output: "" },
      { type: "test", target: "package.json", passed: true, duration_ms: 200, output: "" },
    ],
    summary: "All checks passed",
  };
  collectCodeHealth(testConfig, "D5", 3, healthResult);
  events = readMetrics(testConfig);
  assertEq(events.length, 5, "collectCodeHealth: 5 events total");
  assertEq(events[4].event_type, "code_health", "collectCodeHealth: type");
  assertEq(events[4].data["healthy"], true, "collectCodeHealth: healthy=true");
  assertEq(events[4].data["checks_count"], 2, "collectCodeHealth: 2 checks");
  assertEq(events[4].data["checks_passed"], 2, "collectCodeHealth: 2 passed");

  // 6. collectPreconditionFail
  const checkData: CheckData = {
    step: "L10",
    all_passed: false,
    results: [
      { check: "file_exists", passed: true },
      { check: "dir_not_empty", passed: false, reason: "directory empty" },
    ],
  };
  collectPreconditionFail(testConfig, "L10", 3, checkData);
  events = readMetrics(testConfig);
  assertEq(events.length, 6, "collectPreconditionFail: 6 events total");
  assertEq(events[5].event_type, "precondition_fail", "collectPreconditionFail: type");
  assertEq(events[5].data["total_checks"], 2, "collectPreconditionFail: 2 total_checks");

  // 7. collectCycleTransition
  collectCycleTransition(testConfig, "D1", 3, 4);
  events = readMetrics(testConfig);
  assertEq(events.length, 7, "collectCycleTransition: 7 events total");
  assertEq(events[6].event_type, "cycle_transition", "collectCycleTransition: type");
  assertEq(events[6].data["old_cycle"], 3, "collectCycleTransition: old_cycle");
  assertEq(events[6].data["new_cycle"], 4, "collectCycleTransition: new_cycle");
}

// =============================================================================
// 7. ID generation — unique
// =============================================================================

section("7. ID generation — unique IDs");

{
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    ids.add(generateMetricId());
  }
  assertEq(ids.size, 100, "100 generated IDs are all unique");

  const sample = generateMetricId();
  assert(sample.startsWith("M-"), "ID starts with M-");
  assert(sample.length > 5, "ID has reasonable length");
}

// =============================================================================
// 8. Analyze command — metrics subcommand
// =============================================================================

section("8. Analyze command — metrics subcommand");

{
  // Events from test 6 still present
  const result = handleAnalyze(testState, testConfig, "metrics");
  assert(result.success === true, "analyze metrics: success");
  if (result.success) {
    assertEq(result.data.subcommand, "metrics", "analyze metrics: subcommand");
    assertEq(result.data.total_events, 7, "analyze metrics: 7 events");
    assert(
      Object.keys(result.data.events_by_type).length > 0,
      "analyze metrics: events_by_type not empty",
    );
    assert(result.data.message.includes("7"), "analyze metrics: message mentions 7");
  }

  // Default (no subcommand) → metrics
  const resultDefault = handleAnalyze(testState, testConfig);
  assert(resultDefault.success === true, "analyze default: success");
  if (resultDefault.success) {
    assertEq(resultDefault.data.subcommand, "metrics", "analyze default: falls back to metrics");
  }
}

// =============================================================================
// 9. Analyze command — clear subcommand
// =============================================================================

section("9. Analyze command — clear subcommand");

{
  const result = handleAnalyze(testState, testConfig, "clear");
  assert(result.success === true, "analyze clear: success");
  if (result.success) {
    assertEq(result.data.subcommand, "clear", "analyze clear: subcommand");
    assertEq(result.data.total_events, 0, "analyze clear: 0 events");
    assert(result.data.message.includes("очищені"), "analyze clear: message");
  }

  // Verify file is gone
  const after = readMetrics(testConfig);
  assertEq(after.length, 0, "analyze clear: readMetrics returns 0");
}

// =============================================================================
// 10. Analyze command — invalid subcommand
// =============================================================================

section("10. Analyze command — invalid subcommand");

{
  const result = handleAnalyze(testState, testConfig, "unknown_sub");
  assertEq(result.success, false, "analyze unknown: fails");
  if (!result.success) {
    assertEq(result.error, "INVALID_COMMAND", "analyze unknown: error code");
  }
}

// =============================================================================
// 11. Empty metrics file — graceful
// =============================================================================

section("11. Empty metrics file — graceful");

{
  clearMetrics(testConfig);
  const events = readMetrics(testConfig);
  assertEq(events.length, 0, "empty file: 0 events");

  const summary = getMetricsSummary(testConfig);
  assertEq(summary.total_events, 0, "empty file: summary 0 events");
  assertEq(summary.cycles_seen.length, 0, "empty file: no cycles");
}

// =============================================================================
// Cleanup
// =============================================================================

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  // ignore cleanup errors
}

// =============================================================================
// Результат
// =============================================================================

console.log(`\n${"=".repeat(50)}`);
console.log(`Metrics Tests: ${passed} passed, ${failed} failed of ${passed + failed}`);
console.log(`${"=".repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
