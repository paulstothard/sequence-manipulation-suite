import {
  BgzipIndexedFasta,
  BlobFile,
  IndexedFasta
} from "../../vendor/indexed-genomics/indexed-vcf-runtime.bundle.js";
import { parseSequenceInput } from "../fasta.js";
import { makeBioWasmFallbackWarning } from "../biowasm-runner.js";
import { canRunBioWasmHtsTools, runSamtoolsFaidx } from "./biowasm-hts.js";

function parseInteger(value, label) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Invalid FAI ${label}: ${value}`);
  }
  return number;
}

export function parseFaiIndex(text) {
  const records = new Map();
  const warnings = [];
  for (const [lineIndex, line] of String(text ?? "").replace(/\r\n?/g, "\n").split("\n").entries()) {
    if (!line.trim()) {
      continue;
    }
    const fields = line.split("\t");
    if (fields.length < 5) {
      warnings.push(`FAI line ${lineIndex + 1} has fewer than 5 fields and was skipped.`);
      continue;
    }
    const [name, rawLength, rawOffset, rawLineBases, rawLineWidth] = fields;
    try {
      records.set(name, {
        name,
        length: parseInteger(rawLength, "length"),
        offset: parseInteger(rawOffset, "offset"),
        lineBases: parseInteger(rawLineBases, "line_bases"),
        lineWidth: parseInteger(rawLineWidth, "line_width")
      });
    } catch (error) {
      warnings.push(`FAI line ${lineIndex + 1}: ${error.message}`);
    }
  }
  return { records, warnings };
}

export function parseIndexedFastaRegions(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const tabFields = line.split("\t").map((field) => field.trim());
      const whitespaceFields = line.split(/\s+/);
      const regionField = tabFields.length > 1 ? tabFields[0] : whitespaceFields[0];
      const match = regionField.match(/^([^:\s]+):(\d+)-(\d+)$/);
      if (match) {
        const regionEnd = line.indexOf(regionField) + regionField.length;
        return {
          index: index + 1,
          seqid: match[1],
          start: Number.parseInt(match[2], 10),
          end: Number.parseInt(match[3], 10),
          label: line.slice(regionEnd).trim()
        };
      }
      const fields = tabFields.length >= 3
        ? tabFields
        : [];
      const separatedMatch = fields.length >= 3 ? null : line.match(/^(\S+?)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+(.+))?$/);
      const [seqid, rawStart, rawEnd, label = ""] = fields.length >= 3
        ? fields
        : [
          separatedMatch?.[1],
          separatedMatch?.[2],
          separatedMatch?.[3],
          separatedMatch?.[4] ?? ""
        ];
      return {
        index: index + 1,
        seqid,
        start: Number.parseInt(rawStart, 10),
        end: Number.parseInt(rawEnd, 10),
        label: tabFields.length >= 3 ? tabFields.slice(3).filter(Boolean).join(" ") : [label, ...fields.slice(4)].filter(Boolean).join(" ")
      };
    });
}

export function parseIndexedFastaExampleBundle(input) {
  const text = String(input ?? "");
  const fastaMatch = text.match(/^##FASTA\s*$/m);
  const faiMatch = text.match(/^##FAI\s*$/m);
  const regionMatch = text.match(/^##REGIONS\s*$/m);
  if (!fastaMatch || !faiMatch || !regionMatch || !(fastaMatch.index < faiMatch.index && faiMatch.index < regionMatch.index)) {
    return null;
  }
  return {
    fastaFile: new Blob([
      `${text.slice(fastaMatch.index + fastaMatch[0].length, faiMatch.index).trim()}\n`
    ], { type: "text/x-fasta" }),
    faiText: `${text.slice(faiMatch.index + faiMatch[0].length, regionMatch.index).trim()}\n`,
    rangesText: text.slice(regionMatch.index + regionMatch[0].length).trim()
  };
}

async function readFileText(file, label) {
  if (!file?.text) {
    throw new Error(`${label} is required.`);
  }
  return file.text();
}

function fileLooksCompressed(file) {
  const name = String(file?.name ?? "").toLowerCase();
  const type = String(file?.type ?? "").toLowerCase();
  return name.endsWith(".gz") || type === "application/gzip" || type === "application/x-gzip";
}

export async function resolveIndexedFastaRegionInput(input, options = {}) {
  const bundledInput = parseIndexedFastaExampleBundle(input);
  const fastaFile = options.fastaFile?.slice ? options.fastaFile : bundledInput?.fastaFile;
  const gziFile = options.gziFile?.slice ? options.gziFile : undefined;
  const faiText = options.faiFile?.text
    ? await readFileText(options.faiFile, "FAI index file")
    : bundledInput?.faiText;
  const rangesText = String(options.rangeText ?? "").trim() || bundledInput?.rangesText || "";

  if (!fastaFile?.slice) {
    throw new Error("Choose a FASTA file and matching .fai index for indexed FASTA mode. For compressed random access, choose a BGZF FASTA file plus matching .fai and .gzi files.");
  }
  if (!faiText) {
    throw new Error("Choose the matching .fai index for the selected FASTA file.");
  }
  const isBgzip = Boolean(gziFile);
  if (fileLooksCompressed(fastaFile) && !gziFile) {
    throw new Error("Compressed indexed FASTA random access requires a BGZF-compressed FASTA plus two matching sidecar files: .fai and .gzi. Ordinary gzip FASTA can be loaded through paste/upload mode, but it is not suitable for indexed region queries.");
  }

  return { fastaFile, faiText, gziFile, isBgzip, rangesText };
}

function validateRegion(region, faiRecord, sourceDescription = "the FAI index") {
  if (!faiRecord) {
    return `${region.seqid}: sequence is not present in ${sourceDescription}.`;
  }
  if (!Number.isInteger(region.start) || !Number.isInteger(region.end) || region.start < 1 || region.end < 1) {
    return `${region.seqid}: coordinates must be positive 1-based integers.`;
  }
  if (region.start > region.end) {
    return `${region.seqid}:${region.start}-${region.end}: start is greater than end.`;
  }
  if (region.end > faiRecord.length) {
    return `${region.seqid}:${region.start}-${region.end}: end exceeds sequence length ${faiRecord.length}.`;
  }
  if (faiRecord.lineBases <= 0 || faiRecord.lineWidth < faiRecord.lineBases) {
    return `${region.seqid}: FAI line width values are invalid.`;
  }
  return "";
}

function formatFasta(title, sequence, width = 60) {
  const lines = [`>${title}`];
  for (let index = 0; index < sequence.length; index += width) {
    lines.push(sequence.slice(index, index + width));
  }
  return lines.join("\n");
}

function firstTitleWord(title) {
  return String(title ?? "").trim().split(/\s+/)[0] || "sequence";
}

function buildLoadedFastaRecordIndex(records, warnings) {
  const byFullTitle = new Map();
  const byFirstWord = new Map();

  for (const record of records) {
    const fullTitle = String(record.title ?? "").trim() || "sequence";
    const firstWord = firstTitleWord(fullTitle);
    if (!byFullTitle.has(fullTitle)) {
      byFullTitle.set(fullTitle, record);
    }
    if (!byFirstWord.has(firstWord)) {
      byFirstWord.set(firstWord, record);
    } else if (byFirstWord.get(firstWord) !== record) {
      warnings.push(`Multiple FASTA records share first title word "${firstWord}"; region requests using that seqid use the first matching record.`);
    }
  }

  return { byFullTitle, byFirstWord };
}

function findLoadedFastaRecord(region, index) {
  return index.byFullTitle.get(region.seqid) ?? index.byFirstWord.get(region.seqid);
}

export async function readLoadedFastaRegions(input, rangesText, context = {}) {
  const warnings = [];
  const records = parseSequenceInput(input, "sequence");
  const requestedRegions = parseIndexedFastaRegions(rangesText);
  const rows = [];
  const fastaRecords = [];
  const sequenceRecords = [];
  const recordIndex = buildLoadedFastaRecordIndex(records, warnings);

  context.reportProgress?.({ phase: "reading-loaded-fasta", progress: 0.1 });
  context.throwIfCancelled?.();

  if (records.length === 0) {
    warnings.push("No FASTA records were provided.");
  }
  if (requestedRegions.length === 0) {
    warnings.push("No regions were provided.");
  }

  for (const [index, region] of requestedRegions.entries()) {
    const record = findLoadedFastaRecord(region, recordIndex);
    const problem = validateRegion(region, record ? {
      name: region.seqid,
      length: record.sequence.length,
      offset: 0,
      lineBases: record.sequence.length,
      lineWidth: record.sequence.length
    } : null, "the loaded FASTA records");
    if (problem) {
      warnings.push(problem);
      continue;
    }
    const sequence = record.sequence.slice(region.start - 1, region.end);
    const title = region.label || `${region.seqid}:${region.start}-${region.end}`;
    rows.push({
      seqid: region.seqid,
      start: region.start,
      end: region.end,
      length: sequence.length,
      title,
      sequence
    });
    fastaRecords.push(formatFasta(title, sequence));
    sequenceRecords.push({ title, sequence });
    context.reportProgress?.({
      phase: "extracting-loaded-fasta-regions",
      progress: 0.1 + ((index + 1) / Math.max(1, requestedRegions.length)) * 0.8
    });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
  }

  return {
    rows,
    fasta: fastaRecords.join("\n"),
    sequenceRecords,
    warnings,
    requestedCount: requestedRegions.length,
    indexedSequences: records.map((record) => ({
      name: firstTitleWord(record.title),
      length: record.sequence.length
    })),
    sourceLabel: "loaded FASTA",
    backend: "loaded-fasta-scan",
    backendLabel: "loaded FASTA scanner"
  };
}

function makeIndexedFastaJsReader({ fastaFile, faiText, gziFile, isBgzip }) {
  const fastaHandle = new BlobFile(fastaFile);
  const faiHandle = new BlobFile(new Blob([faiText], { type: "text/plain" }));
  let reader;
  if (isBgzip) {
    if (!gziFile?.slice) {
      throw new Error("BGZF indexed FASTA extraction requires a matching .gzi index file.");
    }
    reader = new BgzipIndexedFasta({
      fasta: fastaHandle,
      fai: faiHandle,
      gzi: new BlobFile(gziFile)
    });
  } else {
    reader = new IndexedFasta({
      fasta: fastaHandle,
      fai: faiHandle
    });
  }

  return Object.assign(reader, {
    backend: "indexed-fasta-js",
    backendLabel: "JS indexed FASTA fallback",
    warnings: []
  });
}

function makeBioWasmIndexedFastaReader(indexedInput) {
  const warnings = [];
  return {
    backend: "samtools-faidx",
    backendLabel: "samtools faidx via vendored BioWasm/Aioli",
    warnings,
    async getSequence(seqid, start0, end, options = {}) {
      const start1 = Number.parseInt(start0, 10) + 1;
      const end1 = Number.parseInt(end, 10);
      if (!seqid || !Number.isInteger(start1) || !Number.isInteger(end1) || start1 < 1 || end1 < start1) {
        throw new Error(`Invalid indexed FASTA region: ${seqid}:${start1}-${end1}`);
      }
      const context = options.signal
        ? { signal: options.signal, throwIfCancelled: () => {
            if (options.signal.aborted) {
              const error = new Error("Tool run was cancelled.");
              error.name = "AbortError";
              throw error;
            }
          } }
        : {};
      try {
        const text = await runSamtoolsFaidx({
          fastaFile: indexedInput.fastaFile,
          faiText: indexedInput.faiText,
          gziFile: indexedInput.gziFile,
          isBgzip: indexedInput.isBgzip,
          regions: [`${seqid}:${start1}-${end1}`]
        }, context);
        return parseSequenceInput(text, "sequence")[0]?.sequence ?? "";
      } catch (error) {
        const warning = `Primary indexed FASTA backend failed (${error.message}); used the fallback indexed FASTA reader.`;
        if (!warnings.includes(warning)) {
          warnings.push(warning);
        }
        const fallback = makeIndexedFastaJsReader(indexedInput);
        return fallback.getSequence(seqid, start0, end, options);
      }
    }
  };
}

export function makeIndexedFastaReader(indexedInput) {
  if (canRunBioWasmHtsTools()) {
    return makeBioWasmIndexedFastaReader(indexedInput);
  }
  const reader = makeIndexedFastaJsReader(indexedInput);
  reader.warnings.push(makeBioWasmFallbackWarning({
    toolLabel: "BioWasm samtools faidx",
    fallbackLabel: "the JS indexed FASTA reader"
  }));
  return reader;
}

function makeEmptyIndexedFastaResult({ fai, warnings, requestedRegions, isBgzip, backend, backendLabel }) {
  return {
    rows: [],
    fasta: "",
    sequenceRecords: [],
    warnings,
    requestedCount: requestedRegions.length,
    indexedSequences: [...fai.records.values()].map(({ name, length }) => ({ name, length })),
    sourceLabel: isBgzip ? "indexed BGZF FASTA" : "indexed FASTA",
    backend,
    backendLabel
  };
}

async function readIndexedFastaRegionsWithBioWasm(indexedInput, context = {}) {
  const backend = "samtools-faidx";
  const backendLabel = "samtools faidx via vendored BioWasm/Aioli";
  const { fastaFile, faiText, rangesText, isBgzip } = indexedInput;
  const maxBasesPerRegion = Number.parseInt(indexedInput.maxBasesPerRegion, 10);
  const hasRegionCap = Number.isInteger(maxBasesPerRegion) && maxBasesPerRegion > 0;
  if (!fastaFile?.slice) {
    throw new Error("Indexed FASTA extraction requires a local FASTA file.");
  }
  const fai = parseFaiIndex(faiText);
  const requestedRegions = parseIndexedFastaRegions(rangesText);
  const warnings = [...fai.warnings];
  const rows = [];
  const fastaRecords = [];
  const sequenceRecords = [];
  context.reportProgress?.({ phase: "reading-fai", progress: 0.1 });
  context.throwIfCancelled?.();
  if (requestedRegions.length === 0) {
    warnings.push("No regions were provided.");
    return makeEmptyIndexedFastaResult({ fai, warnings, requestedRegions, isBgzip, backend, backendLabel });
  }

  const validRequests = [];
  for (const [index, region] of requestedRegions.entries()) {
    const faiRecord = fai.records.get(region.seqid);
    const problem = validateRegion(region, faiRecord);
    if (problem) {
      warnings.push(problem);
      continue;
    }
    const expectedLength = region.end - region.start + 1;
    if (hasRegionCap && expectedLength > maxBasesPerRegion) {
      warnings.push(`${region.seqid}:${region.start}-${region.end}: region length ${expectedLength.toLocaleString()} exceeds the maximum ${maxBasesPerRegion.toLocaleString()} bases per region and was skipped.`);
      continue;
    }
    validRequests.push({ region, expectedLength, index });
  }

  if (validRequests.length === 0) {
    return makeEmptyIndexedFastaResult({ fai, warnings, requestedRegions, isBgzip, backend, backendLabel });
  }

  const faidxText = await runSamtoolsFaidx({
    fastaFile,
    faiText,
    gziFile: indexedInput.gziFile,
    isBgzip,
    regions: validRequests.map(({ region }) => `${region.seqid}:${region.start}-${region.end}`)
  }, context);
  const records = parseSequenceInput(faidxText, "sequence");

  for (const [requestIndex, request] of validRequests.entries()) {
    const { region, expectedLength, index } = request;
    const sequence = String(records[requestIndex]?.sequence ?? "");
    if (!sequence) {
      warnings.push(`${region.seqid}:${region.start}-${region.end}: samtools faidx did not return a sequence for this region.`);
      continue;
    }
    if (sequence.length !== expectedLength) {
      warnings.push(`${region.seqid}:${region.start}-${region.end}: extracted ${sequence.length} character(s), expected ${expectedLength}; check FASTA/FAI pairing.`);
    }
    const title = region.label || `${region.seqid}:${region.start}-${region.end}`;
    rows.push({
      seqid: region.seqid,
      start: region.start,
      end: region.end,
      length: sequence.length,
      title,
      sequence
    });
    fastaRecords.push(formatFasta(title, sequence));
    sequenceRecords.push({ title, sequence });
    context.reportProgress?.({
      phase: "extracting-indexed-fasta-regions",
      progress: 0.1 + ((index + 1) / Math.max(1, requestedRegions.length)) * 0.8
    });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
  }

  return {
    rows,
    fasta: fastaRecords.join("\n"),
    sequenceRecords,
    warnings,
    requestedCount: requestedRegions.length,
    indexedSequences: [...fai.records.values()].map(({ name, length }) => ({ name, length })),
    sourceLabel: isBgzip ? "indexed BGZF FASTA" : "indexed FASTA",
    backend,
    backendLabel
  };
}

async function readIndexedFastaRegionsWithJsReader(indexedInput, context = {}, initialWarnings = []) {
  const backend = "indexed-fasta-js";
  const backendLabel = "JS indexed FASTA fallback";
  const { fastaFile, faiText, rangesText, isBgzip } = indexedInput;
  const maxBasesPerRegion = Number.parseInt(indexedInput.maxBasesPerRegion, 10);
  const hasRegionCap = Number.isInteger(maxBasesPerRegion) && maxBasesPerRegion > 0;
  if (!fastaFile?.slice) {
    throw new Error("Indexed FASTA extraction requires a local FASTA file.");
  }
  const fai = parseFaiIndex(faiText);
  const requestedRegions = parseIndexedFastaRegions(rangesText);
  const warnings = [...initialWarnings, ...fai.warnings];
  const rows = [];
  const fastaRecords = [];
  const sequenceRecords = [];
  const reader = makeIndexedFastaJsReader(indexedInput);
  context.reportProgress?.({ phase: "reading-fai", progress: 0.1 });
  context.throwIfCancelled?.();
  if (requestedRegions.length === 0) {
    warnings.push("No regions were provided.");
  }

  for (const [index, region] of requestedRegions.entries()) {
    const faiRecord = fai.records.get(region.seqid);
    const problem = validateRegion(region, faiRecord);
    if (problem) {
      warnings.push(problem);
      continue;
    }
    const expectedLength = region.end - region.start + 1;
    if (hasRegionCap && expectedLength > maxBasesPerRegion) {
      warnings.push(`${region.seqid}:${region.start}-${region.end}: region length ${expectedLength.toLocaleString()} exceeds the maximum ${maxBasesPerRegion.toLocaleString()} bases per region and was skipped.`);
      continue;
    }
    const sequence = await reader.getSequence(region.seqid, region.start - 1, region.end, {
      signal: context.signal
    }) || "";
    if (sequence.length !== expectedLength) {
      warnings.push(`${region.seqid}:${region.start}-${region.end}: extracted ${sequence.length} character(s), expected ${expectedLength}; check FASTA/FAI pairing.`);
    }
    const title = region.label || `${region.seqid}:${region.start}-${region.end}`;
    rows.push({
      seqid: region.seqid,
      start: region.start,
      end: region.end,
      length: sequence.length,
      title,
      sequence
    });
    fastaRecords.push(formatFasta(title, sequence));
    sequenceRecords.push({ title, sequence });
    context.reportProgress?.({
      phase: "extracting-indexed-fasta-regions",
      progress: 0.1 + ((index + 1) / Math.max(1, requestedRegions.length)) * 0.8
    });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
  }

  return {
    rows,
    fasta: fastaRecords.join("\n"),
    sequenceRecords,
    warnings,
    requestedCount: requestedRegions.length,
    indexedSequences: [...fai.records.values()].map(({ name, length }) => ({ name, length })),
    sourceLabel: isBgzip ? "indexed BGZF FASTA" : "indexed FASTA",
    backend,
    backendLabel
  };
}

export async function readIndexedFastaRegions(indexedInput, context = {}) {
  if (canRunBioWasmHtsTools()) {
    try {
      return await readIndexedFastaRegionsWithBioWasm(indexedInput, context);
    } catch (error) {
      return readIndexedFastaRegionsWithJsReader(indexedInput, context, [
        `Primary indexed FASTA backend failed (${error.message}); used the fallback indexed FASTA reader.`
      ]);
    }
  }
  return readIndexedFastaRegionsWithJsReader(indexedInput, context, [
    makeBioWasmFallbackWarning({
      toolLabel: "BioWasm samtools faidx",
      fallbackLabel: "the JS indexed FASTA reader"
    })
  ]);
}

export const indexedFastaRegionColumns = [
  { id: "seqid", label: "Seqid", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "title", label: "Title", type: "string" },
  { id: "sequence", label: "Sequence", type: "string" }
];
