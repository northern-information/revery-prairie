import { useEffect, useRef } from 'react'

import { updateCamera } from '@/engine/camera'
import { updateCursorState } from '@/engine/cursor'
import { createGameLoop } from '@/engine/gameLoop'
import { measureChar, render } from '@/engine/renderer'
import { useMouse } from '@/hooks/useMouse'
import type { CharMetrics, FloraSpecies, GameState } from '@/engine/types'
import type { PermacomputerScreen } from '@/hooks/useKeyboard'

const SIDEBAR_WIDTH_PX = 192 // matches Sidebar w-48

const resizeState = (state: GameState, charWidth: number, charHeight: number) => {
  const vw = Math.floor(window.innerWidth / charWidth)
  const vh = Math.floor(window.innerHeight / charHeight)
  state.viewportWidth = vw
  state.viewportHeight = vh
  state.rightInsetTiles = Math.ceil(SIDEBAR_WIDTH_PX / charWidth)
  updateCamera(state)
}

interface GameCanvasProps {
  state: GameState
  refreshUI: () => void
  activeScreen: PermacomputerScreen
  setActiveScreen: (screen: PermacomputerScreen) => void
  onScanComplete: (species: FloraSpecies, identity: string) => void
  metricsRef: React.RefObject<CharMetrics | null>
}

export const GameCanvas = ({
  state,
  refreshUI,
  activeScreen,
  setActiveScreen,
  onScanComplete,
  metricsRef,
}: GameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refreshUIRef = useRef(refreshUI)
  refreshUIRef.current = refreshUI
  const setActiveScreenRef = useRef(setActiveScreen)
  setActiveScreenRef.current = setActiveScreen
  const activeScreenRef = useRef(activeScreen)
  activeScreenRef.current = activeScreen
  const onScanCompleteRef = useRef(onScanComplete)
  onScanCompleteRef.current = onScanComplete

  useMouse({ canvasRef, state, metricsRef, activeScreen, setActiveScreen, refreshUI })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const updateSize = () => {
      metricsRef.current ??= measureChar(ctx)

      const { charWidth, charHeight } = metricsRef.current

      resizeState(state, charWidth, charHeight)

      // Render at 1x CSS pixels regardless of devicePixelRatio. On
      // retina displays this trades Retina sharpness for ~4x less
      // rasterization cost — the renderer fills tens of thousands of
      // pixels per tile per frame, and the per-tile overhead at 2x DPR
      // dominates the frame budget. The browser handles the upscale to
      // physical pixels, giving the world a slightly chunky pixel-art
      // look that fits the ASCII / iso aesthetic.
      const pxWidth = state.viewportWidth * charWidth
      const pxHeight = state.viewportHeight * charHeight
      canvas.width = pxWidth
      canvas.height = pxHeight
      canvas.style.width = `${String(pxWidth)}px`
      canvas.style.height = `${String(pxHeight)}px`
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
      onAutoHidePanel: () => {
        if (activeScreenRef.current && activeScreenRef.current !== 'system') {
          setActiveScreenRef.current(null)
        }
      },
      onScanComplete: (species, identity) => {
        onScanCompleteRef.current(species, identity)
      },
      onFrame: time => {
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
