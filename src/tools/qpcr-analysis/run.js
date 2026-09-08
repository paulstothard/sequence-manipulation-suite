import { analyzeQpcr } from "../../core/qpcr-analysis.js";
import { renderQpcrPlot } from "../../core/qpcr-plot.js";
import { qpcrGroupColumns, qpcrSampleColumns, qpcrTechnicalColumns, qpcrReactionColumns } from "../../core/qpcr-columns.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export async function runQpcrAnalysis(input, options = {}, context = {}) {
  const a = await analyzeQpcr(input, options, context), s = a.settings, streams = {};
  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  await context.yieldIfNeeded?.(); context.throwIfCancelled?.();
  let output, visual, extension, mimeType;
  if (s.outputFormat === "plot") {
    output = renderQpcrPlot(a); extension = "svg"; mimeType = "image/svg+xml";
    visual = { svg: output, pngDownload: true }; streams.plot = makeTextStream(output, mimeType);
  } else if (s.outputFormat === "report") {
    extension = "txt"; mimeType = "text/plain";
    output = ["qPCR Data Analysis", "", `Method: ${s.method === "ddcq" ? "ΔΔCq; 100% efficiency assumed; technical Cq averaged" : "Efficiency-corrected; arithmetic mean of technical reaction quantities"}`,
      `Reference genes (geometric mean): ${s.referenceGenes.join(", ")}`, `Calibrator condition: ${s.calibrator} (geometric mean of biological normalized quantities)`,
      `Missing wells: ${s.missingPolicy === "strict" ? "Require all non-excluded wells detected" : "Use detected wells"}`, `Minimum detected wells per sample/assay: ${s.minReplicates}`, `Technical Cq SD warning threshold: ${s.maxCqSd} (flag only)`,
      `Reactions: ${a.reactions.length}; biological samples: ${a.biologicalSamples}; target genes: ${a.targets.length}`, `Negative controls: ${a.reactions.filter(r => r.role !== "sample").length}; explicitly excluded reactions: ${a.reactions.filter(r => r.excluded).length}`,
      `Comparisons: ${s.comparisons === "welch" ? `Two-sided Welch tests of independent biological samples on log2 normalized quantities; ${a.comparisonsTested} estimable contrasts. BH correction across all estimable target/condition contrasts.` : "Descriptive only"}`, "",
      "Group geometric means relative to calibrator", ...a.groupRows.map(r => `${r.target} / ${r.condition}: n=${r.n}; unavailable=${r.excluded_samples}; fold=${r.fold_change ?? "NA"}; log2=${r.log2_fold_change ?? "NA"}; 95% CI (log2)=${r.ci_low_log2 ?? "NA"} to ${r.ci_high_log2 ?? "NA"}; p=${r.p_value ?? "NA"}; BH=${r.p_adjusted ?? "NA"}`), "",
      "Interpretation", "Repeated wells are technical replicates and do not increase biological n. Group means and calibration are calculated on the log2 scale. Undetermined wells are never assigned an arbitrary cycle number. No outliers are removed automatically.",
      "Welch comparison intervals include variance from both biological groups. They assume independent samples and approximately normal log2 normalized quantities. They do not include uncertainty in assay efficiency, Cq thresholds or reference-gene selection. Paired or repeated-measures experiments need an appropriate model. A control self-comparison has no confidence interval or p value.",
      "Use validated reference genes and assay efficiencies. This tool does not estimate efficiencies, assess raw amplification/melt curves, or calibrate measurements across runs.", "", "Review notes", ...(a.warnings.length ? a.warnings : ["No automatic review flags. This does not establish assay validity."]), "",
      "References:", "Bustin et al. (2025). MIQE 2.0. https://doi.org/10.1093/clinchem/hvaf043", "Pfaffl (2001). Relative quantification with efficiency correction. https://doi.org/10.1093/nar/29.9.e45", "Hellemans et al. (2007). Multiple-reference normalization. https://doi.org/10.1186/gb-2007-8-2-r19", "Livak and Schmittgen (2001). ΔΔCq method. https://doi.org/10.1006/meth.2001.1262", ""].join("\n");
    streams.report = makeTextStream(output, mimeType);
  } else {
    extension = "tsv"; mimeType = "text/tab-separated-values";
    const [columns, sourceRows] = ({ groups: [qpcrGroupColumns, a.groupRows], samples: [qpcrSampleColumns, a.sampleRows], technical: [qpcrTechnicalColumns, a.technical], reactions: [qpcrReactionColumns, a.reactions] })[s.outputFormat];
    const provenance = { method: s.method, calibrator: s.calibrator, reference_genes: s.referenceGenes.join(", "), missing_policy: s.missingPolicy };
    const rows = [];
    for (let i = 0; i < sourceRows.length; i++) {
      if (i % 256 === 0) { await context.yieldIfNeeded?.(); context.throwIfCancelled?.(); }
      rows.push({ ...sourceRows[i], ...provenance });
    }
    output = exportDelimitedTable(columns, rows);
    streams[s.outputFormat] = makeTableStream(columns, rows, `qpcr-${s.outputFormat}`);
  }
  context.throwIfCancelled?.(); context.reportProgress?.({ phase: "complete", progress: 1 });
  return makeToolResult({ output, visual, streams, warnings: a.warnings, recordsProcessed: a.reactions.length,
    optionsUsed: { ...s, biologicalSamples: a.biologicalSamples, comparisonsTested: a.comparisonsTested },
    download: { filename: `qpcr-${s.outputFormat}.${extension}`, mimeType: `${mimeType};charset=utf-8` } });
}
