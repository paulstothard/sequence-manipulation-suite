import {
  genotypeSangerTraces,
  sangerGenotypeColumns,
  assessSangerGenotypeSignal,
} from "../../core/sanger-genotype.js";
import { sangerCandidateOutput } from "../../core/sanger-genotype-output.js";
import {
  prepareSangerTraceSession,
  prepareSangerTraceCollection,
  prepareSangerTrace,
  parseSangerTraceInput,
  calculateMottTrimRange,
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
    const collection = prepareSangerTraceCollection(input, {
      ...options,
      trimMethod: "manual",
    });
    preparationWarnings = collection.warnings;
    const traces = collection.traces.map((prepared) => {
      let trace = JSON.parse(makeSangerTraceJson(prepared));
      if (settings.autoTrim) {
        const record = parseSangerTraceInput(JSON.stringify(trace));
        const evidence = assessSangerGenotypeSignal(record);
        const trim = calculateMottTrimRange(
          evidence.map((item, i) => ({
            quality: item.usable
              ? Math.max(20, record.baseCalls[i].quality ?? 20)
              : 0,
          })),
          { errorLimit: 0.05, minimumBases: 40 },
        );
        const start = prepared.options.clipStart > 1 ? 1 : trim.start;
        const end =
          prepared.options.clipEnd > 0 ? record.baseCalls.length : trim.end;
        trace = JSON.parse(
          makeSangerTraceJson(
            prepareSangerTrace(JSON.stringify(trace), {
              clipStart: start,
              clipEnd: end,
            }),
          ),
        );
      }
      return trace;
    });
    input = {
      format: "sms3-sanger-trace-session-v1",
      traces,
      reference: collection.reference,
    };
    settings.autoTrim = false;
    settings.clipStart = 0;
    settings.clipEnd = 0;
  }
  if (options.task === "assemble") {
    // Assembly defines contig references. Alternatives from the same trace share
    // evidence and retain the source trace identity in genotype/candidate outputs.
    const session = await prepareSangerTraceSession(
      JSON.stringify(input),
      {
        ...options,
        trimMethod: "manual",
        clipStart: 1,
        clipEnd: 0,
        traceSettings: "",
        reverseComplement: false,
        outputFormat: "consensus-fasta",
      },
      context,
    );
    for (const contig of session.assembly.contigs) {
      const traces = session.collection.traces.filter((trace) =>
        contig.reads.some((read) => read.title === trace.view.record),
      );
      if (contig.sequence.length < 40 || !traces.length) continue;
      results.push(
        await genotypeSangerTraces(
          {
            reference: `>${contig.title}\n${contig.sequence}`,
            traces: traces.map((trace) => ({
              sample: trace.view.record,
              trace: JSON.parse(makeSangerTraceJson(trace)),
            })),
          },
          {
            ...settings,
            referenceStart: 1,
            autoTrim: false,
            clipStart: 0,
            clipEnd: 0,
          },
          context,
        ),
      );
    }
  } else {
    results = [await genotypeSangerTraces(input, settings, context)];
  }
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
