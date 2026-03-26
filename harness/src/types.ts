// --- Enum-like constants (no TS enums — erasableSyntaxOnly) ---

export const SpecStatus = {
  Implemented: 'implemented',
  Partial: 'partial',
  Planned: 'planned',
} as const

export type SpecStatus = (typeof SpecStatus)[keyof typeof SpecStatus]

export const Priority = {
  Critical: 'critical',
  High: 'high',
  Medium: 'medium',
  Low: 'low',
} as const

export type Priority = (typeof Priority)[keyof typeof Priority]

export const TestLayer = {
  Engine: 'engine',
  Component: 'component',
  Integration: 'integration',
} as const

export type TestLayer = (typeof TestLayer)[keyof typeof TestLayer]

export const Determinism = {
  Deterministic: 'deterministic',
  Probabilistic: 'probabilistic',
  TimeBased: 'time-based',
} as const

export type Determinism = (typeof Determinism)[keyof typeof Determinism]

export const ErrorSeverity = {
  Error: 'error',
  Warning: 'warning',
} as const

export type ErrorSeverity = (typeof ErrorSeverity)[keyof typeof ErrorSeverity]

export const ErrorCode = {
  YamlParseError: 'YAML_PARSE_ERROR',
  SchemaValidation: 'SCHEMA_VALIDATION',
  DuplicateSpecId: 'DUPLICATE_SPEC_ID',
  DuplicateBehaviorId: 'DUPLICATE_BEHAVIOR_ID',
  DuplicateEdgeCaseId: 'DUPLICATE_EDGE_CASE_ID',
  MissingDependency: 'MISSING_DEPENDENCY',
  DependencyCycle: 'DEPENDENCY_CYCLE',
  FileNotFound: 'FILE_NOT_FOUND',
  InvalidVerificationCommand: 'INVALID_VERIFICATION_COMMAND',
  VagueDescription: 'VAGUE_DESCRIPTION',
  DeterminismInconsistency: 'DETERMINISM_INCONSISTENCY',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export const TaskStatus = {
  Passed: 'passed',
  Failed: 'failed',
  Skipped: 'skipped',
  Blocked: 'blocked',
} as const

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export const RepairStrategy = {
  FixInPlace: 'fix-in-place',
  RollbackAndRetry: 'rollback-and-retry',
  Skip: 'skip',
} as const

export type RepairStrategy =
  (typeof RepairStrategy)[keyof typeof RepairStrategy]

export const TaskTag = {
  Runtime: 'runtime',
  Gameplay: 'gameplay',
  Rendering: 'rendering',
  UI: 'ui',
  Testing: 'testing',
} as const

export type TaskTag = (typeof TaskTag)[keyof typeof TaskTag]

// --- Spec types ---

export interface StateChange {
  field: string
  effect: string
}

export interface Behavior {
  id: string
  description: string
  inputs: string[]
  outputs: string[]
  state_changes: StateChange[]
  determinism: Determinism
}

export interface EdgeCase {
  id: string
  description: string
  expected: string
}

export interface FailureCondition {
  trigger: string
  expected: string
}

export interface Verification {
  test_file: string
  test_pattern: string
  command: string
}

export interface FeatureSpec {
  id: string
  name: string
  status: SpecStatus
  priority: Priority
  layer: TestLayer
  source_files: string[]
  dependencies: string[]
  behaviors: Behavior[]
  edge_cases: EdgeCase[]
  failure_conditions: FailureCondition[]
  verification: Verification
}

// --- Validation types ---

export interface ValidationError {
  code: ErrorCode
  severity: ErrorSeverity
  specId: string
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  specs: FeatureSpec[]
  dependencyOrder: string[]
}

// --- Plan types ---

export interface VerificationStep {
  command: string
}

export interface RepairPolicy {
  max_retries: number
  strategy: RepairStrategy
}

export interface TaskDefinition {
  id: string
  title: string
  spec_id: string
  output_files: string[]
  depends_on: string[]
  spec_sections: string[]
  context_files: string[]
  verification: VerificationStep[]
  repair: RepairPolicy
  tags: TaskTag[]
  skip: boolean
}

export interface PlanDefinition {
  id: string
  title: string
  created: string
  global_verification: string[]
  tasks: TaskDefinition[]
}

// --- Execution types ---

export interface VerificationResult {
  command: string
  exit_code: number
  stdout: string
  stderr: string
  passed: boolean
}

export interface AttemptRecord {
  attempt: number
  response: string
  files_written: string[]
  verification: VerificationResult[]
  passed: boolean
}

export interface TaskResult {
  task_id: string
  status: TaskStatus
  attempts: AttemptRecord[]
  input_checksums: Record<string, string>
  output_checksums: Record<string, string>
}

export interface PlanRunSummary {
  passed: number
  failed: number
  skipped: number
  blocked: number
}

export interface PlanRunResult {
  plan_id: string
  run_id: string
  tasks: TaskResult[]
  summary: PlanRunSummary
}

// --- LLM client interface (placeholder for phase 3) ---

export interface LlmClient {
  generate: (prompt: string) => Promise<string>
}
