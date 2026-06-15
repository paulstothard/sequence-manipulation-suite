import { parseDnaRnaSequenceOrFlatfile } from "../../core/dna-input-records.js";
import { makeDnaViewerData, makeDnaViewerStream, makeRestrictionViewerTracks } from "../../core/dna-viewer-data.js";
import {
  findRestrictionSites,
  getUniqueCutPositions,
  makeRestrictionFragments,
  makeRestrictionLineMapSvg,
  makeRestrictionMapSvg,
  restrictionSummaryTableColumns,
  selectRestrictionEnzymes
} from "../../core/restriction-tools.js";
import { cleanDnaRnaSequence } from "../../core/sequence.js";
import { exportDelimitedTable } from "../../core/table.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { restrictionEnzymeRecords } from "../../reference-data/restriction-enzymes/records.js";

function normalizeOptions(options = {}) {
  const viewerFormats = new Set(["interactive-viewer", "interactive-circular-viewer"]);
  return {
    enzymeIds: options.enzymeIds ?? "common",
    topology: options.topology === "circular" ? "circular" : "linear",
    geneticCode: String(options.geneticCode ?? "1"),
    minimumSites: Math.max(0, Number.parseInt(options.minimumSites ?? 1, 10) || 0),
    maximumSites: Math.max(1, Number.parseInt(options.maximumSites ?? 5, 10) || 5),
    outputFormat: new Set(["report", "tsv", "text-map", "svg-map", "svg-line-map", ...viewerFormats]).has(options.outputFormat) ? options.outputFormat : "report"
  };
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function cleanRecord(record, options, warnings) {
  const cleaned = cleanDnaRnaSequence(record.sequence, {
    preserveCase: false,
    keepGaps: false
  });
  if (cleaned.removedCount > 0) {
    warnings.push(`${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
  }
  if (cleaned.sequence.length === 0) {
    warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
  }
  return { title: record.title, sequence: cleaned.sequence, removedCount: cleaned.removedCount };
}

function summarizePositions(hits) {
  return getUniqueCutPositions(hits, Number.MAX_SAFE_INTEGER).join(",") || "none";
}

function summarizeSitePositions(hits) {
  return hits.map((hit) => `${hit.site_start}-${hit.site_end}`).join(",") || "none";
}

function summarizeFragmentSizes(sequenceLength, hits, topology) {
  return makeRestrictionFragments(sequenceLength, hits, topology)
    .map((fragment) => fragment.length)
    .join(",") || "none";
}

function makeSummaryRows(analyzedRecords, enzymes, options) {
  const rows = [];
  for (const record of analyzedRecords) {
    for (const enzyme of enzymes) {
      const hits = record.allHits.filter((hit) => hit.enzyme_id === enzyme.id);
      const siteCount = hits.length;
      if (siteCount < options.minimumSites || siteCount > options.maximumSites) {
        continue;
      }
      rows.push({
        record: record.title,
        enzyme: enzyme.name,
        recognition: enzyme.recognition,
        sites: siteCount,
        cut_positions: summarizePositions(hits),
        site_positions: summarizeSitePositions(hits),
        fragment_sizes: summarizeFragmentSizes(record.length, hits, options.topology),
        topology: options.topology
      });
    }
  }
  return rows;
}

function makeReport(rows, records, enzymes, options) {
  const lines = [];
  lines.push("Restriction summary");
  lines.push(`Topology: ${options.topology}`);
  lines.push(`Enzymes screened: ${enzymes.map((enzyme) => enzyme.name).join(", ")}`);
  lines.push(`Site-count filter: ${options.minimumSites} to ${options.maximumSites} per enzyme`);
  lines.push("");
  for (const record of records) {
    const recordRows = rows.filter((row) => row.record === record.title);
    lines.push(`${record.title}`);
    lines.push(`Length: ${record.length} bp`);
    lines.push(`Enzymes shown: ${recordRows.length}`);
    if (recordRows.length === 0) {
      lines.push("No enzymes passed the current site-count filter.");
    } else {
      lines.push("enzyme\trecognition\tsites\tcut_positions\tfragment_sizes");
      for (const row of recordRows) {
        lines.push([row.enzyme, row.recognition, row.sites, row.cut_positions, row.fragment_sizes].join("\t"));
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function makeTextMap(analyzedRecords) {
  return renderTextAnnotationMapFromItems(analyzedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.shownHits
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    startField: "site_start",
    endField: "site_end",
    labelField: "enzyme"
  });
}

function makeSiteMap(analyzedRecords, options) {
  return makeRestrictionMapSvg(analyzedRecords.map((record) => ({
    title: record.title,
    length: record.length,
    sequence: record.sequence,
    hits: record.shownHits,
    fragments: makeRestrictionFragments(record.length, record.shownHits, options.topology)
  })), {
    topology: options.topology,
    forceLinear: true,
    showFragmentLabels: false,
    showCircularWrapNote: false
  });
}

function makeSiteLineMap(analyzedRecords) {
  return makeRestrictionLineMapSvg(analyzedRecords.map((record) => ({
    title: record.title,
    length: record.length,
    hits: record.shownHits
  })), {
    title: "Restriction single-line site map",
    showFragmentLabels: false
  });
}

function makeInteractiveViewer(analyzedRecords, options) {
  return makeDnaViewerData(analyzedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.length,
    topology: options.topology,
    tracks: makeRestrictionViewerTracks({
      hits: record.shownHits
    })
  })), {
    title: "Restriction summary viewer",
    geneticCode: options.geneticCode,
    layout: options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear"
  });
}

export function runRestrictionSummary(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const normalized = normalizeOptions(options);
  const parsedInput = parseDnaRnaSequenceOrFlatfile(input, {
    fallbackTitle: "sequence",
    label: "Restriction input"
  });
  const sequenceRecords = parsedInput.records;
  const enzymes = selectRestrictionEnzymes(restrictionEnzymeRecords, normalized.enzymeIds);
  const warnings = [...parsedInput.warnings];

  if (sequenceRecords.length === 0) {
    return makeToolResult({
      output: "",
      warnings: [...warnings, "No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: parsedInput.charactersRemoved
    });
  }

  const analyzedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = parsedInput.charactersRemoved;
  for (const [recordIndex, record] of sequenceRecords.entries()) {
    context.throwIfCancelled?.();
    const cleaned = cleanRecord(record, normalized, warnings);
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;
    const allHits = findRestrictionSites(cleaned.sequence, enzymes, context);
    analyzedRecords.push({
      title: cleaned.title,
      sequence: cleaned.sequence,
      length: cleaned.sequence.length,
      allHits,
      shownHits: []
    });
    context.reportProgress?.({
      phase: "scanning-records",
      progress: 0.05 + ((recordIndex + 1) / sequenceRecords.length) * 0.75,
      recordsProcessed: recordIndex + 1,
      totalRecords: sequenceRecords.length
    });
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  const rows = makeSummaryRows(analyzedRecords, enzymes, normalized);
  for (const record of analyzedRecords) {
    const shownEnzymes = new Set(rows.filter((row) => row.record === record.title).map((row) => row.enzyme));
    record.shownHits = record.allHits.filter((hit) => shownEnzymes.has(hit.enzyme));
  }

  const report = makeReport(rows, analyzedRecords, enzymes, normalized);
  const tsv = normalized.outputFormat === "tsv"
    ? exportDelimitedTable(restrictionSummaryTableColumns, rows, "\t")
    : "";
  const textMap = normalized.outputFormat === "text-map" ? makeTextMap(analyzedRecords) : "";
  const svgMap = normalized.outputFormat === "svg-map" ? makeSiteMap(analyzedRecords, normalized) : "";
  const lineMapSvg = normalized.outputFormat === "svg-line-map" ? makeSiteLineMap(analyzedRecords) : "";
  const viewer = isInteractiveViewerFormat(normalized.outputFormat) ? makeInteractiveViewer(analyzedRecords, normalized) : null;
  const output = normalized.outputFormat === "tsv"
    ? tsv
    : normalized.outputFormat === "text-map"
      ? textMap
      : normalized.outputFormat === "svg-map"
        ? svgMap
        : normalized.outputFormat === "svg-line-map"
          ? lineMapSvg
          : isInteractiveViewerFormat(normalized.outputFormat)
            ? JSON.stringify(viewer, null, 2)
            : report;

  return makeToolResult({
    output,
    download: {
      filename: `restriction-summary.${normalized.outputFormat === "tsv" ? "tsv" : normalized.outputFormat.startsWith("svg") ? "svg" : isInteractiveViewerFormat(normalized.outputFormat) ? "json" : "txt"}`,
      mimeType:
        normalized.outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : normalized.outputFormat.startsWith("svg")
            ? "image/svg+xml;charset=utf-8"
            : isInteractiveViewerFormat(normalized.outputFormat)
              ? "application/json;charset=utf-8"
              : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: sequenceRecords.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(normalized.outputFormat === "report" ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(normalized.outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(normalized.outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(normalized.outputFormat === "svg-line-map" ? { overview: makeTextStream(lineMapSvg, "image/svg+xml") } : {}),
      ...(isInteractiveViewerFormat(normalized.outputFormat) ? { viewer: makeDnaViewerStream(viewer) } : {}),
      table: makeTableStream(restrictionSummaryTableColumns, rows, "restriction-summary")
    },
    visual: normalized.outputFormat === "svg-map"
      ? { svg: svgMap }
      : normalized.outputFormat === "svg-line-map"
        ? { svg: lineMapSvg }
        : isInteractiveViewerFormat(normalized.outputFormat)
          ? { viewer }
        : undefined
  });
}

export const restrictionSummaryRunner = runRestrictionSummary;
