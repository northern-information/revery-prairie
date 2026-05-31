import { vi } from 'vitest'

import type { Mock } from 'vitest'

/**
 * Recording stub for `CanvasRenderingContext2D`, sufficient for the
 * render-pass tests. Each method is a `vi.fn()`; mutable properties
 * (`fillStyle`, `strokeStyle`, `globalAlpha`, etc.) are real fields
 * the passes can read back.
 *
 * Returns the stub plus a `calls()` helper that snapshots every
 * recorded fillRect / fillText / drawImage / stroke / fill call so a
 * test can assert "the pass drew at all", "the pass set this alpha
 * before drawing", etc.
 */
export interface CanvasStub {
  ctx: CanvasRenderingContext2D
  // Quick boolean assertions that the pass touched the canvas at all.
  drewAnything: () => boolean
  // Snapshot of every paint call with its style-state at draw time.
  paintSnapshots: PaintSnapshot[]
  // Direct access to the mocks for fine-grained assertions.
  mocks: CanvasMocks
}

export interface PaintSnapshot {
  op: 'fillRect' | 'fillText' | 'drawImage' | 'fill' | 'stroke' | 'clearRect'
  fillStyle: string
  strokeStyle: string
  globalAlpha: number
  args: readonly unknown[]
}

interface CanvasMocks {
  fillRect: Mock
  fillText: Mock
  strokeRect: Mock
  strokeText: Mock
  clearRect: Mock
  drawImage: Mock
  fill: Mock
  stroke: Mock
  beginPath: Mock
  closePath: Mock
  moveTo: Mock
  lineTo: Mock
  arc: Mock
  rect: Mock
  ellipse: Mock
  bezierCurveTo: Mock
  quadraticCurveTo: Mock
  setLineDash: Mock
  getLineDash: Mock
  save: Mock
  restore: Mock
  translate: Mock
  rotate: Mock
  scale: Mock
  setTransform: Mock
  resetTransform: Mock
  transform: Mock
  clip: Mock
  createLinearGradient: Mock
  createRadialGradient: Mock
  createPattern: Mock
  measureText: Mock
  getImageData: Mock
  putImageData: Mock
  createImageData: Mock
  isPointInPath: Mock
  isPointInStroke: Mock
}

export const makeCanvasStub = (): CanvasStub => {
  const state = {
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    lineDash: [] as number[],
  }
  const paintSnapshots: PaintSnapshot[] = []
  const snap = (op: PaintSnapshot['op'], args: readonly unknown[]): void => {
    paintSnapshots.push({
      op,
      fillStyle: state.fillStyle,
      strokeStyle: state.strokeStyle,
      globalAlpha: state.globalAlpha,
      args,
    })
  }

  const mocks: CanvasMocks = {
    fillRect: vi.fn((...a: unknown[]) => { snap('fillRect', a); }),
    fillText: vi.fn((...a: unknown[]) => { snap('fillText', a); }),
    strokeRect: vi.fn(),
    strokeText: vi.fn(),
    clearRect: vi.fn((...a: unknown[]) => { snap('clearRect', a); }),
    drawImage: vi.fn((...a: unknown[]) => { snap('drawImage', a); }),
    fill: vi.fn((...a: unknown[]) => { snap('fill', a); }),
    stroke: vi.fn((...a: unknown[]) => { snap('stroke', a); }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    setLineDash: vi.fn((d: number[]) => {
      state.lineDash = d
    }),
    getLineDash: vi.fn(() => state.lineDash),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    transform: vi.fn(),
    clip: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(() => null),
    measureText: vi.fn(() => ({ width: 0 })),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' as PredefinedColorSpace })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' as PredefinedColorSpace })),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),
  }

  const ctx = {
    ...mocks,
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(v: string) {
      state.fillStyle = v
    },
    get strokeStyle() {
      return state.strokeStyle
    },
    set strokeStyle(v: string) {
      state.strokeStyle = v
    },
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v
    },
    get lineWidth() {
      return state.lineWidth
    },
    set lineWidth(v: number) {
      state.lineWidth = v
    },
    get font() {
      return state.font
    },
    set font(v: string) {
      state.font = v
    },
    get textAlign() {
      return state.textAlign
    },
    set textAlign(v: CanvasTextAlign) {
      state.textAlign = v
    },
    get textBaseline() {
      return state.textBaseline
    },
    set textBaseline(v: CanvasTextBaseline) {
      state.textBaseline = v
    },
  } as unknown as CanvasRenderingContext2D

  const drewAnything = (): boolean => paintSnapshots.length > 0

  return { ctx, drewAnything, paintSnapshots, mocks }
}

/**
 * Shorthand metrics used by render-pass `draw` calls in tests. Matches
 * what `useGameEngine` passes at runtime (10px wide, 16px tall, monospace).
 */
export const TEST_CHAR_METRICS = {
  charWidth: 10,
  charHeight: 16,
  font: '16px monospace',
} as const
