// =============================================================================
// M7. Daemon State — стан daemon окремо від state.json
// Зберігає runtime інформацію daemon: retry counters, events, lock.
// Файл на диску: control_center/system_state/daemon_state.json
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, Step } from "../types";

// =============================================================================
// Інтерфейси
// =============================================================================

export interface RetryState {
  step: Step;
  fail_count: number;
  last_error: string;
  issues_created: string[];
}

export interface DaemonEvent {
  type: string;
  path: string;
  timestamp: string;
}

export interface DaemonState {
  started_at: string;
  is_running: boolean;
  events_processed: number;
  actions_executed: number;
  retries: Record<string, RetryState>;
  last_event: DaemonEvent | null;
  lock_active: boolean;
}

// =============================================================================
// Шлях до daemon_state.json
// =============================================================================

function getDaemonStatePath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", "daemon_state.json");
}

// =============================================================================
// createInitialDaemonState — початковий стан daemon
// =============================================================================

export function createInitialDaemonState(): DaemonState {
  return {
    started_at: new Date().toISOString(),
    is_running: false,
    events_processed: 0,
    actions_executed: 0,
    retries: {},
    last_event: null,
    lock_active: false,
  };
}

// =============================================================================
// loadDaemonState — завантажити стан daemon
// =============================================================================

export function loadDaemonState(config: OrchestratorConfig): DaemonState {
  const statePath = getDaemonStatePath(config);

  if (!fs.existsSync(statePath)) {
    return createInitialDaemonState();
  }

  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "started_at" in parsed) {
      return parsed as DaemonState;
    }
    return createInitialDaemonState();
  } catch {
    return createInitialDaemonState();
  }
}

// =============================================================================
// saveDaemonState — зберегти стан daemon
// =============================================================================

export function saveDaemonState(config: OrchestratorConfig, state: DaemonState): void {
  const statePath = getDaemonStatePath(config);
  const dir = path.dirname(statePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

// =============================================================================
// Lock механізм — щоб watcher ігнорував зміни від dispatcher
// =============================================================================

export function acquireLock(config: OrchestratorConfig): void {
  const state = loadDaemonState(config);
  state.lock_active = true;
  saveDaemonState(config, state);
}

export function releaseLock(config: OrchestratorConfig): void {
  const state = loadDaemonState(config);
  state.lock_active = false;
  saveDaemonState(config, state);
}

export function isLocked(config: OrchestratorConfig): boolean {
  const state = loadDaemonState(config);
  return state.lock_active;
}

// =============================================================================
// Retry helpers
// =============================================================================

export function getRetryState(config: OrchestratorConfig, step: Step): RetryState | null {
  const state = loadDaemonState(config);
  return state.retries[step] ?? null;
}

export function incrementRetry(
  config: OrchestratorConfig,
  step: Step,
  error: string,
  issuePath?: string,
): number {
  const state = loadDaemonState(config);

  if (!state.retries[step]) {
    state.retries[step] = {
      step,
      fail_count: 0,
      last_error: "",
      issues_created: [],
    };
  }

  state.retries[step].fail_count += 1;
  state.retries[step].last_error = error;

  if (issuePath) {
    state.retries[step].issues_created.push(issuePath);
  }

  saveDaemonState(config, state);
  return state.retries[step].fail_count;
}

export function resetRetry(config: OrchestratorConfig, step: Step): void {
  const state = loadDaemonState(config);
  delete state.retries[step];
  saveDaemonState(config, state);
}

// =============================================================================
// Event & Action counters
// =============================================================================

export function recordEvent(config: OrchestratorConfig, event: DaemonEvent): void {
  const state = loadDaemonState(config);
  state.events_processed += 1;
  state.last_event = event;
  saveDaemonState(config, state);
}

export function recordAction(config: OrchestratorConfig): void {
  const state = loadDaemonState(config);
  state.actions_executed += 1;
  saveDaemonState(config, state);
}

// =============================================================================
// setRunning — позначити daemon як запущений/зупинений
// =============================================================================

export function setRunning(config: OrchestratorConfig, running: boolean): void {
  const state = loadDaemonState(config);
  state.is_running = running;
  if (running) {
    state.started_at = new Date().toISOString();
  }
  saveDaemonState(config, state);
}
