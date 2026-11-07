import {
  drawCellBackground,
  drawCellHighlight,
  getCellDiamondCorners,
  screenToTile,
  viewportToScreen,
  worldToScreen,
} from '../projection'
import { describe, expect, it, vi } from 'vitest'

const charWidth = 10
const charHeight = 16
const viewportWidth = 60
const viewportHeight = 30

describe('viewportToScreen', () => {
  it('center viewport tile glyph anchor lands at canvas center', () => {
    // canvas center: (viewportWidth*charWidth/2, viewportHeight*charHeight/2)
    // Glyph anchor and diamond bbox are aligned vertically (nudge=0) so the
    // glyph sits in the diamond's middle band rather than hanging below it.
    const expectedPx = (viewportWidth * charWidth) / 2
    const expectedPy = (viewportHeight * charHeight) / 2
    expect(
      viewportToScreen(viewportWidth / 2, viewportHeight / 2, charWidth, charHeight, viewportWidth, viewportHeight)
    ).toEqual({
      px: expectedPx,
      py: expectedPy,
    })
  })

  it('moves +x by (charWidth, charHeight/2) per tile', () => {
    const a = viewportToScreen(0, 0, charWidth, charHeight, viewportWidth, viewportHeight)
    const b = viewportToScreen(1, 0, charWidth, charHeight, viewportWidth, viewportHeight)
    expect(b.px - a.px).toBe(charWidth)
    expect(b.py - a.py).toBe(charHeight / 2)
  })

  it('moves +y by (-charWidth, charHeight/2) per tile', () => {
    const a = viewportToScreen(0, 0, charWidth, charHeight, viewportWidth, viewportHeight)
    const b = viewportToScreen(0, 1, charWidth, charHeight, viewportWidth, viewportHeight)
    expect(b.px - a.px).toBe(-charWidth)
    expect(b.py - a.py).toBe(charHeight / 2)
  })

  it('lays adjacent tiles in a 2:1 diamond grid (diagonal neighbors)', () => {
    // (0,0) and (1,1) should be one full diamond row apart vertically (same x)
    const a = viewportToScreen(0, 0, charWidth, charHeight, viewportWidth, viewportHeight)
    const b = viewportToScreen(1, 1, charWidth, charHeight, viewportWidth, viewportHeight)
    expect(b.px).toBe(a.px)
    expect(b.py - a.py).toBe(charHeight)
  })
})

describe('worldToScreen', () => {
  it('subtracts camera before projecting', () => {
    const camera = { x: 5, y: 7 }
    const expected = viewportToScreen(3, 3, charWidth, charHeight, viewportWidth, viewportHeight)
    expect(worldToScreen(8, 10, camera, charWidth, charHeight, viewportWidth, viewportHeight)).toEqual(expected)
  })

  it('handles fractional world coords (ECS lerp)', () => {
    const camera = { x: 0, y: 0 }
    const a = worldToScreen(2.5, 3.0, camera, charWidth, charHeight, viewportWidth, viewportHeight)
    const expected = viewportToScreen(2.5, 3.0, charWidth, charHeight, viewportWidth, viewportHeight)
    expect(a).toEqual(expected)
  })
})

describe('screenToTile round-trip with viewportToScreen', () => {
  const camera = { x: 4, y: 9 }

  it('sampling near a tile center recovers the tile', () => {
    for (let vy = 0; vy < 5; vy++) {
      for (let vx = 0; vx < 5; vx++) {
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
        const sampleX = px + 0.1
        const sampleY = py + charHeight / 2 + 0.1
        expect(screenToTile(sampleX, sampleY, camera, charWidth, charHeight, viewportWidth, viewportHeight)).toEqual({
          x: camera.x + vx,
          y: camera.y + vy,
        })
      }
    }
  })
})

// Keeps the mocks separate from the context so assertions read them as
// plain `Mock`s rather than as unbound `CanvasRenderingContext2D` methods.
const makeDiamondCtx = () => {
  const mocks = {
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
  }
  const ctx = {
    fillStyle: '#000',
    shadowColor: '',
    shadowBlur: 0,
    ...mocks,
  } as unknown as CanvasRenderingContext2D
  return { ctx, mocks }
}

describe('drawCellBackground', () => {
  it('paints a 4-vertex diamond path', () => {
    const { ctx, mocks } = makeDiamondCtx()
    drawCellBackground(ctx, 50, 80, charWidth, charHeight)
    expect(mocks.fillRect).not.toHaveBeenCalled()
    expect(mocks.beginPath).toHaveBeenCalledOnce()
    expect(mocks.moveTo).toHaveBeenCalledOnce()
    expect(mocks.lineTo).toHaveBeenCalledTimes(3)
    expect(mocks.closePath).toHaveBeenCalledOnce()
    expect(mocks.fill).toHaveBeenCalledOnce()
  })

  it('diamond vertices form a 2:1 diamond around the glyph anchor', () => {
    const { ctx, mocks } = makeDiamondCtx()
    // Glyph anchor at (50, 80) with charWidth=10, charHeight=16, nudge=0.
    // Diamond bbox: left=45, right=65, top=80, bottom=96, center=(55,88).
    drawCellBackground(ctx, 50, 80, charWidth, charHeight)
    expect(mocks.moveTo).toHaveBeenCalledWith(55, 80)
    expect(mocks.lineTo).toHaveBeenNthCalledWith(1, 65, 88)
    expect(mocks.lineTo).toHaveBeenNthCalledWith(2, 55, 96)
    expect(mocks.lineTo).toHaveBeenNthCalledWith(3, 45, 88)
  })
})

describe('getCellDiamondCorners', () => {
  it('returns the 2:1 diamond bbox aligned with the glyph anchor', () => {
    // Glyph anchor at (50, 80), charWidth=10, charHeight=16, nudge=0.
    // Diamond bbox: leftX=45, rightX=65, topY=80, bottomY=96, center=(55,88).
    expect(getCellDiamondCorners(50, 80, charWidth, charHeight)).toEqual({
      leftX: 45,
      rightX: 65,
      topY: 80,
      bottomY: 96,
      cx: 55,
      cy: 88,
    })
  })

  it('aligns with drawCellBackground geometry for the same anchor', () => {
    const { ctx, mocks } = makeDiamondCtx()
    drawCellBackground(ctx, 50, 80, charWidth, charHeight)
    const c = getCellDiamondCorners(50, 80, charWidth, charHeight)
    expect(mocks.moveTo).toHaveBeenCalledWith(c.cx, c.topY)
    expect(mocks.lineTo).toHaveBeenNthCalledWith(1, c.rightX, c.cy)
    expect(mocks.lineTo).toHaveBeenNthCalledWith(2, c.cx, c.bottomY)
    expect(mocks.lineTo).toHaveBeenNthCalledWith(3, c.leftX, c.cy)
  })
})

describe('drawCellHighlight', () => {
  it('sets shadowColor and shadowBlur to the highlight color before drawing', () => {
    const { ctx, mocks } = makeDiamondCtx()
    let observedShadowColor = ''
    let observedShadowBlur = 0
    mocks.fill.mockImplementation(() => {
      observedShadowColor = ctx.shadowColor
      observedShadowBlur = ctx.shadowBlur
    })
    drawCellHighlight(ctx, 50, 80, charWidth, charHeight, '#ff69b4')
    expect(observedShadowColor).toBe('#ff69b4')
    expect(observedShadowBlur).toBeGreaterThan(0)
  })

  it('restores shadowBlur and shadowColor after drawing', () => {
    const { ctx } = makeDiamondCtx()
    ctx.shadowBlur = 0
    ctx.shadowColor = ''
    drawCellHighlight(ctx, 50, 80, charWidth, charHeight, '#ff69b4')
    expect(ctx.shadowBlur).toBe(0)
    expect(ctx.shadowColor).toBe('')
  })

  it('delegates to drawCellBackground geometry', () => {
    const { ctx, mocks } = makeDiamondCtx()
    drawCellHighlight(ctx, 50, 80, charWidth, charHeight, '#ff69b4')
    // Same diamond path drawCellBackground would produce.
    expect(mocks.fillRect).not.toHaveBeenCalled()
    expect(mocks.fill).toHaveBeenCalledOnce()
  })
})

describe('glyph alignment with diamond bbox', () => {
  it('glyph anchor py equals diamond bbox top (nudge=0)', () => {
    // After fixing the nudge bug, the glyph bbox starts at the diamond's
    // top apex and extends down for charHeight, matching the diamond bbox.
    const { px, py } = viewportToScreen(3, 4, charWidth, charHeight, viewportWidth, viewportHeight)
    const corners = getCellDiamondCorners(px, py, charWidth, charHeight)
    expect(corners.topY).toBe(py)
    expect(corners.bottomY).toBe(py + charHeight)
  })

  it('round-trip: clicking the glyph bbox center recovers the tile', () => {
    const camera = { x: 4, y: 9 }
    for (let vy = 0; vy < 5; vy++) {
      for (let vx = 0; vx < 5; vx++) {
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
        // Glyph horizontal center sits at (px + charWidth/2 - charWidth/2) = px
        // because the glyph is drawn left-aligned at px and is charWidth wide.
        // Diamond center: (px, py + charHeight/2). This is the safe interior.
        const sampleX = px
        const sampleY = py + charHeight / 2
        expect(screenToTile(sampleX, sampleY, camera, charWidth, charHeight, viewportWidth, viewportHeight)).toEqual({
          x: camera.x + vx,
          y: camera.y + vy,
        })
      }
    }
  })
})
