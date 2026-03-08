// =============================================================================
// M4. Queue CLI — CLI команди для управління чергою задач
//
// Команди:
//   queue scan             — просканувати tasks/active/ → побудувати queue.json
//   queue status           — стан всіх задач + DAG + critical path
//   queue next             — яка наступна ready задача? (read-only)
//   queue start --task B1  — позначити задачу як in_progress
//   queue done --task B1   — позначити задачу як completed
//   queue fail --task B1   — позначити задачу як failed
//   queue reset --task B1  — повернути задачу до queued (retry)
//
// Горизонт 2 — Smart Queue
// =============================================================================

import type {
  OrchestratorConfig,
  SystemState,
  CLIOutput,
} from "../types";
import type { QueueData } from "../types/cli";
import {
  scanAndMerge,
  loadQueue,
  saveQueue,
  updateTaskStatus,
} from "../queue/task-queue";
import type { QueueState } from "../queue/task-queue";
import {
  getReadyTasks,
  getBlockedTasks,
  getCriticalPath,
  detectCycle,
} from "../queue/dependency-resolver";
import {
  pickNextTask,
  hasInProgressTask,
  isQueueComplete,
} from "../queue/assignment-engine";

// =============================================================================
// handleQueue — маршрутизація субкоманди
// =============================================================================

export function handleQueue(
  _state: SystemState,
  config: OrchestratorConfig,
  subcommand?: string,
  taskArg?: string,
): CLIOutput<QueueData> {
  const sub = subcommand ?? "status";

  switch (sub) {
    case "scan":
      return handleScan(config);
    case "status":
      return handleQueueStatus(config);
    case "next":
      return handleNext(config);
    case "start":
      return handleStart(config, taskArg);
    case "done":
      return handleDone(config, taskArg);
    case "fail":
      return handleFail(config, taskArg);
    case "reset":
      return handleReset(config, taskArg);
    default:
      return {
        success: false,
        command: "queue",
        error: "INVALID_COMMAND",
        message: `Unknown queue subcommand: ${sub}. Valid: scan, status, next, start, done, fail, reset`,
      };
  }
}

// =============================================================================
// scan — просканувати tasks/active/ → побудувати queue.json
// =============================================================================

function handleScan(config: OrchestratorConfig): CLIOutput<QueueData> {
  const queue = scanAndMerge(config);

  // Перевірити на цикли
  const cycle = detectCycle(queue.tasks);
  if (cycle) {
    return {
      success: false,
      command: "queue",
      error: "PRECONDITION_FAILED",
      message: `Circular dependency detected: ${cycle.join(" → ")}`,
    };
  }

  saveQueue(config, queue);

  const ready = getReadyTasks(queue.tasks);
  const criticalPath = getCriticalPath(queue.tasks);

  return {
    success: true,
    command: "queue",
    data: {
      subcommand: "scan",
      total: queue.total_count,
      completed: queue.completed_count,
      in_progress: queue.tasks.filter(t => t.status === "in_progress").length,
      queued: queue.tasks.filter(t => t.status === "queued").length,
      blocked: getBlockedTasks(queue.tasks).length,
      critical_path: criticalPath,
      tasks: queue.tasks.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        priority: t.priority,
        dependencies: t.dependencies,
        blocked_by: t.status === "queued"
          ? t.dependencies.filter(d => {
              const dep = queue.tasks.find(tt => tt.id === d);
              return !dep || dep.status !== "completed";
            })
          : undefined,
      })),
      next_ready: ready.length > 0 ? pickNextTask(queue.tasks)?.id ?? null : null,
      message: `Просканувано ${queue.total_count} задач. Ready: ${ready.length}.`,
    },
    next_action: ready.length > 0
      ? `Наступна ready задача: ${pickNextTask(queue.tasks)?.id}. Виконайте 'queue start --task ${pickNextTask(queue.tasks)?.id}'.`
      : "Немає ready задач. Перевірте залежності.",
  };
}

// =============================================================================
// status — поточний стан черги
// =============================================================================

function handleQueueStatus(config: OrchestratorConfig): CLIOutput<QueueData> {
  const queue = loadQueue(config);

  if (!queue) {
    return {
      success: false,
      command: "queue",
      error: "STATE_NOT_FOUND",
      message: "queue.json не знайдено. Виконайте 'queue scan' спочатку.",
    };
  }

  const blocked = getBlockedTasks(queue.tasks);
  const criticalPath = getCriticalPath(queue.tasks);
  const next = pickNextTask(queue.tasks);
  const inProgress = hasInProgressTask(queue.tasks);
  const complete = isQueueComplete(queue.tasks);

  return {
    success: true,
    command: "queue",
    data: {
      subcommand: "status",
      total: queue.total_count,
      completed: queue.completed_count,
      in_progress: queue.tasks.filter(t => t.status === "in_progress").length,
      queued: queue.tasks.filter(t => t.status === "queued").length,
      blocked: blocked.length,
      critical_path: criticalPath,
      tasks: queue.tasks.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        priority: t.priority,
        dependencies: t.dependencies,
        blocked_by: blocked.find(b => b.task === t.id)?.blocked_by,
      })),
      next_ready: next?.id ?? null,
      message: complete
        ? "Всі задачі завершено!"
        : inProgress
          ? `In progress: ${inProgress.id} (${inProgress.name})`
          : next
            ? `Наступна: ${next.id} (${next.name})`
            : "Немає ready задач.",
    },
    next_action: complete
      ? "Всі задачі плану завершено. Перейдіть до наступного кроку."
      : inProgress
        ? `Задача ${inProgress.id} в роботі. Завершіть її: 'queue done --task ${inProgress.id}'.`
        : next
          ? `Виконайте 'queue start --task ${next.id}'.`
          : "Перевірте залежності — всі ready задачі blocked.",
  };
}

// =============================================================================
// next — яка наступна ready задача? (read-only)
// =============================================================================

function handleNext(config: OrchestratorConfig): CLIOutput<QueueData> {
  const queue = ensureQueue(config);
  if (!queue) return queueNotFound();

  const inProgress = hasInProgressTask(queue.tasks);
  if (inProgress) {
    return {
      success: true,
      command: "queue",
      data: {
        subcommand: "next",
        total: queue.total_count,
        completed: queue.completed_count,
        in_progress: 1,
        queued: queue.tasks.filter(t => t.status === "queued").length,
        blocked: getBlockedTasks(queue.tasks).length,
        critical_path: getCriticalPath(queue.tasks),
        tasks: [{ id: inProgress.id, name: inProgress.name, status: "in_progress", priority: inProgress.priority, dependencies: inProgress.dependencies }],
        next_ready: null,
        message: `Задача ${inProgress.id} вже in_progress. Завершіть її перед наступною.`,
      },
      next_action: `Завершіть задачу ${inProgress.id}: 'queue done --task ${inProgress.id}'.`,
    };
  }

  const next = pickNextTask(queue.tasks);

  if (!next) {
    const complete = isQueueComplete(queue.tasks);
    return {
      success: true,
      command: "queue",
      data: {
        subcommand: "next",
        total: queue.total_count,
        completed: queue.completed_count,
        in_progress: 0,
        queued: queue.tasks.filter(t => t.status === "queued").length,
        blocked: getBlockedTasks(queue.tasks).length,
        critical_path: getCriticalPath(queue.tasks),
        tasks: [],
        next_ready: null,
        message: complete ? "Всі задачі завершено!" : "Немає ready задач (всі blocked).",
      },
      next_action: complete
        ? "Всі задачі завершено."
        : "Перевірте залежності — running tasks можуть розблокувати наступні.",
    };
  }

  return {
    success: true,
    command: "queue",
    data: {
      subcommand: "next",
      total: queue.total_count,
      completed: queue.completed_count,
      in_progress: 0,
      queued: queue.tasks.filter(t => t.status === "queued").length,
      blocked: getBlockedTasks(queue.tasks).length,
      critical_path: getCriticalPath(queue.tasks),
      tasks: [{ id: next.id, name: next.name, status: next.status, priority: next.priority, dependencies: next.dependencies }],
      next_ready: next.id,
      message: `Наступна задача: ${next.id} — ${next.name} (${next.priority})`,
    },
    next_action: `Виконайте 'queue start --task ${next.id}'.`,
  };
}

// =============================================================================
// start --task B1 — позначити задачу як in_progress
// =============================================================================

function handleStart(config: OrchestratorConfig, taskId?: string): CLIOutput<QueueData> {
  if (!taskId) {
    return taskIdRequired("start");
  }

  const queue = ensureQueue(config);
  if (!queue) return queueNotFound();

  // Перевірити чи немає вже in_progress
  const inProgress = hasInProgressTask(queue.tasks);
  if (inProgress) {
    return {
      success: false,
      command: "queue",
      error: "PRECONDITION_FAILED",
      message: `Задача ${inProgress.id} вже in_progress. Завершіть її перед початком нової.`,
    };
  }

  // Перевірити чи задача існує і ready
  const task = queue.tasks.find(t => t.id === taskId);
  if (!task) {
    return taskNotFound(taskId);
  }

  if (task.status !== "queued") {
    return {
      success: false,
      command: "queue",
      error: "PRECONDITION_FAILED",
      message: `Задача ${taskId} має статус '${task.status}', очікувався 'queued'.`,
    };
  }

  // Перевірити залежності
  const ready = getReadyTasks(queue.tasks);
  if (!ready.find(r => r.id === taskId)) {
    const blocked = getBlockedTasks(queue.tasks);
    const blockers = blocked.find(b => b.task === taskId);
    return {
      success: false,
      command: "queue",
      error: "BLOCKED",
      message: `Задача ${taskId} blocked. Незавершені залежності: ${blockers?.blocked_by.join(", ") ?? "unknown"}.`,
    };
  }

  // Оновити статус
  const updated = updateTaskStatus(queue, taskId, "in_progress");
  if (!updated) return taskNotFound(taskId);

  saveQueue(config, updated);

  return {
    success: true,
    command: "queue",
    data: {
      subcommand: "start",
      total: updated.total_count,
      completed: updated.completed_count,
      in_progress: 1,
      queued: updated.tasks.filter(t => t.status === "queued").length,
      blocked: getBlockedTasks(updated.tasks).length,
      critical_path: getCriticalPath(updated.tasks),
      tasks: [{ id: taskId, name: task.name, status: "in_progress", priority: task.priority, dependencies: task.dependencies }],
      next_ready: null,
      message: `Задача ${taskId} розпочата.`,
    },
    next_action: `Виконайте задачу ${taskId}: ${task.path}. Після завершення: 'queue done --task ${taskId}'.`,
  };
}

// =============================================================================
// done --task B1 — позначити задачу як completed
// =============================================================================

function handleDone(config: OrchestratorConfig, taskId?: string): CLIOutput<QueueData> {
  if (!taskId) {
    return taskIdRequired("done");
  }

  const queue = ensureQueue(config);
  if (!queue) return queueNotFound();

  const task = queue.tasks.find(t => t.id === taskId);
  if (!task) return taskNotFound(taskId);

  if (task.status !== "in_progress" && task.status !== "queued") {
    return {
      success: false,
      command: "queue",
      error: "PRECONDITION_FAILED",
      message: `Задача ${taskId} має статус '${task.status}'. Очікувався 'in_progress' або 'queued'.`,
    };
  }

  // GUARD: перевірити що Validation Script було виконано (результат PASS/FAIL у файлі)
  if (task.path) {
    try {
      const fs = require("fs");
      const taskContent = fs.readFileSync(task.path, "utf-8");
      const vsIdx = taskContent.indexOf("## Validation Script");
      if (vsIdx !== -1) {
        // Знайти текст секції до наступного ## або кінця файлу
        const nextSection = taskContent.indexOf("\n## ", vsIdx + 1);
        const sectionText = nextSection !== -1
          ? taskContent.substring(vsIdx, nextSection)
          : taskContent.substring(vsIdx);
        const hasResult = /\b(PASS|FAIL|✅|❌|passed|failed|OK)\b/i.test(sectionText);
        if (!hasResult) {
          return {
            success: false,
            command: "queue",
            error: "VALIDATION_MISSING",
            message: `Задача ${taskId}: секція "Validation Script" не містить результатів виконання. Запустіть Validation Script з файлу задачі та задокументуйте результат (PASS/FAIL) перед завершенням.`,
          };
        }
      }
    } catch {
      // Файл недоступний — не блокуємо, але логічне попередження
    }
  }

  const updated = updateTaskStatus(queue, taskId, "completed");
  if (!updated) return taskNotFound(taskId);

  saveQueue(config, updated);

  // Визначити наступну задачу після оновлення
  const next = pickNextTask(updated.tasks);
  const complete = isQueueComplete(updated.tasks);

  // Session Bridge: write signal for next task (fresh context per task)
  if (!complete && next) {
    writeTaskSignal(config, taskId, next.id, next.name, updated);
  }

  return {
    success: true,
    command: "queue",
    data: {
      subcommand: "done",
      total: updated.total_count,
      completed: updated.completed_count,
      in_progress: updated.tasks.filter(t => t.status === "in_progress").length,
      queued: updated.tasks.filter(t => t.status === "queued").length,
      blocked: getBlockedTasks(updated.tasks).length,
      critical_path: getCriticalPath(updated.tasks),
      tasks: updated.tasks.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        priority: t.priority,
        dependencies: t.dependencies,
      })),
      next_ready: next?.id ?? null,
      message: complete
        ? `Задача ${taskId} завершена. Всі задачі плану виконано!`
        : `Задача ${taskId} завершена. Розблоковано нові задачі.`,
    },
    next_action: complete
      ? "Всі задачі завершено. Перейдіть до наступного кроку."
      : next
        ? `Наступна задача: ${next.id}. Виконайте 'queue start --task ${next.id}'.`
        : "Немає більше ready задач.",
  };
}

// =============================================================================
// fail --task B1 — позначити задачу як failed
// =============================================================================

function handleFail(config: OrchestratorConfig, taskId?: string): CLIOutput<QueueData> {
  if (!taskId) {
    return taskIdRequired("fail");
  }

  const queue = ensureQueue(config);
  if (!queue) return queueNotFound();

  const task = queue.tasks.find(t => t.id === taskId);
  if (!task) return taskNotFound(taskId);

  const updated = updateTaskStatus(queue, taskId, "failed", "Задача провалена агентом");
  if (!updated) return taskNotFound(taskId);

  saveQueue(config, updated);

  return {
    success: true,
    command: "queue",
    data: {
      subcommand: "fail",
      total: updated.total_count,
      completed: updated.completed_count,
      in_progress: updated.tasks.filter(t => t.status === "in_progress").length,
      queued: updated.tasks.filter(t => t.status === "queued").length,
      blocked: getBlockedTasks(updated.tasks).length,
      critical_path: getCriticalPath(updated.tasks),
      tasks: [{ id: taskId, name: task.name, status: "failed", priority: task.priority, dependencies: task.dependencies }],
      next_ready: pickNextTask(updated.tasks)?.id ?? null,
      message: `Задача ${taskId} позначена як failed. Використайте 'queue reset --task ${taskId}' для повторної спроби.`,
    },
    next_action: `Виконайте 'queue reset --task ${taskId}' для retry, або перейдіть до іншої задачі.`,
  };
}

// =============================================================================
// reset --task B1 — повернути задачу до queued (retry)
// =============================================================================

function handleReset(config: OrchestratorConfig, taskId?: string): CLIOutput<QueueData> {
  if (!taskId) {
    return taskIdRequired("reset");
  }

  const queue = ensureQueue(config);
  if (!queue) return queueNotFound();

  const task = queue.tasks.find(t => t.id === taskId);
  if (!task) return taskNotFound(taskId);

  const updated = updateTaskStatus(queue, taskId, "queued");
  if (!updated) return taskNotFound(taskId);

  saveQueue(config, updated);

  const next = pickNextTask(updated.tasks);

  return {
    success: true,
    command: "queue",
    data: {
      subcommand: "reset",
      total: updated.total_count,
      completed: updated.completed_count,
      in_progress: updated.tasks.filter(t => t.status === "in_progress").length,
      queued: updated.tasks.filter(t => t.status === "queued").length,
      blocked: getBlockedTasks(updated.tasks).length,
      critical_path: getCriticalPath(updated.tasks),
      tasks: [{ id: taskId, name: task.name, status: "queued", priority: task.priority, dependencies: task.dependencies }],
      next_ready: next?.id ?? null,
      message: `Задача ${taskId} повернута до queued.`,
    },
    next_action: next
      ? `Наступна задача: ${next.id}. Виконайте 'queue start --task ${next.id}'.`
      : "Перевірте статус черги: 'queue status'.",
  };
}

// =============================================================================
// Helpers
// =============================================================================

function ensureQueue(config: OrchestratorConfig): QueueState | null {
  return loadQueue(config);
}

function queueNotFound(): CLIOutput<QueueData> {
  return {
    success: false,
    command: "queue",
    error: "STATE_NOT_FOUND",
    message: "queue.json не знайдено. Виконайте 'queue scan' спочатку.",
  };
}

function taskNotFound(taskId: string): CLIOutput<QueueData> {
  return {
    success: false,
    command: "queue",
    error: "ARTIFACT_NOT_FOUND",
    message: `Задача '${taskId}' не знайдена у черзі.`,
  };
}

function taskIdRequired(subcommand: string): CLIOutput<QueueData> {
  return {
    success: false,
    command: "queue",
    error: "PRECONDITION_FAILED",
    message: `Для '${subcommand}' потрібен аргумент --task <ID>. Наприклад: queue ${subcommand} --task B1`,
  };
}

// =============================================================================
// writeTaskSignal — Session Bridge signal for next task in D5
// Gives fresh context per task instead of cramming all into one session
// =============================================================================

function writeTaskSignal(
  config: OrchestratorConfig,
  completedTaskId: string,
  nextTaskId: string,
  nextTaskName: string,
  queue: QueueState,
): void {
  try {
    const fs = require("fs");
    const pathMod = require("path");
    const signalPath = pathMod.resolve(
      config.control_center_path, "system_state", "session_boundary.signal"
    );

    const remaining = queue.tasks.filter(t => t.status === "queued" || t.status === "in_progress").length;
    const nextTask = queue.tasks.find(t => t.id === nextTaskId);
    const taskPath = nextTask?.path || "";

    const promptLines = [
      `# Продовження D5 — наступна задача ${nextTaskId}`,
      ``,
      `Задача **${completedTaskId}** завершена. Прогрес: ${queue.completed_count}/${queue.total_count}.`,
      `Залишилось: ${remaining} задач.`,
      ``,
      `## Наступна задача`,
      `- ID: **${nextTaskId}**`,
      `- Назва: ${nextTaskName}`,
      taskPath ? `- Файл: \`${taskPath}\`` : "",
      ``,
      `## Алгоритм`,
      `1. Виконай \`npx ts-node src/orchestrator.ts queue start --task ${nextTaskId}\``,
      `2. Прочитай файл задачі та виконай її`,
      `3. Виконай \`npx ts-node src/orchestrator.ts queue done --task ${nextTaskId}\``,
      `4. Якщо всі задачі виконані — виконай \`npx ts-node src/orchestrator.ts complete\``,
      `5. Якщо є ще задачі — Session Bridge автоматично запустить нову сесію`,
    ].filter(Boolean).join("\n");

    const signal = JSON.stringify({
      prompt: promptLines,
      type: "task_continuation",
      completed_task: completedTaskId,
      next_task: nextTaskId,
      progress: `${queue.completed_count}/${queue.total_count}`,
      timestamp: new Date().toISOString(),
    });

    fs.writeFileSync(signalPath, signal, "utf-8");
  } catch {
    // non-blocking
  }
}
