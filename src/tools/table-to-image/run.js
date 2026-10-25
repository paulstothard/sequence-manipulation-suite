import { runTextTableImage } from '../shared/text-table-image-run.js';
export function runTableImage(input, options = {}, context = {}) {
  return runTextTableImage(input, { ...options, inputMode: 'table' }, context);
}
