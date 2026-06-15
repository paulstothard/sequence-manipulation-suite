import {
  makeDnaViewerData,
  makeDnaViewerStream
} from "../../core/dna-viewer-data.js";
import {
  designTalenTargets,
  makeTalenContextText,
  makeTalenHalfSiteFasta,
  makeTalenReport,
  makeTalenRvdTsv,
  makeTalenTargetTsv,
  talenRvdColumns,
  talenTargetColumns
} from "../../core/talen-design.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { loadReferenceGenomeRecords } from "../reference-genome-runner.js";

const OUTPUT_FORMATS = new Set(["report", "tsv", "rvd-tsv", "context-text", "halfsite-fasta", "text-map", "svg-map", "interactive-viewer"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

function rowsByRecord(result) {
  return result.records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    rows: result.rows.filter((row) => row.record === record.title)
  }));
}

function mapItemsForRow(row) {
  return [
    {
      ...row,
      label: `${row.pair_id} L`,
      start: row.left_start,
      end: row.left_end,
      strand: row.strand,
      type: "TALEN left half-site"
    },
    {
      ...row,
      label: `${row.pair_id} R`,
      start: row.right_start,
      end: row.right_end,
      strand: row.strand,
      type: "TALEN right half-site"
    }
  ];
}

function makeTextMap(result) {
  const maxPerRecord = result.options.mapMaxPairsPerRecord;
  return renderTextAnnotationMapFromItems(rowsByRecord(result).map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.rows.slice(0, maxPerRecord).flatMap(mapItemsForRow)
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    labelPrefix: "t"
  });
}

function makeSvgMap(result) {
  const maxPerRecord = result.options.mapMaxPairsPerRecord;
  return renderSequenceMap({
    title: "TALEN target pair map",
    records: rowsByRecord(result).slice(0, 12).map((record) => {
      const shownRows = record.rows.slice(0, maxPerRecord);
      const omitted = Math.max(0, record.rows.length - shownRows.length);
      return {
        title: record.title,
        length: record.sequence.length,
        molecule: "dna",
        features: shownRows.flatMap((row, index) => {
          const pairSlot = index;
          return [
            {
              start: row.left_start,
              end: row.left_end,
              strand: row.strand,
              className: "talenLeft",
              label: `${row.pair_id} L`,
              showLabel: true,
              type: "TALEN left half-site",
              slot: pairSlot
            },
            {
              start: row.spacer_start,
              end: row.spacer_end,
              strand: row.strand,
              className: "talenSpacer",
              label: `${row.pair_id} spacer`,
              showLabel: false,
              type: "TALEN spacer",
              slot: pairSlot,
              connector: true,
              connectorEndGapPx: 2,
              dashArray: "3 4",
              opacity: 0.72
            },
            {
              start: row.right_start,
              end: row.right_end,
              strand: row.strand,
              className: "talenRight",
              label: `${row.pair_id} R`,
              showLabel: true,
              type: "TALEN right half-site",
              slot: pairSlot
            }
          ];
        }),
        notes: [
          `TALEN target pairs: ${record.rows.length}; shown: ${shownRows.length}; omitted: ${omitted}.`,
          "Each row is one candidate pair; dashed lines show the spacer between paired half-sites."
        ]
      };
    }),
    styles: {
      talenLeft: { label: "Left half-site", fill: "#2563eb", stroke: "#1d4ed8" },
      talenRight: { label: "Right half-site", fill: "#f97316", stroke: "#c2410c" },
      talenSpacer: { label: "Pair spacer", fill: "none", stroke: "#94a3b8", legend: false }
    }
  });
}

function makeTalenViewerData(result) {
  return makeDnaViewerData(result.records.map((record) => {
    const rows = result.rows.filter((row) => row.record === record.title);
    return {
      title: record.title,
      sequence: record.sequence,
      length: record.sequence.length,
      topology: "linear",
      tracks: rows.length > 0
        ? [
            {
              id: "talen-target-pairs",
              type: "features",
              label: "TALEN target pairs",
              layout: "stacked-intervals",
              featureOpacity: 0.72,
              items: rows.flatMap((row) => [
                {
                  start: row.left_start,
                  end: row.left_end,
                  strand: row.strand,
                  length: row.left_length,
                  label: `${row.pair_id} L`,
                  name: `${row.pair_id} left half-site`,
                  type: "TALEN left half-site",
                  pairId: row.pair_id,
                  side: "left",
                  designStrand: row.strand,
                  targetStart: row.target_start,
                  targetEnd: row.target_end,
                  spacerStart: row.spacer_start,
                  spacerEnd: row.spacer_end,
                  spacerLength: row.spacer_length,
                  targetDna: row.left_site_dna,
                  rvd: row.left_rvd,
                  score: row.score,
                  referenceMatches: row.reference_match_count,
                  flags: row.flags
                },
                {
                  start: row.right_start,
                  end: row.right_end,
                  strand: row.strand,
                  length: row.right_length,
                  label: `${row.pair_id} R`,
                  name: `${row.pair_id} right half-site`,
                  type: "TALEN right half-site",
                  pairId: row.pair_id,
                  side: "right",
                  designStrand: row.strand,
                  targetStart: row.target_start,
                  targetEnd: row.target_end,
                  spacerStart: row.spacer_start,
                  spacerEnd: row.spacer_end,
                  spacerLength: row.spacer_length,
                  targetDna: row.right_site_dna,
                  bindingDna: row.right_binding_dna,
                  rvd: row.right_rvd,
                  score: row.score,
                  referenceMatches: row.reference_match_count,
                  flags: row.flags
                }
              ])
            }
          ]
        : []
    };
  }), {
    title: "TALEN target pair viewer",
    layout: "linear"
  });
}

export async function runTalenTargetFinder(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const reference = await loadReferenceGenomeRecords(options, {
    loadedRecordLimit: Number.parseInt(options.maxReferenceRecordLength, 10) || 500000,
    indexedBaseLimit: Number.parseInt(options.maxIndexedReferenceBases, 10) || 5000000
  }, context);
  const result = await designTalenTargets(input, {
    ...options,
    referenceRecords: reference.records,
    referenceWarnings: reference.warnings,
    referenceCharactersRemoved: reference.charactersRemoved,
    referenceBasesProcessed: reference.basesProcessed,
    referenceSource: reference.source
  }, context);
  const outputFormat = normalizeOutputFormat(options.outputFormat);

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makeTalenReport(result);
  const tsv = outputFormat === "tsv" ? makeTalenTargetTsv(result.rows) : "";
  const rvdTsv = outputFormat === "rvd-tsv" ? makeTalenRvdTsv(result.rvdRows) : "";
  const contextText = outputFormat === "context-text" ? makeTalenContextText(result.rows) : "";
  const halfsiteFasta = outputFormat === "halfsite-fasta" ? makeTalenHalfSiteFasta(result.rows, Number.parseInt(options.lineWidth, 10) || 60) : "";
  const textMap = outputFormat === "text-map" ? makeTextMap(result) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(result) : "";
  const viewer = outputFormat === "interactive-viewer" ? makeTalenViewerData(result) : null;
  const viewerJson = viewer ? JSON.stringify(viewer, null, 2) : "";
  const output = outputFormat === "tsv"
    ? tsv
    : outputFormat === "rvd-tsv"
      ? rvdTsv
      : outputFormat === "context-text"
        ? contextText
        : outputFormat === "halfsite-fasta"
          ? halfsiteFasta
          : outputFormat === "text-map"
            ? textMap
            : outputFormat === "svg-map"
              ? svgMap
              : outputFormat === "interactive-viewer"
                ? viewerJson
              : report;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "tsv"
        ? "talen-target-pairs.tsv"
        : outputFormat === "rvd-tsv"
          ? "talen-rvd-repeats.tsv"
          : outputFormat === "halfsite-fasta"
          ? "talen-half-sites.fasta"
          : outputFormat === "svg-map"
            ? "talen-target-map.svg"
            : outputFormat === "interactive-viewer"
              ? "talen-target-viewer.json"
              : "talen-target-finder.txt",
      mimeType: outputFormat === "tsv" || outputFormat === "rvd-tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "halfsite-fasta"
          ? "text/x-fasta;charset=utf-8"
          : outputFormat === "svg-map"
            ? "image/svg+xml;charset=utf-8"
            : outputFormat === "interactive-viewer"
              ? "application/json;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.basesProcessed,
    charactersRemoved: result.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(talenTargetColumns, result.rows, "talen-target-pairs"),
      ...(outputFormat === "rvd-tsv" ? { rvdTable: makeTableStream(talenRvdColumns, result.rvdRows, "talen-rvd-repeats") } : {}),
      ...(outputFormat === "context-text" ? { contextText: makeTextStream(contextText, "text/plain") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : viewer
        ? { viewer }
        : undefined
  });
}
