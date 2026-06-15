import {
  fastqDistributionColumns,
  fastqPerBaseQualityColumns,
  fastqSummaryColumns,
  makeFastqDistributionTsv,
  makeFastqAmbiguousDistributionPlotSpec,
  makeFastqBaseCompositionPlotSpec,
  makeFastqGcPlotSpec,
  makeFastqLengthPlotSpec,
  makeFastqPerBaseQualityTsv,
  makeFastqQualityPlotSpec,
  makeFastqReadQualityDistributionPlotSpec,
  makeFastqSummaryTsv,
  summarizeFastq,
  summarizeFastqChunks
} from "../../core/fastq-summary.js";
import { streamTextFileChunks } from "../../core/compressed-text-reader.js";
import {
  makeObservablePlotConfig,
  renderCategoricalBarPlotSvg,
  renderLinePlotSvg
} from "../../core/plot-renderer.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set([
  "report",
  "tsv",
  "per-base-quality-tsv",
  "length-distribution-tsv",
  "gc-distribution-tsv",
  "read-quality-distribution-tsv",
  "n-distribution-tsv",
  "quality-svg",
  "read-quality-svg",
  "base-composition-svg",
  "length-svg",
  "gc-svg",
  "n-distribution-svg"
]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

async function* joinChunkStreams(...streams) {
  let streamIndex = 0;
  for (const stream of streams) {
    if (streamIndex > 0) {
      yield "\n";
    }
    for await (const chunk of stream) {
      yield chunk;
    }
    streamIndex += 1;
  }
}

function fastqFileChunks(file, context, phasePrefix = "fastq") {
  return streamTextFileChunks(file, {
    signal: context.signal,
    onProgress: (detail) => context.reportProgress?.({
      ...detail,
      phase: detail.phase === "decompressing-text" ? `decompressing-${phasePrefix}` : `reading-${phasePrefix}`
    })
  });
}

function fastqSourceChunks(source, context, phasePrefix = "fastq") {
  if (source?.stream) {
    return fastqFileChunks(source, context, phasePrefix);
  }
  return [String(source?.text ?? "")];
}

function hasFastqSource(source) {
  return Boolean(source?.stream || String(source?.text ?? "").trim());
}

function makePlotForFormat(result, outputFormat) {
  if (outputFormat === "quality-svg") {
    const spec = makeFastqQualityPlotSpec(result);
    return { spec, svg: renderLinePlotSvg(spec) };
  }
  if (outputFormat === "length-svg") {
    const spec = makeFastqLengthPlotSpec(result);
    return { spec, svg: renderCategoricalBarPlotSvg(spec) };
  }
  if (outputFormat === "gc-svg") {
    const spec = makeFastqGcPlotSpec(result);
    return { spec, svg: renderCategoricalBarPlotSvg(spec) };
  }
  if (outputFormat === "read-quality-svg") {
    const spec = makeFastqReadQualityDistributionPlotSpec(result);
    return { spec, svg: renderCategoricalBarPlotSvg(spec) };
  }
  if (outputFormat === "base-composition-svg") {
    const spec = makeFastqBaseCompositionPlotSpec(result);
    return { spec, svg: renderLinePlotSvg(spec) };
  }
  if (outputFormat === "n-distribution-svg") {
    const spec = makeFastqAmbiguousDistributionPlotSpec(result);
    return { spec, svg: renderCategoricalBarPlotSvg(spec) };
  }
  return { spec: null, svg: "" };
}

export async function runFastqSummary(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const layout = options.readLayout === "paired" ? "paired" : "single";
  let result;
  if (layout === "paired") {
    if (!hasFastqSource(options.read1FastqFile) || !hasFastqSource(options.read2FastqFile)) {
      throw new Error("FASTQ QC Report paired-end mode requires both Read 1 and Read 2 FASTQ inputs.");
    }
    result = await summarizeFastqChunks(
      joinChunkStreams(
        fastqSourceChunks(options.read1FastqFile, context, "r1-fastq"),
        fastqSourceChunks(options.read2FastqFile, context, "r2-fastq")
      ),
      options,
      context
    );
    result.report = result.report.replace(
      /^FASTQ summary \/ analysis/u,
      "FASTQ paired-end summary / analysis"
    );
  } else {
    result = options.fastqInputFile?.stream
      ? await summarizeFastqChunks(fastqFileChunks(options.fastqInputFile, context, "fastq"), options, context)
      : summarizeFastq(input, options, context);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const tsv = makeFastqSummaryTsv(result.rows);
  const perBaseQualityTsv = makeFastqPerBaseQualityTsv(result.perBaseQualityRows);
  const lengthDistributionTsv = makeFastqDistributionTsv(result.lengthDistributionRows);
  const gcDistributionTsv = makeFastqDistributionTsv(result.gcDistributionRows);
  const readQualityDistributionTsv = makeFastqDistributionTsv(result.readQualityDistributionRows);
  const nDistributionTsv = makeFastqDistributionTsv(result.nDistributionRows);
  const plot = makePlotForFormat(result, outputFormat);
  const outputs = {
    report: result.report,
    tsv,
    "per-base-quality-tsv": perBaseQualityTsv,
    "length-distribution-tsv": lengthDistributionTsv,
    "gc-distribution-tsv": gcDistributionTsv,
    "read-quality-distribution-tsv": readQualityDistributionTsv,
    "n-distribution-tsv": nDistributionTsv,
    "quality-svg": plot.svg,
    "read-quality-svg": plot.svg,
    "base-composition-svg": plot.svg,
    "length-svg": plot.svg,
    "gc-svg": plot.svg,
    "n-distribution-svg": plot.svg
  };
  const isSvgOutput = outputFormat.endsWith("-svg");
  const isTsvOutput = outputFormat.endsWith("-tsv") || outputFormat === "tsv";

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "report"
        ? "fastq-summary.txt"
        : isSvgOutput
          ? "fastq-summary-plot.svg"
          : outputFormat === "per-base-quality-tsv"
            ? "fastq-per-base-quality.tsv"
            : outputFormat === "length-distribution-tsv"
              ? "fastq-read-length-distribution.tsv"
              : outputFormat === "gc-distribution-tsv"
                ? "fastq-read-gc-distribution.tsv"
                : outputFormat === "read-quality-distribution-tsv"
                  ? "fastq-read-quality-distribution.tsv"
                  : outputFormat === "n-distribution-tsv"
                    ? "fastq-read-n-distribution.tsv"
                    : "fastq-summary.tsv",
      mimeType: isSvgOutput
        ? "image/svg+xml;charset=utf-8"
        : isTsvOutput
          ? "text/tab-separated-values;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.recordCount ?? result.records.length,
    basesProcessed: result.totalBases ?? result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(fastqSummaryColumns, result.rows, "fastq-summary"),
      perBaseQuality: makeTableStream(fastqPerBaseQualityColumns, result.perBaseQualityRows, "fastq-per-base-quality"),
      lengthDistribution: makeTableStream(fastqDistributionColumns, result.lengthDistributionRows, "fastq-length-distribution"),
      gcDistribution: makeTableStream(fastqDistributionColumns, result.gcDistributionRows, "fastq-gc-distribution"),
      readQualityDistribution: makeTableStream(fastqDistributionColumns, result.readQualityDistributionRows, "fastq-read-quality-distribution"),
      nDistribution: makeTableStream(fastqDistributionColumns, result.nDistributionRows, "fastq-n-distribution"),
      ...(isSvgOutput ? { plot: makeTextStream(plot.svg, "image/svg+xml") } : {})
    },
    visual: isSvgOutput
      ? {
          svg: plot.svg,
          renderer: "observable-plot",
          plotSpec: plot.spec,
          observablePlotConfig: plot.spec ? makeObservablePlotConfig(plot.spec) : undefined,
          pngDownload: true
        }
      : undefined
  });
}
