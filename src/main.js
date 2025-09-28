/**
 * Application entry point wiring form interactions, weather updates, and checklist state.
 */

import {
  qs,
  debounce,
  serializeStateToURL,
  deserializeStateFromURL,
  showToast,
  loadTemplates,
  saveTemplates,
  generateId,
  normalizeBagValue
} from './utils.js';
import {
  initChecklist,
  updateTrip,
  generateChecklist,
  reconcileWeatherItems,
  setWeatherData,
  addCustomItem,
  getAppState,
  renderChecklistForExport,
  applyTemplate,
  diffTemplate,
  getBuiltInTemplates
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
let userTemplates = [];
const builtInTemplates = getBuiltInTemplates();
const TEMPLATE_ITEM_LIMIT = 500;

const templateSelectors = {
  picker: '#templatePicker',
  applyBtn: '#applyTemplateBtn',
  saveBtn: '#saveTemplateBtn',
  deleteBtn: '#deleteTemplateBtn',
  badge: '#templateBadge',
  applyModal: '#applyTemplateModal',
  diffAdd: '#templateDiffAdd',
  diffReplace: '#templateDiffReplace',
  diffSkip: '#templateDiffSkip',
  modalTitle: '#templateModalName',
  saveDialog: '#saveTemplateDialog',
  saveName: '#templateName',
  saveIncludeWeather: '#includeWeatherItems'
};

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

function normalizeTemplateItems(template) {
  if (!template || !Array.isArray(template.items)) {
    return [];
  }
  const map = new Map();
  const result = [];
  template.items.forEach(item => {
    if (!item || !item.label) {
      return;
    }
    const label = item.label.toString().trim();
    if (!label) {
      return;
    }
    const normalizedBag = normalizeBagValue(item.bag);
    const key = `${label.toLowerCase()}|${normalizedBag || 'none'}`;
    if (map.has(key)) {
      return;
    }
    map.set(key, true);
    result.push({
      label,
      group: item.group || 'other',
      bag: normalizedBag || 'carryOn',
      qty: Number.isFinite(item.qty) ? item.qty : Number.isFinite(item.quantity) ? item.quantity : undefined
    });
  });
  if (result.length > TEMPLATE_ITEM_LIMIT) {
    result.length = TEMPLATE_ITEM_LIMIT;
  }
  return result;
}

function refreshTemplatePicker() {
  const picker = qs(templateSelectors.picker);
  if (!picker) {
    return;
  }
  const currentValue = picker.value;
  picker.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select template';
  picker.append(placeholder);

  const builtInGroup = document.createElement('optgroup');
  builtInGroup.label = 'Built-in';
  builtInTemplates.forEach(template => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    builtInGroup.append(option);
  });
  picker.append(builtInGroup);

  const myGroup = document.createElement('optgroup');
  myGroup.label = 'My templates';
  if (userTemplates.length) {
    userTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name;
      myGroup.append(option);
    });
  } else {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.disabled = true;
    emptyOption.textContent = 'No saved templates yet';
    myGroup.append(emptyOption);
  }
  picker.append(myGroup);

  picker.value = currentValue;
  if (picker.value !== currentValue) {
    picker.value = '';
  }
}

function refreshTemplateBadge() {
  const badge = qs(templateSelectors.badge);
  if (!badge) {
    return;
  }
  const state = getAppState();
  const last = state.meta?.lastTemplate;
  if (last?.name) {
    badge.textContent = `Template: ${last.name}`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function findTemplateById(id) {
  return builtInTemplates.find(template => template.id === id)
    || userTemplates.find(template => template.id === id)
    || null;
}

function openApplyTemplateModal(template) {
  const modal = qs(templateSelectors.applyModal);
  if (!modal || typeof modal.showModal !== 'function') {
    onApplyTemplate(template.id, 'merge');
    return;
  }
  const normalizedItems = normalizeTemplateItems(template);
  const diff = diffTemplate(template);
  const skipCount = Math.max(normalizedItems.length - diff.willAdd, 0);
  const nameEl = qs(templateSelectors.modalTitle, modal);
  if (nameEl) {
    nameEl.textContent = template.name;
  }
  const addEl = qs(templateSelectors.diffAdd, modal);
  if (addEl) {
    addEl.textContent = String(diff.willAdd);
  }
  const replaceEl = qs(templateSelectors.diffReplace, modal);
  if (replaceEl) {
    replaceEl.textContent = String(diff.willReplace);
  }
  const skipEl = qs(templateSelectors.diffSkip, modal);
  if (skipEl) {
    skipEl.textContent = String(skipCount);
  }

  modal.dataset.templateId = template.id;
  modal.returnValue = 'cancel';
  modal.showModal();
  window.requestAnimationFrame(() => {
    modal.querySelector('.btn-merge')?.focus();
  });
}

function attachTemplateModalHandlers() {
  const modal = qs(templateSelectors.applyModal);
  if (!modal) {
    return;
  }
  modal.addEventListener('close', () => {
    const action = modal.returnValue;
    const templateId = modal.dataset.templateId;
    delete modal.dataset.templateId;
    if (action === 'merge' || action === 'replace') {
      onApplyTemplate(templateId, action);
    }
  });
}

function handleTemplateApplyClick() {
  const picker = qs(templateSelectors.picker);
  if (!picker) {
    return;
  }
  const templateId = picker.value;
  if (!templateId) {
    showToast('Select a template to apply.', 'error');
    picker.focus();
    return;
  }
  const template = findTemplateById(templateId);
  if (!template) {
    showToast('Template unavailable.', 'error');
    refreshTemplatePicker();
    return;
  }
  if (!Array.isArray(template.items) || !template.items.length) {
    showToast('Template contains no items.', 'error');
    return;
  }
  if (getAppState().items.length) {
    openApplyTemplateModal(template);
  } else {
    onApplyTemplate(templateId, 'replace');
  }
}

function openSaveTemplateDialog() {
  const dialog = qs(templateSelectors.saveDialog);
  if (!dialog || typeof dialog.showModal !== 'function') {
    const name = window.prompt('Template name');
    if (name) {
      onSaveTemplateFromCurrent(name, false);
    }
    return;
  }
  dialog.querySelector('form')?.reset();
  dialog.showModal();
  window.requestAnimationFrame(() => {
    qs(templateSelectors.saveName, dialog)?.focus();
  });
  const handler = () => {
    if (dialog.returnValue === 'confirm') {
      const name = qs(templateSelectors.saveName, dialog)?.value ?? '';
      const includeWeather = Boolean(qs(templateSelectors.saveIncludeWeather, dialog)?.checked);
      onSaveTemplateFromCurrent(name, includeWeather);
    }
    dialog.removeEventListener('close', handler);
    dialog.querySelector('form')?.reset();
  };
  dialog.addEventListener('close', handler);
}

function handleTemplateDeleteClick() {
  const picker = qs(templateSelectors.picker);
  if (!picker) {
    return;
  }
  const templateId = picker.value;
  if (!templateId) {
    showToast('Select a template to delete.', 'error');
    picker.focus();
    return;
  }
  if (templateId.startsWith('builtin:')) {
    showToast('Built-in templates cannot be deleted.', 'error');
    return;
  }
  const index = userTemplates.findIndex(template => template.id === templateId);
  if (index === -1) {
    showToast('Template not found.', 'error');
    refreshTemplatePicker();
    return;
  }
  const template = userTemplates[index];
  const confirmed = window.confirm(`Delete template "${template.name}"?`);
  if (!confirmed) {
    return;
  }
  userTemplates.splice(index, 1);
  saveTemplates(userTemplates);
  refreshTemplatePicker();
  picker.value = '';
  showToast('Template deleted.', 'success');
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
  qs(templateSelectors.applyBtn)?.addEventListener('click', handleTemplateApplyClick);
  qs(templateSelectors.saveBtn)?.addEventListener('click', openSaveTemplateDialog);
  qs(templateSelectors.deleteBtn)?.addEventListener('click', handleTemplateDeleteClick);
  attachTemplateModalHandlers();

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

export function onSaveTemplateFromCurrent(name, includeWeather) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    showToast('Template name is required.', 'error');
    return;
  }
  const state = getAppState();
  const pool = (state.items || []).filter(item => includeWeather || item.source !== 'weather');
  if (!pool.length) {
    showToast('Nothing to save in template.', 'error');
    return;
  }
  const map = new Map();
  const items = [];
  pool.forEach(item => {
    if (!item.label) {
      return;
    }
    const normalizedBag = normalizeBagValue(item.bag) || 'carryOn';
    const key = `${item.label.toLowerCase()}|${normalizedBag}`;
    if (map.has(key)) {
      return;
    }
    map.set(key, true);
    items.push({
      label: item.label,
      group: item.group,
      bag: normalizedBag,
      qty: item.quantity || undefined
    });
  });
  if (!items.length) {
    showToast('Nothing to save in template.', 'error');
    return;
  }
  let truncated = false;
  if (items.length > TEMPLATE_ITEM_LIMIT) {
    items.length = TEMPLATE_ITEM_LIMIT;
    truncated = true;
  }
  const template = {
    id: generateId('tpl'),
    name: trimmed,
    items,
    meta: {
      createdAtISO: new Date().toISOString()
    }
  };

  userTemplates = [template, ...userTemplates.filter(existing => existing.name.toLowerCase() !== trimmed.toLowerCase())];
  saveTemplates(userTemplates);
  refreshTemplatePicker();
  const picker = qs(templateSelectors.picker);
  if (picker) {
    picker.value = template.id;
  }
  showToast('Template saved.', 'success');
  if (truncated) {
    showToast('Template capped at 500 items.', 'error');
  }
  return template;
}

export function onApplyTemplate(templateId, mode) {
  const template = findTemplateById(templateId);
  if (!template) {
    showToast('Template not found.', 'error');
    return;
  }
  if (!mode) {
    if (getAppState().items.length) {
      openApplyTemplateModal(template);
    } else {
      onApplyTemplate(templateId, 'replace');
    }
    return;
  }
  const result = applyTemplate(template, mode);
  refreshTemplateBadge();
  const message =
    mode === 'merge'
      ? `Merged "${template.name}" (+${result.added}, skipped ${result.skipped}).`
      : `Replaced with "${template.name}" (+${result.added}, replaced ${result.replaced}).`;
  showToast(message, 'success');
  if (result.truncated) {
    showToast('Template limited to 500 items (extra entries skipped).', 'error');
  }
  return result;
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
  userTemplates = loadTemplates();
  refreshTemplatePicker();
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
  refreshTemplateBadge();
});
