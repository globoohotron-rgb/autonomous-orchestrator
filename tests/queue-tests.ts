// =============================================================================
// Tests — Smart Queue (Горизонт 2)
//
// 7 тестових сценаріїв:
//   1. Task parsing (markdown → QueuedTask)
//   2. Dependency parsing (різні формати)
//   3. Ready tasks (DAG logic)
//   4. Cycle detection
//   5. Critical path
//   6. Pick next (assignment engine)
//   7. Queue lifecycle (scan → start → done → next)
// =============================================================================

import { parseTaskMarkdown, updateTaskStatus } from "../src/queue/task-queue";
import type { QueuedTask, QueueState } from "../src/queue/task-queue";
import {
  getReadyTasks,
  detectCycle,
  getCriticalPath,
  getBlockedTasks,
  countDownstream,
} from "../src/queue/dependency-resolver";
import {
  pickNextTask,
  hasInProgressTask,
  isQueueComplete,
} from "../src/queue/assignment-engine";

// =============================================================================
// Test framework (мінімальний, як у daemon-tests.ts)
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
// Test data — реальні markdown задачі
// =============================================================================

const MD_A1 = `# A1 — Infrastructure Verification
**План:** Plan Dev 27.02.26  
**Етап:** A — Infrastructure Verification  
**Категорія:** config  
**Пріоритет:** P0

---

## Мета

Підтвердити що Foundation побудований коректно.

---

## Контекст

- **Маяк:** \`final_view/project_description.md\` §4 (Docker services)

---

## Задача

1. **Перевірити** docker-compose
`;

const MD_B1 = `# B1 — API Client + Auth State Foundation
**План:** Plan Dev 27.02.26  
**Етап:** B — Auth UI + API Foundation  
**Категорія:** code  
**Пріоритет:** P0

---

## Контекст

- **Залежність:** A1 PASS (server доступний для тестування)

---

## Задача

Створити API client.
`;

const MD_B2 = `# B2 — Auth Pages + Route Protection
**План:** Plan Dev 27.02.26  
**Етап:** B — Auth UI + API Foundation  
**Категорія:** code  
**Пріоритет:** P0

---

## Контекст

- **Залежність:** B1

---

## Задача

Створити auth pages.
`;

const MD_C1 = `# C1 — Keywords Management UI
**План:** Plan Dev 27.02.26  
**Етап:** C — Keywords Management  
**Категорія:** code  
**Пріоритет:** P0

---

## Контекст

- **Залежність:** B1 (apiFetch), B2 (Button, Input, Toast)

---

## Задача

Створити keywords UI.
`;

const MD_D1 = `# D1 — Dashboard + Leads Table
**План:** Plan Dev 27.02.26  
**Етап:** D — Dashboard  
**Категорія:** code  
**Пріоритет:** P0

---

## Контекст

- **Залежність:** B1 (apiFetch, useQuery), B2 (Button, Badge, Skeleton), C1 ((dashboard) layout with sidebar)

---

## Задача

Створити dashboard.
`;

const MD_E1 = `# E1 — Email Alert Service
**План:** Plan Dev 27.02.26  
**Етап:** E — Alerts  
**Категорія:** code  
**Пріоритет:** P1

---

## Контекст

- **Залежність:** A1 PASS (worker запущений); scan.ts вже додає...

---

## Задача

Створити email service.
`;

// =============================================================================
// Scenario 1: Task Parsing
// =============================================================================

section("Scenario 1: Task Parsing");

const a1 = parseTaskMarkdown(MD_A1, "/tasks/active/A1 Plan Dev 27.02.26.md");
assertEq(a1.id, "A1", "A1 id parsed");
assertEq(a1.name, "Infrastructure Verification", "A1 name parsed");
assertEq(a1.priority, "P0", "A1 priority P0");
assertEq(a1.category, "config", "A1 category config");
assertEq(a1.stage, "A", "A1 stage A");
assertEq(a1.dependencies, [], "A1 no dependencies");
assertEq(a1.status, "queued", "A1 initial status queued");

const b1 = parseTaskMarkdown(MD_B1, "/tasks/active/B1 Plan Dev 27.02.26.md");
assertEq(b1.id, "B1", "B1 id parsed");
assertEq(b1.priority, "P0", "B1 priority P0");
assertEq(b1.category, "code", "B1 category code");
assertEq(b1.stage, "B", "B1 stage B");

const e1 = parseTaskMarkdown(MD_E1, "/tasks/active/E1 Plan Dev 27.02.26.md");
assertEq(e1.id, "E1", "E1 id parsed");
assertEq(e1.priority, "P1", "E1 priority P1");

// =============================================================================
// Scenario 2: Dependency Parsing
// =============================================================================

section("Scenario 2: Dependency Parsing");

assertEq(a1.dependencies, [], "A1: no deps");
assertEq(b1.dependencies, ["A1"], "B1: dep on A1");

const b2 = parseTaskMarkdown(MD_B2, "/tasks/active/B2.md");
assertEq(b2.dependencies, ["B1"], "B2: dep on B1");

const c1 = parseTaskMarkdown(MD_C1, "/tasks/active/C1.md");
assertEq(c1.dependencies, ["B1", "B2"], "C1: deps on B1, B2");

const d1 = parseTaskMarkdown(MD_D1, "/tasks/active/D1.md");
assertEq(d1.dependencies, ["B1", "B2", "C1"], "D1: deps on B1, B2, C1");

assertEq(e1.dependencies, ["A1"], "E1: dep on A1");

// Складний формат
const complexMD = `# X1 — Test
**Пріоритет:** P2
**Категорія:** test
**Етап:** X — Test

## Контекст
- **Залежність:** A1 PASS (server запущений); scan.ts вже додає дані
`;
const x1 = parseTaskMarkdown(complexMD, "/tasks/x1.md");
assertEq(x1.dependencies, ["A1"], "Complex dep format: only A1 extracted");

// =============================================================================
// Scenario 3: Ready Tasks
// =============================================================================

section("Scenario 3: Ready Tasks");

// Всі queued — тільки A1 ready (немає deps)
const allQueued: QueuedTask[] = [a1, b1, b2, c1, d1, e1];
const ready1 = getReadyTasks(allQueued);
assertEq(ready1.map(t => t.id), ["A1"], "All queued: only A1 ready");

// A1 completed → B1 i E1 ready
const withA1Done = allQueued.map(t =>
  t.id === "A1" ? { ...t, status: "completed" as const } : t
);
const ready2 = getReadyTasks(withA1Done);
assertEq(ready2.map(t => t.id).sort(), ["B1", "E1"], "A1 done: B1, E1 ready");

// A1 + B1 completed → B2 ready (E1 теж але вже ready раніше)
const withB1Done = withA1Done.map(t =>
  t.id === "B1" ? { ...t, status: "completed" as const } : t
);
const ready3 = getReadyTasks(withB1Done);
assertEq(ready3.map(t => t.id).sort(), ["B2", "E1"], "A1+B1 done: B2, E1 ready");

// B2 NOT ready коли B1 ще queued
const b2NotReady = getReadyTasks(allQueued).find(t => t.id === "B2");
assert(b2NotReady === undefined, "B2 NOT ready when B1 not done");

// =============================================================================
// Scenario 4: Cycle Detection
// =============================================================================

section("Scenario 4: Cycle Detection");

// Реальний граф — немає циклів
const noCycle = detectCycle(allQueued);
assertEq(noCycle, null, "Real graph: no cycle");

// Штучний цикл: A→B, B→A
const cyclicTasks: QueuedTask[] = [
  { ...a1, dependencies: ["B1"] },
  { ...b1, dependencies: ["A1"] },
];
const cycle = detectCycle(cyclicTasks);
assert(cycle !== null, "A↔B: cycle detected");
assert(cycle !== null && cycle.length >= 2, "Cycle path has >= 2 nodes");

// Лінійний ланцюг — немає циклу
const linear: QueuedTask[] = [
  { ...a1, dependencies: [] },
  { ...b1, dependencies: ["A1"] },
  { ...b2, dependencies: ["B1"] },
];
assertEq(detectCycle(linear), null, "A→B→C linear: no cycle");

// =============================================================================
// Scenario 5: Critical Path
// =============================================================================

section("Scenario 5: Critical Path");

const cp = getCriticalPath(allQueued);
assertEq(cp, ["A1", "B1", "B2", "C1", "D1"], "Critical path: A1→B1→B2→C1→D1 (length 5)");

// Короткий граф
const shortTasks: QueuedTask[] = [
  { ...a1, dependencies: [] },
  { ...e1, dependencies: ["A1"] },
];
const cpShort = getCriticalPath(shortTasks);
assertEq(cpShort, ["A1", "E1"], "Short graph: A1→E1 (length 2)");

// =============================================================================
// Scenario 6: Pick Next (Assignment Engine)
// =============================================================================

section("Scenario 6: Pick Next (Assignment Engine)");

// При старті — pick A1 (єдина ready, P0)
const next1 = pickNextTask(allQueued);
assertEq(next1?.id, "A1", "Start: pick A1 (only ready)");

// Після A1 done — pick B1 (P0 > E1 P1, і B1 на критичному шляху)
const next2 = pickNextTask(withA1Done);
assertEq(next2?.id, "B1", "A1 done: pick B1 (P0, critical path) over E1 (P1)");

// Два P0 ready: B1 на critical path, E1 з P0 (штучно)
const e1p0 = withA1Done.map(t =>
  t.id === "E1" ? { ...t, priority: "P0" as const } : t
);
const next3 = pickNextTask(e1p0);
assertEq(next3?.id, "B1", "B1 vs E1(P0): B1 wins (critical path + more downstream)");

// Всі completed — null
const allDone = allQueued.map(t => ({ ...t, status: "completed" as const }));
const next4 = pickNextTask(allDone);
assertEq(next4, null, "All completed: null");

// Все blocked — null
const allBlocked = allQueued.map(t =>
  t.id !== "A1" ? t : { ...t, status: "in_progress" as const }
);
const next5 = pickNextTask(allBlocked);
assertEq(next5, null, "A1 in_progress, rest blocked: null");

// =============================================================================
// Scenario 7: Queue Lifecycle
// =============================================================================

section("Scenario 7: Queue Lifecycle");

// Побудувати queue
const queue: QueueState = {
  scanned_at: new Date().toISOString(),
  tasks: allQueued.map(t => ({ ...t })),
  completed_count: 0,
  total_count: 6,
};

// Start A1
const q1 = updateTaskStatus(queue, "A1", "in_progress")!;
assert(q1 !== null, "Start A1: success");
assertEq(q1.tasks.find(t => t.id === "A1")!.status, "in_progress", "A1 is in_progress");
assert(hasInProgressTask(q1.tasks)?.id === "A1", "hasInProgressTask returns A1");

// Done A1
const q2 = updateTaskStatus(q1, "A1", "completed")!;
assertEq(q2.completed_count, 1, "Completed count = 1");
assertEq(q2.tasks.find(t => t.id === "A1")!.status, "completed", "A1 is completed");
assert(q2.tasks.find(t => t.id === "A1")!.completed_at !== null, "A1 has completed_at");

// Next after A1 done
const nextAfterA1 = pickNextTask(q2.tasks);
assertEq(nextAfterA1?.id, "B1", "After A1 done: next = B1");

// Start B1 → done B1 → next = B2
const q3 = updateTaskStatus(q2, "B1", "in_progress")!;
const q4 = updateTaskStatus(q3, "B1", "completed")!;
const nextAfterB1 = pickNextTask(q4.tasks);
assertEq(nextAfterB1?.id, "B2", "After B1 done: next = B2");

// isQueueComplete
assert(!isQueueComplete(q4.tasks), "Queue not complete yet");
const qAllDone: QueueState = {
  ...queue,
  tasks: queue.tasks.map(t => ({
    ...t,
    status: "completed" as const,
    completed_at: new Date().toISOString(),
  })),
  completed_count: 6,
};
assert(isQueueComplete(qAllDone.tasks), "Queue complete when all done");

// Fail + Reset
const q5 = updateTaskStatus(q2, "B1", "in_progress")!;
const q6 = updateTaskStatus(q5, "B1", "failed", "Test failure")!;
assertEq(q6.tasks.find(t => t.id === "B1")!.status, "failed", "B1 is failed");
assertEq(q6.tasks.find(t => t.id === "B1")!.error, "Test failure", "B1 has error message");

const q7 = updateTaskStatus(q6, "B1", "queued")!;
assertEq(q7.tasks.find(t => t.id === "B1")!.status, "queued", "B1 reset to queued");
assertEq(q7.tasks.find(t => t.id === "B1")!.error, null, "B1 error cleared");

// Blocked tasks
const blocked = getBlockedTasks(allQueued);
assert(blocked.length > 0, "Blocked tasks exist in fresh queue");
assert(blocked.some(b => b.task === "B1" && b.blocked_by.includes("A1")), "B1 blocked by A1");
assert(blocked.some(b => b.task === "D1"), "D1 is blocked");

// Downstream count
const downA1 = countDownstream("A1", allQueued);
assertEq(downA1, 5, "A1 has 5 downstream tasks");

const downE1 = countDownstream("E1", allQueued);
assertEq(downE1, 0, "E1 has 0 downstream tasks");

// Non-existent task
const badUpdate = updateTaskStatus(queue, "Z99", "completed");
assertEq(badUpdate, null, "Non-existent task: returns null");

// =============================================================================
// Results
// =============================================================================

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
  process.exit(1);
}
