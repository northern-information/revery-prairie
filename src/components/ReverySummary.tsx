// RP-4 — The Revery summary overlay.
//
// Renders bilingual ASCII + Voynich change log when state.revery.summaryReady
// is true and state.revery.phase is Summary. Dismissed by any keypress
// (wired in GameScreen via advanceReveryToClosing).
//
// RP-22 — Also renders the "Chronicle" section: past-tense sentences
// emitted by world-state transitions during the closing tenure-year.
// The parent filters state.chronicle to the matching year and passes
// pre-rendered strings in via chronicleLines. The section is omitted
// entirely when the list is empty.

import { EGREGORE_GLYPHS } from '@/engine/egregore'
import { FLORA_SPECIES } from '@/engine/flora/species'
import { ReveryPhase } from '@/engine/types'
import type { ReveryChange, ReveryState } from '@/engine/types'

interface ReverySummaryProps {
  revery: ReveryState | null
  chronicleLines?: string[]
}

// Deterministic Voynich line for the egregore-grew entry. Sample N glyphs
// from EGREGORE_GLYPHS, seeded by the reveryCount captured on the snapshot,
// so the same Revery always renders the same line.
const renderVoynichLine = (count: number, seed: number): string => {
  const glyphs: string[] = []
  let h = seed | 0 || 1
  for (let i = 0; i < count; i++) {
    // xorshift32-ish
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    const idx = Math.abs(h) % EGREGORE_GLYPHS.length
    glyphs.push(EGREGORE_GLYPHS[idx])
  }
  return glyphs.join(' ')
}

const renderFloraDeltaLine = (change: Extract<ReveryChange, { kind: 'flora-delta' }>): string => {
  const def = FLORA_SPECIES[change.payload.species]
  const delta = change.payload.after - change.payload.before
  const sign = delta > 0 ? '+' : ''
  return `${def.displayName}: ${sign}${String(delta)} tiles`
}

export const ReverySummary = ({ revery, chronicleLines = [] }: ReverySummaryProps) => {
  if (!revery || !revery.active || revery.phase !== ReveryPhase.Summary || !revery.summaryReady) {
    return null
  }

  const floraLines = revery.scheduledChanges
    .filter((c): c is Extract<ReveryChange, { kind: 'flora-delta' }> => c.kind === 'flora-delta')
    .map(renderFloraDeltaLine)

  const phenotypeLines = revery.scheduledChanges
    .filter((c): c is Extract<ReveryChange, { kind: 'phenotype-revealed' }> => c.kind === 'phenotype-revealed')
    .map(c => `Suspected: ${c.payload.verdict}`)

  const egregoreChange = revery.scheduledChanges.find(
    (c): c is Extract<ReveryChange, { kind: 'egregore-grew' }> => c.kind === 'egregore-grew'
  )
  const voynichLine =
    egregoreChange && egregoreChange.payload.positions.length > 0
      ? renderVoynichLine(egregoreChange.payload.positions.length, revery.snapshotBeforeRevery.reveryCount + 1)
      : null

  return (
    <div
      className="text-text fixed inset-0 z-40 flex items-center justify-center bg-black/85 font-mono"
      data-testid="revery-summary"
    >
      <div className="flex max-w-[60vw] flex-col items-center gap-3 px-12 py-10">
        <h2 className="text-lg tracking-wide uppercase">The Revery</h2>
        {floraLines.length > 0 && (
          <ul className="flex flex-col items-center gap-1 text-sm" data-testid="revery-flora-lines">
            {floraLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        {chronicleLines.length > 0 && (
          <>
            <hr className="border-text/30 my-1 w-32" />
            <ul className="flex flex-col items-center gap-1 text-sm" data-testid="revery-chronicle-lines">
              {chronicleLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {voynichLine !== null && (
          <>
            <hr className="border-text/30 my-1 w-32" />
            <p
              className="text-base tracking-widest"
              data-testid="revery-voynich-line"
              style={{ fontFamily: 'Voynich, serif' }}
            >
              {voynichLine}
            </p>
          </>
        )}
        {phenotypeLines.length > 0 && (
          <>
            <hr className="border-text/30 my-1 w-32" />
            <ul className="flex flex-col items-center gap-1 text-sm italic" data-testid="revery-phenotype-lines">
              {phenotypeLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </>
        )}
        <p className="text-text/60 mt-4 text-xs">Press any key to continue</p>
      </div>
    </div>
  )
}
