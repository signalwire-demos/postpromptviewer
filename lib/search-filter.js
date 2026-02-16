/**
 * Shared utilities for search and filter functionality
 */

/**
 * Debounce a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Check if text matches search query
 * @param {string} text - Text to search in
 * @param {string} query - Search query
 * @param {boolean} caseSensitive - Whether search is case sensitive
 * @returns {boolean} True if text matches query
 */
export function matchesSearch(text, query, caseSensitive = false) {
  if (!text || !query) return false;

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  return searchText.includes(searchQuery);
}

/**
 * Count matches in text
 * @param {string} text - Text to search in
 * @param {string} query - Search query
 * @param {boolean} caseSensitive - Whether search is case sensitive
 * @returns {number} Number of matches
 */
export function countMatches(text, query, caseSensitive = false) {
  if (!text || !query) return 0;

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  let count = 0;
  let pos = 0;

  while ((pos = searchText.indexOf(searchQuery, pos)) !== -1) {
    count++;
    pos += searchQuery.length;
  }

  return count;
}

/**
 * Highlight matches in text with <mark> tags
 * @param {string} text - Text to highlight
 * @param {string} query - Search query
 * @param {boolean} caseSensitive - Whether search is case sensitive
 * @returns {string} HTML string with highlighted matches
 */
export function highlightMatches(text, query, caseSensitive = false) {
  if (!text || !query) return escapeHtml(text);

  // Escape the text first for safety
  const escapedText = escapeHtml(text);

  // Create a case-insensitive regex for the query
  const flags = caseSensitive ? 'g' : 'gi';
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedQuery, flags);

  // Replace matches with highlighted version
  return escapedText.replace(regex, (match) => {
    return `<mark class="search-highlight">${match}</mark>`;
  });
}

/**
 * Smooth scroll to element with offset
 * @param {HTMLElement} element - Element to scroll to
 * @param {number} offset - Offset from top in pixels
 */
export function scrollToElement(element, offset = 0) {
  if (!element) return;

  const elementTop = element.getBoundingClientRect().top;
  const offsetPosition = elementTop + window.pageYOffset - offset;

  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth'
  });
}

/**
 * Deep search in JSON object
 * @param {any} obj - Object to search in
 * @param {string} query - Search query
 * @param {boolean} caseSensitive - Whether search is case sensitive
 * @returns {boolean} True if query found in object
 */
export function searchInObject(obj, query, caseSensitive = false) {
  if (!obj || !query) return false;

  const searchQuery = caseSensitive ? query : query.toLowerCase();

  function search(value) {
    if (value === null || value === undefined) return false;

    // Convert to string and search
    const str = caseSensitive ? String(value) : String(value).toLowerCase();
    if (str.includes(searchQuery)) return true;

    // Recursively search in objects and arrays
    if (typeof value === 'object') {
      for (const key in value) {
        if (search(value[key])) return true;
      }
    }

    return false;
  }

  return search(obj);
}

/**
 * Filter data structure to only include fields that match search query
 * @param {any} data - Data to filter
 * @param {string} query - Search query
 * @param {boolean} caseSensitive - Whether search is case sensitive
 * @returns {any} Filtered data containing only matching fields, or null if no matches
 */
export function filterDataBySearch(data, query, caseSensitive = false) {
  if (!query) return data;

  const searchQuery = caseSensitive ? query : query.toLowerCase();

  function matchesQuery(value) {
    if (value === null || value === undefined) return false;
    const str = caseSensitive ? String(value) : String(value).toLowerCase();
    return str.includes(searchQuery);
  }

  function filter(value, key = '') {
    // Check if the key itself matches
    const keyMatches = key && matchesQuery(key);

    // Primitive values
    if (value === null || value === undefined || typeof value !== 'object') {
      // Include if value matches OR key matches
      return (matchesQuery(value) || keyMatches) ? value : undefined;
    }

    // Arrays
    if (Array.isArray(value)) {
      const filtered = value
        .map((item, idx) => filter(item, String(idx)))
        .filter(item => item !== undefined);

      // Include array if it has filtered items OR if key matches
      return filtered.length > 0 || keyMatches ? filtered : undefined;
    }

    // Objects
    const filtered = {};
    let hasMatches = false;

    for (const [k, v] of Object.entries(value)) {
      const filteredValue = filter(v, k);
      if (filteredValue !== undefined) {
        filtered[k] = filteredValue;
        hasMatches = true;
      }
    }

    // Include object if it has matches OR if the parent key matches
    return hasMatches || keyMatches ? filtered : undefined;
  }

  const result = filter(data);
  return result !== undefined ? result : null;
}
