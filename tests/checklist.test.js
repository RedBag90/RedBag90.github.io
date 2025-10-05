import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initChecklist,
  addCustomItem,
  toggleItem,
  deleteItem,
  getAppState,
  reconcileWeatherItems,
  generateChecklist,
  updateTrip,
  renderChecklistForExport,
  applyTemplate,
  diffTemplate,
  getBuiltInTemplates,
  moveItemToBag,
  getBagSummary,
  ensureUniqueOrMerge
} from '../src/checklist.js';

const mountMarkup = `
  <div id="checklistOutput"></div>
  <div id="packedOutput"></div>
  <div id="progressBar"></div>
  <div id="progressText"></div>
  <div id="bagSummary"></div>
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
    expect(exportDoc.querySelectorAll('.export-table__row').length).toBeGreaterThan(1);
  });

  it('computes template diff and applies merge without duplicates', () => {
    const template = {
      id: 'test:merge',
      name: 'Merge Template',
      items: [
        { label: 'Travel Mug', group: 'other' },
        { label: 'Notebook & Pens', group: 'documents' }
      ]
    };
    const diff = diffTemplate(template);
    expect(diff.willAdd).toBeGreaterThan(0);
    const result = applyTemplate(template, 'merge');
    expect(result.added).toBe(diff.willAdd);
    const state = getAppState();
    const mugCount = state.items.filter(item => item.label === 'Travel Mug').length;
    expect(mugCount).toBe(1);
  });

  it('replace apply is idempotent', () => {
    const template = getBuiltInTemplates()[0];
    applyTemplate(template, 'replace');
    const firstState = JSON.parse(JSON.stringify(getAppState().items));
    const result = applyTemplate(template, 'replace');
    const secondState = JSON.parse(JSON.stringify(getAppState().items));
    expect(result.replaced).toBeGreaterThan(0);
    expect(secondState).toEqual(firstState);
  });

  it('updates bag summary when moving items', () => {
    const state = getAppState();
    const target = state.items.find(item => item.source !== 'weather') || state.items[0];
    moveItemToBag(target.id, 'checked');
    const summary = getBagSummary();
    expect(summary.checked.count).toBeGreaterThan(0);
  });

  it('export groups checklist by bag with counts', () => {
    const state = getAppState();
    const target = state.items.find(item => item.source !== 'weather') || state.items[0];
    moveItemToBag(target.id, 'work');
    const exportDoc = renderChecklistForExport(getAppState());
    const headings = Array.from(exportDoc.querySelectorAll('.export-bag-section__title')).map(node => node.textContent || '');
    expect(headings.some(text => text.includes('Work'))).toBe(true);
  });

  it('merges duplicates case-insensitively when confirmed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const first = ensureUniqueOrMerge({ label: 'HDMI Cable', group: 'tech', source: 'custom', bag: 'carryOn' });
    expect(first.status).toBe('added');
    const second = ensureUniqueOrMerge({ label: 'hdmi   cable', group: 'tech', source: 'custom', bag: 'carryOn' });
    expect(second.status).toBe('merged');
    const item = getAppState().items.find(entry => entry.label === 'HDMI Cable');
    expect(item?.quantity).toBe(2);
    confirmSpy.mockRestore();
  });

  it('cancels duplicate merge when declined', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const result = ensureUniqueOrMerge({ label: 'Travel Adapter', group: 'tech', source: 'custom', bag: 'carryOn' });
    expect(result.status).toBe('added');
    const cancel = ensureUniqueOrMerge({ label: 'travel adapter', group: 'tech', source: 'custom', bag: 'carryOn' });
    expect(cancel.status).toBe('cancelled');
    const item = getAppState().items.find(entry => entry.label === 'Travel Adapter');
    expect(item?.quantity ?? 1).toBe(1);
    confirmSpy.mockRestore();
  });
});
