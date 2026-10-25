import { isImageColor, withColorOpacity, colorOpacity } from '../core/image-colors.js';

const key = 'sms3.image-editor.recent-colors.v1';
let memory = [];
export function recentImageColors() {
  try {
    const stored = localStorage.getItem(key);
    const values = stored === null ? memory : stored.length < 2048 ? JSON.parse(stored) : [];
    if (Array.isArray(values)) memory = [...new Set(values.filter(isImageColor).map(c => withColorOpacity(c, colorOpacity(c))))].slice(0, 12);
  } catch { /* Keep session colors when browser storage is unavailable. */ }
  return memory.slice();
}
export function rememberImageColor(color) {
  if (!isImageColor(color)) return;
  color = withColorOpacity(color, colorOpacity(color));
  memory = [color, ...recentImageColors().filter(c => c !== color)].slice(0, 12);
  try { localStorage.setItem(key, JSON.stringify(memory)); } catch { /* Session-only fallback. */ }
}
