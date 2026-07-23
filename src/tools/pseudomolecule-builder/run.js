import {
  buildPseudomolecule,
  makePseudomoleculeBedBundle,
  makePseudomoleculeFasta,
  makePseudomoleculeFlatfile,
  makePseudomoleculeGff3Bundle,
  makePseudomoleculeMappingTsv,
  makePseudomoleculeRecordJson,
  makePseudomoleculeReport,
  parsePseudomoleculeInput,
  pseudomoleculeMappingColumns
} from "../../core/pseudomolecule-builder.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set([
  "fasta",
  "genbank",
  "embl",
  "ddbj",
  "gff3-bundle",
  "bed-bundle",
  "record-json",
  "mapping-table",
  "report"
]);
const ANNOTATED_OUTPUT_FORMATS = new Set([
  "genbank",
  "embl",
  "ddbj",
  "gff3-bundle",
  "bed-bundle",
  "record-json"
]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "fasta";
}

function warningsForOutputFormat(outputFormat) {
  if (["genbank", "embl", "ddbj"].includes(outputFormat)) {
    return ["The reconstructed flatfile preserves remapped features and qualifiers supported by SMS3, but it cannot recreate all original references, dates, fuzzy-location notation, or source metadata."];
  }
  if (outputFormat === "bed-bundle") {
    return ["BED is interval-oriented and does not preserve the complete feature qualifier set; use GenBank, EMBL, DDBJ, GFF3 + FASTA, or record JSON when annotation detail matters."];
  }
  if (outputFormat === "fasta") {
    return ["FASTA contains the joined sequence but not the remapped feature annotations or source coordinate map."];
  }
  return [];
}

function sequenceRecordStream(result) {
  return {
    kind: "sequence-records",
    alphabet: "dna-rna",
    schema: "pseudomolecule-sequence",
    records: [{ title: result.id, sequence: result.sequence }]
  };
}

function streamsForOutput(outputFormat, selected, report, result) {
  if (outputFormat === "mapping-table") {
    return {
      mappingTable: makeTableStream(
        pseudomoleculeMappingColumns,
        result.mappingRows,
        "pseudomolecule-coordinate-map"
      )
    };
  }
  if (outputFormat === "report") return { report: makeTextStream(report, "text/plain") };
  const sequenceRecords = sequenceRecordStream(result);
  const stream = {
    fasta: ["fasta", "text/x-fasta"],
    genbank: ["genbank", "text/plain"],
    embl: ["embl", "text/plain"],
    ddbj: ["ddbj", "text/plain"],
    "gff3-bundle": ["gff3Bundle", "text/plain"],
    "bed-bundle": ["bedBundle", "text/plain"],
    "record-json": ["recordJson", "application/json"]
  }[outputFormat];
  return {
    [stream[0]]: makeTextStream(selected, stream[1]),
    sequenceRecords
  };
}

export async function runPseudomoleculeBuilder(input, options = {}, context = {}) {
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  context.reportProgress?.({ phase: "parsing-records", progress: 0.08 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const parsed = parsePseudomoleculeInput(input, options);
  if (!parsed.records.length) {
    return makeToolResult({
      output: "",
      warnings: parsed.warnings.length ? parsed.warnings : ["No DNA sequence records were found."],
      recordsProcessed: 0,
      basesProcessed: 0
    });
  }

  context.reportProgress?.({ phase: "building-coordinate-map", progress: 0.3 });
  const materializeSequence = outputFormat === "fasta" || ANNOTATED_OUTPUT_FORMATS.has(outputFormat);
  const result = await buildPseudomolecule(parsed.records, {
    ...options,
    materializeSequence,
    materializeFeatures: ANNOTATED_OUTPUT_FORMATS.has(outputFormat)
  }, context);
  context.throwIfCancelled?.();

  context.reportProgress?.({ phase: "building-output", progress: 0.78 });
  await context.yieldIfNeeded?.();
  const report = makePseudomoleculeReport(result, options);
  const selected = {
    fasta: () => makePseudomoleculeFasta(result),
    genbank: () => makePseudomoleculeFlatfile(result, "genbank"),
    embl: () => makePseudomoleculeFlatfile(result, "embl"),
    ddbj: () => makePseudomoleculeFlatfile(result, "ddbj"),
    "gff3-bundle": () => makePseudomoleculeGff3Bundle(result),
    "bed-bundle": () => makePseudomoleculeBedBundle(result),
    "record-json": () => makePseudomoleculeRecordJson(result),
    "mapping-table": () => makePseudomoleculeMappingTsv(result.mappingRows),
    report: () => report
  }[outputFormat]();
  const filename = {
    fasta: `${result.id}.fasta`,
    genbank: `${result.id}.gb`,
    embl: `${result.id}.embl`,
    ddbj: `${result.id}.ddbj`,
    "gff3-bundle": `${result.id}.gff3`,
    "bed-bundle": `${result.id}-bed-fasta.txt`,
    "record-json": `${result.id}.json`,
    "mapping-table": `${result.id}-coordinate-map.tsv`,
    report: `${result.id}-pseudomolecule-report.txt`
  }[outputFormat];
  const mimeType = outputFormat === "fasta"
    ? "text/x-fasta;charset=utf-8"
    : outputFormat === "record-json"
      ? "application/json;charset=utf-8"
      : outputFormat === "mapping-table"
        ? "text/tab-separated-values;charset=utf-8"
        : "text/plain;charset=utf-8";
  const streams = streamsForOutput(outputFormat, selected, report, result);

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output: selected,
    download: { filename, mimeType },
    warnings: [...parsed.warnings, ...result.warnings, ...warningsForOutputFormat(outputFormat)],
    recordsProcessed: result.mappingRows.length,
    basesProcessed: result.mappingRows.reduce((sum, row) => sum + row.source_length, 0),
    streams
  });
}

export const pseudomoleculeBuilderRunner = runPseudomoleculeBuilder;
