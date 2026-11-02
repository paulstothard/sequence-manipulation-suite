import { makeDesignAnalysisJson } from "../../core/design-analysis.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeSequenceFeatureTracks } from "../../core/sequence-feature-tracks.js";
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
  talenReferenceHitColumns,
  talenTargetColumns
} from "../../core/talen-design.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { loadReferenceGenomeRecords } from "../reference-genome-runner.js";
import { normalizeTalenDesignOptions } from "../../core/talen-design-options.js";

function rowsByRecord(result) {
  return result.records.map((record, recordIndex) => ({
    title: record.title,
    sequence: record.sequence,
    rows: result.rows.filter((row) => row.recordIndex === recordIndex)
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
      strand: row.right_strand,
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
              strand: row.right_strand,
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
  return makeDnaViewerData(result.records.map((record, recordIndex) => {
    const rows = result.rows.filter((row) => row.recordIndex === recordIndex);
    return {
      title: record.title,
      sequence: record.sequence,
      length: record.sequence.length,
      topology: "linear",
      tracks: [...makeSequenceFeatureTracks(record), ...(rows.length > 0
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
                  strand: row.right_strand,
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
        : [])]
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

  options = { ...options, ...normalizeTalenDesignOptions(options) };
  const reference = await loadReferenceGenomeRecords(options, {
    loadedRecordLimit: options.maxReferenceRecordLength,
    indexedBaseLimit: options.maxIndexedReferenceBases
  }, context);
  const result = await designTalenTargets(input, {
    ...options,
    referenceRecords: reference.records,
    referenceWarnings: reference.warnings,
    referenceRecordsSkipped: reference.recordsSkipped ?? 0,
    referenceCharactersRemoved: reference.charactersRemoved,
    referenceBasesProcessed: reference.basesProcessed,
    referenceSource: reference.source
  }, context);
  const outputFormat = result.options.outputFormat;
  result.analysisRevision = "2026-11-01";

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makeTalenReport(result);
  const tsv = outputFormat === "tsv" ? makeTalenTargetTsv(result.rows) : "";
  const rvdTsv = outputFormat === "rvd-tsv" ? makeTalenRvdTsv(result.rvdRows) : "";
  const contextText = outputFormat === "context-text" ? makeTalenContextText(result.rows) : "";
  const halfsiteFasta = outputFormat === "halfsite-fasta" ? makeTalenHalfSiteFasta(result.rows, result.options.lineWidth) : "";
  const textMap = outputFormat === "text-map" ? makeTextMap(result) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(result) : "";
  const viewer = outputFormat === "interactive-viewer" ? makeTalenViewerData(result) : null;
  const viewerJson = viewer ? JSON.stringify(viewer, null, 2) : "";
  const analysis = outputFormat === "analysis-json" ? makeDesignAnalysisJson("talen-target-finder", result, options) : "";
  const referenceTsv = outputFormat === "reference-tsv" ? exportDelimitedTable(talenReferenceHitColumns, result.referenceHits, "\t") : "";
  const output = outputFormat === "analysis-json" ? analysis : outputFormat === "reference-tsv" ? referenceTsv : outputFormat === "tsv"
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
    optionsUsed: result.options,
    sequenceSearch: outputFormat === "halfsite-fasta"
      ? { format: "fasta", alphabet: "dna-rna" }
      : outputFormat === "context-text"
        ? { format: "context", alphabet: "dna-rna" }
        : outputFormat === "text-map"
          ? { format: "labelled-blocks", alphabet: "dna-rna" }
          : undefined,
    download: {
      filename: outputFormat === "analysis-json" ? "talen-analysis.json" : outputFormat === "reference-tsv" ? "talen-reference-hits.tsv" : outputFormat === "tsv"
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
      mimeType: outputFormat === "analysis-json" ? "application/json;charset=utf-8" : outputFormat === "reference-tsv" ? "text/tab-separated-values;charset=utf-8" : outputFormat === "tsv" || outputFormat === "rvd-tsv"
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
    notes: result.notes,
    recordsProcessed: result.records.length,
    basesProcessed: result.basesProcessed,
    charactersRemoved: result.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      ...(analysis ? { analysis: makeTextStream(analysis, "application/json") } : {}),
      ...(outputFormat === "reference-tsv" ? { referenceHits: makeTableStream(talenReferenceHitColumns, result.referenceHits, "talen-reference-hits") } : {}),
      table: makeTableStream(talenTargetColumns, result.rows, "talen-target-pairs"),
      ...(outputFormat === "rvd-tsv" ? { rvdTable: makeTableStream(talenRvdColumns, result.rvdRows, "talen-rvd-repeats") } : {}),
      ...(outputFormat === "context-text" ? {
        contextText: makeTextStream(contextText, "text/plain", { format: "context", alphabet: "dna-rna" })
      } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", alphabet: "dna-rna" }) } : {}),
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
