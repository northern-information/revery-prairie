import { useEffect, useState } from 'react'
import { GelBandView } from './GelBandView'

import { playSfx } from '@/engine/audio'
import { FLORA_SPECIES } from '@/engine/flora/species'
import { HEX_GRID_SIZE } from '@/engine/genetics'
import { OAK_SPECIES } from '@/engine/oaks'
import type { ScanCommitResult } from '@/engine/scan'

const SEQUENCE_SFX_URL = '/sfx/sequence.mp3'

interface ScanResultModalProps {
  result: ScanCommitResult
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

// Ceremonial scan-result modal. Fires when any hold-to-scan commits — flora,
// oaks, egregore tiles, and any future scannable subject. The scan ceremony
// is the universal reward for the core game loop; no scan kind bypasses
// this modal.
//
// Reveal sequence:
//   1. binomial fades in (BINOMIAL_FADE_MS)
//   2. gel cells fade in one at a time, column-major (top-to-bottom within a
//      column, then left-to-right column-by-column). 64 cells × CELL_REVEAL_MS.
//   3. fullyRevealed flag flips; dismissal becomes active
//
// prefers-reduced-motion collapses the reveal to an instant render.
//
// Heading slot per kind:
//   - flora: displayName + latinBinomial (italic) from FLORA_SPECIES
//   - oak: 'White Oak' + 'Quercus alba' (italic) from OAK_SPECIES
//   - egregore: 'UNKNOWN' + 'Unknown Unknown' (italic), both in the
//     Voynich typeface — the cosmology name exists but is illegible
const VOYNICH_FONT_FAMILY = "'Voynich', monospace"

interface ResolvedHeading {
  commonName: string
  binomial: string
  voynich: boolean
}

const resolveHeading = (result: ScanCommitResult): ResolvedHeading => {
  if (result.kind === 'flora') {
    const def = FLORA_SPECIES[result.species]
    return { commonName: def.displayName, binomial: def.latinBinomial, voynich: false }
  }
  if (result.kind === 'oak') {
    return { commonName: OAK_SPECIES.displayName, binomial: OAK_SPECIES.latinBinomial, voynich: false }
  }
  return { commonName: 'UNKNOWN', binomial: 'Unknown Unknown', voynich: true }
}

export const ScanResultModal = ({ result, onDismiss }: ScanResultModalProps) => {
  const reducedMotion = prefersReducedMotion()
  const heading = resolveHeading(result)
  const identity = result.identity
  const variant = result.kind === 'egregore' ? 'egregore' : 'flora'

  const [binomialVisible, setBinomialVisible] = useState(reducedMotion)
  const [revealedCells, setRevealedCells] = useState(reducedMotion ? TOTAL_CELLS : 0)
  const [fullyRevealed, setFullyRevealed] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) {
      // Animation collapsed to instant; fire the SFX once so the
      // ceremony still has an audio beat.
      playSfx(SEQUENCE_SFX_URL)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(
      setTimeout(() => {
        setBinomialVisible(true)
      }, 50)
    )

    timers.push(
      setTimeout(() => {
        for (let i = 1; i <= TOTAL_CELLS; i++) {
          timers.push(
            setTimeout(() => {
              setRevealedCells(i)
              playSfx(SEQUENCE_SFX_URL)
            }, CELL_REVEAL_MS * i)
          )
        }
      }, BINOMIAL_FADE_MS)
    )

    timers.push(
      setTimeout(() => {
        setFullyRevealed(true)
      }, BINOMIAL_FADE_MS + TOTAL_CELL_REVEAL_MS)
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
        className="film-grain-overlay border-border relative flex flex-col items-center gap-4 overflow-hidden border bg-black p-8 font-mono"
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
          <h2
            data-testid="scan-result-common-name"
            className="text-text text-2xl"
            style={heading.voynich ? { fontFamily: VOYNICH_FONT_FAMILY } : undefined}
          >
            {heading.commonName}
          </h2>
          <p
            data-testid="scan-result-binomial"
            className="text-dim text-xs italic"
            style={heading.voynich ? { fontFamily: VOYNICH_FONT_FAMILY } : undefined}
          >
            {heading.binomial}
          </p>
        </div>
        <div
          data-testid="scan-result-gel"
          data-variant={variant}
          data-revealed-cells={revealedCells}
          data-fully-revealed={fullyRevealed}
        >
          <GelBandView identity={identity} variant={variant} revealedCells={revealedCells} />
        </div>
        <p data-testid="scan-result-hint" className="text-dim text-xs" style={{ opacity: fullyRevealed ? 0.7 : 0 }}>
          Press any key to continue
        </p>
      </div>
    </div>
  )
}
