import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playSfx } from '../audio'
import { playClick, playDrop, playHover, playLoadFilm, playPlace } from '../sfx'

vi.mock('../audio', () => ({
  playSfx: vi.fn(),
}))

describe('sfx helpers', () => {
  beforeEach(() => {
    vi.mocked(playSfx).mockClear()
  })

  it('playClick uses click-f.mp3', () => {
    playClick()
    expect(playSfx).toHaveBeenCalledWith('/sfx/click-f.mp3')
  })

  it('playHover uses hover.mp3', () => {
    playHover()
    expect(playSfx).toHaveBeenCalledWith('/sfx/hover.mp3')
  })

  it('playDrop uses drop.mp3', () => {
    playDrop()
    expect(playSfx).toHaveBeenCalledWith('/sfx/drop.mp3')
  })

  it('playPlace uses place.mp3', () => {
    playPlace()
    expect(playSfx).toHaveBeenCalledWith('/sfx/place.mp3')
  })

  it('playLoadFilm uses load-film.mp3', () => {
    playLoadFilm()
    expect(playSfx).toHaveBeenCalledWith('/sfx/load-film.mp3')
  })
})
