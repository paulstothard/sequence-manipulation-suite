import { parseSequenceInput } from "./fasta.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";
import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import { escapeXml } from "./plot-renderer.js";

const MINIMAP2_VERSION = "2.22";
const DEFAULT_SEED_SIZE = 14;
const DEFAULT_MIN_BLOCK_LENGTH = 40;
const DEFAULT_MAX_BLOCKS = 5000;
export const MAX_GENOME_COMPARISON_POSTER_COMPARISONS = 10;
const SPLIT_SEPARATOR = "---";
const MINIMAP2_PRESETS = new Set(["none", "asm5", "asm10", "asm20"]);
const MINIMAP2_BLOCK_STYLES = new Set(["standard", "fragmented"]);
const SORT_ORDERS = new Set(["divergence", "similarity", "input"]);
const COLOR_MODES = new Set(["adaptive", "fixed"]);
const LOOM_COLOR_MODES = new Set(["reference", "identity"]);
const DEFAULT_COLOR_SCHEME = "magma-ocean";

let minimap2CliPromise = null;
let runCounter = 0;

export const genomeComparisonBlockColumns = [
  { id: "comparison", label: "Comparison genome" },
  { id: "reference", label: "Reference sequence" },
  { id: "reference_start", label: "Reference start" },
  { id: "reference_end", label: "Reference end" },
  { id: "comparison_sequence", label: "Comparison sequence" },
  { id: "comparison_start", label: "Comparison start" },
  { id: "comparison_end", label: "Comparison end" },
  { id: "strand", label: "Strand" },
  { id: "identity_percent", label: "Identity %" },
  { id: "block_length", label: "Block length" },
  { id: "matching_bases", label: "Matching bases" },
  { id: "mapq", label: "MAPQ" },
  { id: "engine", label: "Alignment method" }
];

export const genomeComparisonSummaryColumns = [
  { id: "comparison", label: "Comparison genome" },
  { id: "comparison_length", label: "Comparison length" },
  { id: "block_count", label: "Alignment blocks" },
  { id: "aligned_reference_bp", label: "Aligned reference bp" },
  { id: "reference_coverage_percent", label: "Reference coverage %" },
  { id: "aligned_comparison_bp", label: "Aligned comparison bp" },
  { id: "comparison_coverage_percent", label: "Comparison coverage %" },
  { id: "mean_identity_percent", label: "Mean identity %" }
];

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return "";
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeOptions(options = {}) {
  const seedSize = clamp(Number.parseInt(options.seedSize, 10) || DEFAULT_SEED_SIZE, 6, 200);
  const minBlockLength = clamp(Number.parseInt(options.minBlockLength, 10) || DEFAULT_MIN_BLOCK_LENGTH, seedSize, 1_000_000);
  const minIdentityPercent = clamp(Number.parseFloat(options.minIdentityPercent) || 0, 0, 100);
  const rawMinimap2Preset = String(options.minimap2Preset || "none");
  let rawAlignmentBlockStyle = String(options.alignmentBlockStyle || "standard");
  if (rawAlignmentBlockStyle === "smooth") rawAlignmentBlockStyle = "standard";
  if (rawAlignmentBlockStyle === "textured") rawAlignmentBlockStyle = "fragmented";
  const rawSortOrder = String(options.sortOrder || "divergence");
  const rawColorMode = String(options.colorMode || "adaptive");
  const rawLoomColorMode = String(options.loomColorMode || "reference");
  const rawColorScheme = String(options.colorScheme || DEFAULT_COLOR_SCHEME);
  return {
    alignmentEngine: options.alignmentEngine === "exact" ? "exact" : "minimap2",
    minimap2Preset: MINIMAP2_PRESETS.has(rawMinimap2Preset) ? rawMinimap2Preset : "none",
    alignmentBlockStyle: MINIMAP2_BLOCK_STYLES.has(rawAlignmentBlockStyle) ? rawAlignmentBlockStyle : "standard",
    layout: ["linear", "wrapped", "circular", "spiral", "loom"].includes(options.layout) ? options.layout : "circular",
    sortOrder: SORT_ORDERS.has(rawSortOrder) ? rawSortOrder : "divergence",
    colorMode: COLOR_MODES.has(rawColorMode) ? rawColorMode : "adaptive",
    loomColorMode: LOOM_COLOR_MODES.has(rawLoomColorMode) ? rawLoomColorMode : "reference",
    colorScheme: normalizeColorScheme(rawColorScheme),
    showLegend: options.showLegend === true,
    showAxis: options.showAxis === true,
    showGenomeLabels: options.showGenomeLabels !== false,
    wrappedSections: clamp(Number.parseInt(options.wrappedSections, 10) || 8, 1, 40),
    seedSize,
    minBlockLength,
    minIdentityPercent,
    minMapq: clamp(Number.parseInt(options.minMapq, 10) || 0, 0, 255),
    includeReverseComplement: options.includeReverseComplement !== false,
    maxBlocks: clamp(Number.parseInt(options.maxBlocks, 10) || DEFAULT_MAX_BLOCKS, 1, 1_000_000),
    maxComparisonGenomes: clamp(
      Number.parseInt(options.maxComparisonGenomes, 10) || MAX_GENOME_COMPARISON_POSTER_COMPARISONS,
      1,
      MAX_GENOME_COMPARISON_POSTER_COMPARISONS
    ),
    maxReferenceLength: clamp(Number.parseInt(options.maxReferenceLength, 10) || 15_000_000, 100, 500_000_000),
    maxComparisonLength: clamp(Number.parseInt(options.maxComparisonLength, 10) || 15_000_000, 100, 500_000_000)
  };
}

function splitReferenceAndComparisonSections(input) {
  const text = String(input ?? "").trim();
  if (!text) {
    return { referenceText: "", comparisonSections: [] };
  }
  const pieces = text.split(new RegExp(`\\n\\s*${SPLIT_SEPARATOR}\\s*\\n`, "u"));
  if (pieces.length >= 2) {
    return {
      referenceText: pieces[0].trim(),
      comparisonSections: pieces.slice(1).map((piece) => piece.trim()).filter(Boolean)
    };
  }
  const records = parseSequenceInput(text, "genome");
  if (records.length <= 1) {
    return { referenceText: text, comparisonSections: [] };
  }
  const reference = records[0];
  const comparisons = records.slice(1);
  return {
    referenceText: `>${reference.title}\n${reference.sequence}`,
    comparisonSections: comparisons.map((record) => `>${record.title}\n${record.sequence}`)
  };
}

function cleanRecords(records, warnings, role) {
  const titleCounts = new Map();
  return records.map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    if (cleaned.removedCount > 0) {
      warnings.push(`${role} ${record.title || index + 1}: removed ${cleaned.removedCount.toLocaleString()} non-sequence character(s).`);
    }
    const baseTitle = record.title || `${role}_${index + 1}`;
    const seenCount = titleCounts.get(baseTitle) ?? 0;
    titleCounts.set(baseTitle, seenCount + 1);
    const title = seenCount === 0 ? baseTitle : `${baseTitle} (${seenCount + 1})`;
    if (seenCount > 0) {
      warnings.push(`${role} title "${baseTitle}" appeared more than once; renamed one record to "${title}".`);
    }
    return {
      title,
      sequence: cleaned.sequence.replace(/U/g, "T"),
      hadHeader: record.hadHeader,
      length: cleaned.sequence.replace(/U/g, "T").length
    };
  });
}

function makeUniqueGenomeTitle(title, titleCounts, warnings, role) {
  const baseTitle = String(title || role).trim() || role;
  const seenCount = titleCounts.get(baseTitle) ?? 0;
  titleCounts.set(baseTitle, seenCount + 1);
  const uniqueTitle = seenCount === 0 ? baseTitle : `${baseTitle} (${seenCount + 1})`;
  if (seenCount > 0) {
    warnings.push(`${role} title "${baseTitle}" appeared more than once; renamed one genome to "${uniqueTitle}".`);
  }
  return uniqueTitle;
}

function makeGenomeGroup(records, warnings, role, groupIndex, titleCounts) {
  const cleanedRecords = cleanRecords(records, warnings, `${role} ${groupIndex + 1} record`);
  if (cleanedRecords.length === 0) {
    return null;
  }
  const baseLength = cleanedRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  const title = makeUniqueGenomeTitle(cleanedRecords[0].title || `${role} ${groupIndex + 1}`, titleCounts, warnings, role);
  if (cleanedRecords.length > 1) {
    warnings.push(
      `${role} "${title}" contains ${cleanedRecords.length.toLocaleString()} FASTA records; they were treated as contigs of one genome row.`
    );
  }
  return {
    title,
    sequence: cleanedRecords.map((record) => record.sequence).join(""),
    baseLength,
    recordCount: cleanedRecords.length,
    records: cleanedRecords,
    hadHeader: cleanedRecords.some((record) => record.hadHeader)
  };
}

function genomeBaseLength(genome) {
  return genome?.baseLength ?? genome?.sequence?.length ?? 0;
}

export function parseGenomeComparisonInput(input, options = {}) {
  const normalized = normalizeOptions(options);
  const warnings = [];
  const { referenceText, comparisonSections } = splitReferenceAndComparisonSections(input);
  if (comparisonSections.length > normalized.maxComparisonGenomes) {
    throw new Error(
      `Genome Comparison Poster supports up to ${normalized.maxComparisonGenomes.toLocaleString()} comparison genomes per run. ` +
      `Remove ${(comparisonSections.length - normalized.maxComparisonGenomes).toLocaleString()} comparison genome section(s) or split the comparison into multiple figures.`
    );
  }
  const reference = makeGenomeGroup(
    parseSequenceInput(referenceText, "reference_genome"),
    warnings,
    "Reference genome",
    0,
    new Map()
  );
  const comparisonTitleCounts = new Map();
  const comparisons = comparisonSections
    .map((section, index) => makeGenomeGroup(
      parseSequenceInput(section, `comparison_genome_${index + 1}`),
      warnings,
      "Comparison genome",
      index,
      comparisonTitleCounts
    ))
    .filter(Boolean);

  if (!reference) {
    throw new Error("Genome Comparison Poster requires one reference genome FASTA section.");
  }
  if (comparisons.length === 0) {
    throw new Error("Genome Comparison Poster requires at least one comparison genome FASTA section after the separator.");
  }
  if (genomeBaseLength(reference) > normalized.maxReferenceLength) {
    throw new Error(`Reference length ${genomeBaseLength(reference).toLocaleString()} bp exceeds the current limit of ${normalized.maxReferenceLength.toLocaleString()} bp.`);
  }
  for (const comparison of comparisons) {
    if (genomeBaseLength(comparison) > normalized.maxComparisonLength) {
      throw new Error(`Comparison ${comparison.title} length ${genomeBaseLength(comparison).toLocaleString()} bp exceeds the current limit of ${normalized.maxComparisonLength.toLocaleString()} bp.`);
    }
  }

  return { reference, comparisons, warnings, options: normalized };
}

function nextRunId() {
  runCounter += 1;
  return `sms3_minimap2_${Date.now()}_${runCounter}`;
}

async function getBioWasmMinimap2Cli() {
  if (!minimap2CliPromise) {
    minimap2CliPromise = createBioWasmCli({
      tool: "minimap2",
      program: "minimap2",
      version: MINIMAP2_VERSION,
      assetPath: "../vendor/biowasm/minimap2/2.22"
    }).catch((error) => {
      minimap2CliPromise = null;
      throw error;
    });
  }
  return minimap2CliPromise;
}

function isMinimap2AssetLoadError(error) {
  const message = String(error?.message ?? error ?? "");
  return /network|fetch|load failed|failed to load|failed to fetch|import|wasm|data file/i.test(message);
}

function formatTempFasta(record) {
  const lines = [`>${record.title}`];
  for (let index = 0; index < record.sequence.length; index += 60) {
    lines.push(record.sequence.slice(index, index + 60));
  }
  return `${lines.join("\n")}\n`;
}

function genomeRecordsForAlignment(genome) {
  return Array.isArray(genome.records) && genome.records.length > 0
    ? genome.records
    : [{ title: genome.title, sequence: genome.sequence, length: genome.sequence.length }];
}

function makeSafeAlignmentGenome(genome, genomeId, displayTitle) {
  const safeRecords = [];
  const names = new Map();
  const offsets = new Map();
  const contigs = new Map();
  const genomeLength = genomeBaseLength(genome);
  let offset = 0;

  for (const [index, record] of genomeRecordsForAlignment(genome).entries()) {
    const sequence = record.sequence ?? "";
    const safeTitle = `${genomeId}_contig_${index + 1}`;
    safeRecords.push({ title: safeTitle, sequence });
    names.set(safeTitle, displayTitle);
    offsets.set(safeTitle, offset);
    contigs.set(safeTitle, record.title || `${displayTitle}_contig_${index + 1}`);
    offset += sequence.length;
  }

  return { safeRecords, names, offsets, contigs, genomeLength };
}

function formatTempFastaRecords(records) {
  return records.map(formatTempFasta).join("");
}

function makeMinimap2SafeRecords(reference, comparisons) {
  const safeReference = makeSafeAlignmentGenome(reference, "sms3_reference", reference.title);
  const comparisonEntries = comparisons.map((comparison, index) => ({
    original: comparison,
    safe: makeSafeAlignmentGenome(comparison, `sms3_comparison_${index + 1}`, comparison.title)
  }));
  const comparisonNames = new Map();
  const comparisonOffsets = new Map();
  const comparisonContigs = new Map();
  const comparisonLengths = new Map();
  for (const entry of comparisonEntries) {
    for (const [safeTitle, title] of entry.safe.names) comparisonNames.set(safeTitle, title);
    for (const [safeTitle, offset] of entry.safe.offsets) comparisonOffsets.set(safeTitle, offset);
    for (const [safeTitle, contig] of entry.safe.contigs) comparisonContigs.set(safeTitle, contig);
    for (const safeRecord of entry.safe.safeRecords) {
      comparisonLengths.set(safeRecord.title, entry.safe.genomeLength);
    }
  }
  const referenceLengths = new Map();
  for (const safeRecord of safeReference.safeRecords) {
    referenceLengths.set(safeRecord.title, safeReference.genomeLength);
  }
  return {
    referenceRecords: safeReference.safeRecords,
    comparisonRecords: comparisonEntries.flatMap((entry) => entry.safe.safeRecords),
    nameMaps: {
      referenceNames: safeReference.names,
      referenceOffsets: safeReference.offsets,
      referenceContigs: safeReference.contigs,
      referenceLengths,
      comparisonNames,
      comparisonOffsets,
      comparisonContigs,
      comparisonLengths
    }
  };
}

function minimap2Error(stderr) {
  const message = String(stderr ?? "").trim();
  if (!message) return "";
  if (/error|failed|fail to|could not|not found|no such file|invalid|segmentation/i.test(message)) {
    return `minimap2 reported an error: ${message}`;
  }
  return "";
}

export function buildGenomeComparisonMinimap2Args(options, referencePath, comparisonPath) {
  const normalized = normalizeOptions(options);
  const args = [];
  if (normalized.minimap2Preset !== "none") {
    args.push("-x", normalized.minimap2Preset);
  }
  args.push("-c", "--cs");
  if (normalized.alignmentBlockStyle === "fragmented") {
    args.push("--no-long-join", "-r", "200,1000");
  }
  args.push(referencePath, comparisonPath);
  return args;
}

async function runBioWasmMinimap2(reference, comparisons, options, context = {}) {
  requireBioWasmRuntime("Genome Comparison Poster minimap2 alignment");
  const cli = await getBioWasmMinimap2Cli();
  const safeRecords = makeMinimap2SafeRecords(reference, comparisons);
  const runId = nextRunId();
  const referenceName = `${runId}_reference.fasta`;
  const comparisonName = `${runId}_comparisons.fasta`;
  const referenceFasta = formatTempFastaRecords(safeRecords.referenceRecords);
  const comparisonFasta = formatTempFastaRecords(safeRecords.comparisonRecords);

  let result;
  let args;
  try {
    context.reportProgress?.({ phase: "mounting-minimap2-input", progress: 0.16 });
    const [referencePath, comparisonPath] = await cli.mount([
      { name: referenceName, data: new Blob([referenceFasta], { type: "text/plain" }) },
      { name: comparisonName, data: new Blob([comparisonFasta], { type: "text/plain" }) }
    ]);
    context.throwIfCancelled?.();

    args = buildGenomeComparisonMinimap2Args(options, referencePath, comparisonPath);
    context.reportProgress?.({ phase: "running-minimap2", progress: 0.42 });
    result = await cli.exec("minimap2", args);
    context.throwIfCancelled?.();
    const error = minimap2Error(result?.stderr);
    if (error) {
      throw new Error(error);
    }
  } catch (error) {
    if (isMinimap2AssetLoadError(error)) {
      minimap2CliPromise = null;
    }
    throw error;
  }
  return {
    blocks: parsePafBlocks(String(result?.stdout ?? ""), "minimap2", safeRecords.nameMaps),
    engineMessage: `minimap2 ${MINIMAP2_VERSION}`,
    command: `minimap2 ${args.slice(0, -2).join(" ")} reference.fasta comparisons.fasta`.replace(/\s+/gu, " ").trim()
  };
}

export function parsePafBlocks(pafText, engine = "minimap2", nameMaps = {}) {
  const blocks = [];
  const comparisonNames = nameMaps.comparisonNames ?? new Map();
  const referenceNames = nameMaps.referenceNames ?? new Map();
  const comparisonOffsets = nameMaps.comparisonOffsets ?? new Map();
  const referenceOffsets = nameMaps.referenceOffsets ?? new Map();
  const comparisonContigs = nameMaps.comparisonContigs ?? new Map();
  const referenceContigs = nameMaps.referenceContigs ?? new Map();
  const comparisonLengths = nameMaps.comparisonLengths ?? new Map();
  const referenceLengths = nameMaps.referenceLengths ?? new Map();
  for (const line of String(pafText ?? "").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    if (fields.length < 12) continue;
    const comparisonId = fields[0];
    const comparison = comparisonNames.get(comparisonId) ?? comparisonId;
    const comparisonRecordLength = Number.parseInt(fields[1], 10);
    const comparisonRecordStart = Number.parseInt(fields[2], 10);
    const comparisonRecordEnd = Number.parseInt(fields[3], 10);
    const strand = fields[4] === "-" ? "-" : "+";
    const referenceId = fields[5];
    const reference = referenceNames.get(referenceId) ?? referenceId;
    const referenceRecordLength = Number.parseInt(fields[6], 10);
    const referenceRecordStart = Number.parseInt(fields[7], 10);
    const referenceRecordEnd = Number.parseInt(fields[8], 10);
    const matches = Number.parseInt(fields[9], 10);
    const blockLength = Number.parseInt(fields[10], 10);
    const mapq = Number.parseInt(fields[11], 10);
    if (![comparisonRecordStart, comparisonRecordEnd, referenceRecordStart, referenceRecordEnd, matches, blockLength].every(Number.isFinite)) {
      continue;
    }
    const comparisonOffset = comparisonOffsets.get(comparisonId) ?? 0;
    const referenceOffset = referenceOffsets.get(referenceId) ?? 0;
    blocks.push({
      comparison,
      comparisonSequence: comparison,
      comparisonLength: comparisonLengths.get(comparisonId) ??
        (Number.isFinite(comparisonRecordLength) ? comparisonRecordLength : 0),
      reference,
      referenceLength: referenceLengths.get(referenceId) ??
        (Number.isFinite(referenceRecordLength) ? referenceRecordLength : 0),
      referenceStart: referenceOffset + referenceRecordStart,
      referenceEnd: referenceOffset + referenceRecordEnd,
      comparisonStart: comparisonOffset + comparisonRecordStart,
      comparisonEnd: comparisonOffset + comparisonRecordEnd,
      referenceContig: referenceContigs.get(referenceId) ?? referenceId,
      comparisonContig: comparisonContigs.get(comparisonId) ?? comparisonId,
      referenceContigStart: referenceRecordStart,
      referenceContigEnd: referenceRecordEnd,
      comparisonContigStart: comparisonRecordStart,
      comparisonContigEnd: comparisonRecordEnd,
      strand,
      matches,
      blockLength,
      identity: blockLength > 0 ? (matches / blockLength) * 100 : 0,
      mapq: Number.isFinite(mapq) ? mapq : "",
      engine
    });
  }
  return blocks;
}

function makeSeedIndex(sequence, seedSize, maxPositionsPerSeed = 2000) {
  const index = new Map();
  for (let position = 0; position <= sequence.length - seedSize; position += 1) {
    const seed = sequence.slice(position, position + seedSize);
    if (/N/.test(seed)) continue;
    const positions = index.get(seed);
    if (positions) {
      if (positions.length < maxPositionsPerSeed) {
        positions.push(position);
      }
    } else {
      index.set(seed, [position]);
    }
  }
  return index;
}

function extendExactBlock(reference, comparison, referenceSeedStart, comparisonSeedStart, seedSize) {
  let left = 0;
  while (
    referenceSeedStart - left - 1 >= 0 &&
    comparisonSeedStart - left - 1 >= 0 &&
    reference[referenceSeedStart - left - 1] === comparison[comparisonSeedStart - left - 1]
  ) {
    left += 1;
  }

  let right = 0;
  while (
    referenceSeedStart + seedSize + right < reference.length &&
    comparisonSeedStart + seedSize + right < comparison.length &&
    reference[referenceSeedStart + seedSize + right] === comparison[comparisonSeedStart + seedSize + right]
  ) {
    right += 1;
  }

  return {
    referenceStart: referenceSeedStart - left,
    referenceEnd: referenceSeedStart + seedSize + right,
    comparisonStart: comparisonSeedStart - left,
    comparisonEnd: comparisonSeedStart + seedSize + right,
    blockLength: seedSize + left + right
  };
}

function blockOverlapFraction(aStart, aEnd, bStart, bEnd) {
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const shorter = Math.min(aEnd - aStart, bEnd - bStart);
  return shorter > 0 ? overlap / shorter : 0;
}

function deduplicateBlocks(blocks) {
  const selected = [];
  const sorted = [...blocks].sort((a, b) => b.blockLength - a.blockLength || a.referenceStart - b.referenceStart);
  for (const block of sorted) {
    const duplicate = selected.some((existing) =>
      existing.comparison === block.comparison &&
      existing.strand === block.strand &&
      blockOverlapFraction(existing.referenceStart, existing.referenceEnd, block.referenceStart, block.referenceEnd) > 0.85 &&
      blockOverlapFraction(existing.comparisonStart, existing.comparisonEnd, block.comparisonStart, block.comparisonEnd) > 0.85
    );
    if (!duplicate) {
      selected.push(block);
    }
  }
  return selected.sort((a, b) =>
    a.comparison.localeCompare(b.comparison) ||
    a.referenceStart - b.referenceStart ||
    a.comparisonStart - b.comparisonStart
  );
}

function referenceCoverageForBlocks(blocks) {
  return intervalLength(mergeIntervals(blocks.map((block) => [block.referenceStart, block.referenceEnd])));
}

function sequenceLengthRatio(reference, comparison) {
  const longer = Math.max(reference.sequence.length, comparison.sequence.length);
  const shorter = Math.min(reference.sequence.length, comparison.sequence.length);
  return longer > 0 ? shorter / longer : 0;
}

async function makeWindowIdentityBlocksForComparison(reference, comparison, options, context = {}) {
  if (sequenceLengthRatio(reference, comparison) < 0.9) {
    return [];
  }
  const length = Math.min(reference.sequence.length, comparison.sequence.length);
  const windowLength = Math.max(options.minBlockLength, options.seedSize, Math.ceil(length / 120));
  const identityThreshold = Math.max(options.minIdentityPercent, 65);
  const blocks = [];
  for (let start = 0, windowIndex = 0; start < length; start += windowLength, windowIndex += 1) {
    if (windowIndex % 64 === 0) {
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
    }
    const end = Math.min(length, start + windowLength);
    let matches = 0;
    let compared = 0;
    for (let index = start; index < end; index += 1) {
      const referenceBase = reference.sequence[index];
      const comparisonBase = comparison.sequence[index];
      if (!/[ACGT]/u.test(referenceBase) || !/[ACGT]/u.test(comparisonBase)) continue;
      compared += 1;
      if (referenceBase === comparisonBase) matches += 1;
    }
    if (compared < options.minBlockLength) continue;
    const identity = (matches / compared) * 100;
    if (identity < identityThreshold) continue;
    blocks.push({
      comparison: comparison.title,
      comparisonSequence: comparison.title,
      comparisonLength: comparison.sequence.length,
      reference: reference.title,
      referenceLength: reference.sequence.length,
      referenceStart: start,
      referenceEnd: end,
      comparisonStart: start,
      comparisonEnd: end,
      strand: "+",
      matches,
      blockLength: compared,
      identity,
      mapq: "",
      engine: "window"
    });
  }
  return blocks;
}

function chooseLocalFallbackBlocks(exactBlocks, windowBlocks, options) {
  const windowCoverage = referenceCoverageForBlocks(windowBlocks);
  const exactCoverage = referenceCoverageForBlocks(exactBlocks);
  if (
    windowBlocks.length >= 3 &&
    windowCoverage >= Math.max(options.minBlockLength * 3, exactCoverage * 0.45)
  ) {
    return deduplicateBlocks([
      ...windowBlocks,
      ...exactBlocks.filter((block) => block.strand === "-")
    ]);
  }
  return exactBlocks;
}

async function findExactBlocksForComparison(reference, comparison, options, context = {}) {
  const blocks = [];
  const seedIndex = makeSeedIndex(comparison.sequence, options.seedSize);
  const reverseSequence = options.includeReverseComplement
    ? complementDnaRnaSequence(comparison.sequence).split("").reverse().join("").toUpperCase()
    : "";
  const reverseSeedIndex = reverseSequence ? makeSeedIndex(reverseSequence, options.seedSize) : null;

  for (let refPosition = 0; refPosition <= reference.sequence.length - options.seedSize; refPosition += 1) {
    if (refPosition % 1000 === 0) {
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
    }
    const seed = reference.sequence.slice(refPosition, refPosition + options.seedSize);
    if (/N/.test(seed)) continue;

    for (const comparisonPosition of seedIndex.get(seed) ?? []) {
      const extended = extendExactBlock(reference.sequence, comparison.sequence, refPosition, comparisonPosition, options.seedSize);
      if (extended.blockLength >= options.minBlockLength) {
        blocks.push({
          comparison: comparison.title,
          comparisonSequence: comparison.title,
          comparisonLength: comparison.sequence.length,
          reference: reference.title,
          referenceLength: reference.sequence.length,
          referenceStart: extended.referenceStart,
          referenceEnd: extended.referenceEnd,
          comparisonStart: extended.comparisonStart,
          comparisonEnd: extended.comparisonEnd,
          strand: "+",
          matches: extended.blockLength,
          blockLength: extended.blockLength,
          identity: 100,
          mapq: "",
          engine: "exact"
        });
      }
    }

    if (reverseSeedIndex) {
      for (const reversePosition of reverseSeedIndex.get(seed) ?? []) {
        const extended = extendExactBlock(reference.sequence, reverseSequence, refPosition, reversePosition, options.seedSize);
        if (extended.blockLength >= options.minBlockLength) {
          blocks.push({
            comparison: comparison.title,
            comparisonSequence: comparison.title,
            comparisonLength: comparison.sequence.length,
            reference: reference.title,
            referenceLength: reference.sequence.length,
            referenceStart: extended.referenceStart,
            referenceEnd: extended.referenceEnd,
            comparisonStart: comparison.sequence.length - extended.comparisonEnd,
            comparisonEnd: comparison.sequence.length - extended.comparisonStart,
            strand: "-",
            matches: extended.blockLength,
            blockLength: extended.blockLength,
            identity: 100,
            mapq: "",
            engine: "exact"
          });
        }
      }
    }
  }

  return deduplicateBlocks(blocks);
}

async function runExactBlockFallback(reference, comparisons, options, context = {}) {
  const allBlocks = [];
  for (const [index, comparison] of comparisons.entries()) {
    context.reportProgress?.({
      phase: "finding-exact-shared-blocks",
      progress: 0.18 + (0.72 * index) / comparisons.length
    });
    const blocks = await findExactBlocksForComparison(reference, comparison, options, context);
    const windowBlocks = await makeWindowIdentityBlocksForComparison(reference, comparison, options, context);
    allBlocks.push(...chooseLocalFallbackBlocks(blocks, windowBlocks, options));
  }
  const usedWindowBlocks = allBlocks.some((block) => block.engine === "window");
  return {
    blocks: allBlocks,
    engineMessage: usedWindowBlocks ? "SMS3 local shared-block screen" : "Exact shared-block screen",
    command: ""
  };
}

export function filterGenomeComparisonBlocks(blocks, options = {}, warnings = []) {
  const normalized = normalizeOptions(options);
  const filtered = blocks.filter((block) => {
    const mapqPasses = typeof block.mapq !== "number" || block.mapq >= normalized.minMapq;
    const strandPasses = normalized.includeReverseComplement || block.strand !== "-";
    return block.identity >= normalized.minIdentityPercent &&
      block.blockLength >= normalized.minBlockLength &&
      mapqPasses &&
      strandPasses;
  });
  if (filtered.length > normalized.maxBlocks) {
    warnings.push(`Only the first ${normalized.maxBlocks.toLocaleString()} alignment block(s) were kept for output; ${(
      filtered.length - normalized.maxBlocks
    ).toLocaleString()} additional block(s) were omitted.`);
  }
  return filtered
    .sort((a, b) =>
      a.comparison.localeCompare(b.comparison) ||
      a.referenceStart - b.referenceStart ||
      b.blockLength - a.blockLength
    )
    .slice(0, normalized.maxBlocks);
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .map(([start, end]) => [Math.max(0, start), Math.max(0, end)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [sorted[0]];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

function intervalLength(intervals) {
  return intervals.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
}

function makeSummaryRows(reference, comparisons, blocks) {
  return comparisons.map((comparison) => {
    const comparisonBlocks = blocks.filter((block) => block.comparison === comparison.title);
    const referenceBp = intervalLength(mergeIntervals(comparisonBlocks.map((block) => [block.referenceStart, block.referenceEnd])));
    const comparisonBp = intervalLength(mergeIntervals(comparisonBlocks.map((block) => [block.comparisonStart, block.comparisonEnd])));
    const identityWeight = comparisonBlocks.reduce((sum, block) => sum + block.blockLength, 0);
    const weightedIdentity = identityWeight > 0
      ? comparisonBlocks.reduce((sum, block) => sum + block.identity * block.blockLength, 0) / identityWeight
      : 0;
    return {
      comparison: comparison.title,
      comparison_length: genomeBaseLength(comparison),
      block_count: comparisonBlocks.length,
      aligned_reference_bp: referenceBp,
      reference_coverage_percent: round((referenceBp / Math.max(1, genomeBaseLength(reference))) * 100, 2),
      aligned_comparison_bp: comparisonBp,
      comparison_coverage_percent: round((comparisonBp / Math.max(1, genomeBaseLength(comparison))) * 100, 2),
      mean_identity_percent: comparisonBlocks.length > 0 ? round(weightedIdentity, 2) : ""
    };
  });
}

function comparisonSortScore(row) {
  const identity = Number.parseFloat(row.mean_identity_percent);
  const coverage = Number.parseFloat(row.reference_coverage_percent);
  if (!Number.isFinite(identity) || !Number.isFinite(coverage)) return 0;
  return identity * (coverage / 100);
}

function sortComparisonResults(comparisons, summaryRows, sortOrder) {
  if (sortOrder === "input") {
    return { comparisons, summaryRows };
  }
  const byComparison = new Map(summaryRows.map((row) => [row.comparison, row]));
  const indexed = comparisons.map((comparison, index) => ({
    comparison,
    row: byComparison.get(comparison.title),
    index
  }));
  indexed.sort((a, b) => {
    const scoreDelta = comparisonSortScore(a.row ?? {}) - comparisonSortScore(b.row ?? {});
    if (scoreDelta !== 0) {
      return sortOrder === "similarity" ? -scoreDelta : scoreDelta;
    }
    return a.index - b.index;
  });
  return {
    comparisons: indexed.map((item) => item.comparison),
    summaryRows: indexed.map((item) => item.row).filter(Boolean)
  };
}

function sortBlocksByComparisonOrder(blocks, comparisons) {
  const order = new Map(comparisons.map((comparison, index) => [comparison.title, index]));
  return [...blocks].sort((a, b) => {
    const comparisonDelta = (order.get(a.comparison) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.comparison) ?? Number.MAX_SAFE_INTEGER);
    return comparisonDelta ||
      a.referenceStart - b.referenceStart ||
      b.blockLength - a.blockLength ||
      a.comparison.localeCompare(b.comparison);
  });
}

function makeBlockRows(blocks) {
  return blocks.map((block) => ({
    comparison: block.comparison,
    reference: block.reference,
    reference_start: block.referenceStart + 1,
    reference_end: block.referenceEnd,
    comparison_sequence: block.comparisonSequence,
    comparison_start: block.comparisonStart + 1,
    comparison_end: block.comparisonEnd,
    strand: block.strand,
    identity_percent: round(block.identity, 2),
    block_length: block.blockLength,
    matching_bases: block.matches,
    mapq: block.mapq,
    engine: block.engine
  }));
}

function formatPosition(value) {
  return Math.round(value).toLocaleString();
}

function makeTicks(start, end, count = 5) {
  const span = Math.max(1, end - start);
  if (span <= count) {
    return Array.from({ length: span + 1 }, (_, index) => start + index);
  }
  const step = span / count;
  const ticks = [];
  for (let index = 0; index <= count; index += 1) {
    ticks.push(Math.round(start + step * index));
  }
  return [...new Set(ticks)];
}

function niceTickInterval(span, targetCount = 8) {
  const raw = Math.max(1, span) / Math.max(1, targetCount);
  const scale = 10 ** Math.floor(Math.log10(raw));
  for (const multiplier of [1, 2, 2.5, 5, 10]) {
    const interval = Math.max(1, Math.round(multiplier * scale));
    if (interval >= raw) return interval;
  }
  return Math.max(1, Math.round(10 * scale));
}

function makePosterAxisTicks(start, end, majorCount = 4, minorCount = 20) {
  const span = Math.max(1, end - start + 1);
  const majorInterval = niceTickInterval(span, majorCount);
  const majorTicks = [start];
  for (let tick = Math.ceil(start / majorInterval) * majorInterval; tick < end; tick += majorInterval) {
    if (tick > start) majorTicks.push(tick);
  }
  if (end !== start) majorTicks.push(end);
  const majorSet = new Set(majorTicks);
  const minorInterval = Math.max(1, Math.round(majorInterval / Math.max(1, Math.round(minorCount / majorCount))));
  const minorTicks = [];
  for (let tick = Math.ceil(start / minorInterval) * minorInterval; tick <= end; tick += minorInterval) {
    if (tick > start && !majorSet.has(tick)) minorTicks.push(tick);
  }
  return { majorTicks, minorTicks };
}

function makeWrappedAxisPlan(referenceLength, requestedSections) {
  const safeLength = Math.max(1, Number(referenceLength) || 1);
  const sectionCount = clamp(requestedSections, 1, safeLength);
  const nominalSectionLength = Math.max(1, safeLength / sectionCount);
  const majorInterval = niceTickInterval(Math.ceil(nominalSectionLength), WRAPPED_AXIS_MAJOR_TICK_TARGET);
  const minorInterval = Math.max(1, Math.round(majorInterval / WRAPPED_AXIS_MINOR_DIVISIONS));
  const sectionLength = Math.max(1, Math.ceil(nominalSectionLength / minorInterval) * minorInterval);
  return { sectionLength, majorInterval, minorInterval };
}

function makeWrappedAxisTicks(referenceLength, segment) {
  const safeLength = Math.max(1, Number(referenceLength) || 1);
  const start = Math.max(0, Number(segment?.start) || 0);
  const end = Math.min(safeLength, Math.max(start, Number(segment?.end) || 0));
  const majorInterval = Math.max(1, Number(segment?.majorInterval) || niceTickInterval(end - start));
  const minorInterval = Math.max(1, Number(segment?.minorInterval) || Math.round(majorInterval / WRAPPED_AXIS_MINOR_DIVISIONS));
  const majorTicks = start === 0 ? [1] : [];
  const minorTicks = [];
  for (let tick = minorInterval; tick < safeLength; tick += minorInterval) {
    const position = tick - 1;
    if (position <= start || position >= end) continue;
    if (tick % majorInterval === 0) {
      majorTicks.push(tick);
    } else {
      minorTicks.push(tick);
    }
  }
  return { majorTicks, minorTicks };
}

function truncateLabel(label, maxLength = 34) {
  const text = String(label ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}...`;
}

const ART_POSTER_BACKGROUND = "#0b0b0f";
const ART_POSTER_NO_HIT = "#0b0b0f";
const ART_POSTER_AXIS = "#f9f871";
const ART_POSTER_AXIS_SECONDARY = "#6b7280";
const ART_POSTER_TEXT = "#f8fafc";
const ART_POSTER_MUTED_TEXT = "#cbd5e1";
const CIRCULAR_AXIS_MAJOR_TICK_TARGET = 10;
const CIRCULAR_AXIS_MINOR_TICK_TARGET = 50;
const WRAPPED_AXIS_MAJOR_TICK_TARGET = 4;
const WRAPPED_AXIS_MINOR_DIVISIONS = 5;
const LOOM_POSTER_BACKGROUND = "#ffffff";
const LOOM_POSTER_TEXT = "#111827";
const LOOM_POSTER_MUTED_TEXT = "#475569";
const LOOM_POSTER_AXIS = "#111827";
const LOOM_POSTER_AXIS_SECONDARY = "#94a3b8";
const GENOME_COMPARISON_POSTER_CLASS = "sms3-genome-comparison-poster";

function genomeComparisonPosterStyleScope(layout) {
  return `.${GENOME_COMPARISON_POSTER_CLASS}[data-layout="${layout}"]`;
}
const IDENTITY_COLOR_SCHEMES = Object.freeze({
  "magma-ocean": {
    label: "Magma / ocean",
    direct: ["#2e1050", "#4a1070", "#7b2d8b", "#c0392b", "#e05c2a", "#f39c12", "#f9f871"],
    reverse: ["#2e1050", "#4a1070", "#7b2d8b", "#c0392b", "#e05c2a", "#f39c12", "#f9f871"]
  },
  viridis: {
    label: "Viridis",
    direct: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    reverse: ["#3b0f70", "#355f8d", "#1f9e89", "#6ece58", "#fde725"]
  },
  cividis: {
    label: "Cividis",
    direct: ["#00204c", "#31446b", "#666970", "#a39c5a", "#ffd43b"],
    reverse: ["#12355b", "#3e5f7e", "#6f7f85", "#aa9f62", "#f6c85f"]
  },
  sunset: {
    label: "Sunset",
    direct: ["#3b0764", "#7e22ce", "#db2777", "#f97316", "#fde68a"],
    reverse: ["#1e1b4b", "#4338ca", "#0ea5e9", "#14b8a6", "#facc15"]
  },
  "blue-gold": {
    label: "Blue / gold",
    direct: ["#081d58", "#225ea8", "#41b6c4", "#a1dab4", "#ffffcc"],
    reverse: ["#172554", "#1d4ed8", "#0891b2", "#65a30d", "#fef3c7"]
  }
});
const COLOR_SCHEMES = new Set(Object.keys(IDENTITY_COLOR_SCHEMES));
const IDENTITY_PERCENTILE_LOW = 2;
const IDENTITY_PERCENTILE_HIGH = 100;

function normalizeColorScheme(value) {
  const key = String(value || DEFAULT_COLOR_SCHEME);
  return COLOR_SCHEMES.has(key) ? key : DEFAULT_COLOR_SCHEME;
}

function getIdentityColorScheme(value) {
  return IDENTITY_COLOR_SCHEMES[normalizeColorScheme(value)] ?? IDENTITY_COLOR_SCHEMES[DEFAULT_COLOR_SCHEME];
}

function parseHexColor(color) {
  const value = String(color).replace(/^#/u, "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function formatHexColor([red, green, blue]) {
  return `#${[red, green, blue]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateHexColor(startColor, endColor, fraction) {
  const start = parseHexColor(startColor);
  const end = parseHexColor(endColor);
  const t = clamp(fraction, 0, 1);
  return formatHexColor(start.map((value, index) => value + (end[index] - value) * t));
}

function interpolateIdentityColors(colors, fraction) {
  const t = clamp(fraction, 0, 1);
  if (colors.length <= 1) {
    return colors[0] ?? "#ffffff";
  }
  const scaled = t * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  return interpolateHexColor(colors[index], colors[index + 1], scaled - index);
}

function weightedIdentityPercentile(blocks, percentile) {
  const rows = blocks
    .map((block) => ({
      identity: block.identity,
      weight: Math.max(1, Number(block.blockLength) || 1)
    }))
    .filter((row) => Number.isFinite(row.identity) && Number.isFinite(row.weight) && row.weight > 0)
    .sort((a, b) => a.identity - b.identity);
  if (rows.length === 0) return Number.NaN;
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const target = clamp(percentile / 100, 0, 1) * totalWeight;
  if (target <= 0) return rows[0].identity;
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.weight;
    if (cumulative >= target) return row.identity;
  }
  return rows[rows.length - 1].identity;
}

function makeIdentityScale(blocks, options) {
  if (options.colorMode !== "adaptive") {
    return { mode: "fixed", min: 0, max: 100 };
  }
  const identities = blocks.map((block) => block.identity).filter(Number.isFinite);
  if (identities.length === 0) {
    return { mode: "adaptive", min: 0, max: 100 };
  }
  let min = Math.max(0, Math.floor(weightedIdentityPercentile(blocks, IDENTITY_PERCENTILE_LOW) * 10) / 10);
  let max = Math.min(100, Math.ceil(weightedIdentityPercentile(blocks, IDENTITY_PERCENTILE_HIGH) * 10) / 10);
  if (!Number.isFinite(min)) min = Math.max(0, Math.floor(Math.min(...identities) * 10) / 10);
  if (!Number.isFinite(max)) max = Math.min(100, Math.ceil(Math.max(...identities) * 10) / 10);
  if (max - min < 1) {
    const center = (max + min) / 2;
    min = Math.max(0, center - 0.5);
    max = Math.min(100, center + 0.5);
    if (max - min < 1) {
      min = Math.max(0, max - 1);
    }
  }
  return { mode: "adaptive", min: round(min, 1), max: round(max, 1) };
}

function identityScaleFraction(identity, scale) {
  if (!Number.isFinite(identity) || scale.max <= scale.min) return 1;
  return clamp((identity - scale.min) / (scale.max - scale.min), 0, 1);
}

function identityColor(identity, strand, scale, colorScheme = DEFAULT_COLOR_SCHEME) {
  const scheme = getIdentityColorScheme(colorScheme);
  const colors = strand === "-" ? scheme.reverse : scheme.direct;
  return interpolateIdentityColors(colors, identityScaleFraction(identity, scale));
}

function makeGradientId(layout, strand) {
  return `identity-gradient-${layout}-${strand === "-" ? "reverse" : "direct"}`;
}

function makeIdentityGradientDefs(layout, colorScheme = DEFAULT_COLOR_SCHEME) {
  const scheme = getIdentityColorScheme(colorScheme);
  const makeGradient = (strand, colors) => {
    const id = makeGradientId(layout, strand);
    const stops = colors.map((color, index) => {
      const offset = colors.length <= 1 ? 0 : (index / (colors.length - 1)) * 100;
      const offsetLabel = Number.isInteger(offset) ? String(offset) : offset.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
      return `<stop offset="${offsetLabel}%" stop-color="${color}"/>`;
    });
    return [
      `<linearGradient id="${id}" x1="0%" x2="100%" y1="0%" y2="0%">`,
      ...stops,
      "</linearGradient>"
    ].join("");
  };
  return `<defs>${makeGradient("+", scheme.direct)}${makeGradient("-", scheme.reverse)}</defs>`;
}

function renderIdentityLegend(parts, { x, y, width, scale, layout, showReverse, colorScheme = DEFAULT_COLOR_SCHEME }) {
  const scheme = getIdentityColorScheme(colorScheme);
  const scaleLabel = scale.mode === "adaptive"
    ? `Identity scale, adaptive (${scale.min}-${scale.max}%)`
    : "Identity scale, fixed (0-100%)";
  const barHeight = 10;
  const labelOffset = 24;
  const rowGap = 38;
  parts.push(`<text class="label" x="${x}" y="${y - 14}" data-identity-legend-title="true">${escapeXml(`${scaleLabel}; ${scheme.label}`)}</text>`);
  const rows = [
    { strand: "+", label: "Direct strand" },
    ...(showReverse ? [{ strand: "-", label: "Reverse-complement strand" }] : [])
  ];
  rows.forEach((row, index) => {
    const rowY = y + index * rowGap;
    const labelY = rowY + labelOffset;
    const rowKey = row.strand === "-" ? "reverse" : "direct";
    parts.push(`<rect x="${x}" y="${rowY}" width="${width}" height="${barHeight}" rx="3" fill="url(#${makeGradientId(layout, row.strand)})" data-identity-legend-bar="${rowKey}"/>`);
    parts.push(`<text class="small" x="${x}" y="${labelY}" data-identity-legend-label="${rowKey}-min">${escapeXml(`${row.label} ${scale.min}%`)}</text>`);
    parts.push(`<text class="small" x="${x + width}" y="${labelY}" text-anchor="end" data-identity-legend-label="${rowKey}-max">${escapeXml(`${scale.max}%`)}</text>`);
  });
}

function makeReferenceSegments(referenceLength, options) {
  if (options.layout !== "wrapped") {
    return [{ start: 0, end: referenceLength, displayLength: referenceLength }];
  }
  const segmentCount = clamp(options.wrappedSections, 1, Math.max(1, referenceLength));
  const axisPlan = options.showAxis
    ? makeWrappedAxisPlan(referenceLength, segmentCount)
    : null;
  const segmentLength = axisPlan?.sectionLength ?? Math.ceil(referenceLength / segmentCount);
  const segments = [];
  for (let start = 0; start < referenceLength; start += segmentLength) {
    segments.push({
      start,
      end: Math.min(referenceLength, start + segmentLength),
      displayLength: segmentLength,
      majorInterval: axisPlan?.majorInterval,
      minorInterval: axisPlan?.minorInterval
    });
  }
  return segments;
}

function clipBlockToSegment(block, segment) {
  const start = Math.max(block.referenceStart, segment.start);
  const end = Math.min(block.referenceEnd, segment.end);
  if (end <= start) return null;
  return { ...block, clippedReferenceStart: start, clippedReferenceEnd: end };
}

const LOOM_CONTIG_COLORS = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#C9B000",
  "#56B4E9",
  "#E69F00",
  "#6A3D9A",
  "#1B9E77",
  "#E7298A"
];
const LOOM_REFERENCE_PAINT_COLORS = [
  "#0072B2",
  "#56B4E9",
  "#009E73",
  "#C9B000",
  "#E69F00",
  "#D55E00",
  "#CC79A7",
  "#6A3D9A",
  "#1B9E77",
  "#E7298A",
  "#66A61E",
  "#7570B3"
];
const LOOM_CONTIG_GAP_FRACTION = 0.004;
const LOOM_PAINT_BLOCK_GAP_PX = 0;

function makeGenomeDisplayLayout(genome) {
  const records = Array.isArray(genome.records) && genome.records.length > 0
    ? genome.records
    : [{ title: genome.title, sequence: genome.sequence, length: genome.sequence.length }];
  const baseLength = Math.max(1, records.reduce((sum, record) => sum + Math.max(0, record.length ?? record.sequence?.length ?? 0), 0));
  const gapBases = records.length > 1 ? Math.max(1, Math.round(baseLength * LOOM_CONTIG_GAP_FRACTION)) : 0;
  const segments = [];
  let baseOffset = 0;
  let displayOffset = 0;
  for (const record of records) {
    const length = Math.max(0, record.length ?? record.sequence?.length ?? 0);
    segments.push({
      title: record.title || genome.title,
      length,
      baseStart: baseOffset,
      baseEnd: baseOffset + length,
      displayStart: displayOffset,
      displayEnd: displayOffset + length
    });
    baseOffset += length;
    displayOffset += length + gapBases;
  }
  const displayLength = Math.max(1, displayOffset - (segments.length > 1 ? gapBases : 0));
  return { segments, baseLength, displayLength, gapBases };
}

function displayPositionToX(layout, displayPosition, x, width, scaleLength = layout.displayLength) {
  return x + (clamp(displayPosition, 0, layout.displayLength) / Math.max(1, scaleLength)) * width;
}

function basePositionToDisplay(layout, position) {
  const bounded = clamp(Number(position) || 0, 0, layout.baseLength);
  for (const segment of layout.segments) {
    if (bounded <= segment.baseEnd) {
      return segment.displayStart + clamp(bounded - segment.baseStart, 0, segment.length);
    }
  }
  const last = layout.segments[layout.segments.length - 1];
  return last ? last.displayEnd : 0;
}

function joinedPositionToX(layout, position, x, width, scaleLength = layout.displayLength) {
  return displayPositionToX(layout, joinedPositionToDisplay(layout, position), x, width, scaleLength);
}

function basePositionToX(layout, position, x, width, scaleLength = layout.displayLength) {
  return displayPositionToX(layout, basePositionToDisplay(layout, position), x, width, scaleLength);
}

function segmentBasePositionToDisplay(segment, position) {
  return segment.displayStart + clamp((Number(position) || 0) - segment.baseStart, 0, segment.length);
}

function segmentBasePositionToX(layout, segment, position, x, width, scaleLength = layout.displayLength) {
  return displayPositionToX(layout, segmentBasePositionToDisplay(segment, position), x, width, scaleLength);
}

function basePositionSegment(layout, position) {
  const bounded = clamp(Number(position) || 0, 0, layout.baseLength);
  return layout.segments.find((segment) =>
    bounded >= segment.baseStart && bounded <= segment.baseEnd
  ) ?? null;
}

function splitBaseRangeByLayoutSegments(layout, start, end) {
  const rangeStart = Math.min(start, end);
  const rangeEnd = Math.max(start, end);
  if (rangeEnd <= rangeStart) return [];
  return layout.segments
    .map((segment) => ({
      start: Math.max(rangeStart, segment.baseStart),
      end: Math.min(rangeEnd, segment.baseEnd),
      segment
    }))
    .filter((piece) => piece.end > piece.start);
}

function crossingFractionsForBaseLayoutSegments(layout, start, end) {
  const delta = end - start;
  if (Math.abs(delta) <= Number.EPSILON) return [];
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  const fractions = [];
  for (const segment of layout.segments) {
    for (const boundary of [segment.baseStart, segment.baseEnd]) {
      if (boundary <= lower || boundary >= upper) continue;
      const fraction = (boundary - start) / delta;
      if (fraction > 1e-9 && fraction < 1 - 1e-9) {
        fractions.push(fraction);
      }
    }
  }
  return fractions;
}

function interpolateCoordinate(start, end, fraction) {
  return start + (end - start) * fraction;
}

function splitLoomRibbonCoordinates({ upperLayout, lowerLayout, upperStart, upperEnd, lowerStart, lowerEnd, referenceStart, referenceEnd }) {
  const fractions = [
    0,
    1,
    ...crossingFractionsForBaseLayoutSegments(upperLayout, upperStart, upperEnd),
    ...crossingFractionsForBaseLayoutSegments(lowerLayout, lowerStart, lowerEnd)
  ]
    .sort((a, b) => a - b)
    .filter((fraction, index, values) => index === 0 || Math.abs(fraction - values[index - 1]) > 1e-9);
  const pieces = [];
  for (let index = 0; index < fractions.length - 1; index += 1) {
    const t0 = fractions[index];
    const t1 = fractions[index + 1];
    if (t1 - t0 <= 1e-9) continue;
    const midpoint = (t0 + t1) / 2;
    const upperSegment = basePositionSegment(upperLayout, interpolateCoordinate(upperStart, upperEnd, midpoint));
    const lowerSegment = basePositionSegment(lowerLayout, interpolateCoordinate(lowerStart, lowerEnd, midpoint));
    if (!upperSegment || !lowerSegment) continue;
    pieces.push({
      upperStart: interpolateCoordinate(upperStart, upperEnd, t0),
      upperEnd: interpolateCoordinate(upperStart, upperEnd, t1),
      lowerStart: interpolateCoordinate(lowerStart, lowerEnd, t0),
      lowerEnd: interpolateCoordinate(lowerStart, lowerEnd, t1),
      referenceStart: interpolateCoordinate(referenceStart, referenceEnd, t0),
      referenceEnd: interpolateCoordinate(referenceStart, referenceEnd, t1),
      upperSegment,
      lowerSegment
    });
  }
  return pieces;
}

function makeLoomRibbonPath({ topStart, topEnd, topY, bottomStart, bottomEnd, bottomY, barHeight, strand }) {
  let bottomLeft = bottomStart;
  let bottomRight = bottomEnd;
  if (strand === "-") {
    bottomLeft = bottomEnd;
    bottomRight = bottomStart;
  }
  const yTop = topY + barHeight / 2;
  const yBottom = bottomY - barHeight / 2;
  const yMid = (yTop + yBottom) / 2;
  return [
    `M ${topStart.toFixed(2)} ${yTop.toFixed(2)}`,
    `C ${topStart.toFixed(2)} ${yMid.toFixed(2)} ${bottomLeft.toFixed(2)} ${yMid.toFixed(2)} ${bottomLeft.toFixed(2)} ${yBottom.toFixed(2)}`,
    `L ${bottomRight.toFixed(2)} ${yBottom.toFixed(2)}`,
    `C ${bottomRight.toFixed(2)} ${yMid.toFixed(2)} ${topEnd.toFixed(2)} ${yMid.toFixed(2)} ${topEnd.toFixed(2)} ${yTop.toFixed(2)}`,
    "Z"
  ].join(" ");
}

function renderLoomGenomeRow(parts, { genome, layout, x, y, width, barHeight, rowRole, scaleLength = layout.displayLength }) {
  layout.segments.forEach((segment, index) => {
    const segmentX = displayPositionToX(layout, segment.displayStart, x, width, scaleLength);
    const segmentWidth = Math.max(1.5, displayPositionToX(layout, segment.displayEnd, x, width, scaleLength) - segmentX);
    const color = LOOM_CONTIG_COLORS[index % LOOM_CONTIG_COLORS.length];
    parts.push(`<rect class="loom-contig loom-contig-${escapeXml(rowRole)}" x="${segmentX.toFixed(2)}" y="${(y - barHeight / 2).toFixed(2)}" width="${segmentWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${color}" data-genome="${escapeXml(genome.title)}" data-contig="${escapeXml(segment.title)}"><title>${escapeXml(`${genome.title}: ${segment.title} (${segment.length.toLocaleString()} bp)`)}</title></rect>`);
  });
}

function renderLoomPaintBlocks(parts, { blocks, layout, x, y, width, barHeight, scaleLength = layout.displayLength, rowRole }) {
  for (const block of blocks) {
    for (const piece of splitBaseRangeByLayoutSegments(layout, block.start, block.end)) {
      const blockX1 = segmentBasePositionToX(layout, piece.segment, piece.start, x, width, scaleLength);
      const blockX2 = segmentBasePositionToX(layout, piece.segment, piece.end, x, width, scaleLength);
      const rawX = Math.min(blockX1, blockX2);
      const measuredWidth = Math.abs(blockX2 - blockX1);
      if (measuredWidth <= 1.5) continue;
      const rawWidth = measuredWidth;
      const inset = Math.min(LOOM_PAINT_BLOCK_GAP_PX / 2, Math.max(0, (rawWidth - 1.5) / 2));
      const blockX = rawX + inset;
      const blockWidth = Math.max(1.5, rawWidth - inset * 2);
      parts.push(`<rect class="loom-paint-block loom-paint-${escapeXml(rowRole)}" x="${blockX.toFixed(2)}" y="${(y - barHeight / 2).toFixed(2)}" width="${blockWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${escapeXml(block.color)}" fill-opacity="${block.opacity ?? 1}" data-genome="${escapeXml(block.genome)}" data-origin="${escapeXml(block.origin)}" data-contig="${escapeXml(piece.segment.title)}" data-visual-gap-px="${LOOM_PAINT_BLOCK_GAP_PX}"><title>${escapeXml(block.title)}</title></rect>`);
    }
  }
}

function makeLoomSingleSequencePaintIntervals(layout, options) {
  const baseLength = Math.max(1, layout.baseLength);
  const minimumPaintLength = Math.max(1, Number.parseInt(options?.minBlockLength, 10) || DEFAULT_MIN_BLOCK_LENGTH);
  const intervalCount = Math.max(
    1,
    Math.min(LOOM_REFERENCE_PAINT_COLORS.length, Math.floor(baseLength / minimumPaintLength))
  );
  const intervals = [];
  for (let index = 0; index < intervalCount; index += 1) {
    const start = Math.floor((index * baseLength) / intervalCount);
    const end = index === intervalCount - 1
      ? baseLength
      : Math.floor(((index + 1) * baseLength) / intervalCount);
    if (end <= start) continue;
    intervals.push({
      start,
      end,
      color: LOOM_REFERENCE_PAINT_COLORS[index % LOOM_REFERENCE_PAINT_COLORS.length],
      origin: `${layout.segments[0]?.title ?? "reference"} ${formatPosition(start + 1)}-${formatPosition(end)}`
    });
  }
  return intervals;
}

function makeLoomReferencePaintIntervals(layout, options = {}) {
  if (layout.segments.filter((segment) => segment.length > 0).length <= 1) {
    return makeLoomSingleSequencePaintIntervals(layout, options);
  }
  const colorBySegmentIndex = new Map(
    layout.segments
      .map((segment, index) => ({ segment, index }))
      .filter((item) => item.segment.length > 0)
      .sort((a, b) => b.segment.length - a.segment.length || a.index - b.index)
      .map((item, rank) => [
        item.index,
        LOOM_REFERENCE_PAINT_COLORS[rank % LOOM_REFERENCE_PAINT_COLORS.length]
      ])
  );
  const intervals = [];
  for (const [segmentIndex, segment] of layout.segments.entries()) {
    if (segment.length <= 0) continue;
    intervals.push({
      start: segment.baseStart,
      end: segment.baseEnd,
      color: colorBySegmentIndex.get(segmentIndex) ?? LOOM_REFERENCE_PAINT_COLORS[0],
      origin: segment.title
    });
  }
  return intervals;
}

function dominantReferencePaintColor(intervals, start, end) {
  if (intervals.length === 0) {
    return { color: LOOM_REFERENCE_PAINT_COLORS[0], origin: "reference" };
  }
  let best = null;
  for (const interval of intervals) {
    const overlap = Math.max(0, Math.min(end, interval.end) - Math.max(start, interval.start));
    if (overlap <= 0) continue;
    if (!best || overlap > best.overlap) {
      best = { ...interval, overlap };
    }
  }
  if (best) return best;
  const midpoint = (start + end) / 2;
  return intervals.reduce((closest, interval) => {
    const center = (interval.start + interval.end) / 2;
    const distance = Math.abs(center - midpoint);
    return !closest || distance < closest.distance ? { ...interval, distance } : closest;
  }, null) ?? { color: LOOM_REFERENCE_PAINT_COLORS[0], origin: "reference" };
}

function mapReferenceSegmentToComparison(block, referenceStart, referenceEnd) {
  const blockReferenceStart = Math.min(block.referenceStart, block.referenceEnd);
  const blockReferenceEnd = Math.max(block.referenceStart, block.referenceEnd);
  const blockComparisonStart = Math.min(block.comparisonStart, block.comparisonEnd);
  const blockComparisonEnd = Math.max(block.comparisonStart, block.comparisonEnd);
  const referenceLength = Math.max(1, blockReferenceEnd - blockReferenceStart);
  const comparisonLength = Math.max(1, blockComparisonEnd - blockComparisonStart);
  const segmentStartFraction = clamp((referenceStart - blockReferenceStart) / referenceLength, 0, 1);
  const segmentEndFraction = clamp((referenceEnd - blockReferenceStart) / referenceLength, 0, 1);

  if (block.strand === "-") {
    return {
      comparisonStart: blockComparisonEnd - segmentEndFraction * comparisonLength,
      comparisonEnd: blockComparisonEnd - segmentStartFraction * comparisonLength
    };
  }

  return {
    comparisonStart: blockComparisonStart + segmentStartFraction * comparisonLength,
    comparisonEnd: blockComparisonStart + segmentEndFraction * comparisonLength
  };
}

function splitLoomBlockByReferencePaint(block, referencePaintIntervals) {
  const blockReferenceStart = Math.min(block.referenceStart, block.referenceEnd);
  const blockReferenceEnd = Math.max(block.referenceStart, block.referenceEnd);
  const segments = [];

  for (const paint of referencePaintIntervals) {
    const referenceStart = Math.max(blockReferenceStart, paint.start);
    const referenceEnd = Math.min(blockReferenceEnd, paint.end);
    if (referenceEnd <= referenceStart) continue;
    const { comparisonStart, comparisonEnd } = mapReferenceSegmentToComparison(block, referenceStart, referenceEnd);
    if (Math.abs(comparisonEnd - comparisonStart) <= 0) continue;
    segments.push({
      block,
      paint,
      referenceStart,
      referenceEnd,
      comparisonStart,
      comparisonEnd
    });
  }

  if (segments.length > 0) return segments;

  const paint = dominantReferencePaintColor(referencePaintIntervals, blockReferenceStart, blockReferenceEnd);
  return [{
    block,
    paint,
    referenceStart: blockReferenceStart,
    referenceEnd: blockReferenceEnd,
    comparisonStart: Math.min(block.comparisonStart, block.comparisonEnd),
    comparisonEnd: Math.max(block.comparisonStart, block.comparisonEnd)
  }];
}

function makeLoomReferencePaintBlocks(reference, referencePaintIntervals) {
  return referencePaintIntervals.map((interval) => ({
    start: interval.start,
    end: interval.end,
    color: interval.color,
    genome: reference.title,
    origin: interval.origin,
    opacity: 0.96,
    title: `${reference.title}: reference paint ${interval.origin}`
  }));
}

function makeLoomComparisonPaintBlock(segment) {
  const { block, paint } = segment;
  const comparisonStart = Math.min(segment.comparisonStart, segment.comparisonEnd);
  const comparisonEnd = Math.max(segment.comparisonStart, segment.comparisonEnd);
  return {
    start: comparisonStart,
    end: comparisonEnd,
    color: paint.color,
    genome: block.comparison,
    origin: paint.origin,
    opacity: 0.90,
    title: `${block.comparison}: reference paint ${paint.origin}; comparison ${formatPosition(Math.floor(comparisonStart) + 1)}-${formatPosition(Math.ceil(comparisonEnd))}; reference ${formatPosition(Math.floor(segment.referenceStart) + 1)}-${formatPosition(Math.ceil(segment.referenceEnd))}`
  };
}

function makeLoomComparisonPaintSegments(comparisonBlocksByTitle, displayedComparisons, referencePaintIntervals) {
  const segmentsByTitle = new Map();
  for (const comparison of displayedComparisons) {
    const segments = (comparisonBlocksByTitle.get(comparison.title) ?? [])
      .flatMap((block) => splitLoomBlockByReferencePaint(block, referencePaintIntervals))
      .sort((a, b) => a.referenceStart - b.referenceStart || a.referenceEnd - b.referenceEnd);
    segmentsByTitle.set(comparison.title, segments);
  }
  return segmentsByTitle;
}

function makeLoomAdjacentRibbonItems({
  reference,
  displayedComparisons,
  comparisonPaintSegmentsByTitle,
  referenceLayout,
  comparisonLayouts,
  rowYs,
  marginLeft,
  plotWidth,
  sharedScaleLength,
  loomColorMode,
  identityScale,
  colorScheme
}) {
  const rowOrder = [reference, ...displayedComparisons];
  const rowIndexByTitle = new Map(rowOrder.map((row, index) => [row.title, index]));
  const items = [];

  const addItem = ({
    upperGenome,
    lowerGenome,
    upperLayout,
    lowerLayout,
    upperStart,
    upperEnd,
    lowerStart,
    lowerEnd,
    referenceStart,
    referenceEnd,
    strand,
    color,
    opacity,
    identity,
    paint,
    block
  }) => {
    const upperRowIndex = rowIndexByTitle.get(upperGenome.title);
    const lowerRowIndex = rowIndexByTitle.get(lowerGenome.title);
    const upperY = rowYs.get(upperGenome.title);
    const lowerY = rowYs.get(lowerGenome.title);
    if (!Number.isFinite(upperY) || !Number.isFinite(lowerY)) return;
    if (!Number.isInteger(upperRowIndex) || !Number.isInteger(lowerRowIndex)) return;
    if (lowerRowIndex - upperRowIndex !== 1) return;

    for (const piece of splitLoomRibbonCoordinates({
      upperLayout,
      lowerLayout,
      upperStart,
      upperEnd,
      lowerStart,
      lowerEnd,
      referenceStart,
      referenceEnd
    })) {
      const topStart = segmentBasePositionToX(upperLayout, piece.upperSegment, piece.upperStart, marginLeft, plotWidth, sharedScaleLength);
      const topEnd = segmentBasePositionToX(upperLayout, piece.upperSegment, piece.upperEnd, marginLeft, plotWidth, sharedScaleLength);
      const bottomStart = segmentBasePositionToX(lowerLayout, piece.lowerSegment, piece.lowerStart, marginLeft, plotWidth, sharedScaleLength);
      const bottomEnd = segmentBasePositionToX(lowerLayout, piece.lowerSegment, piece.lowerEnd, marginLeft, plotWidth, sharedScaleLength);
      if (Math.abs(topEnd - topStart) <= 0.25 || Math.abs(bottomEnd - bottomStart) <= 0.25) continue;
      items.push({
        block,
        paint,
        color,
        opacity,
        identity,
        strand,
        referenceStart: Math.min(piece.referenceStart, piece.referenceEnd),
        referenceEnd: Math.max(piece.referenceStart, piece.referenceEnd),
        comparisonStart: Math.min(piece.lowerStart, piece.lowerEnd),
        comparisonEnd: Math.max(piece.lowerStart, piece.lowerEnd),
        topStart,
        topEnd,
        topY: upperY,
        bottomStart,
        bottomEnd,
        bottomY: lowerY,
        upperGenome: upperGenome.title,
        lowerGenome: lowerGenome.title,
        upperRowIndex,
        lowerRowIndex,
        sortLength: Math.max(Math.abs(topEnd - topStart), Math.abs(bottomEnd - bottomStart))
      });
    }
  };

  const firstComparison = displayedComparisons[0];
  if (firstComparison) {
    const lowerLayout = comparisonLayouts.get(firstComparison.title);
    if (lowerLayout) {
      for (const segment of comparisonPaintSegmentsByTitle.get(firstComparison.title) ?? []) {
        const color = loomColorMode === "reference"
          ? segment.paint.color
          : identityColor(segment.block.identity, segment.block.strand, identityScale, colorScheme);
        const opacity = loomColorMode === "reference"
          ? (segment.block.strand === "-" ? 0.24 : 0.30)
          : (segment.block.strand === "-" ? 0.58 : 0.66);
        addItem({
          upperGenome: reference,
          lowerGenome: firstComparison,
          upperLayout: referenceLayout,
          lowerLayout,
          upperStart: segment.referenceStart,
          upperEnd: segment.referenceEnd,
          lowerStart: segment.comparisonStart,
          lowerEnd: segment.comparisonEnd,
          referenceStart: segment.referenceStart,
          referenceEnd: segment.referenceEnd,
          strand: segment.block.strand,
          color,
          opacity,
          identity: segment.block.identity,
          paint: segment.paint,
          block: segment.block
        });
      }
    }
  }

  for (let index = 0; index < displayedComparisons.length - 1; index += 1) {
    const upperGenome = displayedComparisons[index];
    const lowerGenome = displayedComparisons[index + 1];
    const upperLayout = comparisonLayouts.get(upperGenome.title);
    const lowerLayout = comparisonLayouts.get(lowerGenome.title);
    if (!upperLayout || !lowerLayout) continue;
    const upperSegmentsByOrigin = new Map();
    for (const segment of comparisonPaintSegmentsByTitle.get(upperGenome.title) ?? []) {
      const origin = segment.paint.origin;
      if (!upperSegmentsByOrigin.has(origin)) upperSegmentsByOrigin.set(origin, []);
      upperSegmentsByOrigin.get(origin).push(segment);
    }
    const lowerSegmentsByOrigin = new Map();
    for (const segment of comparisonPaintSegmentsByTitle.get(lowerGenome.title) ?? []) {
      const origin = segment.paint.origin;
      if (!lowerSegmentsByOrigin.has(origin)) lowerSegmentsByOrigin.set(origin, []);
      lowerSegmentsByOrigin.get(origin).push(segment);
    }

    for (const [origin, upperSegments] of upperSegmentsByOrigin) {
      const lowerSegments = lowerSegmentsByOrigin.get(origin) ?? [];
      for (const upperSegment of upperSegments) {
        for (const lowerSegment of lowerSegments) {
          if (lowerSegment.referenceEnd <= upperSegment.referenceStart) continue;
          if (lowerSegment.referenceStart >= upperSegment.referenceEnd) break;
          const referenceStart = Math.max(upperSegment.referenceStart, lowerSegment.referenceStart);
          const referenceEnd = Math.min(upperSegment.referenceEnd, lowerSegment.referenceEnd);
          if (referenceEnd <= referenceStart) continue;
          const upperMapped = mapReferenceSegmentToComparison(upperSegment.block, referenceStart, referenceEnd);
          const lowerMapped = mapReferenceSegmentToComparison(lowerSegment.block, referenceStart, referenceEnd);
          const strand = upperSegment.block.strand === lowerSegment.block.strand ? "+" : "-";
          const averageIdentity = (Number(upperSegment.block.identity) + Number(lowerSegment.block.identity)) / 2;
          const identity = Number.isFinite(averageIdentity) ? averageIdentity : lowerSegment.block.identity;
          const color = loomColorMode === "reference"
            ? upperSegment.paint.color
            : identityColor(identity, strand, identityScale, colorScheme);
          const opacity = loomColorMode === "reference"
            ? (strand === "-" ? 0.24 : 0.30)
            : (strand === "-" ? 0.58 : 0.66);
          addItem({
            upperGenome,
            lowerGenome,
            upperLayout,
            lowerLayout,
            upperStart: upperMapped.comparisonStart,
            upperEnd: upperMapped.comparisonEnd,
            lowerStart: lowerMapped.comparisonStart,
            lowerEnd: lowerMapped.comparisonEnd,
            referenceStart,
            referenceEnd,
            strand,
            color,
            opacity,
            identity,
            paint: upperSegment.paint,
            block: lowerSegment.block
          });
        }
      }
    }
  }

  return items.sort((a, b) => b.sortLength - a.sortLength || a.topStart - b.topStart);
}

function renderLoomReferencePaintLegend(parts, { x, y, intervals, width }) {
  parts.push(`<g class="loom-reference-paint-legend" data-reference-paint-count="${intervals.length}">`);
  parts.push(`<text class="label" x="${x}" y="${y}">Reference-based colors</text>`);
  parts.push(`<text class="small" x="${x}" y="${y + 26}">Colors are assigned from the reference and propagated to comparison contigs through sequence alignments.</text>`);
  const shown = intervals.slice(0, 12);
  const itemWidth = Math.max(72, Math.min(150, width / Math.max(1, shown.length)));
  const swatchSize = 16;
  shown.forEach((interval, index) => {
    const itemX = x + index * itemWidth;
    const label = truncateLabel(interval.origin, 15);
    parts.push(`<rect class="loom-paint-legend-swatch" x="${itemX.toFixed(2)}" y="${(y + 46).toFixed(2)}" width="${swatchSize}" height="${swatchSize}" rx="2" fill="${escapeXml(interval.color)}"><title>${escapeXml(interval.origin)}</title></rect>`);
    parts.push(`<text class="legend loom-paint-legend-label" x="${(itemX + swatchSize + 8).toFixed(2)}" y="${(y + 59).toFixed(2)}">${escapeXml(label)}</text>`);
  });
  if (intervals.length > shown.length) {
    parts.push(`<text class="small" x="${x}" y="${y + 88}">Showing first ${shown.length} color keys of ${intervals.length}; remaining intervals reuse the same reference-paint palette.</text>`);
  }
  parts.push("</g>");
}

function renderLoomAxis(parts, { layout, x, y, width, placement, scaleLength = layout.displayLength }) {
  const direction = placement === "top" ? -1 : 1;
  const axisY = y + direction * 28;
  const axisEndX = displayPositionToX(layout, layout.displayLength, x, width, scaleLength);
  parts.push(`<line class="axis loom-axis" x1="${x}" x2="${axisEndX.toFixed(2)}" y1="${axisY.toFixed(2)}" y2="${axisY.toFixed(2)}"/>`);
  const { majorTicks, minorTicks } = makePosterAxisTicks(1, layout.baseLength, 4, 18);
  for (const tick of minorTicks) {
    const tickX = basePositionToX(layout, tick - 1, x, width, scaleLength);
    parts.push(`<line class="minor-tick" x1="${tickX.toFixed(2)}" x2="${tickX.toFixed(2)}" y1="${(axisY - direction * 4).toFixed(2)}" y2="${(axisY + direction * 4).toFixed(2)}"/>`);
  }
  for (const tick of majorTicks) {
    const tickX = basePositionToX(layout, tick - 1, x, width, scaleLength);
    const labelY = axisY + direction * 24;
    parts.push(`<line class="tick" x1="${tickX.toFixed(2)}" x2="${tickX.toFixed(2)}" y1="${(axisY - direction * 7).toFixed(2)}" y2="${(axisY + direction * 7).toFixed(2)}"/>`);
    parts.push(`<text class="axis-label" x="${tickX.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(formatPosition(tick))}</text>`);
  }
}

export function renderGenomeComparisonPosterSvg({
  reference,
  comparisons,
  blocks,
  summaryRows,
  options,
  warnings = []
}) {
  const normalizedOptions = normalizeOptions(options);
  const identityScale = makeIdentityScale(blocks, normalizedOptions);
  if (normalizedOptions.layout === "circular") {
    return renderCircularGenomeComparisonPosterSvg({
      reference,
      comparisons,
      blocks,
      summaryRows,
      options: normalizedOptions,
      identityScale,
      warnings
    });
  }
  if (normalizedOptions.layout === "spiral") {
    return renderSpiralGenomeComparisonPosterSvg({
      reference,
      comparisons,
      blocks,
      summaryRows,
      options: normalizedOptions,
      identityScale,
      warnings
    });
  }
  if (normalizedOptions.layout === "loom") {
    return renderLoomGenomeComparisonPosterSvg({
      reference,
      comparisons,
      blocks,
      summaryRows,
      options: normalizedOptions,
      identityScale,
      warnings
    });
  }
  return renderLinearGenomeComparisonPosterSvg({
    reference,
    comparisons,
    blocks,
    summaryRows,
    options: normalizedOptions,
    identityScale,
    warnings
  });
}

function renderLoomGenomeComparisonPosterSvg({
  reference,
  comparisons,
  blocks,
  summaryRows,
  options,
  identityScale,
  warnings = []
}) {
  const displayedComparisons = comparisons;
  const rowCount = Math.max(2, displayedComparisons.length + 1);
  const rowGap = rowCount <= 3 ? 150 : rowCount <= 6 ? 118 : 92;
  const width = 1400;
  const loomColorMode = options.loomColorMode === "identity" ? "identity" : "reference";
  const showReferencePaintLegend = loomColorMode === "reference";
  const showLegendArea = options.showLegend || showReferencePaintLegend;
  const styleScope = genomeComparisonPosterStyleScope("loom");
  const margin = {
    left: options.showGenomeLabels ? 300 : 96,
    right: 86,
    top: options.showAxis ? 132 : 88,
    bottom: showLegendArea ? (options.showAxis ? 230 : 170) : (options.showAxis ? 128 : 92)
  };
  const height = Math.max(
    showLegendArea ? 720 : 560,
    margin.top + margin.bottom + rowGap * (rowCount - 1)
  );
  const plotWidth = width - margin.left - margin.right;
  const topY = margin.top;
  const rowYs = new Map([[reference.title, topY]]);
  displayedComparisons.forEach((comparison, index) => {
    rowYs.set(comparison.title, topY + rowGap * (index + 1));
  });
  const lastComparison = displayedComparisons[displayedComparisons.length - 1] ?? null;
  const barHeight = rowCount > 7 ? 16 : 20;
  const referenceLayout = makeGenomeDisplayLayout(reference);
  const comparisonLayouts = new Map(displayedComparisons.map((comparison) => [
    comparison.title,
    makeGenomeDisplayLayout(comparison)
  ]));
  const maxContigGapBases = Math.max(
    referenceLayout.gapBases,
    ...[...comparisonLayouts.values()].map((layout) => layout.gapBases)
  );
  const sharedScaleLength = Math.max(
    referenceLayout.displayLength,
    ...[...comparisonLayouts.values()].map((layout) => layout.displayLength)
  );
  const referencePaintIntervals = makeLoomReferencePaintIntervals(referenceLayout, options);
  const referencePaintBlocks = makeLoomReferencePaintBlocks(reference, referencePaintIntervals);
  const comparisonBlocksByTitle = new Map(displayedComparisons.map((comparison) => [
    comparison.title,
    blocks.filter((block) => block.comparison === comparison.title)
  ]));
  const comparisonPaintSegmentsByTitle = makeLoomComparisonPaintSegments(
    comparisonBlocksByTitle,
    displayedComparisons,
    referencePaintIntervals
  );
  const allComparisonBlocks = displayedComparisons.flatMap((comparison) =>
    comparisonBlocksByTitle.get(comparison.title) ?? []
  );
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="${GENOME_COMPARISON_POSTER_CLASS}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Genome loom ribbon figure" data-plot-foundation="sms3-genome-comparison" data-plot-renderer="sms3-genome-comparison" data-layout="loom" data-art-style="genome-loom" data-alignment-engine="${escapeXml(options.alignmentEngine)}" data-color-mode="${escapeXml(loomColorMode === "reference" ? "reference-paint" : identityScale.mode)}" data-color-scheme="${escapeXml(options.colorScheme)}" data-loom-color-mode="${escapeXml(loomColorMode)}" data-identity-min="${escapeXml(identityScale.min)}" data-identity-max="${escapeXml(identityScale.max)}" data-show-axis="${options.showAxis ? "true" : "false"}" data-show-legend="${options.showLegend ? "true" : "false"}" data-show-reference-paint-legend="${showReferencePaintLegend ? "true" : "false"}" data-contig-gap-bases="${maxContigGapBases}" data-paint-block-gap-px="${LOOM_PAINT_BLOCK_GAP_PX}" data-comparison-count="${displayedComparisons.length}">`,
    "<style>",
    `${styleScope} .label{font:600 18px system-ui,sans-serif;fill:${LOOM_POSTER_TEXT}}`,
    `${styleScope} .small{font:12px system-ui,sans-serif;fill:${LOOM_POSTER_MUTED_TEXT}}`,
    `${styleScope} .axis-label{font:500 13px system-ui,sans-serif;fill:${LOOM_POSTER_AXIS};stroke:${LOOM_POSTER_BACKGROUND};stroke-width:1.8px;stroke-opacity:.78;paint-order:stroke;stroke-linejoin:round}`,
    `${styleScope} .axis{stroke:${LOOM_POSTER_AXIS};stroke-width:2;stroke-linecap:round}`,
    `${styleScope} .tick{stroke:${LOOM_POSTER_AXIS_SECONDARY};stroke-width:1.4;stroke-linecap:round}`,
    `${styleScope} .minor-tick{stroke:${LOOM_POSTER_AXIS_SECONDARY};stroke-width:.9;opacity:.56;stroke-linecap:round}`,
    `${styleScope} .loom-contig{stroke:#e5e7eb;stroke-width:.8;shape-rendering:crispEdges;opacity:.24}`,
    `${styleScope} .loom-contig-reference{opacity:.30}`,
    `${styleScope} .loom-paint-block{stroke:#ffffff;stroke-width:1.2;shape-rendering:crispEdges}`,
    `${styleScope} .loom-paint-reference{stroke-opacity:.82}`,
    `${styleScope} .loom-paint-comparison{stroke-opacity:.76}`,
    `${styleScope} .loom-ribbon{stroke:none;mix-blend-mode:normal}`,
    `${styleScope} .loom-ribbon-reverse{stroke:#f8fafc;stroke-width:.45;stroke-opacity:.16}`,
    `${styleScope} .legend{font:12px system-ui,sans-serif;fill:${LOOM_POSTER_MUTED_TEXT}}`,
    "</style>",
    makeIdentityGradientDefs("loom", options.colorScheme),
    `<rect width="${width}" height="${height}" fill="${LOOM_POSTER_BACKGROUND}"/>`
  ];

  if (options.showGenomeLabels) {
    parts.push(`<text class="label" data-role="genome-label" data-genome-role="reference" x="${margin.left - 24}" y="${topY + 6}" text-anchor="end">${escapeXml(truncateLabel(reference.title, 28))}</text>`);
    displayedComparisons.forEach((comparison) => {
      const y = rowYs.get(comparison.title) ?? topY;
      parts.push(`<text class="label" data-role="genome-label" data-genome-role="comparison" data-comparison="${escapeXml(comparison.title)}" x="${margin.left - 24}" y="${y + 6}" text-anchor="end">${escapeXml(truncateLabel(comparison.title, 28))}</text>`);
    });
  }

  const ribbonItems = makeLoomAdjacentRibbonItems({
    reference,
    displayedComparisons,
    comparisonPaintSegmentsByTitle,
    referenceLayout,
    comparisonLayouts,
    rowYs,
    marginLeft: margin.left,
    plotWidth,
    sharedScaleLength,
    loomColorMode,
    identityScale,
    colorScheme: options.colorScheme
  });

  for (const item of ribbonItems) {
    const path = makeLoomRibbonPath({
      topStart: item.topStart,
      topEnd: item.topEnd,
      topY: item.topY,
      bottomStart: item.bottomStart,
      bottomEnd: item.bottomEnd,
      bottomY: item.bottomY,
      barHeight,
      strand: item.strand
    });
    parts.push(`<path class="loom-ribbon ${item.strand === "-" ? "loom-ribbon-reverse" : "loom-ribbon-direct"}" d="${path}" fill="${escapeXml(item.color)}" fill-opacity="${item.opacity}" data-upper-genome="${escapeXml(item.upperGenome)}" data-lower-genome="${escapeXml(item.lowerGenome)}" data-upper-row-index="${item.upperRowIndex}" data-lower-row-index="${item.lowerRowIndex}" data-row-distance="${item.lowerRowIndex - item.upperRowIndex}" data-comparison="${escapeXml(item.lowerGenome)}" data-reference-origin="${escapeXml(item.paint.origin)}" data-reference-start="${Math.floor(item.referenceStart)}" data-reference-end="${Math.ceil(item.referenceEnd)}" data-comparison-start="${Math.floor(item.comparisonStart)}" data-comparison-end="${Math.ceil(item.comparisonEnd)}" data-strand="${escapeXml(item.strand)}"><title>${escapeXml(`${item.upperGenome} to ${item.lowerGenome} ${item.strand} reference ${formatPosition(Math.floor(item.referenceStart) + 1)}-${formatPosition(Math.ceil(item.referenceEnd))}; lower row ${formatPosition(Math.floor(item.comparisonStart) + 1)}-${formatPosition(Math.ceil(item.comparisonEnd))}; ${round(item.identity, 2)}% identity${loomColorMode === "reference" ? `; reference paint ${item.paint.origin}` : ""}`)}</title></path>`);
  }

  renderLoomGenomeRow(parts, {
    genome: reference,
    layout: referenceLayout,
    x: margin.left,
    y: topY,
    width: plotWidth,
    barHeight,
    rowRole: "reference",
    scaleLength: sharedScaleLength
  });
  if (loomColorMode === "reference") {
    renderLoomPaintBlocks(parts, {
      blocks: referencePaintBlocks,
      layout: referenceLayout,
      x: margin.left,
      y: topY,
      width: plotWidth,
      barHeight,
      rowRole: "reference",
      scaleLength: sharedScaleLength
    });
  }
  for (const comparison of displayedComparisons) {
    const comparisonLayout = comparisonLayouts.get(comparison.title);
    const y = rowYs.get(comparison.title);
    if (!comparisonLayout || !Number.isFinite(y)) continue;
    renderLoomGenomeRow(parts, {
      genome: comparison,
      layout: comparisonLayout,
      x: margin.left,
      y,
      width: plotWidth,
      barHeight,
      rowRole: "comparison",
      scaleLength: sharedScaleLength
    });
    if (loomColorMode === "reference") {
      const comparisonPaintBlocks = (comparisonPaintSegmentsByTitle.get(comparison.title) ?? [])
        .map((segment) => makeLoomComparisonPaintBlock(segment))
        .sort((a, b) => (b.end - b.start) - (a.end - a.start));
      renderLoomPaintBlocks(parts, {
        blocks: comparisonPaintBlocks,
        layout: comparisonLayout,
        x: margin.left,
        y,
        width: plotWidth,
        barHeight,
        rowRole: "comparison",
        scaleLength: sharedScaleLength
      });
    }
  }

  if (options.showAxis) {
    renderLoomAxis(parts, {
      layout: referenceLayout,
      x: margin.left,
      y: topY - barHeight / 2,
      width: plotWidth,
      placement: "top",
      scaleLength: sharedScaleLength
    });
    if (lastComparison) {
      const lastLayout = comparisonLayouts.get(lastComparison.title);
      const lastY = rowYs.get(lastComparison.title);
      if (lastLayout && Number.isFinite(lastY)) {
        renderLoomAxis(parts, {
          layout: lastLayout,
          x: margin.left,
          y: lastY + barHeight / 2,
          width: plotWidth,
          placement: "bottom",
          scaleLength: sharedScaleLength
        });
      }
    }
  }

  if (showReferencePaintLegend) {
    renderLoomReferencePaintLegend(parts, {
      x: margin.left,
      y: height - 118,
      width: plotWidth,
      intervals: referencePaintIntervals
    });
  } else if (options.showLegend) {
    renderIdentityLegend(parts, {
      x: margin.left,
      y: height - 112,
      width: 320,
      scale: identityScale,
      layout: "loom",
      showReverse: allComparisonBlocks.some((block) => block.strand === "-"),
      colorScheme: options.colorScheme
    });
  }

  if (allComparisonBlocks.length === 0) {
    const y = topY + rowGap / 2;
    parts.push(`<text class="small" x="${margin.left}" y="${y}" dominant-baseline="middle">No alignment blocks passed the current filters for the displayed comparison genomes.</text>`);
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function renderLinearGenomeComparisonPosterSvg({
  reference,
  comparisons,
  blocks,
  summaryRows,
  options,
  identityScale,
  warnings = []
}) {
  const segments = makeReferenceSegments(reference.sequence.length, options);
  const width = 1200;
  const labelGutter = options.showGenomeLabels ? 240 : 46;
  const margin = {
    left: labelGutter,
    right: 46,
    top: options.showAxis ? 84 : 48,
    bottom: options.showLegend ? 118 : 48
  };
  const plotWidth = width - margin.left - margin.right;
  const height = options.layout === "wrapped" ? 1700 : 1700;
  const segmentGap = options.layout === "wrapped" ? (options.showAxis ? 36 : 22) : 0;
  const segmentHeaderHeight = options.showAxis ? 44 : 0;
  const availableHeight = height - margin.top - margin.bottom - Math.max(0, segments.length - 1) * segmentGap;
  const segmentHeight = Math.max(12, availableHeight / Math.max(1, segments.length));
  const rowAreaHeight = Math.max(1, segmentHeight - segmentHeaderHeight);
  const rowCount = Math.max(1, comparisons.length);
  const rowGap = rowCount > 1
    ? Math.min(18, Math.max(8, rowAreaHeight * 0.018))
    : 0;
  const rowHeight = Math.max(4, (rowAreaHeight - rowGap * Math.max(0, rowCount - 1)) / rowCount);
  const trackHeight = rowHeight;
  const styleScope = genomeComparisonPosterStyleScope(options.layout);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="${GENOME_COMPARISON_POSTER_CLASS}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Genome comparison poster" data-plot-foundation="sms3-genome-comparison" data-plot-renderer="sms3-genome-comparison" data-layout="${escapeXml(options.layout)}" data-art-style="genome-artistry" data-alignment-engine="${escapeXml(options.alignmentEngine)}" data-color-mode="${escapeXml(identityScale.mode)}" data-color-scheme="${escapeXml(options.colorScheme)}" data-identity-min="${escapeXml(identityScale.min)}" data-identity-max="${escapeXml(identityScale.max)}" data-show-axis="${options.showAxis ? "true" : "false"}" data-show-legend="${options.showLegend ? "true" : "false"}" data-row-gap="${round(rowGap, 2)}" data-segment-header-height="${round(segmentHeaderHeight, 2)}">`,
    "<style>",
    `${styleScope} .label{font:600 12px system-ui,sans-serif;fill:${ART_POSTER_TEXT}}`,
    `${styleScope} .small{font:11px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}}`,
    `${styleScope} .axis-label{font:500 12px system-ui,sans-serif;fill:${ART_POSTER_AXIS};stroke:${ART_POSTER_BACKGROUND};stroke-width:1.6px;stroke-opacity:.78;paint-order:stroke;stroke-linejoin:round}`,
    `${styleScope} .axis{stroke:${ART_POSTER_AXIS};stroke-width:1.4}`,
    `${styleScope} .tick{stroke:${ART_POSTER_AXIS_SECONDARY};stroke-width:1}`,
    `${styleScope} .minor-tick{stroke:${ART_POSTER_AXIS_SECONDARY};stroke-width:.8;opacity:.55}`,
    `${styleScope} .track{fill:${ART_POSTER_NO_HIT}}`,
    `${styleScope} .block{stroke:none}`,
    `${styleScope} .ga-linear-row,${styleScope} .ga-linear-block{shape-rendering:crispEdges}`,
    `${styleScope} .legend{font:12px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}}`,
    "</style>",
    makeIdentityGradientDefs(options.layout, options.colorScheme),
    `<rect width="${width}" height="${height}" fill="${ART_POSTER_BACKGROUND}"/>`
  ];

  segments.forEach((segment, segmentIndex) => {
    const y0 = margin.top + segmentIndex * (segmentHeight + segmentGap);
    const axisY = y0 + 20;
    const segmentDisplayLength = Math.max(1, Number(segment.displayLength) || segment.end - segment.start);
    const segmentWidth = Math.max(1, Math.min(plotWidth, plotWidth * ((segment.end - segment.start) / segmentDisplayLength)));
    const scale = (position) => margin.left + ((position - segment.start) / segmentDisplayLength) * plotWidth;
    parts.push(`<g data-segment-index="${segmentIndex + 1}" data-segment-start="${segment.start + 1}" data-segment-end="${segment.end}">`);
    if (options.showAxis) {
      parts.push(`<line class="axis" x1="${margin.left}" x2="${(margin.left + segmentWidth).toFixed(2)}" y1="${axisY}" y2="${axisY}"/>`);
      const { majorTicks, minorTicks } = options.layout === "wrapped"
        ? makeWrappedAxisTicks(reference.sequence.length, segment)
        : makePosterAxisTicks(segment.start + 1, segment.end, 4, 16);
      for (const tick of minorTicks) {
        const x = scale(tick - 1);
        parts.push(`<line class="minor-tick" x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${axisY - 4}" y2="${axisY + 4}"/>`);
      }
      for (const tick of majorTicks) {
        const x = scale(tick - 1);
        parts.push(`<line class="tick" x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${axisY - 6}" y2="${axisY + 6}"/>`);
        parts.push(`<text class="axis-label" x="${x.toFixed(2)}" y="${axisY - 14}" text-anchor="middle">${escapeXml(formatPosition(tick))}</text>`);
      }
    }

    comparisons.forEach((comparison, comparisonIndex) => {
      const rowTop = y0 + segmentHeaderHeight + comparisonIndex * (rowHeight + rowGap);
      if (options.showGenomeLabels) {
        parts.push(`<text class="label" data-role="genome-label" data-genome-role="comparison" data-comparison="${escapeXml(comparison.title)}" x="${margin.left - 14}" y="${(rowTop + rowHeight / 2).toFixed(2)}" text-anchor="end" dominant-baseline="middle">${escapeXml(truncateLabel(comparison.title, 26))}</text>`);
      }
      parts.push(`<rect class="track ga-linear-row" x="${margin.left}" y="${rowTop.toFixed(2)}" width="${segmentWidth.toFixed(2)}" height="${trackHeight.toFixed(2)}"/>`);
      const comparisonBlocks = blocks
        .filter((block) => block.comparison === comparison.title)
        .map((block) => clipBlockToSegment(block, segment))
        .filter(Boolean);
      for (const block of comparisonBlocks) {
        const x = scale(block.clippedReferenceStart);
        const blockWidth = Math.max(2, scale(block.clippedReferenceEnd) - x);
        const y = rowTop;
        const color = identityColor(block.identity, block.strand, identityScale, options.colorScheme);
        parts.push(`<rect class="block ga-linear-block" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${blockWidth.toFixed(2)}" height="${trackHeight.toFixed(2)}" fill="${color}" data-comparison="${escapeXml(block.comparison)}" data-strand="${escapeXml(block.strand)}"><title>${escapeXml(`${block.comparison} ${block.strand} ${block.referenceStart + 1}-${block.referenceEnd}; ${round(block.identity, 2)}% identity`)}</title></rect>`);
      }
    });
    parts.push("</g>");
  });

  if (options.showLegend) {
    renderIdentityLegend(parts, {
      x: 34,
      y: height - 84,
      width: 320,
      scale: identityScale,
      layout: options.layout,
      showReverse: blocks.some((block) => block.strand === "-"),
      colorScheme: options.colorScheme
    });
  }
  parts.push("</svg>");
  return parts.join("\n");
}

function polarPoint(cx, cy, radius, angleRadians) {
  return {
    x: cx + Math.sin(angleRadians) * radius,
    y: cy - Math.cos(angleRadians) * radius
  };
}

function annularSectorPath(cx, cy, innerRadius, outerRadius, startFraction, endFraction) {
  const startAngle = clamp(startFraction, 0, 1) * Math.PI * 2;
  const endAngle = clamp(endFraction, 0, 1) * Math.PI * 2;
  const span = Math.max(0, endAngle - startAngle);
  if (span <= 0) return "";
  const largeArc = span > Math.PI ? 1 : 0;
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius.toFixed(2)} ${outerRadius.toFixed(2)} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius.toFixed(2)} ${innerRadius.toFixed(2)} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z"
  ].join(" ");
}

function tangentLabelRotation(angleRadians) {
  let degrees = ((angleRadians * 180) / Math.PI) % 360;
  if (degrees < 0) degrees += 360;
  if (degrees > 90 && degrees < 270) {
    degrees += 180;
  }
  return degrees;
}

function tangentLabelTransform(point, angleRadians) {
  return `rotate(${tangentLabelRotation(angleRadians).toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)})`;
}

function spiralAxisPolylinePoints({ cx, cy, maxU, rStartCenter, radialPerRadian, ribbonWidth, offset = 12, pointCount = 720 }) {
  const points = [];
  const count = Math.max(2, pointCount);
  for (let index = 0; index < count; index += 1) {
    const fraction = count === 1 ? 0 : index / (count - 1);
    const u = maxU * fraction;
    const centerRadius = rStartCenter - radialPerRadian * u;
    const radius = centerRadius + ribbonWidth / 2 + offset;
    points.push(polarPoint(cx, cy, radius, u));
  }
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function spiralTangentRotation(u, radius, radialPerRadian) {
  const dx = -radialPerRadian * Math.sin(u) + radius * Math.cos(u);
  const dy = radialPerRadian * Math.cos(u) + radius * Math.sin(u);
  let degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (degrees < 0) degrees += 360;
  if (degrees > 90 && degrees < 270) {
    degrees += 180;
  }
  return degrees;
}

function spiralTangentLabelTransform(point, u, radius, radialPerRadian) {
  return `rotate(${spiralTangentRotation(u, radius, radialPerRadian).toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)})`;
}

function makeSpiralPolygonPoints({
  cx,
  cy,
  startU,
  endU,
  stripOffset,
  stripWidth,
  ribbonWidth,
  rStartCenter,
  radialPerRadian,
  pointCount
}) {
  const forward = [];
  const reverse = [];
  const count = Math.max(2, pointCount);
  for (let index = 0; index < count; index += 1) {
    const fraction = count === 1 ? 0 : index / (count - 1);
    const u = startU + (endU - startU) * fraction;
    const centerRadius = rStartCenter - radialPerRadian * u;
    const innerRadius = centerRadius - ribbonWidth / 2 + stripOffset;
    const outerRadius = innerRadius + stripWidth;
    forward.push(polarPoint(cx, cy, outerRadius, u));
    reverse.push(polarPoint(cx, cy, innerRadius, u));
  }
  return [...forward, ...reverse.reverse()]
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

function renderCircularGenomeComparisonPosterSvg({
  reference,
  comparisons,
  blocks,
  summaryRows,
  options,
  identityScale,
  warnings = []
}) {
  const width = 1120;
  const height = 1120;
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = options.showAxis ? 450 : 512;
  const innerRadius = outerRadius * 0.28;
  const ringPitch = (outerRadius - innerRadius) / Math.max(1, comparisons.length);
  const ringThickness = ringPitch * 0.68;
  const referenceLength = Math.max(1, reference.sequence.length);
  const styleScope = genomeComparisonPosterStyleScope("circular");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="${GENOME_COMPARISON_POSTER_CLASS}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Circular genome comparison poster" data-plot-foundation="sms3-genome-comparison" data-plot-renderer="sms3-genome-comparison" data-layout="circular" data-art-style="genome-artistry" data-alignment-engine="${escapeXml(options.alignmentEngine)}" data-color-mode="${escapeXml(identityScale.mode)}" data-color-scheme="${escapeXml(options.colorScheme)}" data-identity-min="${escapeXml(identityScale.min)}" data-identity-max="${escapeXml(identityScale.max)}" data-show-axis="${options.showAxis ? "true" : "false"}" data-show-legend="${options.showLegend ? "true" : "false"}">`,
    "<style>",
    `${styleScope} .label{font:600 12px system-ui,sans-serif;fill:${ART_POSTER_TEXT}}`,
    `${styleScope} .small{font:11px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}}`,
    `${styleScope} .axis-label{font:500 12px system-ui,sans-serif;fill:${ART_POSTER_AXIS};stroke:${ART_POSTER_BACKGROUND};stroke-width:1.6px;stroke-opacity:.78;paint-order:stroke;stroke-linejoin:round}`,
    `${styleScope} .axis{stroke:${ART_POSTER_AXIS};stroke-width:2;fill:none}`,
    `${styleScope} .tick{stroke:${ART_POSTER_AXIS_SECONDARY};stroke-width:1.2}`,
    `${styleScope} .minor-tick{stroke:${ART_POSTER_AXIS_SECONDARY};stroke-width:.8;opacity:.55}`,
    `${styleScope} .ga-circular-slot-boundary{stroke:#f8fafc;stroke-width:1.35;opacity:.55;fill:none}`,
    `${styleScope} .ga-circular-block-full{fill:none;stroke-linecap:butt}`,
    `${styleScope} .ga-circular-track-index{font:750 16px system-ui,sans-serif;fill:${ART_POSTER_BACKGROUND};stroke:${ART_POSTER_TEXT};stroke-width:2.8px;paint-order:stroke;stroke-linejoin:round}`,
    `${styleScope} .ga-circular-track-key-title{font:750 13px system-ui,sans-serif;fill:${ART_POSTER_TEXT}}`,
    `${styleScope} .ga-circular-track-key-row{font:600 12px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}}`,
    `${styleScope} .ga-circular-track-key-index{font:750 11px system-ui,sans-serif;fill:${ART_POSTER_BACKGROUND}}`,
    `${styleScope} .legend{font:12px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}}`,
    "</style>",
    makeIdentityGradientDefs("circular", options.colorScheme),
    `<rect width="${width}" height="${height}" fill="${ART_POSTER_BACKGROUND}"/>`
  ];

  if (options.showAxis) {
    parts.push(`<circle class="axis" cx="${cx}" cy="${cy}" r="${(outerRadius + 26).toFixed(2)}"/>`);
    const { majorTicks, minorTicks } = makePosterAxisTicks(
      1,
      referenceLength,
      CIRCULAR_AXIS_MAJOR_TICK_TARGET,
      CIRCULAR_AXIS_MINOR_TICK_TARGET
    );
    const axisMajorTicks = majorTicks.filter((tick, index, allTicks) => {
      return !(index === allTicks.length - 1 && tick >= referenceLength && referenceLength > 80);
    });
    const majorSet = new Set(axisMajorTicks);
    const axisMinorTicks = minorTicks.filter((tick) => !majorSet.has(tick) && !(tick >= referenceLength && referenceLength > 80));
    for (const tick of axisMinorTicks) {
      const fraction = (tick - 1) / referenceLength;
      const angle = fraction * Math.PI * 2;
      const inner = polarPoint(cx, cy, outerRadius + 15, angle);
      const outer = polarPoint(cx, cy, outerRadius + 31, angle);
      parts.push(`<line class="minor-tick" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}"/>`);
    }
    for (const tick of axisMajorTicks) {
      const fraction = (tick - 1) / referenceLength;
      const angle = fraction * Math.PI * 2;
      const inner = polarPoint(cx, cy, outerRadius + 13, angle);
      const outer = polarPoint(cx, cy, outerRadius + 37, angle);
      const label = polarPoint(cx, cy, outerRadius + 62, angle);
      parts.push(`<line class="tick" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}"/>`);
      parts.push(`<text class="axis-label" x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" transform="${tangentLabelTransform(label, angle)}">${escapeXml(formatPosition(tick))}</text>`);
    }
  }

  comparisons.forEach((comparison, comparisonIndex) => {
    const radius = innerRadius + comparisonIndex * ringPitch + ringPitch / 2;
    const slotInnerRadius = Math.max(0, radius - ringThickness / 2);
    const slotOuterRadius = radius + ringThickness / 2;
    parts.push(`<circle class="ga-circular-ring ga-circular-slot" data-role="comparison-slot" data-comparison-index="${comparisonIndex + 1}" cx="${cx}" cy="${cy}" r="${radius.toFixed(2)}" fill="none" stroke="${ART_POSTER_NO_HIT}" stroke-width="${ringThickness.toFixed(2)}" stroke-linecap="butt" style="fill:none;stroke:${ART_POSTER_NO_HIT};stroke-width:${ringThickness.toFixed(2)};stroke-linecap:butt"><title>${escapeXml(`${comparisonIndex + 1}. ${comparison.title}`)}</title></circle>`);
    parts.push(`<circle class="ga-circular-slot-boundary" data-role="comparison-slot-boundary" data-comparison-index="${comparisonIndex + 1}" cx="${cx}" cy="${cy}" r="${slotInnerRadius.toFixed(2)}" fill="none" stroke="#f8fafc" stroke-width="1.35" opacity=".55"/>`);
    parts.push(`<circle class="ga-circular-slot-boundary" data-role="comparison-slot-boundary" data-comparison-index="${comparisonIndex + 1}" cx="${cx}" cy="${cy}" r="${slotOuterRadius.toFixed(2)}" fill="none" stroke="#f8fafc" stroke-width="1.35" opacity=".55"/>`);

    for (const block of blocks.filter((item) => item.comparison === comparison.title)) {
      const start = clamp(block.referenceStart / referenceLength, 0, 1);
      const end = clamp(block.referenceEnd / referenceLength, 0, 1);
      if (end <= start) continue;
      const color = identityColor(block.identity, block.strand, identityScale, options.colorScheme);
      if (end - start >= 0.999) {
        parts.push(`<circle class="ga-circular-block ga-circular-block-full" cx="${cx}" cy="${cy}" r="${radius.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${ringThickness.toFixed(2)}" stroke-linecap="butt" data-comparison="${escapeXml(block.comparison)}" data-strand="${escapeXml(block.strand)}"><title>${escapeXml(`${block.comparison} ${block.strand} ${block.referenceStart + 1}-${block.referenceEnd}; ${round(block.identity, 2)}% identity`)}</title></circle>`);
      } else {
        const path = annularSectorPath(
          cx,
          cy,
          slotInnerRadius,
          slotOuterRadius,
          start,
          end
        );
        if (path) {
          parts.push(`<path class="ga-circular-block" d="${path}" fill="${color}" stroke="none" data-comparison="${escapeXml(block.comparison)}" data-strand="${escapeXml(block.strand)}"><title>${escapeXml(`${block.comparison} ${block.strand} ${block.referenceStart + 1}-${block.referenceEnd}; ${round(block.identity, 2)}% identity`)}</title></path>`);
        }
      }
    }
    const indexLabelPoint = polarPoint(cx, cy, radius, -Math.PI / 2);
    parts.push(`<circle class="ga-circular-track-index-badge" data-role="comparison-track-index-badge" data-comparison-index="${comparisonIndex + 1}" cx="${indexLabelPoint.x.toFixed(2)}" cy="${indexLabelPoint.y.toFixed(2)}" r="14" fill="${ART_POSTER_TEXT}" fill-opacity=".95" stroke="${ART_POSTER_BACKGROUND}" stroke-width="2"/>`);
    parts.push(`<text class="ga-circular-track-index" data-role="comparison-track-index" data-comparison-index="${comparisonIndex + 1}" x="${indexLabelPoint.x.toFixed(2)}" y="${indexLabelPoint.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" style="font:750 16px system-ui,sans-serif;fill:${ART_POSTER_BACKGROUND};stroke:${ART_POSTER_TEXT};stroke-width:2.8px;paint-order:stroke;stroke-linejoin:round"><title>${escapeXml(`${comparisonIndex + 1}. ${comparison.title}`)}</title>${comparisonIndex + 1}</text>`);
  });

  if (comparisons.length > 1) {
    const visibleKeyRows = comparisons.slice(0, 6);
    const keyX = cx - 96;
    const keyY = cy - 54;
    parts.push(`<g class="ga-circular-track-key" data-role="comparison-track-key" aria-label="Comparison tracks" pointer-events="none">`);
    parts.push(`<text class="ga-circular-track-key-title" x="${keyX}" y="${keyY}" style="font:750 13px system-ui,sans-serif;fill:${ART_POSTER_TEXT}">Comparison tracks</text>`);
    visibleKeyRows.forEach((comparison, comparisonIndex) => {
      const rowY = keyY + 22 + comparisonIndex * 20;
      parts.push(`<circle data-role="comparison-track-key-badge" cx="${keyX + 8}" cy="${rowY - 4}" r="7" fill="${ART_POSTER_TEXT}" fill-opacity=".95"/>`);
      parts.push(`<text class="ga-circular-track-key-index" x="${keyX + 8}" y="${rowY - 4}" text-anchor="middle" dominant-baseline="middle" style="font:750 11px system-ui,sans-serif;fill:${ART_POSTER_BACKGROUND}">${comparisonIndex + 1}</text>`);
      parts.push(`<text class="ga-circular-track-key-row" x="${keyX + 24}" y="${rowY}" style="font:600 12px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}">${escapeXml(truncateLabel(comparison.title, 23))}</text>`);
    });
    if (comparisons.length > visibleKeyRows.length) {
      parts.push(`<text class="ga-circular-track-key-row" x="${keyX + 24}" y="${keyY + 22 + visibleKeyRows.length * 20}" style="font:600 12px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}">+${comparisons.length - visibleKeyRows.length} more</text>`);
    }
    parts.push("</g>");
  }

  if (options.showLegend) {
    renderIdentityLegend(parts, {
      x: 54,
      y: height - 92,
      width: 260,
      scale: identityScale,
      layout: "circular",
      showReverse: blocks.some((block) => block.strand === "-"),
      colorScheme: options.colorScheme
    });
  }
  parts.push("</svg>");
  return parts.join("\n");
}

function renderSpiralGenomeComparisonPosterSvg({
  reference,
  comparisons,
  blocks,
  summaryRows,
  options,
  identityScale,
  warnings = []
}) {
  const width = 1200;
  const height = 1200;
  const cx = width / 2;
  const cy = height / 2;
  const drawingRadius = Math.min(width, height) / 2;
  const rMax = drawingRadius * (options.showAxis ? 0.82 : 0.96);
  const rMin = rMax * 0.15;
  const turnCount = 4;
  const gapFraction = 0.25;
  const pitch = (rMax - rMin) / (turnCount + 1 - gapFraction);
  const ribbonWidth = pitch * (1 - gapFraction);
  const stripWidth = ribbonWidth / Math.max(1, comparisons.length);
  const radialPerRadian = pitch / (Math.PI * 2);
  const rStartCenter = rMax - ribbonWidth / 2;
  const maxU = Math.PI * 2 * turnCount;
  const referenceLength = Math.max(1, reference.sequence.length);
  const styleScope = genomeComparisonPosterStyleScope("spiral");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="${GENOME_COMPARISON_POSTER_CLASS}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Spiral genome comparison poster" data-plot-foundation="sms3-genome-comparison" data-plot-renderer="sms3-genome-comparison" data-layout="spiral" data-art-style="genome-artistry" data-alignment-engine="${escapeXml(options.alignmentEngine)}" data-color-mode="${escapeXml(identityScale.mode)}" data-color-scheme="${escapeXml(options.colorScheme)}" data-identity-min="${escapeXml(identityScale.min)}" data-identity-max="${escapeXml(identityScale.max)}" data-show-axis="${options.showAxis ? "true" : "false"}" data-show-legend="${options.showLegend ? "true" : "false"}">`,
    "<style>",
    `${styleScope} .label{font:600 12px system-ui,sans-serif;fill:${ART_POSTER_TEXT}}`,
    `${styleScope} .small{font:11px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}}`,
    `${styleScope} .axis-label{font:500 12px system-ui,sans-serif;fill:${ART_POSTER_AXIS};stroke:${ART_POSTER_BACKGROUND};stroke-width:1.6px;stroke-opacity:.78;paint-order:stroke;stroke-linejoin:round}`,
    `${styleScope} .tick{stroke:${ART_POSTER_AXIS};stroke-width:1.2;stroke-linecap:round}`,
    `${styleScope} .minor-tick{stroke:${ART_POSTER_AXIS_SECONDARY};stroke-width:.8;opacity:.58;stroke-linecap:round}`,
    `${styleScope} .axis{stroke:${ART_POSTER_AXIS_SECONDARY};stroke-width:1;fill:none;opacity:.55}`,
    `${styleScope} .track{fill:${ART_POSTER_NO_HIT};stroke:none}`,
    `${styleScope} .block{stroke:none}`,
    `${styleScope} .legend{font:12px system-ui,sans-serif;fill:${ART_POSTER_MUTED_TEXT}}`,
    "</style>",
    makeIdentityGradientDefs("spiral", options.colorScheme),
    `<rect width="${width}" height="${height}" fill="${ART_POSTER_BACKGROUND}"/>`
  ];

  comparisons.forEach((comparison, comparisonIndex) => {
    const stripOffset = comparisonIndex * stripWidth;
    const backgroundPoints = makeSpiralPolygonPoints({
      cx,
      cy,
      startU: 0,
      endU: maxU,
      stripOffset,
      stripWidth,
      ribbonWidth,
      rStartCenter,
      radialPerRadian,
      pointCount: 1200
    });
    parts.push(`<polygon class="track ga-spiral-strip" points="${backgroundPoints}"><title>${escapeXml(`${comparisonIndex + 1}. ${comparison.title}`)}</title></polygon>`);

    for (const block of blocks.filter((item) => item.comparison === comparison.title)) {
      const startU = clamp(block.referenceStart / referenceLength, 0, 1) * maxU;
      const endU = clamp(block.referenceEnd / referenceLength, 0, 1) * maxU;
      if (endU <= startU) continue;
      const pointCount = clamp(Math.ceil(((endU - startU) / (Math.PI * 2)) * 220), 6, 1200);
      const points = makeSpiralPolygonPoints({
        cx,
        cy,
        startU,
        endU,
        stripOffset,
        stripWidth,
        ribbonWidth,
        rStartCenter,
        radialPerRadian,
        pointCount
      });
      parts.push(`<polygon class="block ga-spiral-block" points="${points}" fill="${identityColor(block.identity, block.strand, identityScale, options.colorScheme)}" data-comparison="${escapeXml(block.comparison)}" data-strand="${escapeXml(block.strand)}"><title>${escapeXml(`${block.comparison} ${block.strand} ${block.referenceStart + 1}-${block.referenceEnd}; ${round(block.identity, 2)}% identity`)}</title></polygon>`);
    }

    if (options.showGenomeLabels) {
      const labelRadius = rStartCenter - ribbonWidth / 2 + stripOffset + stripWidth / 2;
      const labelPoint = polarPoint(cx, cy, labelRadius, 0);
      parts.push(`<text class="label" data-role="genome-label" data-genome-role="comparison" data-comparison="${escapeXml(comparison.title)}" x="${(labelPoint.x - 10).toFixed(2)}" y="${labelPoint.y.toFixed(2)}" text-anchor="end" dominant-baseline="middle">${escapeXml(truncateLabel(comparison.title, 36))}</text>`);
    }
  });

  if (options.showAxis) {
    const { majorTicks, minorTicks } = makePosterAxisTicks(1, referenceLength, 4, 18);
    const axisOffset = pitch * gapFraction * 0.46;
    const majorLength = pitch * gapFraction * 0.22;
    const minorLength = pitch * gapFraction * 0.11;
    const labelOffset = pitch * gapFraction * 0.54;
    parts.push(`<polyline class="axis" points="${spiralAxisPolylinePoints({ cx, cy, maxU, rStartCenter, radialPerRadian, ribbonWidth, offset: axisOffset })}"/>`);
    for (const tick of minorTicks) {
      const u = ((tick - 1) / referenceLength) * maxU;
      const centerRadius = rStartCenter - radialPerRadian * u;
      const outerRadius = centerRadius + ribbonWidth / 2;
      const inner = polarPoint(cx, cy, outerRadius + axisOffset - minorLength / 2, u);
      const outer = polarPoint(cx, cy, outerRadius + axisOffset + minorLength / 2, u);
      parts.push(`<line class="minor-tick" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}"/>`);
    }
    for (const tick of majorTicks) {
      const u = ((tick - 1) / referenceLength) * maxU;
      const centerRadius = rStartCenter - radialPerRadian * u;
      const outerRadius = centerRadius + ribbonWidth / 2;
      const inner = polarPoint(cx, cy, outerRadius + axisOffset - majorLength / 2, u);
      const outer = polarPoint(cx, cy, outerRadius + axisOffset + majorLength / 2, u);
      const label = polarPoint(cx, cy, outerRadius + labelOffset, u);
      parts.push(`<line class="tick" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}"/>`);
      parts.push(`<text class="axis-label" x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" transform="${spiralTangentLabelTransform(label, u, outerRadius, radialPerRadian)}">${escapeXml(formatPosition(tick))}</text>`);
    }
  }

  if (options.showLegend) {
    renderIdentityLegend(parts, {
      x: 54,
      y: height - 92,
      width: 260,
      scale: identityScale,
      layout: "spiral",
      showReverse: blocks.some((block) => block.strand === "-"),
      colorScheme: options.colorScheme
    });
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export function formatGenomeComparisonReport({
  reference,
  comparisons,
  blocks,
  summaryRows,
  warnings = [],
  engineMessage,
  command,
  options
}) {
  const lines = [
    "Genome Comparison Poster",
    "",
    `Reference: ${reference.title} (${genomeBaseLength(reference).toLocaleString()} bp${reference.recordCount > 1 ? ` across ${reference.recordCount.toLocaleString()} records` : ""})`,
    `Comparison genomes: ${comparisons.length.toLocaleString()}`,
    `Alignment method: ${engineMessage}`,
    command ? `Command: ${command}` : "",
    options ? `Poster: ${options.layout}; comparison order ${options.sortOrder}; block style ${options.alignmentBlockStyle}; color scale ${options.layout === "loom" ? options.loomColorMode : options.colorMode}; color scheme ${getIdentityColorScheme(options.colorScheme).label}.` : "",
    options ? `Filters: minimum identity ${options.minIdentityPercent}%; minimum block length ${options.minBlockLength.toLocaleString()} bp; minimum MAPQ ${options.minMapq}; reverse-complement blocks ${options.includeReverseComplement ? "shown" : "hidden"}.` : "",
    `Alignment blocks kept: ${blocks.length.toLocaleString()}`,
    "",
    "Comparison summary"
  ].filter((line) => line !== "");

  for (const row of summaryRows) {
    lines.push(
      `${row.comparison}: ${row.block_count} block(s), ${row.aligned_reference_bp.toLocaleString()} aligned reference bp, ${row.reference_coverage_percent}% reference coverage, ${row.mean_identity_percent || "no"} mean identity`
    );
  }

  if (warnings.length > 0) {
    lines.push("", "Warnings");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function calculateGenomeComparisonPoster(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.04 });
  const parsed = parseGenomeComparisonInput(input, options);
  const normalized = parsed.options;
  const warnings = [...parsed.warnings];

  let alignmentResult;
  if (normalized.alignmentEngine === "minimap2") {
    alignmentResult = await runBioWasmMinimap2(parsed.reference, parsed.comparisons, normalized, context);
  } else {
    alignmentResult = await runExactBlockFallback(parsed.reference, parsed.comparisons, normalized, context);
  }

  context.reportProgress?.({ phase: "formatting-output", progress: 0.92 });
  const blocks = filterGenomeComparisonBlocks(alignmentResult.blocks, normalized, warnings);
  const unsortedSummaryRows = makeSummaryRows(parsed.reference, parsed.comparisons, blocks);
  const ordered = sortComparisonResults(parsed.comparisons, unsortedSummaryRows, normalized.sortOrder);
  const summaryRows = ordered.summaryRows;
  const orderedBlocks = sortBlocksByComparisonOrder(blocks, ordered.comparisons);
  const blockRows = makeBlockRows(orderedBlocks);
  const blockTsv = `${exportDelimitedTable(genomeComparisonBlockColumns, blockRows, "\t")}\n`;
  const summaryTsv = `${exportDelimitedTable(genomeComparisonSummaryColumns, summaryRows, "\t")}\n`;
  const svg = renderGenomeComparisonPosterSvg({
    reference: parsed.reference,
    comparisons: ordered.comparisons,
    blocks: orderedBlocks,
    summaryRows,
    options: normalized,
    warnings
  });
  const report = formatGenomeComparisonReport({
    reference: parsed.reference,
    comparisons: ordered.comparisons,
    blocks: orderedBlocks,
    summaryRows,
    warnings,
    engineMessage: alignmentResult.engineMessage,
    command: alignmentResult.command,
    options: normalized
  });

  return {
    reference: parsed.reference,
    comparisons: ordered.comparisons,
    blocks: orderedBlocks,
    blockRows,
    summaryRows,
    blockTsv,
    summaryTsv,
    svg,
    report,
    warnings,
    options: normalized,
    engineMessage: alignmentResult.engineMessage
  };
}
