import { useCallback, useState } from 'react'
import { SectionHeader, Tab, TextButton } from './PanelPrimitives'

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
import type { GameState, ManualState } from '@/engine/types'

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

const CATEGORY_LABELS: Record<ManualCategory, string> = {
  [ManualCategory.Life]: 'LIFE',
  [ManualCategory.Celestial]: 'CELESTIAL',
  [ManualCategory.Object]: 'OBJECTS',
  [ManualCategory.Person]: 'PEOPLE',
  [ManualCategory.Zone]: 'ZONES',
  [ManualCategory.Recipe]: 'RECIPES',
  [ManualCategory.Control]: 'CONTROLS',
  // Egregoric category — no English label. Renders as four Voynich
  // glyphs (the same allowlist subset used for tile glyphs). The tab
  // label deliberately resists naming; per v3 doctrine the player-facing
  // term for the egregores is none.
  [ManualCategory.Egregore]: '\u{0AB10}\u{0AB11}\u{0AB12}\u{0AB13}',
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

const EntryCard = ({
  entry,
  discoveries,
  manualState,
  showCategory,
  onToggleHint,
}: {
  entry: ManualEntry
  discoveries: Set<string>
  manualState: ManualState
  showCategory: boolean
  onToggleHint: (key: string) => void
}) => {
  const discovered = isDiscovered(discoveries, entry)
  const isRecipe = entry.sourceKind === 'recipe'
  const recipeResultKey = `${entry.id}:result`

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
          <>
            <span style={{ color: entry.glyphColor, fontFamily: "'Voynich', monospace" }}>{entry.glyph}</span>
            <span className="text-text text-sm" style={{ fontFamily: "'Voynich', monospace" }}>
              {entry.name}
            </span>
          </>
        ) : (
          <>
            <span style={{ color: entry.glyphColor }}>{entry.glyph}</span>
            <span className="text-text text-sm">{entry.name}</span>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="text-dim text-xs">{'----'}</div>

      {/* Summary/lore — hidden for undiscovered recipes unless result spoiler is revealed.
          Egregore entries render their procedurally-generated EVA-token body in the
          Voynich typeface; Latin pierces inside the body remain ASCII so they render
          in the standard font as the spec requires. */}
      {(!isRecipe || discovered || manualState.revealedHints.has(recipeResultKey)) && (
        <div className="text-dim mt-1 text-xs whitespace-pre-line">
          {entry.category === ManualCategory.Egregore ? <EgregoreLore entry={entry} /> : entry.lore}
        </div>
      )}

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

export const ManualPanel = ({ state }: ManualPanelProps) => {
  const { manualState, manualDiscoveries } = state

  // Local React state synced with persistent manualState
  const [activeCategory, setActiveCategoryLocal] = useState(manualState.activeCategory)
  const [searchQuery, setSearchQueryLocal] = useState(manualState.searchQuery)
  const [, forceRender] = useState(0)

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
              {catEntries.map(entry => (
                <div key={entry.id} id={`manual-entry-${entry.id}`}>
                  <EntryCard
                    entry={entry}
                    discoveries={manualDiscoveries}
                    manualState={manualState}
                    showCategory={activeCategory === null}
                    onToggleHint={toggleHint}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
