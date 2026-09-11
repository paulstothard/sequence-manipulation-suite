import { qpcrGroupColumns, qpcrSampleColumns, qpcrTechnicalColumns, qpcrReactionColumns } from "../../core/qpcr-columns.js";
export const qpcrAnalysisMetadata = {
  id: "qpcr-analysis", name: "qPCR Data Analysis", category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Normalize Cq measurements and compare relative expression across biological samples.",
  whenToUse: "Use this to combine technical qPCR replicates, normalize against reference genes, and compare expression with a control condition using plots and auditable tables.",
  inputType: "CSV, TSV, or Excel Cq table", outputType: "Expression plot, comparison and replicate tables, or report",
  fileInput: { accept: ".csv,.tsv,.tab,.txt,.xlsx", dropLabel: "Drop CSV, TSV, or Excel Cq tables here", description: "One reaction per row, with sample, target, condition and cq columns." },
  inputTable: {
    label: "Cq table format",
    requiredColumns: ["sample", "target", "condition"], maxCharacters: 5_000_000,
    description: "Paste CSV or tab-separated spreadsheet cells, or choose a CSV, TSV, or Excel (.xlsx) file. Excel uses the first non-empty worksheet. One row is one reaction; repeated sample/target rows are technical replicates. Each independent biological sample needs its own sample ID. Use the column names below; cq may also be named ct or cp. The example contains simulated measurements.",
    columns: [
      { name: "sample", description: "Required biological sample ID, unique to one condition. Repeated wells of the same sample share this ID; they do not count as independent samples." },
      { name: "target", description: "Required assay/gene name, including reference genes. Names are case-sensitive." },
      { name: "condition", description: "Required group label for biological samples, such as Control or Treated. May be blank for negative controls." },
      { name: "cq", description: "Cq, Ct or Cp value greater than 0 and no more than 100. Empty, NA, N/A, NaN, undetermined, undetected and no Cq/Ct/Cp are missing, never zero or cycle 40. Use decimal points." },
      { name: "efficiency", description: "Assay amplification efficiency as a percentage: 95 means E = 1.95, not 0.95. Required for each assay in efficiency-corrected mode. Enter it once or repeat the same value; blank cells inherit the assay value. Use efficiencies validated for these samples." },
      { name: "replicate", description: "Optional technical replicate ID, unique within each sample/target. Each row is counted as one well even when this column is absent." },
      { name: "role", description: "sample (default), ntc (no-template control) or nort (no-reverse-transcriptase control). Negative controls are excluded from expression calculations and flagged if a Cq is detected." },
      { name: "exclude", description: "Optional true/false, yes/no or 1/0. Excluded wells stay in the Reaction audit table but do not enter calculations. Exclude only after reviewing assay data; the tool does not choose outliers." },
      { name: "run", description: "Optional run ID. All biological measurements of each target must come from one run; different assays may use different runs. Inter-run calibration is not performed." },
      { name: "well", description: "Optional well label. Duplicate run/well/target entries are rejected. Other columns are not interpreted." }
    ]
  },
  runInWorker: true, workerModule: "../tools/qpcr-analysis/run.js", workerExport: "runQpcrAnalysis",
  workflow: { inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }, { id: "table", kind: "table" }], outputs: [
    { id: "primary", kind: "text", mediaType: "text/plain" }, { id: "plot", kind: "text", mediaType: "image/svg+xml", label: "Expression plot" },
    { id: "groups", kind: "table", schema: "qpcr-groups", columns: qpcrGroupColumns, label: "Group comparison table" },
    { id: "samples", kind: "table", schema: "qpcr-samples", columns: qpcrSampleColumns, label: "Sample expression table" },
    { id: "technical", kind: "table", schema: "qpcr-technical", columns: qpcrTechnicalColumns, label: "Technical replicate table" },
    { id: "reactions", kind: "table", schema: "qpcr-reactions", columns: qpcrReactionColumns, label: "Reaction audit table" },
    { id: "report", kind: "text", mediaType: "text/plain" }, { id: "warnings", kind: "warnings" }
  ] },
  options: [
    { type: "group", label: "Normalization", options: [
      { id: "method", type: "radio", label: "Quantification method", defaultValue: "efficiency", choices: [{ value: "efficiency", label: "Efficiency-corrected" }, { value: "ddcq", label: "ΔΔCq (100% efficiency)" }], help: "Efficiency-corrected uses the efficiency (%) column: each well becomes E⁻ᶜᵠ, then technical quantities are averaged. ΔΔCq assumes doubling for every assay and averages technical Cq before conversion; input efficiencies are ignored. Both normalize to the geometric mean of your selected reference genes. Choose ΔΔCq only when its efficiency assumption is justified." },
      { id: "referenceGenes", type: "text", label: "Reference genes", defaultValue: "RPLP0,HPRT1", help: "Comma-separated target names, exactly as entered in the table. Use reference genes validated as stable for your experiment. Every selected reference must have usable measurements in a sample for that sample to be normalized. Reference genes are not included in target comparisons." },
      { id: "calibrator", type: "text", label: "Calibrator condition", defaultValue: "Control", help: "Condition used as the baseline, matching the table exactly. Its geometric mean normalized expression is set to 1 for each target. Each biological sample has equal weight, regardless of its number of wells." }
    ] },
    { type: "group", label: "Replicates and missing values", collapsible: true, collapsed: false, options: [
      { id: "missingPolicy", type: "radio", label: "Undetermined technical wells", defaultValue: "strict", choices: [{ value: "strict", label: "Require every well detected" }, { value: "available", label: "Use detected wells" }], help: "Applies after explicit exclusions. The default makes a sample/assay unavailable if any remaining well is undetermined. Using only detected wells can bias estimates near the detection limit and produces a warning. Neither policy invents a Cq for missing wells." },
      { id: "minReplicates", type: "number", label: "Minimum detected wells per sample/assay", defaultValue: 1, min: 1, max: 12, step: 1, help: "A sample/assay with fewer detected non-excluded wells is unavailable. This is a technical-replicate requirement, not the biological sample size for statistics." },
      { id: "maxCqSd", type: "number", label: "Technical Cq SD warning threshold", defaultValue: 0.5, min: 0.01, max: 10, step: 0.1, help: "Flag technical replicates whose sample standard deviation exceeds this value. The threshold is a review aid, not an assay pass/fail rule. Flagged wells remain included; inspect the amplification data before excluding any." }
    ] },
    { type: "group", label: "Biological comparisons", options: [
      { id: "comparisons", type: "radio", label: "Comparison method", defaultValue: "welch", choices: [{ value: "welch", label: "Independent groups (Welch)" }, { value: "none", label: "Descriptive only" }], help: "Welch compares log2 normalized quantities against the calibrator using independent biological samples, not wells. It reports two-sided P values, BH adjustment across all estimable target/condition comparisons, and 95% confidence intervals including variance from both groups. At least two usable biological samples in each group and measurable variance are required. Assumes approximately normal log2 quantities. For paired, matched or repeated-measures designs, choose Descriptive only and export sample results for an appropriate model. Efficiencies are treated as fixed; their uncertainty is not included." }
    ] },
    { type: "group", label: "Output", options: [
      { id: "outputFormat", type: "select", label: "Output format", defaultValue: "plot", choices: [{ value: "plot", label: "Expression plot" }, { value: "groups", label: "Group comparison table" }, { value: "samples", label: "Sample expression table" }, { value: "technical", label: "Technical replicate table" }, { value: "reactions", label: "Reaction audit table" }, { value: "report", label: "Analysis report" }], help: "Plots show one point per usable biological sample, group geometric means and available comparison intervals. Conditions follow input order, with the calibrator first. Tables expose missing results, technical replicate counts and input reactions. The report records calculation settings, group results and references." },
      { id: "plotScale", type: "radio", label: "Expression scale", defaultValue: "log2", visibleWhen: { option: "outputFormat", value: "plot" }, choices: [{ value: "log2", label: "Log2 fold change" }, { value: "fold", label: "Relative expression" }], help: "Log2 values of 1 and −1 mean a twofold increase and decrease. Relative expression shows these as 2 and 0.5. The calibrator baseline is 0 on log2 scale or 1 on relative-expression scale." },
      { id: "plotTarget", type: "text", label: "Plot target", defaultValue: "", visibleWhen: { option: "outputFormat", value: "plot" }, help: "Leave blank to plot all target genes, or enter one exact target name. This changes only the figure; all targets remain in the analysis and multiple-testing correction." }
    ] },
    { type: "group", label: "Limits", collapsible: true, collapsed: true, options: [
      { id: "maxReactions", type: "number", label: "Maximum reactions", defaultValue: 25000, min: 1, max: 25000, step: 1, help: "Up to 5 million input characters, 32 columns, 500,000 cells, 2,000 biological samples, 64 assays, 24 conditions and 50,000 sample/target results. Figures allow 1,000 points, 12 targets, 12 conditions and 72 groups; larger figures stop with guidance rather than hiding data." }
    ] },
    { id: "methodNote", type: "note", text: "Relative expression from Cq tables. Use validated assay efficiencies and reference genes. Raw amplification curves, absolute quantification and inter-run calibration are not analyzed here." },
    { id: "citations", type: "note", text: "References:\n\nAnalysis and reporting (MIQE 2.0): Bustin et al. 2025.\n\nNormalization: Pfaffl 2001; Hellemans et al. 2007.\n\nΔΔCq: Livak and Schmittgen 2001." }
  ]
};
