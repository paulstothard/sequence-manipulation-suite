import {
  streamTextFileChunks,
  streamTextLineSegments
} from "./compressed-text-reader.js";
import {
  makeIndexedFastaReader,
  parseFaiIndex,
  resolveIndexedFastaRegionInput
} from "./indexed-genomics/indexed-fasta-reader.js";

export const FASTA_RECORD_SOURCE_LIMITS = Object.freeze({
  chunkSize: 1024 * 1024,
  maxAcceptedBases: 100_000_000,
  maxDecodedBytes: 150 * 1024 * 1024,
  maxHeaderCharacters: 10_000,
  maxTotalHeaderCharacters: 5_000_000,
  maxIndexBytes: 16 * 1024 * 1024,
  maxRecords: 10_000,
  maxSourceBytes: 512 * 1024 * 1024
});

function boundedInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === Infinity) return Infinity;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizeLimits(options = {}) {
  return {
    chunkSize: boundedInteger(options.sourceChunkSize, FASTA_RECORD_SOURCE_LIMITS.chunkSize, {
      min: 1,
      max: 8 * 1024 * 1024
    }),
    maxAcceptedBases: boundedInteger(options.maxSourceBases, FASTA_RECORD_SOURCE_LIMITS.maxAcceptedBases),
    maxDecodedBytes: boundedInteger(options.maxDecodedSourceBytes, FASTA_RECORD_SOURCE_LIMITS.maxDecodedBytes),
    maxHeaderCharacters: boundedInteger(options.maxFastaHeaderCharacters, FASTA_RECORD_SOURCE_LIMITS.maxHeaderCharacters),
    maxTotalHeaderCharacters: boundedInteger(options.maxTotalFastaHeaderCharacters, FASTA_RECORD_SOURCE_LIMITS.maxTotalHeaderCharacters),
    maxIndexBytes: boundedInteger(options.maxIndexBytes, FASTA_RECORD_SOURCE_LIMITS.maxIndexBytes),
    maxRecords: boundedInteger(options.maxSourceRecords, FASTA_RECORD_SOURCE_LIMITS.maxRecords),
    maxSourceBytes: boundedInteger(options.maxSourceBytes, FASTA_RECORD_SOURCE_LIMITS.maxSourceBytes)
  };
}

function makeLimitError(label, actual, limit) {
  return new Error(`${label} ${actual.toLocaleString()} exceeds the current limit of ${limit.toLocaleString()}.`);
}

function checkFileSize(file, limits) {
  if (Number.isFinite(file?.size) && file.size > limits.maxSourceBytes) {
    throw makeLimitError("FASTA source bytes", file.size, limits.maxSourceBytes);
  }
}

function makeStringChunks(input, limits) {
  const text = String(input ?? "");
  return (async function* iterateStringChunks() {
    let decodedBytes = 0;
    for (let start = 0; start < text.length; start += limits.chunkSize) {
      const chunk = text.slice(start, start + limits.chunkSize);
      decodedBytes += new TextEncoder().encode(chunk).byteLength;
      if (decodedBytes > limits.maxDecodedBytes) {
        throw makeLimitError("Decoded FASTA text bytes", decodedBytes, limits.maxDecodedBytes);
      }
      yield chunk;
    }
  })();
}

function normalizeRecordSelection(recordIndexes) {
  if (!recordIndexes) return null;
  return new Set([...recordIndexes].map((value) => Number.parseInt(value, 10)).filter(Number.isInteger));
}

async function* iterateTextFasta({ input, file, limits, allowRawSequence, recordIndexes, stats, context, trackStats }) {
  checkFileSize(file, limits);
  const selectedRecords = normalizeRecordSelection(recordIndexes);
  const chunkStream = file?.stream
    ? streamTextFileChunks(file, {
      signal: context.signal,
      maxDecodedBytes: limits.maxDecodedBytes,
      onProgress: (detail) => {
        stats.decodedBytes = detail.decodedBytes ?? stats.decodedBytes;
        context.reportProgress?.({
          ...detail,
          phase: detail.compressed ? "decompressing-fasta" : "reading-fasta"
        });
      }
    })
    : makeStringChunks(input, limits);
  const lineSegments = streamTextLineSegments(chunkStream, {
    signal: context.signal,
    maxSegmentCharacters: limits.chunkSize
  });
  let mode = null;
  let record = null;
  let pendingBlankLines = 0;
  let preambleLines = 0;
  let emittedBases = 0;
  let totalBases = 0;
  let totalHeaderCharacters = 0;
  let rawSequenceCharacters = 0;
  let ignoredSequenceWhitespace = 0;
  let recordCount = 0;
  let hadFastaHeader = false;
  let nonWhitespaceSeen = false;
  let usedRawSequence = false;

  function isSelected(index) {
    return selectedRecords === null || selectedRecords.has(index);
  }

  function beginRecord(title, hadHeader, issues = []) {
    if (title.length > limits.maxHeaderCharacters) {
      throw makeLimitError("FASTA header characters", title.length, limits.maxHeaderCharacters);
    }
    totalHeaderCharacters += title.length;
    if (totalHeaderCharacters > limits.maxTotalHeaderCharacters) {
      throw makeLimitError("Total FASTA header characters", totalHeaderCharacters, limits.maxTotalHeaderCharacters);
    }
    const index = recordCount + 1;
    if (index > limits.maxRecords) throw makeLimitError("FASTA record count", index, limits.maxRecords);
    recordCount = index;
    record = {
      index,
      title,
      hadHeader,
      issues,
      length: 0,
      sequenceLines: 0,
      selected: isSelected(index)
    };
    return record.selected
      ? { type: "record-start", record: index, title, hadHeader, issues }
      : null;
  }

  function endRecord() {
    if (!record) return null;
    if (record.length === 0) record.issues.push("empty sequence");
    const event = record.selected
      ? {
        type: "record-end",
        record: record.index,
        title: record.title,
        hadHeader: record.hadHeader,
        length: record.length,
        sequenceLines: record.sequenceLines,
        issues: record.issues
      }
      : null;
    record = null;
    return event;
  }

  async function* emitSequence(text) {
    if (!record || !text) return;
    const nextTotal = totalBases + text.length;
    if (nextTotal > limits.maxAcceptedBases) {
      throw makeLimitError("Accepted FASTA bases", nextTotal, limits.maxAcceptedBases);
    }
    totalBases = nextTotal;
    const sequenceOffset = record.length;
    record.length += text.length;
    if (!record.selected) return;
    for (let start = 0; start < text.length; start += limits.chunkSize) {
      const chunk = text.slice(start, start + limits.chunkSize);
      emittedBases += chunk.length;
      yield {
        type: "sequence-chunk",
        record: record.index,
        title: record.title,
        sequenceOffset: sequenceOffset + start,
        text: chunk
      };
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
    }
  }

  function makeLineState() {
    return {
      charactersSeen: 0,
      kind: null,
      headerParts: null,
      headerCharacters: 0,
      headerMarkerConsumed: false,
      nonWhitespace: false,
      rawCharacters: 0,
      acceptedCharacters: 0,
      sequenceActive: false,
      sequenceWhitespaceIssue: false,
      trailingWhitespace: false
    };
  }

  function classifyNonHeaderLine(line) {
    if (line.kind) return null;
    if (mode === null) {
      mode = allowRawSequence ? "raw" : "fasta";
      usedRawSequence = mode === "raw";
      pendingBlankLines = 0;
    }
    if (mode === "raw") {
      line.kind = "sequence";
      pendingBlankLines = 0;
      if (!record) return beginRecord("sequence", false);
    } else {
      line.kind = record ? "sequence" : "preamble";
    }
    return null;
  }

  function activateSequenceLine(line) {
    if (line.sequenceActive || line.kind !== "sequence" || !record) return;
    for (let index = 0; index < pendingBlankLines; index += 1) record.issues.push("blank sequence line");
    pendingBlankLines = 0;
    record.sequenceLines += 1;
    line.sequenceActive = true;
  }

  function inspectSequenceWhitespace(line, text) {
    const lastNonWhitespace = text.search(/\S(?=\s*$)/);
    if (lastNonWhitespace === -1) {
      if (text) line.trailingWhitespace = true;
      return "";
    }
    if (line.trailingWhitespace || /\s/.test(text.slice(0, lastNonWhitespace))) {
      line.sequenceWhitespaceIssue = true;
    }
    line.trailingWhitespace = lastNonWhitespace < text.length - 1;
    return text.replace(/\s+/g, "");
  }

  let line = makeLineState();
  for await (const segment of lineSegments) {
    context.throwIfCancelled?.();
    const text = segment.text;
    line.rawCharacters += text.length;
    let headerPartStart = null;
    if (line.kind === null && mode !== "raw") {
      if (line.charactersSeen === 0 && text.startsWith(">")) {
        headerPartStart = 1;
      } else if (mode === null && !nonWhitespaceSeen && !line.nonWhitespace) {
        const firstNonWhitespace = text.search(/\S/);
        if (firstNonWhitespace >= 0 && text[firstNonWhitespace] === ">") {
          // The established parser trims the complete pasted value before
          // recognizing its first header. Match that behavior without
          // materializing or trimming the full streamed source.
          headerPartStart = firstNonWhitespace + 1;
        }
      }
    }
    if (headerPartStart !== null) {
      line.kind = "header";
      line.headerParts = [];
      line.headerMarkerConsumed = true;
      if (mode === null) mode = "fasta";
      if (record) {
        for (let index = 0; index < pendingBlankLines; index += 1) record.issues.push("blank sequence line");
        const end = endRecord();
        if (end) yield end;
      }
      pendingBlankLines = 0;
      hadFastaHeader = true;
      nonWhitespaceSeen = true;
    }

    if (line.kind === "header") {
      const headerPart = headerPartStart === null ? text : text.slice(headerPartStart);
      line.headerMarkerConsumed = true;
      line.headerCharacters += headerPart.length;
      if (line.headerCharacters > limits.maxHeaderCharacters) {
        throw makeLimitError("FASTA header characters", line.headerCharacters, limits.maxHeaderCharacters);
      }
      if (headerPart) line.headerParts.push(headerPart);
    } else {
      const hasNonWhitespace = /\S/.test(text);
      if (hasNonWhitespace) {
        line.nonWhitespace = true;
        nonWhitespaceSeen = true;
        const start = classifyNonHeaderLine(line);
        if (start) yield start;
        if (line.kind === "sequence") {
          activateSequenceLine(line);
          const cleaned = inspectSequenceWhitespace(line, text);
          if (cleaned) {
            line.acceptedCharacters += cleaned.length;
            yield* emitSequence(cleaned);
          }
        }
      } else if (line.kind === "sequence") {
        inspectSequenceWhitespace(line, text);
      } else if (text) {
        line.trailingWhitespace = true;
      }
    }

    line.charactersSeen += text.length;

    if (!segment.endOfLine) continue;
    if (line.kind === "header") {
      const headerBody = line.headerParts.join("");
      const normalizedHeaderBody = headerBody.trimEnd();
      const title = normalizedHeaderBody.trim() || `record-${recordCount + 1}`;
      const issues = [];
      if (!normalizedHeaderBody.trim()) issues.push("missing title");
      if (normalizedHeaderBody.trimStart() !== normalizedHeaderBody) issues.push("header has leading whitespace after >");
      const start = beginRecord(title, true, issues);
      if (start) yield start;
    } else if (!line.nonWhitespace) {
      pendingBlankLines += 1;
    } else if (line.kind === "preamble") {
      preambleLines += 1;
      pendingBlankLines = 0;
    } else if (mode === "fasta" && line.kind === "sequence" && line.sequenceWhitespaceIssue && record) {
      record.issues.push("sequence line contains whitespace");
    }
    if (line.kind === "sequence" && line.nonWhitespace) {
      rawSequenceCharacters += line.rawCharacters;
      ignoredSequenceWhitespace += line.rawCharacters - line.acceptedCharacters;
    }
    line = makeLineState();
  }

  const end = endRecord();
  if (end) yield end;
  if (preambleLines > 0) {
    if (trackStats) stats.warnings.push(`${preambleLines} non-header line(s) before the first FASTA header were ignored.`);
  }
  if (trackStats) {
    stats.bases = totalBases;
    stats.emittedBases = emittedBases;
    stats.hadFastaHeader = hadFastaHeader;
    stats.ignoredSequenceWhitespace = ignoredSequenceWhitespace;
    stats.nonWhitespaceSeen = nonWhitespaceSeen;
    stats.rawSequenceCharacters = rawSequenceCharacters;
    stats.records = recordCount;
    stats.totalHeaderCharacters = totalHeaderCharacters;
    stats.usedRawSequence = usedRawSequence;
  }
}

async function openIndexedSource(input, options, context, limits, stats) {
  if (Number.isFinite(options.faiFile?.size) && options.faiFile.size > limits.maxIndexBytes) {
    throw makeLimitError("FAI index bytes", options.faiFile.size, limits.maxIndexBytes);
  }
  if (Number.isFinite(options.gziFile?.size) && options.gziFile.size > limits.maxIndexBytes) {
    throw makeLimitError("GZI index bytes", options.gziFile.size, limits.maxIndexBytes);
  }
  const indexedInput = await resolveIndexedFastaRegionInput(input, options);
  checkFileSize(indexedInput.fastaFile, limits);
  const fai = parseFaiIndex(indexedInput.faiText);
  if (fai.warnings.length > 0) throw new Error(fai.warnings.join(" "));
  const records = [...fai.records.values()];
  for (const record of records) {
    if (record.name.length > limits.maxHeaderCharacters) {
      throw makeLimitError("FAI sequence-name characters", record.name.length, limits.maxHeaderCharacters);
    }
  }
  if (records.length > limits.maxRecords) throw makeLimitError("FASTA record count", records.length, limits.maxRecords);
  let estimatedBases = 0;
  let totalHeaderCharacters = 0;
  for (const record of records) {
    estimatedBases += record.length;
    totalHeaderCharacters += record.name.length;
    if (estimatedBases > limits.maxAcceptedBases) throw makeLimitError("Indexed FASTA bases", estimatedBases, limits.maxAcceptedBases);
    if (totalHeaderCharacters > limits.maxTotalHeaderCharacters) {
      throw makeLimitError("Total FAI sequence-name characters", totalHeaderCharacters, limits.maxTotalHeaderCharacters);
    }
  }
  const reader = makeIndexedFastaReader(indexedInput, { preferJs: true, suppressFallbackWarning: true });
  stats.inputProvided = true;
  stats.estimatedRecords = records.length;
  stats.estimatedBases = estimatedBases;
  stats.totalHeaderCharacters = totalHeaderCharacters;
  stats.warnings.push("Indexed FASTA scans use sequence names and spans stored in the FAI. Full original header descriptions and line-format diagnostics are unavailable.");

  return {
    sourceMode: indexedInput.isBgzip ? "bgzf" : "indexed",
    sourceLabel: indexedInput.isBgzip ? "indexed BGZF FASTA" : "indexed FASTA",
    supportsRanges: true,
    readRange(recordId, start0, end0, readOptions = {}) {
      return reader.getSequence(recordId, start0, end0, {
        signal: readOptions.signal ?? context.signal
      });
    },
    async *events(iterationOptions = {}) {
      const selectedRecords = normalizeRecordSelection(iterationOptions.recordIndexes);
      const trackStats = iterationOptions.trackStats !== false;
      let basesRead = 0;
      if (trackStats) {
        stats.records = records.length;
        stats.bases = estimatedBases;
        stats.rawSequenceCharacters = estimatedBases;
        stats.ignoredSequenceWhitespace = 0;
        stats.nonWhitespaceSeen = records.length > 0;
        stats.hadFastaHeader = records.length > 0;
      }
      for (const [recordOffset, record] of records.entries()) {
        const index = recordOffset + 1;
        if (selectedRecords !== null && !selectedRecords.has(index)) continue;
        const issues = [];
        yield { type: "record-start", record: index, title: record.name, hadHeader: true, issues };
        let extractedLength = 0;
        for (let start = 0; start < record.length; start += limits.chunkSize) {
          const end = Math.min(record.length, start + limits.chunkSize);
          const sequence = await reader.getSequence(record.name, start, end, { signal: context.signal }) || "";
          extractedLength += sequence.length;
          basesRead += sequence.length;
          yield {
            type: "sequence-chunk",
            record: index,
            title: record.name,
            sequenceOffset: start,
            text: sequence
          };
          context.reportProgress?.({
            phase: "reading-indexed-fasta",
            detail: `${record.name}:${start + 1}-${end}`,
            progress: estimatedBases > 0 ? Math.min(0.95, basesRead / estimatedBases) : 0.95
          });
          context.throwIfCancelled?.();
          await context.yieldIfNeeded?.();
        }
        if (trackStats && extractedLength !== record.length) {
          stats.warnings.push(`${record.name}: extracted ${extractedLength} character(s), expected ${record.length}; check FASTA/FAI pairing.`);
        }
        yield {
          type: "record-end",
          record: index,
          title: record.name,
          hadHeader: true,
          length: extractedLength,
          sequenceLines: record.length > 0 && record.lineBases > 0 ? Math.ceil(record.length / record.lineBases) : 0,
          issues
        };
      }
      if (trackStats) stats.emittedBases = basesRead;
    }
  };
}

export async function openFastaRecordSource(input, options = {}, context = {}) {
  const limits = normalizeLimits(options);
  const requestedMode = ["indexed", "bgzf"].includes(options.sourceMode) ? options.sourceMode : "loaded";
  const stats = {
    bases: 0,
    decodedBytes: 0,
    emittedBases: 0,
    estimatedBases: null,
    estimatedRecords: null,
    hadFastaHeader: false,
    ignoredSequenceWhitespace: 0,
    inputProvided: false,
    nonWhitespaceSeen: false,
    records: 0,
    rawSequenceCharacters: 0,
    totalHeaderCharacters: 0,
    usedRawSequence: false,
    warnings: []
  };

  if (requestedMode !== "loaded") {
    const indexed = await openIndexedSource(input, options, context, limits, stats);
    return { ...indexed, limits, stats, warnings: stats.warnings };
  }

  const file = options.loadedFastaFile?.stream ? options.loadedFastaFile : null;
  stats.inputProvided = Boolean(file || String(input ?? "").trim());
  return {
    sourceMode: "loaded",
    sourceLabel: file ? (String(file.name ?? "").toLowerCase().endsWith(".gz") ? "streamed FASTA.GZ" : "streamed FASTA") : "pasted FASTA",
    supportsRanges: false,
    limits,
    stats,
    warnings: stats.warnings,
    events(iterationOptions = {}) {
      return iterateTextFasta({
        input,
        file,
        limits,
        allowRawSequence: options.allowRawSequence === true,
        recordIndexes: iterationOptions.recordIndexes,
        stats,
        context,
        trackStats: iterationOptions.trackStats !== false
      });
    }
  };
}
