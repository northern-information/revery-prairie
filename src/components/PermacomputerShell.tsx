import { Tab } from './PanelPrimitives'

import type { PermacomputerScreen } from '@/hooks/useKeyboard'

const SCREEN_TABS: { screen: NonNullable<PermacomputerScreen>; label: string }[] = [
  { screen: 'pack', label: 'PACK' },
  { screen: 'manual', label: 'MANUAL' },
  { screen: 'reveries', label: 'REVERIES' },
  { screen: 'divination', label: 'DIVINATION' },
  { screen: 'cantos', label: 'CANTOS' },
  { screen: 'coyote', label: 'COYOTE' },
  { screen: 'system', label: 'SYS' },
]

interface PermacomputerShellProps {
  activeScreen: NonNullable<PermacomputerScreen>
  onClose: () => void
  onSwitchScreen: (screen: PermacomputerScreen) => void
  children: React.ReactNode
}

export const PermacomputerShell = ({ activeScreen, onClose, onSwitchScreen, children }: PermacomputerShellProps) => {
  const isPackScreen = activeScreen === 'pack'

  return (
    <>
      {/* Backdrop — pointer-events-none when pack is active (canvas drops need to pass through).
          bottom-52 mirrors the bottom bar's h-48 + bottom-2 in GameScreen so the minimap and event log
          stay clickable while a tab is open. */}
      <div
        data-testid="permacomputer-backdrop"
        className={`fixed inset-x-0 top-0 bottom-52 z-10 ${isPackScreen ? 'pointer-events-none' : ''}`}
        onClick={isPackScreen ? undefined : onClose}
      />

      {/* Terminal frame — right-48 matches sidebar w-48 exactly (same rem unit).
          bottom-52 mirrors the bottom bar's h-48 + bottom-2 in GameScreen. */}
      <div
        data-testid="permacomputer-shell"
        className="pointer-events-auto fixed top-0 right-48 bottom-52 z-10 flex flex-col bg-black/70 font-mono"
        style={{ width: 500 }}
        onClick={e => {
          e.stopPropagation()
        }}
      >
        {/* Tab bar — aligned with sidebar PanelTitle border */}
        <div className="border-border-dim flex items-end border-b px-2 pt-4 pb-2">
          <button
            type="button"
            className="text-permacomputer hover:text-pink px-2 py-1.5 text-xs transition-colors"
            onClick={onClose}
            title="close permacomputer"
          >
            ⚙
          </button>
          {SCREEN_TABS.map(tab => (
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
          <span className="text-permacomputer text-xs">⚙</span>
          <span className="text-permacomputer ml-2 text-xs">
            Permacomputer <span className="animate-pulse">online</span>
          </span>
        </div>
      </div>
    </>
  )
}
