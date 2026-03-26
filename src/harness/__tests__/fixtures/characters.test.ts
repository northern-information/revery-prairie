import { CHARACTER_DEFINITIONS } from '@/engine/characters'

describe('fixture: character definitions', () => {
  const characters = Object.values(CHARACTER_DEFINITIONS)

  it('has at least one character defined', () => {
    expect(characters.length).toBeGreaterThan(0)
  })

  for (const char of characters) {
    describe(char.id, () => {
      it('has a non-empty name', () => {
        expect(char.name.length).toBeGreaterThan(0)
      })

      it('has a single-character glyph', () => {
        expect(char.glyph).toHaveLength(1)
      })

      it('has a valid hex color', () => {
        expect(char.glyphColor).toMatch(/^#[0-9a-fA-F]{6}$/)
      })

      it('has non-empty dialog array', () => {
        expect(char.dialog.length).toBeGreaterThan(0)
      })

      it('every dialog line is a non-empty string', () => {
        for (const line of char.dialog) {
          expect(typeof line).toBe('string')
          expect(line.length).toBeGreaterThan(0)
        }
      })
    })
  }
})
