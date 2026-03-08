// =============================================================================
// OPT-9: Cycle Report — автоматичний звіт після кожного циклу
//
// Після кожного cycle_transition (D9 → D1) система генерує структурований
// Markdown-звіт в system_state/reports/cycle_<N>_report.md
//
// Залежності: metrics-store (readMetrics), OPT-1 (stagnation_count), OPT-5 (censure_history)
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";
import { readMetrics } from "./metrics-store";

// =============================================================================
// Types
// =============================================================================

export interface CycleReportData {
  cycle: number;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  steps_completed: number;
  steps_failed: number;
  avg_step_minutes: number;
  censure_blocks: number;
  censure_rules: Record<string, number>;
  precondition_fails: number;
  ac_start_percent: number;
  ac_end_percent: number;
  gate_decision: string;
  gate_reasoning: string;
  stagnation_count?: number;
}

// =============================================================================
// collectCycleData — зібрати дані з metrics.jsonl за конкретний цикл
// =============================================================================

export function collectCycleData(
  config: OrchestratorConfig,
  cycle: number,
): CycleReportData {
  // Read all metrics for this cycle via existing readMetrics + filter
  const allEvents = readMetrics(config);

  // Filter: events matching this cycle (by cycle field or data.cycle)
  const cycleEvents = allEvents.filter(
    (e) => e.cycle === cycle || (e.data as any)?.cycle === cycle,
  );

  const stepCompletes = cycleEvents.filter(
    (e) => e.event_type === "step_complete",
  );
  const stepFails = cycleEvents.filter(
    (e) => e.event_type === "step_fail",
  );
  const censureEvents = cycleEvents.filter(
    (e) =>
      e.event_type === "step_fail" &&
      typeof (e.data as any)?.reason === "string" &&
      ((e.data as any).reason as string).includes("CENSURE"),
  );
  const preconditionFails = cycleEvents.filter(
    (e) => e.event_type === "precondition_fail",
  );
  const gateEvents = cycleEvents.filter(
    (e) => e.event_type === "gate_decision",
  );

  // Timestamps
  const timestamps = cycleEvents
    .map((e) => new Date(e.timestamp).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  const startedAt =
    timestamps.length > 0
      ? new Date(timestamps[0]).toISOString()
      : "unknown";
  const endedAt =
    timestamps.length > 0
      ? new Date(timestamps[timestamps.length - 1]).toISOString()
      : "unknown";
  const durationMinutes =
    timestamps.length >= 2
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / 60000
      : 0;

  // Avg step time
  const avgStepMinutes =
    stepCompletes.length > 0
      ? durationMinutes / stepCompletes.length
      : 0;

  // Censure rule aggregation
  const censureRules: Record<string, number> = {};
  for (const e of censureEvents) {
    const d = e.data as Record<string, unknown>;
    const ruleId = (d?.rule_id as string) || (d?.reason as string) || "unknown";
    censureRules[ruleId] = (censureRules[ruleId] || 0) + 1;
  }

  // Gate decision
  const lastGate = gateEvents[gateEvents.length - 1];
  const gateData = lastGate?.data as Record<string, unknown> | undefined;
  const acEnd = (gateData?.done_percent as number) ?? 0;

  // AC start — look for cycle_transition event entering this cycle
  const cycleTransition = allEvents.find(
    (e) =>
      e.event_type === "cycle_transition" &&
      (e.data as any)?.to_cycle === cycle,
  );
  const acStart = (cycleTransition?.data as any)?.done_percent ?? acEnd;

  return {
    cycle,
    started_at: startedAt,
    ended_at: endedAt,
    duration_minutes: Math.round(durationMinutes * 10) / 10,
    steps_completed: stepCompletes.length,
    steps_failed: stepFails.length,
    avg_step_minutes: Math.round(avgStepMinutes * 10) / 10,
    censure_blocks: censureEvents.length,
    censure_rules: censureRules,
    precondition_fails: preconditionFails.length,
    ac_start_percent: acStart,
    ac_end_percent: acEnd,
    gate_decision: (gateData?.decision as string) ?? "unknown",
    gate_reasoning: (gateData?.reasoning as string) ?? "no gate event found",
  };
}

// =============================================================================
// generateCycleReport — згенерувати Markdown звіт
// =============================================================================

export function generateCycleReport(data: CycleReportData): string {
  const censureTable = Object.entries(data.censure_rules)
    .map(([rule, count]) => `| ${rule} | ${count} |`)
    .join("\n");

  const recommendations: string[] = [];
  if (data.censure_blocks >= 3) {
    recommendations.push(
      "⚠️ High censure block rate — review plan quality or censure rules applicability.",
    );
  }
  if (data.ac_start_percent === data.ac_end_percent && data.steps_completed > 0) {
    recommendations.push("⚠️ No AC progress — possible stagnation.");
  }
  if (data.avg_step_minutes > 30) {
    recommendations.push(
      "⚠️ Avg step time > 30 min — investigate bottleneck steps.",
    );
  }
  if (data.steps_failed > data.steps_completed) {
    recommendations.push(
      "⚠️ More failures than successes — system health check needed.",
    );
  }

  const stagnationRow =
    data.stagnation_count !== undefined
      ? `| Stagnation count | ${data.stagnation_count} |\n`
      : "";

  return `# Cycle ${data.cycle} — Auto Report

**Generated:** ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Duration | ${data.duration_minutes} min |
| Steps completed | ${data.steps_completed} |
| Steps failed | ${data.steps_failed} |
| Avg step time | ${data.avg_step_minutes} min |
| CENSURE blocks | ${data.censure_blocks} |
| Precondition fails | ${data.precondition_fails} |
| AC progress | ${data.ac_start_percent}% → ${data.ac_end_percent}% |
| Gate decision | **${data.gate_decision}** |
${stagnationRow}
## Gate Reasoning

> ${data.gate_reasoning}

## CENSURE Violations

${
  censureTable
    ? `| Rule | Count |\n|------|-------|\n${censureTable}`
    : "_No censure blocks in this cycle._"
}

## Recommendations

${recommendations.length > 0 ? recommendations.join("\n") : "_No warnings for this cycle._"}
`;
}

// =============================================================================
// saveCycleReport — зберегти звіт у файл
// =============================================================================

export function saveCycleReport(
  config: OrchestratorConfig,
  cycle: number,
  reportContent: string,
): string {
  const reportsDir = path.join(
    config.control_center_path,
    "system_state",
    "reports",
  );

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filePath = path.join(reportsDir, `cycle_${cycle}_report.md`);
  fs.writeFileSync(filePath, reportContent, "utf-8");
  return filePath;
}

// =============================================================================
// createCycleReport — зібрати + згенерувати + зберегти (end-to-end)
// =============================================================================

export function createCycleReport(
  config: OrchestratorConfig,
  cycle: number,
): string {
  const data = collectCycleData(config, cycle);
  const markdown = generateCycleReport(data);
  return saveCycleReport(config, cycle, markdown);
}
