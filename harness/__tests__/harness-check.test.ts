import {
  type ChangedFile,
  type CheckOutcome,
  classifyPath,
  evaluate,
  formatReport,
  PRODUCT_LOC_THRESHOLD,
} from '../src/harness-check.ts'

const file = (
  path: string,
  status: ChangedFile['status'] = 'M',
  added = 0,
  removed = 0
): ChangedFile => ({
  path,
  status,
  added,
  removed,
  classification: classifyPath(path),
})

describe('harness-check classifyPath', () => {
  it('classifies src/engine sources as product', () => {
    expect(classifyPath('src/engine/movement.ts')).toBe('product')
    expect(classifyPath('worker/src/index.ts')).toBe('product')
    expect(classifyPath('shared/src/protocol.ts')).toBe('product')
  })

  it('classifies tests under product trees as test, not product', () => {
    expect(classifyPath('src/engine/__tests__/movement.test.ts')).toBe('test')
    expect(classifyPath('src/components/Foo.test.tsx')).toBe('test')
    expect(classifyPath('worker/src/__tests__/router.test.ts')).toBe('test')
  })

  it('classifies harness/, .github/workflows/, and .claude/ as harness-pipeline', () => {
    expect(classifyPath('harness/specs/foo.yaml')).toBe('harness-pipeline')
    expect(classifyPath('harness/plans/foo.yaml')).toBe('harness-pipeline')
    expect(classifyPath('harness/src/validator.ts')).toBe('harness-pipeline')
    expect(classifyPath('.github/workflows/ci.yml')).toBe('harness-pipeline')
    expect(classifyPath('.claude/skills/new-feature/SKILL.md')).toBe('harness-pipeline')
  })

  it('classifies root config and docs as harness-pipeline', () => {
    expect(classifyPath('package.json')).toBe('harness-pipeline')
    expect(classifyPath('tsconfig.json')).toBe('harness-pipeline')
    expect(classifyPath('vite.config.ts')).toBe('harness-pipeline')
    expect(classifyPath('eslint.config.js')).toBe('harness-pipeline')
    expect(classifyPath('CLAUDE.md')).toBe('harness-pipeline')
    expect(classifyPath('README.md')).toBe('harness-pipeline')
    expect(classifyPath('.prettierrc')).toBe('harness-pipeline')
    expect(classifyPath('.editorconfig')).toBe('harness-pipeline')
  })

  it('classifies asset/public files as ignored', () => {
    expect(classifyPath('public/cursor.cur')).toBe('ignored')
    expect(classifyPath('dist/index.html')).toBe('ignored')
    expect(classifyPath('node_modules/foo/index.js')).toBe('ignored')
  })
})

describe('harness-check evaluate', () => {
  it('docs-only change is minor', () => {
    const outcome = evaluate({ files: [file('CLAUDE.md', 'M', 20, 5)] })
    expect(outcome.kind).toBe('minor')
  })

  it('test-only change is minor', () => {
    const outcome = evaluate({
      files: [file('src/engine/__tests__/movement.test.ts', 'M', 100, 50)],
    })
    expect(outcome.kind).toBe('minor')
  })

  it('tiny product fix below threshold and no new file is minor', () => {
    const outcome = evaluate({
      files: [file('src/engine/movement.ts', 'M', 5, 2)],
    })
    expect(outcome.kind).toBe('minor')
  })

  it('new product file gates the PR even if small', () => {
    const outcome = evaluate({
      files: [file('src/engine/newSystem.ts', 'A', 30, 0)],
    })
    expect(outcome.kind).toBe('gated-fail')
    if (outcome.kind === 'gated-fail') {
      expect(outcome.missing.sort()).toEqual(['plan', 'spec'])
      expect(outcome.triggers.some((t) => t.includes('new product file'))).toBe(true)
    }
  })

  it('large refactor over LOC threshold gates the PR', () => {
    const outcome = evaluate({
      files: [file('src/engine/movement.ts', 'M', 120, 80)],
    })
    expect(outcome.kind).toBe('gated-fail')
    if (outcome.kind === 'gated-fail') {
      expect(outcome.triggers.some((t) => t.includes('product LOC'))).toBe(true)
    }
  })

  it('LOC at threshold (150) is still minor', () => {
    expect(PRODUCT_LOC_THRESHOLD).toBe(150)
    const outcome = evaluate({
      files: [file('src/engine/movement.ts', 'M', 100, 50)],
    })
    expect(outcome.kind).toBe('minor')
  })

  it('LOC just over threshold gates', () => {
    const outcome = evaluate({
      files: [file('src/engine/movement.ts', 'M', 100, 51)],
    })
    expect(outcome.kind).toBe('gated-fail')
  })

  it('gated PR with both spec and plan passes', () => {
    const outcome = evaluate({
      files: [
        file('src/engine/newSystem.ts', 'A', 30, 0),
        file('harness/specs/new-system.yaml', 'A', 50, 0),
        file('harness/plans/new-system.yaml', 'A', 40, 0),
      ],
    })
    expect(outcome.kind).toBe('gated-pass')
  })

  it('gated PR with spec but no plan fails with missing=plan', () => {
    const outcome = evaluate({
      files: [
        file('src/engine/newSystem.ts', 'A', 30, 0),
        file('harness/specs/new-system.yaml', 'A', 50, 0),
      ],
    })
    expect(outcome.kind).toBe('gated-fail')
    if (outcome.kind === 'gated-fail') expect(outcome.missing).toEqual(['plan'])
  })

  it('gated PR with plan but no spec fails with missing=spec', () => {
    const outcome = evaluate({
      files: [
        file('src/engine/newSystem.ts', 'A', 30, 0),
        file('harness/plans/new-system.yaml', 'A', 40, 0),
      ],
    })
    expect(outcome.kind).toBe('gated-fail')
    if (outcome.kind === 'gated-fail') expect(outcome.missing).toEqual(['spec'])
  })

  it('a deleted spec file does not satisfy the spec requirement', () => {
    const outcome = evaluate({
      files: [
        file('src/engine/newSystem.ts', 'A', 30, 0),
        file('harness/specs/old.yaml', 'D', 0, 50),
        file('harness/plans/new.yaml', 'A', 40, 0),
      ],
    })
    expect(outcome.kind).toBe('gated-fail')
    if (outcome.kind === 'gated-fail') expect(outcome.missing).toEqual(['spec'])
  })

  it('Skip-Harness override short-circuits before classification', () => {
    const outcome = evaluate({
      files: [file('src/engine/newSystem.ts', 'A', 30, 0)],
      skipReason: 'emergency security patch',
    })
    expect(outcome.kind).toBe('skip')
    if (outcome.kind === 'skip') expect(outcome.reason).toBe('emergency security patch')
  })

  it('empty skipReason does not trigger skip', () => {
    const outcome = evaluate({
      files: [file('src/engine/movement.ts', 'M', 5, 2)],
      skipReason: '',
    })
    expect(outcome.kind).toBe('minor')
  })

  it('test changes inside a gated PR do not contribute to LOC count', () => {
    const outcome = evaluate({
      files: [
        file('src/engine/movement.ts', 'M', 50, 0),
        file('src/engine/__tests__/movement.test.ts', 'M', 500, 200),
      ],
    })
    expect(outcome.kind).toBe('minor')
  })

  it('spec-only update is minor', () => {
    const outcome = evaluate({
      files: [file('harness/specs/player-movement.yaml', 'M', 8, 2)],
    })
    expect(outcome.kind).toBe('minor')
  })
})

describe('harness-check formatReport', () => {
  it('formats skip outcome with reason', () => {
    const out: CheckOutcome = { kind: 'skip', reason: 'security patch' }
    expect(formatReport(out)).toBe('harness check: skipped (reason: security patch)')
  })

  it('formats minor outcome', () => {
    expect(formatReport({ kind: 'minor' })).toBe(
      'harness check: minor PR, no spec required'
    )
  })

  it('formats gated-pass with triggers', () => {
    const out: CheckOutcome = {
      kind: 'gated-pass',
      triggers: ['1 new product file(s): src/engine/foo.ts'],
    }
    const report = formatReport(out)
    expect(report).toContain('gated PR, spec + plan present')
    expect(report).toContain('src/engine/foo.ts')
  })

  it('formats gated-fail with triggers, missing artifacts, and remediation', () => {
    const out: CheckOutcome = {
      kind: 'gated-fail',
      triggers: ['200 product LOC changed (threshold 150)'],
      missing: ['spec', 'plan'],
    }
    const report = formatReport(out)
    expect(report).toContain('missing harness artifacts — fail')
    expect(report).toContain('200 product LOC')
    expect(report).toContain('harness/specs/')
    expect(report).toContain('harness/plans/')
    expect(report).toContain('/new-feature')
    expect(report).toContain('Skip-Harness:')
  })
})
