import {
  makeProteinStructureReport,
  proteinStructureAssemblyColumns,
  proteinStructureAtomColumns,
  proteinStructureMissingResidueColumns,
  proteinStructureResidueColumns,
  summarizeProteinStructure
} from "../../core/protein-structure.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["interactive-viewer", "report", "residue-tsv", "atom-tsv", "json"]);
const REPRESENTATIONS = new Set(["residue-spheres", "cartoon-stick", "cartoon", "stick", "sphere", "line"]);
const COLOR_SCHEMES = new Set(["chain", "spectrum", "secondary", "element", "fixed"]);
const BACKGROUNDS = new Set(["white", "light", "black"]);
const FORMATS = new Set(["auto", "pdb", "mmcif"]);
const ALT_LOCATION_POLICIES = new Set(["preferred", "highest-occupancy", "first", "all"]);
const DEFAULT_MAX_VIEWER_ATOMS = 75000;

function normalizeMaxViewerAtoms(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return DEFAULT_MAX_VIEWER_ATOMS;
  }
  return Math.max(1000, Math.min(500000, number));
}

function normalizeModelSelection(value) {
  const text = String(value ?? "first").trim();
  return text || "first";
}

function normalizeOptions(options = {}) {
  return {
    format: FORMATS.has(options.format) ? options.format : "auto",
    modelSelection: normalizeModelSelection(options.modelSelection),
    biologicalAssembly: String(options.biologicalAssembly ?? "asymmetric").trim() || "asymmetric",
    chainSelection: String(options.chainSelection ?? "all").trim() || "all",
    altLocationPolicy: ALT_LOCATION_POLICIES.has(options.altLocationPolicy) ? options.altLocationPolicy : "preferred",
    representation: REPRESENTATIONS.has(options.representation) ? options.representation : "cartoon-stick",
    colorScheme: COLOR_SCHEMES.has(options.colorScheme) ? options.colorScheme : "chain",
    background: BACKGROUNDS.has(options.background) ? options.background : "white",
    showHetAtoms: options.showHetAtoms !== false,
    showWaters: options.showWaters === true,
    showSurface: options.showSurface === true,
    maxViewerAtoms: normalizeMaxViewerAtoms(options.maxViewerAtoms),
    outputFormat: OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "interactive-viewer"
  };
}

function makeViewerPayload(input, summary, options) {
  return {
    title: summary.title,
    format: summary.viewerFormat ?? summary.format,
    sourceFormat: summary.format,
    structureText: summary.viewerStructureText || String(input ?? ""),
    summary: {
      atomCount: summary.atomCount,
      residueCount: summary.residueCount,
      chainCount: summary.chainCount,
      chains: summary.chains,
      modelCount: summary.modelCount,
      availableModels: summary.availableModels,
      selectedModel: summary.selectedModel,
      biologicalAssemblyCount: summary.biologicalAssemblyCount,
      availableBiologicalAssemblies: summary.availableBiologicalAssemblies,
      selectedBiologicalAssembly: summary.selectedBiologicalAssembly,
      biologicalAssemblyApplied: summary.biologicalAssemblyApplied,
      assemblyTransformCount: summary.assemblyTransformCount,
      assemblySourceAtomCount: summary.assemblySourceAtomCount,
      availableChains: summary.availableChains,
      selectedChains: summary.selectedChains,
      altLocationPolicy: summary.altLocationPolicy,
      alternateLocationAtomCount: summary.alternateLocationAtomCount,
      omittedAlternateLocationAtomCount: summary.omittedAlternateLocationAtomCount,
      missingResidueCount: summary.missingResidueCount,
      heteroAtomCount: summary.heteroAtomCount,
      waterAtomCount: summary.waterAtomCount,
      bounds: summary.bounds
    },
    settings: {
      representation: options.representation,
      colorScheme: options.colorScheme,
      altLocationPolicy: options.altLocationPolicy,
      background: options.background,
      showHetAtoms: options.showHetAtoms,
      showWaters: options.showWaters,
      showSurface: options.showSurface
    }
  };
}

export async function runProteinStructureViewer(input, options = {}, context = {}) {
  const normalized = normalizeOptions(options);
  context.reportProgress?.({ phase: "parsing-structure", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  if (!String(input ?? "").trim()) {
    throw new Error("No protein structure input was provided.");
  }

  const summary = summarizeProteinStructure(input, {
    format: normalized.format,
    modelSelection: normalized.modelSelection,
    biologicalAssembly: normalized.biologicalAssembly,
    chainSelection: normalized.chainSelection,
    altLocationPolicy: normalized.altLocationPolicy
  });
  const warnings = [];
  if (summary.atomCount > 75000) {
    warnings.push("This is a large structure. Interactive surface rendering may be slow; start without the surface if the browser feels sluggish.");
  }
  const viewerWithinLimit = summary.atomCount <= normalized.maxViewerAtoms;
  if (normalized.outputFormat === "interactive-viewer" && !viewerWithinLimit) {
    warnings.push(`Protein structure viewer was not opened because the selected structure has ${summary.atomCount.toLocaleString()} atom(s), above the current limit of ${normalized.maxViewerAtoms.toLocaleString()}. Select a model/chain subset, avoid generated assemblies, or raise the limit if your browser can handle it.`);
  }
  if (summary.format === "mmcif") {
    warnings.push("mmCIF atom-site parsing supports common PDBx/mmCIF coordinate loops; unusual multiline values may be summarized less completely.");
  }
  if (summary.omittedAlternateLocationAtomCount > 0) {
    warnings.push(`${summary.omittedAlternateLocationAtomCount.toLocaleString()} alternate-location atom record(s) were omitted by the ${summary.altLocationPolicy} policy. Choose all locations if you need to inspect every conformer.`);
  }
  if (summary.biologicalAssemblyApplied) {
    warnings.push(`Applied biological assembly ${summary.selectedBiologicalAssembly} using ${summary.assemblyTransformCount.toLocaleString()} transform(s). Residue and atom tables refer to the generated assembly coordinates.`);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.72 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makeProteinStructureReport(summary, normalized);
  const residueTsv = normalized.outputFormat === "residue-tsv"
    ? exportDelimitedTable(proteinStructureResidueColumns, summary.residueRows, "\t")
    : "";
  const atomTsv = normalized.outputFormat === "atom-tsv"
    ? exportDelimitedTable(proteinStructureAtomColumns, summary.atomRows, "\t")
    : "";
  const materializeViewer = normalized.outputFormat === "json" || (normalized.outputFormat === "interactive-viewer" && viewerWithinLimit);
  const viewer = materializeViewer ? makeViewerPayload(input, summary, normalized) : null;
  const json = normalized.outputFormat === "json" || normalized.outputFormat === "interactive-viewer"
    ? JSON.stringify(viewer ?? {
        kind: "protein-structure-viewer",
        omitted: true,
        reason: "atom-limit",
        atomCount: summary.atomCount,
        maxViewerAtoms: normalized.maxViewerAtoms,
        title: summary.title
      }, null, 2)
    : "";

  let output = report;
  let download = {
    filename: "protein-structure-viewer.txt",
    mimeType: "text/plain;charset=utf-8"
  };
  let visual;
  if (normalized.outputFormat === "interactive-viewer") {
    output = report;
    visual = viewer ? { proteinStructure: viewer } : undefined;
  } else if (normalized.outputFormat === "residue-tsv") {
    output = residueTsv;
    download = {
      filename: "protein-structure-residues.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  } else if (normalized.outputFormat === "atom-tsv") {
    output = atomTsv;
    download = {
      filename: "protein-structure-atoms.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  } else if (normalized.outputFormat === "json") {
    output = json;
    download = {
      filename: "protein-structure-viewer.json",
      mimeType: "application/json;charset=utf-8"
    };
  }

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download,
    warnings,
    recordsProcessed: 1,
    basesProcessed: summary.atomCount,
    processedUnitLabel: "atom",
    streams: {
      report: makeTextStream(report, "text/plain"),
      residues: makeTableStream(proteinStructureResidueColumns, summary.residueRows, "protein-structure-residues"),
      ...(summary.missingResidueRows.length
        ? {
            missingResidues: makeTableStream(
              proteinStructureMissingResidueColumns,
              summary.missingResidueRows,
              "protein-structure-missing-residues"
            )
          }
        : {}),
      ...(summary.biologicalAssemblyRows.length
        ? {
            biologicalAssemblies: makeTableStream(
              proteinStructureAssemblyColumns,
              summary.biologicalAssemblyRows,
              "protein-structure-biological-assemblies"
            )
          }
        : {}),
      ...(normalized.outputFormat === "atom-tsv"
        ? { atoms: makeTableStream(proteinStructureAtomColumns, summary.atomRows, "protein-structure-atoms") }
        : {}),
      ...(viewer ? { viewer: { kind: "viewer", viewerType: "protein-structure-viewer", viewer } } : {})
    },
    visual
  });
}

export const proteinStructureViewerRunner = runProteinStructureViewer;
