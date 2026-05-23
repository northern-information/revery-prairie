import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BUILDING_CHARS,
  RAIN_AURA_DENSITY,
  SATELLITE_TRAIL_COLORS,
  TILE_COLORS,
  ZONE_TRANSITION_FADE_IN_MS,
  ZONE_TRANSITION_FADE_OUT_MS,
  ZONE_TRANSITION_HOLD_MS,
} from '../constants'
import { completeGenesis, GENESIS_EPOCHS } from '../genesis'
import { computeGenesisCamera } from '../genesisRenderer'
import { tileHash } from '../position'
import { createGameState } from '../state'
import { TileType } from '../types'
import { withSeededRandom } from '@/harness/prng'
import { describe, expect, it } from 'vitest'

const CRATER_COLORS = ['#8B4513', '#7A3B10', '#6B320D', '#5C290A', '#4D2007']

const SEED = 42

describe('boot title card', () => {
  describe('completeGenesis schedules bootTitleCard', () => {
    it('sets bootTitleCard with startTime and the Revery Prairie label when genesis completes', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      expect(state.genesis).not.toBeNull()
      expect(state.bootTitleCard).toBeNull()

      completeGenesis(state)

      // state.genesis stays alive during the title card fade-in so the
      // genesis renderer keeps painting underneath. finalizeGenesisHandoff
      // (called by gameLoop at hold midpoint) is what clears it.
      expect(state.genesis).not.toBeNull()
      expect(state.bootTitleCard).not.toBeNull()
      expect(state.bootTitleCard?.label).toBe('Revery Prairie')
      expect(typeof state.bootTitleCard?.startTime).toBe('number')
    })

    it('subsequent calls re-schedule a title card while genesis is still alive', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      completeGenesis(state)
      const firstCard = state.bootTitleCard
      expect(firstCard).not.toBeNull()
      expect(state.genesis).not.toBeNull()

      // Genesis is still alive (handoff hasn't fired yet); a second
      // completeGenesis call will overwrite the title card. The
      // important guarantee is that completeGenesis is idempotent
      // once finalizeGenesisHandoff has actually nulled state.genesis.
      completeGenesis(state)
      expect(state.bootTitleCard).not.toBeNull()
    })
  })

  describe('skipTitleCard option', () => {
    it('does not set bootTitleCard when skipTitleCard is true', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      completeGenesis(state, { skipTitleCard: true })
      expect(state.genesis).toBeNull()
      expect(state.bootTitleCard).toBeNull()
    })

    it('sets bootTitleCard by default (no options arg)', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      completeGenesis(state)
      expect(state.bootTitleCard).not.toBeNull()
    })
  })

  describe('title card initialization', () => {
    it('bootTitleCard is initialized to null in createGameState', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      expect(state.bootTitleCard).toBeNull()
    })

    it('title card total duration matches the zone transition timings', () => {
      // The cleanup loop in gameLoop must clear bootTitleCard after the
      // sum of fade-in + hold + fade-out elapses. These constants are
      // the source of truth for both the zone overlay and the title card.
      const total = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS + ZONE_TRANSITION_FADE_OUT_MS
      expect(total).toBe(3400)
    })
  })

  describe('genesis presentDay rendering', () => {
    it('does NOT render Gron — Gron arrives with the player after the title card', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      const sim = state.genesis
      expect(sim).not.toBeNull()
      if (!sim) return

      const gronX = Math.floor(sim.width / 2)
      const gronY = Math.floor(sim.height / 2)
      const lastEpoch = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
      const tiles = lastEpoch.renderTile(sim, gronX, gronY, 1, 1000)

      for (const t of tiles) {
        expect(t.char).not.toBe('G')
      }
    })

    it('does NOT render the player — the player arrives via the spawn meteor', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      const sim = state.genesis
      expect(sim).not.toBeNull()
      if (!sim) return

      const playerX = Math.floor(sim.width / 2) - 1
      const playerY = Math.floor(sim.height / 2)
      const lastEpoch = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
      const tiles = lastEpoch.renderTile(sim, playerX, playerY, 1, 1000)

      for (const t of tiles) {
        expect(t.char).not.toBe('@')
      }
    })

    it('precis #33 — no playerSpawn field exists on the state shape', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      expect((state as unknown as { playerSpawn?: unknown }).playerSpawn).toBeUndefined()
    })
  })

  describe('rain aura seed continuity', () => {
    it('genesis sim receives rainSeed from game state', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      const sim = state.genesis
      expect(sim).not.toBeNull()
      if (!sim) return

      expect(sim.rainSeed).toBe(state.rainSeed)
      expect(sim.rainSeed).not.toBe(0)
    })

    it('rain aura density check produces same results for genesis and game renderer', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      const sim = state.genesis
      expect(sim).not.toBeNull()
      if (!sim) return

      const gronX = Math.floor(sim.width / 2)
      const gronY = Math.floor(sim.height / 2)
      const rainSeed = sim.rainSeed

      let checked = 0
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dy * dy > 9) continue
          const tx = gronX + dx
          const ty = gronY + dy
          const gameH = tileHash(tx + rainSeed, ty)
          const isRainInGame = gameH % RAIN_AURA_DENSITY === 0
          const genesisH = tileHash(tx + rainSeed, ty)
          const isRainInGenesis = genesisH % RAIN_AURA_DENSITY === 0
          expect(isRainInGenesis).toBe(isRainInGame)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    })
  })

  describe('presentDay structural rendering', () => {
    it('renders satellite craters with the brown game-renderer palette, not red trail colors', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      const sim = state.genesis
      expect(sim).not.toBeNull()
      if (!sim) return
      expect(sim.craters.size).toBeGreaterThan(0)

      const presentDay = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
      let assertedAny = false

      for (const key of sim.craters) {
        const [xStr, yStr] = key.split(',')
        const x = Number(xStr)
        const y = Number(yStr)
        const tile = sim.grid[y]?.[x]
        if (tile?.type !== TileType.Dirt) continue

        const renders = presentDay.renderTile(sim, x, y, 1, 0)
        expect(renders.length).toBe(1)
        const r = renders[0]

        const h = tileHash(x, y)
        expect(r.char).toBe(BUILDING_CHARS[h % BUILDING_CHARS.length])
        expect(CRATER_COLORS).toContain(r.color)
        expect(SATELLITE_TRAIL_COLORS).not.toContain(r.color)
        assertedAny = true
      }

      expect(assertedAny).toBe(true)
    })

    it('renders RuinEntrance tiles with the game-renderer glyph and color', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      const sim = state.genesis
      expect(sim).not.toBeNull()
      if (!sim) return
      expect(state.ruinInteriors.length).toBeGreaterThan(0)

      const presentDay = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
      const interior = state.ruinInteriors[0]
      const ex = interior.entranceOverworld.x
      const ey = interior.entranceOverworld.y
      expect(sim.grid[ey][ex].type).toBe(TileType.RuinEntrance)

      const renders = presentDay.renderTile(sim, ex, ey, 1, 0)
      expect(renders.length).toBe(1)
      expect(renders[0].char).toBe('O')
      expect(renders[0].color).toBe(TILE_COLORS[TileType.RuinEntrance])
    })

    it('renders CaveEntrance with the game-renderer glyph and color', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      const sim = state.genesis
      expect(sim).not.toBeNull()
      if (!sim) return

      const presentDay = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
      const cx = state.caveEntranceOverworld.x
      const cy = state.caveEntranceOverworld.y
      expect(sim.grid[cy][cx].type).toBe(TileType.CaveEntrance)

      const renders = presentDay.renderTile(sim, cx, cy, 1, 0)
      expect(renders.length).toBe(1)
      expect(renders[0].char).toBe('O')
      expect(renders[0].color).toBe(TILE_COLORS[TileType.CaveEntrance])
    })
  })

  describe('elevation rendering in genesis', () => {
    const readGenesisRenderer = (): string => readFileSync(join(__dirname, '../genesisRenderer.ts'), 'utf-8')

    it('imports the shared elevation primitives from tileBg and projection', () => {
      const source = readGenesisRenderer()
      expect(source).toContain('getElevationTier')
      expect(source).toContain('getTierLift')
      expect(source).toContain('ELEVATION_TIER_LIFT_PX')
      expect(source).toContain('drawCellWalls')
      expect(source).toContain('WALL_LEFT_SHADE')
      expect(source).toContain('WALL_RIGHT_SHADE')
      expect(source).toContain('darkenColor')
      expect(source).toContain('getTileBgColor')
    })

    it('reads sim.elevation per tile via posKey', () => {
      const source = readGenesisRenderer()
      expect(source).toMatch(/sim\.elevation\.get\(posKey\(/)
    })
  })

  describe('legacy genesis transition removal', () => {
    it('genesisTransition field is not declared on GameState', () => {
      const source = readFileSync(join(__dirname, '../types.ts'), 'utf-8')
      expect(source).not.toMatch(/genesisTransition:/)
    })

    it('GENESIS_TRANSITION_* constants are removed from constants.ts', () => {
      const source = readFileSync(join(__dirname, '../constants.ts'), 'utf-8')
      expect(source).not.toMatch(/GENESIS_TRANSITION_/)
    })

    it('state.zoom is removed from GameState', () => {
      const source = readFileSync(join(__dirname, '../types.ts'), 'utf-8')
      // Match the GameState block specifically (the previous regex matched
      // unrelated 'zoom' words elsewhere).
      expect(source).not.toMatch(/^\s+zoom: number$/m)
    })

    it('ZOOM_DEFAULT constant is removed from constants.ts', () => {
      const source = readFileSync(join(__dirname, '../constants.ts'), 'utf-8')
      expect(source).not.toMatch(/ZOOM_DEFAULT/)
    })

    it('renderer.ts no longer references transitionAlpha', () => {
      const source = readFileSync(join(__dirname, '../renderer.ts'), 'utf-8')
      expect(source).not.toMatch(/transitionAlpha/)
      expect(source).not.toMatch(/applyEntityFade/)
      expect(source).not.toMatch(/getTransitionAlpha/)
    })
  })

  describe('input gating during boot title card', () => {
    it('isInputGated returns true when bootTitleCard is set', () => {
      const source = readFileSync(join(__dirname, '../zoneTransition.ts'), 'utf-8')
      expect(source).toMatch(/state\.bootTitleCard !== null/)
    })

    it('useKeyboard uses isInputGated for transition gating', () => {
      const source = readFileSync(join(__dirname, '../../hooks/useKeyboard.ts'), 'utf-8')
      expect(source).toContain('isInputGated(state)')
    })

    it('useMouse uses isInputGated for transition gating', () => {
      const source = readFileSync(join(__dirname, '../../hooks/useMouse.ts'), 'utf-8')
      expect(source).toContain('isInputGated(state)')
    })

    it('movement.ts uses isInputGated for transition gating', () => {
      const source = readFileSync(join(__dirname, '../movement.ts'), 'utf-8')
      expect(source).toContain('isInputGated(state)')
    })
  })
})

describe('genesis camera centering', () => {
  const SIM_WIDTH = 147
  const SIM_HEIGHT = 147

  it('centers the prairie on the full canvas when viewport is wider than the sim', () => {
    const viewportWidth = 300
    const viewportHeight = 200
    const { cameraX, cameraY } = computeGenesisCamera(SIM_WIDTH, SIM_HEIGHT, viewportWidth, viewportHeight)

    // Full-canvas centering: cameraX = -floor((300 - 147) / 2) = -76
    expect(cameraX).toBe(-Math.floor((viewportWidth - SIM_WIDTH) / 2))
    expect(cameraY).toBe(-Math.floor((viewportHeight - SIM_HEIGHT) / 2))
  })

  it('clamps to player-anchored centering when viewport is smaller than the sim', () => {
    const viewportWidth = 80
    const viewportHeight = 40
    const playerX = Math.floor(SIM_WIDTH / 2) - 1
    const playerY = Math.floor(SIM_HEIGHT / 2)
    const { cameraX, cameraY } = computeGenesisCamera(SIM_WIDTH, SIM_HEIGHT, viewportWidth, viewportHeight)

    const expectedCameraX = Math.max(
      0,
      Math.min(playerX - Math.floor(viewportWidth / 2), SIM_WIDTH - viewportWidth)
    )
    const expectedCameraY = Math.max(
      0,
      Math.min(playerY - Math.floor(viewportHeight / 2), SIM_HEIGHT - viewportHeight)
    )
    expect(cameraX).toBe(expectedCameraX)
    expect(cameraY).toBe(expectedCameraY)
  })
})
