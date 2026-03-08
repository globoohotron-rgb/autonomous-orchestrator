// =============================================================================
// M2. Artifact Watcher — файловий спостерігач (fs.watch)
// Слідкує за файловою системою і детектує:
//   - Новий файл у control_center/ (артефакт створено)
//   - Зміна файлу у server/, worker/, app/ (код змінено)
//   - Зміна state.json (стан модифіковано ззовні)
//
// Правила фільтрації:
//   - Ігнорувати node_modules/, .git/, dist/, .next/
//   - Ігнорувати тимчасові файли (.tmp, .swp, ~)
//   - Debounce 2 секунди
//   - Ігнорувати зміни від самого оркестратора (lock file)
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";
import { isLocked } from "./daemon-state";
import { log } from "./daemon-logger";

// =============================================================================
// Типи подій
// =============================================================================

export type WatchEventType =
  | "artifact_created"
  | "code_changed"
  | "state_changed"
  | "gate_decision_created"
  | "task_created";

export interface WatchEvent {
  type: WatchEventType;
  filePath: string;
  relativePath: string;
  timestamp: string;
}

export type WatchEventCallback = (event: WatchEvent) => void;

// =============================================================================
// Фільтри — які файли/директорії ігнорувати
// =============================================================================

const IGNORED_DIRS = [
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".turbo",
  "__pycache__",
];

const IGNORED_EXTENSIONS = [".tmp", ".swp", ".bak", ".log"];

const IGNORED_SUFFIXES = ["~"];

function shouldIgnorePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");

  // Ігнорувати директорії
  for (const dir of IGNORED_DIRS) {
    if (normalized.includes(`/${dir}/`) || normalized.endsWith(`/${dir}`)) {
      return true;
    }
  }

  // Ігнорувати тимчасові файли
  const ext = path.extname(filePath).toLowerCase();
  if (IGNORED_EXTENSIONS.includes(ext)) return true;

  // Ігнорувати файли з суфіксом ~
  const base = path.basename(filePath);
  for (const suffix of IGNORED_SUFFIXES) {
    if (base.endsWith(suffix)) return true;
  }

  // Ігнорувати daemon_state.json і daemon_log.jsonl (свої файли)
  if (base === "daemon_state.json" || base === "daemon_log.jsonl") {
    return true;
  }

  return false;
}

// =============================================================================
// Класифікація подій на основі шляху файлу
// =============================================================================

function classifyEvent(
  relativePath: string,
  _config: OrchestratorConfig,
): WatchEventType | null {
  const normalized = relativePath.replace(/\\/g, "/");

  // state.json змінено
  if (normalized.includes("system_state/state.json") && !normalized.endsWith(".bak")) {
    return "state_changed";
  }

  // Gate decision створено
  if (normalized.includes("audit/gate_decisions/") && !normalized.includes("archive/")) {
    return "gate_decision_created";
  }

  // Артефакт у audit/ створено
  if (normalized.includes("audit/") && !normalized.includes("archive/")) {
    return "artifact_created";
  }

  // Задачі в tasks/active/ створено
  if (normalized.includes("tasks/active/")) {
    return "task_created";
  }

  // Код змінено (server/, worker/, app/)
  if (
    normalized.startsWith("server/") ||
    normalized.startsWith("worker/") ||
    normalized.startsWith("app/")
  ) {
    return "code_changed";
  }

  return null;
}

// =============================================================================
// ArtifactWatcher — клас для спостереження за файловою системою
// Використовує native fs.watch з рекурсивним режимом
// =============================================================================

export class ArtifactWatcher {
  private config: OrchestratorConfig;
  private callback: WatchEventCallback;
  private watchers: fs.FSWatcher[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number;
  private running = false;

  constructor(
    config: OrchestratorConfig,
    callback: WatchEventCallback,
    debounceMs = 2000,
  ) {
    this.config = config;
    this.callback = callback;
    this.debounceMs = debounceMs;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // start — запустити спостереження
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;

    // Watch control_center/ для артефактів, gate decisions, tasks
    const ccPath = this.config.control_center_path;
    if (fs.existsSync(ccPath)) {
      this.watchDir(ccPath, "control_center");
    }

    // Watch code directories для code changes
    const codeDirs = ["server", "worker", "app"];
    for (const dir of codeDirs) {
      const dirPath = path.join(this.config.project_root, dir);
      if (fs.existsSync(dirPath)) {
        this.watchDir(dirPath, dir);
      }
    }

    log(this.config, {
      type: "daemon_started",
      details: `Watching ${this.watchers.length} directories`,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // stop — зупинити спостереження
  // ─────────────────────────────────────────────────────────────────────────

  stop(): void {
    this.running = false;

    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        // ignore close errors
      }
    }
    this.watchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    log(this.config, { type: "daemon_stopped" });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // isRunning — чи працює watcher
  // ─────────────────────────────────────────────────────────────────────────

  isRunning(): boolean {
    return this.running;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // watchDir — додати watcher для директорії
  // ─────────────────────────────────────────────────────────────────────────

  private watchDir(dirPath: string, prefix: string): void {
    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (_eventType, filename) => {
        if (!filename || !this.running) return;

        const fullPath = path.join(dirPath, filename);
        const relativePath = prefix + "/" + filename.replace(/\\/g, "/");

        this.handleFsEvent(fullPath, relativePath);
      });

      watcher.on("error", (err) => {
        log(this.config, {
          type: "error",
          error: `Watcher error for ${prefix}: ${err.message}`,
        });
      });

      this.watchers.push(watcher);
    } catch (err) {
      log(this.config, {
        type: "error",
        error: `Failed to watch ${dirPath}: ${(err as Error).message}`,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // handleFsEvent — обробка fs event з debounce + фільтрацією
  // ─────────────────────────────────────────────────────────────────────────

  private handleFsEvent(fullPath: string, relativePath: string): void {
    // Фільтрація
    if (shouldIgnorePath(fullPath)) return;

    // Ігнорувати якщо lock активний (зміни від самого daemon)
    if (isLocked(this.config)) return;

    // Debounce — для одного і того ж файлу чекати 2 секунди
    const existingTimer = this.debounceTimers.get(fullPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(fullPath);
      this.processEvent(fullPath, relativePath);
    }, this.debounceMs);

    this.debounceTimers.set(fullPath, timer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // processEvent — класифікувати та відправити подію
  // ─────────────────────────────────────────────────────────────────────────

  private processEvent(fullPath: string, relativePath: string): void {
    const eventType = classifyEvent(relativePath, this.config);
    if (!eventType) return;

    // Перевірити що файл існує (може бути видалено між event і debounce)
    if (!fs.existsSync(fullPath)) return;

    const event: WatchEvent = {
      type: eventType,
      filePath: fullPath,
      relativePath,
      timestamp: new Date().toISOString(),
    };

    this.callback(event);
  }
}
