// =============================================================================
// CLI Command: daemon — управління daemon (start/stop/status)
// Інтегрований у оркестратор як додаткова команда.
// Для повноцінного daemon запуску використовується src/daemon.ts напряму.
// =============================================================================

import * as path from "path";
import type {
  OrchestratorConfig,
  SystemState,
  CLIOutput,
  DaemonData,
} from "../types";
import {
  loadDaemonState,
  setRunning,
} from "../watcher/daemon-state";
import { log } from "../watcher/daemon-logger";

// =============================================================================
// handleDaemon — обробка команди daemon
// =============================================================================

export function handleDaemon(
  state: SystemState,
  config: OrchestratorConfig,
  subcommand?: string,
): CLIOutput<DaemonData> {
  const sub = (subcommand ?? "status") as "start" | "stop" | "status" | "signal-poll";

  switch (sub) {
    case "start":
      return handleDaemonStart(state, config);
    case "stop":
      return handleDaemonStop(state, config);
    case "status":
      return handleDaemonStatus(state, config);
    case "signal-poll":
      return handleSignalPoll(state, config);
    default:
      return {
        success: false,
        command: "daemon",
        error: "INVALID_COMMAND",
        message: `Unknown daemon subcommand: ${sub}. Valid: start, stop, status, signal-poll`,
      };
  }
}

// =============================================================================
// start — запустити daemon як background process
// =============================================================================

function handleDaemonStart(
  _state: SystemState,
  config: OrchestratorConfig,
): CLIOutput<DaemonData> {
  const daemonState = loadDaemonState(config);

  if (daemonState.is_running) {
    return {
      success: true,
      command: "daemon",
      data: {
        subcommand: "start",
        daemon_active: true,
        message: "Daemon is already running",
      },
      next_action: "Daemon вже працює. Використовуйте 'daemon status' для перевірки.",
    };
  }

  // Запустити daemon як background process
  try {
    const daemonScript = path.resolve(__dirname, "../daemon.ts");
    const child = require("child_process").spawn(
      "npx",
      ["ts-node", daemonScript, "start"],
      {
        detached: true,
        stdio: "ignore",
        cwd: path.resolve(__dirname, "../.."),
        shell: true,
      },
    );
    child.unref();

    // Дати daemon трохи часу запуститися
    // (state буде оновлено daemon-ом самостійно)

    log(config, {
      type: "daemon_started",
      details: "Daemon started via CLI command",
    });

    return {
      success: true,
      command: "daemon",
      data: {
        subcommand: "start",
        daemon_active: true,
        message: "Daemon started as background process",
      },
      next_action: "Daemon запущено. Використовуйте 'daemon status' для моніторингу.",
    };
  } catch (err) {
    return {
      success: false,
      command: "daemon",
      error: "BLOCKED",
      message: `Failed to start daemon: ${(err as Error).message}`,
    };
  }
}

// =============================================================================
// stop — зупинити daemon
// =============================================================================

function handleDaemonStop(
  _state: SystemState,
  config: OrchestratorConfig,
): CLIOutput<DaemonData> {
  const daemonState = loadDaemonState(config);

  if (!daemonState.is_running) {
    return {
      success: true,
      command: "daemon",
      data: {
        subcommand: "stop",
        daemon_active: false,
        message: "Daemon is not running",
      },
      next_action: "Daemon не працює.",
    };
  }

  // Помітити як зупинений
  setRunning(config, false);

  log(config, {
    type: "daemon_stopped",
    details: "Daemon stopped via CLI command",
  });

  return {
    success: true,
    command: "daemon",
    data: {
      subcommand: "stop",
      daemon_active: false,
      events_processed: daemonState.events_processed,
      actions_executed: daemonState.actions_executed,
      message: "Daemon marked as stopped",
    },
    next_action: "Daemon зупинено. Процес може потребувати ручного завершення (kill).",
  };
}

// =============================================================================
// status — вивести статус daemon
// =============================================================================

function handleDaemonStatus(
  _state: SystemState,
  config: OrchestratorConfig,
): CLIOutput<DaemonData> {
  const daemonState = loadDaemonState(config);

  return {
    success: true,
    command: "daemon",
    data: {
      subcommand: "status",
      daemon_active: daemonState.is_running,
      events_processed: daemonState.events_processed,
      actions_executed: daemonState.actions_executed,
      message: daemonState.is_running
        ? `Daemon running since ${daemonState.started_at}`
        : "Daemon is not running",
    },
    next_action: daemonState.is_running
      ? "Daemon активний. Моніторинг файлової системи працює."
      : "Daemon не активний. Запустіть через 'daemon start'.",
  };
}

// =============================================================================
// signal-poll — запустити signal poller як background process (OPT-17)
// =============================================================================

function handleSignalPoll(
  _state: SystemState,
  config: OrchestratorConfig,
): CLIOutput<DaemonData> {
  // Check if another poller is already running
  const { isLockActive } = require("../daemon/signal-poller");
  if (isLockActive(config)) {
    return {
      success: true,
      command: "daemon",
      data: {
        subcommand: "signal-poll",
        daemon_active: true,
        message: "Signal poller is already running (lock active)",
      },
      next_action: "Signal poller вже працює.",
    };
  }

  // Spawn signal-poller as background process
  try {
    const pollerScript = path.resolve(__dirname, "../daemon/signal-poller.ts");
    const child = require("child_process").spawn(
      "npx",
      ["ts-node", pollerScript],
      {
        detached: true,
        stdio: "ignore",
        cwd: path.resolve(__dirname, "../.."),
        shell: true,
      },
    );
    child.unref();

    log(config, {
      type: "signal_poll_started",
      details: "Signal poller started via CLI command",
    });

    return {
      success: true,
      command: "daemon",
      data: {
        subcommand: "signal-poll",
        daemon_active: true,
        message: "Signal poller started as background process",
      },
      next_action: "Signal poller запущено. Слідкує за session_boundary.signal кожні 30с.",
    };
  } catch (err) {
    return {
      success: false,
      command: "daemon",
      error: "BLOCKED",
      message: `Failed to start signal poller: ${(err as Error).message}`,
    };
  }
}
