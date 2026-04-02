import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

import { getDefinition, ITEM_DEFINITIONS } from '@/engine/items'
import type { ItemDefinition } from '@/engine/types'

export interface ItemInfoHandle {
  show: (definitionId: string, uid?: string) => void
  clear: () => void
  setDragging: (isDragging: boolean) => void
  getCurrentId: () => string | null
  getCurrentUid: () => string | null
}

interface ItemInfoProps {
  glintingCoins?: Set<string>
}

export const ItemInfo = forwardRef<ItemInfoHandle, ItemInfoProps>(({ glintingCoins }, ref) => {
  const [item, setItem] = useState<ItemDefinition | null>(null)
  const currentIdRef = useRef<string | null>(null)
  const currentUidRef = useRef<string | null>(null)

  useImperativeHandle(ref, () => ({
    show: (definitionId: string, uid?: string) => {
      if (definitionId === currentIdRef.current && uid === currentUidRef.current) return
      currentIdRef.current = definitionId
      currentUidRef.current = uid ?? null
      if (definitionId in ITEM_DEFINITIONS) {
        setItem(getDefinition(definitionId))
      }
    },
    clear: () => {
      if (currentIdRef.current === null && currentUidRef.current === null) return
      currentIdRef.current = null
      currentUidRef.current = null
      setItem(null)
    },
    // no-op — callers still call it during drag lifecycle
    setDragging: () => {
      // intentionally empty
    },
    getCurrentId: () => currentIdRef.current,
    getCurrentUid: () => currentUidRef.current,
  }))

  const isCoin = item?.id === 'coin'
  const uid = currentUidRef.current
  const isGlinting = isCoin && uid !== null && glintingCoins?.has(uid) === true

  return (
    <div>
      {item ? (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <span style={{ color: isCoin && !isGlinting ? '#8B7D3C' : item.glyphColor }}>
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
          {isCoin && (
            <div className="mt-1" style={{ color: isGlinting ? '#C9B037' : '#8B7D3C' }}>
              {isGlinting ? 'it glints in the light.' : 'the shine has faded.'}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
})

ItemInfo.displayName = 'ItemInfo'
