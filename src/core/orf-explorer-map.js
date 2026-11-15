import { ORF_FRAMES } from './orf-explorer.js';

export const ORF_MAP_ARROW_LIMIT = 200;

// All matching intervals contribute, independently of the table's page/order.
// Coordinates here are 1-based inclusive. Density counts intervals overlapping
// each bin, not bases covered or starts; a long ORF can contribute to many bins.
export function summarizeOrfMap(orfs, start, end, width, individualLimit = ORF_MAP_ARROW_LIMIT) {
  const visible = orfs.filter(orf => orf.start <= end && orf.end >= start);
  if (visible.length <= individualLimit) return { visible, density: null };
  const first = Math.max(1, Math.floor(start)), last = Math.ceil(end);
  const binSize = Math.max(1, Math.ceil((last - first + 1) / Math.max(1, Math.min(160, Math.floor(width / 12)))));
  const binCount = Math.ceil((last - first + 1) / binSize);
  const frames = new Map(ORF_FRAMES.map(frame => [frame, {
    complete: new Int32Array(binCount + 1), partial: new Int32Array(binCount + 1)
  }]));
  for (const orf of visible) {
    const values = frames.get(orf.frame)[orf.complete ? 'complete' : 'partial'];
    const low = Math.max(0, Math.floor((orf.start - first) / binSize));
    const high = Math.min(binCount - 1, Math.floor((orf.end - first) / binSize));
    values[low]++; values[high + 1]--;
  }
  let maximum = 0;
  const bins = [];
  for (const [frame, values] of frames) {
    let complete = 0, partial = 0;
    for (let index = 0; index < binCount; index++) {
      complete += values.complete[index]; partial += values.partial[index];
      maximum = Math.max(maximum, complete + partial);
      bins.push({ frame, index, start: first + index * binSize,
        end: Math.min(last, first + (index + 1) * binSize - 1), complete, partial });
    }
  }
  return { visible, density: { bins, maximum, binSize } };
}
