export const hashString = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

export const tileHash = (x: number, y: number): number => ((x * 374761393 + y * 668265263) >>> 0) % 2147483647

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi))

export const dist = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
