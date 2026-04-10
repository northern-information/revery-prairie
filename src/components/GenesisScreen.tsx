import { useCallback, useEffect, useRef } from 'react'

import { setAmbient, ZONE_MUSIC } from '@/engine/audio'
import { MAP_HEIGHT, MAP_WIDTH, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/engine/constants'
import { createGenesisState, extractGenesisResult, GENESIS_EPOCHS, nameToSeed, tickGenesis } from '@/engine/genesis'
import { renderGenesis } from '@/engine/genesisRenderer'
import { measureChar } from '@/engine/renderer'
import type { GenesisResult } from '@/engine/genesisTypes'
import { Zone, type CharMetrics } from '@/engine/types'

interface GenesisScreenProps {
  stewardName: string
  onComplete: (result: GenesisResult) => void
}

const SKIP_KEYS = new Set(['Escape', ' ', 'Enter'])

export const GenesisScreen = ({ stewardName, onComplete }: GenesisScreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef(createGenesisState(MAP_WIDTH, MAP_HEIGHT, nameToSeed(stewardName)))
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const currentZoomRef = useRef(ZOOM_DEFAULT)

  const finishSimulation = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true

    const sim = simRef.current
    // Run any remaining mutations if skipping
    if (sim.epochIndex < GENESIS_EPOCHS.length) {
      for (let i = sim.epochIndex; i < GENESIS_EPOCHS.length; i++) {
        if (i === sim.epochIndex && sim.epochStartTime !== 0) continue
        GENESIS_EPOCHS[i].mutate(sim)
      }
      sim.epochIndex = GENESIS_EPOCHS.length
    }

    const result = extractGenesisResult(sim)
    onCompleteRef.current(result)
  }, [])

  // Start overworld music during genesis
  useEffect(() => {
    setAmbient(ZONE_MUSIC[Zone.Overworld])
  }, [])

  // Skip on Escape/Space/Enter only
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (SKIP_KEYS.has(e.key)) {
        finishSimulation()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [finishSimulation])

  // Canvas setup and rAF loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let metricsCache: CharMetrics | null = null

    const updateSize = () => {
      metricsCache = measureChar(ctx, currentZoomRef.current)
      const { charWidth, charHeight } = metricsCache

      const vw = Math.ceil(window.innerWidth / charWidth)
      const vh = Math.ceil(window.innerHeight / charHeight)
      const dpr = window.devicePixelRatio || 1

      const pxWidth = vw * charWidth
      const pxHeight = vh * charHeight
      canvas.width = pxWidth * dpr
      canvas.height = pxHeight * dpr
      canvas.style.width = `${String(pxWidth)}px`
      canvas.style.height = `${String(pxHeight)}px`
      ctx.scale(dpr, dpr)

      return { vw, vh }
    }

    let viewport = updateSize()

    const handleResize = () => {
      viewport = updateSize()
    }
    window.addEventListener('resize', handleResize)

    // Zoom with mouse wheel
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const direction = e.deltaY < 0 ? 1 : -1
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, currentZoomRef.current + direction * ZOOM_STEP))
      if (newZoom === currentZoomRef.current) return
      currentZoomRef.current = newZoom
      viewport = updateSize()
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    let rafId: number

    const loop = (time: number) => {
      if (completedRef.current) return

      const sim = simRef.current
      const done = tickGenesis(sim, GENESIS_EPOCHS, time)

      if (done) {
        finishSimulation()
        return
      }

      if (metricsCache) {
        renderGenesis(ctx, sim, GENESIS_EPOCHS, metricsCache, viewport.vw, viewport.vh, time)
      }

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('wheel', handleWheel)
    }
  }, [finishSimulation])

  return <canvas ref={canvasRef} className="fixed inset-0" style={{ cursor: 'url(/cursor.cur), auto' }} onClick={finishSimulation} />
}
