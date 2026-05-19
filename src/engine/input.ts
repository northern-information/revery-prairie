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
  { key: 'f', action: 'Interact', context: 'Talk, pick up, open, break wall' },
  { key: 'x', action: 'Drop Item', context: 'Pack open, hovering item' },
  { key: 'tab', action: 'Toggle Pack' },
  { key: 'q', action: 'Toggle Manual' },
  { key: 'c', action: 'Toggle Divination', context: 'Overworld only, requires coins' },
  { key: 'esc', action: 'Close Screen / Open System' },
  { key: 'shift', action: 'Toggle Sprint', context: 'Double movement speed' },
  { key: 'shift+click', action: 'Queue Waypoints' },
]
