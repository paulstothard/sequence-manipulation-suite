import {
  makeProteinConservationStructureReport,
  prepareProteinConservationStructureForRun,
  proteinStructureConservationColumns
} from "../../core/protein-structure-conservation.js";
import { MULTIPLE_ALIGNMENT_ENGINES } from "../../core/multiple-sequence-alignment.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["interactive-viewer", "report", "conservation-tsv"]);
const REPRESENTATIONS = new Set(["residue-spheres", "cartoon-stick", "cartoon", "stick", "sphere", "line"]);
const BACKGROUNDS = new Set(["white", "light", "black"]);
const FORMATS = new Set(["auto", "pdb", "mmcif"]);
const ALT_LOCATION_POLICIES = new Set(["preferred", "highest-occupancy", "first", "all"]);
const ALIGNMENT_INPUT_MODES = new Set(["unaligned", "aligned"]);
const ALIGNMENT_ENGINES = new Set(Object.values(MULTIPLE_ALIGNMENT_ENGINES));

function normalizeOptions(options = {}) {
  return {
    format: FORMATS.has(options.format) ? options.format : "auto",
    modelSelection: String(options.modelSelection ?? "all").trim() || "all",
    altLocationPolicy: ALT_LOCATION_POLICIES.has(options.altLocationPolicy) ? options.altLocationPolicy : "preferred",
    chainId: String(options.chainId ?? "auto").trim() || "auto",
    alignmentInputMode: ALIGNMENT_INPUT_MODES.has(options.alignmentInputMode) ? options.alignmentInputMode : "unaligned",
    alignmentEngine: ALIGNMENT_ENGINES.has(options.alignmentEngine)
      ? options.alignmentEngine
      : MULTIPLE_ALIGNMENT_ENGINES.muscle,
    gapOpen: Number.parseFloat(options.gapOpen) || 10,
    gapExtend: Number.parseFloat(options.gapExtend) || 1,
    alignmentRow: String(options.alignmentRow ?? "auto").trim() || "auto",
    representation: REPRESENTATIONS.has(options.representation) ? options.representation : "residue-spheres",
    background: BACKGROUNDS.has(options.background) ? options.background : "white",
    showHetAtoms: options.showHetAtoms !== false,
    showWaters: options.showWaters === true,
    showSurface: options.showSurface === true,
    outputFormat: OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "interactive-viewer"
  };
}

function makeViewerPayload(prepared, options) {
  return {
    title: `${prepared.structureSummary.title} conservation`,
    format: prepared.structureSummary.viewerFormat ?? prepared.structureSummary.format,
    sourceFormat: prepared.structureSummary.format,
    structureText: prepared.structureSummary.viewerStructureText || prepared.structureText,
    summary: {
      atomCount: prepared.structureSummary.atomCount,
      residueCount: prepared.structureSummary.residueCount,
      chainCount: prepared.structureSummary.chainCount,
      chains: prepared.structureSummary.chains,
      modelCount: prepared.structureSummary.modelCount,
      availableModels: prepared.structureSummary.availableModels,
      selectedModel: prepared.structureSummary.selectedModel,
      altLocationPolicy: prepared.structureSummary.altLocationPolicy,
      alternateLocationAtomCount: prepared.structureSummary.alternateLocationAtomCount,
      omittedAlternateLocationAtomCount: prepared.structureSummary.omittedAlternateLocationAtomCount,
      heteroAtomCount: prepared.structureSummary.heteroAtomCount,
      waterAtomCount: prepared.structureSummary.waterAtomCount,
      bounds: prepared.structureSummary.bounds
    },
    settings: {
      representation: options.representation,
      colorScheme: "conservation",
      altLocationPolicy: options.altLocationPolicy,
      background: options.background,
      showHetAtoms: options.showHetAtoms,
      showWaters: options.showWaters,
      showSurface: options.showSurface,
      residueOnlyPicking: true
    },
    conservation: {
      chainId: prepared.chainId,
      alignmentTitle: prepared.selectedAlignmentTitle,
      alignmentIdentity: prepared.selectedAlignmentIdentity,
      alignmentInputMode: prepared.alignmentInputMode,
      alignmentEngine: prepared.alignmentEngine,
      equivalentChains: prepared.equivalentChains,
      mappedChains: prepared.mappedChains,
      mappedResidues: prepared.mappedResidues,
      unmappedResidues: prepared.unmappedResidues,
      mismatchCount: prepared.mismatchCount,
      residueColors: prepared.residueColors,
      residueDetails: prepared.conservationRows,
      legend: prepared.legend
    }
  };
}

export async function runProteinConservationStructureViewer(input, options = {}, context = {}) {
  const normalized = normalizeOptions(options);
  context.reportProgress?.({ phase: "mapping-conservation", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  if (!String(input ?? "").trim()) {
    throw new Error("No protein structure and alignment input was provided.");
  }

  const prepared = await prepareProteinConservationStructureForRun(input, normalized, context);
  const warnings = [...prepared.warnings];
  if (prepared.structureSummary.atomCount > 75000) {
    warnings.push("This is a large structure. Interactive rendering may be slow; start without the surface if the browser feels sluggish.");
  }
  if (prepared.structureSummary.omittedAlternateLocationAtomCount > 0) {
    warnings.push(`${prepared.structureSummary.omittedAlternateLocationAtomCount.toLocaleString()} alternate-location atom record(s) were omitted by the ${prepared.structureSummary.altLocationPolicy} policy. Choose all locations if conservation review needs every conformer.`);
  }
  if (prepared.conservationRows.length > 20000) {
    warnings.push("This structure has more than 20,000 mapped residue rows. Prefer the report or viewer output unless the full table is needed.");
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makeProteinConservationStructureReport(prepared);
  const conservationTsv = normalized.outputFormat === "conservation-tsv"
    ? exportDelimitedTable(proteinStructureConservationColumns, prepared.conservationRows, "\t")
    : "";
  const viewer = normalized.outputFormat === "interactive-viewer"
    ? makeViewerPayload(prepared, normalized)
    : null;

  let output = report;
  let visual;
  let download = {
    filename: "protein-conservation-structure-viewer.txt",
    mimeType: "text/plain;charset=utf-8"
  };
  if (normalized.outputFormat === "interactive-viewer") {
    output = report;
    visual = { proteinStructure: viewer };
  } else if (normalized.outputFormat === "conservation-tsv") {
    output = conservationTsv;
    download = {
      filename: "protein-structure-conservation.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download,
    warnings,
    recordsProcessed: prepared.alignmentSequenceCount,
    basesProcessed: prepared.conservationRows.length,
    processedUnitLabel: "residue",
    streams: {
      report: makeTextStream(report, "text/plain"),
      ...(normalized.outputFormat === "conservation-tsv"
        ? { conservation: makeTableStream(proteinStructureConservationColumns, prepared.conservationRows, "protein-structure-conservation") }
        : {}),
      ...(viewer
        ? { viewer: { kind: "viewer", viewerType: "protein-structure-viewer", viewer } }
        : {})
    },
    visual
  });
}

export const proteinConservationStructureViewerRunner = runProteinConservationStructureViewer;
