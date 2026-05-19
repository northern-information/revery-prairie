import { keyToDirection } from '@/engine/input'

describe('input contract: keybindings', () => {
  describe('WASD movement', () => {
    it('w maps to upLeft (screen up)', () => {
      expect(keyToDirection('w')).toBe('upLeft')
    })

    it('a maps to downLeft (screen left)', () => {
      expect(keyToDirection('a')).toBe('downLeft')
    })

    it('s maps to downRight (screen down)', () => {
      expect(keyToDirection('s')).toBe('downRight')
    })

    it('d maps to upRight (screen right)', () => {
      expect(keyToDirection('d')).toBe('upRight')
    })

    it('uppercase WASD maps correctly', () => {
      expect(keyToDirection('W')).toBe('upLeft')
      expect(keyToDirection('A')).toBe('downLeft')
      expect(keyToDirection('S')).toBe('downRight')
      expect(keyToDirection('D')).toBe('upRight')
    })
  })

  describe('arrow key movement', () => {
    it('ArrowUp maps to upLeft', () => {
      expect(keyToDirection('ArrowUp')).toBe('upLeft')
    })

    it('ArrowDown maps to downRight', () => {
      expect(keyToDirection('ArrowDown')).toBe('downRight')
    })

    it('ArrowLeft maps to downLeft', () => {
      expect(keyToDirection('ArrowLeft')).toBe('downLeft')
    })

    it('ArrowRight maps to upRight', () => {
      expect(keyToDirection('ArrowRight')).toBe('upRight')
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

    it('f returns null', () => {
      expect(keyToDirection('f')).toBeNull()
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
