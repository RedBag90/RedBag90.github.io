# Business Trip Checklist

A weather-aware business trip checklist web app designed for incremental delivery in Scrum sprints. The application leverages vanilla JavaScript (ES modules), semantic HTML5, and modern CSS3.

## 🌟 Features

- Checklist generation from JSON templates with activity, duration, and weather add-ons.
- Weather integration via Open-Meteo (configurable provider/API key hook).
- Responsive layout (two-column desktop; stacked mobile), accessible controls, keyboard-friendly dialogs.
- Advanced capabilities: progress tracking, custom items, localStorage persistence, shareable URLs, export to TXT (PDF via browser print).

## 🗂 Project Structure

```
project-root/
├─ index.html
├─ src/
│  ├─ main.js
│  ├─ utils.js
│  ├─ checklist.js
│  └─ weather.js
├─ styles/
│  ├─ base.css
│  ├─ layout.css
│  └─ components.css
├─ assets/
│  └─ icons/ (place SVG assets here)
├─ tests/
│  ├─ checklist.test.js
│  └─ utils.test.js
├─ .github/workflows/deploy.yml
├─ package.json
├─ .eslintrc.json
└─ .prettierrc
```

## 🧱 Architecture & Data Model

- **Modules**: `main.js` orchestrates UI logic; `checklist.js` handles state and rendering; `weather.js` fetches forecasts; `utils.js` provides shared helpers.
- **Default checklist JSON**:
  ```json
  {
    "clothing": ["shirt", "trousers", "jacket"],
    "tech": ["laptop", "charger", "phone"],
    "documents": ["passport", "tickets", "insurance"]
  }
  ```
- **Duration mapping**: `mapDurationToItems(days)` scales clothing quantities.
- **Weather mapping**: `mapWeatherToItems(weatherCondition)` adds rain/cold gear.
- **Persistence**: LocalStorage snapshot (`toPack`, `packed`).
- **Sharing**: URL-safe payload via `encodeChecklistState`/`decodeChecklistState`.

## 🛠 Getting Started

```bash
npm install
npm run dev     # start Vite preview (optional enhancement)
npm run test    # run Vitest (jsdom environment)
npm run lint    # check ESLint rules
```

Configure an optional weather API key by adding a meta tag in `index.html`:
```html
<meta name="weather-api-key" content="YOUR_KEY" />
```

## 🚀 Deployment

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs linting/tests and publishes the site to GitHub Pages. Ensure Pages is enabled for the repository and points to the workflow.

## ✅ Testing & Quality Gates

- **Vitest** for unit tests (`npm run test`).
- **ESLint + Prettier** keep code style consistent.
- Extend tests with integration cases for checklist interactions and weather fallbacks as features evolve.

## ℹ️ Usage Notes

- **Share link format**: the app serialises state into the `?s=` query parameter using a base64url-encoded payload with short keys (`t` for trip, `i` for items, `w` for weather). Custom items and checked flags are preserved. Links generated before this release (`?state=` payload) continue to work.
- **Weather auto-update**: changing the city or country field triggers a debounced (500 ms) lookup. Results are cached per city/day for 10 minutes and are safely aborted on rapid typing. Failures leave the current checklist untouched and surface an inline retry button.
- **PDF export**: `Export Checklist` mounts a print-optimised layout (A4 by default) and opens the browser print dialog. Enable “Background graphics” for best results. Safari may require confirming the print preview before closing the overlay.
- **Quick manual test**:
  1. Select “Berlin”, duration `5`, enable “Pitching”.
  2. Wait for weather to load, then click `Generate Checklist`.
  3. Add a custom item, toggle a few entries, export to PDF, and copy the share link to verify round-trip loading in a new tab.
- **Packing templates**: Choose a built-in or saved template from the toolbar (Merge keeps existing items; Replace swaps out everything except custom/weather entries). Save your current list as a template (optionally including weather items); templates persist in `localStorage` and are capped at 500 entries.
- **Bags & zones**: Assign each item to Carry-on, Checked, Personal, or Work zones; the bag summary bar shows packed progress per bag, and exports are grouped with per-bag subtotals. Bag assignments are shared in URLs and preserved in templates.

## ♿ Accessibility Considerations

- Semantic regions (`header`, `main`, `section`).
- ARIA labels for live regions, dialogs, and grouped checkboxes.
- Focus indicators on interactive elements.

## 📅 Suggested Scrum Roadmap

1. **Sprint 1 – Setup & Skeleton**: project scaffolding, static checklist render, initial deploy.
2. **Sprint 2 – Data & Logic**: duration mapping, localStorage, grouping, CI setup.
3. **Sprint 3 – Weather Integration**: API fetch, weather-driven add-ons, responsive layout.
4. **Sprint 4 – Comfort & Accessibility**: progress bar polish, custom items, accessibility audit.
5. **Sprint 5 – Value Add-ons**: export/share refinements, monitoring hooks, release notes.

## 📄 License

MIT
