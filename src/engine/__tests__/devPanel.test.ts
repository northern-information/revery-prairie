import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  COMPONENT_META,
  DEV_PRESETS,
  ENTITY_TAG_SUGGESTIONS,
  getComponentDefaults,
  paintRect,
  paintTile,
  spawnDevEntity,
  TILE_TYPE_LIST,
} from '../devPanel'
import { ComponentType } from '../ecs/types'
import { createWorld } from '../ecs/world'
import { TileType, Zone } from '../types'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const makeMinimalState = (): GameState => {
  const map = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: TileType.Dirt as TileType })))
  return {
    world: createWorld(),
    map,
    mapWidth: 10,
    mapHeight: 10,
    currentZone: Zone.Overworld,
    player: { x: 5, y: 5 },
  } as GameState
}

describe('dev panel', () => {
  describe('component metadata', () => {
    it('has metadata for every ComponentType', () => {
      const allTypes = new Set(Object.values(ComponentType))
      const metaTypes = new Set(COMPONENT_META.map(m => m.type))
      for (const type of allTypes) {
        expect(metaTypes.has(type)).toBe(true)
      }
    })

    it('metadata count matches ComponentType count', () => {
      expect(COMPONENT_META).toHaveLength(Object.values(ComponentType).length)
    })

    it('every metadata entry has a label and type', () => {
      for (const meta of COMPONENT_META) {
        expect(meta.label).toBeTruthy()
        expect(meta.type).toBeTruthy()
      }
    })
  })

  describe('component defaults', () => {
    it('returns defaults for every ComponentType', () => {
      const now = 1000
      for (const type of Object.values(ComponentType)) {
        const defaults = getComponentDefaults(type, now, Zone.Overworld)
        expect(defaults).toBeDefined()
      }
    })

    it('EntityTag default is a string', () => {
      const defaults = getComponentDefaults(ComponentType.EntityTag, 1000, Zone.Overworld)
      expect(typeof defaults).toBe('string')
    })

    it('Position default has x and y', () => {
      const defaults = getComponentDefaults(ComponentType.Position, 1000, Zone.Overworld)
      expect(defaults).toEqual({ x: 0, y: 0 })
    })

    it('EntityZone default uses provided zone', () => {
      const defaults = getComponentDefaults(ComponentType.EntityZone, 1000, Zone.Cave)
      expect(defaults).toEqual({ zone: Zone.Cave })
    })

    it('TimedEffect startTime uses provided now value', () => {
      const defaults = getComponentDefaults(ComponentType.TimedEffect, 42000, Zone.Overworld) as Record<string, unknown>
      expect(defaults.startTime).toBe(42000)
    })
  })

  describe('presets', () => {
    it('every preset has at least one component', () => {
      for (const [key, preset] of Object.entries(DEV_PRESETS)) {
        expect(preset.components.length).toBeGreaterThan(0)
        expect(preset.label).toBeTruthy()
        void key
      }
    })

    it('every preset component type is a valid ComponentType', () => {
      const allTypes = new Set(Object.values(ComponentType))
      for (const preset of Object.values(DEV_PRESETS)) {
        for (const comp of preset.components) {
          expect(allTypes.has(comp.type)).toBe(true)
        }
      }
    })

    it('bee preset includes Position, EntityTag, EntityZone, HungerTimer', () => {
      const bee = DEV_PRESETS.bee
      const types = bee.components.map(c => c.type)
      expect(types).toContain(ComponentType.Position)
      expect(types).toContain(ComponentType.EntityTag)
      expect(types).toContain(ComponentType.EntityZone)
      expect(types).toContain(ComponentType.HungerTimer)
    })

    it('angel preset includes AngelData and Aura', () => {
      const angel = DEV_PRESETS.angel
      const types = angel.components.map(c => c.type)
      expect(types).toContain(ComponentType.AngelData)
      expect(types).toContain(ComponentType.Aura)
    })
  })

  describe('spawnDevEntity', () => {
    it('creates an entity with Position at the given coordinates', () => {
      const state = makeMinimalState()
      const components = new Map<ComponentType, Record<string, unknown>>()
      components.set(ComponentType.Position, { x: 0, y: 0 })
      components.set(ComponentType.EntityTag, { value: 'bee' })

      spawnDevEntity(state, components, { x: 3, y: 7 })

      const entities = state.world.query(ComponentType.Position, ComponentType.EntityTag)
      expect(entities).toHaveLength(1)
      const pos = state.world.getComponent(entities[0], ComponentType.Position)
      expect(pos).toEqual({ x: 3, y: 7 })
    })

    it('sets EntityTag as a string value', () => {
      const state = makeMinimalState()
      const components = new Map<ComponentType, Record<string, unknown>>()
      components.set(ComponentType.Position, {})
      components.set(ComponentType.EntityTag, { value: 'meteorite' })

      spawnDevEntity(state, components, { x: 1, y: 1 })

      const entities = state.world.query(ComponentType.EntityTag)
      expect(entities).toHaveLength(1)
      const tag = state.world.getComponent(entities[0], ComponentType.EntityTag)
      expect(tag).toBe('meteorite')
    })

    it('sets EntityZone to current zone by default', () => {
      const state = makeMinimalState()
      state.currentZone = Zone.Cave
      const components = new Map<ComponentType, Record<string, unknown>>()
      components.set(ComponentType.Position, {})
      components.set(ComponentType.EntityZone, {})

      spawnDevEntity(state, components, { x: 0, y: 0 })

      const entities = state.world.query(ComponentType.EntityZone)
      expect(entities).toHaveLength(1)
      const zone = state.world.getComponent(entities[0], ComponentType.EntityZone)
      expect(zone).toEqual({ zone: Zone.Cave })
    })

    it('spawns nothing when no components are checked', () => {
      const state = makeMinimalState()
      const components = new Map<ComponentType, Record<string, unknown>>()

      spawnDevEntity(state, components, { x: 0, y: 0 })

      // Entity is created but has no components — query with any type returns nothing
      const entities = state.world.query(ComponentType.Position)
      expect(entities).toHaveLength(0)
    })

    it('applies overrides to non-special components', () => {
      const state = makeMinimalState()
      const components = new Map<ComponentType, Record<string, unknown>>()
      components.set(ComponentType.Position, {})
      components.set(ComponentType.Blocking, { blockMovement: false })

      spawnDevEntity(state, components, { x: 2, y: 2 })

      const entities = state.world.query(ComponentType.Blocking)
      expect(entities).toHaveLength(1)
      const blocking = state.world.getComponent(entities[0], ComponentType.Blocking)
      expect(blocking).toEqual({ blockMovement: false })
    })
  })

  describe('tile painting', () => {
    it('paints a tile to the selected type', () => {
      const state = makeMinimalState()
      expect(state.map[3][4].type).toBe(TileType.Dirt)

      paintTile(state, 4, 3, TileType.Clover)

      expect(state.map[3][4].type).toBe(TileType.Clover)
    })

    it('does nothing for out-of-bounds coordinates', () => {
      const state = makeMinimalState()
      paintTile(state, -1, 0, TileType.Clover)
      paintTile(state, 0, -1, TileType.Clover)
      paintTile(state, 100, 0, TileType.Clover)
      paintTile(state, 0, 100, TileType.Clover)

      // All tiles should still be dirt
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(state.map[y][x].type).toBe(TileType.Dirt)
        }
      }
    })

    it('TILE_TYPE_LIST contains all TileType values', () => {
      const allValues = new Set(Object.values(TileType))
      const listValues = new Set(TILE_TYPE_LIST.map(t => t.value))
      expect(listValues).toEqual(allValues)
    })
  })

  describe('rectangle painting', () => {
    it('fills a rectangular area with the selected tile type', () => {
      const state = makeMinimalState()
      paintRect(state, 2, 3, 5, 6, TileType.Clover)

      for (let y = 3; y <= 6; y++) {
        for (let x = 2; x <= 5; x++) {
          expect(state.map[y][x].type).toBe(TileType.Clover)
        }
      }
      // Outside the rect should still be dirt
      expect(state.map[2][2].type).toBe(TileType.Dirt)
      expect(state.map[7][5].type).toBe(TileType.Dirt)
    })

    it('handles inverted coordinates (drag right-to-left or bottom-to-top)', () => {
      const state = makeMinimalState()
      paintRect(state, 5, 6, 2, 3, TileType.Sand)

      for (let y = 3; y <= 6; y++) {
        for (let x = 2; x <= 5; x++) {
          expect(state.map[y][x].type).toBe(TileType.Sand)
        }
      }
    })

    it('clamps to map bounds', () => {
      const state = makeMinimalState()
      paintRect(state, -5, -5, 2, 2, TileType.Space)

      // Only the in-bounds portion should be painted
      for (let y = 0; y <= 2; y++) {
        for (let x = 0; x <= 2; x++) {
          expect(state.map[y][x].type).toBe(TileType.Space)
        }
      }
      // Rest untouched
      expect(state.map[3][3].type).toBe(TileType.Dirt)
    })

    it('paints a single tile when start equals end', () => {
      const state = makeMinimalState()
      paintRect(state, 4, 4, 4, 4, TileType.Clover)

      expect(state.map[4][4].type).toBe(TileType.Clover)
      expect(state.map[4][3].type).toBe(TileType.Dirt)
      expect(state.map[3][4].type).toBe(TileType.Dirt)
    })
  })

  describe('entity tag completeness', () => {
    it('ENTITY_TAG_SUGGESTIONS includes every EntityTag string used in engine source', () => {
      const engineDir = path.resolve(__dirname, '..')
      const tagPattern = /addComponent\(\s*\w+,\s*ComponentType\.EntityTag,\s*'([^']+)'\)/g

      const foundTags = new Set<string>()
      const scanDir = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === '__tests__') continue
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            scanDir(full)
          } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
            const content = fs.readFileSync(full, 'utf8')
            for (const match of content.matchAll(tagPattern)) {
              foundTags.add(match[1])
            }
          }
        }
      }
      scanDir(engineDir)

      const knownTags = new Set<string>(ENTITY_TAG_SUGGESTIONS)
      const missing = [...foundTags].filter(tag => !knownTags.has(tag))
      expect(missing, `EntityTag strings missing from ENTITY_TAG_SUGGESTIONS: ${missing.join(', ')}`).toEqual([])
    })
  })
})
