// =============================================================================
// Gate Protocol — створення/читання файлів рішень
// Конвертовано з: system_cycle.md → "Протокол воріт (7 кроків)"
//              + standards/system/std-gate-decision.md
// =============================================================================
//
// Протокол воріт (7 кроків):
// 1. Агент оновлює state.json: status → "awaiting_human_decision"
// 2. Агент створює шаблон файлу рішення з порожніми полями
// 3. Агент ЗУПИНЯЄТЬСЯ
// 4. Людина заповнює файл
// 5. При наступному запуску — перевірити файл рішення
// 6. decision заповнене → перехід
// 7. decision порожнє або файл відсутній → залишити awaiting_human_decision
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type {
  Step,
  SystemState,
  GateDecisionFile,
  AnyGateDecision,
  OrchestratorConfig,
} from "../types";
import { formatDateForArtifact } from "../types";

// =============================================================================
// Gate Step Identification
// =============================================================================

/**
 * Steps that create gate decision files (Phase 1).
 * L4, GATE1 — std-gate-decision.md
 * D9 — Mini-GATE (system_cycle → D9)
 * V3 — Validation FAIL decision (system_cycle → V3)
 * S5 — S-Block closure (system_cycle → S5)
 * E1 — Release NOT_READY (system_cycle → E1)
 */
const GATE_CREATION_STEPS: readonly Step[] = [
  "L4", "GATE1", "D9", "V3", "S5", "E1",
];

/**
 * Steps where `decide` command is valid (Phase 2).
 * D9 — Mini-GATE (єдині ворота блоку D)
 * V3 — Validation Decision (після FAIL аудиту)
 */
const GATE_DECISION_STEPS: readonly Step[] = [
  "L4", "GATE1", "D9", "V3", "V2", "S5", "E1",
];

/** Check if a step creates gate decision files */
export function isGateCreationStep(step: Step): boolean {
  return GATE_CREATION_STEPS.includes(step);
}

/** Check if a step can consume gate decisions (via `decide` command) */
export function isGateDecisionStep(step: Step): boolean {
  return GATE_DECISION_STEPS.includes(step);
}

/** Check if a step participates in gate protocol (either phase) */
export function isGateStep(step: Step): boolean {
  return isGateCreationStep(step) || isGateDecisionStep(step);
}

// =============================================================================
// Valid Decisions Per Gate
// =============================================================================

/**
 * Valid decision values for each gate step.
 * Maps to decision types from types/decisions.ts:
 * - L4 → EntryGateDecision
 * - GATE1 → FoundationGateDecision
 * - D9 → MiniGateDecision (Mini-GATE — єдині ворота блоку D)
 * - V3 → V3Decision
 * - S5 → SBlockDecision
 * - E1 → ReleaseDecision
 */
export const VALID_DECISIONS: Partial<Record<Step, readonly string[]>> = {
  L4: ["GO", "REWORK", "KILL"],
  GATE1: ["GO", "REBUILD_PLAN", "REBUILD_DESCRIPTION", "KILL"],
  // D9 — Mini-GATE (єдині ворота блоку D)
  D9: ["CONTINUE", "VALIDATE", "AMEND_SPEC", "KILL"],
  V3: ["CONTINUE", "AMEND_SPEC", "KILL"],
  // V2 — automatic gate, but fallback for `decide` when auto-derivation fails
  V2: ["PASS", "PASS_WITH_SECURITY", "FAIL"],
  S5: ["REPEAT", "VALIDATE", "STOP"],
  // E1 — READY/NOT_READY auto-derived, D1/KILL for human fallback after NOT_READY
  E1: ["READY", "NOT_READY", "D1", "KILL"],
};

/** Get valid decision values for a gate step */
export function getValidDecisions(step: Step): readonly string[] {
  return VALID_DECISIONS[step] ?? [];
}

/** Validate that a decision value is allowed for a given gate step */
export function validateDecision(step: Step, decision: string): boolean {
  const valid = getValidDecisions(step);
  return valid.includes(decision);
}

// =============================================================================
// Gate Options (Human-Readable Descriptions)
// =============================================================================

/** A single option for a gate decision */
export interface GateOption {
  /** Decision value (e.g. "GO", "REWORK") */
  value: string;
  /** Human-readable description */
  description: string;
}

/**
 * Gate options with descriptions, from system_cycle.md and std-gate-decision.md.
 * Used for generating decision file templates.
 */
const GATE_OPTIONS: Partial<Record<Step, GateOption[]>> = {
  // std-gate-decision.md → Appendix A: L4
  L4: [
    { value: "GO", description: "перейти до формування опису продукту (L5)" },
    { value: "REWORK", description: "повернути discovery_brief на доопрацювання (L2)" },
    { value: "KILL", description: "скасувати проект" },
  ],
  // std-gate-decision.md → Appendix A: GATE 1
  GATE1: [
    { value: "GO", description: "перейти до кола розвитку (D1)" },
    { value: "REBUILD_PLAN", description: "скинути план і переформувати з нуля (L8)" },
    { value: "REBUILD_DESCRIPTION", description: "переформувати опис продукту (L5)" },
    { value: "KILL", description: "скасувати проект" },
  ],
  // system_cycle.md → D9: Mini-GATE
  D9: [
    { value: "CONTINUE", description: "продовжити розробку (D1 → D2)" },
    { value: "VALIDATE", description: "перейти до валідації (V0)" },
    { value: "AMEND_SPEC", description: "людина оновлює final_view/, потім D1" },
    { value: "KILL", description: "скасувати проект" },
  ],
  // system_cycle.md → V3: рішення після FAIL аудиту
  V3: [
    { value: "CONTINUE", description: "повернення до D1, scope обмежений validation_conclusions" },
    { value: "AMEND_SPEC", description: "людина оновлює final_view/, потім D1" },
    { value: "KILL", description: "скасувати проект" },
  ],
  // system_cycle.md → S5: S-Block closure
  S5: [
    { value: "REPEAT", description: "повторити S-блок (S1)" },
    { value: "VALIDATE", description: "перейти до валідації (V0)" },
    { value: "STOP", description: "повернутися до D-блоку або пауза" },
  ],
  // system_cycle.md → E1: Release NOT_READY
  E1: [
    { value: "D1", description: "повернення до development_cycle (D1)" },
    { value: "KILL", description: "скасувати проект" },
  ],
};

/** Get detailed gate options for a step */
export function getGateOptions(step: Step): GateOption[] {
  return GATE_OPTIONS[step] ?? [];
}

// =============================================================================
// Gate Names
// =============================================================================

/** Human-readable names for gates, from system_cycle.md "Ворота — зведення" */
const GATE_NAMES: Partial<Record<Step, string>> = {
  L4: "Entry Gate (GO / REWORK / KILL)",
  GATE1: "Foundation Gate (GATE 1)",
  D9: "Mini-GATE (єдині ворота блоку D)",
  V3: "Validation Decision (після FAIL аудиту)",
  S5: "S-Block Decision",
  E1: "Release Decision",
};

/** Get human-readable gate name */
export function getGateName(step: Step): string {
  return GATE_NAMES[step] ?? `Gate at ${step}`;
}

// =============================================================================
// Gate Context (for decision file generation)
// =============================================================================

/** Context used to generate gate decision file content */
export interface GateContext {
  /** Human-readable gate name */
  gateName: string;
  /** Formatted date (DD.MM.YY-HH-MM) */
  date: string;
  /** Current cycle number */
  cycle: number;
  /** Current iteration number */
  iteration: number;
  /** Factual summary of project state (filled by agent, no recommendations) */
  summary: string;
  /** Decision options with descriptions */
  options: GateOption[];
}

/** Build a GateContext from system state */
export function buildGateContext(
  step: Step,
  state: SystemState,
  summary: string,
): GateContext {
  return {
    gateName: getGateName(step),
    date: formatDateForArtifact(),
    cycle: state.cycle,
    iteration: state.iteration,
    summary,
    options: getGateOptions(step),
  };
}

// =============================================================================
// Gate Decision File Path Resolution
// =============================================================================

/**
 * Resolve the file path for a gate decision file.
 * Paths follow naming conventions from system_cycle.md → "Конвенція іменування артефактів".
 *
 * L4 → project_description/gate_entry_decision_DD.MM.YY-HH-MM.md
 * GATE1 → audit/gate_decisions/gate1_decision_DD.MM.YY-HH-MM.md
 * D9 → audit/gate_decisions/mini_gate_decision_cycle{N}_DD.MM.YY-HH-MM.md
 * V3 → audit/gate_decisions/v3_decision_DD.MM.YY-HH-MM.md
 * S5 → audit/gate_decisions/s_block_decision_DD.MM.YY-HH-MM.md
 * E1 → audit/gate_decisions/release_decision_DD.MM.YY-HH-MM.md
 */
export function resolveGateDecisionPath(
  step: Step,
  config: OrchestratorConfig,
  state: SystemState,
): string {
  const date = formatDateForArtifact();
  const base = config.control_center_path;

  switch (step) {
    case "L4":
      return path.join(base, "project_description", `gate_entry_decision_${date}.md`);

    case "GATE1":
      return path.join(base, "audit", "gate_decisions", `gate1_decision_${date}.md`);

    case "D9":
      return path.join(
        base, "audit", "gate_decisions",
        `mini_gate_decision_cycle${state.cycle}_${date}.md`,
      );

    case "V3":
      return path.join(base, "audit", "gate_decisions", `v3_decision_${date}.md`);

    case "S5":
      return path.join(base, "audit", "gate_decisions", `s_block_decision_${date}.md`);

    case "E1":
      return path.join(base, "audit", "gate_decisions", `release_decision_${date}.md`);

    default:
      throw new Error(`No gate decision path defined for step ${step}`);
  }
}

// =============================================================================
// Create Gate Decision File Content
// =============================================================================

/**
 * Generate Markdown content for a gate decision file.
 * Template from std-gate-decision.md → Appendix A.
 *
 * Mandatory fields (from system_cycle.md "Протокол воріт"):
 * - decision: (filled by human)
 * - rationale: (filled by human)
 * - comments: (optional, additional instructions for agent)
 */
export function createGateDecisionFileContent(
  step: Step,
  context: GateContext,
): string {
  const options = context.options.length > 0
    ? context.options
    : getGateOptions(step);

  const optionsBlock = options
    .map((o) => `- **${o.value}** — ${o.description}`)
    .join("\n");

  // Template follows std-gate-decision.md Appendix A structure
  return `# Gate Decision: ${context.gateName}

> **Дата:** ${context.date}
> **Крок циклу:** ${step}
> **Цикл:** ${context.cycle}
> **Ітерація:** ${context.iteration}

---

## Контекст (заповнюється агентом)

${context.summary}

---

## Рішення (заповнюється людиною)

**Дозволені варіанти:**
${optionsBlock}

\`\`\`
decision: 
rationale: 
comments: 
\`\`\`
`;
}

// =============================================================================
// Read/Parse Gate Decision File
// =============================================================================

/**
 * Read a gate decision file from disk and parse its fields.
 * Protocol step 5: read file on next run.
 * Protocol step 7: if file missing → decision = null.
 */
export function readGateDecision(filePath: string): GateDecisionFile {
  if (!fs.existsSync(filePath)) {
    return { decision: null, rationale: "", comments: "" };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return parseGateDecisionContent(content);
}

/**
 * Parse decision/rationale/comments from Markdown file content.
 *
 * Supported formats (in priority order):
 * 1. Code-block style:  `decision: VALIDATE`
 * 2. Markdown bold:     `**Рішення:** VALIDATE`
 * 3. Checkbox style:    `[x] VALIDATE` or `**[x] VALIDATE**`
 * 4. Decision heading:  `## Decision\n...\nVALIDATE` (word on its own line)
 *
 * Template placeholders (___) are treated as empty (no decision).
 */
export function parseGateDecisionContent(content: string): GateDecisionFile {
  const rationaleMatch = content.match(/^rationale:\s*(.*)$/m);
  const commentsMatch = content.match(/^comments:\s*(.*)$/m);
  const rationale = rationaleMatch?.[1]?.trim() ?? "";
  const comments = commentsMatch?.[1]?.trim() ?? "";

  // Known valid decisions across all gate types
  const VALID_DECISIONS = [
    "VALIDATE", "CONTINUE", "KILL", "PIVOT", "REWORK", "STOP",
    "AMEND_SPEC", "GO", "REBUILD_PLAN", "REBUILD_DESCRIPTION",
    "PASS", "FAIL", "PASS_WITH_SECURITY", "REPEAT",
    "READY", "NOT_READY", "D1",
  ];

  // Strategy 1: `decision: VALUE` (code-block / yaml-like)
  const codeMatch = content.match(/^decision:\s*(.+)$/m);
  if (codeMatch) {
    const val = codeMatch[1].trim().replace(/[*_`]/g, "");
    if (val.length > 0 && !val.includes("___")) {
      return { decision: val as AnyGateDecision, rationale, comments };
    }
  }

  // Strategy 2: `[x] DECISION` checkbox (e.g., `**[x] VALIDATE**`)
  // Higher priority than Рішення: because it's unambiguous
  const checkboxMatch = content.match(/\[x\]\s*(\w+)/mi);
  if (checkboxMatch) {
    const val = checkboxMatch[1].trim();
    if (VALID_DECISIONS.includes(val)) {
      return { decision: val as AnyGateDecision, rationale, comments };
    }
  }

  // Strategy 3: `**Рішення:** VALUE` (Ukrainian markdown bold label)
  // Only matches if VALUE is a known valid decision (prevents false positives
  // from lines like "Рішення прийнято..." or "Рішення людини — заповнити нижче")
  const ukrMatches = content.match(/\*{0,2}Рішення:?\*{0,2}\s*(.+)$/gm);
  if (ukrMatches) {
    for (const line of ukrMatches) {
      const m = line.match(/\*{0,2}Рішення:?\*{0,2}\s*(.+)$/);
      if (m) {
        const val = m[1].trim().replace(/[*_`]/g, "").trim();
        if (VALID_DECISIONS.includes(val)) {
          return { decision: val as AnyGateDecision, rationale, comments };
        }
      }
    }
  }

  // Strategy 4: Known decision keyword on its own line after ## Decision
  const decisionSection = content.match(/## Decision[\s\S]*?(?=##|$)/i);
  if (decisionSection) {
    const sectionText = decisionSection[0];
    for (const kw of VALID_DECISIONS) {
      const kwRegex = new RegExp(`\\b${kw}\\b`, "i");
      if (kwRegex.test(sectionText)) {
        return { decision: kw as AnyGateDecision, rationale, comments };
      }
    }
  }

  return { decision: null, rationale, comments };
}

// =============================================================================
// Decision State Checks
// =============================================================================

/**
 * Check if a decision has been made (field is filled).
 * Protocol step 6: decision filled → proceed.
 * Protocol step 7: decision empty → stay awaiting.
 */
export function isDecisionMade(decision: GateDecisionFile): boolean {
  return decision.decision !== null
    && String(decision.decision).trim().length > 0;
}

// =============================================================================
// Write Gate Decision File
// =============================================================================

/** Write gate decision file content to disk, creating directories if needed */
export function writeGateDecisionFile(
  filePath: string,
  content: string,
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

// =============================================================================
// Gate Protocol — Phase 1 (Create decision file + update state)
// =============================================================================

/** Result of Phase 1 execution */
export interface GateProtocolPhase1Result {
  /** Path to the created decision file */
  filePath: string;
  /** State updates to apply (status → awaiting_human_decision, etc.) */
  stateUpdates: Partial<SystemState>;
}

/**
 * Execute Gate Protocol Phase 1:
 * 1. Build context for decision file
 * 2. Generate Markdown content
 * 3. Resolve file path
 * 4. Write file to disk
 * 5. Return state updates (status → "awaiting_human_decision")
 *
 * After this, the agent MUST stop (protocol step 3).
 */
export function executeGateProtocolPhase1(
  step: Step,
  state: SystemState,
  config: OrchestratorConfig,
  summary: string,
): GateProtocolPhase1Result {
  // Build context
  const context = buildGateContext(step, state, summary);

  // Generate file content
  const content = createGateDecisionFileContent(step, context);

  // Resolve file path
  const filePath = resolveGateDecisionPath(step, config, state);

  // Write file to disk (protocol step 2)
  writeGateDecisionFile(filePath, content);

  // Protocol step 1: status → "awaiting_human_decision"
  const stateUpdates: Partial<SystemState> = {
    status: "awaiting_human_decision",
    last_artifact: filePath,
  };

  return { filePath, stateUpdates };
}

// =============================================================================
// Gate Protocol — Phase 2 (Read decision + validate)
// =============================================================================

/** Result of Phase 2 execution */
export interface GateProtocolPhase2Result {
  /** Whether a decision value was found in the file */
  decisionMade: boolean;
  /** Parsed decision file content */
  decision: GateDecisionFile;
  /** Whether the decision value is valid for this gate */
  valid: boolean;
  /** Human-readable message about the result */
  message: string;
}

/**
 * Execute Gate Protocol Phase 2:
 * 5. Read decision file
 * 6. If decision filled and valid → proceed (caller handles transition)
 * 7. If decision empty/missing → stay awaiting
 *
 * Also validates decision against allowed values.
 * Non-blocking rationale warning per std-gate-decision.md.
 */
export function executeGateProtocolPhase2(
  step: Step,
  decisionFilePath: string,
): GateProtocolPhase2Result {
  // Protocol step 5: read decision file
  const decision = readGateDecision(decisionFilePath);

  // Protocol step 7: empty → stay awaiting
  if (!isDecisionMade(decision)) {
    return {
      decisionMade: false,
      decision,
      valid: false,
      message: `Рішення воріт не заповнене. Очікую рішення у файлі ${decisionFilePath}.`,
    };
  }

  // Protocol step 6: validate decision value
  const decisionValue = String(decision.decision);
  if (!validateDecision(step, decisionValue)) {
    const validOptions = getValidDecisions(step).join(", ");
    return {
      decisionMade: true,
      decision,
      valid: false,
      message: `Невідоме рішення "${decisionValue}". Очікувані: ${validOptions}.`,
    };
  }

  // Rationale warning (non-blocking, per std-gate-decision.md section 4 phase 2 step 6)
  let message = `Рішення "${decisionValue}" прийнято.`;
  if (!decision.rationale || decision.rationale.trim().length === 0) {
    message += " Поле rationale порожнє. Рекомендується заповнити перед продовженням.";
  }

  return {
    decisionMade: true,
    decision,
    valid: true,
    message,
  };
}
