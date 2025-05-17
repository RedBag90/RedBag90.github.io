
// weather.js
import { qs } from './utils.js';

/** 
 * Geo-look up + forecast fetch.
 * Returns { weatherData, name, country } or throws on “not found.”
 */
async function fetchWeatherData(location) {
  // 1) Geocode
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?`
    + `name=${encodeURIComponent(location)}&count=1`;
  const geoRes  = await fetch(geoUrl);
  const geoJson = await geoRes.json();

  if (!geoJson.results?.length) {
    throw new Error('Location not found.');
  }
  const { latitude, longitude, name, country } = geoJson.results[0];

  // 2) Forecast (today + tomorrow daily + current weather)
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?`
    + `latitude=${latitude}&longitude=${longitude}`
    + `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum`
    + `&current_weather=true&timezone=auto`;
  const weatherRes  = await fetch(weatherUrl);
  const weatherJson = await weatherRes.json();

  return { weatherData: weatherJson, name, country };
}

// weather.js
export function showLoadingWeather() {
    const out = qs('#weatherOutput');
    out.textContent = 'Loading weather…';
    out.classList.remove('weather-loaded');
    out.classList.add('weather-loading');
  }
  


  // weather.js
export async function handleLocationChange() {
    const choice = qs('input[name="cityOption"]:checked').value;
    const city   = choice === 'custom'
      ? qs('#customCity').value.trim()
      : choice;
    const out = qs('#weatherOutput');
  
    if (!city) {
      out.textContent = 'Please enter a location to see the weather.';
      out.classList.remove('weather-loading', 'weather-loaded');
      return;
    }
  
    // kick off loading state
    out.classList.remove('weather-loaded');
    out.classList.add('weather-loading');
    out.textContent = 'Loading weather…';
  
    try {
      const { weatherData, name, country } = await fetchWeatherData(city);
  
      // pull today + tomorrow
      const { temperature } = weatherData.current_weather;
      const minT   = weatherData.daily.temperature_2m_min[1];
      const maxT   = weatherData.daily.temperature_2m_max[1];
      const rainT  = weatherData.daily.precipitation_sum[1];
      const rainMsg = rainT > 0
        ? `🌧️ Rain expected tomorrow: ${rainT} mm`
        : `🌞 No rain expected tomorrow.`;
  
      out.innerHTML = `
        <strong>Weather in ${name}, ${country}:</strong><br />
        🌡️ Today: ${temperature}°C<br />
        🔻 Tomorrow Min: ${minT}°C<br />
        🔺 Tomorrow Max: ${maxT}°C<br />
        ${rainMsg}
      `;
    } catch (err) {
      // distinguish “not found” vs other errors
      out.textContent = err.message === 'Location not found.'
        ? 'Location not found.'
        : 'Unable to load weather data.';
      console.error(err);
    } finally {
      // end loading state
      out.classList.remove('weather-loading');
      out.classList.add('weather-loaded');
    }
  }
  