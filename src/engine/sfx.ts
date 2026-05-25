import { playSfx } from './audio'

const SFX_URLS = {
  click: '/sfx/click-f.mp3',
  hover: '/sfx/hover.mp3',
  drop: '/sfx/drop.mp3',
  place: '/sfx/place.mp3',
  loadFilm: '/sfx/load-film.mp3',
} as const

export const playClick = (): void => {
  playSfx(SFX_URLS.click)
}

export const playHover = (): void => {
  playSfx(SFX_URLS.hover)
}

export const playDrop = (): void => {
  playSfx(SFX_URLS.drop)
}

export const playPlace = (): void => {
  playSfx(SFX_URLS.place)
}

export const playLoadFilm = (): void => {
  playSfx(SFX_URLS.loadFilm)
}
