// DOM helpers and debounce utility
export function qs(selector) {
    return document.querySelector(selector);
  }
  
  export function ce(tag, props = {}) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    return el;
  }
  
  export function debounce(fn, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }