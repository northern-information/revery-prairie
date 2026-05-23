import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

import { KEYBINDINGS } from '@/engine/input'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const readSrc = (relPath: string) => readFileSync(join(REPO_ROOT, relPath), 'utf-8')

describe('input system cleanup', () => {
  describe('KEYBINDINGS registry', () => {
    it('does not list `q` (manual toggle removed)', () => {
      expect(KEYBINDINGS.find(kb => kb.key === 'q')).toBeUndefined()
    })

    it('does not list `b` (burn-draw toggle removed)', () => {
      expect(KEYBINDINGS.find(kb => kb.key === 'b')).toBeUndefined()
    })

    it('lists `tab` as the manual toggle', () => {
      const binding = KEYBINDINGS.find(kb => kb.key === 'tab')
      expect(binding).toBeDefined()
      expect(binding?.action).toMatch(/manual/i)
    })

    it('lists `f` as the combined Interact / Scan action', () => {
      const binding = KEYBINDINGS.find(kb => kb.key === 'f')
      expect(binding).toBeDefined()
      expect(binding?.action).toBe('Interact / Scan')
    })
  })

  describe('useKeyboard source does not still bind removed keys', () => {
    const src = readSrc('src/hooks/useKeyboard.ts')

    it('contains no `e.key === "q"` or `e.key === "Q"` matcher', () => {
      expect(src).not.toMatch(/e\.key === 'q' \|\| e\.key === 'Q'/)
    })

    it('contains no `e.key === "b"` matcher (burnDrawMode toggle)', () => {
      expect(src).not.toMatch(/e\.key === 'b'/)
    })

    it('contains no reference to burnDrawMode', () => {
      expect(src).not.toMatch(/burnDrawMode/)
    })
  })

  describe('GameState shape no longer carries burn-draw fields', () => {
    const schemaSrc = readSrc('src/harness/__tests__/serialization/schema.test.ts')

    it('EXPECTED_FIELDS does not include burnDrawMode', () => {
      expect(schemaSrc).not.toMatch(/['"]burnDrawMode['"]/)
    })

    it('EXPECTED_FIELDS does not include burnLineDraft', () => {
      expect(schemaSrc).not.toMatch(/['"]burnLineDraft['"]/)
    })
  })

  describe('docs/claude/input.md drift', () => {
    const doc = readSrc('docs/claude/input.md')

    it('does not describe `e` as the interact key', () => {
      expect(doc).not.toMatch(/^- `e` —/m)
    })

    it('does not claim `space — toggle camera mode`', () => {
      expect(doc).not.toMatch(/space.*toggle camera mode/i)
    })

    it('describes `f` as the interact / scan key', () => {
      expect(doc).toMatch(/`f`/)
    })
  })

  describe('helper text uppercase bracketed keys convention', () => {
    const checkFile = (relPath: string, forbiddenPatterns: RegExp[]) => {
      const src = readSrc(relPath)
      for (const pattern of forbiddenPatterns) {
        expect(src, `${relPath} contains forbidden pattern ${pattern.source}`).not.toMatch(pattern)
      }
    }

    it('ScanProgressBar renders [F], not [f]', () => {
      checkFile('src/components/ScanProgressBar.tsx', [/>\s*\[f\]\s*</])
    })

    it('HexagramPanel renders [F] / [Enter], not [e] / [enter]', () => {
      const src = readSrc('src/components/HexagramPanel.tsx')
      expect(src).not.toMatch(/press \[e\]/)
      expect(src).not.toMatch(/\[enter\]/)
    })

    it('HexagramPanel toss button uses Title Case `[Toss Coins]`', () => {
      const src = readSrc('src/components/HexagramPanel.tsx')
      expect(src).not.toMatch(/\[toss coins\]/)
      expect(src).toMatch(/\[Toss Coins\]/)
    })
  })

  describe('backpack item hover helper text', () => {
    it('ItemInfo renders an [X] Drop hint string', () => {
      const src = readSrc('src/components/ItemInfo.tsx')
      expect(src).toMatch(/\[X\]\s*Drop/)
    })
  })
})
