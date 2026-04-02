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
}

const LINE_LABELS: Record<number, string> = {
  6: 'old yin',
  7: 'young yang',
  8: 'young yin',
  9: 'old yang',
}

const RenderLine = ({ line, changing }: { line: HexagramLine; changing: boolean }) => {
  const solid = line.yang
  const changeMark = changing && line.changing
  return (
    <div className="flex items-center gap-2 font-mono">
      <span className={`text-sm ${changeMark ? 'text-pink' : 'text-text'}`}>
        {solid ? '———————' : '———  ———'}
      </span>
      {changeMark && <span className="text-dim text-xs">{line.yang ? 'o' : 'x'}</span>}
    </div>
  )
}

const HexagramDisplay = ({
  lines,
  name,
  number,
  meaning,
  hasChanging,
  label,
}: {
  lines: boolean[]
  name: string
  number: number
  meaning: string
  hasChanging: boolean
  label?: string
}) => (
  <div className="mb-4">
    {label && <div className="text-dim mb-1 text-xs">{label}</div>}
    <div className="mb-2 flex items-baseline gap-2">
      <span className="text-pink text-sm">#{number}</span>
      <span className="text-text text-sm">{name}</span>
    </div>
    <div className="mb-3 flex flex-col-reverse gap-0.5">
      {lines.map((yang, i) => (
        <RenderLine
          key={i}
          line={{ value: (yang ? 7 : 8) as LineType, yang, changing: false }}
          changing={hasChanging}
        />
      ))}
    </div>
    <p className="text-dim text-xs leading-relaxed">{meaning}</p>
  </div>
)

type Phase = 'tossing' | 'result'

export const HexagramPanel = ({ state, onClose, refreshUI }: HexagramPanelProps) => {
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
      refreshUI()
    }
  }, [canToss, tossedLines, state, refreshUI])

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

  return (
    <div className="fixed inset-0 z-10" onClick={onClose}>
      <div
        className="border-border text-text fixed top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col border bg-black/85 px-8 py-6 font-mono text-xs"
        style={{ width: 480, maxHeight: '80vh' }}
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <CloseButton onClick={onClose} label="Close hexagram" />
        <PanelTitle>I Ching</PanelTitle>

        {!hasEnoughCoins && phase === 'tossing' && tossCount === 0 && (
          <p className="text-dim mb-4">You need 3 glinting coins in your backpack to cast.</p>
        )}

        {phase === 'tossing' && (
          <div>
            <div className="text-dim mb-3 text-xs">
              Toss {tossCount}/6 — {canToss ? 'press [space] or [enter] to toss' : 'complete'}
            </div>

            {/* Lines built so far, rendered top-to-bottom (newest at top) */}
            <div className="mb-4 flex flex-col-reverse gap-0.5">
              {tossedLines.map((val, i) => {
                const line = lineFromValue(val)
                return (
                  <div key={i} className="flex items-center gap-3">
                    <RenderLine line={line} changing={true} />
                    <span className="text-dim text-xs">
                      {val} — {LINE_LABELS[val]}
                    </span>
                  </div>
                )
              })}
            </div>

            {canToss && (
              <button
                type="button"
                className="text-pink hover:text-text text-xs"
                onClick={doToss}
              >
                [toss coins]
              </button>
            )}
          </div>
        )}

        {phase === 'result' && result && (
          <div className="overflow-y-auto">
            <HexagramDisplay
              lines={result.primary.lines}
              name={result.primary.name}
              number={result.primary.id}
              meaning={result.primary.meaning}
              hasChanging={result.transformed !== null}
              label={result.transformed ? 'present' : undefined}
            />

            {result.transformed && (
              <>
                <div className="text-dim my-3 text-center text-xs">~ changing lines transform ~</div>
                <HexagramDisplay
                  lines={result.transformed.lines}
                  name={result.transformed.name}
                  number={result.transformed.id}
                  meaning={result.transformed.meaning}
                  hasChanging={false}
                  label="becoming"
                />
              </>
            )}

            <div className="text-dim mt-4 text-xs">press [space] or [enter] to close</div>
          </div>
        )}
      </div>
    </div>
  )
}
