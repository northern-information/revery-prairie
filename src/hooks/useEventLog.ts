import { useCallback, useRef, useState } from 'react'

export interface GameEvent {
  id: string
  kind: 'pickup' | 'drop' | 'combine' | 'dialog' | 'discovery' | 'narration'
  text: string
  icon: string
  iconColor: string
  timestamp: number
  worldX: number
  worldY: number
}

export const useEventLog = () => {
  const [log, setLog] = useState<GameEvent[]>([])
  const counterRef = useRef(0)

  const addEvent = useCallback(
    (kind: GameEvent['kind'], text: string, icon: string, iconColor: string, worldX: number, worldY: number) => {
      const id = String(counterRef.current++)
      const event: GameEvent = { id, kind, text, icon, iconColor, timestamp: Date.now(), worldX, worldY }
      setLog(prev => [event, ...prev].slice(0, 50))
    },
    []
  )

  return { log, addEvent }
}
