// =============================================================================
// Transition Log — окремий файл для логування переходів між кроками
// Зберігається у system_state/transition_log.json
// Не входить у state.json щоб не роздувати його розмір.
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, TransitionEntry, Step } from "../types";

// =============================================================================
// OPT-19: Max transitions before rotation (FIFO)
// =============================================================================

export const MAX_TRANSITIONS = 500;

// =============================================================================
// Шлях до файлу логу
// =============================================================================

function getLogPath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", "transition_log.json");
}

// =============================================================================
// appendTransition — дописати запис переходу
// Викликається з advanceState або saveState
// OPT-19: rotation (FIFO) + atomic write (tmp + rename)
// =============================================================================

export function appendTransition(
  config: OrchestratorConfig,
  entry: TransitionEntry,
): void {
  const logPath = getLogPath(config);
  const dir = path.dirname(logPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let log: TransitionEntry[] = [];

  if (fs.existsSync(logPath)) {
    try {
      const raw = fs.readFileSync(logPath, "utf-8");
      log = JSON.parse(raw);
      if (!Array.isArray(log)) log = [];
    } catch {
      log = [];
    }
  }

  // Обчислити duration: різниця з попереднім записом
  if (log.length > 0 && !entry.duration_ms) {
    const prev = log[log.length - 1];
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(entry.timestamp).getTime();
    if (prevTime > 0 && currTime > prevTime) {
      entry.duration_ms = currTime - prevTime;
    }
  }

  log.push(entry);

  // OPT-19: Rotation — keep only last MAX_TRANSITIONS entries (FIFO)
  if (log.length > MAX_TRANSITIONS) {
    log = log.slice(log.length - MAX_TRANSITIONS);
  }

  // OPT-19: Atomic write — tmp + rename (crash-safe)
  const tmpPath = logPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(log, null, 2), "utf-8");
  fs.renameSync(tmpPath, logPath);
}

// =============================================================================
// readTransitionLog — прочитати весь лог
// =============================================================================

export function readTransitionLog(
  config: OrchestratorConfig,
): TransitionEntry[] {
  const logPath = getLogPath(config);

  if (!fs.existsSync(logPath)) return [];

  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    const log = JSON.parse(raw);
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

// =============================================================================
// getStepDurationStats — статистика тривалості кроків
// =============================================================================

export interface StepDurationStat {
  step: Step;
  count: number;
  total_ms: number;
  avg_ms: number;
  max_ms: number;
}

export function getStepDurationStats(
  config: OrchestratorConfig,
): StepDurationStat[] {
  const log = readTransitionLog(config);
  const stats = new Map<Step, { count: number; total: number; max: number }>();

  for (const entry of log) {
    if (entry.duration_ms && entry.duration_ms > 0) {
      const existing = stats.get(entry.from) ?? { count: 0, total: 0, max: 0 };
      existing.count++;
      existing.total += entry.duration_ms;
      existing.max = Math.max(existing.max, entry.duration_ms);
      stats.set(entry.from, existing);
    }
  }

  return Array.from(stats.entries()).map(([step, s]) => ({
    step,
    count: s.count,
    total_ms: s.total,
    avg_ms: Math.round(s.total / s.count),
    max_ms: s.max,
  }));
}

// =============================================================================
// getCycleCount — кількість dev-циклів (скільки разів пройшли через D1)
// =============================================================================

export function getCycleCount(config: OrchestratorConfig): number {
  const log = readTransitionLog(config);
  return log.filter((e) => e.to === "D1").length;
}
