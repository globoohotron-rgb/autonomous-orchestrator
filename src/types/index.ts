// =============================================================================
// Barrel export — всі типи системи
// =============================================================================

// Base (фундаментальні типи)
export type { Block, Step, Status, ArtifactRegistry, ArtifactKey } from "./base";

// State
export {
  SystemState,
  OrchestratorConfig,
  TransitionEntry,
  CensureBlockTracker,
  createEmptyArtifactRegistry,
  createInitialState,
} from "./state";

// Steps
export {
  StepType,
  AgentRole,
  AgentRoleId,
  AGENT_ROLES,
  PreconditionType,
  PreconditionCheck,
  InputSource,
  InputReference,
  AlgorithmStep,
  ArtifactOutput,
  Transition,
  StepDefinition,
  ArtifactRotation,
  BLOCK_NAMES,
  STEP_NAMES,
} from "./steps";

// Artifacts
export {
  ArtifactNamingRule,
  ARTIFACT_NAMING_RULES,
  IMMUTABLE_PATHS,
  V_BLOCK_ARTIFACT_KEYS,
  S_BLOCK_ARTIFACT_KEYS,
  ALL_ARTIFACT_KEYS,
  ARCHIVE_DIRECTORIES,
  formatDateForArtifact,
  resolveArtifactName,
} from "./artifacts";

// Decisions
export {
  EntryGateDecision,
  FoundationGateDecision,
  MiniGateDecision,
  V3Decision,
  SBlockDecision,
  ReleaseDecision,
  AnyGateDecision,
  AuditVerdict,
  ReleaseVerdict,
  UIVerdict,
  CensureVerdict,
  GoalsCheckVerdict,
  PlanItemVerdict,
  GateDecisionFile,
  DefectSeverity,
  MajorSubcategory,
  Defect,
  JidokaCriterion,
  JIDOKA_CRITERIA,
  CensureRule,
  CensureBlock,
} from "./decisions";

// CLI
export {
  CLICommand,
  CLIResponse,
  CLIError,
  CLIErrorCode,
  CLIOutput,
  StatusData,
  CheckData,
  PreconditionResult,
  InstructionsData,
  ResolvedInput,
  CompleteData,
  DecideData,
  DaemonData,
  QueueData,
  AnalyzeData,
  CLIArgs,
  parseCLIArgs,
} from "./cli";
