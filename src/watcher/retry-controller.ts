// =============================================================================
// M6. Retry Controller — auto-retry + auto-issue creation
//
// Коли complete або code-health повертає FAIL:
//   1. Парсить помилку (TSC error / test failure / artifact invalid)
//   2. Створює issue у control_center/issues/active/
//   3. Записує retry count у daemon state
//   4. Якщо retry > 3 → JIDOKA STOP (людина)
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, CLIOutput, Step } from "../types";
import type { CensureBlockTracker, SystemState } from "../types";
import { loadState, saveState } from "../state-machine";
import { incrementRetry, getRetryState, resetRetry } from "./daemon-state";
import { log } from "./daemon-logger";
import type { ActionResult } from "./action-dispatcher";

// =============================================================================
// Конфігурація
// =============================================================================

const MAX_RETRIES = 3;
const CENSURE_RULE_LIMIT = 3;
const CENSURE_TOTAL_LIMIT = 5;

// =============================================================================
// RetryDecision — що робити після failure
// =============================================================================

export type RetryDecision = "retry" | "jidoka_stop" | "ignore";

export interface RetryEvaluation {
  decision: RetryDecision;
  fail_count: number;
  max_retries: number;
  error_summary: string;
  issue_path: string | null;
}

// =============================================================================
// evaluateFailure — оцінити провал і вирішити що робити
// =============================================================================

export function evaluateFailure(
  actionResult: ActionResult,
  config: OrchestratorConfig,
): RetryEvaluation {
  // Завантажити стан щоб дізнатися поточний крок
  const loadResult = loadState(config);
  if ("error" in loadResult) {
    return {
      decision: "ignore",
      fail_count: 0,
      max_retries: MAX_RETRIES,
      error_summary: "Cannot evaluate: state load error",
      issue_path: null,
    };
  }

  const state = loadResult.state;
  const step = state.current_step;
  const errorSummary = extractErrorSummary(actionResult);

  // Інкрементувати retry count
  const issuePath = createIssueForFailure(step, errorSummary, config);
  const failCount = incrementRetry(config, step, errorSummary, issuePath ?? undefined);

  log(config, {
    type: "retry_attempt",
    step,
    retry_count: failCount,
    error: errorSummary,
    path: issuePath ?? undefined,
  });

  // Перевірити чи вичерпані retry
  if (failCount >= MAX_RETRIES) {
    log(config, {
      type: "retry_exhausted",
      step,
      retry_count: failCount,
      details: `Max retries (${MAX_RETRIES}) exceeded for step ${step}. JIDOKA STOP.`,
    });

    // Оновити стан: JIDOKA STOP
    state.status = "blocked";
    state.jidoka_stops = (state.jidoka_stops || 0) + 1;
    state.notes = `JIDOKA STOP: ${MAX_RETRIES} consecutive failures on step ${step}. Error: ${errorSummary}`;
    saveState(config, state);

    return {
      decision: "jidoka_stop",
      fail_count: failCount,
      max_retries: MAX_RETRIES,
      error_summary: errorSummary,
      issue_path: issuePath,
    };
  }

  return {
    decision: "retry",
    fail_count: failCount,
    max_retries: MAX_RETRIES,
    error_summary: errorSummary,
    issue_path: issuePath,
  };
}

// =============================================================================
// onSuccess — скинути retry counter при успіху
// =============================================================================

export function onSuccess(config: OrchestratorConfig): void {
  const loadResult = loadState(config);
  if ("error" in loadResult) return;

  const step = loadResult.state.current_step;
  const retryState = getRetryState(config, step);
  if (retryState && retryState.fail_count > 0) {
    resetRetry(config, step);
  }
}

// =============================================================================
// extractErrorSummary — витягнути короткий опис помилки
// =============================================================================

function extractErrorSummary(actionResult: ActionResult): string {
  // З CLI output
  if (actionResult.output) {
    const output = actionResult.output as CLIOutput<unknown>;
    if ("error" in output && "message" in output) {
      return `${(output as { error: string }).error}: ${(output as { message: string }).message}`;
    }
  }

  // З error message
  if (actionResult.error) {
    // Скоротити довгі повідомлення
    const msg = actionResult.error;
    return msg.length > 200 ? msg.substring(0, 200) + "..." : msg;
  }

  return `Command failed: ${actionResult.command}`;
}

// =============================================================================
// createIssueForFailure — створити issue файл автоматично
// =============================================================================

function createIssueForFailure(
  step: Step,
  errorSummary: string,
  config: OrchestratorConfig,
): string | null {
  try {
    const issuesDir = path.join(config.control_center_path, "issues", "active");

    if (!fs.existsSync(issuesDir)) {
      fs.mkdirSync(issuesDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `auto_${step}_${timestamp}.md`;
    const issuePath = path.join(issuesDir, filename);

    const retryState = getRetryState(config, step);
    const failCount = retryState ? retryState.fail_count : 1;

    const content = `# Auto-generated Issue — Step ${step} Failure

## Metadata
- **Generated by:** Daemon Retry Controller
- **Step:** ${step}
- **Failure count:** ${failCount}
- **Timestamp:** ${new Date().toISOString()}
- **Max retries:** ${MAX_RETRIES}

## Error Summary

\`\`\`
${errorSummary}
\`\`\`

## Context

This issue was automatically created by the daemon retry controller
after step ${step} failed ${failCount} time(s).

${failCount >= MAX_RETRIES ? "**⚠️ JIDOKA STOP: Maximum retries exceeded. Human intervention required.**" : `Retry ${failCount}/${MAX_RETRIES} — will attempt again on next trigger.`}

## Action Required

1. Review the error above
2. Fix the underlying issue
3. Re-trigger the step or manually run \`complete\`

## Previous Errors

${retryState?.issues_created.map((p) => `- ${path.basename(p)}`).join("\n") || "First failure"}
`;

    fs.writeFileSync(issuePath, content, "utf-8");

    // Оновити issues_created counter в state
    const loadResult = loadState(config);
    if (!("error" in loadResult)) {
      const state = loadResult.state;
      state.issues_created = (state.issues_created || 0) + 1;
      saveState(config, state);
    }

    log(config, {
      type: "issue_created",
      step,
      path: issuePath,
      details: `Auto-issue created: ${filename}`,
    });

    return issuePath;
  } catch (err) {
    log(config, {
      type: "error",
      step,
      error: `Failed to create issue: ${(err as Error).message}`,
    });
    return null;
  }
}

// =============================================================================
// OPT-10: Censure Block Tracker
// =============================================================================

/** Результат реєстрації CENSURE block */
export interface CensureBlockResult {
  escalate: boolean;
  jidoka_warning: boolean;
  message: string;
  skip_suggestion: boolean;
}

/**
 * Ініціалізувати tracker якщо не існує.
 */
export function ensureCensureTracker(state: SystemState): CensureBlockTracker {
  if (!state.censure_block_tracker) {
    state.censure_block_tracker = {
      per_rule: {},
      total_blocks: 0,
      escalated_rules: [],
    };
  }
  return state.censure_block_tracker;
}

/**
 * Зареєструвати CENSURE block.
 * Повертає: { escalate, jidoka_warning, message, skip_suggestion }
 */
export function recordCensureBlock(
  state: SystemState,
  ruleId: string,
): CensureBlockResult {
  const tracker = ensureCensureTracker(state);

  // Increment counters
  tracker.per_rule[ruleId] = (tracker.per_rule[ruleId] || 0) + 1;
  tracker.total_blocks += 1;

  const ruleCount = tracker.per_rule[ruleId];
  const result: CensureBlockResult = {
    escalate: false,
    jidoka_warning: false,
    message: "",
    skip_suggestion: false,
  };

  // Check per-rule limit
  if (
    ruleCount >= CENSURE_RULE_LIMIT &&
    !tracker.escalated_rules.includes(ruleId)
  ) {
    result.escalate = true;
    result.message = `Rule ${ruleId} blocked ${ruleCount} times. Creating issue for human review.`;
    tracker.escalated_rules.push(ruleId);
  }

  // Check total limit
  if (tracker.total_blocks >= CENSURE_TOTAL_LIMIT) {
    result.jidoka_warning = true;
    result.message += `${result.message ? " " : ""}Total CENSURE blocks: ${tracker.total_blocks} >= ${CENSURE_TOTAL_LIMIT}. JIDOKA WARNING.`;
  }

  // Suggest skipping if rule was escalated
  if (tracker.escalated_rules.includes(ruleId)) {
    result.skip_suggestion = true;
  }

  return result;
}

/**
 * Скинути tracker (при ручному reset або початку нової сесії).
 */
export function resetCensureTracker(state: SystemState): void {
  state.censure_block_tracker = {
    per_rule: {},
    total_blocks: 0,
    escalated_rules: [],
  };
}

/**
 * Отримати summary для gate reasoning.
 */
export function getCensureTrackerSummary(state: SystemState): string {
  const tracker = state.censure_block_tracker;
  if (!tracker || tracker.total_blocks === 0) {
    return "No censure blocks recorded.";
  }

  const lines: string[] = [
    `Total CENSURE blocks: ${tracker.total_blocks}`,
  ];

  for (const [rule, count] of Object.entries(tracker.per_rule)) {
    const escalated = tracker.escalated_rules.includes(rule)
      ? " [ESCALATED]"
      : "";
    lines.push(`  ${rule}: ${count}x${escalated}`);
  }

  return lines.join("\n");
}
