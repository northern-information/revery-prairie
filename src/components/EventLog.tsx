import { useEffect, useRef } from 'react'

import type { GameState } from '@/engine/types'
import type { GameEvent } from '@/hooks/useEventLog'

interface EventLogProps {
  state: GameState
  eventLog: GameEvent[]
}

const FADE_RANGE = 6
const MIN_OPACITY = 0.15

const computeOpacity = (distFromBottom: number): number => {
  const raw = 1 - distFromBottom / FADE_RANGE
  return Math.max(MIN_OPACITY, Math.min(1, raw))
}

export const EventLog = ({ state, eventLog }: EventLogProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stuckToBottomRef = useRef(true)
  const prevLengthRef = useRef(eventLog.length)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (eventLog.length !== prevLengthRef.current && stuckToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
    prevLengthRef.current = eventLog.length
  }, [eventLog.length])

  if (eventLog.length === 0) return null

  // useEventLog stores newest at index 0; reverse for terminal-style ordering
  // (oldest at top, newest at bottom).
  const ordered = [...eventLog].reverse()

  const suppressEdgeScroll = () => {
    state.edgeScrollPos = null
    state.cursorScreenPos = null
    state.cursorTile = null
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stuckToBottomRef.current = distanceFromBottom < 4
  }

  return (
    <div
      data-panel="event-log"
      className="text-text pointer-events-auto fixed bottom-2 left-2 z-10 w-96 bg-black/70 px-3 py-2 font-mono text-xs"
      onMouseEnter={suppressEdgeScroll}
      onMouseMove={suppressEdgeScroll}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-custom flex max-h-48 flex-col gap-1 overflow-y-auto"
      >
        {ordered.map((entry, i) => {
          const distFromBottom = ordered.length - 1 - i
          return (
            <span
              key={entry.id}
              data-testid={`event-log-entry-${entry.id}`}
              style={{ opacity: computeOpacity(distFromBottom) }}
            >
              <span style={{ color: entry.iconColor }}>{entry.icon}</span> {entry.text}
            </span>
          )
        })}
      </div>
    </div>
  )
}
