import { useEffect, useRef } from 'react'

import { pickUpGroundItems, spawnShootingStar, tickBees, tickGhosts, tickPath, tickShootingStars } from '@/engine/actions'
import { updateCamera } from '@/engine/camera'
import { GHOST_TICK_MS, SHOOTING_STAR_SPAWN_TICK_MS, SHOOTING_STAR_TICK_MS } from '@/engine/constants'
import { getDefinition } from '@/engine/items'
import { measureChar, render } from '@/engine/renderer'
import { tickWeather } from '@/engine/weather'
import { useMouse } from '@/hooks/useMouse'
import type { CharMetrics } from '@/engine/renderer'
import type { GameState } from '@/engine/types'
import type { Panel } from '@/hooks/useKeyboard'

const BEE_TICK_MS = 200
const PATH_TICK_MS = 100
const WEATHER_TICK_MS = 5000

const resizeState = (state: GameState, charWidth: number, charHeight: number) => {
  const vw = Math.floor(window.innerWidth / charWidth)
  const vh = Math.floor(window.innerHeight / charHeight)
  state.viewportWidth = vw
  state.viewportHeight = vh
  updateCamera(state)
}

interface GameCanvasProps {
  state: GameState
  refreshUI: () => void
  activePanel: Panel
  setActivePanel: (panel: Panel) => void
  onPickup: (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  onDialog: (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => void
  metricsRef: React.RefObject<CharMetrics | null>
}

export const GameCanvas = ({
  state,
  refreshUI,
  activePanel,
  setActivePanel,
  onPickup,
  onDialog,
  metricsRef,
}: GameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const refreshUIRef = useRef(refreshUI)
  refreshUIRef.current = refreshUI
  const onPickupRef = useRef(onPickup)
  onPickupRef.current = onPickup

  useMouse({ canvasRef, state, metricsRef, activePanel, setActivePanel, refreshUI, onDialog })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const updateSize = () => {
      metricsRef.current ??= measureChar(ctx)

      const { charWidth, charHeight } = metricsRef.current
      const dpr = window.devicePixelRatio || 1

      resizeState(state, charWidth, charHeight)

      const pxWidth = state.viewportWidth * charWidth
      const pxHeight = state.viewportHeight * charHeight
      canvas.width = pxWidth * dpr
      canvas.height = pxHeight * dpr
      canvas.style.width = `${String(pxWidth)}px`
      canvas.style.height = `${String(pxHeight)}px`
      ctx.scale(dpr, dpr)
    }

    updateSize()

    const onResize = () => {
      metricsRef.current = null
      updateSize()
    }
    window.addEventListener('resize', onResize)

    let lastBeeTick = 0
    let lastGhostTick = 0
    let lastPathTick = 0
    let lastWeatherTick = 0
    let lastShootingStarTick = 0
    let lastShootingStarSpawnTick = 0

    const loop = (time: number) => {
      if (time - lastBeeTick >= BEE_TICK_MS) {
        tickBees(state)
        lastBeeTick = time
      }
      if (time - lastGhostTick >= GHOST_TICK_MS) {
        tickGhosts(state)
        lastGhostTick = time
      }
      if (time - lastPathTick >= PATH_TICK_MS) {
        if (tickPath(state)) {
          const result = pickUpGroundItems(state, time)
          for (const defId of result.pickedUp) {
            const def = getDefinition(defId)
            onPickupRef.current(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
          }
          refreshUIRef.current()
        }
        lastPathTick = time
      }
      if (time - lastShootingStarSpawnTick >= SHOOTING_STAR_SPAWN_TICK_MS) {
        spawnShootingStar(state)
        lastShootingStarSpawnTick = time
      }
      if (time - lastShootingStarTick >= SHOOTING_STAR_TICK_MS) {
        tickShootingStars(state, time)
        lastShootingStarTick = time
      }
      if (time - lastWeatherTick >= WEATHER_TICK_MS) {
        tickWeather(state.weather)
        lastWeatherTick = time
      }
      if (metricsRef.current) {
        render(ctx, state, metricsRef.current, time)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(rafRef.current)
    }
  }, [state, metricsRef])

  return <canvas ref={canvasRef} />
}
