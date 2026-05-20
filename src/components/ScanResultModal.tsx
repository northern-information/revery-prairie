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
const ROW_REVEAL_MS = 80
const TOTAL_ROW_REVEAL_MS = ROW_REVEAL_MS * HEX_GRID_SIZE

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Ceremonial scan-result modal. Fires when a hold-to-scan commits.
//
// Reveal sequence:
//   1. binomial fades in (BINOMIAL_FADE_MS)
//   2. gel bands fade in row-by-row, top to bottom (ROW_REVEAL_MS per row)
//   3. fullyRevealed flag flips; dismissal becomes active
//
// prefers-reduced-motion collapses the reveal to an instant render.
export const ScanResultModal = ({ species, identity, onDismiss }: ScanResultModalProps) => {
  const reducedMotion = prefersReducedMotion()
  const def = FLORA_SPECIES[species]

  const [binomialVisible, setBinomialVisible] = useState(reducedMotion)
  const [revealedRows, setRevealedRows] = useState(reducedMotion ? HEX_GRID_SIZE : 0)
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
        for (let r = 1; r <= HEX_GRID_SIZE; r++) {
          timers.push(
            setTimeout(() => {
              setRevealedRows(r)
            }, ROW_REVEAL_MS * r),
          )
        }
      }, BINOMIAL_FADE_MS),
    )

    timers.push(
      setTimeout(() => {
        setFullyRevealed(true)
      }, BINOMIAL_FADE_MS + TOTAL_ROW_REVEAL_MS),
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
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/85"
      onClick={handleBackdropClick}
    >
      <div
        data-testid="scan-result-content"
        className="flex flex-col items-center gap-4 p-8 font-mono"
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <h2
          data-testid="scan-result-binomial"
          data-revealed={binomialVisible}
          className="text-text text-2xl italic transition-opacity duration-[400ms]"
          style={{ opacity: binomialVisible ? 1 : 0 }}
        >
          {def.latinBinomial}
        </h2>
        <div
          data-testid="scan-result-gel"
          data-revealed-rows={revealedRows}
          data-fully-revealed={fullyRevealed}
          style={{ ['--revealed-rows' as string]: String(revealedRows) }}
        >
          <GelBandRevealWrapper revealedRows={revealedRows} identity={identity} />
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

interface GelBandRevealWrapperProps {
  identity: string
  revealedRows: number
}

// Wraps GelBandView with a row-reveal mask. The wrapper clips the gel
// vertically: rows beyond revealedRows render at opacity 0. We achieve
// this by stacking a same-size overlay that hides un-revealed rows.
const GelBandRevealWrapper = ({ identity, revealedRows }: GelBandRevealWrapperProps) => {
  const hiddenFraction = (HEX_GRID_SIZE - revealedRows) / HEX_GRID_SIZE
  return (
    <div className="relative inline-block">
      <GelBandView identity={identity} />
      {hiddenFraction > 0 && (
        <div
          data-testid="scan-result-reveal-mask"
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-black"
          style={{ height: `${String(hiddenFraction * 100)}%` }}
        />
      )}
    </div>
  )
}
