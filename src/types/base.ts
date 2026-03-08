// =============================================================================
// Base — фундаментальні типи що використовуються скрізь
// Винесені окремо щоб уникнути циклічних залежностей
// =============================================================================

// --- Блоки системи ---

export type Block =
  | "discovery"
  | "foundation"
  | "development_cycle"
  | "validation_cycle"
  | "security_fix_cycle"
  | "linear_exit";

// --- Всі кроки системи ---

export type Step =
  // Discovery (Блок 1)
  | "L1"    // Project Init
  | "L2"    // Discovery
  | "L3"    // Design Brief
  | "L3b"   // Design Identity
  | "L4"    // GO / REWORK / KILL gate
  | "L5"    // Product Description
  | "L6"    // Design Specification
  | "L7"    // Behavior Specification
  // Foundation (Блок 2)
  | "L8"    // Zero Plan
  | "L9"    // Task Creation
  | "L10"   // Task Execution
  | "L10b"  // Foundation Plan Verification
  | "L11"   // Plan Closure
  | "L12"   // HANSEI
  | "L13"   // Completion Checklist
  | "GATE1" // Foundation Gate
  // Development Cycle (Блок 3)
  | "D1"    // Cycle Checkpoint
  | "D2"    // OBSERVE
  | "D3"    // Development Plan
  | "D4"    // Task Creation
  | "D5"    // Task Execution
  | "D6"    // Plan Completion Check
  | "D7"    // Plan Closure
  | "D8"    // HANSEI
  | "D9"    // Goals Check + Mini-GATE
  // Validation (Блок 4)
  | "V0"    // UI Baseline Review
  | "V0_5"  // Smoke Test — UI Interaction Verifier
  | "V1"    // Independent Audit
  | "V2"    // Audit Decision
  | "V3"    // HANSEI + Validation Conclusions
  // Security Fix (Блок 5)
  | "S1"    // Read issue + standard
  | "S2"    // Create tasks
  | "S3"    // Execute tasks
  | "S4"    // Internal audit
  | "S5"    // Closure + human decision
  // Linear Exit (Блок 6)
  | "E1"    // Release Readiness
  | "E2";   // Product Ready

// --- Статус виконання ---

export type Status =
  | "in_progress"
  | "awaiting_human_decision"
  | "blocked"
  | "completed"
  | "cancelled";

// --- Реєстр артефактів (12 ключів) ---

export interface ArtifactRegistry {
  observe_report: string | null;
  plan: string | null;
  plan_completion: string | null;
  hansei: string | null;
  goals_check: string | null;
  gate_decision: string | null;
  ui_review: string | null;
  smoke_test: string | null;
  acceptance_report: string | null;
  hansei_audit: string | null;
  validation_conclusions: string | null;
  security_scan: string | null;
  s_block_decision: string | null;
}

export type ArtifactKey = keyof ArtifactRegistry;
