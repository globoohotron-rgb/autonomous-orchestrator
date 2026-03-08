// =============================================================================
// Tests — B2B Detection Utility
//
// 6 tests:
//   1. detectB2BProject() with "## B2B Model" → true
//   2. detectB2BProject() with solo-user project → false
//   3. detectB2BProject() without project_description.md → false
//   4. B2B_DETECTION_REGEX matches "multi-tenancy" → true
//   5. B2B_DETECTION_REGEX does NOT match "team building workshop" → false
//   6. B2B_THRESHOLDS.VALIDATE_DONE_PERCENT === 85
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  B2B_DETECTION_REGEX,
  B2B_THRESHOLDS,
  detectB2BProject,
} from "../src/validators/b2b-detection";

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
// Isolated temp directory
// =============================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "b2b-test-"));
const ccDir = path.join(tmpDir, "control_center");
const fvDir = path.join(ccDir, "final_view");
fs.mkdirSync(fvDir, { recursive: true });

// =============================================================================
// 1. detectB2BProject — file-based detection
// =============================================================================

section("1. detectB2BProject");

// 1a. B2B project with "## B2B Model" section
const b2bContent = `# Product Description

## Overview
Enterprise SaaS for team collaboration.

## B2B Model
- Multi-tenant architecture
- Per-seat billing
- Team management dashboard
`;
fs.writeFileSync(path.join(fvDir, "project_description.md"), b2bContent, "utf-8");
assert(
  detectB2BProject(tmpDir) === true,
  "detects B2B project with '## B2B Model' section",
);

// 1b. Solo-user project (no B2B signals)
const soloContent = `# Product Description

## Overview
Personal todo app for individual users.

## Features
- Create tasks
- Set reminders
- Track progress
`;
fs.writeFileSync(path.join(fvDir, "project_description.md"), soloContent, "utf-8");
assert(
  detectB2BProject(tmpDir) === false,
  "returns false for solo-user project (no B2B keywords)",
);

// 1c. Missing project_description.md
fs.unlinkSync(path.join(fvDir, "project_description.md"));
assert(
  detectB2BProject(tmpDir) === false,
  "returns false when project_description.md does not exist",
);

// =============================================================================
// 2. B2B_DETECTION_REGEX — pattern matching
// =============================================================================

section("2. B2B_DETECTION_REGEX");

// 2a. Positive matches
const positiveMatches = [
  { text: "multi-tenancy architecture", label: "multi-tenancy" },
  { text: "multi_tenant setup", label: "multi_tenant" },
  { text: "## B2B Model", label: "## B2B Model heading" },
  { text: "This is a B2B product", label: "B2B as standalone word" },
  { text: "enterprise dashboard", label: "enterprise" },
  { text: "team plan pricing", label: "team plan" },
  { text: "team management portal", label: "team management" },
  { text: "організація може", label: "організаці (ukr)" },
  { text: "billing system", label: "billing" },
  { text: "per-seat pricing", label: "per-seat" },
  { text: "subscription plan management", label: "subscription plan" },
];

for (const { text, label } of positiveMatches) {
  assert(
    B2B_DETECTION_REGEX.test(text),
    `regex matches: "${label}"`,
  );
}

// 2b. Negative matches (should NOT trigger B2B detection)
// Note: "b2b" lowercase DOES match because regex is case-insensitive (/i flag)
// So we only test truly negative cases
const strictNegatives = [
  { text: "team building workshop", label: "team building (not team plan/management)" },
  { text: "personal project for one user", label: "personal project" },
  { text: "a simple todo list app", label: "simple todo app" },
  { text: "enter some data here", label: "'enter' is not 'enterprise'" },
];

for (const { text, label } of strictNegatives) {
  assert(
    !B2B_DETECTION_REGEX.test(text),
    `regex does NOT match: "${label}"`,
  );
}

// =============================================================================
// 3. B2B_THRESHOLDS — constant values
// =============================================================================

section("3. B2B_THRESHOLDS");

assertEq(B2B_THRESHOLDS.VALIDATE_DONE_PERCENT, 85, "VALIDATE_DONE_PERCENT === 85");
assertEq(B2B_THRESHOLDS.VALIDATE_MIN_CYCLES, 3, "VALIDATE_MIN_CYCLES === 3");
assertEq(B2B_THRESHOLDS.VALIDATE_MAX_GAPS, 2, "VALIDATE_MAX_GAPS === 2");
assertEq(B2B_THRESHOLDS.CODE_COMPLETE_PERCENT, 93, "CODE_COMPLETE_PERCENT === 93");

// =============================================================================
// Summary
// =============================================================================

console.log(`\n${"=".repeat(60)}`);
console.log(`B2B Detection Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(60)}\n`);

// Cleanup
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  // cleanup is best-effort
}

process.exit(failed > 0 ? 1 : 0);
