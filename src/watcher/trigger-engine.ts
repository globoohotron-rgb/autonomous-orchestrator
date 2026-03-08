// =============================================================================
// M3. Trigger Engine — перетворює fs events у конкретні дії
// Маппінг WatchEvent → TriggerAction (яку команду CLI виконати)
//
// | Event              | Умова                              | Дія                              |
// |--------------------|------------------------------------|----------------------------------|
// | artifact_created   | Крок чекає артефакт цього типу     | complete --artifact <path>       |
// | task_created       | Крок = D4/L9                       | Порахувати задачі                |
// | code_changed       | Крок = D5/L10/S3                   | Запустити code-health (preview)  |
// | state_changed      | Ззовні (не daemon)                 | Reload state, перевірка          |
// | gate_decision_cr.  | status = awaiting_human_decision   | decide --decision <parsed>       |
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, SystemState } from "../types";
import { loadState } from "../state-machine";
import type { WatchEvent } from "./artifact-watcher";
import { log } from "./daemon-logger";

// =============================================================================
// Типи дій
// =============================================================================

export type TriggerActionType =
  | "complete"
  | "decide"
  | "code_health_check"
  | "reload_state"
  | "update_tasks_count"
  | "none";

export interface TriggerAction {
  type: TriggerActionType;
  command?: string;
  args?: string[];
  /** Шлях до файлу що спричинив дію */
  triggerPath: string;
  /** Опис для логу */
  description: string;
}

// =============================================================================
// Кроки що очікують артефакти
// =============================================================================

interface ArtifactExpectation {
  /** Підрядок у шляху файлу для match */
  pathPattern: string;
  /** Кроки на яких цей артефакт очікується */
  steps: string[];
}

const ARTIFACT_EXPECTATIONS: ArtifactExpectation[] = [
  { pathPattern: "audit/observe/", steps: ["D2"] },
  { pathPattern: "audit/plan_completion/", steps: ["D6", "L13"] },
  { pathPattern: "audit/hansei/", steps: ["L11", "D7", "V3"] },
  { pathPattern: "audit/goals_check/", steps: ["D9"] },
  { pathPattern: "audit/gate_decisions/", steps: ["L4", "GATE1", "D9", "V3", "S5", "E1"] },
  { pathPattern: "audit/ui_reviews/", steps: ["V0"] },
  { pathPattern: "audit/acceptance_reports/", steps: ["V1"] },
  { pathPattern: "audit/validation_conclusions/", steps: ["V3"] },
];

/** Кроки де код змінюється (task execution) */
const CODE_CHANGE_STEPS: string[] = ["L10", "D5", "S3"];

/** Кроки де створюються задачі */
const TASK_CREATION_STEPS: string[] = ["L9", "D4", "S2"];

// =============================================================================
// evaluate — оцінити подію і повернути дію
// =============================================================================

export function evaluate(
  event: WatchEvent,
  config: OrchestratorConfig,
): TriggerAction {
  // Завантажити поточний стан
  const loadResult = loadState(config);
  if ("error" in loadResult) {
    return {
      type: "none",
      triggerPath: event.filePath,
      description: `Cannot evaluate: state load error: ${loadResult.error}`,
    };
  }

  const state = loadResult.state;

  switch (event.type) {
    case "artifact_created":
      return evaluateArtifactCreated(event, state);

    case "gate_decision_created":
      return evaluateGateDecision(event, state, config);

    case "code_changed":
      return evaluateCodeChanged(event, state);

    case "task_created":
      return evaluateTaskCreated(event, state);

    case "state_changed":
      return evaluateStateChanged(event);

    default:
      return {
        type: "none",
        triggerPath: event.filePath,
        description: `Unknown event type: ${event.type}`,
      };
  }
}

// =============================================================================
// Артефакт створено → complete --artifact <path>
// =============================================================================

function evaluateArtifactCreated(
  event: WatchEvent,
  state: SystemState,
): TriggerAction {
  const normalized = event.relativePath.replace(/\\/g, "/");

  // Знайти expectations для цього шляху
  for (const expectation of ARTIFACT_EXPECTATIONS) {
    if (normalized.includes(expectation.pathPattern)) {
      if (expectation.steps.includes(state.current_step)) {
        return {
          type: "complete",
          command: "complete",
          args: ["--artifact", event.filePath],
          triggerPath: event.filePath,
          description: `Artifact detected for step ${state.current_step}: ${path.basename(event.filePath)}`,
        };
      }
    }
  }

  return {
    type: "none",
    triggerPath: event.filePath,
    description: `Artifact created but not expected for step ${state.current_step}`,
  };
}

// =============================================================================
// Gate decision створено → decide --decision <parsed>
// =============================================================================

function evaluateGateDecision(
  event: WatchEvent,
  state: SystemState,
  config: OrchestratorConfig,
): TriggerAction {
  // Gate decision важливий тільки якщо статус awaiting_human_decision
  if (state.status !== "awaiting_human_decision") {
    return {
      type: "none",
      triggerPath: event.filePath,
      description: "Gate decision file created but status is not awaiting_human_decision",
    };
  }

  // Прочитати файл і спробувати витягнути рішення
  const decision = parseGateDecisionFile(event.filePath, config);
  if (!decision) {
    return {
      type: "none",
      triggerPath: event.filePath,
      description: "Could not parse decision from gate decision file",
    };
  }

  return {
    type: "decide",
    command: "decide",
    args: ["--decision", decision],
    triggerPath: event.filePath,
    description: `Gate decision detected: ${decision} for step ${state.current_step}`,
  };
}

// =============================================================================
// Код змінено → code-health check (preview)
// =============================================================================

function evaluateCodeChanged(
  event: WatchEvent,
  state: SystemState,
): TriggerAction {
  if (CODE_CHANGE_STEPS.includes(state.current_step)) {
    return {
      type: "code_health_check",
      command: "check",
      args: [],
      triggerPath: event.filePath,
      description: `Code changed during ${state.current_step}: ${path.basename(event.filePath)}`,
    };
  }

  return {
    type: "none",
    triggerPath: event.filePath,
    description: `Code changed but step ${state.current_step} is not a code execution step`,
  };
}

// =============================================================================
// Задачу створено → порахувати задачі
// =============================================================================

function evaluateTaskCreated(
  event: WatchEvent,
  state: SystemState,
): TriggerAction {
  if (TASK_CREATION_STEPS.includes(state.current_step)) {
    return {
      type: "update_tasks_count",
      triggerPath: event.filePath,
      description: `Task file created during ${state.current_step}: ${path.basename(event.filePath)}`,
    };
  }

  return {
    type: "none",
    triggerPath: event.filePath,
    description: `Task created but step ${state.current_step} is not a task creation step`,
  };
}

// =============================================================================
// state.json змінено ззовні → reload
// =============================================================================

function evaluateStateChanged(event: WatchEvent): TriggerAction {
  return {
    type: "reload_state",
    triggerPath: event.filePath,
    description: "state.json changed externally — will reload",
  };
}

// =============================================================================
// OPT-12: Hardened Gate Decision Parser
//
// VALID_DECISIONS — whitelist of all gate decisions from SPECIAL_TRANSITIONS.
// parseGateDecisionFile — structured block parsing + line-level fallback.
// Invalid values are rejected (return null instead of forwarding junk).
// =============================================================================

export const VALID_DECISIONS = new Set([
  "GO", "REWORK", "KILL",
  "CONTINUE", "VALIDATE", "AMEND_SPEC",
  "PASS", "PASS_WITH_SECURITY", "FAIL",
  "REBUILD_PLAN", "REBUILD_DESCRIPTION",
  "READY", "NOT_READY",
  "REPEAT", "STOP",
  "D1",
]);

export function parseGateDecisionFile(filePath: string, _config: OrchestratorConfig): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Strategy 1: look inside a "## Decision" / "## Рішення" section
    const decisionBlockMatch = content.match(
      /##\s*(?:Decision|Рішення)[^\n]*\n+(?:[^\n]*\n)*?.*?(?:decision|рішення)\s*:\s*(\S+)/i,
    );
    if (decisionBlockMatch?.[1]) {
      const candidate = decisionBlockMatch[1].toUpperCase().replace(/[^A-Z_]/g, "");
      if (VALID_DECISIONS.has(candidate)) return candidate;
    }

    // Strategy 2: line-level patterns (bold markdown or plain key: value)
    // Note: colon may be inside bold (**Рішення:** GO) or outside (**Рішення**: GO)
    const linePatterns = [
      /^\s*\*\*(?:Decision|Рішення):?\*\*:?\s+(\S+)/im,
      /^\s*(?:decision|рішення)\s*:\s*(\S+)/im,
    ];
    for (const pattern of linePatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        const candidate = match[1].toUpperCase().replace(/[^A-Z_]/g, "");
        if (VALID_DECISIONS.has(candidate)) return candidate;
      }
    }

    return null;
  } catch {
    log(_config, {
      type: "error",
      error: `Failed to parse gate decision file: ${filePath}`,
    });
    return null;
  }
}
