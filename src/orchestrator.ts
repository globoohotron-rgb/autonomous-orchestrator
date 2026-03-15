// Orchestrator CLI Entry Point
// Usage: npx ts-node src/orchestrator.ts <command> [options]
//
// Commands: status, check, instructions, complete, decide, daemon, queue, analyze, report

import * as path from "path";
import type {
  OrchestratorConfig,
  SystemState,
  CLIOutput,
  CLIError,
  CLIArgs,
} from "./types";
import { parseCLIArgs } from "./types";
import { loadState, saveState } from "./state-machine";
import { resolveConfig } from "./config";
import { createInitialState } from "./types";
import { handleStatus } from "./commands/status";
import { handleCheck } from "./commands/check";
import { handleInstructions } from "./commands/instructions";
import { handleComplete } from "./commands/complete";
import { handleDecide } from "./commands/decide";
import { handleDaemon } from "./commands/daemon";
import { handleQueue } from "./commands/queue";
import { handleAnalyze } from "./commands/analyze";
import { handleReport } from "./commands/report";



// =============================================================================
// outputJSON — вивести результат як JSON у stdout
// Єдиний канал комунікації CLI → агент
// =============================================================================

function outputJSON(data: unknown): void {
  const config = resolveConfig();
  const orchCmd = `npx ts-node "${path.join(config.project_root, "control_center_code", "src", "orchestrator.ts")}"`;
  const isWindows = process.platform === "win32";
  const enriched = {
    environment: {
      os: process.platform,
      shell: isWindows ? "PowerShell" : "bash",
      cwd: config.project_root,
      run_orchestrator: orchCmd,
    },
    ...(data as Record<string, unknown>),
  };
  console.log(JSON.stringify(enriched, null, 2));
}

// =============================================================================
// dispatch — маршрутизація команди до відповідного обробника
//
// Кожна команда має свій обробник у commands/:
//   status       → handleStatus()       — read-only, завжди success
//   check        → handleCheck()        — read-only, POKA-YOKE dispatch
//   instructions → handleInstructions() — read-only, StepDefinition data
//   complete     → handleComplete()     — мутує state (advance, artifact)
//   decide       → handleDecide()       — мутує state (gate transition)
// =============================================================================

function dispatch(
  args: CLIArgs,
  state: SystemState,
  config: OrchestratorConfig,
): CLIOutput<unknown> {
  switch (args.command) {
    case "status":
      return handleStatus(state, config);
    case "check":
      return handleCheck(state, config);
    case "instructions":
      return handleInstructions(state, config);
    case "complete":
      return handleComplete(state, config, args.artifact);
    case "decide":
      return handleDecide(state, config, args.decision);
    case "daemon":
      return handleDaemon(state, config, args.subcommand);
    case "queue":
      return handleQueue(state, config, args.subcommand, args.task);
    case "analyze":
      return handleAnalyze(state, config, args.subcommand);
    case "report":
      return handleReport(state, config, args.subcommand);
  }
}

// =============================================================================
// main — основна функція CLI
//
// Конвертовано з system_cycle.md → "Модель виконання":
//   1. Парсинг CLI аргументів (parseCLIArgs)
//   2. Завантаження state.json (loadState)
//   3. Dispatch команди до обробника
//   4. Збереження стану якщо він змінився (saveState)
//   5. Виведення JSON результату
//
// State Tracking правила (system_cycle.md):
//   Правило 1: при старті першим кроком читає state.json
//   Правило 4: кожен перехід фіксується ПЕРЕД початком нового кроку
// =============================================================================

function main(): void {
  // ── 1. Parse CLI arguments ──
  // parseCLIArgs приймає process.argv і робить slice(2) внутрішньо
  const parsed = parseCLIArgs(process.argv);

  // CLIError має поле 'success', CLIArgs — ні
  if ("success" in parsed) {
    outputJSON(parsed);
    process.exit(1);
  }

  const args = parsed as CLIArgs;
  const config = resolveConfig();

  // ── 2. Load state.json (Правило 1) ──
  const loadResult = loadState(config);

  let state: SystemState;

  if ("error" in loadResult) {
    if (loadResult.error === "STATE_NOT_FOUND") {
      // Правило 2: state.json не існує — створити початковий стан (L1)
      // state-machine.ts делегує створення до orchestrator.ts
      state = createInitialState();
      saveState(config, state);
    } else {
      // STATE_CORRUPTED → ескалація до людини (H-EH-02)
      const errorResponse: CLIError = {
        success: false,
        command: args.command,
        error: loadResult.error,
        message: loadResult.message,
      };
      outputJSON(errorResponse);
      process.exit(1);
    }
  } else {
    state = loadResult.state;
  }

  // ── 3. Dispatch to command handler ──
  const result = dispatch(args, state, config);

  // ── 4. Save state if command modified it (Правило 4) ──
  // complete і decide мутують state через advanceState/registerArtifact
  // status, check, instructions — read-only, state не змінюється
  if (result.success && (args.command === "complete" || args.command === "decide")) {
    saveState(config, state);
  }

  // ── 5. Output JSON result ──
  outputJSON(result);
}

// --- Запуск ---
main();
