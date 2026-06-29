import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import {
  cleanSequence,
  complementDnaRnaSequence
} from "../../core/sequence.js";
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

function getAlphabetMismatchWarning(sequence, alphabet) {
  const letters = String(sequence ?? "").replace(/[^A-Za-z*]/g, "");
  if (letters.length < 12) {
    return "";
  }

  const upper = letters.toUpperCase();
  const dnaLikeCount = Array.from(upper).filter((character) => /[ACGTUN]/.test(character)).length;
  const dnaLikeFraction = dnaLikeCount / upper.length;

  if (alphabet === "dna-rna" && /[EFILOPQZJ]/.test(upper)) {
    return "input contains letters commonly found in protein sequences. If this is protein, use Extract Subsequences Protein.";
  }

  if (alphabet === "protein" && dnaLikeFraction >= 0.9) {
    return "input looks nucleotide-rich. If this is DNA/RNA, use Extract Subsequences DNA/RNA.";
  }

  return "";
}

export function parseCoordinateSpec(coordinates) {
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

  tokens.forEach((token, index) => {
    const match = token.match(/^(\d+)(?:\s*(?:-|\.\.|:)\s*(\d+))?$/);
    if (!match) {
      errors.push(`Coordinate ${index + 1} "${token}" is not valid.`);
      return;
    }

    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2] ?? match[1], 10);
    if (start < 1 || end < 1) {
      errors.push(`Coordinate ${index + 1} "${token}" must use positive 1-based positions.`);
      return;
    }
    if (start > end) {
      errors.push(`Coordinate ${index + 1} "${token}" has start greater than end.`);
      return;
    }

    regions.push({
      index: regions.length + 1,
      requestedStart: start,
      requestedEnd: end,
      label: `${start}-${end}`
    });
  });

  if (regions.length === 0 && errors.length === 0) {
    errors.push("No coordinates were provided.");
  }

  return { regions, errors };
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

function mergeSegments(segments) {
  const sorted = [...segments].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const segment of sorted) {
    const previous = merged.at(-1);
    if (previous && segment.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, segment.end);
      previous.requestedCoordinates.push(...segment.requestedCoordinates);
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

function makeComplementSegments(selectedSegments, sequenceLength) {
  if (sequenceLength === 0) {
    return [];
  }
  const merged = mergeSegments(selectedSegments);
  const segments = [];
  let cursor = 1;
  for (const segment of merged) {
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

function reverseComplement(sequence, preserveCase) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase })).reverse().join("");
}

function makeRows(extractedRecords) {
  return extractedRecords.map((record) => ({
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
  }));
}

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function makeTsv(rows) {
  return [
    TSV_COLUMNS.join("\t"),
    ...rows.map((row) => TSV_COLUMNS.map((column) => escapeTsv(row[column])).join("\t"))
  ].join("\n");
}

function selectedSegmentsForRecord(regions, sequenceLength, recordTitle, warnings) {
  const selectedSegments = [];
  for (const region of regions) {
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

function buildOutputRecord({ record, segments, region, mode, requestedCoordinates, reverseComplementOutput, preserveCase, grouping }) {
  const sourceSegments = segments.map((segment) => record.cleanedSequence.slice(segment.start - 1, segment.end));
  const sourceSequence = sourceSegments.join("");
  const sequence = reverseComplementOutput
    ? reverseComplement(sourceSequence, preserveCase)
    : sourceSequence;
  const strand = reverseComplementOutput ? "-" : "+";
  const segmentSummary = segmentListLabel(segments);
  const start = Math.min(...segments.map((segment) => segment.start));
  const end = Math.max(...segments.map((segment) => segment.end));
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
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  const alphabetLabel = getAlphabetLabel(alphabet);
  const coordinateSpec = parseCoordinateSpec(options.coordinates);
  const selectionMode = options.selectionMode === "exclude" ? "exclude" : "extract";
  const resultGrouping = options.resultGrouping === "joined" ? "joined" : "separate";
  const shouldReverseComplement = alphabet === "dna-rna" && options.reverseComplement === true;
  const preserveCase = options.preserveCase !== false;

  if (coordinateSpec.errors.length > 0) {
    warnings.push(...coordinateSpec.errors);
  }

  if (coordinateSpec.regions.length === 0) {
    return makeToolResult({
      output: "",
      warnings,
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: [...warnings, "No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
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
    const mismatchWarning = getAlphabetMismatchWarning(record.sequence, alphabet);
    if (mismatchWarning) {
      warnings.push(`${record.title}: ${mismatchWarning}`);
    }

    const cleaned = cleanSequence(record.sequence, {
      alphabet,
      preserveCase,
      keepGaps: options.keepGaps
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-${alphabetLabel} character(s).`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no ${alphabetLabel} sequence characters were found.`);
    }

    const cleanedRecord = {
      ...record,
      cleanedSequence: cleaned.sequence,
      alphabet
    };
    const selectedSegments = selectedSegmentsForRecord(coordinateSpec.regions, cleaned.sequence.length, record.title, warnings);
    const requestedCoordinates = coordinateSpec.regions.map((region) => region.label).join("; ");
    const outputSegments = selectionMode === "exclude"
      ? makeComplementSegments(selectedSegments, cleaned.sequence.length).map((segment, index) => ({
        ...segment,
        index: index + 1,
        requestedCoordinates: [requestedCoordinates]
      }))
      : selectedSegments;

    if (selectionMode === "exclude" && selectedSegments.length > 0 && outputSegments.length === 0 && cleaned.sequence.length > 0) {
      warnings.push(`${record.title}: listed coordinates cover the entire sequence; no outside sequence remains.`);
    }

    if (resultGrouping === "joined") {
      if (outputSegments.length > 0) {
        const outputRecord = buildOutputRecord({
          record: cleanedRecord,
          segments: outputSegments,
          region: 1,
          mode: selectionMode === "exclude" ? "outside-listed-ranges" : "selected-ranges",
          requestedCoordinates: selectionMode === "exclude" ? requestedCoordinates : outputSegments.map((segment) => segment.requestedCoordinates.join("; ")).join("; "),
          reverseComplementOutput: shouldReverseComplement,
          preserveCase,
          grouping: "joined"
        });
        extractedRecords.push(outputRecord);
        outputCharacters += outputRecord.sequence.length;
      }
    } else {
      for (const [segmentIndex, segment] of outputSegments.entries()) {
        if (extractedRecords.length >= EXTRACT_SUBSEQUENCES_MAX_OUTPUT_RECORDS) {
          outputLimitHit = true;
          continue;
        }
        const outputRecord = buildOutputRecord({
          record: cleanedRecord,
          segments: [segment],
          region: segment.index ?? segmentIndex + 1,
          mode: selectionMode === "exclude" ? "outside-listed-ranges" : "selected-ranges",
          requestedCoordinates: selectionMode === "exclude" ? requestedCoordinates : segment.requestedCoordinates.join("; "),
          reverseComplementOutput: shouldReverseComplement,
          preserveCase,
          grouping: "separate"
        });
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
    warnings.push(`Output was limited to ${EXTRACT_SUBSEQUENCES_MAX_OUTPUT_RECORDS.toLocaleString()} FASTA records/table rows. Use joined output or fewer coordinates for very dense extraction.`);
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

  const lineWidth = Number.parseInt(options.lineWidth, 10) || 60;
  const fastaOutput = extractedRecords
    .map((record) => formatFastaRecord(record.title, record.sequence, lineWidth))
    .join("");
  const tableRows = makeRows(extractedRecords);
  const outputFormat = options.outputFormat === "tsv" ? "tsv" : "fasta";
  const output = outputFormat === "tsv" ? makeTsv(tableRows) : fastaOutput;

  return makeToolResult({
    output,
    download: {
      filename: `${getToolName(alphabet).toLowerCase().replaceAll(" ", "-").replace("/", "-")}.${outputFormat === "tsv" ? "tsv" : "fasta"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values"
          : "text/x-fasta;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      fasta: makeTextStream(fastaOutput, "text/x-fasta"),
      table: makeTableStream(extractSubsequencesTableColumns, tableRows, "extract-subsequences"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "extract-subsequences",
        alphabet,
        records: extractedRecords
      }
    }
  });
}

export function runExtractSubsequencesDnaRna(input, options = {}, context = {}) {
  return runExtractSubsequences(input, { ...options, alphabet: "dna-rna" }, context);
}

export function runExtractSubsequencesProtein(input, options = {}, context = {}) {
  return runExtractSubsequences(input, { ...options, alphabet: "protein", reverseComplement: false }, context);
}
