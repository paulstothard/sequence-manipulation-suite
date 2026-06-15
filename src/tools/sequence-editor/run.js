import {
  makeSequenceEditorFeatureTrackOverrides,
  prepareSequenceEditorData,
  sequenceEditorSummaryColumns
} from "../../core/sequence-editor.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

function normalizeOptions(options = {}) {
  const outputFormat = [
    "editor",
    "fasta",
    "summary-table",
    "viewer-json",
    "report"
  ].includes(options.outputFormat)
    ? options.outputFormat
    : "editor";
  return {
    outputFormat,
    inputFormat: [
      "auto",
      "sequence",
      "genbank",
      "ddbj",
      "embl",
      "gff3-fasta",
      "gtf-fasta",
      "bed-fasta"
    ].includes(options.inputFormat)
      ? options.inputFormat
      : "sequence",
    geneticCode: String(options.geneticCode ?? "1"),
    viewerLayout: options.viewerLayout === "circular" ? "circular" : "linear",
    lineWidth: Math.min(120, Math.max(20, Number.parseInt(options.lineWidth, 10) || 60))
  };
}

function makeSummaryTsv(rows) {
  const headers = sequenceEditorSummaryColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => row[header] ?? "").join("\t"))
  ].join("\n");
}

export async function runSequenceEditor(input = "", options = {}, context = {}) {
  const normalized = normalizeOptions(options);
  context.reportProgress?.({ phase: "preparing-editor-data", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = prepareSequenceEditorData(input, { ...normalized, context });
  context.reportProgress?.({ phase: "building-output", progress: 0.8 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  let output = result.report;
  let download = {
    filename: "sequence-editor-summary.txt",
    mimeType: "text/plain;charset=utf-8"
  };

  if (normalized.outputFormat === "fasta") {
    output = result.fasta || "";
    download = {
      filename: "sequence-editor-cleaned.fasta",
      mimeType: "text/x-fasta;charset=utf-8"
    };
  } else if (normalized.outputFormat === "summary-table") {
    output = makeSummaryTsv(result.rows);
    download = {
      filename: "sequence-editor-summary.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  } else if (normalized.outputFormat === "viewer-json") {
    output = result.viewer ? JSON.stringify(result.viewer, null, 2) : "{}";
    download = {
      filename: "sequence-editor-viewer.json",
      mimeType: "application/json;charset=utf-8"
    };
  }

  const streams = {
    report: makeTextStream(result.report),
    summaryTable: makeTableStream(sequenceEditorSummaryColumns, result.rows, "sequence-editor-summary"),
    cleanedRecords: {
      kind: "sequence-records",
      alphabet: "dna-rna",
      schema: "sequence-editor-cleaned-records",
      records: result.records.map((record) => ({
        title: record.title,
        sequence: record.sequence
      }))
    }
  };
  if (result.viewerStream) {
    streams.viewer = result.viewerStream;
  }
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download,
    warnings: result.warnings,
    recordsProcessed: result.recordsProcessed,
    basesProcessed: result.basesProcessed,
    charactersRemoved: result.charactersRemoved,
    streams,
    visual: normalized.outputFormat === "editor" && result.viewer
      ? {
          sequenceEditor: {
            input: result.fasta || String(input ?? ""),
            geneticCode: normalized.geneticCode,
            viewerLayout: normalized.viewerLayout,
            lineWidth: normalized.lineWidth,
            filename: "sequence-editor-cleaned.fasta",
            featureTrackOverrides: makeSequenceEditorFeatureTrackOverrides(result.records)
          }
        }
      : undefined
  });
}

export const sequenceEditorRunner = runSequenceEditor;
