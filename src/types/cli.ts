// =============================================================================
// CLI — типи вводу/виводу CLI-оркестратора
// =============================================================================

import type { Block, Step } from "./base";
import type { AgentRole, AlgorithmStep } from "./steps";
import { AnyGateDecision } from "./decisions";

// --- CLI команди ---

export type CLICommand = "status" | "check" | "instructions" | "complete" | "decide" | "daemon" | "queue" | "analyze" | "report";

// --- Успішна відповідь ---

export interface CLIResponse<T = unknown> {
  success: true;
  command: CLICommand;
  data: T;
  /** Підказка агенту що робити далі */
  next_action: string;
}

// --- Відповідь з помилкою ---

export interface CLIError {
  success: false;
  command: CLICommand;
  error: CLIErrorCode;
  message: string;
  details?: unknown;
}

export type CLIErrorCode =
  | "STATE_NOT_FOUND"
  | "STATE_CORRUPTED"
  | "PRECONDITION_FAILED"
  | "POSTCONDITION_FAILED"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_INVALID"
  | "ARTIFACT_PATH_MISMATCH"
  | "ARTIFACT_VALIDATION_FAILED"
  | "INVALID_DECISION"
  | "INVALID_COMMAND"
  | "STEP_NOT_FOUND"
  | "BLOCKED"
  | "AWAITING_HUMAN"
  | "CODE_HEALTH_FAILED"
  | "CENSURE_BLOCKED"
  | "VALIDATION_MISSING";

export type CLIOutput<T = unknown> = CLIResponse<T> | CLIError;

// --- Дані для кожної команди ---

/** status */
export interface StatusData {
  current_block: Block;
  current_step: Step;
  step_name: string;
  status: string;
  cycle: number;
  iteration: number;
  validation_attempts: number;
  last_completed_step: Step | null;
  last_artifact: string | null;
  isolation_mode: boolean;
  // Мікро-цикли
  current_task?: string | null;
  tasks_completed?: number;
  tasks_total?: number;
  // Метрики
  jidoka_stops?: number;
  issues_created?: number;
}

/** check */
export interface CheckData {
  step: Step;
  all_passed: boolean;
  results: PreconditionResult[];
}

export interface PreconditionResult {
  check: string;
  passed: boolean;
  reason?: string;
}

/** instructions */
export interface InstructionsData {
  step: Step;
  name: string;
  role: AgentRole;
  purpose: string;
  inputs: ResolvedInput[];
  algorithm: AlgorithmStep[];
  constraints: string[];
  artifact_path: string | null;
  additional_artifact_paths?: string[];
  isolation_required: boolean;
  isolation_message?: string;
  /** OPT-2: Censure hints prompt block for plan steps (D3, L8) */
  censure_hints?: string;
  /** OPT-18: Cycle report summary for D2/D3 (completion trend, bottlenecks) */
  cycle_history_summary?: string;
}

export interface ResolvedInput {
  description: string;
  /** Фактичний шлях (розрезолвлений з state.json або конфігу) */
  path: string | null;
  required: boolean;
}

/** complete */
export interface CompleteData {
  completed_step: Step;
  artifact_registered: string | null;
  next_step: Step;
  next_step_name: string;
  state_updates: string[];
  /** True якщо завершений крок має session_boundary — агент повинен зупинитись */
  session_boundary?: boolean;
}

/** decide */
export interface DecideData {
  decision: AnyGateDecision;
  applied_to_step: Step;
  next_step: Step;
  next_step_name: string;
  next_block: Block;
  state_updates: string[];
}

/** daemon */
export interface DaemonData {
  subcommand: "start" | "stop" | "status" | "signal-poll";
  daemon_active: boolean;
  events_processed?: number;
  actions_executed?: number;
  message: string;
}

/** queue */
export interface QueueData {
  subcommand: "scan" | "status" | "next" | "start" | "done" | "fail" | "reset";
  total: number;
  completed: number;
  in_progress: number;
  queued: number;
  blocked: number;
  critical_path: string[];
  tasks: Array<{
    id: string;
    name: string;
    status: string;
    priority: string;
    dependencies: string[];
    blocked_by?: string[];
  }>;
  next_ready: string | null;
  message: string;
}

/** analyze */
export interface AnalyzeData {
  subcommand: "metrics" | "clear";
  total_events: number;
  events_by_type: Record<string, number>;
  cycles_seen: number[];
  steps_seen: string[];
  first_event: string | null;
  last_event: string | null;
  message: string;
}

// --- CLI аргументи ---

export interface CLIArgs {
  command: CLICommand;
  /** --artifact <path> для команди complete */
  artifact?: string;
  /** --decision <DECISION> для команди decide */
  decision?: string;
  /** subcommand для daemon (start/stop/status) або queue (scan/status/next/start/done/fail/reset) */
  subcommand?: string;
  /** --task <ID> для queue start/done/fail/reset */
  task?: string;
}

// --- Парсинг CLI аргументів ---

export function parseCLIArgs(argv: string[]): CLIArgs | CLIError {
  const args = argv.slice(2); // skip node, script

  if (args.length === 0) {
    return {
      success: false,
      command: "status",
      error: "INVALID_COMMAND",
      message: "Usage: orchestrator <status|check|instructions|complete|decide|daemon> [options]",
    };
  }

  const command = args[0] as CLICommand;
  const validCommands: CLICommand[] = ["status", "check", "instructions", "complete", "decide", "daemon", "queue", "analyze", "report"];

  if (!validCommands.includes(command)) {
    return {
      success: false,
      command: command,
      error: "INVALID_COMMAND",
      message: `Unknown command: ${command}. Valid: ${validCommands.join(", ")}`,
    };
  }

  const result: CLIArgs = { command };

  // Parse --artifact
  const artifactIdx = args.indexOf("--artifact");
  if (artifactIdx !== -1 && args[artifactIdx + 1]) {
    result.artifact = args[artifactIdx + 1];
  }

  // Parse --decision
  const decisionIdx = args.indexOf("--decision");
  if (decisionIdx !== -1 && args[decisionIdx + 1]) {
    result.decision = args[decisionIdx + 1];
  }

  // Parse subcommand for daemon
  if (command === "daemon" && args[1]) {
    result.subcommand = args[1];
  }

  // Parse subcommand for queue
  if (command === "queue" && args[1]) {
    result.subcommand = args[1];
  }

  // Parse subcommand for analyze
  if (command === "analyze" && args[1]) {
    result.subcommand = args[1];
  }

  // Parse subcommand for report (cycle number)
  if (command === "report" && args[1]) {
    result.subcommand = args[1];
  }

  // Parse --task
  const taskIdx = args.indexOf("--task");
  if (taskIdx !== -1 && args[taskIdx + 1]) {
    result.task = args[taskIdx + 1];
  }

  return result;
}
