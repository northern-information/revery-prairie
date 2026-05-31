import { describe, expect, it } from 'vitest'
import { posKey } from '../../../position'
import { createGenesisState } from '../../state'
import { crustCooling } from '../05-crustCooling'

const makeSim = () => {
  const sim = createGenesisState(147, 147, 42)
  // Mark every tile as land so the renderSpace shortcut doesn't fire —
  // crustCooling only paints lava/rock on land tiles.
  for (let y = 0; y < sim.height; y++) {
    for (let x = 0; x < sim.width; x++) {
      sim.landMask.add(posKey(x, y))
    }
  }
  return sim
}

describe('05-crustCooling epoch', () => {
  it('exports the right epoch id and duration', () => {
    expect(crustCooling.id).toBe('crustCooling')
    expect(crustCooling.durationMs).toBe(2000)
  })

  it('mutate is a no-op (epoch is render-only)', () => {
    const sim = makeSim()
    const before = JSON.stringify(sim.grid)
    crustCooling.mutate(sim)
    expect(JSON.stringify(sim.grid)).toBe(before)
  })

  describe('renderTile', () => {
    it('paints space tiles via the shared renderSpace path', () => {
      const sim = createGenesisState(147, 147, 42)
      // Don't add to landMask — empty mask means every tile is space.
      const layers = crustCooling.renderTile(sim, 73, 73, 0.5, 0)
      expect(layers.length).toBeGreaterThan(0)
      // Space path produces either a star glyph or a blank ' '.
      const valid = ['.', '+', '*', ' ']
      expect(valid).toContain(layers[0].char)
    })

    it('paints lava (rgb red-orange) early in the epoch, near hot centers', () => {
      const sim = makeSim()
      // Bias the test tile to hot so it stays in the lava phase even
      // when the coolProgress includes the edge factor.
      const key = posKey(73, 73)
      sim.volcanicHeat.set(key, 100)
      const layers = crustCooling.renderTile(sim, 73, 73, 0.05, 0)
      expect(['~', '=', '^']).toContain(layers[0].char)
      expect(layers[0].color).toMatch(/^rgb\(/)
    })

    it('transitions through a dark red/brown band at mid progress', () => {
      const sim = makeSim()
      // Pick an edge tile (high edgeFactor) with zero volcanic heat so
      // coolProgress lands in the [0.3, 0.7) transitional band at
      // progress=0.3.
      const x = 5
      const y = 5
      sim.volcanicHeat.set(posKey(x, y), 0)
      const layers = crustCooling.renderTile(sim, x, y, 0.3, 0)
      expect(['#', '=', '.']).toContain(layers[0].char)
      expect(layers[0].color).toMatch(/^rgb\(/)
    })

    it('settles to ROCK_COLORS once cooling progress completes', () => {
      const sim = makeSim()
      const key = posKey(73, 73)
      sim.volcanicHeat.set(key, 0) // no heat — cools first
      const layers = crustCooling.renderTile(sim, 73, 73, 1.0, 0)
      // Either solid rock (hex color) or volcanic flare-back (#FF4500).
      expect(['.', '#', '=', '^']).toContain(layers[0].char)
      expect(layers[0].color).toMatch(/^#/)
    })

    it('produces an occasional volcanic flare-back on still-hot tiles after cooling', () => {
      const sim = makeSim()
      // Find a tile whose hash + heat math triggers the flare branch
      // for some time value. Scan a few until one fires.
      sim.volcanicHeat.set(posKey(10, 10), 100)
      let sawFlare = false
      for (let t = 0; t < 10_000; t += 200) {
        const layers = crustCooling.renderTile(sim, 10, 10, 1.0, t)
        if (layers[0].char === '^' && layers[0].color === '#FF4500') {
          sawFlare = true
          break
        }
      }
      expect(sawFlare).toBe(true)
    })
  })
})
