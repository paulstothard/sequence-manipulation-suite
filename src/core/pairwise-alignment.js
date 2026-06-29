import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { getGeneticCode, makeCodonMap } from "./genetic-code.js";
import { makeAlignmentSvg } from "./alignment-svg.js";
import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import { cleanDnaRnaSequence, cleanProteinSequence, complementDnaRnaSequence } from "./sequence.js";

// Algorithms and scoring model:
// - Global alignment follows Needleman and Wunsch, J Mol Biol. 1970;48:443-453.
// - Local alignment follows Smith and Waterman, J Mol Biol. 1981;147:195-197.
// - Affine gap penalties use Gotoh's dynamic-programming formulation,
//   J Mol Biol. 1982;162:705-708.
const NEGATIVE_INFINITY = -1e15;
const STATE_M = 0;
const STATE_X = 1;
const STATE_Y = 2;
const STATE_STOP = 3;
export const pairwiseAlignmentDefaultLimits = Object.freeze({
  maxAlignmentCells: 2_000_000
});
const MAX_ALIGNMENT_CELLS_OPTION = 20_000_000;
export const PAIRWISE_ALIGNMENT_ENGINES = {
  seqAlign: "seq-align",
  sms3: "sms3-affine"
};
export const BIOWASM_SEQ_ALIGN_VERSION = "2017.10.18";

// BLOSUM62 values from Henikoff and Henikoff, Proc Natl Acad Sci USA.
// 1992;89:10915-10919, using the standard NCBI/BLAST ordering.
const BLOSUM62 = {
  A: { A: 4, R: -1, N: -2, D: -2, C: 0, Q: -1, E: -1, G: 0, H: -2, I: -1, L: -1, K: -1, M: -1, F: -2, P: -1, S: 1, T: 0, W: -3, Y: -2, V: 0, B: -2, Z: -1, X: 0 },
  R: { A: -1, R: 5, N: 0, D: -2, C: -3, Q: 1, E: 0, G: -2, H: 0, I: -3, L: -2, K: 2, M: -1, F: -3, P: -2, S: -1, T: -1, W: -3, Y: -2, V: -3, B: -1, Z: 0, X: -1 },
  N: { A: -2, R: 0, N: 6, D: 1, C: -3, Q: 0, E: 0, G: 0, H: 1, I: -3, L: -3, K: 0, M: -2, F: -3, P: -2, S: 1, T: 0, W: -4, Y: -2, V: -3, B: 3, Z: 0, X: -1 },
  D: { A: -2, R: -2, N: 1, D: 6, C: -3, Q: 0, E: 2, G: -1, H: -1, I: -3, L: -4, K: -1, M: -3, F: -3, P: -1, S: 0, T: -1, W: -4, Y: -3, V: -3, B: 4, Z: 1, X: -1 },
  C: { A: 0, R: -3, N: -3, D: -3, C: 9, Q: -3, E: -4, G: -3, H: -3, I: -1, L: -1, K: -3, M: -1, F: -2, P: -3, S: -1, T: -1, W: -2, Y: -2, V: -1, B: -3, Z: -3, X: -2 },
  Q: { A: -1, R: 1, N: 0, D: 0, C: -3, Q: 5, E: 2, G: -2, H: 0, I: -3, L: -2, K: 1, M: 0, F: -3, P: -1, S: 0, T: -1, W: -2, Y: -1, V: -2, B: 0, Z: 3, X: -1 },
  E: { A: -1, R: 0, N: 0, D: 2, C: -4, Q: 2, E: 5, G: -2, H: 0, I: -3, L: -3, K: 1, M: -2, F: -3, P: -1, S: 0, T: -1, W: -3, Y: -2, V: -2, B: 1, Z: 4, X: -1 },
  G: { A: 0, R: -2, N: 0, D: -1, C: -3, Q: -2, E: -2, G: 6, H: -2, I: -4, L: -4, K: -2, M: -3, F: -3, P: -2, S: 0, T: -2, W: -2, Y: -3, V: -3, B: -1, Z: -2, X: -1 },
  H: { A: -2, R: 0, N: 1, D: -1, C: -3, Q: 0, E: 0, G: -2, H: 8, I: -3, L: -3, K: -1, M: -2, F: -1, P: -2, S: -1, T: -2, W: -2, Y: 2, V: -3, B: 0, Z: 0, X: -1 },
  I: { A: -1, R: -3, N: -3, D: -3, C: -1, Q: -3, E: -3, G: -4, H: -3, I: 4, L: 2, K: -3, M: 1, F: 0, P: -3, S: -2, T: -1, W: -3, Y: -1, V: 3, B: -3, Z: -3, X: -1 },
  L: { A: -1, R: -2, N: -3, D: -4, C: -1, Q: -2, E: -3, G: -4, H: -3, I: 2, L: 4, K: -2, M: 2, F: 0, P: -3, S: -2, T: -1, W: -2, Y: -1, V: 1, B: -4, Z: -3, X: -1 },
  K: { A: -1, R: 2, N: 0, D: -1, C: -3, Q: 1, E: 1, G: -2, H: -1, I: -3, L: -2, K: 5, M: -1, F: -3, P: -1, S: 0, T: -1, W: -3, Y: -2, V: -2, B: 0, Z: 1, X: -1 },
  M: { A: -1, R: -1, N: -2, D: -3, C: -1, Q: 0, E: -2, G: -3, H: -2, I: 1, L: 2, K: -1, M: 5, F: 0, P: -2, S: -1, T: -1, W: -1, Y: -1, V: 1, B: -3, Z: -1, X: -1 },
  F: { A: -2, R: -3, N: -3, D: -3, C: -2, Q: -3, E: -3, G: -3, H: -1, I: 0, L: 0, K: -3, M: 0, F: 6, P: -4, S: -2, T: -2, W: 1, Y: 3, V: -1, B: -3, Z: -3, X: -1 },
  P: { A: -1, R: -2, N: -2, D: -1, C: -3, Q: -1, E: -1, G: -2, H: -2, I: -3, L: -3, K: -1, M: -2, F: -4, P: 7, S: -1, T: -1, W: -4, Y: -3, V: -2, B: -2, Z: -1, X: -2 },
  S: { A: 1, R: -1, N: 1, D: 0, C: -1, Q: 0, E: 0, G: 0, H: -1, I: -2, L: -2, K: 0, M: -1, F: -2, P: -1, S: 4, T: 1, W: -3, Y: -2, V: -2, B: 0, Z: 0, X: 0 },
  T: { A: 0, R: -1, N: 0, D: -1, C: -1, Q: -1, E: -1, G: -2, H: -2, I: -1, L: -1, K: -1, M: -1, F: -2, P: -1, S: 1, T: 5, W: -2, Y: -2, V: 0, B: -1, Z: -1, X: 0 },
  W: { A: -3, R: -3, N: -4, D: -4, C: -2, Q: -2, E: -3, G: -2, H: -2, I: -3, L: -2, K: -3, M: -1, F: 1, P: -4, S: -3, T: -2, W: 11, Y: 2, V: -3, B: -4, Z: -3, X: -2 },
  Y: { A: -2, R: -2, N: -2, D: -3, C: -2, Q: -1, E: -2, G: -3, H: 2, I: -1, L: -1, K: -2, M: -1, F: 3, P: -3, S: -2, T: -2, W: 2, Y: 7, V: -1, B: -3, Z: -2, X: -1 },
  V: { A: 0, R: -3, N: -3, D: -3, C: -1, Q: -2, E: -2, G: -3, H: -3, I: 3, L: 1, K: -2, M: 1, F: -1, P: -2, S: -2, T: 0, W: -3, Y: -1, V: 4, B: -3, Z: -2, X: -1 }
};

const DNA_RNA_SYMBOLS = {
  A: new Set(["A"]),
  C: new Set(["C"]),
  G: new Set(["G"]),
  T: new Set(["T"]),
  U: new Set(["U", "T"]),
  R: new Set(["A", "G"]),
  Y: new Set(["C", "T", "U"]),
  S: new Set(["G", "C"]),
  W: new Set(["A", "T", "U"]),
  K: new Set(["G", "T", "U"]),
  M: new Set(["A", "C"]),
  B: new Set(["C", "G", "T", "U"]),
  D: new Set(["A", "G", "T", "U"]),
  H: new Set(["A", "C", "T", "U"]),
  V: new Set(["A", "C", "G"]),
  N: new Set(["A", "C", "G", "T", "U"]),
  X: new Set(["A", "C", "G", "T", "U"])
};

export const pairwiseAlignmentTableColumns = [
  { id: "alignment_position", label: "Alignment position", type: "number" },
  { id: "sequence_a_position", label: "Sequence A position", type: "number" },
  { id: "sequence_b_position", label: "Sequence B position", type: "number" },
  { id: "sequence_a", label: "Sequence A", type: "string" },
  { id: "sequence_b", label: "Sequence B", type: "string" },
  { id: "relation", label: "Relation", type: "string" },
  { id: "score", label: "Column score", type: "number" }
];

export const codonAlignmentTableColumns = [
  { id: "alignment_position", label: "Alignment position", type: "number" },
  { id: "sequence_a_start", label: "Sequence A start", type: "number" },
  { id: "sequence_a_end", label: "Sequence A end", type: "number" },
  { id: "sequence_b_start", label: "Sequence B start", type: "number" },
  { id: "sequence_b_end", label: "Sequence B end", type: "number" },
  { id: "sequence_a_codon", label: "Sequence A codon", type: "string" },
  { id: "sequence_b_codon", label: "Sequence B codon", type: "string" },
  { id: "sequence_a_amino_acid", label: "Sequence A amino acid", type: "string" },
  { id: "sequence_b_amino_acid", label: "Sequence B amino acid", type: "string" },
  { id: "relation", label: "Relation", type: "string" },
  { id: "score", label: "Column score", type: "number" }
];

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function alignmentCoordinateWidth(alignment) {
  const maxCoordinate = Math.max(1, alignment.startA, alignment.endA, alignment.startB, alignment.endB);
  return String(maxCoordinate).length;
}

function parseTwoSequences(input, fallbackTitles = ["Sequence 1", "Sequence 2"]) {
  const text = String(input ?? "").trim();
  if (!text) {
    return { records: [], warnings: ["No sequence input was provided."] };
  }

  const fastaRecords = parseSequenceInput(text, "sequence");
  if (text.startsWith(">") && fastaRecords.length >= 2) {
    return { records: fastaRecords.slice(0, 2), warnings: fastaRecords.length > 2 ? ["Only the first two FASTA records were aligned."] : [] };
  }

  const parts = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      records: [
        { title: fallbackTitles[0], sequence: parts[0].replace(/\s+/g, ""), hadHeader: false },
        { title: fallbackTitles[1], sequence: parts[1].replace(/\s+/g, ""), hadHeader: false }
      ],
      warnings: parts.length > 2 ? ["Only the first two raw sequence blocks were aligned."] : []
    };
  }

  return {
    records: fastaRecords.length === 1 ? fastaRecords : [],
    warnings: ["Provide two FASTA records, or two raw sequences separated by a blank line."]
  };
}

function cleanForAlphabet(record, alphabet) {
  const cleaner = alphabet === "protein" ? cleanProteinSequence : cleanDnaRnaSequence;
  return cleaner(record.sequence, { keepGaps: false, preserveCase: false });
}

function reverseComplementDnaRna(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
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

function translateCodons(codons, codonMap) {
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

function normalizeOptions(options = {}) {
  return {
    mode: options.mode === "local" ? "local" : "global",
    matchScore: Number.parseFloat(options.matchScore) || 5,
    mismatchScore: Number.parseFloat(options.mismatchScore) || -4,
    similarScore: Number.parseFloat(options.similarScore) || 1,
    gapOpen: -Math.abs(Number.parseFloat(options.gapOpen) || 10),
    gapExtend: -Math.abs(Number.parseFloat(options.gapExtend) || 1),
    lineWidth: Math.max(20, Math.min(120, Number.parseInt(options.lineWidth, 10) || 60)),
    scoringMatrix: options.scoringMatrix === "blosum62" ? "blosum62" : "identity",
    maxAlignmentCells: Math.max(
      1000,
      Math.min(
        MAX_ALIGNMENT_CELLS_OPTION,
        Number.parseInt(options.maxAlignmentCells, 10) || pairwiseAlignmentDefaultLimits.maxAlignmentCells
      )
    )
  };
}

function normalizeRequestedAlignmentEngine(value) {
  if (value === PAIRWISE_ALIGNMENT_ENGINES.seqAlign) {
    return PAIRWISE_ALIGNMENT_ENGINES.seqAlign;
  }
  if (value === PAIRWISE_ALIGNMENT_ENGINES.sms3) {
    return PAIRWISE_ALIGNMENT_ENGINES.sms3;
  }
  return "";
}

function pushUniqueWarning(warnings, warning) {
  if (Array.isArray(warnings) && !warnings.includes(warning)) {
    warnings.push(warning);
  }
}

async function getBioWasmSeqAlignCli(program) {
  // BioWasm/Aioli runs the public-domain seq-align WebAssembly build locally
  // in the browser. seq-align supports Needleman-Wunsch, Smith-Waterman,
  // BLOSUM/PAM scoring, and affine gaps from its command-line interface.
  return createBioWasmCli({
    tool: "seq-align",
    program,
    version: BIOWASM_SEQ_ALIGN_VERSION,
    assetPath: "../vendor/biowasm/seq-align/2017.10.18"
  });
}

function hasExactSeqAlignScoringSupport(sequenceA, sequenceB, alphabet, options) {
  const integerScores = alphabet === "protein"
    ? [options.gapOpen, options.gapExtend]
    : [options.matchScore, options.mismatchScore, options.gapOpen, options.gapExtend];
  if (!integerScores.every((score) => Number.isInteger(score))) {
    return "seq-align accepts integer scoring parameters only";
  }

  if (alphabet === "dna-rna") {
    const combined = `${sequenceA}${sequenceB}`.toUpperCase();
    const hasUnsupportedAmbiguity = /[^ACGTU]/.test(combined);
    if (hasUnsupportedAmbiguity && options.similarScore !== options.mismatchScore) {
      return "seq-align cannot reproduce SMS3 IUPAC-overlap scoring for ambiguous DNA/RNA symbols";
    }
    if (combined.includes("T") && combined.includes("U") && options.similarScore !== options.matchScore) {
      return "seq-align cannot reproduce SMS3 T/U overlap scoring when DNA and RNA symbols are mixed";
    }
  }

  return "";
}

function seqAlignSequence(sequence, alphabet) {
  return alphabet === "dna-rna" ? sequence.replaceAll("U", "T") : sequence;
}

function restoreAlignedSymbols(alignedSequence, originalSequence, start) {
  let sourceIndex = Math.max(0, start - 1);
  return Array.from(alignedSequence, (symbol) => {
    if (symbol === "-") {
      return "-";
    }
    const originalSymbol = originalSequence[sourceIndex] ?? symbol;
    sourceIndex += 1;
    return originalSymbol;
  }).join("");
}

function seqAlignGapOpen(options) {
  // seq-align uses open + N * extend; SMS3 uses open + (N - 1) * extend.
  return options.gapOpen - options.gapExtend;
}

function parseSeqAlignGlobalOutput(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scoreLine = lines.find((line) => /^score:\s*/i.test(line));
  if (lines.length < 3 || !scoreLine) {
    throw new Error("seq-align did not return a parseable global alignment.");
  }
  return {
    alignmentA: lines[0],
    alignmentB: lines[1],
    score: Number.parseFloat(scoreLine.replace(/^score:\s*/i, ""))
  };
}

function parseSeqAlignLocalOutput(stdout) {
  const text = String(stdout ?? "");
  const hit = text.match(/hit\s+\S+\s+score:\s+(-?\d+(?:\.\d+)?)\s*\n\s+(\S+)\s+\[pos:\s*(\d+);\s*len:\s*(\d+)\]\s*\n\s+(\S+)\s+\[pos:\s*(\d+);\s*len:\s*(\d+)\]/m);
  if (!hit) {
    return {
      alignmentA: "",
      alignmentB: "",
      score: 0,
      startA: 1,
      endA: 0,
      startB: 1,
      endB: 0
    };
  }
  const startA = Number.parseInt(hit[3], 10) + 1;
  const startB = Number.parseInt(hit[6], 10) + 1;
  const lengthA = Number.parseInt(hit[4], 10);
  const lengthB = Number.parseInt(hit[7], 10);
  return {
    alignmentA: hit[2],
    alignmentB: hit[5],
    score: Number.parseFloat(hit[1]),
    startA,
    endA: startA + lengthA - 1,
    startB,
    endB: startB + lengthB - 1
  };
}

async function alignPairwiseWithBioWasmSeqAlign(sequenceA, sequenceB, rawOptions = {}, context = {}, cliFactory = getBioWasmSeqAlignCli) {
  const options = normalizeOptions(rawOptions);
  const alphabet = rawOptions.alphabet === "protein" ? "protein" : "dna-rna";
  const originalA = String(sequenceA ?? "").toUpperCase();
  const originalB = String(sequenceB ?? "").toUpperCase();
  const a = seqAlignSequence(originalA, alphabet);
  const b = seqAlignSequence(originalB, alphabet);
  const program = options.mode === "local" ? "smith_waterman" : "needleman_wunsch";
  const cli = await cliFactory(program);
  const args = [];

  if (options.mode === "global") {
    args.push("--printscores");
  } else {
    args.push("--maxhits", "1", "--minscore", "1");
  }
  if (alphabet === "protein") {
    args.push("--scoring", "BLOSUM62");
  } else {
    args.push("--match", String(options.matchScore), "--mismatch", String(options.mismatchScore));
  }
  args.push(
    "--gapopen",
    String(seqAlignGapOpen(options)),
    "--gapextend",
    String(options.gapExtend),
    a,
    b
  );

  context.reportProgress?.({ phase: options.mode === "local" ? "running-smith-waterman" : "running-needleman-wunsch", progress: 0.45 });
  const result = await cli.exec(program, args);
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  if (result?.stderr) {
    throw new Error(`seq-align reported an error: ${result.stderr.trim()}`);
  }

  const parsed = options.mode === "local"
    ? parseSeqAlignLocalOutput(result?.stdout)
    : {
        ...parseSeqAlignGlobalOutput(result?.stdout),
        startA: 1,
        endA: originalA.length,
        startB: 1,
        endB: originalB.length
      };
  const alignmentA = restoreAlignedSymbols(parsed.alignmentA, originalA, parsed.startA);
  const alignmentB = restoreAlignedSymbols(parsed.alignmentB, originalB, parsed.startB);
  return {
    ...summarizeAlignment({
      alignmentA,
      alignmentB,
      alphabet,
      score: parsed.score,
      options: { ...options, alignmentEngine: PAIRWISE_ALIGNMENT_ENGINES.seqAlign },
      startA: parsed.startA,
      endA: parsed.endA,
      startB: parsed.startB,
      endB: parsed.endB
    }),
    engine: PAIRWISE_ALIGNMENT_ENGINES.seqAlign,
    engineVersion: BIOWASM_SEQ_ALIGN_VERSION
  };
}

async function alignPairwiseWithSelectedEngine(sequenceA, sequenceB, rawOptions = {}, alphabet = "dna-rna", warnings = [], context = {}, cliFactory = getBioWasmSeqAlignCli) {
  const requestedEngine = normalizeRequestedAlignmentEngine(rawOptions.alignmentEngine);
  const preferredEngine = requestedEngine || PAIRWISE_ALIGNMENT_ENGINES.seqAlign;
  const options = normalizeOptions(rawOptions);

  if (preferredEngine === PAIRWISE_ALIGNMENT_ENGINES.seqAlign) {
    requireBioWasmRuntime("seq-align");
    const unsupportedReason = hasExactSeqAlignScoringSupport(sequenceA, sequenceB, alphabet, options);
    if (unsupportedReason) {
      throw new Error(`${unsupportedReason}. Select the SMS3 affine engine to use SMS3 scoring for this input.`);
    }
    return alignPairwiseWithBioWasmSeqAlign(sequenceA, sequenceB, { ...rawOptions, alphabet }, context, cliFactory);
  }

  return alignPairwiseAffine(sequenceA, sequenceB, { ...rawOptions, alphabet }, context);
}

export function createPairwiseAlignmentRunner(rawOptions = {}, alphabet = "dna-rna", warnings = [], context = {}) {
  const cliByProgram = new Map();
  const cachedCliFactory = async (program) => {
    if (!cliByProgram.has(program)) {
      cliByProgram.set(program, await getBioWasmSeqAlignCli(program));
    }
    return cliByProgram.get(program);
  };

  return {
    align(sequenceA, sequenceB, optionOverrides = {}) {
      const options = { ...rawOptions, ...optionOverrides, alphabet };
      return alignPairwiseWithSelectedEngine(sequenceA, sequenceB, options, alphabet, warnings, context, cachedCliFactory);
    }
  };
}

function symbolsOverlap(left, right, alphabet) {
  if (left === right) {
    return true;
  }
  if (alphabet !== "dna-rna") {
    return false;
  }
  const leftSet = DNA_RNA_SYMBOLS[left.toUpperCase()];
  const rightSet = DNA_RNA_SYMBOLS[right.toUpperCase()];
  if (!leftSet || !rightSet) {
    return false;
  }
  for (const symbol of leftSet) {
    if (rightSet.has(symbol)) {
      return true;
    }
  }
  return false;
}

function scorePair(left, right, alphabet, options) {
  if (alphabet === "protein" && options.scoringMatrix === "blosum62") {
    return BLOSUM62[left]?.[right] ?? BLOSUM62[right]?.[left] ?? -1;
  }
  if (left === right) {
    return options.matchScore;
  }
  if (symbolsOverlap(left, right, alphabet)) {
    return options.similarScore;
  }
  return options.mismatchScore;
}

function chooseBest(candidates) {
  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (candidate.score > best.score) {
      best = candidate;
    }
  }
  return best;
}

function makeCellIndex(width) {
  return (i, j) => i * width + j;
}

export async function alignPairwiseAffine(sequenceA, sequenceB, rawOptions = {}, context = {}) {
  const options = { ...normalizeOptions(rawOptions), alignmentEngine: PAIRWISE_ALIGNMENT_ENGINES.sms3 };
  const alphabet = rawOptions.alphabet === "protein" ? "protein" : "dna-rna";
  const a = String(sequenceA ?? "").toUpperCase();
  const b = String(sequenceB ?? "").toUpperCase();
  const m = a.length;
  const n = b.length;
  const cells = (m + 1) * (n + 1);

  if (m === 0 || n === 0) {
    throw new Error("Both sequences must contain at least one valid symbol.");
  }
  if (cells > options.maxAlignmentCells) {
    throw new Error(`Alignment matrix would require ${cells.toLocaleString()} cells, which exceeds the current ${options.maxAlignmentCells.toLocaleString()}-cell SMS3 affine alignment limit. Reduce sequence length, use a smaller region, or raise the limit if the browser can handle the run.`);
  }

  const M = new Float64Array(cells);
  const X = new Float64Array(cells);
  const Y = new Float64Array(cells);
  const ptrM = new Int8Array(cells);
  const ptrX = new Int8Array(cells);
  const ptrY = new Int8Array(cells);
  const index = makeCellIndex(n + 1);

  M.fill(options.mode === "local" ? 0 : NEGATIVE_INFINITY);
  X.fill(options.mode === "local" ? 0 : NEGATIVE_INFINITY);
  Y.fill(options.mode === "local" ? 0 : NEGATIVE_INFINITY);
  ptrM.fill(STATE_STOP);
  ptrX.fill(STATE_STOP);
  ptrY.fill(STATE_STOP);
  M[index(0, 0)] = 0;

  if (options.mode === "global") {
    for (let i = 1; i <= m; i += 1) {
      const cell = index(i, 0);
      X[cell] = options.gapOpen + (i - 1) * options.gapExtend;
      ptrX[cell] = i === 1 ? STATE_M : STATE_X;
    }
    for (let j = 1; j <= n; j += 1) {
      const cell = index(0, j);
      Y[cell] = options.gapOpen + (j - 1) * options.gapExtend;
      ptrY[cell] = j === 1 ? STATE_M : STATE_Y;
    }
  }

  let bestScore = options.mode === "local" ? 0 : NEGATIVE_INFINITY;
  let bestI = m;
  let bestJ = n;
  let bestState = STATE_M;

  for (let i = 1; i <= m; i += 1) {
    context.throwIfCancelled?.();
    if (i % 20 === 0) {
      await context.yieldIfNeeded?.();
    }
    for (let j = 1; j <= n; j += 1) {
      const cell = index(i, j);
      const diag = index(i - 1, j - 1);
      const up = index(i - 1, j);
      const left = index(i, j - 1);
      const pairScore = scorePair(a[i - 1], b[j - 1], alphabet, options);

      const mPrev = chooseBest([
        { score: M[diag], state: STATE_M },
        { score: X[diag], state: STATE_X },
        { score: Y[diag], state: STATE_Y }
      ]);
      M[cell] = mPrev.score + pairScore;
      ptrM[cell] = mPrev.state;

      const xPrev = chooseBest([
        { score: M[up] + options.gapOpen, state: STATE_M },
        { score: X[up] + options.gapExtend, state: STATE_X },
        { score: Y[up] + options.gapOpen, state: STATE_Y }
      ]);
      X[cell] = xPrev.score;
      ptrX[cell] = xPrev.state;

      const yPrev = chooseBest([
        { score: M[left] + options.gapOpen, state: STATE_M },
        { score: X[left] + options.gapOpen, state: STATE_X },
        { score: Y[left] + options.gapExtend, state: STATE_Y }
      ]);
      Y[cell] = yPrev.score;
      ptrY[cell] = yPrev.state;

      if (options.mode === "local") {
        if (M[cell] <= 0) {
          M[cell] = 0;
          ptrM[cell] = STATE_STOP;
        }
        if (X[cell] <= 0) {
          X[cell] = 0;
          ptrX[cell] = STATE_STOP;
        }
        if (Y[cell] <= 0) {
          Y[cell] = 0;
          ptrY[cell] = STATE_STOP;
        }
        const localBest = chooseBest([
          { score: M[cell], state: STATE_M },
          { score: X[cell], state: STATE_X },
          { score: Y[cell], state: STATE_Y }
        ]);
        if (localBest.score > bestScore) {
          bestScore = localBest.score;
          bestI = i;
          bestJ = j;
          bestState = localBest.state;
        }
      }
    }
    context.reportProgress?.({ phase: "filling-matrix", progress: 0.1 + 0.7 * (i / Math.max(1, m)) });
  }

  if (options.mode === "global") {
    const finalCell = index(m, n);
    const globalBest = chooseBest([
      { score: M[finalCell], state: STATE_M },
      { score: X[finalCell], state: STATE_X },
      { score: Y[finalCell], state: STATE_Y }
    ]);
    bestScore = globalBest.score;
    bestState = globalBest.state;
  }

  const alignedA = [];
  const alignedB = [];
  let i = bestI;
  let j = bestJ;
  let state = bestState;
  const endA = i;
  const endB = j;

  while ((options.mode === "global" && (i > 0 || j > 0)) || (options.mode === "local" && state !== STATE_STOP)) {
    const cell = index(i, j);
    if (options.mode === "local") {
      const currentScore = state === STATE_M ? M[cell] : state === STATE_X ? X[cell] : Y[cell];
      if (currentScore <= 0) {
        break;
      }
    }
    if (state === STATE_M) {
      alignedA.push(a[i - 1]);
      alignedB.push(b[j - 1]);
      state = ptrM[cell];
      i -= 1;
      j -= 1;
    } else if (state === STATE_X) {
      alignedA.push(a[i - 1]);
      alignedB.push("-");
      state = ptrX[cell];
      i -= 1;
    } else if (state === STATE_Y) {
      alignedA.push("-");
      alignedB.push(b[j - 1]);
      state = ptrY[cell];
      j -= 1;
    } else {
      break;
    }
  }

  alignedA.reverse();
  alignedB.reverse();
  const alignmentA = alignedA.join("");
  const alignmentB = alignedB.join("");
  return {
    ...summarizeAlignment({
      alignmentA,
      alignmentB,
      alphabet,
      score: bestScore,
      options,
      startA: i + 1,
      endA,
      startB: j + 1,
      endB
    }),
    engine: PAIRWISE_ALIGNMENT_ENGINES.sms3,
    engineVersion: ""
  };
}

function classifyColumn(a, b, alphabet, options) {
  if (a === "-" || b === "-") {
    return { relation: "gap", marker: " ", score: null };
  }
  if (a === b) {
    return { relation: "match", marker: "|", score: scorePair(a, b, alphabet, options) };
  }
  const pairScore = scorePair(a, b, alphabet, options);
  if (alphabet === "protein" && options.scoringMatrix === "blosum62" && pairScore > 0) {
    return { relation: "similar", marker: ":", score: pairScore };
  }
  if (symbolsOverlap(a, b, alphabet)) {
    return { relation: "similar", marker: ":", score: pairScore };
  }
  return { relation: "mismatch", marker: ".", score: pairScore };
}

function summarizeAlignment({ alignmentA, alignmentB, alphabet, score, options, startA, endA, startB, endB }) {
  const columns = [];
  let posA = startA - 1;
  let posB = startB - 1;
  let matches = 0;
  let similar = 0;
  let mismatches = 0;
  let gaps = 0;
  let gapOpenings = 0;
  let previousGap = false;
  const markers = [];

  for (let index = 0; index < alignmentA.length; index += 1) {
    const charA = alignmentA[index];
    const charB = alignmentB[index];
    if (charA !== "-") {
      posA += 1;
    }
    if (charB !== "-") {
      posB += 1;
    }
    const column = classifyColumn(charA, charB, alphabet, options);
    markers.push(column.marker);
    if (column.relation === "match") {
      matches += 1;
    } else if (column.relation === "similar") {
      similar += 1;
    } else if (column.relation === "mismatch") {
      mismatches += 1;
    } else {
      gaps += 1;
      if (!previousGap) {
        gapOpenings += 1;
      }
    }
    previousGap = column.relation === "gap";
    columns.push({
      alignment_position: index + 1,
      sequence_a_position: charA === "-" ? "" : posA,
      sequence_b_position: charB === "-" ? "" : posB,
      sequence_a: charA,
      sequence_b: charB,
      relation: column.relation,
      score: column.score ?? ""
    });
  }

  const alignedLength = alignmentA.length;
  const identityPercent = alignedLength > 0 ? (matches / alignedLength) * 100 : 0;
  const similarityPercent = alignedLength > 0 ? ((matches + similar) / alignedLength) * 100 : 0;

  return {
    alignmentA,
    alignmentB,
    markers: markers.join(""),
    columns,
    score,
    mode: options.mode,
    options,
    alphabet,
    alignedLength,
    matches,
    similar,
    mismatches,
    gaps,
    gapOpenings,
    identityPercent,
    similarityPercent,
    startA,
    endA,
    startB,
    endB
  };
}

export async function preparePairwiseAlignment(input, rawOptions = {}, alphabet = "dna-rna", context = {}) {
  const parsed = parseTwoSequences(input);
  const warnings = [...parsed.warnings];
  if (parsed.records.length < 2) {
    return { warnings, records: [], alignment: null, charactersRemoved: 0 };
  }

  const cleaned = parsed.records.map((record) => cleanForAlphabet(record, alphabet));
  let charactersRemoved = 0;
  const records = parsed.records.map((record, index) => {
    charactersRemoved += cleaned[index].removedCount;
    if (cleaned[index].removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned[index].removedCount} character(s) outside the selected alphabet.`);
    }
    return {
      title: record.title || `Sequence ${index + 1}`,
      sequence: cleaned[index].sequence
    };
  });

  let alignment = null;
  if (alphabet === "dna-rna" && rawOptions.secondSequenceOrientation === "best") {
    const directAlignment = await alignPairwiseWithSelectedEngine(records[0].sequence, records[1].sequence, { ...rawOptions, alphabet }, alphabet, warnings, context);
    const reverseComplementSequence = reverseComplementDnaRna(records[1].sequence);
    const reverseComplementAlignment = await alignPairwiseWithSelectedEngine(records[0].sequence, reverseComplementSequence, { ...rawOptions, alphabet }, alphabet, warnings, context);
    const selectedReverseComplement = reverseComplementAlignment.score > directAlignment.score;
    alignment = selectedReverseComplement ? reverseComplementAlignment : directAlignment;
    alignment.orientationSelection = {
      mode: "best-of-two",
      selected: selectedReverseComplement ? "reverse-complement" : "as-provided",
      asProvidedScore: directAlignment.score,
      reverseComplementScore: reverseComplementAlignment.score,
      tiePolicy: "as-provided"
    };
    if (selectedReverseComplement) {
      records[1] = {
        ...records[1],
        title: `${records[1].title} reverse complement`,
        sequence: reverseComplementSequence,
        originalSequenceLength: cleaned[1].sequence.length
      };
    }
  } else {
    alignment = await alignPairwiseWithSelectedEngine(records[0].sequence, records[1].sequence, { ...rawOptions, alphabet }, alphabet, warnings, context);
    alignment.orientationSelection = {
      mode: "as-provided",
      selected: "as-provided"
    };
  }
  return { warnings: [...new Set(warnings)], records, alignment, charactersRemoved };
}

export async function preparePairwiseCodonAlignment(input, rawOptions = {}, context = {}) {
  const parsed = parseTwoSequences(input);
  const warnings = [...parsed.warnings];
  if (parsed.records.length < 2) {
    return { warnings, records: [], alignment: null, charactersRemoved: 0 };
  }

  const code = getGeneticCode(rawOptions.geneticCode ?? "1");
  const codonMap = makeCodonMap(code);
  const cleaned = parsed.records.map((record) => cleanDnaRnaSequence(record.sequence, { keepGaps: false, preserveCase: false }));
  let charactersRemoved = 0;
  const records = parsed.records.map((record, index) => {
    charactersRemoved += cleaned[index].removedCount;
    if (cleaned[index].removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned[index].removedCount} non-DNA/RNA character(s).`);
    }
    const split = splitCompleteCodons(cleaned[index].sequence);
    if (split.trailingBases > 0) {
      warnings.push(`${record.title}: ignored ${split.trailingBases} trailing base(s) outside a complete codon.`);
    }
    const translated = translateCodons(split.codons, codonMap);
    if (translated.ambiguousCodons > 0) {
      warnings.push(`${record.title}: translated ${translated.ambiguousCodons} ambiguous codon(s) as X for codon alignment scoring.`);
    }
    if (translated.stopCodons > 0) {
      warnings.push(`${record.title}: translated ${translated.stopCodons} stop codon(s) as X for codon alignment scoring.`);
    }
    return {
      title: record.title || `Sequence ${index + 1}`,
      sequence: split.codons.join(""),
      codons: split.codons,
      protein: translated.protein
    };
  });

  if (records.some((record) => record.codons.length === 0)) {
    return { warnings: [...warnings, "Both sequences must contain at least one complete codon."], records, alignment: null, charactersRemoved };
  }

  const proteinAlignment = await alignPairwiseWithSelectedEngine(records[0].protein, records[1].protein, {
    ...rawOptions,
    alphabet: "protein",
    scoringMatrix: "blosum62"
  }, "protein", warnings, context);
  const alignment = projectProteinAlignmentToCodons(records, proteinAlignment, code);
  return { warnings: [...new Set(warnings)], records, alignment, charactersRemoved, geneticCode: code };
}

function projectProteinAlignmentToCodons(records, proteinAlignment, geneticCode) {
  const codonAlignmentA = [];
  const codonAlignmentB = [];
  const proteinA = [];
  const proteinB = [];
  const columns = [];
  let codonIndexA = proteinAlignment.startA - 1;
  let codonIndexB = proteinAlignment.startB - 1;
  let positionA = (proteinAlignment.startA - 1) * 3;
  let positionB = (proteinAlignment.startB - 1) * 3;

  for (let index = 0; index < proteinAlignment.alignedLength; index += 1) {
    const aaA = proteinAlignment.alignmentA[index];
    const aaB = proteinAlignment.alignmentB[index];
    const column = proteinAlignment.columns[index];
    let codonA = "---";
    let codonB = "---";
    let startA = "";
    let endA = "";
    let startB = "";
    let endB = "";

    if (aaA !== "-") {
      codonA = records[0].codons[codonIndexA] ?? "---";
      codonIndexA += 1;
      startA = positionA + 1;
      endA = positionA + 3;
      positionA += 3;
    }
    if (aaB !== "-") {
      codonB = records[1].codons[codonIndexB] ?? "---";
      codonIndexB += 1;
      startB = positionB + 1;
      endB = positionB + 3;
      positionB += 3;
    }

    codonAlignmentA.push(codonA);
    codonAlignmentB.push(codonB);
    proteinA.push(aaA);
    proteinB.push(aaB);
    columns.push({
      alignment_position: index + 1,
      sequence_a_start: startA,
      sequence_a_end: endA,
      sequence_b_start: startB,
      sequence_b_end: endB,
      sequence_a_codon: codonA,
      sequence_b_codon: codonB,
      sequence_a_amino_acid: aaA,
      sequence_b_amino_acid: aaB,
      relation: column.relation,
      score: column.score
    });
  }

  return {
    ...proteinAlignment,
    alphabet: "coding-dna",
    geneticCode,
    codonAlignmentA,
    codonAlignmentB,
    proteinAlignmentA: proteinA.join(""),
    proteinAlignmentB: proteinB.join(""),
    codonColumns: columns,
    nucleotideStartA: (proteinAlignment.startA - 1) * 3 + 1,
    nucleotideEndA: proteinAlignment.endA * 3,
    nucleotideStartB: (proteinAlignment.startB - 1) * 3 + 1,
    nucleotideEndB: proteinAlignment.endB * 3
  };
}

export function makePairwiseAlignmentReport(records, alignment, options = {}) {
  if (!alignment) {
    return "";
  }
  const similarLabel = alignment.alphabet === "protein" ? "Positive-scoring substitution columns" : "Similar/ambiguous-overlap columns";
  const engineLabel = alignment.engine === PAIRWISE_ALIGNMENT_ENGINES.seqAlign
    ? `seq-align ${alignment.engineVersion || BIOWASM_SEQ_ALIGN_VERSION} via vendored BioWasm/Aioli`
    : "SMS3 affine dynamic programming";
  const lines = [
    "Pairwise sequence alignment",
    "",
    `Sequence A: ${records[0].title} (${records[0].sequence.length} symbols)`,
    `Sequence B: ${records[1].title} (${records[1].sequence.length} symbols)`,
    ...(alignment.orientationSelection?.mode === "best-of-two"
      ? [
          `Sequence B orientation: ${alignment.orientationSelection.selected === "reverse-complement" ? "reverse complement selected" : "submitted orientation selected"}`,
          `Sequence B submitted-orientation score: ${alignment.orientationSelection.asProvidedScore}`,
          `Sequence B reverse-complement score: ${alignment.orientationSelection.reverseComplementScore}`,
          `Orientation tie policy: ${alignment.orientationSelection.tiePolicy}`
        ]
      : []),
    `Mode: ${alignment.mode === "local" ? "Local Smith-Waterman" : "Global Needleman-Wunsch"}`,
    `Engine: ${engineLabel}`,
    `Scoring: ${alignment.alphabet === "protein" ? "BLOSUM62" : `match ${options.matchScore ?? 5}, similar ${options.similarScore ?? 1}, mismatch ${options.mismatchScore ?? -4}`}, gap open ${options.gapOpen ?? 10}, gap extend ${options.gapExtend ?? 1}`,
    `Affine gap model: Gotoh`,
    `Score: ${alignment.score}`,
    `Aligned length: ${alignment.alignedLength}`,
    `Matches: ${alignment.matches}`,
    `${similarLabel}: ${alignment.similar}`,
    `Mismatches: ${alignment.mismatches}`,
    `Gap columns: ${alignment.gaps}`,
    `Gap openings: ${alignment.gapOpenings}`,
    `Identity: ${alignment.identityPercent.toFixed(2)}%`,
    `Similarity: ${alignment.similarityPercent.toFixed(2)}%`,
    `Sequence A aligned range: ${alignment.startA}-${alignment.endA}`,
    `Sequence B aligned range: ${alignment.startB}-${alignment.endB}`,
    "",
    `References: Needleman and Wunsch 1970; Smith and Waterman 1981; Gotoh 1982${alignment.alphabet === "protein" ? "; Henikoff and Henikoff 1992" : ""}${alignment.engine === PAIRWISE_ALIGNMENT_ENGINES.seqAlign ? "; seq-align/BioWasm browser runtime" : ""}.`
  ];
  return lines.join("\n");
}

export function makePairwiseAlignmentText(records, alignment, lineWidth = 60) {
  const width = Math.max(20, Math.min(120, Number.parseInt(lineWidth, 10) || 60));
  const lines = [];
  let posA = alignment.startA;
  let posB = alignment.startB;
  const labelA = records[0].title.slice(0, 18) || "Sequence A";
  const labelB = records[1].title.slice(0, 18) || "Sequence B";
  const labelWidth = 18;
  const coordinateWidth = Math.max(6, alignmentCoordinateWidth(alignment));
  const markerIndent = labelWidth + 1 + coordinateWidth;

  for (let index = 0; index < alignment.alignmentA.length; index += width) {
    const chunkA = alignment.alignmentA.slice(index, index + width);
    const chunkB = alignment.alignmentB.slice(index, index + width);
    const chunkMarkers = alignment.markers.slice(index, index + width);
    const startA = posA;
    const startB = posB;
    const basesA = chunkA.replace(/-/g, "").length;
    const basesB = chunkB.replace(/-/g, "").length;
    const endA = basesA > 0 ? posA + basesA - 1 : posA - 1;
    const endB = basesB > 0 ? posB + basesB - 1 : posB - 1;

    lines.push(`${labelA.padEnd(labelWidth)} ${String(startA).padStart(coordinateWidth)} ${chunkA} ${endA}`);
    lines.push(`${"".padEnd(markerIndent)} ${chunkMarkers}`);
    lines.push(`${labelB.padEnd(labelWidth)} ${String(startB).padStart(coordinateWidth)} ${chunkB} ${endB}`);
    lines.push("");
    posA += basesA;
    posB += basesB;
  }

  return lines.join("\n").trimEnd();
}

export function makeAlignedFasta(records, alignment, lineWidth = 60) {
  return [
    formatFastaRecord(`${records[0].title} aligned`, alignment.alignmentA, lineWidth),
    formatFastaRecord(`${records[1].title} aligned`, alignment.alignmentB, lineWidth)
  ].join("\n");
}

export function makeClustal(records, alignment, lineWidth = 60) {
  const width = Math.max(20, Math.min(120, Number.parseInt(lineWidth, 10) || 60));
  const nameA = records[0].title.replace(/\s+/g, "_").slice(0, 24) || "sequence_a";
  const nameB = records[1].title.replace(/\s+/g, "_").slice(0, 24) || "sequence_b";
  const labelWidth = Math.max(nameA.length, nameB.length, 12);
  const lines = ["CLUSTAL multiple sequence alignment", ""];

  for (let index = 0; index < alignment.alignmentA.length; index += width) {
    const chunkA = alignment.alignmentA.slice(index, index + width);
    const chunkB = alignment.alignmentB.slice(index, index + width);
    const consensus = alignment.markers
      .slice(index, index + width)
      .replace(/\|/g, "*")
      .replace(/:/g, ":")
      .replace(/\./g, " ");
    lines.push(`${nameA.padEnd(labelWidth)} ${chunkA}`);
    lines.push(`${nameB.padEnd(labelWidth)} ${chunkB}`);
    lines.push(`${"".padEnd(labelWidth)} ${consensus}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function makeAlignmentTsv(alignment) {
  const headers = pairwiseAlignmentTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...alignment.columns.map((row) => headers.map((header) => String(row[header] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function makePairwiseCodonAlignmentReport(records, alignment) {
  if (!alignment) {
    return "";
  }
  const engineLabel = alignment.engine === PAIRWISE_ALIGNMENT_ENGINES.seqAlign
    ? `seq-align ${alignment.engineVersion || BIOWASM_SEQ_ALIGN_VERSION} via vendored BioWasm/Aioli`
    : "SMS3 affine dynamic programming";
  return [
    "Pairwise coding DNA alignment",
    "",
    `Sequence A: ${records[0].title} (${records[0].codons.length} complete codons)`,
    `Sequence B: ${records[1].title} (${records[1].codons.length} complete codons)`,
    `Mode: ${alignment.mode === "local" ? "Local Smith-Waterman on translated codons" : "Global Needleman-Wunsch on translated codons"}`,
    `Engine: ${engineLabel}`,
    `Scoring: BLOSUM62 on translated amino acids, gap open ${Math.abs(alignment.options?.gapOpen ?? 10)}, gap extend ${Math.abs(alignment.options?.gapExtend ?? 1)} per codon gap`,
    `Genetic code: ${alignment.geneticCode.id}. ${alignment.geneticCode.name}`,
    `Affine gap model: Gotoh`,
    `Score: ${alignment.score}`,
    `Aligned codons: ${alignment.alignedLength}`,
    `Matches: ${alignment.matches}`,
    `Positive-scoring substitution columns: ${alignment.similar}`,
    `Mismatches: ${alignment.mismatches}`,
    `Codon gap columns: ${alignment.gaps}`,
    `Gap openings: ${alignment.gapOpenings}`,
    `Amino acid identity: ${alignment.identityPercent.toFixed(2)}%`,
    `Amino acid similarity: ${alignment.similarityPercent.toFixed(2)}%`,
    `Sequence A nucleotide range: ${alignment.nucleotideStartA}-${alignment.nucleotideEndA}`,
    `Sequence B nucleotide range: ${alignment.nucleotideStartB}-${alignment.nucleotideEndB}`,
    "",
    `References: Needleman and Wunsch 1970; Smith and Waterman 1981; Gotoh 1982; Henikoff and Henikoff 1992${alignment.engine === PAIRWISE_ALIGNMENT_ENGINES.seqAlign ? "; seq-align/BioWasm browser runtime" : ""}. Genetic code assignments follow NCBI transl_table definitions.`
  ].join("\n");
}

export function makePairwiseCodonAlignmentText(records, alignment, lineWidth = 20) {
  const width = Math.max(1, Math.min(60, Number.parseInt(lineWidth, 10) || 20));
  const lines = [];
  const labelWidth = 18;
  const coordinateWidth = Math.max(
    6,
    String(Math.max(1, alignment.nucleotideStartA, alignment.nucleotideEndA, alignment.nucleotideStartB, alignment.nucleotideEndB)).length
  );
  const markerIndent = labelWidth + 1 + coordinateWidth;
  const labelA = records[0].title.slice(0, 18) || "Sequence A";
  const labelB = records[1].title.slice(0, 18) || "Sequence B";
  let posA = alignment.nucleotideStartA;
  let posB = alignment.nucleotideStartB;

  for (let index = 0; index < alignment.alignedLength; index += width) {
    const codonsA = alignment.codonAlignmentA.slice(index, index + width);
    const codonsB = alignment.codonAlignmentB.slice(index, index + width);
    const proteinA = alignment.proteinAlignmentA.slice(index, index + width).split("").map((aa) => ` ${aa} `).join(" ");
    const markers = alignment.markers.slice(index, index + width).split("").map((marker) => ` ${marker} `).join(" ");
    const proteinB = alignment.proteinAlignmentB.slice(index, index + width).split("").map((aa) => ` ${aa} `).join(" ");
    const chunkA = codonsA.join(" ");
    const chunkB = codonsB.join(" ");
    const basesA = codonsA.filter((codon) => codon !== "---").length * 3;
    const basesB = codonsB.filter((codon) => codon !== "---").length * 3;
    const startA = posA;
    const startB = posB;
    const endA = basesA > 0 ? posA + basesA - 1 : posA - 1;
    const endB = basesB > 0 ? posB + basesB - 1 : posB - 1;

    lines.push(`${labelA.padEnd(labelWidth)} ${String(startA).padStart(coordinateWidth)} ${chunkA} ${endA}`);
    lines.push(`${"protein".padStart(markerIndent)} ${proteinA}`);
    lines.push(`${"".padEnd(markerIndent)} ${markers}`);
    lines.push(`${"protein".padStart(markerIndent)} ${proteinB}`);
    lines.push(`${labelB.padEnd(labelWidth)} ${String(startB).padStart(coordinateWidth)} ${chunkB} ${endB}`);
    lines.push("");
    posA += basesA;
    posB += basesB;
  }

  return lines.join("\n").trimEnd();
}

export function makeAlignedCodonFasta(records, alignment, lineWidth = 60) {
  return [
    formatFastaRecord(`${records[0].title} codon aligned`, alignment.codonAlignmentA.join(""), lineWidth),
    formatFastaRecord(`${records[1].title} codon aligned`, alignment.codonAlignmentB.join(""), lineWidth)
  ].join("\n");
}

export function makeAlignedProteinFromCodonsFasta(records, alignment, lineWidth = 60) {
  return [
    formatFastaRecord(`${records[0].title} translated aligned`, alignment.proteinAlignmentA, lineWidth),
    formatFastaRecord(`${records[1].title} translated aligned`, alignment.proteinAlignmentB, lineWidth)
  ].join("\n");
}

export function makeCodonAlignmentTsv(alignment) {
  const headers = codonAlignmentTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...alignment.codonColumns.map((row) => headers.map((header) => String(row[header] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function makeColoredAlignmentSvg(records, alignment, lineWidth = 60) {
  const legend =
    alignment.alphabet === "protein"
      ? "Green exact match; blue positive-scoring substitution; red zero/negative-scoring substitution; gray gap."
      : "Green exact match; blue ambiguous overlap; red mismatch; gray gap.";
  return makeAlignmentSvg({
    title: `${records[0].title} vs ${records[1].title}`,
    note: "Coordinates count bases or amino acids and ignore gaps.",
    rows: [
      { label: records[0].title, aligned: alignment.alignmentA, start: alignment.startA },
      { label: records[1].title, aligned: alignment.alignmentB, start: alignment.startB }
    ],
    columnRelations: alignment.columns.map((column) => column.relation),
    lineWidth,
    legend,
    summary: `Score ${alignment.score}; identity ${alignment.identityPercent.toFixed(2)}%.`,
    ariaLabel: "Colored pairwise alignment"
  });
}

export function makeColoredCodonAlignmentSvg(records, alignment, lineWidth = 20) {
  const columnRelations = alignment.codonColumns.flatMap((column) => [column.relation, column.relation, column.relation]);
  return makeAlignmentSvg({
    title: `${records[0].title} vs ${records[1].title}`,
    note: "Coordinates count nucleotides and ignore gaps; codon triplets are colored by the translated amino-acid alignment relation.",
    rows: [
      { label: records[0].title, aligned: alignment.codonAlignmentA.join(""), start: alignment.nucleotideStartA },
      { label: records[1].title, aligned: alignment.codonAlignmentB.join(""), start: alignment.nucleotideStartB }
    ],
    columnRelations,
    lineWidth: Math.max(30, Math.min(180, (Number.parseInt(lineWidth, 10) || 20) * 3)),
    legend: "Green exact amino-acid match; blue positive-scoring substitution; red zero/negative-scoring substitution; gray codon gap.",
    summary: `Score ${alignment.score}; amino acid identity ${alignment.identityPercent.toFixed(2)}%.`,
    ariaLabel: "Colored pairwise coding DNA alignment"
  });
}
