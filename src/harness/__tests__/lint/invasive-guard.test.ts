// Lint guard: the word "invasive" must not appear in any player-facing
// string. Per v3 cosmology (RP-8a) the egregores are never named
// to the player — "invasive" is the kind of label this game refuses.
// NPCs use folk register ("the other clover", "the Far Garden"); the
// player-facing surface stays innocent of the technical vocabulary.
//
// Scope: this test reads TypeScript / TSX source under src/ and flags
// any string literal that contains the word "invasive" (case-insensitive,
// word-boundary). Engineering doc comments, code comments, and
// non-string identifiers are exempt — only string content reaching the
// player is checked.
//
// Allowlist: test files (this includes self-references), spec/plan
// content, and CLAUDE.md are out of scope.

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../../..')
const SRC_DIR = path.join(ROOT, 'src')

const EXCLUDED_PATH_FRAGMENTS = ['__tests__', 'node_modules', '.git']

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

const collectSourceFiles = (dir: string, accumulator: string[]): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (EXCLUDED_PATH_FRAGMENTS.some(frag => fullPath.includes(frag))) continue
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, accumulator)
      continue
    }
    const ext = path.extname(entry.name)
    if (!SOURCE_EXTENSIONS.has(ext)) continue
    accumulator.push(fullPath)
  }
}

// Match either single-quoted, double-quoted, or backtick-quoted string
// literals on a single line. Multi-line template literals are not
// fully parsed — the regex matches each line of source independently,
// so a multi-line backtick template will be checked one line at a time
// against the same `invasive` word-boundary rule.
const STRING_LITERAL_REGEX = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g
const INVASIVE_WORD_REGEX = /\binvasive\b/i

describe('lint: invasive word guard (RP-8a)', () => {
  it('no string literal in src/ contains the word "invasive"', () => {
    const files: string[] = []
    collectSourceFiles(SRC_DIR, files)

    const offenders: { file: string; line: number; text: string }[] = []
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8')
      const lines = source.split('\n')
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]
        let match: RegExpExecArray | null = null
        STRING_LITERAL_REGEX.lastIndex = 0
        while ((match = STRING_LITERAL_REGEX.exec(line)) !== null) {
          const literal = match[2]
          if (INVASIVE_WORD_REGEX.test(literal)) {
            offenders.push({
              file: path.relative(ROOT, file),
              line: lineIdx + 1,
              text: literal,
            })
          }
        }
      }
    }

    if (offenders.length > 0) {
      const message = offenders
        .map(o => `  ${o.file}:${String(o.line)} — "${o.text}"`)
        .join('\n')
      throw new Error(
        `Found "invasive" in player-facing string literals:\n${message}\n` +
          'Per v3 doctrine the player-facing term for the egregores is none. ' +
          "Use folk register ('the other clover', 'the Far Garden') instead."
      )
    }
    expect(offenders).toEqual([])
  })
})
