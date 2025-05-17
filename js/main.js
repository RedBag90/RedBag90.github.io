/**
 * @file main.js
 * @description
 * Initializes UI interactions for the packing checklist and weather modules.
 * Handles form input reading, button clicks, radio changes, debounced text input,
 * and entry-point logic on page load. Coordinates generate/init of checklist
 * and weather display.
 */

import { qs } from './utils.js';
import { initChecklist, generateChecklist, updatePackingProgress } from './checklist.js';
import { showLoadingWeather, handleLocationChange } from './weather.js';
import { debounce } from './utils.js';

// ===========================
// Form Data Extraction
// ===========================
/**
 * Reads the current state of the activities checkboxes on the page.
 * @returns {{ activities: string[] }} Object containing an array of selected activity values.
 */
function getFormData() {
  // Query all checked activity inputs
  const activities = Array.from(
    document.querySelectorAll('.activity:checked')
  ).map(el => el.value);

  return { activities };
}

// ===========================
// Event Handlers
// ===========================

// Generate button click: rebuild checklist and refresh weather
qs('#generateBtn').addEventListener('click', () => {
  const data = getFormData();

  // Re-generate packing checklist based on selected activities
  generateChecklist(data);

  // Show loading indicator and fetch updated weather
  showLoadingWeather();
  handleLocationChange();
  updatePackingProgress();
});

// Weather city selection change: update weather display
// Applied to both predefined city radio buttons
document
  .querySelectorAll('input[name="cityOption"]')
  .forEach(radio =>
    radio.addEventListener('change', () => {
      showLoadingWeather();
      handleLocationChange();
    })
  );

// Custom city input: debounced update to avoid excessive calls
qs('#customCity').addEventListener(
  'input',
  debounce(() => {
    showLoadingWeather();
    handleLocationChange();
  }, 500)
);

// ===========================
// Initialization on Page Load
// ===========================
/**
 * Entry point after DOM content is fully loaded.
 * Initializes packing checklist and weather display using default form state.
 */
window.addEventListener('DOMContentLoaded', () => {
  const data = getFormData();

  // Restore or generate initial checklist
  initChecklist(data);

  // Initialize weather module
  showLoadingWeather();
  handleLocationChange();
});
