import { readTextFile } from "./compressed-text-reader.js";
import { parseBiologicalRecordInput } from "./biological-record-format-converter.js";
import { parseSequenceInput } from "./fasta.js";
import {
  readIndexedFastaRegions,
  resolveIndexedFastaRegionInput
} from "./indexed-genomics/indexed-fasta-reader.js";
import { cleanDnaRnaSequence } from "./sequence.js";

const REFERENCE_GENOME_MODES = new Set([
  "none",
  "loaded",
  "flatfile",
  "gff3-fasta",
  "gtf-fasta",
  "bed-fasta",
  "indexed",
  "bgzf"
]);

function normalizeReferenceGenomeMode(value) {
  return REFERENCE_GENOME_MODES.has(value) ? value : "none";
}

function makeRangeText({ seqid, start, end, label = "" }) {
  return [seqid, start, end, label].filter((value) => value !== "").join("\t");
}

function normalizeRegion(region = {}) {
  const seqid = String(region.seqid ?? "").trim();
  const start = Number.parseInt(region.start, 10);
  const end = Number.parseInt(region.end, 10);
  if (!seqid || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return null;
  }
  return {
    seqid,
    start,
    end,
    label: String(region.label ?? "").trim()
  };
}

function makeMissingReferenceWarning(mode) {
  if (mode === "loaded") {
    return "Reference genome was set to plain sequence/FASTA, but no reference sequence input was provided.";
  }
  if (mode === "flatfile") {
    return "Reference genome was set to annotated flatfile, but no GenBank/DDBJ/EMBL reference record was provided.";
  }
  if (mode === "gff3-fasta" || mode === "gtf-fasta" || mode === "bed-fasta") {
    return `Reference genome was set to ${mode.toUpperCase()} input, but no paired annotation and FASTA reference input was provided.`;
  }
  if (mode === "indexed") {
    return "Reference genome was set to FASTA+FAI, but the reference FASTA file and matching .fai were not both provided.";
  }
  if (mode === "bgzf") {
    return "Reference genome was set to BGZF FASTA+FAI+GZI, but the reference FASTA, .fai, and .gzi files were not all provided.";
  }
  return "";
}

function hasRequiredReferenceFiles(mode, options) {
  const fastaFile = options.referenceGenomeFastaFile;
  const faiFile = options.referenceGenomeFaiFile;
  const gziFile = options.referenceGenomeGziFile;
  if (mode === "loaded" || mode === "flatfile" || mode === "gff3-fasta" || mode === "gtf-fasta" || mode === "bed-fasta") {
    return Boolean(fastaFile?.stream || fastaFile?.text);
  }
  if (mode === "indexed") return Boolean(fastaFile?.slice && faiFile?.text);
  if (mode === "bgzf") return Boolean(fastaFile?.slice && faiFile?.text && gziFile?.slice);
  return false;
}

export function hasOptionalReferenceGenome(options = {}) {
  return normalizeReferenceGenomeMode(options.referenceGenomeMode) !== "none";
}

function firstTitleWord(title) {
  return String(title ?? "").trim().split(/\s+/u)[0] || "";
}

function buildLoadedReferenceRecordIndex(records, warnings) {
  const byFullTitle = new Map();
  const byFirstWord = new Map();
  for (const record of records) {
    const fullTitle = String(record.title ?? "").trim();
    const firstWord = firstTitleWord(fullTitle);
    for (const key of [fullTitle, firstWord, record.accession, record.sourceTitle]) {
      const normalized = String(key ?? "").trim();
      if (!normalized) {
        continue;
      }
      if (!byFullTitle.has(normalized)) {
        byFullTitle.set(normalized, record);
      }
      if (!byFirstWord.has(normalized)) {
        byFirstWord.set(normalized, record);
      } else if (byFirstWord.get(normalized) !== record && normalized === firstWord) {
        warnings.push(`Multiple reference records share first title word "${normalized}"; region requests using that seqid use the first matching record.`);
      }
    }
  }
  return { byFullTitle, byFirstWord };
}

function findLoadedReferenceRecord(region, index) {
  return index.byFullTitle.get(region.seqid) ?? index.byFirstWord.get(region.seqid);
}

function cleanLoadedReferenceRecords(records, warnings) {
  return records
    .map((record, index) => {
      const title = record.title || record.accession || `Reference ${index + 1}`;
      const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
      if (cleaned.removedCount > 0) {
        warnings.push(`${title}: removed ${cleaned.removedCount.toLocaleString()} unsupported reference character(s).`);
      }
      return {
        ...record,
        title,
        sequence: cleaned.sequence.replaceAll("U", "T")
      };
    })
    .filter((record) => record.sequence.length > 0);
}

function parseLoadedReferenceRecords(text, mode, region, warnings) {
  if (mode === "loaded") {
    return {
      records: cleanLoadedReferenceRecords(parseSequenceInput(text, region.seqid || "reference"), warnings),
      sourceLabel: "plain sequence/FASTA reference"
    };
  }

  const parsed = parseBiologicalRecordInput(text, {
    inputFormat: mode === "flatfile" ? "auto" : mode
  });
  warnings.push(...parsed.warnings);
  const records = cleanLoadedReferenceRecords(
    parsed.records
      .filter((record) => record.sequence && record.molecule !== "protein")
      .map((record) => ({
        ...record,
        title: record.accession || record.title,
        sourceTitle: record.title
      })),
    warnings
  );
  return {
    records,
    sourceLabel: parsed.sourceFormat || "annotated reference record"
  };
}

function readLoadedReferenceRegionFromRecords(records, region, sourceLabel, warnings) {
  const recordIndex = buildLoadedReferenceRecordIndex(records, warnings);
  const record = findLoadedReferenceRecord(region, recordIndex);
  if (!record) {
    warnings.push(`${region.seqid}: sequence is not present in the supplied ${sourceLabel}.`);
    return "";
  }
  if (region.end > record.sequence.length) {
    warnings.push(`${region.seqid}:${region.start}-${region.end}: end exceeds sequence length ${record.sequence.length.toLocaleString()} in the supplied ${sourceLabel}.`);
    return "";
  }
  return record.sequence.slice(region.start - 1, region.end);
}

export async function readOptionalReferenceGenomeRegion(options = {}, region = {}, context = {}) {
  const mode = normalizeReferenceGenomeMode(options.referenceGenomeMode);
  const warnings = [];
  if (mode === "none") {
    return null;
  }

  const normalizedRegion = normalizeRegion(region);
  if (!normalizedRegion) {
    return {
      sequence: "",
      warnings: ["Reference genome sequence could not be read because the requested region is invalid."],
      sourceLabel: ""
    };
  }

  if (!hasRequiredReferenceFiles(mode, options)) {
    return {
      sequence: "",
      warnings: [makeMissingReferenceWarning(mode)],
      sourceLabel: ""
    };
  }

  const rangeText = makeRangeText(normalizedRegion);
  try {
    if (mode === "loaded" || mode === "flatfile" || mode === "gff3-fasta" || mode === "gtf-fasta" || mode === "bed-fasta") {
      const referenceText = await readTextFile(options.referenceGenomeFastaFile, {
        signal: context.signal,
        onProgress: (detail) => context.reportProgress?.({
          ...detail,
          phase: detail.phase === "decompressing-text" ? "decompressing-reference-sequence" : "reading-reference-sequence"
        })
      });
      const loadedWarnings = [];
      const parsed = parseLoadedReferenceRecords(referenceText, mode, normalizedRegion, loadedWarnings);
      warnings.push(...loadedWarnings);
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
      return {
        sequence: readLoadedReferenceRegionFromRecords(parsed.records, normalizedRegion, parsed.sourceLabel, warnings),
        warnings,
        sourceLabel: parsed.sourceLabel,
        backendLabel: `${parsed.sourceLabel} scanner`
      };
    }

    const indexedInput = await resolveIndexedFastaRegionInput("", {
      fastaFile: options.referenceGenomeFastaFile,
      faiFile: options.referenceGenomeFaiFile,
      gziFile: mode === "bgzf" ? options.referenceGenomeGziFile : undefined,
      rangeText
    });
    const result = await readIndexedFastaRegions({
      fastaFile: indexedInput.fastaFile,
      faiText: indexedInput.faiText,
      gziFile: indexedInput.gziFile,
      isBgzip: indexedInput.isBgzip,
      rangesText: indexedInput.rangesText,
      maxBasesPerRegion: options.maxReferenceGenomeRegionBases
    }, context);
    return {
      sequence: result.sequenceRecords[0]?.sequence ?? "",
      warnings: result.warnings,
      sourceLabel: result.sourceLabel,
      backendLabel: result.backendLabel
    };
  } catch (error) {
    return {
      sequence: "",
      warnings: [`Reference genome sequence could not be read for ${normalizedRegion.seqid}:${normalizedRegion.start}-${normalizedRegion.end}: ${error.message}`],
      sourceLabel: ""
    };
  }
}
