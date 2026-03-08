// =============================================================================
// M2. Metrics Store — зберігання та читання метрик
// Append-only JSONL storage: control_center/system_state/metrics.jsonl
//
// Горизонт 3 — Самонавчання (Фаза 1: збір даних)
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";
import type { Step } from "../types/base";

// =============================================================================
// Types
// =============================================================================

/** Тип метричної події */
export type MetricEventType =
  | "step_complete"
  | "step_fail"
  | "gate_decision"
  | "jidoka_stop"
  | "code_health"
  | "precondition_fail"
  | "cycle_transition"
  | "step_timeout"
  | "gate_timeout";

/** Одна метрична подія */
export interface MetricEvent {
  /** Унікальний ID події (timestamp-based) */
  id: string;
  /** Час події */
  timestamp: string;
  /** Тип події */
  event_type: MetricEventType;
  /** Крок системи на момент події */
  step: Step;
  /** Номер циклу */
  cycle: number;
  /** Дані специфічні для типу події */
  data: Record<string, unknown>;
}

/** Фільтр для читання метрик */
export interface MetricFilter {
  event_type?: MetricEventType;
  step?: Step;
  cycle?: number;
  from_date?: string;
  to_date?: string;
}

/** Зведена статистика */
export interface MetricsSummary {
  total_events: number;
  events_by_type: Record<string, number>;
  cycles_seen: number[];
  steps_seen: string[];
  first_event: string | null;
  last_event: string | null;
}

// =============================================================================
// ID generation — timestamp-based, no external deps
// =============================================================================

let _counter = 0;

export function generateMetricId(): string {
  const now = Date.now();
  _counter = (_counter + 1) % 1000;
  return `M-${now}-${String(_counter).padStart(3, "0")}`;
}

// =============================================================================
// Path
// =============================================================================

function getMetricsPath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", "metrics.jsonl");
}

// =============================================================================
// Append — додати одну метрику (OPT-8: atomic write з lock-файлом)
// =============================================================================

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_INTERVAL_MS = 50;
const LOCK_STALE_MS = 30000;

/**
 * Додати метричну подію до JSONL файлу.
 * Створює файл якщо не існує.
 * OPT-8: Використовує lock-файл для parallel-safe запису.
 * Non-blocking: помилки запису не кидають виключення.
 */
export function appendMetric(config: OrchestratorConfig, event: MetricEvent): void {
  try {
    const metricsPath = getMetricsPath(config);
    const lockPath = metricsPath + ".lock";
    const dir = path.dirname(metricsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(event) + "\n";

    // Acquire lock (best-effort — fallback to unlocked write)
    const locked = acquireMetricsLock(lockPath);
    try {
      fs.appendFileSync(metricsPath, line, "utf-8");
    } finally {
      if (locked) {
        releaseMetricsLock(lockPath);
      }
    }
  } catch {
    // Metric write failure is non-blocking — never crash the orchestrator
  }
}

/**
 * Acquire exclusive lock via O_CREAT|O_EXCL.
 * Returns true if lock acquired, false on timeout (write proceeds without lock).
 */
function acquireMetricsLock(lockPath: string): boolean {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return true;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        // Lock held — check if stale
        if (isMetricsLockStale(lockPath)) {
          try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
          continue;
        }
        // Busy wait
        const end = Date.now() + LOCK_RETRY_INTERVAL_MS;
        while (Date.now() < end) { /* sync wait */ }
        continue;
      }
      // Unexpected error — proceed without lock
      return false;
    }
  }

  // Timeout — write without lock (better than losing metric)
  return false;
}

/** Release lock file */
function releaseMetricsLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch { /* ignore if already removed */ }
}

/** Check if lock is stale (>30s old) */
function isMetricsLockStale(lockPath: string): boolean {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch {
    return true; // file gone = stale
  }
}

// =============================================================================
// Read — прочитати метрики з опціональним фільтром
// =============================================================================

/**
 * Прочитати всі метрики або фільтрувати за параметрами.
 * Повертає порожній масив якщо файл не існує.
 */
export function readMetrics(config: OrchestratorConfig, filter?: MetricFilter): MetricEvent[] {
  const metricsPath = getMetricsPath(config);

  if (!fs.existsSync(metricsPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(metricsPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim().length > 0);
    let events: MetricEvent[] = [];

    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as MetricEvent);
      } catch {
        // Skip malformed lines
      }
    }

    // Apply filters
    if (filter) {
      if (filter.event_type) {
        events = events.filter(e => e.event_type === filter.event_type);
      }
      if (filter.step) {
        events = events.filter(e => e.step === filter.step);
      }
      if (filter.cycle !== undefined) {
        events = events.filter(e => e.cycle === filter.cycle);
      }
      if (filter.from_date) {
        events = events.filter(e => e.timestamp >= filter.from_date!);
      }
      if (filter.to_date) {
        events = events.filter(e => e.timestamp <= filter.to_date!);
      }
    }

    return events;
  } catch {
    return [];
  }
}

// =============================================================================
// Summary — зведена статистика
// =============================================================================

/**
 * Зведена статистика по всіх метриках.
 */
export function getMetricsSummary(config: OrchestratorConfig): MetricsSummary {
  const events = readMetrics(config);

  const eventsByType: Record<string, number> = {};
  const cyclesSet = new Set<number>();
  const stepsSet = new Set<string>();

  for (const event of events) {
    eventsByType[event.event_type] = (eventsByType[event.event_type] ?? 0) + 1;
    cyclesSet.add(event.cycle);
    stepsSet.add(event.step);
  }

  return {
    total_events: events.length,
    events_by_type: eventsByType,
    cycles_seen: [...cyclesSet].sort((a, b) => a - b),
    steps_seen: [...stepsSet],
    first_event: events.length > 0 ? events[0].timestamp : null,
    last_event: events.length > 0 ? events[events.length - 1].timestamp : null,
  };
}

// =============================================================================
// Clear — для тестів
// =============================================================================

export function clearMetrics(config: OrchestratorConfig): void {
  const metricsPath = getMetricsPath(config);
  if (fs.existsSync(metricsPath)) {
    fs.unlinkSync(metricsPath);
  }
  // OPT-8: cleanup lock file
  const lockPath = metricsPath + ".lock";
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}
