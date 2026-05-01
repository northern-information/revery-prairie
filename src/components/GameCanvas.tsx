import { useEffect, useRef } from 'react'

import { updateCamera } from '@/engine/camera'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/engine/constants'
import { updateCursorState } from '@/engine/cursor'
import { tickEdgeScroll } from '@/engine/edgeScroll'
import { createGameLoop } from '@/engine/gameLoop'
import { measureChar, render } from '@/engine/renderer'
import { useMouse } from '@/hooks/useMouse'
import type { CharMetrics, GameState } from '@/engine/types'
import type { PermacomputerScreen } from '@/hooks/useKeyboard'

const SIDEBAR_WIDTH_PX = 192 // matches Sidebar w-48

const resizeState = (state: GameState, charWidth: number, charHeight: number) => {
  const vw = Math.floor(window.innerWidth / charWidth)
  const vh = Math.floor(window.innerHeight / charHeight)
  state.viewportWidth = vw
  state.viewportHeight = vh
  state.rightInsetTiles = Math.ceil(SIDEBAR_WIDTH_PX / charWidth)
  updateCamera(state, true)
}

interface GameCanvasProps {
  state: GameState
  refreshUI: () => void
  activeScreen: PermacomputerScreen
  setActiveScreen: (screen: PermacomputerScreen) => void
  onPickup: (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  onDialog: (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => void
  onDiscovery: (text: string, worldX: number, worldY: number, icon?: string, iconColor?: string) => void
  onGift: (text: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  metricsRef: React.RefObject<CharMetrics | null>
}

export const GameCanvas = ({
  state,
  refreshUI,
  activeScreen,
  setActiveScreen,
  onPickup,
  onDialog,
  onDiscovery,
  onGift,
  metricsRef,
}: GameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refreshUIRef = useRef(refreshUI)
  refreshUIRef.current = refreshUI
  const onPickupRef = useRef(onPickup)
  onPickupRef.current = onPickup
  const onDiscoveryRef = useRef(onDiscovery)
  onDiscoveryRef.current = onDiscovery
  const setActiveScreenRef = useRef(setActiveScreen)
  setActiveScreenRef.current = setActiveScreen
  const activeScreenRef = useRef(activeScreen)
  activeScreenRef.current = activeScreen

  useMouse({ canvasRef, state, metricsRef, activeScreen, setActiveScreen, refreshUI, onDialog, onDiscovery, onGift })

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

    // Track raw mouse position over the canvas region for edge-scroll.
    // Independent from cursorScreenPos (which is gated by sidebar overlap
    // for tile-info purposes). Listening on window so we still get updates
    // when the cursor crosses into the sidebar overlay near the right edge.
    const handleEdgeMouseMove = (e: MouseEvent) => {
      // Bail if cursor is over a UI panel overlay (event log, action bar,
      // command panel, etc.). This handler runs on window and fires after
      // React's synthetic onMouseMove, so a panel's own null-assignment
      // would be overwritten without this check — the camera would pan
      // down whenever the cursor crossed the action bar at the bottom of
      // the viewport. Panels mark themselves with `data-panel="…"`.
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-panel]')) {
        state.edgeScrollPos = null
        return
      }
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
        state.edgeScrollPos = null
        return
      }
      state.edgeScrollPos = { x, y }
    }
    const handleEdgeMouseLeave = () => {
      state.edgeScrollPos = null
    }
    window.addEventListener('mousemove', handleEdgeMouseMove)
    window.addEventListener('mouseleave', handleEdgeMouseLeave)
    document.addEventListener('mouseleave', handleEdgeMouseLeave)

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
      onAutoHidePanel: () => {
        if (activeScreenRef.current && activeScreenRef.current !== 'system') {
          setActiveScreenRef.current(null)
        }
      },
      onFrame: time => {
        if (state.zoom !== lastZoom) {
          lastZoom = state.zoom
          metricsRef.current = null
          updateSize()
        }
        if (metricsRef.current) {
          // Edge-scroll runs only when no menu/dialog/dragging blocks the canvas.
          // Active screens (menu, manual, etc.) keep their own input focus and
          // we don't want stray cursor positions to pan the camera underneath.
          const screenBlocking = activeScreenRef.current !== null
          if (!screenBlocking && !state.activeDialog) {
            tickEdgeScroll(state, metricsRef.current, time)
          } else {
            // Keep timestamp current so the next eligible frame doesn't see a huge dt.
            state.lastEdgeScrollTime = time
          }
          updateCursorState(state, metricsRef.current)
          render(ctx, state, metricsRef.current, time)
        }
      },
    })
    gameLoop.start()

    return () => {
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('wheel', handleWheel)
      window.removeEventListener('mousemove', handleEdgeMouseMove)
      window.removeEventListener('mouseleave', handleEdgeMouseLeave)
      document.removeEventListener('mouseleave', handleEdgeMouseLeave)
      gameLoop.stop()
    }
  }, [state, metricsRef])

  return <canvas ref={canvasRef} />
}
