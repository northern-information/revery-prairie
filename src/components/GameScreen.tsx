import { useCallback, useEffect, useRef } from 'react'
import { ActionBar } from './ActionBar'
import { CantosScreen } from './CantosScreen'
import { CoyoteScreen } from './CoyoteScreen'
import { DialogBox } from './DialogBox'
import { DevPanel } from './DevPanel'
import { DragCursor } from './DragCursor'
import { GameCanvas } from './GameCanvas'
import { HexagramPanel } from './HexagramPanel'
import { InventoryPanel } from './InventoryPanel'
import { ManualPanel } from './ManualPanel'
import { Menu } from './Menu'
import { PermacomputerShell } from './PermacomputerShell'
import { PickupToasts } from './PickupToasts'
import { ReveriesPanel } from './ReveriesPanel'
import { Sidebar } from './Sidebar'

import { setMusicEnabled, stopAll } from '@/engine/audio'
import { getCharacterDefinition, getCharacterDialog } from '@/engine/characters'
import { advanceDialog } from '@/engine/interaction'
import {
  COIN_GLINTING_COLOR,
  GENESIS_TRANSITION_ACTION_BAR_DELAY_MS,
  GENESIS_TRANSITION_ACTION_BAR_DURATION_MS,
} from '@/engine/constants'
import { isDeepTimeLocked } from '@/engine/deepTime'
import { canCast } from '@/engine/hexagram'
import { getDefinition } from '@/engine/items'
import { useEventLog } from '@/hooks/useEventLog'
import { useGameEngine } from '@/hooks/useGameEngine'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useMusic } from '@/hooks/useMusic'
import type { DragOverlayData } from './InventoryPanel'
import type { ItemInfoHandle } from './ItemInfo'
import type { CharMetrics } from '@/engine/types'

interface GameScreenProps {
  stewardName: string
  skipGenesis?: boolean
  onRestart: () => void
}

export const GameScreen = ({ stewardName, skipGenesis, onRestart }: GameScreenProps) => {
  // uiVersion is destructured to subscribe GameScreen to the useState counter.
  // refreshUI() increments it, triggering re-renders when engine state mutates.
  const { state, refreshUI, uiVersion } = useGameEngine(stewardName, 80, 40, skipGenesis)
  void uiVersion

  // Apply font scale on mount
  const fontScale = state.fontScale
  useEffect(() => {
    document.documentElement.style.fontSize = `${String(fontScale * 100)}%`
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [fontScale])

  const itemInfoRef = useRef<ItemInfoHandle>(null)
  const metricsRef = useRef<CharMetrics | null>(null)
  const isDraggingRef = useRef(false)
  const dragOverlayRef = useRef<DragOverlayData | null>(null)
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

  const { activeScreen, setActiveScreen } = useKeyboard({
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
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        onPickup={onPickup}
        onDialog={onDialog}
        onDiscovery={onDiscovery}
        onGift={onGift}
        metricsRef={metricsRef}
      />
      {activeScreen && (
        <PermacomputerShell
          activeScreen={activeScreen}
          onClose={() => {
            setActiveScreen(null)
          }}
          onSwitchScreen={setActiveScreen}
        >
          {activeScreen === 'pack' && (
            <InventoryPanel
              state={state}
              refreshUI={refreshUI}
              itemInfoRef={itemInfoRef}
              onCombineLog={onCombineLog}
              onDropLog={onDrop}
              metricsRef={metricsRef}
              isDraggingRef={isDraggingRef}
              dragOverlayRef={dragOverlayRef}
            />
          )}
          {activeScreen === 'manual' && <ManualPanel state={state} />}
          {activeScreen === 'divination' && (
            <HexagramPanel
              state={state}
              onClose={() => {
                setActiveScreen(null)
              }}
              refreshUI={refreshUI}
              onCastLog={(text, worldX, worldY) => {
                addEvent('discovery', text, '¤', COIN_GLINTING_COLOR, worldX, worldY)
              }}
              initialView={canCast(state) ? 'casting' : 'compendium'}
            />
          )}
          {activeScreen === 'reveries' && <ReveriesPanel state={state} refreshUI={refreshUI} />}
          {activeScreen === 'cantos' && <CantosScreen cantos={state.angelCantos} />}
          {activeScreen === 'coyote' && <CoyoteScreen state={state} refreshUI={refreshUI} />}
          {activeScreen === 'system' && (
            <Menu
              onResume={() => {
                setActiveScreen(null)
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
              fontScale={state.fontScale}
              onCycleFontScale={() => {
                const scales = [1, 1.25, 1.5]
                const idx = scales.indexOf(state.fontScale)
                state.fontScale = scales[(idx + 1) % scales.length]
                document.documentElement.style.fontSize = `${String(state.fontScale * 100)}%`
                refreshUI()
              }}
            />
          )}
        </PermacomputerShell>
      )}
      {state.activeDialog &&
        (() => {
          const def = getCharacterDefinition(state.activeDialog.characterId)
          const dialogLines = getCharacterDialog(state, state.activeDialog.characterId)
          const line = state.activeDialog.transitioning ? '' : dialogLines[state.activeDialog.lineIndex]
          const isLastLine = state.activeDialog.lineIndex >= dialogLines.length - 1

          return (
            <DialogBox
              characterName={def.name}
              portrait={def.portrait}
              line={line}
              typingIndex={state.activeDialog.typingIndex}
              typingDone={state.activeDialog.typingDone}
              isAngel={state.activeDialog.characterId.startsWith('angel-')}
              isLastLine={isLastLine}
              onAdvance={() => {
                const result = advanceDialog(state, performance.now())
                if (result.gift) {
                  onGift(
                    `received ${result.gift.name.toLowerCase()}`,
                    result.gift.glyphs[0],
                    result.gift.glyphColor,
                    state.player.x,
                    state.player.y,
                  )
                }
                refreshUI()
              }}
            />
          )
        })()}
      {dragOverlayRef.current && (
        <DragCursor
          dragState={dragOverlayRef.current.dragState}
          cursorPos={dragOverlayRef.current.cursorPos}
          cursorTarget={dragOverlayRef.current.cursorTarget}
          canvasRect={dragOverlayRef.current.canvasRect}
          metricsRef={metricsRef}
        />
      )}
      {!state.genesis && (
        <div
          style={
            state.genesisTransition
              ? {
                  opacity: 0,
                  animation: `fade-in ${String(GENESIS_TRANSITION_ACTION_BAR_DURATION_MS)}ms ease-in ${String(GENESIS_TRANSITION_ACTION_BAR_DELAY_MS)}ms forwards`,
                }
              : isDeepTimeLocked(state)
                ? { opacity: 0, transition: 'opacity 500ms ease-out', pointerEvents: 'none' as const }
                : undefined
          }
        >
          <ActionBar
            state={state}
            refreshUI={refreshUI}
            dragState={dragOverlayRef.current?.dragState ?? null}
            onSetActionBarTarget={() => {
              // Handled via drag system — placeholder for now
            }}
          />
        </div>
      )}
      {import.meta.env.DEV && state.devPanelOpen && (
        <DevPanel state={state} refreshUI={refreshUI} metricsRef={metricsRef} />
      )}
      <Sidebar
        state={state}
        activeScreen={activeScreen}
        itemInfoRef={itemInfoRef}
        eventLog={log}
        metricsRef={metricsRef}
        refreshUI={refreshUI}
      />
      <PickupToasts toasts={toasts} state={state} metricsRef={metricsRef} />
    </>
  )
}
