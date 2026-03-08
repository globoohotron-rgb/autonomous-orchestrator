// =============================================================================
// M1. Task Queue Manager — парсинг markdown задач → QueuedTask[]
// Зберігає/завантажує queue.json
//
// Горизонт 2 — Smart Queue
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";

// =============================================================================
// Types
// =============================================================================

/** Статус задачі у черзі */
export type TaskStatus = "queued" | "in_progress" | "completed" | "failed" | "blocked";

/** Пріоритет задачі */
export type TaskPriority = "P0" | "P1" | "P2";

/** Задача у черзі */
export interface QueuedTask {
  /** ID задачі: "A1", "B1", "C1" тощо */
  id: string;
  /** Назва задачі з заголовка */
  name: string;
  /** Шлях до markdown файлу задачі */
  path: string;
  /** Пріоритет з **Пріоритет:** */
  priority: TaskPriority;
  /** Категорія з **Категорія:** (config, code, test, docs) */
  category: string;
  /** Етап з **Етап:** (A, B, C, D, E) */
  stage: string;
  /** Масив ID задач-залежностей з **Залежність:** */
  dependencies: string[];
  /** Поточний статус */
  status: TaskStatus;
  /** Час початку in_progress */
  started_at: string | null;
  /** Час завершення */
  completed_at: string | null;
  /** Причина fail */
  error: string | null;
}

/** Стан черги (queue.json) */
export interface QueueState {
  /** Коли останній раз просканували tasks/active/ */
  scanned_at: string;
  /** Усі задачі */
  tasks: QueuedTask[];
  /** Кількість завершених */
  completed_count: number;
  /** Загальна кількість */
  total_count: number;
}

// =============================================================================
// Parsing — markdown → QueuedTask
// =============================================================================

/**
 * Парсить ID та назву із заголовка markdown.
 * Формат: `# B1 — API Client + Auth State Foundation`
 */
function parseHeader(content: string): { id: string; name: string } {
  const headerMatch = content.match(/^#\s+([A-Z]\d+)\s*[—–-]\s*(.+)$/m);
  if (headerMatch) {
    return { id: headerMatch[1], name: headerMatch[2].trim() };
  }
  // Fallback: просто перший заголовок
  const fallbackMatch = content.match(/^#\s+(.+)$/m);
  if (fallbackMatch) {
    return { id: "UNKNOWN", name: fallbackMatch[1].trim() };
  }
  return { id: "UNKNOWN", name: "Unknown Task" };
}

/**
 * Парсить пріоритет з **Пріоритет:** P0|P1|P2
 */
function parsePriority(content: string): TaskPriority {
  const match = content.match(/\*\*Пріоритет:\*\*\s*(P[012])/);
  return (match ? match[1] : "P2") as TaskPriority;
}

/**
 * Парсить категорію з **Категорія:** config|code|test|docs
 */
function parseCategory(content: string): string {
  const match = content.match(/\*\*Категорія:\*\*\s*(\S+)/);
  return match ? match[1] : "unknown";
}

/**
 * Парсить етап з **Етап:** A — ...
 * Повертає літеру етапу + повну назву
 */
function parseStage(content: string): string {
  const match = content.match(/\*\*Етап:\*\*\s*(.+)/);
  if (match) {
    // Витягти літеру: "B — Auth UI + API Foundation" → "B"
    const stageLetterMatch = match[1].match(/^([A-Z])\s*[—–-]/);
    return stageLetterMatch ? stageLetterMatch[1] : match[1].trim();
  }
  return "?";
}

/**
 * Парсить залежності з **Залежність:** рядка.
 *
 * Різні формати:
 * - `A1 PASS` → ["A1"]
 * - `B1 (apiFetch), B2 (Button, Toast)` → ["B1", "B2"]
 * - `B1 (apiFetch, React Query), B2 (Button, Toast, Skeleton), C1 ((dashboard) layout)` → ["B1", "B2", "C1"]
 * - `A1 PASS (worker запущений); scan.ts вже додає...` → ["A1"]
 * - (відсутнє) → []
 *
 * Regex: шукаємо task ID (1 велика буква + 1-2 цифри) на початку або після коми/крапки з комою
 */
function parseDependencies(content: string): string[] {
  // Знайти рядок з **Залежність:**
  const depMatch = content.match(/\*\*Залежність:\*\*\s*(.+)/);
  if (!depMatch) {
    return [];
  }

  const depLine = depMatch[1];

  // Витягти всі task ID: великі букви + цифри (A1, B1, B2, C1, D1, E1)
  const ids = depLine.match(/\b([A-Z]\d+)\b/g);
  if (!ids) {
    return [];
  }

  // Дедуплікація зі збереженням порядку
  return [...new Set(ids)];
}

/**
 * Парсить один markdown файл задачі → QueuedTask
 */
export function parseTaskMarkdown(content: string, filePath: string): QueuedTask {
  const { id, name } = parseHeader(content);
  const priority = parsePriority(content);
  const category = parseCategory(content);
  const stage = parseStage(content);
  const dependencies = parseDependencies(content);

  return {
    id,
    name,
    path: filePath,
    priority,
    category,
    stage,
    dependencies,
    status: "queued",
    started_at: null,
    completed_at: null,
    error: null,
  };
}

// =============================================================================
// Scanning — прочитати tasks/active/ → QueuedTask[]
// =============================================================================

/**
 * Скануємо tasks/active/ і парсимо всі .md файли
 */
export function scanTasks(config: OrchestratorConfig): QueuedTask[] {
  const tasksDir = path.join(config.control_center_path, "tasks", "active");

  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  const files = fs.readdirSync(tasksDir)
    .filter(f => f.endsWith(".md"))
    .sort(); // стабільний порядок

  const tasks: QueuedTask[] = [];

  for (const file of files) {
    const filePath = path.join(tasksDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const task = parseTaskMarkdown(content, filePath);
    tasks.push(task);
  }

  // GUARD: Detect orphaned tasks in sibling directories (misplaced by agent)
  if (tasks.length === 0) {
    const parentDir = path.join(config.control_center_path, "tasks");
    if (fs.existsSync(parentDir)) {
      const siblings = fs.readdirSync(parentDir).filter(d => {
        if (d === "active" || d === "done") return false;
        const full = path.join(parentDir, d);
        return fs.statSync(full).isDirectory();
      });
      for (const dir of siblings) {
        const dirPath = path.join(parentDir, dir);
        const mdFiles = fs.readdirSync(dirPath).filter(f => f.endsWith(".md"));
        if (mdFiles.length > 0) {
          console.error(
            `[QUEUE WARNING] tasks/active/ is empty but found ${mdFiles.length} task files in tasks/${dir}/. ` +
            `Tasks may have been created in the wrong directory. Move them to tasks/active/.`
          );
        }
      }
    }
  }

  return tasks;
}

/**
 * Скануємо і зберігаємо попередній стан задач (merge).
 * Якщо задача вже має статус (не queued) у попередній черзі — зберігаємо його.
 */
export function scanAndMerge(config: OrchestratorConfig): QueueState {
  const existingQueue = loadQueue(config);
  const freshTasks = scanTasks(config);

  // Map існуючих статусів
  const existingStatusMap = new Map<string, QueuedTask>();
  if (existingQueue) {
    for (const task of existingQueue.tasks) {
      existingStatusMap.set(task.id, task);
    }
  }

  // Merge: нові задачі отримують структуру з markdown, але зберігають статус
  const mergedTasks: QueuedTask[] = freshTasks.map(fresh => {
    const existing = existingStatusMap.get(fresh.id);
    if (existing) {
      // Оновити metadata з markdown, зберегти runtime стан
      return {
        ...fresh,
        status: existing.status,
        started_at: existing.started_at,
        completed_at: existing.completed_at,
        error: existing.error,
      };
    }
    return fresh;
  });

  const queue: QueueState = {
    scanned_at: new Date().toISOString(),
    tasks: mergedTasks,
    completed_count: mergedTasks.filter(t => t.status === "completed").length,
    total_count: mergedTasks.length,
  };

  return queue;
}

// =============================================================================
// Persistence — queue.json
// =============================================================================

/** Шлях до queue.json */
function getQueuePath(config: OrchestratorConfig): string {
  return path.join(config.control_center_path, "system_state", "queue.json");
}

/**
 * Завантажити queue.json
 * Повертає null якщо файл не існує
 */
export function loadQueue(config: OrchestratorConfig): QueueState | null {
  const queuePath = getQueuePath(config);
  if (!fs.existsSync(queuePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(queuePath, "utf-8");
    return JSON.parse(content) as QueueState;
  } catch {
    return null;
  }
}

/**
 * Зберегти queue.json
 */
export function saveQueue(config: OrchestratorConfig, state: QueueState): void {
  const queuePath = getQueuePath(config);
  fs.writeFileSync(queuePath, JSON.stringify(state, null, 2), "utf-8");
}

// =============================================================================
// Status updates
// =============================================================================

/**
 * Оновити статус задачі у черзі.
 * Повертає оновлену чергу або null якщо задачу не знайдено.
 */
export function updateTaskStatus(
  queue: QueueState,
  taskId: string,
  status: TaskStatus,
  error?: string,
): QueueState | null {
  const taskIndex = queue.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const task = { ...queue.tasks[taskIndex] };

  task.status = status;

  if (status === "in_progress") {
    task.started_at = now;
    task.completed_at = null;
    task.error = null;
  } else if (status === "completed") {
    task.completed_at = now;
    task.error = null;
  } else if (status === "failed") {
    task.completed_at = now;
    task.error = error ?? null;
  } else if (status === "queued") {
    // Reset (retry)
    task.started_at = null;
    task.completed_at = null;
    task.error = null;
  }

  const updatedTasks = [...queue.tasks];
  updatedTasks[taskIndex] = task;

  return {
    ...queue,
    tasks: updatedTasks,
    completed_count: updatedTasks.filter(t => t.status === "completed").length,
    total_count: updatedTasks.length,
  };
}
