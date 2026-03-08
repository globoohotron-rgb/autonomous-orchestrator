// =============================================================================
// Step Watchdog — моніторинг тривалості кроку з per-step thresholds
//
// OPT-4: Виявляє аномально довгі кроки (10× від норми) які не генерують
// explicit FAIL. Використовує state.step_started_at (точний час початку кроку)
// замість last_updated (оновлюється при кожному записі).
//
// Новий файл — не змінює існуючий код. Безпечне додавання.
// =============================================================================

import type { OrchestratorConfig, SystemState, Step } from "../types";
import { loadState } from "../state-machine";
import { appendMetric, generateMetricId } from "../learning/metrics-store";
import { log } from "./daemon-logger";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Thresholds per step (ms)
// =============================================================================

const MINUTE = 60_000;
const DEFAULT_TIMEOUT_MS = 30 * MINUTE; // 30 хв

/** Per-step timeout overrides */
const STEP_TIMEOUTS: Partial<Record<Step, number>> = {
  D5: 60 * MINUTE,   // 60 хв — execution може бути довшим
  L10: 60 * MINUTE,  // 60 хв — foundation execution
  D4: 30 * MINUTE,   // 30 хв — task generation
  D2: 20 * MINUTE,   // 20 хв — observe
  D3: 25 * MINUTE,   // 25 хв — plan + censure retries
  S3: 60 * MINUTE,   // 60 хв — security fix execution
};

/** Отримати threshold для кроку */
export function getStepThreshold(step: Step): number {
  return STEP_TIMEOUTS[step] ?? DEFAULT_TIMEOUT_MS;
}

// =============================================================================
// Types
// =============================================================================

export interface WatchdogResult {
  step: Step;
  elapsed_ms: number;
  threshold_ms: number;
  exceeded: boolean;
  severity: "ok" | "warning" | "critical";
}

// =============================================================================
// checkStepTimeout — чиста функція для тестування
//
// Приймає стан напряму (не зчитує з диску).
// Повертає null якщо step_started_at відсутній або status ≠ in_progress.
// =============================================================================

export function checkStepTimeoutFromState(state: SystemState): WatchdogResult | null {
  if (!state.step_started_at) return null;
  if (state.status !== "in_progress") return null;

  const startedAt = new Date(state.step_started_at).getTime();
  if (isNaN(startedAt)) return null;

  const now = Date.now();
  const elapsed = now - startedAt;
  const threshold = getStepThreshold(state.current_step);

  const exceeded = elapsed > threshold;
  const severity: WatchdogResult["severity"] =
    elapsed > threshold * 2
      ? "critical"
      : elapsed > threshold
        ? "warning"
        : "ok";

  return {
    step: state.current_step,
    elapsed_ms: elapsed,
    threshold_ms: threshold,
    exceeded,
    severity,
  };
}

// =============================================================================
// checkStepTimeout — повна функція для daemon
//
// Зчитує state з диску, перевіряє timeout, записує метрику + лог.
// Повертає null якщо state не зчитується або нема step_started_at.
// =============================================================================

export function checkStepTimeout(config: OrchestratorConfig): WatchdogResult | null {
  const loadResult = loadState(config);
  if ("error" in loadResult) return null;

  const state = loadResult.state;
  const result = checkStepTimeoutFromState(state);

  if (result && result.exceeded) {
    // Записати метрику
    try {
      const event = {
        id: generateMetricId(),
        timestamp: new Date().toISOString(),
        event_type: "step_timeout" as const,
        step: state.current_step,
        cycle: state.cycle,
        data: {
          elapsed_ms: result.elapsed_ms,
          threshold_ms: result.threshold_ms,
          severity: result.severity,
        },
      };
      appendMetric(config, event);
    } catch { /* non-blocking */ }

    // Записати в daemon log
    try {
      log(config, {
        type: result.severity === "critical"
          ? "step_timeout_critical"
          : "step_timeout_warning",
        step: state.current_step,
        elapsed_min: Math.round(result.elapsed_ms / MINUTE),
        details: `threshold=${Math.round(result.threshold_ms / MINUTE)}min`,
      });
    } catch { /* non-blocking */ }
  }

  return result;
}

// =============================================================================
// OPT-15: Gate Decision Timeout Recovery
//
// Відстежує час в awaiting_human_decision. Якщо перевищено timeout →
// створює issue файл + (при auto_gates) перезаписує сигнал.
// =============================================================================

const DEFAULT_GATE_TIMEOUT_MINUTES = 60;

export interface GateTimeoutResult {
  step: Step;
  elapsed_ms: number;
  timeout_ms: number;
  exceeded: boolean;
}

/**
 * Чиста функція: перевіряє чи gate decision timeout перевищено.
 * Повертає null якщо стан не awaiting_human_decision або немає timestamp.
 */
export function checkGateTimeoutFromState(
  state: SystemState,
  gateTimeoutMinutes?: number,
): GateTimeoutResult | null {
  if (state.status !== "awaiting_human_decision") return null;
  if (!state.gate_decision_started_at) return null;

  const startedAt = new Date(state.gate_decision_started_at).getTime();
  if (isNaN(startedAt)) return null;

  const now = Date.now();
  const elapsed = now - startedAt;
  const timeoutMs = (gateTimeoutMinutes ?? DEFAULT_GATE_TIMEOUT_MINUTES) * 60 * 1000;

  return {
    step: state.current_step,
    elapsed_ms: elapsed,
    timeout_ms: timeoutMs,
    exceeded: elapsed > timeoutMs,
  };
}

/**
 * Записує issue файл при gate timeout.
 */
export function writeGateTimeoutIssue(
  config: OrchestratorConfig,
  step: Step,
  elapsedMs: number,
): string | null {
  try {
    const issuesDir = path.resolve(config.control_center_path, "issues", "active");
    if (!fs.existsSync(issuesDir)) {
      fs.mkdirSync(issuesDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `gate_timeout_${step}_${timestamp}.md`;
    const filepath = path.join(issuesDir, filename);

    const elapsedMin = Math.round(elapsedMs / 60000);
    const content = [
      `# Gate Decision Timeout: ${step}`,
      ``,
      `**Created:** ${new Date().toISOString()}`,
      `**Step:** ${step}`,
      `**Elapsed:** ${elapsedMin} minutes`,
      `**Timeout:** ${DEFAULT_GATE_TIMEOUT_MINUTES} minutes`,
      ``,
      `## Problem`,
      `System has been in \`awaiting_human_decision\` on step **${step}** for ${elapsedMin} minutes.`,
      `This exceeds the configured timeout of ${DEFAULT_GATE_TIMEOUT_MINUTES} minutes.`,
      ``,
      `## Possible Causes`,
      `- VS Code закритий або Session Bridge paused`,
      `- Cline extension crashed / не відповідає`,
      `- Session Bridge rate limited (OPT-14)`,
      ``,
      `## Resolution`,
      `1. Перевірте VS Code та Session Bridge`,
      `2. Виконайте вручну: \`npx ts-node src/orchestrator.ts decide <РІШЕННЯ>\``,
      `3. Або запустіть daemon перезапис сигналу`,
      ``,
    ].join("\n");

    fs.writeFileSync(filepath, content, "utf-8");
    return filepath;
  } catch {
    return null;
  }
}

/**
 * Перезаписує session_boundary.signal для повторного запуску Session Bridge.
 */
export function rewriteGateSignal(
  config: OrchestratorConfig,
  state: SystemState,
): boolean {
  try {
    const signalPath = path.resolve(
      config.control_center_path, "system_state", "session_boundary.signal"
    );

    const signal = JSON.stringify({
      prompt: `# Gate Decision Timeout Recovery\\n\\nСистема чекає рішення на гейті **${state.current_step}** вже занадто довго.\\nВиконайте: \`npx ts-node src/orchestrator.ts decide <РІШЕННЯ>\``,
      type: "gate_timeout_recovery",
      gate_step: state.current_step,
      block: state.current_block,
      cycle: state.cycle,
      timestamp: new Date().toISOString(),
    });

    fs.writeFileSync(signalPath, signal, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Повна функція для daemon: зчитує state, перевіряє gate timeout,
 * створює issue + перезаписує сигнал при auto_gates.
 */
export function checkGateTimeout(
  config: OrchestratorConfig,
  gateTimeoutMinutes?: number,
): GateTimeoutResult | null {
  const loadResult = loadState(config);
  if ("error" in loadResult) return null;

  const state = loadResult.state;
  const result = checkGateTimeoutFromState(state, gateTimeoutMinutes);

  if (result && result.exceeded) {
    // Створити issue файл
    writeGateTimeoutIssue(config, state.current_step, result.elapsed_ms);

    // При auto_gates: перезаписати сигнал для повторного запуску
    if (state.auto_gates) {
      rewriteGateSignal(config, state);
    }

    // Записати метрику
    try {
      appendMetric(config, {
        id: generateMetricId(),
        timestamp: new Date().toISOString(),
        event_type: "gate_timeout" as const,
        step: state.current_step,
        cycle: state.cycle,
        data: {
          elapsed_ms: result.elapsed_ms,
          timeout_ms: result.timeout_ms,
        },
      });
    } catch { /* non-blocking */ }

    // Daemon log
    try {
      log(config, {
        type: "gate_timeout",
        step: state.current_step,
        elapsed_min: Math.round(result.elapsed_ms / MINUTE),
        details: `timeout=${gateTimeoutMinutes ?? DEFAULT_GATE_TIMEOUT_MINUTES}min`,
      });
    } catch { /* non-blocking */ }
  }

  return result;
}
