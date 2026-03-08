// =============================================================================
// Command: analyze — перегляд зібраних метрик (H3 Phase 1)
// Підкоманди:
//   metrics  — показати зведення метрик (MetricsSummary)
//   clear    — очистити файл метрик
// =============================================================================

import type {
  SystemState,
  OrchestratorConfig,
  CLIOutput,
  AnalyzeData,
} from "../types";
import { getMetricsSummary, clearMetrics } from "../learning/metrics-store";

// =============================================================================
// handleAnalyze — головна функція
// =============================================================================

/**
 * Обробник команди `analyze`.
 *
 * Підкоманди:
 *   metrics — повертає MetricsSummary (кількість подій, типи, цикли, кроки)
 *   clear   — очищає metrics.jsonl та повертає підтвердження
 *
 * Без підкоманди — за замовчуванням `metrics`.
 */
export function handleAnalyze(
  _state: SystemState,
  config: OrchestratorConfig,
  subcommand?: string,
): CLIOutput<AnalyzeData> {
  const sub = subcommand || "metrics";

  switch (sub) {
    case "metrics": {
      const summary = getMetricsSummary(config);
      return {
        success: true,
        command: "analyze",
        data: {
          subcommand: "metrics",
          total_events: summary.total_events,
          events_by_type: summary.events_by_type,
          cycles_seen: summary.cycles_seen,
          steps_seen: summary.steps_seen,
          first_event: summary.first_event,
          last_event: summary.last_event,
          message: summary.total_events > 0
            ? `Зібрано ${summary.total_events} подій метрик.`
            : "Метрики ще не зібрані.",
        },
        next_action: "Метрики оновлюються автоматично під час роботи оркестратора.",
      };
    }

    case "clear": {
      clearMetrics(config);
      return {
        success: true,
        command: "analyze",
        data: {
          subcommand: "clear",
          total_events: 0,
          events_by_type: {},
          cycles_seen: [],
          steps_seen: [],
          first_event: null,
          last_event: null,
          message: "Метрики очищені.",
        },
        next_action: "Файл metrics.jsonl було очищено.",
      };
    }

    default:
      return {
        success: false,
        command: "analyze",
        error: "INVALID_COMMAND",
        message: `Невідома підкоманда: ${sub}. Доступні: metrics, clear`,
      };
  }
}
