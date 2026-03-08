// =============================================================================
// Censure Gate — автоматична перевірка технічної цензури при complete
//
// Запускається для кроків L8 (Foundation Plan) та D3 (Development Plan).
// Читає вміст артефакту (план), запускає правила блоку D (тестування)
// та блоку A (архітектура) з technical-censure.ts.
//
// Якщо знайдено BLOCK — complete відхилено, агент ЗМУШЕНИЙ виправити план.
// Це "дріт" між existing правилами та existing pipeline.
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, Step } from "../types";
import {
  getApplicableRules,
  evaluateRule,
} from "./technical-censure";
import type { CensureInputContext } from "./technical-censure";
import { detectB2BProject } from "./b2b-detection";
import { appendCensureBlock } from "../learning/censure-history";
import { loadState, saveState } from "../state-machine";
import { recordCensureBlock } from "../watcher/retry-controller";

// =============================================================================
// Types
// =============================================================================

export interface CensureGateResult {
  passed: boolean;
  /** Blocked rule IDs with reasons */
  violations: Array<{ rule_id: string; name: string; reason: string }>;
  /** Total rules checked */
  checked: number;
  /** Summary message for CLI output */
  summary: string;
}

// Кроки-плани, для яких запускається цензура
const PLAN_STEPS = new Set(["L8", "D3"]);

// =============================================================================
// isPlanStep — чи крок є кроком створення плану
// =============================================================================

export function isPlanStep(step: string): boolean {
  return PLAN_STEPS.has(step);
}

// =============================================================================
// buildCensureContext — побудувати контекст для цензури з артефакту
//
// Оскільки ми запускаємо цензуру АВТОМАТИЧНО (не агент підтверджує),
// ми встановлюємо precondition-поля як true — draft_ready (артефакт існує),
// final_view_read і standard_read (оркестратор знає систему).
// Контекст проєкту виводимо з наявних файлів.
// =============================================================================

function buildCensureContext(
  content: string,
  config: OrchestratorConfig,
): CensureInputContext {
  const projectRoot = path.resolve(config.control_center_path, "..");

  // Визначаємо характеристики проєкту з файлової структури
  const hasDocker = fs.existsSync(path.join(projectRoot, "docker-compose.yml"));
  const hasApi = fs.existsSync(path.join(projectRoot, "server", "src"));
  const hasExternalDeps = hasDocker; // Docker = DB/Redis = external deps

  // AI endpoints — шукаємо в server/src
  let hasAiEndpoints = false;
  try {
    const serverSrc = path.join(projectRoot, "server", "src");
    if (fs.existsSync(serverSrc)) {
      const walk = (dir: string): boolean => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name !== "node_modules") {
            if (walk(path.join(dir, entry.name))) return true;
          } else if (entry.isFile() && entry.name.endsWith(".ts")) {
            const text = fs.readFileSync(path.join(dir, entry.name), "utf-8");
            if (/openai|anthropic|llm|ai[_\-]?scor/i.test(text)) return true;
          }
        }
        return false;
      };
      hasAiEndpoints = walk(serverSrc);
    }
  } catch { /* non-blocking */ }

  const isB2B = detectB2BProject(projectRoot);

  return {
    level: "plan",
    content,
    project_type: isB2B ? "multi" : "solo",
    uses_docker: hasDocker,
    has_api: hasApi,
    has_ai_endpoints: hasAiEndpoints,
    has_external_dependencies: hasExternalDeps,
    is_b2b: isB2B,
    // Автоматична цензура — preconditions завжди true
    final_view_read: true,
    standard_read: true,
    draft_ready: true,
  };
}

// =============================================================================
// runPlanCensure — головна функція: перевірити план за технічною цензурою
//
// Повертає CensureGateResult з passed=false якщо є БЛОКУЮЧІ порушення.
// complete.ts використовує це для блокування збереження плану.
// =============================================================================

export function runPlanCensure(
  artifactPath: string,
  config: OrchestratorConfig,
): CensureGateResult {
  // 1. Прочитати артефакт
  const absPath = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.resolve(config.control_center_path, "..", artifactPath);

  let content: string;
  try {
    content = fs.readFileSync(absPath, "utf-8");
  } catch (err) {
    return {
      passed: false,
      violations: [{
        rule_id: "FILE",
        name: "Артефакт не читається",
        reason: `Не вдалося прочитати файл: ${absPath}`,
      }],
      checked: 0,
      summary: `Цензура BLOCK: файл артефакту не читається (${absPath})`,
    };
  }

  // 2. Побудувати контекст
  const context = buildCensureContext(content, config);

  // 3. Отримати план-рівневі правила
  const applicableRules = getApplicableRules("plan");

  // 4. Оцінити кожне правило
  const violations: CensureGateResult["violations"] = [];
  for (const rule of applicableRules) {
    const result = evaluateRule(rule, context);
    if (result.verdict === "BLOCK") {
      violations.push({
        rule_id: rule.id,
        name: rule.name,
        reason: result.reason,
      });
    }
  }

  // 5. Формування результату
  const passed = violations.length === 0;
  let summary: string;

  if (passed) {
    summary = `Технічна цензура PASS: ${applicableRules.length}/${applicableRules.length} правил пройдено.`;
  } else {
    // OPT-2 + OPT-5: зберегти порушення у censure_history.json через dedicated module
    try {
      const loadResult = loadState(config);
      const cycle = "error" in loadResult ? 0 : loadResult.state.cycle;
      const step = "error" in loadResult ? "D3" as Step : loadResult.state.current_step;
      const projectName = "error" in loadResult ? undefined : loadResult.state.project_name;
      appendCensureBlock(config, cycle, step, violations.map(v => ({ rule_id: v.rule_id, name: v.name })), projectName);
    } catch { /* non-blocking */ }

    // OPT-10: Register censure blocks in tracker for retry limit
    try {
      const loadResult = loadState(config);
      if (!("error" in loadResult)) {
        const st = loadResult.state;
        for (const v of violations) {
          const blockResult = recordCensureBlock(st, v.rule_id);
          if (blockResult.escalate) {
            console.log(`\uD83D\uDEA8 CENSURE ESCALATION: ${blockResult.message}`);
          }
          if (blockResult.jidoka_warning) {
            console.log(`\u26D4 JIDOKA WARNING: ${blockResult.message}`);
          }
        }
        saveState(config, st);
      }
    } catch { /* non-blocking */ }

    const violationList = violations
      .map((v) => `  [${v.rule_id}] ${v.name}: ${v.reason}`)
      .join("\n");
    summary = [
      `Технічна цензура BLOCK: ${violations.length} порушень з ${applicableRules.length} правил.`,
      `Порушення:`,
      violationList,
      ``,
      `Виправте план і спробуйте complete знову. Збереження з порушеннями ЗАБОРОНЕНО.`,
    ].join("\n");
  }

  return {
    passed,
    violations,
    checked: applicableRules.length,
    summary,
  };
}

// =============================================================================
// appendCensureHistory — legacy wrapper
//
// OPT-5: Делегує до learning/censure-history.ts appendCensureBlock.
// Збережено для зворотної сумісності. Не використовується напряму.
// =============================================================================

export function appendCensureHistory(
  config: OrchestratorConfig,
  violations: CensureGateResult["violations"],
): void {
  try {
    const loadResult = loadState(config);
    const cycle = "error" in loadResult ? 0 : loadResult.state.cycle;
    const step = "error" in loadResult ? "D3" as Step : loadResult.state.current_step;
    const projectName = "error" in loadResult ? undefined : loadResult.state.project_name;
    appendCensureBlock(config, cycle, step, violations.map(v => ({ rule_id: v.rule_id, name: v.name })), projectName);
  } catch { /* non-blocking */ }
}
