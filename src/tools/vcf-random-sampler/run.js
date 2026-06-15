import { streamTextFileChunks } from "../../core/compressed-text-reader.js";
import {
  sampleVcfChunks,
  sampleVcfText,
  vcfRandomSamplerColumns
} from "../../core/vcf-random-sampler.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["sampled-vcf", "variant-table", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "sampled-vcf";
}

function outputForFormat(result, outputFormat) {
  if (outputFormat === "variant-table") {
    return result.table;
  }
  if (outputFormat === "report") {
    return result.report;
  }
  return result.sampledVcf;
}

function downloadForFormat(outputFormat) {
  if (outputFormat === "variant-table") {
    return {
      filename: "sampled-variants.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "report") {
    return {
      filename: "vcf-random-sampler-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  return {
    filename: "sampled-variants.vcf",
    mimeType: "text/vcf;charset=utf-8"
  };
}

export async function runVcfRandomSampler(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "preparing-vcf-random-sampler", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const result = options.vcfInputFile?.stream
    ? await sampleVcfChunks(
        streamTextFileChunks(options.vcfInputFile, {
          onProgress: (detail) => context.reportProgress?.({
            ...detail,
            phase: detail.phase === "decompressing-text" ? "decompressing-vcf" : "reading-vcf"
          })
        }),
        options,
        context
      )
    : sampleVcfText(input, options, context);

  context.reportProgress?.({ phase: "building-output", progress: 0.8 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const output = outputForFormat(result, outputFormat);
  const download = downloadForFormat(outputFormat);
  const streams = {
    ...(outputFormat === "sampled-vcf" ? { sampledVcf: makeTextStream(result.sampledVcf, "text/vcf") } : {}),
    ...(outputFormat === "variant-table" ? { table: makeTableStream(vcfRandomSamplerColumns, result.rows, "vcf-random-sampler") } : {}),
    ...(outputFormat === "report" ? { report: makeTextStream(result.report, "text/plain") } : {})
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download,
    warnings: result.warnings,
    recordsProcessed: result.sampledVariants,
    streams,
    optionsUsed: {
      outputFormat,
      seed: result.seed
    }
  });
}
