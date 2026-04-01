import { useCallback, useRef } from 'react'
import { DIALOG_HEIGHT, DIALOG_WIDTH, DialogBox } from './DialogBox'
import { GameCanvas } from './GameCanvas'
import { InventoryPanel } from './InventoryPanel'
import { ManualPanel } from './ManualPanel'
import { Menu } from './Menu'
import { PickupToasts } from './PickupToasts'
import { Sidebar } from './Sidebar'

import { setMusicEnabled, stopAll } from '@/engine/audio'
import { getCharacterDefinition } from '@/engine/characters'
import { ComponentType } from '@/engine/ecs/types'
import { advanceDialog } from '@/engine/interaction'
import { getDefinition } from '@/engine/items'
import { useEventLog } from '@/hooks/useEventLog'
import { useGameEngine } from '@/hooks/useGameEngine'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useMusic } from '@/hooks/useMusic'
import type { ItemInfoHandle } from './ItemInfo'
import type { CharMetrics } from '@/engine/types'

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

  const onDiscovery = useCallback(
    (text: string, worldX: number, worldY: number, icon?: string, iconColor?: string) => {
      addEvent('discovery', text, icon ?? '!', iconColor ?? '#ff69b4', worldX, worldY)
    },
    [addEvent]
  )

  const onGift = useCallback(
    (text: string, icon: string, iconColor: string, worldX: number, worldY: number) => {
      addEvent('pickup', text, icon, iconColor, worldX, worldY)
    },
    [addEvent]
  )

  useMusic(state)

  const { activePanel, setActivePanel } = useKeyboard({
    state,
    refreshUI,
    itemInfoRef,
    onPickup,
    onDrop,
    onDialog,
    onDiscovery,
    onGift,
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
        onDiscovery={onDiscovery}
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
          const line = state.activeDialog.transitioning ? '' : def.dialog[state.activeDialog.lineIndex]
          const isLastLine = state.activeDialog.lineIndex >= def.dialog.length - 1

          const dialog = state.activeDialog
          // Find the character entity's position for dialog box placement
          const charPos = (() => {
            for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
              if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== state.currentZone) continue
              const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
              if (identity?.definitionId === dialog.characterId) {
                return state.world.getComponent(eid, ComponentType.Position)
              }
            }
            return null
          })()
          const metrics = metricsRef.current
          const GAP = 12
          const EDGE = 8

          let dTop: number
          let dLeft: number

          if (charPos && metrics) {
            const sx = (charPos.x - state.camera.x) * metrics.charWidth
            const sy = (charPos.y - state.camera.y) * metrics.charHeight

            dTop = sy - DIALOG_HEIGHT - GAP
            dLeft = sx + metrics.charWidth / 2 - DIALOG_WIDTH / 2

            if (dTop < EDGE) {
              dTop = sy + metrics.charHeight + GAP
            }

            dLeft = Math.max(EDGE, Math.min(dLeft, window.innerWidth - DIALOG_WIDTH - EDGE))
            dTop = Math.max(EDGE, Math.min(dTop, window.innerHeight - DIALOG_HEIGHT - EDGE))
          } else {
            dTop = (window.innerHeight - DIALOG_HEIGHT) / 2
            dLeft = (window.innerWidth - DIALOG_WIDTH) / 2
          }

          return (
            <DialogBox
              characterName={def.name}
              portrait={def.portrait}
              line={line}
              typingIndex={state.activeDialog.typingIndex}
              typingDone={state.activeDialog.typingDone}
              isLastLine={isLastLine}
              top={dTop}
              left={dLeft}
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
      {activePanel === 'manual' && (
        <ManualPanel
          state={state}
          onClose={() => {
            setActivePanel(null)
          }}
        />
      )}
      {activePanel === 'menu' && (
        <Menu
          onResume={() => {
            setActivePanel(null)
          }}
          onNewGame={() => {
            stopAll()
            onRestart()
          }}
          metric={state.metric}
          onToggleUnits={() => {
            state.metric = !state.metric
            refreshUI()
          }}
          musicEnabled={state.musicEnabled}
          onToggleMusic={() => {
            state.musicEnabled = !state.musicEnabled
            setMusicEnabled(state.musicEnabled)
            refreshUI()
          }}
        />
      )}
      <Sidebar
        state={state}
        activePanel={activePanel}
        itemInfoRef={itemInfoRef}
        eventLog={log}
        metricsRef={metricsRef}
      />
      <PickupToasts toasts={toasts} state={state} metricsRef={metricsRef} />
    </>
  )
}
