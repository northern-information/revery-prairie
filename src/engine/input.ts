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
  { key: 'wasd', action: 'move', context: 'works with pack open' },
  { key: 'e', action: 'interact', context: 'talk, pick up, open, break wall' },
  { key: 'f', action: 'harvest', context: 'facing clover tile' },
  { key: 'r', action: 'rotate / reveries', context: 'rotate hovered item in pack, otherwise toggle reveries screen' },
  { key: 'x', action: 'drop item', context: 'pack open, hovering item' },
  { key: '1-4', action: 'cast revery', context: 'hold to preview, release to cast at facing tile' },
  { key: 'tab', action: 'toggle pack' },
  { key: 'q', action: 'toggle manual' },
  { key: 'c', action: 'toggle divination', context: 'overworld only, requires coins' },
  { key: 'esc', action: 'close screen / open system' },
  { key: 'shift', action: 'toggle sprint', context: 'double movement speed' },
  { key: 'shift+click', action: 'queue waypoints' },
]
