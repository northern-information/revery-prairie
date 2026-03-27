import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { parse } from 'yaml'
import type {
  LlmClient,
  TaskDefinition,
  TaskResult,
  PlanRunResult,
  PlanRunSummary,
  AttemptRecord,
  VerificationResult,
  FeatureSpec,
} from './types.ts'
import { TaskStatus } from './types.ts'
import { parsePlan } from './plan-parser.ts'
import { assemblePrompt } from './prompt-assembler.ts'
import { hashFiles, checksumsMatch } from './checksum.ts'
import { createRunLogger, generateRunId } from './logger.ts'

export interface ExecutorOptions {
  planPath: string
  specsDir: string
  repoRoot: string
  logsRoot: string
  llm: LlmClient
  force?: boolean
  priorResults?: Map<string, TaskResult>
}

// --- Parse LLM response into file blocks ---
// Expected format:
// --- path/to/file.ts ---
// <file contents>
// --- path/to/other.ts ---
// <file contents>

const parseFileBlocks = (
  response: string,
): Map<string, string> => {
  const files = new Map<string, string>()
  const lines = response.split('\n')
  let currentPath: string | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (currentPath) {
      files.set(currentPath, currentLines.join('\n'))
    }
  }

  for (const line of lines) {
    const match = /^---\s+(.+?)\s+---$/.exec(line)
    if (match) {
      flush()
      currentPath = match[1] ?? ''
      currentLines = []
    } else if (currentPath) {
      currentLines.push(line)
    }
  }
  flush()

  // trim trailing newline from each file
  for (const [path, content] of files) {
    files.set(path, content.replace(/\n$/, ''))
  }

  return files
}

// --- Run a verification command ---

const runVerification = (
  command: string,
  repoRoot: string,
): VerificationResult => {
  try {
    const stdout = execSync(command, {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { command, exit_code: 0, stdout, stderr: '', passed: true }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return {
      command,
      exit_code: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      passed: false,
    }
  }
}

// --- Snapshot and restore for rollback-and-retry ---

const snapshotFiles = (
  files: string[],
  repoRoot: string,
): Map<string, Buffer | null> => {
  const snapshots = new Map<string, Buffer | null>()
  for (const file of files) {
    const fullPath = resolve(repoRoot, file)
    if (existsSync(fullPath)) {
      snapshots.set(file, readFileSync(fullPath))
    } else {
      snapshots.set(file, null)
    }
  }
  return snapshots
}

const restoreFiles = (
  snapshots: Map<string, Buffer | null>,
  repoRoot: string,
): void => {
  for (const [file, contents] of snapshots) {
    const fullPath = resolve(repoRoot, file)
    if (contents === null) {
      // file didn't exist before — leave it (don't delete, could be dangerous)
    } else {
      writeFileSync(fullPath, contents)
    }
  }
}

// --- Write parsed files to disk ---

const writeFiles = (
  files: Map<string, string>,
  repoRoot: string,
): void => {
  for (const [filePath, contents] of files) {
    const fullPath = resolve(repoRoot, filePath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, contents, 'utf-8')
  }
}

// --- Validate output boundary ---

const validateOutputBoundary = (
  produced: Map<string, string>,
  allowed: string[],
): string[] => {
  const allowedSet = new Set(allowed)
  const violations: string[] = []
  for (const path of produced.keys()) {
    if (!allowedSet.has(path)) {
      violations.push(path)
    }
  }
  return violations
}

// --- Load specs from directory ---

const loadSpecs = (specsDir: string): FeatureSpec[] => {
  const files = readdirSync(specsDir).filter(
    (f: string) => f.endsWith('.yaml') || f.endsWith('.yml'),
  )

  return files.map((f: string) => {
    const raw = readFileSync(join(specsDir, f), 'utf-8')
    return parse(raw) as FeatureSpec
  })
}

// --- Execute a single task ---

const executeTask = async (
  task: TaskDefinition,
  specs: FeatureSpec[],
  opts: ExecutorOptions,
  logger: ReturnType<typeof createRunLogger>,
): Promise<TaskResult> => {
  const { repoRoot, llm } = opts
  const attempts: AttemptRecord[] = []
  const maxAttempts = task.repair.strategy === 'skip' ? 1 : task.repair.max_retries + 1

  // snapshot for rollback-and-retry
  const snapshots =
    task.repair.strategy === 'rollback-and-retry'
      ? snapshotFiles(task.output_files, repoRoot)
      : null

  let repairStderr: string | undefined

  for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
    // restore on rollback retries (after first attempt)
    if (snapshots && attemptNum > 1) {
      restoreFiles(snapshots, repoRoot)
    }

    // assemble prompt
    const prompt = assemblePrompt({
      task,
      specs,
      repoRoot,
      repairStderr: attemptNum > 1 ? repairStderr : undefined,
    })
    if (attemptNum === 1) {
      logger.logPrompt(task.id, prompt)
    }

    // call LLM
    const response = await llm.generate(prompt)

    // parse response into file blocks
    const fileBlocks = parseFileBlocks(response)

    // validate output boundary
    const violations = validateOutputBoundary(fileBlocks, task.output_files)
    if (violations.length > 0) {
      const errorMsg = `LLM produced files outside output boundary: ${violations.join(', ')}`
      const attempt: AttemptRecord = {
        attempt: attemptNum,
        response,
        files_written: [],
        verification: [
          {
            command: '(output boundary check)',
            exit_code: 1,
            stdout: '',
            stderr: errorMsg,
            passed: false,
          },
        ],
        passed: false,
      }
      attempts.push(attempt)
      logger.logAttempt(task.id, attempt, fileBlocks)
      repairStderr = errorMsg
      continue
    }

    // write files
    writeFiles(fileBlocks, repoRoot)

    // run verification commands
    const verResults: VerificationResult[] = []
    let allPassed = true
    for (const step of task.verification) {
      const result = runVerification(step.command, repoRoot)
      verResults.push(result)
      if (!result.passed) {
        allPassed = false
        repairStderr = result.stderr || result.stdout
        break
      }
    }

    const attempt: AttemptRecord = {
      attempt: attemptNum,
      response,
      files_written: [...fileBlocks.keys()],
      verification: verResults,
      passed: allPassed,
    }
    attempts.push(attempt)
    logger.logAttempt(task.id, attempt, fileBlocks)

    if (allPassed) {
      break
    }
  }

  const passed = attempts.some((a) => a.passed)
  const specIds = new Set(
    task.spec_sections.map((s) => (s.includes('/') ? s.split('/')[0] : task.spec_id)),
  )
  const inputChecksums = hashFiles(
    [...task.context_files, ...[...specIds].map((id) => `harness/specs/${id}.yaml`)],
    repoRoot,
  )
  const outputChecksums = hashFiles(task.output_files, repoRoot)

  const result: TaskResult = {
    task_id: task.id,
    status: passed ? TaskStatus.Passed : TaskStatus.Failed,
    attempts,
    input_checksums: inputChecksums as Record<string, string>,
    output_checksums: outputChecksums as Record<string, string>,
  }

  logger.logTaskResult(task.id, result)
  return result
}

// --- Main executor ---

export const executePlan = async (
  opts: ExecutorOptions,
): Promise<PlanRunResult> => {
  const { planPath, specsDir, repoRoot, logsRoot, force, priorResults } = opts

  const parseResult = parsePlan(planPath)
  if (!parseResult.valid || !parseResult.plan) {
    throw new Error(
      `Plan validation failed:\n${parseResult.errors.map((e) => `  ${e.field}: ${e.message}`).join('\n')}`,
    )
  }

  const { plan, tiers } = parseResult
  const specs = loadSpecs(specsDir)
  const runId = generateRunId()
  const logger = createRunLogger(logsRoot, runId)

  const taskMap = new Map(plan.tasks.map((t) => [t.id, t]))
  const results = new Map<string, TaskResult>()
  const failedTasks = new Set<string>()

  // process tiers in order
  for (const tier of tiers) {
    // tasks within a tier could run in parallel, but we run sequentially for now
    for (const taskId of tier) {
      const task = taskMap.get(taskId)
      if (!task) continue

      // skip flag
      if (task.skip) {
        const result: TaskResult = {
          task_id: taskId,
          status: TaskStatus.Skipped,
          attempts: [],
          input_checksums: {},
          output_checksums: {},
        }
        results.set(taskId, result)
        logger.logTaskResult(taskId, result)
        continue
      }

      // blocked check — any dependency failed?
      const blocked = task.depends_on.some((dep) => failedTasks.has(dep))
      if (blocked) {
        const result: TaskResult = {
          task_id: taskId,
          status: TaskStatus.Blocked,
          attempts: [],
          input_checksums: {},
          output_checksums: {},
        }
        results.set(taskId, result)
        failedTasks.add(taskId)
        logger.logTaskResult(taskId, result)
        continue
      }

      // checksum cache check
      if (!force && priorResults) {
        const prior = priorResults.get(taskId)
        if (prior?.status === TaskStatus.Passed) {
          const currentInputs = hashFiles(
            task.context_files,
            repoRoot,
          ) as Record<string, string>
          const currentOutputs = hashFiles(
            task.output_files,
            repoRoot,
          ) as Record<string, string>

          if (
            checksumsMatch(prior.input_checksums, currentInputs) &&
            checksumsMatch(prior.output_checksums, currentOutputs)
          ) {
            results.set(taskId, prior)
            logger.logTaskResult(taskId, prior)
            continue
          }
        }
      }

      // execute
      const result = await executeTask(task, specs, opts, logger)
      results.set(taskId, result)
      if (result.status === TaskStatus.Failed) {
        failedTasks.add(taskId)
      }
    }
  }

  // global verification (only if no task failures)
  if (failedTasks.size === 0 && plan.global_verification.length > 0) {
    console.log('\nrunning global verification...')
    for (const cmd of plan.global_verification) {
      const result = runVerification(cmd, repoRoot)
      if (!result.passed) {
        console.log(`  global verification failed: ${cmd}`)
        console.log(`  stderr: ${result.stderr}`)
      } else {
        console.log(`  passed: ${cmd}`)
      }
    }
  }

  // build summary
  const allResults = [...results.values()]
  const summary: PlanRunSummary = {
    passed: allResults.filter((r) => r.status === TaskStatus.Passed).length,
    failed: allResults.filter((r) => r.status === TaskStatus.Failed).length,
    skipped: allResults.filter((r) => r.status === TaskStatus.Skipped).length,
    blocked: allResults.filter((r) => r.status === TaskStatus.Blocked).length,
  }

  const runResult: PlanRunResult = {
    plan_id: plan.id,
    run_id: runId,
    tasks: allResults,
    summary,
  }

  logger.logRunResult(runResult)

  return runResult
}
