import { parse } from 'yaml'
import Ajv from 'ajv'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  FeatureSpec,
  ValidationError,
  ValidationResult,
  ErrorCode,
  ErrorSeverity,
} from './types.ts'
import { ErrorCode as EC, ErrorSeverity as ES, SpecStatus } from './types.ts'

const BANNED_PHRASES = [
  'handle gracefully',
  'work correctly',
  'as expected',
  'properly',
  'should work',
  'appropriate',
]

const SHELL_INJECTION_PATTERN = /[;&`|$()]/

const err = (
  code: ErrorCode,
  severity: ErrorSeverity,
  specId: string,
  field: string,
  message: string,
): ValidationError => ({ code, severity, specId, field, message })

// --- 1. Load and parse YAML files from a directory ---

const loadSpecFiles = (
  specsDir: string,
): { specs: FeatureSpec[]; errors: ValidationError[] } => {
  const errors: ValidationError[] = []
  const specs: FeatureSpec[] = []

  const files = readdirSync(specsDir).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.yml'),
  )

  for (const file of files) {
    const filePath = join(specsDir, file)
    const raw = readFileSync(filePath, 'utf-8')

    try {
      const parsed = parse(raw) as FeatureSpec
      specs.push(parsed)
    } catch (e) {
      errors.push(
        err(
          EC.YamlParseError,
          ES.Error,
          file,
          '',
          `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
        ),
      )
    }
  }

  return { specs, errors }
}

// --- 2. Schema validation ---

const validateSchema = (
  specs: FeatureSpec[],
  schemaPath: string,
): ValidationError[] => {
  const errors: ValidationError[] = []
  const schema = JSON.parse(
    readFileSync(schemaPath, 'utf-8'),
  ) as Record<string, unknown>
  const ajv = new Ajv({ allErrors: true })
  const check = ajv.compile(schema)

  for (const spec of specs) {
    const valid = check(spec) as boolean
    if (!valid) {
      const specId = (spec as unknown as Record<string, unknown>).id as string | undefined
      for (const e of check.errors ?? []) {
        errors.push(
          err(
            EC.SchemaValidation,
            ES.Error,
            specId ?? '(unknown)',
            e.instancePath || '/',
            `${e.instancePath || '/'}: ${e.message ?? 'schema validation failed'}`,
          ),
        )
      }
    }
  }

  return errors
}

// --- 3. Duplicate IDs ---

const checkDuplicateIds = (specs: FeatureSpec[]): ValidationError[] => {
  const errors: ValidationError[] = []

  // duplicate spec IDs
  const seenSpecIds = new Map<string, number>()
  for (const spec of specs) {
    const count = seenSpecIds.get(spec.id) ?? 0
    seenSpecIds.set(spec.id, count + 1)
  }
  for (const [id, count] of seenSpecIds) {
    if (count > 1) {
      errors.push(
        err(
          EC.DuplicateSpecId,
          ES.Error,
          id,
          'id',
          `spec id "${id}" appears ${count} times`,
        ),
      )
    }
  }

  // duplicate behavior/edge-case IDs within each spec
  for (const spec of specs) {
    const seenBehaviorIds = new Set<string>()
    for (const b of spec.behaviors ?? []) {
      if (seenBehaviorIds.has(b.id)) {
        errors.push(
          err(
            EC.DuplicateBehaviorId,
            ES.Error,
            spec.id,
            `behaviors.${b.id}`,
            `duplicate behavior id "${b.id}" in spec "${spec.id}"`,
          ),
        )
      }
      seenBehaviorIds.add(b.id)
    }

    const seenEdgeCaseIds = new Set<string>()
    for (const ec of spec.edge_cases ?? []) {
      if (seenEdgeCaseIds.has(ec.id)) {
        errors.push(
          err(
            EC.DuplicateEdgeCaseId,
            ES.Error,
            spec.id,
            `edge_cases.${ec.id}`,
            `duplicate edge case id "${ec.id}" in spec "${spec.id}"`,
          ),
        )
      }
      seenEdgeCaseIds.add(ec.id)
    }
  }

  return errors
}

// --- 4. Dependency references ---

const checkDependencyRefs = (specs: FeatureSpec[]): ValidationError[] => {
  const errors: ValidationError[] = []
  const specIds = new Set(specs.map((s) => s.id))

  for (const spec of specs) {
    for (const dep of spec.dependencies ?? []) {
      if (!specIds.has(dep)) {
        errors.push(
          err(
            EC.MissingDependency,
            ES.Error,
            spec.id,
            'dependencies',
            `dependency "${dep}" not found among spec IDs`,
          ),
        )
      }
    }
  }

  return errors
}

// --- 5. Dependency cycles (Kahn's algorithm) ---

const topoSort = (
  specs: FeatureSpec[],
): { order: string[]; errors: ValidationError[] } => {
  const errors: ValidationError[] = []
  const specIds = new Set(specs.map((s) => s.id))

  // build adjacency: dep -> dependents
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const id of specIds) {
    inDegree.set(id, 0)
    dependents.set(id, [])
  }

  for (const spec of specs) {
    for (const dep of spec.dependencies ?? []) {
      if (specIds.has(dep)) {
        inDegree.set(spec.id, (inDegree.get(spec.id) ?? 0) + 1)
        dependents.get(dep)!.push(spec.id)
      }
    }
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const dep of dependents.get(id) ?? []) {
      const newDeg = (inDegree.get(dep) ?? 1) - 1
      inDegree.set(dep, newDeg)
      if (newDeg === 0) queue.push(dep)
    }
  }

  if (order.length < specIds.size) {
    const cycleParticipants = [...specIds].filter(
      (id) => !order.includes(id),
    )
    for (const id of cycleParticipants) {
      errors.push(
        err(
          EC.DependencyCycle,
          ES.Error,
          id,
          'dependencies',
          `spec "${id}" is part of a dependency cycle`,
        ),
      )
    }
  }

  return { order, errors }
}

// --- 6. File existence ---

const checkFileExistence = (
  specs: FeatureSpec[],
  repoRoot: string,
): ValidationError[] => {
  const errors: ValidationError[] = []

  for (const spec of specs) {
    const severity =
      spec.status === SpecStatus.Planned ? ES.Warning : ES.Error

    for (const file of spec.source_files ?? []) {
      if (!existsSync(resolve(repoRoot, file))) {
        errors.push(
          err(
            EC.FileNotFound,
            severity,
            spec.id,
            'source_files',
            `file not found: ${file}`,
          ),
        )
      }
    }

    const testFile = spec.verification?.test_file
    if (testFile && !existsSync(resolve(repoRoot, testFile))) {
      errors.push(
        err(
          EC.FileNotFound,
          severity,
          spec.id,
          'verification.test_file',
          `test file not found: ${testFile}`,
        ),
      )
    }
  }

  return errors
}

// --- 7. Verification command syntax ---

const checkVerificationCommand = (specs: FeatureSpec[]): ValidationError[] => {
  const errors: ValidationError[] = []

  for (const spec of specs) {
    const cmd = spec.verification?.command
    if (!cmd) continue

    if (!cmd.startsWith('npx vitest')) {
      errors.push(
        err(
          EC.InvalidVerificationCommand,
          ES.Error,
          spec.id,
          'verification.command',
          `verification command must start with "npx vitest", got: "${cmd}"`,
        ),
      )
    }

    if (SHELL_INJECTION_PATTERN.test(cmd)) {
      errors.push(
        err(
          EC.InvalidVerificationCommand,
          ES.Error,
          spec.id,
          'verification.command',
          `verification command contains disallowed shell characters: "${cmd}"`,
        ),
      )
    }
  }

  return errors
}

// --- 8. Description concreteness (banned phrases) ---

const checkDescriptions = (specs: FeatureSpec[]): ValidationError[] => {
  const errors: ValidationError[] = []

  const checkText = (
    specId: string,
    field: string,
    text: string,
  ): void => {
    const lower = text.toLowerCase()
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        errors.push(
          err(
            EC.VagueDescription,
            ES.Error,
            specId,
            field,
            `description contains banned vague phrase "${phrase}"`,
          ),
        )
      }
    }
  }

  for (const spec of specs) {
    for (const b of spec.behaviors ?? []) {
      checkText(spec.id, `behaviors.${b.id}.description`, b.description)
    }
    for (const ec of spec.edge_cases ?? []) {
      checkText(spec.id, `edge_cases.${ec.id}.description`, ec.description)
    }
  }

  return errors
}

// --- 9. Determinism consistency ---

const checkDeterminism = (specs: FeatureSpec[]): ValidationError[] => {
  const errors: ValidationError[] = []

  for (const spec of specs) {
    const hasProbabilistic = (spec.behaviors ?? []).some(
      (b) => b.determinism === 'probabilistic',
    )

    if (hasProbabilistic) {
      const edgeCaseTexts = (spec.edge_cases ?? [])
        .map((ec) => `${ec.description} ${ec.expected}`.toLowerCase())
        .join(' ')

      const statisticalTerms = [
        'probability',
        'chance',
        'random',
        'distribution',
        'statistical',
        'bounds',
        'range',
        'average',
        'expected value',
        'frequency',
        'rate',
        'percent',
        '%',
      ]

      const hasStatisticalEdgeCase = statisticalTerms.some((term) =>
        edgeCaseTexts.includes(term),
      )

      if (!hasStatisticalEdgeCase) {
        errors.push(
          err(
            EC.DeterminismInconsistency,
            ES.Warning,
            spec.id,
            'edge_cases',
            'spec has probabilistic behaviors but no edge cases addressing statistical bounds or distributions',
          ),
        )
      }
    }
  }

  return errors
}

// --- Main validate function ---

export const validate = (
  specsDir: string,
  repoRoot: string,
): ValidationResult => {
  const schemaPath = join(specsDir, 'spec-schema.json')
  const { specs, errors: parseErrors } = loadSpecFiles(specsDir)

  const allErrors: ValidationError[] = [...parseErrors]

  // only run further checks on successfully parsed specs
  if (specs.length > 0) {
    allErrors.push(...validateSchema(specs, schemaPath))
    allErrors.push(...checkDuplicateIds(specs))
    allErrors.push(...checkDependencyRefs(specs))

    const { order, errors: cycleErrors } = topoSort(specs)
    allErrors.push(...cycleErrors)

    allErrors.push(...checkFileExistence(specs, repoRoot))
    allErrors.push(...checkVerificationCommand(specs))
    allErrors.push(...checkDescriptions(specs))
    allErrors.push(...checkDeterminism(specs))

    const errors = allErrors.filter((e) => e.severity === 'error')
    const warnings = allErrors.filter((e) => e.severity === 'warning')

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      specs,
      dependencyOrder: order,
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors.filter((e) => e.severity === 'error'),
    warnings: allErrors.filter((e) => e.severity === 'warning'),
    specs: [],
    dependencyOrder: [],
  }
}
