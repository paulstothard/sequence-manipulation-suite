import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import {
  assembleLightweightSequences,
  makeAssemblyFasta,
  makeAssemblyTextMap
} from "./lightweight-sequence-assembly.js";
import { alignPairwiseAffine } from "./pairwise-alignment.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";

export const SANGER_TRACE_CHANNELS = ["A", "C", "G", "T"];
export const SANGER_SESSION_SEPARATOR = "---SMS3-SANGER-SESSION-PART---";

export const sangerBaseCallColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "display_index", label: "Display index", type: "number" },
  { id: "base", label: "Base", type: "string" },
  { id: "original_index", label: "Original index", type: "number" },
  { id: "original_trace_position", label: "Original trace position", type: "number" },
  { id: "display_trace_position", label: "Display trace position", type: "number" },
  { id: "quality", label: "Phred quality", type: "number" },
  { id: "orientation", label: "Orientation", type: "string" },
  { id: "edited", label: "Edited", type: "boolean" },
  { id: "below_quality_threshold", label: "Below threshold", type: "boolean" }
];

export const sangerReferenceDifferenceColumns = [
  { id: "query_type", label: "Query type", type: "string" },
  { id: "query_name", label: "Query name", type: "string" },
  { id: "orientation", label: "Orientation", type: "string" },
  { id: "reference", label: "Reference", type: "string" },
  { id: "alignment_column", label: "Alignment column", type: "number" },
  { id: "reference_position", label: "Reference position", type: "number" },
  { id: "query_position", label: "Query position", type: "number" },
  { id: "reference_base", label: "Reference base", type: "string" },
  { id: "query_base", label: "Query base", type: "string" },
  { id: "relation", label: "Relation", type: "string" },
  { id: "quality", label: "Query quality", type: "number" }
];

const CHANNEL_COLORS = {
  A: "#2f9e44",
  C: "#1d4ed8",
  G: "#111827",
  T: "#dc2626"
};

const SANGER_SVG_TEXT_STYLE = `<style>
.sanger-svg text{font-family:Inter,"Segoe UI",Arial,sans-serif;text-rendering:geometricPrecision}
.sanger-svg text[font-weight="700"],.sanger-svg text[font-weight="800"]{font-weight:600}
.sanger-svg text[font-size="17"][font-weight],.sanger-svg text[font-size="18"][font-weight],.sanger-svg text[font-size="20"][font-weight]{font-weight:650}
.sanger-svg text[font-family*="ui-monospace"],.sanger-svg .sanger-align-cell,.sanger-svg .sanger-align-marker,.sanger-svg .sanger-align-coord{font-family:Inter,"Segoe UI",Arial,sans-serif;font-weight:600;letter-spacing:.045em}
.sanger-svg .sanger-align-title,.sanger-svg .sanger-align-section{font-family:Inter,"Segoe UI",Arial,sans-serif;font-weight:650}
.sanger-svg .sanger-align-label,.sanger-svg .sanger-align-subtitle,.sanger-svg .sanger-align-footer{font-family:Inter,"Segoe UI",Arial,sans-serif;font-weight:400}
</style>`;

const DNA_IUPAC_BASES = new Set(["A", "C", "G", "T", "U", "R", "Y", "S", "W", "K", "M", "B", "D", "H", "V", "N"]);
const IUPAC_AMBIGUITY_BY_BASE_SET = new Map([
  ["A", "A"],
  ["C", "C"],
  ["G", "G"],
  ["T", "T"],
  ["AG", "R"],
  ["CT", "Y"],
  ["CG", "S"],
  ["AT", "W"],
  ["GT", "K"],
  ["AC", "M"],
  ["CGT", "B"],
  ["AGT", "D"],
  ["ACT", "H"],
  ["ACG", "V"],
  ["ACGT", "N"]
]);
const ABIF_DIRECTORY_ENTRY_SIZE = 28;
const SCF_HEADER_SIZE = 128;
const SANGER_TRIM_METHODS = new Set(["manual", "mott"]);
const REFERENCE_COMPARISON_OUTPUT_FORMATS = new Set([
  "reference-trace-map-svg",
  "reference-differences-tsv",
  "reference-alignment-svg",
  "difference-review-svg"
]);

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactMiddle(value, maxLength = 28) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }
  const keepLeft = Math.max(6, Math.ceil((maxLength - 3) * 0.45));
  const keepRight = Math.max(6, maxLength - 3 - keepLeft);
  return `${text.slice(0, keepLeft)}...${text.slice(-keepRight)}`;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeTrimMethod(value) {
  const method = String(value ?? "manual").trim().toLowerCase();
  return SANGER_TRIM_METHODS.has(method) ? method : "manual";
}

function canonicalEvidenceBase(base) {
  const upper = String(base ?? "").trim().toUpperCase();
  if (upper === "U") {
    return "T";
  }
  return SANGER_TRACE_CHANNELS.includes(upper) ? upper : "";
}

function iupacAmbiguityForEvidence(bases) {
  const key = [...new Set(bases.map(canonicalEvidenceBase).filter(Boolean))].sort().join("");
  return IUPAC_AMBIGUITY_BY_BASE_SET.get(key) ?? "";
}

function makeAmbiguousIupacContigSequence(contig) {
  const sequence = String(contig.sequence ?? "");
  const consensus = sequence.split("");
  const ambiguousPositions = [];
  for (let position = 1; position <= consensus.length; position += 1) {
    const evidenceBases = [];
    for (const read of contig.reads ?? []) {
      if (position < read.start || position > read.end) {
        continue;
      }
      const readPosition = position - read.start;
      const base = canonicalEvidenceBase(read.sequence?.[readPosition]);
      if (base) {
        evidenceBases.push(base);
      }
    }
    const distinct = [...new Set(evidenceBases)].sort();
    if (distinct.length <= 1) {
      continue;
    }
    const ambiguityBase = iupacAmbiguityForEvidence(distinct);
    if (!ambiguityBase) {
      continue;
    }
    consensus[position - 1] = ambiguityBase;
    ambiguousPositions.push({
      position,
      code: ambiguityBase,
      bases: distinct.join("/")
    });
  }
  return {
    sequence: consensus.join(""),
    ambiguousPositions
  };
}

function applyAmbiguousIupacConsensusToAssembly(assembly) {
  const contigs = (assembly.contigs ?? []).map((contig) => {
    const updated = makeAmbiguousIupacContigSequence(contig);
    return {
      ...contig,
      sequence: updated.sequence,
      ambiguousConsensus: true,
      ambiguousPositions: updated.ambiguousPositions
    };
  });
  const ambiguousConsensusPositions = contigs.reduce(
    (sum, contig) => sum + (contig.ambiguousPositions?.length ?? 0),
    0
  );
  return {
    ...assembly,
    contigs,
    options: {
      ...assembly.options,
      useAmbiguousIupacConsensus: true
    },
    ambiguousConsensusPositions
  };
}

function normalizeBase(base) {
  const upper = String(base ?? "").trim().toUpperCase().charAt(0);
  return DNA_IUPAC_BASES.has(upper) ? (upper === "U" ? "T" : upper) : "N";
}

function normalizeTraceName(raw) {
  return String(raw?.name ?? raw?.id ?? raw?.title ?? "sanger_trace").trim() || "sanger_trace";
}

function normalizeBaseCalls(raw, warnings) {
  const basesFromString = typeof raw.bases === "string"
    ? raw.bases.replace(/\s+/g, "").split("")
    : [];
  const explicitCalls = Array.isArray(raw.baseCalls) ? raw.baseCalls : [];
  const sourceCalls = explicitCalls.length > 0
    ? explicitCalls
    : basesFromString.map((base, index) => ({
        base,
        position: Array.isArray(raw.basePositions) ? raw.basePositions[index] : undefined,
        quality: Array.isArray(raw.qualities) ? raw.qualities[index] : undefined
      }));

  const baseCalls = [];
  let lastPosition = 0;
  let invalidBases = 0;

  for (const [index, call] of sourceCalls.entries()) {
    const normalizedBase = normalizeBase(call?.base ?? call);
    if (normalizedBase === "N" && String(call?.base ?? call).trim().toUpperCase().charAt(0) !== "N") {
      invalidBases += 1;
    }
    const requestedPosition = Number.parseInt(call?.position ?? call?.tracePosition ?? call?.basePosition, 10);
    const generatedPosition = (index + 1) * 12;
    const position = Number.isFinite(requestedPosition)
      ? Math.max(1, requestedPosition)
      : generatedPosition;
    const monotonicPosition = position <= lastPosition ? lastPosition + 1 : position;
    lastPosition = monotonicPosition;
    const quality = call?.quality === null || call?.quality === undefined || call?.quality === ""
      ? null
      : clampNumber(call.quality, null, 0, 93);
    baseCalls.push({
      base: normalizedBase,
      originalBase: normalizedBase,
      originalIndex: index + 1,
      originalTracePosition: monotonicPosition,
      tracePosition: monotonicPosition,
      quality,
      edited: false
    });
  }

  if (invalidBases > 0) {
    warnings.push(`Converted ${invalidBases} invalid base call(s) to N.`);
  }

  return baseCalls;
}

function normalizeTraceArrays(raw, baseCalls, warnings) {
  const rawTraces = raw.traces && typeof raw.traces === "object" ? raw.traces : {};
  const provided = {};
  let providedChannels = 0;
  let maxLength = 0;

  for (const channel of SANGER_TRACE_CHANNELS) {
    if (Array.isArray(rawTraces[channel])) {
      provided[channel] = rawTraces[channel].map((value) => Math.max(0, Number(value) || 0));
      providedChannels += 1;
      maxLength = Math.max(maxLength, provided[channel].length);
    }
  }

  if (providedChannels === SANGER_TRACE_CHANNELS.length) {
    const traces = {};
    for (const channel of SANGER_TRACE_CHANNELS) {
      traces[channel] = provided[channel].slice();
      while (traces[channel].length < maxLength) {
        traces[channel].push(0);
      }
    }
    return {
      traces,
      sampleCount: maxLength,
      synthetic: false
    };
  }

  if (providedChannels > 0) {
    warnings.push("Some trace channels were missing; generated a preview trace from base calls instead of mixing measured and generated channels.");
  } else if (raw.traceMode !== "base-call-preview" && raw.previewTrace !== true) {
    warnings.push("No raw A/C/G/T trace channels were supplied; generated a preview trace from base calls.");
  }

  return makeSyntheticTraceArrays(baseCalls);
}

function makeSyntheticTraceArrays(baseCalls) {
  const lastPosition = baseCalls.length > 0
    ? Math.max(...baseCalls.map((call) => call.originalTracePosition))
    : 1;
  const sampleCount = Math.max(80, lastPosition + 20);
  const traces = Object.fromEntries(SANGER_TRACE_CHANNELS.map((channel) => [channel, new Array(sampleCount).fill(0)]));

  for (const call of baseCalls) {
    const quality = call.quality ?? 30;
    const mainAmplitude = 380 + quality * 11;
    const secondaryAmplitude = Math.max(30, mainAmplitude * 0.08);
    const sigma = quality >= 30 ? 2.3 : 3.6;
    for (let index = 0; index < sampleCount; index += 1) {
      const x = index + 1;
      const distance = x - call.originalTracePosition;
      const peak = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      for (const channel of SANGER_TRACE_CHANNELS) {
        const amplitude = channel === call.base ? mainAmplitude : secondaryAmplitude;
        traces[channel][index] += amplitude * peak;
      }
    }
  }

  for (const channel of SANGER_TRACE_CHANNELS) {
    traces[channel] = traces[channel].map((value) => Math.round(value));
  }

  return {
    traces,
    sampleCount,
    synthetic: true
  };
}

function parseJsonTrace(input) {
  const raw = JSON.parse(input);
  if (raw?.format === "sms3-binary-ab1-v1" || raw?.format === "sms3-binary-abif-v1") {
    return parseAbifTrace(bytesFromBase64(raw.base64), raw.filename ?? raw.name ?? "AB1 trace");
  }
  if (raw?.format === "sms3-binary-scf-v1") {
    return parseScfTrace(bytesFromBase64(raw.base64), raw.filename ?? raw.name ?? "SCF trace");
  }
  if (Array.isArray(raw)) {
    return raw[0] ?? {};
  }
  if (Array.isArray(raw.records)) {
    return raw.records[0] ?? {};
  }
  if (raw.trace && typeof raw.trace === "object") {
    return raw.trace;
  }
  return raw;
}

function parseJsonSession(input) {
  const raw = JSON.parse(input);
  if (raw?.format !== "sms3-sanger-trace-session-v1" || !Array.isArray(raw.traces)) {
    return null;
  }
  return {
    traces: raw.traces.map((trace) => typeof trace === "string" ? trace : JSON.stringify(trace)),
    reference: typeof raw.reference === "string"
      ? raw.reference
      : raw.reference
        ? formatFastaRecord(raw.reference.name ?? raw.reference.title ?? "reference", raw.reference.sequence ?? "")
        : ""
  };
}

function splitSangerSessionInput(input) {
  const text = String(input ?? "");
  let parsedSession = null;
  try {
    parsedSession = parseJsonSession(text);
  } catch {
    parsedSession = null;
  }
  if (parsedSession) {
    return parsedSession;
  }

  const separator = `\n${SANGER_SESSION_SEPARATOR}\n`;
  if (!text.includes(separator)) {
    return null;
  }
  const parts = text.split(separator);
  const reference = parts.length >= 2 ? parts.at(-1) ?? "" : "";
  const traces = parts.length >= 2 ? parts.slice(0, -1) : parts;
  return { traces, reference };
}

function parseSequencePreviewTrace(input, warnings) {
  const records = parseSequenceInput(input, "sanger_base_calls_preview");
  const record = records[0];
  if (!record) {
    throw new Error("No Sanger trace input was provided.");
  }
  const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
  if (cleaned.sequence.length === 0) {
    throw new Error("No DNA base calls were found in the input.");
  }
  warnings.push("Interpreted DNA/FASTA input as base calls and generated a preview trace. Use AB1/ABIF or SCF files when measured chromatogram channels are needed.");
  return {
    format: "sms3-sanger-trace-v1",
    traceMode: "base-call-preview",
    name: record.title,
    bases: cleaned.sequence,
    qualities: new Array(cleaned.sequence.length).fill(30)
  };
}

function bytesFromBase64(base64) {
  const text = String(base64 ?? "").replace(/\s+/g, "");
  if (!text) {
    throw new Error("The binary trace input wrapper did not contain base64 data.");
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(text, "base64"));
  }
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

function readAscii(bytes, offset, length) {
  let text = "";
  const end = Math.min(bytes.length, offset + Math.max(0, length));
  for (let index = offset; index < end; index += 1) {
    const value = bytes[index];
    if (value === 0) {
      continue;
    }
    text += String.fromCharCode(value);
  }
  return text;
}

function readDirectoryEntry(bytes, view, offset) {
  if (offset < 0 || offset + ABIF_DIRECTORY_ENTRY_SIZE > bytes.length) {
    throw new Error("ABIF directory entry is outside the file.");
  }
  return {
    name: readAscii(bytes, offset, 4),
    number: view.getInt32(offset + 4, false),
    elementType: view.getUint16(offset + 8, false),
    elementSize: view.getUint16(offset + 10, false),
    numElements: view.getUint32(offset + 12, false),
    dataSize: view.getUint32(offset + 16, false),
    dataOffset: view.getUint32(offset + 20, false),
    dataHandle: view.getUint32(offset + 24, false),
    inlineOffset: offset + 20
  };
}

function getAbifDataRegion(entry, bytes) {
  const offset = entry.dataSize <= 4 ? entry.inlineOffset : entry.dataOffset;
  const size = entry.dataSize;
  if (offset < 0 || offset + size > bytes.length) {
    throw new Error(`ABIF tag ${entry.name}.${entry.number} points outside the file.`);
  }
  return { offset, size };
}

function readAbifEntryValue(entry, bytes, view) {
  const { offset, size } = getAbifDataRegion(entry, bytes);
  const count = entry.numElements;
  if (entry.elementType === 2 || entry.elementType === 19) {
    return readAscii(bytes, offset, size).replace(/\0+$/g, "");
  }
  if (entry.elementType === 18) {
    const length = bytes[offset] ?? 0;
    return readAscii(bytes, offset + 1, Math.min(length, Math.max(0, size - 1)));
  }
  if (entry.elementType === 1) {
    return Array.from(bytes.slice(offset, offset + count));
  }
  if (entry.elementType === 3 || entry.elementType === 4) {
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const valueOffset = offset + index * 2;
      if (valueOffset + 2 > bytes.length) {
        break;
      }
      values.push(entry.elementType === 3
        ? view.getUint16(valueOffset, false)
        : view.getInt16(valueOffset, false));
    }
    return values;
  }
  if (entry.elementType === 5) {
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const valueOffset = offset + index * 4;
      if (valueOffset + 4 > bytes.length) {
        break;
      }
      values.push(view.getInt32(valueOffset, false));
    }
    return values;
  }
  return Array.from(bytes.slice(offset, offset + size));
}

function readAbifEntryBytes(entry, bytes) {
  const { offset, size } = getAbifDataRegion(entry, bytes);
  return Array.from(bytes.slice(offset, offset + size));
}

function getEntry(entries, name, numbers) {
  for (const number of numbers) {
    const entry = entries.get(`${name}.${number}`);
    if (entry) {
      return entry;
    }
  }
  return null;
}

function normalizeAbifNumericArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item) || 0);
  }
  return [];
}

function ensureBinaryRegion(bytes, offset, size, label) {
  if (!Number.isFinite(offset) || !Number.isFinite(size) || offset < 0 || size < 0 || offset + size > bytes.length) {
    throw new Error(`${label} is outside the file.`);
  }
}

function readScfSamples(bytes, view, offset, count, sampleSize, signed = false) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const valueOffset = offset + index * sampleSize;
    if (sampleSize === 1) {
      values.push(signed ? view.getInt8(valueOffset) : view.getUint8(valueOffset));
    } else {
      values.push(signed ? view.getInt16(valueOffset, false) : view.getUint16(valueOffset, false));
    }
  }
  return values;
}

function deltaDeltaDecodeScf(values) {
  // SCF 3.x stores trace samples as two rounds of signed deltas.
  // This follows the public sangerseqR read.scf implementation and the Staden SCF format notes.
  let previous = 0;
  const firstPass = values.map((value) => {
    previous += value;
    return previous;
  });
  previous = 0;
  return firstPass.map((value) => {
    previous += value;
    return previous;
  });
}

function parseScfVersion(versionText) {
  const numeric = Number.parseFloat(versionText);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calledBaseQuality(base, probabilities) {
  const index = SANGER_TRACE_CHANNELS.indexOf(base);
  if (index >= 0) {
    return probabilities[index] ?? null;
  }
  return Math.max(...probabilities.filter((value) => Number.isFinite(value)), 0);
}

export function parseScfTrace(input, filename = "SCF trace") {
  const bytes = toUint8Array(input);
  if (!bytes) {
    throw new Error("SCF parser expected an ArrayBuffer or Uint8Array.");
  }
  if (bytes.length < SCF_HEADER_SIZE || readAscii(bytes, 0, 4) !== ".scf") {
    throw new Error("Input is not an SCF chromatogram file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = view.getInt32(4, false);
  const samplesOffset = view.getInt32(8, false);
  const bases = view.getInt32(12, false);
  const basesOffset = view.getInt32(24, false);
  const commentsSize = view.getInt32(28, false);
  const commentsOffset = view.getInt32(32, false);
  const versionText = readAscii(bytes, 36, 4);
  const version = parseScfVersion(versionText);
  const sampleSize = view.getInt32(40, false);
  const privateSize = view.getInt32(48, false);
  const privateOffset = view.getInt32(52, false);

  if (samples <= 0 || bases <= 0) {
    throw new Error("SCF file does not contain trace samples and base calls.");
  }
  if (sampleSize !== 1 && sampleSize !== 2) {
    throw new Error(`Unsupported SCF sample size ${sampleSize}; expected 1 or 2 bytes.`);
  }

  const sampleValueCount = samples * SANGER_TRACE_CHANNELS.length;
  ensureBinaryRegion(bytes, samplesOffset, sampleValueCount * sampleSize, "SCF sample data");
  ensureBinaryRegion(bytes, basesOffset, bases * 12, "SCF base-call data");
  if (commentsSize > 0) {
    ensureBinaryRegion(bytes, commentsOffset, commentsSize, "SCF comments");
  }
  if (privateSize > 0) {
    ensureBinaryRegion(bytes, privateOffset, privateSize, "SCF private data");
  }

  const sampleValues = readScfSamples(bytes, view, samplesOffset, sampleValueCount, sampleSize, version > 2.9);
  const traces = Object.fromEntries(SANGER_TRACE_CHANNELS.map((channel) => [channel, []]));
  if (version > 2.9) {
    for (let channelIndex = 0; channelIndex < SANGER_TRACE_CHANNELS.length; channelIndex += 1) {
      const start = channelIndex * samples;
      const channel = SANGER_TRACE_CHANNELS[channelIndex];
      traces[channel] = deltaDeltaDecodeScf(sampleValues.slice(start, start + samples));
    }
  } else {
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
      for (let channelIndex = 0; channelIndex < SANGER_TRACE_CHANNELS.length; channelIndex += 1) {
        const channel = SANGER_TRACE_CHANNELS[channelIndex];
        traces[channel].push(sampleValues[sampleIndex * SANGER_TRACE_CHANNELS.length + channelIndex] ?? 0);
      }
    }
  }

  const basePositions = [];
  const baseCalls = [];
  const qualities = [];
  const baseProbabilities = [];
  if (version > 2.9) {
    const positionOffset = basesOffset;
    const probabilityOffset = basesOffset + bases * 4;
    const baseOffset = basesOffset + bases * 8;
    for (let index = 0; index < bases; index += 1) {
      const probabilities = SANGER_TRACE_CHANNELS.map((_, channelIndex) => bytes[probabilityOffset + channelIndex * bases + index] ?? 0);
      const base = normalizeBase(String.fromCharCode(bytes[baseOffset + index] ?? 78).replace("-", "N"));
      basePositions.push(view.getInt32(positionOffset + index * 4, false));
      baseCalls.push(base);
      baseProbabilities.push(probabilities);
      qualities.push(calledBaseQuality(base, probabilities));
    }
  } else {
    for (let index = 0; index < bases; index += 1) {
      const offset = basesOffset + index * 12;
      const probabilities = SANGER_TRACE_CHANNELS.map((_, channelIndex) => bytes[offset + 4 + channelIndex] ?? 0);
      const base = normalizeBase(String.fromCharCode(bytes[offset + 8] ?? 78).replace("-", "N"));
      basePositions.push(view.getInt32(offset, false));
      baseCalls.push(base);
      baseProbabilities.push(probabilities);
      qualities.push(calledBaseQuality(base, probabilities));
    }
  }

  return {
    format: "scf",
    name: String(filename || "SCF trace").replace(/\.scf$/i, ""),
    source: `SCF version ${versionText}; ${samples.toLocaleString()} samples; ${bases.toLocaleString()} base calls`,
    bases: baseCalls.join(""),
    basePositions,
    qualities,
    traces,
    scf: {
      version,
      versionText,
      samples,
      sampleSize,
      baseCalls: bases,
      commentsSize,
      hasPrivateData: privateSize > 0
    },
    baseProbabilities
  };
}

export function parseAbifTrace(input, filename = "AB1 trace") {
  const bytes = toUint8Array(input);
  if (!bytes) {
    throw new Error("ABIF parser expected an ArrayBuffer or Uint8Array.");
  }
  if (bytes.length < 34 || readAscii(bytes, 0, 4) !== "ABIF") {
    throw new Error("Input is not an ABIF/AB1 file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, false);
  const root = readDirectoryEntry(bytes, view, 6);
  const directoryOffset = root.dataOffset;
  const directoryCount = root.numElements;
  if (directoryOffset + directoryCount * ABIF_DIRECTORY_ENTRY_SIZE > bytes.length) {
    throw new Error("ABIF root directory is outside the file.");
  }

  const entries = new Map();
  for (let index = 0; index < directoryCount; index += 1) {
    const entry = readDirectoryEntry(bytes, view, directoryOffset + index * ABIF_DIRECTORY_ENTRY_SIZE);
    entries.set(`${entry.name}.${entry.number}`, entry);
  }

  const basesEntry = getEntry(entries, "PBAS", [2, 1]);
  const positionsEntry = getEntry(entries, "PLOC", [2, 1]);
  if (!basesEntry || !positionsEntry) {
    throw new Error("ABIF file is missing required PBAS or PLOC base-call tags.");
  }
  const baseString = String(readAbifEntryValue(basesEntry, bytes, view) ?? "").replace(/\s+/g, "");
  const positions = normalizeAbifNumericArray(readAbifEntryValue(positionsEntry, bytes, view));
  const qualityEntry = getEntry(entries, "PCON", [2, 1]);
  const qualities = qualityEntry
    ? readAbifEntryBytes(qualityEntry, bytes)
    : [];

  const channelOrderEntry = getEntry(entries, "FWO_", [1]);
  const channelOrder = String(channelOrderEntry ? readAbifEntryValue(channelOrderEntry, bytes, view) : "ACGT")
    .replace(/[^ACGT]/gi, "")
    .toUpperCase();
  const traces = Object.fromEntries(SANGER_TRACE_CHANNELS.map((channel) => [channel, []]));
  for (let index = 0; index < 4; index += 1) {
    const channel = channelOrder[index] ?? SANGER_TRACE_CHANNELS[index];
    const dataEntry = getEntry(entries, "DATA", [9 + index]);
    if (SANGER_TRACE_CHANNELS.includes(channel) && dataEntry) {
      traces[channel] = normalizeAbifNumericArray(readAbifEntryValue(dataEntry, bytes, view));
    }
  }

  const maxTraceLength = Math.max(0, ...SANGER_TRACE_CHANNELS.map((channel) => traces[channel].length));
  for (const channel of SANGER_TRACE_CHANNELS) {
    while (traces[channel].length < maxTraceLength) {
      traces[channel].push(0);
    }
  }

  return {
    format: "ab1",
    name: String(filename || "AB1 trace").replace(/\.(ab1|abi|abif)$/i, ""),
    source: `ABIF version ${version}; ${directoryCount} directory entries`,
    bases: baseString,
    basePositions: positions,
    qualities,
    traces,
    abif: {
      version,
      directoryEntries: directoryCount,
      baseTag: `${basesEntry.name}.${basesEntry.number}`,
      positionTag: `${positionsEntry.name}.${positionsEntry.number}`,
      qualityTag: qualityEntry ? `${qualityEntry.name}.${qualityEntry.number}` : "",
      channelOrder
    }
  };
}

export function parseSangerTraceInput(input) {
  const bytes = toUint8Array(input);
  if (bytes) {
    const magic = readAscii(bytes, 0, 4);
    const raw = magic === ".scf" ? parseScfTrace(bytes) : parseAbifTrace(bytes);
    const warnings = [];
    const baseCalls = normalizeBaseCalls(raw, warnings);
    const traceData = normalizeTraceArrays(raw, baseCalls, warnings);
    return {
      name: normalizeTraceName(raw),
      sourceFormat: raw.format,
      sourceNote: String(raw.source ?? ""),
      traceMode: traceData.synthetic ? "base-call-preview" : "measured-channels",
      baseCalls,
      traces: traceData.traces,
      sampleCount: Math.max(traceData.sampleCount, ...baseCalls.map((call) => call.originalTracePosition)),
      warnings
    };
  }
  const text = String(input ?? "").trim();
  const warnings = [];
  if (!text) {
    throw new Error("No Sanger trace input was provided.");
  }

  let raw;
  try {
    raw = parseJsonTrace(text);
  } catch (error) {
    if (/^\s*[\[{]/.test(text)) {
      throw error;
    }
    raw = parseSequencePreviewTrace(text, warnings);
  }

  const baseCalls = normalizeBaseCalls(raw, warnings);
  if (baseCalls.length === 0) {
    throw new Error("The Sanger trace input did not contain base calls.");
  }
  const traceData = normalizeTraceArrays(raw, baseCalls, warnings);
  const sampleCount = Math.max(
    traceData.sampleCount,
    baseCalls.length > 0 ? Math.max(...baseCalls.map((call) => call.originalTracePosition)) : 0
  );

  return {
    name: normalizeTraceName(raw),
    sourceFormat: String(raw.format ?? "sms3-sanger-trace-v1"),
    sourceNote: String(raw.source ?? ""),
    traceMode: traceData.synthetic ? "base-call-preview" : "measured-channels",
    baseCalls,
    traces: traceData.traces,
    sampleCount,
    warnings
  };
}

function normalizeOptions(options = {}, baseCallCount = 0) {
  const editBase = normalizeBase(options.editBase);
  return {
    clipStart: clampInteger(options.clipStart, 1, 1, Math.max(1, baseCallCount)),
    clipEnd: clampInteger(options.clipEnd, baseCallCount, 0, Math.max(0, baseCallCount)),
    lowQualityThreshold: clampInteger(options.lowQualityThreshold, 20, 0, 93),
    trimMethod: normalizeTrimMethod(options.trimMethod),
    mottErrorLimit: clampNumber(options.mottErrorLimit, 0.05, 0.000001, 0.5),
    mottMinimumBases: clampInteger(options.mottMinimumBases, 20, 1, Math.max(1, baseCallCount)),
    editPosition: clampInteger(options.editPosition, 0, 0, Math.max(0, baseCallCount)),
    editBase: String(options.editBase ?? "").trim() ? editBase : "",
    reverseComplement: options.reverseComplement === true,
    lineWidth: clampInteger(options.lineWidth, 60, 10, 200)
  };
}

export function calculateMottTrimRange(baseCalls, options = {}) {
  const count = Array.isArray(baseCalls) ? baseCalls.length : 0;
  const minimumBases = clampInteger(options.minimumBases, 20, 1, Math.max(1, count));
  const errorLimit = clampNumber(options.errorLimit, 0.05, 0.000001, 0.5);
  if (count <= minimumBases) {
    return {
      start: 1,
      end: count,
      score: 0,
      method: "mott",
      reason: "read shorter than minimum auto-trim length"
    };
  }

  let currentScore = 0;
  let currentStart = 0;
  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = -1;

  // Modified Mott trimming scores each base as limit - P(error) and keeps
  // the maximum-scoring contiguous region. This mirrors the Phred/CLC/Biopython
  // convention while avoiding Biopython's hard-coded first-base removal.
  baseCalls.forEach((call, index) => {
    const quality = Number(call?.quality);
    const errorProbability = Number.isFinite(quality)
      ? Math.pow(10, quality / -10)
      : 1;
    currentScore += errorLimit - errorProbability;
    if (currentScore <= 0) {
      currentScore = 0;
      currentStart = index + 1;
      return;
    }
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestStart = currentStart;
      bestEnd = index;
    }
  });

  const length = bestEnd >= bestStart ? bestEnd - bestStart + 1 : 0;
  if (bestScore <= 0 || length < minimumBases) {
    return {
      start: 1,
      end: count,
      score: bestScore,
      method: "mott",
      reason: "no confident quality region found"
    };
  }

  return {
    start: bestStart + 1,
    end: bestEnd + 1,
    score: bestScore,
    method: "mott",
    reason: "maximum quality-score region"
  };
}

function applyAutomaticTrimming(baseCalls, options, warnings) {
  const manualClipRequested = options.clipStart !== 1 || (options.clipEnd !== 0 && options.clipEnd !== baseCalls.length);
  if (options.trimMethod !== "mott" || manualClipRequested) {
    return {
      ...options,
      automaticTrim: null
    };
  }
  const trim = calculateMottTrimRange(baseCalls, {
    errorLimit: options.mottErrorLimit,
    minimumBases: options.mottMinimumBases
  });
  if (trim.start === 1 && trim.end === baseCalls.length && trim.reason !== "maximum quality-score region") {
    warnings.push(`Automatic quality trimming did not find a confident region; kept bases 1-${baseCalls.length}.`);
  }
  return {
    ...options,
    clipStart: trim.start,
    clipEnd: trim.end,
    automaticTrim: trim
  };
}

function applyBaseEdit(trace, options, warnings) {
  const baseCalls = trace.baseCalls.map((call) => ({ ...call }));
  if (!options.editPosition || !options.editBase) {
    return baseCalls;
  }
  const target = baseCalls[options.editPosition - 1];
  if (!target) {
    warnings.push(`Edit position ${options.editPosition} is outside the base-call range.`);
    return baseCalls;
  }
  target.base = options.editBase;
  target.edited = target.base !== target.originalBase;
  return baseCalls;
}

function sliceTraceForBaseCalls(trace, baseCalls) {
  const margin = 12;
  const minPosition = Math.min(...baseCalls.map((call) => call.originalTracePosition));
  const maxPosition = Math.max(...baseCalls.map((call) => call.originalTracePosition));
  const startIndex = Math.max(0, minPosition - margin - 1);
  const endIndex = Math.min(trace.sampleCount, maxPosition + margin);
  const sampleCount = Math.max(1, endIndex - startIndex);
  const traces = {};
  for (const channel of SANGER_TRACE_CHANNELS) {
    traces[channel] = (trace.traces[channel] ?? []).slice(startIndex, endIndex);
    while (traces[channel].length < sampleCount) {
      traces[channel].push(0);
    }
  }
  return {
    traces,
    sampleCount,
    baseCalls: baseCalls.map((call) => ({
      ...call,
      tracePosition: call.originalTracePosition - startIndex
    }))
  };
}

function reverseComplementView(view) {
  const traces = {
    A: view.traces.T.slice().reverse(),
    C: view.traces.G.slice().reverse(),
    G: view.traces.C.slice().reverse(),
    T: view.traces.A.slice().reverse()
  };
  const baseCalls = view.baseCalls
    .slice()
    .reverse()
    .map((call, index) => ({
      ...call,
      base: complementDnaRnaSequence(call.base, { preserveCase: false }),
      tracePosition: view.sampleCount - call.tracePosition + 1,
      displayIndex: index + 1,
      orientation: "reverse-complement"
    }));

  return {
    ...view,
    traces,
    baseCalls,
    orientation: "reverse-complement"
  };
}

function reverseComplementSequence(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function makeTraceView(trace, baseCalls, options, warnings) {
  const clipEnd = options.clipEnd === 0 ? baseCalls.length : options.clipEnd;
  const start = Math.min(options.clipStart, baseCalls.length);
  const end = Math.min(Math.max(start, clipEnd), baseCalls.length);
  if (clipEnd < options.clipStart && options.clipEnd !== 0) {
    warnings.push("Clip end was before clip start; used the clipped start base only.");
  }
  const selectedCalls = baseCalls.slice(start - 1, end);
  const sliced = sliceTraceForBaseCalls(trace, selectedCalls);
  let view = {
    record: trace.name,
    sourceFormat: trace.sourceFormat,
    sourceNote: trace.sourceNote,
    traceMode: trace.traceMode,
    orientation: "forward",
    clipStart: start,
    clipEnd: end,
    baseCalls: sliced.baseCalls.map((call, index) => ({
      ...call,
      displayIndex: index + 1,
      orientation: "forward"
    })),
    traces: sliced.traces,
    sampleCount: sliced.sampleCount
  };
  if (options.reverseComplement) {
    view = reverseComplementView(view);
  }
  return view;
}

export function prepareSangerTrace(input, options = {}) {
  const trace = parseSangerTraceInput(input);
  const warnings = [...trace.warnings];
  const normalized = normalizeOptions(options, trace.baseCalls.length);
  const editedBaseCalls = applyBaseEdit(trace, normalized, warnings);
  const effectiveOptions = applyAutomaticTrimming(editedBaseCalls, normalized, warnings);
  const view = makeTraceView(trace, editedBaseCalls, effectiveOptions, warnings);
  const sequence = view.baseCalls.map((call) => call.base).join("");
  const lowQualityCount = view.baseCalls.filter((call) =>
    call.quality !== null && call.quality < effectiveOptions.lowQualityThreshold
  ).length;
  const editedCount = view.baseCalls.filter((call) => call.edited).length;

  return {
    trace,
    view,
    options: effectiveOptions,
    automaticTrim: effectiveOptions.automaticTrim,
    sequence,
    lowQualityCount,
    editedCount,
    warnings
  };
}

function parseReferenceInput(input, warnings) {
  const text = String(input ?? "").trim();
  if (!text) {
    return null;
  }
  const records = parseSequenceInput(text, "sanger_reference");
  const record = records[0];
  if (!record) {
    warnings.push("Reference input was provided but no DNA/RNA sequence could be read.");
    return null;
  }
  const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
  if (!cleaned.sequence) {
    warnings.push(`${record.title || "Reference"}: no DNA/RNA sequence characters were found.`);
    return null;
  }
  if (cleaned.removedCount > 0) {
    warnings.push(`${record.title || "Reference"}: removed ${cleaned.removedCount} non-DNA/RNA character(s) from the reference.`);
  }
  return {
    title: record.title || "Reference",
    sequence: cleaned.sequence.replaceAll("U", "T")
  };
}

function parseBooleanSetting(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "rc", "reverse", "reverse-complement"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "forward"].includes(normalized)) return false;
  return null;
}

function parseTraceSettingsTsv(text, warnings) {
  const source = String(text ?? "").trim();
  if (!source) {
    return new Map();
  }
  const rows = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (rows.length === 0) {
    return new Map();
  }
  const splitRow = (line) => line.includes("\t") ? line.split("\t") : line.split(",");
  const first = splitRow(rows[0]).map((value) => value.trim().toLowerCase());
  const hasHeader = first.includes("trace") || first.includes("trace_index");
  const header = hasHeader
    ? first
    : ["trace", "clip_start", "clip_end", "edit_position", "edit_base", "reverse_complement"];
  const settings = new Map();
  const dataRows = hasHeader ? rows.slice(1) : rows;

  for (const [rowIndex, row] of dataRows.entries()) {
    const values = splitRow(row).map((value) => value.trim());
    const record = Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
    const traceIndex = Number.parseInt(record.trace_index || record.trace || record.index || "", 10);
    if (!Number.isInteger(traceIndex) || traceIndex < 1) {
      warnings.push(`Per-trace settings row ${rowIndex + 1}: trace must be a 1-based trace number.`);
      continue;
    }
    const next = {};
    const clipStart = Number.parseInt(record.clip_start || record.first_base || "", 10);
    const clipEnd = Number.parseInt(record.clip_end || record.last_base || "", 10);
    const editPosition = Number.parseInt(record.edit_position || "", 10);
    const editBase = normalizeBase(record.edit_base || "");
    const reverseComplement = parseBooleanSetting(record.reverse_complement || record.orientation || "");
    if (Number.isInteger(clipStart) && clipStart > 0) next.clipStart = clipStart;
    if (Number.isInteger(clipEnd) && clipEnd >= 0) next.clipEnd = clipEnd;
    if (Number.isInteger(editPosition) && editPosition > 0) next.editPosition = editPosition;
    if (record.edit_base && editBase) next.editBase = editBase;
    if (reverseComplement !== null) next.reverseComplement = reverseComplement;
    settings.set(traceIndex, next);
  }
  return settings;
}

function mergeTraceOptions(options, traceIndex, traceSettings) {
  return {
    ...options,
    ...(traceSettings.get(traceIndex) ?? {})
  };
}

export function prepareSangerTraceCollection(input, options = {}) {
  const session = splitSangerSessionInput(input);
  const warnings = [];
  const traceSettings = parseTraceSettingsTsv(options.traceSettings, warnings);
  const maxSessionTraces = clampInteger(options.maxSessionTraces, 20, 1, 100);
  let traceInputs = session
    ? session.traces.map((part) => String(part ?? "").trim()).filter(Boolean)
    : [String(input ?? "").trim()];

  if (traceInputs.length === 0) {
    throw new Error("No Sanger trace input was provided.");
  }
  if (session && traceInputs.length > maxSessionTraces) {
    warnings.push(`Sanger session contained ${traceInputs.length.toLocaleString()} trace input(s); only the first ${maxSessionTraces.toLocaleString()} were processed.`);
    traceInputs = traceInputs.slice(0, maxSessionTraces);
  }

  if (traceInputs.length > 1 && options.editPosition && options.editBase) {
    warnings.push("The base-call edit option is applied to every trace in this multi-trace run. Use the interactive viewer for trace-specific edits.");
  }

  const traces = traceInputs.map((traceInput, index) => {
    const result = prepareSangerTrace(traceInput, mergeTraceOptions(options, index + 1, traceSettings));
    for (const warning of result.warnings) {
      warnings.push(`${result.view.record || `Trace ${index + 1}`}: ${warning}`);
    }
    return result;
  });

  const reference = session ? parseReferenceInput(session.reference, warnings) : null;
  return {
    isSession: Boolean(session),
    traces,
    reference,
    warnings
  };
}

function makeTraceReadsFasta(collection, lineWidth = 60) {
  return collection.traces.map((result) =>
    formatFastaRecord(result.view.record, result.sequence, lineWidth)
  ).join("\n");
}

function makeQueryProfile(name, type, sequence, qualities = []) {
  return {
    type,
    name,
    sequence,
    qualities
  };
}

function makeTraceQueryProfile(result) {
  return makeQueryProfile(
    result.view.record,
    "trace",
    result.sequence,
    result.view.baseCalls.map((call) => call.quality)
  );
}

function differenceRowsForAlignment(query, reference, alignment, orientation, qualities) {
  const rows = [];
  for (const column of alignment.columns ?? []) {
    if (column.relation === "match" || column.relation === "similar") {
      continue;
    }
    const queryPosition = column.sequence_b_position || "";
    rows.push({
      query_type: query.type,
      query_name: query.name,
      orientation,
      reference: reference.title,
      alignment_column: column.alignment_position,
      reference_position: column.sequence_a_position || "",
      query_position: queryPosition,
      reference_base: column.sequence_a,
      query_base: column.sequence_b,
      relation: column.sequence_a === "-" || column.sequence_b === "-" ? "gap" : "mismatch",
      quality: queryPosition ? qualities[queryPosition - 1] ?? "" : ""
    });
  }
  return rows;
}

function formatIdentityPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "n/a";
}

async function compareQueryToReference(query, reference, options, context) {
  const alignmentOptions = {
    alphabet: "dna-rna",
    mode: "local",
    matchScore: 5,
    similarScore: 1,
    mismatchScore: -4,
    gapOpen: Number.parseFloat(options.referenceGapOpen ?? 10) || 10,
    gapExtend: Number.parseFloat(options.referenceGapExtend ?? 1) || 1
  };
  const direct = await alignPairwiseAffine(reference.sequence, query.sequence, alignmentOptions, context);
  const reverseSequence = reverseComplementSequence(query.sequence);
  const reverse = await alignPairwiseAffine(reference.sequence, reverseSequence, alignmentOptions, context);
  const useReverse = reverse.score > direct.score;
  const alignment = useReverse ? reverse : direct;
  const orientation = useReverse ? "reverse-complement" : "forward";
  const qualities = useReverse ? query.qualities.slice().reverse() : query.qualities;
  return {
    summary: {
      query_type: query.type,
      query_name: query.name,
      orientation,
      reference: reference.title,
      reference_start: alignment.startA,
      reference_end: alignment.endA,
      query_start: alignment.startB,
      query_end: alignment.endB,
      score: alignment.score,
      aligned_length: alignment.alignedLength,
      identity_percent: Number(alignment.identityPercent.toFixed(3)),
      mismatches: alignment.mismatches,
      gaps: alignment.gaps
    },
    alignment: {
      query_type: query.type,
      query_name: query.name,
      orientation,
      reference: reference.title,
      reference_aligned: alignment.alignmentA,
      query_aligned: alignment.alignmentB,
      start_reference: alignment.startA,
      end_reference: alignment.endA,
      start_query: alignment.startB,
      end_query: alignment.endB,
      identity_percent: Number(alignment.identityPercent.toFixed(3))
    },
    differences: differenceRowsForAlignment(query, reference, alignment, orientation, qualities)
  };
}

function shouldAssembleSangerSession(options = {}) {
  if (options.task !== "compare") {
    return true;
  }
  return ["consensus-fasta", "assembly-text-map", "assembly-trace-map-svg"].includes(options.outputFormat);
}

function makeEmptySangerAssembly(options) {
  return {
    contigs: [],
    placements: [],
    warnings: [],
    options,
    readsProcessed: 0,
    inputBasesProcessed: 0,
    charactersRemoved: 0
  };
}

export async function prepareSangerTraceSession(input, options = {}, context = {}) {
  const collection = prepareSangerTraceCollection(input, options);
  const warnings = [...collection.warnings];
  const lineWidth = clampInteger(options.lineWidth, 60, 10, 200);
  const minOverlap = clampInteger(options.assemblyMinOverlap, 20, 6, 10000);
  const maxMismatchPercent = clampNumber(options.assemblyMaxMismatchPercent, 8, 0, 40);
  const assemblyOptions = {
    minOverlap,
    maxMismatchPercent,
    tryReverseComplement: options.assemblyTryReverseComplement !== false,
    maxReads: 20,
    lineWidth,
    useAmbiguousIupacConsensus: options.assemblyUseAmbiguousIupacConsensus === true
  };
  const assemblyInput = makeTraceReadsFasta(collection, lineWidth);
  let assembly = makeEmptySangerAssembly(assemblyOptions);

  if (shouldAssembleSangerSession(options)) {
    context.throwIfCancelled?.();
    assembly = assembleLightweightSequences(assemblyInput, assemblyOptions, context);
    if (assemblyOptions.useAmbiguousIupacConsensus) {
      assembly = applyAmbiguousIupacConsensusToAssembly(assembly);
    }
    warnings.push(...assembly.warnings.map((warning) => `Assembly: ${warning}`));
  }

  const consensusProfiles = assembly.contigs.map((contig) =>
    makeQueryProfile(contig.title, "consensus", contig.sequence, [])
  );
  const traceProfiles = collection.traces.map(makeTraceQueryProfile);
  const comparisonSummaries = [];
  const referenceDifferences = [];
  const referenceAlignments = [];
  if (collection.reference) {
    const queries = options.task === "compare" ? traceProfiles : [...consensusProfiles, ...traceProfiles];
    for (const [index, query] of queries.entries()) {
      context.reportProgress?.({
        phase: "comparing-reference",
        progress: 0.55 + (index / Math.max(1, queries.length)) * 0.35
      });
      context.throwIfCancelled?.();
      const comparison = await compareQueryToReference(query, collection.reference, options, context);
      comparisonSummaries.push(comparison.summary);
      referenceAlignments.push(comparison.alignment);
      referenceDifferences.push(...comparison.differences);
    }
  } else if (options.task === "compare" || REFERENCE_COMPARISON_OUTPUT_FORMATS.has(options.outputFormat)) {
    warnings.push("No reference sequence was supplied; reference-comparison outputs contain no difference rows.");
  }

  return {
    task: options.task ?? "session",
    collection,
    assembly,
    reference: collection.reference,
    comparisonSummaries,
    referenceAlignments,
    referenceDifferences,
    warnings
  };
}

export function makeSangerBaseCallRows(result) {
  return result.view.baseCalls.map((call) => ({
    record: result.view.record,
    display_index: call.displayIndex,
    base: call.base,
    original_index: call.originalIndex,
    original_trace_position: call.originalTracePosition,
    display_trace_position: call.tracePosition,
    quality: call.quality,
    orientation: call.orientation,
    edited: call.edited,
    below_quality_threshold: call.quality !== null && call.quality < result.options.lowQualityThreshold
  }));
}

export function makeSangerCollectionBaseCallRows(collection) {
  return collection.traces.flatMap((result) => makeSangerBaseCallRows(result));
}

export function makeSangerBaseCallTsv(result) {
  const columns = sangerBaseCallColumns.map((column) => column.id);
  const rows = makeSangerBaseCallRows(result);
  return makeSangerRowsTsv(columns, rows);
}

function makeSangerRowsTsv(columns, rows) {
  return [
    columns.join("\t"),
    ...rows.map((row) => columns.map((column) => row[column] ?? "").join("\t"))
  ].join("\n");
}

export function makeSangerCollectionBaseCallTsv(collection) {
  const columns = sangerBaseCallColumns.map((column) => column.id);
  return makeSangerRowsTsv(columns, makeSangerCollectionBaseCallRows(collection));
}

export function makeSangerTraceReport(result) {
  const trace = result.trace;
  const view = result.view;
  const sequence = result.sequence;
  const qualityValues = view.baseCalls.map((call) => call.quality).filter((quality) => quality !== null);
  const minQuality = qualityValues.length ? Math.min(...qualityValues) : null;
  const maxQuality = qualityValues.length ? Math.max(...qualityValues) : null;
  const meanQuality = qualityValues.length
    ? qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length
    : null;
  const trimSummary = result.automaticTrim
    ? `modified Mott quality trim; kept bases ${result.automaticTrim.start}-${result.automaticTrim.end}`
    : "manual clip range";

  const lines = [
    `${view.record} Sanger trace review`,
    `Input base calls: ${trace.baseCalls.length}`,
    `Displayed base calls: ${view.baseCalls.length}`,
    `Displayed input range: ${view.clipStart}-${view.clipEnd}`,
    `Trimming: ${trimSummary}`,
    `Displayed orientation: ${view.orientation}`,
    `Displayed sequence length: ${sequence.length}`,
    `Trace channels: ${trace.traceMode === "measured-channels" ? "measured A/C/G/T channels" : "generated base-call preview"}`,
    `Low-quality calls below Q${result.options.lowQualityThreshold}: ${result.lowQualityCount}`,
    `Edited displayed calls: ${result.editedCount}`,
    `Quality range: ${minQuality === null ? "n/a" : `${minQuality}-${maxQuality}`}`,
    `Mean quality: ${meanQuality === null ? "n/a" : meanQuality.toFixed(1)}`,
    "",
    "Export policy: FASTA and FASTQ use the displayed clipped orientation. FASTQ qualities follow the displayed base order."
  ];

  if (trace.sourceNote) {
    lines.splice(2, 0, `Source note: ${trace.sourceNote}`);
  }

  return lines.join("\n");
}

function summarizeSangerTraceResult(result) {
  const qualities = result.view.baseCalls.map((call) => call.quality).filter((quality) => quality !== null);
  const meanQuality = qualities.length
    ? qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length
    : null;
  const minQuality = qualities.length ? Math.min(...qualities) : null;
  const maxQuality = qualities.length ? Math.max(...qualities) : null;
  return {
    title: result.view.record,
    baseCount: result.sequence.length,
    inputBaseCalls: result.trace.baseCalls.length,
    displayedBaseCalls: result.view.baseCalls.length,
    orientation: result.view.orientation,
    traceMode: result.trace.traceMode === "measured-channels" ? "measured A/C/G/T channels" : "generated base-call preview",
    lowQualityCount: result.lowQualityCount,
    editedCount: result.editedCount,
    qualityRange: minQuality === null ? "n/a" : `${minQuality}-${maxQuality}`,
    meanQuality: meanQuality === null ? "n/a" : meanQuality.toFixed(1)
  };
}

export function makeSangerTraceCollectionReport(collection) {
  if (collection.traces.length === 1) {
    return makeSangerTraceReport(collection.traces[0]);
  }
  const lines = [
    "Sanger trace set review",
    `Trace reads: ${collection.traces.length}`,
    `Reference: ${collection.reference ? `${collection.reference.title} (${collection.reference.sequence.length} bp)` : "not supplied"}`,
    "",
    "Traces"
  ];
  for (const [index, result] of collection.traces.entries()) {
    const summary = summarizeSangerTraceResult(result);
    lines.push(`${index + 1}. ${summary.title}`);
    lines.push(`   Displayed sequence length: ${summary.baseCount} bases`);
    lines.push(`   Input/displayed base calls: ${summary.inputBaseCalls}/${summary.displayedBaseCalls}`);
    lines.push(`   Orientation: ${summary.orientation}`);
    lines.push(`   Trace channels: ${summary.traceMode}`);
    lines.push(`   Low-quality calls: ${summary.lowQualityCount}; edited calls: ${summary.editedCount}`);
    lines.push(`   Quality range: ${summary.qualityRange}; mean quality: ${summary.meanQuality}`);
  }
  if (collection.warnings.length) {
    lines.push("", "Warnings");
    for (const warning of collection.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push("", "Export policy: per-trace FASTA and FASTQ use each displayed clipped orientation. FASTQ qualities follow the displayed base order.");
  return `${lines.join("\n")}\n`;
}

function makeOutputTitle(result) {
  const suffix = result.view.orientation === "reverse-complement" ? "reverse_complement" : "forward";
  return `${result.view.record}_bases_${result.view.clipStart}_${result.view.clipEnd}_${suffix}`;
}

export function makeSangerFasta(result, lineWidth = result.options.lineWidth) {
  return formatFastaRecord(makeOutputTitle(result), result.sequence, lineWidth);
}

export function makeSangerFastq(result) {
  const qualities = result.view.baseCalls.map((call) => {
    const quality = call.quality === null ? 0 : clampInteger(call.quality, 0, 0, 93);
    return String.fromCharCode(quality + 33);
  }).join("");
  return `@${makeOutputTitle(result)}\n${result.sequence}\n+\n${qualities}\n`;
}

export function makeSangerCollectionFasta(collection, lineWidth = 60) {
  return collection.traces.map((result) => makeSangerFasta(result, lineWidth).trimEnd()).join("\n") + "\n";
}

export function makeSangerCollectionFastq(collection) {
  return collection.traces.map((result) => makeSangerFastq(result).trimEnd()).join("\n") + "\n";
}

export function makeSangerReferenceDifferenceTsv(session) {
  const columns = sangerReferenceDifferenceColumns.map((column) => column.id);
  return makeSangerRowsTsv(columns, session.referenceDifferences);
}

function relationForAlignedPair(referenceBase, queryBase) {
  if (referenceBase === "-" || queryBase === "-") return "gap";
  if (referenceBase === queryBase) return "match";
  return "mismatch";
}

export function makeSangerReferenceAlignmentSvg(session, options = {}) {
  const alignments = session.referenceAlignments ?? [];
  const width = Math.max(760, Number.parseInt(options.width, 10) || 1040);
  const requestedLineWidth = Math.max(40, Math.min(120, Number.parseInt(options.lineWidth, 10) || 80));
  const cell = 14;
  const rowHeight = 18;
  const chunkGap = 28;
  const alignmentGap = 18;
  const labelWidth = 160;
  const coordinateWidth = 34;
  const left = 24;
  const sequenceLeft = left + labelWidth + coordinateWidth + 12;
  const usableChars = Math.max(24, Math.min(requestedLineWidth, Math.floor((width - sequenceLeft - coordinateWidth - 44) / cell)));
  const alignmentBlocks = [];
  let bodyHeight = 0;
  for (const alignment of alignments) {
    const chunks = [];
    for (let offset = 0; offset < alignment.reference_aligned.length; offset += usableChars) {
      chunks.push({ offset, end: Math.min(alignment.reference_aligned.length, offset + usableChars) });
    }
    const height = 28 + chunks.length * (rowHeight * 3 + chunkGap) - chunkGap + alignmentGap;
    alignmentBlocks.push({ alignment, chunks, height });
    bodyHeight += height;
  }
  const height = alignments.length === 0
    ? 190
    : 92 + bodyHeight + 42;
  const parts = [
    `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sanger reference alignment">`,
    SANGER_SVG_TEXT_STYLE,
    "<style>",
    ".sanger-align-title{font:700 16px system-ui,sans-serif;fill:#172026}",
    ".sanger-align-subtitle{font:12px system-ui,sans-serif;fill:#475569}",
    ".sanger-align-section{font:700 12px system-ui,sans-serif;fill:#172026}",
    ".sanger-align-label{font:11px system-ui,sans-serif;fill:#475569}",
    ".sanger-align-coord{font:10px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#64748b}",
    ".sanger-align-cell{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-anchor:middle;dominant-baseline:central;fill:#172026}",
    ".sanger-align-marker{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-anchor:middle;dominant-baseline:central;fill:#475569}",
    ".sanger-align-footer{font:11px system-ui,sans-serif;fill:#64748b}",
    "</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text class="sanger-align-title" x="${left}" y="28">Sanger reference alignment</text>`,
    `<text class="sanger-align-subtitle" x="${left}" y="50">Reference: ${escapeXml(session.reference?.title ?? "none supplied")}</text>`
  ];
  if (alignments.length === 0) {
    parts.push(`<rect x="${left}" y="74" width="${width - left * 2}" height="70" rx="6" fill="#f8fafc" stroke="#d8e1ea"/>`);
    parts.push(`<text class="sanger-align-subtitle" x="${left + 16}" y="116">No reference sequence was supplied, so no alignment view was generated.</text>`);
    parts.push("</svg>");
    return parts.join("");
  }

  let y = 82;
  for (const block of alignmentBlocks) {
    const { alignment, chunks } = block;
    let referencePosition = Number(alignment.start_reference) || 1;
    let queryPosition = Number(alignment.start_query) || 1;
    parts.push(`<text class="sanger-align-section" x="${left}" y="${y}">${escapeXml(alignment.query_type)} ${escapeXml(alignment.query_name)} (${escapeXml(alignment.orientation)}, ${formatIdentityPercent(alignment.identity_percent)}% identity)</text>`);
    y += 18;
    for (const chunk of chunks) {
      const { offset, end } = chunk;
      const referenceChunk = alignment.reference_aligned.slice(offset, end);
      const queryChunk = alignment.query_aligned.slice(offset, end);
      const chunkLength = referenceChunk.length;
      const referenceCount = referenceChunk.replace(/-/g, "").length;
      const queryCount = queryChunk.replace(/-/g, "").length;
      const referenceStart = referenceCount > 0 ? referencePosition : "";
      const referenceEnd = referenceCount > 0 ? referencePosition + referenceCount - 1 : "";
      const queryStart = queryCount > 0 ? queryPosition : "";
      const queryEnd = queryCount > 0 ? queryPosition + queryCount - 1 : "";
      const rowTop = y;
      const referenceY = rowTop + 9;
      const markerY = rowTop + rowHeight + 9;
      const queryY = rowTop + rowHeight * 2 + 9;
      parts.push(`<text class="sanger-align-label" x="${left}" y="${referenceY + 4}">reference</text>`);
      parts.push(`<text class="sanger-align-label" x="${left}" y="${queryY + 4}">${escapeXml(compactMiddle(alignment.query_name, 26))}</text>`);
      parts.push(`<text class="sanger-align-coord" x="${sequenceLeft - 8}" y="${referenceY + 4}" text-anchor="end">${escapeXml(referenceStart)}</text>`);
      parts.push(`<text class="sanger-align-coord" x="${sequenceLeft - 8}" y="${queryY + 4}" text-anchor="end">${escapeXml(queryStart)}</text>`);
      parts.push(`<text class="sanger-align-coord" x="${sequenceLeft + chunkLength * cell + 6}" y="${referenceY + 4}">${escapeXml(referenceEnd)}</text>`);
      parts.push(`<text class="sanger-align-coord" x="${sequenceLeft + chunkLength * cell + 6}" y="${queryY + 4}">${escapeXml(queryEnd)}</text>`);
      for (let index = 0; index < chunkLength; index += 1) {
        const referenceBase = referenceChunk[index];
        const queryBase = queryChunk[index];
        const relation = relationForAlignedPair(referenceBase, queryBase);
        const x = sequenceLeft + index * cell;
        const fill = relation === "gap" ? "#fee2e2" : relation === "mismatch" ? "#fef3c7" : "#f8fafc";
        const stroke = relation === "gap" ? "#fecaca" : relation === "mismatch" ? "#fde68a" : "#e2e8f0";
        const marker = relation === "match" ? "|" : relation === "gap" ? " " : "*";
        parts.push(`<rect x="${x}" y="${rowTop}" width="${cell - 1}" height="${rowHeight * 3 - 1}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>`);
        parts.push(`<text class="sanger-align-cell" x="${x + cell / 2}" y="${referenceY}">${escapeXml(referenceBase)}</text>`);
        parts.push(`<text class="sanger-align-marker" x="${x + cell / 2}" y="${markerY}">${escapeXml(marker)}</text>`);
        parts.push(`<text class="sanger-align-cell" x="${x + cell / 2}" y="${queryY}">${escapeXml(queryBase)}</text>`);
      }
      referencePosition += referenceCount;
      queryPosition += queryCount;
      y += rowHeight * 3 + chunkGap;
    }
    y += alignmentGap;
  }
  const footer = session.task === "compare"
    ? "Yellow columns mark base differences; red columns mark gaps. Each trace is locally aligned in both orientations and the best-scoring strand is shown."
    : "Yellow columns mark base differences; red columns mark gaps. Component traces and consensus contigs are aligned independently to the reference.";
  parts.push(`<text class="sanger-align-footer" x="${left}" y="${height - 20}">${escapeXml(footer)}</text>`);
  parts.push("</svg>");
  return parts.join("");
}

function findReferenceAlignmentForDifference(session, row) {
  return (session.referenceAlignments ?? []).find((alignment) =>
    alignment.query_type === row.query_type &&
    alignment.query_name === row.query_name &&
    alignment.orientation === row.orientation
  ) ?? null;
}

function findTraceResultForDifference(session, row) {
  if (row.query_type !== "trace" || !row.query_name) {
    return null;
  }
  return (session.collection?.traces ?? []).find((traceResult) =>
    traceResult.view.record === row.query_name
  ) ?? null;
}

function makeDifferenceContext(alignment, row, flank = 12) {
  if (!alignment) {
    return null;
  }
  const columnIndex = Math.max(0, Number.parseInt(row.alignment_column, 10) - 1);
  const start = Math.max(0, columnIndex - flank);
  const end = Math.min(alignment.reference_aligned.length, columnIndex + flank + 1);
  return {
    start,
    end,
    markerIndex: columnIndex - start,
    reference: alignment.reference_aligned.slice(start, end),
    query: alignment.query_aligned.slice(start, end)
  };
}

function positionQualityLabel(value) {
  return value === "" || value === null || value === undefined ? "n/a" : String(value);
}

function traceCallForQueryPosition(traceResult, queryPosition, orientation) {
  if (!Number.isFinite(queryPosition) || queryPosition < 1) {
    return null;
  }
  const displayIndex = orientation === "reverse-complement"
    ? traceResult.view.baseCalls.length - queryPosition + 1
    : queryPosition;
  return traceResult.view.baseCalls.find((call) => call.displayIndex === displayIndex) ?? null;
}

function traceCallForDifference(traceResult, row) {
  return traceCallForQueryPosition(
    traceResult,
    Number.parseInt(row.query_position, 10),
    row.orientation
  );
}

function queryNeighborsForAlignmentColumn(alignment, alignmentColumn) {
  if (!alignment) {
    return { left: null, right: null };
  }
  const columnIndex = Number.parseInt(alignmentColumn, 10) - 1;
  const queryAligned = String(alignment.query_aligned ?? "");
  let queryPosition = Number.parseInt(alignment.start_query, 10);
  if (!Number.isFinite(columnIndex) || columnIndex < 0 || !Number.isFinite(queryPosition)) {
    return { left: null, right: null };
  }
  let left = null;
  let right = null;
  for (let index = 0; index < queryAligned.length; index += 1) {
    if (queryAligned[index] === "-") {
      continue;
    }
    const current = queryPosition;
    queryPosition += 1;
    if (index < columnIndex) {
      left = current;
    } else if (index > columnIndex) {
      right = current;
      break;
    }
  }
  return { left, right };
}

function traceEvidenceForDifference(traceResult, row, alignment) {
  const call = traceCallForDifference(traceResult, row);
  if (call) {
    const alignedBase = String(row.query_base ?? "").replace("-", "");
    return {
      calls: [call],
      markerTracePosition: call.tracePosition,
      markerBase: call.base,
      markerFill: CHANNEL_COLORS[call.base] ?? "#7c3aed",
      markerKind: "base",
      label: row.orientation === "reverse-complement" && alignedBase && alignedBase !== call.base
        ? `Trace base ${call.originalIndex}; raw ${call.base}, aligned ${alignedBase}; display base ${call.displayIndex}; Q ${positionQualityLabel(call.quality)}`
        : `Trace base ${call.originalIndex}; display base ${call.displayIndex}; Q ${positionQualityLabel(call.quality)}`
    };
  }

  if (row.query_base !== "-") {
    return null;
  }

  const neighbors = queryNeighborsForAlignmentColumn(alignment, row.alignment_column);
  const calls = [neighbors.left, neighbors.right]
    .map((queryPosition) => traceCallForQueryPosition(traceResult, queryPosition, row.orientation))
    .filter(Boolean);
  if (calls.length === 0) {
    return null;
  }
  const ordered = calls.slice().sort((left, right) => left.tracePosition - right.tracePosition);
  const markerTracePosition = ordered.length > 1
    ? (ordered[0].tracePosition + ordered[ordered.length - 1].tracePosition) / 2
    : ordered[0].tracePosition;
  const flankLabel = ordered.length > 1
    ? `flanking trace bases ${ordered[0].displayIndex} and ${ordered[ordered.length - 1].displayIndex}`
    : `nearest trace base ${ordered[0].displayIndex}`;
  return {
    calls: ordered,
    markerTracePosition,
    markerBase: "gap",
    markerFill: "#7c3aed",
    markerKind: "gap",
    label: `Query gap at alignment column ${row.alignment_column}; showing ${flankLabel}.`
  };
}

function makeMiniTraceEvidenceSvg(traceResult, row, geometry, alignment = null) {
  const evidence = traceEvidenceForDifference(traceResult, row, alignment);
  const { x, y, width, height } = geometry;
  if (!evidence) {
    return `<text x="${x}" y="${y + 18}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">No trace peak evidence for this aligned column.</text>`;
  }
  const flank = 34;
  const minTracePosition = Math.min(...evidence.calls.map((call) => call.tracePosition), evidence.markerTracePosition);
  const maxTracePosition = Math.max(...evidence.calls.map((call) => call.tracePosition), evidence.markerTracePosition);
  const start = Math.max(1, Math.floor(minTracePosition - flank));
  const end = Math.min(traceResult.view.sampleCount, Math.ceil(maxTracePosition + flank));
  const slices = {};
  let maxIntensity = 1;
  for (const channel of SANGER_TRACE_CHANNELS) {
    slices[channel] = (traceResult.view.traces[channel] ?? []).slice(start - 1, end);
    maxIntensity = Math.max(maxIntensity, ...slices[channel]);
  }
  const denominator = Math.max(1, end - start);
  const xForPosition = (position) => x + ((position - start) / denominator) * width;
  const yForIntensity = (value) => y + height - (Number(value) / maxIntensity) * height;
  const paths = SANGER_TRACE_CHANNELS.map((channel) => {
    const values = slices[channel];
    const path = values.map((value, index) => {
      const px = x + (index / Math.max(1, values.length - 1)) * width;
      const py = yForIntensity(value);
      return `${index === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
    }).join(" ");
    return `<path d="${path}" fill="none" stroke="${CHANNEL_COLORS[channel]}" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join("");
  const markerX = xForPosition(evidence.markerTracePosition);
  const marker = evidence.markerKind === "gap"
    ? `<rect x="${(markerX - 12).toFixed(2)}" y="${y + height + 3}" width="24" height="17" rx="4" fill="#f3e8ff" stroke="${evidence.markerFill}" stroke-width="1.2"/>
<text x="${markerX.toFixed(2)}" y="${y + height + 16}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="${evidence.markerFill}">gap</text>`
    : `<circle cx="${markerX.toFixed(2)}" cy="${y + height + 12}" r="7" fill="${evidence.markerFill}" opacity="0.9"/>
<text x="${markerX.toFixed(2)}" y="${y + height + 16}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#ffffff">${escapeXml(evidence.markerBase)}</text>`;
  return `<g>
<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#f8fafc" stroke="#d8e1ea"/>
${paths}
<line x1="${markerX.toFixed(2)}" x2="${markerX.toFixed(2)}" y1="${y}" y2="${y + height}" stroke="${evidence.markerKind === "gap" ? "#7c3aed" : "#334155"}" stroke-width="1" stroke-dasharray="3 3"/>
${marker}
<text x="${x}" y="${y + height + 34}" font-family="system-ui, sans-serif" font-size="11" fill="#475569">${escapeXml(evidence.label)}</text>
</g>`;
}

function makePositionedMonospaceText(text, options) {
  const { x, y, charWidth, fontSize = 13, fill = "#172026", boldIndex = -1 } = options;
  return Array.from(text).map((char, index) => {
    const weight = index === boldIndex ? "800" : "500";
    const charX = x + index * charWidth + charWidth / 2;
    return `<text x="${charX.toFixed(1)}" y="${y}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${escapeXml(char)}</text>`;
  }).join("");
}

function makeHighlightedContextLine(text, markerIndex, options) {
  const { x, y, charWidth, label, highlightFill, textFill = "#172026" } = options;
  const markerX = x + markerIndex * charWidth - 1;
  return `<g>
<text x="${x - 74}" y="${y}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">${escapeXml(label)}</text>
<rect x="${markerX.toFixed(1)}" y="${y - 13}" width="${charWidth.toFixed(1)}" height="18" fill="${highlightFill}"/>
${makePositionedMonospaceText(text, { x, y, charWidth, fill: textFill, boldIndex: markerIndex })}
</g>`;
}

export function makeSangerDifferenceReviewSvg(session, options = {}) {
  const allRows = session.referenceDifferences ?? [];
  const maxRows = Math.max(1, Math.min(160, Number.parseInt(options.maxRows, 10) || 60));
  const rows = allRows.slice(0, maxRows);
  const omitted = Math.max(0, allRows.length - rows.length);
  const width = Math.max(880, Number.parseInt(options.width, 10) || 1120);
  const left = 28;
  const cardWidth = width - left * 2;
  const cardHeight = 158;
  const height = rows.length === 0 ? 210 : 92 + rows.length * cardHeight + 54;
  const parts = [
    `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sanger difference review">`,
    SANGER_SVG_TEXT_STYLE,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${left}" y="30" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#172026">Sanger difference review</text>`,
    `<text x="${left}" y="52" font-family="system-ui, sans-serif" font-size="12" fill="#475569">Reference: ${escapeXml(session.reference?.title ?? "none supplied")}; differences shown ${rows.length} of ${allRows.length}</text>`
  ];
  if (rows.length === 0) {
    parts.push(`<rect x="${left}" y="76" width="${cardWidth}" height="72" rx="6" fill="#f8fafc" stroke="#d8e1ea"/>`);
    parts.push(`<text x="${left + 16}" y="119" font-family="system-ui, sans-serif" font-size="13" fill="#475569">No reference differences were found or no reference was supplied.</text>`);
    parts.push("</svg>");
    return parts.join("");
  }

  const charWidth = 8.4;
  rows.forEach((row, index) => {
    const y = 82 + index * cardHeight;
    const relationFill = row.relation === "gap" ? "#fee2e2" : "#fef3c7";
    const relationStroke = row.relation === "gap" ? "#fca5a5" : "#facc15";
    const alignment = findReferenceAlignmentForDifference(session, row);
    const context = makeDifferenceContext(alignment, row, 13);
    const traceResult = findTraceResultForDifference(session, row);
    parts.push(`<g class="sanger-difference-card" data-index="${index + 1}">`);
    parts.push(`<rect x="${left}" y="${y}" width="${cardWidth}" height="${cardHeight - 14}" rx="7" fill="#ffffff" stroke="#d8e1ea"/>`);
    parts.push(`<rect x="${left}" y="${y}" width="5" height="${cardHeight - 14}" rx="2.5" fill="${relationStroke}"/>`);
    parts.push(`<text x="${left + 16}" y="${y + 22}" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#172026">${escapeXml(row.query_type)} ${escapeXml(row.query_name)}</text>`);
    parts.push(`<text x="${left + 16}" y="${y + 42}" font-family="system-ui, sans-serif" font-size="11" fill="#475569">${escapeXml(row.orientation)}; reference ${escapeXml(row.reference_position || "gap")} ${escapeXml(row.reference_base)} vs query ${escapeXml(row.query_position || "gap")} ${escapeXml(row.query_base)}; ${escapeXml(row.relation)}; Q ${positionQualityLabel(row.quality)}</text>`);
    if (context) {
      const contextX = left + 92;
      parts.push(makeHighlightedContextLine(context.reference, context.markerIndex, {
        x: contextX,
        y: y + 72,
        charWidth,
        label: "reference",
        highlightFill: relationFill
      }));
      parts.push(makeHighlightedContextLine(context.query, context.markerIndex, {
        x: contextX,
        y: y + 94,
        charWidth,
        label: "query",
        highlightFill: relationFill
      }));
      const markerX = contextX + context.markerIndex * charWidth + charWidth / 2;
      parts.push(`<line x1="${markerX.toFixed(1)}" x2="${markerX.toFixed(1)}" y1="${y + 99}" y2="${y + 108}" stroke="#64748b" stroke-width="1"/>`);
      parts.push(`<text x="${markerX.toFixed(1)}" y="${y + 120}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#64748b">column ${escapeXml(row.alignment_column)}</text>`);
    } else {
      parts.push(`<text x="${left + 16}" y="${y + 80}" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Alignment context was not available for this row.</text>`);
    }
    const evidenceX = Math.max(left + 610, width - 430);
    parts.push(`<text x="${evidenceX}" y="${y + 22}" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#334155">Trace evidence</text>`);
    if (traceResult) {
      parts.push(makeMiniTraceEvidenceSvg(traceResult, row, {
        x: evidenceX,
        y: y + 34,
        width: width - evidenceX - left - 4,
        height: 56
      }, alignment));
    } else {
      parts.push(`<text x="${evidenceX}" y="${y + 54}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Consensus-only comparison; component trace peaks are not available for this row.</text>`);
    }
    parts.push("</g>");
  });
  if (omitted > 0) {
    parts.push(`<text x="${left}" y="${height - 24}" font-family="system-ui, sans-serif" font-size="11" fill="#b45309">Omitted ${omitted} additional difference row(s) from this SVG. Use the TSV output for the complete table.</text>`);
  } else {
    parts.push(`<text x="${left}" y="${height - 24}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Each card shows local reference/query context; trace rows include the nearest base-call peak window.</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

function traceResultMapForAssembly(session) {
  return new Map((session.collection?.traces ?? []).map((result) => [result.view.record, result]));
}

function callForAssemblyReadPosition(traceResult, read, readPosition) {
  const displayIndex = read.orientation === "reverse-complement"
    ? traceResult.view.baseCalls.length - readPosition + 1
    : readPosition;
  return traceResult.view.baseCalls.find((call) => call.displayIndex === displayIndex) ?? null;
}

function channelForAssemblyRead(channel, read) {
  if (read.orientation !== "reverse-complement") {
    return channel;
  }
  return { A: "T", C: "G", G: "C", T: "A" }[channel] ?? channel;
}

function makeTracePositionToSequenceX(anchors, fallbackStep = 14) {
  const ordered = anchors
    .filter((anchor) => Number.isFinite(anchor.tracePosition) && Number.isFinite(anchor.x))
    .sort((a, b) => a.tracePosition - b.tracePosition);
  if (ordered.length === 0) {
    return () => 0;
  }
  if (ordered.length === 1) {
    const anchor = ordered[0];
    return (tracePosition) => anchor.x + (tracePosition - anchor.tracePosition) * fallbackStep;
  }
  const first = ordered[0];
  const second = ordered[1];
  const nextToLast = ordered[ordered.length - 2];
  const last = ordered[ordered.length - 1];
  const interpolate = (left, right, tracePosition) => {
    const denominator = right.tracePosition - left.tracePosition || 1;
    const fraction = (tracePosition - left.tracePosition) / denominator;
    return left.x + fraction * (right.x - left.x);
  };
  return (tracePosition) => {
    if (tracePosition <= first.tracePosition) {
      return interpolate(first, second, tracePosition);
    }
    if (tracePosition >= last.tracePosition) {
      return interpolate(nextToLast, last, tracePosition);
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      if (tracePosition <= right.tracePosition) {
        return interpolate(left, right, tracePosition);
      }
    }
    return last.x;
  };
}

function makeAssemblyTracePath(values, geometry) {
  const { y, height, maxIntensity, xForTracePosition } = geometry;
  return values.map(({ position, value }, index) => {
    const px = xForTracePosition(position);
    const boundedValue = Math.max(0, Number(value) || 0);
    const py = y + height - (boundedValue / maxIntensity) * height;
    return `${index === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
  }).join(" ");
}

function makeAssemblyMiniTraceRowSvg({ traceResult, read, segment, chunk, sequenceLeft, cellWidth, rowTop, rowHeight }) {
  if (!traceResult) {
    return "";
  }
  const calls = [];
  for (let position = segment.segmentStart; position <= segment.segmentEnd; position += 1) {
    const readPosition = position - read.start + 1;
    const call = callForAssemblyReadPosition(traceResult, read, readPosition);
    if (call) {
      calls.push({ position, readPosition, call });
    }
  }
  if (calls.length === 0) {
    return "";
  }

  const first = calls[0];
  const last = calls[calls.length - 1];
  const anchors = calls.map((item) => ({
    tracePosition: item.call.tracePosition,
    x: sequenceLeft + (item.position - chunk.start + 0.5) * cellWidth
  }));
  const xForTracePosition = makeTracePositionToSequenceX(anchors, cellWidth / 10);
  const averageSpacing = calls.length > 1
    ? Math.max(4, Math.abs(last.call.tracePosition - first.call.tracePosition) / (calls.length - 1))
    : 18;
  const traceDirection = Math.sign(last.call.tracePosition - first.call.tracePosition) || 1;
  const rawOrientedSampleStart = first.call.tracePosition - traceDirection * averageSpacing * 0.55;
  const rawOrientedSampleEnd = last.call.tracePosition + traceDirection * averageSpacing * 0.55;
  const orientedSampleStart = clampNumber(rawOrientedSampleStart, first.call.tracePosition, 1, traceResult.view.sampleCount);
  const orientedSampleEnd = clampNumber(rawOrientedSampleEnd, last.call.tracePosition, 1, traceResult.view.sampleCount);
  const sampleMin = Math.max(1, Math.floor(Math.min(orientedSampleStart, orientedSampleEnd)));
  const sampleMax = Math.min(traceResult.view.sampleCount, Math.ceil(Math.max(orientedSampleStart, orientedSampleEnd)));
  const plotY = rowTop + 20;
  const plotHeight = rowHeight - 29;
  const parts = [];
  let localMaxIntensity = 1;
  const channelValues = new Map();

  for (const channel of SANGER_TRACE_CHANNELS) {
    const sourceChannel = channelForAssemblyRead(channel, read);
    const trace = traceResult.view.traces[sourceChannel] ?? [];
    const values = [];
    for (let tracePosition = sampleMin; tracePosition <= sampleMax; tracePosition += 1) {
      values.push({
        position: tracePosition,
        value: trace[tracePosition - 1] ?? 0
      });
    }
    localMaxIntensity = Math.max(localMaxIntensity, ...values.map((item) => Number(item.value) || 0));
    channelValues.set(channel, values);
  }

  const geometry = {
    xForTracePosition,
    y: plotY,
    height: plotHeight,
    maxIntensity: Math.max(1, localMaxIntensity)
  };

  for (const channel of SANGER_TRACE_CHANNELS) {
    const values = channelValues.get(channel) ?? [];
    if (values.length > 1) {
      parts.push(`<path class="sanger-assembly-mini-peak sanger-assembly-mini-peak-${channel}" d="${makeAssemblyTracePath(values, geometry)}" fill="none" stroke="${CHANNEL_COLORS[channel]}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" data-channel="${channel}"/>`);
    }
  }

  const baselineY = plotY + plotHeight;
  parts.push(`<line x1="${(sequenceLeft + (segment.segmentStart - chunk.start) * cellWidth).toFixed(1)}" x2="${(sequenceLeft + (segment.segmentEnd - chunk.start + 1) * cellWidth).toFixed(1)}" y1="${baselineY.toFixed(1)}" y2="${baselineY.toFixed(1)}" stroke="#d8e1ea" stroke-width="0.7"/>`);

  return parts.join("");
}

function assemblyReadSegment(read, start, end) {
  const segmentStart = Math.max(start, read.start);
  const segmentEnd = Math.min(end, read.end);
  if (segmentStart > segmentEnd) {
    return null;
  }
  return { segmentStart, segmentEnd };
}

function makeAssemblyReadOrientationMarker(read, x, y) {
  const reverse = read.orientation === "reverse-complement";
  const color = reverse ? "#7c3aed" : "#475569";
  const label = reverse ? "reverse-complement read" : "forward read";
  const path = reverse
    ? `M${(x + 13).toFixed(1)} ${y.toFixed(1)}H${x.toFixed(1)}m4 -4l-4 4l4 4`
    : `M${x.toFixed(1)} ${y.toFixed(1)}h13m-4 -4l4 4l-4 4`;
  return `<path class="sanger-assembly-orientation-arrow" d="${path}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" data-orientation="${escapeXml(read.orientation)}"><title>${escapeXml(label)}</title></path>`;
}

function queryPositionCallForReferenceTrace(traceResult, orientation, queryPosition) {
  const displayIndex = orientation === "reverse-complement"
    ? traceResult.view.baseCalls.length - queryPosition + 1
    : queryPosition;
  return traceResult.view.baseCalls.find((call) => call.displayIndex === displayIndex) ?? null;
}

function makeReferenceTracePlacement(session, alignment) {
  const traceResult = findTraceResultForDifference(session, {
    query_type: alignment.query_type,
    query_name: alignment.query_name
  });
  if (!traceResult) {
    return null;
  }
  const mapped = [];
  const breaks = new Set();
  const insertions = [];
  let referencePosition = Number(alignment.start_reference) || 1;
  let queryPosition = Number(alignment.start_query) || 1;
  for (let index = 0; index < alignment.reference_aligned.length; index += 1) {
    const referenceBase = alignment.reference_aligned[index];
    const queryBase = alignment.query_aligned[index];
    const currentReference = referenceBase === "-" ? null : referencePosition;
    const currentQuery = queryBase === "-" ? null : queryPosition;
    if (referenceBase !== "-" && queryBase !== "-") {
      mapped.push({
        alignmentColumn: index + 1,
        referencePosition: currentReference,
        queryPosition: currentQuery,
        base: queryBase
      });
    } else if (referenceBase === "-" && queryBase !== "-") {
      insertions.push({
        alignmentColumn: index + 1,
        referencePositionBefore: referencePosition - 1,
        referencePositionAfter: referencePosition,
        queryPosition: currentQuery,
        base: queryBase
      });
    } else {
      breaks.add(index + 1);
    }
    if (referenceBase !== "-") {
      referencePosition += 1;
    }
    if (queryBase !== "-") {
      queryPosition += 1;
    }
  }
  if (mapped.length === 0) {
    return null;
  }
  return {
    title: alignment.query_name,
    orientation: alignment.orientation,
    identityPercent: alignment.identity_percent,
    traceResult,
    start: mapped[0].referencePosition,
    end: mapped[mapped.length - 1].referencePosition,
    mapped,
    insertions,
    breaks
  };
}

function referencePlacementSegment(placement, start, end) {
  const mapped = placement.mapped.filter((item) => item.referencePosition >= start && item.referencePosition <= end);
  if (mapped.length === 0) {
    return null;
  }
  const insertions = placement.insertions.filter((item) =>
    item.referencePositionAfter > start &&
    item.referencePositionBefore < end &&
    item.referencePositionBefore >= mapped[0].referencePosition &&
    item.referencePositionAfter <= mapped[mapped.length - 1].referencePosition
  );
  return {
    segmentStart: mapped[0].referencePosition,
    segmentEnd: mapped[mapped.length - 1].referencePosition,
    mapped,
    insertions
  };
}

function splitReferenceMappedRuns(mapped) {
  const runs = [];
  let current = [];
  for (const item of mapped) {
    const previous = current.at(-1);
    const contiguous = previous &&
      item.referencePosition === previous.referencePosition + 1 &&
      item.queryPosition === previous.queryPosition + 1 &&
      item.alignmentColumn === previous.alignmentColumn + 1;
    if (previous && !contiguous) {
      runs.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) {
    runs.push(current);
  }
  return runs;
}

function makeReferenceMiniTraceRunSvg({ traceResult, placement, run, chunk, sequenceLeft, cellWidth, rowTop, rowHeight }) {
  const calls = run
    .map((item) => ({
      ...item,
      call: queryPositionCallForReferenceTrace(traceResult, placement.orientation, item.queryPosition)
    }))
    .filter((item) => item.call);
  if (calls.length === 0) {
    return "";
  }
  const first = calls[0];
  const last = calls[calls.length - 1];
  const anchors = calls.map((item) => ({
    tracePosition: item.call.tracePosition,
    x: sequenceLeft + (item.referencePosition - chunk.start + 0.5) * cellWidth
  }));
  const xForTracePosition = makeTracePositionToSequenceX(anchors, cellWidth / 10);
  const averageSpacing = calls.length > 1
    ? Math.max(4, Math.abs(last.call.tracePosition - first.call.tracePosition) / (calls.length - 1))
    : 18;
  const traceDirection = Math.sign(last.call.tracePosition - first.call.tracePosition) || 1;
  const rawOrientedSampleStart = first.call.tracePosition - traceDirection * averageSpacing * 0.45;
  const rawOrientedSampleEnd = last.call.tracePosition + traceDirection * averageSpacing * 0.45;
  const orientedSampleStart = clampNumber(rawOrientedSampleStart, first.call.tracePosition, 1, traceResult.view.sampleCount);
  const orientedSampleEnd = clampNumber(rawOrientedSampleEnd, last.call.tracePosition, 1, traceResult.view.sampleCount);
  const sampleMin = Math.max(1, Math.floor(Math.min(orientedSampleStart, orientedSampleEnd)));
  const sampleMax = Math.min(traceResult.view.sampleCount, Math.ceil(Math.max(orientedSampleStart, orientedSampleEnd)));
  const plotY = rowTop + 20;
  const plotHeight = rowHeight - 29;
  const channelValues = new Map();
  let localMaxIntensity = 1;

  for (const channel of SANGER_TRACE_CHANNELS) {
    const sourceChannel = channelForAssemblyRead(channel, placement);
    const trace = traceResult.view.traces[sourceChannel] ?? [];
    const values = [];
    for (let tracePosition = sampleMin; tracePosition <= sampleMax; tracePosition += 1) {
      values.push({
        position: tracePosition,
        value: trace[tracePosition - 1] ?? 0
      });
    }
    localMaxIntensity = Math.max(localMaxIntensity, ...values.map((item) => Number(item.value) || 0));
    channelValues.set(channel, values);
  }

  const geometry = {
    xForTracePosition,
    y: plotY,
    height: plotHeight,
    maxIntensity: Math.max(1, localMaxIntensity)
  };

  return SANGER_TRACE_CHANNELS.map((channel) => {
    const values = channelValues.get(channel) ?? [];
    if (values.length <= 1) {
      return "";
    }
    return `<path class="sanger-reference-mini-peak sanger-assembly-mini-peak sanger-assembly-mini-peak-${channel}" d="${makeAssemblyTracePath(values, geometry)}" fill="none" stroke="${CHANNEL_COLORS[channel]}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" data-channel="${channel}"/>`;
  }).join("");
}

function makeReferenceMiniTraceRowSvg({ traceResult, placement, segment, chunk, sequenceLeft, cellWidth, rowTop, rowHeight }) {
  if (!traceResult) {
    return "";
  }
  const parts = [];
  for (const run of splitReferenceMappedRuns(segment.mapped)) {
    parts.push(makeReferenceMiniTraceRunSvg({
      traceResult,
      placement,
      run,
      chunk,
      sequenceLeft,
      cellWidth,
      rowTop,
      rowHeight
    }));
  }
  const baselineY = rowTop + rowHeight - 9;
  parts.push(`<line x1="${(sequenceLeft + (segment.segmentStart - chunk.start) * cellWidth).toFixed(1)}" x2="${(sequenceLeft + (segment.segmentEnd - chunk.start + 1) * cellWidth).toFixed(1)}" y1="${baselineY.toFixed(1)}" y2="${baselineY.toFixed(1)}" stroke="#d8e1ea" stroke-width="0.7"/>`);
  const groupedInsertions = Array.from(segment.insertions.reduce((groups, insertion) => {
    const key = `${insertion.referencePositionBefore}:${insertion.referencePositionAfter}`;
    const group = groups.get(key) ?? {
      referencePositionBefore: insertion.referencePositionBefore,
      referencePositionAfter: insertion.referencePositionAfter,
      bases: []
    };
    group.bases.push(insertion.base);
    groups.set(key, group);
    return groups;
  }, new Map()).values());
  for (const insertion of groupedInsertions) {
    const x = sequenceLeft + (insertion.referencePositionAfter - chunk.start) * cellWidth;
    const insertedBases = insertion.bases.join("");
    const baseColor = insertedBases.length === 1 ? CHANNEL_COLORS[insertedBases] ?? "#475569" : "#475569";
    const label = `+${insertedBases}`;
    const labelY = baselineY + 12;
    const chipWidth = Math.max(22, label.length * 7 + 10);
    const chipX = x - chipWidth / 2;
    const chipY = labelY - 10;
    parts.push(`<line class="sanger-reference-insertion-marker" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${(rowTop + 3).toFixed(1)}" y2="${(baselineY - 1).toFixed(1)}" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="2 2" data-reference-insertion="true"/>`);
    parts.push(`<rect class="sanger-reference-insertion-chip" x="${chipX.toFixed(1)}" y="${chipY.toFixed(1)}" width="${chipWidth.toFixed(1)}" height="13" rx="3" fill="#ffffff" stroke="#d8e1ea" data-reference-insertion="true"/>`);
    parts.push(`<text class="sanger-reference-insertion-label" x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9" font-weight="800" fill="${baseColor}" data-reference-insertion="true"><title>${escapeXml(`Trace insertion ${label} between reference positions ${insertion.referencePositionBefore} and ${insertion.referencePositionAfter}`)}</title>${escapeXml(label)}</text>`);
  }
  return parts.join("");
}

export function makeSangerReferenceTraceMapSvg(session, options = {}) {
  const reference = session.reference;
  const placements = (session.referenceAlignments ?? [])
    .filter((alignment) => alignment.query_type === "trace")
    .map((alignment) => makeReferenceTracePlacement(session, alignment))
    .filter(Boolean);
  const width = Math.max(980, Number.parseInt(options.width, 10) || 1240);
  const basesPerRow = Math.max(28, Math.min(72, Number.parseInt(options.basesPerRow, 10) || 56));
  const left = 28;
  const labelWidth = 236;
  const cellWidth = Math.max(12, Math.min(18, (width - left * 2 - labelWidth) / basesPerRow));
  const referenceRowHeight = 32;
  const readRowHeight = 58;
  const readRowGap = 8;
  const chunkGap = 28;
  const sequenceLeft = left + labelWidth;
  const chunks = [];
  if (reference?.sequence) {
    for (let start = 1; start <= reference.sequence.length; start += basesPerRow) {
      const end = Math.min(reference.sequence.length, start + basesPerRow - 1);
      const visiblePlacements = placements
        .map((placement) => ({ placement, segment: referencePlacementSegment(placement, start, end) }))
        .filter((item) => item.segment);
      chunks.push({ start, end, visiblePlacements });
    }
  }
  const bodyHeight = chunks.reduce((sum, chunk) =>
    sum + 30 + referenceRowHeight + chunk.visiblePlacements.length * readRowHeight +
      Math.max(0, chunk.visiblePlacements.length - 1) * readRowGap + chunkGap,
  0);
  const height = chunks.length === 0 ? 210 : 86 + bodyHeight + 24;
  const parts = [
    `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sanger reference trace map" data-bases-per-row="${basesPerRow}" data-base-step="${cellWidth.toFixed(2)}" data-read-row-gap="${readRowGap}" data-peak-style="condensed-trace">`,
    SANGER_SVG_TEXT_STYLE,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${left}" y="30" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#172026">Sanger reference trace map</text>`,
    `<text x="${left}" y="52" font-family="system-ui, sans-serif" font-size="12" fill="#475569">Reference context with condensed chromatogram peaks from each best-strand trace alignment.</text>`
  ];
  if (chunks.length === 0) {
    parts.push(`<rect x="${left}" y="76" width="${width - left * 2}" height="72" rx="6" fill="#f8fafc" stroke="#d8e1ea"/>`);
    parts.push(`<text x="${left + 16}" y="119" font-family="system-ui, sans-serif" font-size="13" fill="#475569">No reference trace placements were available for this trace set.</text>`);
    parts.push("</svg>");
    return parts.join("");
  }

  let y = 86;
  for (const chunk of chunks) {
    parts.push(`<text x="${left}" y="${y}" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#172026">${escapeXml(reference.title)} (${reference.sequence.length} bp)</text>`);
    parts.push(`<text x="${left}" y="${y + 16}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">bases ${chunk.start}-${chunk.end}</text>`);
    y += 24;
    parts.push(`<text x="${left}" y="${y + 15}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">reference</text>`);
    for (let position = chunk.start; position <= chunk.end; position += 1) {
      const base = reference.sequence[position - 1] ?? "N";
      const x = sequenceLeft + (position - chunk.start) * cellWidth;
      parts.push(`<text x="${(x + cellWidth / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" fill="${CHANNEL_COLORS[base] ?? "#475569"}">${escapeXml(base)}</text>`);
    }
    y += referenceRowHeight;

    for (const [placementIndex, { placement, segment }] of chunk.visiblePlacements.entries()) {
      const rowTop = y;
      const clippedLabel = compactMiddle(placement.title, 30);
      parts.push(makeAssemblyReadOrientationMarker(placement, left, rowTop + 14));
      parts.push(`<text x="${left + 20}" y="${rowTop + 18}" font-family="system-ui, sans-serif" font-size="11" fill="#334155">${escapeXml(clippedLabel)}</text>`);
      parts.push(`<title>${escapeXml(`${placement.title} (${placement.orientation}; ${formatIdentityPercent(placement.identityPercent)}% identity)`)}</title>`);
      for (const run of splitReferenceMappedRuns(segment.mapped)) {
        const runStart = run[0].referencePosition;
        const runEnd = run.at(-1).referencePosition;
        const spanX = sequenceLeft + (runStart - chunk.start) * cellWidth;
        const spanWidth = (runEnd - runStart + 1) * cellWidth;
        parts.push(`<rect x="${spanX.toFixed(1)}" y="${rowTop + 2}" width="${spanWidth.toFixed(1)}" height="${readRowHeight - 8}" fill="#f8fafc" stroke="#d8e1ea"/>`);
      }
      for (const item of segment.mapped) {
        const x = sequenceLeft + (item.referencePosition - chunk.start) * cellWidth;
        parts.push(`<text x="${(x + cellWidth / 2).toFixed(1)}" y="${rowTop + 14}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="800" fill="${CHANNEL_COLORS[item.base] ?? "#475569"}">${escapeXml(item.base)}</text>`);
      }
      parts.push(makeReferenceMiniTraceRowSvg({
        traceResult: placement.traceResult,
        placement,
        segment,
        chunk,
        sequenceLeft,
        cellWidth,
        rowTop,
        rowHeight: readRowHeight
      }));
      y += readRowHeight + (placementIndex < chunk.visiblePlacements.length - 1 ? readRowGap : 0);
    }
    y += chunkGap;
  }
  parts.push(`<text x="${left}" y="${height - 20}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Miniature peaks show A, C, G, and T signal in reference orientation; trace insertions are marked as +base between reference columns.</text>`);
  parts.push("</svg>");
  return parts.join("");
}

export function makeSangerAssemblyTraceMapSvg(session, options = {}) {
  const width = Math.max(980, Number.parseInt(options.width, 10) || 1240);
  const basesPerRow = Math.max(28, Math.min(72, Number.parseInt(options.basesPerRow, 10) || 56));
  const left = 28;
  const labelWidth = 236;
  const cellWidth = Math.max(12, Math.min(18, (width - left * 2 - labelWidth) / basesPerRow));
  const consensusRowHeight = 32;
  const readRowHeight = 58;
  const peakHeight = 30;
  const chunkGap = 28;
  const contigGap = 30;
  const traceResults = traceResultMapForAssembly(session);
  const chunks = [];
  for (const contig of session.assembly.contigs ?? []) {
    for (let start = 1; start <= contig.sequence.length; start += basesPerRow) {
      const end = Math.min(contig.sequence.length, start + basesPerRow - 1);
      const visibleReads = contig.reads
        .map((read) => ({ read, segment: assemblyReadSegment(read, start, end) }))
        .filter((item) => item.segment);
      chunks.push({ contig, start, end, visibleReads });
    }
  }
  const bodyHeight = chunks.reduce((sum, chunk) =>
    sum + 30 + consensusRowHeight + chunk.visibleReads.length * readRowHeight + chunkGap,
  0);
  const height = chunks.length === 0 ? 210 : 86 + bodyHeight + contigGap + 24;
  const sequenceLeft = left + labelWidth;
  const parts = [
    `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sanger assembly trace map" data-bases-per-row="${basesPerRow}" data-base-step="${cellWidth.toFixed(2)}" data-peak-height="${peakHeight}" data-peak-style="condensed-trace">`,
    SANGER_SVG_TEXT_STYLE,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${left}" y="30" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#172026">Sanger assembly trace map</text>`,
    `<text x="${left}" y="52" font-family="system-ui, sans-serif" font-size="12" fill="#475569">Consensus context with condensed per-read chromatogram peaks at each placed sequence span.</text>`
  ];

  if (chunks.length === 0) {
    parts.push(`<rect x="${left}" y="76" width="${width - left * 2}" height="72" rx="6" fill="#f8fafc" stroke="#d8e1ea"/>`);
    parts.push(`<text x="${left + 16}" y="119" font-family="system-ui, sans-serif" font-size="13" fill="#475569">No assembled contigs were available for this trace set.</text>`);
    parts.push("</svg>");
    return parts.join("");
  }

  let y = 86;
  let previousContigId = "";
  for (const chunk of chunks) {
    if (previousContigId && previousContigId !== chunk.contig.id) {
      y += contigGap;
    }
    previousContigId = chunk.contig.id;
    parts.push(`<text x="${left}" y="${y}" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#172026">${escapeXml(chunk.contig.title)} (${chunk.contig.sequence.length} bp; ${chunk.contig.reads.length} read${chunk.contig.reads.length === 1 ? "" : "s"})</text>`);
    parts.push(`<text x="${left}" y="${y + 16}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">bases ${chunk.start}-${chunk.end}</text>`);
    y += 24;
    parts.push(`<text x="${left}" y="${y + 15}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">consensus</text>`);
    for (let position = chunk.start; position <= chunk.end; position += 1) {
      const base = chunk.contig.sequence[position - 1] ?? "N";
      const x = sequenceLeft + (position - chunk.start) * cellWidth;
      parts.push(`<text x="${(x + cellWidth / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" fill="${CHANNEL_COLORS[base] ?? "#475569"}">${escapeXml(base)}</text>`);
    }
    y += consensusRowHeight;
    for (const { read, segment } of chunk.visibleReads) {
      const traceResult = traceResults.get(read.title);
      const rowTitle = `${read.title} (${read.orientation === "reverse-complement" ? "reverse complement" : "forward"})`;
      const clippedLabel = compactMiddle(read.title, 30);
      const rowTop = y;
      parts.push(makeAssemblyReadOrientationMarker(read, left, rowTop + 14));
      parts.push(`<text x="${left + 20}" y="${rowTop + 18}" font-family="system-ui, sans-serif" font-size="11" fill="#334155">${escapeXml(clippedLabel)}</text>`);
      parts.push(`<title>${escapeXml(rowTitle)}</title>`);
      const spanX = sequenceLeft + (segment.segmentStart - chunk.start) * cellWidth;
      const spanWidth = (segment.segmentEnd - segment.segmentStart + 1) * cellWidth;
      parts.push(`<rect x="${spanX.toFixed(1)}" y="${rowTop + 2}" width="${spanWidth.toFixed(1)}" height="${readRowHeight - 8}" fill="#f8fafc" stroke="#d8e1ea"/>`);
      for (let position = segment.segmentStart; position <= segment.segmentEnd; position += 1) {
        const readPosition = position - read.start + 1;
        const base = read.sequence?.[readPosition - 1] ?? "N";
        const x = sequenceLeft + (position - chunk.start) * cellWidth;
        parts.push(`<text x="${(x + cellWidth / 2).toFixed(1)}" y="${rowTop + 14}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="800" fill="${CHANNEL_COLORS[base] ?? "#475569"}">${escapeXml(base)}</text>`);
      }
      parts.push(makeAssemblyMiniTraceRowSvg({
        traceResult,
        read,
        segment,
        chunk,
        sequenceLeft,
        cellWidth,
        rowTop,
        rowHeight: readRowHeight
      }));
      y += readRowHeight;
    }
    y += chunkGap;
  }
  parts.push(`<text x="${left}" y="${height - 20}" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Miniature peaks show A, C, G, and T signal in assembly orientation; base letters remain centered on their called peak positions.</text>`);
  parts.push("</svg>");
  return parts.join("");
}

export function makeSangerConsensusFasta(session, lineWidth = session.assembly.options?.lineWidth ?? 60) {
  return makeAssemblyFasta(session.assembly, lineWidth);
}

export function makeSangerAssemblyTextMap(session, lineWidth = session.assembly.options?.lineWidth ?? 80) {
  return makeAssemblyTextMap(session.assembly, lineWidth);
}

export function makeSangerTraceSessionReport(session) {
  const isReferenceComparison = session.task === "compare";
  const ambiguousConsensusPositions = session.assembly.ambiguousConsensusPositions ?? 0;
  const ambiguousConsensusLabel = session.assembly.options.useAmbiguousIupacConsensus
    ? `yes (${ambiguousConsensusPositions} position${ambiguousConsensusPositions === 1 ? "" : "s"})`
    : "no";
  const lines = [
    "Sanger trace session review",
    `Trace reads: ${session.collection.traces.length}`,
    `Reference: ${session.reference ? `${session.reference.title} (${session.reference.sequence.length} bp)` : "not supplied"}`
  ];
  if (isReferenceComparison) {
    lines.push(
      "Comparison mode: local trace-to-reference alignment; each trace is tested forward and reverse-complement while the reference stays fixed.",
      ""
    );
  } else {
    lines.push(
      `Consensus contigs: ${session.assembly.contigs.length}`,
      `Assembly minimum overlap: ${session.assembly.options.minOverlap} bp`,
      `Assembly maximum mismatch rate: ${session.assembly.options.maxMismatchPercent}%`,
      `Reverse-complement assembly testing: ${session.assembly.options.tryReverseComplement ? "yes" : "no"}`,
      `Ambiguous IUPAC consensus bases: ${ambiguousConsensusLabel}`,
      ""
    );
  }

  lines.push("Traces");
  for (const result of session.collection.traces) {
    const qualities = result.view.baseCalls.map((call) => call.quality).filter((quality) => quality !== null);
    const meanQuality = qualities.length
      ? qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length
      : null;
    lines.push(`- ${result.view.record}: ${result.sequence.length} bases; orientation ${result.view.orientation}; mean quality ${meanQuality === null ? "n/a" : meanQuality.toFixed(1)}; low-quality calls ${result.lowQualityCount}`);
  }

  if (!isReferenceComparison) {
    lines.push("", "Consensus contigs");
    for (const contig of session.assembly.contigs) {
      lines.push(`- ${contig.title}: ${contig.sequence.length} bp from ${contig.reads.length} read(s)`);
    }
  }

  if (session.reference) {
    lines.push("", "Reference comparison");
    if (session.comparisonSummaries.length === 0) {
      lines.push("No reference alignments were produced.");
    } else {
      for (const summary of session.comparisonSummaries) {
        lines.push(`- ${summary.query_type} ${summary.query_name}: ${summary.orientation}; reference ${summary.reference_start}-${summary.reference_end}; query ${summary.query_start}-${summary.query_end}; identity ${formatIdentityPercent(summary.identity_percent)}%; differences ${summary.mismatches + summary.gaps}`);
      }
      lines.push(`Reference difference rows: ${session.referenceDifferences.length}`);
    }
  }

  lines.push("", isReferenceComparison
    ? "Scope note: this is a small Sanger trace reference-comparison workflow for placing clipped trace reads on an expected reference and reviewing local differences."
    : "Scope note: this is a small Sanger sequencing review workflow for clipped trace reads, simple consensus assembly, and reference comparison. It is not a whole-genome or NGS assembler.");
  return lines.join("\n").trimEnd() + "\n";
}

function makePath(values, maxIntensity, geometry) {
  if (!values.length) {
    return "";
  }
  const { left, top, width, height } = geometry;
  const denominator = Math.max(1, values.length - 1);
  return values.map((value, index) => {
    const x = left + (index / denominator) * width;
    const y = top + height - (Number(value) / maxIntensity) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function qualityAxisMax(baseCalls, threshold) {
  const qualityValues = baseCalls
    .map((call) => call.quality)
    .filter((quality) => Number.isFinite(quality));
  const observedMax = qualityValues.length ? Math.max(...qualityValues) : 0;
  const minimumUsefulMax = Math.max(40, threshold + 10);
  return clampInteger(Math.ceil(Math.max(observedMax, minimumUsefulMax) / 5) * 5, 40, 0, 93);
}

function makeWrappedSangerTraceSvg(result, options = {}) {
  const view = result.view;
  const width = Math.max(860, Number.parseInt(options.width, 10) || 1180);
  const basesPerRow = Math.max(40, Math.min(110, Number.parseInt(options.basesPerRow, 10) || 80));
  const rowHeight = 220;
  const rowCount = Math.ceil(view.baseCalls.length / basesPerRow);
  const height = Math.max(440, 74 + rowCount * rowHeight + 20);
  const margin = { left: 70, right: 34 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = 142;
  const qualityHeight = 26;
  const rowLabelYWithinRow = 14;
  const baseLabelYWithinRow = 26;
  const plotTopWithinRow = 32;
  const qualityGap = 8;
  const qualityMax = qualityAxisMax(view.baseCalls, result.options.lowQualityThreshold);
  const rows = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowCalls = view.baseCalls.slice(rowIndex * basesPerRow, (rowIndex + 1) * basesPerRow);
    if (rowCalls.length === 0) {
      continue;
    }
    const rowTop = 82 + rowIndex * rowHeight;
    const minPosition = Math.min(...rowCalls.map((call) => call.tracePosition));
    const maxPosition = Math.max(...rowCalls.map((call) => call.tracePosition));
    const startSample = Math.max(1, minPosition - 10);
    const endSample = Math.min(view.sampleCount, maxPosition + 10);
    const rowSampleCount = Math.max(1, endSample - startSample + 1);
    const plot = {
      left: margin.left,
      top: rowTop + plotTopWithinRow,
      width: plotWidth,
      height: plotHeight
    };
    const xForPosition = (position) =>
      plot.left + ((position - startSample) / Math.max(1, rowSampleCount - 1)) * plot.width;
    const rowTraces = {};
    let rowMax = 1;
    for (const channel of SANGER_TRACE_CHANNELS) {
      rowTraces[channel] = (view.traces[channel] ?? []).slice(startSample - 1, endSample);
      rowMax = Math.max(rowMax, ...rowTraces[channel]);
    }
    const channelPaths = SANGER_TRACE_CHANNELS.map((channel) => {
      const path = makePath(rowTraces[channel], rowMax, plot);
      return `<path d="${path}" fill="none" stroke="${CHANNEL_COLORS[channel]}" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round"/>`;
    }).join("\n");
    const baseLabels = rowCalls.map((call) => {
      const x = xForPosition(call.tracePosition);
      const below = call.quality !== null && call.quality < result.options.lowQualityThreshold;
      const fill = CHANNEL_COLORS[call.base] ?? "#7c3aed";
      return `<text class="sanger-called-base" x="${x.toFixed(2)}" y="${rowTop + baseLabelYWithinRow}" text-anchor="middle" font-size="10" font-weight="700" fill="${below ? "#b45309" : fill}">${escapeXml(call.base)}</text>`;
    }).join("\n");
    const baseTicks = rowCalls.map((call) => {
      const x = xForPosition(call.tracePosition);
      return `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${plot.top + plot.height}" y2="${plot.top + plot.height + 4}" stroke="#cbd5e1" stroke-width="0.8"/>`;
    }).join("\n");
    const qualityTop = plot.top + plot.height + qualityGap;
    const qualityScale = qualityHeight / qualityMax;
    const qualityBottom = qualityTop + qualityHeight;
    const thresholdY = qualityBottom - result.options.lowQualityThreshold * qualityScale;
    const axisLabelX = plot.left - 8;
    const qualityBars = rowCalls.map((call) => {
      const x = xForPosition(call.tracePosition);
      const quality = Math.min(call.quality ?? 0, qualityMax);
      const barHeight = quality * qualityScale;
      const fill = quality < result.options.lowQualityThreshold ? "#f59e0b" : "#64748b";
      return `<rect x="${(x - 1.8).toFixed(2)}" y="${(qualityTop + qualityHeight - barHeight).toFixed(2)}" width="3.6" height="${barHeight.toFixed(2)}" fill="${fill}" opacity="0.9"/>`;
    }).join("\n");
    rows.push(`<g class="sanger-trace-row" data-row="${rowIndex + 1}">
<text x="${plot.left}" y="${rowTop + rowLabelYWithinRow}" font-size="9" font-weight="700" fill="#334155">Bases ${rowCalls[0].displayIndex}-${rowCalls[rowCalls.length - 1].displayIndex}</text>
${baseLabels}
<rect x="${plot.left}" y="${plot.top}" width="${plot.width}" height="${plot.height}" fill="#f8fafc" stroke="#cbd5e1"/>
<line x1="${plot.left}" x2="${plot.left + plot.width}" y1="${plot.top + plot.height}" y2="${plot.top + plot.height}" stroke="#64748b" stroke-width="1"/>
${baseTicks}
${channelPaths}
<text x="${plot.left - 12}" y="${plot.top + 4}" text-anchor="end" font-size="10" fill="#64748b">signal</text>
<rect class="sanger-quality-strip" x="${plot.left}" y="${qualityTop}" width="${plot.width}" height="${qualityHeight}" fill="#f8fafc" stroke="#e2e8f0"/>
${qualityBars}
<line x1="${plot.left}" x2="${plot.left + plot.width}" y1="${thresholdY.toFixed(2)}" y2="${thresholdY.toFixed(2)}" stroke="#f59e0b" stroke-width="0.8" stroke-dasharray="4 4" opacity="0.7"/>
<text x="${axisLabelX}" y="${qualityTop + 3}" text-anchor="end" font-size="7" fill="#64748b">Q${qualityMax}</text>
<text x="${axisLabelX}" y="${thresholdY.toFixed(2)}" text-anchor="end" dominant-baseline="middle" font-size="7" fill="#b45309">Q${result.options.lowQualityThreshold}</text>
<text x="${axisLabelX}" y="${qualityBottom - 1}" text-anchor="end" font-size="7" fill="#64748b">Q0</text>
</g>`);
  }

  return `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(view.record)} wrapped Sanger trace" data-row-height="${rowHeight}" data-row-label-to-base-gap="${baseLabelYWithinRow - rowLabelYWithinRow}" data-base-label-to-plot-gap="${plotTopWithinRow - baseLabelYWithinRow}" data-quality-gap="${qualityGap}">
${SANGER_SVG_TEXT_STYLE}
<rect width="${width}" height="${height}" fill="#ffffff"/>
<text x="${margin.left}" y="28" font-size="18" font-weight="700" fill="#0f172a">${escapeXml(view.record)}</text>
<text x="${margin.left}" y="48" font-size="12" fill="#475569">Bases ${view.clipStart}-${view.clipEnd}; ${view.orientation}; ${view.traceMode === "measured-channels" ? "measured trace channels" : "base-call preview trace"}; wrapped ${basesPerRow} bases per row</text>
${rows.join("\n")}
</svg>`;
}

export function makeSangerTraceSvg(result, options = {}) {
  const view = result.view;
  if (view.baseCalls.length > 110) {
    return makeWrappedSangerTraceSvg(result, options);
  }
  const width = Math.max(760, Number.parseInt(options.width, 10) || 980);
  const height = Math.max(360, Number.parseInt(options.height, 10) || 410);
  const margin = { left: 62, right: 34, top: 94, bottom: 72 };
  const plot = {
    left: margin.left,
    top: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom
  };
  const maxIntensity = Math.max(
    1,
    ...SANGER_TRACE_CHANNELS.flatMap((channel) => view.traces[channel] ?? [])
  );
  const sampleDenominator = Math.max(1, view.sampleCount - 1);
  const xForPosition = (position) => plot.left + ((position - 1) / sampleDenominator) * plot.width;
  const qualityTop = plot.top + plot.height + 26;
  const qualityHeight = 32;
  const qualityMax = qualityAxisMax(view.baseCalls, result.options.lowQualityThreshold);
  const qualityScale = qualityHeight / qualityMax;
  const lowThresholdY = qualityTop + qualityHeight - result.options.lowQualityThreshold * qualityScale;

  const channelPaths = SANGER_TRACE_CHANNELS.map((channel) => {
    const path = makePath(view.traces[channel] ?? [], maxIntensity, plot);
    return `<path d="${path}" fill="none" stroke="${CHANNEL_COLORS[channel]}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join("\n");

  const baseLabels = view.baseCalls.map((call) => {
    const x = xForPosition(call.tracePosition);
    const below = call.quality !== null && call.quality < result.options.lowQualityThreshold;
    const fill = CHANNEL_COLORS[call.base] ?? "#4b5563";
    const editedMark = call.edited
      ? `<rect x="${(x - 6).toFixed(2)}" y="${plot.top - 31}" width="12" height="16" rx="2" fill="#fff7ed" stroke="#fb923c"/>`
      : "";
    return `${editedMark}<text x="${x.toFixed(2)}" y="${plot.top - 18}" text-anchor="middle" font-size="13" font-weight="700" fill="${below ? "#b45309" : fill}">${escapeXml(call.base)}</text>`;
  }).join("\n");

  const qualityBars = view.baseCalls.map((call) => {
    const x = xForPosition(call.tracePosition);
    const quality = Math.min(call.quality ?? 0, qualityMax);
    const barHeight = quality * qualityScale;
    const fill = quality < result.options.lowQualityThreshold ? "#f59e0b" : "#64748b";
    return `<rect x="${(x - 2.2).toFixed(2)}" y="${(qualityTop + qualityHeight - barHeight).toFixed(2)}" width="4.4" height="${barHeight.toFixed(2)}" fill="${fill}" opacity="0.9"/>`;
  }).join("\n");

  const baseTicks = view.baseCalls.map((call) => {
    const x = xForPosition(call.tracePosition);
    return `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${plot.top + plot.height}" y2="${plot.top + plot.height + 5}" stroke="#94a3b8" stroke-width="1"/>`;
  }).join("\n");

  return `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(view.record)} Sanger trace">
${SANGER_SVG_TEXT_STYLE}
<rect width="${width}" height="${height}" fill="#ffffff"/>
<text x="${plot.left}" y="28" font-size="18" font-weight="700" fill="#0f172a">${escapeXml(view.record)}</text>
<text x="${plot.left}" y="48" font-size="12" fill="#475569">Bases ${view.clipStart}-${view.clipEnd}; ${view.orientation}; ${view.traceMode === "measured-channels" ? "measured trace channels" : "base-call preview trace"}</text>
<rect x="${plot.left}" y="${plot.top}" width="${plot.width}" height="${plot.height}" fill="#f8fafc" stroke="#cbd5e1"/>
<line x1="${plot.left}" x2="${plot.left + plot.width}" y1="${plot.top + plot.height}" y2="${plot.top + plot.height}" stroke="#64748b" stroke-width="1"/>
${baseTicks}
${channelPaths}
${baseLabels}
<text x="${plot.left - 12}" y="${plot.top + 4}" text-anchor="end" font-size="11" fill="#64748b">signal</text>
<text x="${plot.left}" y="${qualityTop - 8}" font-size="12" font-weight="700" fill="#334155">Base quality</text>
<text x="${plot.left + plot.width}" y="${qualityTop - 8}" text-anchor="end" font-size="10" fill="#b45309">Q${result.options.lowQualityThreshold} cutoff</text>
<rect x="${plot.left}" y="${qualityTop}" width="${plot.width}" height="${qualityHeight}" fill="#f8fafc" stroke="#e2e8f0"/>
${qualityBars}
<line x1="${plot.left}" x2="${plot.left + plot.width}" y1="${lowThresholdY.toFixed(2)}" y2="${lowThresholdY.toFixed(2)}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4 4" opacity="0.75"/>
<text x="${plot.left - 10}" y="${qualityTop + 4}" text-anchor="end" font-size="10" fill="#64748b">Q${qualityMax}</text>
<text x="${plot.left - 10}" y="${qualityTop + qualityHeight + 3}" text-anchor="end" font-size="10" fill="#64748b">Q0</text>
</svg>`;
}

export function makeSangerCollectionTraceSvg(collection, options = {}) {
  if (collection.traces.length === 1) {
    return makeSangerTraceSvg(collection.traces[0], options);
  }
  const width = Math.max(760, Number.parseInt(options.width, 10) || 980);
  const childSvgs = collection.traces.map((result) => makeSangerTraceSvg(result, { ...options, width }));
  let nextChildY = 70;
  const childBlocks = childSvgs.map((svg) => {
    const heightMatch = svg.match(/height="(\d+)"/);
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    const childHeight = Number.parseInt(heightMatch?.[1] ?? "440", 10) || 440;
    const viewBox = viewBoxMatch?.[1] ?? `0 0 ${width} ${childHeight}`;
    const inner = svg
      .replace(/^<svg\b([^>]*)>/, "")
      .replace(/<\/svg>\s*$/, "");
    const y = nextChildY;
    nextChildY += childHeight + 24;
    return {
      height: childHeight,
      markup: `<svg x="0" y="${y}" width="${width}" height="${childHeight}" viewBox="${escapeXml(viewBox)}" overflow="visible">${inner}</svg>`
    };
  });
  const height = nextChildY + 20;
  return `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sanger trace set chromatogram plots">
${SANGER_SVG_TEXT_STYLE}
<rect width="${width}" height="${height}" fill="#ffffff"/>
<text x="62" y="30" font-size="20" font-weight="700" fill="#0f172a">Sanger trace set chromatogram plots</text>
<text x="62" y="52" font-size="12" fill="#475569">${collection.traces.length} trace reads shown; each panel keeps its own clipping and orientation.</text>
${childBlocks.map((block) => block.markup).join("\n")}
</svg>`;
}

export function makeSangerTraceJson(result) {
  return JSON.stringify({
    format: "sms3-sanger-trace-view-v1",
    record: result.view.record,
    orientation: result.view.orientation,
    clipStart: result.view.clipStart,
    clipEnd: result.view.clipEnd,
    sequence: result.sequence,
    baseCalls: result.view.baseCalls,
    traces: result.view.traces
  }, null, 2);
}

export function makeSangerTraceViewData(result) {
  return {
    viewerType: "sanger-trace-viewer",
    record: result.view.record,
    sourceFormat: result.view.sourceFormat,
    sourceNote: result.view.sourceNote,
    traceMode: result.view.traceMode,
    orientation: result.view.orientation,
    clipStart: result.view.clipStart,
    clipEnd: result.view.clipEnd,
    lowQualityThreshold: result.options.lowQualityThreshold,
    sequence: result.sequence,
    sampleCount: result.view.sampleCount,
    baseCalls: result.view.baseCalls.map((call) => ({ ...call })),
    traces: Object.fromEntries(SANGER_TRACE_CHANNELS.map((channel) => [channel, [...(result.view.traces[channel] ?? [])]]))
  };
}

export function makeSangerTraceCollectionViewData(collection) {
  if (collection.traces.length === 1) {
    return makeSangerTraceViewData(collection.traces[0]);
  }
  return {
    viewerType: "sanger-trace-viewer",
    traceSet: true,
    record: "Sanger trace set",
    traceCount: collection.traces.length,
    reference: collection.reference
      ? {
          title: collection.reference.title,
          length: collection.reference.sequence.length
        }
      : null,
    warnings: [...collection.warnings],
    traceViews: collection.traces.map((result, index) => ({
      traceIndex: index + 1,
      ...makeSangerTraceViewData(result)
    }))
  };
}
