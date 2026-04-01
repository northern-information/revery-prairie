import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SHA-256 hash of a file's contents. Returns null if the file doesn't exist.
 */
export const hashFile = (filePath: string): string | null => {
  if (!existsSync(filePath)) return null
  const contents = readFileSync(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

/**
 * Hash multiple files relative to a root directory.
 * Returns a record of relative path -> SHA-256 hex string.
 * Missing files are included with a null value.
 */
export const hashFiles = (relativePaths: string[], repoRoot: string): Record<string, string | null> => {
  const result: Record<string, string | null> = {}
  for (const rel of relativePaths) {
    result[rel] = hashFile(resolve(repoRoot, rel))
  }
  return result
}

/**
 * Compare two checksum records. Returns true if every key in `current`
 * exists in `previous` with the same value, and vice versa.
 */
export const checksumsMatch = (
  previous: Record<string, string | null>,
  current: Record<string, string | null>
): boolean => {
  const prevKeys = Object.keys(previous)
  const currKeys = Object.keys(current)

  if (prevKeys.length !== currKeys.length) return false

  for (const key of currKeys) {
    if (previous[key] !== current[key]) return false
  }

  return true
}
