import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import {
  renderReverseTranslateProbabilitySvg,
  reverseTranslateProteinSequence,
  reverseTranslateTableColumns
} from "../../core/reverse-translate.js";
import { cleanProteinSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { getCodonUsageReference } from "../../core/codon-reference.js";
import { getGeneticCode } from "../../core/genetic-code.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

const defaultReferenceId =
  codonUsageReferences.find((reference) => reference.id === "ecoli-k12-mg1655-refseq")?.id ??
  codonUsageReferences[0]?.id ??
  "";

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "";
}

function makeReferenceSourceLabel(reference) {
  return `${reference.source?.name ?? ""} ${reference.source?.version ?? ""}`.trim();
}

function makeFastaTitle(recordTitle, mode, reference) {
  if (mode === "degenerate") {
    return [
      `${recordTitle} reverse translated degenerate`,
      `genetic_code=${reference.geneticCode?.id ?? "n/a"}`,
      `genetic_code_name=${reference.geneticCode?.name ?? "n/a"}`
    ].join("; ");
  }

  const source = makeReferenceSourceLabel(reference);
  const parts = [
    `${recordTitle} reverse translated ${mode}`,
    `codon_reference=${reference.id}`,
    `reference_name=${reference.name}`
  ];
  if (source) {
    parts.push(`reference_source=${source}`);
  }
  return parts.join("; ");
}

function makeGeneticCodeReference(geneticCodeId) {
  const geneticCode = getGeneticCode(geneticCodeId);
  return {
    id: `genetic-code-${geneticCode.id}`,
    name: `${geneticCode.id}. ${geneticCode.name}`,
    source: {
      name: "NCBI Genetic Codes",
      version: `transl_table ${geneticCode.id}`
    },
    organism: "",
    geneticCode,
    codons: {}
  };
}

function makeTsv(rows) {
  const columns = reverseTranslateTableColumns.map((column) => column.id);
  return [
    columns.join("\t"),
    ...rows.map((row) =>
      [
        row.record,
        row.reference_id,
        row.reference_name,
        row.reference_source,
        row.genetic_code,
        row.position,
        row.residue,
        row.codon,
        row.candidate_codons,
        row.candidate_count,
        row.degenerate_codon,
        row.fixed_bases,
        formatNumber(row.reference_fraction),
        formatNumber(row.reference_per_1000),
        row.mode,
        row.note
      ].join("\t")
    )
  ].join("\n");
}

function makeReport({ records, dnaRecords, tableRows, reference, mode, warnings }) {
  const referenceSource = makeReferenceSourceLabel(reference);
  const lines = [
    "Reverse translation",
    "",
    `Records: ${records.length}`,
    `Codon choice method: ${mode === "degenerate" ? "Degenerate IUPAC codons" : "Most likely codons from reference"}`,
    `Codon usage reference: ${mode === "degenerate" ? "n/a" : `${reference.name} (${reference.id})`}`,
    `Reference source: ${mode === "degenerate" ? "n/a" : referenceSource || "n/a"}`,
    `Reference organism: ${mode === "degenerate" ? "n/a" : reference.organism ?? "n/a"}`,
    `Genetic code: ${reference.geneticCode?.id ?? "n/a"}. ${reference.geneticCode?.name ?? ""}`.trim(),
    `Residues processed: ${tableRows.length}`,
    `DNA records produced: ${dnaRecords.length}`,
    `Warnings: ${warnings.length}`,
    "",
    "Policy:",
    mode === "degenerate"
      ? "Each amino-acid family is collapsed to IUPAC ambiguity symbols across all candidate codons."
      : "For each residue, codons are ranked by within-family reference fraction, then per-1000 value, then genetic-code order.",
    "",
    ...dnaRecords.map((record) => `${record.sourceTitle}: ${record.sequence.length} bases`)
  ];
  return lines.join("\n");
}

export function runReverseTranslate(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const records = parseSequenceInput(input, "protein");
  const mode = options.mode === "degenerate" ? "degenerate" : "most-likely";
  const reference = mode === "degenerate"
    ? makeGeneticCodeReference(options.geneticCode ?? "1")
    : getCodonUsageReference(codonUsageReferences, options.referenceId ?? defaultReferenceId);
  const outputFormat = ["tsv", "report", "plot"].includes(options.outputFormat) ? options.outputFormat : "fasta";
  const lineWidth = options.lineWidth ?? 60;
  const plotResiduesPerRow = Math.max(20, Math.min(160, Number.parseInt(options.plotResiduesPerRow, 10) || 60));
  const plotMaxResidues = Math.max(10, Math.min(5000, Number.parseInt(options.plotMaxResidues, 10) || 1000));
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No protein sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const dnaRecords = [];
  const tableRows = [];
  const plotRecords = [];
  let residuesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    context.throwIfCancelled?.();
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    residuesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-protein character(s).`);
    }
    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    const result = reverseTranslateProteinSequence(cleaned.sequence, reference, { mode });
    warnings.push(...result.warnings.map((warning) => `${record.title}: ${warning}`));
    if (outputFormat === "plot" && result.rows.length > plotMaxResidues) {
      warnings.push(`${record.title}: codon base probability plot shows the first ${plotMaxResidues} of ${result.rows.length} residue(s), wrapped at up to ${plotResiduesPerRow} residue(s) per row.`);
    }
    const referenceSource = makeReferenceSourceLabel(reference);
    const geneticCodeLabel = `${reference.geneticCode?.id ?? "n/a"}. ${reference.geneticCode?.name ?? ""}`.trim();
    const title = makeFastaTitle(record.title, mode, reference);
    dnaRecords.push({
      title,
      sequence: result.dna,
      sourceTitle: record.title,
      alphabet: "dna-rna",
      referenceId: reference.id,
      referenceName: reference.name,
      referenceSource,
      mode
    });
    tableRows.push(
      ...result.rows.map((row) => ({
        record: record.title,
        reference_id: reference.id,
        reference_name: reference.name,
        reference_source: referenceSource,
        genetic_code: geneticCodeLabel,
        ...row
      }))
    );
    plotRecords.push({
      title: record.title,
      rows: result.rows
    });
  }

  const fastaOutput = dnaRecords.map((record) => formatFastaRecord(record.title, record.sequence, lineWidth)).join("\n");
  const tsvOutput = makeTsv(tableRows);
  const reportOutput = makeReport({ records, dnaRecords, tableRows, reference, mode, warnings });
  const svgPlot = outputFormat === "plot"
    ? renderReverseTranslateProbabilitySvg(plotRecords, {
        maxResidues: plotMaxResidues,
        residuesPerRow: plotResiduesPerRow,
        mode,
        referenceLabel: `${reference.name} (${reference.id})`,
        geneticCodeLabel: `${reference.geneticCode?.id ?? "n/a"}. ${reference.geneticCode?.name ?? ""}`.trim()
      })
    : "";
  const output =
    outputFormat === "tsv"
      ? tsvOutput
      : outputFormat === "report"
        ? reportOutput
        : outputFormat === "plot"
          ? svgPlot
          : fastaOutput;

  return makeToolResult({
    output,
    download: {
      filename: `reverse-translate.${outputFormat === "tsv" ? "tsv" : outputFormat === "report" ? "txt" : outputFormat === "plot" ? "svg" : "fasta"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : outputFormat === "report"
            ? "text/plain;charset=utf-8"
            : outputFormat === "plot"
              ? "image/svg+xml;charset=utf-8"
              : "text/x-fasta;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed: residuesProcessed,
    charactersRemoved,
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      fasta: makeTextStream(fastaOutput, "text/x-fasta"),
      table: makeTableStream(reverseTranslateTableColumns, tableRows, "reverse-translate"),
      ...(outputFormat === "plot" ? { plot: makeTextStream(svgPlot, "image/svg+xml") } : {}),
      dnaRecords: {
        kind: "sequence-records",
        schema: "reverse-translated-dna-records",
        alphabet: "dna-rna",
        records: dnaRecords
      }
    },
    visual: outputFormat === "plot" ? { svg: svgPlot, pngDownload: true } : undefined,
    optionsUsed: {
      mode,
      referenceId: mode === "degenerate" ? undefined : reference.id,
      geneticCode: reference.geneticCode?.id,
      outputFormat,
      lineWidth,
      plotResiduesPerRow,
      plotMaxResidues
    }
  });
}
