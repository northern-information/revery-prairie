import { useEffect, useRef, useState } from 'react'
import { ItemInfo } from './ItemInfo'
import { PanelTitle, SectionHeader } from './PanelPrimitives'

import { getCharacterDefinition } from '@/engine/characters'
import {
  SOIL_HEALTH_DEFAULT,
  SPACE_BORDER,
  TILE_COLORS,
  WATER_MAX,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '@/engine/constants'
import { ComponentType } from '@/engine/ecs/types'
import { getTileEffects } from '@/engine/effects'
import {
  formatYear,
  GENESIS_END_YEAR,
  GENESIS_EPOCHS,
  getEpochProgress,
  getGenesisCommentary,
  getGenesisYear,
} from '@/engine/genesis'
import { getDefinition } from '@/engine/items'
import { isInBounds, posKey } from '@/engine/position'
import { DEEP_TIME_TOTAL_YEARS } from '@/engine/constants'
import { CloverStage, DeepTimePhase, TileType, Zone } from '@/engine/types'
import { fToC, mphToKph } from '@/engine/weather'
import type { ItemInfoHandle } from './ItemInfo'
import type { CharMetrics, GameState } from '@/engine/types'
import type { GameEvent } from '@/hooks/useEventLog'
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
  sun: 'sunny',
  cloudy: 'cloudy',
  rain: 'rain',
} as const

interface SidebarProps {
  state: GameState
  activeScreen: PermacomputerScreen
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  eventLog: GameEvent[]
  metricsRef: React.RefObject<CharMetrics | null>
  refreshUI: () => void
}

export const Sidebar = ({ state, activeScreen, itemInfoRef, eventLog, metricsRef, refreshUI }: SidebarProps) => {
  const { metric } = state
  const cursorRef = useRef<{ x: number; y: number } | null>(null)
  const [, setCursorVersion] = useState(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.classList.remove('cursor-hidden')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsRef])

  // Derive cursor world tile from screen position + current camera each render
  const metrics = metricsRef.current
  const cursorTile =
    state.cursorScreenPos && metrics
      ? {
          x: Math.floor(state.cursorScreenPos.x / metrics.charWidth) + state.camera.x,
          y: Math.floor(state.cursorScreenPos.y / metrics.charHeight) + state.camera.y,
        }
      : null

  // Genesis mode: show epoch info + progress bar instead of normal sidebar
  if (state.genesis && state.genesis.epochIndex < GENESIS_EPOCHS.length) {
    const epochProgress = getEpochProgress(state.genesis, GENESIS_EPOCHS)
    const overallProgress = (state.genesis.epochIndex + epochProgress) / GENESIS_EPOCHS.length

    return (
      <div
        data-panel="sidebar"
        className="text-text pointer-events-none fixed top-0 right-0 z-10 flex h-full w-48 flex-col justify-between bg-black/70 px-4 py-4 font-mono text-xs"
      >
        <div className="flex flex-col gap-4">
          <PanelTitle>revery prairie</PanelTitle>
          <div>
            <SectionHeader>genesis</SectionHeader>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="text-muted py-0.5">year</td>
                  <td className="py-0.5 text-right">
                    {formatYear(getGenesisYear(state.genesis, GENESIS_EPOCHS, performance.now()))}
                  </td>
                </tr>
                <tr>
                  <td className="text-muted py-0.5">epoch</td>
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
            <p className="text-muted mt-2">{getGenesisCommentary(state.genesis, GENESIS_EPOCHS)}</p>
          </div>
        </div>
        <div>
          <p className="text-muted text-center text-xs">press any key to skip</p>
        </div>
      </div>
    )
  }

  // Deep Time mode: show phase info + year counter + progress bar
  if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) {
    const phaseLabel =
      state.deepTime.phase === DeepTimePhase.Burning ? 'the prairie burns...' : 'centuries pass...'
    const progress = state.deepTime.elapsedYears / DEEP_TIME_TOTAL_YEARS

    return (
      <div
        data-panel="sidebar"
        className="text-text pointer-events-none fixed top-0 right-0 z-10 flex h-full w-48 flex-col justify-between bg-black/70 px-4 py-4 font-mono text-xs"
      >
        <div className="flex flex-col gap-4">
          <PanelTitle>revery prairie</PanelTitle>
          <p className="text-xs">
            <span className="text-muted">year </span>
            {formatYear(GENESIS_END_YEAR + state.deepTime.elapsedYears)}
          </p>
          <div>
            <SectionHeader>deep time</SectionHeader>
            <p className="text-muted">{phaseLabel}</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <SectionHeader>simulation</SectionHeader>
            <div className="mb-2 h-1 w-full overflow-hidden rounded bg-white/10">
              <div
                className="h-full bg-white/40 transition-none"
                style={{ width: `${String(Math.round(progress * 100))}%` }}
              />
            </div>
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
  const wind = metric
    ? `${String(mphToKph(weather.windSpeed))} kph ${weather.windDirection}`
    : `${String(weather.windSpeed)} mph ${weather.windDirection}`

  return (
    <div
      data-panel="sidebar"
      className="text-text pointer-events-none fixed top-0 right-0 z-10 flex h-full w-48 flex-col justify-between bg-black/70 px-4 py-4 font-mono text-xs"
    >
      <div className="flex flex-col gap-4">
        <PanelTitle>revery prairie</PanelTitle>

        {cursorTile && (
          <div>
            <SectionHeader>cursor</SectionHeader>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="text-muted py-0.5">position</td>
                  <td className="py-0.5 text-right">
                    {state.currentZone === Zone.Cave
                      ? `${String(cursorTile.x)}, ${String(cursorTile.y)}`
                      : `${String(cursorTile.x - SPACE_BORDER)}, ${String(cursorTile.y - SPACE_BORDER)}`}
                  </td>
                </tr>
                <tr>
                  <td className="text-muted py-0.5">contents</td>
                  <td className="py-0.5 text-right">
                    {(() => {
                      const cx = cursorTile.x
                      const cy = cursorTile.y
                      if (cx < 0 || cx >= state.mapWidth || cy < 0 || cy >= state.mapHeight) return 'void'
                      if (cx === state.player.x && cy === state.player.y) return state.stewardName.toLowerCase()
                      const charEid = state.world.spatial
                        .at(cx, cy)
                        .find(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'character')
                      if (charEid !== undefined) {
                        const identity = state.world.getComponent(charEid, ComponentType.CharacterIdentity)
                        if (identity) return getCharacterDefinition(identity.definitionId).name.toLowerCase()
                      }
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
                      const omniboxEid = state.world.spatial
                        .at(cx, cy)
                        .find(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundOmnibox')
                      if (omniboxEid !== undefined) {
                        const link = state.world.getComponent(omniboxEid, ComponentType.OmniboxLink)
                        if (link) {
                          const oc = state.omniboxContainers.get(link.uid)
                          return oc?.name.toLowerCase() ?? 'omnibox'
                        }
                      }
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
                      if (tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall)
                        return 'stone'
                      if (tileType === TileType.CaveFloor) return 'dirt'
                      if (tileType === TileType.CaveEntrance) return 'cave entrance'
                      if (tileType === TileType.BurntClover) return 'burnt clover'
                      return tileType ?? 'void'
                    })()}
                  </td>
                </tr>
                {(() => {
                  const effects = getTileEffects(state, cursorTile.x, cursorTile.y)
                  return (
                    <tr>
                      <td className="text-muted py-0.5">effects</td>
                      <td className={`py-0.5 text-right ${effects.length > 0 ? 'text-effect' : 'text-muted'}`}>
                        {effects.length > 0 ? effects.join(', ') : 'none'}
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
                        ? 'healthy'
                        : stage === CloverStage.Brown
                          ? 'wilting'
                          : stage === CloverStage.BlinkingRed
                            ? 'dying'
                            : stage === CloverStage.Black
                              ? 'dead'
                              : 'decomposing'
                    const statusClass = stage === CloverStage.Healthy ? 'text-clover' : 'text-danger'
                    return (
                      <>
                        <tr>
                          <td className="text-muted py-0.5">water</td>
                          <td className="py-0.5 text-right">
                            {water ?? WATER_MAX}/{WATER_MAX}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-muted py-0.5">soil</td>
                          <td className="py-0.5 text-right">{soilHealth}</td>
                        </tr>
                        <tr>
                          <td className="text-muted py-0.5">status</td>
                          <td className={`py-0.5 text-right ${statusClass}`}>{statusLabel}</td>
                        </tr>
                      </>
                    )
                  }

                  if (tile.type === TileType.Dirt || tile.type === TileType.BurntClover) {
                    return (
                      <>
                        {water !== undefined && (
                          <tr>
                            <td className="text-muted py-0.5">water</td>
                            <td className="py-0.5 text-right">
                              {water}/{WATER_MAX}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="text-muted py-0.5">soil</td>
                          <td className="py-0.5 text-right">{soilHealth}</td>
                        </tr>
                      </>
                    )
                  }

                  return null
                })()}
              </tbody>
            </table>
          </div>
        )}

        {activeScreen === 'pack' && <ItemInfo ref={itemInfoRef} glintingCoins={state.glintingCoins} />}
      </div>

      <div className="flex flex-col gap-4">
        {eventLog.length > 0 && (
          <div>
            <SectionHeader>log</SectionHeader>
            <div className="flex flex-col gap-1">
              {eventLog.slice(0, 8).map(entry => (
                <span key={entry.id}>
                  <span style={{ color: entry.iconColor }}>{entry.icon}</span> {entry.text}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <SectionHeader>stats</SectionHeader>
          <table className="w-full">
            <tbody>
              <tr>
                <td className="text-muted py-0.5">steward</td>
                <td className="py-0.5 text-right">{state.stewardName}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">location</td>
                <td className="py-0.5 text-right">
                  {state.currentZone === 'overworld' ? 'prairie' : state.currentZone}
                </td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">total land</td>
                <td className="py-0.5 text-right">{total.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">clover</td>
                <td className="text-clover py-0.5 text-right">{cloverCount.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">dirt</td>
                <td className="py-0.5 text-right">{dirtCount.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">sand</td>
                <td className="py-0.5 text-right" style={{ color: TILE_COLORS[TileType.Sand] }}>
                  {sandCount.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">
                  bees <span className="text-bee">*</span>
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
                <td className="text-muted py-0.5">meteorites ✦</td>
                <td className="text-meteorite py-0.5 text-right">
                  {
                    state.world
                      .query(ComponentType.EntityTag)
                      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite').length
                  }
                </td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">prairie</td>
                <td className="py-0.5 text-right">
                  {state.world
                    .query(ComponentType.EntityTag)
                    .some(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')
                    ? 'yes'
                    : 'no'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <SectionHeader>weather</SectionHeader>
          <table className="w-full">
            <tbody>
              <tr>
                <td className="text-muted py-0.5">season</td>
                <td className="py-0.5 text-right">{weather.season}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">sky</td>
                <td className="py-0.5 text-right">{SKY_LABEL[weather.sky]}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">temp</td>
                <td className="py-0.5 text-right">{temp}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">wind</td>
                <td className="py-0.5 text-right">{wind}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">humidity</td>
                <td className="py-0.5 text-right">{weather.humidity}%</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">year</td>
                <td className="py-0.5 text-right">
                  {state.deepTime?.active
                    ? formatYear(GENESIS_END_YEAR + (state.deepTime.elapsedYears ?? 0))
                    : formatYear(GENESIS_END_YEAR)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <SectionHeader>view</SectionHeader>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-muted">zoom</span>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              value={state.zoom}
              onChange={e => {
                state.zoom = parseFloat(e.target.value)
                refreshUI()
              }}
              className="pointer-events-auto h-1 min-w-0 flex-1 appearance-none rounded bg-white/20 accent-white"
            />
            <span className="w-8 shrink-0 text-right">{Math.round((state.zoom / ZOOM_DEFAULT) * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
