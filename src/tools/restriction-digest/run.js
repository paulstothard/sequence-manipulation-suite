import { parseDnaRnaSequenceOrFlatfile } from "../../core/dna-input-records.js";
import { makeDnaViewerData, makeDnaViewerStream, makeRestrictionViewerTracks } from "../../core/dna-viewer-data.js";
import {
  findRestrictionSites,
  makeRestrictionFragments,
  makeRestrictionGelSvg,
  makeRestrictionMapSvg,
  restrictionFragmentTableColumns
} from "../../core/restriction-tools.js";
import { cleanDnaRnaSequence } from "../../core/sequence.js";
import { exportDelimitedTable } from "../../core/table.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { restrictionEnzymeRecords } from "../../reference-data/restriction-enzymes/records.js";

function normalizeOptions(options = {}) {
  const viewerFormats = new Set(["interactive-viewer", "interactive-circular-viewer"]);
  return {
    enzyme1: String(options.enzyme1 ?? "ecori").toLowerCase(),
    enzyme2: String(options.enzyme2 ?? "bamhi").toLowerCase(),
    enzyme3: String(options.enzyme3 ?? "").toLowerCase(),
    topology: options.topology === "circular" ? "circular" : "linear",
    geneticCode: String(options.geneticCode ?? "1"),
    outputFormat: new Set(["report", "tsv", "fasta", "text-map", "svg-map", "svg-gel", ...viewerFormats]).has(options.outputFormat)
      ? options.outputFormat
      : "svg-gel"
  };
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function selectedDigestEnzymes(options) {
  const ids = [options.enzyme1, options.enzyme2, options.enzyme3].filter(Boolean);
  const seen = new Set();
  const selected = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    const enzyme = restrictionEnzymeRecords.find((record) => record.id === id);
    if (enzyme) {
      selected.push(enzyme);
      seen.add(id);
    }
  }
  return selected.length > 0 ? selected : [restrictionEnzymeRecords.find((record) => record.id === "ecori")].filter(Boolean);
}

function makeFragmentRows(records) {
  return records.flatMap((record) =>
    record.fragments.map((fragment) => ({
      record: record.title,
      fragment: fragment.fragment,
      start: fragment.start,
      end: fragment.end,
      length: fragment.length,
      topology: fragment.topology
    }))
  );
}

function makeReport(records, enzymes, options) {
  const lines = [];
  lines.push("Restriction digest");
  lines.push(`Topology: ${options.topology}`);
  lines.push(`Digest enzymes: ${enzymes.map((enzyme) => `${enzyme.name} (${enzyme.recognition})`).join(", ")}`);
  lines.push("");
  for (const record of records) {
    lines.push(`${record.title}`);
    lines.push(`Length: ${record.length} bp`);
    lines.push(`Cut sites: ${record.hits.length}`);
    lines.push(`Fragments: ${record.fragments.map((fragment) => `${fragment.length} bp`).join(", ") || "none"}`);
    if (options.topology === "circular" && record.hits.length === 0) {
      lines.push("Note: uncut circular DNA is treated as a circular molecule for gel migration, not as an equivalent-length linear fragment.");
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function makeTextMap(records) {
  return renderTextAnnotationMapFromItems(records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.hits
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    startField: "site_start",
    endField: "site_end",
    labelField: "enzyme"
  });
}

function sequenceForFragment(sequence, fragment) {
  if (fragment.topology === "circular" && fragment.start > fragment.end) {
    return `${sequence.slice(fragment.start - 1)}${sequence.slice(0, fragment.end)}`;
  }
  return sequence.slice(fragment.start - 1, fragment.end);
}

function wrapSequence(sequence, width = 60) {
  const lines = [];
  for (let index = 0; index < sequence.length; index += width) {
    lines.push(sequence.slice(index, index + width));
  }
  return lines.join("\n");
}

function makeFragmentFasta(records) {
  const lines = [];
  for (const record of records) {
    for (const fragment of record.fragments) {
      const sequence = sequenceForFragment(record.sequence, fragment);
      const wraps = fragment.topology === "circular" && fragment.start > fragment.end;
      const title = [
        `${record.title} fragment ${fragment.fragment}`,
        `${fragment.length} bp`,
        `${fragment.topology}`,
        `${fragment.start}-${fragment.end}${wraps ? " wrap" : ""}`
      ].join(" | ");
      lines.push(`>${title}`);
      lines.push(wrapSequence(sequence));
    }
  }
  return lines.join("\n");
}

function makeInteractiveViewer(records, options) {
  return makeDnaViewerData(records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.length,
    topology: options.topology,
    tracks: makeRestrictionViewerTracks(record, { includeFragments: true })
  })), {
    title: "Restriction digest viewer",
    geneticCode: options.geneticCode,
    layout: options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear"
  });
}

export function runRestrictionDigest(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const normalized = normalizeOptions(options);
  const parsedInput = parseDnaRnaSequenceOrFlatfile(input, {
    fallbackTitle: "sequence",
    label: "Restriction input"
  });
  const sequenceRecords = parsedInput.records;
  const enzymes = selectedDigestEnzymes(normalized);
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

  const records = [];
  let basesProcessed = 0;
  let charactersRemoved = parsedInput.charactersRemoved;
  for (const [recordIndex, record] of sequenceRecords.entries()) {
    context.throwIfCancelled?.();
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }
    const hits = findRestrictionSites(cleaned.sequence, enzymes, context);
    records.push({
      title: record.title,
      sequence: cleaned.sequence,
      length: cleaned.sequence.length,
      hits,
      fragments: makeRestrictionFragments(cleaned.sequence.length, hits, normalized.topology)
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
  const fragmentRows = makeFragmentRows(records);
  const report = makeReport(records, enzymes, normalized);
  const tsv = normalized.outputFormat === "tsv"
    ? exportDelimitedTable(restrictionFragmentTableColumns, fragmentRows, "\t")
    : "";
  const fasta = normalized.outputFormat === "fasta" ? makeFragmentFasta(records) : "";
  const textMap = normalized.outputFormat === "text-map" ? makeTextMap(records) : "";
  const mapSvg = normalized.outputFormat === "svg-map"
    ? makeRestrictionMapSvg(records, { ...normalized, forceLinear: true })
    : "";
  const gelSvg = normalized.outputFormat === "svg-gel" ? makeRestrictionGelSvg(records, normalized) : "";
  const viewer = isInteractiveViewerFormat(normalized.outputFormat) ? makeInteractiveViewer(records, normalized) : null;
  const output = normalized.outputFormat === "tsv"
    ? tsv
    : normalized.outputFormat === "fasta"
      ? fasta
      : normalized.outputFormat === "text-map"
        ? textMap
        : normalized.outputFormat === "svg-map"
          ? mapSvg
          : normalized.outputFormat === "svg-gel"
            ? gelSvg
            : isInteractiveViewerFormat(normalized.outputFormat)
              ? JSON.stringify(viewer, null, 2)
            : report;

  return makeToolResult({
    output,
    download: {
      filename: `restriction-digest.${normalized.outputFormat === "tsv" ? "tsv" : normalized.outputFormat === "fasta" ? "fasta" : normalized.outputFormat.startsWith("svg") ? "svg" : isInteractiveViewerFormat(normalized.outputFormat) ? "json" : "txt"}`,
      mimeType:
        normalized.outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : normalized.outputFormat === "fasta"
            ? "text/plain;charset=utf-8"
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
      ...(normalized.outputFormat === "tsv" ? { table: makeTableStream(restrictionFragmentTableColumns, fragmentRows, "restriction-fragments") } : {}),
      fragments: makeTableStream(restrictionFragmentTableColumns, fragmentRows, "restriction-fragments"),
      ...(normalized.outputFormat === "fasta" ? { fasta: makeTextStream(fasta, "text/plain") } : {}),
      ...(normalized.outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(normalized.outputFormat === "svg-map" ? { overview: makeTextStream(mapSvg, "image/svg+xml") } : {}),
      ...(normalized.outputFormat === "svg-gel" ? { gel: makeTextStream(gelSvg, "image/svg+xml") } : {}),
      ...(isInteractiveViewerFormat(normalized.outputFormat) ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: normalized.outputFormat === "svg-map"
      ? { svg: mapSvg }
      : normalized.outputFormat === "svg-gel"
        ? { svg: gelSvg }
        : isInteractiveViewerFormat(normalized.outputFormat)
          ? { viewer }
          : undefined
  });
}

export const restrictionDigestRunner = runRestrictionDigest;
