import {
  validatePortableViewerArtifact
} from "../core/portable-viewer.js";
import {
  renderCircularDnaViewer,
  snapshotRenderedCircularDnaViewer
} from "../app/dna-circular-viewer-canvas.js";
import {
  renderDnaViewer,
  snapshotRenderedDnaViewer
} from "../app/dna-viewer-canvas.js";
import { renderProteinViewer } from "../app/protein-viewer-canvas.js";
import { renderProteinStructureViewer } from "../app/protein-structure-viewer.js";
import {
  formatViewerSequenceHeading,
  makeViewerSequenceInitialState,
  normalizeViewerSequenceChoices,
  renderViewerSequenceNavigation,
  validateViewerSequenceRegionRequest
} from "../app/viewer-sequence-navigation-ui.js";

function renderSequenceViewerRecord(host, viewer, selection, viewerState) {
  host.textContent = "";
  const selectedViewer = {
    ...viewer,
    records: [viewer.records[selection.index]]
  };
  const savedState = viewerState?.title === selection.title
    ? viewerState
    : makeViewerSequenceInitialState(viewer, selection);
  const viewerOptions = {
    initialState: savedState,
    preserveState: false,
    showRecordTitle: false
  };
  if (selectedViewer.viewerType === "protein-sequence-viewer") {
    renderProteinViewer(host, selectedViewer, viewerOptions);
  } else if (selectedViewer.layout === "circular") {
    renderCircularDnaViewer(host, selectedViewer, viewerOptions);
  } else {
    renderDnaViewer(host, selectedViewer, viewerOptions);
  }
}

function renderPortableSequenceViewer(container, artifact) {
  const viewer = artifact.payload;
  const choices = normalizeViewerSequenceChoices(viewer);
  const savedSelection = artifact.state?.selection || {};
  const checked = validateViewerSequenceRegionRequest({
    sequenceKey: savedSelection.sequenceKey || choices[0]?.key,
    start: savedSelection.startBlank === false ? savedSelection.start : "",
    end: savedSelection.endBlank === false ? savedSelection.end : ""
  }, choices);
  if (!checked.selection) throw new Error(checked.error || "The saved viewer sequence is unavailable.");

  const savedStates = new Map();
  if (artifact.state?.viewerState) {
    savedStates.set(checked.selection.sequenceKey, artifact.state.viewerState);
  }
  let activeSelection = null;
  const captureCurrentState = (host) => {
    if (!activeSelection) return;
    const snapshot = viewer.layout === "circular"
      ? snapshotRenderedCircularDnaViewer(host)[0]
      : snapshotRenderedDnaViewer(host)[0];
    if (snapshot) savedStates.set(activeSelection.sequenceKey, snapshot);
  };

  if (artifact.source?.type === "materialized-region") {
    const note = document.createElement("p");
    note.className = "portable-viewer-note";
    note.textContent = `Materialized region ${artifact.source.reference}:${Number(artifact.source.start).toLocaleString()}–${Number(artifact.source.end).toLocaleString()}. Loading other regions requires the original indexed source files in SMS3.`;
    container.append(note);
    const host = document.createElement("div");
    host.className = "viewer-sequence-host";
    container.append(host);
    activeSelection = checked.selection;
    renderSequenceViewerRecord(host, viewer, checked.selection, savedStates.get(checked.selection.sequenceKey));
    return;
  }

  const heading = document.createElement("h2");
  heading.className = "visual-output-heading";
  container.append(heading);
  const host = document.createElement("div");
  host.className = "viewer-sequence-host";
  const showSelection = (selection) => {
    captureCurrentState(host);
    activeSelection = selection;
    heading.textContent = formatViewerSequenceHeading(viewer.title || "Sequence viewer", selection);
    renderSequenceViewerRecord(host, viewer, selection, savedStates.get(selection.sequenceKey));
  };
  const navigation = renderViewerSequenceNavigation(container, viewer, {
    initialSelection: checked.selection,
    onShowSequence: showSelection
  });
  if (!navigation) throw new Error("The portable viewer sequence navigation could not be created.");
  container.append(host);
  showSelection(navigation.initialSelection);
}

function renderPortableProteinStructure(container, artifact) {
  const state = artifact.state || {};
  const payload = {
    ...artifact.payload,
    settings: {
      ...(artifact.payload.settings || {}),
      ...(state.settings || {})
    },
    initialView: Array.isArray(state.view) ? state.view : undefined
  };
  renderProteinStructureViewer(container, payload);
}

export function renderPortableViewer(container, artifact) {
  validatePortableViewerArtifact(artifact);
  if (!container) throw new Error("Portable viewer container is missing.");
  if (artifact.artifactType === "sequence-viewer") {
    renderPortableSequenceViewer(container, artifact);
  } else {
    renderPortableProteinStructure(container, artifact);
  }
  container.dataset.portableViewerReady = "true";
}

function showPortableViewerError(container, error) {
  const message = document.createElement("p");
  message.className = "portable-viewer-note";
  message.setAttribute("role", "alert");
  message.textContent = error?.message || "The portable viewer could not be opened.";
  container.replaceChildren(message);
  container.dataset.portableViewerReady = "error";
}

function installPortableThemeToggle() {
  const toggle = document.querySelector("#portableViewerThemeToggle");
  if (!toggle) return;
  const applyTheme = (theme, { announce = false } = {}) => {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    document.documentElement.style.backgroundColor = next === "dark" ? "#111418" : "#f7f8fa";
    toggle.checked = next === "dark";
    toggle.parentElement.title = next === "dark" ? "Switch to light mode" : "Switch to dark mode";
    if (announce) {
      try {
        localStorage.setItem(`sms3-portable-viewer-theme:${location.pathname}`, next);
      } catch {
        // Some file:// and embedded contexts intentionally disable storage.
      }
      window.dispatchEvent(new CustomEvent("sms3-theme-change", { detail: { theme: next } }));
    }
  };
  applyTheme(document.documentElement.dataset.theme);
  toggle.addEventListener("change", () => {
    applyTheme(toggle.checked ? "dark" : "light", { announce: true });
  });
}

function bootPortableViewer() {
  const container = document.querySelector("#sms3-portable-viewer");
  if (!container) return;
  try {
    const data = document.querySelector("#sms3-portable-viewer-data")?.textContent || "";
    installPortableThemeToggle();
    renderPortableViewer(container, JSON.parse(data));
  } catch (error) {
    showPortableViewerError(container, error);
  }
}

globalThis.SMS3PortableViewer = { renderPortableViewer };
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootPortableViewer, { once: true });
} else {
  bootPortableViewer();
}
