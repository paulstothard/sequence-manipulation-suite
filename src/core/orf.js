import { normalizeOrfOptions } from "./orf-options.js";
import { getGeneticCode, getStartCodons, getStopCodons, makeCodonMap } from "./genetic-code.js";
import { complementDnaRnaSequence } from "./sequence.js";
// NCBI alternative initiators are M in start-codon mode; ordinary codon
// translation is retained in any-codon mode. https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi
const FORWARD_FRAMES = [
  { label: "+1", strand: "+", offset: 0 },
  { label: "+2", strand: "+", offset: 1 },
  { label: "+3", strand: "+", offset: 2 }
];

const REVERSE_FRAMES = [
  { label: "-1", strand: "-", offset: 0 },
  { label: "-2", strand: "-", offset: 1 },
  { label: "-3", strand: "-", offset: 2 }
];
function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function normalizeSequence(sequence) {
  return String(sequence ?? "").toUpperCase().replaceAll("U", "T");
}

function translateCodon(codon, codonMap) {
  return codonMap.get(codon) ?? "X";
}

function getFrames(strandOption) {
  if (strandOption === "forward") {
    return FORWARD_FRAMES;
  }
  if (strandOption === "reverse") {
    return REVERSE_FRAMES;
  }
  return [...FORWARD_FRAMES, ...REVERSE_FRAMES];
}

function mapCoordinates(sequenceLength, frame, startIndex, endExclusive) {
  if (frame.strand === "+") {
    return {
      start: startIndex + 1,
      end: endExclusive
    };
  }

  return {
    start: sequenceLength - endExclusive + 1,
    end: sequenceLength - startIndex
  };
}

export const ORF_LIMITS = Object.freeze({
  maxInputCharacters: 5_000_000,
  maxOrfs: 100_000,
  maxRetainedCharacters: 25 * 1024 * 1024,
  maxOutputCharacters: 25 * 1024 * 1024
});

export function createOrfBudget() {
  let count = 0;
  let characters = 0;
  let titleLength = 0;
  return {
    setRecordTitle(title) { titleLength = String(title).length; },
    reserve(ntLength, aaLength) {
      count += 1;
      characters += ntLength + aaLength + titleLength;
      if (count > ORF_LIMITS.maxOrfs) throw new Error(`ORF candidates exceed the ${ORF_LIMITS.maxOrfs.toLocaleString("en-US")}-ORF limit. Raise the minimum length, select first-start mode, or use fewer records.`);
      if (characters > ORF_LIMITS.maxRetainedCharacters) throw new Error(`ORF sequences and record titles exceed the ${ORF_LIMITS.maxRetainedCharacters.toLocaleString("en-US")}-character retention limit. Select first-start mode, raise the minimum length, or use fewer records.`);
    }
  };
}

// Scan each codon once, storing start coordinates rather than growing a protein
// for every active nested start. Translate a qualifying segment once; reserve
// its complete result before slicing any nested sequence strings.
async function findFrameOrfs(sequence, frame, context, workerContext) {
  const orfs = [];
  let starts = [];
  let segmentStart = frame.offset;
  const endOfFrame = frame.offset + Math.max(0, Math.floor((sequence.length - frame.offset) / 3)) * 3;
  async function emit(endExclusive, stopCodon) {
    const proteinEnd = endExclusive - (stopCodon ? 3 : 0);
    const candidates = context.startMode === "any-codon" ? [segmentStart] : starts;
    const qualifying = [];
    for (const [i, startIndex] of candidates.entries()) {
      if (i % 1024 === 0) await workerContext.yieldIfNeeded?.();
      workerContext.throwIfCancelled?.();
      const aaLength = (proteinEnd - startIndex) / 3;
      if (aaLength < context.minimumAminoAcids) continue;
      context.budget.reserve(context.materializeSequences ? endExclusive - startIndex : 0, context.materializeSequences ? aaLength : 0);
      qualifying.push(startIndex);
    }
    if (!qualifying.length) return;
    const firstStart = qualifying[0];
    const parts = [];
    let chunk = "";
    for (let index = firstStart; context.materializeSequences && index < proteinEnd; index += 3) {
      if ((index - firstStart) % 24576 === 0) await workerContext.yieldIfNeeded?.();
      workerContext.throwIfCancelled?.();
      chunk += translateCodon(sequence.slice(index, index + 3), context.codonMap);
      if (chunk.length === 8192) { parts.push(chunk); chunk = ""; }
    }
    parts.push(chunk);
    const translated = parts.join("");
    for (const [i, startIndex] of qualifying.entries()) {
      if (i % 1024 === 0) await workerContext.yieldIfNeeded?.();
      const offset = (startIndex - firstStart) / 3;
      const protein = context.startMode === "start-codon" ? "M" + translated.slice(offset + 1) : translated.slice(offset);
      orfs.push({
        frame: frame.label, strand: frame.strand,
        ...mapCoordinates(context.sequenceLength, frame, startIndex, endExclusive),
        ntLength: endExclusive - startIndex, aaLength: (proteinEnd - startIndex) / 3,
        startCodon: sequence.slice(startIndex, startIndex + 3), stopCodon,
        complete: Boolean(stopCodon),
        ...(context.materializeSequences ? { nucleotide: sequence.slice(startIndex, endExclusive), protein } : {})
      });
    }
  }
  for (let index = frame.offset; index < endOfFrame; index += 3) {
    if ((index - frame.offset) % 24576 === 0) await workerContext.yieldIfNeeded?.();
    workerContext.throwIfCancelled?.();
    const codon = sequence.slice(index, index + 3);
    if (context.stopCodons.has(codon)) {
      await emit(index + 3, codon);
      starts = [];
      segmentStart = index + 3;
    } else if (context.startMode === "start-codon" && context.startCodons.has(codon)
      && (context.nestedMode === "all-starts" || starts.length === 0)) {
      starts.push(index);
    }
  }
  if (context.includePartial) await emit(endOfFrame, "");
  return orfs;
}

function sortOrfs(orfs, sortBy = "start") {
  const byStart = (left, right) =>
    left.start - right.start || left.end - right.end || left.frame.localeCompare(right.frame);
  const byFrame = (left, right) =>
    left.strand.localeCompare(right.strand) ||
    left.frame.localeCompare(right.frame) ||
    left.start - right.start ||
    left.end - right.end;

  return [...orfs].sort((left, right) => {
    if (sortBy === "length-desc") {
      return right.aaLength - left.aaLength || byStart(left, right);
    }
    if (sortBy === "frame") {
      return byFrame(left, right);
    }
    if (sortBy === "complete") {
      return Number(right.complete) - Number(left.complete) || byStart(left, right);
    }
    return byStart(left, right);
  });
}

export async function findOrfs(sequence, options = {}, workerContext = {}, budget = createOrfBudget(), materializeSequences = true) {
  options = normalizeOrfOptions(options);
  const normalized = normalizeSequence(sequence);
  const code = getGeneticCode(options.geneticCode ?? "1");
  const context = {
    codonMap: makeCodonMap(code),
    startCodons: getStartCodons(code),
    stopCodons: getStopCodons(code),
    includePartial: options.includePartial !== false,
    nestedMode: options.nestedMode === "all-starts" ? "all-starts" : "first-start",
    sequenceLength: normalized.length,
    minimumAminoAcids: options.minimumAminoAcids,
    startMode: options.startMode,
    budget,
    materializeSequences
  };
  const frames = getFrames(options.strand);
  const orfs = [];
  const reverse = options.strand === "forward" ? null : reverseComplement(normalized);

  for (const [index, frame] of frames.entries()) {
    await workerContext.yieldIfNeeded?.();
    const frameSequence = frame.strand === "-" ? reverse : normalized;
    const frameOrfs = await findFrameOrfs(frameSequence, frame, context, workerContext);
    for (const orf of frameOrfs) orfs.push(orf);
    workerContext.reportProgress?.({
      phase: "scanning-frames",
      progress: (index + 1) / frames.length,
      framesProcessed: index + 1,
      totalFrames: frames.length
    });
  }

  return sortOrfs(orfs, options.sortBy);
}

