import { useCallback, useEffect, useRef, useState } from 'react'

export interface PickupToast {
  id: string
  name: string
  icon: string
  iconColor: string
  timestamp: number
  worldX: number
  worldY: number
}

const TOAST_DURATION = 3000

export const usePickupToasts = () => {
  const [toasts, setToasts] = useState<PickupToast[]>([])
  const [log, setLog] = useState<PickupToast[]>([])
  const counterRef = useRef(0)

  const addToast = useCallback((name: string, icon: string, iconColor: string, worldX: number, worldY: number) => {
    const id = String(counterRef.current++)
    const toast: PickupToast = { id, name, icon, iconColor, timestamp: Date.now(), worldX, worldY }
    setToasts(prev => [...prev, toast])
    setLog(prev => [toast, ...prev].slice(0, 20))
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return

    const timer = setInterval(() => {
      const now = Date.now()
      setToasts(prev => prev.filter(t => now - t.timestamp < TOAST_DURATION))
    }, 500)

    return () => {
      clearInterval(timer)
    }
  }, [toasts.length])

  return { toasts, log, addToast }
}
