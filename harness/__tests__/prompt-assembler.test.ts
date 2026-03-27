import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assemblePrompt } from '../src/prompt-assembler.ts'
import type { TaskDefinition, FeatureSpec } from '../src/types.ts'

const makeTask = (overrides: Partial<TaskDefinition> = {}): TaskDefinition => ({
  id: 'test-task',
  title: 'Add water tile type',
  spec_id: 'water-tiles',
  output_files: ['src/engine/types.ts'],
  depends_on: [],
  spec_sections: ['test-spec/test-behavior'],
  context_files: [],
  verification: [{ command: 'npx tsc -b --noEmit' }],
  repair: { max_retries: 2, strategy: 'fix-in-place' },
  tags: ['runtime'],
  skip: false,
  ...overrides,
})

const makeSpec = (overrides: Partial<FeatureSpec> = {}): FeatureSpec => ({
  id: 'test-spec',
  name: 'Test spec',
  status: 'implemented',
  priority: 'medium',
  layer: 'engine',
  source_files: [],
  dependencies: [],
  behaviors: [
    {
      id: 'test-behavior',
      description: 'does the thing',
      inputs: ['GameState'],
      outputs: ['boolean'],
      state_changes: [{ field: 'player.x', effect: 'incremented by 1' }],
      determinism: 'deterministic',
    },
  ],
  edge_cases: [
    {
      id: 'test-edge',
      description: 'boundary condition',
      expected: 'returns false',
    },
  ],
  failure_conditions: [{ trigger: 'bad input', expected: 'returns false' }],
  verification: {
    test_file: 'test.ts',
    test_pattern: 'test',
    command: 'npx vitest run test.ts',
  },
  ...overrides,
})

describe('assemblePrompt', () => {
  it('includes system section with output files', () => {
    const prompt = assemblePrompt({
      task: makeTask({ output_files: ['a.ts', 'b.ts'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('=== SYSTEM ===')
    expect(prompt).toContain('You MUST only modify: a.ts, b.ts')
    expect(prompt).toContain('no enums')
  })

  it('includes specification section with resolved behavior', () => {
    const prompt = assemblePrompt({
      task: makeTask({ spec_sections: ['test-spec/test-behavior'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('=== SPECIFICATION ===')
    expect(prompt).toContain('Behavior: test-behavior')
    expect(prompt).toContain('does the thing')
    expect(prompt).toContain('player.x')
  })

  it('includes whole spec when no section ID given', () => {
    const prompt = assemblePrompt({
      task: makeTask({ spec_sections: ['test-spec'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('Spec: test-spec')
    expect(prompt).toContain('Behavior: test-behavior')
    expect(prompt).toContain('Edge case: test-edge')
    expect(prompt).toContain('Failure condition: bad input')
  })

  it('includes edge case sections', () => {
    const prompt = assemblePrompt({
      task: makeTask({ spec_sections: ['test-spec/test-edge'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('Edge case: test-edge')
    expect(prompt).toContain('boundary condition')
  })

  it('resolves bare behavior ID via task spec_id', () => {
    const prompt = assemblePrompt({
      task: makeTask({ spec_id: 'test-spec', spec_sections: ['test-behavior'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('Behavior: test-behavior')
    expect(prompt).toContain('does the thing')
  })

  it('resolves bare edge case ID via task spec_id', () => {
    const prompt = assemblePrompt({
      task: makeTask({ spec_id: 'test-spec', spec_sections: ['test-edge'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('Edge case: test-edge')
    expect(prompt).toContain('boundary condition')
  })

  it('handles missing spec gracefully', () => {
    const prompt = assemblePrompt({
      task: makeTask({ spec_sections: ['nonexistent/foo'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('[spec "nonexistent" not found]')
  })

  it('handles missing section within a spec', () => {
    const prompt = assemblePrompt({
      task: makeTask({ spec_sections: ['test-spec/nonexistent'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('[section "nonexistent" not found in spec "test-spec"]')
  })

  it('reads context files from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prompt-test-'))
    writeFileSync(join(dir, 'example.ts'), 'const x = 1', 'utf-8')

    const prompt = assemblePrompt({
      task: makeTask({ context_files: ['example.ts'] }),
      specs: [makeSpec()],
      repoRoot: dir,
    })

    expect(prompt).toContain('=== EXISTING CODE (read-only) ===')
    expect(prompt).toContain('--- example.ts ---')
    expect(prompt).toContain('const x = 1')
  })

  it('handles missing context files', () => {
    const prompt = assemblePrompt({
      task: makeTask({ context_files: ['missing.ts'] }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('--- missing.ts ---')
    expect(prompt).toContain('[file not found]')
  })

  it('includes task section', () => {
    const prompt = assemblePrompt({
      task: makeTask({ title: 'Do the thing' }),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).toContain('=== TASK ===')
    expect(prompt).toContain('Do the thing. Produce complete contents per output file.')
  })

  it('omits repair section on first attempt', () => {
    const prompt = assemblePrompt({
      task: makeTask(),
      specs: [makeSpec()],
      repoRoot: '/tmp',
    })

    expect(prompt).not.toContain('=== REPAIR ===')
  })

  it('includes repair section when stderr provided', () => {
    const prompt = assemblePrompt({
      task: makeTask(),
      specs: [makeSpec()],
      repoRoot: '/tmp',
      repairStderr: 'TypeError: x is not a function',
    })

    expect(prompt).toContain('=== REPAIR ===')
    expect(prompt).toContain('Previous attempt failed:')
    expect(prompt).toContain('TypeError: x is not a function')
  })
})
