import { ComponentType } from '../ecs/types'
import { spawnOak } from '../oaks'
import { posKey } from '../position'
import { commitScan, selectScanTarget } from '../scan'
import { FloraSpecies, TileType } from '../types'
import { clearArea, clearAroundPlayer, createTestState } from './helpers'
import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { describe, expect, it } from 'vitest'

import type { Direction } from '../types'

const countPickupBlooms = (state: ReturnType<typeof createTestState>): number =>
  state.world
    .query(ComponentType.TimedEffect, ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'pickupBloom').length

// Place a flora tile of the given species at (x, y) and return the identity.
const placeFlora = (state: ReturnType<typeof createTestState>, x: number, y: number, species: FloraSpecies): string => {
  state.map[y][x] = { type: TileType.Flora }
  const key = posKey(x, y)
  const entry = createTestFloraEntry({ posKey: key, species })
  state.floraLifecycle.set(key, entry)
  return entry.identity
}

describe('selectScanTarget', () => {
  it('returns null when no flora is on or adjacent to the player', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    expect(selectScanTarget(state)).toBeNull()
  })

  it('selects the on-tile flora when the player stands on a flora tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    const id = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    const target = selectScanTarget(state)
    expect(target).not.toBeNull()
    expect(target?.position).toEqual({ x: state.player.x, y: state.player.y })
    expect(target?.kind === 'flora' && target.species).toBe(FloraSpecies.Clover)
    expect(target?.identity).toBe(id)
  })

  it('prefers the tile in playerFacing direction over other neighbors', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'right'
    // Place flora on left, right, and below. Right should win.
    placeFlora(state, state.player.x - 1, state.player.y, FloraSpecies.Wildflower)
    const facingId = placeFlora(state, state.player.x + 1, state.player.y, FloraSpecies.Clover)
    placeFlora(state, state.player.x, state.player.y + 1, FloraSpecies.TallGrass)
    const target = selectScanTarget(state)
    expect(target?.identity).toBe(facingId)
    expect(target?.kind === 'flora' && target.species).toBe(FloraSpecies.Clover)
  })

  it('falls back to CARDINAL order when no flora is in the facing direction', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'right' // east — no flora there
    // Place flora only to the north and south. CARDINAL order is N, S, W, E,
    // so north should win.
    const northId = placeFlora(state, state.player.x, state.player.y - 1, FloraSpecies.Clover)
    placeFlora(state, state.player.x, state.player.y + 1, FloraSpecies.Wildflower)
    const target = selectScanTarget(state)
    expect(target?.identity).toBe(northId)
  })

  it('prefers the diagonal tile in playerFacing direction over other neighbors', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'upRight'
    // Place flora to the north and at the NE diagonal. The diagonal
    // facing tile should win over the cardinal fallback.
    placeFlora(state, state.player.x, state.player.y - 1, FloraSpecies.TallGrass)
    const facingId = placeFlora(state, state.player.x + 1, state.player.y - 1, FloraSpecies.Clover)
    const target = selectScanTarget(state)
    expect(target?.identity).toBe(facingId)
    expect(target?.kind === 'flora' && target.species).toBe(FloraSpecies.Clover)
  })

  it('falls back to ORDINAL order when no flora is on-tile or in the facing direction', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'left' // west — no flora there
    // Place flora only at the SE diagonal. Pre-fix the cardinal-only
    // fallback ignored diagonals and returned null.
    const seId = placeFlora(state, state.player.x + 1, state.player.y + 1, FloraSpecies.Clover)
    const target = selectScanTarget(state)
    expect(target?.identity).toBe(seId)
  })

  it('returns null when adjacent tiles are non-flora', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    // No flora anywhere near the player
    expect(selectScanTarget(state)).toBeNull()
  })
})

describe('commitScan', () => {
  it('is a no-op when scanInProgress is null', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    const id = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    state.scanInProgress = null
    commitScan(state, 1000)
    expect(state.scannedSpecimens.has(FloraSpecies.Clover)).toBe(false)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(false)
    // Reference id to satisfy lint (id is used to document intent — same
    // identity should still be present on the tile, untouched).
    expect(state.floraLifecycle.get(posKey(state.player.x, state.player.y))?.identity).toBe(id)
  })

  it('records the discovery and appends a specimen on first scan', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    const id = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(true)
    const specimens = state.scannedSpecimens.get(FloraSpecies.Clover) ?? []
    expect(specimens).toHaveLength(1)
    expect(specimens[0].identity).toBe(id)
    expect(specimens[0].scannedAt).toBe(1500)
  })

  it('appends a new card when scanning a different plant of the same species', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const firstId = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Wildflower)
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Wildflower,
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(state.scannedSpecimens.get(FloraSpecies.Wildflower)).toHaveLength(1)

    // Move to a new tile, place a different wildflower (new identity).
    state.map[state.player.y][state.player.x] = { type: TileType.Dirt }
    state.floraLifecycle.delete(posKey(state.player.x, state.player.y))
    state.player = { x: state.player.x + 2, y: state.player.y }
    const secondId = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Wildflower)
    expect(secondId).not.toBe(firstId)
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Wildflower,
      startTime: 0,
    }
    commitScan(state, 3000)

    const specimens = state.scannedSpecimens.get(FloraSpecies.Wildflower) ?? []
    expect(specimens).toHaveLength(2)
    expect(specimens[0].identity).toBe(firstId)
    expect(specimens[1].identity).toBe(secondId)
  })

  it('dedupes when scanning the same plant twice (same identity)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(state.scannedSpecimens.get(FloraSpecies.Clover)).toHaveLength(1)

    // Scan the same plant again — same posKey + species → same identity.
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    commitScan(state, 3000)
    // Still length 1 — duplicate identity is not appended.
    expect(state.scannedSpecimens.get(FloraSpecies.Clover)).toHaveLength(1)
  })

  it('aborts the commit when the target species no longer matches', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    // Player started scanning a wildflower, but only clover is here on commit
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Wildflower,
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(state.manualDiscoveries.has('flora:wildflower')).toBe(false)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(false)
    expect(state.scannedSpecimens.size).toBe(0)
  })

  it('aborts the commit when the target tile no longer holds a flora', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    // No flora placed — selectScanTarget returns null
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(false)
    expect(state.scannedSpecimens.size).toBe(0)
  })

  it('spawns a pickup bloom at the target tile on successful commit', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    const bloomsBefore = countPickupBlooms(state)
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(countPickupBlooms(state)).toBe(bloomsBefore + 1)
  })

  it('sets manualHighlightEntryId to flora:<species> on success and returns the committed { species, identity }', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Wildflower)
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Wildflower,
      startTime: 0,
    }
    const result = commitScan(state, 1500)
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('flora')
    if (result?.kind === 'flora') {
      expect(result.species).toBe(FloraSpecies.Wildflower)
      expect(result.identity).toHaveLength(64)
    }
    expect(state.manualHighlightEntryId).toBe('flora:wildflower')
  })

  it('leaves manualHighlightEntryId untouched on aborted commit and returns null', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    // No flora here — commit aborts
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    state.manualHighlightEntryId = null
    const result = commitScan(state, 1500)
    expect(result).toBeNull()
    expect(state.manualHighlightEntryId).toBeNull()
  })
})

// Helper: convert the tile under (x, y) to TileType.Egregore for the
// purposes of scan tests. Mirrors the pattern in egregore-advance tests.
const placeEgregore = (state: ReturnType<typeof createTestState>, x: number, y: number): void => {
  state.map[y][x] = { type: TileType.Egregore }
}

describe('egregore scan (RP-8a)', () => {
  it('selectScanTarget returns an egregore variant for an on-tile egregore', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeEgregore(state, state.player.x, state.player.y)
    const target = selectScanTarget(state)
    expect(target?.kind).toBe('egregore')
    if (target?.kind === 'egregore') {
      expect(target.position.x).toBe(state.player.x)
      expect(target.position.y).toBe(state.player.y)
      expect(target.identity).toHaveLength(64)
    }
  })

  it('selectScanTarget picks egregore in the playerFacing cardinal direction', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'right'
    placeEgregore(state, state.player.x + 1, state.player.y)
    const target = selectScanTarget(state)
    expect(target?.kind).toBe('egregore')
    if (target?.kind === 'egregore') {
      expect(target.position.x).toBe(state.player.x + 1)
    }
  })

  it('on-tile flora wins over an adjacent egregore tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    placeEgregore(state, state.player.x + 1, state.player.y)
    const target = selectScanTarget(state)
    expect(target?.kind).toBe('flora')
  })

  it('commitScan appends to egregoreSpecimens, deduped by identity', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeEgregore(state, state.player.x, state.player.y)
    state.scanInProgress = {
      kind: 'egregore',
      target: { x: state.player.x, y: state.player.y },
      startTime: 0,
    }
    expect(state.egregoreSpecimens).toHaveLength(0)
    const first = commitScan(state, 1500)
    expect(first?.kind).toBe('egregore')
    expect(state.egregoreSpecimens).toHaveLength(1)

    // Rescan the same tile — no new specimen, but bloom + highlight fire again.
    state.scanInProgress = {
      kind: 'egregore',
      target: { x: state.player.x, y: state.player.y },
      startTime: 2000,
    }
    state.manualHighlightEntryId = null
    const second = commitScan(state, 3500)
    expect(second?.kind).toBe('egregore')
    expect(state.egregoreSpecimens).toHaveLength(1)
    expect(state.manualHighlightEntryId).toBe(`egregore:${String(state.player.x)},${String(state.player.y)}`)
  })

  it('records the egregore:x,y manual discovery key on commit', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeEgregore(state, state.player.x, state.player.y)
    state.manualDiscoveries.clear()
    state.scanInProgress = {
      kind: 'egregore',
      target: { x: state.player.x, y: state.player.y },
      startTime: 0,
    }
    commitScan(state, 1500)
    const key = `egregore:${String(state.player.x)},${String(state.player.y)}`
    expect(state.manualDiscoveries.has(key)).toBe(true)
  })

  it('egregore tile identity is stable across selectScanTarget calls', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeEgregore(state, state.player.x, state.player.y)
    const a = selectScanTarget(state)
    const b = selectScanTarget(state)
    expect(a?.kind).toBe('egregore')
    expect(b?.kind).toBe('egregore')
    if (a?.kind === 'egregore' && b?.kind === 'egregore') {
      expect(a.identity).toBe(b.identity)
    }
  })

  it('aborts on kind drift — flora hold against egregore target returns null', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeEgregore(state, state.player.x, state.player.y)
    state.scanInProgress = {
      kind: 'flora',
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    expect(commitScan(state, 1500)).toBeNull()
  })

  it('spawns a pickup bloom at the scanned egregore tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeEgregore(state, state.player.x, state.player.y)
    const bloomsBefore = countPickupBlooms(state)
    state.scanInProgress = {
      kind: 'egregore',
      target: { x: state.player.x, y: state.player.y },
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(countPickupBlooms(state)).toBe(bloomsBefore + 1)
  })
})

// Regression — pre-fix the cardinal-only fallback in selectScanTarget left
// dead zones at every diagonal-adjacent tile. For a 5x5 oak that produced
// four iso-corner positions (Ax±3, Ay±3) where the player could see the
// tree on screen but [f] silently did nothing.

const ALL_FACINGS: Direction[] = ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight']

describe('selectScanTarget — oak iso-corner positions (Chebyshev-1 diagonal)', () => {
  const isoCorners = [
    { name: 'iso-N (Ax-3, Ay-3)', dx: -3, dy: -3 },
    { name: 'iso-S (Ax+3, Ay+3)', dx: 3, dy: 3 },
    { name: 'iso-E (Ax+3, Ay-3)', dx: 3, dy: -3 },
    { name: 'iso-W (Ax-3, Ay+3)', dx: -3, dy: 3 },
  ]

  for (const corner of isoCorners) {
    for (const facing of ALL_FACINGS) {
      it(`returns an oak target at ${corner.name} with playerFacing=${facing}`, () => {
        const state = createTestState()
        clearArea(state, state.player.x, state.player.y, 10)
        const ax = state.player.x + 6
        const ay = state.player.y + 6
        spawnOak(state, ax, ay, 0)
        state.player = { x: ax + corner.dx, y: ay + corner.dy }
        state.playerFacing = facing

        const target = selectScanTarget(state)
        expect(target?.kind).toBe('oak')
        if (target?.kind === 'oak') {
          expect(target.identity).toHaveLength(64)
        }
      })
    }
  }
})

describe('selectScanTarget — on-tile precedence over diagonal scan targets', () => {
  it('on-tile flora wins over a Chebyshev-1 diagonal oak body tile', () => {
    const state = createTestState()
    clearArea(state, state.player.x, state.player.y, 10)
    const px = state.player.x
    const py = state.player.y
    placeFlora(state, px, py, FloraSpecies.Clover)
    // Oak anchor at (px+3, py+3) — body spans [px+1..px+5] × [py+1..py+5].
    // The (px+1, py+1) corner tile sits Chebyshev 1 (SE diagonal) from the player.
    spawnOak(state, px + 3, py + 3, 0)
    const target = selectScanTarget(state)
    expect(target?.kind).toBe('flora')
  })
})
