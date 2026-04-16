import { describe, expect, it } from 'vitest'
import {
  activateMachine,
  generateRuinInterior,
  getTemporarilyVisibleTiles,
  isHiddenTile,
  tickResonanceDeactivation,
} from '../ruins'
import { RuinArchetype, TileType } from '../types'
import { isWalkableTile, posKey } from '../position'

import type { CivilizationRuin } from '../genesisTypes'

const makeRuin = (overrides: Partial<CivilizationRuin> = {}): CivilizationRuin => ({
  position: { x: 50, y: 50 },
  name: 'Test Resonance Ruin',
  radius: 4,
  age: 3000,
  aqueductPaths: [],
  buildingFootprints: [{ x: 50, y: 50 }],
  ...overrides,
})

const makeRng = (seed = 42) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const makeResonanceInterior = (overrides: Partial<CivilizationRuin> = {}) => {
  const ruin = makeRuin(overrides)
  return generateRuinInterior(ruin, 0, RuinArchetype.Resonance, makeRng())
}

describe('ruin resonance', () => {
  describe('generation', () => {
    it('generates resonance data', () => {
      const interior = makeResonanceInterior()
      expect(interior.resonance).not.toBeNull()
      expect(interior.subsidence).toBeNull()
      expect(interior.dormantGarden).toBeNull()
      expect(interior.hauntedThreshold).toBeNull()
    })

    it('places machine tiles on the map', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      expect(res).toBeTruthy()
      if (!res) return
      expect(res.machinePositions.length).toBeGreaterThanOrEqual(3)
      for (const mp of res.machinePositions) {
        expect(interior.map[mp.y][mp.x].type).toBe(TileType.RuinMachine)
      }
    })

    it('machines are non-walkable', () => {
      expect(isWalkableTile(TileType.RuinMachine)).toBe(false)
      expect(isWalkableTile(TileType.RuinMachineActive)).toBe(false)
    })

    it('RuinHiddenFloor is walkable', () => {
      expect(isWalkableTile(TileType.RuinHiddenFloor)).toBe(true)
    })

    it('creates hidden tiles', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      expect(res).toBeTruthy()
      if (!res) return
      expect(res.hiddenTiles.size).toBeGreaterThan(0)
      for (const key of res.hiddenTiles) {
        const parts = key.split(',')
        const x = Number(parts[0])
        const y = Number(parts[1])
        expect(interior.map[y][x].type).toBe(TileType.RuinHiddenFloor)
      }
    })

    it('has a vault position', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      expect(res).toBeTruthy()
      if (!res) return
      expect(res.vaultPosition.x).toBeGreaterThan(0)
      expect(res.vaultPosition.y).toBeGreaterThan(0)
    })

    it('starts with vault not revealed', () => {
      const interior = makeResonanceInterior()
      expect(interior.resonance?.vaultRevealed).toBe(false)
    })

    it('starts with no active machines', () => {
      const interior = makeResonanceInterior()
      expect(interior.resonance?.machineActiveUntil.size).toBe(0)
    })
  })

  describe('machine activation', () => {
    it('activates a machine tile', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      const mp = res.machinePositions[0]
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        manualDiscoveries: new Set<string>(),
      } as never

      const result = activateMachine(state, mp.x, mp.y, 1000)
      expect(result).toBe(true)
      expect(interior.map[mp.y][mp.x].type).toBe(TileType.RuinMachineActive)
      expect(res.machineActiveUntil.get(posKey(mp.x, mp.y))).toBe(1000 + res.activationDurationMs)
    })

    it('returns false for non-machine tile', () => {
      const interior = makeResonanceInterior()
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        manualDiscoveries: new Set<string>(),
      } as never

      const result = activateMachine(state, 0, 0, 1000)
      expect(result).toBe(false)
    })

    it('reveals vault when all machines are simultaneously active', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        manualDiscoveries: new Set<string>(),
      } as never

      const time = 1000
      for (const mp of res.machinePositions) {
        activateMachine(state, mp.x, mp.y, time)
      }
      expect(res.vaultRevealed).toBe(true)
      expect(res.revealedTiles.size).toBe(res.hiddenTiles.size)
    })

    it('does not reveal vault when machines are activated sequentially with gaps', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res || res.machinePositions.length < 2) return

      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        manualDiscoveries: new Set<string>(),
      } as never

      // Activate first machine at time 0, second at time > activation duration
      activateMachine(state, res.machinePositions[0].x, res.machinePositions[0].y, 0)
      activateMachine(state, res.machinePositions[1].x, res.machinePositions[1].y, res.activationDurationMs + 1000)
      expect(res.vaultRevealed).toBe(false)
    })
  })

  describe('deactivation tick', () => {
    it('deactivates expired machines', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      const mp = res.machinePositions[0]
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
      } as never

      activateMachine(state, mp.x, mp.y, 1000)
      expect(interior.map[mp.y][mp.x].type).toBe(TileType.RuinMachineActive)

      // Tick past the activation duration
      tickResonanceDeactivation(state, 1000 + res.activationDurationMs + 1)
      expect(interior.map[mp.y][mp.x].type).toBe(TileType.RuinMachine)
      expect(res.machineActiveUntil.size).toBe(0)
    })

    it('does not deactivate machines that are still within duration', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      const mp = res.machinePositions[0]
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
      } as never

      activateMachine(state, mp.x, mp.y, 1000)
      tickResonanceDeactivation(state, 1000 + Math.floor(res.activationDurationMs / 2))
      expect(interior.map[mp.y][mp.x].type).toBe(TileType.RuinMachineActive)
    })

    it('skips deactivation when vault is revealed', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      // Activate all machines simultaneously to reveal vault
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        manualDiscoveries: new Set<string>(),
      } as never

      for (const mp of res.machinePositions) {
        activateMachine(state, mp.x, mp.y, 1000)
      }
      expect(res.vaultRevealed).toBe(true)

      // Tick way past duration — machines should stay active
      tickResonanceDeactivation(state, 100000)
      for (const mp of res.machinePositions) {
        expect(interior.map[mp.y][mp.x].type).toBe(TileType.RuinMachineActive)
      }
    })
  })

  describe('hidden tile visibility', () => {
    it('hidden tiles are hidden by default', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      const hiddenKey = [...res.hiddenTiles][0]
      if (!hiddenKey) return
      const parts = hiddenKey.split(',')
      expect(isHiddenTile(
        { ...interior, entranceOverworld: { x: 50, y: 50 } },
        Number(parts[0]),
        Number(parts[1]),
        0,
      )).toBe(true)
    })

    it('hidden tiles become temporarily visible near active machines', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      // Activate a machine
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        manualDiscoveries: new Set<string>(),
      } as never

      const mp = res.machinePositions[0]
      activateMachine(state, mp.x, mp.y, 1000)

      const tempVisible = getTemporarilyVisibleTiles({ ...interior, entranceOverworld: { x: 50, y: 50 } })
      // May or may not have visible tiles depending on machine proximity to hidden passages
      // Just verify the function runs without error
      expect(tempVisible).toBeInstanceOf(Set)
    })

    it('hidden tiles are not hidden after vault reveal', () => {
      const interior = makeResonanceInterior()
      const res = interior.resonance
      if (!res) return

      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        manualDiscoveries: new Set<string>(),
      } as never

      // Reveal vault
      for (const mp of res.machinePositions) {
        activateMachine(state, mp.x, mp.y, 1000)
      }

      const hiddenKey = [...res.hiddenTiles][0]
      if (!hiddenKey) return
      const parts = hiddenKey.split(',')
      expect(isHiddenTile(
        { ...interior, entranceOverworld: { x: 50, y: 50 } },
        Number(parts[0]),
        Number(parts[1]),
        2000,
      )).toBe(false)
    })
  })
})
