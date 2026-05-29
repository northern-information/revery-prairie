#!/usr/bin/env node
// Sync sfx/music against a public Cloudflare R2 bucket.
//
// Usage:
//   node tools/sync-audio.mjs               # dry-run diff (exit 1 if deltas)
//   node tools/sync-audio.mjs --check       # same as default
//   node tools/sync-audio.mjs --pull        # download missing/changed files (no auth needed)
//   node tools/sync-audio.mjs --push        # upload local deltas (needs `wrangler login`)
//   node tools/sync-audio.mjs --push --prune  # also delete remote orphans
//   add --verbose to log shell commands and HTTP requests
//
// One-time setup (run once, then commit the resulting PUBLIC_URL below):
//   cd worker && npx wrangler r2 bucket create reveryprairie
//   npx wrangler r2 bucket dev-url enable reveryprairie
// The dev-url command prints a `https://pub-<hash>.r2.dev` URL. Paste it into
// PUBLIC_URL below (or export R2_AUDIO_PUBLIC_URL to override at runtime).
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUCKET_NAME = 'reveryprairie'
const PUBLIC_URL = process.env.R2_AUDIO_PUBLIC_URL ?? 'https://pub-5f6bcda319d54690b42e3dde09fdeb55.r2.dev'
const AUDIO_DIRS = ['music', 'sfx']
const MANIFEST_KEY = 'manifest.json'
const CONCURRENCY = 4
const FETCH_TIMEOUT_MS = 30_000

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const workerDir = resolve(repoRoot, 'worker')

const argv = process.argv.slice(2)
const flags = new Set(argv)
const verbose = flags.has('--verbose')
const prune = flags.has('--prune')

const modes = ['--check', '--pull', '--push'].filter(m => flags.has(m))
if (modes.length > 1) {
  console.error(`error: --check, --pull, --push are mutually exclusive (got: ${modes.join(' ')})`)
  process.exit(2)
}
const mode = modes[0] ?? '--check'

if (prune && mode !== '--push') {
  console.error('error: --prune only applies with --push')
  process.exit(2)
}

if (PUBLIC_URL.includes('TODO')) {
  console.error('error: PUBLIC_URL is not configured. See setup instructions at the top of this script.')
  process.exit(2)
}

const md5File = path =>
  new Promise((res, rej) => {
    const hash = createHash('md5')
    const stream = createReadStream(path)
    stream.on('error', rej)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => res(hash.digest('hex')))
  })

const pool = async (items, fn, n) => {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      await fn(item)
    }
  })
  await Promise.all(workers)
}

const fetchWithTimeout = async (url, init = {}) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => {
    ctrl.abort()
  }, FETCH_TIMEOUT_MS)
  try {
    if (verbose) console.log(`  fetch ${url}`)
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

const buildLocalManifest = async () => {
  const files = {}
  for (const dir of AUDIO_DIRS) {
    const absDir = resolve(repoRoot, 'public', dir)
    let entries
    try {
      entries = await readdir(absDir)
    } catch (err) {
      if (err.code === 'ENOENT') continue
      throw err
    }
    for (const name of entries) {
      if (!name.endsWith('.mp3')) continue
      const absPath = resolve(absDir, name)
      const s = await stat(absPath)
      if (!s.isFile()) continue
      const md5 = await md5File(absPath)
      files[`${dir}/${name}`] = { md5, size: s.size }
    }
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    files,
  }
}

const fetchRemoteManifest = async () => {
  const url = `${PUBLIC_URL}/${MANIFEST_KEY}`
  const resp = await fetchWithTimeout(url, { cache: 'no-store' })
  if (resp.status === 404) {
    return { version: 1, generatedAt: null, files: {} }
  }
  if (!resp.ok) {
    throw new Error(`failed to fetch manifest from ${url}: HTTP ${String(resp.status)}`)
  }
  const json = await resp.json()
  if (typeof json !== 'object' || json === null || typeof json.files !== 'object') {
    throw new Error(`manifest at ${url} is malformed`)
  }
  return json
}

const diff = (local, remote) => {
  const keys = new Set([...Object.keys(local.files), ...Object.keys(remote.files)])
  const push = []
  const pull = []
  const conflict = []
  const inSync = []
  for (const key of [...keys].sort()) {
    const l = local.files[key]
    const r = remote.files[key]
    if (l && !r) push.push(key)
    else if (!l && r) pull.push(key)
    else if (l && r && l.md5 !== r.md5) conflict.push(key)
    else inSync.push(key)
  }
  return { push, pull, conflict, inSync }
}

const reportDiff = d => {
  const total = d.push.length + d.pull.length + d.conflict.length
  if (total === 0) {
    console.log(`✓ in sync (${String(d.inSync.length)} files)`)
    return
  }
  for (const key of d.push) console.log(`↑ push     ${key}`)
  for (const key of d.pull) console.log(`↓ pull     ${key}`)
  for (const key of d.conflict) console.log(`⚠ conflict ${key}`)
  console.log(
    `\n${String(d.push.length)} to push, ${String(d.pull.length)} to pull, ${String(d.conflict.length)} conflict, ${String(d.inSync.length)} in sync`
  )
}

const runWrangler = args =>
  new Promise((res, rej) => {
    if (verbose) console.log(`  $ npx wrangler ${args.join(' ')}`)
    const child = spawn('npx', ['wrangler', ...args], {
      cwd: workerDir,
      stdio: verbose ? 'inherit' : ['inherit', 'pipe', 'inherit'],
    })
    let stdout = ''
    if (child.stdout)
      child.stdout.on('data', chunk => {
        stdout += chunk.toString()
      })
    child.on('error', rej)
    child.on('exit', code => {
      if (code === 0) res(stdout)
      else rej(new Error(`wrangler ${args.join(' ')} exited with code ${String(code)}`))
    })
  })

const pullFile = async (key, expected) => {
  const url = `${PUBLIC_URL}/${key}`
  const target = resolve(repoRoot, 'public', key)
  await mkdir(dirname(target), { recursive: true })
  const resp = await fetchWithTimeout(url)
  if (!resp.ok) throw new Error(`failed to pull ${key} from ${url}: HTTP ${String(resp.status)}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  await writeFile(target, buf)
  const actual = createHash('md5').update(buf).digest('hex')
  if (actual !== expected.md5) {
    await rm(target, { force: true })
    throw new Error(`md5 mismatch for ${key}: expected ${expected.md5}, got ${actual}`)
  }
  if (buf.length !== expected.size) {
    await rm(target, { force: true })
    throw new Error(`size mismatch for ${key}: expected ${String(expected.size)}, got ${String(buf.length)}`)
  }
  console.log(`  ↓ ${key} (${String(buf.length)} bytes)`)
}

const pushFile = async key => {
  const localPath = resolve(repoRoot, 'public', key)
  await runWrangler(['r2', 'object', 'put', `${BUCKET_NAME}/${key}`, '--file', localPath, '--remote'])
  console.log(`  ↑ ${key}`)
}

const deleteRemote = async key => {
  await runWrangler(['r2', 'object', 'delete', `${BUCKET_NAME}/${key}`, '--remote'])
  console.log(`  ✗ ${key}`)
}

const uploadManifest = async manifest => {
  const tmpPath = resolve(tmpdir(), `revery-prairie-manifest-${String(process.pid)}.json`)
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2))
  try {
    await runWrangler([
      'r2',
      'object',
      'put',
      `${BUCKET_NAME}/${MANIFEST_KEY}`,
      '--file',
      tmpPath,
      '--content-type',
      'application/json',
      '--remote',
    ])
    console.log(`  ↑ ${MANIFEST_KEY}`)
  } finally {
    await rm(tmpPath, { force: true })
  }
}

const main = async () => {
  const local = await buildLocalManifest()
  const remote = await fetchRemoteManifest()
  const d = diff(local, remote)

  if (mode === '--check') {
    reportDiff(d)
    const hasDeltas = d.push.length + d.pull.length + d.conflict.length > 0
    process.exit(hasDeltas ? 1 : 0)
  }

  if (mode === '--pull') {
    const targets = [...d.pull, ...d.conflict]
    if (targets.length === 0) {
      console.log('✓ nothing to pull')
      return
    }
    console.log(`pulling ${String(targets.length)} file(s) from ${PUBLIC_URL}`)
    await pool(
      targets,
      async key => {
        await pullFile(key, remote.files[key])
      },
      CONCURRENCY
    )
    console.log('✓ pull complete')
    return
  }

  // --push
  const targets = [...d.push, ...d.conflict]
  if (targets.length === 0 && !prune) {
    console.log('✓ nothing to push')
    return
  }
  if (targets.length > 0) {
    console.log(`pushing ${String(targets.length)} file(s) to ${BUCKET_NAME}`)
    await pool(targets, pushFile, CONCURRENCY)
  }
  if (prune && d.pull.length > 0) {
    console.log(`pruning ${String(d.pull.length)} remote orphan(s)`)
    await pool(d.pull, deleteRemote, CONCURRENCY)
  } else if (d.pull.length > 0) {
    console.log(`(${String(d.pull.length)} remote orphan(s) skipped — pass --prune to delete)`)
  }
  await uploadManifest(local)
  console.log('✓ push complete')
}

try {
  await main()
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`)
  if (verbose && err instanceof Error && err.stack) console.error(err.stack)
  process.exit(1)
}
