import { ITEM_DEFINITIONS } from '@/engine/items'

describe('fixture: item definitions', () => {
  const items = Object.values(ITEM_DEFINITIONS)

  it('has at least one item defined', () => {
    expect(items.length).toBeGreaterThan(0)
  })

  for (const item of Object.values(ITEM_DEFINITIONS)) {
    describe(item.id, () => {
      it('has a non-empty name', () => {
        expect(item.name.length).toBeGreaterThan(0)
      })

      it('has a single-character glyph', () => {
        expect(item.glyph).toHaveLength(1)
      })

      it('has a valid hex color', () => {
        expect(item.glyphColor).toMatch(/^#[0-9a-fA-F]{6}$/)
      })

      it('has a non-negative weight', () => {
        expect(item.weight).toBeGreaterThanOrEqual(0)
      })

      it('has a non-empty category', () => {
        expect(item.category.length).toBeGreaterThan(0)
      })

      it('has a valid shape (non-empty 2D boolean array)', () => {
        expect(item.shape.length).toBeGreaterThan(0)
        for (const row of item.shape) {
          expect(Array.isArray(row)).toBe(true)
          expect(row.length).toBeGreaterThan(0)
          for (const cell of row) {
            expect(typeof cell).toBe('boolean')
          }
        }
      })

      it('has at least one true cell in shape', () => {
        const hasTrue = item.shape.some(row => row.some(cell => cell))
        expect(hasTrue).toBe(true)
      })
    })
  }
})
