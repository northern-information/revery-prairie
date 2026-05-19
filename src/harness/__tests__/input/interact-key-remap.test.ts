import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

import { KEYBINDINGS } from '@/engine/input'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const readSrc = (relPath: string) => readFileSync(join(REPO_ROOT, relPath), 'utf-8')

describe('interact key remap (E -> F)', () => {
  it('KEYBINDINGS registry binds f to a combined Interact/Scan action', () => {
    const binding = KEYBINDINGS.find(kb => kb.key === 'f')
    expect(binding).toBeDefined()
    expect(binding?.action).toBe('Interact / Scan')
  })

  it('useKeyboard does not match the literal e/E interact key', () => {
    const src = readSrc('src/hooks/useKeyboard.ts')
    expect(src).not.toMatch(/e\.key === 'e' \|\| e\.key === 'E'/)
    expect(src).toMatch(/e\.key === 'f' \|\| e\.key === 'F'/)
  })

  it('HexagramPanel does not match the literal e/E confirm key', () => {
    const src = readSrc('src/components/HexagramPanel.tsx')
    expect(src).not.toMatch(/e\.key === 'e' \|\| e\.key === 'E'/)
    expect(src).toMatch(/e\.key === 'f' \|\| e\.key === 'F'/)
  })
})
