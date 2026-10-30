// Coordinates are CSS pixels. The sequence block can precede a long annotation
// stack, while every visible track still contributes to the complete height.
export function calculateLinearViewerRows(trackLayouts, options = {}) {
  const compact = options.compactLayout === true;
  const firstRow = compact ? 70 : 88;
  const gap = compact ? 16 : 32;
  const padding = compact ? 30 : 48;
  let trackBottom = firstRow;
  const trackYs = trackLayouts.map(layout => {
    const row = { ...layout, y: trackBottom + layout.height / 2, topY: trackBottom };
    trackBottom += layout.height;
    return row;
  });
  const rows = {
    trackYs, plus1Y: null, plus2Y: null, plus3Y: null,
    dnaTopY: null, dnaBottomY: null, minus1Y: null, minus2Y: null, minus3Y: null,
    bottomRulerY: compact ? trackBottom : Math.max(trackBottom + 32, 154), markerTop: 28
  };
  if (!options.hideSequence) {
    const sequenceFirst = options.sequencePosition === 'top';
    const origin = sequenceFirst ? firstRow : trackBottom;
    if (sequenceFirst && compact && !options.protein) {
      rows.dnaTopY = options.hideRulers ? 14 : firstRow;
      rows.dnaBottomY = options.showSecondStrand ? rows.dnaTopY + 16 : null;
      let cursor = (rows.dnaBottomY ?? rows.dnaTopY) + 20;
      if (options.showForwardTranslations) {
        rows.plus1Y = cursor;
        rows.plus2Y = cursor + gap;
        rows.plus3Y = cursor + gap * 2;
        cursor = rows.plus3Y + (options.showReverseTranslations ? 20 : 14);
      }
      if (options.showReverseTranslations) {
        rows.minus1Y = cursor;
        rows.minus2Y = cursor + gap;
        rows.minus3Y = cursor + gap * 2;
        cursor = rows.minus3Y + 14;
      }
      rows.bottomRulerY = cursor;
    } else if (options.protein) {
      rows.dnaTopY = sequenceFirst ? compact && options.hideRulers ? 14 : firstRow : Math.max(origin + 42, 154);
      rows.bottomRulerY = rows.dnaTopY + (compact ? 20 : padding);
    } else {
      rows.plus1Y = sequenceFirst ? firstRow : Math.max(origin + 18, 154);
      rows.plus2Y = rows.plus1Y + gap;
      rows.plus3Y = rows.plus2Y + gap;
      rows.dnaTopY = (options.showForwardTranslations ? rows.plus3Y : rows.plus1Y - gap) + (compact ? 30 : 42);
      rows.dnaBottomY = options.showSecondStrand ? rows.dnaTopY + (compact ? 22 : 30) : null;
      rows.minus1Y = options.showSecondStrand ? rows.dnaBottomY + (compact ? 32 : 46) : rows.dnaTopY + padding;
      rows.minus2Y = rows.minus1Y + gap;
      rows.minus3Y = rows.minus2Y + gap;
      const lastSequenceY = options.showReverseTranslations ? rows.minus3Y : rows.dnaBottomY ?? rows.dnaTopY;
      rows.bottomRulerY = lastSequenceY + padding;
    }
    if (sequenceFirst && trackYs.length) {
      const offset = rows.bottomRulerY - firstRow;
      for (const row of trackYs) {
        row.topY += offset;
        row.y += offset;
      }
      rows.bottomRulerY = trackBottom + offset + (compact ? 0 : 32);
    }
  }
  if (options.hideRulers) rows.markerTop = 0;
  rows.markerBottom = rows.bottomRulerY + (compact ? 0 : 14);
  return rows;
}

// Tall annotation stacks must remain complete without exceeding browser bitmap
// dimensions or allocating an unbounded high-DPI backing store.
export function linearViewerCanvasSize(width, height, pixelRatio = 1) {
  const ratio = Math.min(pixelRatio, 16384 / Math.max(width, height), Math.sqrt(16_777_216 / (width * height)));
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
    pixelRatio: ratio
  };
}

export function linearTrackLabelY(row, options = {}) {
  if (!row.stacked && !row.reservedSlots) return row.y;
  // Keep the name beside the first feature lane at every zoom, including
  // density summaries and empty windows. Visible overlaps never move it.
  return row.topY + (options.compactLayout ? 9 : row.displayMode === 'squished' ? 10 : 13);
}
