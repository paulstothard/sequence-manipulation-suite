import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { getGeneticCode, makeCodonMap } from "./genetic-code.js";
import { alignPairwiseAffine, pairwiseAlignmentDefaultLimits } from "./pairwise-alignment.js";
import { makeAlignmentSvg } from "./alignment-svg.js";
import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import { makeHeatmapPlotSpec, makeObservablePlotConfig, renderHeatmapPlotSvg } from "./plot-renderer.js";
import { renderPhylogramSvg } from "./tree-svg.js";
import { cleanDnaRnaSequence, cleanProteinSequence } from "./sequence.js";

export const multipleAlignmentTableColumns = [
  { id: "alignment_position", label: "Alignment position", type: "number" },
  { id: "consensus", label: "Consensus", type: "string" },
  { id: "gap_count", label: "Gap count", type: "number" },
  { id: "symbols", label: "Symbols", type: "string" }
];

export const multipleAlignmentDistanceTableColumns = [
  { id: "sequence_a", label: "Sequence A", type: "string" },
  { id: "sequence_b", label: "Sequence B", type: "string" },
  { id: "compared_columns", label: "Compared columns", type: "number" },
  { id: "matches", label: "Matches", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "identity_percent", label: "Identity percent", type: "number" },
  { id: "p_distance", label: "p-distance", type: "number" }
];

export const multipleCodingDnaAlignmentTableColumns = [
  { id: "alignment_position", label: "Codon alignment position", type: "number" },
  { id: "consensus", label: "Protein consensus", type: "string" },
  { id: "gap_count", label: "Gap count", type: "number" },
  { id: "amino_acids", label: "Amino acids", type: "string" },
  { id: "codons", label: "Codons", type: "string" }
];

export const multipleAlignmentIdentityTableColumns = [
  { id: "sequence_a", label: "Sequence A", type: "string" },
  { id: "sequence_b", label: "Sequence B", type: "string" },
  { id: "compared_columns", label: "Compared columns", type: "number" },
  { id: "matches", label: "Matches", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "gap_columns", label: "Gap columns", type: "number" },
  { id: "alignment_score", label: "Alignment score", type: "number" },
  { id: "identity_percent", label: "Identity percent", type: "number" },
  { id: "similarity_percent", label: "Similarity percent", type: "number" },
  { id: "distance_space", label: "Distance space", type: "string" }
];

export const multipleAlignmentDefaultLimits = Object.freeze({
  maxSequences: 100,
  maxTotalSymbols: 250000
});
const MAX_MSA_SEQUENCES_OPTION = 1000;
const MAX_MSA_TOTAL_SYMBOLS_OPTION = 1000000;
export const MULTIPLE_ALIGNMENT_ENGINES = {
  muscle: "muscle",
  sms3: "sms3-progressive"
};
const BIOWASM_MUSCLE_VERSION = "5.1.0";
let muscleRunCounter = 0;

function cleanForAlphabet(record, alphabet) {
  const cleaner = alphabet === "protein" ? cleanProteinSequence : cleanDnaRnaSequence;
  return cleaner(record.sequence, { preserveCase: false, keepGaps: false });
}

function normalizeLimitInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeOptions(options = {}) {
  return {
    alphabet: options.alphabet === "protein" ? "protein" : "dna-rna",
    alignmentEngine: options.alignmentEngine === MULTIPLE_ALIGNMENT_ENGINES.sms3
      ? MULTIPLE_ALIGNMENT_ENGINES.sms3
      : MULTIPLE_ALIGNMENT_ENGINES.muscle,
    gapOpen: Number.parseFloat(options.gapOpen) || 10,
    gapExtend: Number.parseFloat(options.gapExtend) || 1,
    matchScore: Number.parseFloat(options.matchScore) || 5,
    mismatchScore: Number.parseFloat(options.mismatchScore) || -4,
    similarScore: Number.parseFloat(options.similarScore) || 1,
    lineWidth: Math.max(20, Math.min(120, Number.parseInt(options.lineWidth, 10) || 60)),
    maxSequences: normalizeLimitInteger(
      options.maxSequences,
      multipleAlignmentDefaultLimits.maxSequences,
      2,
      MAX_MSA_SEQUENCES_OPTION
    ),
    maxTotalSymbols: normalizeLimitInteger(
      options.maxTotalSymbols,
      multipleAlignmentDefaultLimits.maxTotalSymbols,
      1000,
      MAX_MSA_TOTAL_SYMBOLS_OPTION
    ),
    maxAlignmentCells: normalizeLimitInteger(
      options.maxAlignmentCells,
      pairwiseAlignmentDefaultLimits.maxAlignmentCells,
      1000,
      pairwiseAlignmentDefaultLimits.maxAlignmentCells * 10
    )
  };
}

async function getBioWasmMuscleCli() {
  // BioWasm/Aioli hosts a browser-local wrapper around MUSCLE v5.
  // MUSCLE v5 citation: Edgar RC. Nat Commun. 2022;13:6968.
  return createBioWasmCli({
    tool: "muscle",
    program: "muscle",
    version: BIOWASM_MUSCLE_VERSION,
    assetPath: "../vendor/biowasm/muscle/5.1.0"
  });
}

function nextMuscleRunId() {
  muscleRunCounter += 1;
  return `sms3_muscle_${Date.now()}_${muscleRunCounter}`;
}

function splitCompleteCodons(sequence) {
  const source = String(sequence ?? "").toUpperCase().replaceAll("U", "T");
  const usableLength = source.length - (source.length % 3);
  const codons = [];
  for (let index = 0; index < usableLength; index += 3) {
    codons.push(source.slice(index, index + 3));
  }
  return { codons, trailingBases: source.length - usableLength };
}

function translateCodonsForAlignment(codons, codonMap) {
  let protein = "";
  let ambiguousCodons = 0;
  let stopCodons = 0;
  for (const codon of codons) {
    const aminoAcid = codonMap.get(codon);
    if (!aminoAcid) {
      protein += "X";
      ambiguousCodons += 1;
    } else if (aminoAcid === "*") {
      protein += "X";
      stopCodons += 1;
    } else {
      protein += aminoAcid;
    }
  }
  return { protein, ambiguousCodons, stopCodons };
}

function prepareRecords(input, alphabet, options = {}) {
  const warnings = [];
  const parsed = parseSequenceInput(input, "sequence");
  let charactersRemoved = 0;
  const seenTitles = new Map();
  const records = parsed.map((record, index) => {
    const rawTitle = record.title || `Sequence ${index + 1}`;
    const title = uniquePreparedTitle(rawTitle, seenTitles);
    if (title !== rawTitle) {
      warnings.push(`Duplicate FASTA title "${rawTitle}" was renamed to "${title}" for alignment output.`);
    }
    const cleaned = cleanForAlphabet(record, alphabet);
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${title}: removed ${cleaned.removedCount} character(s) outside the selected alphabet.`);
    }
    return {
      title,
      sequence: cleaned.sequence
    };
  }).filter((record) => record.sequence.length > 0);

  if (records.length < 2) {
    warnings.push("Provide at least two FASTA records for multiple sequence alignment.");
  }
  if (records.length > options.maxSequences) {
    warnings.push(`Only the first ${options.maxSequences.toLocaleString()} records were aligned.`);
  }
  const limitedRecords = records.slice(0, options.maxSequences);
  const totalSymbols = limitedRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  if (totalSymbols > options.maxTotalSymbols) {
    throw new Error(`Multiple alignment input has ${totalSymbols.toLocaleString()} symbols, which exceeds the current ${options.maxTotalSymbols.toLocaleString()}-symbol browser-local alignment limit. Reduce the number or length of sequences, or raise the limit if the browser can handle the run.`);
  }
  return { records: limitedRecords, warnings, charactersRemoved, totalSymbols };
}

function uniquePreparedTitle(title, seenTitles) {
  const base = String(title || "Sequence").trim() || "Sequence";
  const count = (seenTitles.get(base) ?? 0) + 1;
  seenTitles.set(base, count);
  return count === 1 ? base : `${base} (${count})`;
}

function pairwiseOptions(options) {
  return {
    mode: "global",
    alphabet: options.alphabet,
    scoringMatrix: options.alphabet === "protein" ? "blosum62" : "identity",
    matchScore: options.matchScore,
    mismatchScore: options.mismatchScore,
    similarScore: options.similarScore,
    gapOpen: options.gapOpen,
    gapExtend: options.gapExtend,
    maxAlignmentCells: options.maxAlignmentCells
  };
}

async function chooseCenterRecord(records, options, context = {}) {
  const scores = new Array(records.length).fill(0);
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      context.throwIfCancelled?.();
      const alignment = await alignPairwiseAffine(records[i].sequence, records[j].sequence, pairwiseOptions(options), context);
      const score = alignment.identityPercent - alignment.gapOpenings * 2;
      scores[i] += score;
      scores[j] += score;
    }
  }
  let bestIndex = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[bestIndex]) {
      bestIndex = index;
    }
  }
  return { centerIndex: bestIndex, centerScores: scores };
}

function mergePairIntoProfile(profile, centerAligned, incomingAligned, incomingTitle) {
  if (!profile) {
    return {
      titles: ["__center__", incomingTitle],
      aligned: [centerAligned, incomingAligned]
    };
  }

  const merged = profile.aligned.map(() => []);
  const incoming = [];
  const masterCenter = profile.aligned[0];
  let i = 0;
  let j = 0;
  while (i < masterCenter.length || j < centerAligned.length) {
    const masterChar = masterCenter[i];
    const pairCenterChar = centerAligned[j];
    if (i >= masterCenter.length) {
      for (const row of merged) {
        row.push("-");
      }
      incoming.push(incomingAligned[j] ?? "-");
      j += 1;
    } else if (j >= centerAligned.length) {
      profile.aligned.forEach((sequence, rowIndex) => merged[rowIndex].push(sequence[i]));
      incoming.push("-");
      i += 1;
    } else if (masterChar === "-" && pairCenterChar !== "-") {
      profile.aligned.forEach((sequence, rowIndex) => merged[rowIndex].push(sequence[i]));
      incoming.push("-");
      i += 1;
    } else if (masterChar !== "-" && pairCenterChar === "-") {
      for (const row of merged) {
        row.push("-");
      }
      incoming.push(incomingAligned[j] ?? "-");
      j += 1;
    } else {
      profile.aligned.forEach((sequence, rowIndex) => merged[rowIndex].push(sequence[i]));
      incoming.push(incomingAligned[j] ?? "-");
      i += 1;
      j += 1;
    }
  }

  return {
    titles: [...profile.titles, incomingTitle],
    aligned: [...merged.map((row) => row.join("")), incoming.join("")]
  };
}

function consensusForColumn(symbols) {
  const residues = symbols.filter((symbol) => symbol !== "-");
  if (residues.length === 0) {
    return " ";
  }
  if (residues.every((symbol) => symbol === residues[0]) && residues.length === symbols.length) {
    return "*";
  }
  const counts = new Map();
  for (const symbol of residues) {
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  const best = Math.max(...counts.values());
  return best >= Math.max(2, Math.ceil(residues.length * 0.6)) ? ":" : " ";
}

function summarizeMsa(records, titles, aligned, centerIndex, centerScores, options, extra = {}) {
  const alignmentLength = aligned[0]?.length ?? 0;
  const consensus = [];
  const rows = [];
  let fullyConserved = 0;
  let majorityColumns = 0;
  let gapColumns = 0;

  for (let index = 0; index < alignmentLength; index += 1) {
    const symbols = aligned.map((sequence) => sequence[index] ?? "-");
    const consensusSymbol = consensusForColumn(symbols);
    const gapCount = symbols.filter((symbol) => symbol === "-").length;
    if (consensusSymbol === "*") {
      fullyConserved += 1;
    } else if (consensusSymbol === ":") {
      majorityColumns += 1;
    }
    if (gapCount > 0) {
      gapColumns += 1;
    }
    consensus.push(consensusSymbol);
    rows.push({
      alignment_position: index + 1,
      consensus: consensusSymbol,
      gap_count: gapCount,
      symbols: symbols.join("")
    });
  }

  return {
    records,
    titles,
    aligned,
    consensus: consensus.join(""),
    rows,
    centerIndex,
    centerTitle: Number.isInteger(centerIndex) && centerIndex >= 0 ? records[centerIndex]?.title ?? "" : "",
    centerScores,
    alphabet: options.alphabet,
    engine: extra.engine ?? options.alignmentEngine ?? MULTIPLE_ALIGNMENT_ENGINES.sms3,
    engineVersion: extra.engineVersion ?? "",
    alignmentLength,
    fullyConserved,
    majorityColumns,
    gapColumns
  };
}

async function alignPreparedMultipleSequencesWithSms3(prepared, options, context = {}) {
  if (prepared.records.length < 2) {
    return { ...prepared, alignment: null, options };
  }

  context.reportProgress?.({ phase: "choosing-center", progress: 0.1 });
  const { centerIndex, centerScores } = await chooseCenterRecord(prepared.records, options, context);
  const center = prepared.records[centerIndex];
  let profile = null;
  const others = prepared.records.map((record, index) => ({ record, index })).filter((item) => item.index !== centerIndex);
  for (let index = 0; index < others.length; index += 1) {
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    const item = others[index];
    const pair = await alignPairwiseAffine(center.sequence, item.record.sequence, pairwiseOptions(options), context);
    profile = mergePairIntoProfile(profile, pair.alignmentA, pair.alignmentB, item.record.title);
    context.reportProgress?.({ phase: "progressive-alignment", progress: 0.35 + 0.55 * ((index + 1) / others.length) });
  }

  const titleToRecord = new Map(prepared.records.map((record) => [record.title, record]));
  const finalTitles = profile.titles.map((title, index) => index === 0 ? center.title : title);
  const alignedByTitle = new Map(finalTitles.map((title, index) => [title, profile.aligned[index]]));
  const ordered = prepared.records.map((record) => ({
    title: record.title,
    aligned: alignedByTitle.get(record.title),
    record: titleToRecord.get(record.title) ?? record
  }));
  if (ordered.some((item) => typeof item.aligned !== "string")) {
    throw new Error("SMS3 progressive alignment did not return every submitted sequence.");
  }
  const alignment = summarizeMsa(
    ordered.map((item) => item.record),
    ordered.map((item) => item.title),
    ordered.map((item) => item.aligned),
    centerIndex,
    centerScores,
    { ...options, alignmentEngine: MULTIPLE_ALIGNMENT_ENGINES.sms3 },
    { engine: MULTIPLE_ALIGNMENT_ENGINES.sms3 }
  );
  return { ...prepared, alignment, options: { ...options, alignmentEngine: MULTIPLE_ALIGNMENT_ENGINES.sms3 } };
}

function parseMuscleAlignedFasta(alignedFasta, internalRecords, options) {
  const parsed = parseSequenceInput(alignedFasta, "sequence");
  const byInternalTitle = new Map(internalRecords.map((record) => [record.internalTitle, record]));
  const alignedByInternalTitle = new Map();
  const expectedLength = parsed[0]?.sequence?.length ?? 0;

  for (const record of parsed) {
    const original = byInternalTitle.get(record.title);
    if (!original) {
      continue;
    }
    const aligned = String(record.sequence ?? "").toUpperCase();
    if (expectedLength > 0 && aligned.length !== expectedLength) {
      throw new Error("MUSCLE returned aligned sequences with inconsistent lengths.");
    }
    alignedByInternalTitle.set(record.title, aligned);
  }

  const ordered = internalRecords.map((record) => ({
    record,
    title: record.title,
    aligned: alignedByInternalTitle.get(record.internalTitle)
  }));

  if (ordered.some((item) => typeof item.aligned !== "string")) {
    throw new Error("MUSCLE did not return every submitted sequence.");
  }

  return summarizeMsa(
    ordered.map((item) => item.record),
    ordered.map((item) => item.title),
    ordered.map((item) => item.aligned),
    null,
    [],
    options,
    { engine: MULTIPLE_ALIGNMENT_ENGINES.muscle, engineVersion: BIOWASM_MUSCLE_VERSION }
  );
}

async function alignPreparedMultipleSequencesWithMuscle(prepared, options, context = {}) {
  if (prepared.records.length < 2) {
    return { ...prepared, alignment: null, options };
  }

  requireBioWasmRuntime("MUSCLE alignment");

  context.reportProgress?.({ phase: "loading-muscle", progress: 0.12 });
  const cli = await getBioWasmMuscleCli();
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const runId = nextMuscleRunId();
  const internalRecords = prepared.records.map((record, index) => ({
    ...record,
    internalTitle: `sms3_seq_${index + 1}`
  }));
  const inputFasta = internalRecords
    .map((record) => formatFastaRecord(record.internalTitle, record.sequence, 80))
    .join("\n");
  const inputName = `${runId}.fasta`;
  const outputPath = `/shared/data/${runId}.afa`;

  context.reportProgress?.({ phase: "mounting-muscle-input", progress: 0.2 });
  const [inputPath] = await cli.mount([{ name: inputName, data: inputFasta }]);
  context.throwIfCancelled?.();

  context.reportProgress?.({ phase: "running-muscle", progress: 0.35 });
  const result = await cli.exec("muscle", ["-align", inputPath, "-output", outputPath]);
  context.throwIfCancelled?.();

  const alignedFasta = await cli.cat(outputPath);
  if (!String(alignedFasta ?? "").trim()) {
    throw new Error(`MUSCLE did not produce aligned FASTA output.${result?.stderr ? ` ${result.stderr}` : ""}`);
  }
  const alignment = parseMuscleAlignedFasta(alignedFasta, internalRecords, options);
  context.reportProgress?.({ phase: "parsed-muscle-output", progress: 0.85 });
  return { ...prepared, alignment, options };
}

export async function alignMultipleSequences(input, rawOptions = {}, context = {}) {
  const options = normalizeOptions(rawOptions);
  const prepared = prepareRecords(input, options.alphabet, options);
  if (options.alignmentEngine === MULTIPLE_ALIGNMENT_ENGINES.muscle) {
    return alignPreparedMultipleSequencesWithMuscle(prepared, options, context);
  }
  return alignPreparedMultipleSequencesWithSms3(prepared, options, context);
}

function prepareCodingDnaRecords(input, rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const warnings = [];
  const code = getGeneticCode(rawOptions.geneticCode ?? "1");
  const codonMap = makeCodonMap(code);
  const parsed = parseSequenceInput(input, "sequence");
  let charactersRemoved = 0;
  const seenTitles = new Map();
  const records = parsed.map((record, index) => {
    const rawTitle = record.title || `Sequence ${index + 1}`;
    const title = uniquePreparedTitle(rawTitle, seenTitles);
    if (title !== rawTitle) {
      warnings.push(`Duplicate FASTA title "${rawTitle}" was renamed to "${title}" for alignment output.`);
    }
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    const split = splitCompleteCodons(cleaned.sequence);
    if (split.trailingBases > 0) {
      warnings.push(`${title}: ignored ${split.trailingBases} trailing base(s) outside a complete codon.`);
    }
    const translated = translateCodonsForAlignment(split.codons, codonMap);
    if (translated.ambiguousCodons > 0) {
      warnings.push(`${title}: translated ${translated.ambiguousCodons} ambiguous codon(s) as X for protein-guided alignment scoring.`);
    }
    if (translated.stopCodons > 0) {
      warnings.push(`${title}: translated ${translated.stopCodons} stop codon(s) as X for protein-guided alignment scoring.`);
    }
    return {
      title,
      internalTitle: `seq_${index + 1}`,
      sequence: split.codons.join(""),
      codons: split.codons,
      protein: translated.protein
    };
  }).filter((record) => record.codons.length > 0);

  if (records.length < 2) {
    warnings.push("Provide at least two coding DNA/RNA FASTA records with at least one complete codon each.");
  }
  if (records.length > options.maxSequences) {
    warnings.push(`Only the first ${options.maxSequences.toLocaleString()} records were aligned.`);
  }
  const limitedRecords = records.slice(0, options.maxSequences);
  const totalCodons = limitedRecords.reduce((sum, record) => sum + record.codons.length, 0);
  const totalSymbols = totalCodons * 3;
  if (totalSymbols > options.maxTotalSymbols) {
    throw new Error(`Multiple coding DNA alignment input has ${totalSymbols.toLocaleString()} bases in complete codons, which exceeds the current ${options.maxTotalSymbols.toLocaleString()}-symbol browser-local alignment limit. Reduce the number or length of sequences, or raise the limit if the browser can handle the run.`);
  }
  return { records: limitedRecords, warnings, charactersRemoved, totalSymbols, geneticCode: code };
}

function projectProteinMsaToCodons(prepared, proteinAlignment, options) {
  const recordsByInternalTitle = new Map(prepared.records.map((record) => [record.internalTitle, record]));
  const orderedRecords = proteinAlignment.titles.map((title) => recordsByInternalTitle.get(title)).filter(Boolean);
  const codonAlignedRows = [];
  const proteinAlignedRows = [];
  const rows = [];
  const codonIndexes = new Array(orderedRecords.length).fill(0);
  const codonAlignmentLength = proteinAlignment.alignmentLength;
  let fullyConserved = 0;
  let majorityColumns = 0;
  let gapColumns = 0;
  const codonConsensus = [];
  const expandedConsensus = [];

  for (let columnIndex = 0; columnIndex < codonAlignmentLength; columnIndex += 1) {
    const aminoAcids = proteinAlignment.aligned.map((sequence) => sequence[columnIndex] ?? "-");
    const codons = aminoAcids.map((aminoAcid, rowIndex) => {
      if (aminoAcid === "-") {
        return "---";
      }
      const codon = orderedRecords[rowIndex].codons[codonIndexes[rowIndex]] ?? "---";
      codonIndexes[rowIndex] += 1;
      return codon;
    });
    const consensusSymbol = consensusForColumn(aminoAcids);
    const gapCount = aminoAcids.filter((symbol) => symbol === "-").length;
    if (consensusSymbol === "*") {
      fullyConserved += 1;
    } else if (consensusSymbol === ":") {
      majorityColumns += 1;
    }
    if (gapCount > 0) {
      gapColumns += 1;
    }
    codonConsensus.push(consensusSymbol);
    expandedConsensus.push(consensusSymbol, consensusSymbol, consensusSymbol);
    rows.push({
      alignment_position: columnIndex + 1,
      consensus: consensusSymbol,
      gap_count: gapCount,
      amino_acids: aminoAcids.join(""),
      codons: codons.join(" ")
    });
    codons.forEach((codon, rowIndex) => {
      codonAlignedRows[rowIndex] ??= [];
      codonAlignedRows[rowIndex].push(codon);
    });
    aminoAcids.forEach((aminoAcid, rowIndex) => {
      proteinAlignedRows[rowIndex] ??= [];
      proteinAlignedRows[rowIndex].push(aminoAcid);
    });
  }

  return {
    records: orderedRecords,
    titles: orderedRecords.map((record) => record.title),
    aligned: codonAlignedRows.map((row) => row.join("")),
    codonAligned: codonAlignedRows,
    proteinAligned: proteinAlignedRows.map((row) => row.join("")),
    consensus: expandedConsensus.join(""),
    codonConsensus: codonConsensus.join(""),
    rows,
    centerIndex: proteinAlignment.centerIndex,
    centerTitle: recordsByInternalTitle.get(proteinAlignment.centerTitle)?.title ?? proteinAlignment.centerTitle,
    centerScores: proteinAlignment.centerScores,
    alphabet: "coding-dna",
    engine: proteinAlignment.engine ?? options.alignmentEngine ?? MULTIPLE_ALIGNMENT_ENGINES.sms3,
    engineVersion: proteinAlignment.engineVersion ?? "",
    geneticCode: prepared.geneticCode,
    alignmentLength: codonAlignmentLength * 3,
    codonAlignmentLength,
    nucleotideAlignmentLength: codonAlignmentLength * 3,
    fullyConserved,
    majorityColumns,
    gapColumns,
    distanceSpace: "nucleotide"
  };
}

export async function alignMultipleCodingDna(input, rawOptions = {}, context = {}) {
  const options = {
    ...normalizeOptions({ ...rawOptions, alphabet: "protein" }),
    geneticCode: rawOptions.geneticCode ?? "1",
    alphabet: "coding-dna"
  };
  const prepared = prepareCodingDnaRecords(input, rawOptions);
  if (prepared.records.length < 2) {
    return { ...prepared, alignment: null, options };
  }

  const proteinInput = prepared.records
    .map((record) => formatFastaRecord(record.internalTitle, record.protein, 80))
    .join("\n");
  const proteinPrepared = await alignMultipleSequences(proteinInput, {
    ...rawOptions,
    alphabet: "protein",
    alignmentEngine: options.alignmentEngine
  }, context);
  const alignment = projectProteinMsaToCodons(prepared, proteinPrepared.alignment, options);
  return {
    ...prepared,
    warnings: [...prepared.warnings, ...proteinPrepared.warnings.filter((warning) => !prepared.warnings.includes(warning))],
    alignment,
    options: { ...options, alignmentEngine: alignment.engine ?? options.alignmentEngine }
  };
}

function uniqueLabels(records) {
  const seen = new Map();
  return records.map((record) => {
    const base = record.title || "sequence";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function summarizePairwiseIdentity(alignment, labelA, labelB, distanceSpace) {
  const columns = alignment.columns ?? [];
  const compared = columns.filter((column) => column.relation !== "gap");
  const matches = compared.filter((column) => column.relation === "match").length;
  const similar = compared.filter((column) => column.relation === "similar").length;
  const mismatches = compared.length - matches - similar;
  const gapColumns = columns.length - compared.length;
  return {
    sequence_a: labelA,
    sequence_b: labelB,
    compared_columns: compared.length,
    matches,
    mismatches,
    gap_columns: gapColumns,
    alignment_score: Number(alignment.score.toFixed?.(3) ?? alignment.score),
    identity_percent: compared.length === 0 ? 0 : Number(((matches / compared.length) * 100).toFixed(3)),
    similarity_percent: compared.length === 0 ? 0 : Number((((matches + similar) / compared.length) * 100).toFixed(3)),
    distance_space: distanceSpace
  };
}

function summarizeCodingPairwiseIdentity(recordA, recordB, labelA, labelB, proteinAlignment) {
  let codonIndexA = proteinAlignment.startA - 1;
  let codonIndexB = proteinAlignment.startB - 1;
  let compared = 0;
  let matches = 0;
  let mismatches = 0;
  let gapColumns = 0;
  for (let index = 0; index < proteinAlignment.alignedLength; index += 1) {
    const aaA = proteinAlignment.alignmentA[index];
    const aaB = proteinAlignment.alignmentB[index];
    let codonA = "---";
    let codonB = "---";
    if (aaA !== "-") {
      codonA = recordA.codons[codonIndexA] ?? "---";
      codonIndexA += 1;
    }
    if (aaB !== "-") {
      codonB = recordB.codons[codonIndexB] ?? "---";
      codonIndexB += 1;
    }
    for (let offset = 0; offset < 3; offset += 1) {
      const baseA = codonA[offset] ?? "-";
      const baseB = codonB[offset] ?? "-";
      if (baseA === "-" || baseB === "-") {
        gapColumns += 1;
      } else {
        compared += 1;
        if (baseA === baseB) {
          matches += 1;
        } else {
          mismatches += 1;
        }
      }
    }
  }
  const proteinCompared = proteinAlignment.columns.filter((column) => column.relation !== "gap");
  const proteinSimilar = proteinCompared.filter((column) => column.relation === "match" || column.relation === "similar").length;
  return {
    sequence_a: labelA,
    sequence_b: labelB,
    compared_columns: compared,
    matches,
    mismatches,
    gap_columns: gapColumns,
    alignment_score: Number(proteinAlignment.score.toFixed?.(3) ?? proteinAlignment.score),
    identity_percent: compared === 0 ? 0 : Number(((matches / compared) * 100).toFixed(3)),
    similarity_percent: proteinCompared.length === 0 ? 0 : Number(((proteinSimilar / proteinCompared.length) * 100).toFixed(3)),
    distance_space: "projected nucleotide"
  };
}

function diagonalIdentityRow(label, length, distanceSpace) {
  return {
    sequence_a: label,
    sequence_b: label,
    compared_columns: length,
    matches: length,
    mismatches: 0,
    gap_columns: 0,
    alignment_score: "",
    identity_percent: 100,
    similarity_percent: 100,
    distance_space: distanceSpace
  };
}

export async function makeMultipleAlignmentIdentityMatrix(input, rawOptions = {}, alphabet = "dna-rna", context = {}) {
  const options = alphabet === "coding-dna"
    ? {
        ...normalizeOptions({ ...rawOptions, alphabet: "protein" }),
        alphabet: "coding-dna",
        geneticCode: rawOptions.geneticCode ?? "1"
      }
    : normalizeOptions({ ...rawOptions, alphabet });
  const prepared = alphabet === "coding-dna"
    ? prepareCodingDnaRecords(input, rawOptions)
    : prepareRecords(input, options.alphabet, options);
  if (prepared.records.length < 2) {
    return { ...prepared, identity: null, options };
  }

  const labels = uniqueLabels(prepared.records);
  const rows = [];
  const cellRows = [];
  for (let i = 0; i < prepared.records.length; i += 1) {
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    const length = alphabet === "coding-dna" ? prepared.records[i].codons.length * 3 : prepared.records[i].sequence.length;
    const diagonal = diagonalIdentityRow(labels[i], length, alphabet === "coding-dna" ? "projected nucleotide" : alphabet);
    rows.push(diagonal);
    cellRows.push({ x: labels[i], y: labels[i], value: 100, title: `${labels[i]} vs ${labels[i]}: 100% identity` });
    for (let j = i + 1; j < prepared.records.length; j += 1) {
      let row;
      if (alphabet === "coding-dna") {
        const proteinAlignment = await alignPairwiseAffine(prepared.records[i].protein, prepared.records[j].protein, {
          ...rawOptions,
          alphabet: "protein",
          scoringMatrix: "blosum62"
        }, context);
        row = summarizeCodingPairwiseIdentity(prepared.records[i], prepared.records[j], labels[i], labels[j], proteinAlignment);
      } else {
        const alignment = await alignPairwiseAffine(prepared.records[i].sequence, prepared.records[j].sequence, pairwiseOptions(options), context);
        row = summarizePairwiseIdentity(alignment, labels[i], labels[j], alphabet);
      }
      rows.push(row);
      rows.push({ ...row, sequence_a: row.sequence_b, sequence_b: row.sequence_a });
      cellRows.push({ x: labels[i], y: labels[j], value: row.identity_percent, title: `${labels[i]} vs ${labels[j]}: ${row.identity_percent}% identity` });
      cellRows.push({ x: labels[j], y: labels[i], value: row.identity_percent, title: `${labels[j]} vs ${labels[i]}: ${row.identity_percent}% identity` });
    }
    context.reportProgress?.({ phase: "identity-matrix", progress: (i + 1) / prepared.records.length });
  }

  return {
    ...prepared,
    identity: {
      labels,
      rows,
      cellRows,
      alphabet,
      geneticCode: prepared.geneticCode,
      valueLabel: "Identity percent"
    },
    options
  };
}

export function makeMultipleAlignmentReport(result) {
  if (!result.alignment) {
    return "";
  }
  const { alignment, options } = result;
  const usesMuscle = alignment.engine === MULTIPLE_ALIGNMENT_ENGINES.muscle;
  const method = options.alphabet === "coding-dna"
    ? usesMuscle
      ? "protein-guided MUSCLE alignment projected back to codons"
      : "protein-guided progressive star alignment projected back to codons"
    : usesMuscle
      ? "MUSCLE multiple sequence alignment via BioWasm"
      : "progressive star alignment using a center sequence selected from pairwise global alignments";
  const references = usesMuscle
    ? "References:\n\nMUSCLE v5: Edgar 2022.\nBioWasm/Aioli browser runtime.\nTree and identity outputs are SMS3 post-processing."
    : "References:\n\nGlobal pairwise alignment: Needleman and Wunsch 1970.\nAffine gap model: Gotoh 1982.\nProgressive alignment: Feng and Doolittle 1987.\nProtein and coding-DNA scoring use BLOSUM62 (Henikoff and Henikoff 1992).";
  return [
    "Multiple sequence alignment",
    "",
    `Sequences aligned: ${alignment.titles.length}`,
    `Alphabet: ${options.alphabet === "coding-dna" ? "coding DNA/RNA" : options.alphabet === "protein" ? "protein" : "DNA/RNA"}`,
    `Method: ${method}`,
    ...(usesMuscle ? [
      `Engine: MUSCLE ${alignment.engineVersion || BIOWASM_MUSCLE_VERSION} via vendored BioWasm/Aioli`
    ] : [
      `Center sequence: ${alignment.centerTitle}`,
      `Scoring: ${options.alphabet === "protein" || options.alphabet === "coding-dna" ? "BLOSUM62" : `match ${options.matchScore}, similar ${options.similarScore}, mismatch ${options.mismatchScore}`}, gap open ${options.gapOpen}, gap extend ${options.gapExtend}`
    ]),
    ...(options.alphabet === "coding-dna" ? [
      `Genetic code: ${alignment.geneticCode.id}. ${alignment.geneticCode.name}`,
      "Tree/distances: calculated in nucleotide space from the projected codon alignment; codon-gap columns are ignored pairwise."
    ] : []),
    `Aligned length: ${options.alphabet === "coding-dna" ? `${alignment.codonAlignmentLength} codons (${alignment.nucleotideAlignmentLength} nucleotide columns)` : alignment.alignmentLength}`,
    `Fully conserved columns: ${alignment.fullyConserved}`,
    `Majority columns: ${alignment.majorityColumns}`,
    `Columns with gaps: ${alignment.gapColumns}`,
    "",
    references
  ].join("\n");
}

export function makeMultipleAlignmentFasta(alignment, lineWidth = 60) {
  return alignment.titles.map((title, index) =>
    formatFastaRecord(`${title} aligned`, alignment.aligned[index], lineWidth)
  ).join("\n");
}

export function makeMultipleAlignmentClustal(alignment, lineWidth = 60) {
  const width = Math.max(20, Math.min(120, Number.parseInt(lineWidth, 10) || 60));
  const names = alignment.titles.map((title) => title.replace(/\s+/g, "_").slice(0, 24) || "sequence");
  const labelWidth = Math.max(12, ...names.map((name) => name.length));
  const lines = ["CLUSTAL multiple sequence alignment", ""];
  for (let index = 0; index < alignment.alignmentLength; index += width) {
    names.forEach((name, rowIndex) => {
      lines.push(`${name.padEnd(labelWidth)} ${alignment.aligned[rowIndex].slice(index, index + width)}`);
    });
    lines.push(`${"".padEnd(labelWidth)} ${alignment.consensus.slice(index, index + width)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function makeMultipleAlignmentTsv(alignment) {
  const columns = alignment.alphabet === "coding-dna" ? multipleCodingDnaAlignmentTableColumns : multipleAlignmentTableColumns;
  const headers = columns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...alignment.rows.map((row) => headers.map((header) => row[header]).join("\t"))
  ].join("\n");
}

export function makeMultipleCodingDnaProteinFasta(alignment, lineWidth = 60) {
  return alignment.titles.map((title, index) =>
    formatFastaRecord(`${title} translated aligned`, alignment.proteinAligned[index], lineWidth)
  ).join("\n");
}

function formatBranchLength(value) {
  const number = Math.max(0, Number.isFinite(value) ? value : 0);
  return number.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, ".0");
}

function escapeNewickLabel(value) {
  const label = String(value || "sequence").replace(/\s+/g, "_");
  if (/^[A-Za-z0-9_.-]+$/u.test(label)) {
    return label;
  }
  return `'${label.replace(/'/g, "''")}'`;
}

function pairDistance(left, right) {
  let compared = 0;
  let matches = 0;
  let mismatches = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? "-";
    const b = right[index] ?? "-";
    if (a === "-" || b === "-") {
      continue;
    }
    compared += 1;
    if (a === b) {
      matches += 1;
    } else {
      mismatches += 1;
    }
  }
  const pDistance = compared === 0 ? 1 : mismatches / compared;
  return {
    compared_columns: compared,
    matches,
    mismatches,
    identity_percent: compared === 0 ? 0 : Number(((matches / compared) * 100).toFixed(3)),
    p_distance: pDistance
  };
}

export function makeMultipleAlignmentDistanceRows(alignment) {
  const rows = [];
  for (let i = 0; i < alignment.titles.length; i += 1) {
    for (let j = i + 1; j < alignment.titles.length; j += 1) {
      rows.push({
        sequence_a: alignment.titles[i],
        sequence_b: alignment.titles[j],
        ...pairDistance(alignment.aligned[i], alignment.aligned[j])
      });
    }
  }
  return rows;
}

function makeDistanceLookup(titles, distanceRows) {
  const lookup = new Map();
  for (const row of distanceRows) {
    lookup.set(`${row.sequence_a}\t${row.sequence_b}`, row.p_distance);
    lookup.set(`${row.sequence_b}\t${row.sequence_a}`, row.p_distance);
  }
  for (const title of titles) {
    lookup.set(`${title}\t${title}`, 0);
  }
  return lookup;
}

function getClusterDistance(distances, left, right) {
  return distances.get(`${left}\t${right}`) ?? distances.get(`${right}\t${left}`) ?? 0;
}

function setClusterDistance(distances, left, right, value) {
  distances.set(`${left}\t${right}`, value);
  distances.set(`${right}\t${left}`, value);
}

export function buildNeighborJoiningTree(alignment) {
  const titles = alignment.titles;
  if (titles.length < 2) {
    return "";
  }

  const distanceRows = makeMultipleAlignmentDistanceRows(alignment);
  const distances = makeDistanceLookup(titles, distanceRows);
  const clusters = new Map(titles.map((title) => [title, {
    id: title,
    size: 1,
    newick: escapeNewickLabel(title)
  }]));
  let active = [...titles];
  let internalIndex = 1;

  if (active.length === 2) {
    const distance = getClusterDistance(distances, active[0], active[1]) / 2;
    return `(${clusters.get(active[0]).newick}:${formatBranchLength(distance)},${clusters.get(active[1]).newick}:${formatBranchLength(distance)});`;
  }

  while (active.length > 3) {
    const n = active.length;
    const totals = new Map(active.map((id) => [
      id,
      active.reduce((sum, other) => sum + (other === id ? 0 : getClusterDistance(distances, id, other)), 0)
    ]));
    let best = null;
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const left = active[i];
        const right = active[j];
        const q = (n - 2) * getClusterDistance(distances, left, right) - totals.get(left) - totals.get(right);
        if (!best || q < best.q) {
          best = { left, right, q };
        }
      }
    }

    const left = best.left;
    const right = best.right;
    const leftCluster = clusters.get(left);
    const rightCluster = clusters.get(right);
    const pairDistanceValue = getClusterDistance(distances, left, right);
    const delta = (totals.get(left) - totals.get(right)) / (n - 2);
    const leftLength = Math.max(0, 0.5 * (pairDistanceValue + delta));
    const rightLength = Math.max(0, pairDistanceValue - leftLength);
    const mergedId = `__node_${internalIndex}`;
    internalIndex += 1;
    clusters.set(mergedId, {
      id: mergedId,
      size: leftCluster.size + rightCluster.size,
      newick: `(${leftCluster.newick}:${formatBranchLength(leftLength)},${rightCluster.newick}:${formatBranchLength(rightLength)})`
    });

    for (const other of active) {
      if (other === left || other === right) {
        continue;
      }
      const mergedDistance = (getClusterDistance(distances, left, other) + getClusterDistance(distances, right, other) - pairDistanceValue) / 2;
      setClusterDistance(distances, mergedId, other, mergedDistance);
    }
    active = active.filter((id) => id !== left && id !== right);
    active.push(mergedId);
  }

  const [first, second, third] = active;
  const firstSecond = getClusterDistance(distances, first, second);
  const firstThird = getClusterDistance(distances, first, third);
  const secondThird = getClusterDistance(distances, second, third);
  const firstLength = Math.max(0, (firstSecond + firstThird - secondThird) / 2);
  const secondLength = Math.max(0, (firstSecond + secondThird - firstThird) / 2);
  const thirdLength = Math.max(0, (firstThird + secondThird - firstSecond) / 2);
  return `(${clusters.get(first).newick}:${formatBranchLength(firstLength)},${clusters.get(second).newick}:${formatBranchLength(secondLength)},${clusters.get(third).newick}:${formatBranchLength(thirdLength)});`;
}

function makeDistanceTsv(distanceRows) {
  const headers = multipleAlignmentDistanceTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...distanceRows.map((row) => headers.map((header) => row[header]).join("\t"))
  ].join("\n");
}

export function makeIdentityMatrixTsv(identity) {
  const valueByPair = new Map(identity.rows.map((row) => [`${row.sequence_a}\t${row.sequence_b}`, row.identity_percent]));
  return [
    ["record", ...identity.labels].join("\t"),
    ...identity.labels.map((rowLabel) => [
      rowLabel,
      ...identity.labels.map((columnLabel) => valueByPair.get(`${rowLabel}\t${columnLabel}`) ?? "")
    ].join("\t"))
  ].join("\n");
}

export function makeIdentityPairsTsv(identity) {
  const headers = multipleAlignmentIdentityTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...identity.rows.map((row) => headers.map((header) => String(row[header] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function makeIdentityHeatmapSvg(identity) {
  const categories = identity.labels.map((label) => ({ id: label, label }));
  const spec = makeHeatmapPlotSpec({
    title: "Pairwise identity matrix",
    xLabel: "Sequence",
    yLabel: "Sequence",
    valueLabel: "Identity percent",
    xCategories: categories,
    yCategories: categories,
    cells: identity.cellRows,
    valueDomain: [0, 100],
    notes: [
      identity.alphabet === "coding-dna"
        ? "Values use all-vs-all protein-guided pairwise alignments projected back to nucleotide codons."
        : "Values use all-vs-all pairwise global alignments; gap columns are excluded from identity percent."
    ]
  });
  return {
    spec,
    observablePlotConfig: makeObservablePlotConfig(spec),
    svg: renderHeatmapPlotSvg(spec)
  };
}

export function makeMultipleAlignmentTreeReport(alignment) {
  const distanceRows = makeMultipleAlignmentDistanceRows(alignment);
  const newick = buildNeighborJoiningTree(alignment);
  return [
    "Neighbor-joining tree",
    "",
    "Method: neighbor joining from an alignment-derived p-distance matrix.",
    alignment.alphabet === "coding-dna"
      ? "Distance policy: distances are calculated in nucleotide space from the projected codon alignment. Columns with a gap in either sequence are ignored; p-distance is mismatches divided by compared ungapped nucleotide columns."
      : "Distance policy: columns with a gap in either sequence are ignored; p-distance is mismatches divided by compared ungapped columns.",
    "Use this as a quick teaching/review tree, not a replacement for a model-based phylogenetic workflow.",
    "",
    "Newick:",
    newick,
    "",
    "Pairwise distances:",
    makeDistanceTsv(distanceRows)
  ].join("\n");
}

export function makeMultipleAlignmentSvg(alignment, options = {}) {
  const isCodingDna = alignment.alphabet === "coding-dna";
  return makeAlignmentSvg({
    title: isCodingDna ? "Colored multiple coding DNA alignment" : "Colored multiple sequence alignment",
    note: isCodingDna ? "Coordinates count bases and ignore gaps." : "Coordinates count bases or amino acids and ignore gaps.",
    rows: alignment.titles.map((title, index) => ({
      label: title,
      aligned: alignment.aligned[index],
      start: 1
    })),
    consensus: alignment.consensus,
    lineWidth: options.lineWidth,
    maxCells: options.maxCells,
    legend: isCodingDna
      ? "Green codon translates to a fully conserved amino acid; blue codon translates to a majority-conserved amino acid; red variable; gray codon gap."
      : "Green fully conserved; blue majority conserved; red variable; gray gap column.",
    summary: isCodingDna
      ? "Protein-guided codon alignment; displayed sequence and coordinates are nucleotide-space."
      : "Consensus: * fully conserved, : majority conserved, . variable.",
    ariaLabel: "Colored multiple sequence alignment"
  });
}

export function makeMultipleAlignmentTreeSvg(alignment) {
  return renderPhylogramSvg(buildNeighborJoiningTree(alignment), {
    title: "Neighbor-joining tree",
    scaleLabel: "p-distance",
    note: alignment.alphabet === "coding-dna"
      ? "Midpoint-rooted. Branch lengths use nucleotide p-distance from projected codon alignment; pairwise gap columns ignored."
      : "Midpoint-rooted for display. Branch lengths use alignment p-distance; columns with gaps in either sequence are ignored.",
    rooting: "midpoint"
  });
}
