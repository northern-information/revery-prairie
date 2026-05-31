import { describe, expect, it } from 'vitest'
import { createGenesisState } from '../../state'
import { landAccretion } from '../02-landAccretion'

// `renderTile` is the only meaningful surface: a pure function over
// (sim, x, y, progress, time) that returns at least one render layer.
// The epoch mutates nothing. Use a fresh GenesisSimState with the
// engine's default 147x147 dimensions so the centerX/centerY math
// matches what the production renderer sees.

const SIM = createGenesisState(147, 147, 42)

describe('02-landAccretion epoch', () => {
  it('exports the right epoch id and duration', () => {
    expect(landAccretion.id).toBe('landAccretion')
    expect(landAccretion.durationMs).toBe(2000)
  })

  it('mutate is a no-op (epoch is render-only)', () => {
    const before = JSON.stringify(SIM.grid)
    landAccretion.mutate(SIM)
    expect(JSON.stringify(SIM.grid)).toBe(before)
  })

  describe('renderTile', () => {
    it('returns a layer with a non-empty char and color', () => {
      const layers = landAccretion.renderTile(SIM, 73, 73, 0.5, 0)
      expect(layers.length).toBeGreaterThan(0)
      const first = layers[0]
      expect(first.char.length).toBeGreaterThan(0)
      expect(first.color).toMatch(/^#/)
      expect(first.dx).toBe(0)
      expect(first.dy).toBe(0)
    })

    it('paints solid rock interior near the center as the radius grows', () => {
      // At progress=0.7 the radius is ~70% of half the smaller dim.
      // The exact center tile should be deep inside the rock mass.
      const layers = landAccretion.renderTile(SIM, 73, 73, 0.7, 0)
      const char = layers[0].char
      const color = layers[0].color
      expect(['.', '#', '=', '*']).toContain(char)
      expect(['#8B7355', '#696969', '#808080', '#6B4226']).toContain(color)
    })

    it('paints empty space far outside the forming rock mass', () => {
      // A corner tile at progress=0.1 is well outside the radius, well
      // outside the drift particles' reach.
      const layers = landAccretion.renderTile(SIM, 0, 0, 0.1, 0)
      expect(layers[0].char).toBe(' ')
      expect(layers[0].color).toBe('#000')
    })

    it('animates over time when the tile renders rock', () => {
      const a = landAccretion.renderTile(SIM, 73, 73, 0.7, 0)
      const b = landAccretion.renderTile(SIM, 73, 73, 0.7, 5000)
      // The rock-char cycle is keyed off `Math.floor(time * 0.002)`, so
      // by t=5000 the index has advanced.
      expect(b[0].char).not.toBe(a[0].char)
    })

    it('renders drift particles in the soft rim band stochastically', () => {
      // Scan a band of tiles around the current radius edge and
      // confirm at least one drift particle ('.') is produced — proves
      // the particle branch is reachable.
      let sawParticle = false
      let sawSpace = false
      for (let i = 0; i < 200; i++) {
        const x = i % 100
        const y = Math.floor(i / 10)
        const layers = landAccretion.renderTile(SIM, x, y, 0.25, 0)
        const char = layers[0].char
        if (char === '.' && layers[0].color === '#887766') sawParticle = true
        if (char === ' ') sawSpace = true
        if (sawParticle && sawSpace) break
      }
      expect(sawParticle).toBe(true)
      expect(sawSpace).toBe(true)
    })
  })
})
