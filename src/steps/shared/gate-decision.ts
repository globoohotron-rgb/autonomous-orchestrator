// =============================================================================
// Gate Decision — протокол рішень воріт (L4, GATE1)
// Конвертовано з: control_center/standards/system/std-gate-decision.md
// Інструмент: використовується кроками L4 (Entry Gate), GATE1 (Foundation Gate)
// =============================================================================

import type {
  SystemState,
  Status,
  Block,
  Step,
  PreconditionCheck,
  AlgorithmStep,
  GateDecisionFile,
} from "../../types";

// =============================================================================
// 1. Types (специфічні для gate-decision)
// =============================================================================

/** Тип воріт — визначається з current_step */
type GateType = "L4" | "GATE1";

/** Результат Фази 1 — підготовка файлу рішення */
interface GatePreparationResult {
  success: boolean;
  gate_type: GateType;
  artifact_path: string;
  state_updates: Partial<SystemState>;
  message: string;
  error?: string;
}

/** Результат Фази 2 — обробка рішення людини */
interface GateProcessingResult {
  success: boolean;
  decision: string;
  next_step: Step;
  next_block: Block;
  state_updates: Partial<SystemState>;
  message: string;
  warnings: string[];
  error?: string;
}

/** Contract Health запис (GATE1 only) */
interface ContractHealthEntry {
  endpoint: string;
  server_route: string;
  client_component: string;
  verdict: "MATCH" | "MISMATCH";
  details?: string;
}

/** Contract Health Report */
interface ContractHealthReport {
  entries: ContractHealthEntry[];
  has_mismatches: boolean;
  warning?: string;
}

/** Вхідні дані для execute() */
interface GateDecisionInput {
  /** Поточний стан системи */
  state: SystemState;
  /** Фаза виконання: prepare = створити файл, process = обробити рішення */
  phase: "prepare" | "process";
  /** Поточна дата у форматі DD.MM.YY-HH-MM */
  date: string;
  /** Контекст для секції context у файлі рішення (Фаза 1) */
  context_summary?: string;
  /** Contract Health Report (Фаза 1, GATE1 тільки) */
  contract_health?: ContractHealthReport;
  /** Зчитаний файл рішення (Фаза 2) */
  decision_file?: GateDecisionFile;
}

/** Результат execute() */
type GateDecisionResult = GatePreparationResult | GateProcessingResult;

/** Результат валідації */
interface ValidationOutcome {
  valid: boolean;
  issues: string[];
}

// =============================================================================
// 2. PRECONDITIONS (§3 POKA-YOKE — 4 передумови)
// =============================================================================

const PRECONDITIONS: PreconditionCheck[] = [
  {
    type: "file_exists",
    path: "control_center/system_state/state.json",
    description: "P1: state.json існує і коректний",
  },
  {
    type: "step_completed",
    description:
      "P2: Попередній крок циклу завершений (L4: L3 виконано; GATE1: L13 виконано)",
  },
  {
    type: "file_exists",
    description:
      "P3: Артефакт попереднього кроку існує (L4: discovery_brief.md; GATE1: hansei_foundation_*.md та completion_checklist.md у final_view/)",
  },
  {
    type: "state_field",
    field: "status",
    description:
      "P4: У control_center/ немає незавершеного файлу рішення для цих же воріт зі статусом awaiting_human_decision",
  },
];

// =============================================================================
// 3. Constants
// =============================================================================

/** Дозволені рішення для L4 (Entry Gate) */
const L4_ALLOWED_DECISIONS: readonly string[] = ["GO", "REWORK", "KILL"];

/** Дозволені рішення для GATE1 (Foundation Gate) */
const GATE1_ALLOWED_DECISIONS: readonly string[] = [
  "GO",
  "REWORK",
  "REBUILD_PLAN",
  "REBUILD_DESCRIPTION",
  "KILL",
];

/** Шляхи артефактів за воротами */
const GATE_ARTIFACT_PATHS: Record<GateType, string> = {
  L4: "control_center/project_description/gate_entry_decision_{date}.md",
  GATE1: "control_center/audit/gate_decisions/gate1_decision_{date}.md",
};

/** Попередній крок для кожних воріт */
const GATE_PREVIOUS_STEP: Record<GateType, Step> = {
  L4: "L3",
  GATE1: "L13",
};

/** Необхідні артефакти попереднього кроку */
const GATE_REQUIRED_ARTIFACTS: Record<GateType, string[]> = {
  L4: ["control_center/project_description/discovery_brief.md"],
  GATE1: [
    "control_center/audit/hansei/hansei_foundation_{date}.md",
    "control_center/final_view/completion_checklist.md",
  ],
};

// =============================================================================
// 4. Algorithm Steps (§4)
// =============================================================================

const ALGORITHM: AlgorithmStep[] = [
  // --- Фаза 1: Підготовка (агент) ---
  {
    order: 1,
    instruction:
      "Зчитати state.json. Підтвердити, що поточний крок відповідає воротам (L4 або GATE1).",
  },
  {
    order: 2,
    instruction: "Виконати перевірки POKA-YOKE (P1-P4). Якщо не пройдено — зупинитися.",
  },
  {
    order: 3,
    instruction:
      "Визначити тип воріт за current_step: L4 → ворота входу, GATE1 → ворота фундаменту.",
  },
  {
    order: 4,
    instruction:
      "Створити файл рішення за шаблоном у відповідній папці: L4 → project_description/gate_entry_decision_DD.MM.YY-HH-MM.md, GATE1 → audit/gate_decisions/gate1_decision_DD.MM.YY-HH-MM.md.",
  },
  {
    order: 5,
    instruction:
      "Заповнити секцію context у файлі рішення — стислий фактичний підсумок стану.",
  },
  {
    order: 6,
    instruction:
      "(GATE1 тільки) Contract Health Report: перевірити 3 ключових ендпоінти з behavior_spec.md, порівняти шлях запиту + імена полів server↔client.",
    contract_check:
      "Client endpoint path = Server registered route; Client field names = Server handler field names",
  },
  {
    order: 7,
    instruction:
      "Оновити state.json: status → awaiting_human_decision, last_artifact → шлях до файлу рішення.",
  },
  {
    order: 8,
    instruction: "ЗУПИНИТИСЯ. Не продовжувати виконання.",
  },
  // --- Фаза 2: Обробка рішення (агент, наступна сесія) ---
  {
    order: 9,
    instruction:
      "При старті сесії зчитати state.json. Якщо status = awaiting_human_decision — зчитати файл рішення з last_artifact.",
  },
  {
    order: 10,
    instruction:
      "Перевірити поле decision: порожнє → залишитися в стані очікування; заповнене → продовжити.",
  },
  {
    order: 11,
    instruction:
      "Валідувати значення decision — чи воно входить у перелік дозволених для цих воріт.",
  },
  {
    order: 12,
    instruction:
      "Перевірити поле rationale: якщо порожнє — попередити (не блокує перехід).",
  },
  {
    order: 13,
    instruction: "Виконати перехід відповідно до рішення (таблиця переходів §4).",
  },
  {
    order: 14,
    instruction:
      "Зчитати поле comments: якщо заповнене — врахувати вказівки при виконанні наступного кроку.",
  },
  {
    order: 15,
    instruction: "Оновити last_completed_step у state.json.",
  },
];

// =============================================================================
// 5. Constraints (§8 Обмеження — 6 правил)
// =============================================================================

const CONSTRAINTS: string[] = [
  "Заборонено агенту приймати рішення на воротах самостійно. Будь-яке рішення — тільки від людини.",
  "Заборонено продовжувати виконання після створення файлу рішення (Фаза 1). Агент зупиняється.",
  "Заборонено модифікувати поле decision у файлі рішення. Тільки людина заповнює це поле.",
  "Заборонено виконувати перехід, якщо значення decision не входить у перелік дозволених для цих воріт.",
  "Заборонено давати рекомендації щодо рішення у секції context. Тільки факти.",
  "Заборонено створювати файл рішення, якщо POKA-YOKE перевірки не пройдені.",
];

// =============================================================================
// 6. Helpers
// =============================================================================

/** Визначити тип воріт за поточним кроком */
function resolveGateType(step: Step): GateType | null {
  if (step === "L4") return "L4";
  if (step === "GATE1") return "GATE1";
  return null;
}

/** Отримати перелік дозволених рішень для типу воріт */
function getAllowedDecisions(gateType: GateType): readonly string[] {
  return gateType === "L4" ? L4_ALLOWED_DECISIONS : GATE1_ALLOWED_DECISIONS;
}

/** Перевірити чи рішення є допустимим */
function isValidDecision(gateType: GateType, decision: string): boolean {
  return getAllowedDecisions(gateType).includes(decision);
}

/** Побудувати шлях до артефакту з датою */
function resolveArtifactPath(gateType: GateType, date: string): string {
  return GATE_ARTIFACT_PATHS[gateType].replace("{date}", date);
}

// =============================================================================
// 7. Transition Logic (§4 Крок 7 — таблиця переходів)
// =============================================================================

/** Визначити параметри переходу за рішенням */
function resolveTransition(
  gateType: GateType,
  decision: string,
  currentState: SystemState,
): { next_step: Step; next_block: Block; state_updates: Partial<SystemState> } {
  // --- L4 transitions ---
  if (gateType === "L4") {
    switch (decision) {
      case "GO":
        return {
          next_step: "L5",
          next_block: "discovery",
          state_updates: {
            current_step: "L5",
            current_block: "discovery",
            status: "in_progress" as Status,
          },
        };
      case "REWORK":
        // Зберегти поточний discovery_brief як versioned copy
        return {
          next_step: "L2",
          next_block: "discovery",
          state_updates: {
            current_step: "L2",
            current_block: "discovery",
            status: "in_progress" as Status,
          },
        };
      case "KILL":
        return {
          next_step: currentState.current_step, // залишається на місці
          next_block: currentState.current_block,
          state_updates: {
            status: "cancelled" as Status,
          },
        };
      default:
        // Не має статися — валідація раніше
        return {
          next_step: currentState.current_step,
          next_block: currentState.current_block,
          state_updates: {},
        };
    }
  }

  // --- GATE1 transitions ---
  switch (decision) {
    case "GO":
      return {
        next_step: "D1",
        next_block: "development_cycle",
        state_updates: {
          current_block: "development_cycle" as Block,
          current_step: "D1" as Step,
          iteration: 0,
          status: "in_progress" as Status,
        },
      };
    case "REWORK":
      // Поточний план і задачі зберігаються — продовжити з незавершених задач фундаменту
      return {
        next_step: "L8",
        next_block: "foundation",
        state_updates: {
          current_block: "foundation" as Block,
          current_step: "L8" as Step,
          status: "in_progress" as Status,
        },
      };
    case "REBUILD_PLAN":
      // Поточний план скидається, формування нового плану з нуля
      return {
        next_step: "L8",
        next_block: "foundation",
        state_updates: {
          current_block: "foundation" as Block,
          current_step: "L8" as Step,
          status: "in_progress" as Status,
        },
      };
    case "REBUILD_DESCRIPTION":
      // Переформування опису продукту з нуля
      return {
        next_step: "L5",
        next_block: "discovery",
        state_updates: {
          current_block: "discovery" as Block,
          current_step: "L5" as Step,
          status: "in_progress" as Status,
        },
      };
    case "KILL":
      return {
        next_step: currentState.current_step,
        next_block: currentState.current_block,
        state_updates: {
          status: "cancelled" as Status,
        },
      };
    default:
      return {
        next_step: currentState.current_step,
        next_block: currentState.current_block,
        state_updates: {},
      };
  }
}

// =============================================================================
// 8. Phase 1 — Preparation (§4 Фаза 1)
// =============================================================================

/**
 * Фаза 1: Підготовка файлу рішення.
 * Агент створює файл рішення, заповнює контекст, оновлює state.json.
 * Після цього — ЗУПИНКА.
 */
function prepareGateDecision(input: GateDecisionInput): GatePreparationResult {
  const { state, date, contract_health } = input;

  // Крок 1: Визначити тип воріт
  const gateType = resolveGateType(state.current_step);
  if (!gateType) {
    return {
      success: false,
      gate_type: "L4",
      artifact_path: "",
      state_updates: {},
      message: "",
      error: `Поточний крок ${state.current_step} не є воротами. Очікується L4 або GATE1.`,
    };
  }

  // Крок 2: POKA-YOKE — P4: перевірка що нема незавершеного файлу рішення
  if (state.status === "awaiting_human_decision") {
    return {
      success: false,
      gate_type: gateType,
      artifact_path: "",
      state_updates: {},
      message: "",
      error:
        "P4: Вже існує незавершений файл рішення (status = awaiting_human_decision). Не можна створити новий.",
    };
  }

  // Крок 4: Побудувати шлях до артефакту
  const artifactPath = resolveArtifactPath(gateType, date);

  // Крок 6: Contract Health Warning (GATE1 only)
  let contractWarning = "";
  if (gateType === "GATE1" && contract_health?.has_mismatches) {
    contractWarning =
      "⚠️ Знайдено розбіжності контрактів. Рекомендовано REBUILD_PLAN з включенням Contract Fix етапу.";
  }

  // Крок 7: State updates
  const stateUpdates: Partial<SystemState> = {
    status: "awaiting_human_decision" as Status,
    last_artifact: artifactPath,
  };

  return {
    success: true,
    gate_type: gateType,
    artifact_path: artifactPath,
    state_updates: stateUpdates,
    message: `Файл рішення створено: ${artifactPath}. ${contractWarning} Очікую рішення людини. ЗУПИНКА.`,
  };
}

// =============================================================================
// 9. Phase 2 — Processing Decision (§4 Фаза 2)
// =============================================================================

/**
 * Фаза 2: Обробка рішення людини.
 * Зчитує файл рішення, валідує, виконує перехід.
 */
function processGateDecision(input: GateDecisionInput): GateProcessingResult {
  const { state, decision_file } = input;
  const warnings: string[] = [];

  // Крок 1-2: Визначити тип воріт
  const gateType = resolveGateType(state.current_step);
  if (!gateType) {
    return {
      success: false,
      decision: "",
      next_step: state.current_step,
      next_block: state.current_block,
      state_updates: {},
      message: "",
      warnings: [],
      error: `Поточний крок ${state.current_step} не є воротами. Очікується L4 або GATE1.`,
    };
  }

  // Крок 3: Перевірити наявність файлу рішення
  if (!decision_file) {
    return {
      success: false,
      decision: "",
      next_step: state.current_step,
      next_block: state.current_block,
      state_updates: {},
      message: `Рішення воріт не заповнене. Очікую рішення у файлі ${state.last_artifact}.`,
      warnings: [],
      error: "Файл рішення не надано.",
    };
  }

  // Крок 3 (продовження): Перевірити чи decision заповнено
  if (!decision_file.decision) {
    return {
      success: false,
      decision: "",
      next_step: state.current_step,
      next_block: state.current_block,
      state_updates: {},
      message: `Рішення воріт не заповнене. Очікую рішення у файлі ${state.last_artifact}.`,
      warnings: [],
    };
  }

  const decision = decision_file.decision as string;

  // Крок 4-5: Валідація decision проти дозволеного переліку
  if (!isValidDecision(gateType, decision)) {
    const allowed = getAllowedDecisions(gateType).join(", ");
    return {
      success: false,
      decision,
      next_step: state.current_step,
      next_block: state.current_block,
      state_updates: {},
      message: `Невідоме рішення "${decision}". Очікувані: ${allowed}.`,
      warnings: [],
      error: `Невідоме рішення "${decision}". Очікувані: ${allowed}.`,
    };
  }

  // Крок 6: Перевірка rationale (попередження, не блокує)
  if (!decision_file.rationale || decision_file.rationale.trim() === "") {
    warnings.push(
      "Поле rationale порожнє. Рекомендується заповнити перед продовженням.",
    );
  }

  // Крок 7: Виконати перехід
  const transition = resolveTransition(gateType, decision, state);

  // Крок 8: Врахувати comments
  if (decision_file.comments && decision_file.comments.trim() !== "") {
    warnings.push(`Коментарі людини: ${decision_file.comments}`);
  }

  // Крок 9: Оновити last_completed_step
  const stateUpdates: Partial<SystemState> = {
    ...transition.state_updates,
    last_completed_step: state.current_step,
  };

  // Формування повідомлення за типом рішення
  const message = buildTransitionMessage(gateType, decision, transition.next_step);

  return {
    success: true,
    decision,
    next_step: transition.next_step,
    next_block: transition.next_block,
    state_updates: stateUpdates,
    message,
    warnings,
  };
}

/** Побудувати повідомлення про перехід */
function buildTransitionMessage(
  gateType: GateType,
  decision: string,
  nextStep: Step,
): string {
  if (decision === "KILL") {
    return "Проект скасовано за рішенням людини.";
  }
  if (decision === "REWORK" && gateType === "L4") {
    return "REWORK: Discovery Brief потребує доопрацювання. Оновіть discovery_brief.md, потім змініть status на in_progress у state.json.";
  }
  if (decision === "REWORK" && gateType === "GATE1") {
    return "REWORK: Повернення до фундаменту (L8). Поточний план і задачі зберігаються — продовжити з незавершених задач.";
  }
  if (decision === "REBUILD_PLAN") {
    return "REBUILD_PLAN: Поточний план скидається. Формування нового плану з нуля (L8). Опис продукту зберігається.";
  }
  if (decision === "REBUILD_DESCRIPTION") {
    return "REBUILD_DESCRIPTION: Переформування опису продукту з нуля (L5).";
  }
  return `Рішення "${decision}" прийнято. Перехід до ${nextStep}.`;
}

// =============================================================================
// 10. Main Execute Function
// =============================================================================

/**
 * Головна точка входу. Делегує на Фазу 1 або Фазу 2 залежно від phase.
 */
function execute(input: GateDecisionInput): GateDecisionResult {
  if (input.phase === "prepare") {
    return prepareGateDecision(input);
  }
  return processGateDecision(input);
}

// =============================================================================
// 11. Validation (§6 Критерії прийнятності)
// =============================================================================

/** Валідація Фази 1 (підготовка) */
function validatePhase1Result(
  result: GatePreparationResult,
  _state?: SystemState,
): ValidationOutcome {
  const issues: string[] = [];

  // Чекліст §6 Фаза 1
  if (!result.success) {
    issues.push("Фаза 1 не завершена успішно.");
    return { valid: false, issues };
  }

  // POKA-YOKE перевірки пройдені — перевіряється у prepareGateDecision

  // Файл рішення створений у правильній папці
  if (!result.artifact_path) {
    issues.push("Файл рішення не створений (шлях порожній).");
  }

  // state.json оновлений: status = awaiting_human_decision
  if (result.state_updates.status !== "awaiting_human_decision") {
    issues.push("state_updates не містить status = awaiting_human_decision.");
  }

  return { valid: issues.length === 0, issues };
}

/** Валідація Фази 2 (обробка рішення) */
function validatePhase2Result(
  result: GateProcessingResult,
): ValidationOutcome {
  const issues: string[] = [];

  if (!result.success) {
    issues.push("Фаза 2 не завершена успішно.");
    return { valid: false, issues };
  }

  // Поле decision зчитане коректно
  if (!result.decision) {
    issues.push("Decision не зчитано.");
  }

  // Перехід виконано на правильний крок
  if (!result.next_step) {
    issues.push("next_step не визначений.");
  }

  // state.json оновлений
  if (!result.state_updates.current_step && result.decision !== "KILL") {
    issues.push("state_updates не містить current_step (для non-KILL рішень).");
  }

  return { valid: issues.length === 0, issues };
}

/** Загальна валідація результату */
function validateResult(
  result: GateDecisionResult,
  phase: "prepare" | "process",
  state?: SystemState,
): ValidationOutcome {
  if (phase === "prepare") {
    return validatePhase1Result(
      result as GatePreparationResult,
      state!,
    );
  }
  return validatePhase2Result(result as GateProcessingResult);
}

// =============================================================================
// 12. Template (§A — шаблон артефакту)
// =============================================================================

/** Параметри генерації шаблону файлу рішення */
interface GateDecisionTemplateParams {
  gate_type: GateType;
  date: string;
  iteration?: number;
  context: string;
  contract_health?: ContractHealthReport;
}

/** Генерує шаблон файлу рішення воріт */
function generateTemplate(params: GateDecisionTemplateParams): string {
  const { gate_type, date, iteration, context, contract_health } = params;

  const gateLabel = gate_type === "L4" ? "L4" : "GATE 1";
  const optionsList = gate_type === "L4"
    ? `- GO — перейти до формування опису продукту (L5)
- REWORK — повернути discovery_brief на доопрацювання (L2)
- KILL — скасувати проект`
    : `- GO — перейти до кола розвитку (D1).
- REWORK — повернути фундамент на допрацювання (L8), зберігаючи поточний план і задачі
- REBUILD_PLAN — скинути план і переформувати з нуля (L8)
- REBUILD_DESCRIPTION — переформувати опис продукту (L5)
- KILL — скасувати проект`;

  // Contract Health section (GATE1 only)
  let contractSection = "";
  if (gate_type === "GATE1") {
    let contractTable = `| Endpoint | Server route | Client component | Verdict |
|----------|-------------|-----------------|---------|
`;
    if (contract_health && contract_health.entries.length > 0) {
      for (const entry of contract_health.entries) {
        const verdictText =
          entry.verdict === "MISMATCH"
            ? `MISMATCH: ${entry.details || ""}`
            : "MATCH";
        contractTable += `| ${entry.endpoint} | ${entry.server_route} | ${entry.client_component} | ${verdictText} |\n`;
      }
    } else {
      contractTable += `| [POST /api/...] | [file.js] | [Component.jsx] | MATCH / MISMATCH: [деталі] |\n`;
    }

    const mismatchWarning =
      contract_health?.has_mismatches
        ? "\n⚠️ Знайдено розбіжності контрактів. Рекомендовано REBUILD_PLAN з включенням Contract Fix етапу."
        : "";

    contractSection = `
---

## Contract Health (GATE 1 тільки — заповнюється агентом)

${contractTable}${mismatchWarning}
`;
  }

  return `# Gate Decision: ${gateLabel}

> **Дата:** ${date}
> **Крок циклу:** ${gateLabel}
> **Ітерація:** ${iteration ?? "N/A"}

---

## Контекст (заповнюється агентом)

${context}
${contractSection}
---

## Рішення (заповнюється людиною)

**Дозволені варіанти:**
${optionsList}

decision:
rationale:
comments:
`;
}

// =============================================================================
// 13. Edge Cases
// =============================================================================

const EDGE_CASES: string[] = [
  "Людина ввела невалідне рішення → повідомити допустимі варіанти, не виконувати перехід.",
  "Файл рішення не знайдено при старті Фази 2 → залишитися в awaiting_human_decision.",
  "GATE1 REWORK vs REBUILD_PLAN: REWORK зберігає план і задачі, REBUILD_PLAN скидає план.",
  "Поле rationale порожнє → попередити, але НЕ блокувати перехід.",
  "Поле comments заповнене → передати як контекст для наступного кроку.",
  "KILL на будь-яких воротах → status = cancelled, подальші команди (крім status) блокуються.",
];

// =============================================================================
// 14. Exports
// =============================================================================

export {
  // Головний алгоритм
  execute,
  // Під-алгоритми
  prepareGateDecision,
  processGateDecision,
  // Transition
  resolveTransition,
  // Валідація
  validateResult,
  validatePhase1Result,
  validatePhase2Result,
  // Хелпери
  resolveGateType,
  getAllowedDecisions,
  isValidDecision,
  resolveArtifactPath,
  buildTransitionMessage,
  // Template
  generateTemplate,
  // Дані
  PRECONDITIONS,
  ALGORITHM,
  CONSTRAINTS,
  EDGE_CASES,
  L4_ALLOWED_DECISIONS,
  GATE1_ALLOWED_DECISIONS,
  GATE_ARTIFACT_PATHS,
  GATE_PREVIOUS_STEP,
  GATE_REQUIRED_ARTIFACTS,
};

// Re-export типів
export type {
  GateType,
  GateDecisionInput,
  GateDecisionResult,
  GatePreparationResult,
  GateProcessingResult,
  ContractHealthEntry,
  ContractHealthReport,
  GateDecisionTemplateParams,
  ValidationOutcome,
};
