import { addTimestampToFilename, downloadCanvasPng, downloadCanvasSvg, makeSafeFileStem } from "./canvas-export.js";
import {
  allowsViewerInertia,
  createInertiaVelocityTracker,
  shouldStartViewerInertia,
  startViewerInertia
} from "./viewer-inertia.js";

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

function makeButton(label, title = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
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

function sequenceTitle(state) {
  const calls = displayedCalls(state);
  const first = calls[0]?.originalIndex ?? state.clipStart;
  const last = calls[calls.length - 1]?.originalIndex ?? state.clipEnd;
  const start = Math.min(first, last);
  const end = Math.max(first, last);
  const edited = calls.some((call) => call.edited) ? "_edited" : "";
  return `${makeSafeFileStem(state.data.record, "sanger-trace")}_bases_${start}_${end}_${state.data.orientation}${edited}`;
}

function displayedCalls(state) {
  return state.calls.filter((call) => call.displayIndex >= state.clipStart && call.displayIndex <= state.clipEnd);
}

function sequenceForState(state) {
  return displayedCalls(state).map((call) => call.base).join("");
}

function fullSequenceForState(state) {
  return state.calls.map((call) => call.base).join("");
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

function qualityText(call) {
  return call.quality === null || call.quality === undefined
    ? "Q n/a"
    : `Q${call.quality} Phred quality`;
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
  details.textContent = `Selected base ${call.displayIndex}: ${call.base}; original base ${call.originalBase}; original trace position ${call.originalTracePosition}; ${qualityText(call)}${call.edited ? "; edited" : ""}.`;
}

function syncControls(panel, state) {
  panel.querySelector("[data-sanger-control='clipStart']").value = String(state.clipStart);
  panel.querySelector("[data-sanger-control='clipEnd']").value = String(state.clipEnd);
  panel.querySelector("[data-sanger-control='editBase']").value = selectedCall(state)?.base ?? "N";
  const visibleStart = Math.floor(state.visibleStart);
  const visibleEnd = Math.min(state.calls.length, visibleStart + basesPerVisibleWidth(state) - 1);
  panel.querySelector("[data-sanger-control='viewInfo']").textContent =
    `View ${visibleStart.toLocaleString()}-${visibleEnd.toLocaleString()} of ${state.calls.length.toLocaleString()} bases; zoom ${state.zoom.toFixed(1)}x; export keeps ${state.clipStart.toLocaleString()}-${state.clipEnd.toLocaleString()}.`;
  syncSearchControls(panel, state);
  updateDetails(panel, state);
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

  const margin = { left: 54, right: 22, top: 86, bottom: 62 };
  const plot = {
    left: margin.left,
    top: margin.top,
    width: cssWidth - margin.left - margin.right,
    height: cssHeight - margin.top - margin.bottom,
    baseLabelY: 38
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
      context.fillStyle = theme.selectedFill;
      context.strokeStyle = theme.selectedStroke;
      context.lineWidth = 1;
      context.fillRect(x - 8, plot.baseLabelY - 11, 16, 22);
      context.strokeRect(x - 8, plot.baseLabelY - 11, 16, 22);
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

function renderSingleSangerTraceViewer(container, data) {
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

  const zoomOut = makeButton("-", "Zoom out");
  const zoomIn = makeButton("+", "Zoom in");
  const reset = makeButton("Reset", "Reset view");
  const previousBase = makeButton("<", "Previous selected base");
  const nextBase = makeButton(">", "Next selected base");
  const jumpStart = makeButton("5' end", "Jump to the 5' end of the read");
  const jumpEnd = makeButton("3' end", "Jump to the 3' end of the read");
  const navGroup = document.createElement("div");
  navGroup.className = "sanger-trace-toolbar-buttons";
  navGroup.append(zoomOut, zoomIn, reset, jumpStart, jumpEnd, previousBase, nextBase);
  toolbar.append(title, navGroup, viewInfo);

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
  clipStart.title = "First retained base call in the exported read.";
  clipStart.dataset.sangerControl = "clipStart";
  const clipEnd = document.createElement("input");
  clipEnd.type = "number";
  clipEnd.min = "1";
  clipEnd.max = String(data.baseCalls.length);
  clipEnd.title = "Last retained base call in the exported read.";
  clipEnd.dataset.sangerControl = "clipEnd";
  const applyClip = makeButton("Apply clipping", "Apply 5' and 3' clipping coordinates");

  const editBase = document.createElement("select");
  editBase.dataset.sangerControl = "editBase";
  for (const base of ["A", "C", "G", "T", "N"]) {
    const option = document.createElement("option");
    option.value = base;
    option.textContent = base;
    editBase.append(option);
  }
  const applyEdit = makeButton("Apply base edit", "Replace the selected base call");
  const setClipStart = makeButton("Set 5' clip", "Set the 5' clip boundary to the selected base");
  setClipStart.dataset.sangerControl = "setClipStart";
  const setClipEnd = makeButton("Set 3' clip", "Set the 3' clip boundary to the selected base");
  setClipEnd.dataset.sangerControl = "setClipEnd";

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
  searchInput.spellcheck = false;
  searchInput.dataset.sangerControl = "search";
  const previousMatch = makeButton("Prev", "Previous sequence search match");
  const nextMatch = makeButton("Next", "Next sequence search match");
  const clearSearch = makeButton("Clear", "Clear sequence search");
  const searchInfo = document.createElement("span");
  searchInfo.className = "sanger-trace-search-info";
  searchInfo.dataset.sangerControl = "searchInfo";

  const addGroup = (titleText) => {
    const group = document.createElement("div");
    group.className = "sanger-trace-control-group";
    const heading = document.createElement("div");
    heading.className = "sanger-trace-control-heading";
    heading.textContent = titleText;
    group.append(heading);
    controls.append(group);
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
  const clipGroup = addGroup("Clipping");
  addField(clipGroup, "Clip 5'", clipStart, "sanger-trace-clip-start-label");
  addField(clipGroup, "Clip 3'", clipEnd, "sanger-trace-clip-end-label");
  clipGroup.append(applyClip, setClipStart, setClipEnd);

  const editGroup = addGroup("Base call");
  addField(editGroup, "Selected base", editBase);
  editGroup.append(applyEdit);

  const searchGroup = addGroup("Find");
  addField(searchGroup, "Sequence", searchInput);
  searchGroup.append(previousMatch, nextMatch, clearSearch, searchInfo);

  const exportGroup = addGroup("Export");
  exportGroup.append(copyFasta, copyFastq, downloadFasta, downloadFastq, downloadPng, downloadSvg);

  const details = document.createElement("p");
  details.className = "sanger-trace-details";
  details.dataset.sangerControl = "details";
  const status = document.createElement("p");
  status.className = "sanger-trace-status";
  status.dataset.sangerControl = "status";

  panel.append(toolbar, canvas, controls, details, status);
  container.append(panel);

  const state = {
    data,
    calls: data.baseCalls.map((call) => ({ ...call, originalBase: call.originalBase ?? call.base })),
    clipStart: data.clipStart ?? 1,
    clipEnd: data.clipEnd ?? data.baseCalls.length,
    selectedIndex: data.clipStart ?? 1,
    visibleStart: data.clipStart ?? 1,
    zoom: data.baseCalls.length > 180 ? 1.4 : 2.2,
    hitBoxes: [],
    searchQuery: "",
    searchMatches: [],
    searchMatchIndex: -1
  };

  const render = (message = "") => {
    syncControls(panel, state);
    drawTrace(canvas, state);
    if (message) setStatus(panel, message);
  };
  const zoomBy = (factor) => {
    const selected = selectedCall(state);
    const anchor = selected?.displayIndex ?? state.visibleStart + Math.floor(basesPerVisibleWidth(state) / 2);
    state.zoom = clamp(state.zoom * factor, 1, 18);
    const perWidth = basesPerVisibleWidth(state);
    state.visibleStart = clamp(anchor - Math.floor(perWidth / 2), 1, Math.max(1, state.calls.length - perWidth + 1));
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
    render("View reset.");
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
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    stopActiveInertia();
    zoomBy(event.deltaY < 0 ? 1.25 : 1 / 1.25);
  }, passiveWheelOptions);
  canvas.addEventListener("mousemove", (event) => {
    if (dragState) {
      if (!dragState.pointerMoveSeen && event.buttons === 1) {
        handleDragMove(event);
      }
      return;
    }
    const clipHandle = findClipHandle(canvas, state, event);
    canvas.classList.toggle("clip-hover", Boolean(clipHandle));
    if (clipHandle) {
      setStatus(panel, `Drag the ${clipHandle.type === "clip-start" ? "5'" : "3'"} clip handle or click a base and set that clip boundary.`);
      return;
    }
    const nearest = findNearestHitBox(canvas, state, event);
    if (!nearest) return;
    const call = nearest.call;
    setStatus(panel, `Base ${call.displayIndex}: ${call.base}; original base ${call.originalBase}; original trace position ${call.originalTracePosition}; ${qualityText(call)}.`);
  }, listenerOptions);
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      state.selectedIndex = clamp((state.selectedIndex || 1) - 1, 1, state.calls.length);
      if (state.selectedIndex < state.visibleStart) state.visibleStart = state.selectedIndex;
      render();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      state.selectedIndex = clamp((state.selectedIndex || 1) + 1, 1, state.calls.length);
      const end = state.visibleStart + basesPerVisibleWidth(state) - 1;
      if (state.selectedIndex > end) state.visibleStart = Math.max(1, state.selectedIndex - basesPerVisibleWidth(state) + 1);
      render();
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
      render(`Export keeps bases ${state.clipStart}-${state.clipEnd}.`);
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
  window.addEventListener("resize", () => render(), listenerOptions);
  window.addEventListener("sms3-theme-change", () => render(), listenerOptions);

  applyClip.addEventListener("click", () => {
    const start = clamp(Number.parseInt(clipStart.value, 10) || 1, 1, state.calls.length);
    const end = clamp(Number.parseInt(clipEnd.value, 10) || state.calls.length, start, state.calls.length);
    state.clipStart = start;
    state.clipEnd = end;
    state.visibleStart = start;
    state.selectedIndex = start;
    render(`Export keeps bases ${start}-${end}.`);
  }, listenerOptions);
  setClipStart.addEventListener("click", () => {
    setClipBoundary(state, "clip-start", state.selectedIndex);
    state.visibleStart = clamp(
      state.clipStart - Math.floor(basesPerVisibleWidth(state) / 3),
      1,
      Math.max(1, state.calls.length - basesPerVisibleWidth(state) + 1)
    );
    render(`5' clip set to base ${state.clipStart}.`);
  }, listenerOptions);
  setClipEnd.addEventListener("click", () => {
    setClipBoundary(state, "clip-end", state.selectedIndex);
    state.visibleStart = clamp(
      state.clipEnd - Math.floor((basesPerVisibleWidth(state) * 2) / 3),
      1,
      Math.max(1, state.calls.length - basesPerVisibleWidth(state) + 1)
    );
    render(`3' clip set to base ${state.clipEnd}.`);
  }, listenerOptions);
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

  const getFasta = () => formatFasta(sequenceTitle(state), sequenceForState(state));
  const getFastq = () => makeFastq(sequenceTitle(state), displayedCalls(state));
  copyFasta.addEventListener("click", async () => {
    await navigator.clipboard.writeText(getFasta());
    setStatus(panel, "Copied clipped FASTA.");
  }, listenerOptions);
  copyFastq.addEventListener("click", async () => {
    await navigator.clipboard.writeText(getFastq());
    setStatus(panel, "Copied clipped FASTQ.");
  }, listenerOptions);
  downloadFasta.addEventListener("click", () => {
    downloadText(getFasta(), `${sequenceTitle(state)}.fasta`, "text/x-fasta;charset=utf-8");
    setStatus(panel, "Downloaded clipped FASTA.");
  }, listenerOptions);
  downloadFastq.addEventListener("click", () => {
    downloadText(getFastq(), `${sequenceTitle(state)}.fastq`, "text/x-fastq;charset=utf-8");
    setStatus(panel, "Downloaded clipped FASTQ.");
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
    cleanupController.abort();
  };
  render("Interactive trace ready. Click a base to inspect or edit it.");
}

function renderSangerTraceSetViewer(container, data) {
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
  summary.className = "sanger-trace-view-info";
  summary.textContent = `${data.traceViews.length.toLocaleString()} traces loaded${data.reference ? `; reference ${data.reference.title}` : ""}`;

  const selectorLabel = document.createElement("label");
  selectorLabel.className = "sanger-trace-set-selector";
  const selectorText = document.createElement("span");
  selectorText.textContent = "Trace";
  const selector = document.createElement("select");
  data.traceViews.forEach((trace, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${trace.record || `Trace ${index + 1}`} (${trace.baseCalls.length.toLocaleString()} bases)`;
    selector.append(option);
  });
  selectorLabel.append(selectorText, selector);
  header.append(title, summary, selectorLabel);

  const traceHost = document.createElement("div");
  traceHost.className = "sanger-trace-set-host";
  const warningBox = document.createElement("p");
  warningBox.className = "sanger-trace-status";
  warningBox.textContent = data.warnings?.length
    ? `${data.warnings.length} warning${data.warnings.length === 1 ? "" : "s"} reported for this trace set. See the output warnings/details.`
    : "Select a trace to review its chromatogram, edit calls, and export clipped bases.";

  panel.append(header, traceHost, warningBox);
  container.append(panel);

  const renderSelected = () => {
    traceHost._sms3VisualCleanup?.();
    traceHost.innerHTML = "";
    const index = clamp(Number.parseInt(selector.value, 10) || 0, 0, data.traceViews.length - 1);
    renderSingleSangerTraceViewer(traceHost, data.traceViews[index]);
  };

  selector.addEventListener("change", renderSelected, listenerOptions);
  container._sms3VisualCleanup = () => {
    traceHost._sms3VisualCleanup?.();
    cleanupController.abort();
  };
  renderSelected();
}

export function renderSangerTraceViewer(container, data) {
  if (Array.isArray(data?.traceViews) && data.traceViews.length > 0) {
    renderSangerTraceSetViewer(container, data);
    return;
  }
  renderSingleSangerTraceViewer(container, data);
}
