// =============================================================================
// Structural Tests — перевірка цілісності всіх step definitions
//
// Ці тести перевіряють СТРУКТУРУ кожного кроку:
//   1. Preconditions — правильні обов'язкові поля для кожного типу
//   2. Inputs — правильні поля для кожного source типу
//   3. Paths on disk — всі шляхи реально існують
//   4. Step completeness — обов'язкові поля StepDefinition
//
// Запуск: npx ts-node tests/structural-tests.ts
// =============================================================================

import * as fs from "fs";
import * as path from "path";

import { getAllStepIds, getStep } from "../src/step-registry";


// =============================================================================
// Test framework (same as core-tests)
// =============================================================================

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.log(`  ❌ FAIL: ${message}`);
  }
}

// =============================================================================
// Constants
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const ALL_STEPS = getAllStepIds();

// Paths that are templates (contain wildcards or {placeholders}) — skip disk check
function isTemplatePath(p: string): boolean {
  return p.includes("*") || p.includes("{") || p.includes("}");
}

// Paths that are embedded in code (standards/ was removed from disk)
const EMBEDDED_PATHS = ["standards/", "control_center/standards/"];
function isEmbeddedPath(p: string): boolean {
  return EMBEDDED_PATHS.some((e) => p.startsWith(e) || p === e);
}

// =============================================================================
// Section 1: Precondition structure validation
// =============================================================================

console.log("\n══ 1. Precondition Structure ══");

// Required fields per precondition type
const REQUIRED_FIELDS: Record<string, string[]> = {
  file_exists: ["path"],
  dir_empty: ["path"],
  dir_not_empty: ["path"],
  artifact_registered: ["artifact_key"],
  artifact_null: ["artifact_key"],
  step_completed: ["step"],
  state_field: ["field"],
};

for (const stepId of ALL_STEPS) {
  const step = getStep(stepId);
  for (let i = 0; i < step.preconditions.length; i++) {
    const pc = step.preconditions[i];
    const requiredFields = REQUIRED_FIELDS[pc.type];
    if (!requiredFields) {
      assert(false, `${stepId} P${i}: unknown precondition type "${pc.type}"`);
      continue;
    }
    for (const field of requiredFields) {
      const value = (pc as unknown as Record<string, unknown>)[field];
      assert(
        value !== undefined && value !== null && value !== "",
        `${stepId} P${i} (${pc.type}): must have "${field}" — ${pc.description.slice(0, 60)}`,
      );
    }
  }
}

// =============================================================================
// Section 2: Input structure validation
// =============================================================================

console.log("\n══ 2. Input Structure ══");

// Required fields per input source type
const INPUT_REQUIRED: Record<string, string[]> = {
  file: ["path"],
  directory: ["path"],
  artifact: ["artifact_key"],
  state: ["field"],
};

for (const stepId of ALL_STEPS) {
  const step = getStep(stepId);
  for (let i = 0; i < step.inputs.length; i++) {
    const input = step.inputs[i];
    const requiredFields = INPUT_REQUIRED[input.source];
    if (!requiredFields) {
      assert(false, `${stepId} input[${i}]: unknown source "${input.source}"`);
      continue;
    }
    for (const field of requiredFields) {
      const value = (input as unknown as Record<string, unknown>)[field];
      assert(
        value !== undefined && value !== null && value !== "",
        `${stepId} input[${i}] (${input.source}): must have "${field}" — ${input.description.slice(0, 60)}`,
      );
    }
  }
}

// =============================================================================
// Section 3: Paths exist on disk
// =============================================================================

console.log("\n══ 3. Paths on Disk ══");

// Collect all unique paths from preconditions and inputs
const allPaths = new Map<string, string[]>(); // path -> [stepId references]

for (const stepId of ALL_STEPS) {
  const step = getStep(stepId);

  // Precondition paths
  for (const pc of step.preconditions) {
    if (pc.path && !isTemplatePath(pc.path) && !isEmbeddedPath(pc.path)) {
      const refs = allPaths.get(pc.path) || [];
      refs.push(`${stepId}/precondition`);
      allPaths.set(pc.path, refs);
    }
  }

  // Input paths
  for (const input of step.inputs) {
    if (
      input.path &&
      (input.source === "file" || input.source === "directory") &&
      !isTemplatePath(input.path) &&
      !isEmbeddedPath(input.path)
    ) {
      const refs = allPaths.get(input.path) || [];
      refs.push(`${stepId}/input`);
      allPaths.set(input.path, refs);
    }
  }
}

for (const [relPath, refs] of allPaths) {
  // Trim trailing slash for fs check
  const cleanPath = relPath.replace(/\/$/, "");
  const fullPath = path.resolve(PROJECT_ROOT, cleanPath);
  const exists = fs.existsSync(fullPath);
  assert(exists, `Path "${relPath}" exists on disk (used by: ${refs.join(", ")})`);
}

// =============================================================================
// Section 4: Step definition completeness
// =============================================================================

console.log("\n══ 4. Step Completeness ══");

for (const stepId of ALL_STEPS) {
  const step = getStep(stepId);

  // Must have non-empty name
  assert(
    typeof step.name === "string" && step.name.length > 0,
    `${stepId}: has name`,
  );

  // Must have non-empty purpose
  assert(
    typeof step.purpose === "string" && step.purpose.length > 0,
    `${stepId}: has purpose`,
  );

  // Must have at least 1 algorithm step
  assert(
    Array.isArray(step.algorithm) && step.algorithm.length > 0,
    `${stepId}: has algorithm steps`,
  );

  // Each algorithm step must have order and instruction
  for (let i = 0; i < step.algorithm.length; i++) {
    const alg = step.algorithm[i];
    assert(
      typeof alg.order === "number",
      `${stepId} alg[${i}]: has order`,
    );
    assert(
      typeof alg.instruction === "string" && alg.instruction.length > 0,
      `${stepId} alg[${i}]: has instruction`,
    );
  }

  // Must have at least 1 transition (except terminal steps like E2)
  const isTerminal = step.constraints?.some((c: string) =>
    c.toLowerCase().includes("термінальний"),
  );
  if (!isTerminal) {
    assert(
      Array.isArray(step.transitions) && step.transitions.length > 0,
      `${stepId}: has transitions`,
    );
  }

  // Must have valid role
  assert(
    typeof step.role === "string" && step.role.length > 0,
    `${stepId}: has role`,
  );

  // Must have valid block
  assert(
    typeof step.block === "string" && step.block.length > 0,
    `${stepId}: has block`,
  );
}

// =============================================================================
// Section 5: Artifact references in state.json
// =============================================================================

console.log("\n══ 5. State.json Artifacts ══");

const STATE_PATH = path.resolve(
  PROJECT_ROOT,
  "control_center/system_state/state.json",
);

if (fs.existsSync(STATE_PATH)) {
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));

  // Check artifacts
  if (state.artifacts) {
    for (const [key, value] of Object.entries(state.artifacts)) {
      if (value === null) continue;
      const fullPath = path.resolve(PROJECT_ROOT, value as string);
      const exists = fs.existsSync(fullPath);
      assert(exists, `artifacts.${key} → "${value}" exists on disk`);
    }
  }

  // Check prev_cycle_artifacts
  if (state.prev_cycle_artifacts) {
    for (const [key, value] of Object.entries(state.prev_cycle_artifacts)) {
      if (value === null) continue;
      const fullPath = path.resolve(PROJECT_ROOT, value as string);
      const exists = fs.existsSync(fullPath);
      assert(exists, `prev_cycle_artifacts.${key} → "${value}" exists on disk`);
    }
  }
} else {
  console.log("  ⚠️ state.json not found — skipping artifact checks");
}

// =============================================================================
// Section 6: No references to old directory names
// =============================================================================

console.log("\n══ 6. No Stale Path References ══");

const STALE_PATTERNS = ["client/", "api/"];

for (const stepId of ALL_STEPS) {
  const step = getStep(stepId);

  // Check precondition paths
  for (const pc of step.preconditions) {
    if (pc.path) {
      for (const stale of STALE_PATTERNS) {
        assert(
          !pc.path.startsWith(stale),
          `${stepId} precondition path does not use stale "${stale}": ${pc.path}`,
        );
      }
    }
  }

  // Check input paths
  for (const input of step.inputs) {
    if (input.path) {
      for (const stale of STALE_PATTERNS) {
        assert(
          !input.path.startsWith(stale),
          `${stepId} input path does not use stale "${stale}": ${input.path}`,
        );
      }
    }
  }

  // Check algorithm text
  for (const alg of step.algorithm) {
    for (const stale of STALE_PATTERNS) {
      assert(
        !alg.instruction.includes(stale),
        `${stepId} alg[${alg.order}] instruction does not reference stale "${stale}"`,
      );
      if (alg.substeps) {
        for (let si = 0; si < alg.substeps.length; si++) {
          assert(
            !alg.substeps[si].includes(stale),
            `${stepId} alg[${alg.order}].substep[${si}] does not reference stale "${stale}"`,
          );
        }
      }
    }
  }
}

// =============================================================================
// Summary
// =============================================================================

console.log("\n" + "=".repeat(60));
console.log(`Structural Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("=".repeat(60));

if (failures.length > 0) {
  console.log("\n── All failures ──");
  for (const f of failures) {
    console.log(`  ❌ ${f}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
