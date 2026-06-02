import { Tab } from './PanelPrimitives'

import { canCast } from '@/engine/hexagram'
import type { GameState } from '@/engine/types'
import type { PermacomputerScreen } from '@/hooks/useKeyboard'

type TabScreen = NonNullable<PermacomputerScreen>

const SCREEN_TABS: { screen: TabScreen; label: string; isVisible: (state: GameState) => boolean }[] = [
  { screen: 'manual', label: 'MANUAL', isVisible: () => true },
  // RP-70 — the inherited prairie map. Appears once the steward has
  // found the map in the Knot cellar (a one-way gate, append-only like
  // COYOTE). Sits right after MANUAL as the second reference surface.
  { screen: 'map', label: 'MAP', isVisible: state => state.manualDiscoveries.has('item:map') },
  { screen: 'divination', label: 'DIVINATION', isVisible: state => canCast(state) },
  {
    screen: 'coyote',
    label: 'COYOTE',
    isVisible: state => state.manualDiscoveries.has('event:rescue-coyote'),
  },
  // Precis #53 — Album appears once the steward has at least one
  // developed photograph in state.photographAlbum. Empty-state hint
  // renders inside the panel if the tab is opened with zero entries
  // (forward-compatible if visibility is forced elsewhere), but the
  // tab itself only surfaces after the first roll is developed.
  {
    screen: 'album',
    label: 'ALBUM',
    isVisible: state => state.photographAlbum.length > 0,
  },
  { screen: 'system', label: 'SYS', isVisible: () => true },
]

interface PermacomputerShellProps {
  state: GameState
  activeScreen: NonNullable<PermacomputerScreen>
  onClose: () => void
  onSwitchScreen: (screen: PermacomputerScreen) => void
  children: React.ReactNode
}

export const PermacomputerShell = ({
  state,
  activeScreen,
  onClose,
  onSwitchScreen,
  children,
}: PermacomputerShellProps) => {
  const visibleTabs = SCREEN_TABS.filter(tab => tab.isVisible(state))

  return (
    <>
      {/* Backdrop — bottom-52 mirrors the bottom bar's h-48 + bottom-2 in
          GameScreen so the minimap, event log, and backpack stay clickable
          while a tab is open. */}
      <div data-testid="permacomputer-backdrop" className="fixed inset-x-0 top-0 bottom-52 z-10" onClick={onClose} />

      {/* Terminal frame — flush against the right edge.
          bottom-52 mirrors the bottom bar's h-48 + bottom-2 in GameScreen. */}
      <div
        data-testid="permacomputer-shell"
        className="pointer-events-auto fixed top-0 right-0 bottom-52 z-10 flex flex-col bg-black/70 font-mono"
        style={{ width: 500 }}
        onClick={e => {
          e.stopPropagation()
        }}
      >
        {/* Tab bar — aligned with the panel header border. The permacomputer
            closes via Escape, Tab, or a backdrop click; there is no visible
            close button by design. */}
        <div className="border-border-dim flex items-end border-b px-2 pt-4 pb-2">
          {visibleTabs.map(tab => (
            <Tab
              key={tab.screen}
              active={activeScreen === tab.screen}
              data-testid={`tab-${tab.screen}`}
              onClick={() => {
                onSwitchScreen(tab.screen)
              }}
            >
              {tab.label}
            </Tab>
          ))}
        </div>

        {/* Content area */}
        <div className="scrollbar-custom min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {/* Status footer */}
        <div className="border-border-dim flex items-center border-t px-4 py-2">
          <span className="text-permacomputer text-xs">
            Permacomputer <span className="animate-pulse">online</span>
          </span>
        </div>
      </div>
    </>
  )
}
