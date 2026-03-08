// =============================================================================
// OPT-9: CLI Command — cc report [cycle]
//
// Генерує та друкує звіт для вказаного циклу (або поточного).
// Також зберігає у system_state/reports/cycle_<N>_report.md
// =============================================================================

import {
  collectCycleData,
  generateCycleReport,
  saveCycleReport,
} from "../learning/cycle-report";
import type { OrchestratorConfig, SystemState, CLIOutput } from "../types";

export function handleReport(
  state: SystemState,
  config: OrchestratorConfig,
  cycleArg?: string,
): CLIOutput<{ report_path: string; cycle: number }> {
  const cycle =
    cycleArg !== undefined ? parseInt(cycleArg, 10) : (state.cycle ?? 0);

  if (isNaN(cycle)) {
    return {
      success: false,
      command: "report",
      error: "INVALID_CYCLE",
      message: `Invalid cycle number: ${cycleArg}`,
    } as any;
  }

  try {
    const data = collectCycleData(config, cycle);
    const markdown = generateCycleReport(data);

    // Print to stdout
    console.log(markdown);

    // Save to file
    const reportPath = saveCycleReport(config, cycle, markdown);

    return {
      success: true,
      command: "report",
      data: { report_path: reportPath, cycle },
      next_action: "Звіт збережено. Продовжуйте роботу.",
    };
  } catch (err: any) {
    return {
      success: false,
      command: "report",
      error: "REPORT_GENERATION_FAILED",
      message: err?.message ?? String(err),
    } as any;
  }
}
