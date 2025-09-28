import powerData from '../assets/data/country-power.json';

export function getPowerInfo(countryCode) {
  if (!countryCode) {
    return null;
  }
  const normalized = countryCode.toUpperCase();
  return powerData[normalized] || null;
}

export function listAvailableCountries() {
  return Object.keys(powerData).sort();
}
