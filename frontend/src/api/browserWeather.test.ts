import { afterEach, describe, expect, it, vi } from 'vitest'
import { withBrowserWeather, type WeatherPayload } from './browserWeather'
import { ApiError } from './client'
import { toCellForecast, type WeatherRequest } from './openMeteo'

const REQUEST: WeatherRequest = {
  cells: [
    [51.05, -114.05],
    [49.7, -112.85],
  ],
  start_hour: '2026-11-08T21:00',
  end_hour: '2026-11-08T23:00',
  variables: ['wind_speed_10m', 'rain', 'showers', 'snowfall'],
}

const weatherRequired = (request: WeatherRequest = REQUEST) =>
  new ApiError(409, 'Forecasts are needed', 'weather_required', {}, { weather_request: request })

/** Open-Meteo's multi-location response for the given number of locations. */
function openMeteoResponse(count: number, wind = 40) {
  const location = {
    latitude: 51.04,
    longitude: -114.07,
    hourly: {
      time: [1793998800, 1794002400, 1794006000],
      wind_speed_10m: [wind, wind, wind],
      rain: [0, 0.1, 0],
      showers: [0, 0, 0],
      snowfall: [0, 0, 0],
    },
  }
  return new Response(JSON.stringify(count === 1 ? location : Array(count).fill(location)))
}

afterEach(() => vi.unstubAllGlobals())

describe('toCellForecast', () => {
  it('keeps the requested cell (not Open-Meteo’s grid point) and maps variable names', () => {
    const forecast = toCellForecast(
      [51.05, -114.05],
      { hourly: { time: [100, 3700], wind_speed_10m: [12, 14], wind_gusts_10m: [20, 22] } },
      ['wind_speed_10m', 'wind_gusts_10m'],
    )
    expect(forecast).toMatchObject({
      lat: 51.05,
      lon: -114.05,
      start: 100,
      wind: [12, 14],
      gust: [20, 22],
    })
  })
})

describe('withBrowserWeather', () => {
  it('fetches exactly what the API asked for and repeats the request with it', async () => {
    const fetchMock = vi.fn(async (_url: string) => openMeteoResponse(2))
    vi.stubGlobal('fetch', fetchMock)
    const sent: (WeatherPayload | undefined)[] = []
    const stages: string[] = []

    const result = await withBrowserWeather(
      async (weather) => {
        sent.push(weather)
        if (!weather) throw weatherRequired()
        return 'plan'
      },
      { onStage: (stage) => stages.push(stage) },
    )

    expect(result).toBe('plan')
    expect(stages).toEqual(['weather', 'rating'])
    expect(sent[0]).toBeUndefined()
    expect(sent[1]?.cells.map((c) => [c.lat, c.lon])).toEqual(REQUEST.cells)
    expect(sent[1]?.cells[0].wind).toEqual([40, 40, 40])

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin).toBe('https://api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('51.05,49.7')
    expect(url.searchParams.get('start_hour')).toBe('2026-11-08T21:00')
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph')
    expect(url.searchParams.get('precipitation_unit')).toBe('inch')
  })

  it('goes straight through when the server fetches weather itself', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await withBrowserWeather(async () => 'plan')).toBe('plan')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives up after a few rounds instead of looping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => openMeteoResponse(1)),
    )
    const send = vi.fn(async () => {
      throw weatherRequired({ ...REQUEST, cells: [[45, -100]], start_hour: `${Math.random()}` })
    })

    await expect(withBrowserWeather(send)).rejects.toMatchObject({ code: 'weather_unavailable' })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('reports the visitor’s own weather quota clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 })),
    )
    const request = { ...REQUEST, end_hour: '2026-11-09T05:00' } // not cached by earlier tests

    await expect(
      withBrowserWeather(async (weather) => {
        if (!weather) throw weatherRequired(request)
        return 'plan'
      }),
    ).rejects.toMatchObject({ code: 'weather_quota', status: 429 })
  })

  it('reuses cached forecasts that cover a later, narrower request', async () => {
    const fetchMock = vi.fn(async (_url: string) => openMeteoResponse(1))
    vi.stubGlobal('fetch', fetchMock)
    const wide: WeatherRequest = {
      cells: [[40.5, -100.5]],
      start_hour: '2026-11-10T00:00',
      end_hour: '2026-11-12T12:00',
      variables: ['wind_speed_10m', 'wind_gusts_10m', 'rain', 'showers', 'snowfall'],
    }
    const narrow: WeatherRequest = {
      ...wide,
      start_hour: '2026-11-10T06:00',
      end_hour: '2026-11-11T00:00',
      variables: ['wind_speed_10m', 'rain', 'showers', 'snowfall'],
    }

    for (const request of [wide, narrow]) {
      await withBrowserWeather(async (weather) => {
        if (!weather) throw weatherRequired(request)
        return 'ok'
      })
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passes other API errors through untouched', async () => {
    const error = new ApiError(422, 'No truck route', 'no_route')
    await expect(withBrowserWeather(async () => Promise.reject(error))).rejects.toBe(error)
  })
})
