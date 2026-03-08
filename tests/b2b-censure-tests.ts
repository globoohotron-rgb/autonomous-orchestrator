// =============================================================================
// Tests — Technical Censure Block E (B2B Readiness)
//
// 14 tests:
//   E1: tenant isolation (B2B block + B2B pass + solo skip)
//   E2: role-based access (B2B block + B2B pass)
//   E3: audit trail (B2B block + B2B pass)
//   E4: onboarding flow (B2B block + solo skip)
//   E5: data export (B2B block + B2B pass)
//   E6: idempotency (universal block + pass)
//   E7: human-readable errors (block + api skip)
// =============================================================================

import {
  RULES,
  RULE_LEVELS,
  evaluateRule,
  getApplicableRules,
} from "../src/validators/technical-censure";
import type { CensureInputContext } from "../src/validators/technical-censure";

// =============================================================================
// Test framework (same pattern as core-tests.ts)
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
// Helper — build CensureInputContext
// =============================================================================

function makeContext(overrides: Partial<CensureInputContext> = {}): CensureInputContext {
  return {
    level: "plan",
    content: "",
    project_type: "multi",
    uses_docker: true,
    has_api: true,
    has_ai_endpoints: false,
    has_external_dependencies: true,
    is_b2b: true,
    final_view_read: true,
    standard_read: true,
    draft_ready: true,
    ...overrides,
  };
}

function getRule(id: string) {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

// =============================================================================
// 0. Structural checks — E-rules exist
// =============================================================================

section("0. Structural: E-rules registered");

const eRuleIds = ["E1", "E2", "E3", "E4", "E5", "E6", "E7"];
for (const id of eRuleIds) {
  assert(RULES.some((r) => r.id === id), `Rule ${id} exists in RULES`);
  assert(id in RULE_LEVELS, `Rule ${id} exists in RULE_LEVELS`);
}

assertEq(RULES.filter((r) => r.id.startsWith("E")).length, 7, "7 E-rules total");

// All E-rules have block = "b2b_readiness"
for (const id of eRuleIds) {
  assertEq(getRule(id).block, "b2b_readiness", `${id} block = b2b_readiness`);
}

// Check levels
assertEq(RULE_LEVELS["E4"], "plan", "E4 = plan level");
assertEq(RULE_LEVELS["E6"], "task", "E6 = task level");
assertEq(RULE_LEVELS["E7"], "task", "E7 = task level");

// E-rules show up in getApplicableRules
const planRules = getApplicableRules("plan");
assert(planRules.some((r) => r.id === "E1"), "E1 included in plan-level rules");
assert(planRules.some((r) => r.id === "E4"), "E4 included in plan-level rules");
assert(!planRules.some((r) => r.id === "E6"), "E6 NOT in plan-level rules (task only)");

const taskRules = getApplicableRules("task");
assert(taskRules.some((r) => r.id === "E6"), "E6 included in task-level rules");
assert(taskRules.some((r) => r.id === "E7"), "E7 included in task-level rules");
assert(!taskRules.some((r) => r.id === "E4"), "E4 NOT in task-level rules (plan only)");

// =============================================================================
// 1. E1 — Multi-tenancy / Data Isolation
// =============================================================================

section("1. E1 — Multi-tenancy / Data Isolation");

// B2B project without tenant isolation → BLOCK
{
  const ctx = makeContext({ content: "Simple CRUD app for teams. Store data in PostgreSQL." });
  const result = evaluateRule(getRule("E1"), ctx);
  assertEq(result.verdict, "BLOCK", "E1: B2B without tenant isolation → BLOCK");
}

// B2B project WITH tenant isolation → PASS
{
  const ctx = makeContext({ content: "Кожна таблиця використовує tenant_id для ізоляції даних." });
  const result = evaluateRule(getRule("E1"), ctx);
  assertEq(result.verdict, "PASS", "E1: B2B with tenant_id → PASS");
}

// Solo project (is_b2b=false) → auto-PASS
{
  const ctx = makeContext({ is_b2b: false, content: "No isolation needed." });
  const result = evaluateRule(getRule("E1"), ctx);
  assertEq(result.verdict, "PASS", "E1: Solo project → PASS (skip)");
}

// =============================================================================
// 2. E2 — Role-Based Access
// =============================================================================

section("2. E2 — Role-Based Access");

{
  const ctx = makeContext({ content: "All users have the same access to all data." });
  const result = evaluateRule(getRule("E2"), ctx);
  assertEq(result.verdict, "BLOCK", "E2: B2B without roles → BLOCK");
}

{
  const ctx = makeContext({ content: "Users have owner/member roles with RBAC enforcement." });
  const result = evaluateRule(getRule("E2"), ctx);
  assertEq(result.verdict, "PASS", "E2: B2B with RBAC → PASS");
}

// =============================================================================
// 3. E3 — Audit Trail
// =============================================================================

section("3. E3 — Audit Trail");

{
  const ctx = makeContext({ content: "Team management with billing changes and resource deletion." });
  const result = evaluateRule(getRule("E3"), ctx);
  assertEq(result.verdict, "BLOCK", "E3: B2B without audit trail → BLOCK");
}

{
  const ctx = makeContext({ content: "Всі критичні дії записуються в audit_trail таблицю." });
  const result = evaluateRule(getRule("E3"), ctx);
  assertEq(result.verdict, "PASS", "E3: B2B with audit trail → PASS");
}

// =============================================================================
// 4. E4 — Onboarding Flow (plan only, B2B only)
// =============================================================================

section("4. E4 — Onboarding Flow");

{
  const ctx = makeContext({ content: "Dashboard with analytics and team management features." });
  const result = evaluateRule(getRule("E4"), ctx);
  assertEq(result.verdict, "BLOCK", "E4: B2B plan without onboarding → BLOCK");
}

{
  const ctx = makeContext({ content: "Onboarding flow: signup → create org → invite team → first report." });
  const result = evaluateRule(getRule("E4"), ctx);
  assertEq(result.verdict, "PASS", "E4: B2B plan with onboarding → PASS");
}

// Solo project → skip
{
  const ctx = makeContext({ is_b2b: false, content: "Just a personal tool, no onboarding needed." });
  const result = evaluateRule(getRule("E4"), ctx);
  assertEq(result.verdict, "PASS", "E4: Solo project → PASS (skip)");
}

// =============================================================================
// 5. E5 — Data Export
// =============================================================================

section("5. E5 — Data Export");

{
  const ctx = makeContext({ content: "Store all data in PostgreSQL. No way to get it out." });
  const result = evaluateRule(getRule("E5"), ctx);
  assertEq(result.verdict, "BLOCK", "E5: B2B without data export → BLOCK");
}

{
  const ctx = makeContext({ content: "CSV export for all user data. Data portability via API." });
  const result = evaluateRule(getRule("E5"), ctx);
  assertEq(result.verdict, "PASS", "E5: B2B with CSV export → PASS");
}

// =============================================================================
// 6. E6 — Idempotency (universal — applies to solo too)
// =============================================================================

section("6. E6 — Idempotency (universal)");

{
  const ctx = makeContext({
    is_b2b: false,
    level: "task",
    content: "Handle Stripe webhook for payment_intent.succeeded. Process order creation.",
  });
  const result = evaluateRule(getRule("E6"), ctx);
  assertEq(result.verdict, "BLOCK", "E6: webhook without idempotency → BLOCK (even solo)");
}

{
  const ctx = makeContext({
    level: "task",
    content: "Handle Stripe webhook with idempotency_key to prevent duplicate processing.",
  });
  const result = evaluateRule(getRule("E6"), ctx);
  assertEq(result.verdict, "PASS", "E6: webhook with idempotency → PASS");
}

{
  const ctx = makeContext({
    level: "task",
    content: "Simple data fetch from database. Read-only query.",
  });
  const result = evaluateRule(getRule("E6"), ctx);
  assertEq(result.verdict, "PASS", "E6: no critical mutation → PASS");
}

// =============================================================================
// 7. E7 — Human-readable Error UX (task only, needs has_api)
// =============================================================================

section("7. E7 — Human-readable errors");

{
  const ctx = makeContext({
    level: "task",
    content: "API returns stack_trace to user when error occurs. User sees internal details.",
  });
  const result = evaluateRule(getRule("E7"), ctx);
  assertEq(result.verdict, "BLOCK", "E7: stack trace shown to user → BLOCK");
}

{
  const ctx = makeContext({
    level: "task",
    has_api: false,
    content: "CLI tool shows stack trace for debugging.",
  });
  const result = evaluateRule(getRule("E7"), ctx);
  assertEq(result.verdict, "PASS", "E7: no API → PASS (skip)");
}

// =============================================================================
// Summary
// =============================================================================

console.log(`\n${"=".repeat(60)}`);
console.log(`Block E Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
