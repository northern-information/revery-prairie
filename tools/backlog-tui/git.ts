import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setStatusInYamlText } from './data.js'

import type { Status } from './data.js'

export interface MoveResult {
  ok: boolean
  url?: string
  error?: string
  log: string[]
}

interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

const run = (cmd: string, args: string[], opts: RunOptions = {}): { ok: boolean; stdout: string; stderr: string } => {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = (r.stdout ?? '').toString().trim()
  const stderr = (r.stderr ?? '').toString().trim()
  return { ok: r.status === 0, stdout, stderr }
}

// Resolve the primary working tree (not whichever worktree the TUI happens to be
// running inside). `git rev-parse --git-common-dir` points at the shared .git
// directory; its parent is the main checkout.
const findMainCheckout = (startDir: string): string => {
  const r = run('git', ['rev-parse', '--git-common-dir'], { cwd: startDir })
  if (!r.ok) throw new Error(`git rev-parse failed: ${r.stderr}`)
  const gitDir = resolve(startDir, r.stdout)
  // Common case: gitDir is `<repo>/.git`. Worktree case: still `<repo>/.git`
  // because --git-common-dir resolves to the shared dir.
  return dirname(gitDir)
}

export interface MoveParams {
  id: string
  newStatus: Status
  yamlRelPath: string // e.g. 'docs/backlog.yaml'
  startDir: string // typically process.cwd()
}

export const moveFeatureAndOpenPr = (params: MoveParams): MoveResult => {
  const log: string[] = []
  const push = (msg: string) => {
    log.push(msg)
  }

  try {
    const mainCheckout = findMainCheckout(params.startDir)
    push(`repo: ${mainCheckout}`)

    // Make sure gh is available before we do anything destructive.
    const ghCheck = run('gh', ['--version'])
    if (!ghCheck.ok) {
      return {
        ok: false,
        error: 'gh CLI not found. Install with `brew install gh` and authenticate with `gh auth login`.',
        log,
      }
    }

    // Fetch origin/main quietly so the worktree branches from a fresh base.
    const fetched = run('git', ['fetch', 'origin', 'main', '--quiet'], { cwd: mainCheckout })
    if (!fetched.ok) {
      push(`warn: git fetch origin main failed: ${fetched.stderr}`)
      // continue — we can still branch from local main if it exists
    } else {
      push('fetched origin/main')
    }

    const branch = `backlog/${sanitize(params.id)}-${params.newStatus}`
    const worktreePath = resolve(mainCheckout, '.claude/worktrees', branch.replace(/\//g, '-'))

    // If a stale worktree exists at this path, refuse rather than clobber.
    if (existsSync(worktreePath)) {
      return {
        ok: false,
        error: `Worktree already exists at ${worktreePath}. Remove it (\`git worktree remove\`) and retry.`,
        log,
      }
    }

    // Branch from origin/main if we have it, otherwise local main.
    const baseRef = run('git', ['rev-parse', '--verify', 'origin/main'], { cwd: mainCheckout }).ok
      ? 'origin/main'
      : 'main'
    push(`base ref: ${baseRef}`)

    const wt = run('git', ['worktree', 'add', '-b', branch, worktreePath, baseRef], { cwd: mainCheckout })
    if (!wt.ok) {
      return { ok: false, error: `git worktree add failed: ${wt.stderr || wt.stdout}`, log }
    }
    push(`worktree: ${worktreePath}`)

    // Edit the YAML inside the worktree.
    const yamlAbs = resolve(worktreePath, params.yamlRelPath)
    const raw = readFileSync(yamlAbs, 'utf8')
    const next = setStatusInYamlText(raw, params.id, params.newStatus)
    if (next === raw) {
      // No-op move — clean up the worktree and report.
      cleanupWorktree(mainCheckout, worktreePath, branch, log)
      return {
        ok: false,
        error: `${params.id} is already ${params.newStatus}. Nothing to change.`,
        log,
      }
    }
    writeFileSync(yamlAbs, next, 'utf8')
    push(`wrote: ${params.yamlRelPath}`)

    // Commit.
    const add = run('git', ['add', params.yamlRelPath], { cwd: worktreePath })
    if (!add.ok) {
      cleanupWorktree(mainCheckout, worktreePath, branch, log)
      return { ok: false, error: `git add failed: ${add.stderr}`, log }
    }
    const title = `Maintain backlog: move ${params.id} to ${params.newStatus}`
    const commit = run('git', ['commit', '-m', title], { cwd: worktreePath })
    if (!commit.ok) {
      cleanupWorktree(mainCheckout, worktreePath, branch, log)
      return { ok: false, error: `git commit failed: ${commit.stderr || commit.stdout}`, log }
    }
    push('committed')

    // Push.
    const pushed = run('git', ['push', '-u', 'origin', branch], { cwd: worktreePath })
    if (!pushed.ok) {
      return { ok: false, error: `git push failed: ${pushed.stderr || pushed.stdout}`, log }
    }
    push('pushed')

    // Draft PR.
    const body = `Moves ${params.id} to \`${params.newStatus}\` in \`${params.yamlRelPath}\`.\n\nOpened from the \`npm run backlog\` TUI.`
    const pr = run('gh', ['pr', 'create', '--draft', '--title', title, '--body', body], { cwd: worktreePath })
    if (!pr.ok) {
      return { ok: false, error: `gh pr create failed: ${pr.stderr || pr.stdout}`, log }
    }
    const url = extractPrUrl(pr.stdout)
    push(`pr: ${url ?? '(url not parsed)'}`)
    return { ok: true, url: url ?? undefined, log }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), log }
  }
}

const cleanupWorktree = (mainCheckout: string, worktreePath: string, branch: string, log: string[]): void => {
  const rm = run('git', ['worktree', 'remove', '--force', worktreePath], { cwd: mainCheckout })
  if (rm.ok) log.push('rolled back worktree')
  const delBranch = run('git', ['branch', '-D', branch], { cwd: mainCheckout })
  if (delBranch.ok) log.push('rolled back branch')
}

const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '-')

const extractPrUrl = (stdout: string): string | null => {
  const match = /https?:\/\/\S+/.exec(stdout)
  return match ? match[0] : null
}

export const openUrl = (url: string): boolean => {
  // macOS uses `open`. Falls back gracefully on other platforms.
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  const r = run(cmd, [url])
  return r.ok
}
