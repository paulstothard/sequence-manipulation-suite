import { normalizeExtractSubsequencesOptions } from "../../core/extract-subsequences-options.js";
import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import {
  cleanSequence,
  complementDnaRnaSequence
} from "../../core/sequence.js";
import { effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const extractSubsequencesTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "output_record", label: "Output record", type: "string" },
  { id: "region", label: "Region", type: "number" },
  { id: "mode", label: "Mode", type: "string" },
  { id: "requested_coordinates", label: "Requested coordinates", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "segments", label: "Segments", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "sequence", label: "Sequence", type: "string" }
];
const TSV_COLUMNS = extractSubsequencesTableColumns.map((column) => column.id);
export const EXTRACT_SUBSEQUENCES_MAX_OUTPUT_RECORDS = 50000;
const LARGE_OUTPUT_RECORDS = 10000;
const LARGE_OUTPUT_CHARACTERS = 5000000;

function getAlphabetLabel(alphabet) {
  return alphabet === "protein" ? "protein" : "DNA/RNA";
}

function getToolName(alphabet) {
  return alphabet === "protein" ? "Extract Subsequences Protein" : "Extract Subsequences DNA/RNA";
}

const SEQUENCE_CHUNK_SIZE = 100000;
const SEGMENT_CHUNK_SIZE = 1000;

async function checkpoint(context) {
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
}

async function cleanRecord(sequence, options, context) {
  const parts = [];
  let removedCount = 0;
  let gapsRemoved = 0;
  let letterCount = 0;
  let dnaLikeCount = 0;
  let proteinLetters = false;
  for (let start = 0; start < sequence.length;) {
    await checkpoint(context);
    let end = Math.min(sequence.length, start + SEQUENCE_CHUNK_SIZE);
    // Never split a supplementary Unicode character before counting removals.
    if (end < sequence.length && /[\uD800-\uDBFF]/.test(sequence[end - 1])) end += 1;
    const chunk = sequence.slice(start, end);
    const cleaned = cleanSequence(chunk, options);
    parts.push(cleaned.sequence);
    removedCount += cleaned.removedCount;
    if (!options.keepGaps) gapsRemoved += chunk.replace(/[^.-]/g, "").length;
    const letters = chunk.replace(/[^A-Za-z*]/g, "").toUpperCase();
    letterCount += letters.length;
    dnaLikeCount += letters.replace(/[^ACGTUN]/g, "").length;
    proteinLetters ||= /[EFILOPQZJ]/.test(letters);
    start = end;
  }
  let mismatchWarning = "";
  if (letterCount >= 12) {
    if (options.alphabet === "dna-rna" && proteinLetters) mismatchWarning = "input contains letters commonly found in protein sequences. If this is protein, use Extract Subsequences Protein.";
    if (options.alphabet === "protein" && dnaLikeCount / letterCount >= 0.9) mismatchWarning = "input looks nucleotide-rich. If this is DNA/RNA, use Extract Subsequences DNA/RNA.";
  }
  return { sequence: parts.join(""), removedCount, gapsRemoved, mismatchWarning };
}

function* coordinateSteps(coordinates) {
  const text = String(coordinates ?? "").trim();
  if (!text) {
    return { regions: [], errors: ["No coordinates were provided."] };
  }

  const regions = [];
  const errors = [];
  const tokens = text
    .split(/[\n;,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const [index, token] of tokens.entries()) {
    if (index % SEGMENT_CHUNK_SIZE === 0) yield;
    const match = token.match(/^(\d+)(?:\s*(?:-|\.\.|:)\s*(\d+))?$/);
    if (!match) {
      errors.push(`Coordinate ${index + 1} "${token}" is not valid.`);
      continue;
    }

    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2] ?? match[1], 10);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      errors.push(`Coordinate ${index + 1} "${token}" exceeds the largest exact integer position (${Number.MAX_SAFE_INTEGER}).`);
      continue;
    }
    if (start < 1 || end < 1) {
      errors.push(`Coordinate ${index + 1} "${token}" must use positive 1-based positions.`);
      continue;
    }
    if (start > end) {
      errors.push(`Coordinate ${index + 1} "${token}" has start greater than end.`);
      continue;
    }

    regions.push({
      index: regions.length + 1,
      requestedStart: start,
      requestedEnd: end,
      label: `${start}-${end}`
    });
  }

  if (regions.length === 0 && errors.length === 0) {
    errors.push("No coordinates were provided.");
  }

  return { regions, errors };
}

export function parseCoordinateSpec(coordinates) {
  const steps = coordinateSteps(coordinates);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

async function parseCoordinatesCooperatively(coordinates, context) {
  const steps = coordinateSteps(coordinates);
  let step = steps.next();
  while (!step.done) {
    await checkpoint(context);
    step = steps.next();
  }
  return step.value;
}

function clipRegion(region, sequenceLength) {
  const start = Math.max(1, region.requestedStart);
  const end = Math.min(sequenceLength, region.requestedEnd);

  if (sequenceLength === 0 || start > end) {
    return null;
  }

  return {
    ...region,
    start,
    end,
    clipped: start !== region.requestedStart || end !== region.requestedEnd
  };
}

async function mergeSegments(segments, context) {
  const sorted = [...segments].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const [index, segment] of sorted.entries()) {
    if (index % SEGMENT_CHUNK_SIZE === 0) await checkpoint(context);
    const previous = merged.at(-1);
    if (previous && segment.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, segment.end);
      // Only the union endpoints are needed for exclusion.
    } else {
      merged.push({
        start: segment.start,
        end: segment.end,
        requestedCoordinates: [...segment.requestedCoordinates]
      });
    }
  }
  return merged;
}

async function makeComplementSegments(selectedSegments, sequenceLength, context) {
  if (sequenceLength === 0) {
    return [];
  }
  const merged = await mergeSegments(selectedSegments, context);
  const segments = [];
  let cursor = 1;
  for (const [index, segment] of merged.entries()) {
    if (index % SEGMENT_CHUNK_SIZE === 0) await checkpoint(context);
    if (cursor < segment.start) {
      segments.push({ start: cursor, end: segment.start - 1 });
    }
    cursor = Math.max(cursor, segment.end + 1);
  }
  if (cursor <= sequenceLength) {
    segments.push({ start: cursor, end: sequenceLength });
  }
  return segments;
}

function segmentLabel(segment) {
  return `${segment.start}-${segment.end}`;
}

function segmentListLabel(segments) {
  return segments.map(segmentLabel).join("; ");
}

async function reverseComplement(sequence, preserveCase, context) {
  const parts = [];
  for (let end = sequence.length; end > 0; end -= SEQUENCE_CHUNK_SIZE) {
    await checkpoint(context);
    parts.push(Array.from(complementDnaRnaSequence(sequence.slice(Math.max(0, end - SEQUENCE_CHUNK_SIZE), end), { preserveCase })).reverse().join(""));
  }
  return parts.join("");
}

function makeRow(record) {
  return {
    record: record.sourceTitle,
    output_record: record.title,
    region: record.region,
    mode: record.mode,
    requested_coordinates: record.requestedCoordinates,
    start: record.start,
    end: record.end,
    segments: record.segments,
    length: record.sequence.length,
    strand: record.strand,
    sequence: record.sequence
  };
}

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

async function selectedSegmentsForRecord(regions, sequenceLength, recordTitle, warnings, context) {
  const selectedSegments = [];
  for (const [index, region] of regions.entries()) {
    if (index % SEGMENT_CHUNK_SIZE === 0) await checkpoint(context);
    const clipped = clipRegion(region, sequenceLength);
    if (!clipped) {
      warnings.push(`${recordTitle}: coordinate ${region.label} has no overlap with sequence length ${sequenceLength}.`);
      continue;
    }
    if (clipped.clipped) {
      warnings.push(`${recordTitle}: coordinate ${region.label} was clipped to ${clipped.start}-${clipped.end}.`);
    }
    selectedSegments.push({
      index: region.index,
      start: clipped.start,
      end: clipped.end,
      requestedCoordinates: [region.label]
    });
  }
  return selectedSegments;
}

async function buildOutputRecord({ record, segments, region, mode, requestedCoordinates, reverseComplementOutput, preserveCase, grouping }, context) {
  const sourceSegments = [];
  let start = Infinity;
  let end = 0;
  for (const [index, segment] of segments.entries()) {
    if (segments.length > SEGMENT_CHUNK_SIZE && index % SEGMENT_CHUNK_SIZE === 0) await checkpoint(context);
    sourceSegments.push(record.cleanedSequence.slice(segment.start - 1, segment.end));
    start = Math.min(start, segment.start);
    end = Math.max(end, segment.end);
  }
  const sourceSequence = sourceSegments.join("");
  const sequence = reverseComplementOutput
    ? await reverseComplement(sourceSequence, preserveCase, context)
    : sourceSequence;
  const strand = reverseComplementOutput ? "-" : "+";
  const segmentSummary = segmentListLabel(segments);
  const title = grouping === "joined"
    ? `${record.title}:${mode === "outside-listed-ranges" ? "except listed ranges" : "joined selected ranges"}${reverseComplementOutput ? " reverse complement" : ""}`
    : mode === "outside-listed-ranges"
      ? `${record.title}:outside listed ranges ${segmentSummary}${reverseComplementOutput ? " reverse complement" : ""}`
      : `${record.title}:${segmentSummary}${reverseComplementOutput ? " reverse complement" : ""}`;

  return {
    title,
    sequence,
    sourceTitle: record.title,
    region,
    mode,
    requestedCoordinates,
    start,
    end,
    segments: segmentSummary,
    strand,
    alphabet: record.alphabet
  };
}

export async function runExtractSubsequences(input, options = {}, context = {}) {
  options = normalizeExtractSubsequencesOptions(options);
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const records = parseSequenceInput(input, "sequence", { strictHeaders: true });
  const warnings = [];
  const notes = [];
  const alphabet = options.alphabet;
  const alphabetLabel = getAlphabetLabel(alphabet);
  // Protein coordinates include retained stop and gap symbols as well as residues.
  const processedUnitLabel = alphabet === "protein" ? "character" : "base";
  const coordinateSpec = await parseCoordinatesCooperatively(options.coordinates, context);
  const selectionMode = options.selectionMode;
  const resultGrouping = options.resultGrouping;
  const shouldReverseComplement = alphabet === "dna-rna" && options.reverseComplement === true;
  const preserveCase = options.preserveCase;
  const maxOutputRecords = effectiveToolLimit(options, "outputRecordLimitNote", EXTRACT_SUBSEQUENCES_MAX_OUTPUT_RECORDS);

  if (coordinateSpec.errors.length > 0) {
    for (const error of coordinateSpec.errors) warnings.push(error);
  }

  if (coordinateSpec.regions.length === 0) {
    return makeToolResult({
      optionsUsed: options,
      output: "",
      warnings,
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel,
      charactersRemoved: 0
    });
  }

  if (records.length === 0) {
    return makeToolResult({
      optionsUsed: options,
      output: "",
      warnings: [...warnings, "No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel,
      charactersRemoved: 0
    });
  }

  const extractedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let outputCharacters = 0;
  let outputLimitHit = false;

  context.reportProgress?.({ phase: "extracting-subsequences", progress: 0.1 });
  for (const [recordIndex, record] of records.entries()) {
    context.throwIfCancelled?.();
    const cleaned = await cleanRecord(record.sequence, options, context);
    if (cleaned.mismatchWarning) warnings.push(`${record.title}: ${cleaned.mismatchWarning}`);

    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    const unexpectedRemoved = cleaned.removedCount - cleaned.gapsRemoved;
    if (unexpectedRemoved > 0) {
      warnings.push(`${record.title}: removed ${unexpectedRemoved} non-${alphabetLabel} character(s).`);
    }
    if (cleaned.gapsRemoved > 0) {
      notes.push(`${record.title}: removed ${cleaned.gapsRemoved} gap character(s) before applying coordinates, as selected.`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no ${alphabetLabel} sequence characters were found.`);
    }

    const cleanedRecord = {
      ...record,
      cleanedSequence: cleaned.sequence,
      alphabet
    };
    const selectedSegments = await selectedSegmentsForRecord(coordinateSpec.regions, cleaned.sequence.length, record.title, warnings, context);
    const requestedCoordinates = coordinateSpec.regions.map((region) => region.label).join("; ");
    const outputSegments = selectionMode === "exclude"
      ? (await makeComplementSegments(selectedSegments, cleaned.sequence.length, context)).map((segment, index) => ({
        ...segment,
        index: index + 1,
        requestedCoordinates: [requestedCoordinates]
      }))
      : selectedSegments;

    if (selectionMode === "exclude" && selectedSegments.length > 0 && outputSegments.length === 0 && cleaned.sequence.length > 0) {
      notes.push(`${record.title}: listed coordinates cover the entire sequence; no outside sequence remains.`);
    }

    if (resultGrouping === "joined") {
      if (outputSegments.length > 0) {
        const outputRecord = await buildOutputRecord({
          record: cleanedRecord,
          segments: outputSegments,
          region: 1,
          mode: selectionMode === "exclude" ? "outside-listed-ranges" : "selected-ranges",
          requestedCoordinates: selectionMode === "exclude" ? requestedCoordinates : outputSegments.map((segment) => segment.requestedCoordinates.join("; ")).join("; "),
          reverseComplementOutput: shouldReverseComplement,
          preserveCase,
          grouping: "joined"
        }, context);
        extractedRecords.push(outputRecord);
        outputCharacters += outputRecord.sequence.length;
      }
    } else {
      for (const [segmentIndex, segment] of outputSegments.entries()) {
        if (segmentIndex % SEGMENT_CHUNK_SIZE === 0) await checkpoint(context);
        if (extractedRecords.length >= maxOutputRecords) {
          outputLimitHit = true;
          continue;
        }
        const outputRecord = await buildOutputRecord({
          record: cleanedRecord,
          segments: [segment],
          region: segment.index ?? segmentIndex + 1,
          mode: selectionMode === "exclude" ? "outside-listed-ranges" : "selected-ranges",
          requestedCoordinates: selectionMode === "exclude" ? requestedCoordinates : segment.requestedCoordinates.join("; "),
          reverseComplementOutput: shouldReverseComplement,
          preserveCase,
          grouping: "separate"
        }, context);
        extractedRecords.push(outputRecord);
        outputCharacters += outputRecord.sequence.length;
      }
    }

    context.reportProgress?.({
      phase: "extracting-subsequences",
      current: recordIndex + 1,
      total: records.length,
      progress: 0.1 + (0.7 * (recordIndex + 1)) / Math.max(1, records.length)
    });
    await context.yieldIfNeeded?.();
  }

  if (outputLimitHit) {
    warnings.push(`Output was limited to ${maxOutputRecords.toLocaleString()} FASTA records/table rows. Use joined output or fewer coordinates for very dense extraction.`);
  }
  if (extractedRecords.length > LARGE_OUTPUT_RECORDS) {
    warnings.push(`This run produced ${extractedRecords.length.toLocaleString()} FASTA records/table rows; browser table display may be large.`);
  }
  if (outputCharacters > LARGE_OUTPUT_CHARACTERS) {
    warnings.push(`This run produced ${outputCharacters.toLocaleString()} sequence characters; copying or displaying the full output may be slow.`);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = options.outputFormat;
  const streams = {};
  let output;
  if (outputFormat === "tsv") {
    const tableRows = [];
    const lines = [TSV_COLUMNS.join("\t")];
    for (const [index, record] of extractedRecords.entries()) {
      if (index % SEGMENT_CHUNK_SIZE === 0) await checkpoint(context);
      const row = makeRow(record);
      tableRows.push(row);
      lines.push(TSV_COLUMNS.map(column => escapeTsv(row[column])).join("\t"));
    }
    output = lines.join("\n");
    streams.table = makeTableStream(extractSubsequencesTableColumns, tableRows, "extract-subsequences");
  } else {
    const parts = [];
    for (const [index, record] of extractedRecords.entries()) {
      if (index % SEGMENT_CHUNK_SIZE === 0) await checkpoint(context);
      parts.push(formatFastaRecord(record.title, record.sequence, options.lineWidth));
    }
    output = parts.join("");
    streams.fasta = makeTextStream(output, "text/x-fasta");
    // These records back the FASTA output's Workspace save and typed handoffs.
    streams.sequenceRecords = {
      kind: "sequence-records",
      schema: "extract-subsequences",
      alphabet,
      records: extractedRecords
    };
  }

  return makeToolResult({
    optionsUsed: options,
    output,
    download: {
      filename: `${getToolName(alphabet).toLowerCase().replaceAll(" ", "-").replace("/", "-")}.${outputFormat === "tsv" ? "tsv" : "fasta"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values"
          : "text/x-fasta;charset=utf-8"
    },
    warnings,
    notes,
    recordsProcessed: records.length,
    basesProcessed,
    processedUnitLabel,
    charactersRemoved,
    streams
  });
}

export function runExtractSubsequencesDnaRna(input, options = {}, context = {}) {
  return runExtractSubsequences(input, { ...options, alphabet: "dna-rna" }, context);
}

export function runExtractSubsequencesProtein(input, options = {}, context = {}) {
  return runExtractSubsequences(input, { ...options, alphabet: "protein", reverseComplement: false }, context);
}
