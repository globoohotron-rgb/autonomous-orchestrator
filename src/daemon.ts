// =============================================================================
// M1. Daemon Entry Point — запускає watcher + timeout monitor
// Тримає process alive. Замкнутий контур оркестратора.
//
// Запуск:
//   npx ts-node src/daemon.ts start
//   npx ts-node src/daemon.ts stop
//   npx ts-node src/daemon.ts status
// =============================================================================

import * as path from "path";
import type { OrchestratorConfig } from "./types";
import { ArtifactWatcher } from "./watcher/artifact-watcher";
import type { WatchEvent } from "./watcher/artifact-watcher";
import { TimeoutMonitor } from "./watcher/timeout-monitor";
import type { TimeoutCheckResult } from "./watcher/timeout-monitor";
import { evaluate } from "./watcher/trigger-engine";
import type { TriggerAction } from "./watcher/trigger-engine";
import { executeAction, executeTaskCount } from "./watcher/action-dispatcher";
import { evaluateFailure, onSuccess } from "./watcher/retry-controller";
import {
  loadDaemonState,
  saveDaemonState,
  setRunning,
  recordEvent,
} from "./watcher/daemon-state";
import { log, readRecentLog } from "./watcher/daemon-logger";
import { loadState, saveState } from "./state-machine";
import { checkStepTimeout } from "./watcher/step-watchdog";

// =============================================================================
// resolveConfig — визначити шляхи (скопійовано з orchestrator.ts)
// =============================================================================

function resolveConfig(): OrchestratorConfig {
  const projectRoot = path.resolve(__dirname, "../..");
  return {
    control_center_path: path.join(projectRoot, "control_center"),
    project_root: projectRoot,
  };
}

// =============================================================================
// OrchestratorDaemon — основний клас daemon
// =============================================================================

class OrchestratorDaemon {
  private watcher: ArtifactWatcher | null = null;
  private timeoutMonitor: TimeoutMonitor | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;  // OPT-4
  private config: OrchestratorConfig;
  private processing = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // start — запустити daemon
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    log(this.config, {
      type: "daemon_started",
      details: "Closed-loop controller starting...",
    });

    // Ініціалізувати daemon state
    setRunning(this.config, true);

    // Створити watcher
    this.watcher = new ArtifactWatcher(
      this.config,
      (event) => this.onArtifactEvent(event),
    );

    // Створити timeout monitor
    this.timeoutMonitor = new TimeoutMonitor(
      this.config,
      (result) => this.onTimeout(result),
    );

    // Запустити
    this.watcher.start();
    this.timeoutMonitor.start();

    // OPT-4: Step Watchdog — per-step timeout check every 60s
    this.watchdogTimer = setInterval(() => {
      try {
        const result = checkStepTimeout(this.config);
        if (result?.severity === "critical") {
          console.log(`[daemon] ⚠ Step watchdog CRITICAL: ${result.step} running ${Math.round(result.elapsed_ms / 60000)}min (limit: ${Math.round(result.threshold_ms / 60000)}min)`);
        } else if (result?.severity === "warning") {
          console.log(`[daemon] ⏰ Step watchdog: ${result.step} running ${Math.round(result.elapsed_ms / 60000)}min`);
        }
      } catch { /* non-blocking */ }
    }, 60_000);

    // Graceful shutdown handlers
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());

    console.log("[daemon] Замкнутий контур активний");
    console.log("[daemon] Слідкую за control_center/, server/, worker/, app/");
    console.log("[daemon] Press Ctrl+C to stop");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // stop — зупинити daemon (graceful shutdown)
  // ─────────────────────────────────────────────────────────────────────────

  stop(): void {
    console.log("\n[daemon] Зупиняю замкнутий контур...");

    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }

    if (this.timeoutMonitor) {
      this.timeoutMonitor.stop();
      this.timeoutMonitor = null;
    }

    // OPT-4: Stop step watchdog
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    setRunning(this.config, false);

    log(this.config, {
      type: "daemon_stopped",
      details: "Graceful shutdown complete",
    });

    console.log("[daemon] Зупинено.");
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // status — вивести статус daemon
  // ─────────────────────────────────────────────────────────────────────────

  static status(config: OrchestratorConfig): void {
    const daemonState = loadDaemonState(config);
    const recentLogs = readRecentLog(config, 10);

    console.log(JSON.stringify({
      daemon: {
        is_running: daemonState.is_running,
        started_at: daemonState.started_at,
        events_processed: daemonState.events_processed,
        actions_executed: daemonState.actions_executed,
        lock_active: daemonState.lock_active,
        retries: daemonState.retries,
        last_event: daemonState.last_event,
      },
      recent_log: recentLogs,
    }, null, 2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // onArtifactEvent — callback від watcher
  // ─────────────────────────────────────────────────────────────────────────

  private onArtifactEvent(event: WatchEvent): void {
    // Уникнути паралельної обробки
    if (this.processing) return;
    this.processing = true;

    try {
      console.log(`[daemon] Event: ${event.type} → ${event.relativePath}`);

      // Записати подію
      recordEvent(this.config, {
        type: event.type,
        path: event.relativePath,
        timestamp: event.timestamp,
      });

      // Оцінити що робити
      const action = evaluate(event, this.config);

      if (action.type === "none") {
        console.log(`[daemon]   → ${action.description} (skipped)`);
        return;
      }

      console.log(`[daemon]   → Action: ${action.type} — ${action.description}`);

      // Виконати дію
      this.executeWithRetry(action);

    } finally {
      this.processing = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // executeWithRetry — виконати дію з retry логікою
  // ─────────────────────────────────────────────────────────────────────────

  private executeWithRetry(action: TriggerAction): void {
    switch (action.type) {
      case "complete":
      case "decide":
      case "code_health_check": {
        const result = executeAction(action, this.config);

        if (result.success) {
          console.log(`[daemon]   ✓ Success: ${result.command}`);
          onSuccess(this.config);
          // Скинути warnings при переході на новий крок
          this.timeoutMonitor?.resetWarnings();
        } else {
          console.log(`[daemon]   ✗ Failed: ${result.command} — ${result.error ?? "unknown"}`);
          const retryEval = evaluateFailure(result, this.config);

          if (retryEval.decision === "jidoka_stop") {
            console.log(`[daemon]   ⚠ JIDOKA STOP: ${retryEval.error_summary}`);
            console.log(`[daemon]   Issue created: ${retryEval.issue_path ?? "none"}`);
          } else {
            console.log(`[daemon]   Retry ${retryEval.fail_count}/${retryEval.max_retries}`);
          }
        }
        break;
      }

      case "update_tasks_count": {
        const count = executeTaskCount(this.config);
        // Оновити tasks_total в state
        const loadResult = loadState(this.config);
        if (!("error" in loadResult)) {
          const state = loadResult.state;
          state.tasks_total = count;
          saveState(this.config, state);
          console.log(`[daemon]   Tasks count updated: ${count}`);
        }
        break;
      }

      case "reload_state": {
        const loadResult = loadState(this.config);
        if ("error" in loadResult) {
          console.log(`[daemon]   ⚠ State reload failed: ${loadResult.error}`);
        } else {
          console.log(`[daemon]   State reloaded: ${loadResult.state.current_step} (${loadResult.state.status})`);
          this.timeoutMonitor?.resetWarnings();
        }
        break;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // onTimeout — callback від timeout monitor
  // ─────────────────────────────────────────────────────────────────────────

  private onTimeout(result: TimeoutCheckResult): void {
    if (result.level === "warning") {
      console.log(`[daemon] ⏰ Timeout warning: ${result.message}`);
    } else if (result.level === "jidoka_stop") {
      console.log(`[daemon] ⚠ JIDOKA STOP (timeout): ${result.message}`);

      // Оновити стан: JIDOKA STOP
      const loadResult = loadState(this.config);
      if (!("error" in loadResult)) {
        const state = loadResult.state;
        state.status = "blocked";
        state.jidoka_stops = (state.jidoka_stops || 0) + 1;
        state.notes = `JIDOKA STOP (timeout): Step ${result.step} exceeded ${result.elapsed_min} minutes.`;
        saveState(this.config, state);
      }

      // Створити issue
      const issuesDir = path.join(this.config.control_center_path, "issues", "active");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `timeout_${result.step}_${timestamp}.md`;
      const issuePath = path.join(issuesDir, filename);

      try {
        const fs = require("fs");
        if (!fs.existsSync(issuesDir)) {
          fs.mkdirSync(issuesDir, { recursive: true });
        }
        const content = `# Timeout Issue — Step ${result.step}

## Metadata
- **Generated by:** Daemon Timeout Monitor  
- **Step:** ${result.step}
- **Elapsed:** ${result.elapsed_min} minutes
- **Threshold:** ${Math.floor(result.threshold_ms / 60000)} minutes
- **Timestamp:** ${new Date().toISOString()}

## Description

Step ${result.step} has been running for ${result.elapsed_min} minutes, 
exceeding the absolute timeout of 120 minutes.

**JIDOKA STOP activated.** Human intervention required.

## Action Required

1. Review why step ${result.step} is stuck
2. Resolve the blocker
3. Resume the cycle manually
`;
        fs.writeFileSync(issuePath, content, "utf-8");
        console.log(`[daemon] Issue created: ${filename}`);
      } catch {
        console.log(`[daemon] Failed to create timeout issue`);
      }
    }
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const subcommand = args[0] ?? "start";
  const config = resolveConfig();

  switch (subcommand) {
    case "start": {
      const daemon = new OrchestratorDaemon(config);
      daemon.start();
      break;
    }

    case "stop": {
      // Помітити як зупинений
      const state = loadDaemonState(config);
      if (!state.is_running) {
        console.log("[daemon] Daemon is not running.");
        return;
      }
      saveDaemonState(config, { ...state, is_running: false });
      log(config, { type: "daemon_stopped", details: "Stopped via CLI" });
      console.log("[daemon] Daemon marked as stopped. Note: process may still need manual kill.");
      break;
    }

    case "status": {
      OrchestratorDaemon.status(config);
      break;
    }

    default: {
      console.log("Usage: npx ts-node src/daemon.ts <start|stop|status>");
      process.exit(1);
    }
  }
}

// Запуск
main();
