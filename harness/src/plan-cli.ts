import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { executePlan } from './executor.ts'

import type { LlmClient, TaskResult } from './types.ts'

const REPO_ROOT = resolve('.')
const LOGS_ROOT = resolve('harness/logs')
const SPECS_DIR = resolve('harness/specs')

const command = process.argv[2]

const printUsage = () => {
  console.log(`usage:
  tsx harness/src/plan-cli.ts run --plan <path> [--force]
  tsx harness/src/plan-cli.ts status [--run <run-id>]`)
}

// --- Stub LLM client ---
// Replace with real implementation when integrating with an LLM API

const stubLlm: LlmClient = {
  generate: (prompt: string) => {
    console.log('\n[stub LLM] received prompt (%d chars). returning empty response.', prompt.length)
    console.log('[stub LLM] replace this with a real LlmClient implementation.\n')
    return Promise.resolve('')
  },
}

// --- Load prior results for incremental rebuilds ---

const loadPriorResults = (logsRoot: string): Map<string, TaskResult> | undefined => {
  if (!existsSync(logsRoot)) return undefined

  const runs = readdirSync(logsRoot)
    .sort((a, b) => a.localeCompare(b))
    .reverse()
  for (const run of runs) {
    const runJson = resolve(logsRoot, run, 'run.json')
    if (existsSync(runJson)) {
      const data = JSON.parse(readFileSync(runJson, 'utf-8')) as {
        tasks: TaskResult[]
      }
      const map = new Map<string, TaskResult>()
      for (const t of data.tasks) {
        map.set(t.task_id, t)
      }
      return map
    }
  }

  return undefined
}

// --- Commands ---

const runCommand = async () => {
  const planIdx = process.argv.indexOf('--plan')
  if (planIdx === -1 || !process.argv[planIdx + 1]) {
    console.error('error: --plan <path> is required')
    printUsage()
    process.exitCode = 1
    return
  }

  const planPath = resolve(process.argv[planIdx + 1])
  const force = process.argv.includes('--force')

  if (!existsSync(planPath)) {
    console.error(`error: plan file not found: ${planPath}`)
    process.exitCode = 1
    return
  }

  const priorResults = force ? undefined : loadPriorResults(LOGS_ROOT)

  console.log(`plan: ${planPath}`)
  console.log(`force: ${String(force)}`)
  console.log(`prior results: ${priorResults ? `${String(priorResults.size)} tasks` : 'none'}`)
  console.log()

  const result = await executePlan({
    planPath,
    specsDir: SPECS_DIR,
    repoRoot: REPO_ROOT,
    logsRoot: LOGS_ROOT,
    llm: stubLlm,
    force,
    priorResults,
  })

  console.log('\n--- run summary ---')
  console.log(`run: ${result.run_id}`)
  console.log(`passed: ${String(result.summary.passed)}`)
  console.log(`failed: ${String(result.summary.failed)}`)
  console.log(`skipped: ${String(result.summary.skipped)}`)
  console.log(`blocked: ${String(result.summary.blocked)}`)

  if (result.summary.failed > 0 || result.summary.blocked > 0) {
    process.exitCode = 1
  }
}

const statusCommand = () => {
  const runIdx = process.argv.indexOf('--run')
  const runId = runIdx !== -1 ? process.argv[runIdx + 1] : undefined

  if (runId) {
    const runJson = resolve(LOGS_ROOT, runId, 'run.json')
    if (!existsSync(runJson)) {
      console.error(`error: run not found: ${runId}`)
      process.exitCode = 1
      return
    }
    const data = JSON.parse(readFileSync(runJson, 'utf-8')) as {
      plan_id: string
      run_id: string
      summary: { passed: number; failed: number; skipped: number; blocked: number }
      tasks: { task_id: string; status: string; attempts: unknown[] }[]
    }
    console.log(`run: ${data.run_id}`)
    console.log(`plan: ${data.plan_id}`)
    console.log(
      `passed: ${String(data.summary.passed)}, failed: ${String(data.summary.failed)}, skipped: ${String(data.summary.skipped)}, blocked: ${String(data.summary.blocked)}`
    )
    console.log()
    for (const t of data.tasks) {
      console.log(`  ${t.task_id}: ${t.status} (${String(t.attempts.length)} attempts)`)
    }
    return
  }

  // list all runs
  if (!existsSync(LOGS_ROOT)) {
    console.log('no runs found')
    return
  }

  const runs = readdirSync(LOGS_ROOT)
    .sort((a, b) => a.localeCompare(b))
    .reverse()
  if (runs.length === 0) {
    console.log('no runs found')
    return
  }

  console.log('recent runs:')
  for (const run of runs.slice(0, 10)) {
    const runJson = resolve(LOGS_ROOT, run, 'run.json')
    if (existsSync(runJson)) {
      const data = JSON.parse(readFileSync(runJson, 'utf-8')) as {
        plan_id: string
        summary: { passed: number; failed: number }
      }
      console.log(
        `  ${run}  plan=${data.plan_id}  passed=${String(data.summary.passed)} failed=${String(data.summary.failed)}`
      )
    } else {
      console.log(`  ${run}  (incomplete)`)
    }
  }
}

// --- Main ---

switch (command) {
  case 'run':
    void runCommand()
    break
  case 'status':
    statusCommand()
    break
  default:
    printUsage()
    process.exitCode = 1
}
