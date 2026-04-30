import { describe, expect, it, vi } from 'vitest'

import { drawCellBackground, screenToTile, viewportToScreen, worldToScreen } from '../projection'

const charWidth = 10
const charHeight = 16
const viewportWidth = 60
const viewportHeight = 30

describe('viewportToScreen (orthogonal)', () => {
  it('places (0,0) at origin', () => {
    expect(viewportToScreen(0, 0, charWidth, charHeight, false, viewportWidth, viewportHeight)).toEqual({ px: 0, py: 0 })
  })

  it('places (vx, vy) at (vx*charWidth, vy*charHeight)', () => {
    expect(viewportToScreen(3, 5, charWidth, charHeight, false, viewportWidth, viewportHeight)).toEqual({
      px: 30,
      py: 80,
    })
  })

  it('matches the legacy inline math the renderer used to do', () => {
    for (let vy = 0; vy < 5; vy++) {
      for (let vx = 0; vx < 5; vx++) {
        expect(viewportToScreen(vx, vy, charWidth, charHeight, false, viewportWidth, viewportHeight)).toEqual({
          px: vx * charWidth,
          py: vy * charHeight,
        })
      }
    }
  })
})

describe('viewportToScreen (isometric)', () => {
  it('center viewport tile glyph anchor lands at canvas center +nudge', () => {
    // canvas center: (viewportWidth*charWidth/2, viewportHeight*charHeight/2)
    // glyph anchor adds vertical nudge (charHeight/4) so the glyph sits
    // in the diamond's middle band rather than its top.
    const expectedPx = (viewportWidth * charWidth) / 2
    const expectedPy = (viewportHeight * charHeight) / 2 + charHeight / 4
    expect(
      viewportToScreen(
        viewportWidth / 2,
        viewportHeight / 2,
        charWidth,
        charHeight,
        true,
        viewportWidth,
        viewportHeight,
      ),
    ).toEqual({
      px: expectedPx,
      py: expectedPy,
    })
  })

  it('moves +x by (charWidth, charHeight/2) per tile', () => {
    const a = viewportToScreen(0, 0, charWidth, charHeight, true, viewportWidth, viewportHeight)
    const b = viewportToScreen(1, 0, charWidth, charHeight, true, viewportWidth, viewportHeight)
    expect(b.px - a.px).toBe(charWidth)
    expect(b.py - a.py).toBe(charHeight / 2)
  })

  it('moves +y by (-charWidth, charHeight/2) per tile', () => {
    const a = viewportToScreen(0, 0, charWidth, charHeight, true, viewportWidth, viewportHeight)
    const b = viewportToScreen(0, 1, charWidth, charHeight, true, viewportWidth, viewportHeight)
    expect(b.px - a.px).toBe(-charWidth)
    expect(b.py - a.py).toBe(charHeight / 2)
  })

  it('lays adjacent tiles in a 2:1 diamond grid (diagonal neighbors)', () => {
    // (0,0) and (1,1) should be one full diamond row apart vertically (same x)
    const a = viewportToScreen(0, 0, charWidth, charHeight, true, viewportWidth, viewportHeight)
    const b = viewportToScreen(1, 1, charWidth, charHeight, true, viewportWidth, viewportHeight)
    expect(b.px).toBe(a.px)
    expect(b.py - a.py).toBe(charHeight)
  })
})

describe('worldToScreen', () => {
  it('subtracts camera before projecting (orthogonal)', () => {
    const camera = { x: 5, y: 7 }
    expect(worldToScreen(8, 10, camera, charWidth, charHeight, false, viewportWidth, viewportHeight)).toEqual({
      px: 30,
      py: 48,
    })
  })

  it('subtracts camera before projecting (isometric)', () => {
    const camera = { x: 5, y: 7 }
    const expected = viewportToScreen(3, 3, charWidth, charHeight, true, viewportWidth, viewportHeight)
    expect(worldToScreen(8, 10, camera, charWidth, charHeight, true, viewportWidth, viewportHeight)).toEqual(expected)
  })

  it('handles fractional world coords (ECS lerp)', () => {
    const camera = { x: 0, y: 0 }
    const a = worldToScreen(2.5, 3.0, camera, charWidth, charHeight, false, viewportWidth, viewportHeight)
    expect(a.px).toBe(25)
    expect(a.py).toBe(48)
  })
})

describe('screenToTile round-trip with viewportToScreen', () => {
  const camera = { x: 4, y: 9 }

  it('orthogonal: every tile maps to itself when sampling its top-left', () => {
    for (let vy = 0; vy < 5; vy++) {
      for (let vx = 0; vx < 5; vx++) {
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, false, viewportWidth, viewportHeight)
        expect(screenToTile(px, py, camera, charWidth, charHeight, false, viewportWidth, viewportHeight)).toEqual({
          x: camera.x + vx,
          y: camera.y + vy,
        })
      }
    }
  })

  it('isometric: sampling near a tile center recovers the tile', () => {
    for (let vy = 0; vy < 5; vy++) {
      for (let vx = 0; vx < 5; vx++) {
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, true, viewportWidth, viewportHeight)
        const sampleX = px + 0.1
        const sampleY = py + charHeight / 2 + 0.1
        expect(
          screenToTile(sampleX, sampleY, camera, charWidth, charHeight, true, viewportWidth, viewportHeight),
        ).toEqual({
          x: camera.x + vx,
          y: camera.y + vy,
        })
      }
    }
  })
})

describe('drawCellBackground', () => {
  const makeCtx = () => {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D & {
      fillRect: ReturnType<typeof vi.fn>
      beginPath: ReturnType<typeof vi.fn>
      moveTo: ReturnType<typeof vi.fn>
      lineTo: ReturnType<typeof vi.fn>
      closePath: ReturnType<typeof vi.fn>
      fill: ReturnType<typeof vi.fn>
    }
  }

  it('orthogonal: paints fillRect of charWidth x charHeight', () => {
    const ctx = makeCtx()
    drawCellBackground(ctx, 50, 80, charWidth, charHeight, false)
    expect(ctx.fillRect).toHaveBeenCalledWith(50, 80, charWidth, charHeight)
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  it('isometric: paints a 4-vertex diamond path', () => {
    const ctx = makeCtx()
    drawCellBackground(ctx, 50, 80, charWidth, charHeight, true)
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.beginPath).toHaveBeenCalledOnce()
    expect(ctx.moveTo).toHaveBeenCalledOnce()
    expect(ctx.lineTo).toHaveBeenCalledTimes(3)
    expect(ctx.closePath).toHaveBeenCalledOnce()
    expect(ctx.fill).toHaveBeenCalledOnce()
  })

  it('isometric: diamond vertices form a 2:1 diamond around the glyph anchor', () => {
    const ctx = makeCtx()
    // Glyph anchor at (50, 80) with charWidth=10, charHeight=16, nudge=4.
    // Diamond bbox: left=45, right=65, top=80-4=76, bottom=92, center=(55,84).
    drawCellBackground(ctx, 50, 80, charWidth, charHeight, true)
    expect(ctx.moveTo).toHaveBeenCalledWith(55, 76)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 65, 84)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 55, 92)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 45, 84)
  })
})
