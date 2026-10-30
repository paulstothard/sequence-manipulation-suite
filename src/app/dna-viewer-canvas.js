import { featureDensityBins } from "../core/feature-density.js";
import { drawFeatureFocusGlow, traceLinearFeatureShape } from "./feature-focus-glow.js";
import { hasCdsTranslations, CDS_TRANSLATION_HELP, drawLinearCdsTranslation } from './viewer-cds-translation.js';
import { continuousFeatureChevronRows, drawLinearFeatureChevrons, usesFeatureChevrons } from './viewer-feature-chevrons.js';
import { createViewerGeneModelKey } from './viewer-gene-model-key.js';
import { viewerAlignmentPosition, drawViewerAlignmentGuide } from './viewer-alignment-guide.js';
import { createFeatureSequenceControls } from "./viewer-feature-sequence-ui.js";
import { createViewerFeatureGroupControls } from "./viewer-feature-group-controls.js";
import { calculateLinearViewerRows, linearTrackLabelY, linearViewerCanvasSize } from "../core/linear-viewer-layout.js";
import { geneticCodes, getStartCodons, makeCodonMap } from "../core/genetic-code.js";
import { complementDnaRnaSequence } from "../core/sequence.js";
import { DNA_VIEWER_SEARCH_RESULT_LIMIT } from "../core/viewer-limits.js";
import { featureArrowHeadLength, featureArrowTerminalVisible, linearFeaturePolygon } from "../core/directional-feature-geometry.js";
import { traceTranslationArrow } from "../core/translation-arrow-geometry.js";
import {
  clipStackedIntervalLayout,
  layoutVisibleIntervals,
  reservedLinearSlots,
  usesAutomaticLinearDensity,
  hasSemanticLinearSlots,
  makeLinearPartConnectors,
  makeLinearIntervalCopies,
  isStackedIntervalTrack
} from "../core/viewer-track-layout.js";
import { downloadCanvasPng, downloadCanvasSvg, makeSafeFileStem } from "./canvas-export.js";
import {
  addRectHit,
  appendAutomaticRangeAnchor,
  createRangePanel,
  createSelectionPanel,
  createViewerInspectorWorkspace,
  createViewerTrackControls,
  createViewerSearchControls,
  getViewerFeatureTypeStyle,
  getViewerHitTargets,
  getViewerRangeSequence,
  getSelectionTranslation,
  getViewerTrackItems,
  getViewerTargetClientPosition,
  getVisibleViewerTracks,
  getViewerTrackDisplayMode,
  hasHiddenViewerItemTypes,
  hitTestRegions,
  makeTooltipText,
  makeTooltipDetailRows,
  makeRangeAnchor,
  makeViewerRangeState,
  makeViewerItemTargetDetails,
  makeTargetKey,
  makeViewerFeatureSuggestions,
  normalizeViewerDetailRows,
  renderRangePanel,
  renderSelectionPanel,
  rangeAnchorMatchesTarget,
  searchResultUsesFeatureGlyph,
  updateViewerSearchControls,
  viewerTargetsMatch
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
import { installCanvasVisualInspection } from "./visual-inspection.js";
import { installCanvasPinchZoom } from "./viewer-pinch-zoom.js";
import { viewerWheelZoomFactor } from "./viewer-wheel-zoom.js";
import { calculateBaseSelectionMarker } from "./base-selection-marker.js";
import { createFeatureZoomController, featureFocus } from "./viewer-feature-focus.js";

const PLOT_LEFT = 118;
const PLOT_RIGHT_GUTTER = 34;
const MIN_LINEAR_VIEW_SPAN = 10;
const LINEAR_SEQUENCE_LETTER_EDGE_PADDING = 9;
const LINEAR_TRACK_LABEL_LEFT_PADDING = 6;
const LINEAR_TRACK_LABEL_RIGHT_GAP = 4;
const ZOOM_LIMIT_WHEEL_PAN_DEAD_ZONE = 0.18;
const ZOOM_LIMIT_WHEEL_PAN_MAX_FRACTION = 0.24;
const FEATURE_SLOT_HEIGHT = 18;
const SQUISHED_FEATURE_SLOT_HEIGHT = 10;
const RESTRICTION_SITE_LABEL_PX_PER_BP = 10;
const RESTRICTION_SITE_LABEL_GAP = 8;
const ALIGNED_READ_BASE_PX_PER_BP = 9;
const ALIGNED_READ_BASE_TEXT_Y_OFFSET = 1;
const DENSITY_ITEM_THRESHOLD = 700;
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

export function layoutLinearRulerLabels(state, plotLeft, plotRight, measureText) {
  let lastLabelRight = -Infinity;
  return getLinearRulerTicks(state).map(tick => {
    const x = bpToX(tick.centerBp, plotLeft, plotRight, state.viewStart, state.viewEnd);
    const text = tick.label.toLocaleString();
    const width = measureText(text);
    const labelX = Math.max(plotLeft + width / 2, Math.min(plotRight - width / 2, x));
    const showLabel = width <= plotRight - plotLeft && labelX - width / 2 >= lastLabelRight + 8;
    if (showLabel) lastLabelRight = labelX + width / 2;
    return { ...tick, x, text, labelX, showLabel };
  });
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

export function computeLinearZoomState(state, length, pointerFraction, factor, focus = null, { panAtLimit = false } = {}) {
  const current = clampLinearViewRange(state?.viewStart, state?.viewEnd, length);
  const safeLength = Math.max(1, Number(length) || 1);
  const minSpan = Math.min(safeLength, MIN_LINEAR_VIEW_SPAN);
  const oldSpan = current.viewEnd - current.viewStart;
  const zoomFactor = Number(factor);
  const fraction = Math.max(0, Math.min(1, Number(focus?.fraction ?? pointerFraction)));
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0 || !Number.isFinite(fraction) || (focus && !Number.isFinite(focus.center))) {
    return current;
  }

  const newSpan = Math.max(minSpan, Math.min(safeLength, oldSpan / zoomFactor));
  let nextStart;
  if (panAtLimit && !focus && zoomFactor > 1 && oldSpan <= minSpan + 1e-9 && Math.abs(newSpan - oldSpan) < 1e-9) {
    // Preserve the former 1.35x step's pan distance while making small trackpad
    // deltas additive, just like zooming. Event frequency must not set pan speed.
    nextStart = current.viewStart + oldSpan * limitZoomPanFraction(fraction) * Math.log(zoomFactor) / Math.log(1.35);
  } else {
    const anchorBp = focus?.center ?? current.viewStart + fraction * oldSpan;
    nextStart = anchorBp - fraction * newSpan;
  }
  return clampLinearViewRange(nextStart, nextStart + newSpan, safeLength);
}

export function computeFeatureFocusView(state, length, focus) {
  const current = clampLinearViewRange(state.viewStart, state.viewEnd, length);
  const span = Math.max(Math.min(length, MIN_LINEAR_VIEW_SPAN), Math.min(current.viewEnd - current.viewStart, focus.span + 2 * focus.flank));
  return clampLinearViewRange(focus.center - span / 2, focus.center + span / 2, length);
}

export function shouldDrawLinearSequenceLetter(x, plotLeft, plotRight, edgePadding = LINEAR_SEQUENCE_LETTER_EDGE_PADDING) {
  return x >= plotLeft + edgePadding && x <= plotRight - edgePadding;
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
  const safeWidth = Math.max(PLOT_LEFT + PLOT_RIGHT_GUTTER + 1, Number(width) || 0);
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

function alignedReadArrowHeadLength(widthPx, heightPx, item, strand, terminalVisible, pxPerBp, compactTrack) {
  const head = featureArrowHeadLength(widthPx, heightPx, strand, terminalVisible);
  if (!head || compactTrack || !Array.isArray(item?.alignedReadBases) || !item.alignedReadBases.length ||
      pxPerBp < ALIGNED_READ_BASE_PX_PER_BP) return head;
  // Keep a pointed tip, with the slope confined to the end of the terminal base.
  return Math.min(head, 6, Math.max(4, pxPerBp * 0.25));
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
  return viewerTargetsMatch(state.selectedTarget, target) || viewerTargetsMatch(state.inspectedTarget, target);
}

function viewerTargetIsRangeAnchor(state, target) {
  return (state.rangeAnchors || []).some((anchor) => rangeAnchorMatchesTarget(anchor, target));
}

function searchTargetMatches(state, target) {
  return state.activeSearchTarget?.key && state.activeSearchTarget.key === makeTargetKey(target);
}

function drawLinearSelectedBaseMarker(ctx, { x, y, base, pxPerBp, theme }) {
  const { left, top, width, height, radius } = calculateBaseSelectionMarker(x, y, ctx.measureText(base), pxPerBp);
  ctx.save();
  ctx.fillStyle = theme.selectedFill;
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 1;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, radius);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
  }
  ctx.restore();
}

function drawLinearBaseAnchorOutline(ctx, { x, y, base, pxPerBp, theme }) {
  const { left, top, width, height, radius } = calculateBaseSelectionMarker(x, y, ctx.measureText(base), pxPerBp);
  ctx.save();
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 1.8;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, radius);
    ctx.stroke();
  } else {
    ctx.strokeRect(left, top, width, height);
  }
  ctx.restore();
}

function drawLinearSelectedCodonMarker(ctx, { x1, x2, y, strand, theme, height = 24 }) {
  const left = x1 + 1;
  const width = Math.max(1, x2 - x1 - 2);
  const top = y - height / 2;
  ctx.save();
  ctx.fillStyle = theme.selectedFill;
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.shadowColor = theme.selectedStroke;
  ctx.shadowBlur = theme.dark ? 6 : 3;
  traceTranslationArrow(ctx, left, top, width, height, strand);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLinearCodonAnchorOutline(ctx, { x1, x2, y, strand, theme, height = 22 }) {
  const left = x1 + 1;
  const width = Math.max(1, x2 - x1 - 2);
  ctx.save();
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  traceTranslationArrow(ctx, left, y - height / 2, width, height, strand);
  ctx.stroke();
  ctx.restore();
}

function drawLinearSelectedIntervalGlow(ctx, { x1, x2, y, height, strand, headLength = 0, plotLeft, plotRight, theme }) {
  ctx.save();
  // Crop at the viewport without inventing highlighted ends on clipped genes.
  ctx.beginPath();
  ctx.rect(plotLeft, y - height / 2 - 12, plotRight - plotLeft, height + 24);
  ctx.clip();
  drawFeatureFocusGlow(ctx, context => traceLinearFeatureShape(
    context, x1, y - height / 2, x2 - x1, height, strand, headLength
  ), theme);
  ctx.restore();
}

function drawLinearIntervalShape(ctx, left, top, width, height, strand, headLength, outlined = true) {
  if (!headLength) {
    ctx.fillRect(left, top, width, height);
    if (outlined) ctx.strokeRect(left, top, width, height);
    return;
  }
  const points = linearFeaturePolygon(left, top, width, height, strand, headLength);
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
  if (outlined) ctx.stroke();
}

function linearIntervalLabelCenter(left, width, strand, headLength) {
  if (strand === "+") return left + (width - headLength) / 2;
  if (strand === "-") return left + (width + headLength) / 2;
  return left + width / 2;
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
  const binCount = Math.max(24, Math.floor((plotRight - plotLeft) / 12));
  const bins = featureDensityBins(items, { viewStart, viewEnd, binCount, color, length: options.length });
  const max = Math.max(1, ...bins.map(bin => bin.count));
  const binWidth = (plotRight - plotLeft) / binCount;
  const previousAlpha = ctx.globalAlpha;
  bins.forEach((bin, index) => {
    let top = y - 10;
    ctx.globalAlpha = 0.25 + 0.65 * Math.sqrt(bin.count / max);
    for (const entry of bin.colors) {
      const height = 20 * entry.count / bin.count;
      ctx.fillStyle = entry.color;
      ctx.fillRect(plotLeft + index * binWidth, top, Math.max(1, binWidth - 1), height);
      top += height;
    }
  });
  ctx.globalAlpha = previousAlpha;
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = options.theme?.muted || "#64748b";
  ctx.textAlign = "right";
  ctx.fillText("feature density · zoom for detail", plotRight, options.captionY ?? y - 18);
}

export function shouldUseLinearTrackSummary(track, state, pxPerBp, visibleItemCount, recordLength) {
  if (isQuantitativeTrack(track)) return false;
  if (hasSemanticLinearSlots(track) && track.autoDensity !== true) return false;
  if (hasHiddenViewerItemTypes(track, state) && !usesAutomaticLinearDensity(track)) return false;
  if (!track.summary?.bins?.length && !usesAutomaticLinearDensity(track)) return false;
  const mode = getViewerTrackDisplayMode(track, state);
  if (mode === "full" || mode === "squished") return false;
  const itemCount = track.summary?.itemCount ?? track.items?.length ?? 0;
  const visibleCount = Number.isFinite(Number(visibleItemCount)) ? Number(visibleItemCount) : itemCount;
  const plotWidth = (state.viewEnd - state.viewStart) * pxPerBp;
  // Reserve roughly one marker width per feature before using an overview.
  const threshold = usesAutomaticLinearDensity(track) && Number.isFinite(plotWidth)
    ? Math.min(DENSITY_ITEM_THRESHOLD, Math.max(80, plotWidth / 12))
    : DENSITY_ITEM_THRESHOLD;
  // A reserved track's representation follows zoom, not which features happen
  // to cross the viewport edge while panning. Local clusters use the overflow
  // footer until zoom provides enough room for their individual features.
  const densityCount = recordLength > 0
    ? getViewerTrackItems(track, state).length * Math.min(1, (state.viewEnd - state.viewStart) / recordLength)
    : visibleCount;
  return densityCount > threshold;
}

function drawTrackSummaryBins(ctx, track, options) {
  const summary = track.summary;
  if (!summary?.bins?.length) return false;
  const { plotLeft, plotRight, viewStart, viewEnd, y, color } = options;
  const plusSummary = summary.strands?.find((entry) => entry.strand === "+");
  const minusSummary = summary.strands?.find((entry) => entry.strand === "-");
  if (plusSummary?.bins?.length && minusSummary?.bins?.length) {
    const unstrandedSummary = summary.strands?.find((entry) => entry.strand === "");
    const strandSummaries = [
      { summary: plusSummary, label: "+" },
      ...(unstrandedSummary?.bins?.length ? [{ summary: unstrandedSummary, label: "·" }] : []),
      { summary: minusSummary, label: "−" }
    ];
    const laneGap = 1;
    const laneHeight = (20 - laneGap * (strandSummaries.length - 1)) / strandSummaries.length;
    const lanes = strandSummaries.map((entry, index) => ({
      ...entry,
      top: y - 10 + index * (laneHeight + laneGap),
      bottom: y - 10 + index * (laneHeight + laneGap) + laneHeight
    }));
    const previousAlpha = ctx.globalAlpha;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.1;
    for (const lane of lanes) {
      ctx.fillRect(plotLeft, lane.top, plotRight - plotLeft, lane.bottom - lane.top);
    }
    for (const lane of lanes) {
      for (const bin of lane.summary.bins) {
        if (bin.end < viewStart || bin.start > viewEnd) continue;
        const binWidth = Math.max(1, Number(bin.end) - Number(bin.start));
        const coverage = Math.max(0, Math.min(1, Number(bin.bases || 0) / binWidth));
        if (coverage <= 0) continue;
        const x1 = Math.max(plotLeft, bpToX(Math.max(bin.start, viewStart), plotLeft, plotRight, viewStart, viewEnd));
        const x2 = Math.min(plotRight, bpToX(Math.min(bin.end, viewEnd), plotLeft, plotRight, viewStart, viewEnd));
        ctx.globalAlpha = 0.38 + 0.5 * Math.sqrt(coverage);
        ctx.fillRect(x1, lane.top, Math.max(1, x2 - x1), lane.bottom - lane.top);
      }
    }
    ctx.globalAlpha = previousAlpha;
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = options.theme?.muted || "#64748b";
    ctx.textAlign = "left";
    for (const lane of lanes) {
      ctx.fillText(lane.label, plotRight + 4, lane.bottom - 1);
    }
    return true;
  }
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
    ctx.fillText("feature density · zoom for detail", plotRight, options.captionY ?? y - 18);
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
  const results = state.selectedTarget?.coordinateSelection
    ? [...(state.searchResults || []), state.selectedTarget]
    : state.searchResults || [];
  if (results.length === 0) return;
  const { plotLeft, plotRight, markerTop, markerBottom } = layout;
  for (const result of results) {
    if (searchResultUsesFeatureGlyph(result)) continue;
    const start = Number(result.start ?? result.position);
    const end = Number(result.end ?? result.position);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end < state.viewStart + 1 || start > state.viewEnd) continue;
    const x1 = Math.max(plotLeft, bpToX(start - 1, plotLeft, plotRight, state.viewStart, state.viewEnd));
    const x2 = Math.min(plotRight, bpToX(end, plotLeft, plotRight, state.viewStart, state.viewEnd));
    const width = Math.max(3, x2 - x1);
    const active = result.coordinateSelection || state.activeSearchTarget?.key === result.key;
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

function hasVisibleGeneModels(record, state) {
  return getVisibleViewerTracks(record, state).some(track => getViewerTrackItems(track, state).some(item => item.geneModel || item.geneFeatureClass || record.geneFeatureLegend?.length));
}

export function buildLinearTrackLayouts(record, state, pxPerBp) {
  return getVisibleViewerTracks(record, state).map((track) => {
    const displayMode = getViewerTrackDisplayMode(track, state);
    const visibleCount = visibleTrackItemCount(track, state, state.viewStart, state.viewEnd);
    const reservedSlots = isStackedIntervalTrack(track) ? reservedLinearSlots(track) : 0;
    const slotHeight = displayMode === "squished" ? SQUISHED_FEATURE_SLOT_HEIGHT : record.compactLayout ? 14 : FEATURE_SLOT_HEIGHT;
    // Reserve the same lanes and overflow footer in overview, detail and empty
    // windows. Only explicit display settings may change a track's height.
    const reservedHeight = reservedSlots
      ? (record.compactLayout ? 10 : 18) + reservedSlots * slotHeight + 16
      : 0;
    if (isQuantitativeTrack(track)) {
      return {
        track,
        displayMode,
        quantitative: true,
        stacked: false,
        height: 70
      };
    }
    if (shouldUseLinearTrackSummary(track, state, pxPerBp, visibleCount, record.length)) {
      return {
        track,
        displayMode,
        stacked: false,
        summary: true,
        reservedSlots,
        height: reservedHeight || 42
      };
    }
    if (!isStackedIntervalTrack(track)) {
      return {
        track,
        displayMode,
        stacked: false,
        height: displayMode === "squished"
          ? (track.type === "restriction-sites" ? 24 : 30)
          : 42
      };
    }
    const layout = getCachedLinearSlotLayout(record, state, track, pxPerBp);
    const height = reservedHeight || (record.compactLayout ? 10 : 18) + layout.slotCount * slotHeight + (layout.hidden.length > 0 ? 16 : 0);
    return {
      track,
      displayMode,
      stacked: true,
      layout,
      slotHeight,
      reservedSlots,
      height
    };
  });
}

function getCachedLinearSlotLayout(record, state, track, pxPerBp) {
  if (!state.trackLayoutCache) state.trackLayoutCache = new WeakMap();
  const trackItems = getViewerTrackItems(track, state);
  const stableSlots = reservedLinearSlots(track);
  const maxSlots = stableSlots || 16;
  // Pack against original contig coordinates once per zoom scale. Clipping
  // first can reorder left-edge overlaps and replace visible features on pan.
  const viewStart = stableSlots ? 0 : state.viewStart;
  const viewEnd = stableSlots ? record.length : state.viewEnd;
  const visibleLayout = layout => stableSlots ? clipStackedIntervalLayout(layout, state) : layout;
  const selected = state.selectedTarget?.trackId === (track.id || track.type) ? state.selectedTarget : null;
  const selectedFeatureId = selected?.featureId;
  const selectedItemIndex = selected?.itemIndex;
  const key = JSON.stringify([record.length, trackItems.length, maxSlots, viewStart, viewEnd, pxPerBp,
    selectedFeatureId, selectedItemIndex, track.fixedSlotsByType || track.slotByType, track.allowFixedSlotOverlaps,
    Array.from(state.hiddenTrackItemTypes?.get(track.id || track.type || "track") || []).sort()]);
  const cached = state.trackLayoutCache.get(track);
  if (cached?.key === key) return visibleLayout(cached.layout);
  const layout = layoutVisibleIntervals(trackItems, {
    length: record.length, viewStart, viewEnd,
    maxSlots, minGapPixels: hasSemanticLinearSlots(track) ? 0 : 4, pxPerBp, selectedFeatureId, selectedItemIndex,
    fixedSlotsByType: track.fixedSlotsByType || track.slotByType,
    allowFixedSlotOverlaps: track.allowFixedSlotOverlaps === true
  });
  state.trackLayoutCache.set(track, { key, layout });
  return visibleLayout(layout);
}

function computeLinearRows(record, state, pxPerBp) {
  return calculateLinearViewerRows(buildLinearTrackLayouts(record, state, pxPerBp), {
    ...state,
    hideSequence: record.hideSequenceInterpretationControls === true,
    protein: isProteinRecord(record),
    compactLayout: record.compactLayout,
    hideRulers: record.hideRulers,
    sequencePosition: record.sequencePosition
  });
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
  for (const tick of layoutLinearRulerLabels(state, plotLeft, plotRight, text => ctx.measureText(text).width)) {
    const { x } = tick;
    addLinearCoordinateHit(state, x, y, tick.label);
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y + 7);
    ctx.stroke();
    if (tick.showLabel) ctx.fillText(tick.text, tick.labelX, y + (labelsAbove ? -22 : 22));
  }
}

function drawTranslationRow(ctx, record, state, y, frameLabel, frameOffset, strand, layout, theme) {
  const { plotLeft, plotRight, pxPerBp } = layout;
  const codonHeight = record.compactLayout ? 14 : 22;
  const hitHalfHeight = record.compactLayout ? 7.5 : 13;
  ctx.font = `${record.compactLayout ? 11 : 12}px system-ui, sans-serif`;
  ctx.fillStyle = theme.muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(frameLabel, plotLeft - 12, y);
  const codonPx = pxPerBp * 3;
  if (!canRevealSequenceDetail(record, state) || codonPx < 18) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const arrowSize = 7;
    ctx.moveTo(strand === "+" ? plotLeft : plotLeft + arrowSize, y);
    ctx.lineTo(strand === "+" ? plotRight - arrowSize : plotRight, y);
    ctx.stroke();
    ctx.fillStyle = theme.grid;
    ctx.beginPath();
    if (strand === "+") {
      ctx.moveTo(plotRight - arrowSize, y - 5);
      ctx.lineTo(plotRight, y);
      ctx.lineTo(plotRight - arrowSize, y + 5);
    } else {
      ctx.moveTo(plotLeft + arrowSize, y - 5);
      ctx.lineTo(plotLeft, y);
      ctx.lineTo(plotLeft + arrowSize, y + 5);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  const sequence = record.sequence;
  const codonMap = makeCodonMap(getViewerGeneticCode(record, state));
  const startCodons = getStartCodons(getViewerGeneticCode(record, state));
  const firstCodonStart = Math.max(frameOffset, frameOffset + Math.floor((state.viewStart - frameOffset) / 3) * 3);
  const start = firstCodonStart < state.viewStart ? firstCodonStart + 3 : firstCodonStart;
  const visibleCodons = [];
  for (let index = start; index + 2 < record.length && index <= state.viewEnd; index += 3) {
    if (index + 2 >= state.viewStart) visibleCodons.push(index);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(plotLeft, y - hitHalfHeight - 2, plotRight - plotLeft, hitHalfHeight * 2 + 4);
  ctx.clip();
  for (const index of visibleCodons) {
    const genomicCodon = sequence.slice(index, index + 3);
    const codon = strand === "+" ? genomicCodon : reverseComplement(genomicCodon);
    const normalizedCodon = codon.toUpperCase().replaceAll("U", "T");
    const aa = translateCodon(normalizedCodon, codonMap);
    const isStart = startCodons.has(normalizedCodon);
    const x1 = bpToX(index, plotLeft, plotRight, state.viewStart, state.viewEnd);
    const x2 = bpToX(index + 3, plotLeft, plotRight, state.viewStart, state.viewEnd);
    const visibleX1 = Math.max(plotLeft, x1);
    const visibleX2 = Math.min(plotRight, x2);
    if (visibleX2 <= visibleX1) continue;
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
    addRectHit(state, { x1: visibleX1, y1: y - hitHalfHeight, x2: visibleX2, y2: y + hitHalfHeight }, target);
    const selected = viewerTargetMatches(state, target);
    const anchored = viewerTargetIsRangeAnchor(state, target);
    const searchActive = searchTargetMatches(state, target);
    ctx.strokeStyle = aa === "*" ? theme.stopStroke : isStart ? theme.startStroke : theme.aminoAcidStroke;
    ctx.fillStyle = aa === "*" ? theme.stopFill : isStart ? theme.startFill : theme.aminoAcidFill;
    ctx.lineWidth = searchActive ? 2 : 1;
    ctx.lineJoin = "round";
    traceTranslationArrow(ctx, x1 + 1, y - codonHeight / 2, Math.max(1, x2 - x1 - 2), codonHeight, strand);
    ctx.fill();
    ctx.stroke();
    if (selected) {
      drawLinearSelectedCodonMarker(ctx, { x1, x2, y, strand, theme, height: codonHeight + 2 });
    }
    ctx.font = `${record.compactLayout ? 10 : 13}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillStyle = aa === "*" ? theme.stopText : isStart ? theme.startText : theme.aminoAcidText;
    ctx.textAlign = "center";
    const letterX = (x1 + x2) / 2;
    if (shouldDrawLinearSequenceLetter(letterX, plotLeft, plotRight, ctx.measureText(aa).width / 2)) {
      ctx.fillText(aa, letterX, y);
    }
    if (anchored) {
      drawLinearCodonAnchorOutline(ctx, { x1, x2, y, strand, theme, height: codonHeight });
    }
  }
  ctx.restore();
}

function drawViewer(ctx, canvas, status, record, state, theme = getViewerCanvasTheme(canvas)) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
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
  const selectedIntervalGlows = [];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  drawLinearSearchMarkers(ctx, state, layout, theme);
  const guidePosition = viewerAlignmentPosition(state, record.length);
  if (guidePosition !== null && guidePosition - 0.5 >= state.viewStart && guidePosition - 0.5 <= state.viewEnd) {
    const x = bpToX(guidePosition - 0.5, plotLeft, plotRight, state.viewStart, state.viewEnd);
    drawViewerAlignmentGuide(ctx, { x, y: rows.markerTop }, { x, y: rows.markerBottom }, theme);
  }

  const rulerY = 46;
  if (!record.hideRulers) drawLinearRuler(ctx, state, layout, { y: rulerY, labelsAbove: true, theme });

  for (const row of rows.trackYs) {
    const { track, y: trackY, topY, height, quantitative, stacked, summary, displayMode, slotHeight, reservedSlots, layout: trackSlotLayout } = row;
    const labelY = linearTrackLabelY(row, record);
    const color = getViewerTrackColor(theme, track);
    const compactTrack = displayMode === "squished";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "right";
    const trackLabel = track.axisLabel || track.label || (stacked && track.type === "features" ? "Features" : track.type);
    drawLinearTrackLabel(ctx, trackLabel, plotLeft, labelY);

    if (quantitative) {
      drawLinearQuantitativeTrack(ctx, track, state, layout, { topY, height }, theme);
      continue;
    }

    if (summary) {
      const options = { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd,
        y: labelY, captionY: topY + height - 15, color, theme, length: record.length };
      if (usesAutomaticLinearDensity(track)) drawDensityBins(ctx, getViewerTrackItems(track, state), options);
      else drawTrackSummaryBins(ctx, track, options) || drawDensityBins(ctx, getViewerTrackItems(track, state), options);
      continue;
    }

    if (track.type === "restriction-sites") {
      const allSites = getViewerTrackItems(track, state);
      const visible = allSites
        .map((site, itemIndex) => ({ site, itemIndex, cutPosition: restrictionSiteCutPosition(site) }))
        .filter((entry) => entry.cutPosition !== null && entry.cutPosition >= state.viewStart && entry.cutPosition <= state.viewEnd);
      if (shouldUseLinearTrackSummary(track, state, pxPerBp, visible.length, record.length)) {
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
          const highlighted = viewerTargetMatches(state, target);
          ctx.fillStyle = theme.restrictionFill;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.fillRect(x - markerWidth / 2, trackY - markerHeight / 2, markerWidth, markerHeight);
          ctx.strokeRect(x - markerWidth / 2, trackY - markerHeight / 2, markerWidth, markerHeight);
          if (highlighted) {
            selectedIntervalGlows.push({ x1: x - markerWidth / 2, x2: x + markerWidth / 2, y: trackY, height: markerHeight });
          }
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
    if (shouldUseLinearTrackSummary(track, state, pxPerBp, visible.length, record.length)) {
      drawTrackSummaryBins(ctx, track, { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color, theme }) ||
        drawDensityBins(ctx, visible, { plotLeft, plotRight, viewStart: state.viewStart, viewEnd: state.viewEnd, y: trackY, color });
    } else if (stacked) {
      const placements = trackSlotLayout?.placements ?? [];
      const rowSlotHeight = slotHeight || FEATURE_SLOT_HEIGHT;
      const defaultRectHeight = compactTrack ? 7 : 12;
      const hitHalfHeight = compactTrack ? 5 : 7;
      const slotBaseY = topY + (record.compactLayout ? 9 : compactTrack ? 10 : 13);
      const continuousRows = continuousFeatureChevronRows(getViewerTrackItems(track, state));
      const continuousItems = new Set(continuousRows.flatMap(row => row.members));
      const rowLabelGaps = new Map();
      for (const connector of makeLinearPartConnectors(getViewerTrackItems(track, state), state)) {
        const y = slotBaseY + connector.slot * rowSlotHeight;
        ctx.strokeStyle = getViewerFeatureTypeStyle(connector.item, color).stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bpToX(connector.start, plotLeft, plotRight, state.viewStart, state.viewEnd), y);
        ctx.lineTo(bpToX(connector.end, plotLeft, plotRight, state.viewStart, state.viewEnd), y);
        ctx.stroke();
      }
      for (const placement of placements) {
        const item = placement.item;
        const itemIndex = placement.itemIndex;
        const showsReadBases = !compactTrack && Array.isArray(item.alignedReadBases) && item.alignedReadBases.length > 0 &&
          pxPerBp >= ALIGNED_READ_BASE_PX_PER_BP;
        const rectHeight = item.geneModel?.role === "transcript" ? (compactTrack ? 3 : 5) : showsReadBases ? 14 : defaultRectHeight;
        let x1 = Math.max(plotLeft, bpToX(placement.start, plotLeft, plotRight, state.viewStart, state.viewEnd));
        let x2 = Math.min(plotRight, bpToX(placement.end, plotLeft, plotRight, state.viewStart, state.viewEnd));
        // Keep subpixel variants visible and clickable without changing their coordinates.
        if (track.focusOnSelect === true && x2 - x1 < 3) {
          x1 = Math.max(plotLeft, Math.min((x1 + x2) / 2 - 1.5, plotRight - 3));
          x2 = x1 + 3;
        }
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
        const hitPadding = track.focusOnSelect === true ? 3 : 0;
        addRectHit(state, { x1: Math.max(plotLeft, x1 - hitPadding), y1: laneY - hitHalfHeight, x2: Math.min(plotRight, x2 + hitPadding), y2: laneY + hitHalfHeight }, target);
        for (const utr of item.geneModel?.utrs ?? []) {
          const start = Math.max(placement.start, utr.start - 1), end = Math.min(placement.end, utr.end);
          if (end <= start) continue;
          addRectHit(state, {
            x1: bpToX(start, plotLeft, plotRight, state.viewStart, state.viewEnd),
            x2: bpToX(end, plotLeft, plotRight, state.viewStart, state.viewEnd),
            y1: laneY - hitHalfHeight, y2: laneY + hitHalfHeight
          }, { ...target, modelRegion: utr.type, details: [['Region', utr.type], ...(target.details ?? [])] });
        }
        const highlighted = viewerTargetMatches(state, target);
        ctx.fillStyle = item.geneModel?.role === "CDS" ? itemStyle.stroke : itemStyle.fill;
        ctx.strokeStyle = itemStyle.stroke;
        ctx.lineWidth = 1;
        const previousAlpha = ctx.globalAlpha;
        if (placement.fixedSlot) ctx.globalAlpha = Number(track.featureOpacity) || 0.68;
        const terminalVisible = featureArrowTerminalVisible({ ...placement, partCount: placement.partCount ?? item.parts?.length ?? 1 }, item.strand);
        const chevrons = usesFeatureChevrons(track, item);
        const headLength = chevrons || track.type === "digest-fragments" || item.type === "source"
          ? 0
          : alignedReadArrowHeadLength(widthPx, rectHeight, item, item.strand, terminalVisible, pxPerBp, compactTrack);
        drawLinearIntervalShape(ctx, x1, laneY - rectHeight / 2, widthPx, rectHeight, item.strand, headLength);
        ctx.globalAlpha = previousAlpha;
        if (highlighted) {
          selectedIntervalGlows.push({
            x1, x2: x1 + widthPx, y: laneY, height: rectHeight, strand: item.strand, headLength
          });
        }
        const readBasesDrawn = !compactTrack && drawAlignedReadBases(ctx, item, state, layout, {
          x: x1,
          y: laneY,
          widthPx,
          height: rectHeight
        }, theme);
        const cdsDrawn = drawLinearCdsTranslation(ctx, record, item, state, placement, target, {
          toX: bp => bpToX(bp, plotLeft, plotRight, state.viewStart, state.viewEnd),
          y: laneY, height: rectHeight, pxPerBase: pxPerBp,
          clipShape: context => traceLinearFeatureShape(context, x1, laneY - rectHeight / 2, widthPx, rectHeight, item.strand, headLength),
          ink: item.geneModel?.role === 'CDS' || theme.dark ? '#ffffff' : '#7c2d12'
        });
        if (cdsDrawn) {
          if (!rowLabelGaps.has(placement.slot)) rowLabelGaps.set(placement.slot, []);
          rowLabelGaps.get(placement.slot).push({ start: x1, end: x2 });
        }
        const labelPlan = getFeatureLabelRenderPlan(ctx, item.label || item.name || item.type || "", widthPx - headLength, pxPerBp, {
          minSize: 8,
          maxSize: 10,
          padding: 8,
          minAvailableWidth: 24
        });
        const showLabel = !cdsDrawn && !readBasesDrawn && !compactTrack && !item.geneModel && labelPlan.fits;
        if (!cdsDrawn && chevrons && !continuousItems.has(item)) drawLinearFeatureChevrons(ctx, x1, x1 + widthPx, laneY, rectHeight, item.strand,
          item.geneModel?.role === 'CDS' || theme.dark ? '#ffffff' : itemStyle.stroke,
          showLabel ? labelPlan.measuredWidth : 0);
        if (showLabel) {
          if (!rowLabelGaps.has(placement.slot)) rowLabelGaps.set(placement.slot, []);
          rowLabelGaps.get(placement.slot).push({ start: x1 + (widthPx - labelPlan.measuredWidth) / 2, end: x1 + (widthPx + labelPlan.measuredWidth) / 2 });
          ctx.save();
          ctx.fillStyle = theme.label;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = labelPlan.font;
          ctx.fillText(labelPlan.label, linearIntervalLabelCenter(x1, widthPx, item.strand, headLength), laneY);
          ctx.restore();
        }
      }
      for (const row of continuousRows) {
        if (trackSlotLayout && row.item.slot >= trackSlotLayout.slotCount) continue;
        const toX = bp => bpToX(bp, plotLeft, plotRight, state.viewStart, state.viewEnd);
        const coding = makeLinearIntervalCopies([{ parts: row.codingParts }], { ...state, length: record.length })
          .map(part => ({ start: toX(part.start), end: toX(part.end) }));
        const color = theme.dark ? '#ffffff' : getViewerFeatureTypeStyle(row.item).stroke;
        for (const span of makeLinearIntervalCopies([{ start: row.item.start, end: row.item.end }], { ...state, length: record.length })) {
          drawLinearFeatureChevrons(ctx, toX(span.start), toX(span.end), slotBaseY + row.item.slot * rowSlotHeight,
            compactTrack ? 6 : 8, row.item.strand,
            x => coding.some(part => x >= part.start && x <= part.end) ? '#ffffff' : color,
            0, rowLabelGaps.get(row.item.slot));
        }
      }
      if ((trackSlotLayout?.hidden?.length ?? 0) > 0) {
        const messageY = slotBaseY + (reservedSlots || trackSlotLayout.slotCount) * rowSlotHeight + 2;
        const hiddenCount = new Set(trackSlotLayout.hidden.map(placement => placement.itemIndex)).size;
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = theme.warning;
        ctx.textAlign = "right";
        ctx.fillText(`${hiddenCount.toLocaleString()} more feature${hiddenCount === 1 ? "" : "s"} · zoom in or select via feature search`, plotRight, messageY);
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
          const highlighted = viewerTargetMatches(state, target);
          const itemStyle = track.type === "digest-fragments" ? null : getViewerFeatureTypeStyle(item, color);
          ctx.fillStyle = track.type === "digest-fragments" ? theme.digestFill : itemStyle.fill;
          ctx.strokeStyle = track.type === "digest-fragments" ? color : itemStyle.stroke;
          ctx.lineWidth = 1;
          const rectHeight = compactTrack ? 10 : 20;
          const terminalVisible = item.strand === "+"
            ? part.end === end && part.end <= state.viewEnd
            : part.start === start && part.start - 1 >= state.viewStart;
          const chevrons = usesFeatureChevrons(track, item);
          const headLength = chevrons || track.type === "digest-fragments" || item.type === "source"
            ? 0
            : alignedReadArrowHeadLength(widthPx, rectHeight, item, item.strand, terminalVisible, pxPerBp, compactTrack);
          drawLinearIntervalShape(ctx, x1, trackY - rectHeight / 2, widthPx, rectHeight, item.strand, headLength);
          if (highlighted) {
            selectedIntervalGlows.push({
              x1, x2: x1 + widthPx, y: trackY, height: rectHeight, strand: item.strand, headLength
            });
          }
          const readBasesDrawn = !compactTrack && drawAlignedReadBases(ctx, item, state, layout, {
            x: x1,
            y: trackY,
            widthPx,
            height: rectHeight
          }, theme);
          const labelPlan = getFeatureLabelRenderPlan(ctx, item.label || item.name || item.type || "", widthPx - headLength, pxPerBp, {
            minSize: 8,
            maxSize: 11,
            padding: 10,
            minAvailableWidth: 24
          });
          const showLabel = !readBasesDrawn && !compactTrack && labelPlan.fits;
          if (chevrons) drawLinearFeatureChevrons(ctx, x1, x1 + widthPx, trackY, rectHeight, item.strand,
            theme.dark ? '#ffffff' : itemStyle.stroke, showLabel ? labelPlan.measuredWidth : 0);
          if (showLabel) {
            ctx.save();
            ctx.fillStyle = theme.label;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = labelPlan.font;
            ctx.fillText(labelPlan.label, linearIntervalLabelCenter(x1, widthPx, item.strand, headLength), trackY);
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
  } else if (canRevealSequenceDetail(record, state) && pxPerBp >= (record.compactLayout ? 8 : 10)) {
    const first = Math.max(0, Math.floor(state.viewStart));
    const last = Math.min(record.length - 1, Math.ceil(state.viewEnd));
    const baseHitHalfHeight = record.compactLayout ? 7 : 12;
    ctx.font = `${record.compactLayout ? 12 : 14}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    // Reserve the actual glyph width, so fully visible terminal bases are not
    // suppressed on narrow canvases. Partial letters still stay outside the plot.
    const letterEdgePadding = ctx.measureText('M').width / 2 + 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let index = first; index <= last; index += 1) {
      const x = bpToX(index + 0.5, plotLeft, plotRight, state.viewStart, state.viewEnd);
      if (!shouldDrawLinearSequenceLetter(x, plotLeft, plotRight, letterEdgePadding)) {
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
      addRectHit(state, { x1: x - pxPerBp / 2, y1: dnaTopY - baseHitHalfHeight, x2: x + pxPerBp / 2, y2: dnaTopY + baseHitHalfHeight }, target);
      if (viewerTargetMatches(state, target)) {
        drawLinearSelectedBaseMarker(ctx, { x, y: dnaTopY, base, pxPerBp, theme });
      }
      ctx.fillStyle = proteinViewer ? getViewerResidueColor(theme, base) : getViewerBaseColor(theme, base);
      ctx.fillText(base, x, dnaTopY);
      if (viewerTargetIsRangeAnchor(state, target)) {
        drawLinearBaseAnchorOutline(ctx, { x, y: dnaTopY, base, pxPerBp, theme });
      }
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
        addRectHit(state, { x1: x - pxPerBp / 2, y1: dnaBottomY - baseHitHalfHeight, x2: x + pxPerBp / 2, y2: dnaBottomY + baseHitHalfHeight }, complementTarget);
        if (viewerTargetMatches(state, complementTarget)) {
          drawLinearSelectedBaseMarker(ctx, { x, y: dnaBottomY, base: complement, pxPerBp, theme });
        }
        ctx.fillStyle = getViewerBaseColor(theme, complement);
        ctx.fillText(complement, x, dnaBottomY);
        if (viewerTargetIsRangeAnchor(state, complementTarget)) {
          drawLinearBaseAnchorOutline(ctx, { x, y: dnaBottomY, base: complement, pxPerBp, theme });
        }
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
    ctx.font = `${record.compactLayout ? 10 : 12}px system-ui, sans-serif`;
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const revealText = proteinViewer
      ? "zoom in to reveal amino acid letters"
      : showForwardTranslations || showReverseTranslations
        ? "zoom in to reveal DNA bases and amino acid letters"
        : "zoom in to reveal DNA bases";
    const fittedRevealText = ctx.measureText(revealText).width <= plotRight - plotLeft
      ? revealText : proteinViewer ? "Zoom in to reveal residues" : "Zoom in to reveal bases";
    if (record.compactLayout && record.sequencePosition === "top") {
      // Overlay the zoom hint on the DNA line so it cannot collide with the
      // tightly spaced translation rows or the first annotation track.
      const hintWidth = ctx.measureText(fittedRevealText).width + 8;
      ctx.fillStyle = theme.background;
      ctx.fillRect((plotLeft + plotRight - hintWidth) / 2, dnaTopY - 7, hintWidth, 14);
      ctx.fillStyle = theme.muted;
      ctx.textBaseline = "middle";
      ctx.fillText(fittedRevealText, (plotLeft + plotRight) / 2, dnaTopY);
    } else {
      ctx.fillText(fittedRevealText, (plotLeft + plotRight) / 2, showSecondStrand ? dnaBottomY + 24 : dnaTopY + 24);
    }
  }
  if (!record.hideSequenceInterpretationControls) {
    ctx.font = `${record.compactLayout ? 11 : 12}px system-ui, sans-serif`;
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

  if (!record.hideRulers && !record.compactLayout) drawLinearRuler(ctx, state, layout, { y: bottomRulerY, labelsAbove: false, theme });

  for (const outline of selectedIntervalGlows) {
    drawLinearSelectedIntervalGlow(ctx, { ...outline, plotLeft, plotRight, theme });
  }

  if (hasVisibleGeneModels(record, state)) {
    ctx.fillStyle = theme.muted;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const legend = record.geneFeatureLegend;
    if (legend?.length) {
      const width = legend.reduce((sum, entry) => sum + 28 + ctx.measureText(entry.label).width, 0) - 10;
      let x = Math.min(plotLeft, Math.max(12, plotRight - width));
      for (const entry of legend) {
        const y = rows.markerBottom + 9;
        ctx.fillStyle = entry.color;
        ctx.fillRect(x, y - entry.height / 2, 12, entry.height);
        ctx.fillStyle = theme.muted;
        ctx.fillText(entry.label, x + 18, y);
        x += 28 + ctx.measureText(entry.label).width;
      }
    } else {
      const key = "UTR: thin · CDS: thick · intron: line";
      const keyX = Math.min(plotLeft, Math.max(12, plotRight - ctx.measureText(key).width));
      ctx.fillText(key, keyX, rows.markerBottom + 9);
    }
  }

  status.textContent = "";
  const rangeLine = document.createElement("span");
  const scaleLine = document.createElement("span");
  const unit = coordinateUnit(record);
  rangeLine.textContent = `${Math.floor(state.viewStart + 1).toLocaleString()}-${Math.ceil(state.viewEnd).toLocaleString()} ${unit}`;
  scaleLine.textContent = `${Math.round(span).toLocaleString()} ${unit} span · ${pxPerBp.toFixed(2)} px/${unit}`;
  status.append(rangeLine, scaleLine);
  canvas.dataset.sms3InspectionReady = "true";
  canvas.setAttribute("aria-busy", "false");
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
  if (!text || !navigator.clipboard?.writeText) return false;
  return navigator.clipboard.writeText(String(text));
}

function getRangeState(state, record) {
  return makeViewerRangeState(state.rangeAnchors, record.length, {
    oppositePath: state.useOppositeRangePath
  });
}

function getRangeForwardDna(record, range) {
  return getViewerRangeSequence(record.sequence, range);
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

function addSearchResult(results, result, limit = DNA_VIEWER_SEARCH_RESULT_LIMIT) {
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

export function searchFeatures(record, query, state) {
  const needle = String(query || "").trim().toLowerCase();
  const results = [];
  if (!needle) return results;
  for (const track of getVisibleViewerTracks(record, state)) {
    const items = getViewerTrackItems(track, state);
    for (const [itemIndex, item] of items.entries()) {
      const text = [
        track.label,
        track.type,
        item.label,
        item.name,
        item.featureId,
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
        item.strand,
        ...normalizeViewerDetailRows(item.details).flat()
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!text.includes(needle)) continue;
      const start = Number(item.start ?? item.position);
      const end = Number(item.end ?? item.position ?? item.start);
      const itemPosition = Number(item.position);
      const hasInterval = Number.isFinite(start) && Number.isFinite(end);
      const position = Number.isFinite(itemPosition) ? itemPosition : start;
      if (!Number.isFinite(start) && !Number.isFinite(end) && !Number.isFinite(position)) continue;
      const added = addSearchResult(results, {
        start: Number.isFinite(start) ? start : position,
        end: Number.isFinite(end) ? end : position,
        position: !hasInterval && Number.isFinite(position) ? position : undefined,
        trackId: track.id || track.type,
        itemIndex,
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
    showCdsTranslations: state.showCdsTranslations,
    composition: snapshotViewerCompositionState(state),
    hiddenTrackIds: Array.from(state.hiddenTrackIds || []),
    hiddenTrackItemTypes: Array.from(state.hiddenTrackItemTypes || [], ([key, types]) => [key, Array.from(types)]),
    trackDisplayModes: Array.from(state.trackDisplayModes || []),
    rangeAnchors: Array.isArray(state.rangeAnchors) ? state.rangeAnchors.map((anchor) => ({ ...anchor })) : [],
    useOppositeRangePath: state.useOppositeRangePath === true,
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
  const cdsTranslationToggle = makeCheckboxToggle("CDS translation", true);
  cdsTranslationToggle.label.title = CDS_TRANSLATION_HELP;
  cdsTranslationToggle.label.hidden = !hasCdsTranslations(record);
  const geneticCodeControl = makeGeneticCodeSelect(record.geneticCode || "1");
  toggles.append(secondStrandToggle.label, forwardTranslationToggle.label, reverseTranslationToggle.label, cdsTranslationToggle.label, geneticCodeControl.control);
  if (hideDnaInterpretationControls) {
    secondStrandToggle.label.hidden = true;
    forwardTranslationToggle.label.hidden = true;
    reverseTranslationToggle.label.hidden = true;
    geneticCodeControl.control.hidden = true;
  }
  if (options.showGeneticCodeControl === false) geneticCodeControl.control.hidden = true;
  toolbar.append(leftControls, toggles, menuControls);

  const canvas = document.createElement("canvas");
  canvas.className = "dna-viewer-canvas";
  canvas.dataset.sms3InspectionReady = "false";
  canvas.setAttribute("aria-busy", "true");
  const ctx = canvas.getContext("2d");
  // Keep space for the tallest plot visited during navigation. The canvas
  // itself retains its natural height, so exports have no reserved whitespace.
  const stage = document.createElement("div");
  stage.className = "dna-viewer-stage";
  stage.style.minWidth = "0";
  stage.append(canvas);
  let reservedHeight = 0;
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
    showCdsTranslations: preserved?.showCdsTranslations !== false,
    showReverseTranslations: !hideDnaInterpretationControls && (preserved ? preserved.showReverseTranslations !== false : record.showReverseTranslationsDefault !== false),
    dragging: false,
    dragStartX: 0,
    dragLastX: 0,
    dragStartViewStart: 0,
    dragStartViewEnd: Math.max(1, record.length),
    selectedTarget: null,
    inspectedTarget: null,
    rangeAnchors: Array.isArray(preserved?.rangeAnchors)
      ? preserved.rangeAnchors.filter((anchor) => Number(anchor?.position) >= 1 && Number(anchor?.position) <= record.length).slice(-2)
      : [],
    useOppositeRangePath: preserved?.useOppositeRangePath === true,
    searchResults: [],
    activeSearchIndex: -1,
    activeSearchTarget: null,
    searchNavigationStarted: false,
    hitRegions: [],
    hiddenTrackIds: new Set(Array.isArray(preserved?.hiddenTrackIds) ? preserved.hiddenTrackIds : []),
    hiddenTrackItemTypes: new Map(Array.isArray(preserved?.hiddenTrackItemTypes)
      ? preserved.hiddenTrackItemTypes.filter(entry => Array.isArray(entry) && Array.isArray(entry[1])).map(([key, types]) => [key, new Set(types)]) : []),
    trackDisplayModes: new Map(Array.isArray(preserved?.trackDisplayModes) ? preserved.trackDisplayModes : [])
  };
  const featureZoom = createFeatureZoomController(record);
  clampView(state, record.length);
  initializeViewerCompositionTracks(record, state, preserved?.composition);
  const compositionControls = createViewerCompositionControls(record, state, () => {
    reservedHeight = 0;
    state.trackLayoutCache = new WeakMap();
    scheduleResize();
  });
  function updateTrackVisibility() {
    reservedHeight = 0;
    cancelInertia();
    trackControls?.syncVisibility();
    featureGroupControls?.sync();
    featureZoom.release();
    state.trackLayoutCache = new WeakMap();
    if (searchControls.scope.value === "features" && searchControls.input.value.trim()) {
      runSearch(searchControls, "features", searchControls.input.value);
    }
    scheduleResize();
  }
  const trackControls = createViewerTrackControls(record, state, updateTrackVisibility, {
    displayModes: true
  });
  const featureGroupControls = createViewerFeatureGroupControls(record, state, updateTrackVisibility);
  if (featureGroupControls) toolbar.append(featureGroupControls.element);
  const modelKey = createViewerGeneModelKey(record);
  if (modelKey) (featureGroupControls?.element ?? toolbar).append(modelKey);
  secondStrandToggle.input.checked = state.showSecondStrand;
  forwardTranslationToggle.input.checked = state.showForwardTranslations;
  reverseTranslationToggle.input.checked = state.showReverseTranslations;
  cdsTranslationToggle.input.checked = state.showCdsTranslations;
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
    const minimumHeight = 80;
    const desiredHeight = Math.max(minimumHeight, rows.markerBottom + (record.compactLayout ? hasVisibleGeneModels(record, state) ? 30 : 16 : 70));
    if (Math.abs(rect.height - desiredHeight) > 2) {
      canvas.style.height = `${desiredHeight}px`;
      rect = canvas.getBoundingClientRect();
    }
    reservedHeight = Math.max(reservedHeight, rect.height);
    stage.style.minHeight = `${reservedHeight}px`;
    const { width: nextWidth, height: nextHeight, pixelRatio: dpr } = linearViewerCanvasSize(
      rect.width, rect.height, window.devicePixelRatio || 1
    );
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawViewer(ctx, canvas, status, record, state);
  }
  let resizeFrame = 0;
  let navigationFrame = 0;
  let suppressClick = false;
  let stopInertia = () => {};
  const inertiaTracker = createInertiaVelocityTracker();
  function cancelInertia() {
    stopInertia();
    stopInertia = () => {};
    if (navigationFrame) cancelAnimationFrame(navigationFrame);
    navigationFrame = 0;
  }
  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  }
  function zoomAtFraction(pointerFraction, factor, focus = featureZoom.anchor(), options = {}) {
    cancelInertia();
    const next = computeLinearZoomState(state, record.length, pointerFraction, factor, focus, options);
    state.viewStart = next.viewStart;
    state.viewEnd = next.viewEnd;
    resize();
  }
  function zoomAt(clientX, clientY, factor) {
    const rect = canvas.getBoundingClientRect();
    const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
    const x = Math.max(plotLeft, Math.min(plotRight, clientX - rect.left));
    const focus = featureZoom.wheel({ x, y: clientY - rect.top, now: performance.now(), regions: state.hitRegions, viewStart: state.viewStart, viewEnd: state.viewEnd, plotLeft, plotRight,
      atZoomLimit: state.viewEnd - state.viewStart <= Math.min(record.length, MIN_LINEAR_VIEW_SPAN) + 1e-9 });
    // Only a gesture that starts fully zoomed may pan. Momentum from zooming
    // into a feature must stop there instead of immediately sliding past it.
    zoomAtFraction((x - plotLeft) / Math.max(1, plotRight - plotLeft), factor, focus, { panAtLimit: featureZoom.panAtLimit() });
  }
  function panByFraction(fraction) {
    cancelInertia();
    featureZoom.release();
    const span = state.viewEnd - state.viewStart;
    state.viewStart += span * fraction;
    state.viewEnd += span * fraction;
    clampView(state, record.length);
    resize();
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
    const focus = featureZoom.select(target);
    if (focus) {
      Object.assign(state, computeFeatureFocusView(state, record.length, focus));
      resize();
      return;
    }
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
      resize();
      navigationFrame = t < 1 ? requestAnimationFrame(step) : 0;
    }
    navigationFrame = requestAnimationFrame(step);
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
        addRangeAnchor: (selected = target, endpoint = "start") => selectionActions().addRangeAnchor(selected, endpoint),
        clearRange: () => {
          state.rangeAnchors = [];
          state.useOppositeRangePath = false;
          renderCurrentRange({ redraw: true });
        },
        copyRangeCoordinates: () => currentRange?.ready && copyViewerText(currentRange.label),
        copyRangeSequence: () => currentRange?.ready && copyViewerText(getRangeForwardDna(record, currentRange)),
        copyRangeReverseComplement: () => currentRange?.ready && !proteinViewer && copyViewerText(reverseComplement(getRangeForwardDna(record, currentRange))),
        copyRangeTranslation: (frame) => currentRange?.ready && !proteinViewer && copyViewerText(translateRange(getRangeForwardDna(record, currentRange), frame, getViewerGeneticCode(record, state))),
        zoomToRange: () => {
          cancelInertia();
          featureZoom.release();
          if (!currentRange?.ready) return;
          if (currentRange.wraps) {
            state.viewStart = 0;
            state.viewEnd = record.length;
            resize();
            return;
          }
          const padding = Math.max(MIN_LINEAR_VIEW_SPAN / 2, currentRange.length * 0.5);
          state.viewStart = currentRange.start - 1 - padding;
          state.viewEnd = currentRange.end + padding;
          clampView(state, record.length);
          resize();
        },
        swapRange: () => {
          if (!currentRange?.canSwap) return;
          state.useOppositeRangePath = !state.useOppositeRangePath;
          renderCurrentRange({ redraw: true });
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
      addRangeAnchor: (selected, endpoint = "start") => {
        const anchor = makeRangeAnchor(selected, endpoint);
        if (!anchor) return;
        state.rangeAnchors = [...state.rangeAnchors, anchor].slice(-2);
        state.useOppositeRangePath = false;
        renderCurrentRange({ redraw: true });
      },
      featureSequenceControls: selected => createFeatureSequenceControls(record, selected),
      copyText: copyViewerText,
      copySequence: (selected) => copyViewerText(getLinearSequence(record, selected)),
      canCopyTranslation: (selected, translation = getSelectionTranslation(selected)) =>
        !proteinViewer && Boolean(translation || getLinearSequence(record, selected).length >= 3),
      copyTranslation: (selected) => {
        const translation = getSelectionTranslation(selected) || translateRange(
          getLinearSequence(record, selected),
          "+1",
          getViewerGeneticCode(record, state)
        );
        return copyViewerText(translation);
      },
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
    cancelInertia();
    const nextTarget = target ? { ...target, key: target.key || makeTargetKey(target) } : null;
    const focus = featureFocus(record, nextTarget);
    state.selectedTarget = nextTarget && (focus || selectOptions.keepIfSame || state.selectedTarget?.key !== nextTarget.key) ? nextTarget : null;
    featureZoom.select(state.selectedTarget, selectOptions.pointer);
    if (focus) {
      inspection.hide();
      Object.assign(state, computeFeatureFocusView(state, record.length, focus));
    }
    const nextAnchors = selectOptions.autoRangeAnchor && nextTarget
      ? appendAutomaticRangeAnchor(state.rangeAnchors, nextTarget)
      : state.rangeAnchors;
    const rangeChanged = nextAnchors !== state.rangeAnchors;
    if (rangeChanged) {
      state.rangeAnchors = nextAnchors;
      state.useOppositeRangePath = false;
    }
    renderSelectionPanel(selectionPanel, state.selectedTarget, selectionActions());
    if (rangeChanged) renderCurrentRange({ notify: false });
    resize();
    notifySelectionChange({ preferredSelection: getRangeState(state, record).ready ? "range" : "target" });
  }
  function notifySelectionChange(payloadOptions = {}) {
    options.onSelectionChange?.(makeSelectionPayload(state.selectedTarget, payloadOptions));
  }
  function renderCurrentRange(renderOptions = {}) {
    const range = getRangeState(state, record);
    renderRangePanel(rangePanel, range, {
      clearRange: () => {
        state.rangeAnchors = [];
        state.useOppositeRangePath = false;
        renderCurrentRange({ redraw: true });
      },
      copyCoordinates: () => copyViewerText(range.label),
      copyForwardDna: () => copyViewerText(getRangeForwardDna(record, range)),
      copyReverseComplement: () => copyViewerText(proteinViewer ? "" : reverseComplement(getRangeForwardDna(record, range))),
      copyTranslation: (frame) => copyViewerText(proteinViewer ? "" : translateRange(getRangeForwardDna(record, range), frame, getViewerGeneticCode(record, state))),
      zoomToRange: () => {
        cancelInertia();
        featureZoom.release();
        if (range.wraps) {
          state.viewStart = 0;
          state.viewEnd = record.length;
          resize();
          return;
        }
        const padding = Math.max(MIN_LINEAR_VIEW_SPAN / 2, range.length * 0.5);
        state.viewStart = range.start - 1 - padding;
        state.viewEnd = range.end + padding;
        clampView(state, record.length);
        resize();
      },
      swapRange: () => {
        if (!range.canSwap) return;
        state.useOppositeRangePath = !state.useOppositeRangePath;
        renderCurrentRange({ redraw: true });
      },
      unitLabel: coordinateUnit(record),
      copySequenceLabel: proteinViewer ? "Copy protein sequence" : "Copy forward DNA",
      showReverseComplement: !proteinViewer,
      showTranslation: !proteinViewer,
      emptyText: proteinViewer
        ? "Click two residues to build a protein range."
        : "Click two bases or amino acids to build a forward-DNA range."
    });
    if (renderOptions.redraw) drawViewer(ctx, canvas, status, record, state);
    if (renderOptions.notify !== false) {
      notifySelectionChange({ preferredSelection: range.ready ? "range" : "target" });
    }
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

  zoomIn.addEventListener("click", () => zoomAtFraction(0.5, 1.7));
  zoomOut.addEventListener("click", () => zoomAtFraction(0.5, 1 / 1.7));
  panLeft.addEventListener("click", () => panByFraction(-0.25));
  panRight.addEventListener("click", () => panByFraction(0.25));
  reset.addEventListener("click", () => {
    cancelInertia();
    featureZoom.release();
    state.viewStart = 0;
    state.viewEnd = record.length;
    resize();
  });
  camera.addEventListener("click", () => {
    const safeTitle = makeSafeFileStem(record.title, proteinViewer ? "protein-viewer" : "dna-viewer");
    downloadCanvasPng(canvas, `${safeTitle}-viewer.png`, {
      drawSnapshot: (exportContext, exportCanvas) => {
        // The detached export canvas does not inherit the viewer's CSS colours.
        drawViewer(exportContext, exportCanvas, document.createElement("div"), record, cloneViewerStateForExport(state), getViewerCanvasTheme(canvas));
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
    reservedHeight = 0;
    state.showSecondStrand = secondStrandToggle.input.checked;
    resize();
  });
  forwardTranslationToggle.input.addEventListener("change", () => {
    cancelInertia();
    reservedHeight = 0;
    state.showForwardTranslations = forwardTranslationToggle.input.checked;
    resize();
  });
  reverseTranslationToggle.input.addEventListener("change", () => {
    cancelInertia();
    reservedHeight = 0;
    state.showReverseTranslations = reverseTranslationToggle.input.checked;
    resize();
  });
  cdsTranslationToggle.input.addEventListener("change", () => {
    cancelInertia();
    state.showCdsTranslations = cdsTranslationToggle.input.checked;
    drawViewer(ctx, canvas, status, record, state);
  });
  geneticCodeControl.select.addEventListener("change", () => {
    cancelInertia();
    state.geneticCode = geneticCodeControl.select.value;
    drawViewer(ctx, canvas, status, record, state);
  });
  const inspection = installCanvasVisualInspection(panel, {
    canvas,
    ariaLabel: `${record.title || (proteinViewer ? "Protein sequence" : "DNA sequence")} ${proteinViewer ? "protein" : "linear DNA"} viewer`,
    getTargets: () => getViewerHitTargets(state),
    hitTest: (event) => hitTestRegions(state, event.clientX, event.clientY, canvas),
    getText: makeTooltipText,
    getDetails: makeTooltipDetailRows,
    getKey: (target) => `${target.key || makeTargetKey(target)}${target.modelRegion ? `|${target.modelRegion}` : ""}`,
    getPosition: (target) => getViewerTargetClientPosition(state, target, canvas),
    onActivate: (target) => selectTarget(target, { keepIfSame: true, autoRangeAnchor: true }),
    onActiveChange: (target) => {
      state.inspectedTarget = target;
      drawViewer(ctx, canvas, status, record, state);
    },
    isInteractionSuppressed: () => state.dragging
  });
  canvas.addEventListener("click", (event) => {
    if (state.dragging || suppressClick) { suppressClick = false; return; }
    const rect = canvas.getBoundingClientRect();
    selectTarget(hitTestRegions(state, event.clientX, event.clientY, canvas), {
      autoRangeAnchor: true, pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top }
    });
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
    const factor = viewerWheelZoomFactor(event);
    if (factor === 1) return;
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });
  let pinchOrigin = null;
  const cleanupPinch = installCanvasPinchZoom(canvas, {
    onContact: () => { cancelInertia(); inspection.hide(); },
    onPanStart: (event) => onMouseDown(event),
    onPanMove: (event) => onWindowMouseMove(event),
    onPanEnd: (event) => onWindowMouseUp(event),
    onStart: () => {
      cancelInertia();
      inspection.hide();
      featureZoom.endGesture();
      pinchOrigin = null;
      suppressClick = true;
    },
    onChange: ({ previous, current, factor }) => {
      const rect = canvas.getBoundingClientRect();
      const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
      const plotWidth = Math.max(1, plotRight - plotLeft);
      const fraction = Math.max(0, Math.min(1, (previous.x - rect.left - plotLeft) / plotWidth));
      pinchOrigin ??= previous.x;
      if (Math.abs(current.x - pinchOrigin) > 24) featureZoom.release();
      const focus = featureZoom.anchor();
      const next = computeLinearZoomState(state, record.length, fraction, factor, focus);
      const shift = focus ? 0 : (current.x - previous.x) / plotWidth * (next.viewEnd - next.viewStart);
      state.viewStart = next.viewStart - shift;
      state.viewEnd = next.viewEnd - shift;
      clampView(state, record.length);
      resize();
    },
    onEnd: () => { pinchOrigin = null; }
  });
  const onMouseDown = (event) => {
    if (event.button !== 0) return;
    // Cancel native selection before the browser starts its mouse-drag state.
    // Touch pan callbacks pass coordinates, not MouseEvents; keep their scroll
    // arbitration in installCanvasPinchZoom. Preserve keyboard inspection focus.
    if (event.type === "mousedown") {
      event.preventDefault();
      canvas.focus({ preventScroll: true });
    }
    cancelInertia();
    inspection.hide();
    suppressClick = false;
    state.dragMoved = false;
    state.dragging = true;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragLastX = event.clientX;
    state.dragStartViewStart = state.viewStart;
    state.dragStartViewEnd = state.viewEnd;
    inertiaTracker.reset();
    inertiaTracker.add(event.clientX, performance.now());
    canvas.classList.add("dragging");
  };
  canvas.addEventListener("mousedown", onMouseDown);
  const onWindowMouseMove = (event) => {
    if (!state.dragging && event.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!state.dragging) {
      featureZoom.move(event.clientX - rect.left, event.clientY - rect.top);
      return;
    }
    const span = state.dragStartViewEnd - state.dragStartViewStart;
    const dx = event.clientX - state.dragStartX;
    if (Math.hypot(dx, event.clientY - state.dragStartY) > 4) {
      featureZoom.release();
      state.dragMoved = true;
    }
    state.dragLastX = event.clientX;
    const { plotLeft, plotRight } = getLinearPlotBounds(rect.width);
    const bpDelta = -dx / Math.max(1, plotRight - plotLeft) * span;
    state.viewStart = state.dragStartViewStart + bpDelta;
    state.viewEnd = state.dragStartViewEnd + bpDelta;
    clampView(state, record.length);
    inertiaTracker.add(event.clientX, performance.now());
    resize();
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
    suppressClick = state.dragMoved;
    canvas.classList.remove("dragging");
    if (event.cancelled || !allowsViewerInertia(window) || !shouldStartViewerInertia({ dragDistancePx, velocity })) return;
    stopInertia = startViewerInertia({
      initialVelocity: velocity,
      step: (deltaBp) => {
        const beforeStart = state.viewStart;
        const beforeEnd = state.viewEnd;
        state.viewStart += deltaBp;
        state.viewEnd += deltaBp;
        clampView(state, record.length);
        resize();
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
    const workspace = createViewerInspectorWorkspace(stage, selectionPanel, rangePanel);
    panel.append(toolbar, searchControls.element, workspace);
  } else {
    panel.append(toolbar, searchControls.element, stage);
  }
  options.onCoordinateSelectionReady?.((start, end) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > record.length) return false;
    cancelInertia();
    state.rangeAnchors = [];
    state.useOppositeRangePath = false;
    selectTarget(start === end
      ? { kind: "base", type: "Base", position: start, start, end, base: record.sequence[start - 1], strand: "+" }
      : { kind: "search-result", type: "Selected bases", start, end, strand: "+", label: `Bases ${start}-${end}`, coordinateSelection: true }, { keepIfSame: true });
    return true;
  });
  scheduleResize();
  return {
    cleanup: () => {
      cancelInertia();
      cleanupPinch();
      inspection.cleanup();
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("sms3-theme-change", scheduleResize);
      resizeObserver?.disconnect();
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = 0;
      }
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

export function snapshotRenderedDnaViewer(container) {
  return renderedViewerSessions.get(container)?.handles
    ?.map((handle) => handle.snapshot?.() || null)
    .filter(Boolean) ?? [];
}

export function cleanupRenderedDnaViewer(container) {
  renderedViewerSessions.get(container)?.cleanup?.();
  renderedViewerSessions.delete(container);
}
