import { setStatusInYamlText, windowStart, wrapText } from './data.js'
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

describe('windowStart', () => {
  it('returns 0 when everything fits', () => {
    expect(windowStart(5, 10, 4)).toBe(0)
    expect(windowStart(10, 10, 9)).toBe(0)
  })

  it('pins inactive columns to the top regardless of overflow', () => {
    expect(windowStart(100, 5, null)).toBe(0)
  })

  it('centers the window on the selected card', () => {
    // visible 5, half = 2, so selecting index 10 starts at 8
    expect(windowStart(100, 5, 10)).toBe(8)
  })

  it('clamps at the top so it never goes negative', () => {
    expect(windowStart(100, 5, 0)).toBe(0)
    expect(windowStart(100, 5, 1)).toBe(0)
  })

  it('clamps at the bottom so the window never runs past the end', () => {
    // total 100, visible 5 → maxStart 95
    expect(windowStart(100, 5, 99)).toBe(95)
    expect(windowStart(100, 5, 97)).toBe(95)
  })

  it('keeps the selected index inside the rendered window throughout a column', () => {
    const total = 40
    const visible = 7
    for (let sel = 0; sel < total; sel++) {
      const start = windowStart(total, visible, sel)
      expect(sel).toBeGreaterThanOrEqual(start)
      expect(sel).toBeLessThan(start + visible)
    }
  })
})

describe('wrapText', () => {
  it('keeps short text on a single line', () => {
    expect(wrapText('hello world', 40)).toEqual(['hello world'])
  })

  it('wraps on word boundaries without exceeding the width', () => {
    const lines = wrapText('the quick brown fox jumps', 10)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10)
    // No word is split when it fits on its own.
    expect(lines.join(' ')).toBe('the quick brown fox jumps')
  })

  it('preserves explicit newlines as line breaks', () => {
    expect(wrapText('line one\nline two', 40)).toEqual(['line one', 'line two'])
  })

  it('keeps blank lines from double newlines', () => {
    expect(wrapText('a\n\nb', 40)).toEqual(['a', '', 'b'])
  })

  it('hard-breaks a single word longer than the width', () => {
    const lines = wrapText('a'.repeat(25), 10)
    expect(lines).toEqual(['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaa'])
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10)
  })

  it('wraps a long single-line note so it becomes scrollable (no embedded newlines)', () => {
    // The real backlog has single-line notes up to ~629 chars. Without wrapping
    // these are one indivisible Text and cannot scroll. wrapText must split them.
    const note = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ')
    const lines = wrapText(note, 30)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(30)
    // Round-trips: rejoining the wrapped lines reproduces the words in order.
    expect(lines.join(' ').split(/ +/)).toEqual(note.split(' '))
  })

  it('returns a single blank line for empty text', () => {
    expect(wrapText('', 40)).toEqual([''])
  })
})
