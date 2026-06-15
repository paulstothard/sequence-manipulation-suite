import { parseSequenceInput } from "./fasta.js";
import { cleanSequence, complementDnaRnaSequence } from "./sequence.js";
import { getCodonsForCode } from "./genetic-code.js";

export const DNA_RNA_RANDOM_ALPHABET = ["A", "C", "G", "T"];
export const RNA_RANDOM_ALPHABET = ["A", "C", "G", "U"];
export const PROTEIN_RANDOM_ALPHABET = ["A", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "Y"];

export function generateRandomSeed() {
  const bytes = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(36).padStart(7, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36)}`;
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return function seededRandom() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveRandom(options = {}) {
  const seed = String(options.seed ?? "").trim() || generateRandomSeed();
  return {
    seed,
    random: createSeededRandom(seed)
  };
}

export function randomInteger(random, maxExclusive) {
  return Math.floor(random() * Math.max(1, maxExclusive));
}

export function chooseRandom(random, values) {
  return values[randomInteger(random, values.length)];
}

export function chooseWeightedRandom(random, weightedValues = []) {
  const usable = weightedValues
    .map((item) => ({
      value: item?.value,
      weight: Math.max(0, Number(item?.weight) || 0)
    }))
    .filter((item) => item.value !== undefined && item.weight > 0);
  const total = usable.reduce((sum, item) => sum + item.weight, 0);
  if (usable.length === 0 || total <= 0) {
    const fallback = weightedValues.map((item) => item.value).filter((value) => value !== undefined);
    return fallback.length > 0 ? chooseRandom(random, fallback) : "";
  }
  let threshold = random() * total;
  for (const item of usable) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.value;
    }
  }
  return usable.at(-1).value;
}

export function randomSequence(length, alphabet, random) {
  const size = Math.max(0, Number.parseInt(length, 10) || 0);
  let sequence = "";
  for (let index = 0; index < size; index += 1) {
    sequence += Array.isArray(alphabet) && alphabet[0]?.value !== undefined
      ? chooseWeightedRandom(random, alphabet)
      : chooseRandom(random, alphabet);
  }
  return sequence;
}

export function shuffleSequence(sequence, random) {
  const characters = Array.from(String(sequence ?? ""));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

export function sampleSequence(sequence, length, random) {
  const source = Array.from(String(sequence ?? ""));
  if (source.length === 0) {
    return "";
  }
  return randomSequence(length, source, random);
}

function clampNonnegativeInteger(value, fallback = 0) {
  return Math.max(0, Number.parseInt(value, 10) || fallback);
}

function clampPositiveInteger(value, fallback = 1) {
  return Math.max(1, Number.parseInt(value, 10) || fallback);
}

function clampProbabilityPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric)) / 100;
}

function alphabetSymbol(value) {
  return String(value?.value ?? value ?? "");
}

function chooseReplacementSymbol(random, alphabet, original) {
  const upperOriginal = String(original ?? "").toUpperCase();
  const choices = alphabet.filter((value) => alphabetSymbol(value).toUpperCase() !== upperOriginal);
  const available = choices.length > 0 ? choices : alphabet;
  return alphabetSymbol(
    Array.isArray(available) && available[0]?.value !== undefined
      ? chooseWeightedRandom(random, available)
      : chooseRandom(random, available)
  );
}

function contextAround(source, startIndex, endIndex = startIndex + 1, flank = 5) {
  return {
    left_context: source.slice(Math.max(0, startIndex - flank), startIndex).join(""),
    right_context: source.slice(endIndex, Math.min(source.length, endIndex + flank)).join("")
  };
}

function prepareMutationState(sequence, options = {}) {
  const source = Array.from(String(sequence ?? ""));
  const alphabet = options.alphabetValues ?? DNA_RNA_RANDOM_ALPHABET;
  const mutationMode = options.mutationMode === "probability" ? "probability" : "counts";
  const substitutionCount = clampNonnegativeInteger(options.substitutionCount ?? options.mutationCount, 0);
  const insertionCount = clampNonnegativeInteger(options.insertionCount, 0);
  const deletionCount = clampNonnegativeInteger(options.deletionCount, 0);
  const insertionLength = clampPositiveInteger(options.insertionLength, 1);
  const deletionLength = clampPositiveInteger(options.deletionLength, 1);
  const protectedStart = clampNonnegativeInteger(options.protectedStart, 0);
  const protectedEnd = clampNonnegativeInteger(options.protectedEnd, 0);
  const mutableStart = Math.min(source.length, protectedStart);
  const mutableEnd = Math.max(mutableStart, source.length - protectedEnd);

  return {
    source,
    alphabet,
    mutationMode,
    substitutionCount,
    insertionCount,
    deletionCount,
    insertionLength,
    deletionLength,
    substitutionProbability: clampProbabilityPercent(options.substitutionProbability),
    insertionProbability: clampProbabilityPercent(options.insertionProbability),
    deletionProbability: clampProbabilityPercent(options.deletionProbability),
    maxEvents: clampPositiveInteger(options.maxEvents, Number.MAX_SAFE_INTEGER),
    mutableStart,
    mutableEnd,
    rows: [],
    deletedIndexes: new Set(),
    substitutionIndexes: new Set(),
    insertionAnchors: new Set(),
    eventsLimited: false
  };
}

function canRecordMutationEvent(state) {
  if (state.rows.length < state.maxEvents) {
    return true;
  }
  state.eventsLimited = true;
  return false;
}

function pickAvailableIndex(state, random, usedIndexes = new Set()) {
  if (state.mutableEnd <= state.mutableStart) {
    return -1;
  }
  const attempts = Math.max(20, (state.mutableEnd - state.mutableStart) * 2);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const index = state.mutableStart + randomInteger(random, state.mutableEnd - state.mutableStart);
    if (!usedIndexes.has(index) && !state.deletedIndexes.has(index)) {
      return index;
    }
  }
  for (let index = state.mutableStart; index < state.mutableEnd; index += 1) {
    if (!usedIndexes.has(index) && !state.deletedIndexes.has(index)) {
      return index;
    }
  }
  return -1;
}

function pickAvailableInsertionAnchor(state, random) {
  const minAnchor = state.mutableStart;
  const maxAnchor = state.mutableEnd;
  if (maxAnchor < minAnchor) {
    return -1;
  }
  const attempts = Math.max(20, (maxAnchor - minAnchor + 1) * 2);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const anchor = minAnchor + randomInteger(random, maxAnchor - minAnchor + 1);
    if (!state.insertionAnchors.has(anchor)) {
      return anchor;
    }
  }
  for (let anchor = minAnchor; anchor <= maxAnchor; anchor += 1) {
    if (!state.insertionAnchors.has(anchor)) {
      return anchor;
    }
  }
  return -1;
}

function pickAvailableDeletionStart(state, random) {
  const maxStart = state.mutableEnd - state.deletionLength;
  if (maxStart < state.mutableStart) {
    return -1;
  }
  const fits = (startIndex) => {
    for (let offset = 0; offset < state.deletionLength; offset += 1) {
      if (state.deletedIndexes.has(startIndex + offset)) {
        return false;
      }
    }
    return true;
  };
  const attempts = Math.max(20, (maxStart - state.mutableStart + 1) * 3);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const startIndex = state.mutableStart + randomInteger(random, maxStart - state.mutableStart + 1);
    if (fits(startIndex)) {
      return startIndex;
    }
  }
  for (let startIndex = state.mutableStart; startIndex <= maxStart; startIndex += 1) {
    if (fits(startIndex)) {
      return startIndex;
    }
  }
  return -1;
}

function addSubstitutionEvent(state, random, positionIndex) {
  if (positionIndex < 0 || !canRecordMutationEvent(state)) {
    return false;
  }
  if (positionIndex < state.mutableStart || positionIndex >= state.mutableEnd || state.deletedIndexes.has(positionIndex)) {
    return false;
  }
  const original = state.source[positionIndex] ?? "";
  const replacement = chooseReplacementSymbol(random, state.alphabet, original);
  state.substitutionIndexes.add(positionIndex);
  state.rows.push({
    mutation_number: state.rows.length + 1,
    event_type: "substitution",
    position: positionIndex + 1,
    end: positionIndex + 1,
    output_position: "",
    original,
    replacement,
    deleted: "",
    inserted: "",
    ...contextAround(state.source, positionIndex, positionIndex + 1)
  });
  return true;
}

function addInsertionEvent(state, random, anchor) {
  if (anchor < 0 || !canRecordMutationEvent(state)) {
    return false;
  }
  if (anchor < state.mutableStart || anchor > state.mutableEnd) {
    return false;
  }
  const inserted = randomSequence(state.insertionLength, state.alphabet, random);
  state.insertionAnchors.add(anchor);
  state.rows.push({
    mutation_number: state.rows.length + 1,
    event_type: "insertion",
    position: anchor,
    end: anchor,
    output_position: "",
    original: "",
    replacement: inserted,
    deleted: "",
    inserted,
    ...contextAround(state.source, anchor, anchor)
  });
  return true;
}

function addDeletionEvent(state, startIndex) {
  if (startIndex < 0 || !canRecordMutationEvent(state)) {
    return false;
  }
  if (startIndex < state.mutableStart || startIndex + state.deletionLength > state.mutableEnd) {
    return false;
  }
  const endIndex = Math.min(state.source.length, startIndex + state.deletionLength);
  for (let index = startIndex; index < endIndex; index += 1) {
    if (state.deletedIndexes.has(index)) {
      return false;
    }
  }
  const deleted = state.source.slice(startIndex, endIndex).join("");
  for (let index = startIndex; index < endIndex; index += 1) {
    state.deletedIndexes.add(index);
  }
  state.rows.push({
    mutation_number: state.rows.length + 1,
    event_type: "deletion",
    position: startIndex + 1,
    end: endIndex,
    output_position: "",
    original: deleted,
    replacement: "",
    deleted,
    inserted: "",
    ...contextAround(state.source, startIndex, endIndex)
  });
  return true;
}

function addCountedMutationEvents(state, random) {
  for (let index = 0; index < state.deletionCount; index += 1) {
    if (!addDeletionEvent(state, pickAvailableDeletionStart(state, random))) {
      break;
    }
  }
  for (let index = 0; index < state.substitutionCount; index += 1) {
    if (!addSubstitutionEvent(state, random, pickAvailableIndex(state, random, state.substitutionIndexes))) {
      break;
    }
  }
  for (let index = 0; index < state.insertionCount; index += 1) {
    if (!addInsertionEvent(state, random, pickAvailableInsertionAnchor(state, random))) {
      break;
    }
  }
}

function addProbabilityMutationEvents(state, random) {
  for (let index = state.mutableStart; index < state.mutableEnd; index += 1) {
    if (random() < state.deletionProbability) {
      addDeletionEvent(state, index);
    }
  }
  for (let index = state.mutableStart; index < state.mutableEnd; index += 1) {
    if (!state.deletedIndexes.has(index) && random() < state.substitutionProbability) {
      addSubstitutionEvent(state, random, index);
    }
  }
  for (let anchor = state.mutableStart; anchor <= state.mutableEnd; anchor += 1) {
    if (random() < state.insertionProbability) {
      addInsertionEvent(state, random, anchor);
    }
  }
}

function finishMutationState(state) {
  const substitutionsByIndex = new Map();
  const deletionStarts = new Map();
  const insertionsByAnchor = new Map();

  for (const row of state.rows) {
    if (row.event_type === "substitution") {
      substitutionsByIndex.set(row.position - 1, row);
    } else if (row.event_type === "deletion") {
      deletionStarts.set(row.position - 1, row);
    } else if (row.event_type === "insertion") {
      if (!insertionsByAnchor.has(row.position)) {
        insertionsByAnchor.set(row.position, []);
      }
      insertionsByAnchor.get(row.position).push(row);
    }
  }

  const output = [];
  const appendInsertions = (anchor) => {
    for (const row of insertionsByAnchor.get(anchor) ?? []) {
      row.output_position = output.length + 1;
      output.push(...Array.from(row.inserted));
    }
  };

  appendInsertions(0);
  for (let index = 0; index < state.source.length; index += 1) {
    const deletionRow = deletionStarts.get(index);
    if (deletionRow) {
      deletionRow.output_position = output.length + 1;
    }
    if (!state.deletedIndexes.has(index)) {
      const substitutionRow = substitutionsByIndex.get(index);
      if (substitutionRow) {
        substitutionRow.output_position = output.length + 1;
        output.push(substitutionRow.replacement);
      } else {
        output.push(state.source[index]);
      }
    }
    appendInsertions(index + 1);
  }

  return {
    sequence: output.join(""),
    rows: state.rows,
    eventsLimited: state.eventsLimited,
    eventCounts: state.rows.reduce((counts, row) => {
      counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
      return counts;
    }, {})
  };
}

export function mutateSequence(sequence, options = {}, random) {
  const state = prepareMutationState(sequence, options);

  if (state.mutableEnd <= state.mutableStart) {
    return finishMutationState(state);
  }

  if (state.mutationMode === "probability") {
    addProbabilityMutationEvents(state, random);
  } else {
    addCountedMutationEvents(state, random);
  }

  return finishMutationState(state);
}

export async function mutateSequenceCooperatively(sequence, options = {}, random, context = {}) {
  const state = prepareMutationState(sequence, options);

  if (state.mutableEnd <= state.mutableStart) {
    return finishMutationState(state);
  }

  if (state.mutationMode === "probability") {
    for (let index = state.mutableStart; index < state.mutableEnd; index += 1) {
      if ((index - state.mutableStart) % 5000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (random() < state.deletionProbability) {
        addDeletionEvent(state, index);
      }
    }
    for (let index = state.mutableStart; index < state.mutableEnd; index += 1) {
      if ((index - state.mutableStart) % 5000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (!state.deletedIndexes.has(index) && random() < state.substitutionProbability) {
        addSubstitutionEvent(state, random, index);
      }
    }
    for (let anchor = state.mutableStart; anchor <= state.mutableEnd; anchor += 1) {
      if ((anchor - state.mutableStart) % 5000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (random() < state.insertionProbability) {
        addInsertionEvent(state, random, anchor);
      }
    }
  } else {
    const totalRequested = state.deletionCount + state.substitutionCount + state.insertionCount;
    for (let index = 0; index < state.deletionCount; index += 1) {
      if (index % 1000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (!addDeletionEvent(state, pickAvailableDeletionStart(state, random))) {
        break;
      }
    }
    for (let index = 0; index < state.substitutionCount; index += 1) {
      if ((state.deletionCount + index) % 1000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (!addSubstitutionEvent(state, random, pickAvailableIndex(state, random, state.substitutionIndexes))) {
        break;
      }
    }
    for (let index = 0; index < state.insertionCount; index += 1) {
      if ((state.deletionCount + state.substitutionCount + index) % 1000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (!addInsertionEvent(state, random, pickAvailableInsertionAnchor(state, random))) {
        break;
      }
    }
    if (totalRequested > state.rows.length && state.rows.length >= state.maxEvents) {
      state.eventsLimited = true;
    }
  }

  context.throwIfCancelled?.();
  return finishMutationState(state);
}

export function replaceRandomRegions(sequence, options = {}, random) {
  const source = Array.from(String(sequence ?? ""));
  const alphabet = options.alphabetValues ?? DNA_RNA_RANDOM_ALPHABET;
  const regionCount = Math.max(0, Number.parseInt(options.regionCount, 10) || 0);
  const regionLength = Math.max(1, Number.parseInt(options.regionLength, 10) || 1);
  const regionTarget = options.regionTarget === "preserve-selected" ? "preserve-selected" : "randomize-selected";
  const rows = [];

  if (source.length === 0) {
    return { sequence: "", rows };
  }

  if (regionTarget === "preserve-selected") {
    const selected = [];
    for (let index = 0; index < regionCount; index += 1) {
      const maxStart = Math.max(0, source.length - regionLength);
      const startIndex = randomInteger(random, maxStart + 1);
      const endIndex = Math.min(source.length, startIndex + regionLength);
      selected.push({ startIndex, endIndex });
    }
    selected.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
    const merged = [];
    for (const interval of selected) {
      const last = merged.at(-1);
      if (last && interval.startIndex <= last.endIndex) {
        last.endIndex = Math.max(last.endIndex, interval.endIndex);
      } else {
        merged.push({ ...interval });
      }
    }
    const output = [...source];
    let cursor = 0;
    for (const interval of merged) {
      if (cursor < interval.startIndex) {
        const original = source.slice(cursor, interval.startIndex).join("");
        const replacement = randomSequence(original.length, alphabet, random);
        output.splice(cursor, original.length, ...Array.from(replacement));
        rows.push({
          region_number: rows.length + 1,
          role: "randomized",
          start: cursor + 1,
          end: interval.startIndex,
          original,
          replacement
        });
      }
      rows.push({
        region_number: rows.length + 1,
        role: "preserved",
        start: interval.startIndex + 1,
        end: interval.endIndex,
        original: source.slice(interval.startIndex, interval.endIndex).join(""),
        replacement: source.slice(interval.startIndex, interval.endIndex).join("")
      });
      cursor = Math.max(cursor, interval.endIndex);
    }
    if (cursor < source.length) {
      const original = source.slice(cursor).join("");
      const replacement = randomSequence(original.length, alphabet, random);
      output.splice(cursor, original.length, ...Array.from(replacement));
      rows.push({
        region_number: rows.length + 1,
        role: "randomized",
        start: cursor + 1,
        end: source.length,
        original,
        replacement
      });
    }
    return { sequence: output.join(""), rows };
  }

  for (let index = 0; index < regionCount; index += 1) {
    const maxStart = Math.max(0, source.length - regionLength);
    const startIndex = randomInteger(random, maxStart + 1);
    const endIndex = Math.min(source.length, startIndex + regionLength);
    const original = source.slice(startIndex, endIndex).join("");
    const replacement = randomSequence(endIndex - startIndex, alphabet, random);
    source.splice(startIndex, endIndex - startIndex, ...Array.from(replacement));
    rows.push({
      region_number: index + 1,
      role: "randomized",
      start: startIndex + 1,
      end: endIndex,
      original,
      replacement
    });
  }

  return { sequence: source.join(""), rows };
}

function normalizeCodon(value) {
  return String(value ?? "").trim().toUpperCase().replace(/U/g, "T");
}

export function buildRandomCodingDnaRecord(options = {}, random) {
  const codonCount = Math.max(2, Number.parseInt(options.codonCount, 10) || 30);
  const codons = getCodonsForCode(options.geneticCode ?? "1");
  const startCodons = codons.filter((item) => item.isStart).map((item) => item.codon);
  const codingCodons = codons.filter((item) => !item.isStop).map((item) => item.codon);
  const stopCodons = codons.filter((item) => item.isStop).map((item) => item.codon);
  const codingCodonSet = new Set(codingCodons);
  const weightedCodingCodons = (options.codingCodonChoices ?? [])
    .filter((item) => codingCodonSet.has(item.value))
    .map((item) => ({ value: item.value, weight: item.weight }));
  const startChoice = String(options.startCodonChoice ?? "random");
  const warnings = [];
  let selectedStartCodon = "";
  let startCodonMode = startChoice;

  if (startChoice === "none") {
    startCodonMode = "none";
  } else if (startChoice === "custom") {
    const customCodon = normalizeCodon(options.customStartCodon);
    if (/^[ACGT]{3}$/.test(customCodon) && codingCodonSet.has(customCodon)) {
      selectedStartCodon = customCodon;
      startCodonMode = "custom";
    } else {
      selectedStartCodon = chooseRandom(random, startCodons.length > 0 ? startCodons : ["ATG"]);
      startCodonMode = "random";
      warnings.push("Custom start codon was not a valid sense codon for the selected genetic code, so a random valid start codon was used.");
    }
  } else if (startChoice.startsWith("codon:")) {
    const selectedCodon = normalizeCodon(startChoice.slice("codon:".length));
    if (/^[ACGT]{3}$/.test(selectedCodon) && codingCodonSet.has(selectedCodon)) {
      selectedStartCodon = selectedCodon;
      startCodonMode = "selected";
    } else {
      selectedStartCodon = chooseRandom(random, startCodons.length > 0 ? startCodons : ["ATG"]);
      startCodonMode = "random";
      warnings.push("Selected start codon was not a valid sense codon for the selected genetic code, so a random valid start codon was used.");
    }
  } else {
    selectedStartCodon = chooseRandom(random, startCodons.length > 0 ? startCodons : ["ATG"]);
    startCodonMode = "random";
  }

  const output = selectedStartCodon ? [selectedStartCodon] : [];
  for (let index = output.length; index < codonCount - 1; index += 1) {
    output.push(weightedCodingCodons.length > 0 ? chooseWeightedRandom(random, weightedCodingCodons) : chooseRandom(random, codingCodons));
  }
  output.push(chooseRandom(random, stopCodons.length > 0 ? stopCodons : ["TAA"]));
  return {
    sequence: output.join(""),
    startCodon: selectedStartCodon,
    startCodonMode,
    warnings
  };
}

export function randomCodingDnaSequence(options = {}, random) {
  return buildRandomCodingDnaRecord(options, random).sequence;
}

function sliceCircularSequence(source, startIndex, length) {
  const output = [];
  if (source.length === 0 || length <= 0) {
    return "";
  }
  for (let offset = 0; offset < length; offset += 1) {
    output.push(source[(startIndex + offset) % source.length]);
  }
  return output.join("");
}

function reverseComplementDnaRna(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function makeFragmentRecord(source, title, startIndex, length, index, seed, topology, orientation = "forward") {
  const sourceLength = source.length;
  const isCircular = topology === "circular";
  const sourceSequence = isCircular
    ? sliceCircularSequence(source, ((startIndex % sourceLength) + sourceLength) % sourceLength, length)
    : source.slice(Math.max(0, startIndex), Math.min(sourceLength, startIndex + length)).join("");
  const normalizedOrientation = orientation === "reverse-complement" ? "reverse-complement" : "forward";
  const sequence = normalizedOrientation === "reverse-complement"
    ? reverseComplementDnaRna(sourceSequence)
    : sourceSequence;
  const normalizedStart = isCircular
    ? (((startIndex % sourceLength) + sourceLength) % sourceLength) + 1
    : Math.max(1, startIndex + 1);
  const endIndex = isCircular
    ? ((((startIndex + sequence.length - 1) % sourceLength) + sourceLength) % sourceLength) + 1
    : Math.min(sourceLength, startIndex + sequence.length);
  const wraps = isCircular && sequence.length > 0 && (startIndex + sequence.length > sourceLength);
  const fragmentTitle = `${title} random fragment ${index} ${normalizedStart}-${endIndex}${wraps ? " circular-wrap" : ""}${normalizedOrientation === "reverse-complement" ? " reverse-complement" : ""} seed=${seed}`;

  return {
    title: fragmentTitle,
    sequence,
    row: {
      record: title,
      fragment: fragmentTitle,
      fragment_number: index,
      start: normalizedStart,
      end: endIndex,
      length: sequence.length,
      source_length: sourceLength,
      topology: isCircular ? "circular" : "linear",
      wraps: wraps ? "yes" : "no",
      orientation: normalizedOrientation,
      seed
    }
  };
}

export function randomDnaFragments(record, options = {}, random, seed = "") {
  const source = Array.from(String(record.sequence ?? ""));
  const topology = options.topology === "circular" ? "circular" : "linear";
  const mode = options.fragmentMode === "target-size" ? "target-size" : "count";
  const targetSize = Math.max(1, Number.parseInt(options.targetSize, 10) || 100);
  const fragmentCount = Math.max(1, Number.parseInt(options.fragmentCount, 10) || 1);
  const maxFragments = Number.isFinite(Number(options.maxFragments))
    ? Math.max(1, Math.floor(Number(options.maxFragments)))
    : Number.POSITIVE_INFINITY;
  const sizeVariationPercent = Math.max(0, Math.min(90, Number(options.sizeVariationPercent) || 0));
  const overlapLength = Math.max(0, Number.parseInt(options.overlapLength, 10) || 0);
  const randomReverseComplement = options.randomReverseComplement === true;
  const orientationRandom = randomReverseComplement
    ? (seed ? createSeededRandom(`${seed}:${record.title}:fragment-orientation`) : random)
    : null;
  const chooseOrientation = () => (orientationRandom && orientationRandom() < 0.5 ? "reverse-complement" : "forward");
  const outputRecords = [];
  const rows = [];

  if (source.length === 0) {
    return { outputRecords, rows };
  }

  if (mode === "target-size") {
    const minimumSize = Math.max(1, Math.floor(targetSize * (1 - sizeVariationPercent / 100)));
    const maximumSize = Math.max(minimumSize, Math.ceil(targetSize * (1 + sizeVariationPercent / 100)));
    let cursor = 0;
    let index = 1;
    const targetModeMaxFragments = topology === "circular"
      ? Math.ceil(source.length / Math.max(1, targetSize - overlapLength))
      : Number.POSITIVE_INFINITY;
    const targetModeLimit = Math.min(maxFragments, targetModeMaxFragments);
    while (cursor < source.length && index <= targetModeLimit) {
      const span = minimumSize + randomInteger(random, maximumSize - minimumSize + 1);
      const length = topology === "circular" ? Math.min(source.length + overlapLength, span) : Math.min(source.length - cursor, span);
      const fragment = makeFragmentRecord(source, record.title, cursor, length, index, seed, topology, chooseOrientation());
      outputRecords.push(fragment);
      rows.push(fragment.row);
      cursor += Math.max(1, length - Math.min(overlapLength, Math.max(0, length - 1)));
      index += 1;
    }
    return { outputRecords, rows };
  }

  const limitedCount = Math.min(fragmentCount, maxFragments);
  const count = topology === "circular" ? limitedCount : Math.min(limitedCount, source.length);
  const cuts = new Set();
  while (cuts.size < count - 1 && cuts.size < source.length - 1) {
    cuts.add(1 + randomInteger(random, source.length - 1));
  }
  const boundaries = [0, ...Array.from(cuts).sort((a, b) => a - b), source.length];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const segmentEnd = boundaries[index + 1];
    const extendedEnd = topology === "circular" || index < boundaries.length - 2
      ? segmentEnd + overlapLength
      : segmentEnd;
    const length = topology === "circular"
      ? Math.min(source.length + overlapLength, Math.max(1, extendedEnd - start))
      : Math.max(1, Math.min(source.length, extendedEnd) - start);
    const fragment = makeFragmentRecord(source, record.title, start, length, index + 1, seed, topology, chooseOrientation());
    outputRecords.push(fragment);
    rows.push(fragment.row);
  }
  return { outputRecords, rows };
}

export function parseAndCleanRecords(input, alphabet) {
  const records = parseSequenceInput(input, "sequence");
  let charactersRemoved = 0;
  const cleanedRecords = records.map((record) => {
    const cleaned = cleanSequence(record.sequence, { alphabet, preserveCase: false, keepGaps: false });
    charactersRemoved += cleaned.removedCount;
    return {
      ...record,
      sequence: cleaned.sequence,
      removedCount: cleaned.removedCount
    };
  });
  return { records: cleanedRecords, charactersRemoved };
}
