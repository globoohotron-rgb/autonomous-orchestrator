// =============================================================================
// Artifact File Validator — перевірка артефакту при complete
// Перевіряє що файл існує, не порожній, і має базову структуру.
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import type { OrchestratorConfig } from "../types";

// =============================================================================
// Результат валідації
// =============================================================================

export interface ArtifactFileValidation {
  valid: boolean;
  error?: string;
}

// Мінімальний розмір артефакту в байтах (порожній шаблон ≈ 50 байт)
const MIN_ARTIFACT_SIZE_BYTES = 30;

// =============================================================================
// validateArtifactFile — головна функція
// Перевіряє:
//   1. Файл існує на диску
//   2. Файл не порожній (>30 байт)
//   3. Для .md файлів — містить хоча б один заголовок (## або #)
// =============================================================================

export function validateArtifactFile(
  artifactPath: string,
  config: OrchestratorConfig,
): ArtifactFileValidation {
  // Розрахувати абсолютний шлях
  const absolutePath = artifactPath.startsWith("/") || artifactPath.match(/^[a-zA-Z]:/)
    ? artifactPath
    : path.resolve(config.project_root, artifactPath);

  // 1. Файл існує
  if (!fs.existsSync(absolutePath)) {
    return {
      valid: false,
      error: `ARTIFACT_FILE_NOT_FOUND: Файл "${artifactPath}" не існує на диску. Створіть артефакт перед complete.`,
    };
  }

  // 2. Файл не порожній
  const stat = fs.statSync(absolutePath);
  if (stat.size < MIN_ARTIFACT_SIZE_BYTES) {
    return {
      valid: false,
      error: `ARTIFACT_FILE_EMPTY: Файл "${artifactPath}" занадто малий (${stat.size} байт). Мінімум ${MIN_ARTIFACT_SIZE_BYTES} байт.`,
    };
  }

  // 3. Для .md файлів — базова структура
  if (absolutePath.endsWith(".md")) {
    try {
      const content = fs.readFileSync(absolutePath, "utf-8");
      if (!content.includes("#")) {
        return {
          valid: false,
          error: `ARTIFACT_NO_STRUCTURE: Файл "${artifactPath}" не містить жодного заголовка (#). Артефакт має мати структуру.`,
        };
      }
    } catch {
      return {
        valid: false,
        error: `ARTIFACT_READ_ERROR: Не вдалося прочитати файл "${artifactPath}".`,
      };
    }
  }

  return { valid: true };
}
