import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { stringify } from 'yaml'
import { executePlan } from '../src/executor.ts'
import type { LlmClient } from '../src/types.ts'

const REPO_ROOT = resolve(import.meta.dirname, '../..')
const SCHEMA_SRC = resolve(REPO_ROOT, 'harness/specs/spec-schema.json')

// minimal spec that references real files in the repo
const minimalSpec = () => ({
  id: 'test-spec',
  name: 'Test spec',
  status: 'implemented',
  priority: 'medium',
  layer: 'engine',
  source_files: ['src/engine/types.ts'],
  dependencies: [],
  behaviors: [
    {
      id: 'test-behavior',
      description: 'this is a sufficiently long description for the behavior',
      inputs: ['GameState'],
      outputs: ['boolean'],
      state_changes: [],
      determinism: 'deterministic',
    },
  ],
  edge_cases: [
    {
      id: 'test-edge',
      description: 'this is a sufficiently long description for the edge case',
      expected: 'returns false',
    },
  ],
  failure_conditions: [{ trigger: 'bad input', expected: 'returns false' }],
  verification: {
    test_file: 'src/engine/__tests__/actions.test.ts',
    test_pattern: 'test',
    command: 'npx vitest run src/engine/__tests__/actions.test.ts',
  },
})

const setupDirs = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'executor-test-'))
  const specsDir = join(tmp, 'specs')
  const plansDir = join(tmp, 'plans')
  const logsDir = join(tmp, 'logs')
  mkdirSync(specsDir, { recursive: true })
  mkdirSync(plansDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true })

  // write spec + schema
  writeFileSync(join(specsDir, 'test.yaml'), stringify(minimalSpec()), 'utf-8')
  cpSync(SCHEMA_SRC, join(specsDir, 'spec-schema.json'))

  return { tmp, specsDir, plansDir, logsDir }
}

const writePlan = (plansDir: string, tasks: Record<string, unknown>[]) => {
  const planPath = join(plansDir, 'test-plan.yaml')
  writeFileSync(
    planPath,
    stringify({
      plan: {
        id: 'test-plan',
        title: 'Test plan',
        created: '2026-03-26',
        global_verification: [],
      },
      tasks,
    }),
    'utf-8',
  )
  return planPath
}

const mockLlm = (response: string): LlmClient => ({
  generate: async () => response,
})

describe('executePlan', () => {
  it('skips tasks with skip: true', async () => {
    const { specsDir, plansDir, logsDir } = setupDirs()
    const planPath = writePlan(plansDir, [
      {
        id: 'skipped-task',
        title: 'Should be skipped',
        spec_id: 'test-spec',
        output_files: ['out.ts'],
        depends_on: [],
        spec_sections: ['test-spec'],
        context_files: [],
        verification: [],
        repair: { max_retries: 0, strategy: 'skip' },
        tags: [],
        skip: true,
      },
    ])

    const result = await executePlan({
      planPath,
      specsDir,
      repoRoot: REPO_ROOT,
      logsRoot: logsDir,
      llm: mockLlm(''),
    })

    expect(result.summary.skipped).toBe(1)
    expect(result.tasks[0]!.status).toBe('skipped')
  })

  it('blocks tasks when dependencies fail', async () => {
    const { specsDir, plansDir, logsDir } = setupDirs()

    // LLM returns empty response — verification will fail since no files written
    const planPath = writePlan(plansDir, [
      {
        id: 'parent',
        title: 'Parent task',
        spec_id: 'test-spec',
        output_files: ['out.ts'],
        depends_on: [],
        spec_sections: ['test-spec'],
        context_files: [],
        verification: [{ command: 'false' }], // always fails
        repair: { max_retries: 0, strategy: 'skip' },
        tags: [],
        skip: false,
      },
      {
        id: 'child',
        title: 'Child task',
        spec_id: 'test-spec',
        output_files: ['out2.ts'],
        depends_on: ['parent'],
        spec_sections: ['test-spec'],
        context_files: [],
        verification: [],
        repair: { max_retries: 0, strategy: 'skip' },
        tags: [],
        skip: false,
      },
    ])

    const result = await executePlan({
      planPath,
      specsDir,
      repoRoot: REPO_ROOT,
      logsRoot: logsDir,
      llm: mockLlm(''),
    })

    expect(result.tasks.find((t) => t.task_id === 'parent')!.status).toBe('failed')
    expect(result.tasks.find((t) => t.task_id === 'child')!.status).toBe('blocked')
    expect(result.summary.failed).toBe(1)
    expect(result.summary.blocked).toBe(1)
  })

  it('rejects LLM output outside the output boundary', async () => {
    const { specsDir, plansDir, logsDir } = setupDirs()
    const planPath = writePlan(plansDir, [
      {
        id: 'boundary-task',
        title: 'Boundary check',
        spec_id: 'test-spec',
        output_files: ['allowed.ts'],
        depends_on: [],
        spec_sections: ['test-spec'],
        context_files: [],
        verification: [{ command: 'true' }],
        repair: { max_retries: 0, strategy: 'skip' },
        tags: [],
        skip: false,
      },
    ])

    // LLM produces a file not in output_files
    const llm = mockLlm(
      '--- not-allowed.ts ---\nconst x = 1',
    )

    const result = await executePlan({
      planPath,
      specsDir,
      repoRoot: REPO_ROOT,
      logsRoot: logsDir,
      llm,
    })

    expect(result.tasks[0]!.status).toBe('failed')
    expect(
      result.tasks[0]!.attempts[0]!.verification[0]!.stderr,
    ).toContain('outside output boundary')
  })

  it('passes when LLM produces valid files and verification succeeds', async () => {
    const { specsDir, plansDir, logsDir } = setupDirs()

    // use a temp output file so we don't clobber real code
    const tmp = mkdtempSync(join(tmpdir(), 'executor-output-'))
    const outFile = 'tmp-output.ts'

    const planPath = writePlan(plansDir, [
      {
        id: 'good-task',
        title: 'Good task',
        spec_id: 'test-spec',
        output_files: [outFile],
        depends_on: [],
        spec_sections: ['test-spec'],
        context_files: [],
        verification: [{ command: 'true' }], // always passes
        repair: { max_retries: 0, strategy: 'skip' },
        tags: [],
        skip: false,
      },
    ])

    const llm = mockLlm(`--- ${outFile} ---\nexport const x = 1`)

    const result = await executePlan({
      planPath,
      specsDir,
      repoRoot: tmp,
      logsRoot: logsDir,
      llm,
    })

    expect(result.summary.passed).toBe(1)
    expect(result.tasks[0]!.status).toBe('passed')

    // verify file was written
    const written = readFileSync(join(tmp, outFile), 'utf-8')
    expect(written).toBe('export const x = 1')
  })

  it('writes run.json to logs directory', async () => {
    const { specsDir, plansDir, logsDir } = setupDirs()
    const planPath = writePlan(plansDir, [
      {
        id: 'log-task',
        title: 'Log task',
        spec_id: 'test-spec',
        output_files: ['out.ts'],
        depends_on: [],
        spec_sections: ['test-spec'],
        context_files: [],
        verification: [{ command: 'true' }],
        repair: { max_retries: 0, strategy: 'skip' },
        tags: [],
        skip: true,
      },
    ])

    const result = await executePlan({
      planPath,
      specsDir,
      repoRoot: REPO_ROOT,
      logsRoot: logsDir,
      llm: mockLlm(''),
    })

    const runJson = join(logsDir, result.run_id, 'run.json')
    const data = JSON.parse(readFileSync(runJson, 'utf-8'))
    expect(data.plan_id).toBe('test-plan')
  })
})
