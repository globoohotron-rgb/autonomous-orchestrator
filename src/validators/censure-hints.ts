// =============================================================================
// Censure Hints — генерація plan template + violation hints для D3/L8
//
// OPT-2: Знижує CENSURE_BLOCKED через проактивне інформування агента
// про обов'язкові секції плану та історію попередніх порушень.
//
// Новий файл — не змінює існуючий код. Безпечне додавання.
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";
import { loadCensureHistory, aggregateViolations } from "../learning/censure-history";
import { detectB2BProject } from "./b2b-detection";

// =============================================================================
// Types
// =============================================================================

export interface CensureHints {
  /** Обов'язкові секції плану (з rule_id) */
  required_sections: Array<{ rule_id: string; heading: string; description: string }>;
  /** Правила що блокували попередні плани (з censure_history.json) */
  recent_violations: Array<{ rule_id: string; name: string; count: number }>;
  /** Готовий текстовий блок для вставки у prompt */
  prompt_block: string;
}

// CensureHistoryEntry re-exported from learning/censure-history.ts (OPT-5)
export type { CensureHistoryEntry } from "../learning/censure-history";

// =============================================================================
// OPT-11: Intent-based project context detection
//
// Reads project_description.md to detect Docker/API/B2B intent BEFORE
// actual files are created. Filesystem detection remains as fallback.
// =============================================================================

export interface ProjectContext {
  hasDocker: boolean;
  hasApi: boolean;
  isB2B: boolean;
}

export function getContextFromDescription(projectRoot: string): ProjectContext {
  // Fallback: filesystem detection
  const hasDockerFile = fs.existsSync(path.join(projectRoot, "docker-compose.yml"));
  const hasApiDir = fs.existsSync(path.join(projectRoot, "server", "src"));
  const isB2BDetected = detectB2BProject(projectRoot);

  const descPath = path.join(projectRoot, "control_center", "final_view", "project_description.md");

  if (!fs.existsSync(descPath)) {
    return { hasDocker: hasDockerFile, hasApi: hasApiDir, isB2B: isB2BDetected };
  }

  try {
    const content = fs.readFileSync(descPath, "utf-8");

    // Intent-based detection from project description
    const hasDockerIntent = /docker|container|compose|postgresql|redis/i.test(content);
    const hasApiIntent = /api|endpoint|rest|graphql|backend|server|express|fastapi|django/i.test(content);

    return {
      hasDocker: hasDockerFile || hasDockerIntent,
      hasApi: hasApiDir || hasApiIntent,
      isB2B: isB2BDetected,
    };
  } catch {
    // project_description.md corrupted → fallback to filesystem
    return { hasDocker: hasDockerFile, hasApi: hasApiDir, isB2B: isB2BDetected };
  }
}

// =============================================================================
// getRequiredSections — статичні обов'язкові секції плану
//
// OPT-11: Визначає секції на основі intent (project_description.md) +
// filesystem fallback. Не залежить від історії — це template.
// =============================================================================

export function getRequiredSections(
  config: OrchestratorConfig,
): CensureHints["required_sections"] {
  const projectRoot = path.resolve(config.control_center_path, "..");
  const ctx = getContextFromDescription(projectRoot);
  const { hasDocker, hasApi, isB2B } = ctx;

  const sections: CensureHints["required_sections"] = [];

  if (hasApi) {
    sections.push({
      rule_id: "B6",
      heading: "Rate Limiting & Cost Caps",
      description:
        "Описати rate limiting для API endpoints. Для AI/LLM — per-user cost caps.",
    });
  }

  sections.push({
    rule_id: "C5",
    heading: "Performance Budget",
    description:
      "page load < 3с, API response < 500мс, JS bundle < 300KB (gzip).",
  });

  sections.push({
    rule_id: "D7",
    heading: "Test Strategy (≥20% integration)",
    description:
      "Визначити мінімум 20% тестів як integration (без моків зовнішніх залежностей).",
  });

  sections.push({
    rule_id: "C3",
    heading: "Crash Recovery",
    description: "Описати поведінку при збої кожного компоненту.",
  });

  if (hasDocker) {
    sections.push({
      rule_id: "C1",
      heading: "Docker Persistence",
      description:
        "Volumes для PostgreSQL, Redis. Дані не втрачаються після docker-compose down && up.",
    });
  }

  sections.push({
    rule_id: "D3",
    heading: "Test Strategy",
    description: "Опис системних тестів після виконання плану.",
  });

  // ── B2B Readiness (Block E) ──
  if (isB2B) {
    sections.push({
      rule_id: "E1",
      heading: "Multi-tenancy / Data Isolation",
      description:
        "Описати як дані ізольовані між користувачами/організаціями. Які таблиці мають user_id/org_id. Як endpoint фільтрує по tenant.",
    });

    sections.push({
      rule_id: "E2",
      heading: "RBAC Matrix",
      description:
        "Таблиця ролей × дозволів. Мінімум: owner/member. Який middleware перевіряє ролі.",
    });

    sections.push({
      rule_id: "E4",
      heading: "Onboarding Flow",
      description:
        "Описати customer journey: register → перший setup → перша цінність. Time-to-value target. Empty states з CTA.",
    });
  }

  // E7 — universal (навіть для non-B2B, бо error UX критичний)
  sections.push({
    rule_id: "E7",
    heading: "Error UX Strategy",
    description:
      "Описати як помилки відображаються користувачу. Не stack traces — людиночитабельні повідомлення. Toast/inline/page error states.",
  });

  return sections;
}

// =============================================================================
// getRecentViolations — прочитати історію порушень з censure_history.json
//
// Агрегує частоту rule_id за останні 5 записів.
// Якщо файл відсутній чи пошкоджений — повертає [].
// =============================================================================

export function getRecentViolations(
  config: OrchestratorConfig,
  projectName?: string,
): CensureHints["recent_violations"] {
  // OPT-5: делегуємо до canonical модуля learning/censure-history.ts
  // OPT-16: project-scoped history (project entries + global)
  try {
    const history = loadCensureHistory(config, projectName);
    return aggregateViolations(history, 5);
  } catch {
    return [];
  }
}

// =============================================================================
// generateCensureHints — головна функція
//
// Збирає required_sections + recent_violations → формує prompt_block.
// Викликається з handleInstructions для D3/L8.
// =============================================================================

export function generateCensureHints(
  config: OrchestratorConfig,
  projectName?: string,
): CensureHints {
  const required_sections = getRequiredSections(config);
  const recent_violations = getRecentViolations(config, projectName);

  // Формування текстового блоку
  const lines: string[] = [
    "## ⚠️ ОБОВ'ЯЗКОВІ СЕКЦІЇ ПЛАНУ (Technical Censure)",
    "",
    "План БУДЕ автоматично перевірено. Кожна з наступних секцій ОБОВ'ЯЗКОВА:",
    "",
  ];

  for (const s of required_sections) {
    lines.push(
      `- **[${s.rule_id}] ${s.heading}:** ${s.description}`,
    );
  }

  if (recent_violations.length > 0) {
    lines.push("");
    lines.push("### Попередні блокування (не повторюйте!):");
    lines.push("");
    for (const v of recent_violations) {
      lines.push(
        `- [${v.rule_id}] ${v.name} — блокувало ${v.count}× за останні цикли`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Якщо секція НЕ стосується цього плану — напишіть explicit 'Не стосується: [причина]'.",
  );

  return {
    required_sections,
    recent_violations,
    prompt_block: lines.join("\n"),
  };
}
