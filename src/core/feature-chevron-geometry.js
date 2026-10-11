// Match the ORF map's inset direction marks, leaving short/thin blocks plain.
export function featureChevronSegments(start, end, height, strand, exclusions = [], phase = 0) {
  if (![start, end, height, phase].every(Number.isFinite) || end - start < 20 || height < 6 || !['+', '-'].includes(strand)) return [];
  const halfHeight = Math.min(3.5, height / 2 - 1.5);
  const halfRun = Math.min(2.5, halfHeight);
  const first = phase + Math.ceil((start + 7 + halfRun - phase) / 24) * 24;
  const segments = [];
  for (let x = first; x <= end - 7 - halfRun; x += 24) {
    if (exclusions.some(range => x + halfRun >= range.start - 7 && x - halfRun <= range.end + 7)) continue;
    const tail = x + (strand === '+' ? -halfRun : halfRun);
    const tip = x + (strand === '+' ? halfRun : -halfRun);
    segments.push([[tail, -halfHeight], [tip, 0], [tail, halfHeight]]);
  }
  return segments;
}
