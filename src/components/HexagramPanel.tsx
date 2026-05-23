import { useCallback, useEffect, useState } from 'react'
import { AccentBlock, TextButton } from './PanelPrimitives'

import {
  canCast,
  completeCast,
  consumeGlint,
  HEXAGRAM_GRID,
  lineFromValue,
  recordDivinedHexagrams,
  tossThreeCoins,
} from '@/engine/hexagram'
import { recordDiscovery } from '@/engine/manual'
import type { CastResult, HexagramDefinition, HexagramLine, LineType } from '@/engine/hexagram'
import type { GameState } from '@/engine/types'

interface HexagramPanelProps {
  state: GameState
  onClose: () => void
  refreshUI: () => void
  initialView?: View
}

const LINE_LABELS: Record<number, string> = {
  6: 'old yin',
  7: 'young yang',
  8: 'young yin',
  9: 'old yang',
}

const TossLine = ({ line, index }: { line: HexagramLine; index: number }) => {
  const solid = line.yang
  const changeMark = line.changing
  return (
    <div className="flex items-center gap-3 font-mono">
      <span className="text-dim w-3 text-right text-xs">{index + 1}</span>
      <span className={`text-sm ${changeMark ? 'text-pink' : 'text-text'}`}>{solid ? '———————' : '———  ———'}</span>
      <span className="text-dim text-xs">
        {line.value} {LINE_LABELS[line.value]}
        {changeMark && (line.yang ? ' (changing)' : ' (changing)')}
      </span>
    </div>
  )
}

const HexagramFigure = ({ lines, changing }: { lines: HexagramLine[]; changing: boolean }) => (
  <div className="flex flex-col-reverse gap-0.5 font-mono">
    {lines.map((line, i) => {
      const isChanging = changing && line.changing
      return (
        <div key={i} className="flex items-center gap-2">
          <span className={`text-sm ${isChanging ? 'text-pink' : 'text-text'}`}>
            {line.yang ? '———————' : '———  ———'}
          </span>
          {isChanging && <span className="text-dim text-xs">{line.yang ? 'o' : 'x'}</span>}
        </div>
      )
    })}
  </div>
)

const StaticFigure = ({ lines }: { lines: boolean[] }) => (
  <div className="flex flex-col-reverse gap-0.5 font-mono">
    {lines.map((yang, i) => (
      <span key={i} className="text-text text-sm">
        {yang ? '———————' : '———  ———'}
      </span>
    ))}
  </div>
)

// --- Compact mini-figure for the 8x8 grid ---

const MiniFigure = ({ lines, dimmed }: { lines: boolean[]; dimmed: boolean }) => (
  <div className={`flex flex-col-reverse gap-px leading-none ${dimmed ? 'opacity-20' : ''}`}>
    {lines.map((yang, i) => (
      <span key={i} className="text-text block text-center" style={{ fontSize: 7, lineHeight: '5px' }}>
        {yang ? '———' : '— —'}
      </span>
    ))}
  </div>
)

// --- Hexagram Compendium grid ---

const HexagramCompendium = ({ state, onBack }: { state: GameState; onBack: () => void }) => {
  const [selected, setSelected] = useState<HexagramDefinition | null>(null)
  const [selectedDivined, setSelectedDivined] = useState(false)

  const handleSelect = (h: HexagramDefinition) => {
    const divined = state.divinedHexagrams.has(h.id)
    setSelected(h)
    setSelectedDivined(divined)
  }

  return (
    <div className="text-text font-mono text-xs">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-dim text-xs">{state.divinedHexagrams.size}/64 divined</span>
        <TextButton onClick={onBack} variant="secondary">
          [casting]
        </TextButton>
      </div>

      {/* 8x8 grid — rows = lower trigram, cols = upper trigram */}
      <div className="mb-4 grid grid-cols-8 gap-1">
        {HEXAGRAM_GRID.map((row, ri) =>
          row.map((h, ci) => {
            const divined = state.divinedHexagrams.has(h.id)
            const isSelected = selected?.id === h.id
            return (
              <button
                key={`${String(ri)}-${String(ci)}`}
                type="button"
                className={`flex flex-col items-center gap-0.5 rounded px-0.5 py-1 transition-colors ${
                  isSelected ? 'bg-pink/20 border-pink border' : 'border-border-dim hover:border-pink/50 border'
                }`}
                onClick={() => {
                  handleSelect(h)
                }}
                title={divined ? `#${String(h.id)} ${h.name}` : `#${String(h.id)} ???`}
              >
                <MiniFigure lines={h.lines} dimmed={!divined} />
                <span className={`text-center ${divined ? 'text-dim' : 'opacity-20'}`} style={{ fontSize: 8 }}>
                  {h.id}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Detail panel for selected hexagram */}
      {selected && (
        <div className="border-border-dim border-t pt-3">
          {selectedDivined ? (
            <div>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-pink">#{selected.id}</span>
                <span className="text-text">{selected.name}</span>
              </div>
              <div className="mb-3">
                <StaticFigure lines={selected.lines} />
              </div>
              <AccentBlock>
                <p className="text-dim leading-relaxed">{selected.meaning}</p>
              </AccentBlock>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-dim">#{selected.id}</span>
                <span className="text-dim">???</span>
              </div>
              <p className="text-dim">cast to reveal this hexagram.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Main panel ---

type Phase = 'tossing' | 'result'
type View = 'casting' | 'compendium'

export const HexagramPanel = ({ state, onClose, refreshUI, initialView }: HexagramPanelProps) => {
  const [view, setView] = useState<View>(initialView ?? 'casting')
  const [phase, setPhase] = useState<Phase>('tossing')
  const [tossedLines, setTossedLines] = useState<LineType[]>([])
  const [result, setResult] = useState<CastResult | null>(null)

  const tossCount = tossedLines.length
  const hasCoins = canCast(state)
  const canToss = phase === 'tossing' && tossCount < 6 && hasCoins

  const doToss = useCallback(() => {
    if (!canToss) return
    const value = tossThreeCoins()
    const next = [...tossedLines, value]
    setTossedLines(next)

    if (next.length === 6) {
      const castResult = completeCast(next)
      consumeGlint(state)
      recordDivinedHexagrams(state, castResult)
      recordDiscovery(state, 'event:hexagram-cast')
      setResult(castResult)
      setPhase('result')
      refreshUI()
    }
  }, [canToss, tossedLines, state, refreshUI])

  useEffect(() => {
    if (view !== 'casting') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (phase === 'tossing') {
          doToss()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [doToss, phase, onClose, view])

  const parsedLines = tossedLines.map(lineFromValue)
  const hasChanging = result ? result.transformed !== null : false

  if (view === 'compendium') {
    return (
      <HexagramCompendium
        state={state}
        onBack={() => {
          setView('casting')
        }}
      />
    )
  }

  return (
    <div className="text-text font-mono text-xs">
      {!hasCoins && phase === 'tossing' && tossCount === 0 && (
        <p className="text-dim mb-4">you need 3 glinting coins in your backpack to cast.</p>
      )}

      {phase === 'tossing' && (
        <div>
          {/* Toss log — each toss stays visible */}
          <div className="mb-4">
            {parsedLines.map((line, i) => (
              <TossLine key={i} line={line} index={i} />
            ))}
            {tossCount < 6 && (
              <div className="text-dim mt-1 flex items-center gap-3 font-mono">
                <span className="w-3 text-right text-xs">{tossCount + 1}</span>
                <span className="text-sm">· · · · · · ·</span>
              </div>
            )}
          </div>

          <div className="text-dim mb-3 text-xs">toss {tossCount}/6</div>

          <div className="flex items-center gap-2">
            {canToss && <TextButton onClick={doToss}>[Toss Coins] or press [F]</TextButton>}
            <TextButton
              onClick={() => {
                setView('compendium')
              }}
              variant="secondary"
            >
              [Compendium]
            </TextButton>
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="scrollbar-custom overflow-y-auto">
          {/* Primary hexagram */}
          <div className="mb-4">
            {hasChanging && <div className="text-dim mb-2 text-xs tracking-wide uppercase">present</div>}
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-pink">#{result.primary.id}</span>
              <span className="text-text">{result.primary.name}</span>
            </div>
            <div className="mb-3">
              <HexagramFigure lines={result.lines} changing={hasChanging} />
            </div>
            <AccentBlock>
              <p className="text-dim leading-relaxed">{result.primary.meaning}</p>
            </AccentBlock>
          </div>

          {/* Transformed hexagram */}
          {result.transformed && (
            <div className="mb-4">
              <div className="text-dim mb-2 text-xs">changing lines transform &darr;</div>
              <div className="text-dim mb-2 text-xs tracking-wide uppercase">becoming</div>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-pink">#{result.transformed.id}</span>
                <span className="text-text">{result.transformed.name}</span>
              </div>
              <div className="mb-3">
                <StaticFigure lines={result.transformed.lines} />
              </div>
              <AccentBlock>
                <p className="text-dim leading-relaxed">{result.transformed.meaning}</p>
              </AccentBlock>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span className="text-dim text-xs">press [F] or [Enter] to close</span>
            <TextButton
              onClick={() => {
                setView('compendium')
              }}
              variant="secondary"
            >
              [compendium]
            </TextButton>
          </div>
        </div>
      )}
    </div>
  )
}
