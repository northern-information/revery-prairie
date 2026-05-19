#!/usr/bin/env node
// Downloads the kreativekorp Voynich Unicode font (CC0) into
// public/fonts/voynich.ttf. The font file is gitignored — every contributor
// runs this once. See docs/claude/egregores.md and public/fonts/README.md.

import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FONT_URL =
  'https://raw.githubusercontent.com/kreativekorp/voynich-unicode/master/Voynich/VoynichUnicode.ttf'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const target = resolve(repoRoot, 'public/fonts/voynich.ttf')

const existing = await stat(target).catch(() => null)
if (existing && process.argv.includes('--skip-if-present')) {
  console.log(`voynich.ttf already present (${String(existing.size)} bytes); skipping fetch.`)
  process.exit(0)
}

console.log(`fetching ${FONT_URL}`)
const response = await fetch(FONT_URL)
if (!response.ok) {
  console.error(`fetch failed: HTTP ${String(response.status)} ${response.statusText}`)
  process.exit(1)
}

const buf = Buffer.from(await response.arrayBuffer())
if (buf.length < 1024) {
  console.error(`fetched payload is suspiciously small (${String(buf.length)} bytes); aborting without writing.`)
  process.exit(1)
}

await mkdir(dirname(target), { recursive: true })
await writeFile(target, buf)
console.log(`wrote ${target} (${String(buf.length)} bytes)`)
