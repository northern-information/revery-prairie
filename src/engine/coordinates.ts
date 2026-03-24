import type { Position } from './types'

export const screenToTile = (
  canvasX: number,
  canvasY: number,
  camera: Position,
  charWidth: number,
  charHeight: number
): Position => ({
  x: Math.floor(canvasX / charWidth) + camera.x,
  y: Math.floor(canvasY / charHeight) + camera.y,
})
