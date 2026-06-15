import {
  BamFile,
  BlobFile
} from "../../vendor/indexed-genomics/indexed-vcf-runtime.bundle.js";
import { makeBioWasmFallbackWarning } from "../biowasm-runner.js";
import { canRunBioWasmHtsTools, runSamtoolsIndexedBamRegion } from "./biowasm-hts.js";

function normalizePositiveInteger(value, label) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Indexed BAM region queries require a positive 1-based ${label}.`);
  }
  return parsed;
}

function qualityString(record) {
  const quality = record.qual;
  if (!quality || quality.length === 0) {
    return "*";
  }
  return Array.from(quality, (score) => String.fromCharCode(Math.max(0, Math.min(93, score)) + 33)).join("");
}

function optionalSamTags(record) {
  const tags = [];
  const readGroup = record.getTag?.("RG");
  if (readGroup !== undefined && readGroup !== null && readGroup !== "") {
    tags.push(`RG:Z:${String(readGroup).replace(/\t/g, " ")}`);
  }
  const editDistance = record.getTag?.("NM");
  if (Number.isInteger(editDistance)) {
    tags.push(`NM:i:${editDistance}`);
  }
  const mismatchString = record.getTag?.("MD");
  if (mismatchString !== undefined && mismatchString !== null && mismatchString !== "") {
    tags.push(`MD:Z:${String(mismatchString).replace(/\t/g, " ")}`);
  }
  return tags;
}

function recordToSamLine(record, indexToChr = []) {
  const qname = record.name || "*";
  const flag = Number.isInteger(record.flags) ? record.flags : 0;
  const rname = indexToChr[record.ref_id]?.refName || "*";
  const pos = Number.isInteger(record.start) && record.start >= 0 ? record.start + 1 : 0;
  const mapq = Number.isFinite(record.mq) ? record.mq : 255;
  const cigar = record.CIGAR || "*";
  const rnext = record.next_refid === record.ref_id
    ? "="
    : (indexToChr[record.next_refid]?.refName || "*");
  const pnext = Number.isInteger(record.next_pos) && record.next_pos >= 0 ? record.next_pos + 1 : 0;
  const tlen = Number.isFinite(record.template_length) ? record.template_length : 0;
  const seq = record.seq || "*";
  const qual = seq === "*" ? "*" : qualityString(record);
  return [
    qname,
    flag,
    rname,
    pos,
    mapq,
    cigar,
    rnext,
    pnext,
    tlen,
    seq,
    qual,
    ...optionalSamTags(record)
  ].join("\t");
}

function parseSamHeaderReferences(headerText = "") {
  return String(headerText)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith("@SQ\t"))
    .map((line) => {
      const name = line.match(/(?:^|\t)SN:([^\t]+)/)?.[1] ?? "";
      const length = Number.parseInt(line.match(/(?:^|\t)LN:(\d+)/)?.[1] ?? "", 10);
      return name ? { name, length: Number.isFinite(length) ? length : null } : null;
    })
    .filter(Boolean);
}

export function hasIndexedBamInputs(options = {}) {
  return Boolean(options.indexedBamFile && options.bamIndexFile);
}

function makeBamRegionString(chromosome, start1, end1) {
  return `${chromosome}:${start1}-${end1}`;
}

function countSamAlignmentLines(samText = "") {
  return String(samText)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line && !line.startsWith("@")).length;
}

function samHeaderFromText(samText = "") {
  return String(samText)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith("@"))
    .join("\n");
}

async function readIndexedBamRegionWithBioWasm(options = {}, context = {}) {
  const bamFile = options.indexedBamFile;
  const indexFile = options.bamIndexFile;
  const chromosome = String(options.chromosome ?? "").trim();
  if (!bamFile || !indexFile || !chromosome) {
    throw new Error("Indexed BAM queries require a BAM file, a BAI/CSI index file, and a reference/chromosome.");
  }
  const start1 = normalizePositiveInteger(options.regionStart, "start position");
  const end1 = normalizePositiveInteger(options.regionEnd, "end position");
  if (start1 > end1) {
    return {
      samText: "",
      headerText: "",
      recordCount: 0,
      query: { chromosome, start1, end1, start0: start1 - 1, end0Exclusive: end1 },
      warnings: ["Region start is greater than region end; no indexed BAM records were read."],
      engine: "none",
      engineLabel: "none"
    };
  }

  const start0 = start1 - 1;
  const end0Exclusive = end1;
  const samText = await runSamtoolsIndexedBamRegion({
    bamFile,
    indexFile,
    region: makeBamRegionString(chromosome, start1, end1)
  }, context);
  const headerText = samHeaderFromText(samText);
  const references = parseSamHeaderReferences(headerText);
  const requestedReference = references.find((reference) => reference.name === chromosome);
  if (references.length > 0 && !requestedReference) {
    const examples = references.slice(0, 6).map((reference) => reference.name).join(", ");
    throw new Error(`Region reference "${chromosome}" was not found in the BAM header. Available references include: ${examples}.`);
  }

  const recordCount = countSamAlignmentLines(samText);
  const warnings = [
    "Indexed BAM mode summarizes only the requested region, not the entire BAM file."
  ];
  if (requestedReference?.length && end1 > requestedReference.length) {
    warnings.push(`Requested region ends at ${end1.toLocaleString()}, beyond ${chromosome} length ${requestedReference.length.toLocaleString()} in the BAM header.`);
  }
  if (recordCount === 0) {
    warnings.push("Indexed BAM query returned no alignment records for the requested region.");
  }
  return {
    samText: String(samText ?? "").trimEnd(),
    headerText,
    recordCount,
    query: { chromosome, start1, end1, start0, end0Exclusive },
    warnings,
    engine: "samtools",
    engineLabel: "samtools view via vendored BioWasm/Aioli"
  };
}

async function readIndexedBamRegionWithJsReader(options = {}, context = {}, initialWarnings = []) {
  const bamFile = options.indexedBamFile;
  const indexFile = options.bamIndexFile;
  const chromosome = String(options.chromosome ?? "").trim();
  if (!bamFile || !indexFile || !chromosome) {
    throw new Error("Indexed BAM queries require a BAM file, a BAI/CSI index file, and a reference/chromosome.");
  }
  const start1 = normalizePositiveInteger(options.regionStart, "start position");
  const end1 = normalizePositiveInteger(options.regionEnd, "end position");
  if (start1 > end1) {
    return {
      samText: "",
      headerText: "",
      recordCount: 0,
      query: { chromosome, start1, end1, start0: start1 - 1, end0Exclusive: end1 },
      warnings: [...initialWarnings, "Region start is greater than region end; no indexed BAM records were read."],
      engine: "none",
      engineLabel: "none"
    };
  }

  const indexName = String(indexFile.name ?? "").toLowerCase();
  const fileArgs = {
    bamFilehandle: new BlobFile(bamFile)
  };
  if (indexName.endsWith(".csi")) {
    fileArgs.csiFilehandle = new BlobFile(indexFile);
  } else {
    fileArgs.baiFilehandle = new BlobFile(indexFile);
  }
  const bam = new BamFile(fileArgs);
  context.reportProgress?.({ phase: "reading-indexed-bam-header", progress: 0.12 });
  context.throwIfCancelled?.();
  await bam.getHeader({ signal: context.signal });
  const headerText = typeof bam.getHeaderText === "function"
    ? await bam.getHeaderText({ signal: context.signal })
    : String(bam.header ?? "");
  const references = parseSamHeaderReferences(headerText);
  const requestedReference = references.find((reference) => reference.name === chromosome);
  if (references.length > 0 && !requestedReference) {
    const examples = references.slice(0, 6).map((reference) => reference.name).join(", ");
    throw new Error(`Region reference "${chromosome}" was not found in the BAM header. Available references include: ${examples}.`);
  }

  const start0 = start1 - 1;
  const end0Exclusive = end1;
  context.reportProgress?.({ phase: "querying-indexed-bam-region", progress: 0.35 });
  const records = await bam.getRecordsForRange(chromosome, start0, end0Exclusive, { signal: context.signal });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const lines = records.map((record) => recordToSamLine(record, bam.indexToChr ?? []));
  const warnings = [
    ...initialWarnings,
    "Indexed BAM mode summarizes only the requested region, not the entire BAM file."
  ];
  if (requestedReference?.length && end1 > requestedReference.length) {
    warnings.push(`Requested region ends at ${end1.toLocaleString()}, beyond ${chromosome} length ${requestedReference.length.toLocaleString()} in the BAM header.`);
  }
  if (records.length === 0) {
    warnings.push("Indexed BAM query returned no alignment records for the requested region.");
  }
  return {
    samText: [headerText.trimEnd(), ...lines].filter(Boolean).join("\n"),
    headerText,
    recordCount: records.length,
    query: { chromosome, start1, end1, start0, end0Exclusive },
    warnings,
    engine: "gmod",
    engineLabel: "JS indexed BAM fallback"
  };
}

export async function readIndexedBamRegion(options = {}, context = {}) {
  if (canRunBioWasmHtsTools()) {
    try {
      return await readIndexedBamRegionWithBioWasm(options, context);
    } catch (error) {
      return readIndexedBamRegionWithJsReader(options, context, [
        `Primary indexed BAM backend failed (${error.message}); used the fallback indexed BAM reader.`
      ]);
    }
  }
  return readIndexedBamRegionWithJsReader(options, context, [
    makeBioWasmFallbackWarning({
      toolLabel: "BioWasm samtools view",
      fallbackLabel: "the JS indexed BAM reader"
    })
  ]);
}
