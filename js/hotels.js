// js/hotels.js
import { qs } from './utils.js';

// 1. 🔑 Paste your Yelp Fusion API key here:
const YELP_API_KEY = 'YOUR_YELP_API_KEY';

// 2. Airport coords for your preset cities:
const AIRPORT_COORDS = {
  HAM: { lat: 53.6333, lng: 10.0 },  // Hamburg Airport
  FRA: { lat: 50.0379, lng: 8.5622 }, // Frankfurt Airport
};

// Show loading state
export function showLoadingHotels() {
  const out = qs('#hotelsOutput');
  out.textContent = 'Loading hotels…';
}

// Fetch, sort by distance, and render hotels via Yelp Fusion
export async function handleHotelsFetch() {
  const choice = qs('input[name="cityOption"]:checked').value;
  let coords;

  if (choice === 'custom') {
    // Geocode "City Airport" via Nominatim (OSM)
    const cityName = qs('#customCity').value.trim();
    if (!cityName) {
      qs('#hotelsOutput').textContent = 'Please enter a city.';
      return;
    }
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName + ' Airport')}`
    );
    const nomJson = await nomRes.json();
    if (!nomJson.length) {
      qs('#hotelsOutput').textContent = 'Airport not found for that city.';
      return;
    }
    coords = {
      lat: parseFloat(nomJson[0].lat),
      lng: parseFloat(nomJson[0].lon)
    };
  } else {
    coords = AIRPORT_COORDS[choice];
  }

  const { lat, lng } = coords;
  // Yelp Fusion Business Search endpoint
  const yelpUrl =
    `https://api.yelp.com/v3/businesses/search` +
    `?latitude=${lat}` +
    `&longitude=${lng}` +
    `&radius=5000` +         // in meters
    `&categories=hotels` +
    `&limit=10`;

  const res = await fetch(yelpUrl, {
    headers: {
      Authorization: `Bearer ${YELP_API_KEY}`
    }
  });

  if (!res.ok) {
    qs('#hotelsOutput').textContent = 'Error fetching hotels from Yelp.';
    return;
  }

  const json = await res.json();
  // Map to include name, vicinity and distance, then sort by closeness
  const hotels = (json.businesses || [])
    .map(b => ({
      name: b.name,
      vicinity: [
        b.location.address1,
        b.location.city,
        b.location.zip_code
      ].filter(Boolean).join(', '),
      distance: b.distance // distance in meters
    }))
    .sort((a, b) => a.distance - b.distance);

  const out = qs('#hotelsOutput');
  if (!hotels.length) {
    out.textContent = 'No hotels found nearby.';
    return;
  }

  // Render sorted list of hotels with an ordered list
  out.innerHTML = '<ol>' + hotels.map(h =>
    `<li class="hotel-item">
       <strong>${h.name}</strong> (${Math.round(h.distance)} m)<br>
       ${h.vicinity || 'Address unavailable'}
     </li>`
  ).join('') + '</ol>';
}
