import { screenToTile } from '../coordinates'
import { describe, expect, it } from 'vitest'

describe('screenToTile', () => {
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
