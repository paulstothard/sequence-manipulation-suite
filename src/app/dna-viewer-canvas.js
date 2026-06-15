import { geneticCodes, getStartCodons, makeCodonMap } from "../core/genetic-code.js";
import { complementDnaRnaSequence } from "../core/sequence.js";
import {
  clipStackedIntervalLayout,
  createStackedIntervalLayout,
  isStackedIntervalTrack,
  makeLinearIntervalCopies
} from "../core/viewer-track-layout.js";
import { downloadCanvasPng, downloadCanvasSvg, makeSafeFileStem } from "./canvas-export.js";
import {
  addRectHit,
  createRangePanel,
  createSelectionPanel,
  createViewerInspectorWorkspace,
  createViewerTrackControls,
  createViewerTooltip,
  createViewerSearchControls,
  getViewerFeatureTypeStyle,
  getViewerTrackItems,
  getVisibleViewerTracks,
  getViewerTrackDisplayMode,
  hasHiddenViewerItemTypes,
  hideViewerTooltip,
  hitTestRegions,
  makeViewerItemTargetDetails,
  makeTargetKey,
  makeViewerFeatureSuggestions,
  renderRangePanel,
  renderSelectionPanel,
  showViewerTooltip,
  updateViewerSearchControls
} from "./dna-viewer-interactions.js";
import {
  createViewerCompositionControls,
  initializeViewerCompositionTracks,
  snapshotViewerCompositionState
} from "./dna-viewer-composition-controls.js";
import { getFeatureLabelRenderPlan } from "./viewer-label-rules.js";
import {
  getViewerBaseColor,
  getViewerCanvasTheme,
  getViewerResidueColor,
  getViewerTrackColor
} from "./viewer-canvas-theme.js";
import {
  allowsViewerInertia,
  createInertiaVelocityTracker,
  shouldStartViewerInertia,
  startViewerInertia
} from "./viewer-inertia.js";
const PLOT_LEFT = 118;
const PLOT_RIGHT_GUTTER = 34;
const MIN_LINEAR_PLOT_WIDTH = 260;
const MIN_LINEAR_VIEW_SPAN = 10;
const LINEAR_SEQUENCE_LETTER_EDGE_PADDING = 9;
const LINEAR_TRACK_LABEL_LEFT_PADDING = 6;
const LINEAR_TRACK_LABEL_RIGHT_GAP = 4;
const ZOOM_LIMIT_WHEEL_PAN_DEAD_ZONE = 0.18;
const ZOOM_LIMIT_WHEEL_PAN_MAX_FRACTION = 0.24;
const FEATURE_SLOT_HEIGHT = 18;
const SQUISHED_FEATURE_SLOT_HEIGHT = 10;
const FEATURE_SLOT_MAX = 16;
const RESTRICTION_SITE_LABEL_PX_PER_BP = 10;
const RESTRICTION_SITE_LABEL_GAP = 8;
const ALIGNED_READ_BASE_PX_PER_BP = 9;
const ALIGNED_READ_BASE_TEXT_Y_OFFSET = 1;
const DENSITY_ITEM_THRESHOLD = 700;
const DENSITY_PX_PER_UNIT_THRESHOLD = 0.03;
const renderedViewerSessions = new WeakMap();
const ICONS = {
  zoomIn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.25"/><path d="m15.25 15.25 4.25 4.25"/><path d="M10.5 7.75v5.5M7.75 10.5h5.5"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.25"/><path d="m15.25 15.25 4.25 4.25"/><path d="M7.75 10.5h5.5"/></svg>',
  panLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5"/><path d="M20 12H9.5"/></svg>',
  panRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5"/><path d="M4 12h10.5"/></svg>',
  fitView: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4"/><path d="M16 4h4v4"/><path d="M20 16v4h-4"/><path d="M8 20H4v-4"/><path d="M8 12h8"/></svg>',
  pngFile: '<span class="dna-viewer-export-label">PNG</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8"/><path d="m6.9 8.55 3.1 3.1 3.1-3.1"/><path d="M4.25 15.75h11.5"/></svg>',
  svgFile: '<span class="dna-viewer-export-label">SVG</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8"/><path d="m6.9 8.55 3.1 3.1 3.1-3.1"/><path d="M4.25 15.75h11.5"/></svg>'
};

const VIEWER_DNA_RNA_IUPAC = /^[ACGTURYSWKMBDHVNX]$/i;

export function complementBase(base) {
  const value = String(base ?? "");
  if (!VIEWER_DNA_RNA_IUPAC.test(value)) {
    return "N";
  }
  return complementDnaRnaSequence(value, { preserveCase: false });
}

function reverseComplement(sequence) {
  let output = "";
  for (let index = sequence.length - 1; index >= 0; index -= 1) {
    output += complementBase(sequence[index]);
  }
  return output;
}

function getViewerGeneticCode(record, state) {
  return state.geneticCode || record.geneticCode || "1";
}

function translateCodon(codon, codonMap) {
  return codonMap.get(String(codon).toUpperCase().replaceAll("U", "T")) || "X";
}

function niceTickStep(span) {
  const rough = Math.max(1, span / 8);
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / pow10;
  if (scaled <= 1) return pow10;
  if (scaled <= 2) return 2 * pow10;
  if (scaled <= 5) return 5 * pow10;
  return 10 * pow10;
}

function bpToX(bp, plotLeft, plotRight, viewStart, viewEnd) {
  return plotLeft + ((bp - viewStart) / (viewEnd - viewStart)) * (plotRight - plotLeft);
}

export function getLinearRulerTicks(state) {
  const span = state.viewEnd - state.viewStart;
  const tickStep = niceTickStep(span);
  const minLabel = Math.max(1, Math.ceil(state.viewStart + 0.5));
  const maxLabel = Math.max(1, Math.floor(state.viewEnd + 0.5));
  const ticks = [];
  const firstBaseCenter = 0.5;
  if (firstBaseCenter >= state.viewStart && firstBaseCenter <= state.viewEnd) {
    ticks.push({ centerBp: firstBaseCenter, label: 1 });
  }
  const firstTick = Math.max(tickStep, Math.ceil(minLabel / tickStep) * tickStep);
  for (let label = firstTick; label <= maxLabel; label += tickStep) {
    if (label === 1) continue;
    ticks.push({ centerBp: label - 0.5, label });
  }
  return ticks;
}

function clampLinearViewRange(viewStart, viewEnd, length) {
  const safeLength = Math.max(1, Number(length) || 1);
  const minSpan = Math.min(safeLength, MIN_LINEAR_VIEW_SPAN);
  let start = Number(viewStart);
  let end = Number(viewEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    start = 0;
    end = safeLength;
  }
  let span = end - start;
  if (span < minSpan) {
    const center = (start + end) / 2;
    start = center - minSpan / 2;
    end = center + minSpan / 2;
    span = minSpan;
  }
  if (span >= safeLength) {
    return { viewStart: 0, viewEnd: safeLength };
  }
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > safeLength) {
    const extra = end - safeLength;
    start -= extra;
    end = safeLength;
  }
  return {
    viewStart: Math.max(0, start),
    viewEnd: Math.min(safeLength, end)
  };
}

function clampView(state, length) {
  const next = clampLinearViewRange(state.viewStart, state.viewEnd, length);
  state.viewStart = next.viewStart;
  state.viewEnd = next.viewEnd;
}

function limitZoomPanFraction(pointerFraction) {
  const offset = Math.max(-0.5, Math.min(0.5, Number(pointerFraction) - 0.5));
  const distance = Math.abs(offset);
  if (distance <= ZOOM_LIMIT_WHEEL_PAN_DEAD_ZONE) {
    return 0;
  }
  const strength = (distance - ZOOM_LIMIT_WHEEL_PAN_DEAD_ZONE) / (0.5 - ZOOM_LIMIT_WHEEL_PAN_DEAD_ZONE);
  return Math.sign(offset) * Math.min(ZOOM_LIMIT_WHEEL_PAN_MAX_FRACTION, strength * ZOOM_LIMIT_WHEEL_PAN_MAX_FRACTION);
}

export function computeLinearZoomState(state, length, pointerFraction, factor) {
  const current = clampLinearViewRange(state?.viewStart, state?.viewEnd, length);
  const safeLength = Math.max(1, Number(length) || 1);
  const minSpan = Math.min(safeLength, MIN_LINEAR_VIEW_SPAN);
  const oldSpan = current.viewEnd - current.viewStart;
  const zoomFactor = Number(factor);
  const fraction = Math.max(0, Math.min(1, Number(pointerFraction)));
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0 || !Number.isFinite(fraction)) {
    return current;
  }

  const newSpan = Math.max(minSpan, Math.min(safeLength, oldSpan / zoomFactor));
  let nextStart;
  if (zoomFactor > 1 && oldSpan <= minSpan + 1e-9 && Math.abs(newSpan - oldSpan) < 1e-9) {
    nextStart = current.viewStart + oldSpan * limitZoomPanFraction(fraction);
  } else {
    const anchorBp = current.viewStart + fraction * oldSpan;
    nextStart = anchorBp - fraction * newSpan;
  }
  return clampLinearViewRange(nextStart, nextStart + newSpan, safeLength);
}

export function shouldDrawLinearSequenceLetter(x, plotLeft, plotRight) {
  return x >= plotLeft + LINEAR_SEQUENCE_LETTER_EDGE_PADDING && x <= plotRight - LINEAR_SEQUENCE_LETTER_EDGE_PADDING;
}

export function shouldDrawAlignedReadBaseLetter(x, readLeft, readRight, plotLeft, plotRight) {
  const left = Math.max(readLeft, plotLeft);
  const right = Math.min(readRight, plotRight);
  return x >= left && x <= right;
}

function fitCanvasText(ctx, text, maxWidth) {
  const value = String(text ?? "");
  if (!value || !Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (ctx.measureText(value).width <= maxWidth) return value;
  const suffix = "…";
  const suffixWidth = ctx.measureText(suffix).width;
  if (suffixWidth >= maxWidth) return suffix;
  let end = value.length - 1;
  while (end > 1 && ctx.measureText(value.slice(0, end) + suffix).width > maxWidth) {
    end -= 1;
  }
  return `${value.slice(0, end)}${suffix}`;
}

function drawLinearTrackLabel(ctx, label, plotLeft, y) {
  const rightEdge = plotLeft - LINEAR_TRACK_LABEL_RIGHT_GAP;
  const maxWidth = Math.max(1, rightEdge - LINEAR_TRACK_LABEL_LEFT_PADDING);
  ctx.fillText(fitCanvasText(ctx, label, maxWidth), rightEdge, y);
}

function canRevealSequenceDetail(record, state) {
  const span = state.viewEnd - state.viewStart;
  return record.length <= 30 || span <= Math.min(120, record.length * 0.8);
}

function isProteinRecord(record) {
  return record.alphabet === "protein";
}

function coordinateUnit(record) {
  return isProteinRecord(record) ? "aa" : "bp";
}

function getLinearPlotBounds(width) {
  const safeWidth = Math.max(PLOT_LEFT + PLOT_RIGHT_GUTTER + MIN_LINEAR_PLOT_WIDTH, Number(width) || 0);
  return {
    plotLeft: PLOT_LEFT,
    plotRight: safeWidth - PLOT_RIGHT_GUTTER
  };
}

function visiblePointItems(track, state, viewStart, viewEnd) {
  return getViewerTrackItems(track, state).filter((item) => {
    const position = Number(item.position);
    return Number.isFinite(position) && position >= viewStart && position <= viewEnd;
  });
}

function restrictionSiteCutPosition(site) {
  const position = Number(site?.cutPosition ?? site?.cutAfter ?? site?.position ?? site?.start);
  return Number.isFinite(position) ? position : null;
}

function canShowRestrictionSiteLabels(pxPerBp, displayMode) {
  return displayMode !== "squished" && pxPerBp >= RESTRICTION_SITE_LABEL_PX_PER_BP;
}

function overlapsPlacedRestrictionLabel(box, placedLabels) {
  return placedLabels.some((placed) =>
    box.left < placed.right + RESTRICTION_SITE_LABEL_GAP &&
    box.right + RESTRICTION_SITE_LABEL_GAP > placed.left
  );
}

function drawAlignedReadBases(ctx, item, state, layout, rect, theme) {
  const bases = Array.isArray(item?.alignedReadBases) ? item.alignedReadBases : [];
  if (!bases.length || layout.pxPerBp < ALIGNED_READ_BASE_PX_PER_BP || rect.widthPx < ALIGNED_READ_BASE_PX_PER_BP) {
    return false;
  }
  const { plotLeft, plotRight } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + 1, rect.y - rect.height / 2, Math.max(1, rect.widthPx - 2), rect.height);
  ctx.clip();
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const entry of bases) {
    const position = Number(entry.position);
    if (!Number.isFinite(position) || position < state.viewStart + 1 || position > state.viewEnd) {
      continue;
    }
    const x = bpToX(position - 0.5, plotLeft, plotRight, state.viewStart, state.viewEnd);
    if (!shouldDrawAlignedReadBaseLetter(x, rect.x, rect.x + rect.widthPx, plotLeft, plotRight)) {
      continue;
    }
    const base = String(entry.base || "N").slice(0, 1).toUpperCase();
    const isReadGap = base === "-" || entry.op === "D" || entry.op === "N";
    if (isReadGap) {
      drawAlignedReadGapMarker(ctx, x, rect, layout, theme);
      continue;
    }
    if (entry.matchesReference === false) {
      const markerWidth = Math.max(6, Math.min(layout.pxPerBp * 0.84, 12));
      ctx.fillStyle = theme.stopFill;
      ctx.fillRect(x - markerWidth / 2, rect.y - rect.height / 2, markerWidth, rect.height);
    }
    ctx.fillStyle = getViewerBaseColor(theme, base);
    ctx.fillText(base, x, rect.y + ALIGNED_READ_BASE_TEXT_Y_OFFSET);
  }
  ctx.restore();
  return true;
}

function drawAlignedReadGapMarker(ctx, x, rect, layout, theme) {
  const dashWidth = Math.max(5, Math.min(layout.pxPerBp * 0.62, 9));
  ctx.save();
  ctx.strokeStyle = theme.alignedReadGapStroke;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x - dashWidth / 2, rect.y);
  ctx.lineTo(x + dashWidth / 2, rect.y);
  ctx.stroke();
  ctx.restore();
}

function quantitativeWindowMismatchBaseCounts(item) {
  const counts = item?.mismatchBaseCounts;
  if (!counts || typeof counts !== "object") return [];
  return ["A", "C", "G", "T"]
    .map((base) => [base, Number(counts[base] || 0)])
    .filter(([, count]) => count > 0);
}

function drawQuantitativeMismatchOverlay(ctx, item, x1, y1, y2, widthPx, theme) {
  const counts = quantitativeWindowMismatchBaseCounts(item);
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0 || widthPx < 2) return;
  const height = Math.max(1, y2 - y1);
  const stripeHeight = Math.min(height, 7);
  let x = x1;
  ctx.save();
  ctx.globalAlpha = 0.95;
  for (const [base, count] of counts) {
    const segmentWidth = Math.max(1, widthPx * (count / total));
    ctx.fillStyle = getViewerBaseColor(theme, base);
    ctx.fillRect(x, y1, Math.min(segmentWidth, x1 + widthPx - x), stripeHeight);
    x += segmentWidth;
  }
  ctx.restore();
}

function visibleIntervalItems(track, state, viewStart, viewEnd) {
  return getViewerTrackItems(track, state).filter((item) => {
    const start = Number(item.start);
    const end = Number(item.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (start <= end) {
      return end >= viewStart && start <= viewEnd;
    }
    return start <= viewEnd || end >= viewStart;
  });
}

function viewerTargetMatches(state, target) {
  return state.selectedTarget?.key && state.selectedTarget.key === makeTargetKey(target);
}

function searchTargetMatches(state, target) {
  return state.activeSearchTarget?.key && state.activeSearchTarget.key === makeTargetKey(target);
}

function drawLinearSelectedBaseMarker(ctx, { x, y, pxPerBp, theme }) {
  const width = Math.max(16, Math.min(30, pxPerBp + 8));
  const height = 24;
  const left = x - width / 2;
  const top = y - height / 2;
  ctx.save();
  ctx.fillStyle = theme.selectedFill;
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = theme.selectedStroke;
  ctx.shadowBlur = theme.dark ? 7 : 4;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, 5);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
  }
  ctx.restore();
}

function drawLinearSelectedCodonMarker(ctx, { x1, x2, y, theme }) {
  const left = x1 + 1;
  const width = Math.max(1, x2 - x1 - 2);
  const height = 24;
  const top = y - height / 2;
  ctx.save();
  ctx.fillStyle = theme.selectedFill;
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 2;
  ctx.shadowColor = theme.selectedStroke;
  ctx.shadowBlur = theme.dark ? 6 : 3;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, 4);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
  }
  ctx.restore();
}

function isQuantitativeTrack(track) {
  return track?.type === "quantitative";
}

function addLinearCoordinateHit(state, x, y, position) {
  addRectHit(state, { x1: x - 8, y1: y - 15, x2: x + 8, y2: y + 9 }, {
    kind: "coordinate",
    type: "Coordinate",
    position: Math.max(1, Math.round(position))
  });
}

function drawDensityBins(ctx, items, options) {
  const { plotLeft, plotRight, viewStart, viewEnd, y, color } = options;
  const binCount = Math.max(24, Math.floor((plotRight - plotLeft) / 16));
  const bins = Array.from({ length: binCount }, () => 0);
  for (const item of items) {
    const position = Number(item.position ?? item.start);
    if (!Number.isFinite(position) || position < viewStart || position > viewEnd) continue;
    const index = Math.max(0, Math.min(binCount - 1, Math.floor(((position - viewStart) / (viewEnd - viewStart)) * binCount)));
    bins[index] += 1;
  }
  const max = Math.max(1, ...bins);
  const binWidth = (plotRight - plotLeft) / binCount;
  bins.forEach((count, index) => {
    if (!count) return;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16 + 0.55 * Math.sqrt(count / max);
    ctx.fillRect(plotLeft + index * binWidth, y - 10, Math.max(1, binWidth - 1), 20);
  });
  ctx.globalAlpha = 1;
}

export function shouldUseLinearTrackSummary(track, state, pxPerBp, visibleItemCount) {
  if (isQuantitativeTrack(track)) return false;
  if (hasHiddenViewerItemTypes(track, state)) return false;
  if (!track.summary?.bins?.length) return false;
  const mode = getViewerTrackDisplayMode(track, state);
  if (mode === "collapsed") return true;
  if (mode === "full" || mode === "squished") return false;
  const itemCount = track.summary?.itemCount ?? track.items?.length ?? 0;
  const visibleCount = Number.isFinite(Number(visibleItemCount)) ? Number(visibleItemCount) : itemCount;
  return visibleCount > DENSITY_ITEM_THRESHOLD ||
    (itemCount > DENSITY_ITEM_THRESHOLD && pxPerBp < DENSITY_PX_PER_UNIT_THRESHOLD);
}

function drawTrackSummaryBins(ctx, track, options) {
  const summary = track.summary;
  if (!summary?.bins?.length) return false;
  const { plotLeft, plotRight, viewStart, viewEnd, y, color } = options;
  const maxValue = Math.max(1, summary.mode === "intervals" ? summary.maxBases || summary.maxCount : summary.maxCount);
  let drew = false;
  for (const bin of summary.bins) {
    if (bin.end < viewStart || bin.start > viewEnd) continue;
    const value = summary.mode === "intervals" ? (bin.bases || bin.count) : bin.count;
    if (!value) continue;
    const x1 = Math.max(plotLeft, bpToX(Math.max(bin.start, viewStart), plotLeft, plotRight, viewStart, viewEnd));
    const x2 = Math.min(plotRight, bpToX(Math.min(bin.end, viewEnd), plotLeft, plotRight, viewStart, viewEnd));
    const width = Math.max(1, x2 - x1);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16 + 0.56 * Math.sqrt(value / maxValue);
    ctx.fillRect(x1, y - 10, width, 20);
    drew = true;
  }
  ctx.globalAlpha = 1;
  if (drew) {
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = options.theme?.muted || "#64748b";
    ctx.textAlign = "right";
    ctx.fillText("summary", plotRight, y - 18);
  }
  return drew;
}

function quantitativeDomain(track) {
  const values = (track.items ?? []).map((item) => Number(item.value)).filter(Number.isFinite);
  const explicitMin = Number(track.yMin);
  const explicitMax = Number(track.yMax);
  let min = Number.isFinite(explicitMin) ? explicitMin : Math.min(0, ...values);
  let max = Number.isFinite(explicitMax) ? explicitMax : Math.max(1, ...values);
  const baseline = Number.isFinite(Number(track.baseline)) ? Number(track.baseline) : min;
  min = Math.min(min, baseline);
  max = Math.max(max, baseline);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max, baseline };
}

function drawLinearQuantitativeTrack(ctx, track, state, layout, rowLayout, theme) {
  const { plotLeft, plotRight } = layout;
  const top = rowLayout.topY + 8;
  const bottom = rowLayout.topY + rowLayout.height - 12;
  const height = Math.max(1, bottom - top);
  const { min, max, baseline } = quantitativeDomain(track);
  const toY = (value) => bottom - ((value - min) / (max - min)) * height;
  const baselineY = toY(baseline);
  const positiveColor = track.positiveColor || track.color || getViewerTrackColor(theme, track);
  const negativeColor = track.negativeColor || (theme.dark ? "#f59e0b" : "#b45309");

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotLeft, top);
  ctx.lineTo(plotLeft, bottom);
  ctx.lineTo(plotRight, bottom);
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = theme.tick;
  ctx.beginPath();
  ctx.moveTo(plotLeft, baselineY);
  ctx.lineTo(plotRight, baselineY);
  ctx.stroke();
  ctx.setLineDash([]);

  const visible = visibleIntervalItems(track, state, state.viewStart + 1, state.viewEnd);
  for (const item of visible) {
    const value = Number(item.value);
    if (!Number.isFinite(value)) continue;
    const start = Number(item.start);
    const end = Number(item.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const x1 = Math.max(plotLeft, bpToX(start - 1, plotLeft, plotRight, state.viewStart, state.viewEnd));
    const x2 = Math.min(plotRight, bpToX(end, plotLeft, plotRight, state.viewStart, state.viewEnd));
    const widthPx = Math.max(1, x2 - x1);
    const valueY = toY(value);
    const y1 = Math.min(valueY, baselineY);
    const y2 = Math.max(valueY, baselineY);
    const target = {
      kind: "quantitative-window",
      type: track.label || "Composition window",
      trackId: track.id || track.type,
      itemIndex: getViewerTrackItems(track, state).indexOf(item),
      start,
      end,
      value,
      mismatches: item.mismatchCount,
      label: item.label || `${track.label}: ${value}${track.unit || ""}`
    };
    addRectHit(state, { x1, y1: top, x2, y2: bottom }, target);
    ctx.fillStyle = value >= baseline ? positiveColor : negativeColor;
    ctx.globalAlpha = viewerTargetMatches(state, target) ? 0.9 : 0.58;
    ctx.fillRect(x1, y1, widthPx, Math.max(1, y2 - y1));
    ctx.globalAlpha = 1;
    drawQuantitativeMismatchOverlay(ctx, item, x1, y1, y2, widthPx, theme);
  }

  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = theme.muted;
  ctx.textAlign = "left";
  ctx.fillText(`${max}${track.unit || ""}`, plotRight + 4, top + 4);
  ctx.fillText(`${min}${track.unit || ""}`, plotRight + 4, bottom);
  ctx.fillText(`window ${Number(track.windowSize || 0).toLocaleString()} bp`, plotLeft, rowLayout.topY + rowLayout.height - 2);
}

function drawLinearSearchMarkers(ctx, state, layout, theme) {
  const results = state.searchResults || [];
  if (results.length === 0) return;
  const { plotLeft, plotRight, markerTop, markerBottom } = layout;
  for (const result of results) {
    const start = Number(result.start ?? result.position);
    const end = Number(result.end ?? result.position);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end < state.viewStart + 1 || start > state.viewEnd) continue;
    const x1 = Math.max(plotLeft, bpToX(start - 1, plotLeft, plotRight, state.viewStart, state.viewEnd));
    const x2 = Math.min(plotRight, bpToX(end, plotLeft, plotRight, state.viewStart, state.viewEnd));
    const width = Math.max(3, x2 - x1);
    const active = state.activeSearchTarget?.key === result.key;
    ctx.fillStyle = active ? theme.searchActiveFill : theme.searchFill;
    ctx.strokeStyle = active ? theme.searchActiveStroke : theme.searchStroke;
    ctx.lineWidth = active ? 2 : 1;
    ctx.fillRect(x1, markerTop, width, markerBottom - markerTop);
    ctx.strokeRect(x1, markerTop, width, markerBottom - markerTop);
  }
}

function visibleTrackItemCount(track, state, viewStart, viewEnd) {
  if (isQuantitativeTrack(track)) return 0;
  if (track.type === "restriction-sites") {
    return visiblePointItems(track, state, viewStart, viewEnd).length;
  }
  return visibleIntervalItems(track, state, viewStart, viewEnd).length;
}

function makeCollapsedLinearIntervalLayout(track, state, recordLength) {
  return {
    placements: makeLinearIntervalCopies(getViewerTrackItems(track, state), {
      length: recordLength,
      viewStart: state.viewStart,
      viewEnd: state.viewEnd
    }).map((placement) => ({ ...placement, slot: 0 })),
    hidden: [],
    totalHidden: 0,
    slotCount: 1,
    maxSlots: 1
  };
}

function buildLinearTrackLayouts(record, state, pxPerBp) {
  return getVisibleViewerTracks(record, state).map((track) => {
    const displayMode = getViewerTrackDisplayMode(track, state);
    const itemCount = track.summary?.itemCount ?? track.items?.length ?? 0;
    const canDecideFromSummary =
      track.summary?.bins?.length &&
      displayMode === "auto" &&
      itemCount > DENSITY_ITEM_THRESHOLD &&
      pxPerBp < DENSITY_PX_PER_UNIT_THRESHOLD;
    const visibleCount = canDecideFromSummary
      ? itemCount
      : visibleTrackItemCount(track, state, state.viewStart, state.viewEnd);
    if (isQuantitativeTrack(track)) {
      return {
        track,
        displayMode,
        quantitative: true,
        stacked: false,
        height: 70
      };
    }
    if (shouldUseLinearTrackSummary(track, state, pxPerBp, visibleCount)) {
      return {
        track,
        displayMode,
        stacked: false,
        summary: true,
        height: 42
      };
    }
    if (!isStackedIntervalTrack(track)) {
      return {
        track,
        displayMode,
        stacked: false,
        height: displayMode === "squished" || displayMode === "collapsed"
          ? (track.type === "restriction-sites" ? 24 : 30)
          : track.type === "restriction-sites" && !canShowRestrictionSiteLabels(pxPerBp, displayMode)
            ? 28
            : 42
      };
    }
    if (displayMode === "collapsed") {
      const layout = makeCollapsedLinearIntervalLayout(track, state, record.length);
      return {
        track,
        displayMode,
        stacked: true,
        layout,
        slotHeight: SQUISHED_FEATURE_SLOT_HEIGHT,
        height: 18 + layout.slotCount * SQUISHED_FEATURE_SLOT_HEIGHT
      };
    }
    const fullLayout = getCachedLinearSlotLayout(record, state, track);
    const layout = clipStackedIntervalLayout(fullLayout, {
      viewStart: state.viewStart,
      viewEnd: state.viewEnd
    });
    const slotHeight = displayMode === "squished" ? SQUISHED_FEATURE_SLOT_HEIGHT : FEATURE_SLOT_HEIGHT;
    const height = 18 + layout.slotCount * slotHeight + (layout.hidden.length > 0 ? 16 : 0);
    return {
      track,
      displayMode,
      stacked: true,
      layout,
      slotHeight,
      height
    };
  });
}

function getCachedLinearSlotLayout(record, state, track) {
  if (!state.trackLayoutCache) {
    state.trackLayoutCache = new WeakMap();
  }
  const cached = state.trackLayoutCache.get(track);
  const trackItems = getViewerTrackItems(track, state);
  const itemCount = trackItems.length;
  const slotConfigKey = JSON.stringify({
    fixedSlotsByType: track.fixedSlotsByType || track.slotByType || null,
    allowFixedSlotOverlaps: track.allowFixedSlotOverlaps === true,
    hiddenItemTypes: Array.from(state.hiddenTrackItemTypes?.get(track.id || track.type || "track") || []).sort()
  });
  if (
    cached &&
    cached.length === record.length &&
    cached.maxSlots === FEATURE_SLOT_MAX &&
    cached.itemCount === itemCount &&
    cached.slotConfigKey === slotConfigKey
  ) {
    return cached.layout;
  }
  const layout = createStackedIntervalLayout(trackItems, {
    length: record.length,
    maxSlots: FEATURE_SLOT_MAX,
    fixedSlotsByType: track.fixedSlotsByType || track.slotByType,
    allowFixedSlotOverlaps: track.allowFixedSlotOverlaps === true
  });
  state.trackLayoutCache.set(track, {
    length: record.length,
    maxSlots: FEATURE_SLOT_MAX,
    itemCount,
    slotConfigKey,
    layout
  });
  return layout;
}

function computeLinearRows(record, state, pxPerBp) {
  let trackY = 88;
  const trackYs = [];
  for (const trackLayout of buildLinearTrackLayouts(record, state, pxPerBp)) {
    trackYs.push({
      ...trackLayout,
      y: trackY + trackLayout.height / 2,
      topY: trackY
    });
    trackY += trackLayout.height;
  }
  if (record.hideSequenceInterpretationControls === true) {
    const bottomRulerY = Math.max(trackY + 32, 154);
    return {
      trackYs,
      plus1Y: null,
      plus2Y: null,
      plus3Y: null,
      dnaTopY: null,
      dnaBottomY: null,
      minus1Y: null,
      minus2Y: null,
      minus3Y: null,
      bottomRulerY,
      markerTop: 28,
      markerBottom: bottomRulerY + 14
    };
  }
  if (isProteinRecord(record)) {
    const sequenceY = Math.max(trackY + 42, 154);
    const bottomRulerY = sequenceY + 48;
    return {
      trackYs,
      plus1Y: null,
      plus2Y: null,
      plus3Y: null,
      dnaTopY: sequenceY,
      dnaBottomY: null,
      minus1Y: null,
      minus2Y: null,
      minus3Y: null,
      bottomRulerY,
      markerTop: 28,
      markerBottom: bottomRulerY + 14
    };
  }
  const translationRowGap = 32;
  const plus1Y = Math.max(trackY + 18, 154);
  const plus2Y = plus1Y + translationRowGap;
  const plus3Y = plus2Y + translationRowGap;
  const dnaTopY = (state.showForwardTranslations ? plus3Y : plus1Y - translationRowGap) + 42;
  const dnaBottomY = state.showSecondStrand ? dnaTopY + 30 : null;
  const minus1Y = state.showSecondStrand ? dnaBottomY + 46 : dnaTopY + 48;
  const minus2Y = minus1Y + translationRowGap;
  const minus3Y = minus2Y + translationRowGap;
  const finalContentY = state.showReverseTranslations
    ? minus3Y
    : state.showSecondStrand
      ? dnaBottomY
      : dnaTopY;
  const bottomRulerY = finalContentY + 48;
  return {
    trackYs,
    plus1Y,
    plus2Y,
    plus3Y,
    dnaTopY,
    dnaBottomY,
    minus1Y,
    minus2Y,
    minus3Y,
    bottomRulerY,
    markerTop: 28,
    markerBottom: bottomRulerY + 14
  };
}

function drawLinearRuler(ctx, state, layout, options = {}) {
  const { plotLeft, plotRight } = layout;
  const theme = options.theme;
  const y = options.y;
  const labelsAbove = options.labelsAbove ?? true;
  ctx.strokeStyle = theme?.axis || "#1f2937";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotLeft, y);
  ctx.lineTo(plotRight, y);
  ctx.stroke();

  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = theme?.text || "#334155";
  ctx.strokeStyle = theme?.tick || "#94a3b8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const tick of getLinearRulerTicks(state)) {
    const x = bpToX(tick.centerBp, plotLeft, plotRight, state.viewStart, state.viewEnd);
    addLinearCoordinateHit(state, x, y, tick.label);
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y + 7);
    ctx.stroke();
    ctx.fillText(tick.label.toLocaleString(), x, y + (labelsAbove ? -22 : 22));
  }
}

function drawTranslationRow(ctx, record, state, y, frameLabel, frameOffset, strand, layout, theme) {
  const { plotLeft, plotRight, pxPerBp } = layout;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = theme.muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(frameLabel, plotLeft - 12, y);
  const codonPx = pxPerBp * 3;
  if (!canRevealSequenceDetail(record, state) || codonPx < 18) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    return;
  }
  const sequence = record.sequence;
  const codonMap = makeCodonMap(getViewerGeneticCode(record, state));
  const startCodons = getStartCodons(getViewerGeneticCode(record, state));
  const firstCodonStart = Math.max(frameOffset, frameOffset + Math.floor((state.viewStart - frameOffset) / 3) * 3);
  const start = firstCodonStart < state.viewStart ? firstCodonStart + 3 : firstCodonStart;
  for (let index = start; index + 2 < record.length && index <= state.viewEnd; index += 3) {
    if (index + 2 < state.viewStart) continue;
    const genomicCodon = sequence.slice(index, index + 3);
    const codon = strand === "+" ? genomicCodon : reverseComplement(genomicCodon);
    const normalizedCodon = codon.toUpperCase().replaceAll("U", "T");
    const aa = translateCodon(normalizedCodon, codonMap);
    const isStart = startCodons.has(normalizedCodon);
    const x1 = bpToX(index, plotLeft, plotRight, state.viewStart, state.viewEnd);
    const x2 = bpToX(index + 3, plotLeft, plotRight, state.viewStart, state.viewEnd);
    const target = {
      kind: "codon",
      type: "Codon",
      start: index + 1,
      end: index + 3,
      strand,
      frame: frameLabel,
      codon,
      aminoAcid: aa
    };
    addRectHit(state, { x1, y1: y - 13, x2, y2: y + 13 }, target);
    const selected = viewerTargetMatches(state, target);
    const searchActive = searchTargetMatches(state, target);
    ctx.strokeStyle = aa === "*" ? theme.stopStroke : isStart ? theme.startStroke : theme.aminoAcidStroke;
    ctx.fillStyle = aa === "*" ? theme.stopFill : isStart ? theme.startFill : theme.aminoAcidFill;
    ctx.lineWidth = searchActive ? 2 : 1;
    ctx.beginPath();
    ctx.rect(x1 + 1, y - 11, Math.max(1, x2 - x1 - 2), 22);
    ctx.fill();
    ctx.stroke();
    if (selected) {
      drawLinearSelectedCodonMarker(ctx, { x1, x2, y, theme });
    }
    ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = aa === "*" ? theme.stopText : isStart ? theme.startText : theme.aminoAcidText;
    ctx.textAlign = "center";
    ctx.fillText(aa, (x1 + x2) / 2, y);
  }
}

function drawViewer(ctx, canvas, status, record, state) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const theme = getViewerCanvasTheme(canvas);
  const { plotLeft, plotRight } = getLinearPlotBounds(width);
  const span = state.viewEnd - state.viewStart;
  const pxPerBp = (plotRight - plotLeft) / span;
  const proteinViewer = isProteinRecord(record);
  const showSecondStrand = !proteinViewer && state.showSecondStrand;
  const showForwardTranslations = !proteinViewer && state.showForwardTranslations;
  const showReverseTranslations = !proteinViewer && state.showReverseTranslations;
  const rows = computeLinearRows(record, state, pxPerBp);
  const layout = { plotLeft, plotRight, pxPerBp, markerTop: rows.markerTop, markerBottom: rows.markerBottom };
  state.hitRegions = [];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  drawLinearSearchMarkers(ctx, state, layout, theme);

  const rulerY = 46;
  drawLinearRuler(ctx, state, layout, { y: rulerY, labelsAbove: true, theme });

  for (const { track, y: trackY, topY, height, quantitative, stacked, summary, displayMode, slotHeight, layout: trackSlotLayout } of rows.trackYs) {
    const color = getViewerTrackColor(theme, track);
    const compactTrack = displayMode === "squished" || displayMode === "collapsed";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "right";
    const trackLabel = track.axisLabel || track.label || (stacked && track.type === "features" ? "Features" : track.type);
    drawLinearTrackLabel(ctx, trackLabel, plotLeft, trackY);

    if (quantitative) {
      drawLinearQuantitativeTrack(ctx, track, state, layout, { topY, height }, theme);
      continue;
    }

    if (summary) {
      drawTrackSummaryBins(ctx, track, { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color, theme }) ||
        drawDensityBins(ctx, getViewerTrackItems(track, state), { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color });
      continue;
    }

    if (track.type === "restriction-sites") {
      const allSites = getViewerTrackItems(track, state);
      const visible = allSites
        .map((site, itemIndex) => ({ site, itemIndex, cutPosition: restrictionSiteCutPosition(site) }))
        .filter((entry) => entry.cutPosition !== null && entry.cutPosition >= state.viewStart && entry.cutPosition <= state.viewEnd);
      if (shouldUseLinearTrackSummary(track, state, pxPerBp, visible.length)) {
        drawTrackSummaryBins(ctx, track, { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color, theme }) ||
          drawDensityBins(ctx, visible.map((entry) => entry.site), { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color });
      } else {
        const showLabels = canShowRestrictionSiteLabels(pxPerBp, displayMode);
        const placedLabels = [];
        for (const { site, itemIndex, cutPosition } of visible) {
          const x = bpToX(cutPosition, plotLeft, plotRight, state.viewStart, state.viewEnd);
          const target = {
            kind: "restriction-site",
            type: "Restriction site",
            trackId: track.id || track.type,
            itemIndex,
            position: cutPosition,
            cutPosition,
            cutAfter: site.cutAfter ?? site.cutPosition ?? cutPosition,
            start: cutPosition,
            end: cutPosition,
            siteStart: site.siteStart,
            siteEnd: site.siteEnd,
            label: site.label,
            enzyme: site.enzyme,
            recognition: site.recognition,
            strand: site.strand
          };
          const markerWidth = Math.max(4, Math.min(10, pxPerBp * 0.75));
          const markerHeight = compactTrack ? 10 : 14;
          addRectHit(state, { x1: x - 8, y1: trackY - 10, x2: x + 8, y2: trackY + 10 }, target);
          ctx.fillStyle = viewerTargetMatches(state, target) ? theme.selectedFill : theme.restrictionFill;
          ctx.strokeStyle = color;
          ctx.lineWidth = viewerTargetMatches(state, target) ? 3 : 1.4;
          ctx.fillRect(x - markerWidth / 2, trackY - markerHeight / 2, markerWidth, markerHeight);
          ctx.strokeRect(x - markerWidth / 2, trackY - markerHeight / 2, markerWidth, markerHeight);
          if (showLabels) {
            const label = site.label || site.enzyme || "";
            ctx.font = "10px system-ui, sans-serif";
            const labelWidth = ctx.measureText(label).width;
            const labelBox = {
              left: x - labelWidth / 2,
              right: x + labelWidth / 2
            };
            if (
              label &&
              labelBox.left >= plotLeft &&
              labelBox.right <= plotRight &&
              !overlapsPlacedRestrictionLabel(labelBox, placedLabels)
            ) {
              placedLabels.push(labelBox);
              ctx.fillStyle = theme.label;
              ctx.textAlign = "center";
              ctx.fillText(label, x, trackY - 13);
            }
          }
          if (searchTargetMatches(state, target)) {
            ctx.fillStyle = theme.label;
            ctx.textAlign = "center";
            ctx.fillText("•", x, trackY + 15);
          }
        }
      }
      continue;
    }

    const visible = visibleIntervalItems(track, state, state.viewStart, state.viewEnd);
    if (shouldUseLinearTrackSummary(track, state, pxPerBp, visible.length)) {
      drawTrackSummaryBins(ctx, track, { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color, theme }) ||
        drawDensityBins(ctx, visible, { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color });
    } else if (stacked) {
      const placements = trackSlotLayout?.placements ?? [];
      const rowSlotHeight = slotHeight || FEATURE_SLOT_HEIGHT;
      const rectHeight = compactTrack ? 7 : 12;
      const hitHalfHeight = compactTrack ? 5 : 7;
      const slotBaseY = topY + (compactTrack ? 10 : 13);
      for (const placement of placements) {
        const item = placement.item;
        const itemIndex = placement.itemIndex;
        const x1 = Math.max(plotLeft, bpToX(placement.start, plotLeft, plotRight, state.viewStart, state.viewEnd));
        const x2 = Math.min(plotRight, bpToX(placement.end, plotLeft, plotRight, state.viewStart, state.viewEnd));
        const widthPx = Math.max(1, x2 - x1);
        const laneY = slotBaseY + placement.slot * rowSlotHeight;
        const itemStyle = getViewerFeatureTypeStyle(item, color);
        const target = {
          kind: "interval",
          type: track.label || track.type || "Feature",
          featureType: item.type || item.featureType,
          trackId: track.id || track.type,
          itemIndex,
          start: item.start,
          end: item.end,
          length: item.length,
          label: item.label,
          name: item.name,
          ...makeViewerItemTargetDetails(item),
          strand: item.strand,
          frame: item.frame,
          topology: item.topology,
          parts: item.parts,
          alphabet: proteinViewer ? "protein" : "dna-rna"
        };
        addRectHit(state, { x1, y1: laneY - hitHalfHeight, x2, y2: laneY + hitHalfHeight }, target);
        ctx.fillStyle = itemStyle.fill;
        ctx.strokeStyle = itemStyle.stroke;
        ctx.lineWidth = viewerTargetMatches(state, target) ? 3 : 1;
        const previousAlpha = ctx.globalAlpha;
        if (placement.fixedSlot) ctx.globalAlpha = Number(track.featureOpacity) || 0.68;
        ctx.fillRect(x1, laneY - rectHeight / 2, widthPx, rectHeight);
        ctx.globalAlpha = previousAlpha;
        ctx.strokeRect(x1, laneY - rectHeight / 2, widthPx, rectHeight);
        const readBasesDrawn = !compactTrack && drawAlignedReadBases(ctx, item, state, layout, {
          x: x1,
          y: laneY,
          widthPx,
          height: rectHeight
        }, theme);
        const labelPlan = getFeatureLabelRenderPlan(ctx, item.label || item.name || item.type || "", widthPx, pxPerBp, {
          minSize: 8,
          maxSize: 10,
          padding: 8,
          minAvailableWidth: 24
        });
        if (!readBasesDrawn && !compactTrack && labelPlan.fits) {
          ctx.save();
          ctx.fillStyle = theme.label;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = labelPlan.font;
          ctx.fillText(labelPlan.label, x1 + widthPx / 2, laneY);
          ctx.restore();
        }
      }
      if ((trackSlotLayout?.hidden?.length ?? 0) > 0) {
        const messageY = slotBaseY + trackSlotLayout.slotCount * rowSlotHeight + 2;
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = theme.warning;
        ctx.textAlign = "right";
        ctx.fillText(`${trackSlotLayout.hidden.length.toLocaleString()} overlapping feature${trackSlotLayout.hidden.length === 1 ? "" : "s"} hidden; zoom in`, plotRight, messageY);
      }
    } else {
      for (const item of visible) {
        const itemIndex = visible.indexOf(item);
        const start = Number(item.start);
        const end = Number(item.end);
        const parts = start <= end ? [{ start, end }] : [{ start, end: record.length }, { start: 1, end }];
        for (const part of parts) {
          const x1 = Math.max(plotLeft, bpToX(part.start - 1, plotLeft, plotRight, state.viewStart, state.viewEnd));
          const x2 = Math.min(plotRight, bpToX(part.end, plotLeft, plotRight, state.viewStart, state.viewEnd));
          const widthPx = Math.max(1, x2 - x1);
          const target = {
            kind: "interval",
            type: track.label || track.type || "Feature",
            featureType: item.type || item.featureType,
            trackId: track.id || track.type,
            itemIndex,
            start: item.start,
            end: item.end,
            length: item.length,
            label: item.label,
            name: item.name,
            ...makeViewerItemTargetDetails(item),
            strand: item.strand,
            frame: item.frame,
            topology: item.topology,
            parts: item.parts,
            alphabet: proteinViewer ? "protein" : "dna-rna"
          };
          addRectHit(state, { x1, y1: trackY - 12, x2, y2: trackY + 12 }, target);
          const itemStyle = track.type === "digest-fragments" ? null : getViewerFeatureTypeStyle(item, color);
          ctx.fillStyle = track.type === "digest-fragments" ? theme.digestFill : itemStyle.fill;
          ctx.strokeStyle = track.type === "digest-fragments" ? color : itemStyle.stroke;
          ctx.lineWidth = viewerTargetMatches(state, target) ? 3 : 1;
          const rectHeight = compactTrack ? 10 : 20;
          ctx.fillRect(x1, trackY - rectHeight / 2, widthPx, rectHeight);
          ctx.strokeRect(x1, trackY - rectHeight / 2, widthPx, rectHeight);
          const readBasesDrawn = !compactTrack && drawAlignedReadBases(ctx, item, state, layout, {
            x: x1,
            y: trackY,
            widthPx,
            height: rectHeight
          }, theme);
          const labelPlan = getFeatureLabelRenderPlan(ctx, item.label || item.name || item.type || "", widthPx, pxPerBp, {
            minSize: 8,
            maxSize: 11,
            padding: 10,
            minAvailableWidth: 24
          });
          if (!readBasesDrawn && !compactTrack && labelPlan.fits) {
            ctx.save();
            ctx.fillStyle = theme.label;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = labelPlan.font;
            ctx.fillText(labelPlan.label, x1 + widthPx / 2, trackY);
            ctx.restore();
          }
        }
      }
    }
  }

  const {
    plus1Y,
    plus2Y,
    plus3Y,
    dnaTopY,
    dnaBottomY,
    minus1Y,
    minus2Y,
    minus3Y,
    bottomRulerY
  } = rows;

  if (!record.hideSequenceInterpretationControls && showForwardTranslations) {
    drawTranslationRow(ctx, record, state, plus1Y, "+1", 0, "+", layout, theme);
    drawTranslationRow(ctx, record, state, plus2Y, "+2", 1, "+", layout, theme);
    drawTranslationRow(ctx, record, state, plus3Y, "+3", 2, "+", layout, theme);
  }

  if (record.hideSequenceInterpretationControls) {
    // Placeholder-reference tracks such as VCF and SAM/BAM should keep coordinate rulers
    // and features, but not display fake N bases as if a reference sequence was supplied.
  } else if (canRevealSequenceDetail(record, state) && pxPerBp >= 10) {
    const first = Math.max(0, Math.floor(state.viewStart));
    const last = Math.min(record.length - 1, Math.ceil(state.viewEnd));
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let index = first; index <= last; index += 1) {
      const x = bpToX(index + 0.5, plotLeft, plotRight, state.viewStart, state.viewEnd);
      if (!shouldDrawLinearSequenceLetter(x, plotLeft, plotRight)) {
        continue;
      }
      const base = record.sequence[index];
      const target = {
        kind: "base",
        type: proteinViewer ? "Residue" : "Base",
        position: index + 1,
        start: index + 1,
        end: index + 1,
        strand: "+",
        base,
        alphabet: proteinViewer ? "protein" : "dna-rna"
      };
      addRectHit(state, { x1: x - pxPerBp / 2, y1: dnaTopY - 12, x2: x + pxPerBp / 2, y2: dnaTopY + 12 }, target);
      if (viewerTargetMatches(state, target)) {
        drawLinearSelectedBaseMarker(ctx, { x, y: dnaTopY, pxPerBp, theme });
      }
      ctx.fillStyle = proteinViewer ? getViewerResidueColor(theme, base) : getViewerBaseColor(theme, base);
      ctx.fillText(base, x, dnaTopY);
      if (showSecondStrand) {
        const complement = complementBase(base);
        const complementTarget = {
          kind: "base",
          type: "Complement base",
          position: index + 1,
          start: index + 1,
          end: index + 1,
          strand: "-",
          base: complement
        };
        addRectHit(state, { x1: x - pxPerBp / 2, y1: dnaBottomY - 12, x2: x + pxPerBp / 2, y2: dnaBottomY + 12 }, complementTarget);
        if (viewerTargetMatches(state, complementTarget)) {
          drawLinearSelectedBaseMarker(ctx, { x, y: dnaBottomY, pxPerBp, theme });
        }
        ctx.fillStyle = getViewerBaseColor(theme, complement);
        ctx.fillText(complement, x, dnaBottomY);
      }
    }
  } else {
    ctx.strokeStyle = theme.sequenceLine;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(plotLeft, dnaTopY);
    ctx.lineTo(plotRight, dnaTopY);
    ctx.stroke();
    if (showSecondStrand) {
      ctx.beginPath();
      ctx.moveTo(plotLeft, dnaBottomY);
      ctx.lineTo(plotRight, dnaBottomY);
      ctx.stroke();
    }
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const revealText = proteinViewer
      ? "zoom in to reveal amino acid letters"
      : showForwardTranslations || showReverseTranslations
        ? "zoom in to reveal DNA bases and amino acid letters"
        : "zoom in to reveal DNA bases";
    ctx.fillText(revealText, (plotLeft + plotRight) / 2, showSecondStrand ? dnaBottomY + 24 : dnaTopY + 24);
  }
  if (!record.hideSequenceInterpretationControls) {
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "right";
    ctx.fillText(proteinViewer ? "Protein" : "DNA +", plotLeft - 12, dnaTopY);
    if (showSecondStrand) {
      ctx.fillText("DNA -", plotLeft - 12, dnaBottomY);
    }
  }

  if (!record.hideSequenceInterpretationControls && showReverseTranslations) {
    drawTranslationRow(ctx, record, state, minus1Y, "-1", 0, "-", layout, theme);
    drawTranslationRow(ctx, record, state, minus2Y, "-2", 1, "-", layout, theme);
    drawTranslationRow(ctx, record, state, minus3Y, "-3", 2, "-", layout, theme);
  }

  drawLinearRuler(ctx, state, layout, { y: bottomRulerY, labelsAbove: false, theme });

  status.textContent = "";
  const rangeLine = document.createElement("span");
  const scaleLine = document.createElement("span");
  const unit = coordinateUnit(record);
  rangeLine.textContent = `${Math.floor(state.viewStart + 1).toLocaleString()}-${Math.ceil(state.viewEnd).toLocaleString()} ${unit}`;
  scaleLine.textContent = `${Math.round(span).toLocaleString()} ${unit} span · ${pxPerBp.toFixed(2)} px/${unit}`;
  status.append(rangeLine, scaleLine);
}

function createButton(icon, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = icon;
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

function makeCheckboxToggle(text, checked) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  label.append(input, text);
  return { label, input };
}

function makeGeneticCodeSelect(selectedCode = "1") {
  const control = document.createElement("div");
  control.className = "dna-viewer-code-select";
  const text = document.createElement("span");
  text.textContent = "Code";
  const select = document.createElement("select");
  select.title = "Genetic code for viewer translations";
  select.setAttribute("aria-label", "Viewer genetic code");
  for (const code of geneticCodes) {
    const option = document.createElement("option");
    option.value = code.id;
    option.textContent = `${code.id}. ${code.name}`;
    select.append(option);
  }
  select.value = String(selectedCode);
  control.append(text, select);
  return { control, select };
}

function getLinearSelectionRange(target, record) {
  const start = Number(target.start ?? target.position);
  const end = Number(target.end ?? target.position);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.max(1, Math.min(record.length, Math.floor(start))),
    end: Math.max(1, Math.min(record.length, Math.ceil(end)))
  };
}

function getLinearSequence(record, target) {
  if (target.kind === "restriction-site" && target.siteStart && target.siteEnd) {
    const start = Math.max(1, Math.min(record.length, Number(target.siteStart)));
    const end = Math.max(1, Math.min(record.length, Number(target.siteEnd)));
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return record.sequence.slice(Math.min(start, end) - 1, Math.max(start, end));
    }
  }
  if (Array.isArray(target.parts) && target.parts.length > 0) {
    const sequence = target.parts.map((part) => {
      const start = Math.max(1, Math.min(record.length, Number(part.start)));
      const end = Math.max(1, Math.min(record.length, Number(part.end)));
      if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
      if (start <= end) return record.sequence.slice(start - 1, end);
      return record.sequence.slice(start - 1) + record.sequence.slice(0, end);
    }).join("");
    return target.strand === "-" ? reverseComplement(sequence) : sequence;
  }
  const range = getLinearSelectionRange(target, record);
  if (!range) return "";
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const sequence = record.sequence.slice(start - 1, end);
  return target.strand === "-" ? reverseComplement(sequence) : sequence;
}

function copyViewerText(text) {
  if (!text) return;
  navigator.clipboard?.writeText(String(text));
}

function makeRangeAnchor(target) {
  const position = Number(target.position ?? target.start);
  if (!Number.isFinite(position) || position < 1) return null;
  return {
    position: Math.round(position),
    label: target.label || target.enzyme || target.base || target.codon || target.kind
  };
}

function getRangeState(state, record) {
  const anchors = state.rangeAnchors || [];
  if (anchors.length < 2) return { anchors, ready: false };
  const start = Math.max(1, Math.min(record.length, anchors[0].position));
  const end = Math.max(1, Math.min(record.length, anchors[1].position));
  const rangeStart = Math.min(start, end);
  const rangeEnd = Math.max(start, end);
  return {
    anchors,
    ready: true,
    start: rangeStart,
    end: rangeEnd,
    length: rangeEnd - rangeStart + 1,
    wraps: false,
    canSwap: false,
    label: `${rangeStart.toLocaleString()}-${rangeEnd.toLocaleString()}`
  };
}

function getRangeForwardDna(record, range) {
  if (!range?.ready) return "";
  return record.sequence.slice(range.start - 1, range.end);
}

function translateRange(sequence, frame, geneticCode) {
  const strand = frame.startsWith("-") ? "-" : "+";
  const offset = Number(frame.slice(1)) - 1;
  const source = strand === "-" ? reverseComplement(sequence) : sequence;
  const codonMap = makeCodonMap(geneticCode);
  const parts = [];
  for (let index = offset; index + 2 < source.length; index += 3) {
    parts.push(translateCodon(source.slice(index, index + 3), codonMap));
  }
  return parts.join("");
}

function addSearchResult(results, result, limit = 1000) {
  if (results.length >= limit) {
    results.omitted = true;
    results.limit = limit;
    return false;
  }
  const target = { kind: "search-result", type: "Search result", ...result };
  target.key = makeTargetKey(target);
  results.push(target);
  return true;
}

function sortSearchResults(results) {
  return results.sort((left, right) => {
    const leftStart = Number(left.start ?? left.position ?? 0);
    const rightStart = Number(right.start ?? right.position ?? 0);
    if (leftStart !== rightStart) return leftStart - rightStart;
    const leftEnd = Number(left.end ?? left.position ?? leftStart);
    const rightEnd = Number(right.end ?? right.position ?? rightStart);
    if (leftEnd !== rightEnd) return leftEnd - rightEnd;
    return String(left.strand || "").localeCompare(String(right.strand || "")) ||
      String(left.frame || "").localeCompare(String(right.frame || "")) ||
      String(left.label || "").localeCompare(String(right.label || ""));
  });
}

function findAllLiteral(haystack, needle, callback) {
  if (!needle) return;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    if (callback(index) === false) return;
    if (index + 1 >= haystack.length) return;
    index = haystack.indexOf(needle, index + 1);
  }
}

function searchDna(record, query) {
  const normalized = String(query || "").toUpperCase().replace(/[^A-Z]/g, "");
  const results = [];
  if (!normalized) return results;
  const sequence = record.sequence.toUpperCase();
  findAllLiteral(sequence, normalized, (index) => addSearchResult(results, {
    start: index + 1,
    end: index + normalized.length,
    strand: "+",
    label: `DNA + ${index + 1}-${index + normalized.length}`
  }));
  const reverse = reverseComplement(normalized);
  findAllLiteral(sequence, reverse, (index) => addSearchResult(results, {
    start: index + 1,
    end: index + normalized.length,
    strand: "-",
    label: `DNA - ${index + 1}-${index + normalized.length}`
  }));
  return sortSearchResults(results);
}

function searchTranslations(record, query, state) {
  const needle = String(query || "").toUpperCase().replace(/[^A-Z*]/g, "");
  const results = [];
  if (!needle) return results;
  const codonMap = makeCodonMap(getViewerGeneticCode(record, state));
  for (const strand of ["+", "-"]) {
    for (let frame = 0; frame < 3; frame += 1) {
      const aminoAcids = [];
      const starts = [];
      for (let index = frame; index + 2 < record.length; index += 3) {
        const genomicCodon = record.sequence.slice(index, index + 3);
        const codon = strand === "+" ? genomicCodon : reverseComplement(genomicCodon);
        aminoAcids.push(translateCodon(codon, codonMap));
        starts.push(index + 1);
      }
      const translated = aminoAcids.join("");
      findAllLiteral(translated, needle, (aaIndex) => addSearchResult(results, {
        start: starts[aaIndex],
        end: starts[aaIndex + needle.length - 1] + 2,
        strand,
        frame: `${strand}${frame + 1}`,
        aminoAcid: needle,
        label: `${strand}${frame + 1} translation ${starts[aaIndex]}-${starts[aaIndex + needle.length - 1] + 2}`
      }));
    }
  }
  return sortSearchResults(results);
}

function searchProteinSequence(record, query) {
  const normalized = String(query || "").toUpperCase().replace(/[^A-Z*]/g, "");
  const results = [];
  if (!normalized) return results;
  const sequence = record.sequence.toUpperCase();
  findAllLiteral(sequence, normalized, (index) => addSearchResult(results, {
    start: index + 1,
    end: index + normalized.length,
    label: `Protein ${index + 1}-${index + normalized.length}`
  }));
  return sortSearchResults(results);
}

function searchFeatures(record, query, state) {
  const needle = String(query || "").trim().toLowerCase();
  const results = [];
  if (!needle) return results;
  for (const track of getVisibleViewerTracks(record, state)) {
    for (const item of getViewerTrackItems(track, state)) {
      const text = [
        track.label,
        track.type,
        item.label,
        item.name,
        item.motifId,
        item.enzyme,
        item.recognition,
        item.source,
        item.matchedText,
        item.primerSequence,
        item.variantId,
        item.referenceId,
        item.referenceName,
        item.referenceAccession,
        item.referenceCoordinates,
        item.percentIdentity,
        item.vectorConfidence,
        item.refAllele,
        item.altAllele,
        item.genomicCoordinates,
        item.sampleGenotypes,
        item.readName,
        item.mateName,
        item.mateReference,
        item.matePosition,
        item.mateKey,
        item.mateNumber,
        item.pairStatus,
        item.cigar,
        item.mapq,
        item.flag,
        item.sample,
        item.status,
        item.type,
        item.strand
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!text.includes(needle)) continue;
      const start = Number(item.start ?? item.position);
      const end = Number(item.end ?? item.position ?? item.start);
      const position = Number(item.position ?? item.start);
      if (!Number.isFinite(start) && !Number.isFinite(end) && !Number.isFinite(position)) continue;
      const added = addSearchResult(results, {
        start: Number.isFinite(start) ? start : position,
        end: Number.isFinite(end) ? end : position,
        position: Number.isFinite(position) ? position : start,
        trackId: track.id || track.type,
        label: item.label || item.name || item.enzyme || track.label || "Feature",
        name: item.name,
        type: track.label || track.type || "Feature",
        featureType: item.type || item.featureType,
        ...makeViewerItemTargetDetails(item),
        enzyme: item.enzyme,
        recognition: item.recognition,
        strand: item.strand,
        length: item.length
      });
      if (!added) return sortSearchResults(results);
    }
  }
  return sortSearchResults(results);
}

function makeLinearViewerSnapshot(record, state, searchControls) {
  return {
    title: record.title || "",
    length: record.length,
    viewStart: state.viewStart,
    viewEnd: state.viewEnd,
    geneticCode: state.geneticCode,
    showSecondStrand: state.showSecondStrand,
    showForwardTranslations: state.showForwardTranslations,
    showReverseTranslations: state.showReverseTranslations,
    composition: snapshotViewerCompositionState(state),
    trackDisplayModes: Array.from(state.trackDisplayModes || []),
    rangeAnchors: Array.isArray(state.rangeAnchors) ? state.rangeAnchors.map((anchor) => ({ ...anchor })) : [],
    searchScope: searchControls?.scope?.value || "",
    searchQuery: searchControls?.input?.value || ""
  };
}

function reusableLinearViewerSnapshot(snapshot, record) {
  if (!snapshot || (snapshot.title || "") !== (record.title || "")) {
    return null;
  }
  const viewStart = Number(snapshot.viewStart);
  const viewEnd = Number(snapshot.viewEnd);
  if (!Number.isFinite(viewStart) || !Number.isFinite(viewEnd) || viewEnd <= viewStart) {
    return null;
  }
  return snapshot;
}

function viewerInitialStateForRecord(viewerOptions, previousSnapshots, index) {
  if (previousSnapshots[index]) {
    return previousSnapshots[index];
  }
  const provided = viewerOptions.initialState;
  if (Array.isArray(provided)) {
    return provided[index] || null;
  }
  return index === 0 ? provided : null;
}

function cloneViewerStateForExport(state) {
  return {
    ...state,
    rangeAnchors: Array.isArray(state.rangeAnchors) ? state.rangeAnchors.map((anchor) => ({ ...anchor })) : [],
    searchResults: Array.isArray(state.searchResults) ? state.searchResults.map((result) => ({ ...result })) : [],
    selectedTarget: state.selectedTarget ? { ...state.selectedTarget } : null,
    activeSearchTarget: state.activeSearchTarget ? { ...state.activeSearchTarget } : null,
    hitRegions: [],
    hiddenTrackIds: new Set(state.hiddenTrackIds || []),
    hiddenTrackItemTypes: new Map(
      Array.from(state.hiddenTrackItemTypes || []).map(([key, value]) => [key, new Set(value)])
    ),
    trackDisplayModes: new Map(state.trackDisplayModes || []),
    trackLayoutCache: new WeakMap()
  };
}

function installViewer(panel, record, options = {}) {
  const preserved = reusableLinearViewerSnapshot(options.initialState, record);
  const proteinViewer = isProteinRecord(record);
  const hideSequenceInterpretationControls = record.hideSequenceInterpretationControls === true;
  const hideDnaInterpretationControls = proteinViewer || hideSequenceInterpretationControls;
  const toolbar = document.createElement("div");
  toolbar.className = "dna-viewer-toolbar";
  const leftControls = document.createElement("div");
  leftControls.className = "dna-viewer-left-controls";
  const buttons = document.createElement("div");
  buttons.className = "dna-viewer-buttons";
  const zoomIn = createButton(ICONS.zoomIn, "Zoom in at the center of the current view");
  const zoomOut = createButton(ICONS.zoomOut, "Zoom out from the center of the current view");
  const panLeft = createButton(ICONS.panLeft, "Pan left");
  const panRight = createButton(ICONS.panRight, "Pan right");
  const reset = createButton(ICONS.fitView, "Fit full sequence");
  const camera = createButton(ICONS.pngFile, "Download current view as PNG");
  const svgDownload = createButton(ICONS.svgFile, "Download current view as SVG");
  camera.classList.add("dna-viewer-export-button");
  camera.classList.add("dna-viewer-export-button-first");
  svgDownload.classList.add("dna-viewer-export-button");
  buttons.append(zoomIn, zoomOut, panLeft, panRight, reset, camera, svgDownload);
  const status = document.createElement("div");
  status.className = "dna-viewer-status";
  leftControls.append(buttons, status);
  const toggles = document.createElement("div");
  toggles.className = "dna-viewer-toggles";
  const menuControls = document.createElement("div");
  menuControls.className = "dna-viewer-menu-controls";
  const secondStrandToggle = makeCheckboxToggle("Second strand", true);
  const forwardTranslationToggle = makeCheckboxToggle("+ translation", true);
  const reverseTranslationToggle = makeCheckboxToggle("- translation", true);
  const geneticCodeControl = makeGeneticCodeSelect(record.geneticCode || "1");
  toggles.append(secondStrandToggle.label, forwardTranslationToggle.label, reverseTranslationToggle.label, geneticCodeControl.control);
  if (hideDnaInterpretationControls) {
    secondStrandToggle.label.hidden = true;
    forwardTranslationToggle.label.hidden = true;
    reverseTranslationToggle.label.hidden = true;
    geneticCodeControl.control.hidden = true;
  }
  toolbar.append(leftControls, toggles, menuControls);

  const canvas = document.createElement("canvas");
  canvas.className = "dna-viewer-canvas";
  const ctx = canvas.getContext("2d");
  const tooltip = createViewerTooltip(panel);
  const selectionEmptyText = proteinViewer
    ? "Click a feature, residue, or coordinate to inspect it."
    : "Click a feature, site, base, codon, amino acid, or coordinate to inspect it.";
  const showInspectorPanels = options.showInspectorPanels !== false;
  const selectionPanel = createSelectionPanel(selectionEmptyText);
  const rangePanel = createRangePanel();
  const state = {
    viewStart: preserved ? Number(preserved.viewStart) : 0,
    viewEnd: preserved ? Number(preserved.viewEnd) : Math.max(1, record.length),
    geneticCode: record.geneticCode || preserved?.geneticCode || "1",
    showSecondStrand: !hideDnaInterpretationControls && (preserved ? preserved.showSecondStrand !== false : record.showSecondStrandDefault !== false),
    showForwardTranslations: !hideDnaInterpretationControls && (preserved ? preserved.showForwardTranslations !== false : record.showForwardTranslationsDefault !== false),
    showReverseTranslations: !hideDnaInterpretationControls && (preserved ? preserved.showReverseTranslations !== false : record.showReverseTranslationsDefault !== false),
    dragging: false,
    dragStartX: 0,
    dragLastX: 0,
    dragStartViewStart: 0,
    dragStartViewEnd: Math.max(1, record.length),
    selectedTarget: null,
    rangeAnchors: Array.isArray(preserved?.rangeAnchors)
      ? preserved.rangeAnchors.filter((anchor) => Number(anchor?.position) >= 1 && Number(anchor?.position) <= record.length).slice(-2)
      : [],
    searchResults: [],
    activeSearchIndex: -1,
    activeSearchTarget: null,
    searchNavigationStarted: false,
    hitRegions: [],
    hiddenTrackIds: new Set(),
    hiddenTrackItemTypes: new Map(),
    trackDisplayModes: new Map(Array.isArray(preserved?.trackDisplayModes) ? preserved.trackDisplayModes : [])
  };
  clampView(state, record.length);
  initializeViewerCompositionTracks(record, state, preserved?.composition);
  const compositionControls = createViewerCompositionControls(record, state, () => {
    state.trackLayoutCache = new WeakMap();
    scheduleResize();
  });
  const trackControls = createViewerTrackControls(record, state, () => {
    state.trackLayoutCache = new WeakMap();
    scheduleResize();
  }, {
    displayModes: true
  });
  secondStrandToggle.input.checked = state.showSecondStrand;
  forwardTranslationToggle.input.checked = state.showForwardTranslations;
  reverseTranslationToggle.input.checked = state.showReverseTranslations;
  if (compositionControls) {
    menuControls.append(compositionControls);
  }
  if (trackControls) {
    menuControls.append(trackControls);
  }

  function resize() {
    let rect = canvas.getBoundingClientRect();
    const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
    const span = state.viewEnd - state.viewStart;
    const pxPerBp = (plotRight - plotLeft) / Math.max(1, span);
    const rows = computeLinearRows(record, state, pxPerBp);
    const minimumHeight = options.compactPreview === true ? 340 : 520;
    const desiredHeight = Math.max(minimumHeight, Math.min(920, rows.markerBottom + 70));
    if (Math.abs(rect.height - desiredHeight) > 2) {
      canvas.style.height = `${desiredHeight}px`;
      rect = canvas.getBoundingClientRect();
    }
    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawViewer(ctx, canvas, status, record, state);
  }
  let resizeFrame = 0;
  let stopInertia = () => {};
  const inertiaTracker = createInertiaVelocityTracker();
  function cancelInertia() {
    stopInertia();
    stopInertia = () => {};
  }
  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  }
  function zoomAt(clientX, factor) {
    cancelInertia();
    const rect = canvas.getBoundingClientRect();
    const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
    const x = Math.max(plotLeft, Math.min(plotRight, clientX - rect.left));
    const pointerFraction = (x - plotLeft) / Math.max(1, plotRight - plotLeft);
    const next = computeLinearZoomState(state, record.length, pointerFraction, factor);
    state.viewStart = next.viewStart;
    state.viewEnd = next.viewEnd;
    drawViewer(ctx, canvas, status, record, state);
  }
  function panByFraction(fraction) {
    cancelInertia();
    const span = state.viewEnd - state.viewStart;
    state.viewStart += span * fraction;
    state.viewEnd += span * fraction;
    clampView(state, record.length);
    drawViewer(ctx, canvas, status, record, state);
  }
  function updateSearchControls(searchControls) {
    updateViewerSearchControls(searchControls, state.searchResults, state.activeSearchIndex);
  }
  function runSearch(searchControls, scope, query) {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      state.searchResults = [];
      state.activeSearchIndex = -1;
      state.activeSearchTarget = null;
      state.searchNavigationStarted = false;
      updateSearchControls(searchControls);
      drawViewer(ctx, canvas, status, record, state);
      return;
    }
    state.searchResults = scope === "protein"
      ? proteinViewer ? searchProteinSequence(record, trimmed) : searchTranslations(record, trimmed, state)
      : scope === "features"
        ? searchFeatures(record, trimmed, state)
        : searchDna(record, trimmed);
    state.activeSearchIndex = -1;
    state.activeSearchTarget = null;
    state.searchNavigationStarted = false;
    updateSearchControls(searchControls);
    drawViewer(ctx, canvas, status, record, state);
  }
  function targetSpan(target) {
    const range = getLinearSelectionRange(target, record);
    if (!range) return Math.min(record.length, 160);
    const length = Math.abs(range.end - range.start) + 1;
    const rect = canvas.getBoundingClientRect();
    const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
    const detailSpan = Math.max(MIN_LINEAR_VIEW_SPAN, Math.floor((plotRight - plotLeft) / 11));
    if (length <= detailSpan) {
      return Math.max(MIN_LINEAR_VIEW_SPAN, Math.min(record.length, Math.max(48, Math.min(detailSpan, length * 2.8))));
    }
    return Math.max(MIN_LINEAR_VIEW_SPAN, Math.min(record.length, Math.max(detailSpan, length * 1.2)));
  }
  function zoomToTargetAnimated(target, options = {}) {
    cancelInertia();
    const range = getLinearSelectionRange(target, record);
    if (!range) return;
    const nextSpan = options.preserveZoom ? state.viewEnd - state.viewStart : targetSpan(target);
    const center = (Math.min(range.start, range.end) - 1 + Math.max(range.start, range.end)) / 2;
    let nextStart = center - nextSpan / 2;
    let nextEnd = center + nextSpan / 2;
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > record.length) {
      nextStart -= nextEnd - record.length;
      nextEnd = record.length;
    }
    nextStart = Math.max(0, nextStart);
    const fromStart = state.viewStart;
    const fromEnd = state.viewEnd;
    const started = performance.now();
    const duration = 190;
    function step(now) {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      state.viewStart = fromStart + (nextStart - fromStart) * eased;
      state.viewEnd = fromEnd + (nextEnd - fromEnd) * eased;
      clampView(state, record.length);
      drawViewer(ctx, canvas, status, record, state);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function makeSelectionPayload(target = state.selectedTarget, payloadOptions = {}) {
    const currentRange = getRangeState(state, record);
    return {
      target,
      range: target ? getLinearSelectionRange(target, record) : null,
      selectedSequence: target ? getLinearSequence(record, target) : "",
      currentRange,
      rangeSelectedSequence: currentRange?.ready ? getRangeForwardDna(record, currentRange) : "",
      preferredSelection: payloadOptions.preferredSelection || "target",
      recordTitle: record.title || "",
      recordLength: record.length,
      recordIndex: options.recordIndex ?? 0,
      viewer: "linear",
      actions: {
        addRangeAnchor: (selected = target) => selectionActions().addRangeAnchor(selected),
        clearRange: () => {
          state.rangeAnchors = [];
          renderCurrentRange();
        },
        copyRangeCoordinates: () => currentRange?.ready && copyViewerText(currentRange.label),
        copyRangeSequence: () => currentRange?.ready && copyViewerText(getRangeForwardDna(record, currentRange)),
        copyRangeReverseComplement: () => currentRange?.ready && !proteinViewer && copyViewerText(reverseComplement(getRangeForwardDna(record, currentRange))),
        copyRangeTranslation: (frame) => currentRange?.ready && !proteinViewer && copyViewerText(translateRange(getRangeForwardDna(record, currentRange), frame, getViewerGeneticCode(record, state))),
        zoomToRange: () => {
          cancelInertia();
          if (!currentRange?.ready) return;
          const padding = Math.max(MIN_LINEAR_VIEW_SPAN / 2, currentRange.length * 0.5);
          state.viewStart = currentRange.start - 1 - padding;
          state.viewEnd = currentRange.end + padding;
          clampView(state, record.length);
          drawViewer(ctx, canvas, status, record, state);
        },
        zoomToTarget: (selected = target) => selected && zoomToTargetAnimated(selected)
      }
    };
  }
  function targetForViewerItem(track, item, itemIndex) {
    const target = {
      kind: "interval",
      type: track.label || track.type || "Feature",
      featureType: item.type || item.featureType,
      trackId: track.id || track.type,
      itemIndex,
      start: item.start,
      end: item.end,
      length: item.length,
      label: item.label,
      name: item.name,
      ...makeViewerItemTargetDetails(item),
      strand: item.strand,
      frame: item.frame,
      topology: item.topology,
      parts: item.parts,
      alphabet: proteinViewer ? "protein" : "dna-rna"
    };
    return { ...target, key: makeTargetKey(target) };
  }
  function findMateTarget(selected) {
    if (!selected?.mateFeatureId) return null;
    for (const track of record.tracks || []) {
      const items = track.items || [];
      const itemIndex = items.findIndex((item) => item.featureId === selected.mateFeatureId);
      if (itemIndex !== -1) {
        const item = items[itemIndex];
        return targetForViewerItem(track, item, itemIndex);
      }
    }
    return null;
  }
  function navigateSearch(searchControls, delta) {
    if (!state.searchResults.length) return;
    const firstNavigation = !state.searchNavigationStarted || state.activeSearchIndex < 0;
    state.activeSearchIndex = firstNavigation
      ? (delta < 0 ? state.searchResults.length - 1 : 0)
      : (state.activeSearchIndex + delta + state.searchResults.length) % state.searchResults.length;
    state.searchNavigationStarted = true;
    state.activeSearchTarget = state.searchResults[state.activeSearchIndex];
    state.selectedTarget = state.activeSearchTarget;
    updateSearchControls(searchControls);
    renderSelectionPanel(selectionPanel, state.selectedTarget, selectionActions());
    notifySelectionChange();
    zoomToTargetAnimated(state.activeSearchTarget, { preserveZoom: !firstNavigation });
  }
  function selectionActions() {
    return {
      clearSelection: () => selectTarget(null),
      addRangeAnchor: (selected) => {
        const anchor = makeRangeAnchor(selected);
        if (!anchor) return;
        state.rangeAnchors = [...state.rangeAnchors, anchor].slice(-2);
        renderCurrentRange();
      },
      copyText: copyViewerText,
      copySequence: (selected) => copyViewerText(getLinearSequence(record, selected)),
      zoomToTarget: (selected) => zoomToTargetAnimated(selected),
      canZoomToMate: (selected) => Boolean(findMateTarget(selected)),
      zoomToMate: (selected) => {
        const mateTarget = findMateTarget(selected);
        if (!mateTarget) return;
        state.selectedTarget = mateTarget;
        renderSelectionPanel(selectionPanel, state.selectedTarget, selectionActions());
        notifySelectionChange();
        zoomToTargetAnimated(mateTarget);
      },
      emptyText: selectionEmptyText,
      showRelatedSites: (selected) => {
        const track = (record.tracks || []).find((candidate) => candidate.type === "restriction-sites");
        const sites = (track?.items || []).filter((site) => site.enzyme === selected.enzyme);
        copyViewerText(sites.map((site) => `${site.enzyme}\t${site.cutAfter ?? site.cutPosition ?? site.position}\t${site.recognition || ""}`).join("\n"));
      }
    };
  }
  function selectTarget(target, selectOptions = {}) {
    const nextTarget = target ? { ...target, key: target.key || makeTargetKey(target) } : null;
    state.selectedTarget = nextTarget && (selectOptions.keepIfSame || state.selectedTarget?.key !== nextTarget.key) ? nextTarget : null;
    renderSelectionPanel(selectionPanel, state.selectedTarget, selectionActions());
    drawViewer(ctx, canvas, status, record, state);
    notifySelectionChange();
  }
  function notifySelectionChange(payloadOptions = {}) {
    options.onSelectionChange?.(makeSelectionPayload(state.selectedTarget, payloadOptions));
  }
  function renderCurrentRange() {
    const range = getRangeState(state, record);
    renderRangePanel(rangePanel, range, {
      clearRange: () => {
        state.rangeAnchors = [];
        renderCurrentRange();
      },
      copyCoordinates: () => copyViewerText(range.label),
      copyForwardDna: () => copyViewerText(getRangeForwardDna(record, range)),
      copyReverseComplement: () => copyViewerText(proteinViewer ? "" : reverseComplement(getRangeForwardDna(record, range))),
      copyTranslation: (frame) => copyViewerText(proteinViewer ? "" : translateRange(getRangeForwardDna(record, range), frame, getViewerGeneticCode(record, state))),
      zoomToRange: () => {
        cancelInertia();
        const padding = Math.max(MIN_LINEAR_VIEW_SPAN / 2, range.length * 0.5);
        state.viewStart = range.start - 1 - padding;
        state.viewEnd = range.end + padding;
        clampView(state, record.length);
        drawViewer(ctx, canvas, status, record, state);
      },
      unitLabel: coordinateUnit(record),
      copySequenceLabel: proteinViewer ? "Copy protein sequence" : "Copy forward DNA",
      showReverseComplement: !proteinViewer,
      showTranslation: !proteinViewer,
      emptyText: proteinViewer
        ? "Add two anchors from selected coordinates, residues, or features to build a protein range."
        : "Add two anchors from selected coordinates, bases, sites, or codons to build a forward-DNA range."
    });
    notifySelectionChange({ preferredSelection: range.ready ? "range" : "target" });
  }
  const searchOptions = proteinViewer
      ? {
          scopes: [["protein", "Protein"], ["features", "Features"]],
          featureSuggestions: makeViewerFeatureSuggestions(record),
          placeholder: "Find protein sequence or feature"
        }
      : hideSequenceInterpretationControls
        ? {
            scopes: [["features", "Features"]],
            featureSuggestions: makeViewerFeatureSuggestions(record),
            placeholder: "Find feature, read, variant, or track item"
          }
        : {
          scopes: [["dna", "DNA"], ["protein", "Translations"], ["features", "Features"]],
          featureSuggestions: makeViewerFeatureSuggestions(record),
          placeholder: "Find sequence, translation, or feature"
        };
  const searchControls = createViewerSearchControls({
    onSearch: (scope, query) => runSearch(searchControls, scope, query),
    onPrevious: () => navigateSearch(searchControls, -1),
    onNext: () => navigateSearch(searchControls, 1)
  }, searchOptions);
  if (preserved?.searchScope && Array.from(searchControls.scope.options).some((option) => option.value === preserved.searchScope)) {
    searchControls.scope.value = preserved.searchScope;
  }
  if (preserved?.searchQuery) {
    searchControls.input.value = preserved.searchQuery;
    runSearch(searchControls, searchControls.scope.value, searchControls.input.value);
  }
  updateSearchControls(searchControls);
  renderCurrentRange();

  zoomIn.addEventListener("click", () => zoomAt(canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2, 1.7));
  zoomOut.addEventListener("click", () => zoomAt(canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2, 1 / 1.7));
  panLeft.addEventListener("click", () => panByFraction(-0.25));
  panRight.addEventListener("click", () => panByFraction(0.25));
  reset.addEventListener("click", () => {
    cancelInertia();
    state.viewStart = 0;
    state.viewEnd = record.length;
    drawViewer(ctx, canvas, status, record, state);
  });
  camera.addEventListener("click", () => {
    const safeTitle = makeSafeFileStem(record.title, proteinViewer ? "protein-viewer" : "dna-viewer");
    downloadCanvasPng(canvas, `${safeTitle}-viewer.png`, {
      drawSnapshot: (exportContext, exportCanvas) => {
        drawViewer(exportContext, exportCanvas, document.createElement("div"), record, cloneViewerStateForExport(state));
      }
    });
  });
  svgDownload.addEventListener("click", () => {
    const safeTitle = makeSafeFileStem(record.title, proteinViewer ? "protein-viewer" : "dna-viewer");
    downloadCanvasSvg(canvas, `${safeTitle}-viewer.svg`, {
      title: `${record.title || (proteinViewer ? "Protein sequence" : "DNA sequence")} linear viewer`,
      description: `Current linear viewer snapshot. ${status.textContent || ""}`.trim(),
      metadata: {
        viewer: "linear",
        recordTitle: record.title || "",
        sequenceLength: record.length,
        viewStart: Math.floor(state.viewStart + 1),
        viewEnd: Math.ceil(state.viewEnd)
      }
    });
  });
  secondStrandToggle.input.addEventListener("change", () => {
    cancelInertia();
    state.showSecondStrand = secondStrandToggle.input.checked;
    drawViewer(ctx, canvas, status, record, state);
  });
  forwardTranslationToggle.input.addEventListener("change", () => {
    cancelInertia();
    state.showForwardTranslations = forwardTranslationToggle.input.checked;
    drawViewer(ctx, canvas, status, record, state);
  });
  reverseTranslationToggle.input.addEventListener("change", () => {
    cancelInertia();
    state.showReverseTranslations = reverseTranslationToggle.input.checked;
    drawViewer(ctx, canvas, status, record, state);
  });
  geneticCodeControl.select.addEventListener("change", () => {
    cancelInertia();
    state.geneticCode = geneticCodeControl.select.value;
    drawViewer(ctx, canvas, status, record, state);
  });
  canvas.addEventListener("mousemove", (event) => {
    if (state.dragging) return;
    const target = hitTestRegions(state, event.clientX, event.clientY, canvas);
    showViewerTooltip(tooltip, target, event, panel);
    canvas.style.cursor = target ? "pointer" : "grab";
  });
  canvas.addEventListener("mouseleave", () => {
    hideViewerTooltip(tooltip);
    canvas.style.cursor = "";
  });
  canvas.addEventListener("click", (event) => {
    if (state.dragging) return;
    selectTarget(hitTestRegions(state, event.clientX, event.clientY, canvas));
  });
  canvas.addEventListener("contextmenu", (event) => {
    const target = hitTestRegions(state, event.clientX, event.clientY, canvas);
    if (!target || !options.onTargetContextMenu) return;
    event.preventDefault();
    selectTarget(target, { keepIfSame: true });
    options.onTargetContextMenu({
      ...makeSelectionPayload({ ...target, key: target.key || makeTargetKey(target) }),
      clientX: event.clientX,
      clientY: event.clientY
    });
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.deltaY < 0 ? 1.35 : 1 / 1.35);
  }, { passive: false });
  canvas.addEventListener("mousedown", (event) => {
    cancelInertia();
    hideViewerTooltip(tooltip);
    state.dragging = true;
    state.dragStartX = event.clientX;
    state.dragLastX = event.clientX;
    state.dragStartViewStart = state.viewStart;
    state.dragStartViewEnd = state.viewEnd;
    inertiaTracker.reset();
    inertiaTracker.add(event.clientX, performance.now());
    canvas.classList.add("dragging");
  });
  const onWindowMouseMove = (event) => {
    if (!state.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const span = state.dragStartViewEnd - state.dragStartViewStart;
    const dx = event.clientX - state.dragStartX;
    state.dragLastX = event.clientX;
    const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
    const bpDelta = -dx / Math.max(1, plotRight - plotLeft) * span;
    state.viewStart = state.dragStartViewStart + bpDelta;
    state.viewEnd = state.dragStartViewEnd + bpDelta;
    clampView(state, record.length);
    inertiaTracker.add(event.clientX, performance.now());
    drawViewer(ctx, canvas, status, record, state);
  };
  const onWindowMouseUp = (event) => {
    if (!state.dragging) return;
    const releaseX = Number.isFinite(Number(event.clientX)) ? event.clientX : state.dragLastX;
    const dragDistancePx = state.dragLastX - state.dragStartX;
    inertiaTracker.add(releaseX, performance.now());
    const rect = canvas.getBoundingClientRect();
    const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
    const span = state.viewEnd - state.viewStart;
    const velocity = -inertiaTracker.velocity(performance.now()) / Math.max(1, plotRight - plotLeft) * span;
    state.dragging = false;
    canvas.classList.remove("dragging");
    if (!allowsViewerInertia(window) || !shouldStartViewerInertia({ dragDistancePx, velocity })) return;
    stopInertia = startViewerInertia({
      initialVelocity: velocity,
      step: (deltaBp) => {
        const beforeStart = state.viewStart;
        const beforeEnd = state.viewEnd;
        state.viewStart += deltaBp;
        state.viewEnd += deltaBp;
        clampView(state, record.length);
        drawViewer(ctx, canvas, status, record, state);
        return Math.abs(state.viewStart - beforeStart) > 1e-6 || Math.abs(state.viewEnd - beforeEnd) > 1e-6;
      }
    });
  };
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
  window.addEventListener("resize", scheduleResize);
  window.addEventListener("sms3-theme-change", scheduleResize);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleResize) : null;
  resizeObserver?.observe(canvas);

  if (showInspectorPanels) {
    const workspace = createViewerInspectorWorkspace(canvas, selectionPanel, rangePanel);
    panel.append(toolbar, searchControls.element, workspace);
  } else {
    panel.append(toolbar, searchControls.element, canvas);
  }
  scheduleResize();
  return {
    cleanup: () => {
      cancelInertia();
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("sms3-theme-change", scheduleResize);
      resizeObserver?.disconnect();
    },
    snapshot: () => makeLinearViewerSnapshot(record, state, searchControls)
  };
}

export function renderDnaViewer(container, viewer, viewerOptions = {}) {
  const previousSession = renderedViewerSessions.get(container);
  const previousSnapshots = viewerOptions.preserveState === false
    ? []
    : previousSession?.handles?.map((handle) => handle.snapshot?.() || null) || [];
  previousSession?.cleanup?.();
  renderedViewerSessions.delete(container);
  container.classList.add("dna-viewer-output");
  container.classList.toggle("dna-viewer-output-embedded", viewerOptions.embedded === true);
  const records = Array.isArray(viewer?.records) ? viewer.records : [];
  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "dna-viewer-empty";
    empty.textContent = "No viewer records were produced.";
    container.append(empty);
    return;
  }
  const handles = [];
  const showRecordTitle = viewerOptions.showRecordTitle !== false;
  for (const [index, record] of records.entries()) {
    const panel = document.createElement("section");
    panel.className = "dna-viewer-panel";
    if (showRecordTitle) {
      const heading = document.createElement("h5");
      heading.textContent = `${record.title} (${Number(record.length || 0).toLocaleString()} ${coordinateUnit(record)})`;
      panel.append(heading);
    }
    container.append(panel);
    handles.push(installViewer(panel, { ...record, geneticCode: viewer.geneticCode || "1" }, {
      ...viewerOptions,
      initialState: viewerInitialStateForRecord(viewerOptions, previousSnapshots, index),
      recordIndex: index
    }));
  }
  renderedViewerSessions.set(container, {
    handles,
    cleanup: () => {
      for (const handle of handles) handle?.cleanup?.();
    }
  });
}
