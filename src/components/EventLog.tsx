import { useEffect, useRef, useState } from 'react'

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

const scrollToBottom = (el: HTMLDivElement) => {
  el.scrollTop = el.scrollHeight
}

const isAtBottom = (el: HTMLDivElement): boolean => {
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  return distanceFromBottom < 4
}

export const EventLog = ({ state, eventLog }: EventLogProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stuckToBottomRef = useRef(true)
  const prevLengthRef = useRef(eventLog.length)
  const mountedEntryIdsRef = useRef(new Set(eventLog.map(e => e.id)))
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const grew = eventLog.length > prevLengthRef.current
    if (grew) {
      if (stuckToBottomRef.current) {
        scrollToBottom(el)
      } else {
        setUnreadCount(c => c + (eventLog.length - prevLengthRef.current))
      }
    }
    prevLengthRef.current = eventLog.length
  }, [eventLog.length])

  if (eventLog.length === 0) return null

  // useEventLog stores newest at index 0; reverse for terminal-style ordering
  // (oldest at top, newest at bottom).
  const ordered = [...eventLog].reverse()

  const clearCursorInfo = () => {
    state.cursorScreenPos = null
    state.cursorTile = null
  }

  const resumeAutoScroll = () => {
    const el = scrollRef.current
    if (el) scrollToBottom(el)
    stuckToBottomRef.current = true
    setUnreadCount(0)
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = isAtBottom(el)
    stuckToBottomRef.current = atBottom
    if (atBottom && unreadCount > 0) setUnreadCount(0)
  }

  const handleMouseLeave = () => {
    if (!stuckToBottomRef.current) resumeAutoScroll()
  }

  return (
    <div
      data-panel="event-log"
      className="text-text pointer-events-auto w-96 font-mono text-xs"
      onMouseEnter={clearCursorInfo}
      onMouseMove={clearCursorInfo}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-custom flex max-h-40 flex-col gap-1 overflow-y-auto"
      >
        {ordered.map((entry, i) => {
          const distFromBottom = ordered.length - 1 - i
          const shouldFlash = !mountedEntryIdsRef.current.has(entry.id)
          return (
            <span
              key={entry.id}
              data-testid={`event-log-entry-${entry.id}`}
              className={shouldFlash ? 'animate-event-log-flash' : undefined}
              style={{ opacity: computeOpacity(distFromBottom) }}
            >
              <span style={{ color: entry.iconColor }}>{entry.icon}</span> {entry.text}
            </span>
          )
        })}
      </div>
      {unreadCount > 0 && (
        <button
          type="button"
          data-testid="event-log-unread-indicator"
          onClick={resumeAutoScroll}
          className="text-bg pointer-events-auto absolute right-2 bottom-1 rounded bg-white/90 px-2 py-0.5 font-mono text-[10px] hover:bg-white"
        >
          {unreadCount} new {unreadCount === 1 ? 'event' : 'events'} ↓
        </button>
      )}
    </div>
  )
}
