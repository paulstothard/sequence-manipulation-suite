import { streamTextFileChunks } from "../../core/compressed-text-reader.js";
import {
  filterVcfChunks,
  filterVcfText,
  vcfFilterVariantColumns
} from "../../core/vcf-filter.js";
import {
  hasIndexedVcfInputs,
  makeVcfTextFromIndexedRegion,
  readIndexedVcfRegion
} from "../../core/indexed-genomics/indexed-vcf-reader.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["filtered-vcf", "variant-table", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "filtered-vcf";
}

function normalizeSourceMode(value, options = {}) {
  if (value === "indexed-vcf") {
    return "indexed-vcf";
  }
  return hasIndexedVcfInputs(options) ? "indexed-vcf" : "paste-upload";
}

function outputForFormat(result, outputFormat) {
  if (outputFormat === "variant-table") {
    return result.table;
  }
  if (outputFormat === "report") {
    return result.report;
  }
  return result.filteredVcf;
}

function downloadForFormat(outputFormat) {
  if (outputFormat === "variant-table") {
    return {
      filename: "filtered-variants.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "report") {
    return {
      filename: "vcf-filter-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  return {
    filename: "filtered.vcf",
    mimeType: "text/vcf;charset=utf-8"
  };
}

export async function runVcfFilter(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "preparing-vcf-filter", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const sourceMode = normalizeSourceMode(options.vcfSourceMode, options);
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  let effectiveInput = input;
  let indexedWarnings = [];
  let indexedEngineLabel = "";

  if (sourceMode === "indexed-vcf") {
    if (!hasIndexedVcfInputs(options)) {
      throw new Error("Indexed VCF mode requires a bgzip-compressed VCF.GZ file and its matching TBI or CSI index.");
    }
    if (!String(options.chromosome ?? "").trim()) {
      throw new Error("Indexed VCF filtering requires a reference/chromosome value for the bounded region query.");
    }
    const indexedRegion = await readIndexedVcfRegion(options, context);
    effectiveInput = makeVcfTextFromIndexedRegion(indexedRegion);
    indexedWarnings = indexedRegion.warnings ?? [];
    indexedEngineLabel = indexedRegion.engineLabel || indexedRegion.engine || "";
  }

  const filterOptions = {
    ...options,
    outputFormat,
    sourceEngineLabel: indexedEngineLabel
  };
  const result = sourceMode !== "indexed-vcf" && options.vcfInputFile?.stream
    ? await filterVcfChunks(
        streamTextFileChunks(options.vcfInputFile, {
          onProgress: (detail) => context.reportProgress?.({
            ...detail,
            phase: detail.phase === "decompressing-text" ? "decompressing-vcf" : "reading-vcf"
          })
        }),
        filterOptions,
        context
      )
    : filterVcfText(effectiveInput, filterOptions, context);

  if (indexedWarnings.length > 0) {
    result.warnings.push(...indexedWarnings);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.8 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const output = outputForFormat(result, outputFormat);
  const download = downloadForFormat(outputFormat);
  const streams = {
    ...(outputFormat === "filtered-vcf" ? { filteredVcf: makeTextStream(result.filteredVcf, "text/vcf") } : {}),
    ...(outputFormat === "variant-table" ? { table: makeTableStream(vcfFilterVariantColumns, result.rows, "vcf-filter") } : {}),
    ...(outputFormat === "report" ? { report: makeTextStream(result.report, "text/plain") } : {})
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download,
    warnings: result.warnings,
    recordsProcessed: result.keptVariants,
    streams,
    optionsUsed: {
      outputFormat,
      vcfSourceMode: sourceMode,
      sourceEngineLabel: indexedEngineLabel
    }
  });
}
