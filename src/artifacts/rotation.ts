// =============================================================================
// Artifact Rotation — D1 (all keys), V0 (V-keys), S1 (S-keys)
// Конвертовано з: control_center/docs/system_cycle.md
//   → D1. Ротація артефактів (повна ротація при CONTINUE/AMEND_SPEC)
//   → V0. Ротація V-ключів (при повторному вході у V-блок)
//   → S1. Ротація S-ключів (при повторному запуску S-блоку)
// =============================================================================

import type {
  SystemState,
  ArtifactKey,
} from "../types";

import {
  ALL_ARTIFACT_KEYS,
  V_BLOCK_ARTIFACT_KEYS,
  S_BLOCK_ARTIFACT_KEYS,
} from "../types";

import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Rotation Key Sets
// =============================================================================

/**
 * D1 rotation: всі 12 ключів.
 * З system_cycle.md → D1: "Зберіг./обнулив ВСІ ключі"
 */
export const D1_ROTATION_KEYS: ArtifactKey[] = ALL_ARTIFACT_KEYS;

/**
 * V0 rotation: тільки 4 V-ключі.
 * З system_cycle.md → V0: "V0 ротує тільки V-ключі"
 */
export const V0_ROTATION_KEYS: ArtifactKey[] = V_BLOCK_ARTIFACT_KEYS;

/**
 * S1 rotation: тільки 2 S-ключі.
 * З system_cycle.md → S1: "агент ротує тільки S-ключі"
 */
export const S1_ROTATION_KEYS: ArtifactKey[] = S_BLOCK_ARTIFACT_KEYS;

// =============================================================================
// Archive directory mapping per artifact key
// =============================================================================

/**
 * Маппінг ключ артефакту → папка архіву.
 * Не всі ключі мають архівну папку (напр. security_scan зберігається в issues/done).
 * Ключі без архіву пропускаються при архівації prev_cycle.
 *
 * З system_cycle.md → D1: "перемістити файл у відповідну папку archive/"
 * + з розділу "Архів (папки archive/ для застарілих артефактів)"
 */
const KEY_ARCHIVE_DIRECTORY: Partial<Record<ArtifactKey, string>> = {
  observe_report: "audit/observe/archive",
  plan: "plans/done/archive",
  plan_completion: "audit/plan_completion/archive",
  hansei: "audit/hansei/archive",
  goals_check: "audit/goals_check/archive",
  gate_decision: "audit/gate_decisions/archive",
  ui_review: "audit/ui_reviews/archive",
  acceptance_report: "audit/acceptance_reports/archive",
  hansei_audit: "audit/hansei/archive",
  validation_conclusions: "audit/validation_conclusions/archive",
  // security_scan та s_block_decision — переміщуються через issue/done, не мають окремого archive
};

// =============================================================================
// Rotation Result
// =============================================================================

export interface RotationResult {
  /** Файли які були переміщені в архів */
  archived: string[];
  /** Ключі де файл не знайдено або немає архівної папки — пропущено без помилки */
  skipped: string[];
  /** Помилки при переміщенні */
  errors: string[];
}

// =============================================================================
// Core rotation logic
// =============================================================================

/**
 * Виконує ротацію артефактів за вказаним набором ключів.
 *
 * Алгоритм (однаковий для D1/V0/S1, відрізняються лише ключі):
 * 1. Архівація: для кожного не-null ключа у prev_cycle_artifacts →
 *    перемістити файл у відповідну папку archive/.
 *    Якщо файл не існує — пропустити без помилки.
 * 2. Копіювання: artifacts[key] → prev_cycle_artifacts[key]
 * 3. Обнуління: artifacts[key] → null
 *
 * Мутує та повертає оновлений state.
 */
export function rotateArtifacts(
  state: SystemState,
  keys: ArtifactKey[],
  controlCenterPath: string,
): { state: SystemState; result: RotationResult } {
  const result: RotationResult = { archived: [], skipped: [], errors: [] };

  // Крок 1: Архівація prev_cycle_artifacts → archive/
  for (const key of keys) {
    const prevPath = state.prev_cycle_artifacts[key];
    if (prevPath === null) {
      // Немає попереднього артефакту — нічого архівувати
      continue;
    }

    const archiveDir = KEY_ARCHIVE_DIRECTORY[key];
    if (!archiveDir) {
      // Немає визначеної архівної папки — пропустити
      result.skipped.push(key);
      continue;
    }

    try {
      moveToArchive(prevPath, archiveDir, controlCenterPath);
      result.archived.push(prevPath);
    } catch {
      // "Якщо файл не існує — пропустити без помилки" (system_cycle.md → D1)
      result.skipped.push(key);
    }
  }

  // Крок 2: artifacts → prev_cycle_artifacts (копіювання значень)
  for (const key of keys) {
    state.prev_cycle_artifacts[key] = state.artifacts[key];
  }

  // Крок 3: Очистити artifacts (встановити null)
  for (const key of keys) {
    state.artifacts[key] = null;
  }

  return { state, result };
}

// =============================================================================
// D1 Rotation — повна ротація (CONTINUE / AMEND_SPEC)
// =============================================================================

/**
 * D1 ротація: повна ротація всіх 12 ключів.
 *
 * Викликається на D1 (Cycle Checkpoint) після отримання рішення
 * CONTINUE або AMEND_SPEC, перед початком нового D-циклу.
 *
 * Після ротації реєструє gate_decision (рішення Mini-GATE поточного циклу)
 * в artifacts.gate_decision — як описано в system_cycle.md D1.
 */
export function rotateD1(
  state: SystemState,
  controlCenterPath: string,
  gateDecisionPath: string | null,
): { state: SystemState; result: RotationResult } {
  const { state: updatedState, result } = rotateArtifacts(
    state,
    D1_ROTATION_KEYS,
    controlCenterPath,
  );

  // Зареєструвати gate_decision (рішення Mini-GATE) в artifacts
  // "Зареєструвати gate_decision (рішення Mini-GATE поточного циклу) в artifacts.gate_decision"
  if (gateDecisionPath) {
    updatedState.artifacts.gate_decision = gateDecisionPath;
  }

  return { state: updatedState, result };
}

// =============================================================================
// V0 Rotation — V-ключі тільки (при повторному вході у V-блок)
// =============================================================================

/**
 * V0 ротація: тільки 4 V-ключі.
 *
 * Викликається на V0 при повторному вході у V-блок (validation_attempts > 0).
 * D-ключі залишаються незмінними — це дозволяє V1-аудитору порівняти нові
 * результати з попередніми через prev_cycle_artifacts.
 *
 * Розмежування ротацій: D1 ротує всі ключі; V0 ротує тільки V-ключі.
 * Ці ротації не перетинаються і обидві потрібні.
 */
export function rotateV0(
  state: SystemState,
  controlCenterPath: string,
): { state: SystemState; result: RotationResult } {
  return rotateArtifacts(state, V0_ROTATION_KEYS, controlCenterPath);
}

// =============================================================================
// S1 Rotation — S-ключі тільки (при повторному запуску S-блоку)
// =============================================================================

/**
 * S1 ротація: тільки 2 S-ключі (security_scan, s_block_decision).
 *
 * Викликається на S1 при повторному запуску S-блоку.
 *
 * Примітка: S1 ротація не має архівації prev_cycle_artifacts →
 * archive, лише копіювання artifacts → prev_cycle_artifacts
 * та обнуління artifacts. Це тому що security_scan та s_block_decision
 * не мають окремих архівних папок у KEY_ARCHIVE_DIRECTORY.
 */
export function rotateS1(
  state: SystemState,
  controlCenterPath: string,
): { state: SystemState; result: RotationResult } {
  return rotateArtifacts(state, S1_ROTATION_KEYS, controlCenterPath);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Переміщує файл з поточного шляху в архівну папку.
 * Створює архівну папку якщо не існує.
 * Кидає помилку якщо файл не існує (ловиться і трактується як skip).
 */
function moveToArchive(
  filePath: string,
  archiveDir: string,
  controlCenterPath: string,
): void {
  // Шляхи артефактів у state.json мають вигляд "control_center/audit/..."
  // controlCenterPath вже вказує на .../control_center
  // Тому стрипаємо "control_center/" з filePath щоб уникнути подвійного шляху
  const normalizedPath = filePath.replace(/^control_center[\\/]/, "");
  const absoluteSource = path.resolve(controlCenterPath, normalizedPath);
  const absoluteArchiveDir = path.resolve(controlCenterPath, archiveDir);
  const fileName = path.basename(absoluteSource);
  const absoluteTarget = path.join(absoluteArchiveDir, fileName);

  if (!fs.existsSync(absoluteSource)) {
    throw new Error(`File not found: ${absoluteSource}`);
  }

  // Створити архівну папку якщо не існує
  if (!fs.existsSync(absoluteArchiveDir)) {
    fs.mkdirSync(absoluteArchiveDir, { recursive: true });
  }

  fs.renameSync(absoluteSource, absoluteTarget);
}

/**
 * Перевіряє чи потрібна V0 ротація (validation_attempts > 0).
 * Використовується для визначення чи це повторний вхід у V-блок.
 */
export function isV0RotationNeeded(state: SystemState): boolean {
  return state.validation_attempts > 0;
}

/**
 * Повертає список ключів для ротації за типом кроку.
 * Зручний диспетчер для виклику з state-machine.
 */
export function getRotationKeysForStep(
  step: "D1" | "V0" | "S1",
): ArtifactKey[] {
  switch (step) {
    case "D1":
      return D1_ROTATION_KEYS;
    case "V0":
      return V0_ROTATION_KEYS;
    case "S1":
      return S1_ROTATION_KEYS;
  }
}
