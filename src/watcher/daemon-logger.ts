// =============================================================================
// M8. Daemon Logger — структурований лог подій daemon
// Файл на диску: control_center/system_state/daemon_log.jsonl
// Формат: JSON Lines (один рядок = один event)
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";

// =============================================================================
// Типи log-записів
// =============================================================================

export type DaemonLogType =
  | "daemon_started"
  | "daemon_stopped"
  | "artifact_detected"
  | "code_change_detected"
  | "state_change_detected"
  | "gate_decision_detected"
  | "action_dispatched"
  | "action_success"
  | "action_failed"
  | "timeout_warning"
  | "timeout_jidoka_stop"
  | "retry_attempt"
  | "retry_exhausted"
  | "issue_created"
  | "lock_acquired"
  | "lock_released"
  | "step_timeout_warning"
  | "step_timeout_critical"
  | "gate_timeout"
  | "signal_poll_started"
  | "signal_poll_stopped"
  | "signal_detected"
  | "signal_processed"
  | "signal_poll_skipped"
  | "signal_poll_error"
  | "error";

export interface DaemonLogEntry {
  ts: string;
  type: DaemonLogType;
  /** Шлях до файлу що спричинив подію (якщо є) */
  path?: string;
  /** Дія що була виконана */
  action?: string;
  /** Результат дії */
  result?: string;
  /** Крок якого стосується */
  step?: string;
  /** Тривалість у мілісекундах */
  elapsed_ms?: number;
  /** Тривалість у хвилинах (для timeout) */
  elapsed_min?: number;
  /** Кількість спроб (retry) */
  retry_count?: number;
  /** Повідомлення про помилку */
  error?: string;
  /** Додаткові деталі */
  details?: string;
}

// =============================================================================
// Шлях до daemon_log.jsonl
// =============================================================================

function getLogPath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", "daemon_log.jsonl");
}

// =============================================================================
// log — дописати запис у лог
// =============================================================================

export function log(config: OrchestratorConfig, entry: Omit<DaemonLogEntry, "ts">): void {
  const logPath = getLogPath(config);
  const dir = path.dirname(logPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fullEntry: DaemonLogEntry = {
    ts: new Date().toISOString(),
    ...entry,
  };

  // Один рядок JSON + newline (JSON Lines формат)
  const line = JSON.stringify(fullEntry) + "\n";

  fs.appendFileSync(logPath, line, "utf-8");
}

// =============================================================================
// readLog — прочитати всі записи з логу
// =============================================================================

export function readLog(config: OrchestratorConfig): DaemonLogEntry[] {
  const logPath = getLogPath(config);

  if (!fs.existsSync(logPath)) return [];

  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as DaemonLogEntry);
  } catch {
    return [];
  }
}

// =============================================================================
// readRecentLog — прочитати останні N записів
// =============================================================================

export function readRecentLog(config: OrchestratorConfig, count: number): DaemonLogEntry[] {
  const all = readLog(config);
  return all.slice(-count);
}

// =============================================================================
// clearLog — очистити лог (для тестів або ротації)
// =============================================================================

export function clearLog(config: OrchestratorConfig): void {
  const logPath = getLogPath(config);
  if (fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "", "utf-8");
  }
}
