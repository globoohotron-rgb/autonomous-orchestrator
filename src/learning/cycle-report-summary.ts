// =============================================================================
// OPT-18: Cycle Report Summary — feedback loop для instructions
//
// Читає останні N cycle report файлів з system_state/reports/
// і генерує стислий summary для вставки в instructions D2/D3.
//
// Агент бачить completion trend, bottleneck steps, censure rate —
// і враховує це при плануванні.
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface CycleReportSummary {
  /** Number of cycles analyzed */
  cycles_analyzed: number;
  /** Trend of AC completion across cycles */
  completion_trend: "improving" | "stable" | "degrading";
  /** Steps that appear most in failures/censure */
  top_bottlenecks: string[];
  /** Average censure blocks per cycle */
  censure_rate: number;
  /** Last cycle gate outcome */
  last_cycle_outcome: string;
}

/** Parsed data from a single cycle report file */
interface ParsedReportData {
  cycle: number;
  steps_completed: number;
  steps_failed: number;
  censure_blocks: number;
  ac_start: number;
  ac_end: number;
  gate_decision: string;
  duration_minutes: number;
  avg_step_minutes: number;
}

// =============================================================================
// MAX_SUMMARY_WORDS — обмеження довжини (AC: max 200 слів)
// =============================================================================

const MAX_SUMMARY_WORDS = 200;

// =============================================================================
// parseCycleReportFile — розпарсити Markdown report у структуру
// =============================================================================

export function parseCycleReportFile(content: string): ParsedReportData | null {
  try {
    const cycleMatch = content.match(/^# Cycle (\d+)/m);
    if (!cycleMatch) return null;

    const cycle = parseInt(cycleMatch[1], 10);

    // Parse summary table rows: "| Metric | Value |"
    const getTableValue = (label: string): string => {
      // Match row like: "| Steps completed | 5 |"
      const regex = new RegExp(`\\|\\s*${label}\\s*\\|\\s*(.+?)\\s*\\|`, "i");
      const match = content.match(regex);
      return match ? match[1].trim() : "";
    };

    const parseNum = (val: string): number => {
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    };

    const stepsCompleted = parseNum(getTableValue("Steps completed"));
    const stepsFailed = parseNum(getTableValue("Steps failed"));
    const censureBlocks = parseNum(getTableValue("CENSURE blocks"));
    const durationMinutes = parseNum(getTableValue("Duration"));
    const avgStepMinutes = parseNum(getTableValue("Avg step time"));

    // AC progress: "75% → 80%"
    const acRow = getTableValue("AC progress");
    let acStart = 0;
    let acEnd = 0;
    const acMatch = acRow.match(/([\d.]+)%\s*→\s*([\d.]+)%/);
    if (acMatch) {
      acStart = parseFloat(acMatch[1]);
      acEnd = parseFloat(acMatch[2]);
    }

    // Gate decision: "**CONTINUE**"
    const gateRow = getTableValue("Gate decision");
    const gateDecision = gateRow.replace(/\*\*/g, "").trim() || "unknown";

    return {
      cycle,
      steps_completed: stepsCompleted,
      steps_failed: stepsFailed,
      censure_blocks: censureBlocks,
      ac_start: acStart,
      ac_end: acEnd,
      gate_decision: gateDecision,
      duration_minutes: durationMinutes,
      avg_step_minutes: avgStepMinutes,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// loadRecentReports — завантажити останні N reports, відсортовані за cycle
// =============================================================================

export function loadRecentReports(
  config: OrchestratorConfig,
  n: number = 3,
): ParsedReportData[] {
  const reportsDir = path.join(config.control_center_path, "system_state", "reports");

  if (!fs.existsSync(reportsDir)) return [];

  try {
    const files = fs.readdirSync(reportsDir)
      .filter((f) => /^cycle_\d+_report\.md$/.test(f))
      .sort((a, b) => {
        const numA = parseInt(a.match(/cycle_(\d+)/)?.[1] || "0", 10);
        const numB = parseInt(b.match(/cycle_(\d+)/)?.[1] || "0", 10);
        return numA - numB;
      });

    // Take last N
    const recent = files.slice(-n);

    const parsed: ParsedReportData[] = [];
    for (const file of recent) {
      try {
        const content = fs.readFileSync(path.join(reportsDir, file), "utf-8");
        const data = parseCycleReportFile(content);
        if (data) parsed.push(data);
      } catch {
        // Skip unparseable files (AC#4: non-blocking)
      }
    }

    return parsed;
  } catch {
    return [];
  }
}

// =============================================================================
// computeSummary — обчислити summary на основі parsed reports
// =============================================================================

export function computeSummary(reports: ParsedReportData[]): CycleReportSummary | null {
  if (reports.length === 0) return null;

  // Completion trend: compare AC deltas across cycles
  const deltas = reports.map((r) => r.ac_end - r.ac_start);
  let trend: CycleReportSummary["completion_trend"] = "stable";
  if (deltas.length >= 2) {
    const firstHalf = deltas.slice(0, Math.ceil(deltas.length / 2));
    const secondHalf = deltas.slice(Math.ceil(deltas.length / 2));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    if (avgSecond > avgFirst + 1) trend = "improving";
    else if (avgSecond < avgFirst - 1) trend = "degrading";
  }

  // Bottleneck steps: cycles with high fail rate
  const bottlenecks: string[] = [];
  for (const r of reports) {
    if (r.steps_failed > 0) {
      bottlenecks.push(`C${r.cycle}`);
    }
    if (r.censure_blocks >= 3) {
      bottlenecks.push(`C${r.cycle}-censure`);
    }
  }

  // Censure rate
  const totalCensure = reports.reduce((sum, r) => sum + r.censure_blocks, 0);
  const censureRate = Math.round((totalCensure / reports.length) * 10) / 10;

  // Last cycle outcome
  const lastReport = reports[reports.length - 1];

  return {
    cycles_analyzed: reports.length,
    completion_trend: trend,
    top_bottlenecks: bottlenecks.slice(0, 5),
    censure_rate: censureRate,
    last_cycle_outcome: lastReport.gate_decision,
  };
}

// =============================================================================
// formatSummary — markdown-formatted summary string (max 200 words)
// =============================================================================

export function formatSummary(summary: CycleReportSummary, reports: ParsedReportData[]): string {
  const lines: string[] = [
    `## Cycle History Summary (last ${summary.cycles_analyzed} cycles)`,
    ``,
    `**Completion trend:** ${summary.completion_trend}`,
    `**Avg censure blocks/cycle:** ${summary.censure_rate}`,
    `**Last cycle outcome:** ${summary.last_cycle_outcome}`,
  ];

  if (summary.top_bottlenecks.length > 0) {
    lines.push(`**Problem areas:** ${summary.top_bottlenecks.join(", ")}`);
  }

  // Per-cycle brief
  lines.push(``, `| Cycle | AC Progress | Steps OK/Fail | Censure | Decision |`);
  lines.push(`|-------|-------------|---------------|---------|----------|`);

  for (const r of reports) {
    lines.push(
      `| ${r.cycle} | ${r.ac_start}%→${r.ac_end}% | ${r.steps_completed}/${r.steps_failed} | ${r.censure_blocks} | ${r.gate_decision} |`,
    );
  }

  let result = lines.join("\n");

  // Enforce word limit
  const words = result.split(/\s+/);
  if (words.length > MAX_SUMMARY_WORDS) {
    result = words.slice(0, MAX_SUMMARY_WORDS).join(" ") + "\n...(truncated)";
  }

  return result;
}

// =============================================================================
// getLastCycleSummary — public API for instructions.ts
// Returns formatted markdown string or null if no reports exist
// =============================================================================

export function getLastCycleSummary(
  config: OrchestratorConfig,
  n: number = 3,
): string | null {
  const reports = loadRecentReports(config, n);
  if (reports.length === 0) return null;

  const summary = computeSummary(reports);
  if (!summary) return null;

  return formatSummary(summary, reports);
}
