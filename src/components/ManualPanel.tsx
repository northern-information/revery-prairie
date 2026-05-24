import { useCallback, useEffect, useState } from 'react'
import { CATEGORY_LABELS } from './ManualPanel.constants'
import { SectionHeader, Tab, TextButton } from './PanelPrimitives'
import { SpecimenStack } from './SpecimenStack'

import {
  CATEGORY_ORDER,
  filterManualEntries,
  getEgregoreLatinPierceForEntry,
  getEgregoreManualEntries,
  isDiscovered,
  MANUAL_ENTRIES,
  ManualCategory,
} from '@/engine/manual'
import type { ManualEntry, ManualHint } from '@/engine/manual'
import type { FloraSpecies, GameState, ManualState, RevealedPhenotype, ScannedSpecimen } from '@/engine/types'

const capitalize = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1))

interface ManualPanelProps {
  state: GameState
}

const ControlName = ({ name }: { name: string }) => {
  const match = /^(\[.*?\])\s*(.*)$/.exec(name)
  if (!match) return <span className="text-text text-sm">{name}</span>
  return (
    <span className="text-text text-sm">
      <span className="text-pink">{match[1]}</span> {match[2]}
    </span>
  )
}

const HintBlock = ({
  hint,
  hintKey,
  revealed,
  onToggle,
}: {
  hint: ManualHint
  hintKey: string
  revealed: boolean
  onToggle: (key: string) => void
}) => (
  <div className="mt-1">
    <TextButton
      variant="secondary"
      onClick={() => {
        onToggle(hintKey)
      }}
    >
      <span className="text-dim">&gt; {hint.prompt}</span>
      <span className="text-pink ml-2">{revealed ? '[-]' : '[+]'}</span>
    </TextButton>
    {revealed && <div className="text-text mt-1 ml-4 text-xs">{hint.answer}</div>}
  </div>
)

const RecipeResultSpoiler = ({
  entry,
  discovered,
  hintKey,
  revealed,
  onToggle,
}: {
  entry: ManualEntry
  discovered: boolean
  hintKey: string
  revealed: boolean
  onToggle: (key: string) => void
}) => {
  if (discovered) {
    return <span className="text-text">{entry.name}</span>
  }
  if (revealed) {
    return (
      <span>
        <span className="text-text">{entry.name}</span>
        <TextButton
          variant="secondary"
          className="ml-2 inline"
          onClick={() => {
            onToggle(hintKey)
          }}
        >
          [-]
        </TextButton>
      </span>
    )
  }
  return (
    <TextButton
      variant="secondary"
      onClick={() => {
        onToggle(hintKey)
      }}
    >
      ??? <span className="text-pink">[+]</span>
    </TextButton>
  )
}

/**
 * Renders an egregore manual entry's lore body. The body is mostly
 * EVA tokens (rendered in the Voynich typeface) with at most one
 * Latin pierce word from the cosmology allowlist (rendered in the
 * default font). The pierce is identified by re-deriving it from the
 * entry's position (encoded in entry.id) — same allowlist + same
 * position hash that egregore.ts used to embed it in the body.
 */
const EgregoreLore = ({ entry }: { entry: ManualEntry }) => {
  const pierce = getEgregoreLatinPierceForEntry(entry.id)
  if (pierce === null || !entry.lore.includes(pierce)) {
    // No pierce — render the whole body in Voynich.
    return <span style={{ fontFamily: "'Voynich', monospace" }}>{entry.lore}</span>
  }
  const idx = entry.lore.indexOf(pierce)
  const before = entry.lore.slice(0, idx)
  const after = entry.lore.slice(idx + pierce.length)
  return (
    <>
      <span style={{ fontFamily: "'Voynich', monospace" }}>{before}</span>
      <span>{pierce}</span>
      <span style={{ fontFamily: "'Voynich', monospace" }}>{after}</span>
    </>
  )
}

// Map a 'flora:<species>' entry id to the FloraSpecies key. Returns null
// for non-flora entries. The species id segment matches the FloraSpecies
// const values ('clover', 'wildflower', 'tallGrass').
const speciesFromEntryId = (id: string): FloraSpecies | null => {
  if (!id.startsWith('flora:')) return null
  return id.slice('flora:'.length) as FloraSpecies
}

const EntryCard = ({
  entry,
  discoveries,
  scannedSpecimens,
  oakSpecimens,
  revealedPhenotypes,
  manualState,
  showCategory,
  onToggleHint,
}: {
  entry: ManualEntry
  discoveries: Set<string>
  scannedSpecimens: Map<FloraSpecies, ScannedSpecimen[]>
  oakSpecimens: ScannedSpecimen[]
  revealedPhenotypes: Map<FloraSpecies, RevealedPhenotype[]>
  manualState: ManualState
  showCategory: boolean
  onToggleHint: (key: string) => void
}) => {
  const discovered = isDiscovered(discoveries, entry)
  const isRecipe = entry.sourceKind === 'recipe'
  const recipeResultKey = `${entry.id}:result`

  // RP-6 — flora entries are completely hidden until the species is
  // scanned via the permacomputer. Oak entries follow the same gate via
  // entity:oak discovery (recorded by commitScan).
  if (entry.id.startsWith('flora:') && !discovered) return null
  if (entry.id === 'entity:oak' && !discovered) return null

  return (
    <div className="mb-4">
      {/* Header: glyph + name */}
      <div className="flex items-baseline gap-2">
        {isRecipe ? (
          <span className="text-text text-sm">
            {entry.crossRefs
              ?.slice(0, 2)
              .map(ref => MANUAL_ENTRIES[ref]?.name ?? capitalize(ref.replace(/^[^:]+:/, '')))
              .join(' + ')}{' '}
            ={' '}
            <RecipeResultSpoiler
              entry={entry}
              discovered={discovered}
              hintKey={recipeResultKey}
              revealed={manualState.revealedHints.has(recipeResultKey)}
              onToggle={onToggleHint}
            />
          </span>
        ) : entry.category === ManualCategory.Control ? (
          <ControlName name={entry.name} />
        ) : entry.category === ManualCategory.Egregore ? (
          // Egregore entries have no name line — the cosmology has no
          // readable name per doctrine. Header is the glyph alone.
          <span style={{ color: entry.glyphColor, fontFamily: "'Voynich', monospace" }}>{entry.glyph}</span>
        ) : (
          <>
            <span style={{ color: entry.glyphColor }}>{entry.glyph}</span>
            <span className="text-text text-sm">{entry.name}</span>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="text-dim text-xs">{'----'}</div>

      {/* Specimen stack — RP-6. Rendered above the lore for scanned
          flora entries. One card per unique specimen identity; player pages
          through. The stack opens to the latest card by default (the just-
          scanned one when the manual is auto-opened after commit). */}
      {(() => {
        const species = speciesFromEntryId(entry.id)
        if (!species) return null
        const specimens = scannedSpecimens.get(species)
        if (!specimens || specimens.length === 0) return null
        return <SpecimenStack specimens={specimens} initialIndex={specimens.length - 1} />
      })()}

      {/* Oak specimen stack — same UI as flora but read from oakSpecimens. */}
      {entry.id === 'entity:oak' && oakSpecimens.length > 0 && (
        <SpecimenStack specimens={oakSpecimens} initialIndex={oakSpecimens.length - 1} />
      )}

      {/* Summary/lore — hidden for undiscovered recipes unless result spoiler is revealed.
          Egregore entries render their procedurally-generated EVA-token body in the
          Voynich typeface; Latin pierces inside the body remain ASCII so they render
          in the standard font as the spec requires. */}
      {(!isRecipe || discovered || manualState.revealedHints.has(recipeResultKey)) && (
        <div className="text-dim mt-1 text-xs whitespace-pre-line">
          {entry.category === ManualCategory.Egregore ? <EgregoreLore entry={entry} /> : entry.lore}
        </div>
      )}

      {/* RP-4 — revealed phenotypes. Rendered below the lore for
          discovered flora entries when one or more (species, axis) pairs
          have been resolved by past Reveries. Section omitted entirely if
          the species has no revealed phenotypes. */}
      {(() => {
        const species = speciesFromEntryId(entry.id)
        if (!species) return null
        const phenotypes = revealedPhenotypes.get(species)
        if (!phenotypes || phenotypes.length === 0) return null
        return (
          <div className="mt-2" data-testid={`phenotype-list-${species}`}>
            <div className="text-dim text-xs italic">Observations</div>
            <ul className="text-dim text-xs italic">
              {phenotypes.map(p => (
                <li key={p.axis}>Suspected: {p.verdict}</li>
              ))}
            </ul>
          </div>
        )
      })()}

      {/* Properties */}
      {showCategory && <div className="text-dim mt-1 text-xs">Category: {capitalize(entry.category)}</div>}

      {/* Hints */}
      {entry.hints.map((hint, i) => {
        const hintKey = `${entry.id}:${String(i)}`
        return (
          <HintBlock
            key={hintKey}
            hint={hint}
            hintKey={hintKey}
            revealed={manualState.revealedHints.has(hintKey)}
            onToggle={onToggleHint}
          />
        )
      })}
    </div>
  )
}

// How long the entry flash animation stays applied before manualHighlightEntryId
// is cleared. Matches the animate-event-log-flash duration (600ms) plus a small
// buffer so the animation completes cleanly before unmount.
const SCAN_HIGHLIGHT_MS = 700

export const ManualPanel = ({ state }: ManualPanelProps) => {
  const { manualState, manualDiscoveries, scannedSpecimens, oakSpecimens, revealedPhenotypes } = state
  const highlightId = state.manualHighlightEntryId

  // Local React state synced with persistent manualState
  const [activeCategory, setActiveCategoryLocal] = useState(manualState.activeCategory)
  const [searchQuery, setSearchQueryLocal] = useState(manualState.searchQuery)
  const [, forceRender] = useState(0)

  // When the manual opens with a highlight id set (just-scanned species),
  // reset to ALL category, scroll the entry into view, and clear the
  // highlight after a short beat.
  useEffect(() => {
    if (!highlightId) return
    // Reset to ALL so the entry is definitely visible.
    manualState.activeCategory = null
    setActiveCategoryLocal(null)
    manualState.searchQuery = ''
    setSearchQueryLocal('')
    // Scroll after the next render so the entry exists in the DOM.
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`manual-entry-${highlightId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
    // Clear the highlight after the visual beat. The highlight ring is
    // applied to the entry container while highlightId === entry.id.
    const clearTimer = window.setTimeout(() => {
      state.manualHighlightEntryId = null
      forceRender(n => n + 1)
    }, SCAN_HIGHLIGHT_MS)
    return () => {
      window.clearTimeout(scrollTimer)
      window.clearTimeout(clearTimer)
    }
  }, [highlightId, manualState, state])

  const allEntries = [...Object.values(MANUAL_ENTRIES), ...getEgregoreManualEntries(state)]
  const filtered = searchQuery ? filterManualEntries(allEntries, searchQuery) : allEntries

  const toggleHint = useCallback(
    (key: string) => {
      if (manualState.revealedHints.has(key)) {
        manualState.revealedHints.delete(key)
      } else {
        manualState.revealedHints.add(key)
      }
      forceRender(n => n + 1)
    },
    [manualState]
  )

  const setCategory = useCallback(
    (cat: ManualCategory | null) => {
      manualState.activeCategory = cat
      setActiveCategoryLocal(cat)
    },
    [manualState]
  )

  const setSearch = useCallback(
    (query: string) => {
      manualState.searchQuery = query
      setSearchQueryLocal(query)
    },
    [manualState]
  )

  const visibleCategories = activeCategory ? [activeCategory as ManualCategory] : CATEGORY_ORDER

  return (
    <div className="text-text flex h-full flex-col font-mono text-xs">
      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={e => {
          setSearch(e.target.value)
        }}
        placeholder="Search..."
        className="text-text placeholder-dim border-border hover:border-pink focus:border-pink mb-3 w-full border bg-black/50 px-2 py-1 font-mono text-xs outline-none"
      />

      {/* Category tabs */}
      <div className="mb-3 flex flex-wrap">
        <Tab
          active={activeCategory === null}
          onClick={() => {
            setCategory(null)
          }}
        >
          ALL
        </Tab>
        {CATEGORY_ORDER.map(cat => {
          const inCat = allEntries.filter(e => e.category === cat)
          const count = searchQuery ? filterManualEntries(inCat, searchQuery).length : inCat.length
          return (
            <Tab
              key={cat}
              active={activeCategory === cat}
              onClick={() => {
                setCategory(cat)
              }}
            >
              {CATEGORY_LABELS[cat]}
              {searchQuery && ` (${String(count)})`}
            </Tab>
          )
        })}
      </div>

      {/* Scrollable content */}
      <div className="scrollbar-custom min-h-0 flex-1 overflow-y-auto pr-2">
        {visibleCategories.map(cat => {
          const catEntries = filtered.filter(e => e.category === cat)
          if (catEntries.length === 0) return null
          return (
            <div key={cat}>
              <SectionHeader>{CATEGORY_LABELS[cat]}</SectionHeader>
              {catEntries.map(entry => {
                const isHighlighted = entry.id === highlightId
                return (
                  <div
                    key={entry.id}
                    id={`manual-entry-${entry.id}`}
                    data-highlighted={isHighlighted ? 'true' : undefined}
                    className={isHighlighted ? 'animate-event-log-flash -mx-2 mb-2 rounded px-2 py-1' : ''}
                  >
                    <EntryCard
                      entry={entry}
                      discoveries={manualDiscoveries}
                      scannedSpecimens={scannedSpecimens}
                      oakSpecimens={oakSpecimens}
                      revealedPhenotypes={revealedPhenotypes}
                      manualState={manualState}
                      showCategory={activeCategory === null}
                      onToggleHint={toggleHint}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
