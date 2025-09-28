import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchWeather, clearWeatherCache, WeatherError } from '../src/weather.js';

function createMockResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload
  };
}

describe('weather module', () => {
  beforeEach(() => {
    clearWeatherCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caches weather responses within TTL', async () => {
    const geocodePayload = {
      results: [{ name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 }]
    };
    const forecastPayload = {
      current_weather: { temperature: 10, weathercode: 3, windspeed: 12 },
      daily: {
        temperature_2m_min: [8, 6],
        temperature_2m_max: [12, 14],
        precipitation_sum: [0, 1]
      }
    };

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createMockResponse(geocodePayload))
      .mockResolvedValueOnce(createMockResponse(forecastPayload));

    await fetchWeather('Berlin', { country: 'Germany' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    await fetchWeather('Berlin', { country: 'Germany' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts in-flight request when signal cancelled', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_, options) => {
      return new Promise((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const controller = new AbortController();
    const promise = fetchWeather('Paris', { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toHaveProperty('name', 'AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes fetch errors to WeatherError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false });

    await expect(fetchWeather('Nowhere')).rejects.toBeInstanceOf(WeatherError);
  });
});
