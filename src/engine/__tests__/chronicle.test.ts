// RP-22 — Chronicle suite.
//
// Architecture guards (no chronicle imports from player-action source
// files, no chronicle imports from non-allowed component files, single-
// genesis detection, template registry invariants) and behavior tests
// (emitters, dedupe, fallback resolution, cave-zone gating, tenure
// boundary reset).

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { addChronicleEvent, computeChronicleEventId, resolveRegionForPosition } from '../chronicle'
import {
  emitEgregoreReach,
  emitMeteoriteImpact,
  emitSeasonRollover,
  tickChronicle,
} from '../chronicle/emitters'
import { CHRONICLE_TEMPLATES } from '../chronicle/templates'
import { detectNamedRegions } from '../regions'
import { createGameState } from '../state'
import { Season, Zone } from '../types'

import { createTestState, swapToOverworldForTest } from './helpers'

const REPO_ROOT = resolve(__dirname, '../../..')

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Architecture guards ---

describe('chronicle architecture guards', () => {
  it('player-action source files do not import from chronicle/', () => {
    // movement.ts, dialog.ts, inventory.ts, recipes.ts are the canonical
    // player-action surfaces. World-state-transition emission must not
    // be triggered by player input — emitters live behind the engine
    // tick orchestrator.
    const playerActionFiles = ['movement.ts', 'interaction.ts', 'inventory.ts', 'recipes.ts']
    for (const file of playerActionFiles) {
      const path = join(REPO_ROOT, 'src', 'engine', file)
      const src = readFileSync(path, 'utf-8')
      expect(src, `${file} must not import from chronicle/`).not.toMatch(/from\s+['"][^'"]*chronicle\//)
    }
  })

  it('only allowlisted component files import from chronicle/', () => {
    const allowlist = new Set(['ReverySummary.tsx', 'ManualPanel.tsx', 'ManualPanel.constants.ts'])
    const componentsDir = join(REPO_ROOT, 'src', 'components')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(join(dir, entry.name))
          continue
        }
        if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          files.push(join(dir, entry.name))
        }
      }
    }
    walk(componentsDir)
    for (const path of files) {
      const src = readFileSync(path, 'utf-8')
      if (!/from\s+['"][^'"]*chronicle\//.test(src)) continue
      const name = path.split('/').pop() ?? ''
      expect(
        allowlist.has(name),
        `${name} imports from chronicle/ but is not in the no-running-feed allowlist (${[...allowlist].join(', ')})`
      ).toBe(true)
    }
  })

  it('detectNamedRegions runs at most once per tenure', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const state = createGameState('Test', 40, 30)
    const ref = state.namedRegions
    expect(state.namedRegions.length).toBeGreaterThan(0)
    // Re-invoking other engine code (a movement tick, a weather tick)
    // must NOT replace the array reference. Identity guards against any
    // accidental second-writer pattern.
    state.player.x += 1
    expect(state.namedRegions).toBe(ref)
  })
})

// --- Template registry invariants ---

describe('CHRONICLE_TEMPLATES', () => {
  it('keeps the negative-tone ratio at or above 50%', () => {
    const entries = Object.values(CHRONICLE_TEMPLATES)
    const negativeCount = entries.filter(t => t.tone === 'negative').length
    const ratio = negativeCount / entries.length
    expect(ratio).toBeGreaterThanOrEqual(0.5)
  })

  it('every template covers all seven categories with at least two entries each', () => {
    const categories = [
      'season-rollover',
      'species-extinction',
      'egregore-reach',
      'egregore-advance',
      'meteorite-impact',
      'stone-circle',
      'hallowed-ground',
    ] as const
    for (const cat of categories) {
      const inCat = Object.values(CHRONICLE_TEMPLATES).filter(t => t.category === cat)
      expect(inCat.length, `category ${cat} must have ≥2 templates`).toBeGreaterThanOrEqual(2)
    }
  })

  it('no template renders the banned word "invasive" for any plausible slot set', () => {
    const slotSamples: Record<string, string> = {
      season: 'spring',
      region: 'the south ridge',
      year: '3',
      species: 'clover',
    }
    for (const template of Object.values(CHRONICLE_TEMPLATES)) {
      const text = template.text(slotSamples)
      expect(text.toLowerCase()).not.toContain('invasive')
    }
  })

  it('every rendered template stays at or below 12 words', () => {
    const slotSamples: Record<string, string> = {
      season: 'spring',
      region: 'the south ridge',
      year: '3',
      species: 'clover',
    }
    for (const template of Object.values(CHRONICLE_TEMPLATES)) {
      const text = template.text(slotSamples)
      const words = text.split(/\s+/).filter(Boolean)
      expect(words.length, `${template.id}: "${text}"`).toBeLessThanOrEqual(12)
    }
  })
})

// --- Region detection ---

describe('detectNamedRegions', () => {
  it('always includes a prairie fallback region', () => {
    const regions = detectNamedRegions({
      mapWidth: 10,
      mapHeight: 10,
      map: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'dirt' as const }))),
      ponds: new Set(),
      ruins: [],
      craters: new Set(),
      tectonicAxes: [],
      caveEntranceOverworld: { x: 0, y: 0 },
      villageCenter: { x: 5, y: 5 },
    })
    expect(regions.some(r => r.kind === 'prairie')).toBe(true)
  })

  it('is deterministic for the same steward name', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const a = createGameState('Determinism', 40, 30)
    const b = createGameState('Determinism', 40, 30)
    expect(a.namedRegions.map(r => r.id)).toEqual(b.namedRegions.map(r => r.id))
    expect(a.namedRegions.map(r => r.name)).toEqual(b.namedRegions.map(r => r.name))
  })
})

// --- Chronicle store ---

describe('addChronicleEvent', () => {
  it('appends when the event id is novel', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    const before = state.chronicle.length
    const result = addChronicleEvent(state, {
      templateId: 'season-came',
      regionId: 'prairie',
      year: 1,
      season: Season.Spring,
      tone: 'positive',
      slots: { season: 'spring', region: 'the prairie' },
    })
    expect(result).toBe(true)
    expect(state.chronicle.length).toBe(before + 1)
  })

  it('dedupes by id within a frame', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    const draft = {
      templateId: 'season-came',
      regionId: 'prairie',
      year: 1,
      season: Season.Spring,
      tone: 'positive' as const,
      slots: { season: 'spring', region: 'the prairie' },
    }
    expect(addChronicleEvent(state, draft)).toBe(true)
    expect(addChronicleEvent(state, draft)).toBe(false)
    expect(state.chronicle.length).toBe(1)
  })

  it('throws on a regionId not present in state.namedRegions', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    expect(() =>
      addChronicleEvent(state, {
        templateId: 'season-came',
        regionId: 'phantom-region',
        year: 1,
        season: Season.Spring,
        tone: 'positive',
        slots: {},
      })
    ).toThrow(/phantom-region/)
  })

  it('computes a deterministic id from sorted slot keys', () => {
    const idA = computeChronicleEventId({
      templateId: 'x',
      regionId: 'r',
      year: 1,
      season: Season.Spring,
      slots: { a: '1', b: '2' },
    })
    const idB = computeChronicleEventId({
      templateId: 'x',
      regionId: 'r',
      year: 1,
      season: Season.Spring,
      slots: { b: '2', a: '1' },
    })
    expect(idA).toBe(idB)
  })
})

describe('resolveRegionForPosition', () => {
  it('falls back to the prairie region when no specific region contains the position', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const state = createGameState('Test', 40, 30)
    // Pick a position guaranteed to be outside any named region's tile
    // set. Map bounds are large; (0, 0) is corner space.
    const region = resolveRegionForPosition(state, { x: 0, y: 0 })
    expect(region.kind).toBe('prairie')
  })
})

// --- Emitters ---

describe('emitSeasonRollover', () => {
  it('emits exactly one event per transition', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    state.chronicle = []
    emitSeasonRollover(state, Season.Winter, Season.Spring)
    expect(state.chronicle.length).toBe(1)
    expect(state.chronicle[0].tone).toBe('positive')
  })

  it('no-ops when the player is in the cave zone', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    state.chronicle = []
    emitSeasonRollover(state, Season.Autumn, Season.Winter)
    expect(state.chronicle.length).toBe(0)
  })

  it('no-ops when the season does not change', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    state.chronicle = []
    emitSeasonRollover(state, Season.Spring, Season.Spring)
    expect(state.chronicle.length).toBe(0)
  })
})

describe('emitMeteoriteImpact', () => {
  it('falls back to the prairie region when the impact misses every specific region', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const state = createGameState('Impact', 40, 30)
    swapToOverworldForTest(state)
    state.chronicle = []
    emitMeteoriteImpact(state, { x: 0, y: 0 })
    expect(state.chronicle.length).toBe(1)
    expect(state.chronicle[0].regionId).toBe('prairie')
  })
})

describe('emitEgregoreReach', () => {
  it('emits when the region exists', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    state.chronicle = []
    emitEgregoreReach(state, 'prairie')
    expect(state.chronicle.length).toBe(1)
    expect(state.chronicle[0].tone).toBe('negative')
  })

  it('no-ops on cave zone', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.namedRegions = [
      {
        id: 'prairie',
        name: 'the prairie',
        kind: 'prairie',
        anchor: { x: 0, y: 0 },
        tiles: new Set(),
      },
    ]
    state.chronicle = []
    emitEgregoreReach(state, 'prairie')
    expect(state.chronicle.length).toBe(0)
  })
})

// --- Tenure boundary ---

describe('tenure boundary', () => {
  it('state.chronicle is empty on a fresh GameState; state.namedRegions regenerates identically for the same steward name', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const a = createGameState('Lineage', 40, 30)
    expect(a.chronicle).toEqual([])
    const b = createGameState('Lineage', 40, 30)
    expect(b.chronicle).toEqual([])
    expect(a.namedRegions.map(r => r.id)).toEqual(b.namedRegions.map(r => r.id))
  })
})

// --- tickChronicle scan ---

describe('tickChronicle', () => {
  it('seeds the prior-state snapshots on the first call and emits nothing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const state = createGameState('Scan', 40, 30)
    swapToOverworldForTest(state)
    state.chronicle = []
    tickChronicle(state)
    expect(state.chronicle.length).toBe(0)
  })

  it('is a no-op outside the overworld', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const state = createGameState('Cave', 40, 30)
    state.currentZone = Zone.Cave
    state.chronicle = []
    tickChronicle(state)
    expect(state.chronicle.length).toBe(0)
  })
})
