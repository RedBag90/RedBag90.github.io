/**
 * Checklist module: manages application state, rendering, and persistence.
 */

import {
  ce,
  qs,
  CHECKLIST_TEMPLATE,
  slugify,
  mapDurationToItems,
  saveAppState,
  loadAppState,
  formatDateTime,
  splitItemsByChecked,
  groupItemsByGroup
} from './utils.js';

const CATEGORY_LABELS = {
  documents: 'Documents & Work Essentials',
  tech: 'Tech & Gadgets',
  clothing: 'Clothing & Essentials',
  other: 'Other'
};

const CATEGORY_SEQUENCE = ['documents', 'tech', 'clothing', 'other'];

const ACTIVITY_ADD_ONS = {
  pitching: [
    { group: 'tech', label: 'Presentation Clicker', source: 'activity:pitching' },
    { group: 'clothing', label: 'Formal Outfit', source: 'activity:pitching' }
  ],
  clientmeeting: [
    { group: 'documents', label: 'Client Briefs', source: 'activity:clientmeeting' },
    { group: 'documents', label: 'Business Cards', source: 'activity:clientmeeting' }
  ],
  projectwork: [{ group: 'tech', label: 'Notebook & Pens', source: 'activity:projectwork' }],
  workshop: [{ group: 'other', label: 'Facilitation Kit', source: 'activity:workshop' }],
  networking: [{ group: 'documents', label: 'Extra Business Cards', source: 'activity:networking' }]
};

const selectors = {
  toPack: '#checklistOutput',
  packed: '#packedOutput',
  progressBar: '#progressBar',
  progressText: '#progressText'
};

let appState = createDefaultState();

function createDefaultState() {
  return {
    trip: {
      city: '',
      country: '',
      durationDays: 3,
      activities: [],
      generatedAt: new Date().toISOString()
    },
    items: [],
    weather: null
  };
}

function cloneState(state) {
  return {
    trip: { ...state.trip },
    items: state.items.map(item => ({ ...item })),
    weather: state.weather ? { ...state.weather } : null
  };
}

function applyState(nextState, { persist = true } = {}) {
  appState = cloneState(nextState);
  renderLists();
  updatePackingProgress();
  if (persist) {
    saveAppState(appState);
  }
}

function buildBaseItems(trip) {
  const base = Object.entries(CHECKLIST_TEMPLATE).flatMap(([group, labels]) =>
    labels.map(label => createItem({ group, label, source: 'base' }))
  );
  const durationItems = mapDurationToItems(trip.durationDays).map(descriptor =>
    createItem(descriptor)
  );
  const activityItems = (trip.activities ?? [])
    .flatMap(key => ACTIVITY_ADD_ONS[key] ?? [])
    .map(descriptor => createItem(descriptor));
  return dedupeItems([...base, ...durationItems, ...activityItems]);
}

function createItem({ group, label, source, checked = false, id }) {
  const slug = slugify(`${group || 'item'}-${label || Date.now()}`);
  const generatedId = id ?? `${(source || 'item').replace(/[^a-z0-9]+/gi, '-')}-${slug}`;
  return {
    id: generatedId.toLowerCase(),
    group: group || 'other',
    label,
    source: source || 'base',
    checked: Boolean(checked)
  };
}

function dedupeItems(items) {
  const map = new Map();
  const ordered = [];
  items.forEach(item => {
    if (!item || !item.id) {
      return;
    }
    if (!map.has(item.id)) {
      map.set(item.id, { ...item });
      ordered.push(item.id);
    } else {
      const existing = map.get(item.id);
      map.set(item.id, {
        ...existing,
        ...item,
        checked: existing.checked || item.checked
      });
    }
  });
  return ordered.map(id => map.get(id));
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') {
    return createDefaultState();
  }
  const next = createDefaultState();
  if (state.trip) {
    next.trip = {
      city: state.trip.city ?? '',
      country: state.trip.country ?? '',
      durationDays: Number.isFinite(state.trip.durationDays)
        ? state.trip.durationDays
        : 3,
      activities: Array.isArray(state.trip.activities) ? state.trip.activities : [],
      generatedAt: state.trip.generatedAt ?? new Date().toISOString()
    };
  }
  if (Array.isArray(state.items)) {
    next.items = state.items
      .filter(item => item && item.label && item.group)
      .map(item => createItem(item));
  }
  if (state.weather) {
    next.weather = { ...state.weather };
  }
  return next;
}

function renderLists() {
  const toPackEl = qs(selectors.toPack);
  const packedEl = qs(selectors.packed);
  if (!toPackEl || !packedEl) {
    return;
  }
  toPackEl.innerHTML = '';
  packedEl.innerHTML = '';

  const { toPack, packed } = splitItemsByChecked(appState.items);
  renderCollection(toPackEl, toPack, false);
  renderCollection(packedEl, packed, true);
}

function renderCollection(root, items, isPacked) {
  if (!items.length) {
    const empty = ce('p', {
      className: 'checklist-empty',
      textContent: 'Nothing here yet.'
    });
    root.append(empty);
    return;
  }
  const grouped = groupItemsByGroup(items);
  CATEGORY_SEQUENCE.forEach(groupKey => {
    if (!grouped[groupKey]) {
      return;
    }
    const section = ce('section', { className: 'checklist-section' });
    section.append(
      ce('h3', {
        textContent: CATEGORY_LABELS[groupKey] ?? capitalise(groupKey)
      })
    );
    grouped[groupKey].forEach(item => section.append(createChecklistRow(item, isPacked)));
    root.append(section);
    delete grouped[groupKey];
  });
  Object.entries(grouped).forEach(([groupKey, list]) => {
    const section = ce('section', { className: 'checklist-section' });
    section.append(
      ce('h3', {
        textContent: CATEGORY_LABELS[groupKey] ?? capitalise(groupKey)
      })
    );
    list.forEach(item => section.append(createChecklistRow(item, isPacked)));
    root.append(section);
  });
}

function capitalise(value) {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createChecklistRow(item, isPacked) {
  const row = ce('div', { className: 'checklist-item' });
  const checkbox = ce('input', {
    type: 'checkbox',
    id: item.id,
    checked: isPacked,
    'aria-label': item.label
  });
  checkbox.addEventListener('change', () => toggleItem(item.id, !isPacked));

  const label = ce('label', { htmlFor: item.id, textContent: item.label });
  const remove = ce('button', {
    type: 'button',
    className: 'delete-btn',
    'aria-label': `Remove ${item.label}`,
    textContent: '×'
  });
  remove.addEventListener('click', () => deleteItem(item.id));

  row.append(checkbox, label, remove);
  return row;
}

export function initChecklist(initialState) {
  const stored = initialState || loadAppState();
  const normalized = normalizeState(stored);
  if (!normalized.items.length) {
    const baseItems = buildBaseItems(normalized.trip);
    normalized.items = dedupeItems([...baseItems]);
  }
  applyState(normalized, { persist: false });
}

export function updateTrip(partial) {
  const next = cloneState(appState);
  next.trip = {
    ...next.trip,
    ...partial,
    activities: Array.isArray(partial?.activities)
      ? partial.activities
      : next.trip.activities
  };
  next.trip.generatedAt = new Date().toISOString();
  applyState(next, { persist: false });
}

export function generateChecklist({ weatherItems = null } = {}) {
  const previous = new Map(appState.items.map(item => [item.id, item]));
  const baseItems = buildBaseItems(appState.trip).map(item => {
    const existing = previous.get(item.id);
    return existing ? { ...item, checked: existing.checked } : item;
  });
  const customItems = appState.items.filter(item => item.source === 'custom');
  const weatherSource = weatherItems
    ? weatherItems.map(createWeatherItem)
    : appState.items.filter(item => item.source === 'weather');
  const weatherMerged = weatherSource.map(item => {
    const existing = previous.get(item.id);
    return existing ? { ...existing, source: 'weather' } : { ...item, checked: false };
  });
  const combined = dedupeItems([...baseItems, ...customItems, ...weatherMerged]);
  applyState({ ...appState, items: combined });
}

export function reconcileWeatherItems(weatherDescriptors = []) {
  const previousWeather = appState.items.filter(item => item.source === 'weather');
  const previousMap = new Map(previousWeather.map(item => [item.id, item]));
  const refreshed = dedupeItems(
    weatherDescriptors.map(descriptor => {
      const item = createWeatherItem(descriptor);
      const existing = previousMap.get(item.id);
      return existing ? { ...item, checked: existing.checked } : item;
    })
  );
  const retained = appState.items.filter(item => item.source !== 'weather');
  applyState({ ...appState, items: [...retained, ...refreshed] });
}

function createWeatherItem(descriptor) {
  return createItem({
    ...descriptor,
    source: 'weather'
  });
}

export function setWeatherData(weather) {
  applyState({ ...appState, weather }, { persist: false });
}

export function addCustomItem(label, group = 'other') {
  const trimmed = (label || '').trim();
  if (!trimmed) {
    return;
  }
  const id = `custom-${slugify(`${group}-${trimmed}`)}-${Date.now().toString(36)}`;
  const exists = appState.items.some(item => item.label.toLowerCase() === trimmed.toLowerCase());
  const customItem = createItem({ id, group, label: trimmed, source: 'custom' });
  if (exists) {
    return;
  }
  applyState({ ...appState, items: [...appState.items, customItem] });
}

export function toggleItem(id, checked) {
  const nextItems = appState.items.map(item =>
    item.id === id ? { ...item, checked } : item
  );
  applyState({ ...appState, items: nextItems });
}

export function deleteItem(id) {
  const nextItems = appState.items.filter(item => item.id !== id);
  applyState({ ...appState, items: nextItems });
}

export function getAppState() {
  return cloneState(appState);
}

export function updatePackingProgress() {
  const total = appState.items.length;
  const packed = appState.items.filter(item => item.checked).length;
  const percent = total === 0 ? 0 : Math.round((packed / total) * 100);
  const bar = qs(selectors.progressBar);
  const text = qs(selectors.progressText);
  if (bar) {
    bar.style.width = `${percent}%`;
  }
  if (text) {
    text.textContent = `${percent}%`;
  }
}

export function renderChecklistForExport(state = appState) {
  const exportState = cloneState(state);
  const exportItems = dedupeItems([
    ...buildBaseItems(exportState.trip),
    ...(exportState.items ?? [])
  ]);

  const doc = ce('article', { className: 'export-document' });
  const header = ce('header', { className: 'export-header' });
  header.append(ce('h1', { textContent: 'Business Trip Checklist' }));
  header.append(
    ce('p', {
      className: 'export-meta',
      textContent: `Generated ${formatDateTime(new Date(state.trip.generatedAt || Date.now()))}`
    })
  );
  doc.append(header);

  const tripInfo = ce('section', { className: 'export-section' });
  tripInfo.append(ce('h2', { textContent: 'Trip Details' }));
  const infoList = ce('ul', { className: 'export-list' });
  infoList.append(ce('li', { textContent: `City: ${state.trip.city || '—'}` }));
  if (state.trip.country) {
    infoList.append(ce('li', { textContent: `Country: ${state.trip.country}` }));
  }
  infoList.append(ce('li', { textContent: `Duration: ${state.trip.durationDays} day(s)` }));
  infoList.append(
    ce('li', {
      textContent: `Activities: ${state.trip.activities?.length ? state.trip.activities.join(', ') : '—'}`
    })
  );
  infoList.append(ce('li', { textContent: `Exported: ${formatDateTime()}` }));
  tripInfo.append(infoList);
  doc.append(tripInfo);

  if (state.weather) {
    const weatherSection = ce('section', { className: 'export-section' });
    weatherSection.append(ce('h2', { textContent: 'Weather Summary' }));
    const weatherList = ce('ul', { className: 'export-list' });
    weatherList.append(
      ce('li', {
        textContent: `Summary: ${state.weather.summary || '—'}`
      })
    );
    if (state.weather.tempC !== null && state.weather.tempC !== undefined) {
      weatherList.append(ce('li', { textContent: `Current Temp: ${state.weather.tempC}°C` }));
    }
    if (state.weather.minC !== null || state.weather.maxC !== null) {
      weatherList.append(
        ce('li', {
          textContent: `Tomorrow Range: ${state.weather.minC ?? '—'}°C / ${state.weather.maxC ?? '—'}°C`
        })
      );
    }
    if (state.weather.precipitation !== null && state.weather.precipitation !== undefined) {
      weatherList.append(
        ce('li', {
          textContent: `Precipitation: ${state.weather.precipitation} mm`
        })
      );
    }
    weatherList.append(
      ce('li', {
        textContent: `Updated: ${formatDateTime(new Date(state.weather.lastUpdated || Date.now()))}`
      })
    );
    weatherSection.append(weatherList);
    doc.append(weatherSection);
  }

  const itemsSection = ce('section', { className: 'export-section export-section--items' });
  itemsSection.append(ce('h2', { textContent: 'Checklist' }));
  const grouped = groupItemsByGroup(exportItems);
  CATEGORY_SEQUENCE.forEach(groupKey => {
    if (!grouped[groupKey]) {
      return;
    }
    itemsSection.append(renderExportGroup(groupKey, grouped[groupKey]));
    delete grouped[groupKey];
  });
  Object.entries(grouped).forEach(([groupKey, list]) => {
    itemsSection.append(renderExportGroup(groupKey, list));
  });
  doc.append(itemsSection);

  const footer = ce('footer', { className: 'export-footer' });
  footer.append(ce('p', { textContent: `Generated at ${formatDateTime()}` }));
  doc.append(footer);

  return doc;
}

function renderExportGroup(groupKey, items) {
  const section = ce('section', { className: 'export-group' });
  section.append(
    ce('h3', {
      textContent: CATEGORY_LABELS[groupKey] ?? capitalise(groupKey)
    })
  );
  const list = ce('ul', { className: 'export-checklist-list' });
  items
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach(item => {
      const marker = item.checked ? '[x]' : '[ ]';
      list.append(ce('li', { textContent: `${marker} ${item.label}` }));
    });
  section.append(list);
  return section;
}
