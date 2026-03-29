import { useCallback, useEffect, useRef, useState } from 'react'

export interface GameEvent {
  id: string
  kind: 'pickup' | 'drop' | 'combine' | 'dialog' | 'discovery'
  text: string
  icon: string
  iconColor: string
  timestamp: number
  worldX: number
  worldY: number
}

export const TOAST_DURATION = 3000
export const TOAST_FADE_START = 2000

export const useEventLog = () => {
  const [toasts, setToasts] = useState<GameEvent[]>([])
  const [log, setLog] = useState<GameEvent[]>([])
  const [, setTick] = useState(0)
  const counterRef = useRef(0)
  const rafRef = useRef(0)

  const addEvent = useCallback(
    (kind: GameEvent['kind'], text: string, icon: string, iconColor: string, worldX: number, worldY: number) => {
      const id = String(counterRef.current++)
      const event: GameEvent = { id, kind, text, icon, iconColor, timestamp: Date.now(), worldX, worldY }
      if (kind !== 'dialog') {
        setToasts(prev => [...prev, event])
      }
      setLog(prev => [event, ...prev].slice(0, 50))
    },
    []
  )

  useEffect(() => {
    if (toasts.length === 0) return

    const tick = () => {
      const now = Date.now()
      setToasts(prev => {
        const filtered = prev.filter(t => now - t.timestamp < TOAST_DURATION)
        if (filtered.length !== prev.length) return filtered
        return prev
      })
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [toasts.length])

  return { toasts, log, addEvent }
}
