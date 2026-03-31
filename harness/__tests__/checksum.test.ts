import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checksumsMatch, hashFile, hashFiles } from '../src/checksum.ts'

describe('hashFile', () => {
  it('returns SHA-256 hex for an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checksum-test-'))
    const filePath = join(dir, 'test.txt')
    writeFileSync(filePath, 'hello world', 'utf-8')

    const expected = createHash('sha256').update('hello world').digest('hex')
    expect(hashFile(filePath)).toBe(expected)
  })

  it('returns null for a nonexistent file', () => {
    expect(hashFile('/tmp/definitely-does-not-exist-abc123')).toBeNull()
  })

  it('returns different hashes for different contents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checksum-test-'))
    const a = join(dir, 'a.txt')
    const b = join(dir, 'b.txt')
    writeFileSync(a, 'aaa', 'utf-8')
    writeFileSync(b, 'bbb', 'utf-8')

    expect(hashFile(a)).not.toBe(hashFile(b))
  })
})

describe('hashFiles', () => {
  it('hashes multiple files relative to a root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checksum-test-'))
    writeFileSync(join(dir, 'a.txt'), 'aaa', 'utf-8')
    writeFileSync(join(dir, 'b.txt'), 'bbb', 'utf-8')

    const result = hashFiles(['a.txt', 'b.txt'], dir)

    expect(result['a.txt']).toBeTruthy()
    expect(result['b.txt']).toBeTruthy()
    expect(result['a.txt']).not.toBe(result['b.txt'])
  })

  it('returns null for missing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checksum-test-'))
    const result = hashFiles(['missing.txt'], dir)

    expect(result['missing.txt']).toBeNull()
  })
})

describe('checksumsMatch', () => {
  it('returns true for identical records', () => {
    const a = { 'file.ts': 'abc123', 'other.ts': 'def456' }
    expect(checksumsMatch(a, { ...a })).toBe(true)
  })

  it('returns false when a value differs', () => {
    const prev = { 'file.ts': 'abc123' }
    const curr = { 'file.ts': 'changed' }
    expect(checksumsMatch(prev, curr)).toBe(false)
  })

  it('returns false when key count differs', () => {
    const prev = { 'file.ts': 'abc123' }
    const curr = { 'file.ts': 'abc123', 'new.ts': 'def456' }
    expect(checksumsMatch(prev, curr)).toBe(false)
  })

  it('returns true for empty records', () => {
    expect(checksumsMatch({}, {})).toBe(true)
  })

  it('handles null values correctly', () => {
    const a = { 'file.ts': null }
    const b = { 'file.ts': null }
    expect(checksumsMatch(a, b)).toBe(true)

    const c = { 'file.ts': 'abc' }
    expect(checksumsMatch(a, c)).toBe(false)
  })
})
