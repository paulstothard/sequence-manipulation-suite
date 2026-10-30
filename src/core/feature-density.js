// Viewport bins are zero-based, half-open; feature parts are one-based, inclusive.
// Aggregate only drawing geometry. Original feature records remain untouched.
export function featureDensityBins(items, { viewStart, viewEnd, binCount, color, length }) {
  const span = viewEnd - viewStart;
  if (!(span > 0) || !(binCount > 0)) return [];
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: viewStart + span * index / binCount,
    end: viewStart + span * (index + 1) / binCount,
    count: 0,
    colors: new Map()
  }));
  for (const item of items) {
    const rawParts = Array.isArray(item.displayParts) ? item.displayParts : item.parts?.length ? item.parts : [{
      start: item.start ?? item.position,
      end: item.end ?? item.position ?? item.start
    }];
    const parts = rawParts.flatMap(part => Number(part.start) > Number(part.end) && length > 0
      ? [{ start: part.start, end: length }, { start: 1, end: part.end }] : [part]);
    const occupied = new Set();
    for (const part of parts) {
      const start = Math.max(viewStart, Number(part.start) - 1);
      const end = Math.min(viewEnd, Number(part.end));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const first = Math.max(0, Math.floor((start - viewStart) / span * binCount));
      const last = Math.min(binCount - 1, Math.ceil((end - viewStart) / span * binCount) - 1);
      for (let index = first; index <= last; index++) occupied.add(index);
    }
    for (const index of occupied) {
      const bin = bins[index], fill = item.color || color;
      bin.count++;
      bin.colors.set(fill, (bin.colors.get(fill) || 0) + 1);
    }
  }
  return bins.map(bin => ({ ...bin, colors: [...bin.colors].map(([color, count]) => ({ color, count })) }));
}
