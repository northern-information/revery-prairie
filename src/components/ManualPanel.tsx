import { useCallback, useState } from 'react'
import { CloseButton, PanelTitle, SectionHeader } from './PanelPrimitives'

import {
  CATEGORY_ORDER,
  filterManualEntries,
  getEntriesByCategory,
  isDiscovered,
  MANUAL_ENTRIES,
  ManualCategory,
} from '@/engine/manual'
import type { ManualEntry, ManualHint } from '@/engine/manual'
import type { GameState, ManualState } from '@/engine/types'

interface ManualPanelProps {
  state: GameState
  onClose: () => void
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
  [ManualCategory.Flora]: 'FLORA',
  [ManualCategory.Fauna]: 'FAUNA',
  [ManualCategory.Celestial]: 'CELESTIAL',
  [ManualCategory.Object]: 'OBJECTS',
  [ManualCategory.Person]: 'PEOPLE',
  [ManualCategory.Zone]: 'ZONES',
  [ManualCategory.Recipe]: 'RECIPES',
  [ManualCategory.Control]: 'CONTROLS',
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
    <button
      type="button"
      className="text-dim hover:text-text text-left text-xs"
      onClick={() => {
        onToggle(hintKey)
      }}
    >
      <span className="text-dim">&gt; {hint.prompt}</span>
      <span className="text-pink ml-2">{revealed ? '[-]' : '[+]'}</span>
    </button>
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
        <button
          type="button"
          className="text-pink ml-2 text-xs"
          onClick={() => {
            onToggle(hintKey)
          }}
        >
          [-]
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className="text-dim hover:text-text text-xs"
      onClick={() => {
        onToggle(hintKey)
      }}
    >
      ??? <span className="text-pink">[+]</span>
    </button>
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
            {entry.crossRefs?.slice(0, 2).join(' + ')} ={' '}
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
        ) : (
          <>
            <span style={{ color: entry.glyphColor }}>{entry.glyph}</span>
            <span className="text-text text-sm">{entry.name}</span>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="text-dim text-xs">{'----'}</div>

      {/* Summary/lore — hidden for undiscovered recipes unless result spoiler is revealed */}
      {(!isRecipe || discovered || manualState.revealedHints.has(recipeResultKey)) && (
        <div className="text-dim mt-1 text-xs whitespace-pre-line">{entry.lore}</div>
      )}

      {/* Properties */}
      {showCategory && <div className="text-dim mt-1 text-xs">category: {entry.category}</div>}

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

export const ManualPanel = ({ state, onClose }: ManualPanelProps) => {
  const { manualState, manualDiscoveries } = state

  // Local React state synced with persistent manualState
  const [activeCategory, setActiveCategoryLocal] = useState(manualState.activeCategory)
  const [searchQuery, setSearchQueryLocal] = useState(manualState.searchQuery)
  const [, forceRender] = useState(0)

  const allEntries = Object.values(MANUAL_ENTRIES)
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
    <div className="fixed inset-0 z-10" onClick={onClose}>
      <div
        className="border-border text-text fixed top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col border bg-black/85 px-8 py-6 font-mono text-xs"
        style={{ width: 560, height: '80vh' }}
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <CloseButton onClick={onClose} label="Close manual" />
        <PanelTitle>prairie manual</PanelTitle>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => {
            setSearch(e.target.value)
          }}
          placeholder="search..."
          className="text-text placeholder-dim border-border focus:border-pink mb-3 w-full border bg-black/50 px-2 py-1 font-mono text-xs outline-none"
        />

        {/* Category tabs */}
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
          <button
            type="button"
            className={`text-xs ${activeCategory === null ? 'text-pink' : 'text-dim hover:text-text'}`}
            onClick={() => {
              setCategory(null)
            }}
          >
            ALL
          </button>
          {CATEGORY_ORDER.map(cat => {
            const count = searchQuery
              ? filterManualEntries(getEntriesByCategory(cat), searchQuery).length
              : getEntriesByCategory(cat).length
            return (
              <button
                key={cat}
                type="button"
                className={`text-xs ${activeCategory === cat ? 'text-pink' : 'text-dim hover:text-text'}`}
                onClick={() => {
                  setCategory(cat)
                }}
              >
                {CATEGORY_LABELS[cat]}
                {searchQuery && ` (${String(count)})`}
              </button>
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
    </div>
  )
}
