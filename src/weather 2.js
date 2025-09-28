/**
 * Weather module: handles forecast fetching with caching and UI updates.
 */

import { qs, ce, pickWeatherCacheKey, mapWeatherToItems } from './utils.js';

const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache = new Map();

const WEATHER_CONFIG = {
  geocodeUrl: 'https://geocoding-api.open-meteo.com/v1/search',
  forecastUrl: 'https://api.open-meteo.com/v1/forecast'
};

export function configureWeather(options = {}) {
  Object.assign(WEATHER_CONFIG, options);
}

export async function fetchWeather(city, { country = '', signal } = {}) {
  const trimmedCity = (city || '').trim();
  if (!trimmedCity) {
    throw new WeatherError('Please enter a city.', 'empty-city');
  }
  const cacheKey = pickWeatherCacheKey(trimmedCity, country);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ...cached.data, fromCache: true };
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const location = await geocode(trimmedCity, country, controller.signal);
    const forecast = await getForecast(location, controller.signal);
    const normalized = normalizeWeather(location, forecast);
    cache.set(cacheKey, {
      data: normalized,
      expiresAt: now + WEATHER_CACHE_TTL
    });
    return normalized;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof WeatherError) {
      throw err;
    }
    throw new WeatherError('Unable to load weather data.', 'unknown-error', err);
  }
}

async function geocode(city, country, signal) {
  const params = new URLSearchParams({
    name: country ? `${city},${country}` : city,
    count: '1'
  });
  const res = await fetch(`${WEATHER_CONFIG.geocodeUrl}?${params.toString()}`, {
    signal
  });
  if (!res.ok) {
    throw new WeatherError('Location lookup failed.', 'geocode-error');
  }
  const json = await res.json();
  const result = json.results?.[0];
  if (!result) {
    throw new WeatherError('Location not found.', 'not-found');
  }
  return {
    name: result.name,
    country: result.country || result.admin1 || '',
    latitude: result.latitude,
    longitude: result.longitude
  };
}

async function getForecast(location, signal) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current_weather: 'true',
    daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum',
    timezone: 'auto'
  });
  const res = await fetch(`${WEATHER_CONFIG.forecastUrl}?${params.toString()}`, {
    signal
  });
  if (!res.ok) {
    throw new WeatherError('Weather service unavailable.', 'forecast-error');
  }
  return res.json();
}

function normalizeWeather(location, payload) {
  const current = payload.current_weather || {};
  const tomorrowIndex = 1;
  const normalized = {
    location,
    summary: mapWeatherCodeToSummary(current.weathercode),
    tempC: isFinite(current.temperature) ? current.temperature : null,
    windKph: isFinite(current.windspeed) ? current.windspeed : null,
    minC: extractDaily(payload.daily?.temperature_2m_min, tomorrowIndex),
    maxC: extractDaily(payload.daily?.temperature_2m_max, tomorrowIndex),
    precipitation: extractDaily(payload.daily?.precipitation_sum, tomorrowIndex),
    lastUpdated: new Date().toISOString()
  };
  return normalized;
}

function extractDaily(array, index) {
  if (!Array.isArray(array) || array.length <= index) {
    return null;
  }
  const value = array[index];
  return Number.isFinite(value) ? value : null;
}

const CODE_SUMMARIES = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm'
};

function mapWeatherCodeToSummary(code) {
  if (code === undefined || code === null) {
    return 'Unknown';
  }
  return CODE_SUMMARIES[code] || 'Mixed weather';
}

export function renderWeatherStatus({ status, data, error, onRetry } = {}) {
  const output = qs('#weatherOutput');
  if (!output) {
    return;
  }
  output.classList.remove('weather-loading', 'weather-error', 'weather-success');
  output.innerHTML = '';

  switch (status) {
    case 'loading':
      output.textContent = 'Loading weather…';
      output.classList.add('weather-loading');
      break;
    case 'success':
      output.classList.add('weather-success');
      output.innerHTML = renderWeatherHtml(data);
      break;
    case 'error': {
      output.classList.add('weather-error');
      const message = ce('div', { textContent: error?.message || 'Weather unavailable.' });
      output.append(message);
      if (typeof onRetry === 'function') {
        const button = ce('button', {
          type: 'button',
          className: 'btn btn-small weather-retry-btn',
          textContent: 'Retry'
        });
        button.addEventListener('click', onRetry, { once: true });
        output.append(button);
      }
      break;
    }
    default:
      output.textContent = 'Enter a destination to see the forecast.';
  }
}

function renderWeatherHtml(weather) {
  if (!weather) {
    return '<p>No weather data.</p>';
  }
  const parts = [];
  parts.push(`<strong>${weather.location?.name || 'Destination'}</strong>`);
  if (weather.location?.country) {
    parts.push(`<span class="weather-country">${weather.location.country}</span>`);
  }
  const summary = weather.summary ? weather.summary : '—';
  parts.push(`<span>Summary: ${summary}</span>`);
  if (weather.tempC !== null) {
    parts.push(`<span>Current: ${weather.tempC}°C</span>`);
  }
  if (weather.minC !== null || weather.maxC !== null) {
    parts.push(`<span>Tomorrow: ${weather.minC ?? '—'}°C / ${weather.maxC ?? '—'}°C</span>`);
  }
  if (weather.precipitation !== null) {
    parts.push(`<span>Precipitation: ${weather.precipitation} mm</span>`);
  }
  return `<div class="weather-summary">${parts
    .map(part => `<div>${part}</div>`)
    .join('')}</div>`;
}

export function extractWeatherChecklistItems(weather) {
  return mapWeatherToItems({
    minC: weather?.minC,
    maxC: weather?.maxC,
    precipitation: weather?.precipitation
  });
}

export function clearWeatherCache() {
  cache.clear();
}

export class WeatherError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'WeatherError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
  }
}

