import { useCallback, useRef } from 'react'
import { DialogBox } from './DialogBox'
import { GameCanvas } from './GameCanvas'
import { InventoryPanel } from './InventoryPanel'
import { Menu } from './Menu'
import { PickupToasts } from './PickupToasts'
import { Sidebar } from './Sidebar'

import { advanceDialog } from '@/engine/actions'
import { getCharacterDefinition } from '@/engine/characters'
import { getDefinition } from '@/engine/items'
import { useEventLog } from '@/hooks/useEventLog'
import { useGameEngine } from '@/hooks/useGameEngine'
import { useKeyboard } from '@/hooks/useKeyboard'
import type { ItemInfoHandle } from './ItemInfo'
import type { CharMetrics } from '@/engine/renderer'

interface GameScreenProps {
  stewardName: string
  onRestart: () => void
}

export const GameScreen = ({ stewardName, onRestart }: GameScreenProps) => {
  // uiVersion is destructured to subscribe GameScreen to the useState counter.
  // refreshUI() increments it, triggering re-renders when engine state mutates.
  const { state, refreshUI, uiVersion } = useGameEngine(stewardName, 80, 40)
  void uiVersion
  const itemInfoRef = useRef<ItemInfoHandle>(null)
  const metricsRef = useRef<CharMetrics | null>(null)
  const isDraggingRef = useRef(false)
  const { toasts, log, addEvent } = useEventLog()

  const onPickup = useCallback(
    (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => {
      addEvent('pickup', `picked up ${name.toLowerCase()}`, icon, iconColor, worldX, worldY)
    },
    [addEvent]
  )

  const onDrop = useCallback(
    (definitionId: string, worldX: number, worldY: number) => {
      const def = getDefinition(definitionId)
      addEvent('drop', `dropped ${def.name.toLowerCase()}`, def.glyph, def.glyphColor, worldX, worldY)
    },
    [addEvent]
  )

  const onDialog = useCallback(
    (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => {
      addEvent('dialog', `talked to ${characterName.toLowerCase()}`, glyph, glyphColor, worldX, worldY)
    },
    [addEvent]
  )

  const onCombineLog = useCallback(
    (text: string, worldX: number, worldY: number) => {
      addEvent('combine', text, '!', '#ff69b4', worldX, worldY)
    },
    [addEvent]
  )

  const { activePanel, setActivePanel } = useKeyboard({
    state,
    refreshUI,
    itemInfoRef,
    onPickup,
    onDrop,
    onDialog,
    isDraggingRef,
  })

  return (
    <>
      <GameCanvas
        state={state}
        refreshUI={refreshUI}
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        onPickup={onPickup}
        onDialog={onDialog}
        metricsRef={metricsRef}
      />
      {activePanel === 'inventory' && (
        <InventoryPanel
          state={state}
          refreshUI={refreshUI}
          itemInfoRef={itemInfoRef}
          onCombineLog={onCombineLog}
          onDropLog={onDrop}
          metricsRef={metricsRef}
          isDraggingRef={isDraggingRef}
          onClose={() => {
            setActivePanel(null)
          }}
        />
      )}
      {state.activeDialog &&
        (() => {
          const def = getCharacterDefinition(state.activeDialog.characterId)
          const line = def.dialog[state.activeDialog.lineIndex]
          const isLastLine = state.activeDialog.lineIndex >= def.dialog.length - 1
          return (
            <DialogBox
              characterName={def.name}
              portrait={def.portrait}
              line={line}
              isLastLine={isLastLine}
              onNext={() => {
                advanceDialog(state)
                refreshUI()
              }}
              onClose={() => {
                state.activeDialog = null
                refreshUI()
              }}
            />
          )
        })()}
      {activePanel === 'menu' && (
        <Menu
          onResume={() => {
            setActivePanel(null)
          }}
          onNewGame={onRestart}
        />
      )}
      <Sidebar
        state={state}
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        itemInfoRef={itemInfoRef}
        eventLog={log}
        metricsRef={metricsRef}
      />
      <PickupToasts toasts={toasts} state={state} metricsRef={metricsRef} />
    </>
  )
}
