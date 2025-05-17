/**
 * @file script.js
 * @description
 * Implements a dynamic business trip packing checklist. Allows users to generate,
 * view, and manage packing items based on trip parameters (activities, duration, etc.).
 * State persists across sessions using localStorage.
 */

import { qs, ce } from './utils.js';

// ===========================
// Module Definitions
// ===========================
/**
 * Collection of item modules grouped by category.
 * Each module is an array of item definitions:
 * - name: display label for the item
 * - quantityPerDay (optional): if true, quantity scales with trip duration
 * - requiredForActivities (optional): filter items by selected activities
 */
export const modules = {
  "Clothing and Essentials": [
    { name: "Hygiene products" },
    { name: "Toothbrush" },
    { name: "Medicine" },
    { name: "Headache tablet" },
    { name: "Socks and underwear", quantityPerDay: true },
    { name: "Shirt", quantityPerDay: true },
    { name: "T-shirt", quantityPerDay: true },
    { name: "Sweater" },
    { name: "Jacket" },
    { name: "Shoes" },
    { name: "Pants" },
    { name: "Formal Outfit", requiredForActivities: ["pitching", "networking", "clientmeeting"] }
  ],
  documents: [
    { name: "Work ID" },
    { name: "Passport/Personal ID" },
    { name: "Travel Ticket" },
    { name: "Meeting Agenda", requiredForActivities: ["clientmeeting", "workshop"] },
    { name: "Business Cards" },
    { name: "NDA Forms or Legal Paperwork" }
  ],
  "Work Essentials": [
    { name: "Client Contact Info (Name, Phone, Email)" },
    { name: "Credit Cards" }
  ],
  Electronics: [
    { name: "Phone and Charger" },
    { name: "Laptop and Charger" },
    { name: "Tablet and Charger" },
    { name: "Headphones" },
    { name: "Presentation Clicker", requiredForActivities: ["pitching"] },
    { name: "Moderation Material", requiredForActivities: ["workshop"] },
    { name: "Notebook & Pen", requiredForActivities: ["workshop", "projectwork"] },
    { name: "Power Bank and Cables" },
    { name: "Portable Wi-Fi Hotspot" }
  ],
  Other: [
    { name: "Keys" },
    { name: "Wallet" }
  ]
};

// ===========================
// Checklist Grouping
// ===========================
/**
 * Defines the order and grouping of modules for rendering sections.
 * Keys refer to properties in `modules`. Sections are shown in this sequence.
 */
const checklistGroups = {
  "Documents & Work Essentials": ["documents", "Work Essentials"],
  "Electronics":                   ["Electronics"],
  "Clothing":                      ["Clothing and Essentials"],
  "Other":                         ["Other"]
};

// ===========================
// DOM References
// ===========================
// Container elements for "To Pack" and "Packed" lists
const toPackEl   = qs('#checklistOutput');
const packedEl   = qs('#packedOutput');

// ===========================
// In-Memory State
// ===========================
// Arrays holding items pending packing and already packed
let toPackList = [];
let packedList = [];

// ===========================
// Persistence Helpers
// ===========================
/**
 * Saves current `toPackList` and `packedList` into browser localStorage.
 */
function saveState() {
  localStorage.setItem('trip_toPack', JSON.stringify(toPackList));
  localStorage.setItem('trip_packed', JSON.stringify(packedList));
}

/**
 * Loads saved lists from localStorage into memory.
 * If no data exists, initializes as empty arrays.
 */
function loadState() {
  toPackList = JSON.parse(localStorage.getItem('trip_toPack') || '[]');
  packedList  = JSON.parse(localStorage.getItem('trip_packed') || '[]');
}

// ===========================
// Rendering Logic
// ===========================
/**
 * Clears and renders both "To Pack" and "Packed" lists.
 * Items are grouped into sections according to `checklistGroups`.
 */
function renderChecklists() {
  // Reset UI
  toPackEl.innerHTML = '';
  packedEl.innerHTML = '';

  // Loop through each configured section
  Object.entries(checklistGroups).forEach(([sectionName, moduleKeys]) => {
    // Render "To Pack" section only if there are items in this group
    const hasToPack = toPackList.some(item => 
      moduleKeys
        .flatMap(key => modules[key].map(opt => opt.name))
        .includes(item.name)
    );
    if (hasToPack) {
      // Section header
      const header = ce('h3', { className: 'section-header', textContent: sectionName });
      toPackEl.append(header);

      // Render each item row
      moduleKeys.forEach(key => {
        modules[key].forEach(def => {
          if (toPackList.find(item => item.name === def.name)) {
            toPackEl.append(buildRow(def.name, false));
          }
        });
      });
    }

    // Render "Packed" section only if there are items in this group
    const hasPacked = packedList.some(item => 
      moduleKeys
        .flatMap(key => modules[key].map(opt => opt.name))
        .includes(item.name)
    );
    if (hasPacked) {
      const header = ce('h3', { className: 'section-header', textContent: sectionName });
      packedEl.append(header);
      moduleKeys.forEach(key => {
        modules[key].forEach(def => {
          if (packedList.find(item => item.name === def.name)) {
            packedEl.append(buildRow(def.name, true));
          }
        });
      });
    }
  });
}

/**
 * Creates a checklist row element for a given item.
 * @param {string} name - Display name of the item.
 * @param {boolean} isPacked - Flag indicating if the row is in "Packed" column.
 * @returns {HTMLElement} - DOM node representing the checklist row.
 */
function buildRow(name, isPacked) {
  const row = ce('div', { className: 'checklist-item' });
  // Generate a unique ID (prefix with 'p-' or 't-')
  const id  = (isPacked ? 'p-' : 't-') + name.toLowerCase().replace(/\s+/g, '-');

  // Checkbox input
  const checkbox = ce('input', {
    type: 'checkbox',
    id: id,
    checked: isPacked
  });
  // Toggle packing state on change
  checkbox.addEventListener('change', () => 
    isPacked ? moveToToPack(name) : moveToPacked(name)
  );

  // Label element
  const label = ce('label', {
    htmlFor: id,
    textContent: name
  });

  // Delete button (trash icon)
  const delBtn = ce('button', { className: 'delete-btn', textContent: '🗑' });
  delBtn.addEventListener('click', () => deleteItem(name, isPacked));

  // Append elements in order
  row.append(checkbox, label, delBtn);
  return row;
}

// ===========================
// State Transition Handlers
// ===========================
/**
 * Moves an item from "To Pack" to "Packed" state.
 * @param {string} name - Name of the item to move.
 */
function moveToPacked(name) {
  toPackList = toPackList.filter(item => item.name !== name);
  packedList.push({ name, checked: true });
  saveState();
  renderChecklists();
  updatePackingProgress();
}

/**
 * Moves an item from "Packed" back to "To Pack".
 * @param {string} name - Name of the item to move.
 */
function moveToToPack(name) {
  packedList = packedList.filter(item => item.name !== name);
  toPackList.push({ name, checked: false });
  saveState();
  renderChecklists();
  updatePackingProgress();
}

/**
 * Removes an item permanently from either list.
 * @param {string} name
 * @param {boolean} isPacked - True if deleting from "Packed" list.
 */
function deleteItem(name, isPacked) {
  if (isPacked) {
    packedList = packedList.filter(item => item.name !== name);
  } else {
    toPackList = toPackList.filter(item => item.name !== name);
  }
  saveState();
  renderChecklists();
  updatePackingProgress();
}

// ===========================
// Checklist Generation
// ===========================
/**
 * Builds a fresh checklist based on user-selected filters (activities, etc.).
 * Clears any saved state and populates `toPackList`.
 * @param {{ activities?: string[] }} formData - Filters from the form.
 */
export function generateChecklist(formData) {
  const { activities = [] } = formData;
  toPackList = [];
  packedList = [];

  // Loop through each section to include relevant items
  Object.entries(checklistGroups).forEach(([sectionName, moduleKeys]) => {
    // Gather all items for this section
    const filteredItems = moduleKeys
      .flatMap(key => modules[key])
      .filter(item => {
        // If item has activity requirements, check for matches
        if (item.requiredForActivities) {
          const matches = activities.some(act => item.requiredForActivities.includes(act));
          return matches;
        }
        return true;
      });

    // If any items remain after filtering, add section header + items
    if (filteredItems.length) {
      toPackList.push({ isHeader: true, name: sectionName });
      filteredItems.forEach(item =>
        toPackList.push({ isHeader: false, name: item.name, checked: false })
      );
    }
  });

  saveState();
  renderChecklists();
  updatePackingProgress();
}

// ===========================
// Initialization
// ===========================
/**
 * Entry point on page load. Restores saved state or generates new checklist.
 * @param {{ activities?: string[] }} formData - Initial form filters.
 */
export function initChecklist(formData) {
  loadState();
  // If saved items exist, render them; otherwise generate fresh list
  if (toPackList.length || packedList.length) {
    renderChecklists();
  } else {
    generateChecklist(formData);
  }
}





// ===========================
// Packing Progress Bar
// ===========================
/**
 * Updates the packing progress bar based on the number of packed and unpacked boxes.
 * Calculates the percentage of packed boxes and updates the UI accordingly.
 */
// This function is called whenever the packing status changes
// (e.g., when a checkbox is checked/unchecked).
// It updates the progress bar and text to reflect the current packing status.
// It assumes that the packing checklist and packed boxes are represented
// as checkboxes in the DOM with specific IDs.
// The function calculates the total number of boxes (both packed and unpacked)
// and the number of packed boxes. It then computes the percentage of packed boxes
// and updates the width of the progress bar and the text content to show the percentage.
// The progress bar is represented by an element with the ID 'progressBar',
// and the text is represented by an element with the ID 'progressText'.
// The function is designed to be called whenever the packing status changes,
// ensuring that the progress bar and text are always up to date with the current packing status.

export function updatePackingProgress() {
  const toPackBoxes = document.querySelectorAll('#checklistOutput input[type="checkbox"]');
  const packedBoxes = document.querySelectorAll('#packedOutput input[type="checkbox"]');
  const totalItems = toPackBoxes.length + packedBoxes.length;
  const packedCount = packedBoxes.length;
  const percent = totalItems === 0 ? 0 : Math.round((packedCount / totalItems) * 100);

  // Update bar width and text
  const bar = document.getElementById('progressBar');
  const text = document.getElementById('progressText');
  bar.style.width = `${percent}%`;
  text.textContent = `${percent}%`;
}
