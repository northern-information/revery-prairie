import { useCallback, useEffect, useRef } from 'react'

import { MAP_HEIGHT, MAP_WIDTH, ZOOM_DEFAULT } from '@/engine/constants'
import {
  createGenesisState,
  extractGenesisResult,
  GENESIS_EPOCHS,
  nameToSeed,
  tickGenesis,
} from '@/engine/genesis'
import { renderGenesis } from '@/engine/genesisRenderer'
import { measureChar } from '@/engine/renderer'

import type { GenesisResult } from '@/engine/genesisTypes'
import type { CharMetrics } from '@/engine/types'

interface GenesisScreenProps {
  stewardName: string
  onComplete: (result: GenesisResult) => void
}

export const GenesisScreen = ({ stewardName, onComplete }: GenesisScreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef(createGenesisState(MAP_WIDTH, MAP_HEIGHT, nameToSeed(stewardName)))
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const finishSimulation = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true

    const sim = simRef.current
    // Run any remaining mutations if skipping
    if (sim.epochIndex < GENESIS_EPOCHS.length) {
      // Run remaining epochs from current position
      for (let i = sim.epochIndex; i < GENESIS_EPOCHS.length; i++) {
        if (i === sim.epochIndex && sim.epochStartTime !== 0) continue // Already mutated
        GENESIS_EPOCHS[i].mutate(sim)
      }
      sim.epochIndex = GENESIS_EPOCHS.length
    }

    const result = extractGenesisResult(sim)
    onCompleteRef.current(result)
  }, [])

  // Skip on any keypress
  useEffect(() => {
    const handleKey = () => {
      finishSimulation()
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
      metricsCache = measureChar(ctx, ZOOM_DEFAULT)
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
    }
  }, [finishSimulation])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0"
      style={{ cursor: 'url(/cursor.cur), auto' }}
    />
  )
}
