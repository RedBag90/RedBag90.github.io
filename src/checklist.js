/**
 * Checklist module: manages application state, rendering, templates, and persistence.
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
  groupItemsByGroup,
  showToast,
  migrateItemsAddBag,
  normalizeBagValue,
  makeItemKey
} from './utils.js';

const BAGS = ['carryOn', 'checked', 'personal', 'work'];

const CATEGORY_LABELS = {
  documents: 'Documents & Work Essentials',
  tech: 'Tech & Gadgets',
  clothing: 'Clothing & Essentials',
  other: 'Other'
};

const CATEGORY_SEQUENCE = ['documents', 'tech', 'clothing', 'other'];

const BAG_LABELS = {
  carryOn: 'Carry-on',
  checked: 'Checked Bag',
  personal: 'Personal Item',
  work: 'Work Bag'
};

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

const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin:overnight-pitch',
    name: 'Overnight Pitch',
    items: [
      { label: 'Slim Suit', group: 'clothing', bag: 'carryOn' },
      { label: 'Dress Shoes', group: 'clothing', bag: 'carryOn' },
      { label: 'Presentation Deck (USB)', group: 'tech', bag: 'work' },
      { label: 'Business Cards', group: 'documents', bag: 'work' },
      { label: 'Lightweight Toiletry Kit', group: 'other', bag: 'carryOn' }
    ],
    meta: { climate: 'mixed', createdAtISO: '2024-01-01T00:00:00.000Z' }
  },
  {
    id: 'builtin:weeklong-conference',
    name: 'Weeklong Conference',
    items: [
      { label: '5x Dress Shirts', group: 'clothing', bag: 'checked', qty: 5 },
      { label: 'Conference Badge Holder', group: 'documents', bag: 'personal' },
      { label: 'Portable Charger', group: 'tech', bag: 'personal' },
      { label: 'Evening Outfit', group: 'clothing', bag: 'checked' },
      { label: 'Travel-sized Laundry Kit', group: 'other', bag: 'checked' }
    ],
    meta: { climate: 'mixed', createdAtISO: '2024-01-02T00:00:00.000Z' }
  },
  {
    id: 'builtin:remote-work-sprint',
    name: 'Remote Work Sprint',
    items: [
      { label: 'Noise-Cancelling Headphones', group: 'tech', bag: 'personal' },
      { label: 'Travel Router', group: 'tech', bag: 'carryOn' },
      { label: 'Notebook & Pens', group: 'documents', bag: 'work' },
      { label: 'Comfy Hoodie', group: 'clothing', bag: 'carryOn' },
      { label: 'Ergonomic Mouse', group: 'tech', bag: 'work' }
    ],
    meta: { climate: 'mixed', createdAtISO: '2024-01-03T00:00:00.000Z' }
  }
];

const MAX_TEMPLATE_ITEMS = 500;

const selectors = {
  toPack: '#checklistOutput',
  packed: '#packedOutput',
  progressBar: '#progressBar',
  progressText: '#progressText',
  bagSummary: '#bagSummary'
};

let appState = createDefaultState();
let highlightTimer;

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
    weather: null,
    meta: {
      lastTemplate: null
    }
  };
}

function cloneState(state) {
  return {
    trip: { ...state.trip },
    items: (state.items || []).map(item => ({ ...item })),
    weather: state.weather ? { ...state.weather } : null,
    meta: state.meta ? { ...state.meta } : { lastTemplate: null }
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
    labels
      .map(label => createItem({ group, label, source: 'base', bag: 'carryOn' }))
      .filter(Boolean)
  );
  const durationItems = mapDurationToItems(trip.durationDays)
    .map(descriptor => createItem(descriptor))
    .filter(Boolean);
  const activityItems = (trip.activities ?? [])
    .flatMap(key => ACTIVITY_ADD_ONS[key] ?? [])
    .map(descriptor => createItem(descriptor))
    .filter(Boolean);
  return dedupeItems([...base, ...durationItems, ...activityItems]);
}

function createItem({ group, label, source, checked = false, id, bag, qty, quantity }) {
  const trimmedLabel = (label ?? '').toString().trim();
  if (!trimmedLabel) {
    return null;
  }
  const normalizedGroup = group || 'other';
  const normalizedBag = normalizeBagValue(bag) || 'carryOn';
  const quantityValue = quantity ?? qty;
  const normalizedQuantity = Number.isFinite(quantityValue) && quantityValue > 0
    ? Math.min(99, Math.ceil(quantityValue))
    : null;
  const slug = slugify(`${normalizedGroup}-${trimmedLabel}`);
  const bagSegment = normalizedBag ? `-${normalizedBag}` : '';
  const prefix = (source || 'item').replace(/[^a-z0-9]+/gi, '-');
  const generatedId = (id || `${prefix}-${slug}${bagSegment}`).toLowerCase();

  return {
    id: generatedId,
    group: normalizedGroup,
    label: trimmedLabel,
    source: source || 'base',
    checked: Boolean(checked),
    bag: normalizedBag,
    quantity: normalizedQuantity
  };
}

function getConflictKeyFromItem(item) {
  return getConflictKey(item?.label, item?.bag);
}

function getConflictKey(label, bag) {
  return makeItemKey(label, bag);
}

function dedupeItems(items = []) {
  const map = new Map();
  const orderedKeys = [];
  items.forEach(item => {
    if (!item || !item.label) {
      return;
    }
    const key = getConflictKeyFromItem(item);
    if (!map.has(key)) {
      map.set(key, { ...item });
      orderedKeys.push(key);
    } else {
      const existing = map.get(key);
      const merged = { ...existing };
      merged.checked = existing.checked || item.checked;
      if (item.source === 'custom' || existing.source === 'custom') {
        merged.source = 'custom';
      } else if (item.source?.startsWith('template')) {
        merged.source = item.source;
      } else if (existing.source) {
        merged.source = existing.source;
      }
      if (item.bag && !existing.bag) {
        merged.bag = item.bag;
      }
      const existingQty = Number.isFinite(existing.quantity) ? existing.quantity : null;
      const itemQty = Number.isFinite(item.quantity) ? item.quantity : null;
      if (existingQty !== null && itemQty !== null) {
        merged.quantity = existingQty + itemQty;
      } else if (itemQty !== null) {
        merged.quantity = itemQty;
      } else if (existingQty !== null) {
        merged.quantity = existingQty;
      } else {
        delete merged.quantity;
      }
      map.set(key, merged);
    }
  });
  return orderedKeys.map(key => map.get(key));
}

function highlightExistingItem(itemId) {
  if (!itemId) {
    return;
  }
  const row = document.querySelector(`.checklist-item[data-item-id="${itemId}"]`);
  if (!row) {
    return;
  }
  row.classList.add('checklist-item--highlight');
  if (typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const checkbox = row.querySelector('input[type="checkbox"]');
  checkbox?.focus({ preventScroll: true });
  window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    row.classList.remove('checklist-item--highlight');
  }, 1600);
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
      durationDays: Number.isFinite(state.trip.durationDays) ? state.trip.durationDays : 3,
      activities: Array.isArray(state.trip.activities) ? state.trip.activities : [],
      generatedAt: state.trip.generatedAt ?? new Date().toISOString()
    };
  }
  if (Array.isArray(state.items)) {
    next.items = dedupeItems(
      migrateItemsAddBag(
        state.items
          .map(item => createItem(item))
          .filter(Boolean),
        'carryOn'
      )
    );
  }
  if (state.weather) {
    next.weather = { ...state.weather };
  }
  if (state.meta?.lastTemplate) {
    next.meta.lastTemplate = { ...state.meta.lastTemplate };
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
  renderBagSummary();
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

function formatChecklistLabel(item) {
  const parts = [];
  if (item.quantity) {
    parts.push(`${item.quantity}×`);
  }
  parts.push(item.label);
  return parts.join(' ');
}

function createChecklistRow(item, isPacked) {
  const row = ce('div', { className: 'checklist-item' });
  row.dataset.itemId = item.id;
  const checkbox = ce('input', {
    type: 'checkbox',
    id: item.id,
    checked: isPacked,
    'aria-label': formatChecklistLabel(item)
  });
  checkbox.addEventListener('change', () => toggleItem(item.id, !isPacked));

  const label = ce('label', { htmlFor: item.id, textContent: formatChecklistLabel(item) });
  const bagSwitcher = renderBagSwitcher(item);

  const remove = ce('button', {
    type: 'button',
    className: 'delete-btn',
    'aria-label': `Remove ${item.label}`,
    textContent: '×'
  });
  remove.addEventListener('click', () => deleteItem(item.id));

  row.append(checkbox, label, bagSwitcher, remove);
  return row;
}

function renderBagSwitcher(item) {
  const wrapper = ce('div', { className: 'item-bag-select-wrapper' });
  const label = ce('span', { className: 'item-bag-label', textContent: BAG_LABELS[item.bag] ?? BAG_LABELS.carryOn });
  const select = ce('select', {
    className: 'item-bag-select',
    'aria-label': `Select bag for ${item.label}`
  });
  BAGS.forEach(bagKey => {
    const option = ce('option', {
      value: bagKey,
      textContent: BAG_LABELS[bagKey]
    });
    select.append(option);
  });
  select.value = item.bag || 'carryOn';
  select.addEventListener('change', event => {
    label.textContent = BAG_LABELS[event.target.value] ?? BAG_LABELS.carryOn;
    moveItemToBag(item.id, event.target.value);
  });
  wrapper.append(label, select);
  return wrapper;
}

function renderBagSummary() {
  const container = qs(selectors.bagSummary);
  if (!container) {
    return;
  }
  const summary = getBagSummary();
  container.innerHTML = '';
  BAGS.forEach(bag => {
    const cell = ce('div', { className: 'bag-summary__cell' });
    const title = ce('span', { className: 'bag-summary__label', textContent: BAG_LABELS[bag] });
    const counts = ce('span', {
      className: 'bag-summary__count',
      textContent: `${summary[bag].checked}/${summary[bag].count}`
    });
    cell.append(title, counts);
    container.append(cell);
  });
}

export function initChecklist(initialState) {
  const stored = initialState || loadAppState();
  const normalized = normalizeState(stored);
  if (!normalized.items.length) {
    normalized.items = buildBaseItems(normalized.trip);
  }
  applyState(normalized, { persist: false });
}

export function updateTrip(partial) {
  const next = cloneState(appState);
  next.trip = {
    ...next.trip,
    ...partial,
    activities: Array.isArray(partial?.activities) ? partial.activities : next.trip.activities
  };
  next.trip.generatedAt = new Date().toISOString();
  applyState(next, { persist: false });
}

export function generateChecklist({ weatherItems = null } = {}) {
  const previous = new Map(appState.items.map(item => [getConflictKeyFromItem(item), item]));
  const baseItems = buildBaseItems(appState.trip).map(item => {
    const key = getConflictKeyFromItem(item);
    const existing = previous.get(key);
    return existing ? { ...existing, checked: existing.checked } : item;
  });
  const customItems = appState.items.filter(item => item.source === 'custom');
  const weatherSource = weatherItems
    ? weatherItems.map(createWeatherItem)
    : appState.items.filter(item => item.source === 'weather');
  const weatherMerged = weatherSource.map(item => {
    const key = getConflictKeyFromItem(item);
    const existing = previous.get(key);
    return existing ? { ...existing, source: 'weather' } : { ...item, checked: false };
  });
  const combined = dedupeItems([...baseItems, ...customItems, ...weatherMerged]);
  applyState({ ...appState, items: combined });
}

export function reconcileWeatherItems(weatherDescriptors = []) {
  const previousWeather = appState.items.filter(item => item.source === 'weather');
  const previousMap = new Map(previousWeather.map(item => [getConflictKeyFromItem(item), item]));
  const refreshed = dedupeItems(
    weatherDescriptors
      .map(descriptor => {
        const item = createWeatherItem(descriptor);
        if (!item) {
          return null;
        }
        const key = getConflictKeyFromItem(item);
        const existing = previousMap.get(key);
        return existing ? { ...existing, checked: existing.checked } : item;
      })
      .filter(Boolean)
  );
  const retained = appState.items.filter(item => item.source !== 'weather');
  applyState({ ...appState, items: dedupeItems([...retained, ...refreshed]) });
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

export function ensureUniqueOrMerge(newItem) {
  const prepared = createItem(newItem);
  if (!prepared) {
    return { status: 'cancelled' };
  }
  const key = getConflictKeyFromItem(prepared);
  const existing = appState.items.find(item => getConflictKeyFromItem(item) === key);
  if (!existing) {
    applyState({ ...appState, items: dedupeItems([...appState.items, prepared]) });
    window.setTimeout(() => highlightExistingItem(prepared.id), 0);
    return { status: 'added', item: prepared };
  }

  highlightExistingItem(existing.id);
  const confirmMerge = window.confirm('Already on list – increase quantity?');
  if (!confirmMerge) {
    return { status: 'cancelled', item: existing };
  }

  const addQty = Number.isFinite(prepared.quantity) ? prepared.quantity : 1;
  const baseQty = Number.isFinite(existing.quantity) ? existing.quantity : 1;
  const updated = { ...existing, quantity: baseQty + addQty };
  const nextItems = appState.items.map(item =>
    item.id === existing.id ? updated : item
  );
  applyState({ ...appState, items: nextItems });
  window.setTimeout(() => highlightExistingItem(existing.id), 0);
  showToast(`Quantity increased to ${updated.quantity}`, 'success');
  const toast = qs('#toast');
  toast?.classList.add('toast-merge');
  window.setTimeout(() => toast?.classList.remove('toast-merge'), 2000);
  return { status: 'merged', item: updated };
}

export function addCustomItem(label, group = 'other') {
  const trimmed = (label || '').trim();
  if (!trimmed) {
    showToast('Provide a name for the custom item.', 'error');
    return;
  }
  const result = ensureUniqueOrMerge({
    id: `custom-${slugify(`${group}-${trimmed}`)}-${Date.now().toString(36)}`,
    group,
    label: trimmed,
    source: 'custom'
  });
  if (result.status === 'added') {
    showToast('Item added to list.', 'success');
  }
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

function collectExportItems(state) {
  const items = Array.isArray(state.items) ? migrateItemsAddBag(state.items, 'carryOn') : [];
  if (!items.length) {
    return buildBaseItems(state.trip);
  }
  const hasNonWeather = items.some(item => item.source !== 'weather');
  if (!hasNonWeather) {
    return dedupeItems([...buildBaseItems(state.trip), ...items]);
  }
  return dedupeItems(items);
}

export function renderChecklistForExport(state = appState) {
  const exportState = cloneState(state);
  const exportItems = collectExportItems(exportState);

  const doc = ce('article', { className: 'export-document' });
  const header = ce('header', { className: 'export-header' });
  header.append(ce('h1', { textContent: 'Business Trip Checklist' }));
  header.append(
    ce('p', {
      className: 'export-meta',
      textContent: `Generated ${formatDateTime(new Date(exportState.trip.generatedAt || Date.now()))}`
    })
  );
  doc.append(header);

  const tripInfo = ce('section', { className: 'export-section' });
  tripInfo.append(ce('h2', { textContent: 'Trip Details' }));
  const infoList = ce('ul', { className: 'export-list' });
  infoList.append(ce('li', { textContent: `City: ${exportState.trip.city || '—'}` }));
  if (exportState.trip.country) {
    infoList.append(ce('li', { textContent: `Country: ${exportState.trip.country}` }));
  }
  infoList.append(ce('li', { textContent: `Duration: ${exportState.trip.durationDays} day(s)` }));
  infoList.append(
    ce('li', {
      textContent: `Activities: ${exportState.trip.activities?.length ? exportState.trip.activities.join(', ') : '—'}`
    })
  );
  infoList.append(ce('li', { textContent: `Exported: ${formatDateTime()}` }));
  tripInfo.append(infoList);
  doc.append(tripInfo);

  if (exportState.weather) {
    const weatherSection = ce('section', { className: 'export-section' });
    weatherSection.append(ce('h2', { textContent: 'Weather Summary' }));
    const weatherList = ce('ul', { className: 'export-list' });
    weatherList.append(
      ce('li', {
        textContent: `Summary: ${exportState.weather.summary || '—'}`
      })
    );
    if (exportState.weather.tempC !== null && exportState.weather.tempC !== undefined) {
      weatherList.append(ce('li', { textContent: `Current Temp: ${exportState.weather.tempC}°C` }));
    }
    if (exportState.weather.minC !== null || exportState.weather.maxC !== null) {
      weatherList.append(
        ce('li', {
          textContent: `Tomorrow Range: ${exportState.weather.minC ?? '—'}°C / ${exportState.weather.maxC ?? '—'}°C`
        })
      );
    }
    if (exportState.weather.precipitation !== null && exportState.weather.precipitation !== undefined) {
      weatherList.append(
        ce('li', {
          textContent: `Precipitation: ${exportState.weather.precipitation} mm`
        })
      );
    }
    weatherList.append(
      ce('li', {
        textContent: `Updated: ${formatDateTime(new Date(exportState.weather.lastUpdated || Date.now()))}`
      })
    );
    weatherSection.append(weatherList);
    doc.append(weatherSection);
  }

  const itemsSection = ce('section', { className: 'export-section export-section--items' });
  itemsSection.append(ce('h2', { textContent: 'Checklist by Bag' }));
  const bagGroups = groupItemsByBag(exportItems);
  BAGS.forEach(bag => {
    const list = bagGroups[bag];
    if (!list || !list.length) {
      return;
    }
    itemsSection.append(renderExportBagSection(bag, list));
    delete bagGroups[bag];
  });
  Object.entries(bagGroups).forEach(([bag, list]) => {
    if (list && list.length) {
      itemsSection.append(renderExportBagSection(bag, list));
    }
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
      list.append(ce('li', { textContent: `${marker} ${formatExportLine(item)}` }));
    });
  section.append(list);
  return section;
}

function formatExportLine(item) {
  const prefix = item.quantity ? `${item.quantity}× ` : '';
  return `${prefix}${item.label}`;
}

function capitalise(value) {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderExportBagSection(bagKey, items) {
  const normalizedBag = normalizeBagValue(bagKey) || bagKey || 'carryOn';
  const section = ce('section', { className: 'export-bag-section' });
  const summary = summarizeBagItems(items);
  section.append(
    ce('h3', {
      textContent: `${BAG_LABELS[normalizedBag] ?? capitalise(normalizedBag)} (${summary.checked}/${summary.count})`
    })
  );
  const grouped = groupItemsByGroup(items);
  CATEGORY_SEQUENCE.forEach(groupKey => {
    if (!grouped[groupKey]) {
      return;
    }
    section.append(renderExportGroup(groupKey, grouped[groupKey]));
    delete grouped[groupKey];
  });
  Object.entries(grouped).forEach(([groupKey, list]) => {
    section.append(renderExportGroup(groupKey, list));
  });
  return section;
}

function groupItemsByBag(items = []) {
  return items.reduce((acc, item) => {
    const bag = normalizeBagValue(item.bag) || 'carryOn';
    if (!acc[bag]) {
      acc[bag] = [];
    }
    acc[bag].push(item);
    return acc;
  }, {});
}

function summarizeBagItems(items = []) {
  return items.reduce(
    (acc, item) => ({
      count: acc.count + 1,
      checked: acc.checked + (item.checked ? 1 : 0)
    }),
    { count: 0, checked: 0 }
  );
}

function sanitizeTemplateItems(template) {
  if (!template || !Array.isArray(template.items)) {
    return { items: [], truncated: false };
  }
  const map = new Map();
  const result = [];
  template.items.forEach(raw => {
    if (!raw || !raw.label) {
      return;
    }
    const label = raw.label.toString().trim();
    if (!label) {
      return;
    }
    const group = raw.group || 'other';
    const bag = normalizeBagValue(raw.bag);
    const qtyValue = Number.isFinite(raw.qty) ? raw.qty : Number.isFinite(raw.quantity) ? raw.quantity : null;
    const key = getConflictKey(label, bag);
    if (map.has(key)) {
      return;
    }
    const entry = {
      label,
      group,
      bag,
      qty: qtyValue && qtyValue > 0 ? Math.min(99, Math.ceil(qtyValue)) : undefined
    };
    map.set(key, entry);
    result.push(entry);
  });
  const truncated = result.length > MAX_TEMPLATE_ITEMS;
  if (truncated) {
    result.length = MAX_TEMPLATE_ITEMS;
  }
  return { items: result, truncated };
}

function convertTemplateItem(entry, templateId) {
  return createItem({
    group: entry.group,
    label: entry.label,
    bag: entry.bag,
    qty: entry.qty,
    source: templateId ? `template:${templateId}` : 'template'
  });
}

export function diffTemplate(template) {
  const { items } = sanitizeTemplateItems(template);
  if (!items.length) {
    return { willAdd: 0, willReplace: 0 };
  }
  const converted = items
    .map(entry => convertTemplateItem(entry, template.id))
    .filter(Boolean);
  const existingKeys = new Set(appState.items.map(item => getConflictKeyFromItem(item)));
  const willAdd = converted.filter(item => !existingKeys.has(getConflictKeyFromItem(item))).length;
  const retained = appState.items.filter(item => item.source === 'custom' || item.source === 'weather');
  const willReplace = Math.max(appState.items.length - retained.length, 0);
  return { willAdd, willReplace };
}

export function applyTemplate(template, mode = 'merge') {
  const { items, truncated } = sanitizeTemplateItems(template);
  if (!items.length) {
    return { added: 0, replaced: 0, skipped: 0, truncated };
  }
  const converted = items
    .map(entry => convertTemplateItem(entry, template.id))
    .filter(Boolean);
  const existing = appState.items;
  const existingMap = new Map(existing.map(item => [getConflictKeyFromItem(item), item]));
  let added = 0;
  let skipped = 0;
  let replaced = 0;
  let nextItems = existing;

  if (mode === 'merge') {
    const toAppend = [];
    converted.forEach(item => {
      const key = getConflictKeyFromItem(item);
      if (existingMap.has(key)) {
        skipped += 1;
        return;
      }
      toAppend.push(item);
      existingMap.set(key, item);
      added += 1;
    });
    nextItems = dedupeItems([...existing, ...toAppend]);
  } else {
    const retained = existing.filter(
      item => item.source === 'custom' || item.source === 'weather'
    );
    replaced = Math.max(existing.length - retained.length, 0);
    const retainedMap = new Map(retained.map(item => [getConflictKeyFromItem(item), item]));
    const templateItems = [];
    converted.forEach(item => {
      const key = getConflictKeyFromItem(item);
      if (retainedMap.has(key)) {
        skipped += 1;
        return;
      }
      retainedMap.set(key, item);
      templateItems.push(item);
    });
    added = templateItems.length;
    nextItems = dedupeItems([...templateItems, ...retained]);
  }

  const nextState = cloneState(appState);
  nextState.items = nextItems;
  nextState.meta.lastTemplate = {
    id: template.id,
    name: template.name,
    appliedAt: new Date().toISOString(),
    mode
  };
  applyState(nextState);
  return { added, replaced, skipped, truncated };
}

export function getBuiltInTemplates() {
  return BUILT_IN_TEMPLATES.map(template => ({ ...template, items: template.items.map(item => ({ ...item })) }));
}

export function moveItemToBag(itemId, bag) {
  const normalizedBag = normalizeBagValue(bag) || 'carryOn';
  const target = appState.items.find(item => item.id === itemId);
  if (!target) {
    return;
  }
  const newKey = getConflictKey(target.label, normalizedBag);
  const conflict = appState.items.find(item => item.id !== itemId && getConflictKeyFromItem(item) === newKey);
  if (conflict) {
    const mergedQuantity = (Number.isFinite(conflict.quantity) ? conflict.quantity : 1)
      + (Number.isFinite(target.quantity) ? target.quantity : 1);
    const nextItems = appState.items
      .filter(item => item.id !== itemId)
      .map(item =>
        item.id === conflict.id
          ? { ...item, quantity: mergedQuantity }
          : item
      );
    applyState({ ...appState, items: nextItems });
    window.setTimeout(() => highlightExistingItem(conflict.id), 0);
    showToast('Merged items in selected bag.', 'success');
    const toast = qs('#toast');
    toast?.classList.add('toast-merge');
    window.setTimeout(() => toast?.classList.remove('toast-merge'), 2000);
    return;
  }
  const nextItems = appState.items.map(item =>
    item.id === itemId
      ? { ...item, bag: normalizedBag }
      : item
  );
  applyState({ ...appState, items: nextItems });
}

export function getBagSummary() {
  const summary = {
    carryOn: { count: 0, checked: 0 },
    checked: { count: 0, checked: 0 },
    personal: { count: 0, checked: 0 },
    work: { count: 0, checked: 0 }
  };
  appState.items.forEach(item => {
    const bag = normalizeBagValue(item.bag) || 'carryOn';
    summary[bag].count += 1;
    if (item.checked) {
      summary[bag].checked += 1;
    }
  });
  return summary;
}
