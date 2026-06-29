import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { alignMultipleSequences, MULTIPLE_ALIGNMENT_ENGINES } from "./multiple-sequence-alignment.js";
import { cleanProteinSequence } from "./sequence.js";
import {
  PROTEIN_RESIDUE_3_TO_1,
  summarizeProteinStructure
} from "./protein-structure.js";

export const proteinStructureConservationColumns = [
  { id: "chain", label: "Chain", type: "string" },
  { id: "residue_number", label: "Residue number", type: "number" },
  { id: "insertion_code", label: "Insertion code", type: "string" },
  { id: "residue_name", label: "Residue", type: "string" },
  { id: "structure_residue", label: "Structure residue", type: "string" },
  { id: "alignment_position", label: "Alignment position", type: "number" },
  { id: "alignment_residue", label: "Alignment residue", type: "string" },
  { id: "consensus_residue", label: "Consensus residue", type: "string" },
  { id: "conservation_score", label: "Conservation score", type: "number" },
  { id: "residue_count", label: "Residue count", type: "number" },
  { id: "gap_count", label: "Gap count", type: "number" },
  { id: "mapped", label: "Mapped", type: "boolean" },
  { id: "mismatch", label: "Structure/alignment mismatch", type: "boolean" },
  { id: "color", label: "Color", type: "string" }
];

export const proteinStructureConservationLegend = [
  { label: "Highly conserved", range: "1.00", color: "#2563eb" },
  { label: "Conserved", range: "0.80-0.99", color: "#16a34a" },
  { label: "Variable", range: "0.00-0.79", color: "#f59e0b" },
  { label: "Unmapped", range: "no alignment residue", color: "#94a3b8" }
];

const CONSERVATION_COLORS = {
  highlyConserved: proteinStructureConservationLegend[0].color,
  conserved: proteinStructureConservationLegend[1].color,
  variable: proteinStructureConservationLegend[2].color,
  unmapped: proteinStructureConservationLegend[3].color
};

const AMBIGUOUS_OR_UNKNOWN = new Set(["B", "J", "O", "U", "X", "Z", "*"]);
const EQUIVALENT_CHAIN_MIN_IDENTITY = 0.98;
const EQUIVALENT_CHAIN_MIN_COVERAGE = 0.95;
const EQUIVALENT_CHAIN_MISSING_RESIDUE_TOLERANCE = 3;
const FULL_PAIRWISE_ALIGNMENT_CELL_LIMIT = 4_000_000;

function splitStructureAndAlignment(input, separator = "---") {
  const text = String(input ?? "").replace(/\r\n?/g, "\n");
  const escaped = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`\\n${escaped}\\n`));
  if (parts.length < 2) {
    throw new Error(`Provide a protein structure file, then a line containing ${separator}, then protein FASTA records.`);
  }
  return {
    structureText: parts.shift(),
    alignmentText: parts.join(`\n${separator}\n`)
  };
}

function normalizeChainId(chainId) {
  const text = String(chainId ?? "").trim();
  return text && text.toLowerCase() !== "auto" ? text : "auto";
}

function residueOneLetter(row) {
  return PROTEIN_RESIDUE_3_TO_1[String(row.residue_name ?? "").toUpperCase()] ?? "";
}

function selectableStructureResidues(summary, requestedChainId) {
  const chainCounts = new Map();
  const proteinResidues = summary.residueRows
    .filter((row) => !row.hetero && residueOneLetter(row))
    .map((row) => ({ ...row, structure_residue: residueOneLetter(row) }));
  for (const row of proteinResidues) {
    chainCounts.set(row.chain, (chainCounts.get(row.chain) ?? 0) + 1);
  }
  if (proteinResidues.length === 0) {
    throw new Error("No standard protein residues were found in the selected structure.");
  }
  const proteinChains = Array.from(chainCounts.keys()).sort().map((proteinChainId) => {
    const residues = proteinResidues.filter((row) => row.chain === proteinChainId);
    return {
      chainId: proteinChainId,
      residues,
      sequence: residues.map((row) => row.structure_residue).join("")
    };
  });
  const requested = normalizeChainId(requestedChainId);
  const chainId = requested === "auto"
    ? Array.from(chainCounts.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0]
    : requested;
  const residues = proteinResidues.filter((row) => row.chain === chainId);
  if (residues.length === 0) {
    throw new Error(`No standard protein residues were found for chain ${chainId}. Available protein chains: ${Array.from(chainCounts.keys()).join(", ") || "none"}.`);
  }
  return {
    chainId,
    residues,
    sequence: residues.map((row) => row.structure_residue).join(""),
    availableChains: Array.from(chainCounts.keys()).sort(),
    proteinChains
  };
}

function normalizeAlignment(input) {
  const parsed = parseSequenceInput(input, "alignment_sequence");
  const warnings = [];
  const records = parsed.map((record, index) => {
    const cleaned = cleanProteinSequence(record.sequence, { keepGaps: true, preserveCase: false });
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title || `Alignment sequence ${index + 1}`}: removed ${cleaned.removedCount.toLocaleString()} non-protein character(s).`);
    }
    return {
      title: record.title || `alignment_sequence_${index + 1}`,
      sequence: cleaned.sequence.replace(/\./g, "-")
    };
  }).filter((record) => record.sequence.length > 0);
  if (records.length === 0) {
    throw new Error("No protein alignment records were found after cleaning.");
  }
  const length = records[0].sequence.length;
  const uneven = records.find((record) => record.sequence.length !== length);
  if (uneven) {
    throw new Error("Protein Conservation Structure Viewer expects aligned FASTA records with the same aligned length. Run Multiple Align Protein first, or provide an existing aligned FASTA alignment.");
  }
  if (records.length < 2) {
    warnings.push("Only one alignment sequence was provided, so conservation scores will all be 1.00 where residues are mapped.");
  }
  return { records, alignmentLength: length, warnings };
}

function ungapped(sequence) {
  return String(sequence ?? "").replace(/[-.]/g, "");
}

function residuesCompatible(a, b) {
  if (!a || !b) return false;
  return a === b || a === "X" || b === "X";
}

function makeAlignmentStats(mapping, anchorLength, candidateLength, matches, mismatches) {
  const mappedPairs = mapping.size;
  const anchorMappedCount = new Set(mapping.values()).size;
  const identity = mappedPairs > 0 ? matches / mappedPairs : 0;
  return {
    mapping,
    matches,
    mismatches,
    mappedPairs,
    anchorMappedCount,
    anchorMissing: Math.max(0, anchorLength - anchorMappedCount),
    candidateMissing: Math.max(0, candidateLength - mappedPairs),
    identity,
    anchorCoverage: anchorLength > 0 ? anchorMappedCount / anchorLength : 0,
    candidateCoverage: candidateLength > 0 ? mappedPairs / candidateLength : 0
  };
}

function makeOffsetAlignmentStats(anchor, candidate, offset) {
  const mapping = new Map();
  let matches = 0;
  let mismatches = 0;
  for (let candidateIndex = 0; candidateIndex < candidate.length; candidateIndex += 1) {
    const anchorIndex = offset + candidateIndex;
    if (anchorIndex < 0 || anchorIndex >= anchor.length) {
      continue;
    }
    mapping.set(candidateIndex, anchorIndex);
    if (residuesCompatible(anchor[anchorIndex], candidate[candidateIndex])) {
      matches += 1;
    } else {
      mismatches += 1;
    }
  }
  return makeAlignmentStats(mapping, anchor.length, candidate.length, matches, mismatches);
}

function makeFullPairwiseResidueMap(anchor, candidate) {
  const n = anchor.length;
  const m = candidate.length;
  const width = m + 1;
  const size = (n + 1) * (m + 1);
  const scores = new Int32Array(size);
  const trace = new Uint8Array(size);
  const gap = -2;
  const scoreAt = (i, j) => i * width + j;

  for (let i = 1; i <= n; i += 1) {
    scores[scoreAt(i, 0)] = i * gap;
    trace[scoreAt(i, 0)] = 2;
  }
  for (let j = 1; j <= m; j += 1) {
    scores[scoreAt(0, j)] = j * gap;
    trace[scoreAt(0, j)] = 3;
  }

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const diagonal = scores[scoreAt(i - 1, j - 1)] +
        (residuesCompatible(anchor[i - 1], candidate[j - 1]) ? 3 : -3);
      const up = scores[scoreAt(i - 1, j)] + gap;
      const left = scores[scoreAt(i, j - 1)] + gap;
      if (diagonal >= up && diagonal >= left) {
        scores[scoreAt(i, j)] = diagonal;
        trace[scoreAt(i, j)] = 1;
      } else if (up >= left) {
        scores[scoreAt(i, j)] = up;
        trace[scoreAt(i, j)] = 2;
      } else {
        scores[scoreAt(i, j)] = left;
        trace[scoreAt(i, j)] = 3;
      }
    }
  }

  const mapping = new Map();
  let matches = 0;
  let mismatches = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const direction = trace[scoreAt(i, j)];
    if (direction === 1 && i > 0 && j > 0) {
      const anchorIndex = i - 1;
      const candidateIndex = j - 1;
      mapping.set(candidateIndex, anchorIndex);
      if (residuesCompatible(anchor[anchorIndex], candidate[candidateIndex])) {
        matches += 1;
      } else {
        mismatches += 1;
      }
      i -= 1;
      j -= 1;
    } else if ((direction === 2 && i > 0) || j === 0) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return makeAlignmentStats(mapping, n, m, matches, mismatches);
}

function makeGreedyResidueMap(anchor, candidate) {
  const mapping = new Map();
  let matches = 0;
  let mismatches = 0;
  let anchorIndex = 0;
  let candidateIndex = 0;
  const lookahead = 16;

  while (anchorIndex < anchor.length && candidateIndex < candidate.length) {
    if (residuesCompatible(anchor[anchorIndex], candidate[candidateIndex])) {
      mapping.set(candidateIndex, anchorIndex);
      matches += 1;
      anchorIndex += 1;
      candidateIndex += 1;
      continue;
    }

    let skippedAnchor = 0;
    for (let offset = 1; offset <= lookahead && anchorIndex + offset < anchor.length; offset += 1) {
      if (residuesCompatible(anchor[anchorIndex + offset], candidate[candidateIndex])) {
        skippedAnchor = offset;
        break;
      }
    }
    let skippedCandidate = 0;
    for (let offset = 1; offset <= lookahead && candidateIndex + offset < candidate.length; offset += 1) {
      if (residuesCompatible(anchor[anchorIndex], candidate[candidateIndex + offset])) {
        skippedCandidate = offset;
        break;
      }
    }

    if (skippedAnchor && (!skippedCandidate || skippedAnchor <= skippedCandidate)) {
      anchorIndex += skippedAnchor;
      continue;
    }
    if (skippedCandidate) {
      candidateIndex += skippedCandidate;
      continue;
    }

    mapping.set(candidateIndex, anchorIndex);
    mismatches += 1;
    anchorIndex += 1;
    candidateIndex += 1;
  }

  return makeAlignmentStats(mapping, anchor.length, candidate.length, matches, mismatches);
}

function alignResidueSequenceToAnchor(anchorSequence, candidateSequence) {
  const anchor = ungapped(anchorSequence);
  const candidate = ungapped(candidateSequence);
  if (!anchor || !candidate) {
    return makeAlignmentStats(new Map(), anchor.length, candidate.length, 0, 0);
  }
  if (anchor === candidate) {
    return makeOffsetAlignmentStats(anchor, candidate, 0);
  }
  const candidateOffsetInAnchor = anchor.indexOf(candidate);
  if (candidateOffsetInAnchor >= 0) {
    return makeOffsetAlignmentStats(anchor, candidate, candidateOffsetInAnchor);
  }
  const anchorOffsetInCandidate = candidate.indexOf(anchor);
  if (anchorOffsetInCandidate >= 0) {
    return makeOffsetAlignmentStats(anchor, candidate, -anchorOffsetInCandidate);
  }
  if (anchor.length * candidate.length <= FULL_PAIRWISE_ALIGNMENT_CELL_LIMIT) {
    return makeFullPairwiseResidueMap(anchor, candidate);
  }
  return makeGreedyResidueMap(anchor, candidate);
}

function sequenceMatchScore(structureSequence, candidateSequence) {
  const mapped = alignResidueSequenceToAnchor(structureSequence, candidateSequence);
  return mapped.identity * Math.min(mapped.anchorCoverage, mapped.candidateCoverage);
}

function chooseAlignmentRecord(records, structureSequence, requestedTitle) {
  const requested = String(requestedTitle ?? "").trim();
  if (requested && requested.toLowerCase() !== "auto") {
    const lower = requested.toLowerCase();
    const exact = records.findIndex((record) => record.title.toLowerCase() === lower);
    const partial = records.findIndex((record) => record.title.toLowerCase().includes(lower));
    const index = exact >= 0 ? exact : partial;
    if (index < 0) {
      throw new Error(`Could not find an alignment row matching "${requested}".`);
    }
    return {
      index,
      record: records[index],
      identity: sequenceMatchScore(structureSequence, records[index].sequence),
      requested: true
    };
  }
  let bestIndex = 0;
  let bestScore = -1;
  records.forEach((record, index) => {
    const score = sequenceMatchScore(structureSequence, record.sequence);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return {
    index: bestIndex,
    record: records[bestIndex],
    identity: bestScore,
    requested: false
  };
}

function conservationColor(score, mapped = true) {
  if (!mapped || !Number.isFinite(score)) return CONSERVATION_COLORS.unmapped;
  if (score >= 0.9999) return CONSERVATION_COLORS.highlyConserved;
  if (score >= 0.8) return CONSERVATION_COLORS.conserved;
  return CONSERVATION_COLORS.variable;
}

function scoreAlignmentColumns(records, alignmentLength) {
  const columns = [];
  for (let columnIndex = 0; columnIndex < alignmentLength; columnIndex += 1) {
    const counts = new Map();
    let gapCount = 0;
    for (const record of records) {
      const symbol = record.sequence[columnIndex] ?? "-";
      if (symbol === "-" || symbol === ".") {
        gapCount += 1;
      } else {
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      }
    }
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const residueCount = entries.reduce((sum, [, count]) => sum + count, 0);
    const [consensusResidue = "", consensusCount = 0] = entries[0] ?? [];
    columns.push({
      alignment_position: columnIndex + 1,
      consensus_residue: consensusResidue,
      residue_count: residueCount,
      gap_count: gapCount,
      conservation_score: residueCount > 0 ? consensusCount / residueCount : 0
    });
  }
  return columns;
}

function residueId(row) {
  return `${row.chain}|${row.residue_number}|${row.insertion_code ?? ""}`;
}

function residueMismatch(structureResidue, alignmentResidue) {
  if (!structureResidue || !alignmentResidue || alignmentResidue === "-") return false;
  if (structureResidue === alignmentResidue) return false;
  return !(AMBIGUOUS_OR_UNKNOWN.has(structureResidue) || AMBIGUOUS_OR_UNKNOWN.has(alignmentResidue));
}

function makeAnchorAlignmentMap(alignmentRecord) {
  const rowByAnchorResidueIndex = new Map();
  let residueIndex = 0;
  for (let columnIndex = 0; columnIndex < alignmentRecord.sequence.length; columnIndex += 1) {
    const symbol = alignmentRecord.sequence[columnIndex] ?? "-";
    if (symbol === "-" || symbol === ".") {
      continue;
    }
    rowByAnchorResidueIndex.set(residueIndex, { columnIndex, alignmentResidue: symbol });
    residueIndex += 1;
  }
  return { rowByAnchorResidueIndex, alignmentResidueCount: residueIndex };
}

function makeStructureConservationRow(residue, mapped, columnScores) {
  if (!mapped) {
    return {
      chain: residue.chain,
      residue_number: residue.residue_number,
      insertion_code: residue.insertion_code,
      residue_name: residue.residue_name,
      structure_residue: residue.structure_residue,
      alignment_position: "",
      alignment_residue: "",
      consensus_residue: "",
      conservation_score: "",
      residue_count: "",
      gap_count: "",
      mapped: false,
      mismatch: false,
      color: conservationColor(Number.NaN, false),
      residue_id: residueId(residue)
    };
  }
  const column = columnScores[mapped.columnIndex];
  const mismatch = residueMismatch(residue.structure_residue, mapped.alignmentResidue);
  const score = Number(column.conservation_score.toFixed(4));
  return {
    chain: residue.chain,
    residue_number: residue.residue_number,
    insertion_code: residue.insertion_code,
    residue_name: residue.residue_name,
    structure_residue: residue.structure_residue,
    alignment_position: mapped.columnIndex + 1,
    alignment_residue: mapped.alignmentResidue,
    consensus_residue: column.consensus_residue,
    conservation_score: score,
    residue_count: column.residue_count,
    gap_count: column.gap_count,
    mapped: true,
    mismatch,
    color: conservationColor(score, true),
    residue_id: residueId(residue)
  };
}

function chainIsEquivalentToAnchor(alignmentStats) {
  if (alignmentStats.identity < EQUIVALENT_CHAIN_MIN_IDENTITY) {
    return false;
  }
  const anchorCovered = alignmentStats.anchorCoverage >= EQUIVALENT_CHAIN_MIN_COVERAGE ||
    alignmentStats.anchorMissing <= EQUIVALENT_CHAIN_MISSING_RESIDUE_TOLERANCE;
  const candidateCovered = alignmentStats.candidateCoverage >= EQUIVALENT_CHAIN_MIN_COVERAGE ||
    alignmentStats.candidateMissing <= EQUIVALENT_CHAIN_MISSING_RESIDUE_TOLERANCE;
  return anchorCovered && candidateCovered;
}

function mapEquivalentStructureChains(chain, alignmentRecord, columnScores) {
  const { rowByAnchorResidueIndex, alignmentResidueCount } = makeAnchorAlignmentMap(alignmentRecord);
  const proteinChains = Array.isArray(chain.proteinChains) && chain.proteinChains.length > 0
    ? chain.proteinChains
    : [{ chainId: chain.chainId, residues: chain.residues, sequence: chain.sequence }];
  const rows = [];
  const mappedChains = [];

  for (const proteinChain of proteinChains) {
    const isAnchor = proteinChain.chainId === chain.chainId;
    const alignmentStats = isAnchor
      ? makeOffsetAlignmentStats(chain.sequence, proteinChain.sequence, 0)
      : alignResidueSequenceToAnchor(chain.sequence, proteinChain.sequence);
    if (!isAnchor && !chainIsEquivalentToAnchor(alignmentStats)) {
      continue;
    }

    const chainRows = proteinChain.residues.map((residue, residueIndex) => {
      const anchorResidueIndex = alignmentStats.mapping.get(residueIndex);
      const mapped = Number.isInteger(anchorResidueIndex)
        ? rowByAnchorResidueIndex.get(anchorResidueIndex)
        : null;
      return makeStructureConservationRow(residue, mapped, columnScores);
    });
    const mappedResidues = chainRows.filter((row) => row.mapped).length;
    const unmappedResidues = chainRows.length - mappedResidues;
    const mismatchCount = chainRows.filter((row) => row.mismatch).length;
    rows.push(...chainRows);
    mappedChains.push({
      chainId: proteinChain.chainId,
      anchor: isAnchor,
      residueCount: proteinChain.residues.length,
      mappedResidues,
      unmappedResidues,
      mismatchCount,
      identity: Number(alignmentStats.identity.toFixed(4)),
      anchorCoverage: Number(alignmentStats.anchorCoverage.toFixed(4)),
      candidateCoverage: Number(alignmentStats.candidateCoverage.toFixed(4)),
      anchorMissing: alignmentStats.anchorMissing,
      candidateMissing: alignmentStats.candidateMissing
    });
  }

  return {
    rows,
    mappedChains,
    equivalentChains: mappedChains.map((item) => item.chainId),
    mappedResidues: rows.filter((row) => row.mapped).length,
    unmappedResidues: rows.filter((row) => !row.mapped).length,
    mismatchCount: rows.filter((row) => row.mismatch).length,
    alignmentResidueCount,
    structureResidueCount: chain.sequence.length
  };
}

function summarizeConservationStructure(structureText, options = {}) {
  return summarizeProteinStructure(structureText, {
    format: options.format ?? "auto",
    modelSelection: options.modelSelection ?? "all",
    altLocationPolicy: options.altLocationPolicy ?? "preferred"
  });
}

function addMappingWarnings(warnings, selected, chain, mapped) {
  if (selected.identity < 0.9) {
    warnings.push(`The selected alignment row matches ${Math.round(selected.identity * 100)}% of chain ${chain.chainId}; verify that the correct chain and alignment row were chosen.`);
  }
  if (mapped.alignmentResidueCount < mapped.structureResidueCount) {
    warnings.push(`The selected alignment row has fewer residues (${mapped.alignmentResidueCount.toLocaleString()}) than chain ${chain.chainId} (${mapped.structureResidueCount.toLocaleString()}); trailing structure residues are unmapped.`);
  } else if (mapped.alignmentResidueCount > mapped.structureResidueCount) {
    warnings.push(`The selected alignment row has extra residues (${mapped.alignmentResidueCount.toLocaleString()}) beyond chain ${chain.chainId} (${mapped.structureResidueCount.toLocaleString()}); extra alignment residues are ignored for structure coloring.`);
  }
  if (mapped.mismatchCount > 0) {
    warnings.push(`${mapped.mismatchCount.toLocaleString()} mapped residue(s) differ between a colored structure chain and the selected alignment row.`);
  }
}

function buildConservationResult({
  structureText,
  structureSummary,
  chain,
  alignment,
  selected,
  warnings,
  alignmentInputMode = "aligned",
  alignmentEngine = "",
  alignmentEngineVersion = "",
  comparisonSequenceCount = null
}) {
  const columnScores = scoreAlignmentColumns(alignment.records, alignment.alignmentLength);
  const mapped = mapEquivalentStructureChains(chain, selected.record, columnScores);
  const allWarnings = [...warnings];
  addMappingWarnings(allWarnings, selected, chain, mapped);
  const residueColors = Object.fromEntries(mapped.rows.map((row) => [row.residue_id, {
    color: row.color,
    score: row.conservation_score,
    consensusResidue: row.consensus_residue,
    alignmentPosition: row.alignment_position,
    mapped: row.mapped,
    mismatch: row.mismatch
  }]));
  return {
    structureText,
    structureSummary,
    chainId: chain.chainId,
    availableChains: chain.availableChains,
    structureSequence: chain.sequence,
    selectedAlignmentTitle: selected.record.title,
    selectedAlignmentIndex: selected.index,
    selectedAlignmentIdentity: selected.identity,
    alignmentSequenceCount: alignment.records.length,
    alignmentLength: alignment.alignmentLength,
    alignmentInputMode,
    alignmentEngine,
    alignmentEngineVersion,
    comparisonSequenceCount: Number.isFinite(comparisonSequenceCount) ? comparisonSequenceCount : alignment.records.length,
    conservationRows: mapped.rows,
    mappedChains: mapped.mappedChains,
    equivalentChains: mapped.equivalentChains,
    residueColors,
    legend: proteinStructureConservationLegend,
    mappedResidues: mapped.mappedResidues,
    unmappedResidues: mapped.unmappedResidues,
    mismatchCount: mapped.mismatchCount,
    warnings: allWarnings
  };
}

function normalizeUnalignedProteinRecords(input) {
  const parsed = parseSequenceInput(input, "comparison_protein");
  const warnings = [];
  const records = parsed.map((record, index) => {
    const cleaned = cleanProteinSequence(record.sequence, { keepGaps: false, preserveCase: false });
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title || `Comparison protein ${index + 1}`}: removed ${cleaned.removedCount.toLocaleString()} non-protein or gap character(s).`);
    }
    return {
      title: record.title || `comparison_protein_${index + 1}`,
      sequence: cleaned.sequence
    };
  }).filter((record) => record.sequence.length > 0);
  if (records.length === 0) {
    throw new Error("No comparison protein FASTA records were found after cleaning.");
  }
  return { records, warnings };
}

function makeUniqueTitle(title, used) {
  const base = String(title ?? "").trim() || "protein";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  let unique = `${base}_${suffix}`;
  while (used.has(unique)) {
    suffix += 1;
    unique = `${base}_${suffix}`;
  }
  used.add(unique);
  return unique;
}

function makeAlignmentRecordsFromMsa(msaAlignment) {
  const titles = msaAlignment?.titles ?? [];
  const aligned = msaAlignment?.aligned ?? [];
  const records = titles.map((title, index) => ({
    title,
    sequence: aligned[index] ?? ""
  })).filter((record) => record.sequence.length > 0);
  if (records.length === 0 || !Number.isFinite(msaAlignment?.alignmentLength)) {
    throw new Error("Multiple alignment did not produce aligned protein records.");
  }
  return {
    records,
    alignmentLength: msaAlignment.alignmentLength,
    warnings: []
  };
}

export function prepareProteinConservationStructure(input, options = {}) {
  const { structureText, alignmentText } = splitStructureAndAlignment(input, options.separator ?? "---");
  const structureSummary = summarizeConservationStructure(structureText, options);
  const chain = selectableStructureResidues(structureSummary, options.chainId);
  const alignment = normalizeAlignment(alignmentText);
  const selected = chooseAlignmentRecord(alignment.records, chain.sequence, options.alignmentRow);
  return buildConservationResult({
    structureText,
    structureSummary,
    chain,
    alignment,
    selected,
    warnings: alignment.warnings,
    alignmentInputMode: "aligned",
    comparisonSequenceCount: alignment.records.length
  });
}

export async function prepareProteinConservationStructureForRun(input, options = {}, context = {}) {
  if (options.alignmentInputMode === "aligned") {
    return prepareProteinConservationStructure(input, options);
  }

  const { structureText, alignmentText } = splitStructureAndAlignment(input, options.separator ?? "---");
  const structureSummary = summarizeConservationStructure(structureText, options);
  const chain = selectableStructureResidues(structureSummary, options.chainId);
  const comparison = normalizeUnalignedProteinRecords(alignmentText);
  const usedTitles = new Set();
  const structureTitle = makeUniqueTitle(`structure_chain_${chain.chainId}`, usedTitles);
  const alignmentInput = [
    formatFastaRecord(structureTitle, chain.sequence, 80),
    ...comparison.records.map((record) =>
      formatFastaRecord(makeUniqueTitle(record.title, usedTitles), record.sequence, 80)
    )
  ].join("\n");
  context.reportProgress?.({ phase: "aligning-proteins", progress: 0.28 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const alignmentResult = await alignMultipleSequences(alignmentInput, {
    alphabet: "protein",
    alignmentEngine: options.alignmentEngine === MULTIPLE_ALIGNMENT_ENGINES.sms3
      ? MULTIPLE_ALIGNMENT_ENGINES.sms3
      : MULTIPLE_ALIGNMENT_ENGINES.muscle,
    gapOpen: options.gapOpen,
    gapExtend: options.gapExtend,
    similarScore: options.similarScore,
    maxSequences: options.maxSequences,
    maxTotalSymbols: options.maxTotalSymbols,
    maxAlignmentCells: options.maxAlignmentCells
  }, context);
  if (!alignmentResult.alignment) {
    throw new Error("Could not build a protein multiple alignment from the structure chain and comparison sequences.");
  }
  const alignment = makeAlignmentRecordsFromMsa(alignmentResult.alignment);
  const structureRowIndex = alignment.records.findIndex((record) => record.title === structureTitle);
  if (structureRowIndex < 0) {
    throw new Error("The generated alignment did not retain the required structure-chain row.");
  }
  const selected = {
    index: structureRowIndex,
    record: alignment.records[structureRowIndex],
    identity: sequenceMatchScore(chain.sequence, alignment.records[structureRowIndex].sequence),
    requested: false,
    forced: true
  };
  return buildConservationResult({
    structureText,
    structureSummary,
    chain,
    alignment,
    selected,
    warnings: [...comparison.warnings, ...alignmentResult.warnings, ...alignment.warnings],
    alignmentInputMode: "unaligned",
    alignmentEngine: alignmentResult.alignment.engine ?? alignmentResult.options?.alignmentEngine ?? "",
    alignmentEngineVersion: alignmentResult.alignment.engineVersion ?? "",
    comparisonSequenceCount: comparison.records.length
  });
}

function formatMappedChainSummary(mappedChains = []) {
  if (!mappedChains.length) return "none";
  return mappedChains.map((chain) => {
    const details = [
      ...(chain.anchor ? ["anchor"] : []),
      ...(Number.isFinite(chain.anchorCoverage) ? [`${(chain.anchorCoverage * 100).toFixed(1)}% anchor coverage`] : [])
    ];
    const detailText = details.length ? ` (${details.join(", ")})` : "";
    return `${chain.chainId} ${Number(chain.mappedResidues ?? 0).toLocaleString()}/${Number(chain.residueCount ?? 0).toLocaleString()}${detailText}`;
  }).join("; ");
}

export function makeProteinConservationStructureReport(result) {
  const alignmentMode = result.alignmentInputMode === "unaligned"
    ? "Structure chain plus comparison FASTA aligned by SMS3"
    : "Supplied aligned protein FASTA";
  const engineText = result.alignmentEngine
    ? `${result.alignmentEngine}${result.alignmentEngineVersion ? ` ${result.alignmentEngineVersion}` : ""}`
    : "";
  const lines = [
    "Protein Conservation Structure Viewer",
    "",
    `Structure title: ${result.structureSummary.title}`,
    `Structure format: ${result.structureSummary.format === "mmcif" ? "mmCIF" : "PDB"}`,
    ...(result.structureSummary.modelCount > 0
      ? [`Structure model: ${result.structureSummary.selectedModel === "all" ? "all models" : result.structureSummary.selectedModel}`]
      : []),
    `Alternate-location policy: ${result.structureSummary.altLocationPolicy ?? "preferred"}${result.structureSummary.omittedAlternateLocationAtomCount ? ` (${result.structureSummary.omittedAlternateLocationAtomCount.toLocaleString()} alternate atom record(s) omitted)` : ""}`,
    `Anchor chain: ${result.chainId}`,
    `Available protein chains: ${result.availableChains.join(", ") || "none"}`,
    `Equivalent chains colored: ${(result.equivalentChains ?? [result.chainId]).join(", ")}`,
    `Mapped chain residues: ${formatMappedChainSummary(result.mappedChains)}`,
    `Anchor chain sequence: ${result.structureSequence.length.toLocaleString()} residues`,
    `Alignment source: ${alignmentMode}`,
    ...(engineText ? [`Alignment engine: ${engineText}`] : []),
    `Alignment row mapped to anchor chain: ${result.selectedAlignmentTitle}`,
    `Structure/alignment row identity: ${(result.selectedAlignmentIdentity * 100).toFixed(1)}%`,
    `Comparison sequences: ${(result.comparisonSequenceCount ?? result.alignmentSequenceCount).toLocaleString()}`,
    `Alignment sequences: ${result.alignmentSequenceCount.toLocaleString()}`,
    `Alignment length: ${result.alignmentLength.toLocaleString()} columns`,
    `Mapped residues: ${result.mappedResidues.toLocaleString()} of ${result.conservationRows.length.toLocaleString()}`,
    `Unmapped residues: ${result.unmappedResidues.toLocaleString()}`,
    `Structure/alignment mismatches: ${result.mismatchCount.toLocaleString()}`,
    "",
    "Scoring:",
    "Each mapped structure residue receives the frequency of the most common non-gap residue in its alignment column. Gaps are reported but excluded from the denominator.",
    "Default coloring uses a colored conservation scale: identical columns are blue, columns with at least 80% consensus are green, lower-consensus columns are orange, and unmapped residues are gray.",
    "",
    "Method reference:",
    "Stothard PM. COMBOSA3D: combining sequence alignments with three-dimensional structures. Bioinformatics. 2001;17(2):198-199. doi:10.1093/bioinformatics/17.2.198."
  ];
  return `${lines.join("\n")}\n`;
}
