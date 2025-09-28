import { describe, it, expect, beforeEach } from 'vitest';
import {
  initChecklist,
  addCustomItem,
  toggleItem,
  deleteItem,
  getAppState,
  reconcileWeatherItems,
  generateChecklist,
  updateTrip,
  renderChecklistForExport
} from '../src/checklist.js';

const mountMarkup = `
  <div id="checklistOutput"></div>
  <div id="packedOutput"></div>
  <div id="progressBar"></div>
  <div id="progressText"></div>
`;

describe('checklist module', () => {
  beforeEach(() => {
    document.body.innerHTML = mountMarkup;
    localStorage.clear();
    initChecklist();
  });

  it('adds, toggles, and deletes custom items', () => {
    addCustomItem('Travel Pillow', 'other');
    let state = getAppState();
    const item = state.items.find(entry => entry.label === 'Travel Pillow');
    expect(item).toBeTruthy();

    toggleItem(item.id, true);
    state = getAppState();
    const packedItem = state.items.find(entry => entry.id === item.id);
    expect(packedItem.checked).toBe(true);

    deleteItem(item.id);
    state = getAppState();
    expect(state.items.find(entry => entry.id === item.id)).toBeUndefined();
  });

  it('updates progress indicator accurately', () => {
    const initialState = getAppState();
    const firstItem = initialState.items[0];
    toggleItem(firstItem.id, true);
    const updated = getAppState();
    const packed = updated.items.filter(item => item.checked).length;
    const total = updated.items.length;
    const expected = total === 0 ? '0%' : `${Math.round((packed / total) * 100)}%`;
    expect(document.querySelector('#progressText').textContent).toBe(expected);
  });

  it('reconciles weather items without touching custom entries', () => {
    addCustomItem('Custom Adapter', 'tech');
    reconcileWeatherItems([{ group: 'other', label: 'Umbrella' }]);
    let state = getAppState();
    expect(state.items.filter(item => item.label === 'Umbrella').length).toBe(1);
    expect(state.items.find(item => item.label === 'Custom Adapter')).toBeTruthy();

    reconcileWeatherItems([
      { group: 'other', label: 'Umbrella' },
      { group: 'clothing', label: 'Raincoat' }
    ]);

    state = getAppState();
    expect(state.items.filter(item => item.label === 'Umbrella').length).toBe(1);
    expect(state.items.find(item => item.label === 'Raincoat')).toBeTruthy();
    expect(state.items.find(item => item.label === 'Custom Adapter')).toBeTruthy();
  });

  it('regenerates checklist using trip data', () => {
    updateTrip({ durationDays: 5, activities: ['pitching'] });
    generateChecklist();
    const state = getAppState();
    expect(state.trip.durationDays).toBe(5);
    const formalOutfit = state.items.find(item => item.label === 'Formal Outfit');
    expect(formalOutfit).toBeTruthy();
  });

  it('ensures export includes base items even if state only holds weather', () => {
    reconcileWeatherItems([{ group: 'other', label: 'Umbrella' }]);
    const exportDoc = renderChecklistForExport({
      ...getAppState(),
      items: getAppState().items.filter(item => item.source === 'weather')
    });
    expect(exportDoc.querySelectorAll('.export-checklist-list li').length).toBeGreaterThan(1);
  });
});
