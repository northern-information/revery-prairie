import { useCallback, useEffect, useRef } from 'react'
import { BootTitleCardOverlay } from './BootTitleCardOverlay'
import { CantosScreen } from './CantosScreen'
import { CoyoteScreen } from './CoyoteScreen'
import { DevPanel } from './DevPanel'
import { DialogBox } from './DialogBox'
import { DragCursor } from './DragCursor'
import { EventLog } from './EventLog'
import { GameCanvas } from './GameCanvas'
import { GenesisBottomBar } from './GenesisBottomBar'
import { ScanProgressBar } from './ScanProgressBar'
import { HexagramPanel } from './HexagramPanel'
import { InventoryPanel } from './InventoryPanel'
import { ItemInfo } from './ItemInfo'
import { ManualPanel } from './ManualPanel'
import { Menu } from './Menu'
import { Minimap } from './Minimap'
import { PermacomputerShell } from './PermacomputerShell'

import { setMusicEnabled, stopAll } from '@/engine/audio'
import { getCharacterDefinition, getCharacterDialog } from '@/engine/characters'
import { COIN_GLINTING_COLOR } from '@/engine/constants'
import { canCast } from '@/engine/hexagram'
import { advanceDialog } from '@/engine/interaction'
import { getDefinition } from '@/engine/items'
import { useEventLog } from '@/hooks/useEventLog'
import { useGameEngine } from '@/hooks/useGameEngine'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useMusic } from '@/hooks/useMusic'
import type { DragOverlayData } from './InventoryPanel'
import type { ItemInfoHandle } from './ItemInfo'
import type { CharMetrics } from '@/engine/types'
import type { MultiplayerHookArgs } from '@/hooks/useGameEngine'

interface GameScreenProps {
  stewardName: string
  skipGenesis?: boolean
  onRestart: () => void
  multiplayer?: MultiplayerHookArgs
}

export const GameScreen = ({ stewardName, skipGenesis, onRestart, multiplayer }: GameScreenProps) => {
  // uiVersion is destructured to subscribe GameScreen to the useState counter.
  // refreshUI() increments it, triggering re-renders when engine state mutates.
  const { state, refreshUI, uiVersion } = useGameEngine(stewardName, 80, 40, skipGenesis, multiplayer)
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
  const { log, addEvent } = useEventLog()

  const onPickup = useCallback(
    (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => {
      addEvent('pickup', `Picked up ${name}.`, icon, iconColor, worldX, worldY)
    },
    [addEvent]
  )

  const onDrop = useCallback(
    (definitionId: string, worldX: number, worldY: number) => {
      const def = getDefinition(definitionId)
      addEvent('drop', `Dropped ${def.name}.`, def.glyph, def.glyphColor, worldX, worldY)
    },
    [addEvent]
  )

  const onDialog = useCallback(
    (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => {
      addEvent('dialog', `Talked to ${characterName}.`, glyph, glyphColor, worldX, worldY)
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

  // Wire genesis narration into the event log. Assigned during render so
  // it lands on state before useGameEngine's layout effect (which may
  // synchronously call completeGenesis on URL-skip) fires.
  state.onGenesisEpochStart = (commentary: string) => {
    addEvent('narration', commentary, '·', '#8b8b8b', state.player.x, state.player.y)
  }

  useMusic(state)

  const { activeScreen, setActiveScreen } = useKeyboard({
    state,
    refreshUI,
    itemInfoRef,
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
          state={state}
          activeScreen={activeScreen}
          onClose={() => {
            setActiveScreen(null)
          }}
          onSwitchScreen={setActiveScreen}
        >
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
              autoHidePanels={state.autoHidePanels}
              onToggleAutoHidePanels={() => {
                state.autoHidePanels = !state.autoHidePanels
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
                    `Received ${result.gift.name}.`,
                    result.gift.glyphs[0],
                    result.gift.glyphColor,
                    state.player.x,
                    state.player.y
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
          viewportWidth={state.viewportWidth}
          viewportHeight={state.viewportHeight}
        />
      )}
      {import.meta.env.DEV && state.devPanelOpen && (
        <DevPanel state={state} refreshUI={refreshUI} metricsRef={metricsRef} />
      )}
      <BootTitleCardOverlay state={state} />
      <ScanProgressBar state={state} />
      {state.genesis ? (
        <GenesisBottomBar state={state} />
      ) : (
        <div
          data-panel="bottom-bar"
          className="pointer-events-none fixed inset-x-2 bottom-2 z-10 flex h-48 items-center justify-between gap-2 bg-black/70 p-2"
        >
          <div className="pointer-events-auto">
            <Minimap state={state} />
          </div>
          <div className="pointer-events-auto flex-1">
            <EventLog state={state} eventLog={log} />
          </div>
          <div
            data-panel="item-info"
            className="pointer-events-auto h-full w-48 self-stretch overflow-hidden font-mono text-xs"
          >
            <ItemInfo ref={itemInfoRef} glintingCoins={state.glintingCoins} />
          </div>
          <div className="pointer-events-auto">
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
          </div>
        </div>
      )}
    </>
  )
}
