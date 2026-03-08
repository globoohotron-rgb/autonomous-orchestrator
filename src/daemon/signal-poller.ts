// =============================================================================
// OPT-17: Signal Poller — headless automation без VS Code
//
// Polling daemon що слідкує за session_boundary.signal і запускає
// Cline через CLI коли VS Code / Session Bridge недоступні.
//
// Запуск (foreground):
//   npx ts-node src/daemon/signal-poller.ts
//
// Через orchestrator (background):
//   npx ts-node src/orchestrator.ts daemon signal-poll
//
// Пріоритет: Session Bridge > Signal Poller (grace period)
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";
import { log } from "../watcher/daemon-logger";

// =============================================================================
// Constants
// =============================================================================

/** Polling interval (default 30s) */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** Grace period for Session Bridge priority (5s) */
export const BRIDGE_GRACE_PERIOD_MS = 5_000;

/** Lock staleness threshold (5 minutes) */
export const LOCK_STALE_MS = 5 * 60_000;

const SIGNAL_FILE = "session_boundary.signal";
const LOCK_FILE = "signal_poll.lock";

// =============================================================================
// Interfaces
// =============================================================================

/** Parsed signal data from session_boundary.signal */
export interface SignalData {
  prompt: string;
  type?: string;
  gate_step?: string;
  block?: string;
  cycle?: number;
  timestamp?: string;
}

/** Signal poller configuration options */
export interface SignalPollerOptions {
  /** Polling interval in ms (default: 30000) */
  pollIntervalMs?: number;
  /** Grace period for Session Bridge priority in ms (default: 5000) */
  bridgeGracePeriodMs?: number;
  /** Override CLI command for Cline (default: "npx cline") */
  clineCommand?: string;
  /** Dry run mode — detect signals but don't execute (default: false) */
  dryRun?: boolean;
}

/** Lock file content */
export interface LockInfo {
  pid: number;
  started_at: string;
}

/** Result of executing a CLI session */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  elapsed_ms: number;
}

// =============================================================================
// Path helpers
// =============================================================================

/** Get absolute path to session_boundary.signal */
export function getSignalPath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", SIGNAL_FILE);
}

/** Get absolute path to signal_poll.lock */
export function getLockPath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", LOCK_FILE);
}

// =============================================================================
// Signal parsing — читає та парсить session_boundary.signal
// =============================================================================

/**
 * Parse signal file content. Returns null if file missing/empty.
 * Supports JSON format (from orchestrator) and plain text fallback.
 */
export function parseSignalFile(filePath: string): SignalData | null {
  try {
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return null;

    try {
      const parsed = JSON.parse(content);
      return {
        prompt: parsed.prompt || content,
        type: parsed.type,
        gate_step: parsed.gate_step,
        block: parsed.block,
        cycle: parsed.cycle,
        timestamp: parsed.timestamp,
      };
    } catch {
      // Plain text fallback
      return { prompt: content };
    }
  } catch {
    return null;
  }
}

// =============================================================================
// Lock management — запобігає паралельному запуску кількох poller-ів
// та race condition з Session Bridge
// =============================================================================

/**
 * Acquire exclusive lock. Returns false if another poller holds a fresh lock.
 * Stale locks (>5 min) are automatically removed.
 */
export function acquireLock(config: OrchestratorConfig): boolean {
  const lockPath = getLockPath(config);
  try {
    if (fs.existsSync(lockPath)) {
      const stat = fs.statSync(lockPath);
      if (Date.now() - stat.mtimeMs < LOCK_STALE_MS) {
        return false; // Active lock held by another process
      }
      // Stale lock — safe to override
    }

    const dir = path.dirname(lockPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const info: LockInfo = {
      pid: process.pid,
      started_at: new Date().toISOString(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(info), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Release lock (remove lock file) */
export function releaseLock(config: OrchestratorConfig): void {
  try {
    const lockPath = getLockPath(config);
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch { /* ignore */ }
}

/** Check if a lock is currently active (exists and not stale) */
export function isLockActive(config: OrchestratorConfig): boolean {
  const lockPath = getLockPath(config);
  try {
    if (!fs.existsSync(lockPath)) return false;
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs < LOCK_STALE_MS;
  } catch {
    return false;
  }
}

/** Read lock info (PID, start time). Returns null if no lock. */
export function readLockInfo(config: OrchestratorConfig): LockInfo | null {
  const lockPath = getLockPath(config);
  try {
    if (!fs.existsSync(lockPath)) return null;
    const content = fs.readFileSync(lockPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Refresh lock timestamp (keep-alive during long-running poller) */
export function refreshLock(config: OrchestratorConfig): void {
  try {
    const lockPath = getLockPath(config);
    const info: LockInfo = {
      pid: process.pid,
      started_at: new Date().toISOString(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(info), "utf-8");
  } catch { /* ignore */ }
}

// =============================================================================
// CLI command builder
// =============================================================================

/**
 * Build the CLI command string to invoke Cline.
 * Prompt is written to a temp file to avoid shell escaping issues.
 */
export function buildCliCommand(
  promptFilePath: string,
  clineCommand?: string,
): string {
  const cmd = clineCommand || "npx cline";
  return `${cmd} --task-file "${promptFilePath}"`;
}

// =============================================================================
// CLI session execution — запуск Cline через shell
// =============================================================================

/**
 * Execute a Cline CLI session with the given prompt.
 * Writes prompt to temp file, executes command, cleans up.
 *
 * NOTE: Cline CLI is experimental. Command is configurable via options.
 */
export function executeCliSession(
  prompt: string,
  config: OrchestratorConfig,
  options?: Pick<SignalPollerOptions, "clineCommand" | "dryRun">,
): ExecutionResult {
  const start = Date.now();

  if (options?.dryRun) {
    return { success: true, elapsed_ms: Date.now() - start };
  }

  try {
    // Write prompt to temp file (avoids shell escaping issues)
    const tmpPath = path.join(
      config.control_center_path, "system_state", ".signal_prompt.tmp"
    );
    fs.writeFileSync(tmpPath, prompt, "utf-8");

    const command = buildCliCommand(tmpPath, options?.clineCommand);
    const { execSync } = require("child_process");

    execSync(command, {
      cwd: config.project_root,
      timeout: 30 * 60_000, // 30 min max per session
      stdio: "inherit",
    });

    // Cleanup temp file
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }

    return { success: true, elapsed_ms: Date.now() - start };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
      elapsed_ms: Date.now() - start,
    };
  }
}

// =============================================================================
// SignalPoller — основний клас polling daemon
// =============================================================================

export class SignalPoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private sessionsStarted = 0;
  private signalsSkipped = 0;
  private config: OrchestratorConfig;
  private options: Required<SignalPollerOptions>;

  constructor(config: OrchestratorConfig, options?: SignalPollerOptions) {
    this.config = config;
    this.options = {
      pollIntervalMs: options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      bridgeGracePeriodMs: options?.bridgeGracePeriodMs ?? BRIDGE_GRACE_PERIOD_MS,
      clineCommand: options?.clineCommand ?? "npx cline",
      dryRun: options?.dryRun ?? false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // start — запустити polling loop
  // ─────────────────────────────────────────────────────────────────────────

  start(): boolean {
    if (this.running) return false;

    if (!acquireLock(this.config)) {
      console.log("[signal-poller] Another poller is already running (lock active)");
      return false;
    }

    this.running = true;
    this.sessionsStarted = 0;
    this.signalsSkipped = 0;

    log(this.config, {
      type: "signal_poll_started",
      details: `interval=${this.options.pollIntervalMs / 1000}s, grace=${this.options.bridgeGracePeriodMs / 1000}s, dryRun=${this.options.dryRun}`,
    });

    console.log(`[signal-poller] Headless automation active`);
    console.log(`[signal-poller] Polling every ${this.options.pollIntervalMs / 1000}s`);
    console.log(`[signal-poller] Bridge grace period: ${this.options.bridgeGracePeriodMs / 1000}s`);
    console.log(`[signal-poller] Dry run: ${this.options.dryRun}`);
    console.log(`[signal-poller] Press Ctrl+C to stop`);

    // Start polling interval
    this.timer = setInterval(() => this.poll(), this.options.pollIntervalMs);

    // Graceful shutdown
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // stop — зупинити polling (graceful shutdown)
  // ─────────────────────────────────────────────────────────────────────────

  stop(): void {
    if (!this.running) return;

    console.log(`\n[signal-poller] Stopping... (sessions: ${this.sessionsStarted}, skipped: ${this.signalsSkipped})`);

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    releaseLock(this.config);

    log(this.config, {
      type: "signal_poll_stopped",
      details: `sessions=${this.sessionsStarted}, skipped=${this.signalsSkipped}`,
    });

    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors
  // ─────────────────────────────────────────────────────────────────────────

  isRunning(): boolean { return this.running; }
  getSessionsStarted(): number { return this.sessionsStarted; }
  getSignalsSkipped(): number { return this.signalsSkipped; }

  // ─────────────────────────────────────────────────────────────────────────
  // poll — one poll cycle
  // ─────────────────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    const signalPath = getSignalPath(this.config);

    // Check if signal file exists
    if (!fs.existsSync(signalPath)) return;

    console.log(`[signal-poller] Signal detected: ${path.basename(signalPath)}`);

    // ── Bridge grace period ──
    // Wait to let Session Bridge (VS Code extension) process the signal first.
    // If signal disappears during grace period → Bridge handled it.
    if (this.options.bridgeGracePeriodMs > 0) {
      await new Promise(r => setTimeout(r, this.options.bridgeGracePeriodMs));

      if (!fs.existsSync(signalPath)) {
        this.signalsSkipped++;
        console.log(`[signal-poller] Signal consumed by Session Bridge — skipping`);
        log(this.config, {
          type: "signal_poll_skipped",
          details: "Consumed by Session Bridge during grace period",
        });
        return;
      }
    }

    // ── Parse signal ──
    const signal = parseSignalFile(signalPath);
    if (!signal) {
      console.log(`[signal-poller] Failed to parse signal — skipping`);
      return;
    }

    console.log(`[signal-poller] Processing: type=${signal.type || "text"}, gate=${signal.gate_step || "n/a"}`);

    // ── Remove signal file BEFORE executing (same as Session Bridge) ──
    try { fs.unlinkSync(signalPath); } catch { /* ignore */ }

    // ── Log signal detection ──
    log(this.config, {
      type: "signal_detected",
      details: `type=${signal.type || "text"}, gate=${signal.gate_step || "n/a"}`,
      step: signal.gate_step,
    });

    // ── Execute Cline session ──
    const result = executeCliSession(signal.prompt, this.config, {
      clineCommand: this.options.clineCommand,
      dryRun: this.options.dryRun,
    });

    if (result.success) {
      this.sessionsStarted++;
      console.log(`[signal-poller] Session completed (${Math.round(result.elapsed_ms / 1000)}s). Total: ${this.sessionsStarted}`);
      log(this.config, {
        type: "signal_processed",
        details: `Session #${this.sessionsStarted} completed`,
        elapsed_ms: result.elapsed_ms,
      });
    } else {
      console.log(`[signal-poller] Session failed: ${result.error}`);
      log(this.config, {
        type: "signal_poll_error",
        error: result.error,
        elapsed_ms: result.elapsed_ms,
      });
    }

    // Refresh lock (keep-alive)
    refreshLock(this.config);
  }
}

// =============================================================================
// startSignalPoller — convenience function
// =============================================================================

export function startSignalPoller(
  config: OrchestratorConfig,
  options?: SignalPollerOptions,
): SignalPoller {
  const poller = new SignalPoller(config, options);
  poller.start();
  return poller;
}

// =============================================================================
// CLI Entry Point — direct execution: npx ts-node src/daemon/signal-poller.ts
// =============================================================================

function resolveConfig(): OrchestratorConfig {
  const projectRoot = path.resolve(__dirname, "../../..");
  return {
    control_center_path: path.join(projectRoot, "control_center"),
    project_root: projectRoot,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const config = resolveConfig();

  // Parse CLI flags
  const dryRun = args.includes("--dry-run");
  const intervalIdx = args.indexOf("--interval");
  const pollIntervalMs = intervalIdx !== -1 && args[intervalIdx + 1]
    ? parseInt(args[intervalIdx + 1], 10) * 1000
    : DEFAULT_POLL_INTERVAL_MS;
  const cmdIdx = args.indexOf("--cline-command");
  const clineCommand = cmdIdx !== -1 && args[cmdIdx + 1]
    ? args[cmdIdx + 1]
    : undefined;

  console.log("[signal-poller] OPT-17: Headless Automation — VS Code незалежність");
  console.log(`[signal-poller] Project root: ${config.project_root}`);

  const poller = new SignalPoller(config, {
    pollIntervalMs,
    dryRun,
    clineCommand,
  });

  if (!poller.start()) {
    console.error("[signal-poller] Failed to start (lock conflict?)");
    process.exit(1);
  }
}
