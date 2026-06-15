import { readTextFile } from "../core/compressed-text-reader.js";
import { parseSequenceInput } from "../core/fasta.js";
import {
  makeIndexedFastaReader,
  parseFaiIndex,
  resolveIndexedFastaRegionInput
} from "../core/indexed-genomics/indexed-fasta-reader.js";
import { cleanDnaRnaSequence } from "../core/sequence.js";

const REFERENCE_GENOME_MODES = new Set(["none", "loaded", "indexed", "bgzf"]);

export function normalizeReferenceGenomeMode(value) {
  return REFERENCE_GENOME_MODES.has(value) ? value : "none";
}

export async function makeLegacyReferenceScreenOptions(options = {}, context = {}) {
  const mode = normalizeReferenceGenomeMode(options.referenceGenomeMode);
  if (mode === "none") {
    return options.referenceGenomeMode
      ? { ...options, searchReferenceOffTargets: false }
      : options;
  }

  if (mode === "loaded") {
    let referenceText = "";
    if (options.referenceGenomeFastaFile?.stream || options.referenceGenomeFastaFile?.text) {
      referenceText = await readTextFile(options.referenceGenomeFastaFile, {
        signal: context.signal,
        onProgress: (detail) => context.reportProgress?.({
          ...detail,
          phase: detail.phase === "decompressing-text" ? "decompressing-reference-fasta" : "reading-reference-fasta"
        })
      });
    }
    return {
      ...options,
      searchReferenceOffTargets: true,
      referenceInputMode: "pasted",
      referenceText
    };
  }

  if (mode === "indexed") {
    return {
      ...options,
      searchReferenceOffTargets: true,
      referenceInputMode: "indexed",
      indexedReferenceFastaFile: options.referenceGenomeFastaFile,
      indexedReferenceFaiFile: options.referenceGenomeFaiFile
    };
  }

  return {
    ...options,
    searchReferenceOffTargets: true,
    referenceInputMode: "indexed-bgzf",
    indexedReferenceBgzfFile: options.referenceGenomeFastaFile,
    indexedReferenceBgzfFaiFile: options.referenceGenomeFaiFile,
    indexedReferenceGziFile: options.referenceGenomeGziFile
  };
}

function cleanReferenceRecords(records, warnings) {
  let charactersRemoved = 0;
  const cleanedRecords = records.map((record, index) => {
    const title = record.title || `Reference ${index + 1}`;
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${title}: removed ${cleaned.removedCount} unsupported reference character(s).`);
    }
    return {
      title,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((record) => record.sequence.length > 0);
  return { records: cleanedRecords, charactersRemoved };
}

export async function loadReferenceGenomeRecords(options = {}, {
  loadedRecordLimit = 500000,
  indexedBaseLimit = 5000000
} = {}, context = {}) {
  const mode = normalizeReferenceGenomeMode(options.referenceGenomeMode);
  const warnings = [];
  if (mode === "none") {
    return { records: [], warnings, charactersRemoved: 0, basesProcessed: 0, source: "none" };
  }

  if (mode === "loaded") {
    if (!(options.referenceGenomeFastaFile?.stream || options.referenceGenomeFastaFile?.text)) {
      return {
        records: [],
        warnings: ["Reference genome was set to loaded FASTA, but no reference FASTA file was provided."],
        charactersRemoved: 0,
        basesProcessed: 0,
        source: "loaded FASTA"
      };
    }
    const fastaText = await readTextFile(options.referenceGenomeFastaFile, {
      signal: context.signal,
      onProgress: (detail) => context.reportProgress?.({
        ...detail,
        phase: detail.phase === "decompressing-text" ? "decompressing-reference-fasta" : "reading-reference-fasta"
      })
    });
    const parsed = parseSequenceInput(fastaText, "reference");
    const { records, charactersRemoved } = cleanReferenceRecords(parsed, warnings);
    const kept = [];
    for (const record of records) {
      if (record.sequence.length > loadedRecordLimit) {
        warnings.push(`${record.title}: skipped as reference because ${record.sequence.length.toLocaleString()} bp exceeds the loaded reference limit of ${loadedRecordLimit.toLocaleString()} bp.`);
      } else {
        kept.push(record);
      }
    }
    return {
      records: kept,
      warnings,
      charactersRemoved,
      basesProcessed: kept.reduce((sum, record) => sum + record.sequence.length, 0),
      source: "loaded FASTA"
    };
  }

  const fastaFile = options.referenceGenomeFastaFile;
  const faiFile = options.referenceGenomeFaiFile;
  const gziFile = mode === "bgzf" ? options.referenceGenomeGziFile : undefined;
  if (!fastaFile?.slice || !faiFile?.text || (mode === "bgzf" && !gziFile?.slice)) {
    return {
      records: [],
      warnings: [mode === "bgzf"
        ? "Reference genome was set to BGZF FASTA+FAI+GZI, but the reference FASTA, .fai, and .gzi files were not all provided."
        : "Reference genome was set to FASTA+FAI, but the reference FASTA file and matching .fai were not both provided."],
      charactersRemoved: 0,
      basesProcessed: 0,
      source: mode === "bgzf" ? "indexed BGZF FASTA" : "indexed FASTA"
    };
  }

  const indexedInput = await resolveIndexedFastaRegionInput("", { fastaFile, faiFile, gziFile });
  const fai = parseFaiIndex(indexedInput.faiText);
  warnings.push(...fai.warnings);
  const indexedSequences = [...fai.records.values()].map(({ name, length }) => ({ name, length }));
  const totalIndexedBases = indexedSequences.reduce((sum, record) => sum + record.length, 0);
  const source = indexedInput.isBgzip ? "indexed BGZF FASTA" : "indexed FASTA";
  if (totalIndexedBases > indexedBaseLimit) {
    warnings.push(`Reference genome hit counting was skipped because the indexed FASTA contains ${totalIndexedBases.toLocaleString()} bp, above the current limit of ${indexedBaseLimit.toLocaleString()} bp.`);
    return { records: [], warnings, charactersRemoved: 0, basesProcessed: 0, source };
  }

  const reader = makeIndexedFastaReader(indexedInput);
  warnings.push(...(reader.warnings ?? []));
  const records = [];
  for (const [index, record] of indexedSequences.entries()) {
    context.reportProgress?.({
      phase: "loading-indexed-reference",
      detail: record.name,
      progress: 0.7 + (index / Math.max(1, indexedSequences.length)) * 0.12
    });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    const sequence = (await reader.getSequence(record.name, 0, record.length, { signal: context.signal }) || "")
      .toUpperCase()
      .replaceAll("U", "T");
    records.push({ title: record.name, sequence });
  }
  return {
    records,
    warnings,
    charactersRemoved: 0,
    basesProcessed: totalIndexedBases,
    source
  };
}
