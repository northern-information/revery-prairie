import { clampPanelPosition } from '../panelPosition'
import { describe, expect, it } from 'vitest'

// Common test constants
const CHAR_W = 10
const CHAR_H = 16
const PANEL_W = 200
const PANEL_H = 300
const VP_W = 1024
const VP_H = 768

describe('inventory panel clamping', () => {
  it('prefers above-right of the player when space is available', () => {
    // Player in the center of the viewport
    const pos = clampPanelPosition(400, 500, CHAR_W, CHAR_H, PANEL_W, PANEL_H, VP_W, VP_H)

    // Should be to the right of the player
    expect(pos.left).toBeGreaterThan(400)
    // Should be above the player
    expect(pos.top).toBeLessThan(500)
  })

  it('flips left when right edge would clip', () => {
    // Player near the right edge
    const pos = clampPanelPosition(900, 500, CHAR_W, CHAR_H, PANEL_W, PANEL_H, VP_W, VP_H)

    // Should be to the left of the player
    expect(pos.left).toBeLessThan(900)
  })

  it('flips below when top edge would clip', () => {
    // Player near the top edge
    const pos = clampPanelPosition(400, 50, CHAR_W, CHAR_H, PANEL_W, PANEL_H, VP_W, VP_H)

    // Should be below the player
    expect(pos.top).toBeGreaterThan(50)
  })

  it('flips to below-left when top-right corner clips', () => {
    // Player in the top-right corner
    const pos = clampPanelPosition(900, 50, CHAR_W, CHAR_H, PANEL_W, PANEL_H, VP_W, VP_H)

    // Should be left of and below the player
    expect(pos.left).toBeLessThan(900)
    expect(pos.top).toBeGreaterThan(50)
  })

  it('clamps to edge margin and never goes off-screen', () => {
    // Player at (0, 0) — both axes would clip in every quadrant
    const pos = clampPanelPosition(0, 0, CHAR_W, CHAR_H, PANEL_W, PANEL_H, VP_W, VP_H)

    expect(pos.left).toBeGreaterThanOrEqual(8)
    expect(pos.top).toBeGreaterThanOrEqual(8)
    expect(pos.left + PANEL_W).toBeLessThanOrEqual(VP_W - 8)
    expect(pos.top + PANEL_H).toBeLessThanOrEqual(VP_H - 8)
  })

  it('accounts for wider panel when omnibox is open', () => {
    // Simulate both panels open — wider combined width
    const combinedW = 380
    const pos = clampPanelPosition(700, 400, CHAR_W, CHAR_H, combinedW, PANEL_H, VP_W, VP_H)

    // Should stay on-screen even with the wider container
    expect(pos.left + combinedW).toBeLessThanOrEqual(VP_W - 8)
    expect(pos.left).toBeGreaterThanOrEqual(8)
  })

  it('handles very small viewport gracefully', () => {
    // Viewport smaller than the panel
    const smallVP_W = 150
    const smallVP_H = 200
    const pos = clampPanelPosition(50, 50, CHAR_W, CHAR_H, PANEL_W, PANEL_H, smallVP_W, smallVP_H)

    // Should clamp to the edge margin (panel will overflow, but starts on-screen)
    expect(pos.left).toBe(8)
    expect(pos.top).toBe(8)
  })

  it('player at bottom-left corner stays on-screen', () => {
    const pos = clampPanelPosition(10, 700, CHAR_W, CHAR_H, PANEL_W, PANEL_H, VP_W, VP_H)

    expect(pos.left).toBeGreaterThanOrEqual(8)
    expect(pos.top).toBeGreaterThanOrEqual(8)
    expect(pos.top + PANEL_H).toBeLessThanOrEqual(VP_H - 8)
  })

  it('result is always fully within viewport bounds for centered player', () => {
    const pos = clampPanelPosition(512, 384, CHAR_W, CHAR_H, PANEL_W, PANEL_H, VP_W, VP_H)

    expect(pos.left).toBeGreaterThanOrEqual(8)
    expect(pos.top).toBeGreaterThanOrEqual(8)
    expect(pos.left + PANEL_W).toBeLessThanOrEqual(VP_W - 8)
    expect(pos.top + PANEL_H).toBeLessThanOrEqual(VP_H - 8)
  })
})
