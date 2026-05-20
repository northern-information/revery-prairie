import { useEffect, useState } from 'react'

import { GelBandView } from './GelBandView'

import { HEX_GRID_SIZE } from '@/engine/genetics'
import { FLORA_SPECIES } from '@/engine/flora/species'

import type { FloraSpecies } from '@/engine/types'

interface ScanResultModalProps {
  species: FloraSpecies
  identity: string
  onDismiss: () => void
}

const BINOMIAL_FADE_MS = 400
const CELL_REVEAL_MS = 40
const TOTAL_CELLS = HEX_GRID_SIZE * HEX_GRID_SIZE
const TOTAL_CELL_REVEAL_MS = CELL_REVEAL_MS * TOTAL_CELLS

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Ceremonial scan-result modal. Fires when a hold-to-scan commits.
//
// Reveal sequence:
//   1. binomial fades in (BINOMIAL_FADE_MS)
//   2. gel cells fade in one at a time, column-major (top-to-bottom within a
//      column, then left-to-right column-by-column). 64 cells × CELL_REVEAL_MS.
//   3. fullyRevealed flag flips; dismissal becomes active
//
// prefers-reduced-motion collapses the reveal to an instant render.
export const ScanResultModal = ({ species, identity, onDismiss }: ScanResultModalProps) => {
  const reducedMotion = prefersReducedMotion()
  const def = FLORA_SPECIES[species]

  const [binomialVisible, setBinomialVisible] = useState(reducedMotion)
  const [revealedCells, setRevealedCells] = useState(reducedMotion ? TOTAL_CELLS : 0)
  const [fullyRevealed, setFullyRevealed] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) return

    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(
      setTimeout(() => {
        setBinomialVisible(true)
      }, 50),
    )

    timers.push(
      setTimeout(() => {
        for (let i = 1; i <= TOTAL_CELLS; i++) {
          timers.push(
            setTimeout(() => {
              setRevealedCells(i)
            }, CELL_REVEAL_MS * i),
          )
        }
      }, BINOMIAL_FADE_MS),
    )

    timers.push(
      setTimeout(() => {
        setFullyRevealed(true)
      }, BINOMIAL_FADE_MS + TOTAL_CELL_REVEAL_MS),
    )

    return () => {
      timers.forEach(t => {
        clearTimeout(t)
      })
    }
  }, [reducedMotion])

  useEffect(() => {
    if (!fullyRevealed) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [fullyRevealed, onDismiss])

  const handleBackdropClick = () => {
    if (fullyRevealed) onDismiss()
  }

  return (
    <div
      data-testid="scan-result-modal"
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      <div
        data-testid="scan-result-content"
        className="border-border flex flex-col items-center gap-4 border bg-black p-8 font-mono"
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <div
          data-testid="scan-result-heading"
          data-revealed={binomialVisible}
          className="flex flex-col items-center gap-1 transition-opacity duration-[400ms]"
          style={{ opacity: binomialVisible ? 1 : 0 }}
        >
          <h2 data-testid="scan-result-common-name" className="text-text text-2xl">
            {def.displayName}
          </h2>
          <p data-testid="scan-result-binomial" className="text-dim text-xs italic">
            {def.latinBinomial}
          </p>
        </div>
        <div
          data-testid="scan-result-gel"
          data-revealed-cells={revealedCells}
          data-fully-revealed={fullyRevealed}
        >
          <GelBandView identity={identity} revealedCells={revealedCells} />
        </div>
        <p
          data-testid="scan-result-hint"
          className="text-dim text-xs"
          style={{ opacity: fullyRevealed ? 0.7 : 0 }}
        >
          Press any key to continue
        </p>
      </div>
    </div>
  )
}

