import { getOutputSearchCountText } from './output-search.js';

// Repeated text regions use the same structure and styles as the shell's search row.
export function createOutputSearchControls(label = 'Search output') {
  const row = document.createElement('div');
  row.className = 'output-search-row';
  row.setAttribute('aria-label', label);
  const query = document.createElement('label');
  query.className = 'output-search-query';
  query.append('Find');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search output';
  input.setAttribute('aria-label', label);
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('autocorrect', 'off');
  input.spellcheck = false;
  input.setAttribute('writingsuggestions', 'false');
  query.append(input);
  const previous = document.createElement('button'), next = document.createElement('button');
  previous.type = next.type = 'button';
  previous.textContent = 'Previous';
  next.textContent = 'Next';
  const count = document.createElement('span');
  count.className = 'output-search-count';
  count.setAttribute('role', 'status');
  row.append(query, previous, next, count);
  const parts = { row, input, previous, next, count };
  updateOutputSearchControls(parts);
  return parts;
}

export function updateOutputSearchControls(parts, matches = [], currentIndex = -1) {
  parts.count.textContent = getOutputSearchCountText({
    query: parts.input.value, matchCount: matches.length, currentIndex
  });
  parts.count.title = matches[currentIndex]?.trackLabel ?? '';
  parts.previous.disabled = parts.next.disabled = matches.length < 2;
}
