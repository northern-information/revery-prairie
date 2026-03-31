import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunLogger, generateRunId } from '../src/logger.ts'

import type { AttemptRecord, PlanRunResult, TaskResult } from '../src/types.ts'

const makeLogger = () => {
  const dir = mkdtempSync(join(tmpdir(), 'logger-test-'))
  return { dir, logger: createRunLogger(dir, 'test-run') }
}

describe('createRunLogger', () => {
  it('creates the run directory', () => {
    const { dir } = makeLogger()
    expect(existsSync(join(dir, 'test-run'))).toBe(true)
  })

  describe('logPrompt', () => {
    it('writes prompt.md and prompt.sha256', () => {
      const { logger } = makeLogger()
      logger.logPrompt('task-1', 'hello prompt')

      const promptPath = join(logger.runDir, 'tasks', 'task-1', 'prompt.md')
      const hashPath = join(logger.runDir, 'tasks', 'task-1', 'prompt.sha256')

      expect(existsSync(promptPath)).toBe(true)
      expect(readFileSync(promptPath, 'utf-8')).toBe('hello prompt')
      expect(existsSync(hashPath)).toBe(true)
      expect(readFileSync(hashPath, 'utf-8')).toHaveLength(64)
    })
  })

  describe('logAttempt', () => {
    it('writes response, files, verification, and status', () => {
      const { logger } = makeLogger()

      const attempt: AttemptRecord = {
        attempt: 1,
        response: 'LLM response text',
        files_written: ['src/types.ts'],
        verification: [{ command: 'npx tsc', exit_code: 0, stdout: 'ok', stderr: '', passed: true }],
        passed: true,
      }

      const files = new Map([['src/types.ts', 'const x = 1']])
      logger.logAttempt('task-1', attempt, files)

      const base = join(logger.runDir, 'tasks', 'task-1', 'attempts', '1')

      expect(readFileSync(join(base, 'response.md'), 'utf-8')).toBe('LLM response text')
      expect(readFileSync(join(base, 'files', 'types.ts'), 'utf-8')).toBe('const x = 1')

      const verResult = JSON.parse(readFileSync(join(base, 'verification', '0.json'), 'utf-8')) as {
        command: string
        passed: boolean
      }
      expect(verResult.command).toBe('npx tsc')
      expect(verResult.passed).toBe(true)

      const status = JSON.parse(readFileSync(join(base, 'status.json'), 'utf-8')) as { passed: boolean }
      expect(status.passed).toBe(true)
    })
  })

  describe('logTaskResult', () => {
    it('writes result.json', () => {
      const { logger } = makeLogger()

      const result: TaskResult = {
        task_id: 'task-1',
        status: 'passed',
        attempts: [],
        input_checksums: { 'a.ts': 'abc' },
        output_checksums: { 'b.ts': 'def' },
      }

      logger.logTaskResult('task-1', result)

      const resultPath = join(logger.runDir, 'tasks', 'task-1', 'result.json')
      const data = JSON.parse(readFileSync(resultPath, 'utf-8')) as { task_id: string; status: string }
      expect(data.task_id).toBe('task-1')
      expect(data.status).toBe('passed')
    })
  })

  describe('logRunResult', () => {
    it('writes run.json and run-summary.md', () => {
      const { logger } = makeLogger()

      const result: PlanRunResult = {
        plan_id: 'test-plan',
        run_id: 'test-run',
        tasks: [
          {
            task_id: 'task-1',
            status: 'passed',
            attempts: [
              {
                attempt: 1,
                response: '',
                files_written: [],
                verification: [],
                passed: true,
              },
            ],
            input_checksums: {},
            output_checksums: {},
          },
        ],
        summary: { passed: 1, failed: 0, skipped: 0, blocked: 0 },
      }

      logger.logRunResult(result)

      const runJson = JSON.parse(readFileSync(join(logger.runDir, 'run.json'), 'utf-8')) as {
        plan_id: string
        summary: { passed: number }
      }
      expect(runJson.plan_id).toBe('test-plan')
      expect(runJson.summary.passed).toBe(1)

      const summary = readFileSync(join(logger.runDir, 'run-summary.md'), 'utf-8')
      expect(summary).toContain('# Run test-run')
      expect(summary).toContain('task-1')
      expect(summary).toContain('passed: 1')
    })
  })
})

describe('generateRunId', () => {
  it('returns a timestamp-based string', () => {
    const id = generateRunId()
    // format: YYYYMMDD-HHmmss
    expect(id).toMatch(/^\d{8}-\d{6}$/)
  })
})
