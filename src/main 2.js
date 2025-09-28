/**
 * Application entry point wiring form interactions, weather updates, and checklist state.
 */

import {
  qs,
  debounce,
  serializeStateToURL,
  deserializeStateFromURL,
  showToast
} from './utils.js';
import {
  initChecklist,
  updateTrip,
  generateChecklist,
  reconcileWeatherItems,
  setWeatherData,
  addCustomItem,
  getAppState,
  renderChecklistForExport
} from './checklist.js';
import {
  fetchWeather,
  renderWeatherStatus,
  extractWeatherChecklistItems,
  WeatherError
} from './weather.js';

const formSelectors = {
  city: '#city',
  country: '#country',
  duration: '#duration',
  activities: '.activity'
};

const clipboard = navigator.clipboard;
let pendingWeatherController = null;
let lastWeatherItems = [];

function readTripFromForm() {
  const city = qs(formSelectors.city)?.value.trim() ?? '';
  const country = qs(formSelectors.country)?.value.trim() ?? '';
  const duration = Number.parseInt(qs(formSelectors.duration)?.value ?? '3', 10) || 3;
  const activities = Array.from(document.querySelectorAll(formSelectors.activities))
    .filter(input => input.checked)
    .map(input => input.value);
  return {
    city,
    country,
    durationDays: duration,
    activities
  };
}

function populateFormFromState(trip) {
  if (!trip) {
    return;
  }
  const cityInput = qs(formSelectors.city);
  if (cityInput) {
    cityInput.value = trip.city || '';
  }
  const countryInput = qs(formSelectors.country);
  if (countryInput) {
    countryInput.value = trip.country || '';
  }
  const durationInput = qs(formSelectors.duration);
  if (durationInput) {
    durationInput.value = trip.durationDays ?? 3;
  }
  document.querySelectorAll(formSelectors.activities).forEach(input => {
    input.checked = Array.isArray(trip.activities)
      ? trip.activities.includes(input.value)
      : false;
  });
}

async function handleGenerate() {
  try {
    await requestWeatherUpdate({ reason: 'generate', silent: true });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error(err);
    }
  }
  const trip = readTripFromForm();
  updateTrip(trip);
  generateChecklist({ weatherItems: lastWeatherItems });
  showToast('Checklist updated.', 'success');
}

async function handleShare() {
  const state = getAppState();
  const url = serializeStateToURL(state);
  try {
    if (clipboard?.writeText) {
      await clipboard.writeText(url);
      showToast('Shareable link copied to clipboard.', 'success');
    } else {
      throw new Error('Clipboard unavailable.');
    }
  } catch (err) {
    showToast('Copy failed. Copy link from address bar.', 'error');
  }
}

function ensureExportRoot() {
  let root = qs('#exportRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'exportRoot';
    root.className = 'export-root';
    root.setAttribute('aria-hidden', 'true');
    document.body.append(root);
  }
  return root;
}

function handleExportPDF() {
  const exportRoot = ensureExportRoot();
  exportRoot.innerHTML = '';
  exportRoot.append(renderChecklistForExport(getAppState()));
  exportRoot.classList.add('export-root--visible');
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      exportRoot.classList.remove('export-root--visible');
      exportRoot.innerHTML = '';
    }, 200);
  }, 50);
}

function openCustomItemDialog() {
  const dialog = qs('#customItemDialog');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
    const handler = event => {
      if (dialog.returnValue === 'confirm') {
        const name = qs('#customItemName', dialog)?.value ?? '';
        const category = qs('#customItemCategory', dialog)?.value ?? 'other';
        addCustomItem(name, category);
        showToast('Custom item added.', 'success');
      }
      dialog.removeEventListener('close', handler);
      dialog.querySelector('form')?.reset();
    };
    dialog.addEventListener('close', handler);
  } else {
    const name = window.prompt('Item name');
    if (name) {
      addCustomItem(name, 'other');
      showToast('Custom item added.', 'success');
    }
  }
}

function bindFormEvents() {
  qs('#generateBtn')?.addEventListener('click', () => {
    handleGenerate().catch(err => console.error(err));
  });
  qs('#shareBtn')?.addEventListener('click', () => {
    handleShare().catch(err => console.error(err));
  });
  qs('#exportBtn')?.addEventListener('click', handleExportPDF);
  qs('#addItemBtn')?.addEventListener('click', openCustomItemDialog);

  const debouncedWeather = debounce(() => {
    requestWeatherUpdate({ reason: 'input-change' }).catch(err => console.error(err));
  }, 500);

  const cityInput = qs(formSelectors.city);
  const countryInput = qs(formSelectors.country);
  cityInput?.addEventListener('input', debouncedWeather);
  countryInput?.addEventListener('input', debouncedWeather);
}

async function requestWeatherUpdate({ reason = 'manual', silent = false } = {}) {
  const trip = readTripFromForm();
  if (!trip.city) {
    renderWeatherStatus({ status: 'idle' });
    lastWeatherItems = [];
    reconcileWeatherItems([]);
    setWeatherData(null);
    return;
  }

  updateTrip({ city: trip.city, country: trip.country });

  if (pendingWeatherController) {
    pendingWeatherController.abort();
  }
  const controller = new AbortController();
  pendingWeatherController = controller;

  renderWeatherStatus({ status: 'loading' });

  try {
    const weather = await fetchWeather(trip.city, {
      country: trip.country,
      signal: controller.signal
    });
    if (pendingWeatherController !== controller) {
      return;
    }
    lastWeatherItems = extractWeatherChecklistItems(weather);
    setWeatherData(weather);
    renderWeatherStatus({ status: 'success', data: weather });
    reconcileWeatherItems(lastWeatherItems);
  } catch (err) {
    if (err.name === 'AbortError') {
      return;
    }
    const error = err instanceof WeatherError ? err : new WeatherError('Weather unavailable.', 'unknown', err);
    if (pendingWeatherController !== controller) {
      return;
    }
    renderWeatherStatus({
      status: 'error',
      error,
      onRetry: () => {
        requestWeatherUpdate({ reason: 'retry', silent: true }).catch(e => console.error(e));
      }
    });
    if (!silent) {
      showToast(error.message, 'error');
    }
  } finally {
    if (pendingWeatherController === controller) {
      pendingWeatherController = null;
    }
  }
}

async function hydrateFromURL() {
  const sharedState = deserializeStateFromURL();
  if (!sharedState) {
    return false;
  }
  initChecklist(sharedState);
  populateFormFromState(sharedState.trip);
  if (sharedState.weather) {
    renderWeatherStatus({ status: 'success', data: sharedState.weather });
    setWeatherData(sharedState.weather);
  } else {
    renderWeatherStatus({ status: 'idle' });
  }
  lastWeatherItems = (sharedState.items || [])
    .filter(item => item.source === 'weather')
    .map(item => ({ group: item.group, label: item.label }));
  if (sharedState.trip?.city) {
    await requestWeatherUpdate({ reason: 'shared', silent: true });
  }
  return true;
}

function hydrateFromStorage() {
  initChecklist();
  const state = getAppState();
  populateFormFromState(state.trip);
  if (state.weather) {
    renderWeatherStatus({ status: 'success', data: state.weather });
  } else {
    renderWeatherStatus({ status: 'idle' });
  }
  lastWeatherItems = state.items
    .filter(item => item.source === 'weather')
    .map(item => ({ group: item.group, label: item.label }));
}

document.addEventListener('DOMContentLoaded', async () => {
  bindFormEvents();
  let loaded = false;
  try {
    loaded = await hydrateFromURL();
  } catch (err) {
    console.error(err);
  }
  if (!loaded) {
    hydrateFromStorage();
  }
});
