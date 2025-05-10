// =======================================================
// Business Trip Checklist App with Weather Integration
// =======================================================

// =======================================================
// Constants
// =======================================================

// Define modules: templates of checklist items grouped by type.
const modules = {
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
    { name: "Formal Outfit", requiredForActivities: ["pitching", "networking", "clientmeeting"] }
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
    { name: "Smartphone and Charger" },
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
  "Electronics": ["Electronics"],
  "Clothing": ["Clothing and Essentials"],
  "Other": ["Other"]
};

// Checklist state variables
let currentChecklist = [];
let packedChecklist = [];
let tripDuration = 0;

// =======================================================
// Helper Functions
// =======================================================

/** Collect selected activities (checkboxes marked by user). */
function getSelectedActivities() {
  return Array.from(document.querySelectorAll(".activity:checked")).map(cb => cb.value);
}

/** Determine selected city based on radio button or custom input. */
function getDestinationCity() {
  const selectedOption = document.querySelector('input[name="cityOption"]:checked').value;
  return selectedOption === "custom"
    ? document.getElementById("customCity").value.trim()
    : selectedOption;
}

/** Capitalize first letter of a string. */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Determine if a checklist item is relevant for this trip. */
function isItemRelevant(item, tripType, tripRole, activities) {
  if (item.requiredForTripType && item.requiredForTripType !== tripType) return false;
  if (item.requiredForRoles && !item.requiredForRoles.includes(tripRole)) return false;
  if (item.requiredForActivities && !item.requiredForActivities.some(a => activities.includes(a))) return false;
  return true;
}

/** Debounce function: Wait before running a function after rapid typing. */
function debounce(func, delay = 500) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
}

// =======================================================
// Checklist Management Functions
// =======================================================

/** Create a checklist group section and render items under it. */
function createChecklistGroup(title, items, tripDuration, targetDiv, isPackedList = false) {
  if (items.length === 0) return;

  const groupDiv = document.createElement("div");
  groupDiv.className = "checklist-super-group";

  const heading = document.createElement("h2");
  heading.textContent = title;
  groupDiv.appendChild(heading);

  const categoryDiv = document.createElement("div");
  categoryDiv.className = "checklist-group";

  items.forEach(item => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "checklist-item";

    const leftSide = document.createElement("div");
    leftSide.style.display = "flex";
    leftSide.style.alignItems = "center";
    leftSide.style.gap = "6px";

    const label = document.createElement("label");
    label.className = "item-label";
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "6px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isPackedList;

    const labelText = document.createElement("span");
    labelText.textContent = item.quantityPerDay ? `${item.name} x${tripDuration}` : item.name;

    label.appendChild(checkbox);
    label.appendChild(labelText);
    leftSide.appendChild(label);

    checkbox.addEventListener("change", () => {
      checkbox.checked ? moveItemToPacked(item) : moveItemToChecklist(item);
    });

    itemDiv.appendChild(leftSide);

    if (isPackedList) {
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️";
      deleteBtn.className = "delete-btn";
      deleteBtn.addEventListener("click", () => removeItemFromPacked(item));
      itemDiv.appendChild(deleteBtn);
    }

    categoryDiv.appendChild(itemDiv);
  });

  groupDiv.appendChild(categoryDiv);
  targetDiv.appendChild(groupDiv);
}

/** Move item from checklist to packed list. */
function moveItemToPacked(item) {
  currentChecklist = currentChecklist.filter(i => i !== item);
  packedChecklist.push(item);
  renderChecklists();
}

/** Move item back from packed list to checklist. */
function moveItemToChecklist(item) {
  packedChecklist = packedChecklist.filter(i => i !== item);
  currentChecklist.push(item);
  renderChecklists();
}

/** Remove item entirely from packed list. */
function removeItemFromPacked(item) {
  packedChecklist = packedChecklist.filter(i => i !== item);
  renderChecklists();
}

/** Render both active and packed checklist items grouped by categories. */
function renderChecklists() {
  const checklistOutput = document.getElementById("checklistOutput");
  const packedOutput = document.getElementById("packedOutput");

  checklistOutput.innerHTML = "";
  packedOutput.innerHTML = "";

  for (const [groupName, moduleKeys] of Object.entries(checklistGroups)) {
    const activeItems = [];
    const packedItems = [];

    moduleKeys.forEach(moduleKey => {
      const items = currentChecklist.filter(i => i.module === moduleKey);
      const packed = packedChecklist.filter(i => i.module === moduleKey);
      activeItems.push(...items);
      packedItems.push(...packed);
    });

    if (activeItems.length > 0) createChecklistGroup(groupName, activeItems, tripDuration, checklistOutput, false);
    if (packedItems.length > 0) createChecklistGroup(groupName, packedItems, tripDuration, packedOutput, true);
  }
}

// =======================================================
// Checklist Generator
// =======================================================

/** Generate checklist based on user trip type, activities, and role. */
function generateChecklist() {
  const tripType = document.getElementById("tripType").value;
  tripDuration = parseInt(document.getElementById("tripDuration").value);
  const tripRole = document.getElementById("tripRole").value;
  const location = getDestinationCity();
  const activities = getSelectedActivities();
  const weatherOutput = document.getElementById("weatherOutput");

  currentChecklist = [];
  packedChecklist = [];

  for (const [category, items] of Object.entries(modules)) {
    const relevantItems = items.filter(item => isItemRelevant(item, tripType, tripRole, activities)).map(item => ({ ...item, module: category }));
    currentChecklist.push(...relevantItems);
  }

  renderChecklists();

  location ? fetchWeather(location, weatherOutput) : (weatherOutput.textContent = "Please enter a location to see the weather.");
}

// =======================================================
// Weather Fetcher
// =======================================================

/** Fetch today's and tomorrow's weather forecast based on user city. */
function fetchWeather(location, outputElement) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;

  fetch(geoUrl)
    .then(res => res.json())
    .then(geoData => {
      if (!geoData.results || geoData.results.length === 0) {
        outputElement.textContent = "Location not found.";
        return;
      }

      const { latitude, longitude, name, country } = geoData.results[0];
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&current_weather=true&timezone=auto`;

      return fetch(weatherUrl)
        .then(res => res.json())
        .then(weatherData => {
          const { temperature } = weatherData.current_weather;
          const minTemp = weatherData.daily.temperature_2m_min[1];
          const maxTemp = weatherData.daily.temperature_2m_max[1];
          const rainTomorrow = weatherData.daily.precipitation_sum[1];

          const rainMessage = rainTomorrow > 0
            ? `🌧️ Rain expected tomorrow: ${rainTomorrow} mm`
            : `🌞 No rain expected tomorrow.`;

          outputElement.innerHTML = `
            <strong>Weather in ${name}, ${country}:</strong><br />
            🌡️ Today: ${temperature}°C<br />
            🔻 Tomorrow Min: ${minTemp}°C<br />
            🔺 Tomorrow Max: ${maxTemp}°C<br />
            ${rainMessage}
          `;
          outputElement.classList.remove("weather-loading");
          outputElement.classList.add("weather-loaded");
        });
    })
    .catch(() => {
      outputElement.textContent = "Unable to load weather data.";
    });
}

/** Show a loading message while weather data is being fetched. */
function showLoadingWeather() {
  const weatherOutput = document.getElementById("weatherOutput");
  weatherOutput.textContent = "Loading weather...";
  weatherOutput.classList.remove("weather-loaded");
  weatherOutput.classList.add("weather-loading");
}

/** Fetch updated weather forecast after user changes input. */
function handleLocationChange() {
  const weatherOutput = document.getElementById("weatherOutput");
  const location = getDestinationCity();

  if (location.trim() !== "") {
    fetchWeather(location, weatherOutput);
  } else {
    weatherOutput.textContent = "Please enter a location to see the weather.";
    weatherOutput.classList.remove("weather-loading", "weather-loaded");
  }
}

// =======================================================
// Event Binding
// =======================================================

/** Bind event listeners to buttons and inputs for user interaction. */
document.getElementById("generateBtn").addEventListener("click", generateChecklist);

document.querySelectorAll('input[name="cityOption"]').forEach(radio => {
  radio.addEventListener("change", () => {
    showLoadingWeather();
    handleLocationChange();
  });
});

const debouncedHandleLocationChange = debounce(handleLocationChange, 500);

document.getElementById("customCity").addEventListener("input", () => {
  showLoadingWeather();
  debouncedHandleLocationChange();
});

// =======================================================
// End of App
// =======================================================
