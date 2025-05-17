/**
 * @file weather.js
 * @description
 * Handles geolocation lookup and weather forecast fetching using the Open-Meteo APIs,
 * and updates the UI with loading states, error handling, and formatted weather info.
 */

import { qs } from './utils.js';

// ===========================
// Core Weather Data Fetcher
// ===========================
/**
 * Retrieves geolocation and weather forecast data for a given location name.
 * 1. Geocoding: converts a place name into latitude/longitude
 * 2. Forecast: fetches current weather plus daily min/max temperatures and precipitation
 *
 * @param {string} location - City or place name to look up (e.g., "Berlin").
 * @returns {Promise<{ weatherData: Object, name: string, country: string }>} 
 *          Resolves with weather JSON and location metadata, or rejects if not found.
 * @throws {Error} Throws 'Location not found.' if geocoding yields no results.
 */
async function fetchWeatherData(location) {
  // --- Geocoding Request ---
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?`
    + `name=${encodeURIComponent(location)}&count=1`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) {
    throw new Error(`Geocoding error: ${geoRes.status}`);
  }
  const geoJson = await geoRes.json();

  // Validate geocoding results
  if (!geoJson.results?.length) {
    throw new Error('Location not found.');
  }

  // Extract coordinates and name metadata
  const { latitude, longitude, name, country } = geoJson.results[0];

  // --- Weather Forecast Request ---
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?`
    + `latitude=${latitude}&longitude=${longitude}`
    + `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum`
    + `&current_weather=true&timezone=auto`;
  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) {
    throw new Error(`Weather API error: ${weatherRes.status}`);
  }
  const weatherJson = await weatherRes.json();

  // Return structured data for UI consumption
  return { weatherData: weatherJson, name, country };
}

// ===========================
// UI State Controllers
// ===========================
/**
 * Shows a loading placeholder in the weather output element.
 * Clears any existing loaded class and applies loading styles.
 */
export function showLoadingWeather() {
  const out = qs('#weatherOutput');
  out.textContent = 'Loading weather…';
  out.classList.remove('weather-loaded');
  out.classList.add('weather-loading');
}

// ===========================
// Main Handler: Location Change
// ===========================
/**
 * Event handler triggered when the user selects or enters a new city.
 * Manages loading states, input validation, API calls, and UI updates.
 *
 * @returns {Promise<void>}
 */
export async function handleLocationChange() {
  // Determine which city input to use: radio or custom text
  const choice = qs('input[name="cityOption"]:checked').value;
  const city = choice === 'custom'
    ? qs('#customCity').value.trim()
    : choice;
  const out = qs('#weatherOutput');

  // If no city provided, show prompt and abort
  if (!city) {
    out.textContent = 'Please enter a location to see the weather.';
    out.classList.remove('weather-loading', 'weather-loaded');
    return;
  }

  // Enter loading state
  out.classList.remove('weather-loaded');
  out.classList.add('weather-loading');
  out.textContent = 'Loading weather…';

  try {
    // Fetch data from APIs
    const { weatherData, name, country } = await fetchWeatherData(city);

    // Extract current and tomorrow's values
    const { temperature } = weatherData.current_weather;
    const minT = weatherData.daily.temperature_2m_min[1];
    const maxT = weatherData.daily.temperature_2m_max[1];
    const rainT = weatherData.daily.precipitation_sum[1];

    // Format precipitation message
    const rainMsg = rainT > 0
      ? `🌧️ Rain expected tomorrow: ${rainT} mm`
      : `🌞 No rain expected tomorrow.`;

    // Render structured HTML output
    out.innerHTML = `
      <strong>Weather in ${name}, ${country}:</strong><br />
      🌡️ Today: ${temperature}°C<br />
      🔻 Tomorrow Min: ${minT}°C<br />
      🔺 Tomorrow Max: ${maxT}°C<br />
      ${rainMsg}
    `;
  } catch (err) {
    // Display user-friendly error
    out.textContent = err.message === 'Location not found.'
      ? 'Location not found.'
      : 'Unable to load weather data.';
    console.error('Weather error:', err);
  } finally {
    // Always mark as loaded (removes spinner/loading style)
    out.classList.remove('weather-loading');
    out.classList.add('weather-loaded');
  }
}
