// =============================================================================
// Decisions — типи рішень воріт, вердиктів аудиту, цензури
// =============================================================================

// --- Рішення воріт (Gate Decisions) ---

/** L4: GO / REWORK / KILL */
export type EntryGateDecision = "GO" | "REWORK" | "KILL";

/** GATE 1: Foundation Gate */
export type FoundationGateDecision = "GO" | "REBUILD_PLAN" | "REBUILD_DESCRIPTION" | "KILL";

/** Mini-GATE (D9 → D1) */
export type MiniGateDecision = "CONTINUE" | "VALIDATE" | "AMEND_SPEC" | "KILL";

/** V3 Decision (після FAIL аудиту) */
export type V3Decision = "CONTINUE" | "AMEND_SPEC" | "KILL";

/** S-Block Decision (S5) */
export type SBlockDecision = "REPEAT" | "VALIDATE" | "STOP";

/** E1 Decision (Release NOT_READY) */
export type ReleaseDecision = "D1" | "KILL";

/** Всі можливі рішення */
export type AnyGateDecision =
  | EntryGateDecision
  | FoundationGateDecision
  | MiniGateDecision
  | V3Decision
  | SBlockDecision
  | ReleaseDecision;

// --- Вердикти ---

/** V1/V2: Результат аудиту */
export type AuditVerdict = "PASS" | "FAIL";

/** E1: Готовність до релізу */
export type ReleaseVerdict = "READY" | "NOT_READY";

/** V0: Результат UI review */
export type UIVerdict = "UI_PASS" | "UI_PARTIAL" | "UI_FAIL";

/** Technical Censure: Результат перевірки правила */
export type CensureVerdict = "PASS" | "BLOCK";

/** D9 Goals Check: Готовність */
export type GoalsCheckVerdict = "READY_FOR_AUDIT" | "NEEDS_ITERATION" | "REGRESSION_DETECTED";

/** D6 Plan Completion: Статус елементу */
export type PlanItemVerdict = "✅" | "⚠️" | "❌";

// --- Структура файлу рішення воріт ---

export interface GateDecisionFile {
  /** Рішення (заповнюється людиною) */
  decision: AnyGateDecision | null;
  /** Обґрунтування */
  rationale: string;
  /** Додаткові коментарі для агента */
  comments: string;
}

// --- Структура дефекту (для acceptance_report) ---

export type DefectSeverity = "CRITICAL" | "MAJOR" | "MINOR";

/**
 * Підкатегорія MAJOR-дефекту (V2 рішення використовує для порогового правила):
 * - FUNC: порушує user flow (endpoint зламаний, безпека, дані некоректні)
 * - DESIGN: візуальне відхилення від spec (CSS токени, анімації, layout, типографіка)
 */
export type MajorSubcategory = "FUNC" | "DESIGN";

export interface Defect {
  id: string;
  severity: DefectSeverity;
  /** Підкатегорія — обов'язкова для MAJOR, null для CRITICAL/MINOR */
  major_subcategory?: MajorSubcategory;
  description: string;
  location: string;
  evidence: string;
}

// --- Critria для JIDOKA (зупинка конвеєра) ---

export interface JidokaCriterion {
  id: string;
  description: string;
  example: string;
}

export const JIDOKA_CRITERIA: JidokaCriterion[] = [
  {
    id: "J1",
    description: "Дефект робить неможливим виконання наступних задач плану",
    example: "Базова архітектура зламана, інші задачі залежать від неї",
  },
  {
    id: "J2",
    description: "Дефект суперечить вимогам з final_view/ на фундаментальному рівні",
    example: "Реалізовано протилежну поведінку від заданої",
  },
  {
    id: "J3",
    description: "Дефект порушує цілісність даних або безпеку",
    example: "Втрата даних, відкриті вразливості",
  },
  {
    id: "J4",
    description: "Дефект виявлено в >3 задачах поспіль з однаковою кореневою причиною",
    example: "Системна помилка в підході, а не окремий баг",
  },
  {
    id: "J5",
    description: "Суперечність між стандартами або планом і описом продукту",
    example: "Задача вимагає X, але стандарт забороняє X",
  },
];

// --- Technical Censure: правило ---

export interface CensureRule {
  id: string;
  block: CensureBlock;
  name: string;
  violation_criteria: string;
}

export type CensureBlock = "architecture" | "security" | "persistence" | "testing" | "b2b_readiness";
