import { renderDnaViewer } from "./dna-viewer-canvas.js";

export function renderProteinViewer(container, viewer, viewerOptions = {}) {
  container.classList.add("protein-viewer-output");
  const proteinViewer = {
    ...viewer,
    viewerType: "protein-sequence-viewer",
    alphabet: "protein",
    layout: "linear",
    title: viewer?.title || "Protein sequence viewer",
    records: (viewer?.records ?? []).map((record) => ({
      ...record,
      topology: "linear",
      alphabet: "protein",
      hideSequenceInterpretationControls: false
    }))
  };
  renderDnaViewer(container, proteinViewer, viewerOptions);
}
