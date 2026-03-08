// =============================================================================
// POKA-YOKE Dispatch — перевірка передумов перед кожним кроком
// Конвертовано з: control_center/docs/system_cycle.md
//   (Секція "Захисні механізми → POKA-YOKE", таблиця 28 кроків)
// Роль: O4 — runtime dispatch що оцінює preconditions кожного StepDefinition
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type {
  SystemState,
  OrchestratorConfig,
  Step,
  PreconditionCheck,
  CheckData,
  PreconditionResult,
} from "../types";
import { getStep } from "../step-registry";

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
// Step ordinal — для перевірки step_completed
// Порядок відповідає лінійному проходженню блоків у system_cycle.md.
// S-блок окремий (запускається людиною), але ординал потрібен для порівняння.
// =============================================================================

const STEP_ORDER: Step[] = [
  // Discovery (Блок 1)
  "L1", "L2", "L3", "L4", "L5", "L6", "L7",
  // Foundation (Блок 2)
  "L8", "L9", "L10", "L11", "L12", "L13", "GATE1",
  // Development Cycle (Блок 3)
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  // Validation (Блок 4)
  "V0", "V1", "V2", "V3",
  // Security Fix (Блок 5)
  "S1", "S2", "S3", "S4", "S5",
  // Linear Exit (Блок 6)
  "E1", "E2",
];

function stepOrdinal(step: Step): number {
  const idx = STEP_ORDER.indexOf(step);
  // -1 = unknown step; callers treat this as "not reached"
  return idx;
}

// =============================================================================
// Path resolution — відносний шлях з precondition → абсолютний
// =============================================================================

function resolvePath(config: OrchestratorConfig, relativePath: string): string {
  return path.resolve(config.project_root, relativePath);
}

// =============================================================================
// Evaluate single PreconditionCheck
// Кожен тип перевірки (7 типів з PreconditionType) має окрему гілку.
// Повертає PreconditionResult (check: string, passed: boolean, reason?: string).
// =============================================================================

function evaluateCheck(
  check: PreconditionCheck,
  state: SystemState,
  config: OrchestratorConfig,
): PreconditionResult {
  switch (check.type) {
    // ── file_exists: перевірка наявності файлу на диску ──
    case "file_exists": {
      if (!check.path) {
        return {
          check: check.description,
          passed: false,
          reason: "No path specified for file_exists check",
        };
      }
      // Шляхи вбудовані в код → auto-pass
      if (isEmbeddedPath(check.path)) {
        return {
          check: check.description,
          passed: true,
          reason: "Вбудовано в код оркестратора",
        };
      }
      const fullPath = resolvePath(config, check.path);
      const exists = fs.existsSync(fullPath);
      return {
        check: check.description,
        passed: exists,
        reason: exists ? undefined : `File not found: ${check.path}`,
      };
    }

    // ── dir_empty: директорія існує і порожня (або не існує → вважається порожньою) ──
    case "dir_empty": {
      if (!check.path) {
        return {
          check: check.description,
          passed: false,
          reason: "No path specified for dir_empty check",
        };
      }
      const fullPath = resolvePath(config, check.path);
      if (!fs.existsSync(fullPath)) {
        // Неіснуюча директорія = порожня (немає файлів для виконання)
        return { check: check.description, passed: true };
      }
      // Ігноруємо dot-файли (.gitkeep тощо)
      const entries = fs.readdirSync(fullPath).filter((f) => !f.startsWith("."));
      const isEmpty = entries.length === 0;
      return {
        check: check.description,
        passed: isEmpty,
        reason: isEmpty
          ? undefined
          : `Directory not empty: ${check.path} (${entries.length} items)`,
      };
    }

    // ── dir_not_empty: директорія існує і містить файли ──
    case "dir_not_empty": {
      if (!check.path) {
        return {
          check: check.description,
          passed: false,
          reason: "No path specified for dir_not_empty check",
        };
      }
      // Шляхи вбудовані в код → auto-pass
      if (isEmbeddedPath(check.path)) {
        return {
          check: check.description,
          passed: true,
          reason: "Вбудовано в код оркестратора",
        };
      }
      const fullPath = resolvePath(config, check.path);
      if (!fs.existsSync(fullPath)) {
        return {
          check: check.description,
          passed: false,
          reason: `Directory not found: ${check.path}`,
        };
      }
      const entries = fs.readdirSync(fullPath).filter((f) => !f.startsWith("."));
      const notEmpty = entries.length > 0;
      return {
        check: check.description,
        passed: notEmpty,
        reason: notEmpty ? undefined : `Directory is empty: ${check.path}`,
      };
    }

    // ── artifact_registered: state.artifacts[key] !== null ──
    case "artifact_registered": {
      if (!check.artifact_key) {
        return {
          check: check.description,
          passed: false,
          reason: "No artifact_key specified for artifact_registered check",
        };
      }
      const value = state.artifacts[check.artifact_key];
      const registered = value !== null && value !== undefined;
      return {
        check: check.description,
        passed: registered,
        reason: registered
          ? undefined
          : `Artifact '${check.artifact_key}' is not registered (null)`,
      };
    }

    // ── artifact_null: state.artifacts[key] === null ──
    case "artifact_null": {
      if (!check.artifact_key) {
        return {
          check: check.description,
          passed: false,
          reason: "No artifact_key specified for artifact_null check",
        };
      }
      const value = state.artifacts[check.artifact_key];
      const isNull = value === null || value === undefined;
      return {
        check: check.description,
        passed: isNull,
        reason: isNull
          ? undefined
          : `Artifact '${check.artifact_key}' is not null: ${value}`,
      };
    }

    // ── step_completed: last_completed_step >= check.step (ordinal) ──
    case "step_completed": {
      if (!check.step) {
        return {
          check: check.description,
          passed: false,
          reason: "No step specified for step_completed check",
        };
      }
      if (!state.last_completed_step) {
        return {
          check: check.description,
          passed: false,
          reason: `No steps completed yet (need: ${check.step})`,
        };
      }
      const lastOrd = stepOrdinal(state.last_completed_step);
      const requiredOrd = stepOrdinal(check.step);
      const completed = lastOrd >= requiredOrd;
      return {
        check: check.description,
        passed: completed,
        reason: completed
          ? undefined
          : `Step ${check.step} not yet completed (last completed: ${state.last_completed_step})`,
      };
    }

    // ── state_field: state[field] === expected_value ──
    // OPT-3: коли expected_value не задано (undefined) — перевіряємо що поле
    // існує та не дорівнює "blocked". Це виправляє P2 false-positives:
    // раніше undefined === "in_progress" → завжди false.
    case "state_field": {
      if (!check.field) {
        return {
          check: check.description,
          passed: false,
          reason: "No field specified for state_field check",
        };
      }
      const actual = state[check.field];

      // Якщо expected_value не задано — семантика "field exists AND ≠ blocked"
      if (check.expected_value === undefined) {
        const exists = actual !== undefined && actual !== null;
        const notBlocked = actual !== "blocked";
        const passed = exists && notBlocked;
        return {
          check: check.description,
          passed,
          reason: passed
            ? undefined
            : !exists
              ? `state.${check.field} is ${JSON.stringify(actual)}`
              : `state.${check.field} = "blocked"`,
        };
      }

      const matches = actual === check.expected_value;
      return {
        check: check.description,
        passed: matches,
        reason: matches
          ? undefined
          : `state.${check.field} = ${JSON.stringify(actual)}, expected ${JSON.stringify(check.expected_value)}`,
      };
    }

    default: {
      // Невідомий тип — fail-safe, блокує крок
      const unknownType = (check as PreconditionCheck).type;
      return {
        check: check.description,
        passed: false,
        reason: `Unknown precondition type: ${unknownType}`,
      };
    }
  }
}

// =============================================================================
// Main dispatch — checkPreconditions
// Отримує поточний крок зі step-registry, ітерує preconditions[],
// повертає CheckData (сумісний з CLI check response).
// Якщо передумова не виконана — крок БЛОКУЄТЬСЯ (all_passed = false).
// =============================================================================

export function checkPreconditions(
  state: SystemState,
  config: OrchestratorConfig,
): CheckData {
  const step = getStep(state.current_step);
  const results: PreconditionResult[] = [];
  let allPassed = true;

  for (const precondition of step.preconditions) {
    const result = evaluateCheck(precondition, state, config);
    results.push(result);
    if (!result.passed) {
      allPassed = false;
    }
  }

  return {
    step: state.current_step,
    all_passed: allPassed,
    results,
  };
}
