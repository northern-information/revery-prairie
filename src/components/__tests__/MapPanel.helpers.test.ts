import { findHoveredIcon } from '../MapPanel.helpers'
import { describe, expect, it } from 'vitest'

import type { MapIcon } from '../MapPanel.helpers'

// RP-70 — hover hit-testing for the map tab. The canvas draw itself is
// untested (canvas rendering, per CLAUDE.md); this covers the pure lookup.

const icon = (px: number, py: number, name: string): MapIcon => ({ px, py, glyph: '?', color: '#fff', name })

describe('findHoveredIcon', () => {
  it('returns null when the cursor is outside every hit radius', () => {
    const icons = [icon(100, 100, 'House')]
    expect(findHoveredIcon(icons, 200, 200, 16)).toBeNull()
  })

  it('returns the icon when the cursor is within its radius', () => {
    const icons = [icon(100, 100, 'House')]
    expect(findHoveredIcon(icons, 108, 100, 16)?.name).toBe('House')
  })

  it('resolves to the nearest icon when several cluster', () => {
    // House at center, Cave 6px away, Whine 12px away — all within radius.
    const icons = [icon(100, 100, 'House'), icon(106, 100, 'Cave'), icon(112, 100, 'Whine')]
    expect(findHoveredIcon(icons, 104, 100, 16)?.name).toBe('Cave')
  })

  it('returns null for an empty icon list', () => {
    expect(findHoveredIcon([], 50, 50, 16)).toBeNull()
  })
})
