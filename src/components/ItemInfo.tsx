import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

import { getDefinition, ITEM_DEFINITIONS } from '@/engine/items'
import type { ItemDefinition } from '@/engine/types'

export interface ItemInfoHandle {
  show: (definitionId: string) => void
  clear: () => void
  setDragging: (isDragging: boolean) => void
  getCurrentId: () => string | null
}

export const ItemInfo = forwardRef<ItemInfoHandle>((_props, ref) => {
  const [item, setItem] = useState<ItemDefinition | null>(null)
  const currentIdRef = useRef<string | null>(null)

  useImperativeHandle(ref, () => ({
    show: (definitionId: string) => {
      if (definitionId === currentIdRef.current) return
      currentIdRef.current = definitionId
      if (definitionId in ITEM_DEFINITIONS) {
        setItem(getDefinition(definitionId))
      }
    },
    clear: () => {
      if (currentIdRef.current === null) return
      currentIdRef.current = null
      setItem(null)
    },
    // no-op — callers still call it during drag lifecycle
    setDragging: () => {
      // intentionally empty
    },
    getCurrentId: () => currentIdRef.current,
  }))

  return (
    <div>
      {item ? (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <span style={{ color: item.glyphColor }}>
              {item.glyph} {item.name.toLowerCase()}
            </span>
          </div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-muted">weight</span>
            <span>{item.weight}</span>
          </div>
          <div className="mb-1 flex items-baseline justify-between text-end">
            <span className="text-muted">category</span>
            <span className="">{item.category}</span>
          </div>
          <div className="mb-1 flex items-baseline justify-between">{item.description}</div>
        </>
      ) : null}
    </div>
  )
})

ItemInfo.displayName = 'ItemInfo'
