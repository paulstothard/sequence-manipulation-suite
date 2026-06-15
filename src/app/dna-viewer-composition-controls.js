import {
  chooseCompositionWindowSize,
  makeDnaCompositionTracksSync
} from "../core/dna-composition-tracks.js";

export const VIEWER_COMPOSITION_TRACK_SOURCE = "viewer-composition";

const GC_PERCENT_TRACK_ID = "gc-percent";
const GC_SKEW_TRACK_ID = "gc-skew";

export function isViewerGeneratedCompositionTrack(track) {
  return track?.generatedBy === VIEWER_COMPOSITION_TRACK_SOURCE;
}

function isCompositionMetricTrack(track) {
  return track?.type === "quantitative" &&
    (track.id === GC_PERCENT_TRACK_ID || track.id === GC_SKEW_TRACK_ID ||
      track.metric === "gc_percent" || track.metric === "gc_skew");
}

function getCompositionConfig(record) {
  const config = record?.compositionControls;
  return config?.enabled === true && record?.alphabet !== "protein" ? config : null;
}

function clampWindowSize(value, recordLength) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return chooseCompositionWindowSize(recordLength, 0);
  }
  return Math.max(1, Math.min(Math.max(1, Number(recordLength) || 1), parsed));
}

function syncCompositionVisibility(state) {
  if (!state.hiddenTrackIds) {
    state.hiddenTrackIds = new Set();
  }
  const composition = state.compositionControls;
  if (!composition?.enabled) return;
  if (composition.showGcPercent) {
    state.hiddenTrackIds.delete(GC_PERCENT_TRACK_ID);
  } else {
    state.hiddenTrackIds.add(GC_PERCENT_TRACK_ID);
  }
  if (composition.showGcSkew) {
    state.hiddenTrackIds.delete(GC_SKEW_TRACK_ID);
  } else {
    state.hiddenTrackIds.add(GC_SKEW_TRACK_ID);
  }
}

export function initializeViewerCompositionTracks(record, state, preservedComposition = null) {
  const config = getCompositionConfig(record);
  if (!config) return false;
  const saved = preservedComposition?.enabled ? preservedComposition : null;
  state.compositionControls = {
    enabled: true,
    showGcPercent: saved ? saved.showGcPercent !== false : config.showGcPercent !== false,
    showGcSkew: saved ? saved.showGcSkew !== false : config.showGcSkew !== false,
    autoWindow: saved ? saved.autoWindow !== false : config.autoWindow !== false,
    windowSize: clampWindowSize(saved?.windowSize ?? config.windowSize, record.length)
  };
  state.compositionBaseTracks = (record.tracks ?? []).filter((track) =>
    !isViewerGeneratedCompositionTrack(track) && !isCompositionMetricTrack(track)
  );
  applyViewerCompositionTracks(record, state);
  return true;
}

export function applyViewerCompositionTracks(record, state) {
  const composition = state.compositionControls;
  if (!composition?.enabled) return;
  const windowSize = composition.autoWindow ? 0 : composition.windowSize;
  const tracks = makeDnaCompositionTracksSync(record.sequence, {
    showGcPercent: true,
    showGcSkew: true,
    compositionWindowSize: windowSize,
    generatedBy: VIEWER_COMPOSITION_TRACK_SOURCE
  });
  record.tracks = [...(state.compositionBaseTracks ?? []), ...tracks];
  syncCompositionVisibility(state);
}

export function snapshotViewerCompositionState(state) {
  const composition = state.compositionControls;
  return composition?.enabled
    ? {
        enabled: true,
        showGcPercent: composition.showGcPercent !== false,
        showGcSkew: composition.showGcSkew !== false,
        autoWindow: composition.autoWindow !== false,
        windowSize: composition.windowSize
      }
    : null;
}

function makeCheckbox(labelText, checked) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  label.append(input, document.createTextNode(labelText));
  return { label, input };
}

export function createViewerCompositionControls(record, state, onChange) {
  const composition = state.compositionControls;
  if (!composition?.enabled) return null;

  const details = document.createElement("details");
  details.className = "dna-viewer-composition-controls";
  const summary = document.createElement("summary");
  summary.textContent = "Composition";

  const panel = document.createElement("div");
  panel.className = "dna-viewer-composition-panel";

  const trackGroup = document.createElement("fieldset");
  trackGroup.className = "dna-viewer-composition-track-options";
  const legend = document.createElement("legend");
  legend.textContent = "Tracks";
  const gcPercent = makeCheckbox("GC percent", composition.showGcPercent);
  const gcSkew = makeCheckbox("GC skew", composition.showGcSkew);
  trackGroup.append(legend, gcPercent.label, gcSkew.label);

  const windowGroup = document.createElement("div");
  windowGroup.className = "dna-viewer-composition-window";
  const autoWindow = makeCheckbox("Auto window", composition.autoWindow);
  const windowLabel = document.createElement("label");
  windowLabel.className = "dna-viewer-composition-window-size";
  const windowText = document.createElement("span");
  windowText.textContent = "Window size";
  const windowInput = document.createElement("input");
  windowInput.type = "number";
  windowInput.min = "1";
  windowInput.step = "1";
  windowInput.inputMode = "numeric";
  windowInput.title = "Sliding-window size in bases when automatic sizing is off";
  const windowStatus = document.createElement("output");
  windowLabel.append(windowText, windowInput);
  windowGroup.append(autoWindow.label, windowLabel, windowStatus);

  function refreshWindowUi() {
    const automaticSize = chooseCompositionWindowSize(record.length, 0);
    windowInput.disabled = composition.autoWindow;
    windowInput.value = String(composition.autoWindow ? automaticSize : composition.windowSize);
    windowStatus.textContent = composition.autoWindow
      ? `Auto ${automaticSize.toLocaleString()} bp`
      : `${composition.windowSize.toLocaleString()} bp`;
  }

  function redrawComposition({ regenerate = false } = {}) {
    if (regenerate) {
      applyViewerCompositionTracks(record, state);
    } else {
      syncCompositionVisibility(state);
    }
    refreshWindowUi();
    onChange?.();
  }

  gcPercent.input.addEventListener("change", () => {
    composition.showGcPercent = gcPercent.input.checked;
    redrawComposition();
  });
  gcSkew.input.addEventListener("change", () => {
    composition.showGcSkew = gcSkew.input.checked;
    redrawComposition();
  });
  autoWindow.input.addEventListener("change", () => {
    composition.autoWindow = autoWindow.input.checked;
    redrawComposition({ regenerate: true });
  });
  windowInput.addEventListener("change", () => {
    composition.windowSize = clampWindowSize(windowInput.value, record.length);
    composition.autoWindow = false;
    autoWindow.input.checked = false;
    redrawComposition({ regenerate: true });
  });

  refreshWindowUi();
  panel.append(trackGroup, windowGroup);
  details.append(summary, panel);
  return details;
}
