import { parsePlanYaml } from '../src/plan-parser.ts'

const minimalTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  title: 'Test task',
  spec_id: 'test-spec',
  output_files: ['src/engine/types.ts'],
  depends_on: [],
  spec_sections: ['test-spec'],
  context_files: ['src/engine/types.ts'],
  verification: [{ command: 'npx tsc -b --noEmit' }],
  repair: { max_retries: 2, strategy: 'fix-in-place' },
  tags: ['runtime'],
  skip: false,
  ...overrides,
})

const minimalPlan = (overrides: Record<string, unknown> = {}) => {
  const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
  return stringify({
    plan: {
      id: 'test-plan',
      title: 'Test plan',
      created: '2026-03-26',
      global_verification: ['npm run build'],
    },
    tasks: [minimalTask()],
    ...overrides,
  })
}

describe('parsePlanYaml', () => {
  describe('happy path', () => {
    it('parses a valid plan', () => {
      const result = parsePlanYaml(minimalPlan())

      expect(result.valid).toBe(true)
      expect(result.plan).not.toBeNull()
      expect(result.plan!.id).toBe('test-plan')
      expect(result.plan!.tasks).toHaveLength(1)
      expect(result.tiers).toEqual([['task-1']])
      expect(result.errors).toHaveLength(0)
    })

    it('sorts tasks into tiers by dependencies', () => {
      const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
      const raw = stringify({
        plan: { id: 'p', title: 'P', created: '2026-03-26', global_verification: [] },
        tasks: [
          minimalTask({ id: 'a', depends_on: [] }),
          minimalTask({ id: 'b', depends_on: ['a'] }),
          minimalTask({ id: 'c', depends_on: ['a'] }),
        ],
      })

      const result = parsePlanYaml(raw)

      expect(result.valid).toBe(true)
      expect(result.tiers).toHaveLength(2)
      expect(result.tiers[0]).toEqual(['a'])
      expect(result.tiers[1]!.sort()).toEqual(['b', 'c'])
    })
  })

  describe('YAML errors', () => {
    it('reports YAML parse errors', () => {
      const result = parsePlanYaml(':\n  :\n    - [\n{{{')

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('structural errors', () => {
    it('reports missing plan key', () => {
      const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
      const raw = stringify({ tasks: [minimalTask()] })

      const result = parsePlanYaml(raw)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'plan')).toBe(true)
    })

    it('reports missing tasks key', () => {
      const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
      const raw = stringify({
        plan: { id: 'p', title: 'P', created: '2026-03-26' },
      })

      const result = parsePlanYaml(raw)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'tasks')).toBe(true)
    })

    it('reports missing plan id', () => {
      const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
      const raw = stringify({
        plan: { title: 'P', created: '2026-03-26' },
        tasks: [minimalTask()],
      })

      const result = parsePlanYaml(raw)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'plan.id')).toBe(true)
    })
  })

  describe('task validation', () => {
    it('reports duplicate task IDs', () => {
      const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
      const raw = stringify({
        plan: { id: 'p', title: 'P', created: '2026-03-26', global_verification: [] },
        tasks: [minimalTask({ id: 'dupe' }), minimalTask({ id: 'dupe' })],
      })

      const result = parsePlanYaml(raw)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('duplicate'))).toBe(true)
    })

    it('reports missing dependency references', () => {
      const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
      const raw = stringify({
        plan: { id: 'p', title: 'P', created: '2026-03-26', global_verification: [] },
        tasks: [minimalTask({ depends_on: ['nonexistent'] })],
      })

      const result = parsePlanYaml(raw)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('not found'))).toBe(true)
    })

    it('reports dependency cycles among tasks', () => {
      const { stringify } = require('yaml') as { stringify: (v: unknown) => string }
      const raw = stringify({
        plan: { id: 'p', title: 'P', created: '2026-03-26', global_verification: [] },
        tasks: [
          minimalTask({ id: 'a', depends_on: ['b'] }),
          minimalTask({ id: 'b', depends_on: ['a'] }),
        ],
      })

      const result = parsePlanYaml(raw)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('cycle'))).toBe(true)
    })
  })
})
