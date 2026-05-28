import type { Direction } from './types'

// WASD/arrow keys map to screen-axis motion. Forward projection:
//   world +x → screen (+cw, +cH/2)  (down-right)
//   world +y → screen (-cw, +cH/2)  (down-left)
// Therefore:
//   screen up    = world (-1, -1) → upLeft   (NW on original map)
//   screen down  = world (+1, +1) → downRight (SE)
//   screen left  = world (-1, +1) → downLeft (SW)
//   screen right = world (+1, -1) → upRight  (NE)
const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'upLeft',
  ArrowDown: 'downRight',
  ArrowLeft: 'downLeft',
  ArrowRight: 'upRight',
  w: 'upLeft',
  s: 'downRight',
  a: 'downLeft',
  d: 'upRight',
  W: 'upLeft',
  S: 'downRight',
  A: 'downLeft',
  D: 'upRight',
}

export const keyToDirection = (key: string): Direction | null => KEY_MAP[key] ?? null

// --- Keybinding registry (source of truth for manual + docs) ---

export interface KeyBinding {
  key: string
  action: string
  context?: string
}

export const KEYBINDINGS: KeyBinding[] = [
  { key: 'wasd', action: 'Move', context: 'Single keys move diagonally; combine for cardinals' },
  { key: 'shift', action: 'Toggle Sprint', context: 'Double movement speed' },
  { key: 'shift+click', action: 'Queue Waypoints' },
  {
    key: 'f',
    action: 'Interact / Scan',
    context: 'Tap to talk, open, break wall, clear debris; hold to scan flora / egregore / oak',
  },
  { key: 'x', action: 'Drop Item', context: 'Hovering item in backpack — sets the item down as a ground item' },
  {
    key: 'click',
    action: 'Place In Hand',
    context: 'With an item in hand, left-click a legal tile to place / set it up',
  },
  { key: 'tab', action: 'Toggle Manual' },
  { key: 'c', action: 'Toggle Divination', context: 'Overworld only, requires 3 glinting coins' },
  { key: 'esc', action: 'Close Screen / Open System' },
  { key: '1', action: 'Overlay — Default', context: 'RP-17 overlay modes' },
  { key: '2', action: 'Overlay — Family Tree', context: 'RP-17 overlay modes' },
]
