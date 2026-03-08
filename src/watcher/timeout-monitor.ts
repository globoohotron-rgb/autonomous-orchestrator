// =============================================================================
// M5. Timeout Monitor — перевіряє чи крок не "завис"
//
// | Тип кроку          | Timeout    | Дія при timeout                  |
// |---------------------|-----------|----------------------------------|
// | Код (D5/L10/S3)     | 30 хв    | Warning → log                    |
// | Аудит (V1/D6)       | 15 хв    | Warning → log                    |
// | Gate (awaiting)     | 60 хв    | Нагадування → log                |
// | Будь-який крок      | 120 хв   | JIDOKA STOP → issue              |
// =============================================================================

import type { OrchestratorConfig, SystemState, Step } from "../types";
import { loadState } from "../state-machine";
import { log } from "./daemon-logger";

// =============================================================================
// Конфігурація таймаутів (у мілісекундах)
// =============================================================================

const MINUTE = 60_000;

interface TimeoutConfig {
  /** Попередження для кроків виконання коду */
  code_warning_ms: number;
  /** Попередження для кроків аудиту */
  audit_warning_ms: number;
  /** Нагадування для gate (awaiting_human_decision) */
  gate_reminder_ms: number;
  /** Абсолютний ліміт для будь-якого кроку → JIDOKA STOP */
  absolute_limit_ms: number;
  /** Інтервал перевірки */
  check_interval_ms: number;
}

const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  code_warning_ms: 30 * MINUTE,
  audit_warning_ms: 15 * MINUTE,
  gate_reminder_ms: 60 * MINUTE,
  absolute_limit_ms: 120 * MINUTE,
  check_interval_ms: 60_000, // перевірка кожну хвилину
};

// =============================================================================
// Класифікація кроків для таймаутів
// =============================================================================

const CODE_STEPS: Step[] = ["D5", "L10", "S3"];
const AUDIT_STEPS: Step[] = ["V1", "D6", "V2", "L13"];

function getStepCategory(step: Step): "code" | "audit" | "gate" | "other" {
  if (CODE_STEPS.includes(step)) return "code";
  if (AUDIT_STEPS.includes(step)) return "audit";
  return "other";
}

// =============================================================================
// Результат перевірки таймауту
// =============================================================================

export type TimeoutLevel = "ok" | "warning" | "jidoka_stop";

export interface TimeoutCheckResult {
  level: TimeoutLevel;
  step: Step;
  elapsed_ms: number;
  elapsed_min: number;
  threshold_ms: number;
  message: string;
}

// =============================================================================
// TimeoutMonitor — клас для періодичної перевірки таймаутів
// =============================================================================

export type TimeoutCallback = (result: TimeoutCheckResult) => void;

export class TimeoutMonitor {
  private config: OrchestratorConfig;
  private timeoutConfig: TimeoutConfig;
  private callback: TimeoutCallback;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Набір попереджень що вже були залоговані (щоб не спамити) */
  private warnedSteps: Set<string> = new Set();

  constructor(
    config: OrchestratorConfig,
    callback: TimeoutCallback,
    timeoutConfig?: Partial<TimeoutConfig>,
  ) {
    this.config = config;
    this.callback = callback;
    this.timeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...timeoutConfig };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // start — запустити періодичну перевірку
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(() => {
      this.check();
    }, this.timeoutConfig.check_interval_ms);

    // Перша перевірка одразу
    this.check();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // stop — зупинити перевірку
  // ─────────────────────────────────────────────────────────────────────────

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // isRunning
  // ─────────────────────────────────────────────────────────────────────────

  isRunning(): boolean {
    return this.running;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // resetWarnings — скинути попередження (коли крок змінився)
  // ─────────────────────────────────────────────────────────────────────────

  resetWarnings(): void {
    this.warnedSteps.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // check — одноразова перевірка таймаутів
  // ─────────────────────────────────────────────────────────────────────────

  check(): void {
    const loadResult = loadState(this.config);
    if ("error" in loadResult) return;

    const state = loadResult.state;

    // Не перевіряти завершені/скасовані стани
    if (state.status === "completed" || state.status === "cancelled") return;

    const result = checkTimeout(state, this.timeoutConfig);

    if (result.level === "ok") return;

    // Уникаємо повторних попереджень для того ж кроку + рівня
    const key = `${result.step}:${result.level}`;
    if (this.warnedSteps.has(key)) return;
    this.warnedSteps.add(key);

    // Логувати
    if (result.level === "warning") {
      log(this.config, {
        type: "timeout_warning",
        step: result.step,
        elapsed_min: result.elapsed_min,
        details: result.message,
      });
    } else if (result.level === "jidoka_stop") {
      log(this.config, {
        type: "timeout_jidoka_stop",
        step: result.step,
        elapsed_min: result.elapsed_min,
        details: result.message,
      });
    }

    this.callback(result);
  }
}

// =============================================================================
// checkTimeout — чиста функція перевірки таймауту
// =============================================================================

export function checkTimeout(
  state: SystemState,
  config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG,
): TimeoutCheckResult {
  const now = Date.now();
  const lastUpdated = new Date(state.last_updated).getTime();
  const elapsed = now - lastUpdated;
  const elapsedMin = Math.floor(elapsed / MINUTE);

  // 1. Абсолютний ліміт → JIDOKA STOP
  if (elapsed >= config.absolute_limit_ms) {
    return {
      level: "jidoka_stop",
      step: state.current_step,
      elapsed_ms: elapsed,
      elapsed_min: elapsedMin,
      threshold_ms: config.absolute_limit_ms,
      message: `Step ${state.current_step} exceeded absolute timeout (${elapsedMin} min). JIDOKA STOP required.`,
    };
  }

  // 2. Попередження залежно від типу кроку
  const category = getStepCategory(state.current_step);

  let warningThreshold: number;
  switch (category) {
    case "code":
      warningThreshold = config.code_warning_ms;
      break;
    case "audit":
      warningThreshold = config.audit_warning_ms;
      break;
    default:
      // Gate або інший крок
      if (state.status === "awaiting_human_decision") {
        warningThreshold = config.gate_reminder_ms;
      } else {
        // Для інших кроків — warning на 60 хв
        warningThreshold = config.gate_reminder_ms;
      }
      break;
  }

  if (elapsed >= warningThreshold) {
    return {
      level: "warning",
      step: state.current_step,
      elapsed_ms: elapsed,
      elapsed_min: elapsedMin,
      threshold_ms: warningThreshold,
      message: `Step ${state.current_step} (${category}) running for ${elapsedMin} min (threshold: ${Math.floor(warningThreshold / MINUTE)} min)`,
    };
  }

  return {
    level: "ok",
    step: state.current_step,
    elapsed_ms: elapsed,
    elapsed_min: elapsedMin,
    threshold_ms: warningThreshold,
    message: "Within limits",
  };
}
