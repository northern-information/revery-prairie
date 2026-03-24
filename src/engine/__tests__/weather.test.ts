import { Season, Sky } from '../types'
import { fToC, generateWeather, mphToKph, tickWeather } from '../weather'

describe('generateWeather', () => {
  it('returns weather with spring season', () => {
    const weather = generateWeather()
    expect(weather.season).toBe(Season.Spring)
  })

  it('returns temperature within spring range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.temperatureF).toBeGreaterThanOrEqual(35)
      expect(weather.temperatureF).toBeLessThanOrEqual(72)
    }
  })

  it('returns wind speed within spring range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.windSpeed).toBeGreaterThanOrEqual(3)
      expect(weather.windSpeed).toBeLessThanOrEqual(25)
    }
  })

  it('returns humidity within spring range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.humidity).toBeGreaterThanOrEqual(45)
      expect(weather.humidity).toBeLessThanOrEqual(85)
    }
  })

  it('returns a valid sky condition', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect([Sky.Sun, Sky.Cloudy, Sky.Rain]).toContain(weather.sky)
    }
  })

  it('returns a valid wind direction', () => {
    const validDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(validDirections).toContain(weather.windDirection)
    }
  })
})

describe('tickWeather', () => {
  it('keeps temperature within spring range after many ticks', () => {
    const weather = generateWeather()
    for (let i = 0; i < 200; i++) {
      tickWeather(weather)
      expect(weather.temperatureF).toBeGreaterThanOrEqual(35)
      expect(weather.temperatureF).toBeLessThanOrEqual(72)
    }
  })

  it('keeps humidity within spring range after many ticks', () => {
    const weather = generateWeather()
    for (let i = 0; i < 200; i++) {
      tickWeather(weather)
      expect(weather.humidity).toBeGreaterThanOrEqual(45)
      expect(weather.humidity).toBeLessThanOrEqual(85)
    }
  })

  it('keeps wind speed within spring range after many ticks', () => {
    const weather = generateWeather()
    for (let i = 0; i < 200; i++) {
      tickWeather(weather)
      expect(weather.windSpeed).toBeGreaterThanOrEqual(3)
      expect(weather.windSpeed).toBeLessThanOrEqual(25)
    }
  })

  it('does not change season', () => {
    const weather = generateWeather()
    for (let i = 0; i < 50; i++) {
      tickWeather(weather)
    }
    expect(weather.season).toBe(Season.Spring)
  })
})

describe('fToC', () => {
  it('converts 32°F to 0°C', () => {
    expect(fToC(32)).toBe(0)
  })

  it('converts 212°F to 100°C', () => {
    expect(fToC(212)).toBe(100)
  })

  it('converts 72°F to 22°C', () => {
    expect(fToC(72)).toBe(22)
  })

  it('converts 35°F to 2°C', () => {
    expect(fToC(35)).toBe(2)
  })
})

describe('mphToKph', () => {
  it('converts 10 mph to 16 kph', () => {
    expect(mphToKph(10)).toBe(16)
  })

  it('converts 25 mph to 40 kph', () => {
    expect(mphToKph(25)).toBe(40)
  })

  it('converts 3 mph to 5 kph', () => {
    expect(mphToKph(3)).toBe(5)
  })
})
