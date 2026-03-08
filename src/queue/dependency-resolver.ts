// =============================================================================
// M2. Dependency Resolver — DAG залежностей
// Визначає ready задачі, детектує цикли, обчислює критичний шлях
//
// Горизонт 2 — Smart Queue
// =============================================================================

import type { QueuedTask } from "./task-queue";

// =============================================================================
// Ready Tasks — задачі з усіма залежностями completed
// =============================================================================

/**
 * Повертає задачі, які ready до виконання:
 * - status === "queued"
 * - всі dependencies мають status === "completed"
 */
export function getReadyTasks(tasks: QueuedTask[]): QueuedTask[] {
  const statusMap = new Map<string, QueuedTask>();
  for (const task of tasks) {
    statusMap.set(task.id, task);
  }

  return tasks.filter(task => {
    // Тільки queued задачі можуть бути ready
    if (task.status !== "queued") {
      return false;
    }

    // Якщо немає залежностей — ready
    if (task.dependencies.length === 0) {
      return true;
    }

    // Всі залежності мають бути completed
    return task.dependencies.every(depId => {
      const dep = statusMap.get(depId);
      return dep !== undefined && dep.status === "completed";
    });
  });
}

// =============================================================================
// Cycle Detection — пошук циклічних залежностей (DFS)
// =============================================================================

/**
 * Детектує циклічні залежності у графі задач.
 * Повертає null якщо циклів немає.
 * Повертає масив ID задач що утворюють цикл: ["B1", "C1", "B1"]
 */
export function detectCycle(tasks: QueuedTask[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const task of tasks) {
    adjacency.set(task.id, task.dependencies);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(nodeId: string): string[] | null {
    visited.add(nodeId);
    inStack.add(nodeId);

    const deps = adjacency.get(nodeId) ?? [];
    for (const depId of deps) {
      if (!adjacency.has(depId)) {
        // Залежність на неіснуючу задачу — пропускаємо
        continue;
      }

      if (!visited.has(depId)) {
        parent.set(depId, nodeId);
        const cycle = dfs(depId);
        if (cycle) return cycle;
      } else if (inStack.has(depId)) {
        // Цикл знайдено — побудувати шлях
        const cyclePath: string[] = [depId];
        let current = nodeId;
        while (current !== depId) {
          cyclePath.push(current);
          current = parent.get(current) ?? depId;
        }
        cyclePath.push(depId);
        cyclePath.reverse();
        return cyclePath;
      }
    }

    inStack.delete(nodeId);
    return null;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      const cycle = dfs(task.id);
      if (cycle) return cycle;
    }
  }

  return null;
}

// =============================================================================
// Critical Path — найдовший ланцюг залежностей
// =============================================================================

/**
 * Обчислює критичний шлях — найдовший ланцюг залежностей.
 * Використовує topological sort + dynamic programming для знаходження
 * найдовшого шляху у DAG.
 *
 * Повертає масив task ID від першої задачі до останньої.
 * Наприклад: ["A1", "B1", "B2", "C1", "D1"]
 */
export function getCriticalPath(tasks: QueuedTask[]): string[] {
  if (tasks.length === 0) return [];

  // Adjacency: task → які задачі залежать від нього (forward edges)
  const dependents = new Map<string, string[]>();
  const depCount = new Map<string, number>();

  for (const task of tasks) {
    if (!dependents.has(task.id)) {
      dependents.set(task.id, []);
    }
    depCount.set(task.id, task.dependencies.length);
    for (const dep of task.dependencies) {
      if (!dependents.has(dep)) {
        dependents.set(dep, []);
      }
      dependents.get(dep)!.push(task.id);
    }
  }

  // Topological sort (Kahn's algorithm)
  const queue: string[] = [];
  for (const task of tasks) {
    if (task.dependencies.length === 0) {
      queue.push(task.id);
    }
  }

  // DP: longest distance from any root
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();

  for (const task of tasks) {
    dist.set(task.id, 0);
    prev.set(task.id, null);
  }

  // BFS in topological order
  const topoOrder: string[] = [];
  const inDegree = new Map<string, number>();
  for (const task of tasks) {
    // Рахуємо тільки залежності на існуючі задачі
    const existingDeps = task.dependencies.filter(d => dependents.has(d));
    inDegree.set(task.id, existingDeps.length);
  }

  const bfsQueue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      bfsQueue.push(id);
    }
  }

  let head = 0;
  while (head < bfsQueue.length) {
    const nodeId = bfsQueue[head++];
    topoOrder.push(nodeId);

    const children = dependents.get(nodeId) ?? [];
    for (const child of children) {
      // Якщо цей шлях довший — оновити
      const newDist = dist.get(nodeId)! + 1;
      if (newDist > dist.get(child)!) {
        dist.set(child, newDist);
        prev.set(child, nodeId);
      }
      const newDeg = inDegree.get(child)! - 1;
      inDegree.set(child, newDeg);
      if (newDeg === 0) {
        bfsQueue.push(child);
      }
    }
  }

  // Знайти задачу з максимальною відстанню
  let maxDist = 0;
  let endNode = tasks[0].id;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  // Відновити шлях
  const criticalPath: string[] = [];
  let current: string | null = endNode;
  while (current !== null) {
    criticalPath.push(current);
    current = prev.get(current) ?? null;
  }
  criticalPath.reverse();

  return criticalPath;
}

// =============================================================================
// Blocked Tasks — задачі з незавершеними залежностями
// =============================================================================

/**
 * Повертає задачі які blocked (мають незавершені залежності)
 * та список ID задач що їх блокують.
 */
export function getBlockedTasks(tasks: QueuedTask[]): Array<{
  task: string;
  blocked_by: string[];
}> {
  const statusMap = new Map<string, QueuedTask>();
  for (const task of tasks) {
    statusMap.set(task.id, task);
  }

  const blocked: Array<{ task: string; blocked_by: string[] }> = [];

  for (const task of tasks) {
    // Тільки queued задачі можуть бути blocked
    if (task.status !== "queued") continue;
    if (task.dependencies.length === 0) continue;

    const blockers = task.dependencies.filter(depId => {
      const dep = statusMap.get(depId);
      return dep === undefined || dep.status !== "completed";
    });

    if (blockers.length > 0) {
      blocked.push({ task: task.id, blocked_by: blockers });
    }
  }

  return blocked;
}

/**
 * Чи є задача на критичному шляху?
 */
export function isOnCriticalPath(taskId: string, tasks: QueuedTask[]): boolean {
  const cp = getCriticalPath(tasks);
  return cp.includes(taskId);
}

/**
 * Кількість задач downstream від даної (скільки задач розблокує)
 */
export function countDownstream(taskId: string, tasks: QueuedTask[]): number {
  // BFS: знайти всі задачі що прямо або непрямо залежать від taskId
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!dependents.has(dep)) {
        dependents.set(dep, []);
      }
      dependents.get(dep)!.push(task.id);
    }
  }

  const visited = new Set<string>();
  const queue = [taskId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = dependents.get(current) ?? [];
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }

  return visited.size;
}
