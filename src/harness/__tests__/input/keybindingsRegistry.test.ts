import { KEYBINDINGS } from '@/engine/input'
import { MANUAL_ENTRIES } from '@/engine/manual'

describe('keybinding registry completeness', () => {
  it('every keybinding has a corresponding manual entry', () => {
    for (const kb of KEYBINDINGS) {
      const manualId = `control:${kb.key}`
      expect(
        MANUAL_ENTRIES[manualId],
        `keybinding [${kb.key}] (${kb.action}) is missing from the manual — add it to KEYBINDINGS in input.ts`
      ).toBeDefined()
    }
  })

  it('keybinding registry is not empty', () => {
    expect(KEYBINDINGS.length).toBeGreaterThan(0)
  })

  it('every keybinding has a non-empty action', () => {
    for (const kb of KEYBINDINGS) {
      expect(kb.action.length, `keybinding [${kb.key}] has empty action`).toBeGreaterThan(0)
    }
  })
})
