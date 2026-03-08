// =============================================================================
// M3. Assignment Engine — вибір наступної задачі для виконання
// Single-worker mode: обирає ОДНУ найкращу ready задачу
//
// Стратегія вибору (в порядку пріоритету):
//   1. Тільки ready задачі (всі deps completed)
//   2. P0 перед P1, P1 перед P2
//   3. При рівному пріоритеті — задача з критичного шляху першою
//   4. При рівному всьому — за алфавітом ID
//
// Горизонт 2 — Smart Queue
// =============================================================================

import type { QueuedTask, TaskPriority } from "./task-queue";
import { getReadyTasks, isOnCriticalPath, countDownstream } from "./dependency-resolver";

// =============================================================================
// Priority ordering
// =============================================================================

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

// =============================================================================
// pickNextTask — вибрати одну наступну задачу
// =============================================================================

/**
 * Вибирає найкращу наступну задачу для виконання.
 *
 * Повертає null якщо:
 * - Всі задачі completed
 * - Всі queued задачі blocked (немає ready)
 * - Немає задач взагалі
 */
export function pickNextTask(tasks: QueuedTask[]): QueuedTask | null {
  const ready = getReadyTasks(tasks);

  if (ready.length === 0) {
    return null;
  }

  if (ready.length === 1) {
    return ready[0];
  }

  // Сортуємо за стратегією
  const sorted = [...ready].sort((a, b) => {
    // 1. За пріоритетом (P0 < P1 < P2)
    const prioA = PRIORITY_ORDER[a.priority] ?? 99;
    const prioB = PRIORITY_ORDER[b.priority] ?? 99;
    if (prioA !== prioB) {
      return prioA - prioB;
    }

    // 2. За критичним шляхом (задача на CP — першою)
    const cpA = isOnCriticalPath(a.id, tasks);
    const cpB = isOnCriticalPath(b.id, tasks);
    if (cpA && !cpB) return -1;
    if (!cpA && cpB) return 1;

    // 3. За кількістю downstream задач (більше downstream — першою)
    const downA = countDownstream(a.id, tasks);
    const downB = countDownstream(b.id, tasks);
    if (downA !== downB) {
      return downB - downA; // Більше downstream = вищий пріоритет
    }

    // 4. За алфавітом ID (стабільний порядок)
    return a.id.localeCompare(b.id);
  });

  return sorted[0];
}

/**
 * Перевіряє чи є задача що зараз in_progress.
 * Якщо так — не потрібно обирати нову.
 */
export function hasInProgressTask(tasks: QueuedTask[]): QueuedTask | null {
  return tasks.find(t => t.status === "in_progress") ?? null;
}

/**
 * Перевіряє чи всі задачі завершені.
 */
export function isQueueComplete(tasks: QueuedTask[]): boolean {
  return tasks.length > 0 && tasks.every(t => t.status === "completed");
}
