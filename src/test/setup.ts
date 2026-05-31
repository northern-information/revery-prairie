import '@testing-library/jest-dom/vitest'

// ─── jsdom canvas 2d-context polyfill ───────────────────────────────
//
// jsdom ships `HTMLCanvasElement` but `getContext('2d')` returns `null`
// — components that draw to canvas (Minimap, time-lapse playback, the
// genesis renderer) short-circuit instead of exercising their draw
// logic during ui-project tests. This is a minimal stub that returns a
// no-op `CanvasRenderingContext2D`-shaped object so the draw code runs
// (without painting anything visible).
//
// The stub is intentionally light: tests that need to assert paint
// behavior should use `makeCanvasStub` from
// `src/engine/__tests__/canvasStub.ts`. This polyfill exists so
// components don't crash when they happen to draw at render time.
type CanvasWithStub = HTMLCanvasElement & { __stub2d?: CanvasRenderingContext2D }

if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext.bind(HTMLCanvasElement.prototype) as (
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown
  ) => RenderingContext | null

  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    options?: unknown
  ): RenderingContext | null {
    if (type === '2d') {
      // Per-canvas memoization — repeated `getContext('2d')` calls on
      // the same canvas must return the same object so style state
      // (fillStyle, globalAlpha) persists across calls.
      const canvas = this as CanvasWithStub
      const existing = canvas.__stub2d
      if (existing) return existing

      const state = {
        fillStyle: '#000',
        strokeStyle: '#000',
        globalAlpha: 1,
        lineWidth: 1,
        font: '10px sans-serif',
        textAlign: 'start' as CanvasTextAlign,
        textBaseline: 'alphabetic' as CanvasTextBaseline,
        lineDash: [] as number[],
        imageSmoothingEnabled: true,
      }
      const noop = (): void => undefined
      const ctx = {
        canvas: this,
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
        get imageSmoothingEnabled() {
          return state.imageSmoothingEnabled
        },
        set imageSmoothingEnabled(v: boolean) {
          state.imageSmoothingEnabled = v
        },
        fillRect: noop,
        fillText: noop,
        clearRect: noop,
        drawImage: noop,
        fill: noop,
        stroke: noop,
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        rect: noop,
        ellipse: noop,
        bezierCurveTo: noop,
        quadraticCurveTo: noop,
        setLineDash: (d: number[]): void => {
          state.lineDash = d
        },
        getLineDash: (): number[] => state.lineDash,
        save: noop,
        restore: noop,
        translate: noop,
        rotate: noop,
        scale: noop,
        setTransform: noop,
        resetTransform: noop,
        transform: noop,
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createPattern: () => null,
        measureText: () => ({ width: 0 }),
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' as PredefinedColorSpace }),
        putImageData: noop,
        createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' as PredefinedColorSpace }),
        clip: noop,
        isPointInPath: () => false,
        isPointInStroke: () => false,
        strokeRect: noop,
        strokeText: noop,
      }
      const canvasOut = this as CanvasWithStub
      canvasOut.__stub2d = ctx as unknown as CanvasRenderingContext2D
      return ctx as unknown as CanvasRenderingContext2D
    }
    return originalGetContext.call(this, type, options)
  } as typeof HTMLCanvasElement.prototype.getContext
}
