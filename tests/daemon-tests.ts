// =============================================================================
// Тести для Горизонт 1 — Daemon модулі
// Запуск: npx ts-node tests/daemon-tests.ts
//
// Тест-сценарії:
//   1. Trigger mapping — Event X → Action Y
//   2. Lock mechanism — Dispatcher lock → watcher ігнорує свої зміни
//   3. Timeout detection — Elapsed > threshold → correct action
//   4. Retry escalation — 3 fails → JIDOKA STOP
//   5. Daemon state — persistence
//   6. Daemon logger — JSONL format
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, SystemState } from "../src/types";
import { createInitialState } from "../src/types";

// ── Daemon modules ──
import {
  createInitialDaemonState,
  loadDaemonState,
  saveDaemonState,
  acquireLock,
  releaseLock,
  isLocked,
  incrementRetry,
  getRetryState,
  resetRetry,
  setRunning,
} from "../src/watcher/daemon-state";

import {
  log as daemonLog,
  readLog,
  clearLog,
} from "../src/watcher/daemon-logger";

import { evaluate, parseGateDecisionFile, VALID_DECISIONS } from "../src/watcher/trigger-engine";
import type { WatchEvent } from "../src/watcher/artifact-watcher";
import { checkTimeout } from "../src/watcher/timeout-monitor";

// =============================================================================
// Test harness
// =============================================================================

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    errors.push(`${message} — expected: ${expected}, actual: ${actual}`);
    console.log(`  ✗ ${message} (expected: ${expected}, got: ${actual})`);
  }
}

function section(name: string): void {
  console.log(`\n━━━ ${name} ━━━`);
}

// =============================================================================
// Test config — тимчасова директорія
// =============================================================================

const TEST_DIR = path.resolve(__dirname, "../.test_daemon");
const TEST_CC = path.join(TEST_DIR, "control_center");

function setupTestDir(): OrchestratorConfig {
  // Очистити попередні тести
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  // Створити структуру
  const dirs = [
    path.join(TEST_CC, "system_state"),
    path.join(TEST_CC, "audit", "observe"),
    path.join(TEST_CC, "audit", "gate_decisions"),
    path.join(TEST_CC, "audit", "hansei"),
    path.join(TEST_CC, "tasks", "active"),
    path.join(TEST_CC, "issues", "active"),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Створити початковий state.json
  const state = createInitialState();
  const statePath = path.join(TEST_CC, "system_state", "state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

  return {
    control_center_path: TEST_CC,
    project_root: TEST_DIR,
  };
}

function cleanupTestDir(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// =============================================================================
// Тест 1: Daemon State — persistence
// =============================================================================

function testDaemonState(): void {
  section("Test 1: Daemon State — persistence");

  const config = setupTestDir();

  // Початковий стан
  const initial = createInitialDaemonState();
  assert(initial.is_running === false, "Initial state: is_running = false");
  assert(initial.events_processed === 0, "Initial state: events = 0");

  // Зберегти і завантажити
  saveDaemonState(config, initial);
  const loaded = loadDaemonState(config);
  assert(loaded.is_running === false, "Loaded state: is_running = false");
  assertEqual(loaded.events_processed, 0, "Loaded state: events = 0");

  // Оновити running
  setRunning(config, true);
  const running = loadDaemonState(config);
  assert(running.is_running === true, "After setRunning(true): is_running = true");

  setRunning(config, false);
  const stopped = loadDaemonState(config);
  assert(stopped.is_running === false, "After setRunning(false): is_running = false");
}

// =============================================================================
// Тест 2: Lock mechanism
// =============================================================================

function testLockMechanism(): void {
  section("Test 2: Lock mechanism");

  const config = setupTestDir();

  // Початковий: розблоковано
  assert(isLocked(config) === false, "Initially unlocked");

  // Заблокувати
  acquireLock(config);
  assert(isLocked(config) === true, "After acquireLock: locked");

  // Розблокувати
  releaseLock(config);
  assert(isLocked(config) === false, "After releaseLock: unlocked");
}

// =============================================================================
// Тест 3: Timeout detection
// =============================================================================

function testTimeoutDetection(): void {
  section("Test 3: Timeout detection");

  // Стан що оновлений 5 хвилин тому → OK
  const recentState: SystemState = {
    ...createInitialState(),
    current_step: "D5",
    last_updated: new Date(Date.now() - 5 * 60_000).toISOString(),
  };

  const recentResult = checkTimeout(recentState);
  assertEqual(recentResult.level, "ok", "5 min elapsed → OK");

  // Стан що оновлений 35 хвилин тому (D5 = код) → warning
  const warningState: SystemState = {
    ...createInitialState(),
    current_step: "D5",
    last_updated: new Date(Date.now() - 35 * 60_000).toISOString(),
  };

  const warningResult = checkTimeout(warningState);
  assertEqual(warningResult.level, "warning", "35 min on D5 → warning");

  // Стан що оновлений 125 хвилин тому → JIDOKA STOP
  const jidokaState: SystemState = {
    ...createInitialState(),
    current_step: "D5",
    last_updated: new Date(Date.now() - 125 * 60_000).toISOString(),
  };

  const jidokaResult = checkTimeout(jidokaState);
  assertEqual(jidokaResult.level, "jidoka_stop", "125 min → JIDOKA STOP");

  // Аудит крок 16 хвилин → warning
  const auditState: SystemState = {
    ...createInitialState(),
    current_step: "V1",
    last_updated: new Date(Date.now() - 16 * 60_000).toISOString(),
  };

  const auditResult = checkTimeout(auditState);
  assertEqual(auditResult.level, "warning", "16 min on V1 (audit) → warning");
}

// =============================================================================
// Тест 4: Retry escalation
// =============================================================================

function testRetryEscalation(): void {
  section("Test 4: Retry escalation");

  const config = setupTestDir();

  // Перший fail
  const count1 = incrementRetry(config, "D5", "TSC error: type mismatch");
  assertEqual(count1, 1, "First failure: count = 1");

  // Другий fail
  const count2 = incrementRetry(config, "D5", "TSC error: type mismatch");
  assertEqual(count2, 2, "Second failure: count = 2");

  // Третій fail
  const count3 = incrementRetry(config, "D5", "TSC error: type mismatch");
  assertEqual(count3, 3, "Third failure: count = 3 (threshold)");

  // Перевірити retry state
  const retryState = getRetryState(config, "D5");
  assert(retryState !== null, "RetryState exists for D5");
  assertEqual(retryState!.fail_count, 3, "RetryState fail_count = 3");

  // Reset
  resetRetry(config, "D5");
  const afterReset = getRetryState(config, "D5");
  assert(afterReset === null, "After reset: RetryState is null");
}

// =============================================================================
// Тест 5: Trigger mapping
// =============================================================================

function testTriggerMapping(): void {
  section("Test 5: Trigger mapping");

  const config = setupTestDir();

  // Потрібно state з current_step = D2 для observe артефакту
  const statePath = path.join(TEST_CC, "system_state", "state.json");
  const state: SystemState = {
    ...createInitialState(),
    current_step: "D2",
    current_block: "development_cycle",
    status: "in_progress",
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

  // Artifact created в audit/observe/
  const artifactEvent: WatchEvent = {
    type: "artifact_created",
    filePath: path.join(TEST_CC, "audit", "observe", "observe_report_28.02.26.md"),
    relativePath: "control_center/audit/observe/observe_report_28.02.26.md",
    timestamp: new Date().toISOString(),
  };

  const artifactAction = evaluate(artifactEvent, config);
  assertEqual(artifactAction.type, "complete", "Artifact in audit/observe during D2 → complete");

  // Code change during D5
  const codeState: SystemState = { ...state, current_step: "D5" };
  fs.writeFileSync(statePath, JSON.stringify(codeState, null, 2), "utf-8");

  const codeEvent: WatchEvent = {
    type: "code_changed",
    filePath: path.join(TEST_DIR, "server", "src", "index.ts"),
    relativePath: "server/src/index.ts",
    timestamp: new Date().toISOString(),
  };

  const codeAction = evaluate(codeEvent, config);
  assertEqual(codeAction.type, "code_health_check", "Code change during D5 → code_health_check");

  // state.json changed
  const stateEvent: WatchEvent = {
    type: "state_changed",
    filePath: statePath,
    relativePath: "control_center/system_state/state.json",
    timestamp: new Date().toISOString(),
  };

  const stateAction = evaluate(stateEvent, config);
  assertEqual(stateAction.type, "reload_state", "state.json changed → reload_state");

  // Gate decision during awaiting_human_decision
  const gateState: SystemState = {
    ...state,
    current_step: "GATE1",
    current_block: "foundation",
    status: "awaiting_human_decision",
  };
  fs.writeFileSync(statePath, JSON.stringify(gateState, null, 2), "utf-8");

  // Створити файл gate decision
  const gateFile = path.join(TEST_CC, "audit", "gate_decisions", "gate1_decision_test.md");
  fs.writeFileSync(gateFile, "# Gate Decision\n\n**Рішення:** GO\n", "utf-8");

  const gateEvent: WatchEvent = {
    type: "gate_decision_created",
    filePath: gateFile,
    relativePath: "control_center/audit/gate_decisions/gate1_decision_test.md",
    timestamp: new Date().toISOString(),
  };

  const gateAction = evaluate(gateEvent, config);
  assertEqual(gateAction.type, "decide", "Gate decision during awaiting_human_decision → decide");
}

// =============================================================================
// Тест 6: Daemon Logger
// =============================================================================

function testDaemonLogger(): void {
  section("Test 6: Daemon Logger");

  const config = setupTestDir();

  // Очистити лог
  clearLog(config);
  const emptyLog = readLog(config);
  assertEqual(emptyLog.length, 0, "After clearLog: empty");

  // Записати кілька подій
  daemonLog(config, { type: "daemon_started", details: "Test start" });
  daemonLog(config, { type: "artifact_detected", path: "test.md", action: "complete" });
  daemonLog(config, { type: "timeout_warning", step: "D5", elapsed_min: 32 });

  const allLogs = readLog(config);
  assertEqual(allLogs.length, 3, "After 3 writes: 3 entries");
  assertEqual(allLogs[0].type, "daemon_started", "First entry: daemon_started");
  assertEqual(allLogs[1].type, "artifact_detected", "Second entry: artifact_detected");
  assertEqual(allLogs[2].type, "timeout_warning", "Third entry: timeout_warning");

  // Перевірити JSONL формат
  const logPath = path.join(TEST_CC, "system_state", "daemon_log.jsonl");
  const raw = fs.readFileSync(logPath, "utf-8");
  const lines = raw.trim().split("\n");
  assertEqual(lines.length, 3, "JSONL: 3 lines");

  // Кожен рядок — валідний JSON
  let allValidJson = true;
  for (const line of lines) {
    try {
      JSON.parse(line);
    } catch {
      allValidJson = false;
    }
  }
  assert(allValidJson, "All JSONL lines are valid JSON");
}

// =============================================================================
// Тест 7: OPT-12 — Gate Decision Parser Hardening
// =============================================================================

function testGateDecisionParser(): void {
  section("Test 7: OPT-12 — Gate Decision Parser Hardening");

  const config = setupTestDir();
  const gateDir = path.join(TEST_CC, "audit", "gate_decisions");

  // Test 1: "**Decision**: GO" → "GO"
  const f1 = path.join(gateDir, "test_parser_1.md");
  fs.writeFileSync(f1, "# Gate Decision\n\n**Decision**: GO\n\nRationale: All checks passed.\n", "utf-8");
  assertEqual(parseGateDecisionFile(f1, config), "GO", "**Decision**: GO → GO");

  // Test 2: "decision: CONTINUE" → "CONTINUE"
  const f2 = path.join(gateDir, "test_parser_2.md");
  fs.writeFileSync(f2, "# Mini-GATE\n\ndecision: CONTINUE\n", "utf-8");
  assertEqual(parseGateDecisionFile(f2, config), "CONTINUE", "decision: CONTINUE → CONTINUE");

  // Test 3: "decision rationale: the outcome..." → null (false positive guard)
  const f3 = path.join(gateDir, "test_parser_3.md");
  fs.writeFileSync(f3, "# Report\n\n## Rationale\nThe decision rationale: the outcome was not straightforward\n", "utf-8");
  assertEqual(parseGateDecisionFile(f3, config), null, "decision rationale: the... → null");

  // Test 4: "decision: INVALID_VALUE" → null
  const f4 = path.join(gateDir, "test_parser_4.md");
  fs.writeFileSync(f4, "# Gate\n\ndecision: INVALID_VALUE\n", "utf-8");
  assertEqual(parseGateDecisionFile(f4, config), null, "decision: INVALID_VALUE → null");

  // Test 5: "status: blocked" → null (old parser would match this)
  const f5 = path.join(gateDir, "test_parser_5.md");
  fs.writeFileSync(f5, "# State\n\nstatus: blocked\n", "utf-8");
  assertEqual(parseGateDecisionFile(f5, config), null, "status: blocked → null (no longer matches)");

  // Test 6: Structured block "## Decision\n...\ndecision: VALIDATE" → "VALIDATE"
  const f6 = path.join(gateDir, "test_parser_6.md");
  fs.writeFileSync(f6, [
    "# Gate 1 Decision",
    "",
    "## System Analysis",
    "Everything looks good.",
    "",
    "## Decision",
    "After thorough review:",
    "decision: VALIDATE",
    "",
    "## Comments",
    "None.",
  ].join("\n"), "utf-8");
  assertEqual(parseGateDecisionFile(f6, config), "VALIDATE", "Structured ## Decision block → VALIDATE");

  // Test 7: VALID_DECISIONS contains all known gate decisions
  const requiredDecisions = [
    "GO", "REWORK", "KILL", "CONTINUE", "VALIDATE", "AMEND_SPEC",
    "PASS", "PASS_WITH_SECURITY", "FAIL",
    "REBUILD_PLAN", "REBUILD_DESCRIPTION",
    "READY", "NOT_READY", "REPEAT", "STOP", "D1",
  ];
  for (const d of requiredDecisions) {
    assert(VALID_DECISIONS.has(d), `VALID_DECISIONS contains ${d}`);
  }
}

// =============================================================================
// Run all tests
// =============================================================================

function runAll(): void {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║  Горизонт 1 — Daemon Tests                ║");
  console.log("╚════════════════════════════════════════════╝");

  try {
    testDaemonState();
    testLockMechanism();
    testTimeoutDetection();
    testRetryEscalation();
    testTriggerMapping();
    testDaemonLogger();
    testGateDecisionParser();
  } finally {
    cleanupTestDir();
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Result: ${passed} passed, ${failed} failed`);

  if (errors.length > 0) {
    console.log("\nFailed assertions:");
    for (const err of errors) {
      console.log(`  ✗ ${err}`);
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  process.exit(failed > 0 ? 1 : 0);
}

runAll();
