import { parseDnaRnaSequenceOrFlatfile } from "../../core/dna-input-records.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { iterateFastaFixedWindowSegments } from "../../core/fasta-fixed-window-segments.js";
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
import { MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS } from "../fasta-input-policy.js";

const MAX_STREAMED_RESTRICTION_BASES = 50_000_000;
const MAX_RESTRICTION_WORK = 1_000_000_000;
const MAX_RESTRICTION_SITES = 100_000;
const MAX_SUMMARY_ROWS = 50_000;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = 25 * 1024 * 1024;

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
    record.summaryRows = [];
    for (const enzyme of enzymes) {
      const hits = record.allHits.filter((hit) => hit.enzyme_id === enzyme.id);
      const siteCount = hits.length;
      if (siteCount < options.minimumSites || siteCount > options.maximumSites) {
        continue;
      }
      const row = {
        record: record.title,
        enzyme: enzyme.name,
        recognition: enzyme.recognition,
        sites: siteCount,
        cut_positions: summarizePositions(hits),
        site_positions: summarizeSitePositions(hits),
        fragment_sizes: summarizeFragmentSizes(record.length, hits, options.topology),
        topology: options.topology
      };
      rows.push(row);
      record.summaryRows.push(row);
      if (rows.length > MAX_SUMMARY_ROWS) throw new Error(`Restriction summary exceeds the ${MAX_SUMMARY_ROWS.toLocaleString()}-row limit. Raise the minimum-sites filter or select fewer enzymes and records.`);
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
    const recordRows = record.summaryRows;
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
    const allHits = findRestrictionSites(cleaned.sequence, enzymes, context, normalized);
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

  return finishRestrictionSummary({ analyzedRecords, enzymes, normalized, warnings, basesProcessed, charactersRemoved, context });
}

function finishRestrictionSummary({ analyzedRecords, enzymes, normalized, warnings, basesProcessed, charactersRemoved, context }) {
  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  const rows = makeSummaryRows(analyzedRecords, enzymes, normalized);
  for (const record of analyzedRecords) {
    const shownEnzymes = new Set(record.summaryRows.map((row) => row.enzyme));
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
  if (Math.max(output.length, report.length) > MAX_MATERIALIZED_OUTPUT_CHARACTERS) {
    throw new Error("Restriction summary output exceeds the 25 MiB materialized-output limit. Select fewer enzymes or records.");
  }

  return makeToolResult({
    output,
    sequenceSearch: normalized.outputFormat === "text-map"
      ? { format: "labelled-blocks", alphabet: "dna-rna" }
      : undefined,
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
    recordsProcessed: analyzedRecords.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(normalized.outputFormat === "report" ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(normalized.outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", alphabet: "dna-rna" }) } : {}),
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

export async function runRestrictionSummaryWorker(input, options = {}, context = {}) {
  const largeSource = Boolean(options.loadedFastaFile?.stream || ["indexed", "bgzf"].includes(options.sourceMode) || (String(input ?? "").length > MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS && !/^\s*(LOCUS|ID\s)/i.test(String(input ?? ""))));
  if (!largeSource) return runRestrictionSummary(input, options, context);
  const normalized = normalizeOptions(options);
  if (!["report", "tsv", "svg-line-map"].includes(normalized.outputFormat)) {
    throw new Error("Large FASTA sources support report, table, and single-line site map output. Sequence text maps, detailed maps, and viewers require bounded pasted input.");
  }
  const enzymes = selectRestrictionEnzymes(restrictionEnzymeRecords, normalized.enzymeIds);
  const maxWidth = Math.max(...enzymes.map((enzyme) => Math.max(enzyme.recognition.length, Math.abs(enzyme.cutTop), Math.abs(enzyme.cutBottom)))) + 20;
  const opened = await openCleanDnaRnaFastaSource(input, {
    ...options,
    maxSourceBases: Math.min(MAX_STREAMED_RESTRICTION_BASES, Number(options.maxSourceBases) || MAX_STREAMED_RESTRICTION_BASES)
  }, context);
  const analyzedRecords = [];
  const warnings = [];
  let current = null;
  let work = 0;
  let storedSites = 0;
  let basesProcessed = 0;
  let charactersRemoved = 0;
  const modulo = (value, length) => ((value % length) + length) % length;

  for await (const event of iterateFastaFixedWindowSegments(opened.events(), { maxWindowLength: maxWidth })) {
    if (event.type === "record-start") {
      current = { title: event.title, sequence: "", length: 0, allHits: [], shownHits: [], prefix: "", suffix: "", keys: new Set() };
      continue;
    }
    if (event.type === "scan-segment") {
      const ownedLength = event.ownedEnd0 - event.ownedStart0;
      work += ownedLength * enzymes.length;
      if (work > MAX_RESTRICTION_WORK) throw new Error(`Restriction scan exceeds the ${MAX_RESTRICTION_WORK.toLocaleString()} enzyme-window work budget. Select fewer enzymes or records.`);
      if (!current.prefix) current.prefix = event.text.slice(0, maxWidth);
      current.suffix = event.text.slice(-maxWidth);
      const hits = findRestrictionSites(event.text, enzymes, context, { topology: "linear", maxHits: MAX_RESTRICTION_SITES });
      for (const hit of hits) {
        const start0 = event.segmentStart0 + hit.site_start - 1;
        if (start0 < event.ownedStart0 || start0 >= event.ownedEnd0) continue;
        const shifted = {
          ...hit,
          site_start: hit.site_start + event.segmentStart0,
          site_end: hit.site_end + event.segmentStart0,
          cut_after: hit.cut_after + event.segmentStart0,
          complement_cut_after: hit.complement_cut_after + event.segmentStart0
        };
        const key = `${shifted.enzyme_id}\t${shifted.strand}\t${shifted.site_start}`;
        if (current.keys.has(key)) continue;
        current.keys.add(key);
        current.allHits.push(shifted);
        storedSites += 1;
        if (storedSites > MAX_RESTRICTION_SITES) throw new Error(`Restriction sites exceed the ${MAX_RESTRICTION_SITES.toLocaleString()}-site stored-result limit. Select fewer enzymes or records.`);
      }
      await context.yieldIfNeeded?.();
      continue;
    }
    if (event.type === "record-end" && current) {
      current.length = event.length;
      basesProcessed += event.length;
      charactersRemoved += event.removedCount;
      if (event.removedCount) warnings.push(`${current.title}: removed ${event.removedCount} non-DNA/RNA character(s).`);
      if (!event.length) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      if (normalized.topology === "circular" && event.length && current.prefix && current.suffix) {
        const bridge = current.suffix + current.prefix;
        const offset = event.length - current.suffix.length;
        const bridgeHits = findRestrictionSites(bridge, enzymes, context, { topology: "linear", maxHits: MAX_RESTRICTION_SITES });
        for (const hit of bridgeHits) {
          if (hit.recognition.length > event.length) continue;
          const rawStart = hit.site_start + offset;
          const start = modulo(rawStart - 1, event.length) + 1;
          const siteEnd = modulo(hit.site_end + offset - 1, event.length) + 1;
          const key = `${hit.enzyme_id}\t${hit.strand}\t${start}`;
          if (current.keys.has(key)) continue;
          current.keys.add(key);
          current.allHits.push({
            ...hit,
            site_start: start,
            site_end: siteEnd,
            ...(hit.site_end + offset > event.length && rawStart <= event.length ? { wraps_origin: true } : {}),
            cut_after: modulo(hit.cut_after + offset, event.length),
            complement_cut_after: modulo(hit.complement_cut_after + offset, event.length)
          });
          storedSites += 1;
          if (storedSites > MAX_RESTRICTION_SITES) throw new Error(`Restriction sites exceed the ${MAX_RESTRICTION_SITES.toLocaleString()}-site stored-result limit. Select fewer enzymes or records.`);
        }
      }
      current.allHits.sort((left, right) => left.site_start - right.site_start || left.cut_after - right.cut_after || left.enzyme.localeCompare(right.enzyme));
      delete current.prefix;
      delete current.suffix;
      delete current.keys;
      analyzedRecords.push(current);
      current = null;
      context.reportProgress?.({ phase: "scanning-records", recordsProcessed: analyzedRecords.length, progress: Math.min(0.8, 0.05 + basesProcessed / MAX_STREAMED_RESTRICTION_BASES) });
    }
  }
  warnings.push(...opened.warnings);
  if (!analyzedRecords.length) return makeToolResult({ output: "", warnings: [opened.source.stats.inputProvided ? "No DNA/RNA records were found." : "No sequence input was provided.", ...warnings], recordsProcessed: 0, basesProcessed: 0, charactersRemoved });
  if (normalized.outputFormat === "svg-line-map" && storedSites > 5_000) throw new Error("Single-line restriction map exceeds the 5,000-site visual limit. Use report or table output.");
  return finishRestrictionSummary({ analyzedRecords, enzymes, normalized, warnings, basesProcessed, charactersRemoved, context });
}
