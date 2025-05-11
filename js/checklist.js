import { qs, ce } from './utils.js';

// Paste your full modules constant here
export const modules = {
    "Clothing and Essentials": [
        { name: "Hygeen products"},
        { name: "Toothbrush"},
        { name: "Medicine" },
        { name: "Headache tablet"},
        { name: "Socks and underware", quantityPerDay: true },
        { name: "Shirt", quantityPerDay: true },
        { name: "Tshirt", quantityPerDay: true },
        { name: "Sweater" },
        { name: "Jacket" },
        { name: "Shoes" },
        { name: "Shirt", quantityPerDay: true },
        { name: "Pants"},
        { name: "Formal Outfit", requiredForActivities: ["pitching", "networking", "clientmeeting"] },
    ],
    documents: [
        { name: "Work ID" },
        { name: "Passport", requiredForTripType: "international" },
        { name: "Personal ID", requiredForTripType: "domestic" },
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

// Define grouping of modules into checklist sections
const checklistGroups = {
    "Documents & Work Essentials": ["documents", "Work Essentials"],
    "Electronics":                   ["Electronics"],
    "Clothing":                      ["Clothing and Essentials"],
    "Other":                         ["Other"]
  };
  

// DOM containers
const toPackEl = qs('#checklistOutput');
const packedEl = qs('#packedOutput');

// In-memory state arrays
let toPackList = [];
let packedList = [];

// Save both lists to localStorage
function saveState() {
  localStorage.setItem('trip_toPack', JSON.stringify(toPackList));
  localStorage.setItem('trip_packed', JSON.stringify(packedList));
}

// Load saved lists (if any)
function loadState() {
  toPackList = JSON.parse(localStorage.getItem('trip_toPack') || '[]');
  packedList  = JSON.parse(localStorage.getItem('trip_packed') || '[]');
}

// Render both "To Pack" and "Packed" lists
function renderChecklists() {
    toPackEl.innerHTML = '';
    packedEl.innerHTML = '';
  
    // iterate each section in order
    Object.entries(checklistGroups).forEach(([sectionName, moduleKeys]) => {
      // --- TO PACK column ---
      // only render a header if there's at least one item in this group
      if (toPackList.some(i => {
        // check if its module is in this group
        return moduleKeys
          .flatMap(key => modules[key].map(m => m.name))
          .includes(i.name);
      })) {
        const hdr = ce('h3', {
          className: 'section-header',
          textContent: sectionName
        });
        toPackEl.append(hdr);
  
        moduleKeys.forEach(key => {
          modules[key].forEach(def => {
            if (toPackList.find(i => i.name === def.name)) {
              const row = buildRow(def.name, false);
              toPackEl.append(row);
            }
          });
        });
      }
  
      // --- PACKED column ---
      if (packedList.some(i => {
        return moduleKeys
          .flatMap(key => modules[key].map(m => m.name))
          .includes(i.name);
      })) {
        const hdr = ce('h3', {
          className: 'section-header',
          textContent: sectionName
        });
        packedEl.append(hdr);
  
        moduleKeys.forEach(key => {
          modules[key].forEach(def => {
            if (packedList.find(i => i.name === def.name)) {
              const row = buildRow(def.name, true);
              packedEl.append(row);
            }
          });
        });
      }
    });
  }
  
  // helper to DRY up row-creation
  function buildRow(name, isPacked) {
    const row = ce('div', { className: 'checklist-item' });
    const id  = (isPacked ? 'p-' : 't-') + name.toLowerCase().replace(/\s+/g,'-');
  
    const checkbox = ce('input', {
      type:    'checkbox',
      id:      id,
      checked: isPacked
    });
    checkbox.addEventListener(
      'change',
      () => isPacked ? moveToToPack(name) : moveToPacked(name)
    );
  
    const label = ce('label', {
      htmlFor:      id,
      textContent:  name
    });
  
    const delBtn = ce('button', {
      className:   'delete-btn',
      textContent: '🗑'
    });
    delBtn.addEventListener('click', () => deleteItem(name, isPacked));
  
    row.append(checkbox, label, delBtn);
    return row;
  }
  

// Move an item from "To Pack" → "Packed"
function moveToPacked(name) {
  toPackList = toPackList.filter(i => i.name !== name);
  packedList.push({ name, checked: true });
  saveState();
  renderChecklists();
}

// Move an item from "Packed" → "To Pack"
function moveToToPack(name) {
  packedList = packedList.filter(i => i.name !== name);
  toPackList.push({ name, checked: false });
  saveState();
  renderChecklists();
}

// Delete an item from either list
function deleteItem(name, isPacked) {
  if (isPacked) packedList = packedList.filter(i => i.name !== name);
  else         toPackList = toPackList.filter(i => i.name !== name);
  saveState();
  renderChecklists();
}

/**
 * Generate a fresh checklist from modules (ignores saved state)
 * @param {{}} formData  — your existing filter inputs (tripType, duration, role, activities)
 */
export function generateChecklist(formData) {
  // Destructure the filters from the form data
  const { activities = [] } = formData;

  // reset both lists
  toPackList = [];
  packedList = [];

  // for each section in your grouping…
  Object.entries(checklistGroups).forEach(([sectionName, moduleKeys]) => {
    // 1) Gather all items in this group…
    const filteredItems = moduleKeys
      .flatMap(key => modules[key])
      .filter(item => {

        // Enforce at least one matching activity if required
        if (item.requiredForActivities) {
          const ok = activities.some(act =>
            item.requiredForActivities.includes(act)
          );
          if (!ok) return false;
        }
        return true; // otherwise it’s included
      });

    // 2) Only if there are items, push the section header + its items
    if (filteredItems.length) {
      toPackList.push({ isHeader: true, name: sectionName });
      filteredItems.forEach(item =>
        toPackList.push({ isHeader: false, name: item.name, checked: false })
      );
    }
  });

  saveState();
  renderChecklists();
}

  

/**
 * Initialize on page load: rehydrate or generate fresh
 * @param {{}} formData
 */
export function initChecklist(formData) {
  loadState();
  if (toPackList.length || packedList.length) {
    renderChecklists();
  } else {
    generateChecklist(formData);
  }
}
