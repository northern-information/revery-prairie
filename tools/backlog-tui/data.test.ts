import { setStatusInYamlText } from './data.js'
import { describe, expect, it } from 'vitest'

const SAMPLE = `# header comment
# another comment

features:
  - id: 'RP-0'
    name: Reclaim Revery
    summary: Delete the four player-cast spells.
    depends_on: []
    status: shipped
    spec: harness/specs/RP-0.yaml
    plan: null
    pr: https://example/pr/314
    notes: 'has a # hash and quotes'

  - id: 'RP-3'
    name: Genetics
    summary: Trait bag etc.
    depends_on: ['RP-0']
    status: todo
    spec: null
    plan: null
    pr: null
    notes: ''

  - id: 'RP-8a'
    name: Egregoric flora
    summary: Voynich.
    depends_on: ['RP-0']
    status: in-progress
    spec: null
    plan: null
    pr: null
    notes: ''
`

describe('setStatusInYamlText', () => {
  it('moves a todo to in-progress', () => {
    const out = setStatusInYamlText(SAMPLE, 'RP-3', 'in-progress')
    expect(out).toContain("  - id: 'RP-3'\n    name: Genetics")
    expect(out).toMatch(/- id: 'RP-3'[\s\S]*?    status: in-progress/)
    // other entries untouched
    expect(out).toMatch(/- id: 'RP-0'[\s\S]*?    status: shipped/)
    expect(out).toMatch(/- id: 'RP-8a'[\s\S]*?    status: in-progress/)
  })

  it('moves an in-progress to shipped', () => {
    const out = setStatusInYamlText(SAMPLE, 'RP-8a', 'shipped')
    expect(out).toMatch(/- id: 'RP-8a'[\s\S]*?    status: shipped/)
  })

  it('preserves comments, blank lines, and field order', () => {
    const out = setStatusInYamlText(SAMPLE, 'RP-3', 'in-progress')
    expect(out.startsWith('# header comment\n# another comment\n\nfeatures:\n')).toBe(true)
    // blank line between entries survives
    expect(out).toContain("notes: 'has a # hash and quotes'\n\n  - id: 'RP-3'")
    // field order under id RP-3 unchanged
    expect(out).toMatch(
      /- id: 'RP-3'\n {4}name: Genetics\n {4}summary: [^\n]+\n {4}depends_on: \['RP-0'\]\n {4}status: in-progress\n {4}spec: null/
    )
  })

  it('does not modify other features when only one changes', () => {
    const out = setStatusInYamlText(SAMPLE, 'RP-3', 'shipped')
    // Count occurrences of `status:` — should still be three lines.
    const statusLines = out.split('\n').filter(l => /^    status:/.test(l))
    expect(statusLines).toEqual(['    status: shipped', '    status: shipped', '    status: in-progress'])
  })

  it('handles ids with letters (e.g. RP-8a) without matching the wrong block', () => {
    // id 'RP-8' should NOT match the block for 'RP-8a'.
    expect(() => setStatusInYamlText(SAMPLE, 'RP-8', 'shipped')).toThrow(/not found/)
    // and 'RP-8a' resolves correctly even though 'RP-8' is a prefix of it.
    const out = setStatusInYamlText(SAMPLE, 'RP-8a', 'todo')
    expect(out).toMatch(/- id: 'RP-8a'[\s\S]*?    status: todo/)
  })

  it('throws when the id is missing', () => {
    expect(() => setStatusInYamlText(SAMPLE, 'RP-nope', 'shipped')).toThrow(/not found/)
  })

  it('is idempotent', () => {
    const once = setStatusInYamlText(SAMPLE, 'RP-3', 'in-progress')
    const twice = setStatusInYamlText(once, 'RP-3', 'in-progress')
    expect(once).toBe(twice)
  })

  it('round-trips: original status restorable', () => {
    const to = setStatusInYamlText(SAMPLE, 'RP-3', 'shipped')
    const back = setStatusInYamlText(to, 'RP-3', 'todo')
    expect(back).toBe(SAMPLE)
  })
})
