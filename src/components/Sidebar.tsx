import { useEffect, useRef, useState } from 'react'
import { ItemInfo } from './ItemInfo'
import { PanelTitle, SectionHeader } from './PanelPrimitives'

import { getCharacterDefinition } from '@/engine/characters'
import {
  DEEP_TIME_TOTAL_YEARS,
  DEEP_TIME_TRANSITION_DURATION_MS,
  GENESIS_TRANSITION_SIDEBAR_DURATION_MS,
  getEntranceGlyph,
  SOIL_HEALTH_DEFAULT,
  SPACE_BORDER,
  TILE_COLORS,
  WATER_MAX,
} from '@/engine/constants'
import { screenToTile } from '@/engine/coordinates'
import { ComponentType } from '@/engine/ecs/types'
import { getTileEffects } from '@/engine/effects'
import { formatYear, GENESIS_END_YEAR, GENESIS_EPOCHS, getEpochProgress, getGenesisYear } from '@/engine/genesis'
import { getDefinition } from '@/engine/items'
import { isInBounds, posKey } from '@/engine/position'
import { getLastVisibleSet } from '@/engine/renderer'
import { CloverStage, DeepTimePhase, TileType, Zone } from '@/engine/types'
import { getTileVisibility, hasFogOfWar } from '@/engine/visibility'
import { fToC, mphToKph } from '@/engine/weather'
import type { ItemInfoHandle } from './ItemInfo'
import type { CharMetrics, GameState } from '@/engine/types'
import type { PermacomputerScreen } from '@/hooks/useKeyboard'

const countTiles = (state: GameState, type: TileType): number => {
  let count = 0
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      if (state.map[y][x].type === type) count++
    }
  }
  return count
}

const SKY_LABEL = {
  sun: 'Sunny',
  cloudy: 'Cloudy',
  rain: 'Rain',
} as const

// Arrows show on-screen blow direction derived from WIND_SCREEN_VECTORS.
// N wind has screen vector (-1,+1) = lower-left, so the arrow points ↙.
const WIND_DIRECTION_ARROW: Record<string, string> = {
  N: '↙',
  NE: '←',
  E: '↖',
  SE: '↑',
  S: '↗',
  SW: '→',
  W: '↘',
  NW: '↓',
}

const capitalize = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1))

// Persistent outer shell for the sidebar. The black backdrop must never drop
// opacity across branch swaps (genesis → gameplay, gameplay → deep time),
// so all three render modes share this element. Content-level fades apply
// to a wrapper nested inside — never to this outer div.
const SIDEBAR_SHELL_CLASSES =
  'text-text pointer-events-none fixed top-0 right-0 z-10 flex h-full w-48 flex-col justify-between bg-black/70 px-4 py-4 font-mono text-xs'

interface SidebarProps {
  state: GameState
  activeScreen: PermacomputerScreen
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  metricsRef: React.RefObject<CharMetrics | null>
  refreshUI: () => void
}

export const Sidebar = ({ state, activeScreen, itemInfoRef, metricsRef }: SidebarProps) => {
  const { metric } = state
  const cursorRef = useRef<{ x: number; y: number } | null>(null)
  const [, setCursorVersion] = useState(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Hide when mouse is visually over the sidebar or inventory panel
      // (sidebar is pointer-events-none so e.target is still the canvas)
      const sidebarWidth = 192 // w-48
      const sidebarLeft = window.innerWidth - sidebarWidth
      const overSidebar = e.clientX >= sidebarLeft

      const target = e.target as HTMLElement
      if (target.tagName !== 'CANVAS' || overSidebar) {
        if (cursorRef.current !== null) {
          cursorRef.current = null
          state.cursorScreenPos = null
          state.cursorTile = null
          setCursorVersion(v => v + 1)
        }
        return
      }
      const metrics = metricsRef.current
      if (!metrics) return
      const rect = target.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (cursorRef.current?.x === sx && cursorRef.current?.y === sy) return
      cursorRef.current = { x: sx, y: sy }
      state.cursorScreenPos = { x: sx, y: sy }
      setCursorVersion(v => v + 1)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [metricsRef, state])

  // Derive cursor world tile from screen position + current camera each render.
  // Use the engine's screenToTile so the inverse transform matches click-to-move
  // and updateCursorState — otherwise the sidebar reads Position/Contents/Effects
  // for the wrong tile. The cursor section keeps tracking during WASD and active
  // click-to-move paths so the player can see hover info while walking.
  const metrics = metricsRef.current
  const cursorTile =
    state.cursorScreenPos && metrics
      ? screenToTile(
          state.cursorScreenPos.x,
          state.cursorScreenPos.y,
          state.camera,
          metrics.charWidth,
          metrics.charHeight,
          state.viewportWidth,
          state.viewportHeight
        )
      : null

  // Genesis mode: show epoch info + progress bar instead of normal sidebar
  if (state.genesis && state.genesis.epochIndex < GENESIS_EPOCHS.length) {
    const epochProgress = getEpochProgress(state.genesis, GENESIS_EPOCHS)
    const overallProgress = (state.genesis.epochIndex + epochProgress) / GENESIS_EPOCHS.length

    return (
      <div data-panel="sidebar" className={SIDEBAR_SHELL_CLASSES}>
        <div className="flex flex-col gap-4">
          <PanelTitle>
            <span className="game-title">Revery Prairie</span>
          </PanelTitle>
          <div>
            <SectionHeader>Genesis</SectionHeader>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="text-muted py-0.5">Year</td>
                  <td className="py-0.5 text-right">
                    {formatYear(getGenesisYear(state.genesis, GENESIS_EPOCHS, performance.now()))}
                  </td>
                </tr>
                <tr>
                  <td className="text-muted py-0.5">Epoch</td>
                  <td className="py-0.5 text-right">
                    {state.genesis.epochIndex + 1}/{GENESIS_EPOCHS.length}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="mt-2 h-1 w-full overflow-hidden rounded bg-white/10">
              <div
                className="h-full bg-white/40 transition-none"
                style={{ width: `${String(Math.round(overallProgress * 100))}%` }}
              />
            </div>
          </div>
        </div>
        <div>
          <p className="text-muted text-center text-xs">Press any key to skip.</p>
        </div>
      </div>
    )
  }

  // Deep Time mode: show phase info + year counter + progress bar (mirrors genesis layout)
  if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) {
    const phaseLabel = state.deepTime.phase === DeepTimePhase.Burning ? 'the prairie burns...' : 'centuries pass...'
    const progress = state.deepTime.elapsedYears / DEEP_TIME_TOTAL_YEARS

    return (
      <div data-panel="sidebar" className={SIDEBAR_SHELL_CLASSES}>
        <div className="flex flex-col gap-4">
          <PanelTitle>
            <span className="game-title">Revery Prairie</span>
          </PanelTitle>
          <div>
            <SectionHeader>Deep time</SectionHeader>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="text-muted py-0.5">Year</td>
                  <td className="py-0.5 text-right">{formatYear(GENESIS_END_YEAR + state.deepTime.elapsedYears)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-2 h-1 w-full overflow-hidden rounded bg-white/10">
              <div
                className="h-full bg-white/40 transition-[width] duration-100 ease-linear"
                style={{ width: `${String(Math.round(progress * 100))}%` }}
              />
            </div>
            <p className="text-muted mt-2">{phaseLabel}</p>
          </div>
        </div>
      </div>
    )
  }

  const total = state.mapWidth * state.mapHeight
  const cloverCount = countTiles(state, TileType.Clover)
  const sandCount = countTiles(state, TileType.Sand)
  const dirtCount = total - cloverCount - sandCount
  const { weather } = state

  const temp = metric ? `${String(fToC(weather.temperatureF))}°C` : `${String(weather.temperatureF)}°F`
  const windArrow = WIND_DIRECTION_ARROW[weather.windDirection] ?? ''
  const windSuffix = windArrow ? ` ${windArrow}` : ''
  const wind = metric
    ? `${String(mphToKph(weather.windSpeed))} kph ${weather.windDirection}${windSuffix}`
    : `${String(weather.windSpeed)} mph ${weather.windDirection}${windSuffix}`

  // Fade lives on the inner content wrapper, not the outer shell — so the
  // black backdrop stays fully opaque through the genesis→gameplay swap.
  const contentFadeStyle = state.genesisTransition
    ? { opacity: 0, animation: `fade-in ${String(GENESIS_TRANSITION_SIDEBAR_DURATION_MS)}ms ease-in forwards` }
    : state.deepTimeTransition
      ? { opacity: 0, animation: `fade-in ${String(DEEP_TIME_TRANSITION_DURATION_MS)}ms ease-in forwards` }
      : undefined

  return (
    <div data-panel="sidebar" className={SIDEBAR_SHELL_CLASSES}>
      <div className="flex flex-col gap-4" style={contentFadeStyle}>
        <PanelTitle>
          <span className="game-title">Revery Prairie</span>
        </PanelTitle>

        {cursorTile && (
          <div>
            <SectionHeader>Cursor</SectionHeader>
            <table className="w-full table-fixed">
              <tbody>
                <tr>
                  <td className="text-muted py-0.5">Position</td>
                  <td className="py-0.5 text-right truncate">
                    {state.currentZone === Zone.Cave
                      ? `${String(cursorTile.x)}, ${String(cursorTile.y)}`
                      : `${String(cursorTile.x - SPACE_BORDER)}, ${String(cursorTile.y - SPACE_BORDER)}`}
                  </td>
                </tr>
                <tr>
                  <td className="text-muted py-0.5">Contents</td>
                  <td className="py-0.5 text-right truncate">
                    {(() => {
                      const cx = cursorTile.x
                      const cy = cursorTile.y
                      if (cx < 0 || cx >= state.mapWidth || cy < 0 || cy >= state.mapHeight) return 'void'
                      // Fog of war: unexplored tiles show nothing,
                      // partiallyDiscovered tiles show terrain only ("unknown"
                      // contents). fullyDiscovered and visible tiles fall
                      // through to the live entity lookup below.
                      if (hasFogOfWar(state.currentZone)) {
                        const visibleSet = getLastVisibleSet()
                        const vis = getTileVisibility(state, cx, cy, visibleSet ?? new Set())
                        if (vis === 'unexplored') return 'unexplored'
                        if (vis === 'partiallyDiscovered') return 'unknown'
                      }
                      if (cx === state.player.x && cy === state.player.y) return state.stewardName.toLowerCase()
                      for (const remote of state.remotePlayers.values()) {
                        if (remote.x === cx && remote.y === cy) {
                          return `remote steward: ${remote.stewardName.toLowerCase()}`
                        }
                      }
                      const charEid = state.world.spatial
                        .at(cx, cy)
                        .find(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'character')
                      if (charEid !== undefined) {
                        const identity = state.world.getComponent(charEid, ComponentType.CharacterIdentity)
                        if (identity) {
                          const name = getCharacterDefinition(identity.definitionId).name.toLowerCase()
                          const isSelected = state.selectedUnits.has(charEid)
                          return isSelected ? `${name} [selected]` : name
                        }
                      }
                      const hasMonarchEcs = state.world.spatial
                        .at(cx, cy)
                        .some(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'monarch')
                      if (hasMonarchEcs) return 'monarch butterfly'
                      const hasBeeEcs = state.world.spatial
                        .at(cx, cy)
                        .some(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')
                      if (hasBeeEcs) return 'bee'
                      const hasMeteoriteEcs = state.world.spatial
                        .at(cx, cy)
                        .some(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
                      if (hasMeteoriteEcs) return 'meteorite'
                      const hasBeehiveEcs = state.world.spatial
                        .at(cx, cy)
                        .some(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'beehive')
                      if (hasBeehiveEcs) return 'beehive'
                      const hasSatelliteEcs = state.world.spatial
                        .at(cx, cy)
                        .some(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'satellite')
                      if (hasSatelliteEcs) return 'satellite'
                      const groundItemEid = state.world.spatial
                        .at(cx, cy)
                        .find(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
                      if (groundItemEid !== undefined) {
                        const drop = state.world.getComponent(groundItemEid, ComponentType.ItemDrop)
                        if (drop) return getDefinition(drop.definitionId).name.toLowerCase()
                      }
                      const tileKey = posKey(cx, cy)
                      if (state.ponds.has(tileKey) || state.rivers.has(tileKey)) return 'fresh water'
                      const tileType = state.map[cy]?.[cx]?.type
                      if (tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall) return 'stone'
                      if (tileType === TileType.CaveFloor) return 'dirt'
                      if (tileType === TileType.CaveEntrance) return 'cave entrance'
                      if (tileType === TileType.CaveExit) return 'exit'
                      if (tileType === TileType.BurntClover) return 'burnt clover'
                      if (tileType === TileType.RuinFloor) return 'ruin floor'
                      if (tileType === TileType.RuinWall) return 'ruin wall'
                      if (tileType === TileType.RuinEntrance) return 'ruin entrance'
                      if (tileType === TileType.RuinApron) return 'ruin apron'
                      if (tileType === TileType.RuinExit) return 'exit'
                      if (tileType === TileType.RuinAqueduct) return 'aqueduct'
                      if (tileType === TileType.RuinAqueductBroken) return 'broken aqueduct'
                      if (tileType === TileType.RuinDebris) return 'debris'
                      if (tileType === TileType.RuinDoorLocked) return 'locked door'
                      if (tileType === TileType.RuinDoorOpen) return 'open door'
                      return tileType ?? 'void'
                    })()}
                  </td>
                </tr>
                {(() => {
                  // Fog of war: skip effects for non-visible tiles
                  if (hasFogOfWar(state.currentZone)) {
                    const visibleSet = getLastVisibleSet()
                    if (visibleSet && !visibleSet.has(posKey(cursorTile.x, cursorTile.y))) {
                      return (
                        <tr>
                          <td className="text-muted py-0.5">Effects</td>
                          <td className="text-muted py-0.5 text-right truncate">None</td>
                        </tr>
                      )
                    }
                  }
                  const effects = getTileEffects(state, cursorTile.x, cursorTile.y)
                  return (
                    <tr>
                      <td className="text-muted py-0.5">Effects</td>
                      <td className={`py-0.5 text-right truncate ${effects.length > 0 ? 'text-effect' : 'text-muted'}`}>
                        {effects.length > 0 ? effects.join(', ') : 'None'}
                      </td>
                    </tr>
                  )
                })()}
                {(() => {
                  const cx = cursorTile.x
                  const cy = cursorTile.y
                  if (!isInBounds(cx, cy, state.mapWidth, state.mapHeight)) return null
                  const tile = state.map[cy][cx]
                  const key = posKey(cx, cy)
                  const soilHealth = state.soilHealth.get(key) ?? SOIL_HEALTH_DEFAULT
                  const water = state.tileWater.get(key)
                  const lifecycle = state.cloverLifecycle.get(key)

                  if (tile.type === TileType.Clover) {
                    const stage = lifecycle?.stage ?? CloverStage.Healthy
                    const statusLabel =
                      stage === CloverStage.Healthy
                        ? 'Healthy'
                        : stage === CloverStage.Brown
                          ? 'Wilting'
                          : stage === CloverStage.BlinkingRed
                            ? 'Dying'
                            : stage === CloverStage.Black
                              ? 'Dead'
                              : 'Decomposing'
                    const statusClass = stage === CloverStage.Healthy ? 'text-clover' : 'text-danger'
                    return (
                      <>
                        <tr>
                          <td className="text-muted py-0.5">Water</td>
                          <td className="py-0.5 text-right truncate">{Math.round(water ?? WATER_MAX)}%</td>
                        </tr>
                        <tr>
                          <td className="text-muted py-0.5">Soil</td>
                          <td className="py-0.5 text-right truncate">{soilHealth}</td>
                        </tr>
                        <tr>
                          <td className="text-muted py-0.5">Status</td>
                          <td className={`py-0.5 text-right truncate ${statusClass}`}>{statusLabel}</td>
                        </tr>
                      </>
                    )
                  }

                  if (tile.type === TileType.Dirt || tile.type === TileType.BurntClover) {
                    return (
                      <>
                        {water !== undefined && (
                          <tr>
                            <td className="text-muted py-0.5">Water</td>
                            <td className="py-0.5 text-right truncate">{Math.round(water)}%</td>
                          </tr>
                        )}
                        <tr>
                          <td className="text-muted py-0.5">Soil</td>
                          <td className="py-0.5 text-right truncate">{soilHealth}</td>
                        </tr>
                      </>
                    )
                  }

                  return null
                })()}
                {(() => {
                  const cx = cursorTile.x
                  const cy = cursorTile.y
                  if (!isInBounds(cx, cy, state.mapWidth, state.mapHeight)) return null
                  const elev = state.elevation.get(posKey(cx, cy))
                  return (
                    <tr>
                      <td className="text-muted py-0.5">Elevation</td>
                      <td className={`py-0.5 text-right truncate ${elev === undefined ? 'text-muted' : ''}`}>
                        {elev !== undefined ? Math.round(elev) : '—'}
                      </td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        )}

        {activeScreen === 'pack' && <ItemInfo ref={itemInfoRef} glintingCoins={state.glintingCoins} />}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <SectionHeader>Stats</SectionHeader>
          <table className="w-full">
            <tbody>
              <tr>
                <td className="text-muted py-0.5">Steward</td>
                <td className="py-0.5 text-right">{state.stewardName}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Location</td>
                <td className="py-0.5 text-right">
                  {state.currentZone === 'overworld'
                    ? 'Prairie'
                    : state.currentZone === 'cave'
                      ? `Cave ${getEntranceGlyph(0)}`
                      : state.currentRuinIndex !== null
                        ? `${state.ruinInteriors[state.currentRuinIndex]?.name ?? 'Unknown'} ruins`
                        : state.currentZone}
                </td>
              </tr>
              {state.currentRuinIndex !== null &&
                (() => {
                  const interior = state.ruinInteriors[state.currentRuinIndex]
                  const archetypeLabels: Record<string, string> = {
                    dormantGarden: 'Dormant garden',
                  }
                  return (
                    <>
                      <tr>
                        <td className="text-muted py-0.5">Glyph</td>
                        <td className="py-0.5 text-right">{getEntranceGlyph(state.currentRuinIndex + 1)}</td>
                      </tr>
                      {interior && (
                        <tr>
                          <td className="text-muted py-0.5">Type</td>
                          <td className="py-0.5 text-right">
                            {archetypeLabels[interior.archetype] ?? interior.archetype}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })()}
              <tr>
                <td className="text-muted py-0.5">Total land</td>
                <td className="py-0.5 text-right">{total.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Clover</td>
                <td className="text-clover py-0.5 text-right">{cloverCount.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Dirt</td>
                <td className="py-0.5 text-right">{dirtCount.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Sand</td>
                <td className="py-0.5 text-right" style={{ color: TILE_COLORS[TileType.Sand] }}>
                  {sandCount.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">
                  Bees <span className="text-bee">*</span>
                </td>
                <td className="text-bee py-0.5 text-right">
                  {
                    state.world
                      .query(ComponentType.EntityTag)
                      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee').length
                  }
                </td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Meteorites ✦</td>
                <td className="text-meteorite py-0.5 text-right">
                  {
                    state.world
                      .query(ComponentType.EntityTag)
                      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite').length
                  }
                </td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Prairie</td>
                <td className="py-0.5 text-right">
                  {state.world
                    .query(ComponentType.EntityTag)
                    .some(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')
                    ? 'Yes'
                    : 'No'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <SectionHeader>Weather</SectionHeader>
          <table className="w-full">
            <tbody>
              <tr>
                <td className="text-muted py-0.5">Season</td>
                <td className="py-0.5 text-right">{capitalize(weather.season)}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Sky</td>
                <td className="py-0.5 text-right">{SKY_LABEL[weather.sky]}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Temp</td>
                <td className="py-0.5 text-right">{temp}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Wind</td>
                <td className="py-0.5 text-right">{wind}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Humidity</td>
                <td className="py-0.5 text-right">{weather.humidity}%</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">Year</td>
                <td className="py-0.5 text-right">
                  {state.deepTime?.active
                    ? formatYear(GENESIS_END_YEAR + (state.deepTime.elapsedYears ?? 0))
                    : formatYear(GENESIS_END_YEAR)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
