import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const ENGINE_DIR = resolve(REPO_ROOT, 'src/engine')

const getEngineFiles = (): string[] => {
  const files: string[] = []
  const scan = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scan(join(dir, entry.name))
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(join(dir, entry.name))
      }
    }
  }
  scan(ENGINE_DIR)
  return files
}

describe('import boundary: engine/UI separation', () => {
  const engineFiles = getEngineFiles()

  it('found engine files to check', () => {
    expect(engineFiles.length).toBeGreaterThan(0)
  })

  for (const filePath of getEngineFiles()) {
    const relativePath = filePath.replace(REPO_ROOT + '/', '')

    it(`${relativePath} does not import from src/components/`, () => {
      const contents = readFileSync(filePath, 'utf-8')
      const hasComponentImport = /from\s+['"].*(?:src\/components|@\/components)/.test(contents)
      expect(hasComponentImport).toBe(false)
    })

    it(`${relativePath} does not import from src/hooks/`, () => {
      const contents = readFileSync(filePath, 'utf-8')
      const hasHookImport = /from\s+['"].*(?:src\/hooks|@\/hooks)/.test(contents)
      expect(hasHookImport).toBe(false)
    })
  }
})
