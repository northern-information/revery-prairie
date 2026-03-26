import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHARACTER_DEFINITIONS } from '@/engine/characters'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const PUBLIC_DIR = resolve(REPO_ROOT, 'public')

describe('asset references', () => {
  it('cursor.cur exists in public/', () => {
    expect(existsSync(resolve(PUBLIC_DIR, 'cursor.cur'))).toBe(true)
  })

  it('text.cur exists in public/', () => {
    expect(existsSync(resolve(PUBLIC_DIR, 'text.cur'))).toBe(true)
  })

  describe('character portraits', () => {
    for (const char of Object.values(CHARACTER_DEFINITIONS)) {
      if (char.portrait) {
        it(`${char.id} portrait "${char.portrait}" exists in public/`, () => {
          // portrait paths start with "/" — strip it for filesystem check
          const portraitPath = char.portrait!.replace(/^\//, '')
          expect(existsSync(resolve(PUBLIC_DIR, portraitPath))).toBe(true)
        })
      }
    }
  })
})
