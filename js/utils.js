/**
 * @file utils.js
 * @description
 * Provides common DOM manipulation helpers and a function debouncer for efficient event handling.
 */

/**
 * Selects the first matching element for a given CSS selector.
 * @param {string} selector - CSS selector string to query the document.
 * @returns {Element|null} The first matching DOM element, or null if none found.
 */
export function qs(selector) {
  return document.querySelector(selector);
}

/**
 * Creates an element of the specified tag and applies provided properties.
 * Useful for concise DOM element construction with attributes, classes, and event handlers.
 *
 * @param {string} tag - The HTML tag name to create (e.g., "div", "input").
 * @param {Object} [props={}] - An object where keys are property names to assign on the element.
 *   Common props include:
 *     - className: CSS class string
 *     - id: element ID
 *     - textContent: inner text of the element
 *     - attributes (via direct prop assignment)
 *     - event listeners can be attached separately after creation
 * @returns {HTMLElement} The newly created and configured DOM element.
 */
export function ce(tag, props = {}) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  return el;
}

/**
 * Returns a debounced version of the provided function.
 * The debounced function delays invoking `fn` until after `delay` milliseconds
 * have passed since the last time it was called. Useful for rate-limiting events like input or scroll.
 *
 * @param {Function} fn - The function to debounce.
 * @param {number} delay - Delay in milliseconds to wait after the last invocation before calling `fn`.
 * @returns {Function} A new debounced function that wraps `fn`.
 */
export function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    // Clear any existing scheduled call
    clearTimeout(timeout);
    // Schedule new invocation
    timeout = setTimeout(() => fn(...args), delay);
  };
}
