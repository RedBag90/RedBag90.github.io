import { qs } from './utils.js';
import { initChecklist, generateChecklist } from './checklist.js';
import { showLoadingWeather, handleLocationChange } from './weather.js';
import { debounce } from './utils.js';

// helper to read form values in one place
function getFormData() {
  const tripRole  = qs('#tripRole').value;
  const activities = Array.from(
    document.querySelectorAll('.activity:checked')
  ).map(el => el.value);
  return {tripRole, activities };
}

// === Generate button ===
qs('#generateBtn').addEventListener('click', () => {
  const data = getFormData();
  generateChecklist(data);

  // fetch & display weather
  showLoadingWeather();
  handleLocationChange();
});

// === Weather city option change ===
document
  .querySelectorAll('input[name="cityOption"]')
  .forEach(radio =>
    radio.addEventListener('change', () => {
      showLoadingWeather();
      handleLocationChange();
    })
  );

  // === Debounce custom-city input ===
  qs('#customCity').addEventListener(
  'input',
  debounce(() => {
    showLoadingWeather();
    handleLocationChange();
  }, 500)
  );

// === On page load: init checklist & weather ===
window.addEventListener('DOMContentLoaded', () => {
  const data = getFormData();
  initChecklist(data);

  showLoadingWeather();
  handleLocationChange();
  });
