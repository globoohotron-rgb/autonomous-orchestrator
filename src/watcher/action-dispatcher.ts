// =============================================================================
// M4. Action Dispatcher — виконує CLI команди і парсить результат
// Використовує lock файл щоб watcher не реагував на зміни від dispatcher.
// =============================================================================

import { execSync } from "child_process";
import * as path from "path";
import type { OrchestratorConfig, CLIOutput } from "../types";
import { acquireLock, releaseLock, recordAction } from "./daemon-state";
import { log } from "./daemon-logger";
import type { TriggerAction } from "./trigger-engine";

// =============================================================================
// Інтерфейси
// =============================================================================

export interface ActionResult {
  command: string;
  success: boolean;
  output: CLIOutput<unknown> | null;
  timestamp: string;
  trigger: string;
  error?: string;
}

// =============================================================================
// executeAction — виконати CLI команду через orchestrator
// =============================================================================

export function executeAction(
  action: TriggerAction,
  config: OrchestratorConfig,
): ActionResult {
  const timestamp = new Date().toISOString();
  const command = action.command ?? "unknown";
  const args = action.args ?? [];

  const fullCommand = buildCommand(command, args, config);

  log(config, {
    type: "action_dispatched",
    action: `${command} ${args.join(" ")}`.trim(),
    path: action.triggerPath,
    details: action.description,
  });

  // ── Acquire lock: watcher ігнорує зміни від dispatcher ──
  acquireLock(config);

  try {
    const rawOutput = execSync(fullCommand, {
      encoding: "utf-8",
      timeout: 30_000, // 30 секунд timeout на команду
      cwd: path.resolve(__dirname, "../.."), // control_center_code/
      env: { ...process.env, NODE_ENV: "production" },
    });

    // Спробувати парсити JSON output
    const parsed = parseOutput(rawOutput);

    const success = parsed ? (parsed.success === true) : false;

    recordAction(config);

    log(config, {
      type: success ? "action_success" : "action_failed",
      action: `${command} ${args.join(" ")}`.trim(),
      result: success ? "success" : "failed",
      path: action.triggerPath,
    });

    return {
      command: `${command} ${args.join(" ")}`.trim(),
      success,
      output: parsed,
      timestamp,
      trigger: action.triggerPath,
    };
  } catch (err) {
    const errorMessage = (err as Error).message ?? "Unknown error";

    // Спробувати парсити stderr/stdout якщо є
    let output: CLIOutput<unknown> | null = null;
    const execError = err as { stdout?: string; stderr?: string };
    if (execError.stdout) {
      output = parseOutput(execError.stdout);
    }

    log(config, {
      type: "action_failed",
      action: `${command} ${args.join(" ")}`.trim(),
      error: errorMessage,
      path: action.triggerPath,
    });

    return {
      command: `${command} ${args.join(" ")}`.trim(),
      success: false,
      output,
      timestamp,
      trigger: action.triggerPath,
      error: errorMessage,
    };
  } finally {
    // ── Release lock: watcher знову активний ──
    releaseLock(config);
  }
}

// =============================================================================
// buildCommand — зібрати повну CLI команду
// =============================================================================

function buildCommand(
  command: string,
  args: string[],
  _config: OrchestratorConfig,
): string {
  const orchestratorPath = path.resolve(__dirname, "../orchestrator.ts");
  const parts = ["npx", "ts-node", `"${orchestratorPath}"`, command, ...args];

  // Обгорнути аргументи з пробілами в лапки
  return parts
    .map((p) => {
      if (p.includes(" ") && !p.startsWith('"')) return `"${p}"`;
      return p;
    })
    .join(" ");
}

// =============================================================================
// parseOutput — парсити JSON output від CLI
// =============================================================================

function parseOutput(raw: string): CLIOutput<unknown> | null {
  try {
    // CLI може вивести лише JSON, але можуть бути інші рядки перед ним
    const lines = raw.trim().split("\n");

    // Шукаємо JSON від кінця (CLI виводить JSON останнім)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("{")) {
        // Спробувати парсити від цього рядка до кінця
        const jsonStr = lines.slice(i).join("\n");
        try {
          return JSON.parse(jsonStr) as CLIOutput<unknown>;
        } catch {
          // Спробувати тільки цей рядок
          return JSON.parse(line) as CLIOutput<unknown>;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// executeTaskCount — порахувати задачі в tasks/active/
// =============================================================================

export function executeTaskCount(config: OrchestratorConfig): number {
  const tasksDir = path.join(config.control_center_path, "tasks", "active");

  try {
    const files = require("fs").readdirSync(tasksDir) as string[];
    return files.filter((f: string) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}
