import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { validate } from '../src/validator.ts'
import { stringify } from 'yaml'

const REPO_ROOT = resolve(import.meta.dirname, '../..')
const SCHEMA_SRC = resolve(REPO_ROOT, 'harness/specs/spec-schema.json')

const makeSpecDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-test-'))
  // copy the schema into the temp specs dir (validator expects it there)
  cpSync(SCHEMA_SRC, join(dir, 'spec-schema.json'))
  return dir
}

const minimalSpec = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-spec',
  name: 'Test spec',
  status: 'implemented',
  priority: 'medium',
  layer: 'engine',
  source_files: ['src/engine/movement.ts'],
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
      id: 'test-edge-case',
      description: 'this is a sufficiently long description for the edge case',
      expected: 'returns false',
    },
  ],
  failure_conditions: [{ trigger: 'bad input', expected: 'returns false' }],
  verification: {
    test_file: 'src/engine/__tests__/movement.test.ts',
    test_pattern: 'movePlayer',
    command: 'npx vitest run src/engine/__tests__/movement.test.ts',
  },
  ...overrides,
})

const writeSpec = (dir: string, filename: string, content: unknown) => {
  writeFileSync(join(dir, filename), stringify(content), 'utf-8')
}

const writeRawSpec = (dir: string, filename: string, raw: string) => {
  writeFileSync(join(dir, filename), raw, 'utf-8')
}

// --- Happy path ---

describe('validator', () => {
  describe('happy path', () => {
    it('validates a correct spec with no errors', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'test.yaml', minimalSpec())

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
      expect(result.specs).toHaveLength(1)
      expect(result.dependencyOrder).toEqual(['test-spec'])
    })

    it('returns topological order respecting dependencies', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'a.yaml', minimalSpec({ id: 'spec-a', dependencies: [] }))
      writeSpec(dir, 'b.yaml', minimalSpec({ id: 'spec-b', dependencies: ['spec-a'] }))

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(true)
      expect(result.dependencyOrder).toEqual(['spec-a', 'spec-b'])
    })
  })

  // --- 1. YAML parse errors ---

  describe('YAML parse errors', () => {
    it('reports YAML parse errors', () => {
      const dir = makeSpecDir()
      writeRawSpec(dir, 'bad.yaml', ':\n  :\n    - [\ninvalid: {{{')

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'YAML_PARSE_ERROR')).toBe(true)
    })
  })

  // --- 2. Schema validation ---

  describe('schema validation', () => {
    it('reports missing required fields', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'bad.yaml', { id: 'bad-spec', name: 'Bad' })

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'SCHEMA_VALIDATION')).toBe(true)
    })

    it('reports invalid id format (not kebab-case)', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'bad.yaml', minimalSpec({ id: 'BadCase' }))

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'SCHEMA_VALIDATION' && e.field.includes('id'))).toBe(true)
    })

    it('reports invalid status value', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'bad.yaml', minimalSpec({ status: 'unknown' }))

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'SCHEMA_VALIDATION')).toBe(true)
    })
  })

  // --- 3. Duplicate IDs ---

  describe('duplicate IDs', () => {
    it('reports duplicate spec IDs', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'a.yaml', minimalSpec())
      writeSpec(dir, 'b.yaml', minimalSpec())

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'DUPLICATE_SPEC_ID')).toBe(true)
    })

    it('reports duplicate behavior IDs within a spec', () => {
      const dir = makeSpecDir()
      const spec = minimalSpec({
        behaviors: [
          {
            id: 'dupe',
            description: 'first behavior with sufficient description length',
            inputs: [],
            outputs: [],
            state_changes: [],
            determinism: 'deterministic',
          },
          {
            id: 'dupe',
            description: 'second behavior with sufficient description length',
            inputs: [],
            outputs: [],
            state_changes: [],
            determinism: 'deterministic',
          },
        ],
      })
      writeSpec(dir, 'test.yaml', spec)

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'DUPLICATE_BEHAVIOR_ID')).toBe(true)
    })

    it('reports duplicate edge case IDs within a spec', () => {
      const dir = makeSpecDir()
      const spec = minimalSpec({
        edge_cases: [
          {
            id: 'dupe',
            description: 'first edge case with sufficient description length',
            expected: 'returns false',
          },
          {
            id: 'dupe',
            description: 'second edge case with sufficient description length',
            expected: 'returns true',
          },
        ],
      })
      writeSpec(dir, 'test.yaml', spec)

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'DUPLICATE_EDGE_CASE_ID')).toBe(true)
    })
  })

  // --- 4. Dependency references ---

  describe('dependency references', () => {
    it('reports missing dependency references', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'test.yaml', minimalSpec({ dependencies: ['nonexistent'] }))

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'MISSING_DEPENDENCY')).toBe(true)
    })

    it('accepts valid dependency references', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'a.yaml', minimalSpec({ id: 'dep-target' }))
      writeSpec(dir, 'b.yaml', minimalSpec({ id: 'dep-source', dependencies: ['dep-target'] }))

      const result = validate(dir, REPO_ROOT)

      expect(result.errors.filter(e => e.code === 'MISSING_DEPENDENCY')).toHaveLength(0)
    })
  })

  // --- 5. Dependency cycles ---

  describe('dependency cycles', () => {
    it('reports dependency cycles', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'a.yaml', minimalSpec({ id: 'cycle-a', dependencies: ['cycle-b'] }))
      writeSpec(dir, 'b.yaml', minimalSpec({ id: 'cycle-b', dependencies: ['cycle-a'] }))

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      const cycleErrors = result.errors.filter(e => e.code === 'DEPENDENCY_CYCLE')
      expect(cycleErrors).toHaveLength(2)
      expect(cycleErrors.map(e => e.specId).sort((a, b) => a.localeCompare(b))).toEqual(['cycle-a', 'cycle-b'])
    })

    it('reports 3-node dependency cycles', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'a.yaml', minimalSpec({ id: 'tri-a', dependencies: ['tri-c'] }))
      writeSpec(dir, 'b.yaml', minimalSpec({ id: 'tri-b', dependencies: ['tri-a'] }))
      writeSpec(dir, 'c.yaml', minimalSpec({ id: 'tri-c', dependencies: ['tri-b'] }))

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      const cycleErrors = result.errors.filter(e => e.code === 'DEPENDENCY_CYCLE')
      expect(cycleErrors).toHaveLength(3)
    })
  })

  // --- 6. File existence ---

  describe('file existence', () => {
    it('reports missing source files as errors for implemented specs', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'test.yaml', minimalSpec({ source_files: ['src/engine/nonexistent.ts'] }))

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'FILE_NOT_FOUND' && e.field === 'source_files')).toBe(true)
    })

    it('reports missing source files as warnings for planned specs', () => {
      const dir = makeSpecDir()
      writeSpec(
        dir,
        'test.yaml',
        minimalSpec({
          status: 'planned',
          source_files: ['src/engine/future.ts'],
          verification: {
            test_file: 'src/engine/__tests__/future.test.ts',
            test_pattern: 'future',
            command: 'npx vitest run src/engine/__tests__/future.test.ts',
          },
        })
      )

      const result = validate(dir, REPO_ROOT)

      // no errors, only warnings
      expect(result.errors.filter(e => e.code === 'FILE_NOT_FOUND')).toHaveLength(0)
      expect(result.warnings.filter(e => e.code === 'FILE_NOT_FOUND').length).toBeGreaterThan(0)
    })

    it('reports missing test file', () => {
      const dir = makeSpecDir()
      writeSpec(
        dir,
        'test.yaml',
        minimalSpec({
          verification: {
            test_file: 'src/engine/__tests__/nonexistent.test.ts',
            test_pattern: 'foo',
            command: 'npx vitest run src/engine/__tests__/nonexistent.test.ts',
          },
        })
      )

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'FILE_NOT_FOUND' && e.field === 'verification.test_file')).toBe(true)
    })
  })

  // --- 7. Verification command syntax ---

  describe('verification command syntax', () => {
    it('rejects commands not starting with npx vitest', () => {
      const dir = makeSpecDir()
      writeSpec(
        dir,
        'test.yaml',
        minimalSpec({
          verification: {
            test_file: 'src/engine/__tests__/actions.test.ts',
            test_pattern: 'movePlayer',
            command: 'jest --runInBand',
          },
        })
      )

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some(e => e.code === 'INVALID_VERIFICATION_COMMAND' && e.message.includes('must start with'))
      ).toBe(true)
    })

    it('rejects commands with shell injection characters', () => {
      const dir = makeSpecDir()
      writeSpec(
        dir,
        'test.yaml',
        minimalSpec({
          verification: {
            test_file: 'src/engine/__tests__/actions.test.ts',
            test_pattern: 'movePlayer',
            command: 'npx vitest run foo && rm -rf /',
          },
        })
      )

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some(
          e => e.code === 'INVALID_VERIFICATION_COMMAND' && e.message.includes('disallowed shell characters')
        )
      ).toBe(true)
    })

    it('accepts valid npx vitest commands', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'test.yaml', minimalSpec())

      const result = validate(dir, REPO_ROOT)

      expect(result.errors.filter(e => e.code === 'INVALID_VERIFICATION_COMMAND')).toHaveLength(0)
    })
  })

  // --- 8. Banned vague phrases ---

  describe('banned vague phrases', () => {
    const bannedPhrases = [
      'handle gracefully',
      'work correctly',
      'as expected',
      'properly',
      'should work',
      'appropriate',
    ]

    for (const phrase of bannedPhrases) {
      it(`rejects behavior description containing "${phrase}"`, () => {
        const dir = makeSpecDir()
        writeSpec(
          dir,
          'test.yaml',
          minimalSpec({
            behaviors: [
              {
                id: 'vague-behavior',
                description: `the system should ${phrase} when given input data`,
                inputs: [],
                outputs: [],
                state_changes: [],
                determinism: 'deterministic',
              },
            ],
          })
        )

        const result = validate(dir, REPO_ROOT)

        expect(result.valid).toBe(false)
        expect(result.errors.some(e => e.code === 'VAGUE_DESCRIPTION' && e.message.includes(phrase))).toBe(true)
      })
    }

    it('rejects vague edge case descriptions', () => {
      const dir = makeSpecDir()
      writeSpec(
        dir,
        'test.yaml',
        minimalSpec({
          edge_cases: [
            {
              id: 'vague-edge',
              description: 'the system should handle gracefully when overloaded',
              expected: 'no crash',
            },
          ],
        })
      )

      const result = validate(dir, REPO_ROOT)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'VAGUE_DESCRIPTION')).toBe(true)
    })
  })

  // --- 9. Determinism consistency ---

  describe('determinism consistency', () => {
    it('warns when probabilistic behaviors lack statistical edge cases', () => {
      const dir = makeSpecDir()
      writeSpec(
        dir,
        'test.yaml',
        minimalSpec({
          behaviors: [
            {
              id: 'random-behavior',
              description: 'spawns an entity at a position selected from available tiles',
              inputs: ['GameState'],
              outputs: ['Position'],
              state_changes: [],
              determinism: 'probabilistic',
            },
          ],
        })
      )

      const result = validate(dir, REPO_ROOT)

      expect(result.warnings.some(e => e.code === 'DETERMINISM_INCONSISTENCY')).toBe(true)
    })

    it('does not warn when probabilistic behaviors have statistical edge cases', () => {
      const dir = makeSpecDir()
      writeSpec(
        dir,
        'test.yaml',
        minimalSpec({
          behaviors: [
            {
              id: 'random-behavior',
              description: 'spawns an entity at a position selected from available tiles',
              inputs: ['GameState'],
              outputs: ['Position'],
              state_changes: [],
              determinism: 'probabilistic',
            },
          ],
          edge_cases: [
            {
              id: 'spawn-distribution',
              description: 'spawn distribution is uniform across available tiles with equal probability',
              expected: 'chi-squared test passes at p > 0.01 over 10000 trials',
            },
          ],
        })
      )

      const result = validate(dir, REPO_ROOT)

      expect(result.warnings.filter(e => e.code === 'DETERMINISM_INCONSISTENCY')).toHaveLength(0)
    })

    it('does not warn for deterministic-only specs', () => {
      const dir = makeSpecDir()
      writeSpec(dir, 'test.yaml', minimalSpec())

      const result = validate(dir, REPO_ROOT)

      expect(result.warnings.filter(e => e.code === 'DETERMINISM_INCONSISTENCY')).toHaveLength(0)
    })
  })
})
