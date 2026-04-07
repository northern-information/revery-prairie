import { useCallback, useEffect, useState } from 'react'
import { CloseButton, PanelTitle } from './PanelPrimitives'

import {
  canCast,
  completeCast,
  consumeGlint,
  lineFromValue,
  tossThreeCoins,
} from '@/engine/hexagram'
import { recordDiscovery } from '@/engine/manual'
import type { CastResult, HexagramLine, LineType } from '@/engine/hexagram'
import type { GameState } from '@/engine/types'

interface HexagramPanelProps {
  state: GameState
  onClose: () => void
  refreshUI: () => void
  onCastLog: (text: string, worldX: number, worldY: number) => void
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
      <span className={`text-sm ${changeMark ? 'text-pink' : 'text-text'}`}>
        {solid ? '———————' : '———  ———'}
      </span>
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

type Phase = 'tossing' | 'result'

export const HexagramPanel = ({ state, onClose, refreshUI, onCastLog }: HexagramPanelProps) => {
  const [phase, setPhase] = useState<Phase>('tossing')
  const [tossedLines, setTossedLines] = useState<LineType[]>([])
  const [result, setResult] = useState<CastResult | null>(null)

  const tossCount = tossedLines.length
  const canToss = phase === 'tossing' && tossCount < 6

  const doToss = useCallback(() => {
    if (!canToss) return
    const value = tossThreeCoins()
    const next = [...tossedLines, value]
    setTossedLines(next)

    if (next.length === 6) {
      const castResult = completeCast(next)
      consumeGlint(state)
      recordDiscovery(state, 'event:hexagram-cast')
      setResult(castResult)
      setPhase('result')
      const logText = castResult.transformed
        ? `cast ${castResult.primary.name} \u2192 ${castResult.transformed.name}`
        : `cast ${castResult.primary.name}`
      onCastLog(logText, state.player.x, state.player.y)
      refreshUI()
    }
  }, [canToss, tossedLines, state, refreshUI, onCastLog])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
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
  }, [doToss, phase, onClose])

  const hasEnoughCoins = canCast(state)
  const parsedLines = tossedLines.map(lineFromValue)
  const hasChanging = result ? result.transformed !== null : false

  return (
    <div className="fixed inset-0 z-10" onClick={onClose}>
      <div
        className="border-border text-text fixed top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col border bg-black/85 px-8 py-6 font-mono text-xs"
        style={{ width: 520, maxHeight: '85vh' }}
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <CloseButton onClick={onClose} label="Close hexagram" />
        <PanelTitle>I Ching</PanelTitle>

        {!hasEnoughCoins && phase === 'tossing' && tossCount === 0 && (
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

            <div className="text-dim mb-3 text-xs">
              toss {tossCount}/6
            </div>

            {canToss && (
              <button
                type="button"
                className="text-pink hover:text-text text-xs"
                onClick={doToss}
              >
                [toss coins] or press [space]
              </button>
            )}
          </div>
        )}

        {phase === 'result' && result && (
          <div className="overflow-y-auto">
            {/* Primary hexagram */}
            <div className="mb-5">
              {hasChanging && <div className="text-dim mb-2 text-xs uppercase tracking-wide">present</div>}
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-pink">#{result.primary.id}</span>
                <span className="text-text">{result.primary.name}</span>
              </div>
              <div className="mb-3">
                <HexagramFigure lines={result.lines} changing={hasChanging} />
              </div>
              <div className="border-border border-l-2 pl-3">
                <p className="text-dim leading-relaxed">{result.primary.meaning}</p>
              </div>
            </div>

            {/* Transformed hexagram */}
            {result.transformed && (
              <div className="mb-5">
                <div className="text-dim mb-2 text-xs">changing lines transform &darr;</div>
                <div className="text-dim mb-2 text-xs uppercase tracking-wide">becoming</div>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-pink">#{result.transformed.id}</span>
                  <span className="text-text">{result.transformed.name}</span>
                </div>
                <div className="mb-3">
                  <StaticFigure lines={result.transformed.lines} />
                </div>
                <div className="border-border border-l-2 pl-3">
                  <p className="text-dim leading-relaxed">{result.transformed.meaning}</p>
                </div>
              </div>
            )}

            <div className="text-dim mt-2 text-xs">press [space] or [enter] to close</div>
          </div>
        )}
      </div>
    </div>
  )
}
