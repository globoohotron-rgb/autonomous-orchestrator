import * as path from "path";
import type { OrchestratorConfig } from "./types";

/**
 * Resolve project paths based on this script's location.
 * orchestrator.ts / daemon.ts are in control_center_code/src/
 * control_center/ is a sibling directory (../control_center relative to the code root)
 * project_root is the parent of both
 */
export function resolveConfig(): OrchestratorConfig {
  const projectRoot = path.resolve(__dirname, "../..");
  return {
    control_center_path: path.join(projectRoot, "control_center"),
    project_root: projectRoot,
  };
}
