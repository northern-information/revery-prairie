import { useEffect, useRef } from 'react'

import { updateCamera } from '@/engine/camera'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/engine/constants'
import { updateCursorState } from '@/engine/cursor'
import { createGameLoop } from '@/engine/gameLoop'
import { measureChar, render } from '@/engine/renderer'
import { useMouse } from '@/hooks/useMouse'
import type { CharMetrics, GameState } from '@/engine/types'
import type { Panel } from '@/hooks/useKeyboard'

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
  onDiscovery: (text: string, worldX: number, worldY: number, icon?: string, iconColor?: string) => void
  metricsRef: React.RefObject<CharMetrics | null>
}

export const GameCanvas = ({
  state,
  refreshUI,
  activePanel,
  setActivePanel,
  onPickup,
  onDialog,
  onDiscovery,
  metricsRef,
}: GameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refreshUIRef = useRef(refreshUI)
  refreshUIRef.current = refreshUI
  const onPickupRef = useRef(onPickup)
  onPickupRef.current = onPickup
  const onDiscoveryRef = useRef(onDiscovery)
  onDiscoveryRef.current = onDiscovery

  useMouse({ canvasRef, state, metricsRef, activePanel, setActivePanel, refreshUI, onDialog, onDiscovery })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastZoom = state.zoom

    const updateSize = () => {
      metricsRef.current ??= measureChar(ctx, state.zoom)

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

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const direction = e.deltaY > 0 ? -1 : 1
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom + direction * ZOOM_STEP))
      if (newZoom === state.zoom) return
      state.zoom = newZoom
      lastZoom = newZoom
      metricsRef.current = null
      updateSize()
      refreshUIRef.current()
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    const gameLoop = createGameLoop(state, {
      onRefreshUI: () => {
        refreshUIRef.current()
      },
      onPickup: (name, icon, color, wx, wy) => {
        onPickupRef.current(name, icon, color, wx, wy)
      },
      onDiscovery: (text, wx, wy, icon, iconColor) => {
        onDiscoveryRef.current(text, wx, wy, icon, iconColor)
      },
      onFrame: time => {
        if (state.zoom !== lastZoom) {
          lastZoom = state.zoom
          metricsRef.current = null
          updateSize()
        }
        if (metricsRef.current) {
          updateCursorState(state, metricsRef.current)
          render(ctx, state, metricsRef.current, time)
        }
      },
    })
    gameLoop.start()

    return () => {
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('wheel', handleWheel)
      gameLoop.stop()
    }
  }, [state, metricsRef])

  return <canvas ref={canvasRef} />
}
