import { keyToDirection } from '@/engine/input'

describe('input contract: keybindings', () => {
  describe('WASD movement', () => {
    it('w maps to up', () => {
      expect(keyToDirection('w')).toBe('up')
    })

    it('a maps to left', () => {
      expect(keyToDirection('a')).toBe('left')
    })

    it('s maps to down', () => {
      expect(keyToDirection('s')).toBe('down')
    })

    it('d maps to right', () => {
      expect(keyToDirection('d')).toBe('right')
    })

    it('uppercase WASD maps correctly', () => {
      expect(keyToDirection('W')).toBe('up')
      expect(keyToDirection('A')).toBe('left')
      expect(keyToDirection('S')).toBe('down')
      expect(keyToDirection('D')).toBe('right')
    })
  })

  describe('arrow key movement', () => {
    it('ArrowUp maps to up', () => {
      expect(keyToDirection('ArrowUp')).toBe('up')
    })

    it('ArrowDown maps to down', () => {
      expect(keyToDirection('ArrowDown')).toBe('down')
    })

    it('ArrowLeft maps to left', () => {
      expect(keyToDirection('ArrowLeft')).toBe('left')
    })

    it('ArrowRight maps to right', () => {
      expect(keyToDirection('ArrowRight')).toBe('right')
    })
  })

  describe('non-movement keys return null', () => {
    it('r returns null', () => {
      expect(keyToDirection('r')).toBeNull()
    })

    it('i returns null', () => {
      expect(keyToDirection('i')).toBeNull()
    })

    it('x returns null', () => {
      expect(keyToDirection('x')).toBeNull()
    })

    it('e returns null', () => {
      expect(keyToDirection('e')).toBeNull()
    })

    it('Escape returns null', () => {
      expect(keyToDirection('Escape')).toBeNull()
    })

    it('arbitrary keys return null', () => {
      expect(keyToDirection('z')).toBeNull()
      expect(keyToDirection('1')).toBeNull()
      expect(keyToDirection(' ')).toBeNull()
    })
  })
})
