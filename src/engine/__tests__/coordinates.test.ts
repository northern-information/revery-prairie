import { screenToTile } from '../coordinates'
import { viewportToScreen } from '../projection'
import { describe, expect, it } from 'vitest'

describe('screenToTile (orthogonal)', () => {
  const charWidth = 10
  const charHeight = 16

  it('converts screen pixels to tile position with camera at origin', () => {
    const camera = { x: 0, y: 0 }
    expect(screenToTile(25, 40, camera, charWidth, charHeight)).toEqual({
      x: 2,
      y: 2,
    })
  })

  it('accounts for camera offset', () => {
    const camera = { x: 5, y: 10 }
    expect(screenToTile(25, 40, camera, charWidth, charHeight)).toEqual({
      x: 7,
      y: 12,
    })
  })

  it('floors fractional pixel positions', () => {
    const camera = { x: 0, y: 0 }
    expect(screenToTile(9, 15, camera, charWidth, charHeight)).toEqual({
      x: 0,
      y: 0,
    })
    expect(screenToTile(19, 31, camera, charWidth, charHeight)).toEqual({
      x: 1,
      y: 1,
    })
  })

  it('handles exact tile boundary pixels', () => {
    const camera = { x: 0, y: 0 }
    expect(screenToTile(10, 16, camera, charWidth, charHeight)).toEqual({
      x: 1,
      y: 1,
    })
  })

  it('handles pixel position zero', () => {
    const camera = { x: 3, y: 7 }
    expect(screenToTile(0, 0, camera, charWidth, charHeight)).toEqual({
      x: 3,
      y: 7,
    })
  })
})

describe('screenToTile (isometric)', () => {
  const charWidth = 10
  const charHeight = 16
  const viewportWidth = 60
  const viewportHeight = 30

  it('inverts the iso forward projection at the diamond center', () => {
    const camera = { x: 0, y: 0 }
    const { px, py } = viewportToScreen(2, 3, charWidth, charHeight, true, viewportWidth, viewportHeight)
    const centerX = px
    const centerY = py + charHeight / 2
    expect(
      screenToTile(centerX + 0.01, centerY + 0.01, camera, charWidth, charHeight, true, viewportWidth, viewportHeight),
    ).toEqual({
      x: 2,
      y: 3,
    })
  })

  it('accounts for camera offset', () => {
    const camera = { x: 4, y: 9 }
    const { px, py } = viewportToScreen(1, 2, charWidth, charHeight, true, viewportWidth, viewportHeight)
    const sampleX = px + 0.01
    const sampleY = py + charHeight / 2 + 0.01
    expect(
      screenToTile(sampleX, sampleY, camera, charWidth, charHeight, true, viewportWidth, viewportHeight),
    ).toEqual({
      x: 5,
      y: 11,
    })
  })

  it('round-trips: viewportToScreen then screenToTile recovers the tile (iso)', () => {
    const camera = { x: 0, y: 0 }
    for (let vy = 0; vy < 6; vy++) {
      for (let vx = 0; vx < 6; vx++) {
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, true, viewportWidth, viewportHeight)
        const sampleX = px + 0.01
        const sampleY = py + charHeight / 2 + 0.01
        expect(
          screenToTile(sampleX, sampleY, camera, charWidth, charHeight, true, viewportWidth, viewportHeight),
        ).toEqual({
          x: vx,
          y: vy,
        })
      }
    }
  })

  it('round-trips: viewportToScreen then screenToTile recovers the tile (orthogonal)', () => {
    const camera = { x: 0, y: 0 }
    for (let vy = 0; vy < 6; vy++) {
      for (let vx = 0; vx < 6; vx++) {
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, false, viewportWidth, viewportHeight)
        expect(
          screenToTile(px, py, camera, charWidth, charHeight, false, viewportWidth, viewportHeight),
        ).toEqual({
          x: vx,
          y: vy,
        })
      }
    }
  })

  it('iso: center viewport tile glyph anchor round-trips through screenToTile', () => {
    const camera = { x: 100, y: 200 }
    // Glyph anchor for the center tile sits at canvas center + (0, nudge).
    const cx = (viewportWidth * charWidth) / 2
    const cy = (viewportHeight * charHeight) / 2 + charHeight / 4
    expect(
      screenToTile(cx + 0.01, cy + 0.01, camera, charWidth, charHeight, true, viewportWidth, viewportHeight),
    ).toEqual({
      x: camera.x + viewportWidth / 2,
      y: camera.y + viewportHeight / 2,
    })
  })
})
