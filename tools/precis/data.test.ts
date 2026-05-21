import { describe, expect, it } from 'vitest'
import { setStatusInYamlText } from './data.js'

const SAMPLE = `# header comment
# another comment

features:
  - id: '0'
    name: Reclaim Revery
    summary: Delete the four player-cast spells.
    depends_on: []
    status: shipped
    spec: harness/specs/precis-0.yaml
    plan: null
    pr: https://example/pr/314
    notes: 'has a # hash and quotes'

  - id: '3'
    name: Genetics
    summary: Trait bag etc.
    depends_on: ['0']
    status: todo
    spec: null
    plan: null
    pr: null
    notes: ''

  - id: '8a'
    name: Egregoric flora
    summary: Voynich.
    depends_on: ['0']
    status: in-progress
    spec: null
    plan: null
    pr: null
    notes: ''
`

describe('setStatusInYamlText', () => {
  it('moves a todo to in-progress', () => {
    const out = setStatusInYamlText(SAMPLE, '3', 'in-progress')
    expect(out).toContain("  - id: '3'\n    name: Genetics")
    expect(out).toMatch(/- id: '3'[\s\S]*?    status: in-progress/)
    // other entries untouched
    expect(out).toMatch(/- id: '0'[\s\S]*?    status: shipped/)
    expect(out).toMatch(/- id: '8a'[\s\S]*?    status: in-progress/)
  })

  it('moves an in-progress to shipped', () => {
    const out = setStatusInYamlText(SAMPLE, '8a', 'shipped')
    expect(out).toMatch(/- id: '8a'[\s\S]*?    status: shipped/)
  })

  it('preserves comments, blank lines, and field order', () => {
    const out = setStatusInYamlText(SAMPLE, '3', 'in-progress')
    expect(out.startsWith('# header comment\n# another comment\n\nfeatures:\n')).toBe(true)
    // blank line between entries survives
    expect(out).toContain("notes: 'has a # hash and quotes'\n\n  - id: '3'")
    // field order under id 3 unchanged
    expect(out).toMatch(
      /- id: '3'\n {4}name: Genetics\n {4}summary: [^\n]+\n {4}depends_on: \['0'\]\n {4}status: in-progress\n {4}spec: null/,
    )
  })

  it('does not modify other features when only one changes', () => {
    const out = setStatusInYamlText(SAMPLE, '3', 'shipped')
    // Count occurrences of `status:` — should still be three lines.
    const statusLines = out.split('\n').filter((l) => /^    status:/.test(l))
    expect(statusLines).toEqual([
      '    status: shipped',
      '    status: shipped',
      '    status: in-progress',
    ])
  })

  it('handles ids with letters (e.g. 8a) without matching the wrong block', () => {
    // id '8' should NOT match the block for '8a'.
    expect(() => setStatusInYamlText(SAMPLE, '8', 'shipped')).toThrow(/not found/)
    // and '8a' resolves correctly even though '8' is a prefix of it.
    const out = setStatusInYamlText(SAMPLE, '8a', 'todo')
    expect(out).toMatch(/- id: '8a'[\s\S]*?    status: todo/)
  })

  it('throws when the id is missing', () => {
    expect(() => setStatusInYamlText(SAMPLE, 'nope', 'shipped')).toThrow(/not found/)
  })

  it('is idempotent', () => {
    const once = setStatusInYamlText(SAMPLE, '3', 'in-progress')
    const twice = setStatusInYamlText(once, '3', 'in-progress')
    expect(once).toBe(twice)
  })

  it('round-trips: original status restorable', () => {
    const to = setStatusInYamlText(SAMPLE, '3', 'shipped')
    const back = setStatusInYamlText(to, '3', 'todo')
    expect(back).toBe(SAMPLE)
  })
})
