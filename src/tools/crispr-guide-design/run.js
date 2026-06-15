import {
  makeDnaViewerData,
  makeDnaViewerStream
} from "../../core/dna-viewer-data.js";
import {
  CRISPR_REFERENCE_SEPARATOR,
  crisprGuideDesignColumns,
  crisprReferenceMatchColumns,
  designCrisprGuides,
  makeCrisprGuideContextText,
  makeCrisprGuideDesignReport,
  makeCrisprGuideDesignTsv,
  makeCrisprGuideFasta,
  makeCrisprReferenceMatchTsv
} from "../../core/crispr-guide-design.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { makeLegacyReferenceScreenOptions } from "../reference-genome-runner.js";

const OUTPUT_FORMATS = new Set(["report", "tsv", "offtarget-tsv", "guide-fasta", "context-text", "text-map", "svg-map", "interactive-viewer"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

function inputWithOptionalReference(input, options = {}) {
  const text = String(input ?? "");
  const referenceText = String(options.referenceText ?? "").trim();
  const alreadySplit = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .some((line) => line.trim() === CRISPR_REFERENCE_SEPARATOR);
  if (
    options.searchReferenceOffTargets === true &&
    (options.referenceInputMode ?? "pasted") === "pasted" &&
    referenceText &&
    !alreadySplit
  ) {
    return `${text.trim()}\n${CRISPR_REFERENCE_SEPARATOR}\n${referenceText}`;
  }
  return input;
}

function rowsByRecord(result) {
  return result.records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    rows: result.rows.filter((row) => row.record === record.title)
  }));
}

function makeTextMap(result) {
  const maxPerRecord = result.options.mapMaxCandidatesPerRecord;
  return renderTextAnnotationMapFromItems(rowsByRecord(result).map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.rows.slice(0, maxPerRecord).map((row) => ({
      ...row,
      label: row.candidate_id,
      start: row.guide_start,
      end: row.guide_end
    }))
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    labelPrefix: "g"
  });
}

function makeSvgMap(result) {
  const maxPerRecord = result.options.mapMaxCandidatesPerRecord;
  return renderSequenceMap({
    title: "CRISPR guide candidate map",
    records: rowsByRecord(result).slice(0, 12).map((record) => {
      const shownRows = record.rows.slice(0, maxPerRecord);
      const omitted = Math.max(0, record.rows.length - shownRows.length);
      return {
        title: record.title,
        length: record.sequence.length,
        molecule: "dna",
        features: shownRows.map((row) => ({
          start: row.guide_start,
          end: row.guide_end,
          strand: row.strand,
          className: row.strand === "+" ? "guideForward" : "guideReverse",
          label: row.candidate_id,
          showLabel: true,
          type: "CRISPR guide"
        })),
        notes: [
          `CRISPR guide candidates: ${record.rows.length}; shown: ${shownRows.length}; omitted: ${omitted}.`
        ]
      };
    }),
    styles: {
      guideForward: { label: "Guide + strand", fill: "#2563eb", stroke: "#1d4ed8" },
      guideReverse: { label: "Guide - strand", fill: "#db2777", stroke: "#be185d" }
    }
  });
}

function makeCrisprViewerData(result) {
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
              id: "crispr-guide-candidates",
              type: "features",
              label: "CRISPR guide candidates",
              layout: "stacked-intervals",
              featureOpacity: 0.74,
              items: rows.map((row) => ({
                start: row.guide_start,
                end: row.guide_end,
                strand: row.strand,
                length: Math.abs(row.guide_end - row.guide_start) + 1,
                label: row.candidate_id,
                name: row.candidate_id,
                type: row.nuclease,
                guideDna: row.guide_dna,
                guideRna: row.guide_rna,
                pamSequence: row.pam_sequence,
                pamStart: row.pam_start,
                pamEnd: row.pam_end,
                cutPosition: row.cut_position,
                gcPercent: row.gc_percent,
                reviewScore: row.review_score,
                flags: row.flags,
                guideFeatures: row.guide_features,
                cutFeatures: row.cut_features,
                nearestFeature: row.nearest_feature,
                referenceMatches: row.reference_match_count,
                referenceMatchesBeyondFirstExact: row.reference_matches_beyond_first_exact
              }))
            }
          ]
        : []
    };
  }), {
    title: "CRISPR guide candidate viewer",
    layout: "linear"
  });
}

export async function runCrisprGuideDesign(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const runOptions = await makeLegacyReferenceScreenOptions(options, context);
  const result = await designCrisprGuides(inputWithOptionalReference(input, runOptions), runOptions, context);
  const outputFormat = normalizeOutputFormat(options.outputFormat);

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makeCrisprGuideDesignReport(result);
  const tsv = outputFormat === "tsv" ? makeCrisprGuideDesignTsv(result.rows) : "";
  const offTargetTsv = outputFormat === "offtarget-tsv" ? makeCrisprReferenceMatchTsv(result.referenceMatchRows ?? []) : "";
  const guideFasta = outputFormat === "guide-fasta" ? makeCrisprGuideFasta(result.rows, result.options.lineWidth) : "";
  const contextText = outputFormat === "context-text" ? makeCrisprGuideContextText(result.rows) : "";
  const textMap = outputFormat === "text-map" ? makeTextMap(result) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(result) : "";
  const viewer = outputFormat === "interactive-viewer" ? makeCrisprViewerData(result) : null;
  const viewerJson = viewer ? JSON.stringify(viewer, null, 2) : "";
  const output = outputFormat === "tsv"
    ? tsv
    : outputFormat === "offtarget-tsv"
      ? offTargetTsv
      : outputFormat === "guide-fasta"
        ? guideFasta
        : outputFormat === "context-text"
          ? contextText
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
        ? "crispr-guide-candidates.tsv"
        : outputFormat === "offtarget-tsv"
          ? "crispr-guide-reference-matches.tsv"
        : outputFormat === "guide-fasta"
          ? "crispr-guide-rnas.fasta"
          : outputFormat === "svg-map"
            ? "crispr-guide-map.svg"
            : outputFormat === "interactive-viewer"
              ? "crispr-guide-viewer.json"
            : "crispr-guide-design.txt",
      mimeType: outputFormat === "tsv" || outputFormat === "offtarget-tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "guide-fasta"
          ? "text/x-fasta;charset=utf-8"
          : outputFormat === "svg-map"
            ? "image/svg+xml;charset=utf-8"
            : outputFormat === "interactive-viewer"
              ? "application/json;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: (result.basesProcessed ?? 0) + (result.referenceScreen?.basesProcessed ?? 0),
    charactersRemoved: (result.charactersRemoved ?? 0) + (result.referenceCharactersRemoved ?? 0),
    streams: {
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(crisprGuideDesignColumns, result.rows, "crispr-guide-design"),
      ...(outputFormat === "offtarget-tsv"
        ? { offTargetTable: makeTableStream(crisprReferenceMatchColumns, result.referenceMatchRows ?? [], "crispr-guide-reference-matches") }
        : {}),
      ...(outputFormat === "guide-fasta" ? { guideFasta: makeTextStream(guideFasta, "text/x-fasta") } : {}),
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
