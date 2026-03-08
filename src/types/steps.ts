// =============================================================================
// Steps — визначення кроків, ролі, preconditions
// =============================================================================

import type { Block, Step, ArtifactKey } from "./base";
import type { SystemState } from "./state";

export type { Block, Step } from "./base";

// --- Тип кроку ---

export type StepType =
  | "autonomous"           // Агент виконує самостійно
  | "collaborative"        // Людина + ШІ разом
  | "human_decision"       // Тільки людина (ворота)
  | "automatic_decision";  // Автоматичне рішення (V2)

// --- Ролі агента ---

export interface AgentRole {
  id: AgentRoleId;
  emoji: string;
  name: string;
  directive: string;
}

export type AgentRoleId =
  | "architect"
  | "programmer"
  | "researcher"
  | "devil_advocate"
  | "surgeon"
  | "notary";

export const AGENT_ROLES: Record<AgentRoleId, AgentRole> = {
  architect: {
    id: "architect",
    emoji: "📐",
    name: "Архітектор",
    directive: "Обирай нудне і перевірене, плануй тестування ДО коду, мінімум залежностей.",
  },
  programmer: {
    id: "programmer",
    emoji: "🔧",
    name: "Програміст",
    directive: "\"Готово\" = працює + тестовано + edge cases. Кожна зміна мінімальна.",
  },
  researcher: {
    id: "researcher",
    emoji: "🎨",
    name: "Дослідник",
    directive: "Генеруй 3-5 варіантів, не підтакуй, дані > інтуїція.",
  },
  devil_advocate: {
    id: "devil_advocate",
    emoji: "🔍",
    name: "Адвокат диявола",
    directive: "Ти вимогливий покупець, не знаєш історії розробки. PASS потребує доказу з runtime.",
  },
  surgeon: {
    id: "surgeon",
    emoji: "🛡️",
    name: "Хірург",
    directive: "Одна CVE = одна задача. Мінімальні зміни. Не рефактори \"заодно\".",
  },
  notary: {
    id: "notary",
    emoji: "✅",
    name: "Нотаріус",
    directive: "Кожен пункт бінарний: pass/fail. Не виправляй — фіксуй як блокер.",
  },
};

// --- POKA-YOKE: типи перевірок передумов ---

export type PreconditionType =
  | "file_exists"
  | "dir_empty"
  | "dir_not_empty"
  | "artifact_registered"
  | "artifact_null"
  | "step_completed"
  | "state_field";

export interface PreconditionCheck {
  type: PreconditionType;
  /** Шлях до файлу/папки (відносний від project_root) */
  path?: string;
  /** Ключ у state.json.artifacts */
  artifact_key?: ArtifactKey;
  /** Крок що має бути завершений */
  step?: Step;
  /** Поле state.json для перевірки */
  field?: keyof SystemState;
  /** Очікуване значення поля */
  expected_value?: unknown;
  /** Людиночитабельний опис перевірки */
  description: string;
}

// --- Вхідні дані кроку ---

export type InputSource = "artifact" | "file" | "directory" | "state";

export interface InputReference {
  source: InputSource;
  /** Ключ артефакту (якщо source = "artifact") */
  artifact_key?: ArtifactKey;
  /** Фіксований шлях (якщо source = "file" | "directory") */
  path?: string;
  /** Поле state.json (якщо source = "state") */
  field?: keyof SystemState;
  /** Опис для агента */
  description: string;
  /** Чи обов'язковий вхід */
  required: boolean;
}

// --- Алгоритм кроку ---

export interface AlgorithmStep {
  order: number;
  instruction: string;
  substeps?: string[];
  /** Контрактна перевірка (напр. endpoint vs behavior_spec) */
  contract_check?: string;
}

// --- Вихідний артефакт ---

export interface ArtifactOutput {
  /** Ключ для реєстрації в state.json.artifacts (null = не реєструється) */
  registry_key: ArtifactKey | null;
  /** Шаблон шляху. Плейсхолдери: {date}, {cycle}, {context} */
  path_pattern: string;
  /** Ім'я шаблону для генерації (якщо є) */
  template_id?: string;
}

// --- Переходи ---

export interface Transition {
  /** Умова переходу (людиночитабельна) */
  condition: string;
  /** Цільовий крок */
  target: Step;
  /** Цільовий блок (якщо змінюється) */
  target_block?: Block;
  /** Оновлення полів state.json при переході */
  state_updates?: Partial<SystemState>;
}

// --- Повне визначення кроку ---

export interface StepDefinition {
  /** Ідентифікатор кроку */
  id: Step;
  /** Блок до якого належить */
  block: Block;
  /** Назва кроку */
  name: string;
  /** Тип кроку */
  type: StepType;
  /** Роль агента на цьому кроці */
  role: AgentRoleId;
  /** Призначення кроку (одне речення) */
  purpose: string;
  /** Стандарти що використовуються (вбудовані в код оркестратора) */
  standards: string[];
  /** POKA-YOKE передумови */
  preconditions: PreconditionCheck[];
  /** Вхідні дані */
  inputs: InputReference[];
  /** Алгоритм виконання */
  algorithm: AlgorithmStep[];
  /** Обмеження / заборони */
  constraints: string[];
  /** Вихідний артефакт (null = крок не створює артефакту) */
  artifact: ArtifactOutput | null;
  /** Додаткові артефакти (деякі кроки створюють більше одного) */
  additional_artifacts?: ArtifactOutput[];
  /** Можливі переходи після завершення */
  transitions: Transition[];
  /** Чи потрібна ізоляція контексту */
  isolation_required: boolean;
  /** Повідомлення ізоляції (якщо isolation_required = true) */
  isolation_message?: string;
  /**
   * Межа сесії: після завершення цього кроку агент ПОВИНЕН зупинитись
   * і чекати нову сесію. Аналогічно awaiting_human_decision для гейтів,
   * але причина — виснаження контекстного вікна, а не рішення людини.
   * Важкі кроки (D5, D7-D9, L10, V-block, S3) = true.
   */
  session_boundary?: boolean;
  /** Опис ротації артефактів (якщо крок виконує ротацію) */
  rotation?: ArtifactRotation;
}

// --- Ротація артефактів ---

export interface ArtifactRotation {
  /** Опис що ротується */
  description: string;
  /** Ключі що архівуються з prev_cycle_artifacts */
  archive_keys: ArtifactKey[];
  /** Ключі що копіюються з artifacts → prev_cycle_artifacts */
  copy_to_prev_keys: ArtifactKey[];
  /** Ключі що обнулюються в artifacts */
  nullify_keys: ArtifactKey[];
}

// --- Маппінг блоків ---

export const BLOCK_NAMES: Record<Block, string> = {
  discovery: "Дослідження (Discovery)",
  foundation: "Фундамент (Foundation)",
  development_cycle: "Коло розвитку (Development Cycle)",
  validation_cycle: "Коло валідації (Validation Cycle)",
  security_fix_cycle: "Security Fix Cycle (S-блок)",
  linear_exit: "Лінійний вихід (Linear Exit)",
};

// --- Маппінг назв кроків ---

export const STEP_NAMES: Record<Step, string> = {
  // Discovery
  L1: "PROJECT INIT — Ініціалізація проєкту",
  L2: "DISCOVERY — Дослідження",
  L3: "DESIGN BRIEF — Дизайн-бриф",
  L3b: "DESIGN IDENTITY — Візуальна ідентичність",
  L4: "GO / REWORK / KILL — Ворота входу",
  L5: "Формування опису продукту",
  L6: "DESIGN SPECIFICATION — Дизайн-специфікація",
  L7: "BEHAVIOR SPECIFICATION — Поведінкова специфікація",
  // Foundation
  L8: "Нульовий план",
  L9: "Формування задач",
  L10: "Виконання задач",
  L10b: "Верифікація плану фундаменту",
  L11: "Завершення плану",
  L12: "HANSEI — Рефлексія",
  L13: "Формування чеклісту (Completion Checklist)",
  GATE1: "Ворота фундаменту (GATE 1)",
  // Development Cycle
  D1: "Контрольна точка циклу (Cycle Checkpoint)",
  D2: "OBSERVE — Перевірка актуальності",
  D3: "План розвитку",
  D4: "Формування задач",
  D5: "Виконання задач",
  D6: "Верифікація повноти плану",
  D7: "Завершення плану",
  D8: "HANSEI — Рефлексія",
  D9: "Перевірка цілей + Mini-GATE",
  // Validation
  V0: "UI Baseline Review",
  V0_5: "Smoke Test — UI Interaction Verifier",
  V1: "Незалежний аудит",
  V2: "Рішення аудиту",
  V3: "HANSEI + Висновки валідації",
  // Security
  S1: "Зчитати issue та стандарт",
  S2: "Сформувати задачі",
  S3: "Виконання задач",
  S4: "Внутрішній аудит",
  S5: "Закриття та рішення людини",
  // Exit
  E1: "RELEASE READINESS — Чекліст готовності",
  E2: "ПРОДУКТ ГОТОВИЙ",
};
