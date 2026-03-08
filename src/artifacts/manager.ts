// =============================================================================
// Artifact Manager — Registration, path resolution, naming, validation
// Конвертовано з: control_center/docs/system_cycle.md
//   → "Реєстр артефактів" (повна таблиця 30+ артефактів)
//   → "Конвенція іменування артефактів" (шаблони імен)
//   → "ПРАВИЛО АРТЕФАКТІВ" (єдине джерело правди — state.json → artifacts)
//   → "Інваріанти системи" (IMMUTABLE_PATHS)
// =============================================================================

import type {
  SystemState,
  ArtifactKey,
  ArtifactOutput,
} from "../types";

import {
  ArtifactNamingRule,
  ARTIFACT_NAMING_RULES,
  IMMUTABLE_PATHS,
  formatDateForArtifact,
  resolveArtifactName,
} from "../types";

import * as path from "path";

// =============================================================================
// Artifact Path Resolution
// =============================================================================

/**
 * Параметри для побудови шляху до нового артефакту.
 * Відповідають плейсхолдерам у name_pattern: {date}, {cycle}, {context}, {description}, {n}.
 */
export interface ArtifactPathParams {
  date?: string;
  cycle?: number;
  context?: string;
  description?: string;
  n?: number;
}

/**
 * Знаходить правило іменування за типом артефакту.
 * Повертає перше правило з ARTIFACT_NAMING_RULES що збігається по type.
 *
 * З system_cycle.md → "Конвенція іменування артефактів":
 * Кожен тип артефакту має фіксований шаблон та папку.
 */
export function lookupNamingRule(type: string): ArtifactNamingRule | undefined {
  return ARTIFACT_NAMING_RULES.find((rule) => rule.type === type);
}

/**
 * Знаходить правило іменування за ключем реєстрації (registry_key).
 * Повертає перше правило з відповідним registry_key.
 *
 * Деякі ключі мають кілька правил (напр. gate_decision → gate + mini_gate).
 * Для вибору конкретного типу використовуй lookupNamingRule(type).
 */
export function findRuleForKey(key: ArtifactKey): ArtifactNamingRule | undefined {
  return ARTIFACT_NAMING_RULES.find((rule) => rule.registry_key === key);
}

/**
 * Будує повний шлях до нового артефакту на основі ArtifactOutput з StepDefinition.
 *
 * Використовує path_pattern з StepDefinition.artifact для розгортання плейсхолдерів.
 * Якщо дата не вказана — генерується автоматично (formatDateForArtifact).
 *
 * З system_cycle.md → "Конвенція іменування артефактів":
 * Шаблон: [тип]_[контекст]_DD.MM.YY-HH-MM.md
 */
export function resolveArtifactPathFromOutput(
  output: ArtifactOutput,
  params: ArtifactPathParams,
): string {
  const dateStr = params.date ?? formatDateForArtifact();
  return resolveArtifactName(output.path_pattern, {
    date: dateStr,
    cycle: params.cycle,
    context: params.context,
    description: params.description,
    n: params.n,
  });
}

/**
 * Будує повний шлях до нового артефакту на основі type з ARTIFACT_NAMING_RULES.
 *
 * Повертає шлях відносний від control_center/, включаючи directory.
 * Наприклад: "plans/active/plan_foundation_11.02.26.md"
 *
 * Кидає помилку якщо тип не знайдено у правилах.
 */
export function resolveNewArtifactPath(
  type: string,
  params: ArtifactPathParams,
): string {
  const rule = lookupNamingRule(type);
  if (!rule) {
    throw new Error(`Unknown artifact type: "${type}". No naming rule found.`);
  }

  const dateStr = params.date ?? formatDateForArtifact();
  const fileName = resolveArtifactName(rule.name_pattern, {
    date: dateStr,
    cycle: params.cycle,
    context: params.context,
    description: params.description,
    n: params.n,
  });

  // directory + fileName → повний відносний шлях від control_center/
  return `${rule.directory}/${fileName}`;
}

// =============================================================================
// Artifact Registration (state.json → artifacts)
// =============================================================================

/**
 * Реєструє артефакт у state.artifacts[key].
 *
 * З system_cycle.md → "ПРАВИЛО АРТЕФАКТІВ":
 * Єдине джерело правди — state.json → artifacts.
 * Після створення артефакту його шлях записується сюди.
 *
 * Також оновлює last_artifact для трасування.
 *
 * Мутує state і повертає оновлений.
 */
export function registerArtifact(
  state: SystemState,
  key: ArtifactKey,
  artifactPath: string,
): SystemState {
  state.artifacts[key] = artifactPath;
  state.last_artifact = artifactPath;
  return state;
}

/**
 * Оновлює last_artifact без зміни artifacts registry.
 * Для артефактів без registry_key (наприклад, issues, tasks, release_checklist).
 */
export function updateLastArtifact(
  state: SystemState,
  artifactPath: string,
): SystemState {
  state.last_artifact = artifactPath;
  return state;
}

/**
 * Реєструє артефакт з ArtifactOutput: якщо registry_key не null — записує в artifacts.
 * Завжди оновлює last_artifact.
 *
 * Це основний метод реєстрації, що використовується після створення артефакту.
 */
export function registerArtifactFromOutput(
  state: SystemState,
  output: ArtifactOutput,
  resolvedPath: string,
): SystemState {
  state.last_artifact = resolvedPath;
  if (output.registry_key !== null) {
    state.artifacts[output.registry_key] = resolvedPath;
  }
  return state;
}

// =============================================================================
// Artifact Retrieval (state.json → artifacts)
// =============================================================================

/**
 * Повертає шлях до артефакту з state.artifacts[key], або null якщо не зареєстрований.
 *
 * З system_cycle.md → "ПРАВИЛО АРТЕФАКТІВ":
 * Агент НІКОЛИ не сканує папки для пошуку артефактів.
 * Єдине джерело правди — state.json → artifacts.
 * Якщо ключ = null — артефакт ще не створено.
 */
export function getArtifactPath(
  state: SystemState,
  key: ArtifactKey,
): string | null {
  return state.artifacts[key];
}

/**
 * Повертає шлях до артефакту або кидає помилку якщо не зареєстрований.
 * Для кроків де артефакт є обов'язковою передумовою.
 */
export function requireArtifactPath(
  state: SystemState,
  key: ArtifactKey,
): string {
  const artifactPath = state.artifacts[key];
  if (artifactPath === null) {
    throw new Error(
      `Required artifact "${key}" not registered in state.artifacts. ` +
      `Agent must not scan directories — only state.json is the source of truth.`,
    );
  }
  return artifactPath;
}

/**
 * Повертає шлях до артефакту попереднього циклу, або null.
 * Використовується для порівняння поточних результатів з попередніми.
 */
export function getPrevCycleArtifactPath(
  state: SystemState,
  key: ArtifactKey,
): string | null {
  return state.prev_cycle_artifacts[key];
}

// =============================================================================
// Artifact Registry Inspection
// =============================================================================

/**
 * Повертає всі зареєстровані (не-null) артефакти поточного циклу.
 */
export function getRegisteredArtifacts(
  state: SystemState,
): Array<{ key: ArtifactKey; path: string }> {
  const result: Array<{ key: ArtifactKey; path: string }> = [];
  const keys = Object.keys(state.artifacts) as ArtifactKey[];
  for (const key of keys) {
    const value = state.artifacts[key];
    if (value !== null) {
      result.push({ key, path: value });
    }
  }
  return result;
}

/**
 * Повертає кількість зареєстрованих артефактів у поточному циклі.
 */
export function countRegisteredArtifacts(state: SystemState): number {
  return getRegisteredArtifacts(state).length;
}

/**
 * Повертає всі зареєстровані артефакти попереднього циклу.
 */
export function getPrevCycleRegisteredArtifacts(
  state: SystemState,
): Array<{ key: ArtifactKey; path: string }> {
  const result: Array<{ key: ArtifactKey; path: string }> = [];
  const keys = Object.keys(state.prev_cycle_artifacts) as ArtifactKey[];
  for (const key of keys) {
    const value = state.prev_cycle_artifacts[key];
    if (value !== null) {
      result.push({ key, path: value });
    }
  }
  return result;
}

// =============================================================================
// Immutable Path Protection
// =============================================================================

/**
 * Перевіряє чи шлях є незмінним (immutable).
 *
 * З system_cycle.md → "Інваріанти системи":
 * Будь-яка спроба змінити незмінний файл — критична помилка.
 * Агент зобов'язаний зупинитися та ескалювати.
 *
 * IMMUTABLE_PATHS включають docs/, final_view/ (після створення), control_center_code/src/.
 */
export function isImmutablePath(filePath: string): boolean {
  // Нормалізуємо шлях для порівняння
  const normalized = filePath.replace(/\\/g, "/");
  return IMMUTABLE_PATHS.some((immutable) => {
    const normalizedImmutable = immutable.replace(/\\/g, "/");
    // Якщо immutable закінчується на "/" — це директорія, перевіряємо prefix
    if (normalizedImmutable.endsWith("/")) {
      return normalized.startsWith(normalizedImmutable) ||
        normalized.startsWith(normalizedImmutable.slice(0, -1));
    }
    // Інакше — точний збіг
    return normalized === normalizedImmutable;
  });
}

/**
 * Перевіряє шлях і кидає помилку якщо він незмінний.
 * Використовується перед будь-яким записом файлу.
 */
export function assertNotImmutable(filePath: string): void {
  if (isImmutablePath(filePath)) {
    throw new Error(
      `CRITICAL: Attempt to modify immutable path "${filePath}". ` +
      `This is a system invariant violation. Agent must STOP and escalate.`,
    );
  }
}

// =============================================================================
// Artifact Validation
// =============================================================================

/** Результат валідації реєстру артефактів */
export interface ArtifactValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Валідує консистентність реєстру артефактів у state.
 *
 * Перевірки:
 * 1. Всі 12 ключів присутні в artifacts та prev_cycle_artifacts.
 * 2. Шляхи артефактів не порожні (якщо не null).
 * 3. Шляхи артефактів не вказують на незмінні файли.
 * 4. last_artifact відповідає одному з зареєстрованих артефактів
 *    або є окремим (issue, task тощо).
 */
export function validateArtifactRegistry(
  state: SystemState,
): ArtifactValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const expectedKeys: ArtifactKey[] = [
    "observe_report",
    "plan",
    "plan_completion",
    "hansei",
    "goals_check",
    "gate_decision",
    "ui_review",
    "acceptance_report",
    "hansei_audit",
    "validation_conclusions",
    "security_scan",
    "s_block_decision",
  ];

  // Перевірка 1: всі 12 ключів присутні
  for (const key of expectedKeys) {
    if (!(key in state.artifacts)) {
      errors.push(`Missing key "${key}" in state.artifacts`);
    }
    if (!(key in state.prev_cycle_artifacts)) {
      errors.push(`Missing key "${key}" in state.prev_cycle_artifacts`);
    }
  }

  // Перевірка 2: шляхи не порожні рядки
  for (const key of expectedKeys) {
    const value = state.artifacts[key];
    if (value !== null && value.trim().length === 0) {
      errors.push(`Artifact "${key}" has empty path (should be null or non-empty string)`);
    }
    const prevValue = state.prev_cycle_artifacts[key];
    if (prevValue !== null && prevValue.trim().length === 0) {
      errors.push(`Prev cycle artifact "${key}" has empty path`);
    }
  }

  // Перевірка 3: шляхи артефактів не вказують на незмінні файли
  for (const key of expectedKeys) {
    const value = state.artifacts[key];
    if (value !== null && isImmutablePath(value)) {
      errors.push(
        `Artifact "${key}" points to immutable path: "${value}". This is a critical error.`,
      );
    }
  }

  // Перевірка 4: last_artifact не порожній (warning, не error)
  if (
    state.last_artifact !== null &&
    state.last_artifact.trim().length === 0
  ) {
    warnings.push("last_artifact is an empty string (should be null or a valid path)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// Full Artifact Path (with control_center base)
// =============================================================================

/**
 * Розгортає відносний шлях артефакту в абсолютний, базуючись на controlCenterPath.
 *
 * Артефакти зберігаються як відносні шляхи від control_center/.
 * Цей метод перетворює їх в абсолютні для файлових операцій.
 */
export function resolveAbsolutePath(
  controlCenterPath: string,
  relativePath: string,
): string {
  return path.resolve(controlCenterPath, relativePath);
}

/**
 * Будує абсолютний шлях для нового артефакту за типом.
 *
 * Комбінує resolveNewArtifactPath + resolveAbsolutePath.
 * Зручний метод для створення файлу.
 */
export function resolveNewArtifactAbsolutePath(
  controlCenterPath: string,
  type: string,
  params: ArtifactPathParams,
): { relativePath: string; absolutePath: string } {
  const relativePath = resolveNewArtifactPath(type, params);
  const absolutePath = resolveAbsolutePath(controlCenterPath, relativePath);
  return { relativePath, absolutePath };
}
