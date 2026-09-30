import { prepareSangerAlleleCollection } from "../../core/sanger-allele-preparation.js";
import {
  genotypeSangerTraces,
  sangerGenotypeColumns,
} from "../../core/sanger-genotype.js";
import { sangerCandidateOutput } from "../../core/sanger-genotype-output.js";
import {
  makeSangerTraceJson,
} from "../../core/sanger-trace.js";
import {
  makeToolResult,
  makeTableStream,
  makeTextStream,
} from "../../core/workflow.js";

export const SANGER_ALLELE_OUTPUTS = [
  "genotypes-tsv",
  "candidate-fasta",
  "candidate-alignment-svg",
];
export async function runSangerAlleleOutput(input, options = {}, context = {}) {
  if (options.task === 'assemble') {
    const { runResolvedSangerSession } = await import('../sanger-trace-viewer/resolved-run.js');
    return runResolvedSangerSession(input, options, context);
  }
  const settings = {
    ...options,
    siteMode: "variants",
    ploidy: options.ploidy ?? 2,
    autoTrim: options.trimMethod !== "manual",
    clipStart: Number(options.clipStart) > 1 ? options.clipStart : 0,
  };
  let results = [],
    preparationWarnings = [];
  if (typeof input === "string") {
    // Apply the established per-read clips, edits and orientation before analysis.
    const collection = prepareSangerAlleleCollection(input, options);
    preparationWarnings = collection.warnings;
    const traces = collection.traces.map(prepared => JSON.parse(makeSangerTraceJson(prepared)));
    input = {
      format: "sms3-sanger-trace-session-v1",
      traces,
      reference: collection.reference,
    };
    settings.trimMode = 'none';
    settings.autoTrim = false;
    settings.clipStart = 0;
    settings.clipEnd = 0;
  }
  results = [await genotypeSangerTraces(input, settings, context)];
  const warnings = [
      ...preparationWarnings,
      ...results.flatMap((result) => result.warnings),
    ],
    rows = results.flatMap((result) => result.rows);
  if (!results.length)
    warnings.push("No assembled contig was long enough for allele analysis.");
  let output, streams, visual, mimeType, filename;
  if (options.outputFormat === "genotypes-tsv") {
    output = [
      sangerGenotypeColumns.map((column) => column.label).join("\t"),
      ...rows.map((row) =>
        sangerGenotypeColumns
          .map((column) =>
            String(row[column.id] ?? "").replace(/[\t\r\n]/g, " "),
          )
          .join("\t"),
      ),
    ].join("\n");
    if (!rows.length)
      warnings.push(
        "No supported variant genotypes were found. Review the trace warnings or use Sanger Genotyper with specified sites.",
      );
    mimeType = "text/tab-separated-values";
    filename = "sanger-genotypes.tsv";
    streams = {
      genotypes: makeTableStream(
        sangerGenotypeColumns,
        rows,
        "sanger-genotypes",
      ),
    };
  } else {
    output = await sangerCandidateOutput(results, options.outputFormat);
    if (options.outputFormat === "candidate-fasta") {
      mimeType = "text/x-fasta";
      filename = "sanger-candidates.fasta";
      streams = { candidateFasta: makeTextStream(output, mimeType) };
    } else {
      mimeType = "image/svg+xml";
      filename = "sanger-candidate-alignment.svg";
      streams = { candidateAlignmentSvg: makeTextStream(output, mimeType) };
      visual = { svg: output };
    }
    if (
      !results.some((result) =>
        result.reads.some((read) => read.resolution?.components.length),
      )
    ) {
      warnings.push("No supported candidate sequences were reconstructed.");
      if (options.outputFormat === "candidate-fasta") {
        output =
          "No supported candidate sequences were reconstructed.\n\n" +
          warnings.join("\n");
        mimeType = "text/plain";
        filename = "sanger-candidates-report.txt";
        streams = { report: makeTextStream(output, mimeType) };
      }
    }
  }
  return makeToolResult({
    output,
    sequenceSearch: mimeType === "text/plain" ? false : undefined,
    download: { filename, mimeType },
    streams,
    visual,
    warnings,
    recordsProcessed: results.reduce((n, result) => n + result.reads.length, 0),
  });
}
