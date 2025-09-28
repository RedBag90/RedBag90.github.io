/**
 * Shared utility helpers for the Business Trip Checklist application.
 */

const STORAGE_KEY = 'business-trip-checklist-state';

export const CHECKLIST_TEMPLATE = {
  clothing: ['Shirt', 'Trousers', 'Jacket'],
  tech: ['Laptop', 'Charger', 'Phone'],
  documents: ['Passport', 'Tickets', 'Insurance']
};

const SHARE_PARAM = 's';
const LEGACY_PARAM = 'state';
const SHARE_KEY_VERSION = 1;

const SHARE_KEYS = {
  rootTrip: 't',
  rootItems: 'i',
  rootWeather: 'w',
  version: 'v',
  trip: {
    city: 'c',
    country: 'o',
    durationDays: 'd',
    activities: 'a',
    generatedAt: 'g'
  },
  item: {
    id: 'i',
    group: 'g',
    label: 'l',
    checked: 'k',
    source: 's'
  },
  weather: {
    summary: 'y',
    tempC: 'tc',
    minC: 'mn',
    maxC: 'mx',
    precipitation: 'p',
    lastUpdated: 'u'
  }
};

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function ce(tag, props = {}) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  return el;
}

export function debounce(fn, delay = 500) {
  let timer;
  function debounced(...args) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(this, args), delay);
  }
  debounced.cancel = () => window.clearTimeout(timer);
  return debounced;
}

export function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatDateTime(date = new Date()) {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function mapDurationToItems(days) {
  const duration = Number.isFinite(days) && days > 0 ? Math.ceil(days) : 1;
  const socks = `${duration}x Socks`;
  const shirts = `${Math.max(Math.ceil(duration / 2), 1)}x Casual Shirts`;
  const outer = duration > 4 ? 'Spare Jacket' : 'Light Sweater';
  const tech = duration > 3 ? ['Extension Cord'] : [];
  const clothingItems = [socks, shirts, outer];
  return [
    ...clothingItems.map(label => ({ group: 'clothing', label, source: 'duration' })),
    ...tech.map(label => ({ group: 'tech', label, source: 'duration' }))
  ];
}

export function mapWeatherToItems(weather) {
  if (!weather) {
    return [];
  }
  const precipitation = pickFirstNumber([
    weather.precipitation,
    weather.precipitation_sum,
    weather.rain
  ]);
  const minTemp = pickFirstNumber([
    weather.minC,
    weather.temperatureMin,
    weather.low
  ]);
  const maxTemp = pickFirstNumber([
    weather.maxC,
    weather.temperatureMax,
    weather.high
  ]);
  const items = [];
  if (typeof precipitation === 'number' && precipitation > 0) {
    items.push({ group: 'other', label: 'Umbrella', source: 'weather' });
    items.push({ group: 'clothing', label: 'Raincoat', source: 'weather' });
  }
  if (typeof minTemp === 'number' && minTemp < 5) {
    items.push({ group: 'clothing', label: 'Gloves', source: 'weather' });
    items.push({ group: 'clothing', label: 'Wool Beanie', source: 'weather' });
  }
  if (typeof maxTemp === 'number' && maxTemp > 24) {
    items.push({ group: 'other', label: 'Sunscreen', source: 'weather' });
    items.push({ group: 'other', label: 'Sunglasses', source: 'weather' });
  }
  return dedupeByLabel(items);
}

function pickFirstNumber(values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function dedupeByLabel(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.group}:${item.label.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function saveAppState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Unable to persist app state', err);
  }
}

export function loadAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Unable to load stored state', err);
    return null;
  }
}

export function clearAppState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Unable to clear stored state', err);
  }
}

export function serializeStateToURL(state, baseUrl = `${window.location.origin}${window.location.pathname}`) {
  if (!state) {
    return baseUrl;
  }
  const payload = {
    [SHARE_KEYS.version]: SHARE_KEY_VERSION,
    [SHARE_KEYS.rootTrip]: compressTrip(state.trip ?? {}),
    [SHARE_KEYS.rootItems]: (state.items ?? []).map(compressItem),
    [SHARE_KEYS.rootWeather]: state.weather ? compressWeather(state.weather) : undefined
  };
  if (!payload[SHARE_KEYS.rootWeather]) {
    delete payload[SHARE_KEYS.rootWeather];
  }
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const url = new URL(baseUrl);
  url.searchParams.set(SHARE_PARAM, encoded);
  return url.toString();
}

export function deserializeStateFromURL(search = window.location.search) {
  const params = new URLSearchParams(search);
  const encoded = params.get(SHARE_PARAM);
  if (encoded) {
    try {
      const json = JSON.parse(base64UrlDecode(encoded));
      return expandPayload(json);
    } catch (err) {
      console.warn('Unable to decode share payload', err);
      return null;
    }
  }
  const legacy = params.get(LEGACY_PARAM);
  if (legacy) {
    try {
      return JSON.parse(decodeURIComponent(escape(window.atob(legacy))));
    } catch (err) {
      console.warn('Unable to decode legacy share payload', err);
    }
  }
  return null;
}

function compressTrip(trip = {}) {
  return {
    [SHARE_KEYS.trip.city]: trip.city ?? '',
    [SHARE_KEYS.trip.country]: trip.country ?? '',
    [SHARE_KEYS.trip.durationDays]: trip.durationDays ?? 3,
    [SHARE_KEYS.trip.activities]: Array.isArray(trip.activities) ? trip.activities : [],
    [SHARE_KEYS.trip.generatedAt]: trip.generatedAt ?? null
  };
}

function compressItem(item) {
  return {
    [SHARE_KEYS.item.id]: item.id,
    [SHARE_KEYS.item.group]: item.group,
    [SHARE_KEYS.item.label]: item.label,
    [SHARE_KEYS.item.checked]: item.checked ? 1 : 0,
    [SHARE_KEYS.item.source]: item.source
  };
}

function compressWeather(weather) {
  return {
    [SHARE_KEYS.weather.summary]: weather.summary ?? '',
    [SHARE_KEYS.weather.tempC]: isFiniteNumber(weather.tempC) ? weather.tempC : null,
    [SHARE_KEYS.weather.minC]: isFiniteNumber(weather.minC) ? weather.minC : null,
    [SHARE_KEYS.weather.maxC]: isFiniteNumber(weather.maxC) ? weather.maxC : null,
    [SHARE_KEYS.weather.precipitation]: isFiniteNumber(weather.precipitation) ? weather.precipitation : null,
    [SHARE_KEYS.weather.lastUpdated]: weather.lastUpdated ?? null
  };
}

function expandPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const tripPayload = payload[SHARE_KEYS.rootTrip] ?? {};
  const itemsPayload = Array.isArray(payload[SHARE_KEYS.rootItems]) ? payload[SHARE_KEYS.rootItems] : [];
  const weatherPayload = payload[SHARE_KEYS.rootWeather] ?? null;
  return {
    trip: {
      city: tripPayload[SHARE_KEYS.trip.city] ?? '',
      country: tripPayload[SHARE_KEYS.trip.country] ?? '',
      durationDays: Number.parseInt(tripPayload[SHARE_KEYS.trip.durationDays] ?? '3', 10) || 3,
      activities: Array.isArray(tripPayload[SHARE_KEYS.trip.activities]) ? tripPayload[SHARE_KEYS.trip.activities] : [],
      generatedAt: tripPayload[SHARE_KEYS.trip.generatedAt] ?? null
    },
    items: itemsPayload
      .map(item => ({
        id: item[SHARE_KEYS.item.id],
        group: item[SHARE_KEYS.item.group],
        label: item[SHARE_KEYS.item.label],
        checked: Boolean(item[SHARE_KEYS.item.checked]),
        source: item[SHARE_KEYS.item.source] ?? 'base'
      }))
      .filter(item => item.id && item.label && item.group),
    weather: weatherPayload
      ? {
          summary: weatherPayload[SHARE_KEYS.weather.summary] ?? '',
          tempC: nullableNumber(weatherPayload[SHARE_KEYS.weather.tempC]),
          minC: nullableNumber(weatherPayload[SHARE_KEYS.weather.minC]),
          maxC: nullableNumber(weatherPayload[SHARE_KEYS.weather.maxC]),
          precipitation: nullableNumber(weatherPayload[SHARE_KEYS.weather.precipitation]),
          lastUpdated: weatherPayload[SHARE_KEYS.weather.lastUpdated] ?? null
        }
      : null
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nullableNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function base64UrlEncode(str) {
  return window
    .btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlDecode(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + '='.repeat(padLength);
  return decodeURIComponent(escape(window.atob(padded)));
}

export function pickWeatherCacheKey(city, country) {
  const base = `${city || ''}`.trim().toLowerCase();
  const nation = `${country || ''}`.trim().toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  return `${base}|${nation}|${date}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function splitItemsByChecked(items = []) {
  return {
    toPack: items.filter(item => !item.checked),
    packed: items.filter(item => item.checked)
  };
}

export function groupItemsByGroup(items = []) {
  return items.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }
    acc[item.group].push(item);
    return acc;
  }, {});
}

export function showToast(message, variant = 'info') {
  let toast = qs('#toast');
  if (!toast) {
    toast = ce('div', { id: 'toast', className: 'toast' });
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.remove('toast--success', 'toast--error');
  if (variant === 'success') {
    toast.classList.add('toast--success');
  }
  if (variant === 'error') {
    toast.classList.add('toast--error');
  }
  toast.classList.add('toast-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove('toast-visible');
  }, 2500);
}
