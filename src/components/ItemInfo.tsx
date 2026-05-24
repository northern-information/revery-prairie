import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { SectionHeader } from './PanelPrimitives'

import { COIN_DULL_COLOR, COIN_GLINTING_COLOR, FRAMES_PER_TUBE } from '@/engine/constants'
import { getDefinition, ITEM_DEFINITIONS } from '@/engine/items'
import { getLore } from '@/engine/manual'
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
  cameraFilm?: Map<string, number>
}

export const ItemInfo = forwardRef<ItemInfoHandle, ItemInfoProps>(({ glintingCoins, cameraFilm }, ref) => {
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

  // Precis #23 — camera film status. cameraFilm is keyed by camera
  // ItemInstance uid. Undefined entry → unloaded; 0 → exhausted body;
  // >0 → loaded with N frames remaining.
  const isCamera = item?.id === 'camera'
  const filmRemaining = isCamera && uid !== null ? cameraFilm?.get(uid) : undefined
  const filmStatus: { label: string; color: string } | null = !isCamera
    ? null
    : filmRemaining === undefined
      ? { label: 'No film loaded.', color: '#888888' }
      : filmRemaining === 0
        ? { label: 'Film exhausted.', color: '#888888' }
        : { label: `Film: ${String(filmRemaining)} / ${String(FRAMES_PER_TUBE)} frames remaining.`, color: '#C2B280' }

  return (
    <div>
      {item ? (
        <>
          <SectionHeader>Item</SectionHeader>
          <div className="mb-1 flex items-baseline justify-between">
            <span style={{ color: isCoin && !isGlinting ? COIN_DULL_COLOR : item.glyphColor }}>
              {item.glyph} {item.name}
            </span>
          </div>
          <div className="mb-1 flex items-baseline justify-between text-end">
            <span className="text-muted">Category</span>
            <span className="">{item.category}</span>
          </div>
          <div className="mb-1 flex items-baseline justify-between">{getLore(`item:${item.id}`)}</div>
          {isCoin && (
            <div className="mt-1" style={{ color: isGlinting ? COIN_GLINTING_COLOR : COIN_DULL_COLOR }}>
              {isGlinting ? 'it glints in the light.' : 'the shine has faded.'}
            </div>
          )}
          {filmStatus && (
            <div className="mt-1" style={{ color: filmStatus.color }}>
              {filmStatus.label}
            </div>
          )}
          {isCamera && (
            <div className="text-dim mt-1 text-xs italic">
              Place on a tile to record the events around it for one season.
            </div>
          )}
          <div className="text-dim mt-2 text-xs">
            <span className="text-text">[X]</span> {isCamera ? 'Deploy' : 'Drop'}
          </div>
        </>
      ) : null}
    </div>
  )
})

ItemInfo.displayName = 'ItemInfo'
