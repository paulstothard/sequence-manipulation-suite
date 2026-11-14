import { exportDelimitedTable } from "../../core/table.js";
import { normalizeReverseTranslateOptions, REVERSE_TRANSLATE_LIMITS as limits } from "../../core/reverse-translate-options.js";
import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import {
  renderReverseTranslateProbabilitySvg,
  reverseTranslateProteinSequenceWithContext,
  reverseTranslateTableColumns
} from "../../core/reverse-translate.js";
import { cleanProteinSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { getCodonUsageReference } from "../../core/codon-reference.js";
import { getGeneticCode } from "../../core/genetic-code.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

function makeReferenceSourceLabel(reference) {
  return `${reference.source?.name ?? ""} ${reference.source?.version ?? ""}`.trim();
}

function makeFastaTitle(recordTitle, mode, reference) {
  if (mode === "degenerate") {
    return [
      `${recordTitle} reverse translated degenerate`,
      `genetic_code=${reference.geneticCode?.id ?? "n/a"}`,
      `genetic_code_name=${reference.geneticCode?.name ?? "n/a"}`,
      "policy=positional_IUPAC_union_may_encode_other_residues_or_stops"
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
  return exportDelimitedTable(reverseTranslateTableColumns.map(column => ({ ...column, label: column.id })), rows);
}

function makeReport({ records, recordSummaries, residuesProcessed, reference, mode, warnings }) {
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
    `Protein positions processed: ${residuesProcessed}`,
    `DNA records summarized: ${recordSummaries.length}`,
    `Warnings: ${warnings.length}`,
    "",
    "Policy:",
    mode === "degenerate"
      ? "Each amino-acid family is collapsed by position to IUPAC symbols; the union can also encode other residues or stops."
      : "For each residue, codons are ranked by within-family reference fraction, then per-1000 value, then genetic-code order.",
    "",
    ...recordSummaries.map((record) => `R${record.record_index} · ${record.sourceTitle}: ${record.length} bases`)
  ];
  return lines.join("\n");
}

export async function runReverseTranslate(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const source = String(input ?? "");
  if (source.length > limits.inputCharacters) throw new Error(`Reverse translation accepts at most ${limits.inputCharacters.toLocaleString()} input characters. Split the input into smaller batches.`);
  const records = parseSequenceInput(source, "protein", { strictHeaders: true });
  const settings = normalizeReverseTranslateOptions(options);
  const { mode, outputFormat, lineWidth, plotResiduesPerRow, plotMaxResidues } = settings;
  const reference = mode === "degenerate"
    ? makeGeneticCodeReference(settings.geneticCode)
    : getCodonUsageReference(codonUsageReferences, settings.referenceId);
  if (records.length > limits.records) throw new Error(`Reverse translation accepts at most ${limits.records.toLocaleString()} records per run.`);
  if (outputFormat === "plot" && records.length > limits.plotRecords) throw new Error(`The probability plot accepts at most ${limits.plotRecords} records. Select fewer proteins or another output.`);
  const warnings = [], notes = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No protein sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0, processedUnitLabel: "residue", optionsUsed: settings
    });
  }

  const dnaRecords = [];
  const recordSummaries = [];
  const tableRows = [];
  const plotRecords = [];
  let residuesProcessed = 0;
  let charactersRemoved = 0;
  let plottedResidues = 0;
  let hasStops = false;

  for (const [recordIndex, record] of records.entries()) {
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    if (record.title.length > limits.titleCharacters) throw new Error(`Record ${recordIndex + 1}: use a title of at most ${limits.titleCharacters} characters.`);
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    residuesProcessed += cleaned.sequence.length;
    hasStops ||= cleaned.sequence.includes("*");
    charactersRemoved += cleaned.removedCount;
    if (residuesProcessed > limits.residues) throw new Error(`Reverse translation accepts at most ${limits.residues.toLocaleString()} residues per run.`);
    if (outputFormat === "tsv" && residuesProcessed > limits.tableRows) throw new Error(`Codon choice table accepts at most ${limits.tableRows.toLocaleString()} rows. Choose FASTA or report, or split the input.`);
    const plotCount = outputFormat === "plot" ? Math.min(cleaned.sequence.length, plotMaxResidues, limits.plotResidues - plottedResidues) : 0;
    plottedResidues += plotCount;

    const gapCount = (record.sequence.match(/[.-]/g) ?? []).length;
    if (gapCount) notes.push(`R${recordIndex + 1} (${record.title}): removed ${gapCount} alignment gap character(s).`);
    if (cleaned.removedCount > gapCount) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount - gapCount} non-protein character(s).`);
    }
    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    const result = await reverseTranslateProteinSequenceWithContext(cleaned.sequence, reference, { mode, includeDna: outputFormat === "fasta", rowLimit: outputFormat === "tsv" ? Infinity : plotCount }, context);
    warnings.push(...result.warnings.map((warning) => `${record.title}: ${warning}`));
    if (outputFormat === "plot" && cleaned.sequence.length > plotCount) {
      warnings.push(`${record.title}: codon base probability plot shows the first ${plotCount} of ${cleaned.sequence.length} residue(s), wrapped at up to ${plotResiduesPerRow} residue(s) per row.`);
    }
    const referenceSource = makeReferenceSourceLabel(reference);
    const geneticCodeLabel = `${reference.geneticCode?.id ?? "n/a"}. ${reference.geneticCode?.name ?? ""}`.trim();
    const title = `${makeFastaTitle(record.title, mode, reference)}; record_index=${recordIndex + 1}`;
    if (outputFormat === "report") recordSummaries.push({ record_index: recordIndex + 1, sourceTitle: record.title, length: cleaned.sequence.length * 3 });
    if (outputFormat === "fasta") dnaRecords.push({
      record_index: recordIndex + 1,
      title,
      sequence: result.dna,
      sourceTitle: record.title,
      alphabet: "dna-rna",
      referenceId: reference.id,
      referenceName: reference.name,
      referenceSource,
      mode
    });
    if (outputFormat === "tsv") for (const row of result.rows) tableRows.push({
        record_index: recordIndex + 1,
        record: record.title,
        reference_id: reference.id,
        reference_name: reference.name,
        reference_source: referenceSource,
        genetic_code: geneticCodeLabel,
        ...row
    });
    if (outputFormat === "plot") plotRecords.push({
      omittedRows: cleaned.sequence.length - result.rows.length,
      hasStops: cleaned.sequence.includes("*"),
      title: `R${recordIndex + 1} · ${record.title}`,
      rows: result.rows
    });
  }

  context.reportProgress?.({phase: "building-output", progress: 0.95});
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  let output, visual;
  const streams = {};
  if (outputFormat === "fasta") {
    output = dnaRecords.map(record => formatFastaRecord(record.title, record.sequence, lineWidth)).join("\n");
    streams.fasta = makeTextStream(output, "text/x-fasta");
    streams.dnaRecords = { kind: "sequence-records", schema: "reverse-translated-dna-records", alphabet: "dna-rna", records: dnaRecords };
  } else if (outputFormat === "tsv") {
    output = makeTsv(tableRows);
    streams.table = makeTableStream(reverseTranslateTableColumns, tableRows, "reverse-translate");
  } else if (outputFormat === "report") {
    output = makeReport({ records, recordSummaries, residuesProcessed, reference, mode, warnings });
    streams.report = makeTextStream(output, "text/plain");
  } else {
    output = renderReverseTranslateProbabilitySvg(plotRecords, {
      maxResidues: plotMaxResidues, residuesPerRow: plotResiduesPerRow, mode,
      referenceLabel: `${reference.name} (${reference.id})`,
      geneticCodeLabel: `${reference.geneticCode?.id ?? "n/a"}. ${reference.geneticCode?.name ?? ""}`.trim()
    });
    streams.plot = makeTextStream(output, "image/svg+xml");
    visual = { svg: output, pngDownload: true };
  }

  if (output.length > limits.outputCharacters) throw new Error(`Selected output exceeds ${limits.outputCharacters.toLocaleString()} characters. Split the input into smaller batches.`);
  context.throwIfCancelled?.();
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
    warnings, notes,
    processedUnitLabel: hasStops ? "character" : "residue",
    recordsProcessed: records.length,
    basesProcessed: residuesProcessed,
    charactersRemoved,
    streams, visual,
    optionsUsed: {
      ...settings,
      referenceId: mode === "degenerate" ? undefined : reference.id,
      referenceName: mode === "degenerate" ? undefined : reference.name,
      referenceSource: makeReferenceSourceLabel(reference),
      geneticCode: reference.geneticCode?.id,
      outputFormat,
      lineWidth,
      plotResiduesPerRow,
      plotMaxResidues
    }
  });
}
