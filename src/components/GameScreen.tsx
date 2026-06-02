import { useCallback, useEffect, useRef, useState } from 'react'
import { AmbientInstruments } from './AmbientInstruments'
import { BootTitleCardOverlay } from './BootTitleCardOverlay'
import { CoyoteScreen } from './CoyoteScreen'
import { DialogBox } from './DialogBox'
import { DragCursor } from './DragCursor'
import { GameCanvas } from './GameCanvas'
import { HexagramPanel } from './HexagramPanel'
import { InventoryPanel } from './InventoryPanel'
import { ItemInfo } from './ItemInfo'
import { ManualPanel } from './ManualPanel'
import { MapPanel } from './MapPanel'
import { Menu } from './Menu'
import { MeteoritePickupPrompt } from './MeteoritePickupPrompt'
import { Minimap } from './Minimap'
import { PermacomputerShell } from './PermacomputerShell'
import { PhotographAlbumPanel } from './PhotographAlbumPanel'
import { ReverySummary } from './ReverySummary'
import { ScanProgressBar } from './ScanProgressBar'
import { ScanResultModal } from './ScanResultModal'
import { TimeLapsePlayback } from './TimeLapsePlayback'

import { setAudioEnabled, stopAll } from '@/engine/audio'
import { nameToSeed } from '@/engine/genesis/shared'
import { canCast } from '@/engine/hexagram'
import { advanceDialog, getActiveDialogLines, getActiveSpeakerName } from '@/engine/interaction'
import { advanceReveryToClosing } from '@/engine/revery'
import { ReveryPhase } from '@/engine/types'
import { useGameEngine } from '@/hooks/useGameEngine'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useMusic } from '@/hooks/useMusic'
import type { DragOverlayData } from './InventoryPanel'
import type { ItemInfoHandle } from './ItemInfo'
import type { ScanCommitResult } from '@/engine/scan'
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

  // RP-4 — dismiss the Revery summary on any keypress. The Revery's
  // input lock means useKeyboard early-returns during Observing+Summary, so
  // we attach a separate listener that only fires on Summary phase. After
  // the keypress the Revery transitions to Closing → null on the next tick.
  // Reads state via a ref per CLAUDE.md convention for handlers that touch
  // the mutable singleton.
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    const handleKeydown = (): void => {
      const s = stateRef.current
      if (s.revery?.phase === ReveryPhase.Summary && s.revery.summaryReady) {
        advanceReveryToClosing(s)
        refreshUI()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [refreshUI])

  const itemInfoRef = useRef<ItemInfoHandle>(null)
  const metricsRef = useRef<CharMetrics | null>(null)
  const isDraggingRef = useRef(false)
  const dragOverlayRef = useRef<DragOverlayData | null>(null)

  useMusic(state)

  const { activeScreen, setActiveScreen } = useKeyboard({
    state,
    refreshUI,
    itemInfoRef,
    isDraggingRef,
  })

  // RP-6/#8a — scan-result modal. Populated when the game loop
  // fires onScanComplete; cleared when the player dismisses the modal.
  // Holds the full discriminated result so the modal can render the
  // right heading + gel variant. Doctrine: every scan kind opens this
  // modal — no subject (flora, oak, egregore, future) bypasses it. The
  // ceremony is the universal reward for the hold-to-scan core loop.
  const [scanResult, setScanResult] = useState<ScanCommitResult | null>(null)
  const onScanComplete = useCallback(
    (result: ScanCommitResult) => {
      setScanResult(result)
      setActiveScreen('scan-result')
    },
    [setActiveScreen]
  )

  return (
    <>
      <GameCanvas
        state={state}
        refreshUI={refreshUI}
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        onScanComplete={onScanComplete}
        metricsRef={metricsRef}
      />
      {activeScreen === 'scan-result' && scanResult && (
        <ScanResultModal
          result={scanResult}
          onDismiss={() => {
            setActiveScreen(null)
            setScanResult(null)
          }}
        />
      )}
      {state.playbackCameraUid !== null &&
        (() => {
          const uid = state.playbackCameraUid
          const placedCameraIndex = state.placedCameras.findIndex(c => c.uid === uid)
          const placed = placedCameraIndex >= 0 ? state.placedCameras[placedCameraIndex] : undefined
          const archive = state.cameraArchive.get(uid) ?? []
          const frames = [...archive, ...(placed?.frames ?? [])]
          if (frames.length === 0) {
            // Reset and skip mount — no frames to show.
            state.playbackCameraUid = null
            return null
          }
          // RP-24 — seed pieces only matter when the playback target is
          // a predecessor camera; passing them on every playback is
          // harmless and lets the modal decide via its own predecessor
          // guard.
          const genesisSeed = nameToSeed(state.stewardName)
          return (
            <TimeLapsePlayback
              cameraUid={uid}
              frames={frames}
              placedCamera={placed}
              genesisSeed={genesisSeed}
              placedCameraIndex={placedCameraIndex >= 0 ? placedCameraIndex : undefined}
              filmRemaining={state.cameraFilm.get(uid) ?? 0}
              onDismiss={() => {
                // Precis #23 v9 R3 — auto-unload. Migrate the
                // playback queue into the album, clear the camera's
                // live buffer and the archive entry. Frames flow
                // one way: camera → album.
                state.photographAlbum.push(...frames)
                if (placed) placed.frames = []
                state.cameraArchive.delete(uid)
                state.playbackCameraUid = null
                refreshUI()
              }}
            />
          )
        })()}
      <ReverySummary revery={state.revery} state={state} />
      {activeScreen && activeScreen !== 'scan-result' && (
        <PermacomputerShell
          state={state}
          activeScreen={activeScreen}
          onClose={() => {
            setActiveScreen(null)
          }}
          onSwitchScreen={setActiveScreen}
        >
          {activeScreen === 'manual' && <ManualPanel state={state} />}
          {activeScreen === 'map' && <MapPanel state={state} />}
          {activeScreen === 'divination' && (
            <HexagramPanel
              state={state}
              onClose={() => {
                setActiveScreen(null)
              }}
              refreshUI={refreshUI}
              initialView={canCast(state) ? 'casting' : 'compendium'}
            />
          )}
          {activeScreen === 'coyote' && <CoyoteScreen state={state} refreshUI={refreshUI} />}
          {activeScreen === 'album' && <PhotographAlbumPanel state={state} />}
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
              audioEnabled={state.audioEnabled}
              onToggleAudio={() => {
                state.audioEnabled = !state.audioEnabled
                setAudioEnabled(state.audioEnabled)
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
          const speakerName = getActiveSpeakerName(state) ?? ''
          const dialogLines = getActiveDialogLines(state)
          const line = state.activeDialog.transitioning ? '' : dialogLines[state.activeDialog.lineIndex]
          const isLastLine = state.activeDialog.lineIndex >= dialogLines.length - 1

          return (
            <DialogBox
              characterName={speakerName}
              line={line}
              typingIndex={state.activeDialog.typingIndex}
              typingDone={state.activeDialog.typingDone}
              isLastLine={isLastLine}
              onAdvance={() => {
                advanceDialog(state, performance.now())
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
      <BootTitleCardOverlay state={state} />
      <ScanProgressBar state={state} activeScreen={activeScreen} />
      <MeteoritePickupPrompt state={state} />
      {!state.genesis && (
        <div
          data-panel="bottom-bar"
          className="pointer-events-none fixed inset-x-2 bottom-2 z-10 flex h-48 items-center justify-between gap-2 bg-black/70 p-2"
        >
          <div className="pointer-events-auto">
            <Minimap state={state} />
          </div>
          <div className="pointer-events-auto flex-1">
            <AmbientInstruments state={state} />
          </div>
          <div
            data-panel="item-info"
            className="pointer-events-auto h-full w-48 self-stretch overflow-hidden font-mono text-xs"
          >
            <ItemInfo
              ref={itemInfoRef}
              glintingCoins={state.glintingCoins}
              cameraFilm={state.cameraFilm}
              itemWear={state.itemWear}
            />
          </div>
          <div className="pointer-events-auto self-start">
            <InventoryPanel
              state={state}
              refreshUI={refreshUI}
              itemInfoRef={itemInfoRef}
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
