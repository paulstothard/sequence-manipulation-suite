import { formatFastaRecord } from "../../core/fasta.js";
import {
  DNA_RNA_RANDOM_ALPHABET,
  PROTEIN_RANDOM_ALPHABET,
  RNA_RANDOM_ALPHABET,
  buildRandomCodingDnaRecord,
  mutateSequenceCooperatively,
  parseAndCleanRecords,
  randomDnaFragments,
  randomSequence,
  replaceRandomRegions,
  resolveRandom,
  sampleSequence,
  shuffleSequence
} from "../../core/random-sequence.js";
import { getCodonUsageReference } from "../../core/codon-reference.js";
import { getCodonsForCode } from "../../core/genetic-code.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

export const randomMutationTableColumns = [
  { id: "record", label: "Record" },
  { id: "output_record", label: "Output record" },
  { id: "mutation_number", label: "Event number" },
  { id: "event_type", label: "Event type" },
  { id: "position", label: "Original position" },
  { id: "end", label: "Original end" },
  { id: "output_position", label: "Output position" },
  { id: "original", label: "Original" },
  { id: "replacement", label: "Replacement" },
  { id: "deleted", label: "Deleted" },
  { id: "inserted", label: "Inserted" },
  { id: "left_context", label: "Left context" },
  { id: "right_context", label: "Right context" },
  { id: "seed", label: "Seed" }
];

export const randomRegionTableColumns = [
  { id: "record", label: "Record" },
  { id: "output_record", label: "Output record" },
  { id: "region_number", label: "Region number" },
  { id: "role", label: "Role" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "original", label: "Original" },
  { id: "replacement", label: "Replacement" },
  { id: "seed", label: "Seed" }
];

export const randomFragmentTableColumns = [
  { id: "record", label: "Record" },
  { id: "fragment", label: "Fragment" },
  { id: "fragment_number", label: "Fragment number" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "length", label: "Length" },
  { id: "source_length", label: "Source length" },
  { id: "topology", label: "Topology" },
  { id: "wraps", label: "Wraps" },
  { id: "orientation", label: "Orientation" },
  { id: "seed", label: "Seed" }
];

export const RANDOM_MAX_MUTATIONS_PER_RECORD = 50000;
const LARGE_MUTATION_TABLE_ROWS = 10000;
export const RANDOM_MAX_GENERATED_RECORDS = 10000;
export const RANDOM_MAX_GENERATED_CHARACTERS = 5000000;
export const RANDOM_MAX_REGION_ROWS = 50000;
const LARGE_RANDOM_REGION_ROWS = 10000;
export const RANDOM_MAX_FRAGMENTS_PER_RECORD = 20000;
const LARGE_RANDOM_FRAGMENT_ROWS = 10000;

function clampNonnegativeInteger(value, fallback = 0) {
  return Math.max(0, Number.parseInt(value, 10) || fallback);
}

function clampPositiveInteger(value, fallback = 1) {
  return Math.max(1, Number.parseInt(value, 10) || fallback);
}

function resolveOutputCountAndLength({
  requestedCount,
  requestedLength,
  warnings,
  countLabel = "sequence count",
  lengthLabel = "sequence length",
  maxRecords = RANDOM_MAX_GENERATED_RECORDS,
  maxCharacters = RANDOM_MAX_GENERATED_CHARACTERS
}) {
  let count = clampPositiveInteger(requestedCount, 1);
  let length = clampPositiveInteger(requestedLength, 1);
  if (count > maxRecords) {
    warnings.push(`Requested ${countLabel} ${count.toLocaleString()}; limited to ${maxRecords.toLocaleString()} records.`);
    count = maxRecords;
  }
  if (count * length > maxCharacters) {
    const adjustedCount = Math.max(1, Math.floor(maxCharacters / length));
    if (adjustedCount < count) {
      warnings.push(
        `Requested ${count.toLocaleString()} records x ${length.toLocaleString()} ${lengthLabel}; limited to ${adjustedCount.toLocaleString()} records to keep generated FASTA output under ${maxCharacters.toLocaleString()} characters.`
      );
      count = adjustedCount;
    } else {
      const adjustedLength = Math.max(1, Math.floor(maxCharacters / count));
      warnings.push(
        `Requested ${lengthLabel} ${length.toLocaleString()}; limited to ${adjustedLength.toLocaleString()} to keep generated FASTA output under ${maxCharacters.toLocaleString()} characters.`
      );
      length = adjustedLength;
    }
  }
  return { count, length };
}

function weightedAlphabetFromWeights(values) {
  return values
    .map(([value, weight]) => ({ value, weight: Math.max(0, Number(weight) || 0) }))
    .filter((item) => item.weight > 0);
}

function makeDnaRnaAlphabet(options = {}, alphabet = "dna-rna", sourceSequence = "") {
  const useRna = alphabet === "rna" || options.nucleotideAlphabet === "rna";
  const thymineOrUracil = useRna ? "U" : "T";
  const fallback = useRna ? RNA_RANDOM_ALPHABET : DNA_RNA_RANDOM_ALPHABET;
  const mode = String(options.compositionMode ?? options.replacementCompositionMode ?? "equal");
  if (mode === "gc") {
    const gcFraction = Math.max(0, Math.min(100, Number(options.gcPercent) || 50)) / 100;
    const atFraction = 1 - gcFraction;
    const weighted = weightedAlphabetFromWeights([
      ["A", atFraction / 2],
      ["C", gcFraction / 2],
      ["G", gcFraction / 2],
      [thymineOrUracil, atFraction / 2]
    ]);
    return weighted.length > 0 ? weighted : fallback;
  }
  if (mode === "custom") {
    const weighted = weightedAlphabetFromWeights([
      ["A", options.weightA],
      ["C", options.weightC],
      ["G", options.weightG],
      [thymineOrUracil, options.weightT]
    ]);
    return weighted.length > 0 ? weighted : fallback;
  }
  if (mode === "input") {
    const counts = { A: 0, C: 0, G: 0, T: 0 };
    for (const character of String(sourceSequence ?? "").toUpperCase()) {
      if (character === "U") {
        counts.T += 1;
      } else if (Object.hasOwn(counts, character)) {
        counts[character] += 1;
      }
    }
    const weighted = weightedAlphabetFromWeights([
      ["A", counts.A],
      ["C", counts.C],
      ["G", counts.G],
      [thymineOrUracil, counts.T]
    ]);
    return weighted.length > 0 ? weighted : fallback;
  }
  return fallback;
}

function replacementAlphabetValues(alphabet, options = {}) {
  if (alphabet === "protein") {
    return makeProteinAlphabet({
      ...options,
      residueModel: options.replacementResidueModel ?? options.residueModel ?? "equal"
    }, options.sourceSequence ?? "");
  }
  return makeDnaRnaAlphabet(options, options.nucleotideAlphabet === "rna" ? "rna" : "dna-rna", options.sourceSequence ?? "");
}

function alphabetLabel(alphabet) {
  if (alphabet === "rna") {
    return "RNA";
  }
  return alphabet === "protein" ? "protein" : "DNA/RNA";
}

function makeReport({ toolName, seed, recordsProcessed, sequencesGenerated, basesProcessed, details = [] }) {
  return [
    `${toolName}`,
    `Random seed: ${seed}`,
    ...details,
    `Input records processed: ${recordsProcessed}`,
    `Sequences generated: ${sequencesGenerated}`,
    `Characters generated: ${basesProcessed}`
  ].join("\n") + "\n";
}

function getCodonUsageReferenceWeights(referenceId, geneticCode = "1") {
  const reference = getCodonUsageReference(codonUsageReferences, referenceId);
  const codonSet = new Set(getCodonsForCode(geneticCode).map((item) => item.codon));
  const choices = Object.entries(reference?.codons ?? {})
    .filter(([codon, record]) => codonSet.has(codon) && record.aminoAcid !== "*")
    .map(([codon, record]) => ({
      value: codon,
      weight: record.perThousand || record.count || record.fraction || 0,
      aminoAcid: record.aminoAcid
    }));
  return { reference, choices };
}

function getProteinReferenceWeights(referenceId) {
  const reference = getCodonUsageReference(codonUsageReferences, referenceId);
  const weights = new Map();
  for (const record of Object.values(reference?.codons ?? {})) {
    if (!record?.aminoAcid || record.aminoAcid === "*") {
      continue;
    }
    weights.set(record.aminoAcid, (weights.get(record.aminoAcid) ?? 0) + (record.perThousand || record.count || 0));
  }
  return {
    reference,
    choices: Array.from(weights, ([value, weight]) => ({ value, weight }))
  };
}

function makeProteinAlphabet(options = {}, sourceSequence = "") {
  const mode = String(options.residueModel ?? options.replacementResidueModel ?? "equal");
  if (mode === "codon-usage-reference") {
    const weighted = getProteinReferenceWeights(options.codonUsageReference).choices;
    return weighted.length > 0 ? weighted : PROTEIN_RANDOM_ALPHABET;
  }
  if (mode === "input") {
    const counts = new Map();
    for (const residue of String(sourceSequence ?? "").toUpperCase()) {
      if (PROTEIN_RANDOM_ALPHABET.includes(residue)) {
        counts.set(residue, (counts.get(residue) ?? 0) + 1);
      }
    }
    const weighted = Array.from(counts, ([value, weight]) => ({ value, weight }));
    return weighted.length > 0 ? weighted : PROTEIN_RANDOM_ALPHABET;
  }
  return PROTEIN_RANDOM_ALPHABET;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

function escapeTsvValue(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function tableToTsv(table) {
  if (!table) {
    return "";
  }
  const columns = table.columns ?? [];
  const rows = table.rows ?? [];
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => escapeTsvValue(row[column.id])).join("\t"))
  ].join("\n") + "\n";
}

function makeEmptyResult(message) {
  return makeToolResult({
    output: "",
    warnings: [message],
    recordsProcessed: 0,
    basesProcessed: 0,
    charactersRemoved: 0
  });
}

function normalizeMutationCount(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

function normalizeProbabilityPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function resolveMutationSettings(options, records, protectedPositions, warnings) {
  const mutationMode = options.mutationMode === "probability" ? "probability" : "counts";
  const insertionLength = clampPositiveInteger(options.insertionLength, 1);
  const deletionLength = clampPositiveInteger(options.deletionLength, 1);
  const requestedSubstitutionCount = normalizeMutationCount(options.mutationCount);
  const requestedInsertionCount = normalizeMutationCount(options.insertionCount);
  const requestedDeletionCount = normalizeMutationCount(options.deletionCount);
  let substitutionCount = requestedSubstitutionCount;
  let insertionCount = requestedInsertionCount;
  let deletionCount = requestedDeletionCount;
  let requestedRows = records.length * (requestedSubstitutionCount + requestedInsertionCount + requestedDeletionCount);

  if (mutationMode === "counts") {
    let remaining = RANDOM_MAX_MUTATIONS_PER_RECORD;
    substitutionCount = Math.min(substitutionCount, remaining);
    remaining -= substitutionCount;
    insertionCount = Math.min(insertionCount, remaining);
    remaining -= insertionCount;
    deletionCount = Math.min(deletionCount, remaining);
    const requestedTotal = requestedSubstitutionCount + requestedInsertionCount + requestedDeletionCount;
    const limitedTotal = substitutionCount + insertionCount + deletionCount;
    if (requestedTotal > RANDOM_MAX_MUTATIONS_PER_RECORD) {
      warnings.push(
        `Requested ${requestedTotal.toLocaleString()} mutation events per record; limited to ${RANDOM_MAX_MUTATIONS_PER_RECORD.toLocaleString()} per record to keep browser output responsive.`
      );
    }
    requestedRows = records.length * limitedTotal;
  } else {
    const substitutionProbability = normalizeProbabilityPercent(options.substitutionProbability);
    const insertionProbability = normalizeProbabilityPercent(options.insertionProbability);
    const deletionProbability = normalizeProbabilityPercent(options.deletionProbability);
    requestedRows = records.reduce((sum, record) => {
      const mutableLength = Math.max(0, record.sequence.length - protectedPositions.protectedStart - protectedPositions.protectedEnd);
      return sum + Math.ceil(mutableLength * (substitutionProbability + deletionProbability) / 100) + Math.ceil((mutableLength + 1) * insertionProbability / 100);
    }, 0);
    if (substitutionProbability + insertionProbability + deletionProbability > 50) {
      warnings.push("High mutation probabilities can create very large event tables and heavily altered output sequences.");
    }
  }

  if (requestedRows > LARGE_MUTATION_TABLE_ROWS) {
    warnings.push(
      `This run can generate about ${requestedRows.toLocaleString()} mutation table rows; TSV and table display may be large.`
    );
  }

  return {
    mutationMode,
    requestedSubstitutionCount,
    requestedInsertionCount,
    requestedDeletionCount,
    substitutionCount,
    insertionCount,
    deletionCount,
    insertionLength,
    deletionLength,
    substitutionProbability: normalizeProbabilityPercent(options.substitutionProbability),
    insertionProbability: normalizeProbabilityPercent(options.insertionProbability),
    deletionProbability: normalizeProbabilityPercent(options.deletionProbability),
    requestedRows
  };
}

function resolveProtectedPositions(alphabet, options = {}) {
  if (alphabet === "protein") {
    const protectedLabels = [
      ...(options.preserveEnds === false ? [] : ["first residue"]),
      ...(options.preserveLastResidue === false ? [] : ["last residue"])
    ];
    return {
      protectedStart: options.preserveEnds === false ? 0 : 1,
      protectedEnd: options.preserveLastResidue === false ? 0 : 1,
      label: protectedLabels.length > 0 ? protectedLabels.join(" and ") : "none"
    };
  }
  const preservedBases = options.preserveEnds === false ? 0 : 3;
  return {
    protectedStart: preservedBases,
    protectedEnd: preservedBases,
    label: preservedBases > 0 ? `first and last ${preservedBases} bases` : "none"
  };
}

function finishSequenceResult({
  toolName,
  filenameBase,
  alphabet,
  seed,
  outputRecords,
  inputRecordsProcessed,
  charactersRemoved = 0,
  warnings = [],
  table,
  lineWidth,
  options = {},
  reportDetails = []
}) {
  const output = outputRecords.map((record) => formatFastaRecord(record.title, record.sequence, lineWidth)).join("\n");
  const basesProcessed = outputRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  const report = makeReport({
    toolName,
    seed,
    recordsProcessed: inputRecordsProcessed,
    sequencesGenerated: outputRecords.length,
    basesProcessed,
    details: reportDetails
  });
  const outputFormat = table && options?.outputFormat === "tsv"
    ? "tsv"
    : options?.outputFormat === "report"
      ? "report"
      : "fasta";
  const tsv = tableToTsv(table);
  const selectedOutput = outputFormat === "report" ? report : outputFormat === "tsv" ? tsv : output;
  return makeToolResult({
    output: selectedOutput,
    download: {
      filename: `${filenameBase}.${outputFormat === "tsv" ? "tsv" : outputFormat === "report" ? "txt" : "fasta"}`,
      mimeType: outputFormat === "tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "report"
          ? "text/plain;charset=utf-8"
          : "text/x-fasta;charset=utf-8"
    },
    warnings,
    recordsProcessed: inputRecordsProcessed,
    basesProcessed,
    charactersRemoved,
    streams: {
      fasta: makeTextStream(output, "text/x-fasta"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: filenameBase,
        alphabet,
        records: outputRecords
      },
      report: makeTextStream(report, "text/plain"),
      ...(table ? { tsv: makeTextStream(tsv, "text/tab-separated-values") } : {}),
      ...(table ? { table } : {})
    }
  });
}

export async function runRandomSequenceGenerator(input, options = {}, context = {}) {
  const generatedAlphabet = options.alphabet === "protein"
    ? "protein"
    : options.nucleotideAlphabet === "rna"
      ? "rna"
      : "dna-rna";
  const workflowAlphabet = generatedAlphabet === "protein" ? "protein" : "dna-rna";
  const { seed, random } = resolveRandom(options);
  const warnings = [];
  const { count: sequenceCount, length: sequenceLength } = resolveOutputCountAndLength({
    requestedCount: options.sequenceCount,
    requestedLength: options.sequenceLength,
    warnings,
    countLabel: "sequence count",
    lengthLabel: generatedAlphabet === "protein" ? "residues" : "bases"
  });
  const alphabet = generatedAlphabet === "protein"
    ? makeProteinAlphabet(options)
    : makeDnaRnaAlphabet(options, generatedAlphabet);
  const compositionDetails = [];
  if (generatedAlphabet === "protein" && options.residueModel === "codon-usage-reference") {
    const { reference } = getProteinReferenceWeights(options.codonUsageReference);
    compositionDetails.push(`Residue model: amino-acid frequencies implied by ${reference?.name ?? "selected codon usage reference"}`);
  } else if (generatedAlphabet !== "protein") {
    compositionDetails.push(`Base composition model: ${options.compositionMode === "gc" ? `GC ${Math.max(0, Math.min(100, Number(options.gcPercent) || 50))}%` : options.compositionMode === "custom" ? "custom base weights" : "equal base probability"}`);
  }
  const outputRecords = [];

  context.reportProgress?.({ phase: "generating-sequences", progress: 0.05 });
  await context.yieldIfNeeded?.();
  for (let index = 0; index < sequenceCount; index += 1) {
    context.throwIfCancelled?.();
    outputRecords.push({
      title: `${alphabetLabel(generatedAlphabet)} random sequence ${index + 1} seed=${seed}`,
      sequence: randomSequence(sequenceLength, alphabet, random),
      seed
    });
    if (index % 100 === 0) {
      context.reportProgress?.({
        phase: "generating-sequences",
        current: index + 1,
        total: sequenceCount,
        progress: 0.05 + (0.8 * (index + 1)) / Math.max(1, sequenceCount)
      });
      await context.yieldIfNeeded?.();
    }
  }
  context.reportProgress?.({ phase: "building-output", progress: 0.9 });

  return finishSequenceResult({
    toolName: `Random ${alphabetLabel(generatedAlphabet)} Sequence`,
    filenameBase: generatedAlphabet === "protein" ? "random-protein" : "random-dna-rna",
    alphabet: workflowAlphabet,
    seed,
    outputRecords,
    inputRecordsProcessed: 0,
    warnings,
    reportDetails: compositionDetails,
    lineWidth: options.lineWidth,
    options
  });
}

export async function runRandomCodingDna(input, options = {}, context = {}) {
  const { seed, random } = resolveRandom(options);
  const warnings = [];
  const requestedCodonCount = clampPositiveInteger(options.codonCount, 30);
  const { count: sequenceCount, length: codonCount } = resolveOutputCountAndLength({
    requestedCount: options.sequenceCount,
    requestedLength: requestedCodonCount,
    warnings,
    countLabel: "sequence count",
    lengthLabel: "codons",
    maxCharacters: Math.floor(RANDOM_MAX_GENERATED_CHARACTERS / 3)
  });
  const codingOptions = { ...options, codonCount };
  let codonReferenceDetail = "Internal codon model: equal probability across sense codons";
  if (options.codonModel === "codon-usage-reference") {
    const { reference, choices } = getCodonUsageReferenceWeights(options.codonUsageReference, options.geneticCode ?? "1");
    codingOptions.codingCodonChoices = choices;
    codonReferenceDetail = `Internal codon model: weighted by ${reference?.name ?? "selected codon usage reference"}`;
    if (reference?.geneticCode?.id && reference.geneticCode.id !== String(options.geneticCode ?? "1")) {
      warnings.push(`Selected codon usage reference uses genetic code ${reference.geneticCode.id}; weights were filtered to the selected genetic code ${options.geneticCode ?? "1"}.`);
    }
  }
  const outputRecords = [];

  context.reportProgress?.({ phase: "generating-coding-sequences", progress: 0.05 });
  await context.yieldIfNeeded?.();
  for (let index = 0; index < sequenceCount; index += 1) {
    context.throwIfCancelled?.();
    const codingRecord = buildRandomCodingDnaRecord(codingOptions, random);
    warnings.push(...codingRecord.warnings);
    outputRecords.push({
      title: `random coding DNA ${index + 1} seed=${seed}`,
      sequence: codingRecord.sequence,
      seed,
      geneticCode: options.geneticCode ?? "1",
      startCodon: codingRecord.startCodon,
      startCodonMode: codingRecord.startCodonMode
    });
    if (index % 100 === 0) {
      context.reportProgress?.({
        phase: "generating-coding-sequences",
        current: index + 1,
        total: sequenceCount,
        progress: 0.05 + (0.8 * (index + 1)) / Math.max(1, sequenceCount)
      });
      await context.yieldIfNeeded?.();
    }
  }
  context.reportProgress?.({ phase: "building-output", progress: 0.9 });

  return finishSequenceResult({
    toolName: "Random Coding DNA",
    filenameBase: "random-coding-dna",
    alphabet: "dna-rna",
    seed,
    outputRecords,
    inputRecordsProcessed: 0,
    warnings: [...new Set(warnings)],
    reportDetails: [
      `Codons per sequence: ${codonCount}`,
      `Start codon: ${outputRecords[0]?.startCodon || "none"}`,
      `Start codon mode: ${outputRecords[0]?.startCodonMode || "none"}`,
      codonReferenceDetail
    ],
    lineWidth: options.lineWidth,
    options
  });
}

async function runInputSequenceTool(input, options = {}, operation, context = {}) {
  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const { records, charactersRemoved } = parseAndCleanRecords(input, alphabet);
  if (records.length === 0) {
    return makeEmptyResult(`No ${alphabetLabel(alphabet)} sequence input was provided.`);
  }

  const warnings = [];
  for (const record of records) {
    if (record.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${record.removedCount} non-${alphabetLabel(alphabet)} ${pluralize(record.removedCount, "character")}.`
      );
    }
    if (record.sequence.length === 0) {
      warnings.push(`${record.title}: no ${alphabetLabel(alphabet)} sequence characters were found.`);
    }
  }

  const usableRecords = records.filter((record) => record.sequence.length > 0);
  if (usableRecords.length === 0) {
    return makeEmptyResult(`No ${alphabetLabel(alphabet)} sequence characters were found.`);
  }

  context.throwIfCancelled?.();
  const { seed, random } = resolveRandom(options);
  return operation({ records: usableRecords, warnings, charactersRemoved, seed, random, alphabet });
}

export async function runShuffleSequence(input, options = {}, context = {}) {
  return runInputSequenceTool(input, options, async ({ records, warnings, charactersRemoved, seed, random, alphabet }) => {
    const outputRecords = [];
    context.reportProgress?.({ phase: "shuffling-records", progress: 0.1 });
    for (const [recordIndex, record] of records.entries()) {
      context.throwIfCancelled?.();
      outputRecords.push({
        title: `${record.title} shuffled seed=${seed}`,
        sequence: shuffleSequence(record.sequence, random),
        sourceTitle: record.title,
        seed
      });
      await context.yieldIfNeeded?.();
      context.reportProgress?.({
        phase: "shuffling-records",
        current: recordIndex + 1,
        total: records.length,
        progress: 0.1 + (0.8 * (recordIndex + 1)) / Math.max(1, records.length)
      });
    }
    return finishSequenceResult({
      toolName: `Shuffle ${alphabetLabel(alphabet)}`,
      filenameBase: alphabet === "protein" ? "shuffle-protein" : "shuffle-dna-rna",
      alphabet,
      seed,
      outputRecords,
      inputRecordsProcessed: records.length,
      charactersRemoved,
      warnings,
      lineWidth: options.lineWidth,
      options
    });
  }, context);
}

export async function runSampleSequence(input, options = {}, context = {}) {
  return runInputSequenceTool(input, options, async ({ records, warnings, charactersRemoved, seed, random, alphabet }) => {
    const outputRecords = [];
    const sampleSource = options.sampleSource === "per-record" ? "per-record" : "combined";
    const requestedSamples = clampPositiveInteger(options.samplesPerRecord ?? options.sampleCount, 1);
    const { count: sampleCount, length: sampleLength } = resolveOutputCountAndLength({
      requestedCount: sampleSource === "combined" ? requestedSamples : requestedSamples * records.length,
      requestedLength: options.sampleLength,
      warnings,
      countLabel: "sample count",
      lengthLabel: alphabet === "protein" ? "residues" : "bases"
    });
    context.reportProgress?.({ phase: "sampling-records", progress: 0.1 });
    if (sampleSource === "combined") {
      const pool = records.map((record) => record.sequence).join("");
      for (let index = 0; index < sampleCount; index += 1) {
        context.throwIfCancelled?.();
        outputRecords.push({
          title: `${alphabetLabel(alphabet)} pooled sample ${index + 1} seed=${seed}`,
          sequence: sampleSequence(pool, sampleLength, random),
          sourceTitle: records.map((record) => record.title).join("; "),
          seed
        });
        if (index % 100 === 0) {
          await context.yieldIfNeeded?.();
        }
      }
    } else {
      const perRecordCount = Math.max(1, Math.floor(sampleCount / Math.max(1, records.length)));
      for (const record of records) {
        for (let index = 0; index < perRecordCount; index += 1) {
          context.throwIfCancelled?.();
          outputRecords.push({
            title: `${record.title} sample ${index + 1} seed=${seed}`,
            sequence: sampleSequence(record.sequence, sampleLength, random),
            sourceTitle: record.title,
            seed
          });
        }
        await context.yieldIfNeeded?.();
      }
    }
    context.reportProgress?.({ phase: "building-output", progress: 0.9 });
    return finishSequenceResult({
      toolName: `Sample ${alphabetLabel(alphabet)}`,
      filenameBase: alphabet === "protein" ? "sample-protein" : "sample-dna-rna",
      alphabet,
      seed,
      outputRecords,
      inputRecordsProcessed: records.length,
      charactersRemoved,
      warnings,
      reportDetails: [
        `Sampling source: ${sampleSource === "combined" ? "all input records combined" : "each input record separately"}`,
        `Samples generated: ${outputRecords.length}`,
        `Sample length: ${sampleLength}`
      ],
      lineWidth: options.lineWidth,
      options
    });
  }, context);
}

export async function runMutateSequence(input, options = {}, context = {}) {
  return runInputSequenceTool(input, options, async ({ records, warnings, charactersRemoved, seed, random, alphabet }) => {
    const outputRecords = [];
    const rows = [];
    const protectedPositions = resolveProtectedPositions(alphabet, options);
    const mutationSettings = resolveMutationSettings(options, records, protectedPositions, warnings);

    context.reportProgress?.({ phase: "mutating-records", progress: 0.1 });
    await context.yieldIfNeeded?.();

    for (const [recordIndex, record] of records.entries()) {
      context.throwIfCancelled?.();
      const mutableLength = Math.max(0, record.sequence.length - protectedPositions.protectedStart - protectedPositions.protectedEnd);
      const requestedCountEvents = mutationSettings.substitutionCount + mutationSettings.insertionCount + mutationSettings.deletionCount;
      if (mutationSettings.mutationMode === "counts" && requestedCountEvents > 0 && mutableLength === 0) {
        warnings.push(`${record.title}: no mutable positions remain after preserved termini were applied.`);
      } else if (mutationSettings.mutationMode === "counts" && mutationSettings.substitutionCount > mutableLength) {
        warnings.push(
          `${record.title}: ${mutationSettings.substitutionCount.toLocaleString()} substitutions requested across ${mutableLength.toLocaleString()} mutable ${pluralize(mutableLength, "position")}; only distinct original positions are substituted.`
        );
      }
      if (mutationSettings.deletionCount > 0 && mutationSettings.deletionLength > mutableLength) {
        warnings.push(`${record.title}: deletion length ${mutationSettings.deletionLength.toLocaleString()} is longer than the mutable region, so deletions may not be performed.`);
      }
      const outputTitle = `${record.title} mutated seed=${seed}`;
      const result = await mutateSequenceCooperatively(record.sequence, {
        ...options,
        ...mutationSettings,
        maxEvents: RANDOM_MAX_MUTATIONS_PER_RECORD,
        alphabetValues: replacementAlphabetValues(alphabet, { ...options, sourceSequence: record.sequence }),
        protectedStart: protectedPositions.protectedStart,
        protectedEnd: protectedPositions.protectedEnd
      }, random, context);
      if (result.eventsLimited) {
        warnings.push(`${record.title}: mutation events were limited to ${RANDOM_MAX_MUTATIONS_PER_RECORD.toLocaleString()} rows for browser responsiveness.`);
      }
      if (mutationSettings.mutationMode === "counts" && result.rows.length < requestedCountEvents) {
        warnings.push(`${record.title}: ${requestedCountEvents.toLocaleString()} mutation events were requested, but ${result.rows.length.toLocaleString()} were possible with the selected protected termini and deletion settings.`);
      }
      outputRecords.push({
        title: outputTitle,
        sequence: result.sequence,
        sourceTitle: record.title,
        seed
      });
      rows.push(...result.rows.map((row) => ({
        record: record.title,
        output_record: outputTitle,
        ...row,
        seed
      })));
      context.reportProgress?.({
        phase: "mutating-records",
        current: recordIndex + 1,
        total: records.length,
        progress: 0.1 + (0.75 * (recordIndex + 1)) / Math.max(1, records.length)
      });
      await context.yieldIfNeeded?.();
    }
    context.reportProgress?.({ phase: "building-output", progress: 0.9 });
    context.throwIfCancelled?.();
    return finishSequenceResult({
      toolName: `Mutate ${alphabetLabel(alphabet)}`,
      filenameBase: alphabet === "protein" ? "mutate-protein" : "mutate-dna-rna",
      alphabet,
      seed,
      outputRecords,
      inputRecordsProcessed: records.length,
      charactersRemoved,
      warnings,
      table: makeTableStream(randomMutationTableColumns, rows, "random-mutations"),
      lineWidth: options.lineWidth,
      options,
      reportDetails: [
        `Mutation event mode: ${mutationSettings.mutationMode === "probability" ? "per-position probabilities" : "fixed counts per record"}`,
        ...(mutationSettings.mutationMode === "probability"
          ? [
            `Substitution probability per mutable position: ${mutationSettings.substitutionProbability}%`,
            `Insertion probability per mutable anchor: ${mutationSettings.insertionProbability}%`,
            `Deletion probability per mutable position: ${mutationSettings.deletionProbability}%`
          ]
          : [
            `Substitutions requested per record: ${mutationSettings.requestedSubstitutionCount}`,
            `Insertions requested per record: ${mutationSettings.requestedInsertionCount}`,
            `Deletions requested per record: ${mutationSettings.requestedDeletionCount}`,
            `Substitutions performed per record limit: ${mutationSettings.substitutionCount}`,
            `Insertions performed per record limit: ${mutationSettings.insertionCount}`,
            `Deletions performed per record limit: ${mutationSettings.deletionCount}`
          ]),
        `Insertion length: ${mutationSettings.insertionLength}`,
        `Deletion length: ${mutationSettings.deletionLength}`,
        `Protected termini: ${protectedPositions.label}`,
        "Coordinates in the event table use 1-based positions on the original input sequence; insertion position 0 means before the first character.",
        ...(alphabet === "protein" ? ["Replacement residues: 20 standard amino acids; input stop markers (*) are accepted but are not introduced as replacements."] : [])
      ]
    });
  }, context);
}

export async function runRandomRegions(input, options = {}, context = {}) {
  return runInputSequenceTool(input, options, async ({ records, warnings, charactersRemoved, seed, random, alphabet }) => {
    const outputRecords = [];
    const rows = [];
    const requestedRegionCount = clampNonnegativeInteger(options.regionCount, 0);
    const regionCount = Math.min(requestedRegionCount, RANDOM_MAX_REGION_ROWS);
    if (requestedRegionCount > RANDOM_MAX_REGION_ROWS) {
      warnings.push(`Requested ${requestedRegionCount.toLocaleString()} random regions per record; limited to ${RANDOM_MAX_REGION_ROWS.toLocaleString()} per record to keep table output responsive.`);
    }
    const expectedRows = regionCount * records.length;
    if (expectedRows > LARGE_RANDOM_REGION_ROWS) {
      warnings.push(`This run can generate ${expectedRows.toLocaleString()} or more region table rows; TSV and table display may be large.`);
    }
    context.reportProgress?.({ phase: "randomizing-regions", progress: 0.1 });
    for (const [recordIndex, record] of records.entries()) {
      context.throwIfCancelled?.();
      const outputTitle = `${record.title} randomized regions seed=${seed}`;
      const result = replaceRandomRegions(record.sequence, {
        ...options,
        regionCount,
        sourceSequence: record.sequence,
        alphabetValues: alphabet === "protein"
          ? makeProteinAlphabet({ ...options, replacementResidueModel: options.replacementResidueModel ?? "equal" }, record.sequence)
          : replacementAlphabetValues(alphabet, { ...options, sourceSequence: record.sequence })
      }, random);
      outputRecords.push({
        title: outputTitle,
        sequence: result.sequence,
        sourceTitle: record.title,
        seed
      });
      rows.push(...result.rows.map((row) => ({
        record: record.title,
        output_record: outputTitle,
        ...row,
        seed
      })));
      context.reportProgress?.({
        phase: "randomizing-regions",
        current: recordIndex + 1,
        total: records.length,
        progress: 0.1 + (0.75 * (recordIndex + 1)) / Math.max(1, records.length)
      });
      await context.yieldIfNeeded?.();
    }
    context.reportProgress?.({ phase: "building-output", progress: 0.9 });
    return finishSequenceResult({
      toolName: `Random ${alphabetLabel(alphabet)} Regions`,
      filenameBase: alphabet === "protein" ? "random-protein-regions" : "random-dna-rna-regions",
      alphabet,
      seed,
      outputRecords,
      inputRecordsProcessed: records.length,
      charactersRemoved,
      warnings,
      table: makeTableStream(randomRegionTableColumns, rows, "random-regions"),
      lineWidth: options.lineWidth,
      options,
      reportDetails: [
        `Region target: ${options.regionTarget === "preserve-selected" ? "preserve selected random regions and randomize the rest" : "randomize selected random regions"}`,
        `Regions selected per record: ${regionCount}`,
        `Region length: ${clampPositiveInteger(options.regionLength, 1)}`
      ]
    });
  }, context);
}

export async function runRandomDnaFragmenter(input, options = {}, context = {}) {
  return runInputSequenceTool(input, { ...options, alphabet: "dna-rna" }, async ({ records, warnings, charactersRemoved, seed, random }) => {
    const outputRecords = [];
    const rows = [];
    const requestedFragments = options.fragmentMode === "target-size"
      ? Math.ceil(records.reduce((sum, record) => sum + record.sequence.length, 0) / Math.max(1, clampPositiveInteger(options.targetSize, 100) - clampNonnegativeInteger(options.overlapLength, 0)))
      : clampPositiveInteger(options.fragmentCount, 1) * records.length;
    if (requestedFragments > RANDOM_MAX_FRAGMENTS_PER_RECORD * records.length) {
      warnings.push(`Requested fragment settings can generate more than ${RANDOM_MAX_FRAGMENTS_PER_RECORD.toLocaleString()} fragments per record; settings were limited where needed.`);
    }
    if (requestedFragments > LARGE_RANDOM_FRAGMENT_ROWS) {
      warnings.push(`This run can generate about ${requestedFragments.toLocaleString()} fragment table rows; TSV and table display may be large.`);
    }
    context.reportProgress?.({ phase: "fragmenting-records", progress: 0.1 });
    for (const [recordIndex, record] of records.entries()) {
      context.throwIfCancelled?.();
      const result = randomDnaFragments(record, {
        ...options,
        fragmentCount: Math.min(clampPositiveInteger(options.fragmentCount, 1), RANDOM_MAX_FRAGMENTS_PER_RECORD),
        maxFragments: RANDOM_MAX_FRAGMENTS_PER_RECORD
      }, random, seed);
      outputRecords.push(...result.outputRecords.map((fragment) => ({
        title: fragment.title,
        sequence: fragment.sequence,
        sourceTitle: record.title,
        start: fragment.row.start,
        end: fragment.row.end,
        length: fragment.row.length,
        topology: fragment.row.topology,
        wraps: fragment.row.wraps,
        orientation: fragment.row.orientation,
        seed
      })));
      rows.push(...result.rows);
      context.reportProgress?.({
        phase: "fragmenting-records",
        current: recordIndex + 1,
        total: records.length,
        progress: 0.1 + (0.75 * (recordIndex + 1)) / Math.max(1, records.length)
      });
      await context.yieldIfNeeded?.();
    }
    context.reportProgress?.({ phase: "building-output", progress: 0.9 });
    return finishSequenceResult({
      toolName: "Random DNA Fragmenter",
      filenameBase: "random-dna-fragments",
      alphabet: "dna-rna",
      seed,
      outputRecords,
      inputRecordsProcessed: records.length,
      charactersRemoved,
      warnings,
      table: makeTableStream(randomFragmentTableColumns, rows, "random-dna-fragments"),
      lineWidth: options.lineWidth,
      options,
      reportDetails: [
        `Fragment mode: ${options.fragmentMode === "target-size" ? "target size" : "fragment count"}`,
        `Topology: ${options.topology === "circular" ? "circular" : "linear"}`,
        `Random reverse complements: ${options.randomReverseComplement === true ? "yes" : "no"}`,
        `Overlap length: ${clampNonnegativeInteger(options.overlapLength, 0)}`
      ]
    });
  }, context);
}

export const runRandomDnaRna = (input, options = {}, context = {}) =>
  runRandomSequenceGenerator(input, { ...options, alphabet: "dna-rna" }, context);
export const runRandomProtein = (input, options = {}, context = {}) =>
  runRandomSequenceGenerator(input, { ...options, alphabet: "protein" }, context);
export const runShuffleDnaRna = (input, options = {}, context = {}) =>
  runShuffleSequence(input, { ...options, alphabet: "dna-rna" }, context);
export const runShuffleProtein = (input, options = {}, context = {}) =>
  runShuffleSequence(input, { ...options, alphabet: "protein" }, context);
export const runSampleDnaRna = (input, options = {}, context = {}) =>
  runSampleSequence(input, { ...options, alphabet: "dna-rna" }, context);
export const runSampleProtein = (input, options = {}, context = {}) =>
  runSampleSequence(input, { ...options, alphabet: "protein" }, context);
export const runMutateDnaRna = (input, options = {}, context = {}) =>
  runMutateSequence(input, { ...options, alphabet: "dna-rna" }, context);
export const runMutateProtein = (input, options = {}, context = {}) =>
  runMutateSequence(input, { ...options, alphabet: "protein" }, context);
export const runRandomDnaRnaRegions = (input, options = {}, context = {}) =>
  runRandomRegions(input, { ...options, alphabet: "dna-rna" }, context);
export const runRandomProteinRegions = (input, options = {}, context = {}) =>
  runRandomRegions(input, { ...options, alphabet: "protein" }, context);
