import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const PUBLIC_DIR = resolve(REPO_ROOT, 'public')

describe('asset references', () => {
  it('cursor.cur exists in public/', () => {
    expect(existsSync(resolve(PUBLIC_DIR, 'cursor.cur'))).toBe(true)
  })

  it('text.cur exists in public/', () => {
    expect(existsSync(resolve(PUBLIC_DIR, 'text.cur'))).toBe(true)
  })
})
