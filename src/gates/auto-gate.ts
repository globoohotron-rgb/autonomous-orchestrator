// =============================================================================
// Auto-Gate Evaluator — автоматичне прийняття рішень на воротах
//
// Замість очікування людини, система аналізує пороги і приймає рішення сама.
// Якщо пороги невизначені — ескалація до людини (awaiting_human_decision).
//
// Підтримувані ворота:
//   GATE1: auto-GO якщо всі P0 AC = PASS і 0 mismatch
//   D9 (Mini-GATE): auto-CONTINUE/VALIDATE за % DONE
//   L4: ЗАВЖДИ людина (бізнес-рішення)
//   S5: ЗАВЖДИ людина (security judgement)
//   V3: ЗАВЖДИ людина (після FAIL аудиту)
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, SystemState, Step } from "../types";
import { createCycleReport } from "../learning/cycle-report";
import { getCensureTrackerSummary } from "../watcher/retry-controller";
import { detectB2BProject, B2B_THRESHOLDS } from "../validators/b2b-detection";
import { checkCircuitBreaker, MAX_VALIDATION_ATTEMPTS } from "../commands/lifecycle-hooks";

// =============================================================================
// Types
// =============================================================================

export interface AutoGateResult {
  /** Чи вдалося автоматично визначити рішення */
  auto_decided: boolean;
  /** Рішення (якщо auto_decided = true) */
  decision?: string;
  /** Причина рішення (для логу) */
  rationale: string;
  /** Деталі аналізу */
  analysis: Record<string, unknown>;
  /** OPT-1: Патчі для state.json, які треба зберегти після gate evaluation */
  state_patches?: Partial<import("../types").SystemState>;
}

// Ворота що ЗАВЖДИ потребують людину
const HUMAN_ONLY_GATES = new Set<string>(["L4"]);

/** OPT-22: Жорстка стеля D-циклів — auto-KILL після досягнення */
export const MAX_DEVELOPMENT_CYCLES = 15;

/** OPT-22: Жорстка стеля S-block циклів */
export const MAX_S_BLOCK_CYCLES = 3;

/** OPT-22: Мінімальна зміна % для скидання stagnation лічильника */
export const STAGNATION_RANGE = 2;

// =============================================================================
// OPT-13: Cycle Phase Awareness
// =============================================================================

/** Визначає фазу циклу розробки */
export function getCyclePhase(cycle: number): "early" | "mid" | "late" {
  if (cycle <= 3) return "early";
  if (cycle <= 6) return "mid";
  return "late";
}

/** Пороги VALIDATE по фазах */
export const VALIDATE_THRESHOLDS = {
  early: { percent: 90, minCycle: 3 },
  mid:   { percent: 80, minCycle: 4 },
  late:  { percent: 75, minCycle: 7 },
} as const;

// =============================================================================
// evaluateGate — головна функція
// =============================================================================

export function evaluateGate(
  step: Step,
  state: SystemState,
  config: OrchestratorConfig,
): AutoGateResult {
  // L4, S5 — завжди людина
  if (HUMAN_ONLY_GATES.has(step)) {
    return {
      auto_decided: false,
      rationale: `${step} — бізнес/security рішення, потребує людини.`,
      analysis: {},
    };
  }

  switch (step) {
    case "GATE1":
      return evaluateGate1(state, config);

    case "D9": {
      const d9Result = evaluateD9MiniGate(state, config);
      // OPT-9: Auto cycle report after D9 gate evaluation
      try {
        const reportPath = createCycleReport(config, state.cycle ?? 0);
        d9Result.analysis.cycle_report = reportPath;
      } catch {
        // Non-blocking — report failure must not affect gate decision
      }
      return d9Result;
    }

    // OPT-22: V3 auto-gate — CONTINUE або KILL за validation_attempts
    case "V3":
      return evaluateV3Gate(state);

    // OPT-22: S5 auto-gate — REPEAT/VALIDATE/STOP за s_block_cycles
    case "S5":
      return evaluateS5Gate(state, config);

    default:
      return {
        auto_decided: false,
        rationale: `Крок ${step} не має автоматичної логіки воріт.`,
        analysis: {},
      };
  }
}

// =============================================================================
// evaluateGate1 — Foundation Gate
//
// Правила:
//   1. Прочитати completion_checklist.md
//   2. Знайти всі P0 AC → всі PASS? → auto-GO
//   3. Знайти "MISMATCH" → якщо >0 → escalate
//   4. Якщо є FAIL серед P0 → escalate
// =============================================================================

function evaluateGate1(
  _state: SystemState,
  config: OrchestratorConfig,
): AutoGateResult {
  const checklistPath = path.join(
    config.control_center_path,
    "final_view",
    "completion_checklist.md",
  );

  // Чекліст не існує — ескалація
  if (!fs.existsSync(checklistPath)) {
    return {
      auto_decided: false,
      rationale: "completion_checklist.md не знайдено — потрібна людина.",
      analysis: { checklist_exists: false },
    };
  }

  const content = fs.readFileSync(checklistPath, "utf-8");

  // Парсимо P0 AC статуси
  const p0Stats = parseP0AcStatus(content);
  const mismatchCount = countMismatches(content);

  const analysis = {
    p0_total: p0Stats.total,
    p0_pass: p0Stats.pass,
    p0_fail: p0Stats.fail,
    p0_partial: p0Stats.partial,
    contract_mismatches: mismatchCount,
  };

  // Правило: всі P0 PASS + 0 mismatch → auto-GO
  if (p0Stats.fail === 0 && p0Stats.partial === 0 && mismatchCount === 0 && p0Stats.total > 0) {
    return {
      auto_decided: true,
      decision: "GO",
      rationale: `Всі ${p0Stats.total} P0 AC = PASS, 0 MISMATCH → auto-GO.`,
      analysis,
    };
  }

  // P0 мають FAIL → ескалація
  if (p0Stats.fail > 0) {
    return {
      auto_decided: false,
      rationale: `${p0Stats.fail} P0 AC = FAIL — потрібна людина.`,
      analysis,
    };
  }

  // MISMATCH → ескалація
  if (mismatchCount > 0) {
    return {
      auto_decided: false,
      rationale: `${mismatchCount} contract MISMATCH — потрібна людина.`,
      analysis,
    };
  }

  // P0 partial але без fail — ескалація (неоднозначно)
  if (p0Stats.partial > 0) {
    return {
      auto_decided: false,
      rationale: `${p0Stats.partial} P0 AC = PARTIAL — потрібна людина.`,
      analysis,
    };
  }

  // Немає P0 AC — щось не так
  return {
    auto_decided: false,
    rationale: "Не знайдено P0 AC у checklist — потрібна людина.",
    analysis,
  };
}

// =============================================================================
// evaluateD9MiniGate — Mini-GATE (D9 — єдині ворота блоку D)
//
// Правила:
//   1. Прочитати goals_check або mini_gate_decision
//   2. >80% DONE + cycles >= 2 → auto-VALIDATE
//   3. <50% DONE + cycles >= 5 → escalate (KILL/PIVOT)
//   4. Інакше → auto-CONTINUE
//
// Перший цикл (cycle=0) → завжди CONTINUE (нічого перевіряти)
// =============================================================================

function evaluateD9MiniGate(
  state: SystemState,
  config: OrchestratorConfig,
): AutoGateResult {
  const cycle = state.cycle ?? 0;

  // Перший цикл — немає goals_check → auto-CONTINUE
  if (cycle === 0) {
    return {
      auto_decided: true,
      decision: "CONTINUE",
      rationale: "Перший цикл — auto-CONTINUE.",
      analysis: { cycle: 0, reason: "first_cycle" },
    };
  }

  // B2B detection
  const isB2B = detectB2BProject(config.project_root);

  // Прочитати goals_check якщо є
  const goalsCheckPath = state.artifacts?.goals_check;
  if (!goalsCheckPath) {
    return {
      auto_decided: true,
      decision: "CONTINUE",
      rationale: "goals_check відсутній — auto-CONTINUE.",
      analysis: { cycle, goals_check: null },
    };
  }

  const absPath = path.join(config.project_root, goalsCheckPath);
  if (!fs.existsSync(absPath)) {
    return {
      auto_decided: true,
      decision: "CONTINUE",
      rationale: "goals_check файл не знайдено — auto-CONTINUE.",
      analysis: { cycle, goals_check_path: goalsCheckPath, exists: false },
    };
  }

  const content = fs.readFileSync(absPath, "utf-8");
  const donePercent = parseDonePercent(content);

  // --- OPT-6: Infrastructure vs code blocker classification ---
  const goalsDetailed = parseGoalsDetailed(content);
  const codeComplete = goalsDetailed.code_complete_percent;
  // --- end OPT-6 setup ---

  // --- OPT-1 + OPT-22: Stagnation detection (range-based) ---
  const prevPercent = state.prev_done_percent ?? null;
  let stagnationCount = state.stagnation_count ?? 0;

  if (donePercent !== null && prevPercent !== null) {
    // OPT-22: діапазон ±STAGNATION_RANGE замість exact match
    if (Math.abs(donePercent - prevPercent) > STAGNATION_RANGE) {
      stagnationCount = 0; // суттєвий прогрес — скинути
    } else {
      stagnationCount++; // флуктуація в межах діапазону = стагнація
    }
  }

  const stagnationPatches: Partial<SystemState> = {
    prev_done_percent: donePercent ?? prevPercent,
    stagnation_count: stagnationCount,
  };

  const STAGNATION_THRESHOLD = 2;
  // --- end OPT-1 + OPT-22 stagnation setup ---

  const analysis: Record<string, unknown> = {
    cycle,
    done_percent: donePercent,
    code_complete_percent: codeComplete,
    total_ac: goalsDetailed.total_ac,
    done_count: goalsDetailed.done_count,
    partial_infra: goalsDetailed.partial_infra_count,
    partial_code: goalsDetailed.partial_code_count,
    goals_check_path: goalsCheckPath,
    prev_done_percent: prevPercent,
    stagnation_count: stagnationCount,
    is_b2b: isB2B,
    b2b_validate_threshold: isB2B ? B2B_THRESHOLDS.VALIDATE_DONE_PERCENT : 80,
  };

  // OPT-13: Визначити фазу циклу рано — потрібно для всіх гілок
  const phase = getCyclePhase(cycle);

  // OPT-22 GAP-1: Circuit breaker — перевірити ПЕРЕД будь-яким auto-VALIDATE
  const circuitBreaker = checkCircuitBreaker(state);
  if (circuitBreaker.blocked) {
    return {
      auto_decided: false,
      rationale: circuitBreaker.message,
      analysis: { ...analysis, circuit_breaker: true, validation_attempts: state.validation_attempts ?? 0 },
      state_patches: stagnationPatches,
    };
  }

  // OPT-22 GAP-2: Hard ceiling — auto-KILL після MAX_DEVELOPMENT_CYCLES
  if (cycle >= MAX_DEVELOPMENT_CYCLES) {
    return {
      auto_decided: true,
      decision: "KILL",
      rationale: `Hard ceiling: cycle ${cycle} >= ${MAX_DEVELOPMENT_CYCLES} → auto-KILL. Проєкт не може нескінченно ітерувати.`,
      analysis: { ...analysis, max_cycles_reached: true, cycle, done_percent: donePercent },
      state_patches: stagnationPatches,
    };
  }

  // OPT-6: code-complete ≥90% (B2B: ≥93%) + all PARTIAL = infra → auto-VALIDATE
  const codeCompleteThreshold = isB2B ? B2B_THRESHOLDS.CODE_COMPLETE_PERCENT : 90;
  if (
    codeComplete !== null &&
    codeComplete >= codeCompleteThreshold &&
    goalsDetailed.partial_code_count === 0 &&
    goalsDetailed.not_started_count === 0 &&
    cycle >= 2
  ) {
    const attempts = state.validation_attempts ?? 0;
    return {
      auto_decided: true,
      decision: "VALIDATE",
      rationale: `Code ${codeComplete}% complete (${goalsDetailed.partial_infra_count} AC infra-blocked only). All code done → auto-VALIDATE.`,
      analysis: { ...analysis, validation_attempts: attempts },
      state_patches: {
        ...stagnationPatches,
        code_complete_percent: codeComplete,
        infra_blocked_count: goalsDetailed.partial_infra_count,
        cycle_phase: phase,
      },
    };
  }

  // OPT-13: Phase-aware VALIDATE thresholds (B2B keeps own thresholds)
  // Fallback: cycle > 10 && done > 70% → auto-VALIDATE незалежно від фази
  const validateThreshold = isB2B ? B2B_THRESHOLDS.VALIDATE_DONE_PERCENT : VALIDATE_THRESHOLDS[phase].percent;
  const validateMinCycles = isB2B ? B2B_THRESHOLDS.VALIDATE_MIN_CYCLES : VALIDATE_THRESHOLDS[phase].minCycle;
  const fallbackValidate = !isB2B && cycle > 10 && donePercent !== null && donePercent > 70;
  if (fallbackValidate || (donePercent !== null && donePercent >= validateThreshold && cycle >= validateMinCycles)) {
    // B2B: додаткова перевірка gaps
    if (isB2B) {
      const b2bGaps = countB2BGaps(absPath);
      if (b2bGaps > B2B_THRESHOLDS.VALIDATE_MAX_GAPS) {
        return {
          auto_decided: false,
          rationale: `B2B project: ${donePercent}% DONE але ${b2bGaps} B2B gaps → ЕСКАЛАЦІЯ. Потрібні: multi-tenancy, RBAC, onboarding, billing.`,
          analysis: { ...analysis, b2b_gaps: b2bGaps },
          state_patches: stagnationPatches,
        };
      }
    }
    const attempts = state.validation_attempts ?? 0;
    return {
      auto_decided: true,
      decision: "VALIDATE",
      rationale: `${donePercent}% DONE, cycle ${cycle} (phase: ${phase}, threshold: ${validateThreshold}%) → auto-VALIDATE (validation_attempts: ${attempts}).`,
      analysis: { ...analysis, validation_attempts: attempts, cycle_phase: phase },
      state_patches: {
        ...stagnationPatches,
        cycle_phase: phase,
      },
    };
  }

  // OPT-1: Stagnation check — BEFORE <50% escalation and auto-CONTINUE
  if (stagnationCount >= STAGNATION_THRESHOLD && donePercent !== null) {
    return {
      auto_decided: false,
      rationale: `STAGNATION: ${donePercent}% DONE unchanged for ${stagnationCount} cycles → ЕСКАЛАЦІЯ.`,
      analysis: { ...analysis, stagnation_threshold: STAGNATION_THRESHOLD },
      state_patches: { ...stagnationPatches, cycle_phase: phase },
    };
  }

  // <50% DONE + cycles >= 5 → ескалація (потенційно KILL/PIVOT)
  if (donePercent !== null && donePercent < 50 && cycle >= 5) {
    return {
      auto_decided: false,
      rationale: `${donePercent}% DONE + cycle ${cycle} ≥ 5 → ЕСКАЛАЦІЯ (потенційно KILL).`,
      analysis,
      state_patches: { ...stagnationPatches, cycle_phase: phase },
    };
  }

  // Інакше → auto-CONTINUE
  // OPT-10: Censure tracker summary for reasoning
  let censureSummary = "";
  try {
    const raw = getCensureTrackerSummary(state);
    if (raw !== "No censure blocks recorded.") censureSummary = raw;
  } catch { /* non-blocking — Iron Rule #5 */ }
  const continueRationale = `${donePercent ?? "?"}% DONE, cycle ${cycle} \u2192 auto-CONTINUE.${censureSummary ? "\nCensure tracker: " + censureSummary : ""}`;
  return {
    auto_decided: true,
    decision: "CONTINUE",
    rationale: continueRationale,
    analysis,
    state_patches: {
      ...stagnationPatches,
      cycle_phase: phase,
    },
  };
}

// =============================================================================
// OPT-22 GAP-5: evaluateV3Gate — V3 auto-gate
//
// Після FAIL аудиту: auto-CONTINUE для виправлення, або auto-KILL при ліміті.
// =============================================================================

function evaluateV3Gate(state: SystemState): AutoGateResult {
  const attempts = state.validation_attempts ?? 0;

  // Подвійний захист: якщо validation_attempts >= MAX → auto-KILL
  if (attempts >= MAX_VALIDATION_ATTEMPTS) {
    return {
      auto_decided: true,
      decision: "KILL",
      rationale: `V3: validation_attempts=${attempts} >= ${MAX_VALIDATION_ATTEMPTS}. Проєкт не може пройти валідацію → auto-KILL.`,
      analysis: { validation_attempts: attempts, circuit_breaker: true },
    };
  }

  // Стандартне рішення: CONTINUE → D1 для виправлення дефектів
  return {
    auto_decided: true,
    decision: "CONTINUE",
    rationale: `V3: validation_attempts=${attempts}, validation_conclusions сформовані → auto-CONTINUE до D1 для виправлення дефектів.`,
    analysis: { validation_attempts: attempts },
  };
}

// =============================================================================
// OPT-22 GAP-3: evaluateS5Gate — S5 auto-gate
//
// REPEAT / VALIDATE / STOP за s_block_cycles та залишковими CVE.
// =============================================================================

function evaluateS5Gate(
  state: SystemState,
  config: OrchestratorConfig,
): AutoGateResult {
  const sCycles = state.s_block_cycles ?? 0;

  // Hard ceiling: S-block не може повторюватись нескінченно
  if (sCycles >= MAX_S_BLOCK_CYCLES) {
    return {
      auto_decided: true,
      decision: "STOP",
      rationale: `S-block cycle ${sCycles} >= ${MAX_S_BLOCK_CYCLES} → auto-STOP. Повернення до D-блоку.`,
      analysis: { s_block_cycles: sCycles, max_reached: true },
      state_patches: { s_block_cycles: 0 },
    };
  }

  // Спробувати прочитати результат сканування з issues/done
  // Якщо 0 CRITICAL + 0 HIGH → auto-VALIDATE
  try {
    const issuesDonePath = path.join(config.control_center_path, "issues", "done");
    if (fs.existsSync(issuesDonePath)) {
      const files = fs.readdirSync(issuesDonePath)
        .filter(f => f.startsWith("security_scan_"))
        .sort()
        .reverse();
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(issuesDonePath, files[0]), "utf-8");
        const hasCritical = /CRITICAL/i.test(content) && !/0\s*CRITICAL/i.test(content);
        const hasHigh = /HIGH/i.test(content) && !/0\s*HIGH/i.test(content);
        if (!hasCritical && !hasHigh) {
          return {
            auto_decided: true,
            decision: "VALIDATE",
            rationale: `0 CRITICAL, 0 HIGH залишкових CVE → auto-VALIDATE.`,
            analysis: { s_block_cycles: sCycles, remaining_cve: 0 },
            state_patches: { s_block_cycles: 0 },
          };
        }
      }
    }
  } catch { /* non-blocking — fallback to REPEAT */ }

  // Default: auto-REPEAT з інкрементом
  return {
    auto_decided: true,
    decision: "REPEAT",
    rationale: `Залишкові CVE, s_block_cycle ${sCycles + 1} → auto-REPEAT.`,
    analysis: { s_block_cycles: sCycles + 1 },
    state_patches: { s_block_cycles: sCycles + 1 },
  };
}

// =============================================================================
// B2B gap counter
// =============================================================================

/**
 * Рахує кількість відсутніх B2B features у goals_check.
 * Кожен B2B keyword відсутній у контенті = +1 gap.
 */
function countB2BGaps(goalsCheckAbsPath: string): number {
  if (!fs.existsSync(goalsCheckAbsPath)) return 0;
  const content = fs.readFileSync(goalsCheckAbsPath, "utf-8");

  let gaps = 0;
  if (!/multi.?tenan/i.test(content)) gaps++;
  if (!/rbac|role.?based|permission/i.test(content)) gaps++;
  if (!/onboarding|setup wizard/i.test(content)) gaps++;
  if (!/billing|subscription|stripe/i.test(content)) gaps++;
  if (!/empty.?state|no.?data.*cta/i.test(content)) gaps++;
  return gaps;
}

// =============================================================================
// Parsing helpers
// =============================================================================

interface P0Stats {
  total: number;
  pass: number;
  fail: number;
  partial: number;
}

/** Parse P0 AC statuses from completion_checklist.md */
function parseP0AcStatus(content: string): P0Stats {
  const stats: P0Stats = { total: 0, pass: 0, fail: 0, partial: 0 };

  // Шукаємо таблицю "Пріоритети та статус" або рядки з "P0"
  const lines = content.split("\n");

  for (const line of lines) {
    // Шукаємо рядки таблиці з P0
    if (!line.includes("P0") && !line.includes("**P0**")) continue;
    if (!line.includes("|")) continue;

    stats.total++;

    const lower = line.toLowerCase();
    if (lower.includes("✅") || lower.includes("pass") || lower.includes("реалізовано")) {
      stats.pass++;
    } else if (lower.includes("❌") || lower.includes("fail")) {
      stats.fail++;
    } else if (lower.includes("⚠️") || lower.includes("partial") || lower.includes("частков")) {
      stats.partial++;
    }
  }

  return stats;
}

/** Count contract mismatches in completion_checklist.md */
function countMismatches(content: string): number {
  // Шукаємо "MISMATCH" в рядках таблиці (не в заголовках/коментарях)
  const lines = content.split("\n");
  let count = 0;

  for (const line of lines) {
    if (!line.includes("|")) continue;
    if (line.includes("**MISMATCH**") || (line.includes("MISMATCH") && !line.includes("0 MISMATCH"))) {
      count++;
    }
  }

  return count;
}

// =============================================================================
// OPT-6: parseGoalsDetailed — розширений парсер goals_check
//
// Розрізняє infrastructure vs code blockers серед PARTIAL AC.
// Якщо goals_check не має per-AC таблиці — fallback до parseDonePercent.
// =============================================================================

export interface GoalsAnalysis {
  done_percent: number | null;
  code_complete_percent: number | null;
  total_ac: number;
  done_count: number;
  partial_infra_count: number;   // PARTIAL але code-verified (infra only)
  partial_code_count: number;    // PARTIAL через незавершений код
  not_started_count: number;
}

/** Infrastructure keyword pattern — conservative, explicit keywords only */
const INFRA_PATTERN = /infrastructure|api[\s._-]?key|docker|runtime[\s._-]?pending|resend|stripe|відсутн|env[\s._-]?var|secret|credential/i;

export function parseGoalsDetailed(content: string): GoalsAnalysis {
  const lines = content.split("\n");
  let total = 0, done = 0, partial_infra = 0, partial_code = 0, not_started = 0;

  for (const line of lines) {
    if (!line.includes("|")) continue;
    if (!(/AC-\d+/i.test(line))) continue;
    if (line.includes("---")) continue;

    total++;

    // Split by | to isolate status column (typically column 2)
    const cols = line.split("|").map(c => c.trim());
    // Find the status column: the one containing DONE/PARTIAL/NOT_STARTED keywords
    const statusCol = cols.length >= 3 ? cols[2].toLowerCase() : "";

    if (statusCol.includes("done") || statusCol.includes("✅") || statusCol.includes("pass")) {
      done++;
    } else if (statusCol.includes("partial") || statusCol.includes("⚠️")) {
      // Класифікуємо PARTIAL: check the full line for infra keywords
      if (INFRA_PATTERN.test(line)) {
        partial_infra++;
      } else {
        partial_code++;
      }
    } else if (statusCol.includes("not_started") || statusCol.includes("not started") || statusCol.includes("todo")) {
      not_started++;
    }
  }

  const done_percent = total > 0 ? Math.round((done / total) * 100) : null;

  // code_complete = (done + partial_infra) / total
  // partial_infra вважається "code done" бо код написаний
  const code_done = done + partial_infra;
  const code_complete_percent = total > 0 ? Math.round((code_done / total) * 100) : null;

  return {
    done_percent,
    code_complete_percent,
    total_ac: total,
    done_count: done,
    partial_infra_count: partial_infra,
    partial_code_count: partial_code,
    not_started_count: not_started,
  };
}

/** Parse % DONE from goals_check.md — шукає число перед % */
function parseDonePercent(content: string): number | null {
  // Шукаємо патерни: "XX% DONE", "XX%", "Прогрес: XX%"
  const patterns = [
    /(\d+)\s*%\s*DONE/i,
    /прогрес[:\s]*(\d+)\s*%/i,
    /done[:\s]*(\d+)\s*%/i,
    /completion[:\s]*(\d+)\s*%/i,
    /(\d+)\s*\/\s*(\d+)\s*AC/i, // "5/7 AC" → 71%
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      if (match[2]) {
        // X/Y format
        const done = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        return total > 0 ? Math.round((done / total) * 100) : null;
      }
      return parseInt(match[1], 10);
    }
  }

  // Fallback: порахувати PASS/FAIL в таблиці AC
  const lines = content.split("\n");
  let pass = 0;
  let total = 0;

  for (const line of lines) {
    if (!line.includes("|") || !line.includes("AC")) continue;
    if (line.includes("---")) continue; // separator

    const lower = line.toLowerCase();
    if (lower.includes("pass") || lower.includes("✅") || lower.includes("done")) {
      pass++;
      total++;
    } else if (lower.includes("fail") || lower.includes("❌") || lower.includes("partial") || lower.includes("⚠️") || lower.includes("todo") || lower.includes("pending")) {
      total++;
    }
  }

  return total > 0 ? Math.round((pass / total) * 100) : null;
}
