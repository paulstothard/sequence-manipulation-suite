import { makeDnaViewerData } from "./dna-viewer-data.js";

export function makeProteinViewerStream(viewer) {
  return {
    kind: "viewer",
    viewerType: "protein-sequence-viewer",
    viewer
  };
}

export function makeProteinViewerData(records, options = {}) {
  const viewer = makeDnaViewerData(records.map((record) => ({
    ...record,
    topology: "linear",
    alphabet: "protein",
    hideSequenceInterpretationControls: false
  })), {
    ...options,
    alphabet: "protein",
    layout: "linear",
    title: options.title || "Protein sequence viewer"
  });
  return {
    ...viewer,
    viewerType: "protein-sequence-viewer",
    title: options.title || viewer.title || "Protein sequence viewer",
    alphabet: "protein",
    layout: "linear",
    records: viewer.records.map((record) => ({
      ...record,
      topology: "linear",
      alphabet: "protein",
      hideSequenceInterpretationControls: false
    }))
  };
}
