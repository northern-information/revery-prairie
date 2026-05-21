import { ComponentType } from '../ecs/types'
import { getBlockedPositions } from '../movement'
import {
  generateOakIdentity,
  getOakBodyPositions,
  getOakRenderTile,
  getOakTileLayers,
  isOakDormant,
  isValidOakPosition,
  OAK_BODY_SIZE,
  seedOaks,
  spawnOak,
} from '../oaks'
import { posKey } from '../position'
import { commitScan, selectScanTarget } from '../scan'
import { Season, TileType, Zone } from '../types'
import { clearArea, createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const createOakTestState = () => {
  const state = createTestState({ viewportWidth: 60, viewportHeight: 40 })
  // Flatten the entire map to dirt so we don't fight terrain.
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      state.map[y][x] = { type: TileType.Dirt }
    }
  }
  state.ponds = new Set()
  state.rivers = new Set()
  return state
}

const getOakEntities = (state: ReturnType<typeof createTestState>) => state.world.query(ComponentType.OakData)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('oak body footprint', () => {
  it('produces OAK_BODY_SIZE^2 positions centred on the anchor', () => {
    const positions = getOakBodyPositions(10, 10)
    expect(positions).toHaveLength(OAK_BODY_SIZE * OAK_BODY_SIZE)
    expect(positions).toContainEqual({ x: 10, y: 10 })
    // Corners of the footprint reach ±half from the anchor.
    const half = Math.floor(OAK_BODY_SIZE / 2)
    expect(positions).toContainEqual({ x: 10 - half, y: 10 - half })
    expect(positions).toContainEqual({ x: 10 + half, y: 10 + half })
  })
})

describe('spawnOak', () => {
  it('creates an entity with the expected components', () => {
    const state = createOakTestState()
    const eid = spawnOak(state, 20, 20, 1000)
    expect(getOakEntities(state)).toHaveLength(1)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    expect(pos).toEqual({ x: 20, y: 20 })
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    expect(multi?.positions).toHaveLength(OAK_BODY_SIZE * OAK_BODY_SIZE)
    const data = state.world.getComponent(eid, ComponentType.OakData)
    expect(data?.plantedTime).toBe(1000)
    expect(data?.identity).toHaveLength(64)
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    expect(tag).toBe('oak')
    const zone = state.world.getComponent(eid, ComponentType.EntityZone)
    expect(zone?.zone).toBe(Zone.Overworld)
  })

  it('derives identity deterministically from steward name + position', () => {
    expect(generateOakIdentity('alice', 5, 5)).toBe(generateOakIdentity('alice', 5, 5))
    expect(generateOakIdentity('alice', 5, 5)).not.toBe(generateOakIdentity('alice', 5, 6))
    expect(generateOakIdentity('alice', 5, 5)).not.toBe(generateOakIdentity('bob', 5, 5))
  })
})

describe('isValidOakPosition', () => {
  it('accepts a 3x3 of dirt', () => {
    const state = createOakTestState()
    expect(isValidOakPosition(state, 30, 30)).toBe(true)
  })

  it('rejects out-of-bounds positions', () => {
    const state = createOakTestState()
    expect(isValidOakPosition(state, 0, 0)).toBe(false)
    expect(isValidOakPosition(state, state.mapWidth - 1, state.mapHeight - 1)).toBe(false)
  })

  it('rejects when any tile is water', () => {
    const state = createOakTestState()
    state.ponds.add(posKey(30, 30))
    expect(isValidOakPosition(state, 30, 30)).toBe(false)
    state.ponds.clear()
    state.rivers.add(posKey(31, 30))
    expect(isValidOakPosition(state, 30, 30)).toBe(false)
  })

  it('rejects when any tile is sand', () => {
    const state = createOakTestState()
    state.map[30][30] = { type: TileType.Sand }
    expect(isValidOakPosition(state, 30, 30)).toBe(false)
  })

  it('rejects overlap with an existing oak', () => {
    const state = createOakTestState()
    spawnOak(state, 20, 20, 0)
    // The new oak's 3x3 would overlap the existing canopy on its west edge.
    expect(isValidOakPosition(state, 22, 20)).toBe(false)
    // Far away is fine.
    expect(isValidOakPosition(state, 40, 40)).toBe(true)
  })
})

describe('oak blocking', () => {
  it('adds every body tile to getBlockedPositions', () => {
    const state = createOakTestState()
    spawnOak(state, 25, 25, 0)
    const blocked = getBlockedPositions(state)
    for (const p of getOakBodyPositions(25, 25)) {
      expect(blocked.has(posKey(p.x, p.y))).toBe(true)
    }
  })
})

describe('seasonal dormancy', () => {
  it('switches canopy glyph and colour in winter', () => {
    const summer = getOakRenderTile(0, -1, false)
    const winter = getOakRenderTile(0, -1, true)
    // Summer canopy reads as dense leaves; winter switches to a bare-branch
    // glyph and a muted brown colour.
    expect(summer.char).not.toBe(winter.char)
    expect(summer.color).not.toBe(winter.color)
  })

  it('keeps the trunk glyph stable across seasons', () => {
    // The visual bottom of the iso diamond (dx + dy >= 3) is pure trunk — a
    // year-round feature; only the canopy responds to dormancy. For a 5x5
    // footprint the trunk tiles are (2, 2), (2, 1), (1, 2), etc.
    const summerTrunk = getOakRenderTile(2, 2, false)
    const winterTrunk = getOakRenderTile(2, 2, true)
    expect(summerTrunk.char).toBe(winterTrunk.char)
    expect(summerTrunk.color).toBe(winterTrunk.color)
  })
})

describe('seedOaks', () => {
  it('places oaks at deterministically-random valid positions', () => {
    const state = createOakTestState()
    state.stewardName = 'test-steward'
    try {
      // Force every random pick to a corner far from the player + Gron so
      // the spawn-clearance and player-clearance gates don't all reject.
      // Math.random = 0.1 lands near the upper-left, well clear of the
      // central player/Gron region.
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      const placed = seedOaks(state, 0)
      // With a constant random value every attempt picks the same tile —
      // first succeeds, all subsequent attempts collide with the spacing
      // rule. So we get exactly one oak.
      expect(placed).toBe(1)
      expect(getOakEntities(state)).toHaveLength(1)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('does not place oaks on the player spawn or Gron', () => {
    const state = createOakTestState()
    state.stewardName = 'test-steward'
    // Run many attempts with a varied random source — none should land on
    // the player or on Gron.
    try {
      let counter = 0
      vi.spyOn(Math, 'random').mockImplementation(() => {
        counter++
        return (counter * 0.137) % 1
      })
      seedOaks(state, 0)
      const gronX = Math.floor(state.mapWidth / 2)
      const gronY = Math.floor(state.mapHeight / 2)
      for (const eid of state.world.query(ComponentType.OakData, ComponentType.MultiPosition)) {
        const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
        if (!multi) continue
        for (const p of multi.positions) {
          expect(p.x === state.player.x && p.y === state.player.y).toBe(false)
          expect(p.x === gronX && p.y === gronY).toBe(false)
        }
      }
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('oak multilayer rendering (currently disabled)', () => {
  it('returns an empty layer list — single-glyph-per-tile rendering only', () => {
    // The user reported that stacking sub-pixel branch overlays per tile
    // produced a "pile of sticks" texture rather than a readable silhouette.
    // The overlay function is now a stub; the renderer trusts the base glyph
    // chosen by getOakRenderTile to carry the silhouette on its own.
    expect(getOakTileLayers(20, 20, 0, -1, false)).toEqual([])
    expect(getOakTileLayers(20, 20, 2, 0, false)).toEqual([])
    expect(getOakTileLayers(20, 20, 0, -2, false)).toEqual([])
  })
})

describe('oak sequencing (hold-to-scan)', () => {
  it('selectScanTarget returns an oak target when the player faces one', () => {
    const state = createTestState()
    clearArea(state, state.player.x, state.player.y, 5)
    state.playerFacing = 'right'
    // Place an oak two tiles east so its 3x3 (centred at +2, 0) includes the
    // facing tile (+1, 0) on its west edge.
    spawnOak(state, state.player.x + 2, state.player.y, 0)
    const target = selectScanTarget(state)
    expect(target?.kind).toBe('oak')
    expect(target?.identity).toBeTruthy()
  })

  it('commitScan with an oak target records discovery and appends to oakSpecimens', () => {
    const state = createTestState()
    clearArea(state, state.player.x, state.player.y, 5)
    state.playerFacing = 'right'
    spawnOak(state, state.player.x + 2, state.player.y, 0)
    state.scanInProgress = {
      kind: 'oak',
      target: { x: state.player.x + 2, y: state.player.y },
      startTime: 0,
    }
    const result = commitScan(state, 1500)
    // Oak commits return null so the game loop doesn't open the flora
    // gel-electrophoresis modal — oaks open the manual via highlightId.
    expect(result).toBeNull()
    expect(state.manualDiscoveries.has('entity:oak')).toBe(true)
    expect(state.oakSpecimens).toHaveLength(1)
    expect(state.manualHighlightEntryId).toBe('entity:oak')
  })

  it('dedupes oak specimens on identity (scanning the same tree twice)', () => {
    const state = createTestState()
    clearArea(state, state.player.x, state.player.y, 5)
    state.playerFacing = 'right'
    spawnOak(state, state.player.x + 2, state.player.y, 0)
    state.scanInProgress = {
      kind: 'oak',
      target: { x: state.player.x + 2, y: state.player.y },
      startTime: 0,
    }
    commitScan(state, 1500)
    state.scanInProgress = {
      kind: 'oak',
      target: { x: state.player.x + 2, y: state.player.y },
      startTime: 0,
    }
    commitScan(state, 3000)
    expect(state.oakSpecimens).toHaveLength(1)
  })
})

describe('oak winter dormancy is gated on season', () => {
  it('reads state.weather.season', () => {
    const state = createOakTestState()
    state.weather.season = Season.Summer
    expect(isOakDormant(state)).toBe(false)
    const summerCanopy = getOakRenderTile(0, -1, isOakDormant(state))
    state.weather.season = Season.Winter
    expect(isOakDormant(state)).toBe(true)
    const winterCanopy = getOakRenderTile(0, -1, isOakDormant(state))
    expect(summerCanopy.char).not.toBe(winterCanopy.char)
  })
})

describe('oak TraitBag sequencing', () => {
  it('attaches a TraitBag to OakData on spawn', () => {
    const state = createOakTestState()
    const eid = spawnOak(state, 20, 20, 1000)
    const data = state.world.getComponent(eid, ComponentType.OakData)
    expect(data?.traits).toBeDefined()
    expect(typeof data?.traits.bloomTiming).toBe('number')
    expect(typeof data?.traits.coldTolerance).toBe('number')
    expect(typeof data?.traits.droughtResponse).toBe('number')
    expect(typeof data?.traits.pollinatorPreference).toBe('number')
    expect(Array.isArray(data?.traits.recessives)).toBe(true)
  })

  it('produces identical TraitBags for the same stewardName + anchor across two states', () => {
    const stateA = createOakTestState()
    stateA.stewardName = 'alice'
    const stateB = createOakTestState()
    stateB.stewardName = 'alice'
    const eidA = spawnOak(stateA, 25, 25, 1000)
    const eidB = spawnOak(stateB, 25, 25, 9999)
    const traitsA = stateA.world.getComponent(eidA, ComponentType.OakData)?.traits
    const traitsB = stateB.world.getComponent(eidB, ComponentType.OakData)?.traits
    expect(traitsA).toEqual(traitsB)
  })

  it('produces different TraitBags for different anchors under the same stewardName', () => {
    const state = createOakTestState()
    state.stewardName = 'alice'
    const eid1 = spawnOak(state, 20, 20, 1000)
    const eid2 = spawnOak(state, 40, 40, 1000)
    const t1 = state.world.getComponent(eid1, ComponentType.OakData)?.traits
    const t2 = state.world.getComponent(eid2, ComponentType.OakData)?.traits
    expect(t1).not.toEqual(t2)
  })

  it('keeps every phenotype axis a finite number in [0, 1]', () => {
    const state = createOakTestState()
    const eid = spawnOak(state, 30, 30, 1000)
    const traits = state.world.getComponent(eid, ComponentType.OakData)?.traits
    expect(traits).toBeDefined()
    if (!traits) return
    const axes = [traits.bloomTiming, traits.coldTolerance, traits.droughtResponse, traits.pollinatorPreference]
    for (const v of axes) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('keeps recessives within length [0, 2] and every entry finite in [0, 1]', () => {
    const state = createOakTestState()
    state.stewardName = 'alice'
    // Spawn several oaks so we exercise different recessive counts via different identities.
    const anchors: [number, number][] = [
      [20, 20],
      [30, 30],
      [40, 40],
      [50, 50],
      [60, 60],
      [70, 70],
      [80, 80],
      [90, 90],
    ]
    for (const [ax, ay] of anchors) {
      const eid = spawnOak(state, ax, ay, 1000)
      const traits = state.world.getComponent(eid, ComponentType.OakData)?.traits
      expect(traits).toBeDefined()
      if (!traits) continue
      expect(traits.recessives.length).toBeGreaterThanOrEqual(0)
      expect(traits.recessives.length).toBeLessThanOrEqual(2)
      for (const r of traits.recessives) {
        expect(Number.isFinite(r)).toBe(true)
        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThanOrEqual(1)
      }
    }
  })

  it('genesis-seeded oaks have matching TraitBags across two runs with the same stewardName', () => {
    const stateA = createOakTestState()
    stateA.stewardName = 'alice'
    stateA.player = { x: 5, y: 5 }
    const stateB = createOakTestState()
    stateB.stewardName = 'alice'
    stateB.player = { x: 5, y: 5 }
    // seedOaks uses Math.random for anchor selection. Spy on it with a
    // deterministic sequence and reset the cursor between runs so both
    // states draw from the same anchor stream.
    const seq = Array.from({ length: 2000 }, (_, i) => ((i * 9301 + 49297) % 233280) / 233280)
    let cursor = 0
    vi.spyOn(Math, 'random').mockImplementation(() => seq[cursor++ % seq.length])
    cursor = 0
    seedOaks(stateA, 0)
    cursor = 0
    seedOaks(stateB, 0)

    const oaksA = [...stateA.world.query(ComponentType.OakData)]
      .map(e => stateA.world.getComponent(e, ComponentType.OakData))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map(d => ({ identity: d.identity, traits: d.traits }))
      .sort((a, b) => a.identity.localeCompare(b.identity))
    const oaksB = [...stateB.world.query(ComponentType.OakData)]
      .map(e => stateB.world.getComponent(e, ComponentType.OakData))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map(d => ({ identity: d.identity, traits: d.traits }))
      .sort((a, b) => a.identity.localeCompare(b.identity))

    expect(oaksA.length).toBeGreaterThan(0)
    expect(oaksA).toEqual(oaksB)
  })
})
