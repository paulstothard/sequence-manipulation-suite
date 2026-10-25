import { runTextTableImage } from '../shared/text-table-image-run.js';
export function runTextImage(input, options = {}, context = {}) {
  return runTextTableImage(input, { ...options, inputMode: 'text' }, context);
}
