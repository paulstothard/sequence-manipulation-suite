import { createEditorSession } from './editor-session.js';
import { createEditorPanelTabs } from './editor-panel-tabs.js';
import { installControlHelp } from './control-help.js';
import { calculateBaseSelectionMarker as calculateSangerSelectedBaseMarker } from './base-selection-marker.js';
import { addTimestampToFilename, downloadCanvasPng, downloadCanvasSvg, makeSafeFileStem } from "./canvas-export.js";
import { geneticCodes } from "../core/genetic-code.js";
import { makeSixFrameTranslations } from "../core/translation.js";
import { traceTranslationArrow } from "../core/translation-arrow-geometry.js";
import {
  allowsViewerInertia,
  createInertiaVelocityTracker,
  shouldStartViewerInertia,
  startViewerInertia
} from "./viewer-inertia.js";
import { installCanvasVisualInspection } from "./visual-inspection.js";
import { installCanvasPinchZoom } from "./viewer-pinch-zoom.js";
import { copyTextWithFeedback } from "./copy-feedback.js";

const CHANNELS = ["A", "C", "G", "T"];
const CHANNEL_COLORS = {
  A: "#2f9e44",
  C: "#1d4ed8",
  G: "#111827",
  T: "#dc2626",
  N: "#7c3aed"
};
const DARK_CHANNEL_COLORS = {
  A: "#4ade80",
  C: "#60a5fa",
  G: "#e5e7eb",
  T: "#f87171",
  N: "#c084fc"
};

function readCssValue(style, name, fallback) {
  const value = style.getPropertyValue(name).trim();
  return value || fallback;
}

function getTraceCanvasTheme(canvas) {
  const style = getComputedStyle(canvas);
  const colorScheme = style.colorScheme || getComputedStyle(document.documentElement).colorScheme || "";
  const dark = /\bdark\b/.test(colorScheme) || document.documentElement.dataset.theme === "dark";
  const surface = readCssValue(style, "--trace-surface", dark ? "#1a2026" : "#ffffff");
  const surfaceSoft = readCssValue(style, "--trace-surface-soft", dark ? "#202933" : "#f8fafc");
  const border = readCssValue(style, "--trace-border", dark ? "#394550" : "#cbd5e1");
  const borderStrong = readCssValue(style, "--trace-border-strong", dark ? "#4b5a66" : "#cbd5e1");
  const text = readCssValue(style, "--trace-text", dark ? "#eef3f6" : "#334155");
  const muted = readCssValue(style, "--trace-muted", dark ? "#a6b2bb" : "#64748b");
  const clipStartHandle = readCssValue(style, "--trace-clip-start", dark ? "#c084fc" : "#7c3aed");
  const clipEndHandle = readCssValue(style, "--trace-clip-end", dark ? "#22d3ee" : "#0891b2");
  return {
    dark,
    surface,
    surfaceSoft,
    border,
    borderStrong,
    text,
    muted,
    channelColors: dark ? DARK_CHANNEL_COLORS : CHANNEL_COLORS,
    clipped: dark ? "#687783" : "#94a3b8",
    selectedFill: dark ? "#4a3417" : "#fef3c7",
    selectedStroke: "#f59e0b",
    searchFill: dark ? "rgba(253, 224, 71, 0.14)" : "rgba(253, 224, 71, 0.18)",
    searchActiveFill: dark ? "rgba(250, 204, 21, 0.24)" : "rgba(250, 204, 21, 0.32)",
    lowQuality: "#f59e0b",
    qualityBar: dark ? "#94a3b8" : "#64748b",
    clipShade: dark ? "rgba(5, 10, 15, 0.62)" : "rgba(15, 23, 42, 0.28)",
    translationForwardFill: dark ? "#17345f" : "#dbeafe",
    translationForwardText: dark ? "#93c5fd" : "#1d4ed8",
    translationReverseFill: dark ? "#35235d" : "#ede9fe",
    translationReverseText: dark ? "#c4b5fd" : "#6d28d9",
    translationStopFill: dark ? "#5f2028" : "#fee2e2",
    translationStopText: dark ? "#fca5a5" : "#b91c1c",
    translationUnknownFill: dark ? "#34404b" : "#e2e8f0",
    translationUnknownText: dark ? "#cbd5e1" : "#475569",
    clipStartHandle,
    clipEndHandle
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function qualityAxisMax(baseCalls, threshold) {
  const qualityValues = baseCalls
    .map((call) => Number(call.quality))
    .filter((quality) => Number.isFinite(quality));
  const observedMax = qualityValues.length ? Math.max(...qualityValues) : 0;
  const minimumUsefulMax = Math.max(40, threshold + 10);
  return clamp(Math.ceil(Math.max(observedMax, minimumUsefulMax) / 5) * 5, 40, 93);
}

export function calculateSangerTraceQualityLayout({ plotTop, plotHeight, qualityMax, lowQualityThreshold }) {
  const qualityTop = plotTop + plotHeight + 25;
  const qualityHeight = 30;
  const thresholdY = qualityTop + qualityHeight - (lowQualityThreshold / Math.max(1, qualityMax)) * qualityHeight;
  const maxLabelY = qualityTop + 6;
  const zeroLabelY = qualityTop + qualityHeight - 4;
  return {
    titleY: qualityTop - 8,
    qualityTop,
    qualityHeight,
    thresholdY,
    maxLabelY,
    thresholdLabelY: clamp(thresholdY, maxLabelY + 10, zeroLabelY - 10),
    zeroLabelY
  };
}

export function calculateSangerTraceCanvasLayout({ showForwardTranslations = false, showReverseTranslations = false } = {}) {
  const translationFrameCount = (showForwardTranslations ? 3 : 0) + (showReverseTranslations ? 3 : 0);
  const translationRowHeight = 20;
  const forwardTranslationHeight = showForwardTranslations ? 3 * translationRowHeight : 0;
  const baseLabelY = 38 + forwardTranslationHeight;
  const translationHeight = translationFrameCount * translationRowHeight;
  return {
    baseHeight: 370,
    baseLabelY,
    canvasHeight: 370 + translationHeight,
    plotTop: 86 + translationHeight,
    translationFrameCount,
    translationHeight,
    translationRowHeight,
    forwardTranslationTop: 26,
    reverseTranslationTop: baseLabelY + 16
  };
}

export { calculateSangerSelectedBaseMarker };

function makeButton(label, title = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (title !== label) button.dataset.controlHelp = title;
  return button;
}

function formatFasta(title, sequence, width = 80) {
  const lines = [`>${title}`];
  for (let index = 0; index < sequence.length; index += width) {
    lines.push(sequence.slice(index, index + width));
  }
  return `${lines.join("\n")}\n`;
}

function makeFastq(title, calls) {
  const sequence = calls.map((call) => call.base).join("");
  const qualities = calls.map((call) =>
    String.fromCharCode(clamp(Number(call.quality) || 0, 0, 93) + 33)
  ).join("");
  return `@${title}\n${sequence}\n+\n${qualities}\n`;
}

function downloadText(text, filename, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = addTimestampToFilename(filename);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sequenceTitle(state, calls = retainedCalls(state)) {
  const first = calls[0]?.originalIndex ?? state.clipStart;
  const last = calls[calls.length - 1]?.originalIndex ?? state.clipEnd;
  const start = Math.min(first, last);
  const end = Math.max(first, last);
  const edited = calls.some((call) => call.edited) ? "_edited" : "";
  return `${makeSafeFileStem(state.data.record, "sanger-trace")}_bases_${start}_${end}_${state.data.orientation}${edited}`;
}

function retainedCalls(state) {
  return state.calls.filter((call) => call.displayIndex >= state.clipStart && call.displayIndex <= state.clipEnd);
}

function exportCalls(state) {
  return state.excludeClippedBases ? retainedCalls(state) : state.calls;
}

function sequenceForState(state) {
  return exportCalls(state).map((call) => call.base).join("");
}

function fullSequenceForState(state) {
  return state.calls.map((call) => call.base).join("");
}

function translationFramesForState(state) {
  if (!state.showForwardTranslations && !state.showReverseTranslations) {
    return [];
  }
  return makeSixFrameTranslations(fullSequenceForState(state), { geneticCode: state.geneticCode })
    .filter((frame) => frame.strand === "+"
      ? state.showForwardTranslations
      : state.showReverseTranslations);
}

function basesPerVisibleWidth(state) {
  return Math.max(12, Math.round(100 / state.zoom));
}

function visibleCalls(state) {
  const perWidth = basesPerVisibleWidth(state);
  const maxStart = Math.max(1, state.calls.length - perWidth + 1);
  state.visibleStart = clamp(state.visibleStart, 1, maxStart);
  const firstVisible = Math.floor(state.visibleStart);
  return state.calls.filter((call) => call.displayIndex >= firstVisible && call.displayIndex < firstVisible + perWidth);
}

function canvasCoordinates(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return { rect, scaleX, scaleY };
}

function selectedCall(state) {
  return state.calls.find((call) => call.displayIndex === state.selectedIndex) ?? null;
}

function findNearestHitBox(canvas, state, event) {
  const { rect, scaleX } = canvasCoordinates(canvas);
  const x = (event.clientX - rect.left) * scaleX / (window.devicePixelRatio || 1);
  if (!state.hitBoxes?.length) {
    return null;
  }
  return state.hitBoxes.reduce((best, item) =>
    Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best
  );
}

function findClipHandle(canvas, state, event) {
  const { rect, scaleX, scaleY } = canvasCoordinates(canvas);
  const x = (event.clientX - rect.left) * scaleX / (window.devicePixelRatio || 1);
  const y = (event.clientY - rect.top) * scaleY / (window.devicePixelRatio || 1);
  return (state.clipHitBoxes ?? []).find((handle) =>
    Math.abs(handle.x - x) <= handle.width / 2 &&
    y >= handle.top &&
    y <= handle.bottom
  ) ?? null;
}

function findTranslationHitBox(canvas, state, event) {
  const { rect, scaleX, scaleY } = canvasCoordinates(canvas);
  const x = (event.clientX - rect.left) * scaleX / (window.devicePixelRatio || 1);
  const y = (event.clientY - rect.top) * scaleY / (window.devicePixelRatio || 1);
  return (state.translationHitBoxes ?? []).find((item) =>
    x >= item.left && x <= item.right && y >= item.top && y <= item.bottom
  ) ?? null;
}

function qualityText(call) {
  return call.quality === null || call.quality === undefined
    ? "Q n/a"
    : `Q${call.quality} ${call.syntheticQuality ? "synthetic quality" : "Phred quality"}`;
}

export function describeSangerInspectionTarget(target, state = {}) {
  if (target?.kind === "clip-handle") {
    return `Drag the ${target.type === "clip-start" ? "5'" : "3'"} clip handle to change the ${target.type === "clip-start" ? "first" : "last"} unclipped base. Clipped bases are shaded, not deleted. Changes apply immediately; Undo restores the previous range.`;
  }
  if (target?.kind === "translation") {
    return `${target.frameLabel}: ${target.aminoAcid}; codon ${target.codon}; displayed bases ${target.directStart}-${target.directEnd}; genetic code ${state.geneticCode || "1"}.`;
  }
  const call = target?.call;
  if (!call) return "";
  return `Base ${call.displayIndex}: ${call.base}; original base ${call.originalBase}; original trace position ${call.originalTracePosition}; ${qualityText(call)}.`;
}

function findSangerInspectionTarget(canvas, state, event) {
  const clipHandle = findClipHandle(canvas, state, event);
  if (clipHandle) return { kind: "clip-handle", ...clipHandle };
  const translation = findTranslationHitBox(canvas, state, event);
  if (translation) return { kind: "translation", ...translation };
  const base = findNearestHitBox(canvas, state, event);
  return base ? { kind: "base-call", ...base } : null;
}

function sangerInspectionTargetKey(target) {
  if (target?.kind === "clip-handle") return target.type;
  if (target?.kind === "translation") return `${target.frameLabel}:${target.directStart}:${target.directEnd}`;
  return target?.call ? `base:${target.call.displayIndex}` : "";
}

function sangerInspectionTargetPosition(canvas, target) {
  if (!target) return null;
  const { rect, scaleX, scaleY } = canvasCoordinates(canvas);
  const pixelRatio = window.devicePixelRatio || 1;
  const x = target.kind === "translation"
    ? (target.left + target.right) / 2
    : target.x;
  const y = target.kind === "translation"
    ? (target.top + target.bottom) / 2
    : target.kind === "clip-handle"
      ? (target.top + target.bottom) / 2
      : target.plot.top + Math.min(28, target.plot.height / 3);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    clientX: rect.left + x * pixelRatio / scaleX,
    clientY: rect.top + y * pixelRatio / scaleY
  };
}

function setStatus(panel, message) {
  panel.querySelector("[data-sanger-control='status']").textContent = message;
}

function normalizeSearchQuery(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase().replace(/U/g, "T").replace(/[^ACGTNRYKMSWBDHV]/g, "");
}

function updateSearchMatches(state) {
  const query = normalizeSearchQuery(state.searchQuery);
  state.searchQuery = query;
  state.searchMatches = [];
  state.searchMatchIndex = -1;
  if (!query) {
    return;
  }
  const sequence = fullSequenceForState(state);
  let start = 0;
  while (start <= sequence.length - query.length) {
    const index = sequence.indexOf(query, start);
    if (index < 0) {
      break;
    }
    state.searchMatches.push({
      start: index + 1,
      end: index + query.length
    });
    start = index + 1;
  }
  if (state.searchMatches.length > 0) {
    state.searchMatchIndex = 0;
  }
}

function activeSearchMatch(state) {
  return state.searchMatches?.[state.searchMatchIndex] ?? null;
}

function callSearchState(state, displayIndex) {
  let inMatch = false;
  let inActiveMatch = false;
  for (const match of state.searchMatches ?? []) {
    if (displayIndex >= match.start && displayIndex <= match.end) {
      inMatch = true;
      if (match === activeSearchMatch(state)) {
        inActiveMatch = true;
      }
    }
  }
  return { inMatch, inActiveMatch };
}

function syncSearchControls(panel, state) {
  const searchInput = panel.querySelector("[data-sanger-control='search']");
  const searchInfo = panel.querySelector("[data-sanger-control='searchInfo']");
  if (searchInput && searchInput.value !== state.searchQuery) {
    searchInput.value = state.searchQuery;
  }
  if (!searchInfo) {
    return;
  }
  if (!state.searchQuery) {
    searchInfo.textContent = "No search";
  } else if (!state.searchMatches.length) {
    searchInfo.textContent = "0 matches";
  } else {
    searchInfo.textContent = `${state.searchMatchIndex + 1} of ${state.searchMatches.length}`;
  }
}

function updateDetails(panel, state) {
  const details = panel.querySelector("[data-sanger-control='details']");
  const call = selectedCall(state);
  if (!call) {
    details.textContent = "Click a base label or peak to select a base call.";
    return;
  }
  const selected = document.createElement("strong");
  selected.textContent = `Selected base ${call.displayIndex.toLocaleString()}: ${call.base}${call.edited ? " · edited" : ""}`;
  const context = document.createElement("span");
  context.textContent = `${qualityText(call)} · Original base ${call.originalBase} · Trace position ${call.originalTracePosition.toLocaleString()}`;
  details.replaceChildren(selected, context);
}

function syncControls(panel, state) {
  // Resizing and theme redraws must not overwrite a draft control value.
  const syncValue = (name, value, key = value) => {
    const input = panel.querySelector(`[data-sanger-control="${name}"]`);
    if (input.dataset.syncedValue !== String(key)) {
      input.value = String(value);
      input.dataset.syncedValue = String(key);
    }
  };
  syncValue("clipStart", state.clipStart);
  syncValue("clipEnd", state.clipEnd);
  const base = selectedCall(state)?.base ?? "N";
  syncValue("editBase", base, `${state.selectedIndex}:${base}`);
  const visibleStart = Math.floor(state.visibleStart);
  const visibleEnd = Math.min(state.calls.length, visibleStart + basesPerVisibleWidth(state) - 1);
  panel.querySelector("[data-sanger-control='viewInfo']").textContent =
    `View ${visibleStart.toLocaleString()}-${visibleEnd.toLocaleString()} of ${state.calls.length.toLocaleString()} bases; zoom ${state.zoom.toFixed(1)}x.`;
  for (const label of panel.querySelectorAll('[data-sanger-control="retainedRange"]')) {
    label.textContent = `Retained bases ${state.clipStart.toLocaleString()}-${state.clipEnd.toLocaleString()} (${(state.clipEnd - state.clipStart + 1).toLocaleString()} bases)`;
  }
  panel.querySelector('[data-sanger-control="clippingSummary"]').textContent =
    `${(state.clipEnd - state.clipStart + 1).toLocaleString()} of ${state.calls.length.toLocaleString()} bases unclipped`;
  panel.querySelector('[data-sanger-control="excludeClippedBases"]').checked = state.excludeClippedBases;
  panel.querySelector('[data-sanger-control="exportRange"]').textContent = state.excludeClippedBases
    ? `Bases ${state.clipStart.toLocaleString()}–${state.clipEnd.toLocaleString()} (${(state.clipEnd - state.clipStart + 1).toLocaleString()} bases)`
    : `All ${state.calls.length.toLocaleString()} bases`;
  const forwardButton = panel.querySelector("[data-sanger-control='forwardTranslations']");
  const reverseButton = panel.querySelector("[data-sanger-control='reverseTranslations']");
  const geneticCode = panel.querySelector("[data-sanger-control='geneticCode']");
  forwardButton?.setAttribute("aria-pressed", String(state.showForwardTranslations));
  reverseButton?.setAttribute("aria-pressed", String(state.showReverseTranslations));
  forwardButton?.classList.toggle("is-active", state.showForwardTranslations);
  reverseButton?.classList.toggle("is-active", state.showReverseTranslations);
  if (geneticCode && geneticCode.value !== state.geneticCode) {
    geneticCode.value = state.geneticCode;
  }
  syncSearchControls(panel, state);
  updateDetails(panel, state);
}

function translationColors(theme, frame, aminoAcid) {
  if (aminoAcid === "*") {
    return { fill: theme.translationStopFill, text: theme.translationStopText };
  }
  if (aminoAcid === "X") {
    return { fill: theme.translationUnknownFill, text: theme.translationUnknownText };
  }
  return frame.strand === "+"
    ? { fill: theme.translationForwardFill, text: theme.translationForwardText }
    : { fill: theme.translationReverseFill, text: theme.translationReverseText };
}

function drawTranslationTracks(context, state, calls, plot, xForPosition, layout, theme) {
  const frames = translationFramesForState(state);
  state.translationHitBoxes = [];
  if (frames.length === 0) {
    return;
  }
  const firstVisible = calls[0].displayIndex;
  const lastVisible = calls[calls.length - 1].displayIndex;
  const boundaryForIndex = (position, side) => {
    const call = state.calls[position - 1];
    const x = xForPosition(call.tracePosition);
    const neighbor = state.calls[position - 1 + (side === "left" ? -1 : 1)];
    if (neighbor) return (x + xForPosition(neighbor.tracePosition)) / 2;
    const innerNeighbor = state.calls[position - 1 + (side === "left" ? 1 : -1)];
    return x + (x - xForPosition(innerNeighbor.tracePosition)) / 2;
  };

  context.save();
  context.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textBaseline = "middle";
  frames.forEach((frame) => {
    const strandTop = frame.strand === "+" ? layout.forwardTranslationTop : layout.reverseTranslationTop;
    const top = strandTop + frame.offset * layout.translationRowHeight;
    const centerY = top + 8;
    context.textAlign = "right";
    context.fillStyle = frame.strand === "+" ? theme.translationForwardText : theme.translationReverseText;
    context.fillText(frame.label, plot.left - 7, centerY);
    const visibleCodons = frame.codons.filter((codon) =>
      Math.max(firstVisible, codon.directStart) <= Math.min(lastVisible, codon.directEnd));
    context.save();
    context.beginPath();
    context.rect(plot.left, top - 1, plot.width, 18);
    context.clip();
    for (const codon of visibleCodons) {
      // Crop the complete codon at the viewport edge without reshaping its arrow.
      const left = boundaryForIndex(codon.directStart, "left");
      const right = boundaryForIndex(codon.directEnd, "right");
      const colors = translationColors(theme, frame, codon.aminoAcid);
      const clipped = codon.directStart < state.clipStart || codon.directEnd > state.clipEnd;
      context.globalAlpha = clipped ? 0.42 : 1;
      context.fillStyle = colors.fill;
      context.strokeStyle = theme.border;
      context.lineWidth = 0.7;
      context.lineJoin = "round";
      traceTranslationArrow(context, left, top, Math.max(1, right - left), 16, frame.strand);
      context.fill();
      context.stroke();
      if (codon.centerPosition >= firstVisible && codon.centerPosition <= lastVisible) {
        const centerCall = state.calls[codon.centerPosition - 1];
        context.textAlign = "center";
        context.fillStyle = colors.text;
        context.fillText(codon.aminoAcid, xForPosition(centerCall.tracePosition), centerY);
      }
      context.globalAlpha = 1;
      state.translationHitBoxes.push({
        ...codon,
        frame: frame.frame,
        frameLabel: frame.label,
        left: Math.max(left, plot.left),
        right: Math.min(right, plot.left + plot.width),
        top,
        bottom: top + 16
      });
    }
    context.restore();
  });
  context.restore();
}

function getClipGeometry(state, calls, plot, xForPosition) {
  const firstIndex = calls[0].displayIndex;
  const lastIndex = calls[calls.length - 1].displayIndex;
  const xForCall = (displayIndex) => {
    const call = state.calls[displayIndex - 1];
    return call ? xForPosition(call.tracePosition) : null;
  };
  const step = calls.length > 1
    ? Math.abs(xForPosition(calls[1].tracePosition) - xForPosition(calls[0].tracePosition))
    : plot.width / Math.max(1, basesPerVisibleWidth(state));

  const regions = [];
  if (state.clipStart > firstIndex) {
    const boundary = state.clipStart <= lastIndex
      ? clamp((xForCall(state.clipStart) ?? plot.left) - step / 2, plot.left, plot.left + plot.width)
      : plot.left + plot.width;
    regions.push({ left: plot.left, width: boundary - plot.left });
  }
  if (state.clipEnd < lastIndex) {
    const boundary = state.clipEnd >= firstIndex
      ? clamp((xForCall(state.clipEnd) ?? plot.left + plot.width) + step / 2, plot.left, plot.left + plot.width)
      : plot.left;
    regions.push({ left: boundary, width: plot.left + plot.width - boundary });
  }

  return { firstIndex, lastIndex, regions, step };
}

function drawClipShading(context, state, calls, plot, xForPosition, theme) {
  const { regions } = getClipGeometry(state, calls, plot, xForPosition);
  context.save();
  context.fillStyle = theme.clipShade;
  for (const region of regions) {
    if (region.width > 0) {
      context.fillRect(region.left, plot.top, region.width, plot.height);
    }
  }
  context.restore();
}

function drawClipHandles(context, state, calls, plot, xForPosition, theme) {
  const { firstIndex, lastIndex, step } = getClipGeometry(state, calls, plot, xForPosition);
  state.clipHitBoxes = [];
  const drawHandle = (displayIndex, type, offset) => {
    if (displayIndex < firstIndex || displayIndex > lastIndex) return;
    const call = state.calls[displayIndex - 1];
    if (!call) return;
    const x = clamp(xForPosition(call.tracePosition) + offset * step / 2, plot.left, plot.left + plot.width);
    const color = type === "clip-start" ? theme.clipStartHandle : theme.clipEndHandle;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, plot.top);
    context.lineTo(x, plot.top + plot.height);
    context.stroke();
    context.restore();
    state.clipHitBoxes.push({
      type,
      x,
      top: plot.top - 10,
      bottom: plot.top + plot.height + 8,
      width: 32
    });
  };

  drawHandle(state.clipStart, "clip-start", -1);
  drawHandle(state.clipEnd, "clip-end", 1);
}

function drawTrace(canvas, state) {
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const theme = getTraceCanvasTheme(canvas);
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(720, Math.floor(rect.width * dpr));
  const height = Math.max(360, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssWidth = width / dpr;
  const cssHeight = height / dpr;
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = theme.surface;
  context.fillRect(0, 0, cssWidth, cssHeight);

  const layout = calculateSangerTraceCanvasLayout(state);
  const margin = { left: 54, right: 22, top: layout.plotTop, bottom: 62 };
  const plot = {
    left: margin.left,
    top: margin.top,
    width: cssWidth - margin.left - margin.right,
    height: cssHeight - margin.top - margin.bottom,
    baseLabelY: layout.baseLabelY
  };
  context.fillStyle = theme.surfaceSoft;
  context.strokeStyle = theme.borderStrong;
  context.lineWidth = 1;
  context.fillRect(plot.left, plot.top, plot.width, plot.height);
  context.strokeRect(plot.left, plot.top, plot.width, plot.height);

  const calls = visibleCalls(state);
  if (calls.length === 0) {
    return;
  }
  const firstPosition = Math.max(1, Math.min(...calls.map((call) => call.tracePosition)) - 14);
  const lastPosition = Math.min(state.data.sampleCount, Math.max(...calls.map((call) => call.tracePosition)) + 14);
  const sampleSpan = Math.max(1, lastPosition - firstPosition);
  const xForPosition = (position) => plot.left + ((position - firstPosition) / sampleSpan) * plot.width;
  drawTranslationTracks(context, state, calls, plot, xForPosition, layout, theme);

  let maxSignal = 1;
  for (const channel of CHANNELS) {
    const values = state.data.traces[channel] ?? [];
    for (let index = firstPosition - 1; index < lastPosition; index += 1) {
      maxSignal = Math.max(maxSignal, values[index] ?? 0);
    }
  }

  context.save();
  context.beginPath();
  context.rect(plot.left, plot.top, plot.width, plot.height);
  context.clip();
  for (const channel of CHANNELS) {
    const values = state.data.traces[channel] ?? [];
    context.beginPath();
    context.strokeStyle = theme.channelColors[channel];
    context.lineWidth = 1.35;
    for (let index = firstPosition - 1; index < lastPosition; index += 1) {
      const x = xForPosition(index + 1);
      const y = plot.top + plot.height - ((values[index] ?? 0) / maxSignal) * plot.height;
      if (index === firstPosition - 1) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
  }
  context.restore();
  drawClipShading(context, state, calls, plot, xForPosition, theme);
  drawClipHandles(context, state, calls, plot, xForPosition, theme);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (const call of calls) {
    const x = xForPosition(call.tracePosition);
    const isClipped = call.displayIndex < state.clipStart || call.displayIndex > state.clipEnd;
    const isSelected = call.displayIndex === state.selectedIndex;
    const searchState = callSearchState(state, call.displayIndex);
    if (searchState.inMatch) {
      context.fillStyle = searchState.inActiveMatch ? theme.searchActiveFill : theme.searchFill;
      context.fillRect(x - 6, plot.baseLabelY - 15, 12, plot.height + plot.top - plot.baseLabelY + 20);
    }
    if (isSelected) {
      const neighbors = [state.calls[call.displayIndex - 2], state.calls[call.displayIndex]].filter(Boolean);
      const spacing = Math.min(...neighbors.map(neighbor => Math.abs(xForPosition(neighbor.tracePosition) - x)));
      const marker = calculateSangerSelectedBaseMarker(x, plot.baseLabelY, context.measureText(call.base), spacing);
      context.save();
      context.fillStyle = theme.selectedFill;
      context.strokeStyle = theme.selectedStroke;
      context.lineWidth = 1;
      context.beginPath();
      if (typeof context.roundRect === "function") {
        context.roundRect(marker.left, marker.top, marker.width, marker.height, marker.radius);
      } else {
        const right = marker.left + marker.width;
        const bottom = marker.top + marker.height;
        context.moveTo(marker.left + marker.radius, marker.top);
        context.lineTo(right - marker.radius, marker.top);
        context.quadraticCurveTo(right, marker.top, right, marker.top + marker.radius);
        context.lineTo(right, bottom - marker.radius);
        context.quadraticCurveTo(right, bottom, right - marker.radius, bottom);
        context.lineTo(marker.left + marker.radius, bottom);
        context.quadraticCurveTo(marker.left, bottom, marker.left, bottom - marker.radius);
        context.lineTo(marker.left, marker.top + marker.radius);
        context.quadraticCurveTo(marker.left, marker.top, marker.left + marker.radius, marker.top);
        context.closePath();
      }
      context.fill();
      context.stroke();
      context.restore();
    }
    context.fillStyle = isClipped ? theme.clipped : (theme.channelColors[call.base] ?? theme.channelColors.N);
    context.fillText(call.base, x, plot.baseLabelY);
    context.strokeStyle = isSelected ? theme.selectedStroke : theme.borderStrong;
    context.beginPath();
    context.moveTo(x, plot.top + plot.height);
    context.lineTo(x, plot.top + plot.height + (isSelected ? 12 : 5));
    context.stroke();
  }

  context.textAlign = "left";
  context.font = "700 12px system-ui, sans-serif";
  context.fillStyle = theme.text;
  context.fillText(`Bases ${calls[0].displayIndex}-${calls[calls.length - 1].displayIndex}`, plot.left, 16);
  context.font = "11px system-ui, sans-serif";
  context.fillStyle = theme.muted;
  context.fillText("signal", 10, plot.top + 4);

  const qualityMax = qualityAxisMax(calls, state.data.lowQualityThreshold);
  const qualityLayout = calculateSangerTraceQualityLayout({
    plotTop: plot.top,
    plotHeight: plot.height,
    qualityMax,
    lowQualityThreshold: state.data.lowQualityThreshold
  });
  context.fillStyle = theme.surfaceSoft;
  context.strokeStyle = theme.border;
  context.fillRect(plot.left, qualityLayout.qualityTop, plot.width, qualityLayout.qualityHeight);
  context.strokeRect(plot.left, qualityLayout.qualityTop, plot.width, qualityLayout.qualityHeight);
  for (const call of calls) {
    const x = xForPosition(call.tracePosition);
    const quality = Math.min(Number(call.quality) || 0, qualityMax);
    const barHeight = (quality / qualityMax) * qualityLayout.qualityHeight;
    const isClipped = call.displayIndex < state.clipStart || call.displayIndex > state.clipEnd;
    context.fillStyle = isClipped
      ? theme.clipped
      : quality < state.data.lowQualityThreshold
        ? theme.lowQuality
        : theme.qualityBar;
    context.fillRect(x - 2, qualityLayout.qualityTop + qualityLayout.qualityHeight - barHeight, 4, barHeight);
  }
  context.strokeStyle = theme.lowQuality;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(plot.left, qualityLayout.thresholdY);
  context.lineTo(plot.left + plot.width, qualityLayout.thresholdY);
  context.stroke();
  context.setLineDash([]);
  context.font = "700 11px system-ui, sans-serif";
  context.fillStyle = theme.text;
  context.fillText("Quality", plot.left, qualityLayout.titleY);
  context.font = "10px system-ui, sans-serif";
  context.textBaseline = "middle";
  context.fillStyle = theme.muted;
  context.textAlign = "right";
  context.fillText(`Q${qualityMax}`, plot.left - 6, qualityLayout.maxLabelY);
  context.fillStyle = theme.lowQuality;
  context.fillText(`Q${state.data.lowQualityThreshold}`, plot.left - 6, qualityLayout.thresholdLabelY);
  context.fillStyle = theme.muted;
  context.fillText("Q0", plot.left - 6, qualityLayout.zeroLabelY);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  state.hitBoxes = calls.map((call) => ({
    call,
    x: xForPosition(call.tracePosition),
    y: plot.top,
    width: Math.max(10, plot.width / Math.max(1, calls.length)),
    plot
  }));
}

function selectNearestBase(canvas, state, event) {
  const nearest = findNearestHitBox(canvas, state, event);
  if (!nearest) {
    return;
  }
  state.selectedIndex = nearest.call.displayIndex;
}

function panByBases(state, delta) {
  const perWidth = basesPerVisibleWidth(state);
  const maxStart = Math.max(1, state.calls.length - perWidth + 1);
  const before = state.visibleStart;
  state.visibleStart = clamp(state.visibleStart + delta, 1, maxStart);
  return before !== state.visibleStart;
}

function baseIndexFromPointer(canvas, state, event) {
  return findNearestHitBox(canvas, state, event)?.call.displayIndex ?? state.selectedIndex ?? 1;
}

function setClipBoundary(state, type, index) {
  const value = clamp(Math.round(index), 1, state.calls.length);
  if (type === "clip-start") {
    state.clipStart = clamp(value, 1, state.clipEnd);
    state.selectedIndex = state.clipStart;
    return;
  }
  state.clipEnd = clamp(value, state.clipStart, state.calls.length);
  state.selectedIndex = state.clipEnd;
}

function renderSingleSangerTraceViewer(container, data, documentActions) {
  const cleanupController = new AbortController();
  const listenerOptions = { signal: cleanupController.signal };
  const passiveWheelOptions = { passive: false, signal: cleanupController.signal };
  const panel = document.createElement("section");
  panel.className = "sanger-trace-panel";

  const toolbar = document.createElement("div");
  toolbar.className = "sanger-trace-toolbar";
  const title = document.createElement("div");
  title.className = "sanger-trace-title";
  title.textContent = data.record || "Sanger trace";
  const viewInfo = document.createElement("span");
  viewInfo.className = "sanger-trace-view-info";
  viewInfo.dataset.sangerControl = "viewInfo";

  const zoomOut = makeButton("-", "Zoom out from the center of the current view");
  const zoomIn = makeButton("+", "Zoom in at the center of the current view");
  zoomOut.setAttribute("aria-label", "Zoom out");
  zoomIn.setAttribute("aria-label", "Zoom in");
  const reset = makeButton("Reset view", "Restore the default zoom and show the start of the retained read. Edits and clipping are preserved.");
  const previousBase = makeButton("‹", "Select the previous base in the read.");
  previousBase.setAttribute("aria-label", "Previous base");
  const nextBase = makeButton("›", "Select the next base in the read.");
  nextBase.setAttribute("aria-label", "Next base");
  const jumpStart = makeButton("Go to 5′ end", "Show and select the first base of the full read.");
  const jumpEnd = makeButton("Go to 3′ end", "Show and select the last base of the full read.");
  const forwardTranslations = makeButton("+ translations", "Show or hide forward translation frames +1, +2, and +3");
  forwardTranslations.dataset.sangerControl = "forwardTranslations";
  const reverseTranslations = makeButton("− translations", "Show or hide reverse-complement translation frames -1, -2, and -3");
  reverseTranslations.dataset.sangerControl = "reverseTranslations";
  for (const button of [forwardTranslations, reverseTranslations]) {
    button.setAttribute("aria-label", button.textContent);
    const check = document.createElement("span");
    check.className = "sanger-trace-toggle-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    button.prepend(check);
  }
  const geneticCode = document.createElement("select");
  geneticCode.className = "sanger-trace-genetic-code";
  geneticCode.dataset.sangerControl = "geneticCode";
  geneticCode.setAttribute("aria-label", "Trace translation genetic code");
  geneticCode.dataset.controlHelp = "Genetic code for the trace translation tracks.";
  for (const code of geneticCodes) {
    const option = document.createElement("option");
    option.value = code.id;
    option.textContent = `${code.id}. ${code.name}`;
    geneticCode.append(option);
  }
  const navGroup = document.createElement("div");
  navGroup.className = "sanger-trace-toolbar-buttons";
  navGroup.append(
    zoomOut,
    zoomIn,
    reset,
    jumpStart,
    jumpEnd
  );
  toolbar.append(title);
  const navigation = document.createElement("div");
  navigation.className = "sanger-trace-navigation";
  navigation.append(navGroup, viewInfo);

  const canvas = document.createElement("canvas");
  canvas.className = "sanger-trace-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Interactive Sanger chromatogram");

  const controls = document.createElement("div");
  controls.className = "sanger-trace-controls";

  const clipStart = document.createElement("input");
  clipStart.type = "number";
  clipStart.min = "1";
  clipStart.max = String(data.baseCalls.length);
  clipStart.dataset.controlHelp = "First unclipped base, numbered from 1 and included in the range. Earlier bases are shaded, not deleted. Valid changes apply as you type.";
  clipStart.dataset.sangerControl = "clipStart";
  const clipEnd = document.createElement("input");
  clipEnd.type = "number";
  clipEnd.min = "1";
  clipEnd.max = String(data.baseCalls.length);
  clipEnd.dataset.controlHelp = "Last unclipped base, included in the range. Later bases are shaded, not deleted. Valid changes apply as you type.";
  clipEnd.dataset.sangerControl = "clipEnd";
  clipStart.required = true;
  clipEnd.required = true;

  const editBase = document.createElement("select");
  editBase.dataset.sangerControl = "editBase";
  for (const base of ["A", "C", "G", "T", "N"]) {
    const option = document.createElement("option");
    option.value = base;
    option.textContent = base;
    editBase.append(option);
  }
  const applyEdit = makeButton("Replace base", "Replace the selected base with the chosen letter. Undo restores the previous base call.");

  const copyFasta = makeButton("Copy FASTA");
  const copyFastq = makeButton("Copy FASTQ");
  const downloadFasta = makeButton("Download FASTA");
  const downloadFastq = makeButton("Download FASTQ");
  const downloadPng = makeButton("Download PNG", "Download the current trace view as PNG");
  const downloadSvg = makeButton("Download SVG", "Download the current trace view as SVG-wrapped canvas image");
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "ACGT...";
  searchInput.autocomplete = "off";
  searchInput.setAttribute("autocorrect", "off");
  searchInput.setAttribute("autocapitalize", "off");
  searchInput.setAttribute("writingsuggestions", "false");
  searchInput.spellcheck = false;
  searchInput.dataset.sangerControl = "search";
  const previousMatch = makeButton("Prev", "Previous sequence search match");
  const nextMatch = makeButton("Next", "Next sequence search match");
  const clearSearch = makeButton("Clear", "Clear sequence search");
  const searchInfo = document.createElement("span");
  searchInfo.className = "sanger-trace-search-info";
  searchInfo.dataset.sangerControl = "searchInfo";

  const addGroup = (parent, titleText) => {
    const group = document.createElement("div");
    group.className = "sanger-trace-control-group";
    const heading = document.createElement("div");
    heading.className = "sanger-trace-control-heading";
    heading.textContent = titleText;
    group.append(heading);
    parent.append(group);
    return group;
  };
  const addField = (parent, labelText, control, labelClassName = "") => {
    const label = document.createElement("label");
    label.className = "sanger-trace-field";
    const span = document.createElement("span");
    span.textContent = labelText;
    if (labelClassName) {
      span.classList.add(labelClassName);
    }
    label.append(span, control);
    parent.append(label);
  };
  const editPanel = document.createElement("div");
  editPanel.className = "sanger-trace-tab-panel";
  const displayPanel = document.createElement("div");
  displayPanel.className = "sanger-trace-tab-panel";
  const exportPanel = document.createElement("div");
  exportPanel.className = "sanger-trace-tab-panel sanger-trace-export-panel";
  const tabs = createEditorPanelTabs("Sanger trace controls", [
    { id: "edit", label: "Edit", panel: editPanel },
    { id: "display", label: "Display", panel: displayPanel },
    { id: "export", label: "Export", panel: exportPanel }
  ]);
  const editGroup = addGroup(editPanel, "Base call");
  const details = document.createElement("p");
  details.className = "sanger-trace-details";
  details.dataset.sangerControl = "details";
  editGroup.classList.add("sanger-trace-base-edit");
  const baseActions = document.createElement("div");
  baseActions.className = "sanger-trace-base-actions";
  const baseNavigation = document.createElement("div");
  baseNavigation.className = "sanger-trace-base-navigation";
  baseNavigation.append(previousBase, nextBase);
  baseActions.append(baseNavigation);
  addField(baseActions, "New base", editBase);
  baseActions.append(applyEdit);
  editGroup.append(details, baseActions);
  const clipGroup = addGroup(editPanel, "Clipping");
  clipGroup.classList.add("sanger-trace-clipping");
  const clippingSummary = document.createElement("p");
  clippingSummary.className = "sanger-trace-clipping-summary";
  clippingSummary.dataset.sangerControl = "clippingSummary";
  const clippingHint = document.createElement("p");
  clippingHint.className = "sanger-trace-clipping-hint";
  clippingHint.textContent = "Drag the bars or type coordinates. Bases outside this range are shaded, not deleted.";
  const coordinateFields = document.createElement("div");
  coordinateFields.className = "sanger-trace-clip-fields";
  addField(coordinateFields, "5′ clip", clipStart, "sanger-trace-clip-start-label");
  addField(coordinateFields, "3′ clip", clipEnd, "sanger-trace-clip-end-label");
  const clippingError = document.createElement("p");
  clippingError.className = "sanger-trace-clip-error";
  clippingError.setAttribute("role", "alert");
  clippingError.hidden = true;
  clipGroup.append(coordinateFields, clippingSummary, clippingHint, clippingError);

  const searchGroup = document.createElement("div");
  searchGroup.className = "sanger-trace-search";
  addField(searchGroup, "Find sequence", searchInput);
  searchGroup.append(previousMatch, nextMatch, clearSearch, searchInfo);
  const translations = addGroup(displayPanel, "Translation tracks");
  translations.classList.add("sanger-trace-translations");
  const translationToggles = document.createElement("div");
  translationToggles.className = "sanger-trace-translation-toggles";
  translationToggles.append(forwardTranslations, reverseTranslations);
  translations.append(translationToggles);
  addField(translations, "Genetic code", geneticCode);
  const addExportRow = (titleText) => {
    const row = addGroup(exportPanel, titleText);
    const description = document.createElement("div");
    description.className = "sanger-trace-export-description";
    description.append(row.firstElementChild);
    row.append(description);
    return { row, description };
  };
  const sequenceExport = addExportRow("Sequence");
  const exportRange = document.createElement("span");
  exportRange.className = "sanger-trace-export-scope";
  exportRange.dataset.sangerControl = "exportRange";
  const exportClipLabel = document.createElement("label");
  exportClipLabel.className = "sanger-trace-export-clipping";
  const excludeClipped = document.createElement("input");
  excludeClipped.type = "checkbox";
  excludeClipped.dataset.sangerControl = "excludeClippedBases";
  excludeClipped.dataset.controlHelp = "Apply the clipping boundaries to copied and downloaded FASTA/FASTQ. Uncheck to include all base calls. Figure and editable-document exports are unchanged.";
  const exportClipText = document.createElement("span");
  exportClipText.textContent = "Exclude clipped bases";
  exportClipLabel.append(excludeClipped, exportClipText);
  const sequenceExportActions = document.createElement("div");
  sequenceExportActions.className = "sanger-trace-export-actions";
  sequenceExportActions.append(copyFasta, downloadFasta, copyFastq, downloadFastq);
  sequenceExport.description.append(exportRange, exportClipLabel);
  sequenceExport.row.append(sequenceExportActions);
  const figureExport = addExportRow("Figure");
  const figureScope = document.createElement("span");
  figureScope.className = "sanger-trace-export-scope";
  figureScope.textContent = "Current view";
  const figureExportActions = document.createElement("div");
  figureExportActions.className = "sanger-trace-export-actions";
  figureExportActions.append(downloadPng, downloadSvg);
  figureExport.description.append(figureScope);
  figureExport.row.append(figureExportActions);
  const documentExport = addExportRow("SMS3 document");
  const documentScope = document.createElement("span");
  documentScope.className = "sanger-trace-export-scope";
  documentScope.textContent = "Full trace and edits; reopen in SMS3";
  documentExport.description.append(documentScope);
  documentExport.row.append(documentActions);
  const tabPanels = document.createElement("div");
  tabPanels.className = "sanger-trace-tab-panels";
  tabPanels.append(editPanel, displayPanel, exportPanel);
  controls.append(tabs.element, tabPanels);
  const retainedRange = document.createElement("p");
  retainedRange.className = "sanger-trace-retained-range";
  retainedRange.dataset.sangerControl = "retainedRange";
  const status = document.createElement("p");
  status.className = "sanger-trace-status";
  status.dataset.sangerControl = "status";

  panel.append(toolbar, searchGroup, navigation, controls, canvas, retainedRange, status);
  container.append(panel);
  installControlHelp(panel, { signal: cleanupController.signal });

  const state = {
    data,
    calls: data.baseCalls.map((call) => ({ ...call, originalBase: call.originalBase ?? call.base })),
    clipStart: data.clipStart ?? 1,
    clipEnd: data.clipEnd ?? data.baseCalls.length,
    excludeClippedBases: true,
    selectedIndex: data.clipStart ?? 1,
    visibleStart: data.clipStart ?? 1,
    zoom: data.baseCalls.length > 180 ? 1.4 : 2.2,
    hitBoxes: [],
    translationHitBoxes: [],
    showForwardTranslations: data.showForwardTranslations === true,
    showReverseTranslations: data.showReverseTranslations === true,
    geneticCode: String(data.geneticCode || "1"),
    searchQuery: "",
    searchMatches: [],
    searchMatchIndex: -1
  };

  const render = (message = "") => {
    const layout = calculateSangerTraceCanvasLayout(state);
    const canvasHeight = `${layout.canvasHeight}px`;
    if (canvas.style.height !== canvasHeight) {
      canvas.style.height = canvasHeight;
    }
    canvas.dataset.translationFrames = String(layout.translationFrameCount);
    canvas.dataset.geneticCode = state.geneticCode;
    drawTrace(canvas, state);
    // Drawing clamps the visible window to the read, including short reads.
    syncControls(panel, state);
    if (message) setStatus(panel, message);
  };
  excludeClipped.addEventListener("change", () => {
    state.excludeClippedBases = excludeClipped.checked;
    render(state.excludeClippedBases ? "FASTA/FASTQ exports exclude clipped bases." : "FASTA/FASTQ exports include all bases.");
  }, listenerOptions);
  let resizeFrame = 0;
  const scheduleRender = (message = "") => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      render(message);
    });
  };
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => scheduleRender()) : null;
  resizeObserver?.observe(canvas);
  cleanupController.signal.addEventListener("abort", () => {
    resizeObserver?.disconnect();
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
    }
  }, { once: true });
  const zoomFractionForPointer = (clientX) => {
    const { rect, scaleX } = canvasCoordinates(canvas);
    const x = (clientX - rect.left) * scaleX / (window.devicePixelRatio || 1);
    const plot = state.hitBoxes[0]?.plot;
    return plot ? clamp((x - plot.left) / Math.max(1, plot.width), 0, 1) : 0.5;
  };
  const zoomBy = (factor, anchorFraction = 0.5, currentFraction = anchorFraction) => {
    stopActiveInertia();
    inspection.hide();
    // Selection is an editing target and may be far outside the panned view.
    // Buttons/keys retain the view center; pointer gestures retain their anchor.
    const oldWidth = Math.min(state.calls.length, basesPerVisibleWidth(state));
    const anchor = state.visibleStart + (oldWidth - 1) * anchorFraction;
    state.zoom = clamp(state.zoom * factor, 1, 18);
    const newWidth = Math.min(state.calls.length, basesPerVisibleWidth(state));
    if (newWidth !== oldWidth || currentFraction !== anchorFraction) {
      state.visibleStart = clamp(anchor - (newWidth - 1) * currentFraction, 1, Math.max(1, state.calls.length - newWidth + 1));
    }
    render();
  };
  const goToSearchMatch = (direction) => {
    if (!state.searchMatches.length) {
      setStatus(panel, state.searchQuery ? "No sequence search matches." : "Enter a sequence to search.");
      return;
    }
    state.searchMatchIndex = (state.searchMatchIndex + direction + state.searchMatches.length) % state.searchMatches.length;
    const match = activeSearchMatch(state);
    const center = Math.round((match.start + match.end) / 2);
    state.selectedIndex = center;
    const perWidth = basesPerVisibleWidth(state);
    state.visibleStart = clamp(center - Math.floor(perWidth / 2), 1, Math.max(1, state.calls.length - perWidth + 1));
    render(`Search match ${state.searchMatchIndex + 1} of ${state.searchMatches.length}: bases ${match.start}-${match.end}.`);
  };

  zoomOut.addEventListener("click", () => zoomBy(1 / 1.6), listenerOptions);
  zoomIn.addEventListener("click", () => zoomBy(1.6), listenerOptions);
  reset.addEventListener("click", () => {
    state.zoom = data.baseCalls.length > 180 ? 1.4 : 2.2;
    state.visibleStart = state.clipStart;
    render("Default zoom restored; showing the start of the retained read.");
  }, listenerOptions);
  jumpStart.addEventListener("click", () => {
    state.selectedIndex = 1;
    state.visibleStart = 1;
    render("Showing the 5' end of the read.");
  }, listenerOptions);
  jumpEnd.addEventListener("click", () => {
    state.selectedIndex = state.calls.length;
    state.visibleStart = Math.max(1, state.calls.length - basesPerVisibleWidth(state) + 1);
    render("Showing the 3' end of the read.");
  }, listenerOptions);
  previousBase.addEventListener("click", () => {
    state.selectedIndex = clamp((state.selectedIndex || 1) - 1, 1, state.calls.length);
    if (state.selectedIndex < state.visibleStart) state.visibleStart = state.selectedIndex;
    render();
  }, listenerOptions);
  nextBase.addEventListener("click", () => {
    state.selectedIndex = clamp((state.selectedIndex || 1) + 1, 1, state.calls.length);
    const end = state.visibleStart + basesPerVisibleWidth(state) - 1;
    if (state.selectedIndex > end) state.visibleStart = Math.max(1, state.selectedIndex - basesPerVisibleWidth(state) + 1);
    render();
  }, listenerOptions);
  forwardTranslations.addEventListener("click", () => {
    state.showForwardTranslations = !state.showForwardTranslations;
    render(`${state.showForwardTranslations ? "Showing" : "Hiding"} forward translation frames.`);
  }, listenerOptions);
  reverseTranslations.addEventListener("click", () => {
    state.showReverseTranslations = !state.showReverseTranslations;
    render(`${state.showReverseTranslations ? "Showing" : "Hiding"} reverse translation frames.`);
  }, listenerOptions);
  geneticCode.addEventListener("change", () => {
    state.geneticCode = geneticCode.value;
    render(`Translation tracks use NCBI genetic code ${state.geneticCode}.`);
  }, listenerOptions);
  previousMatch.addEventListener("click", () => goToSearchMatch(-1), listenerOptions);
  nextMatch.addEventListener("click", () => goToSearchMatch(1), listenerOptions);
  clearSearch.addEventListener("click", () => {
    state.searchQuery = "";
    updateSearchMatches(state);
    render("Cleared sequence search.");
  }, listenerOptions);
  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value;
    updateSearchMatches(state);
    const match = activeSearchMatch(state);
    if (match) {
      state.selectedIndex = Math.round((match.start + match.end) / 2);
      state.visibleStart = clamp(match.start, 1, Math.max(1, state.calls.length - basesPerVisibleWidth(state) + 1));
      render(`Found ${state.searchMatches.length} sequence match${state.searchMatches.length === 1 ? "" : "es"}.`);
    } else {
      render(state.searchQuery ? "No sequence matches found." : "Sequence search cleared.");
    }
  }, listenerOptions);

  let dragState = null;
  let stopInertia = () => {};
  const velocityTracker = createInertiaVelocityTracker();
  const stopActiveInertia = () => {
    stopInertia();
    stopInertia = () => {};
  };
  toolbar.addEventListener("pointerdown", stopActiveInertia, listenerOptions);
  controls.addEventListener("pointerdown", stopActiveInertia, listenerOptions);
  const panByPixels = (deltaPixels) => {
    const bases = (-deltaPixels / Math.max(1, canvas.getBoundingClientRect().width)) * basesPerVisibleWidth(state);
    if (Math.abs(bases) < 0.01) return false;
    return panByBases(state, bases);
  };
  const handleDragMove = (event) => {
    const delta = event.clientX - dragState.lastX;
    dragState.lastX = event.clientX;
    dragState.totalX += delta;
    velocityTracker.add(event.clientX, performance.now());
    if (dragState.type === "pan") {
      if (panByPixels(delta)) render("Dragging trace view.");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left + 30) panByBases(state, -0.35);
    if (event.clientX > rect.right - 30) panByBases(state, 0.35);
    setClipBoundary(state, dragState.type, baseIndexFromPointer(canvas, state, event));
    render(`Dragging ${dragState.type === "clip-start" ? "5'" : "3'"} clip at base ${state.selectedIndex}.`);
  };
  const inspection = installCanvasVisualInspection(panel, {
    canvas,
    ariaLabel: `${data.record || "Sanger trace"} interactive chromatogram`,
    getTargets: () => state.hitBoxes.map((hit) => ({ kind: "base-call", ...hit })),
    hitTest: (event) => findSangerInspectionTarget(canvas, state, event),
    getText: (target) => describeSangerInspectionTarget(target, state),
    getKey: sangerInspectionTargetKey,
    getPosition: (target) => sangerInspectionTargetPosition(canvas, target),
    isInteractionSuppressed: () => Boolean(dragState),
    keyboardNavigation: false,
    ariaKeyShortcuts: "ArrowLeft ArrowRight + - Escape",
    instructionsText: "Move over a base, translation, or clipping handle to inspect it. Use Left and Right Arrow keys to select bases, plus and minus to zoom, and Escape to dismiss inspection.",
    targetCursor: "crosshair",
    emptyCursor: "grab"
  });
  cleanupController.signal.addEventListener("abort", () => inspection.cleanup(), { once: true });
  const inspectSelectedBase = () => {
    const hit = state.hitBoxes.find((item) => item.call.displayIndex === state.selectedIndex);
    if (!hit) return;
    const target = { kind: "base-call", ...hit };
    inspection.inspect(target, sangerInspectionTargetPosition(canvas, target), { shouldAnnounce: true });
  };
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.deltaY) zoomBy(event.deltaY < 0 ? 1.25 : 1 / 1.25, zoomFractionForPointer(event.clientX));
  }, passiveWheelOptions);
  const cleanupPinch = installCanvasPinchZoom(canvas, {
    onStart: () => {
      stopActiveInertia();
      inspection.hide();
      if (dragState) canvas.releasePointerCapture?.(dragState.pointerId);
      dragState = null;
      canvas.classList.remove("dragging", "clipping");
    },
    onChange: ({ previous, current, factor }) => {
      zoomBy(factor, zoomFractionForPointer(previous.x), zoomFractionForPointer(current.x));
    }
  });
  canvas.addEventListener("mousemove", (event) => {
    if (dragState) {
      if (!dragState.pointerMoveSeen && event.buttons === 1) {
        handleDragMove(event);
      }
      return;
    }
    const target = findSangerInspectionTarget(canvas, state, event);
    canvas.classList.toggle("clip-hover", target?.kind === "clip-handle");
    const description = describeSangerInspectionTarget(target, state);
    if (description) setStatus(panel, description);
  }, listenerOptions);
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      state.selectedIndex = clamp((state.selectedIndex || 1) - 1, 1, state.calls.length);
      if (state.selectedIndex < state.visibleStart) state.visibleStart = state.selectedIndex;
      render();
      inspectSelectedBase();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      state.selectedIndex = clamp((state.selectedIndex || 1) + 1, 1, state.calls.length);
      const end = state.visibleStart + basesPerVisibleWidth(state) - 1;
      if (state.selectedIndex > end) state.visibleStart = Math.max(1, state.selectedIndex - basesPerVisibleWidth(state) + 1);
      render();
      inspectSelectedBase();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.25);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(1 / 1.25);
    }
  }, listenerOptions);
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopActiveInertia();
    inspection.hide();
    canvas.focus();
    const handle = findClipHandle(canvas, state, event);
    dragState = {
      type: handle?.type ?? "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      totalX: 0
    };
    velocityTracker.reset();
    velocityTracker.add(event.clientX, performance.now());
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.toggle("dragging", dragState.type === "pan");
    canvas.classList.toggle("clipping", dragState.type !== "pan");
    if (dragState.type === "pan") {
      setStatus(panel, "Dragging trace view.");
      return;
    }
    setClipBoundary(state, dragState.type, baseIndexFromPointer(canvas, state, event));
    render(`Dragging ${dragState.type === "clip-start" ? "5'" : "3'"} clip at base ${state.selectedIndex}.`);
  }, listenerOptions);
  canvas.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    dragState.pointerMoveSeen = true;
    handleDragMove(event);
  }, listenerOptions);
  const finishPointerDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const finished = dragState;
    dragState = null;
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.classList.remove("dragging", "clipping");
    if (finished.type !== "pan") {
      render(`Clipping boundaries: bases ${state.clipStart}-${state.clipEnd}.`);
      return;
    }
    if (Math.abs(finished.totalX) < 5) {
      selectNearestBase(canvas, state, event);
      render();
      return;
    }
    const velocity = velocityTracker.velocity(performance.now());
    if (allowsViewerInertia(window) && shouldStartViewerInertia({ dragDistancePx: finished.totalX, velocity })) {
      stopInertia = startViewerInertia({
        initialVelocity: velocity,
        step(deltaPixels) {
          const moved = panByPixels(deltaPixels);
          if (moved) render("Panning trace view.");
          return moved;
        },
        onStop() {
          stopInertia = () => {};
          setStatus(panel, "Trace view panned.");
        }
      });
    } else {
      setStatus(panel, "Trace view panned.");
    }
  };
  canvas.addEventListener("pointerup", finishPointerDrag, listenerOptions);
  canvas.addEventListener("pointercancel", finishPointerDrag, listenerOptions);
  canvas.addEventListener("pointerleave", (event) => {
    if (!dragState) {
      canvas.classList.remove("clip-hover");
    } else if (event.pointerId === dragState.pointerId && dragState.type === "pan") {
      setStatus(panel, "Release to finish panning.");
    }
  }, listenerOptions);
  window.addEventListener("resize", () => scheduleRender(), listenerOptions);
  window.addEventListener("sms3-theme-change", () => scheduleRender(), listenerOptions);

  const updateClippingCoordinates = () => {
    const start = Number(clipStart.value);
    const end = Number(clipEnd.value);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > state.calls.length || start > end) {
      clippingError.textContent = `Clipping unchanged. Enter whole-number coordinates from 1 to ${state.calls.length.toLocaleString()}, with the first base no greater than the last.`;
      clippingError.hidden = false;
      return;
    }
    clippingError.hidden = true;
    if (state.clipStart === start && state.clipEnd === end) return;
    state.clipStart = start;
    state.clipEnd = end;
    // Updating a coordinate must not move the view or change the base being edited.
    render(`Clipping boundaries: bases ${start}-${end}.`);
  };
  for (const input of [clipStart, clipEnd]) {
    input.addEventListener("input", updateClippingCoordinates, listenerOptions);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); updateClippingCoordinates(); }
    }, listenerOptions);
  }
  applyEdit.addEventListener("click", () => {
    const call = selectedCall(state);
    if (!call) {
      setStatus(panel, "Select a base call before editing.");
      return;
    }
    call.base = editBase.value;
    call.edited = call.base !== call.originalBase;
    render(`Changed base ${call.displayIndex} to ${call.base}.`);
  }, listenerOptions);

  const exportTitle = () => sequenceTitle(state, exportCalls(state));
  const exportScope = () => state.excludeClippedBases ? "clipped bases excluded" : "all bases";
  const getFasta = () => formatFasta(exportTitle(), sequenceForState(state));
  const getFastq = () => makeFastq(exportTitle(), exportCalls(state));
  copyFasta.addEventListener("click", async () => {
    await copyTextWithFeedback(copyFasta, getFasta());
    setStatus(panel, `Copied FASTA (${exportScope()}).`);
  }, listenerOptions);
  copyFastq.addEventListener("click", async () => {
    await copyTextWithFeedback(copyFastq, getFastq());
    setStatus(panel, `Copied FASTQ (${exportScope()}).`);
  }, listenerOptions);
  downloadFasta.addEventListener("click", () => {
    downloadText(getFasta(), `${exportTitle()}.fasta`, "text/x-fasta;charset=utf-8");
    setStatus(panel, `Downloaded FASTA (${exportScope()}).`);
  }, listenerOptions);
  downloadFastq.addEventListener("click", () => {
    downloadText(getFastq(), `${exportTitle()}.fastq`, "text/x-fastq;charset=utf-8");
    setStatus(panel, `Downloaded FASTQ (${exportScope()}).`);
  }, listenerOptions);
  downloadPng.addEventListener("click", () => {
    downloadCanvasPng(canvas, `${sequenceTitle(state)}-trace.png`);
    setStatus(panel, "Downloaded trace PNG.");
  }, listenerOptions);
  downloadSvg.addEventListener("click", () => {
    downloadCanvasSvg(canvas, `${sequenceTitle(state)}-trace.svg`, {
      title: `${sequenceTitle(state)} chromatogram viewer`,
      description: `Current Sanger trace viewer snapshot. ${panel.querySelector("[data-sanger-control='status']")?.textContent || ""}`.trim(),
      metadata: {
        viewer: "sanger-trace",
        sequenceTitle: sequenceTitle(state),
        baseCalls: state.calls.length,
        clipStart: state.clipStart,
        clipEnd: state.clipEnd
      }
    });
    setStatus(panel, "Downloaded trace SVG.");
  }, listenerOptions);

  container._sms3VisualCleanup = () => {
    stopActiveInertia();
    cleanupPinch();
    cleanupController.abort();
  };
  container._sms3TraceState = {
    read:() => ({bases:state.calls.map(c=>c.base).join(''),clipStart:state.clipStart,clipEnd:state.clipEnd,excludeClippedBases:state.excludeClippedBases,geneticCode:state.geneticCode,showForwardTranslations:state.showForwardTranslations,showReverseTranslations:state.showReverseTranslations}),
    apply:snapshot => {
      if (typeof snapshot.bases !== 'string' || snapshot.bases.length !== state.calls.length || /[^ACGTRYSWKMBDHVN]/i.test(snapshot.bases)) throw new Error('Invalid edited trace calls.');
      if (!Number.isInteger(snapshot.clipStart) || !Number.isInteger(snapshot.clipEnd) || snapshot.clipStart < 1 || snapshot.clipEnd > state.calls.length || snapshot.clipStart > snapshot.clipEnd) throw new Error('Invalid trace clipping coordinates.');
      state.calls.forEach((call,i) => {call.base=snapshot.bases[i];call.edited=call.base!==call.originalBase;});
      state.clipStart=snapshot.clipStart;state.clipEnd=snapshot.clipEnd;state.selectedIndex=state.clipStart;state.visibleStart=state.clipStart;
      state.excludeClippedBases=snapshot.excludeClippedBases!==false;
      state.geneticCode=String(snapshot.geneticCode||data.geneticCode||'1');state.showForwardTranslations=snapshot.showForwardTranslations===true;state.showReverseTranslations=snapshot.showReverseTranslations===true;
      render('Trace edits restored.');
    }
  };
  render("Interactive trace ready. Click a base to inspect or edit it.");
}

function renderSangerTraceSetViewer(container, data, documentActions) {
  const cleanupController = new AbortController();
  const listenerOptions = { signal: cleanupController.signal };
  const panel = document.createElement("section");
  panel.className = "sanger-trace-set-panel";

  const header = document.createElement("div");
  header.className = "sanger-trace-set-toolbar";
  const title = document.createElement("div");
  title.className = "sanger-trace-title";
  title.textContent = "Sanger trace set";
  const summary = document.createElement("span");
  summary.className = "sanger-trace-set-summary";
  summary.textContent = `${data.traceViews.length.toLocaleString()} traces loaded${data.reference ? `; reference ${data.reference.title}` : ""}`;

  const selectorLabel = document.createElement("label");
  selectorLabel.className = "sanger-trace-set-selector";
  const selectorHeading = document.createElement("span");
  selectorHeading.className = "sanger-trace-set-selector-heading";
  const selectorText = document.createElement("span");
  selectorText.textContent = "Trace";
  const selector = document.createElement("select");
  selector.setAttribute("aria-label", "Trace");
  data.traceViews.forEach((trace, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${trace.record || `Trace ${index + 1}`} (${trace.baseCalls.length.toLocaleString()} bases)`;
    selector.append(option);
  });
  selectorHeading.append(selectorText, summary);
  selectorLabel.append(selectorHeading, selector);
  header.append(title, selectorLabel);

  const traceHost = document.createElement("div");
  traceHost.className = "sanger-trace-set-host";
  const warningBox = document.createElement("p");
  warningBox.className = "sanger-trace-status";
  warningBox.textContent = data.warnings?.length
    ? `${data.warnings.length} warning${data.warnings.length === 1 ? "" : "s"} reported for this trace set. See the output warnings/details.`
    : "Select a trace to review its chromatogram, edit calls, and export clipped bases.";

  panel.append(header, traceHost, warningBox);
  container.append(panel);

  const traceStates = new Map(data.traceViews.map((trace,index)=>[index,{bases:trace.baseCalls.map(c=>c.base).join(""),clipStart:trace.clipStart??1,clipEnd:trace.clipEnd??trace.baseCalls.length,geneticCode:String(trace.geneticCode||'1'),showForwardTranslations:trace.showForwardTranslations===true,showReverseTranslations:trace.showReverseTranslations===true}]));
  let previousIndex = null;
  const renderSelected = () => {
    if (previousIndex !== null && traceHost._sms3TraceState) traceStates.set(previousIndex,traceHost._sms3TraceState.read());
    traceHost._sms3VisualCleanup?.();
    traceHost.innerHTML = "";
    const index = clamp(Number.parseInt(selector.value, 10) || 0, 0, data.traceViews.length - 1);
    renderSingleSangerTraceViewer(traceHost, data.traceViews[index], documentActions);
    if (traceStates.has(index)) traceHost._sms3TraceState.apply(traceStates.get(index));
    previousIndex = index;
  };

  selector.addEventListener("change", renderSelected, listenerOptions);
  container._sms3VisualCleanup = () => {
    traceHost._sms3VisualCleanup?.();
    cleanupController.abort();
  };
  renderSelected();
  container._sms3TraceState = {
    read:() => {traceStates.set(previousIndex,traceHost._sms3TraceState.read()); return {traces:Object.fromEntries(traceStates)};},
    apply:snapshot => {
      traceStates.clear(); for (const [key,value] of Object.entries(snapshot.traces || {})) traceStates.set(Number(key),value);
      previousIndex=null; renderSelected();
    }
  };
}

export function renderSangerTraceViewer(container, data, editorDocument) {
  const documentActions = document.createElement('div');
  documentActions.className = 'sanger-trace-document-export';
  if (Array.isArray(data?.traceViews) && data.traceViews.length > 0) renderSangerTraceSetViewer(container, data, documentActions);
  else renderSingleSangerTraceViewer(container, data, documentActions);
  const toolbar = container.querySelector('.sanger-trace-set-toolbar,.sanger-trace-toolbar');
  const session = createEditorSession({host:container, toolbar, downloadHost:documentActions, tool:'sanger-trace-viewer', source:data, initial:editorDocument?.state,
    read:() => container._sms3TraceState.read(), apply:snapshot => container._sms3TraceState.apply(snapshot)
  });
  const cleanup = container._sms3VisualCleanup;
  container._sms3VisualCleanup = () => {session.dispose();cleanup?.();};
}
