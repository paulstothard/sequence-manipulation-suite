import { geneticCodes, getStartCodons, makeCodonMap } from "../core/genetic-code.js";
import { complementDnaRnaSequence } from "../core/sequence.js";
import { createStackedIntervalLayout, isStackedIntervalTrack } from "../core/viewer-track-layout.js";
import { downloadCanvasPng, downloadCanvasSvg, makeSafeFileStem } from "./canvas-export.js";
import { getFeatureLabelRenderPlan } from "./viewer-label-rules.js";
import {
  addCircleHit,
  addPolarHit,
  createRangePanel,
  createSelectionPanel,
  createViewerInspectorWorkspace,
  createViewerSearchControls,
  createViewerTrackControls,
  createViewerTooltip,
  getViewerFeatureTypeStyle,
  getViewerTrackDisplayMode,
  getViewerTrackItems,
  getVisibleViewerTracks,
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
import {
  getViewerBaseColor,
  getViewerCanvasTheme,
  getViewerTrackColor
} from "./viewer-canvas-theme.js";
import {
  allowsViewerInertia,
  createInertiaVelocityTracker,
  shouldStartViewerInertia,
  startViewerInertia
} from "./viewer-inertia.js";

const TWO_PI = Math.PI * 2;
const ICONS = {
  zoomIn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.25"/><path d="m15.25 15.25 4.25 4.25"/><path d="M10.5 7.75v5.5M7.75 10.5h5.5"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.25"/><path d="m15.25 15.25 4.25 4.25"/><path d="M7.75 10.5h5.5"/></svg>',
  rotateLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 7.8h5.6V2.2"/><path d="M4.4 7.4A8.6 8.6 0 1 1 3.2 14"/></svg>',
  rotateRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 7.8h-5.6V2.2"/><path d="M19.6 7.4A8.6 8.6 0 1 0 20.8 14"/></svg>',
  fitView: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4"/><path d="M16 4h4v4"/><path d="M20 16v4h-4"/><path d="M8 20H4v-4"/><circle cx="12" cy="12" r="2.6"/></svg>',
  pngFile: '<span class="dna-viewer-export-label">PNG</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8"/><path d="m6.9 8.55 3.1 3.1 3.1-3.1"/><path d="M4.25 15.75h11.5"/></svg>',
  svgFile: '<span class="dna-viewer-export-label">SVG</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8"/><path d="m6.9 8.55 3.1 3.1 3.1-3.1"/><path d="M4.25 15.75h11.5"/></svg>'
};
const FEATURE_RING_GAP = 3;
const FEATURE_RING_WIDTH = 10;
const FEATURE_RING_MAX = 16;
const RESTRICTION_SITE_RING_HALF_WIDTH = 5;
const RESTRICTION_SITE_MARKER_ARC_PX = 8;
const DENSITY_ITEM_THRESHOLD = 700;
const DENSITY_PX_PER_UNIT_THRESHOLD = 0.03;
const MIN_CIRCULAR_VIEW_SPAN = 6;
const DEFAULT_CIRCULAR_VIEW_SPAN_LIMIT = 30;
export const OUTER_RULER_LABEL_OFFSET = 24;
const CIRCULAR_ZOOM_ORIENTATION_ANGLE = -Math.PI / 2;
const MIN_CIRCULAR_WINDOW_GAP_ANGLE = Math.PI * 0.04;
const LINEARIZED_CIRCULAR_WINDOW_GAP_ANGLE = Math.PI * 0.95;
const renderedCircularViewerSessions = new WeakMap();

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

function normalizeAngle(angle) {
  let output = angle % TWO_PI;
  if (output < 0) output += TWO_PI;
  return output;
}

function signedAngleDiff(left, right) {
  let diff = normalizeAngle(left) - normalizeAngle(right);
  if (diff > Math.PI) diff -= TWO_PI;
  if (diff < -Math.PI) diff += TWO_PI;
  return diff;
}

function normalizeBp(bp, length) {
  let output = bp % length;
  if (output < 0) output += length;
  return output;
}

function pointOnCircle(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function isUpsideDown(angle) {
  const normalized = normalizeAngle(angle);
  return normalized > 0 && normalized < Math.PI;
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

function niceStepAtLeast(value) {
  const raw = Math.max(1, value);
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const scaled = raw / pow10;
  if (scaled <= 1) return pow10;
  if (scaled <= 2) return 2 * pow10;
  if (scaled <= 5) return 5 * pow10;
  return 10 * pow10;
}

function minorTickStep(majorStep) {
  if (majorStep <= 1) return null;
  if (majorStep % 5 === 0) return majorStep / 5;
  if (majorStep % 2 === 0) return majorStep / 2;
  return null;
}

function circularMajorTickStep(state, record, pxPerBp) {
  const spanStep = niceTickStep(state.viewSpan);
  const zoomRatio = record.length / state.viewSpan;
  if (zoomRatio < 1.8 || !Number.isFinite(pxPerBp) || pxPerBp <= 0) {
    return spanStep;
  }
  const pixelStep = niceStepAtLeast(110 / pxPerBp);
  return Math.max(1, Math.min(spanStep, pixelStep));
}

function getViewerGeneticCode(record, state) {
  return state.geneticCode || record.geneticCode || "1";
}

function translateCodon(codon, codonMap) {
  return codonMap.get(String(codon).toUpperCase().replaceAll("U", "T")) || "X";
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

function getCircularSelectionRange(target, record) {
  const start = Number(target.start ?? target.position);
  const end = Number(target.end ?? target.position);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.max(1, Math.min(record.length, Math.floor(start))),
    end: Math.max(1, Math.min(record.length, Math.ceil(end)))
  };
}

function getCircularSequence(record, target) {
  if (target.kind === "restriction-site" && target.siteStart && target.siteEnd) {
    const start = Math.max(1, Math.min(record.length, Number(target.siteStart)));
    const end = Math.max(1, Math.min(record.length, Number(target.siteEnd)));
    if (Number.isFinite(start) && Number.isFinite(end)) {
      if (start <= end) return record.sequence.slice(start - 1, end);
      return record.sequence.slice(start - 1) + record.sequence.slice(0, end);
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
  const range = getCircularSelectionRange(target, record);
  if (!range) return "";
  if (range.start <= range.end) {
    const sequence = record.sequence.slice(range.start - 1, range.end);
    return target.strand === "-" ? reverseComplement(sequence) : sequence;
  }
  const wrapped = record.sequence.slice(range.start - 1) + record.sequence.slice(0, range.end);
  return target.strand === "-" ? reverseComplement(wrapped) : wrapped;
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

function getCircularRangeState(state, record) {
  const anchors = state.rangeAnchors || [];
  if (anchors.length < 2) return { anchors, ready: false };
  const start = Math.max(1, Math.min(record.length, anchors[0].position));
  const end = Math.max(1, Math.min(record.length, anchors[1].position));
  const wraps = start > end;
  const length = wraps ? record.length - start + 1 + end : end - start + 1;
  return {
    anchors,
    ready: true,
    start,
    end,
    length,
    wraps,
    canSwap: true,
    label: wraps ? `${start.toLocaleString()}-${record.length.toLocaleString()}, 1-${end.toLocaleString()}` : `${start.toLocaleString()}-${end.toLocaleString()}`
  };
}

function getCircularRangeForwardDna(record, range) {
  if (!range?.ready) return "";
  if (!range.wraps) return record.sequence.slice(range.start - 1, range.end);
  return record.sequence.slice(range.start - 1) + record.sequence.slice(0, range.end);
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
      findAllLiteral(aminoAcids.join(""), needle, (aaIndex) => addSearchResult(results, {
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

function getViewStart(state) {
  return state.viewCenter - state.viewSpan / 2;
}

function getViewEnd(state) {
  return state.viewCenter + state.viewSpan / 2;
}

function getMinCircularViewSpan(length) {
  const safeLength = Math.max(1, Number(length) || 1);
  if (safeLength <= MIN_CIRCULAR_VIEW_SPAN) return safeLength;
  return Math.min(
    safeLength,
    Math.max(
      MIN_CIRCULAR_VIEW_SPAN,
      Math.min(DEFAULT_CIRCULAR_VIEW_SPAN_LIMIT, Math.ceil(safeLength * 0.12))
    )
  );
}

function clampSpan(state, length, options = {}) {
  const preserveOrientation = Boolean(options.preserveOrientation);
  const minSpan = getMinCircularViewSpan(length);
  state.viewSpan = Math.max(minSpan, Math.min(length, state.viewSpan));
  if (state.viewSpan >= length * 0.999 && !state.userRotated && !preserveOrientation) {
    state.viewCenter = length / 2;
  }
}

function shortestCoordinateDelta(target, current, length) {
  if (!Number.isFinite(length) || length <= 0) return target - current;
  return ((((target - current) % length) + length * 1.5) % length) - length / 2;
}

function wheelGestureAnchor(state, rawAnchor, recordLength, clientX, clientY) {
  const anchorClientX = Number(state.wheelAnchorClientX);
  const anchorClientY = Number(state.wheelAnchorClientY);
  const moved = Number.isFinite(anchorClientX) && Number.isFinite(anchorClientY)
    ? Math.hypot(clientX - anchorClientX, clientY - anchorClientY)
    : Infinity;
  if (!Number.isFinite(state.wheelAnchorBp) || moved > 24) {
    state.wheelAnchorBp = normalizeBp(rawAnchor, recordLength);
    state.wheelAnchorClientX = clientX;
    state.wheelAnchorClientY = clientY;
  }
  return state.wheelAnchorBp;
}

function getInnermostSequenceRadius(baseRadius, state) {
  const dnaPlusRadius = state.showForwardTranslations ? baseRadius - 76 : baseRadius - 28;
  let innerRadius = dnaPlusRadius;
  if (state.showSecondStrand) innerRadius = Math.min(innerRadius, dnaPlusRadius - 26);
  if (state.showReverseTranslations) {
    const reverseStart = state.showSecondStrand ? dnaPlusRadius - 58 : dnaPlusRadius - 34;
    innerRadius = Math.min(innerRadius, reverseStart - 52);
  }
  return Math.max(40, innerRadius);
}

export function canRevealCircularSequenceDetail(detailPxPerBp, state, recordLength) {
  const length = Math.max(1, Number(recordLength) || 1);
  const span = Math.max(1, Math.min(length, Number(state?.viewSpan) || length));
  return span < length * 0.999 && detailPxPerBp >= 5.8;
}

function getCircularZoomGapAngle(state, length) {
  if (state?.suppressZoomGap === true) return 0;
  const safeLength = Math.max(1, Number(length) || 1);
  const span = Math.max(1, Math.min(safeLength, Number(state?.viewSpan) || safeLength));
  if (span >= safeLength * 0.999) return 0;
  const zoomRatio = safeLength / span;
  const linearWindowBlend = Math.max(0, Math.min(1, (zoomRatio - 1.12) / 0.75));
  return MIN_CIRCULAR_WINDOW_GAP_ANGLE +
    (LINEARIZED_CIRCULAR_WINDOW_GAP_ANGLE - MIN_CIRCULAR_WINDOW_GAP_ANGLE) * linearWindowBlend;
}

export function getArcConfig(state, length) {
  const gapAngle = getCircularZoomGapAngle(state, length);
  return {
    startAngle: state.gapCenterAngle,
    arcAngle: TWO_PI - gapAngle,
    gapAngle
  };
}

function clampUnitFraction(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

export function computeCircularZoomState(state, recordLength, pointerAngleValue, factor, options = {}) {
  const length = Math.max(1, Number(recordLength) || 1);
  const oldSpan = Math.max(1, Number(state.viewSpan) || length);
  const oldCenter = Number.isFinite(Number(state.viewCenter)) ? Number(state.viewCenter) : length / 2;
  const gapCenterAngle = Number.isFinite(Number(state.gapCenterAngle)) ? Number(state.gapCenterAngle) : -Math.PI / 2;
  const preserveOrientation = Boolean(options.preserveOrientation || options.lockOrientation);
  const zoomFactor = Number(factor);
  const minSpan = Math.max(1, Number(options.minSpan) || getMinCircularViewSpan(length));
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    return {
      viewCenter: oldCenter,
      viewSpan: oldSpan,
      gapCenterAngle,
      changed: false
    };
  }
  if (oldSpan <= minSpan && zoomFactor > 1) {
    return {
      viewCenter: oldCenter,
      viewSpan: oldSpan,
      gapCenterAngle,
      changed: false
    };
  }
  const pointerAngle = Number.isFinite(Number(pointerAngleValue)) ? Number(pointerAngleValue) : -Math.PI / 2;
  const oldArc = options.oldArc || getArcConfig({ viewSpan: oldSpan, gapCenterAngle }, length);
  const oldStart = oldCenter - oldSpan / 2;
  const oldFraction = angleToFractionOnArc(pointerAngle, oldArc);
  const rawAnchorBp = oldStart + oldFraction * oldSpan;
  const anchorBp = Number.isFinite(Number(options.anchorBp)) ? Number(options.anchorBp) : rawAnchorBp;
  const requestedAnchorFraction = preserveOrientation ? null : clampUnitFraction(options.anchorFraction);
  const anchorAngle = Number.isFinite(Number(options.anchorAngle)) ? Number(options.anchorAngle) : pointerAngle;
  const nextSpan = Math.max(minSpan, Math.min(length, oldSpan / zoomFactor));
  if (Math.abs(nextSpan - oldSpan) < 1e-9) {
    return {
      viewCenter: oldCenter,
      viewSpan: oldSpan,
      gapCenterAngle,
      anchorBp,
      changed: false
    };
  }
  const seamZoomFraction = oldSpan >= length * 0.999 &&
    Math.abs(signedAngleDiff(pointerAngle, oldArc.startAngle)) < 1e-7
    ? 0.5
    : oldFraction;
  const nextFraction = requestedAnchorFraction ?? seamZoomFraction;
  const nextStart = anchorBp - nextFraction * nextSpan;
  const nextArc = options.nextArc || getArcConfig({ viewSpan: nextSpan, gapCenterAngle }, length);
  const nextGapCenterAngle = anchorAngle - nextFraction * nextArc.arcAngle;
  return {
    viewCenter: nextStart + nextSpan / 2,
    viewSpan: nextSpan,
    gapCenterAngle: nextGapCenterAngle,
    anchorBp,
    changed: true
  };
}

export function applyCircularZoomState(state, recordLength, zoomState, options = {}) {
  const length = Math.max(1, Number(recordLength) || 1);
  const preserveOrientation = Boolean(options.preserveOrientation);
  const stateViewCenter = Number(state?.viewCenter);
  const stateViewSpan = Number(state?.viewSpan);
  const stateGapCenterAngle = Number(state?.gapCenterAngle);
  const next = {
    ...state,
    viewCenter: Number.isFinite(Number(zoomState?.viewCenter))
      ? Number(zoomState.viewCenter)
      : Number.isFinite(stateViewCenter) ? stateViewCenter : length / 2,
    viewSpan: Number.isFinite(Number(zoomState?.viewSpan))
      ? Number(zoomState.viewSpan)
      : Number.isFinite(stateViewSpan) ? stateViewSpan : length,
    gapCenterAngle: Number.isFinite(Number(zoomState?.gapCenterAngle))
      ? Number(zoomState.gapCenterAngle)
      : Number.isFinite(stateGapCenterAngle) ? stateGapCenterAngle : -Math.PI / 2
  };
  clampSpan(next, length, { preserveOrientation });
  if (next.viewSpan >= length * 0.999 && !next.userRotated && !preserveOrientation) {
    next.viewCenter = length / 2;
    next.gapCenterAngle = -Math.PI / 2;
  }
  return next;
}

function angleToFractionOnArc(angle, arc) {
  let rel = signedAngleDiff(angle, arc.startAngle);
  if (rel < 0) rel += TWO_PI;
  if (rel > arc.arcAngle) {
    const distToStart = Math.abs(signedAngleDiff(angle, arc.startAngle));
    const distToEnd = Math.abs(signedAngleDiff(angle, arc.startAngle + arc.arcAngle));
    return distToStart < distToEnd ? 0 : 1;
  }
  return rel / arc.arcAngle;
}

function relToAngle(rel, state, arc) {
  return arc.startAngle + (rel / state.viewSpan) * arc.arcAngle;
}

function absToAngle(absBp, state, arc) {
  return relToAngle(absBp - getViewStart(state), state, arc);
}

export function getVisibleCircularBaseGlyphs(sequence, state, length, strand = "+") {
  const source = String(sequence ?? "");
  const safeLength = Math.max(1, Number(length) || source.length || 1);
  const viewStart = getViewStart(state);
  const first = Math.floor(viewStart);
  const last = Math.ceil(getViewEnd(state));
  const glyphs = [];
  for (let absBp = first; absBp <= last; absBp += 1) {
    const rel = absBp + 0.5 - viewStart;
    if (rel < 0 || rel >= state.viewSpan) continue;
    const position = normalizeBp(absBp, safeLength) + 1;
    const raw = source[normalizeBp(absBp, safeLength)] || "N";
    const base = strand === "+" ? raw : complementBase(raw);
    glyphs.push({ absBp, rel, position, base, strand });
  }
  return glyphs;
}

export function getVisibleCircularBaseRange(sequence, state, length) {
  const glyphs = getVisibleCircularBaseGlyphs(sequence, state, length, "+");
  if (glyphs.length === 0) return null;
  return {
    start: glyphs[0].position,
    end: glyphs[glyphs.length - 1].position,
    count: glyphs.length
  };
}

function pointerAngle(event, rect, cx, cy) {
  return Math.atan2(event.clientY - rect.top - cy, event.clientX - rect.left - cx);
}

function zoomAnchorAngle(event, rect, cx, cy, radius) {
  const dx = event.clientX - rect.left - cx;
  const dy = event.clientY - rect.top - cy;
  const distance = Math.hypot(dx, dy);
  const centerDeadZone = Math.max(
    70,
    Math.min(radius * 0.45, Math.min(rect.width, rect.height) * 0.22)
  );
  if (!Number.isFinite(distance) || distance <= centerDeadZone) {
    return -Math.PI / 2;
  }
  return Math.atan2(dy, dx);
}

function getVisiblePointCopies(position, state, length) {
  const viewStart = getViewStart(state);
  const viewEnd = getViewEnd(state);
  const copies = [];
  const boundaryPosition = Number(position);
  if (!Number.isFinite(boundaryPosition)) return copies;
  const kMin = Math.floor((viewStart - boundaryPosition) / length) - 1;
  const kMax = Math.ceil((viewEnd - boundaryPosition) / length) + 1;
  for (let copy = kMin; copy <= kMax; copy += 1) {
    const point = boundaryPosition + copy * length;
    if (point >= viewStart && point <= viewEnd) copies.push(point);
  }
  return copies;
}

function restrictionSiteCutPosition(site) {
  const position = Number(site?.cutPosition ?? site?.cutAfter ?? site?.position ?? site?.start);
  return Number.isFinite(position) ? position : null;
}

function viewerTargetMatches(state, target) {
  return state.selectedTarget?.key && state.selectedTarget.key === makeTargetKey(target);
}

function isQuantitativeTrack(track) {
  return track?.type === "quantitative";
}

export function sortCircularTrackLayoutsForDrawing(layouts = []) {
  return [...layouts].sort((left, right) => Number(right.quantitative) - Number(left.quantitative));
}

export function shouldUseCircularTrackSummary(track, state, pxPerBp) {
  if (isQuantitativeTrack(track)) return false;
  if (hasHiddenViewerItemTypes(track, state)) return false;
  if (!track.summary?.bins?.length) return false;
  const mode = getViewerTrackDisplayMode(track, state);
  if (mode === "collapsed") return true;
  if (mode === "full" || mode === "squished") return false;
  const itemCount = track.summary?.itemCount ?? track.items?.length ?? 0;
  return itemCount > DENSITY_ITEM_THRESHOLD || pxPerBp < DENSITY_PX_PER_UNIT_THRESHOLD;
}

function shouldUseTrackSummary(track, state, pxPerBp) {
  return shouldUseCircularTrackSummary(track, state, pxPerBp);
}

function getVisibleSummaryBinCopies(bin, state, length) {
  const viewStart = getViewStart(state);
  const viewEnd = getViewEnd(state);
  const copies = [];
  const start = Number(bin.start);
  const end = Number(bin.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return copies;
  const kMin = Math.floor((viewStart - end) / length) - 1;
  const kMax = Math.ceil((viewEnd - start) / length) + 1;
  for (let copy = kMin; copy <= kMax; copy += 1) {
    const copiedStart = start + copy * length;
    const copiedEnd = end + copy * length;
    const clippedStart = Math.max(copiedStart, viewStart);
    const clippedEnd = Math.min(copiedEnd, viewEnd);
    if (clippedEnd > clippedStart) copies.push({ start: clippedStart, end: clippedEnd });
  }
  return copies;
}

function getVisibleIntervalCopies(item, state, length) {
  const rawParts = Array.isArray(item.parts) && item.parts.length > 0
    ? item.parts
    : [{ start: item.start, end: item.end }];
  const viewStart = getViewStart(state);
  const viewEnd = getViewEnd(state);
  const copies = [];
  for (const part of rawParts) {
    const start = Number(part.start) - 1;
    const end = Number(part.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const intervals = start <= end
      ? [{ start, end }]
      : [{ start, end: length }, { start: 0, end }];
    for (const interval of intervals) {
      const kMin = Math.floor((viewStart - interval.end) / length) - 1;
      const kMax = Math.ceil((viewEnd - interval.start) / length) + 1;
      for (let copy = kMin; copy <= kMax; copy += 1) {
        const copiedStart = interval.start + copy * length;
        const copiedEnd = interval.end + copy * length;
        const clippedStart = Math.max(copiedStart, viewStart);
        const clippedEnd = Math.min(copiedEnd, viewEnd);
        if (clippedEnd > clippedStart) copies.push({
          start: clippedStart,
          end: clippedEnd,
          sourceStart: interval.start,
          sourceEnd: interval.end
        });
      }
    }
  }
  return copies;
}

function drawArc(ctx, cx, cy, radius, startAngle, endAngle, stroke, lineWidth) {
  if (!Number.isFinite(radius) || radius <= 0) return;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();
}

function drawAnnularArc(ctx, cx, cy, outerRadius, innerRadius, startAngle, endAngle, fill, stroke, lineWidth = 1) {
  if (Math.abs(endAngle - startAngle) < 0.0005) return;
  if (
    !Number.isFinite(outerRadius) ||
    !Number.isFinite(innerRadius) ||
    outerRadius <= 0 ||
    innerRadius <= 0 ||
    outerRadius <= innerRadius
  ) {
    return;
  }
  const p1 = pointOnCircle(cx, cy, outerRadius, startAngle);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
  const p2 = pointOnCircle(cx, cy, innerRadius, endAngle);
  ctx.lineTo(p2.x, p2.y);
  ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.fill();
  ctx.stroke();
}

function strokeAnnularArc(ctx, cx, cy, outerRadius, innerRadius, startAngle, endAngle, stroke, lineWidth = 1) {
  if (Math.abs(endAngle - startAngle) < 0.0005) return;
  if (
    !Number.isFinite(outerRadius) ||
    !Number.isFinite(innerRadius) ||
    outerRadius <= 0 ||
    innerRadius <= 0 ||
    outerRadius <= innerRadius
  ) {
    return;
  }
  const p1 = pointOnCircle(cx, cy, outerRadius, startAngle);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
  const p2 = pointOnCircle(cx, cy, innerRadius, endAngle);
  ctx.lineTo(p2.x, p2.y);
  ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
  ctx.closePath();
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawCircularSearchMarkers(ctx, cx, cy, innerRadius, outerRadius, state, record, arc, theme) {
  const results = state.searchResults || [];
  if (results.length === 0) return;
  for (const result of results) {
    const active = state.activeSearchTarget?.key === result.key;
    for (const interval of getVisibleIntervalCopies(result, state, record.length)) {
      const startAngle = absToAngle(interval.start, state, arc);
      const endAngle = absToAngle(interval.end, state, arc);
      drawAnnularArc(
        ctx,
        cx,
        cy,
        outerRadius,
        innerRadius,
        startAngle,
        endAngle,
        active ? theme.searchActiveFill : theme.searchFill,
        active ? theme.searchActiveStroke : theme.searchStroke
      );
    }
  }
}

function drawTangentialText(ctx, text, cx, cy, radius, angle, options = {}) {
  const point = pointOnCircle(cx, cy, radius, angle);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.font = options.font || "11px system-ui, sans-serif";
  ctx.fillStyle = options.fill || "#172026";
  ctx.textBaseline = "middle";
  if (options.align === "center") {
    if (isUpsideDown(angle)) ctx.rotate(Math.PI);
    ctx.textAlign = "center";
    if (options.halo) {
      ctx.lineWidth = options.haloWidth ?? 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = options.halo;
      ctx.strokeText(text, 0, 0);
    }
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return;
  }
  if (isUpsideDown(angle)) {
    ctx.rotate(Math.PI);
    ctx.textAlign = "right";
    const x = -(options.offset ?? 4);
    if (options.halo) {
      ctx.lineWidth = options.haloWidth ?? 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = options.halo;
      ctx.strokeText(text, x, 0);
    }
    ctx.fillText(text, x, 0);
  } else {
    ctx.textAlign = "left";
    const x = options.offset ?? 4;
    if (options.halo) {
      ctx.lineWidth = options.haloWidth ?? 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = options.halo;
      ctx.strokeText(text, x, 0);
    }
    ctx.fillText(text, x, 0);
  }
  ctx.restore();
}

function drawCurvedText(ctx, text, cx, cy, radius, centerAngle, availableAngle, options = {}) {
  const label = String(text || "");
  if (!label) return false;
  ctx.save();
  ctx.font = options.font || "11px system-ui, sans-serif";
  ctx.fillStyle = options.fill || "#172026";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const characters = Array.from(label);
  const widths = characters.map((character) => Math.max(1, ctx.measureText(character).width));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const paddingAngle = (options.paddingPx ?? 8) / Math.max(1, radius);
  const neededAngle = totalWidth / Math.max(1, radius);
  if (neededAngle + paddingAngle > Math.abs(availableAngle)) {
    ctx.restore();
    return false;
  }

  const flipped = isUpsideDown(centerAngle);
  const direction = flipped ? -1 : 1;
  let cursor = -totalWidth / 2;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const width = widths[index];
    const offsetAngle = ((cursor + width / 2) / radius) * direction;
    const angle = centerAngle + offsetAngle;
    const point = pointOnCircle(cx, cy, radius, angle);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle + Math.PI / 2 + (flipped ? Math.PI : 0));
    if (options.halo) {
      ctx.lineWidth = options.haloWidth ?? 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = options.halo;
      ctx.strokeText(character, 0, 0);
    }
    ctx.fillText(character, 0, 0);
    ctx.restore();
    cursor += width;
  }
  ctx.restore();
  return true;
}

function fitCanvasLabelToWidth(ctx, label, maxWidth) {
  const text = String(label || "").trim();
  const width = Math.max(12, Number(maxWidth) || 12);
  if (!text || !ctx || typeof ctx.measureText !== "function") return { label: text, width: 0 };
  const measuredWidth = ctx.measureText(text).width;
  if (measuredWidth <= width) return { label: text, width: measuredWidth };
  const suffix = "...";
  const suffixWidth = ctx.measureText(suffix).width;
  let output = text;
  while (output.length > 1 && ctx.measureText(output).width + suffixWidth > width) {
    output = output.slice(0, -1);
  }
  const fitted = `${output.trimEnd()}${suffix}`;
  return { label: fitted, width: ctx.measureText(fitted).width };
}

export function chooseVisibleArcLabelAngle(cx, cy, radius, startAngle, endAngle, width, height, options = {}) {
  const fallback = (startAngle + endAngle) / 2;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  const span = Math.abs(endAngle - startAngle);
  if (!Number.isFinite(span) || span <= 0) return fallback;
  const margin = Math.max(32, Math.min(width, height) * 0.05);
  const halfWidth = Math.max(6, (Number(options.labelWidth) || 0) / 2);
  const halfHeight = Math.max(6, (Number(options.fontSize) || 10) / 2);
  const centerX = width / 2;
  const centerY = height / 2;
  const angleAtFraction = (fraction) => startAngle + (endAngle - startAngle) * fraction;
  const pointFits = (angle) => {
    const point = pointOnCircle(cx, cy, radius, angle);
    return point.x >= margin + halfWidth &&
      point.x <= width - margin - halfWidth &&
      point.y >= margin + halfHeight &&
      point.y <= height - margin - halfHeight;
  };
  const fitAtFraction = (fraction) => pointFits(angleAtFraction(fraction));
  const sampleCount = Math.max(24, Math.min(192, Math.ceil(span / (Math.PI / 96))));
  const refineBoundary = (lowFraction, highFraction, lowFits) => {
    let low = lowFraction;
    let high = highFraction;
    for (let index = 0; index < 16; index += 1) {
      const mid = (low + high) / 2;
      if (fitAtFraction(mid) === lowFits) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return (low + high) / 2;
  };
  let bestRun = null;
  let index = 0;
  while (index <= sampleCount) {
    if (!fitAtFraction(index / sampleCount)) {
      index += 1;
      continue;
    }
    const runStartIndex = index;
    while (index + 1 <= sampleCount && fitAtFraction((index + 1) / sampleCount)) {
      index += 1;
    }
    const runEndIndex = index;
    const startFraction = runStartIndex === 0
      ? 0
      : refineBoundary((runStartIndex - 1) / sampleCount, runStartIndex / sampleCount, false);
    const endFraction = runEndIndex === sampleCount
      ? 1
      : refineBoundary(runEndIndex / sampleCount, (runEndIndex + 1) / sampleCount, true);
    const run = {
      startFraction,
      endFraction,
      length: Math.max(0, endFraction - startFraction),
      centerFraction: (startFraction + endFraction) / 2
    };
    if (
      !bestRun ||
      run.length > bestRun.length + 1e-6 ||
      (Math.abs(run.length - bestRun.length) <= 1e-6 &&
        Math.abs(run.centerFraction - 0.5) < Math.abs(bestRun.centerFraction - 0.5))
    ) {
      bestRun = run;
    }
    index += 1;
  }
  if (bestRun && bestRun.length > 0) {
    return angleAtFraction(bestRun.centerFraction);
  }
  let bestAngle = fallback;
  let bestScore = Infinity;
  for (let index = 0; index <= sampleCount; index += 1) {
    const fraction = index / sampleCount;
    const angle = angleAtFraction(fraction);
    const point = pointOnCircle(cx, cy, radius, angle);
    const outsideX = Math.max(margin - point.x, 0, point.x - (width - margin));
    const outsideY = Math.max(margin - point.y, 0, point.y - (height - margin));
    const outsidePenalty = (outsideX + outsideY) * 1200;
    const centerPenalty = Math.hypot(point.x - centerX, point.y - centerY);
    const edgePenalty = Math.abs(fraction - 0.5) * 40;
    const score = outsidePenalty + centerPenalty + edgePenalty;
    if (score < bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

function clampAngleToArcInterior(angle, startAngle, endAngle, insetAngle) {
  const low = Math.min(startAngle, endAngle) + insetAngle;
  const high = Math.max(startAngle, endAngle) - insetAngle;
  if (low > high) return (startAngle + endAngle) / 2;
  return Math.min(high, Math.max(low, angle));
}

function angleWithinArcInterior(angle, startAngle, endAngle, insetAngle = 0) {
  if (!Number.isFinite(angle)) return false;
  const low = Math.min(startAngle, endAngle) + insetAngle;
  const high = Math.max(startAngle, endAngle) - insetAngle;
  return low <= high && angle >= low && angle <= high;
}

function circularLabelPointFitsCanvas(cx, cy, radius, angle, width, height, labelWidth = 0, fontSize = 10) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return true;
  const point = pointOnCircle(cx, cy, radius, angle);
  const halfWidth = Math.max(6, (Number(labelWidth) || 0) / 2);
  const halfHeight = Math.max(6, (Number(fontSize) || 10) / 2);
  const margin = 10;
  return point.x >= margin + halfWidth &&
    point.x <= width - margin - halfWidth &&
    point.y >= margin + halfHeight &&
    point.y <= height - margin - halfHeight;
}

export function shouldUseCircularFeatureLabelFallback(trackType, hasSlotLayout, pixelsPerBp, labelArcWidth) {
  const px = Number(pixelsPerBp);
  const width = Number(labelArcWidth);
  return !hasSlotLayout &&
    trackType !== "digest-fragments" &&
    Number.isFinite(px) &&
    px >= 1.4 &&
    Number.isFinite(width) &&
    width >= 8;
}

export function shouldUseStraightCircularFeatureLabel(trackType, hasSlotLayout, pixelsPerBp, viewSpan, recordLength) {
  const px = Number(pixelsPerBp);
  const span = Number(viewSpan);
  const length = Number(recordLength);
  return Boolean(hasSlotLayout) &&
    trackType !== "digest-fragments" &&
    Number.isFinite(px) &&
    px >= 1.4 &&
    Number.isFinite(span) &&
    Number.isFinite(length) &&
    length > 0 &&
    span < length * 0.75;
}

export function chooseCircularArcLabelPlacement(
  cx,
  cy,
  radius,
  startAngle,
  endAngle,
  width,
  height,
  labelWidth = 0,
  paddingPx = 8,
  options = {}
) {
  const fallbackAngle = (startAngle + endAngle) / 2;
  const safeRadius = Math.max(1, Number(radius) || 1);
  const span = Math.abs(endAngle - startAngle);
  const requiredAngle = (Math.max(0, Number(labelWidth) || 0) + Math.max(0, Number(paddingPx) || 0)) / safeRadius;
  if (!Number.isFinite(span) || span <= 0 || requiredAngle > span) {
    return {
      angle: fallbackAngle,
      availableAngle: endAngle - startAngle,
      requiredAngle,
      fits: false
    };
  }
  const placementMode = options.placementMode || "stable-center";
  const explicitPreferredAngle = Number(options.preferredAngle);
  const preferredAngle = Number.isFinite(explicitPreferredAngle)
    ? explicitPreferredAngle
    : (placementMode === "visible-biased"
        ? chooseVisibleArcLabelAngle(cx, cy, radius, startAngle, endAngle, width, height, {
            labelWidth,
            fontSize: options.fontSize
          })
        : fallbackAngle);
  const angle = clampAngleToArcInterior(preferredAngle, startAngle, endAngle, requiredAngle / 2);
  const low = Math.min(startAngle, endAngle);
  const high = Math.max(startAngle, endAngle);
  const localAvailableAngle = 2 * Math.min(Math.abs(angle - low), Math.abs(high - angle));
  if (!Number.isFinite(localAvailableAngle) || requiredAngle > localAvailableAngle + 1e-9) {
    return {
      angle,
      availableAngle: Math.sign(endAngle - startAngle || 1) * Math.max(0, localAvailableAngle),
      requiredAngle,
      fits: false
    };
  }
  return {
    angle,
    availableAngle: Math.sign(endAngle - startAngle || 1) * localAvailableAngle,
    requiredAngle,
    fits: true
  };
}

function copiedIntervalMidpoint(copy, length) {
  const sourceStart = Number(copy.sourceStart);
  const sourceEnd = Number(copy.sourceEnd);
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) {
    return null;
  }
  const copyOffset = Math.floor((Number(copy.start) - sourceStart) / Math.max(1, length));
  return (sourceStart + sourceEnd) / 2 + copyOffset * length;
}

function getCircularLabelBounds(cx, cy, radius, angle, labelWidth, fontSize, paddingPx = 4) {
  const point = pointOnCircle(cx, cy, radius, angle);
  const safePadding = Math.max(0, Number(paddingPx) || 0);
  const width = Math.max(1, Number(labelWidth) || 1) + safePadding * 2;
  const height = Math.max(8, Number(fontSize) || 10) + safePadding * 2;
  return {
    x: point.x - width / 2,
    y: point.y - height / 2,
    width,
    height
  };
}

function labelBoundsOverlap(left, right, padding = 2) {
  return !(
    left.x + left.width + padding < right.x ||
    right.x + right.width + padding < left.x ||
    left.y + left.height + padding < right.y ||
    right.y + right.height + padding < left.y
  );
}

export function circularLabelCollisionOverlap(left, right, padding = 2) {
  const leftRadius = Number(left.radius);
  const rightRadius = Number(right.radius);
  const leftFontSize = Number(left.fontSize) || 10;
  const rightFontSize = Number(right.fontSize) || 10;
  const ringBandTolerance = Math.max(6, Math.min(leftFontSize, rightFontSize) * 0.65);
  const sameRingBand = !Number.isFinite(leftRadius) ||
    !Number.isFinite(rightRadius) ||
    Math.abs(leftRadius - rightRadius) <= ringBandTolerance;
  return sameRingBand && labelBoundsOverlap(left, right, padding);
}

function drawRadialLabel(ctx, text, cx, cy, radius, angle) {
  const point = pointOnCircle(cx, cy, radius, angle);
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = getViewerCanvasTheme(ctx.canvas).muted;
  ctx.textAlign = point.x < cx ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, point.x, point.y);
}

export function getVisibleRulerTicks(step, length, state, includeFirstBase = true) {
  const viewStart = getViewStart(state);
  const viewEnd = getViewEnd(state);
  const ticks = [];
  const copyStart = Math.floor((viewStart - length) / length);
  const copyEnd = Math.ceil((viewEnd + length) / length);
  for (let copy = copyStart; copy <= copyEnd; copy += 1) {
    const offset = copy * length;
    if (includeFirstBase) {
      const absoluteBp = offset + 0.5;
      if (absoluteBp >= viewStart && absoluteBp <= viewEnd) {
        ticks.push({ absoluteBp, label: 1 });
      }
    }
    const firstTick = Math.max(step, Math.ceil((viewStart + 0.5 - offset) / step) * step);
    for (let tickValue = firstTick; tickValue <= length && offset + tickValue - 0.5 <= viewEnd; tickValue += step) {
      if (includeFirstBase && tickValue === 1) continue;
      const absoluteBp = offset + tickValue - 0.5;
      if (absoluteBp >= viewStart && absoluteBp <= viewEnd) {
        ticks.push({ absoluteBp, label: tickValue });
      }
    }
  }
  return ticks.sort((left, right) => left.absoluteBp - right.absoluteBp);
}

function drawTicks(ctx, cx, cy, radius, state, record, arc, pxPerBp, options = {}) {
  const theme = options.theme || getViewerCanvasTheme(ctx.canvas);
  const tickDirection = options.tickDirection === "inward" ? -1 : 1;
  const labelOffset = options.labelOffset ?? 28;
  const showLabels = options.showLabels !== false;
  const labelStyle = options.labelStyle || "horizontal";
  const tickScale = options.tickScale ?? 1;
  const step = circularMajorTickStep(state, record, pxPerBp);
  const minorStep = minorTickStep(step);
  if (minorStep && minorStep * pxPerBp >= 14 && state.viewSpan / minorStep <= 180) {
    for (const tick of getVisibleRulerTicks(minorStep, record.length, state, false)) {
      if (tick.label % step === 0) continue;
      const angle = absToAngle(tick.absoluteBp, state, arc);
      const inner = pointOnCircle(cx, cy, radius - 5 * tickScale * tickDirection, angle);
      const outer = pointOnCircle(cx, cy, radius + 5 * tickScale * tickDirection, angle);
      ctx.strokeStyle = theme.borderStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
    }
  }

  for (const tick of getVisibleRulerTicks(step, record.length, state, true)) {
    const angle = absToAngle(tick.absoluteBp, state, arc);
    const inner = pointOnCircle(cx, cy, radius - 8 * tickScale * tickDirection, angle);
    const outer = pointOnCircle(cx, cy, radius + 8 * tickScale * tickDirection, angle);
    ctx.strokeStyle = theme.tick;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.stroke();
    if (showLabels) {
      const labelPoint = pointOnCircle(cx, cy, radius + labelOffset, angle);
      const labelText = tick.label.toLocaleString();
      addCircleHit(state, { x: labelPoint.x, y: labelPoint.y, radius: 15 }, {
        kind: "coordinate",
        type: "Coordinate",
        position: tick.label
      });
      if (labelStyle === "tangential") {
        drawTangentialText(ctx, labelText, cx, cy, radius + labelOffset, angle, {
          font: "11px system-ui, sans-serif",
          fill: theme.text,
          align: "center"
        });
      } else {
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = theme.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, labelPoint.x, labelPoint.y);
      }
    }
  }
}

function drawPointTrack(ctx, track, cx, cy, radius, state, record, arc, pxPerBp, options = {}) {
  const theme = options.theme || getViewerCanvasTheme(ctx.canvas);
  const color = getViewerTrackColor(theme, track);
  if (shouldUseTrackSummary(track, state, pxPerBp)) {
    drawCircularSummaryTrack(ctx, track, cx, cy, radius + 10, radius - 10, state, record, arc, color, theme);
    return;
  }
  const items = getViewerTrackItems(track, state);
  const ringHalfWidth = options.ringHalfWidth ?? RESTRICTION_SITE_RING_HALF_WIDTH;
  const markerHalfAngle = Math.max(0.003, (options.markerArcPx ?? RESTRICTION_SITE_MARKER_ARC_PX) / Math.max(1, radius) / 2);
  for (const item of items) {
    const itemIndex = items.indexOf(item);
    const cutPosition = restrictionSiteCutPosition(item);
    if (cutPosition === null) continue;
    for (const point of getVisiblePointCopies(cutPosition, state, record.length)) {
      const angle = absToAngle(point, state, arc);
      const middle = pointOnCircle(cx, cy, radius, angle);
      const target = {
        kind: "restriction-site",
        type: "Restriction site",
        trackId: track.id || track.type,
        itemIndex,
        position: cutPosition,
        cutPosition,
        cutAfter: item.cutAfter ?? item.cutPosition ?? cutPosition,
        start: cutPosition,
        end: cutPosition,
        siteStart: item.siteStart,
        siteEnd: item.siteEnd,
        label: item.label,
        enzyme: item.enzyme,
        recognition: item.recognition,
        strand: item.strand
      };
      const selected = viewerTargetMatches(state, target);
      addCircleHit(state, { x: middle.x, y: middle.y, radius: Math.max(12, ringHalfWidth + 7) }, target);
      drawAnnularArc(
        ctx,
        cx,
        cy,
        radius + ringHalfWidth,
        radius - ringHalfWidth,
        angle - markerHalfAngle,
        angle + markerHalfAngle,
        selected ? theme.selectedFill : theme.restrictionFill,
        selected ? theme.selectedStroke : color,
        selected ? 2.4 : 1.2
      );
    }
  }
}

function drawCircularSummaryTrack(ctx, track, cx, cy, outerRadius, innerRadius, state, record, arc, color, theme = getViewerCanvasTheme(ctx.canvas)) {
  const summary = track.summary;
  if (!summary?.bins?.length) return false;
  const maxValue = Math.max(1, summary.mode === "intervals" ? summary.maxBases || summary.maxCount : summary.maxCount);
  let drew = false;
  for (const bin of summary.bins) {
    const value = summary.mode === "intervals" ? (bin.bases || bin.count) : bin.count;
    if (!value) continue;
    for (const copy of getVisibleSummaryBinCopies(bin, state, record.length)) {
      const startAngle = absToAngle(copy.start, state, arc);
      const endAngle = absToAngle(copy.end, state, arc);
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.14 + 0.56 * Math.sqrt(value / maxValue);
      drawAnnularArc(ctx, cx, cy, outerRadius, innerRadius, startAngle, endAngle, color, color);
      ctx.globalAlpha = previousAlpha;
      drew = true;
    }
  }
  if (drew) {
    drawTangentialText(ctx, "summary", cx, cy, outerRadius + 12, arc.startAngle + arc.arcAngle * 0.08, {
      font: "10px system-ui, sans-serif",
      fill: theme.muted,
      align: "center"
    });
  }
  return drew;
}

function getCircularIntervalCopies(track, state, record) {
  return getViewerTrackItems(track, state).flatMap((item, itemIndex) =>
    getVisibleIntervalCopies(item, state, record.length).map((interval) => ({
      item,
      itemIndex,
      start: interval.start,
      end: interval.end,
      sourceStart: interval.sourceStart,
      sourceEnd: interval.sourceEnd
    }))
  );
}

function layoutCircularFeatureTrack(track, state, record, pxPerBp) {
  const cachedLayout = getCachedCircularSlotLayout(track, state, record);
  const visibleCopies = getCircularIntervalCopies(track, state, record);
  const placements = [];
  const hidden = [];
  for (const copy of visibleCopies) {
    const key = `${copy.itemIndex}:${copy.sourceStart}:${copy.sourceEnd}`;
    const slot = cachedLayout.slotByPart.get(key);
    if (slot === undefined) {
      hidden.push(copy);
    } else {
      placements.push({ ...copy, slot });
    }
  }
  return {
    ...cachedLayout.layout,
    placements,
    hidden,
    totalHidden: cachedLayout.layout.hidden.length
  };
}

function getCachedCircularSlotLayout(track, state, record) {
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
    cached.maxSlots === FEATURE_RING_MAX &&
    cached.itemCount === itemCount &&
    cached.slotConfigKey === slotConfigKey
  ) {
    return cached;
  }
  const layout = createStackedIntervalLayout(trackItems, {
    length: record.length,
    maxSlots: FEATURE_RING_MAX,
    fixedSlotsByType: track.fixedSlotsByType || track.slotByType,
    allowFixedSlotOverlaps: track.allowFixedSlotOverlaps === true
  });
  const slotByPart = new Map(layout.placements.map((placement) => [
    `${placement.itemIndex}:${placement.sourceStart}:${placement.sourceEnd}`,
    placement.slot
  ]));
  const next = {
    length: record.length,
    maxSlots: FEATURE_RING_MAX,
    itemCount,
    slotConfigKey,
    layout,
    slotByPart
  };
  state.trackLayoutCache.set(track, next);
  return next;
}

function circularFeatureTrackWidth(layout) {
  return Math.max(1, layout?.slotCount ?? 1) * (FEATURE_RING_WIDTH + FEATURE_RING_GAP) + 8 + ((layout?.hidden?.length ?? 0) > 0 ? 14 : 0);
}

function circularTrackLayoutWidth(entry) {
  if (entry.quantitative) return 46;
  return entry.layout ? circularFeatureTrackWidth(entry.layout) : 34;
}

export function compareCircularLabelCandidatesForDrawing(left, right) {
  return right.span - left.span || right.measuredWidth - left.measuredWidth;
}

function getCircularTrackOffsets(digestFragmentTracks, restrictionTracks, otherTrackLayouts) {
  const fragmentTrackOffset = 42;
  const restrictionTrackOffset = 64;
  const primitiveTrackOuterOffset = Math.max(
    digestFragmentTracks.length > 0 ? fragmentTrackOffset + 14 : 0,
    restrictionTracks.length > 0 ? restrictionTrackOffset + RESTRICTION_SITE_RING_HALF_WIDTH : 0
  );
  const otherTrackStartOffset = primitiveTrackOuterOffset > 0 ? primitiveTrackOuterOffset + 24 : 34;
  const otherTrackWidth = otherTrackLayouts.reduce((width, entry) =>
    width + circularTrackLayoutWidth(entry), 0);
  const otherTrackOuterOffset = otherTrackStartOffset + otherTrackWidth;
  const rulerOffset = Math.max(
    104,
    digestFragmentTracks.length > 0 ? fragmentTrackOffset + 34 : 0,
    restrictionTracks.length > 0 ? restrictionTrackOffset + 34 : 0,
    otherTrackLayouts.length > 0 ? otherTrackOuterOffset + 26 : 0
  );
  return {
    fragmentTrackOffset,
    restrictionTrackOffset,
    otherTrackStartOffset,
    otherTrackOuterOffset,
    rulerOffset
  };
}

function computeRenderedCircularLayout(width, height, state, record) {
  const layout = computeLayout(width, height, state, record);
  let { baseRadius, pxPerBp } = layout;
  let arc = getArcConfig(state, record.length);
  const tracks = getVisibleViewerTracks(record, state);
  const digestFragmentTracks = tracks.filter((track) => track.type === "digest-fragments");
  const restrictionTracks = tracks.filter((track) => track.type === "restriction-sites");
  const otherTracks = tracks.filter((track) => track.type !== "digest-fragments" && track.type !== "restriction-sites");
  const otherTrackLayouts = otherTracks.map((track) => ({
    track,
    quantitative: isQuantitativeTrack(track),
    summary: shouldUseTrackSummary(track, state, pxPerBp),
    layout: !isQuantitativeTrack(track) && isStackedIntervalTrack(track) && !shouldUseTrackSummary(track, state, pxPerBp)
      ? layoutCircularFeatureTrack(track, state, record, pxPerBp)
      : null
  }));
  const orderedTrackLayouts = sortCircularTrackLayoutsForDrawing(otherTrackLayouts);
  const offsets = getCircularTrackOffsets(digestFragmentTracks, restrictionTracks, orderedTrackLayouts);
  if (getCenterWeight(state, record) <= 0.05) {
    const availableOuterRadius = Math.max(150, Math.min(width, height) / 2 - 42);
    baseRadius = Math.max(76, Math.min(baseRadius, availableOuterRadius - offsets.rulerOffset));
    pxPerBp = ((TWO_PI - arc.gapAngle) * baseRadius) / state.viewSpan;
  }
  const detailRadius = getInnermostSequenceRadius(baseRadius, state);
  const detailPxPerBp = ((TWO_PI - arc.gapAngle) * detailRadius) / state.viewSpan;
  const revealDetail = canRevealCircularSequenceDetail(detailPxPerBp, state, record.length);
  if (!revealDetail && arc.gapAngle > 0) {
    arc = getArcConfig({ ...state, suppressZoomGap: true }, record.length);
    pxPerBp = ((TWO_PI - arc.gapAngle) * baseRadius) / state.viewSpan;
  }
  return {
    ...layout,
    baseRadius,
    pxPerBp,
    arc,
    revealDetail,
    offsets,
    digestFragmentTracks,
    restrictionTracks,
    otherTrackLayouts: orderedTrackLayouts
  };
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

function drawCircularQuantitativeTrack(ctx, track, cx, cy, outerRadius, innerRadius, state, record, arc, theme) {
  const { min, max, baseline } = quantitativeDomain(track);
  const toRadius = (value) => innerRadius + ((value - min) / (max - min)) * (outerRadius - innerRadius);
  const baselineRadius = toRadius(baseline);
  const positiveColor = track.positiveColor || track.color || getViewerTrackColor(theme, track);
  const negativeColor = track.negativeColor || (theme.dark ? "#f59e0b" : "#b45309");
  drawArc(ctx, cx, cy, baselineRadius, arc.startAngle, arc.startAngle + arc.arcAngle, theme.tick, 1);
  drawArc(ctx, cx, cy, innerRadius, arc.startAngle, arc.startAngle + arc.arcAngle, theme.grid, 1);
  drawArc(ctx, cx, cy, outerRadius, arc.startAngle, arc.startAngle + arc.arcAngle, theme.grid, 1);

  for (const item of track.items ?? []) {
    const value = Number(item.value);
    if (!Number.isFinite(value)) continue;
    for (const copy of getVisibleIntervalCopies(item, state, record.length)) {
      const startAngle = absToAngle(copy.start, state, arc);
      const endAngle = absToAngle(copy.end, state, arc);
      const valueRadius = toRadius(value);
      const arcOuter = Math.max(baselineRadius, valueRadius);
      const arcInner = Math.min(baselineRadius, valueRadius);
      const target = {
        kind: "quantitative-window",
        type: track.label || "Composition window",
        trackId: track.id || track.type,
        itemIndex: getViewerTrackItems(track, state).indexOf(item),
        start: item.start,
        end: item.end,
        value,
        label: item.label || `${track.label}: ${value}${track.unit || ""}`
      };
      addPolarHit(state, { cx, cy, innerRadius, outerRadius, startAngle, endAngle }, target);
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = viewerTargetMatches(state, target) ? 0.9 : 0.62;
      drawAnnularArc(ctx, cx, cy, arcOuter, arcInner, startAngle, endAngle, value >= baseline ? positiveColor : negativeColor, theme.halo);
      ctx.globalAlpha = previousAlpha;
    }
  }

  const labelAngle = arc.startAngle + arc.arcAngle * 0.07;
  const labelOptions = {
    font: "11px system-ui, sans-serif",
    fill: theme.text,
    align: "center",
    halo: theme.halo,
    haloWidth: 3
  };
  const drewCurvedLabel = drawCurvedText(
    ctx,
    track.label || "Plot",
    cx,
    cy,
    outerRadius + 14,
    labelAngle,
    Math.min(Math.abs(arc.arcAngle) * 0.18, 0.9),
    labelOptions
  );
  if (!drewCurvedLabel) {
    drawTangentialText(ctx, track.label || "Plot", cx, cy, outerRadius + 14, labelAngle, labelOptions);
  }
}

function drawIntervalTrack(ctx, track, cx, cy, outerRadius, innerRadius, state, record, arc, pxPerBp, slotLayout = null, theme = getViewerCanvasTheme(ctx.canvas)) {
  const color = getViewerTrackColor(theme, track);
  const fill = track.type === "digest-fragments" ? theme.digestFill : (theme.dark ? "#15375c" : "#dbeafe");
  const stroke = track.type === "digest-fragments" ? color : color;
  const labelStats = state.renderDiagnostics?.circularFeatureLabels;
  if (!slotLayout && shouldUseTrackSummary(track, state, pxPerBp)) {
    drawCircularSummaryTrack(ctx, track, cx, cy, outerRadius, innerRadius, state, record, arc, color, theme);
    return;
  }
  const placements = slotLayout?.placements ?? getCircularIntervalCopies(track, state, record).map((copy) => ({ ...copy, slot: 0 }));
  const labelCandidates = [];
  const viewStart = getViewStart(state);
  const viewEnd = getViewEnd(state);
  for (const placement of placements) {
    const item = placement.item;
    const itemIndex = placement.itemIndex;
    const slotCenterRadius = slotLayout
      ? innerRadius + FEATURE_RING_WIDTH / 2 + placement.slot * (FEATURE_RING_WIDTH + FEATURE_RING_GAP)
      : (outerRadius + innerRadius) / 2;
    const slotInnerRadius = slotLayout ? slotCenterRadius - FEATURE_RING_WIDTH / 2 : innerRadius;
    const slotOuterRadius = slotLayout ? slotCenterRadius + FEATURE_RING_WIDTH / 2 : outerRadius;
    const startAngle = absToAngle(placement.start, state, arc);
    const endAngle = absToAngle(placement.end, state, arc);
    const itemStyle = track.type === "digest-fragments" ? { fill, stroke } : getViewerFeatureTypeStyle(item, stroke);
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
      parts: item.parts
    };
    addPolarHit(state, { cx, cy, innerRadius: slotInnerRadius, outerRadius: slotOuterRadius, startAngle, endAngle }, target);
    const previousAlpha = ctx.globalAlpha;
    if (placement.fixedSlot) ctx.globalAlpha = Number(track.featureOpacity) || 0.68;
    drawAnnularArc(ctx, cx, cy, slotOuterRadius, slotInnerRadius, startAngle, endAngle, itemStyle.fill, itemStyle.stroke);
    ctx.globalAlpha = previousAlpha;
    if (viewerTargetMatches(state, target)) {
      drawAnnularArc(ctx, cx, cy, slotOuterRadius + 3, slotInnerRadius - 3, startAngle, endAngle, theme.searchActiveFill, theme.selectedStroke);
    }
    const labelText = item.label || item.name || item.type || "";
    const labelStart = Math.max(Number(placement.start), viewStart);
    const labelEnd = Math.min(Number(placement.end), viewEnd);
    if (!Number.isFinite(labelStart) || !Number.isFinite(labelEnd) || labelEnd <= labelStart) continue;
    const labelRadius = slotCenterRadius;
    const labelStartAngle = absToAngle(labelStart, state, arc);
    const labelEndAngle = absToAngle(labelEnd, state, arc);
    const labelArcWidth = Math.abs(labelEndAngle - labelStartAngle) * Math.max(1, labelRadius);
    const labelPaddingPx = slotLayout ? 12 : 10;
    const useStraightZoomLabel = shouldUseStraightCircularFeatureLabel(
      track.type,
      Boolean(slotLayout),
      pxPerBp,
      state.viewSpan,
      record.length
    );
    const labelOptionsBase = {
      minSize: 8,
      maxSize: slotLayout ? 10 : 11,
      padding: labelPaddingPx,
      minAvailableWidth: slotLayout ? 30 : 24
    };
    const labelPlan = getFeatureLabelRenderPlan(ctx, labelText, labelArcWidth, pxPerBp, labelOptionsBase);
    const measuredLabelPlan = getFeatureLabelRenderPlan(ctx, labelText, 10_000, pxPerBp, {
      ...labelOptionsBase,
      minAvailableWidth: 0
    });
    if (!measuredLabelPlan.label || measuredLabelPlan.measuredWidth <= 0) continue;
    const canvasRect = ctx.canvas?.getBoundingClientRect?.();
    const fullIntervalMidpoint = copiedIntervalMidpoint(placement, record.length);
    const visibleMidpoint = (labelStart + labelEnd) / 2;
    const stableMidpoint = fullIntervalMidpoint !== null && fullIntervalMidpoint >= labelStart && fullIntervalMidpoint <= labelEnd
      ? fullIntervalMidpoint
      : visibleMidpoint;
    const stableAngle = absToAngle(stableMidpoint, state, arc);
    const labelPointFitsCanvas = (angle) => circularLabelPointFitsCanvas(
      cx,
      cy,
      labelRadius,
      angle,
      canvasRect?.width,
      canvasRect?.height,
      measuredLabelPlan.measuredWidth,
      measuredLabelPlan.fontSize
    );
    const arcIsCanvasClipped = !labelPointFitsCanvas(labelStartAngle) || !labelPointFitsCanvas(labelEndAngle);
    const stableAngleFits = !arcIsCanvasClipped &&
      angleWithinArcInterior(stableAngle, labelStartAngle, labelEndAngle, (measuredLabelPlan.measuredWidth + labelPaddingPx) / Math.max(1, labelRadius) / 2) &&
      labelPointFitsCanvas(stableAngle);
    const placementOptions = stableAngleFits
      ? { preferredAngle: stableAngle }
      : {
          placementMode: "visible-biased",
          fontSize: measuredLabelPlan.fontSize
        };
    const labelPlacement = chooseCircularArcLabelPlacement(
      cx,
      cy,
      labelRadius,
      labelStartAngle,
      labelEndAngle,
      canvasRect?.width,
      canvasRect?.height,
      measuredLabelPlan.measuredWidth,
      labelPaddingPx,
      placementOptions
    );
    const labelOptions = {
      font: measuredLabelPlan.font,
      fill: theme.label,
      offset: 0,
      paddingPx: labelPaddingPx,
      halo: theme.halo,
      haloWidth: track.type === "digest-fragments" ? 2.25 : 3
    };
    if (labelPlan.fits && labelPlacement.fits) {
      if (labelStats) labelStats.insideCandidates += 1;
      labelCandidates.push({
        label: measuredLabelPlan.label,
        measuredWidth: measuredLabelPlan.measuredWidth,
        fontSize: measuredLabelPlan.fontSize,
        radius: labelRadius,
        span: Math.abs(labelPlacement.availableAngle),
        angle: labelPlacement.angle,
        availableAngle: labelPlacement.availableAngle,
        options: labelOptions,
        curved: (track.type === "digest-fragments" || Boolean(slotLayout)) && !useStraightZoomLabel,
        tangentialFallback: track.type !== "digest-fragments"
      });
      continue;
    }
    if (shouldUseCircularFeatureLabelFallback(track.type, Boolean(slotLayout), pxPerBp, labelArcWidth)) {
      ctx.save();
      ctx.font = measuredLabelPlan.font;
      const maxFloatingWidth = Math.min(132, Math.max(48, labelArcWidth + 58));
      const fitted = fitCanvasLabelToWidth(ctx, measuredLabelPlan.label, maxFloatingWidth);
      ctx.restore();
      if (!fitted.label || fitted.width <= 0) continue;
      if (labelStats) labelStats.fallbackCandidates += 1;
      const fallbackAngle = !arcIsCanvasClipped && angleWithinArcInterior(stableAngle, labelStartAngle, labelEndAngle, 0)
        ? stableAngle
        : chooseVisibleArcLabelAngle(cx, cy, labelRadius, labelStartAngle, labelEndAngle, canvasRect?.width, canvasRect?.height, {
            labelWidth: fitted.width,
            fontSize: measuredLabelPlan.fontSize
          });
      labelCandidates.push({
        label: fitted.label,
        measuredWidth: fitted.width,
        fontSize: measuredLabelPlan.fontSize,
        radius: labelRadius,
        span: Math.max(labelArcWidth / Math.max(1, labelRadius), 0.001),
        angle: fallbackAngle,
        availableAngle: labelEndAngle - labelStartAngle,
        options: {
          ...labelOptions,
          haloWidth: 2.25
        },
        curved: false,
        tangentialFallback: true,
        fallback: true
      });
    }
  }
  const drawnLabelBounds = [];
  const labelCanvasRect = ctx.canvas?.getBoundingClientRect?.();
  labelCandidates.sort(compareCircularLabelCandidatesForDrawing);
  for (const candidate of labelCandidates) {
    const bounds = getCircularLabelBounds(
      cx,
      cy,
      candidate.radius,
      candidate.angle,
      candidate.measuredWidth,
      candidate.fontSize,
      4
    );
    bounds.radius = candidate.radius;
    bounds.fontSize = candidate.fontSize;
    if (drawnLabelBounds.some((drawnBounds) => circularLabelCollisionOverlap(bounds, drawnBounds, 4))) {
      continue;
    }
    const drewCurved = candidate.curved && drawCurvedText(
      ctx,
      candidate.label,
      cx,
      cy,
      candidate.radius,
      candidate.angle,
      candidate.availableAngle,
      candidate.options
    );
    if (!drewCurved && candidate.tangentialFallback) {
      drawTangentialText(ctx, candidate.label, cx, cy, candidate.radius, candidate.angle, {
        ...candidate.options,
        align: "center"
      });
    }
    if (drewCurved || candidate.tangentialFallback) {
      if (labelStats) {
        if (drewCurved) {
          labelStats.drawnCurved += 1;
        } else {
          labelStats.drawnStraight += 1;
        }
        if (candidate.fallback) {
          labelStats.drawnFallback += 1;
        } else {
          labelStats.drawnInside += 1;
        }
        if (
          Number.isFinite(labelCanvasRect?.width) &&
          Number.isFinite(labelCanvasRect?.height) &&
          (
            bounds.x < 0 ||
            bounds.y < 0 ||
            bounds.x + bounds.width > labelCanvasRect.width ||
            bounds.y + bounds.height > labelCanvasRect.height
          )
        ) {
          labelStats.drawnOffscreen += 1;
        }
      }
      drawnLabelBounds.push(bounds);
    }
  }
  if (slotLayout?.hidden?.length > 0) {
    drawTangentialText(ctx, `${slotLayout.hidden.length.toLocaleString()} hidden; zoom in`, cx, cy, outerRadius + 10, arc.startAngle + arc.arcAngle * 0.14, {
      font: "11px system-ui, sans-serif",
      fill: theme.warning,
      align: "center"
    });
  }
}

function drawBases(ctx, cx, cy, radius, label, strand, state, record, arc, revealDetail, theme) {
  if (!revealDetail) {
    drawArc(ctx, cx, cy, radius, arc.startAngle, arc.startAngle + arc.arcAngle, theme.sequenceLine, 6);
    return;
  }
  for (const glyph of getVisibleCircularBaseGlyphs(record.sequence, state, record.length, strand)) {
    const angle = relToAngle(glyph.rel, state, arc);
    const point = pointOnCircle(cx, cy, radius, angle);
    const target = {
      kind: "base",
      type: strand === "-" ? "Complement base" : "Base",
      position: glyph.position,
      start: glyph.position,
      end: glyph.position,
      strand,
      base: glyph.base
    };
    addCircleHit(state, { x: point.x, y: point.y, radius: 10 }, target);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle + Math.PI / 2);
    if (isUpsideDown(angle)) ctx.rotate(Math.PI);
    ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = getViewerBaseColor(theme, glyph.base);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph.base, 0, 0);
    ctx.restore();
  }
}

function getVisibleTranslationCodonSegmentsFromAbsoluteFrame(offset, start, end) {
  const segments = [];
  let codonStart = offset + Math.floor((start - offset - 2) / 3) * 3;
  for (; codonStart < end; codonStart += 3) {
    const codonEnd = codonStart + 3;
    const visibleStart = Math.max(codonStart, start);
    const visibleEnd = Math.min(codonEnd, end);
    if (visibleEnd <= visibleStart) continue;
    const codonMidpoint = codonStart + 1.5;
    const seamTolerance = 1e-7;
    segments.push({
      codonStart,
      codonEnd,
      visibleStart,
      visibleEnd,
      codonMidpoint,
      labelVisible: codonStart >= start - seamTolerance && codonEnd <= end + seamTolerance
    });
  }
  return segments;
}

export function getVisibleTranslationCodonSegments(frameOffset, viewStart, viewEnd, sequenceLength) {
  const rawOffset = Number(frameOffset) || 0;
  const offset = ((Math.round(rawOffset) % 3) + 3) % 3;
  const start = Number(viewStart);
  const end = Number(viewEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const length = Math.floor(Number(sequenceLength));
  if (!Number.isFinite(length) || length <= 0) {
    return getVisibleTranslationCodonSegmentsFromAbsoluteFrame(offset, start, end);
  }
  // Reset frame offsets at each true record boundary so zoomed circular copies
  // do not create codons across the origin when the record length is not a multiple of three.
  const segments = [];
  const seamTolerance = 1e-7;
  const firstCopy = Math.floor(start / length) - 1;
  const lastCopy = Math.floor((end - seamTolerance) / length) + 1;
  for (let copy = firstCopy; copy <= lastCopy; copy += 1) {
    const copyStart = copy * length;
    const copyEnd = copyStart + length;
    const frameStart = copyStart + offset;
    if (frameStart >= copyEnd) continue;
    let codonStart = frameStart + Math.floor((start - frameStart - 2) / 3) * 3;
    if (codonStart < frameStart) {
      codonStart = frameStart;
    }
    for (; codonStart + 3 <= copyEnd + seamTolerance && codonStart < end; codonStart += 3) {
      const codonEnd = codonStart + 3;
      const visibleStart = Math.max(codonStart, start);
      const visibleEnd = Math.min(codonEnd, end);
      if (visibleEnd <= visibleStart) continue;
      const codonMidpoint = codonStart + 1.5;
      segments.push({
        codonStart,
        codonEnd,
        visibleStart,
        visibleEnd,
        codonMidpoint,
        labelVisible: codonStart >= start - seamTolerance && codonEnd <= end + seamTolerance
      });
    }
  }
  return segments.sort((left, right) => left.codonStart - right.codonStart);
}

export function getCircularTranslationCodon(sequence, codonStart, length, strand = "+") {
  const source = String(sequence || "");
  const safeLength = Math.max(1, Number(length) || source.length || 1);
  const genomicCodon = [
    source[normalizeBp(codonStart, safeLength)] || "N",
    source[normalizeBp(codonStart + 1, safeLength)] || "N",
    source[normalizeBp(codonStart + 2, safeLength)] || "N"
  ].join("");
  return strand === "-" ? reverseComplement(genomicCodon) : genomicCodon;
}

function drawTranslationFrame(ctx, cx, cy, radius, label, frameOffset, strand, state, record, arc, revealDetail, theme) {
  if (!revealDetail) {
    return;
  }
  const codonMap = makeCodonMap(getViewerGeneticCode(record, state));
  const startCodons = getStartCodons(getViewerGeneticCode(record, state));
  const viewStart = getViewStart(state);
  const viewEnd = getViewEnd(state);
  const selectedOutlines = [];
  for (const segment of getVisibleTranslationCodonSegments(frameOffset, viewStart, viewEnd, record.length)) {
    const absBp = segment.codonStart;
    const codon = getCircularTranslationCodon(record.sequence, absBp, record.length, strand);
    const normalizedCodon = codon.toUpperCase().replaceAll("U", "T");
    const aa = translateCodon(normalizedCodon, codonMap);
    const isStart = startCodons.has(normalizedCodon);
    const startAngle = relToAngle(segment.visibleStart - viewStart, state, arc);
    const endAngle = relToAngle(segment.visibleEnd - viewStart, state, arc);
    const target = {
      kind: "codon",
      type: "Codon",
      start: normalizeBp(absBp, record.length) + 1,
      end: normalizeBp(absBp + 2, record.length) + 1,
      strand,
      frame: label,
      codon,
      aminoAcid: aa
    };
    const selected = viewerTargetMatches(state, target);
    addPolarHit(state, { cx, cy, innerRadius: radius - 11, outerRadius: radius + 11, startAngle, endAngle }, target);
    drawAnnularArc(
      ctx,
      cx,
      cy,
      radius + 10,
      radius - 10,
      startAngle,
      endAngle,
      aa === "*" ? theme.stopFill : isStart ? theme.startFill : theme.aminoAcidFill,
      aa === "*" ? theme.stopStroke : isStart ? theme.startStroke : theme.aminoAcidStroke
    );
    if (selected) {
      selectedOutlines.push({ startAngle, endAngle, outerRadius: radius + 10, innerRadius: radius - 10 });
    }
    if (!segment.labelVisible) continue;
    const midAngle = relToAngle(segment.codonMidpoint - viewStart, state, arc);
    const point = pointOnCircle(cx, cy, radius, midAngle);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(midAngle + Math.PI / 2);
    if (isUpsideDown(midAngle)) ctx.rotate(Math.PI);
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = aa === "*" ? theme.stopText : isStart ? theme.startText : theme.aminoAcidText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(aa, 0, 0);
    ctx.restore();
  }
  for (const outline of selectedOutlines) {
    strokeAnnularArc(
      ctx,
      cx,
      cy,
      outline.outerRadius + 0.5,
      outline.innerRadius - 0.5,
      outline.startAngle,
      outline.endAngle,
      theme.selectedStroke,
      2.6
    );
  }
}

function computeBaseRadius(width, height, state, record) {
  const zoomRatio = record.length / state.viewSpan;
  const displaySize = Math.min(width, height);
  const baseRadiusAtFullView = displaySize * 0.27;
  const zoomBoost = Math.pow(Math.max(0, zoomRatio - 1), 0.86) * displaySize * 0.2;
  const linearWindowBlend = Math.max(0, Math.min(1, (zoomRatio - 1.18) / 0.9));
  const linearWindowBoost = Math.pow(linearWindowBlend, 0.85) * displaySize * 0.95;
  const radiusBoost = Math.max(0, Math.min(displaySize * 2.6, zoomBoost + linearWindowBoost));
  return Math.max(120, baseRadiusAtFullView + radiusBoost);
}

function getCenterWeight(state, record) {
  return getCenterWeightForLength(state, record.length);
}

function getCenterWeightForLength(state, length) {
  const zoomRatio = length / state.viewSpan;
  return Math.max(0, Math.min(1, (zoomRatio - 1.02) / 0.65));
}

export function shouldUseCircularFreeMove(state, recordLength) {
  const length = Math.max(1, Number(recordLength) || 1);
  const gapAngle = getCircularZoomGapAngle(state, length);
  return getCenterWeightForLength(state, length) > 0.05 && gapAngle < Math.PI * 0.18;
}

function getDragCenterWeight(state, record) {
  const zoomRatio = record.length / state.viewSpan;
  return Math.max(0.35, Math.min(1, (zoomRatio - 1) / 1.4));
}

function computeLayout(width, height, state, record) {
  const baseRadius = computeBaseRadius(width, height, state, record);
  const centerWeight = state.viewMoved ? getDragCenterWeight(state, record) : getCenterWeight(state, record);
  const storedX = Number.isFinite(state.centerX) ? state.centerX : width / 2;
  const storedY = Number.isFinite(state.centerY) ? state.centerY : height / 2;
  const cx = width / 2 + (storedX - width / 2) * centerWeight;
  const cy = height / 2 + (storedY - height / 2) * centerWeight;
  return {
    cx,
    cy,
    baseRadius,
    pxPerBp: ((TWO_PI - getArcConfig(state, record.length).gapAngle) * baseRadius) / state.viewSpan
  };
}

function setStoredCenterForVisualCenter(state, record, width, height, targetCx, targetCy) {
  const centerWeight = state.viewMoved ? getDragCenterWeight(state, record) : getCenterWeight(state, record);
  if (centerWeight <= 0.001) {
    state.centerX = null;
    state.centerY = null;
    return;
  }
  state.centerX = width / 2 + (targetCx - width / 2) / centerWeight;
  state.centerY = height / 2 + (targetCy - height / 2) / centerWeight;
}

function ensureZoomedCircularViewHasVisibleCenter(state, record, width, height) {
  if (state.viewSpan >= record.length * 0.999) {
    return;
  }
  if (Number.isFinite(state.centerX) && Number.isFinite(state.centerY)) {
    return;
  }
  state.viewMoved = false;
  if (state.userRotated !== true) {
    const arc = getArcConfig(state, record.length);
    state.gapCenterAngle = CIRCULAR_ZOOM_ORIENTATION_ANGLE - arc.arcAngle / 2;
  }
  const baseRadius = computeBaseRadius(width, height, state, record);
  const focusAngle = CIRCULAR_ZOOM_ORIENTATION_ANGLE;
  setStoredCenterForVisualCenter(
    state,
    record,
    width,
    height,
    width / 2,
    height * 0.4 - Math.sin(focusAngle) * baseRadius
  );
}

function clampVisualCenter(cx, cy, radius, width, height) {
  const margin = Math.max(90, Math.min(width, height) * 0.18);
  const maxOffsetX = Math.max(0, radius + width / 2 - margin);
  const maxOffsetY = Math.max(0, radius + height / 2 - margin);
  return {
    cx: Math.max(width / 2 - maxOffsetX, Math.min(width / 2 + maxOffsetX, cx)),
    cy: Math.max(height / 2 - maxOffsetY, Math.min(height / 2 + maxOffsetY, cy))
  };
}

export function getCircularSequenceCenterBlend(state, length) {
  const safeLength = Math.max(1, Number(length) || 1);
  const span = Math.max(1, Math.min(safeLength, Number(state?.viewSpan) || safeLength));
  const zoomRatio = safeLength / span;
  const t = Math.max(0, Math.min(1, (zoomRatio - 1.35) / 1.15));
  return t * t * (3 - 2 * t);
}

function getCircularAnchorDisplayRadius(width, height, state, recordLength) {
  const displaySize = Math.min(width, height);
  const centerBlend = getCircularSequenceCenterBlend(state, recordLength);
  return displaySize * (0.32 * (1 - centerBlend) + 0.04 * centerBlend);
}

function updateStatus(status, state, record, pxPerBp) {
  if (state.viewSpan >= record.length * 0.999) {
    const rangeLine = document.createElement("span");
    const scaleLine = document.createElement("span");
    rangeLine.textContent = `1-${record.length.toLocaleString()} bp`;
    scaleLine.textContent = `${record.length.toLocaleString()} bp span · ${pxPerBp.toFixed(2)} px/bp`;
    status.textContent = "";
    status.append(rangeLine, scaleLine);
    return;
  }
  const range = getVisibleCircularBaseRange(record.sequence, state, record.length);
  const start = range?.start ?? normalizeBp(Math.round(getViewStart(state)), record.length) + 1;
  const end = range?.end ?? start;
  const rangeLine = document.createElement("span");
  const scaleLine = document.createElement("span");
  rangeLine.textContent = `${start.toLocaleString()}-${end.toLocaleString()} bp`;
  scaleLine.textContent = `${Math.round(state.viewSpan).toLocaleString()} bp span · ${pxPerBp.toFixed(2)} px/bp`;
  status.textContent = "";
  status.append(rangeLine, scaleLine);
}

function drawCircularViewer(ctx, canvas, status, record, state) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const theme = getViewerCanvasTheme(canvas);
  const layout = computeRenderedCircularLayout(width, height, state, record);
  const { cx, cy, baseRadius, pxPerBp, arc, offsets, digestFragmentTracks, restrictionTracks, otherTrackLayouts } = layout;
  state.hitRegions = [];
  state.renderDiagnostics = {
    circularFeatureLabels: {
      insideCandidates: 0,
      fallbackCandidates: 0,
      drawnInside: 0,
      drawnFallback: 0,
      drawnOffscreen: 0,
      drawnCurved: 0,
      drawnStraight: 0
    }
  };
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const detailRadius = getInnermostSequenceRadius(baseRadius, state);
  const revealDetail = layout.revealDetail;
  const showInnerRuler = revealDetail;
  const innerRulerRadius = Math.max(34, detailRadius - 22);
  const fragmentTrackRadius = baseRadius + offsets.fragmentTrackOffset;
  const restrictionTrackRadius = baseRadius + offsets.restrictionTrackOffset;
  const otherTrackStartRadius = baseRadius + offsets.otherTrackStartOffset;
  const searchInnerRadius = Math.max(30, showInnerRuler ? innerRulerRadius - 16 : detailRadius - 24);
  const otherTrackOuterRadius = baseRadius + offsets.otherTrackOuterOffset;
  const rulerRadius = baseRadius + offsets.rulerOffset;
  const searchOuterRadius = Math.max(rulerRadius + 36, otherTrackOuterRadius + 12);

  drawCircularSearchMarkers(ctx, cx, cy, searchInnerRadius, searchOuterRadius, state, record, arc, theme);

  for (const track of digestFragmentTracks) {
    drawIntervalTrack(ctx, track, cx, cy, fragmentTrackRadius + 7, fragmentTrackRadius - 7, state, record, arc, pxPerBp, null, theme);
  }
  for (const track of restrictionTracks) {
    drawPointTrack(ctx, track, cx, cy, restrictionTrackRadius, state, record, arc, pxPerBp, {
      markerArcPx: RESTRICTION_SITE_MARKER_ARC_PX,
      ringHalfWidth: RESTRICTION_SITE_RING_HALF_WIDTH,
      theme
    });
  }
  let outerTrack = otherTrackStartRadius;
  for (const { track, quantitative, summary, layout } of otherTrackLayouts) {
    if (quantitative) {
      drawCircularQuantitativeTrack(ctx, track, cx, cy, outerTrack + 18, outerTrack - 18, state, record, arc, theme);
      outerTrack += 46;
    } else if (summary) {
      drawIntervalTrack(ctx, track, cx, cy, outerTrack + 12, outerTrack - 12, state, record, arc, pxPerBp, null, theme);
      outerTrack += 34;
    } else if (layout) {
      const inner = outerTrack;
      const outer = outerTrack + circularFeatureTrackWidth(layout) - 8;
      drawIntervalTrack(ctx, track, cx, cy, outer, inner, state, record, arc, pxPerBp, layout, theme);
      outerTrack += circularFeatureTrackWidth(layout);
    } else {
      drawIntervalTrack(ctx, track, cx, cy, outerTrack + 12, outerTrack - 12, state, record, arc, pxPerBp, null, theme);
      outerTrack += 34;
    }
  }

  drawArc(ctx, cx, cy, rulerRadius, arc.startAngle, arc.startAngle + arc.arcAngle, theme.axis, 2.4);
  drawTicks(ctx, cx, cy, rulerRadius, state, record, arc, pxPerBp, {
    labelOffset: OUTER_RULER_LABEL_OFFSET,
    labelStyle: "tangential",
    theme
  });
  if (showInnerRuler) {
    drawArc(ctx, cx, cy, innerRulerRadius, arc.startAngle, arc.startAngle + arc.arcAngle, theme.muted, 1.4);
    drawTicks(ctx, cx, cy, innerRulerRadius, state, record, arc, pxPerBp, {
      showLabels: false,
      tickDirection: "inward",
      tickScale: 0.82,
      theme
    });
  }

  if (state.showForwardTranslations) {
    drawTranslationFrame(ctx, cx, cy, baseRadius + 8, "+1", 0, "+", state, record, arc, revealDetail, theme);
    drawTranslationFrame(ctx, cx, cy, baseRadius - 18, "+2", 1, "+", state, record, arc, revealDetail, theme);
    drawTranslationFrame(ctx, cx, cy, baseRadius - 44, "+3", 2, "+", state, record, arc, revealDetail, theme);
  }

  const dnaPlusRadius = state.showForwardTranslations ? baseRadius - 76 : baseRadius - 28;
  drawBases(ctx, cx, cy, dnaPlusRadius, "DNA +", "+", state, record, arc, revealDetail, theme);
  if (state.showSecondStrand) {
    drawBases(ctx, cx, cy, dnaPlusRadius - 26, "DNA -", "-", state, record, arc, revealDetail, theme);
  }

  if (state.showReverseTranslations) {
    const reverseStart = state.showSecondStrand ? dnaPlusRadius - 58 : dnaPlusRadius - 34;
    drawTranslationFrame(ctx, cx, cy, reverseStart, "-1", 0, "-", state, record, arc, revealDetail, theme);
    drawTranslationFrame(ctx, cx, cy, reverseStart - 26, "-2", 1, "-", state, record, arc, revealDetail, theme);
    drawTranslationFrame(ctx, cx, cy, reverseStart - 52, "-3", 2, "-", state, record, arc, revealDetail, theme);
  }

  updateStatus(status, state, record, pxPerBp);
  if (canvas.dataset) {
    const labels = state.renderDiagnostics.circularFeatureLabels;
    canvas.dataset.circularFeatureLabelsInside = String(labels.drawnInside);
    canvas.dataset.circularFeatureLabelsFallback = String(labels.drawnFallback);
    canvas.dataset.circularFeatureLabelsOffscreen = String(labels.drawnOffscreen);
    canvas.dataset.circularFeatureLabelsCurved = String(labels.drawnCurved);
    canvas.dataset.circularFeatureLabelsStraight = String(labels.drawnStraight);
    canvas.dataset.circularFeatureLabelsInsideCandidates = String(labels.insideCandidates);
    canvas.dataset.circularFeatureLabelsFallbackCandidates = String(labels.fallbackCandidates);
  }
}

function makeCircularViewerSnapshot(record, state, searchControls) {
  return {
    title: record.title || "",
    length: record.length,
    viewCenter: state.viewCenter,
    viewSpan: state.viewSpan,
    gapCenterAngle: state.gapCenterAngle,
    centerX: state.centerX,
    centerY: state.centerY,
    viewMoved: state.viewMoved,
    userRotated: state.userRotated,
    geneticCode: state.geneticCode,
    showSecondStrand: state.showSecondStrand,
    showForwardTranslations: state.showForwardTranslations,
    showReverseTranslations: state.showReverseTranslations,
    composition: snapshotViewerCompositionState(state),
    rangeAnchors: Array.isArray(state.rangeAnchors) ? state.rangeAnchors.map((anchor) => ({ ...anchor })) : [],
    searchScope: searchControls?.scope?.value || "",
    searchQuery: searchControls?.input?.value || ""
  };
}

function reusableCircularViewerSnapshot(snapshot, record) {
  if (!snapshot || (snapshot.title || "") !== (record.title || "")) {
    return null;
  }
  if (!Number.isFinite(Number(snapshot.viewCenter)) || !Number.isFinite(Number(snapshot.viewSpan))) {
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
    trackLayoutCache: new WeakMap()
  };
}

function installCircularViewer(panel, record, options = {}) {
  const preserved = reusableCircularViewerSnapshot(options.initialState, record);
  const hideSequenceInterpretationControls = record.hideSequenceInterpretationControls === true;
  const toolbar = document.createElement("div");
  toolbar.className = "dna-viewer-toolbar";
  const leftControls = document.createElement("div");
  leftControls.className = "dna-viewer-left-controls";
  const buttons = document.createElement("div");
  buttons.className = "dna-viewer-buttons";
  const zoomIn = createButton(ICONS.zoomIn, "Zoom in while keeping the circular orientation");
  const zoomOut = createButton(ICONS.zoomOut, "Zoom out while keeping the circular orientation");
  const panLeft = createButton(ICONS.rotateLeft, "Rotate left");
  const panRight = createButton(ICONS.rotateRight, "Rotate right");
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
  if (hideSequenceInterpretationControls) {
    secondStrandToggle.label.hidden = true;
    forwardTranslationToggle.label.hidden = true;
    reverseTranslationToggle.label.hidden = true;
    geneticCodeControl.control.hidden = true;
  }
  toolbar.append(leftControls, toggles, menuControls);

  const canvas = document.createElement("canvas");
  canvas.className = "dna-viewer-canvas dna-circular-viewer-canvas";
  const ctx = canvas.getContext("2d");
  const tooltip = createViewerTooltip(panel);
  const showInspectorPanels = options.showInspectorPanels !== false;
  const selectionPanel = createSelectionPanel();
  const rangePanel = createRangePanel();
  const state = {
    viewCenter: preserved ? Number(preserved.viewCenter) : Math.max(1, record.length) / 2,
    viewSpan: preserved ? Number(preserved.viewSpan) : Math.max(1, record.length),
    gapCenterAngle: Number.isFinite(Number(preserved?.gapCenterAngle)) ? Number(preserved.gapCenterAngle) : -Math.PI / 2,
    centerX: preserved?.centerX !== null && Number.isFinite(Number(preserved?.centerX)) ? Number(preserved.centerX) : null,
    centerY: preserved?.centerY !== null && Number.isFinite(Number(preserved?.centerY)) ? Number(preserved.centerY) : null,
    viewMoved: preserved?.viewMoved === true,
    geneticCode: record.geneticCode || preserved?.geneticCode || "1",
    showSecondStrand: !hideSequenceInterpretationControls && (preserved ? preserved.showSecondStrand !== false : record.showSecondStrandDefault !== false),
    showForwardTranslations: !hideSequenceInterpretationControls && (preserved ? preserved.showForwardTranslations !== false : record.showForwardTranslationsDefault !== false),
    showReverseTranslations: !hideSequenceInterpretationControls && (preserved ? preserved.showReverseTranslations !== false : record.showReverseTranslationsDefault !== false),
    userRotated: preserved?.userRotated === true,
    dragging: false,
    dragMode: "",
    dragLastAngle: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragLastX: 0,
    dragLastY: 0,
    dragStartCenterX: null,
    dragStartCenterY: null,
    dragCenterWeight: 1,
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
    wheelAnchorClientX: null,
    wheelAnchorClientY: null
  };
  clampSpan(state, record.length);
  initializeViewerCompositionTracks(record, state, preserved?.composition);
  const compositionControls = createViewerCompositionControls(record, state, () => {
    drawCircularViewer(ctx, canvas, status, record, state);
  });
  const trackControls = createViewerTrackControls(record, state, () => {
    drawCircularViewer(ctx, canvas, status, record, state);
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
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ensureZoomedCircularViewHasVisibleCenter(state, record, rect.width, rect.height);
    drawCircularViewer(ctx, canvas, status, record, state);
  }
  let stopInertia = () => {};
  const inertiaTracker = createInertiaVelocityTracker();
  function cancelInertia() {
    stopInertia();
    stopInertia = () => {};
  }
  function zoomAt(clientX, clientY, factor, options = {}) {
    cancelInertia();
    const preserveOrientation = Boolean(options.lockOrientation || options.preserveOrientation);
    const oldSpan = state.viewSpan;
    const minSpan = getMinCircularViewSpan(record.length);
    if (oldSpan <= minSpan && factor > 1) return;
    const rect = canvas.getBoundingClientRect();
    const oldLayout = computeRenderedCircularLayout(rect.width, rect.height, state, record);
    const { cx, cy, baseRadius: oldRadius } = oldLayout;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const pointer = preserveOrientation
      ? CIRCULAR_ZOOM_ORIENTATION_ANGLE
      : zoomAnchorAngle({ clientX, clientY }, rect, cx, cy, oldRadius);
    const pointerDistance = Math.hypot(localX - cx, localY - cy);
    const centerDeadZone = Math.max(
      70,
      Math.min(oldRadius * 0.45, Math.min(rect.width, rect.height) * 0.22)
    );
    const useCursorAnchor = !preserveOrientation && Number.isFinite(pointerDistance) && pointerDistance > centerDeadZone;
    const oldAnchorX = cx + Math.cos(pointer) * oldRadius;
    const oldAnchorY = cy + Math.sin(pointer) * oldRadius;
    const oldArc = oldLayout.arc;
    const oldFraction = angleToFractionOnArc(pointer, oldArc);
    const rawAnchorBp = getViewStart(state) + oldFraction * oldSpan;
    const anchorBp = options.smoothAnchor && !preserveOrientation
      ? wheelGestureAnchor(state, rawAnchorBp, record.length, clientX, clientY)
      : rawAnchorBp;
    const nextSpan = Math.max(minSpan, Math.min(record.length, oldSpan / factor));
    const nextArcState = {
      ...state,
      viewSpan: nextSpan
    };
    const nextRenderedLayout = computeRenderedCircularLayout(rect.width, rect.height, nextArcState, record);
    const anchorFraction = preserveOrientation
      ? undefined
      : options.anchorFraction ?? (oldSpan >= record.length * 0.999 ? 0.5 : undefined);
    const nextZoomState = computeCircularZoomState(state, record.length, pointer, factor, {
      anchorBp,
      anchorAngle: pointer,
      anchorFraction,
      oldArc,
      nextArc: nextRenderedLayout.arc,
      preserveOrientation,
      minSpan
    });
    if (!nextZoomState.changed) return;
    const appliedZoomState = applyCircularZoomState(state, record.length, nextZoomState, {
      preserveOrientation
    });
    state.viewSpan = appliedZoomState.viewSpan;
    state.viewCenter = appliedZoomState.viewCenter;
    state.gapCenterAngle = appliedZoomState.gapCenterAngle;
    if (state.viewSpan >= record.length * 0.999) {
      state.centerX = null;
      state.centerY = null;
      state.viewMoved = false;
      drawCircularViewer(ctx, canvas, status, record, state);
      return;
    }
    const newRadius = computeRenderedCircularLayout(rect.width, rect.height, state, record).baseRadius;
    if (state.viewMoved && Number.isFinite(state.centerX) && Number.isFinite(state.centerY)) {
      const clamped = clampVisualCenter(
        oldAnchorX - Math.cos(pointer) * newRadius,
        oldAnchorY - Math.sin(pointer) * newRadius,
        newRadius,
        rect.width,
        rect.height
      );
      setStoredCenterForVisualCenter(
        state,
        record,
        rect.width,
        rect.height,
        clamped.cx,
        clamped.cy
      );
    } else if (preserveOrientation) {
      const displayRadius = getCircularAnchorDisplayRadius(rect.width, rect.height, state, record.length);
      const displayX = rect.width / 2 + Math.cos(pointer) * displayRadius;
      const displayY = rect.height / 2 + Math.sin(pointer) * displayRadius;
      const clamped = clampVisualCenter(
        displayX - Math.cos(pointer) * newRadius,
        displayY - Math.sin(pointer) * newRadius,
        newRadius,
        rect.width,
        rect.height
      );
      setStoredCenterForVisualCenter(
        state,
        record,
        rect.width,
        rect.height,
        clamped.cx,
        clamped.cy
      );
      state.viewMoved = false;
    } else if (!preserveOrientation) {
      const displayRadius = getCircularAnchorDisplayRadius(rect.width, rect.height, state, record.length);
      const anchorRadius = useCursorAnchor
        ? newRadius + (pointerDistance - oldRadius)
        : newRadius;
      const displayX = useCursorAnchor
        ? localX
        : rect.width / 2 + Math.cos(pointer) * displayRadius;
      const displayY = useCursorAnchor
        ? localY
        : rect.height / 2 + Math.sin(pointer) * displayRadius;
      const clamped = clampVisualCenter(
        displayX - Math.cos(pointer) * anchorRadius,
        displayY - Math.sin(pointer) * anchorRadius,
        newRadius,
        rect.width,
        rect.height
      );
      setStoredCenterForVisualCenter(
        state,
        record,
        rect.width,
        rect.height,
        clamped.cx,
        clamped.cy
      );
      state.viewMoved = false;
    }
    drawCircularViewer(ctx, canvas, status, record, state);
  }
  function rotateByDirection(direction) {
    cancelInertia();
    const rect = canvas.getBoundingClientRect();
    const { baseRadius } = computeLayout(rect.width, rect.height, state, record);
    const bpPerScreenPx = state.viewSpan / Math.max(1, TWO_PI * baseRadius);
    const visualStepBp = bpPerScreenPx * 88;
    const minStepBp = Math.min(state.viewSpan, 1);
    const maxStepBp = Math.max(minStepBp, state.viewSpan * 0.2);
    const stepBp = Math.max(minStepBp, Math.min(maxStepBp, visualStepBp));
    state.viewCenter += direction * stepBp;
    state.userRotated = true;
    drawCircularViewer(ctx, canvas, status, record, state);
  }

  function zoomAtButtonAnchor(factor) {
    const rect = canvas.getBoundingClientRect();
    const { cx, cy, baseRadius } = computeLayout(rect.width, rect.height, state, record);
    const buttonAngle = CIRCULAR_ZOOM_ORIENTATION_ANGLE;
    zoomAt(rect.left + cx + Math.cos(buttonAngle) * baseRadius, rect.top + cy + Math.sin(buttonAngle) * baseRadius, factor, { lockOrientation: true });
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
      drawCircularViewer(ctx, canvas, status, record, state);
      return;
    }
    state.searchResults = scope === "protein"
      ? searchTranslations(record, trimmed, state)
      : scope === "features"
        ? searchFeatures(record, trimmed, state)
        : searchDna(record, trimmed);
    state.activeSearchIndex = -1;
    state.activeSearchTarget = null;
    state.searchNavigationStarted = false;
    updateSearchControls(searchControls);
    drawCircularViewer(ctx, canvas, status, record, state);
  }
  function targetSpan(target) {
    const range = getCircularSelectionRange(target, record);
    const minSpan = getMinCircularViewSpan(record.length);
    if (!range) return Math.min(record.length, Math.max(minSpan, 180));
    const length = range.start <= range.end ? range.end - range.start + 1 : record.length - range.start + 1 + range.end;
    if (record.length > 250) {
      return Math.max(minSpan, Math.min(record.length, Math.max(120, length * 3)));
    }
    return Math.max(minSpan, Math.min(record.length, Math.max(minSpan * 2, length * 6)));
  }
  function targetCenter(target) {
    const range = getCircularSelectionRange(target, record);
    if (!range) return state.viewCenter;
    if (range.start <= range.end) return (range.start + range.end) / 2 - 1;
    return range.start - 1 + (record.length - range.start + 1 + range.end) / 2;
  }
  function zoomToTargetAnimated(target, options = {}) {
    cancelInertia();
    const nextSpan = options.preserveZoom ? state.viewSpan : targetSpan(target);
    const nextCenter = targetCenter(target);
    const fromCenter = state.viewCenter;
    const fromSpan = state.viewSpan;
    const fromGap = state.gapCenterAngle;
    const fromX = Number.isFinite(state.centerX) ? state.centerX : null;
    const fromY = Number.isFinite(state.centerY) ? state.centerY : null;
    const deltaCenter = shortestCoordinateDelta(nextCenter, fromCenter, record.length);
    const rect = canvas.getBoundingClientRect();
    const focusAngle = -Math.PI / 2;
    const nextArc = getArcConfig({ ...state, viewSpan: nextSpan }, record.length);
    const nextGap = focusAngle - nextArc.arcAngle / 2;
    const deltaGap = signedAngleDiff(nextGap, fromGap);
    const nextRadius = computeBaseRadius(rect.width, rect.height, { ...state, viewSpan: nextSpan }, record);
    const nextX = rect.width / 2;
    const nextY = rect.height * 0.4 - Math.sin(focusAngle) * nextRadius;
    const started = performance.now();
    const duration = 210;
    function step(now) {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      state.viewCenter = fromCenter + deltaCenter * eased;
      state.viewSpan = fromSpan + (nextSpan - fromSpan) * eased;
      state.gapCenterAngle = fromGap + deltaGap * eased;
      if (fromX === null) {
        state.centerX = nextX;
      } else {
        state.centerX = fromX + (nextX - fromX) * eased;
      }
      if (fromY === null) {
        state.centerY = nextY;
      } else {
        state.centerY = fromY + (nextY - fromY) * eased;
      }
      state.viewMoved = false;
      clampSpan(state, record.length);
      drawCircularViewer(ctx, canvas, status, record, state);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function makeSelectionPayload(target = state.selectedTarget, payloadOptions = {}) {
    const currentRange = getCircularRangeState(state, record);
    return {
      target,
      range: target ? getCircularSelectionRange(target, record) : null,
      selectedSequence: target ? getCircularSequence(record, target) : "",
      currentRange,
      rangeSelectedSequence: currentRange?.ready ? getCircularRangeForwardDna(record, currentRange) : "",
      preferredSelection: payloadOptions.preferredSelection || "target",
      recordTitle: record.title || "",
      recordLength: record.length,
      recordIndex: options.recordIndex ?? 0,
      viewer: "circular",
      actions: {
        addRangeAnchor: (selected = target) => selectionActions().addRangeAnchor(selected),
        clearRange: () => {
          state.rangeAnchors = [];
          renderCurrentRange();
        },
        copyRangeCoordinates: () => currentRange?.ready && copyViewerText(currentRange.label),
        copyRangeSequence: () => currentRange?.ready && copyViewerText(getCircularRangeForwardDna(record, currentRange)),
        copyRangeReverseComplement: () => currentRange?.ready && copyViewerText(reverseComplement(getCircularRangeForwardDna(record, currentRange))),
        copyRangeTranslation: (frame) => currentRange?.ready && copyViewerText(translateRange(getCircularRangeForwardDna(record, currentRange), frame, getViewerGeneticCode(record, state))),
        zoomToRange: () => {
          cancelInertia();
          if (!currentRange?.ready) return;
          state.viewCenter = currentRange.wraps
            ? currentRange.start - 1 + currentRange.length / 2
            : (currentRange.start + currentRange.end) / 2 - 1;
          state.viewSpan = Math.max(getMinCircularViewSpan(record.length), Math.min(record.length, currentRange.length * 2.5));
          clampSpan(state, record.length);
          drawCircularViewer(ctx, canvas, status, record, state);
        },
        swapRange: () => {
          state.rangeAnchors = [...state.rangeAnchors].reverse();
          renderCurrentRange();
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
      parts: item.parts
    };
    return { ...target, key: makeTargetKey(target) };
  }
  function findMateTarget(selected) {
    if (!selected?.mateFeatureId) return null;
    for (const track of record.tracks || []) {
      const items = track.items || [];
      const itemIndex = items.findIndex((item) => item.featureId === selected.mateFeatureId);
      if (itemIndex !== -1) {
        return targetForViewerItem(track, items[itemIndex], itemIndex);
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
      copySequence: (selected) => copyViewerText(getCircularSequence(record, selected)),
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
    drawCircularViewer(ctx, canvas, status, record, state);
    notifySelectionChange();
  }
  function notifySelectionChange(payloadOptions = {}) {
    options.onSelectionChange?.(makeSelectionPayload(state.selectedTarget, payloadOptions));
  }
  function renderCurrentRange() {
    const range = getCircularRangeState(state, record);
    renderRangePanel(rangePanel, range, {
      clearRange: () => {
        state.rangeAnchors = [];
        renderCurrentRange();
      },
      copyCoordinates: () => copyViewerText(range.label),
      copyForwardDna: () => copyViewerText(getCircularRangeForwardDna(record, range)),
      copyReverseComplement: () => copyViewerText(reverseComplement(getCircularRangeForwardDna(record, range))),
      copyTranslation: (frame) => copyViewerText(translateRange(getCircularRangeForwardDna(record, range), frame, getViewerGeneticCode(record, state))),
      zoomToRange: () => {
        cancelInertia();
        state.viewCenter = range.wraps
          ? range.start - 1 + range.length / 2
          : (range.start + range.end) / 2 - 1;
        state.viewSpan = Math.max(getMinCircularViewSpan(record.length), Math.min(record.length, range.length * 2.5));
        clampSpan(state, record.length);
        drawCircularViewer(ctx, canvas, status, record, state);
      },
      swapRange: () => {
        state.rangeAnchors = [...state.rangeAnchors].reverse();
        renderCurrentRange();
      }
    });
    notifySelectionChange({ preferredSelection: range.ready ? "range" : "target" });
  }
  const searchControls = createViewerSearchControls({
    onSearch: (scope, query) => runSearch(searchControls, scope, query),
    onPrevious: () => navigateSearch(searchControls, -1),
    onNext: () => navigateSearch(searchControls, 1)
  }, hideSequenceInterpretationControls ? {
    scopes: [["features", "Features"]],
    featureSuggestions: makeViewerFeatureSuggestions(record),
    placeholder: "Find feature, read, variant, or track item"
  } : {
    featureSuggestions: makeViewerFeatureSuggestions(record)
  });
  if (preserved?.searchScope && Array.from(searchControls.scope.options).some((option) => option.value === preserved.searchScope)) {
    searchControls.scope.value = preserved.searchScope;
  }
  if (preserved?.searchQuery) {
    searchControls.input.value = preserved.searchQuery;
    runSearch(searchControls, searchControls.scope.value, searchControls.input.value);
  }
  updateSearchControls(searchControls);
  renderCurrentRange();
  zoomIn.addEventListener("click", () => zoomAtButtonAnchor(1.55));
  zoomOut.addEventListener("click", () => zoomAtButtonAnchor(1 / 1.55));
  panLeft.addEventListener("click", () => rotateByDirection(-1));
  panRight.addEventListener("click", () => rotateByDirection(1));
  reset.addEventListener("click", () => {
    cancelInertia();
    state.viewCenter = record.length / 2;
    state.viewSpan = record.length;
    state.gapCenterAngle = -Math.PI / 2;
    state.centerX = null;
    state.centerY = null;
    state.viewMoved = false;
    state.userRotated = false;
    drawCircularViewer(ctx, canvas, status, record, state);
  });
  camera.addEventListener("click", () => {
    const safeTitle = makeSafeFileStem(record.title, "dna-circular-viewer");
    downloadCanvasPng(canvas, `${safeTitle}-circular-viewer.png`, {
      drawSnapshot: (exportContext, exportCanvas) => {
        drawCircularViewer(exportContext, exportCanvas, document.createElement("div"), record, cloneViewerStateForExport(state));
      }
    });
  });
  svgDownload.addEventListener("click", () => {
    const safeTitle = makeSafeFileStem(record.title, "dna-circular-viewer");
    downloadCanvasSvg(canvas, `${safeTitle}-circular-viewer.svg`, {
      title: `${record.title || "DNA sequence"} circular viewer`,
      description: `Current circular viewer snapshot. ${status.textContent || ""}`.trim(),
      metadata: {
        viewer: "circular",
        recordTitle: record.title || "",
        sequenceLength: record.length,
        viewCenter: state.viewCenter,
        viewSpan: state.viewSpan
      }
    });
  });
  secondStrandToggle.input.addEventListener("change", () => {
    cancelInertia();
    state.showSecondStrand = secondStrandToggle.input.checked;
    drawCircularViewer(ctx, canvas, status, record, state);
  });
  forwardTranslationToggle.input.addEventListener("change", () => {
    cancelInertia();
    state.showForwardTranslations = forwardTranslationToggle.input.checked;
    drawCircularViewer(ctx, canvas, status, record, state);
  });
  reverseTranslationToggle.input.addEventListener("change", () => {
    cancelInertia();
    state.showReverseTranslations = reverseTranslationToggle.input.checked;
    drawCircularViewer(ctx, canvas, status, record, state);
  });
  geneticCodeControl.select.addEventListener("change", () => {
    cancelInertia();
    state.geneticCode = geneticCodeControl.select.value;
    drawCircularViewer(ctx, canvas, status, record, state);
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
    cancelInertia();
    if (state.wheelAnchorTimer) clearTimeout(state.wheelAnchorTimer);
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.2 : 1 / 1.2, { smoothAnchor: true });
    state.wheelAnchorTimer = setTimeout(() => {
      state.wheelAnchorBp = null;
      state.wheelAnchorClientX = null;
      state.wheelAnchorClientY = null;
      state.wheelAnchorTimer = null;
    }, 320);
  }, { passive: false });
  canvas.addEventListener("mousedown", (event) => {
    cancelInertia();
    hideViewerTooltip(tooltip);
    const rect = canvas.getBoundingClientRect();
    const { cx, cy } = computeLayout(rect.width, rect.height, state, record);
    const centerWeight = getDragCenterWeight(state, record);
    state.dragging = true;
    state.dragMode = shouldUseCircularFreeMove(state, record.length) ? "move-view" : "rotate";
    state.dragLastAngle = pointerAngle(event, rect, cx, cy);
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragLastX = event.clientX;
    state.dragLastY = event.clientY;
    state.dragStartCenterX = Number.isFinite(state.centerX) ? state.centerX : rect.width / 2;
    state.dragStartCenterY = Number.isFinite(state.centerY) ? state.centerY : rect.height / 2;
    state.dragCenterWeight = Math.max(0.05, centerWeight);
    inertiaTracker.reset();
    inertiaTracker.add(state.viewCenter, performance.now());
    canvas.classList.add("dragging");
  });
  const onWindowMouseMove = (event) => {
    if (!state.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const { cx, cy } = computeLayout(rect.width, rect.height, state, record);
    if (state.dragMode === "move-view") {
      state.viewMoved = true;
      state.dragLastX = event.clientX;
      state.dragLastY = event.clientY;
      const { baseRadius } = computeLayout(rect.width, rect.height, state, record);
      const next = clampVisualCenter(
        state.dragStartCenterX + event.clientX - state.dragStartX,
        state.dragStartCenterY + event.clientY - state.dragStartY,
        baseRadius,
        rect.width,
        rect.height
      );
      state.centerX = next.cx;
      state.centerY = next.cy;
      drawCircularViewer(ctx, canvas, status, record, state);
      return;
    }
    const currentAngle = pointerAngle(event, rect, cx, cy);
    const angleDelta = signedAngleDiff(currentAngle, state.dragLastAngle);
    state.dragLastAngle = currentAngle;
    state.dragLastX = event.clientX;
    state.dragLastY = event.clientY;
    const arc = getArcConfig(state, record.length);
    state.viewCenter -= (angleDelta / arc.arcAngle) * state.viewSpan;
    state.userRotated = true;
    inertiaTracker.add(state.viewCenter, performance.now());
    drawCircularViewer(ctx, canvas, status, record, state);
  };
  const onWindowMouseUp = (event) => {
    if (!state.dragging) return;
    const releaseX = Number.isFinite(Number(event.clientX)) ? event.clientX : state.dragLastX;
    const releaseY = Number.isFinite(Number(event.clientY)) ? event.clientY : state.dragLastY;
    const dragDistancePx = Math.hypot(state.dragLastX - state.dragStartX, state.dragLastY - state.dragStartY);
    state.dragLastX = releaseX;
    state.dragLastY = releaseY;
    inertiaTracker.add(state.viewCenter, performance.now());
    const velocity = inertiaTracker.velocity(performance.now());
    const shouldSpin = state.dragMode === "rotate" &&
      allowsViewerInertia(window) &&
      shouldStartViewerInertia({ dragDistancePx, velocity });
    state.dragging = false;
    state.dragMode = "";
    canvas.classList.remove("dragging");
    if (!shouldSpin) return;
    stopInertia = startViewerInertia({
      initialVelocity: velocity,
      step: (deltaBp) => {
        state.viewCenter += deltaBp;
        state.userRotated = true;
        drawCircularViewer(ctx, canvas, status, record, state);
        return true;
      }
    });
  };
  const onWindowResize = () => resize();
  const onThemeChange = () => resize();
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("sms3-theme-change", onThemeChange);

  if (showInspectorPanels) {
    const workspace = createViewerInspectorWorkspace(canvas, selectionPanel, rangePanel);
    panel.append(toolbar, searchControls.element, workspace);
  } else {
    panel.append(toolbar, searchControls.element, canvas);
  }
  requestAnimationFrame(resize);
  return {
    cleanup: () => {
      cancelInertia();
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("sms3-theme-change", onThemeChange);
    },
    snapshot: () => makeCircularViewerSnapshot(record, state, searchControls)
  };
}

export function renderCircularDnaViewer(container, viewer, viewerOptions = {}) {
  const previousSession = renderedCircularViewerSessions.get(container);
  const previousSnapshots = viewerOptions.preserveState === false
    ? []
    : previousSession?.handles?.map((handle) => handle.snapshot?.() || null) || [];
  previousSession?.cleanup?.();
  renderedCircularViewerSessions.delete(container);
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
      heading.textContent = `${record.title} (${Number(record.length || 0).toLocaleString()} bp)`;
      panel.append(heading);
    }
    container.append(panel);
    handles.push(installCircularViewer(panel, { ...record, geneticCode: viewer.geneticCode || "1" }, {
      ...viewerOptions,
      initialState: viewerInitialStateForRecord(viewerOptions, previousSnapshots, index),
      recordIndex: index
    }));
  }
  renderedCircularViewerSessions.set(container, {
    handles,
    cleanup: () => {
      for (const handle of handles) handle?.cleanup?.();
    }
  });
}
