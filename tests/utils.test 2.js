import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  debounce,
  base64UrlEncode,
  base64UrlDecode,
  serializeStateToURL,
  deserializeStateFromURL
} from '../src/utils.js';

const baseState = {
  trip: {
    city: 'Berlin',
    country: 'Germany',
    durationDays: 4,
    activities: ['pitching', 'networking'],
    generatedAt: '2024-05-01T08:00:00.000Z'
  },
  items: [
    { id: 'base-clothing-shirt', group: 'clothing', label: 'Shirt', checked: false, source: 'base' },
    { id: 'custom-other-business-cards', group: 'other', label: 'Business Cards', checked: true, source: 'custom' }
  ],
  weather: {
    summary: 'Rain',
    tempC: 12,
    minC: 6,
    maxC: 14,
    precipitation: 3,
    lastUpdated: '2024-05-01T07:50:00.000Z'
  }
};

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays invocation until after wait period', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 500);
    debounced();
    vi.advanceTimersByTime(400);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('resets timer on rapid calls', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 500);
    debounced();
    vi.advanceTimersByTime(300);
    debounced();
    vi.advanceTimersByTime(400);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('base64Url helpers', () => {
  it('encodes and decodes round-trip', () => {
    const original = 'Hello world?=ä';
    const encoded = base64UrlEncode(original);
    const decoded = base64UrlDecode(encoded);
    expect(decoded).toBe(original);
  });
});

describe('share serialization', () => {
  it('round-trips full state', () => {
    const url = serializeStateToURL(baseState, 'https://example.com/app.html');
    const parsed = deserializeStateFromURL(new URL(url).search);
    expect(parsed.trip).toEqual(baseState.trip);
    expect(parsed.items).toEqual(baseState.items);
    expect(parsed.weather).toEqual(baseState.weather);
  });

  it('supports large lists', () => {
    const largeState = {
      ...baseState,
      items: Array.from({ length: 120 }).map((_, index) => ({
        id: `item-${index}`,
        group: index % 2 === 0 ? 'tech' : 'clothing',
        label: `Item ${index}`,
        checked: index % 3 === 0,
        source: 'base'
      }))
    };
    const url = serializeStateToURL(largeState, 'https://example.com/app.html');
    const parsed = deserializeStateFromURL(new URL(url).search);
    expect(parsed.items.length).toBe(largeState.items.length);
  });

  it('returns null for invalid payloads', () => {
    const result = deserializeStateFromURL('?s=invalidpayload');
    expect(result).toBeNull();
  });
});
