import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import type {
  TaskResult,
  PlanRunResult,
  AttemptRecord,
} from './types.ts'

export interface RunLogger {
  runDir: string
  logPrompt: (taskId: string, prompt: string) => void
  logAttempt: (taskId: string, attempt: AttemptRecord, files: Map<string, string>) => void
  logTaskResult: (taskId: string, result: TaskResult) => void
  logRunResult: (result: PlanRunResult) => void
}

const ensureDir = (dir: string): void => {
  mkdirSync(dir, { recursive: true })
}

const writeJson = (filePath: string, data: unknown): void => {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export const createRunLogger = (logsRoot: string, runId: string): RunLogger => {
  const runDir = join(logsRoot, runId)
  ensureDir(runDir)

  const taskDir = (taskId: string): string => {
    const dir = join(runDir, 'tasks', taskId)
    ensureDir(dir)
    return dir
  }

  const logPrompt = (taskId: string, prompt: string): void => {
    const dir = taskDir(taskId)
    writeFileSync(join(dir, 'prompt.md'), prompt, 'utf-8')
    const hash = createHash('sha256').update(prompt).digest('hex')
    writeFileSync(join(dir, 'prompt.sha256'), hash, 'utf-8')
  }

  const logAttempt = (
    taskId: string,
    attempt: AttemptRecord,
    files: Map<string, string>,
  ): void => {
    const dir = taskDir(taskId)
    const attemptDir = join(dir, 'attempts', String(attempt.attempt))
    ensureDir(attemptDir)

    // raw LLM response
    writeFileSync(join(attemptDir, 'response.md'), attempt.response, 'utf-8')

    // archival copies of written files
    const filesDir = join(attemptDir, 'files')
    ensureDir(filesDir)
    for (const [filePath, contents] of files) {
      const dest = join(filesDir, basename(filePath))
      writeFileSync(dest, contents, 'utf-8')
    }

    // verification results
    const verDir = join(attemptDir, 'verification')
    ensureDir(verDir)
    for (let i = 0; i < attempt.verification.length; i++) {
      writeJson(join(verDir, `${i}.json`), attempt.verification[i])
    }

    // attempt status
    writeJson(join(attemptDir, 'status.json'), {
      passed: attempt.passed,
    })
  }

  const logTaskResult = (taskId: string, result: TaskResult): void => {
    const dir = taskDir(taskId)
    writeJson(join(dir, 'result.json'), result)
  }

  const logRunResult = (result: PlanRunResult): void => {
    writeJson(join(runDir, 'run.json'), result)
    writeFileSync(join(runDir, 'run-summary.md'), formatRunSummary(result), 'utf-8')
  }

  return { runDir, logPrompt, logAttempt, logTaskResult, logRunResult }
}

// --- Run summary formatting ---

const formatRunSummary = (result: PlanRunResult): string => {
  const lines: string[] = [
    `# Run ${result.run_id}`,
    `Plan: ${result.plan_id}`,
    '',
    `| Task | Status | Attempts |`,
    `|------|--------|----------|`,
  ]

  for (const task of result.tasks) {
    lines.push(
      `| ${task.task_id} | ${task.status} | ${task.attempts.length} |`,
    )
  }

  lines.push(
    '',
    `## Summary`,
    `- passed: ${result.summary.passed}`,
    `- failed: ${result.summary.failed}`,
    `- skipped: ${result.summary.skipped}`,
    `- blocked: ${result.summary.blocked}`,
  )

  return lines.join('\n')
}

/**
 * Generate a run ID from the current timestamp.
 */
export const generateRunId = (): string => {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}
