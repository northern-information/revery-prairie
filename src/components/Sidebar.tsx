import { useEffect, useRef, useState } from 'react'
import { ItemInfo } from './ItemInfo'

import { getCharacterDefinition } from '@/engine/characters'
import { SPACE_BORDER, TILE_COLORS } from '@/engine/constants'
import { getTileEffects } from '@/engine/effects'
import { getDefinition } from '@/engine/items'
import { TileType } from '@/engine/types'
import { fToC, mphToKph } from '@/engine/weather'
import type { ItemInfoHandle } from './ItemInfo'
import type { CharMetrics } from '@/engine/renderer'
import type { GameState } from '@/engine/types'
import type { GameEvent } from '@/hooks/useEventLog'
import type { Panel } from '@/hooks/useKeyboard'

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
  activePanel: Panel
  setActivePanel: (panel: Panel) => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  eventLog: GameEvent[]
  metricsRef: React.RefObject<CharMetrics | null>
}

export const Sidebar = ({ state, activePanel, setActivePanel, itemInfoRef, eventLog, metricsRef }: SidebarProps) => {
  const [metric, setMetric] = useState(false)
  const cursorRef = useRef<{ x: number; y: number } | null>(null)

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
        <div className="border-border-dim text-text border-b pb-3 text-sm">revery prairie</div>

        {cursorTile && (
          <div>
            <div className="border-border-dim text-muted mb-3 border-b pb-2">cursor</div>
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="text-muted py-0.5">position</td>
                  <td className="py-0.5 text-right">
                    {cursorTile.x - SPACE_BORDER}, {cursorTile.y - SPACE_BORDER}
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
                      const character = state.characters.find(c => c.pos.x === cx && c.pos.y === cy)
                      if (character) return getCharacterDefinition(character.definitionId).name.toLowerCase()
                      const bee = state.bees.find(b => b.pos.x === cx && b.pos.y === cy)
                      if (bee) return 'bee'
                      const meteorite = state.meteorites.find(m => m.pos.x === cx && m.pos.y === cy)
                      if (meteorite) return 'meteorite'
                      const omnibox = state.groundOmniboxes.find(o => o.pos.x === cx && o.pos.y === cy)
                      if (omnibox) {
                        const oc = state.omniboxContainers.get(omnibox.uid)
                        return oc?.name.toLowerCase() ?? 'omnibox'
                      }
                      const gi = state.groundItems.find(g => g.pos.x === cx && g.pos.y === cy)
                      if (gi) return getDefinition(gi.definitionId).name.toLowerCase()
                      return state.map[cy]?.[cx]?.type ?? 'void'
                    })()}
                  </td>
                </tr>
                {(() => {
                  const effects = getTileEffects(state, cursorTile.x, cursorTile.y)
                  return (
                    <tr>
                      <td className="text-muted py-0.5">effects</td>
                      <td
                        className="text-muted py-0.5 text-right"
                        style={effects.length > 0 ? { color: '#4466aa' } : undefined}
                      >
                        {effects.length > 0 ? effects.join(', ') : 'none'}
                      </td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        )}

        {activePanel === 'inventory' && <ItemInfo ref={itemInfoRef} />}
      </div>

      <div className="flex flex-col gap-4">
        {eventLog.length > 0 && (
          <div>
            <div className="border-border-dim text-muted mb-2 border-b pb-2">log</div>
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
          <div className="border-border-dim text-muted mb-3 border-b pb-2">stats</div>
          <table className="w-full">
            <tbody>
              <tr>
                <td className="text-muted py-0.5">steward</td>
                <td className="py-0.5 text-right">{state.stewardName}</td>
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
                <td className="text-bee py-0.5 text-right">{state.bees.length}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">meteorites ✦</td>
                <td className="text-meteorite py-0.5 text-right">{state.meteorites.length}</td>
              </tr>
              <tr>
                <td className="text-muted py-0.5">prairie</td>
                <td className="py-0.5 text-right">{state.bees.length > 0 ? 'yes' : 'no'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className="border-border-dim text-muted mb-3 border-b pb-2">weather</div>
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
            </tbody>
          </table>
        </div>

        <div>
          <div className="border-border-dim text-muted mb-2 border-b pb-2">units</div>
          <button
            type="button"
            className="text-dim hover:text-text pointer-events-auto text-left"
            onClick={() => {
              setMetric(prev => !prev)
            }}
          >
            {metric ? 'metric' : 'imperial'}
          </button>
        </div>

        <div>
          <div className="border-border-dim text-muted mb-2 border-b pb-2">controls</div>
          <div className="flex flex-col gap-1">
            <span className="text-dim">[wasd] move</span>
            <button
              type="button"
              className="text-dim hover:text-text pointer-events-auto text-left"
              onClick={() => {
                setActivePanel(activePanel === 'inventory' ? null : 'inventory')
              }}
            >
              invento[r]y
            </button>
            {(() => {
              const adjacentCharacter = state.characters.some(c => {
                const dx = Math.abs(c.pos.x - state.player.x)
                const dy = Math.abs(c.pos.y - state.player.y)
                return (dx === 1 && dy === 0) || (dx === 0 && dy === 1)
              })
              const adjacentOmnibox = state.groundOmniboxes.some(go => {
                const dx = Math.abs(go.pos.x - state.player.x)
                const dy = Math.abs(go.pos.y - state.player.y)
                return (dx === 1 && dy === 0) || (dx === 0 && dy === 1)
              })
              const active = adjacentCharacter || adjacentOmnibox || state.openContainer !== null
              return <span className={active ? 'text-text' : 'text-dim'}>int[e]ract</span>
            })()}
            <button
              type="button"
              className="text-dim hover:text-text pointer-events-auto text-left"
              onClick={() => {
                if (activePanel === 'menu') {
                  setActivePanel(null)
                } else {
                  setActivePanel('menu')
                }
              }}
            >
              [esc] {activePanel || state.activeDialog ? 'close' : 'menu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
