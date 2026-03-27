import { useEffect, useRef } from 'react'

import { updateCamera } from '@/engine/camera'
import { updateCursorState } from '@/engine/cursor'
import { createGameLoop } from '@/engine/gameLoop'
import { measureChar, render } from '@/engine/renderer'
import { useMouse } from '@/hooks/useMouse'
import type { CharMetrics } from '@/engine/types'
import type { GameState } from '@/engine/types'
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
  onDiscovery: (text: string, worldX: number, worldY: number) => void
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

    const gameLoop = createGameLoop(state, {
      onRefreshUI: () => {
        refreshUIRef.current()
      },
      onPickup: (name, icon, color, wx, wy) => {
        onPickupRef.current(name, icon, color, wx, wy)
      },
      onDiscovery: (text, wx, wy) => {
        onDiscoveryRef.current(text, wx, wy)
      },
      onFrame: (time) => {
        if (metricsRef.current) {
          updateCursorState(state, metricsRef.current)
          render(ctx, state, metricsRef.current, time)
        }
      },
    })
    gameLoop.start()

    return () => {
      window.removeEventListener('resize', onResize)
      gameLoop.stop()
    }
  }, [state, metricsRef])

  return <canvas ref={canvasRef} />
}
