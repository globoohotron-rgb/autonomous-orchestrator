// =============================================================================
// Code Health Validator — перевірка здоров'я коду проекту при complete
//
// Запускає tsc --noEmit для всіх tsconfig.json у проекті (крім node_modules
// та control_center_code). Якщо є помилки компіляції — блокує complete.
//
// Використовується лише для кроків що змінюють код (L10, D5, S3).
// =============================================================================

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface CodeHealthResult {
  healthy: boolean;
  checks: CodeHealthCheck[];
  summary: string;
}

export interface CodeHealthCheck {
  type: "tsc" | "test";
  target: string;         // шлях до tsconfig.json або package.json
  passed: boolean;
  output?: string;        // перших 1500 символів виводу помилки
  duration_ms: number;
}

// Кроки що змінюють код продукту — тільки для них запускаємо code health
const CODE_STEPS = new Set(["L10", "D5", "S3"]);

// Директорії зі своїм tsconfig (виключаємо control_center_code — це код оркестратора)
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "control_center_code",
  "control_center",
  ".next",
  "dist",
  "build",
]);

// =============================================================================
// isCodeStep — чи крок змінює код продукту
// =============================================================================

export function isCodeStep(step: string): boolean {
  return CODE_STEPS.has(step);
}

// =============================================================================
// findTsconfigs — знайти всі tsconfig.json в проекті (1 рівень глибини)
// =============================================================================

function findTsconfigs(projectRoot: string): string[] {
  const results: string[] = [];

  // Перевірити root tsconfig
  const rootTsconfig = path.join(projectRoot, "tsconfig.json");
  if (fs.existsSync(rootTsconfig)) {
    results.push(rootTsconfig);
  }

  // Перевірити підпапки першого рівня (server/, worker/, app/)
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (EXCLUDE_DIRS.has(entry.name)) continue;

      const subTsconfig = path.join(projectRoot, entry.name, "tsconfig.json");
      if (fs.existsSync(subTsconfig)) {
        results.push(subTsconfig);
      }
    }
  } catch {
    // Якщо не можемо прочитати директорію — пропускаємо
  }

  return results;
}

// =============================================================================
// findPackageJsonsWithTest — знайти package.json з npm test скриптом
// =============================================================================

function findPackageJsonsWithTest(projectRoot: string): string[] {
  const results: string[] = [];
  const checkDirs = [projectRoot];

  // Підпапки першого рівня
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      checkDirs.push(path.join(projectRoot, entry.name));
    }
  } catch {
    // ignore
  }

  for (const dir of checkDirs) {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.test && pkg.scripts.test !== "echo \"Error: no test specified\" && exit 1") {
        results.push(pkgPath);
      }
    } catch {
      // Невалідний package.json — пропускаємо
    }
  }

  return results;
}

// =============================================================================
// runTscCheck — запустити tsc --noEmit для одного tsconfig
// =============================================================================

function runTscCheck(tsconfigPath: string): CodeHealthCheck {
  const dir = path.dirname(tsconfigPath);
  const start = Date.now();

  try {
    execSync("npx tsc --noEmit", {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000, // 60 секунд таймаут
      encoding: "utf-8",
    });

    return {
      type: "tsc",
      target: tsconfigPath,
      passed: true,
      duration_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = (error.stdout || error.stderr || error.message || "Unknown error").slice(0, 1500);

    return {
      type: "tsc",
      target: tsconfigPath,
      passed: false,
      output,
      duration_ms: Date.now() - start,
    };
  }
}

// =============================================================================
// runTestCheck — запустити npm test для одного package.json
// =============================================================================

function runTestCheck(packageJsonPath: string): CodeHealthCheck {
  const dir = path.dirname(packageJsonPath);
  const start = Date.now();

  try {
    execSync("npm test", {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000, // 2 хвилини таймаут
      encoding: "utf-8",
    });

    return {
      type: "test",
      target: packageJsonPath,
      passed: true,
      duration_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = (error.stdout || error.stderr || error.message || "Unknown error").slice(0, 1500);

    return {
      type: "test",
      target: packageJsonPath,
      passed: false,
      output,
      duration_ms: Date.now() - start,
    };
  }
}

// =============================================================================
// checkCodeHealth — головна функція
//
// 1. Знаходить tsconfig.json у проекті
// 2. Запускає tsc --noEmit для кожного
// 3. Знаходить package.json з тестами
// 4. Запускає npm test для кожного
// 5. Повертає результат
// =============================================================================

export function checkCodeHealth(config: OrchestratorConfig): CodeHealthResult {
  const checks: CodeHealthCheck[] = [];

  // 1. TypeScript compilation
  const tsconfigs = findTsconfigs(config.project_root);
  for (const tsconfig of tsconfigs) {
    checks.push(runTscCheck(tsconfig));
  }

  // 2. Tests (якщо є)
  const testPackages = findPackageJsonsWithTest(config.project_root);
  for (const pkg of testPackages) {
    checks.push(runTestCheck(pkg));
  }

  // 3. Підсумок
  const failed = checks.filter((c) => !c.passed);
  const healthy = failed.length === 0;

  let summary: string;
  if (checks.length === 0) {
    summary = "Немає tsconfig.json або тестів для перевірки.";
  } else if (healthy) {
    summary = `✅ Code health OK: ${checks.length} перевірок пройдено.`;
  } else {
    const failedTypes = failed.map((c) => `${c.type}(${path.basename(path.dirname(c.target))})`).join(", ");
    summary = `❌ Code health FAIL: ${failed.length}/${checks.length} — ${failedTypes}`;
  }

  return { healthy, checks, summary };
}
