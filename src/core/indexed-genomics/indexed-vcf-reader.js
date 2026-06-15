import {
  BlobFile,
  TabixIndexedFile
} from "../../vendor/indexed-genomics/indexed-vcf-runtime.bundle.js";
import { makeBioWasmFallbackWarning } from "../biowasm-runner.js";
import { canRunBioWasmHtsTools, runBcftoolsIndexedRegion } from "./biowasm-hts.js";

function normalizeStart(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function normalizeEnd(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function parseVcfHeaderContigs(headerText = "") {
  return String(headerText)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith("##contig=<"))
    .map((line) => {
      const id = line.match(/(?:^|[<,])ID=([^,>]+)/)?.[1] ?? "";
      const length = Number.parseInt(line.match(/(?:^|,)length=(\d+)/)?.[1] ?? "", 10);
      return id ? { id, length: Number.isFinite(length) ? length : null } : null;
    })
    .filter(Boolean);
}

export function hasIndexedVcfInputs(options = {}) {
  return Boolean(options.indexedVcfFile && options.indexFile);
}

function makeVcfRegionString(chromosome, start1, end1) {
  if (end1 === undefined) {
    return chromosome;
  }
  return `${chromosome}:${start1}-${end1}`;
}

function splitVcfDataLines(text = "") {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("#"));
}

async function readIndexedVcfRegionWithBioWasm(options = {}, context = {}) {
  const vcfFile = options.indexedVcfFile;
  const indexFile = options.indexFile;
  const chromosome = String(options.chromosome ?? "").trim();
  if (!vcfFile || !indexFile || !chromosome) {
    throw new Error("Indexed VCF queries require a bgzip-compressed VCF file, a tabix/CSI index file, and a chromosome.");
  }

  const start1 = normalizeStart(options.regionStart);
  const end1 = normalizeEnd(options.regionEnd);
  if (end1 !== undefined && start1 > end1) {
    return {
      headerText: "",
      dataLines: [],
      query: { chromosome, start1, end1, start0: start1 - 1, end0Exclusive: end1 },
      warnings: ["Region start is greater than region end; no indexed VCF lines were read."],
      engine: "none",
      engineLabel: "none"
    };
  }

  const { headerText, dataText } = await runBcftoolsIndexedRegion({
    vcfFile,
    indexFile,
    region: makeVcfRegionString(chromosome, start1, end1)
  }, context);
  const contigs = parseVcfHeaderContigs(headerText);
  const requestedContig = contigs.find((contig) => contig.id === chromosome);
  if (contigs.length > 0 && !requestedContig) {
    const examples = contigs.slice(0, 6).map((contig) => contig.id).join(", ");
    throw new Error(`Region reference "${chromosome}" was not found in the VCF header. Header contigs include: ${examples}.`);
  }

  const start0 = start1 - 1;
  const end0Exclusive = end1;
  const dataLines = splitVcfDataLines(dataText);
  const warnings = [];
  if (requestedContig?.length && end1 !== undefined && end1 > requestedContig.length) {
    warnings.push(`Requested region ends at ${end1.toLocaleString()}, beyond ${chromosome} length ${requestedContig.length.toLocaleString()} in the VCF header.`);
  }
  if (dataLines.length === 0) {
    warnings.push("Indexed VCF query returned no variant records for the requested region.");
  }
  return {
    headerText,
    dataLines,
    query: { chromosome, start1, end1, start0, end0Exclusive },
    warnings,
    engine: "bcftools",
    engineLabel: "bcftools view via vendored BioWasm/Aioli"
  };
}

async function readIndexedVcfRegionWithJsReader(options = {}, context = {}, initialWarnings = []) {
  const vcfFile = options.indexedVcfFile;
  const indexFile = options.indexFile;
  const chromosome = String(options.chromosome ?? "").trim();
  if (!vcfFile || !indexFile || !chromosome) {
    throw new Error("Indexed VCF queries require a bgzip-compressed VCF file, a tabix/CSI index file, and a chromosome.");
  }

  const indexName = String(indexFile.name ?? "").toLowerCase();
  const fileArgs = {
    filehandle: new BlobFile(vcfFile),
    yieldTime: 250
  };
  if (indexName.endsWith(".csi")) {
    fileArgs.csiFilehandle = new BlobFile(indexFile);
  } else {
    fileArgs.tbiFilehandle = new BlobFile(indexFile);
  }
  const indexedFile = new TabixIndexedFile(fileArgs);
  context.reportProgress?.({ phase: "reading-indexed-vcf-header", progress: 0.12 });
  context.throwIfCancelled?.();
  const headerText = await indexedFile.getHeader({ signal: context.signal });
  const contigs = parseVcfHeaderContigs(headerText);
  const requestedContig = contigs.find((contig) => contig.id === chromosome);
  if (contigs.length > 0 && !requestedContig) {
    const examples = contigs.slice(0, 6).map((contig) => contig.id).join(", ");
    throw new Error(`Region reference "${chromosome}" was not found in the VCF header. Header contigs include: ${examples}.`);
  }

  const start1 = normalizeStart(options.regionStart);
  const end1 = normalizeEnd(options.regionEnd);
  if (end1 !== undefined && start1 > end1) {
    return {
      headerText,
      dataLines: [],
      query: { chromosome, start1, end1, start0: start1 - 1, end0Exclusive: end1 },
      warnings: [...initialWarnings, "Region start is greater than region end; no indexed VCF lines were read."],
      engine: "none",
      engineLabel: "none"
    };
  }

  const start0 = start1 - 1;
  const end0Exclusive = end1;
  const dataLines = [];
  context.reportProgress?.({ phase: "querying-indexed-vcf-region", progress: 0.35 });
  try {
    await indexedFile.getLines(chromosome, start0, end0Exclusive, {
      signal: context.signal,
      lineCallback: (line) => {
        dataLines.push(line);
      }
    });
  } catch (error) {
    const detail = /gzip|bgzf|tabix|index/i.test(error.message ?? "")
      ? " Indexed VCF region queries require a bgzip-compressed VCF.GZ and a matching TBI or CSI index."
      : "";
    throw new Error(`Could not query the indexed VCF region: ${error.message}.${detail}`);
  }
  context.throwIfCancelled?.();
  const warnings = [...initialWarnings];
  if (requestedContig?.length && end1 !== undefined && end1 > requestedContig.length) {
    warnings.push(`Requested region ends at ${end1.toLocaleString()}, beyond ${chromosome} length ${requestedContig.length.toLocaleString()} in the VCF header.`);
  }
  if (dataLines.length === 0) {
    warnings.push("Indexed VCF query returned no variant records for the requested region.");
  }
  return {
    headerText,
    dataLines,
    query: { chromosome, start1, end1, start0, end0Exclusive },
    warnings,
    engine: "gmod-tabix",
    engineLabel: "JS indexed VCF fallback"
  };
}

export async function readIndexedVcfRegion(options = {}, context = {}) {
  if (canRunBioWasmHtsTools()) {
    try {
      return await readIndexedVcfRegionWithBioWasm(options, context);
    } catch (error) {
      return readIndexedVcfRegionWithJsReader(options, context, [
        `Primary indexed VCF backend failed (${error.message}); used the fallback indexed VCF reader.`
      ]);
    }
  }
  return readIndexedVcfRegionWithJsReader(options, context, [
    makeBioWasmFallbackWarning({
      toolLabel: "BioWasm bcftools view",
      fallbackLabel: "the JS indexed VCF reader"
    })
  ]);
}

export function makeVcfTextFromIndexedRegion(regionResult) {
  return [
    String(regionResult.headerText ?? "").trimEnd(),
    ...regionResult.dataLines
  ].filter(Boolean).join("\n");
}
