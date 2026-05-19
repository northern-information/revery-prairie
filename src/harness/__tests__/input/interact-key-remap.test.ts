import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

import { KEYBINDINGS } from '@/engine/input'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const readSrc = (relPath: string) => readFileSync(join(REPO_ROOT, relPath), 'utf-8')

describe('interact key remap (E -> F)', () => {
  it('KEYBINDINGS registry binds interact to f, not e', () => {
    const interact = KEYBINDINGS.find(kb => kb.action === 'Interact')
    expect(interact?.key).toBe('f')
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
