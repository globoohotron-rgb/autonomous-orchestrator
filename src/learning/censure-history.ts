// =============================================================================
// Censure History — persistent storage для CENSURE_BLOCKED violations
//
// OPT-5: Міжсесійна пам'ять порушень. Зберігає історію цензурних блокувань
// у censure_history.json. Використовується OPT-2 (censure hints) для
// генерації проактивних підказок агенту.
//
// OPT-16: Project-scoped history. Формат v2:
//   { global: [...], projects: { [project_id]: [...] }, version: 2 }
// Backward compatible: flat array migrates to global.
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig, Step } from "../types";

// =============================================================================
// Constants
// =============================================================================

const HISTORY_FILENAME = "censure_history.json";
const MAX_ENTRIES_PER_SCOPE = 20;

// =============================================================================
// Types
// =============================================================================

export interface CensureHistoryEntry {
  cycle: number;
  timestamp: string;
  /** Крок на якому відбулося блокування (optional for backward compat) */
  step?: Step;
  violations: Array<{ rule_id: string; name: string }>;
}

/** OPT-16: Project-scoped store format (v2) */
export interface CensureHistoryStore {
  global: CensureHistoryEntry[];
  projects: Record<string, CensureHistoryEntry[]>;
  version: 2;
}

// =============================================================================
// getHistoryPath — шлях до censure_history.json
// =============================================================================

function getHistoryPath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", HISTORY_FILENAME);
}

// =============================================================================
// OPT-16: Migration — flat array (v1) → scoped store (v2)
// =============================================================================

export function migrateIfNeeded(raw: unknown): CensureHistoryStore {
  // v1: flat array → migrate to global
  if (Array.isArray(raw)) {
    return { global: raw, projects: {}, version: 2 };
  }
  // v2: already scoped store
  if (raw && typeof raw === "object" && (raw as any).version === 2) {
    return raw as CensureHistoryStore;
  }
  // Unknown format → empty store
  return { global: [], projects: {}, version: 2 };
}

// =============================================================================
// loadStore — завантажити повний store (internal)
// =============================================================================

export function loadStore(config: OrchestratorConfig): CensureHistoryStore {
  const filePath = getHistoryPath(config);

  if (!fs.existsSync(filePath)) {
    return { global: [], projects: {}, version: 2 };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return migrateIfNeeded(parsed);
  } catch {
    return { global: [], projects: {}, version: 2 };
  }
}

// =============================================================================
// saveStore — зберегти store (internal)
// =============================================================================

function saveStore(config: OrchestratorConfig, store: CensureHistoryStore): void {
  const filePath = getHistoryPath(config);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// =============================================================================
// loadCensureHistory — завантажити історію для конкретного проєкту
//
// OPT-16: Повертає записи для projectName + global (merged).
// Без projectName → тільки global (backward compat).
// =============================================================================

export function loadCensureHistory(
  config: OrchestratorConfig,
  projectName?: string,
): CensureHistoryEntry[] {
  const store = loadStore(config);

  if (!projectName) {
    return store.global;
  }

  const projectEntries = store.projects[projectName] ?? [];
  return [...store.global, ...projectEntries];
}

// =============================================================================
// appendCensureBlock — додати новий запис блокування
//
// OPT-16: Записує в project scope якщо projectName вказано, інакше в global.
// Автоматичний trim до MAX_ENTRIES_PER_SCOPE (retention).
// =============================================================================

export function appendCensureBlock(
  config: OrchestratorConfig,
  cycle: number,
  step: Step,
  violations: Array<{ rule_id: string; name: string }>,
  projectName?: string,
): void {
  const store = loadStore(config);

  const entry: CensureHistoryEntry = {
    cycle,
    timestamp: new Date().toISOString(),
    step,
    violations,
  };

  if (projectName) {
    store.projects[projectName] ??= [];
    store.projects[projectName].push(entry);
    // Retention per project
    if (store.projects[projectName].length > MAX_ENTRIES_PER_SCOPE) {
      store.projects[projectName] = store.projects[projectName].slice(-MAX_ENTRIES_PER_SCOPE);
    }
  } else {
    store.global.push(entry);
    // Retention for global
    if (store.global.length > MAX_ENTRIES_PER_SCOPE) {
      store.global = store.global.slice(-MAX_ENTRIES_PER_SCOPE);
    }
  }

  saveStore(config, store);
}

// =============================================================================
// aggregateViolations — підрахувати частоту rule_id за останні N записів
//
// Повертає відсортований масив (найчастіші першими).
// Використовується censure-hints.ts для генерації prompt_block.
// =============================================================================

export function aggregateViolations(
  history: CensureHistoryEntry[],
  lastN: number = 10,
): Array<{ rule_id: string; name: string; count: number }> {
  const recent = history.slice(-lastN);
  const freq = new Map<string, { name: string; count: number }>();

  for (const entry of recent) {
    for (const v of entry.violations) {
      const existing = freq.get(v.rule_id);
      if (existing) {
        existing.count++;
      } else {
        freq.set(v.rule_id, { name: v.name, count: 1 });
      }
    }
  }

  return Array.from(freq.entries())
    .map(([rule_id, data]) => ({ rule_id, ...data }))
    .sort((a, b) => b.count - a.count);
}

// =============================================================================
// resetCensureHistory — скинути історію
//
// OPT-16: Скидає весь store до порожнього v2 формату.
// =============================================================================

export function resetCensureHistory(config: OrchestratorConfig): void {
  const filePath = getHistoryPath(config);
  if (fs.existsSync(filePath)) {
    const emptyStore: CensureHistoryStore = { global: [], projects: {}, version: 2 };
    fs.writeFileSync(filePath, JSON.stringify(emptyStore, null, 2), "utf-8");
  }
}
