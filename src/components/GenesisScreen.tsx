import { useCallback, useEffect, useRef, useState } from 'react'

import { PanelTitle, SectionHeader } from './PanelPrimitives'

import { setAmbient, ZONE_MUSIC } from '@/engine/audio'
import { MAP_HEIGHT, MAP_WIDTH, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/engine/constants'
import {
  createGenesisState,
  extractGenesisResult,
  GENESIS_EPOCHS,
  getEpochProgress,
  getGenesisCommentary,
  nameToSeed,
  precomputeGenesis,
  tickGenesis,
} from '@/engine/genesis'
import { renderGenesis } from '@/engine/genesisRenderer'
import { measureChar } from '@/engine/renderer'
import type { GenesisResult, GenesisSimState } from '@/engine/genesisTypes'
import { Zone, type CharMetrics } from '@/engine/types'

interface GenesisScreenProps {
  stewardName: string
  onComplete: (result: GenesisResult) => void
}

const SKIP_KEYS = new Set(['Escape', ' ', 'Enter'])

export const GenesisScreen = ({ stewardName, onComplete }: GenesisScreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<GenesisSimState | null>(null)
  if (simRef.current === null) {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, nameToSeed(stewardName))
    precomputeGenesis(sim, GENESIS_EPOCHS)
    simRef.current = sim
  }
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const currentZoomRef = useRef(ZOOM_DEFAULT)

  // Sidebar state — updated from rAF loop
  const [commentary, setCommentary] = useState('')
  const [epochIndex, setEpochIndex] = useState(0)
  const progressRef = useRef(0)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const finishSimulation = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true

    const sim = simRef.current
    if (!sim) return
    // All mutations already pre-computed — just advance to completion
    sim.epochIndex = GENESIS_EPOCHS.length

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
    let lastEpochIndex = -1

    const updateSize = () => {
      metricsCache = measureChar(ctx, currentZoomRef.current)
      const { charWidth, charHeight } = metricsCache

      const vw = Math.floor(window.innerWidth / charWidth)
      const vh = Math.floor(window.innerHeight / charHeight)
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
      if (!sim) return
      const done = tickGenesis(sim, GENESIS_EPOCHS, time)

      if (done) {
        finishSimulation()
        return
      }

      // Update sidebar state (React setState only on epoch change)
      if (sim.epochIndex !== lastEpochIndex) {
        lastEpochIndex = sim.epochIndex
        setEpochIndex(sim.epochIndex)
        setCommentary(getGenesisCommentary(sim, GENESIS_EPOCHS))
      }

      // Update progress bar directly via ref (avoids React re-render per frame)
      const progress = getEpochProgress(sim, GENESIS_EPOCHS)
      progressRef.current = (sim.epochIndex + progress) / GENESIS_EPOCHS.length
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${String(progressRef.current * 100)}%`
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

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ cursor: 'url(/cursor.cur), auto' }}
        onClick={finishSimulation}
      />
      <div
        data-panel="genesis-sidebar"
        className="text-text pointer-events-none fixed top-0 right-0 z-10 flex h-full w-48 flex-col justify-between bg-black/70 px-4 py-4 font-mono text-xs"
      >
        <div className="flex flex-col gap-4">
          <PanelTitle>revery prairie</PanelTitle>
          {commentary && (
            <div>
              <SectionHeader>epoch {epochIndex + 1}/{GENESIS_EPOCHS.length}</SectionHeader>
              <p className="text-muted">{commentary}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <SectionHeader>genesis</SectionHeader>
            <div className="mb-2 h-1 w-full overflow-hidden rounded bg-white/10">
              <div ref={progressBarRef} className="h-full bg-white/40 transition-none" style={{ width: '0%' }} />
            </div>
            <p className="text-muted text-center">press any key to skip</p>
          </div>
        </div>
      </div>
    </>
  )
}
