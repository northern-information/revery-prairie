import type { Direction } from './types'

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

export const keyToDirection = (key: string): Direction | null => KEY_MAP[key] ?? null

// --- Keybinding registry (source of truth for manual + docs) ---

export interface KeyBinding {
  key: string
  action: string
  context?: string
}

export const KEYBINDINGS: KeyBinding[] = [
  { key: 'wasd', action: 'move', context: 'works with inventory open' },
  { key: 'e', action: 'interact', context: 'talk, pick up, open, break wall' },
  { key: 'r', action: 'rotate item', context: 'inventory open, hovering item' },
  { key: 'x', action: 'drop item', context: 'inventory open, hovering item' },
  { key: 'tab', action: 'toggle inventory' },
  { key: 'q', action: 'toggle manual' },
  { key: 'esc', action: 'close panel / open menu' },
  { key: 'shift', action: 'toggle sprint', context: 'double movement speed' },
  { key: 'shift+click', action: 'queue waypoints' },
]
