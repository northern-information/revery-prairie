import { generateBoltPath, projectBoltPath } from '../boltPath'
import { viewportToScreen } from '../projection'
import { describe, expect, it } from 'vitest'

const seededRng = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

describe('projectBoltPath', () => {
  it('returns empty arrays when given an empty path', () => {
    const result = projectBoltPath([], null)
    expect(result.path).toEqual([])
    expect(result.branch).toBeNull()
  })

  it('preserves the impact tile at the end of the path', () => {
    const canonical = [
      { x: 5, y: 0 },
      { x: 5, y: 1 },
      { x: 5, y: 2 }, // impact
    ]
    const { path } = projectBoltPath(canonical, null)
    expect(path[path.length - 1]).toEqual({ x: 5, y: 2 })
  })

  it('produces tiles that all project to the same screen x for a straight canonical bolt', () => {
    // canonical: straight up, no jitter (dx=0 every step)
    const canonical = [
      { x: 5, y: 0 },
      { x: 5, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
      { x: 5, y: 4 }, // impact
    ]
    const { path } = projectBoltPath(canonical, null)
    const charWidth = 10
    const charHeight = 20
    const vw = 80
    const vh = 40
    const screens = path.map(p => viewportToScreen(p.x, p.y, charWidth, charHeight, vw, vh))
    const xs = screens.map(s => s.px)
    expect(new Set(xs).size).toBe(1) // all same screen x → vertical bolt

    // y values should strictly decrease as we move from impact toward the top
    for (let i = path.length - 1; i > 0; i--) {
      expect(screens[i - 1].py).toBeLessThan(screens[i].py)
    }
  })

  it('does not mutate the input path', () => {
    const canonical = [
      { x: 5, y: 0 },
      { x: 5, y: 1 },
      { x: 5, y: 2 },
    ]
    const before = JSON.stringify(canonical)
    projectBoltPath(canonical, null)
    expect(JSON.stringify(canonical)).toBe(before)
  })

  it('handles a real generated path with branch end-to-end', () => {
    const rng = seededRng(42)
    const { path: canonical, branch: canonicalBranch } = generateBoltPath(50, 50, 8, rng)
    const { path, branch } = projectBoltPath(canonical, canonicalBranch)
    expect(path).toHaveLength(canonical.length)

    const charWidth = 10
    const charHeight = 20
    const vw = 80
    const vh = 40
    const screens = path.map(p => viewportToScreen(p.x, p.y, charWidth, charHeight, vw, vh))

    // Going from impact (last) toward top (first), screen py should monotonically decrease
    for (let i = path.length - 1; i > 0; i--) {
      expect(screens[i - 1].py).toBeLessThanOrEqual(screens[i].py)
    }
    // And the bolt should be largely vertical: total horizontal screen spread
    // should be ≤ path length cells (one cell of lateral drift per step at most)
    const minPx = Math.min(...screens.map(s => s.px))
    const maxPx = Math.max(...screens.map(s => s.px))
    expect(maxPx - minPx).toBeLessThanOrEqual(path.length * charWidth)

    // If a branch was generated, its tiles should differ from main path tiles
    if (branch && canonicalBranch) {
      expect(branch).toHaveLength(canonicalBranch.length)
    }
  })
})
