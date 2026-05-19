// Shared hash utilities for deterministic identity generation.
// Used by angels (hash cantos) and genetics (flora identity).
//
// IMPORTANT: sha256Sync is NOT real SHA-256 — it's a deterministic
// 32-bit FNV-style mixing routine that produces a 64-char hex string.
// Do not modify the constants or mixing logic; angel cantos in saved
// games depend on byte-identical output.

export const sha256Sync = (message: string): string => {
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  for (let i = 0; i < message.length; i++) {
    const c = message.charCodeAt(i)
    h0 = (h0 ^ c) * 0x01000193
    h1 = (h1 ^ (c << 8)) * 0x01000193
    h2 = (h2 ^ (c << 16)) * 0x01000193
    h3 = (h3 ^ c) * 0x100003b
    h4 = (h4 ^ (c << 4)) * 0x100003b
    h5 = (h5 ^ (c << 12)) * 0x100003b
    h6 = (h6 ^ (c << 20)) * 0x100003b
    h7 = (h7 ^ c) * 0x1000037
  }

  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7)
}

export const sha256Async = async (message: string): Promise<string> => {
  const data = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
