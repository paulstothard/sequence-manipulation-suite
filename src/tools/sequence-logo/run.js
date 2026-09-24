import {
  calculateSequenceLogo,
  makeSequenceLogoRows,
  makeSequenceLogoTsv,
  sequenceLogoTableColumns
} from "../../core/sequence-logo.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export async function runSequenceLogo(input, options = {}, context = {}) {
  const calculated = await calculateSequenceLogo(input, {
    ...options,
    bootstrapReplicates: options.uncertainty === "bootstrap" ? options.bootstrapReplicates : 0
  }, context);
  const tableOutput = options.outputFormat === "column-table";
  const tsv = tableOutput ? makeSequenceLogoTsv(calculated.logo) : "";
  const summary = [
    "Sequence logo",
    `Alphabet: ${calculated.logo.alphabet}`,
    `Columns: ${calculated.logo.alignmentLength}`,
    calculated.logo.sequenceCount == null ? `Source: ${calculated.logo.sourceType}` : `Sequences: ${calculated.logo.sequenceCount}`
  ].join("\n");
  return makeToolResult({
    output: tableOutput ? tsv : summary,
    download: {
      filename: tableOutput ? "sequence-logo-columns.tsv" : "sequence-logo-summary.txt",
      mimeType: tableOutput ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings: calculated.warnings,
    recordsProcessed: calculated.recordsProcessed,
    basesProcessed: calculated.symbolsProcessed,
    processedUnitLabel: calculated.logo.sourceType === "alignment" ? "alignment cell" : "position",
    streams: {
      ...(!tableOutput ? {
        sequenceLogo: {
          kind: "figure",
          figureType: "sequence-logo",
          label: "Sequence logo",
          figure: calculated.logo
        }
      } : {}),
      ...(tableOutput ? {
        table: makeTableStream(sequenceLogoTableColumns, makeSequenceLogoRows(calculated.logo), "sequence-logo-columns"),
        tsv: makeTextStream(tsv, "text/tab-separated-values")
      } : {})
    },
    visual: tableOutput ? undefined : { sequenceLogo: calculated.logo }
  });
}

export function runSequenceLogoWorker(input, options = {}, context = {}) {
  return runSequenceLogo(input, options, context);
}
