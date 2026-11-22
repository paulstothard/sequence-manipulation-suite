import { FASTA_RECORD_SOURCE_LIMITS as sourceLimits } from "../../core/fasta-record-source.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";
import { BASE_COMPOSITION_DEFAULTS, BASE_COMPOSITION_LIMITS as limits } from "../../core/base-composition-options.js";

const axisLimits = makeAxisLimitsGroup();
axisLimits.visibleWhen = { option: "outputFormat", value: "plot" };
axisLimits.help = "Optional display limits. X uses the selected sequence-position or relative-percent axis; Y uses the selected metric. Leave blank for automatic scaling.";
axisLimits.options = axisLimits.options.map(option => ({ ...option, defaultValue: BASE_COMPOSITION_DEFAULTS[option.id] }));

const TABLE_COLUMNS = [
  { id: "record", label: "Record", type: "string" },
  { id: "record_index", label: "Record number", type: "number" },
  { id: "window_start", label: "Window start", type: "number" },
  { id: "window_end", label: "Window end", type: "number" },
  { id: "position", label: "Position", type: "number" },
  { id: "window_size", label: "Window size", type: "number" },
  { id: "a_count", label: "A count", type: "number" },
  { id: "c_count", label: "C count", type: "number" },
  { id: "g_count", label: "G count", type: "number" },
  { id: "t_u_count", label: "T/U count", type: "number" },
  { id: "ambiguous_count", label: "Ambiguous count", type: "number" },
  { id: "gc_percent", label: "GC percent", type: "number" },
  { id: "at_percent", label: "AT percent", type: "number" },
  { id: "gc_skew", label: "GC skew", type: "number" },
  { id: "at_skew", label: "AT skew", type: "number" },
  { id: "ambiguous_percent", label: "Ambiguous percent", type: "number" },
  { id: "metric_value", label: "Metric value", type: "number" }
];

export const baseCompositionPlotMetadata = {
  id: "base-composition-plot",
  name: "Base Composition Plot",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "GC", "composition", "plot"],
  summary: "Plot sliding-window DNA/RNA base composition, GC/AT content, and skew metrics.",
  whenToUse: "Compare regional GC/AT content, skew, or ambiguity across DNA/RNA sequences using sliding windows.",
  inputType: "DNA/RNA sequence, FASTA/FASTA.GZ, or indexed FASTA",
  outputType: "Base composition plot, report, table",
  runInWorker: true,
  workerModule: "../tools/base-composition-plot/run.js",
  workerExport: "runBaseCompositionPlotWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "base-composition-plot", columns: TABLE_COLUMNS },
      { id: "plot", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }),
    {
      id: "windowMode",
      type: "radio",
      label: "Window settings",
      defaultValue: BASE_COMPOSITION_DEFAULTS.windowMode,
      choices: [
        { value: "auto", label: "Auto window and step" },
        { value: "custom", label: "Custom window and step" }
      ],
      help: "Auto keeps all records on one plot by choosing one shared window size and step size from the cleaned record lengths. When records differ greatly in length, the shared window may be too broad for shorter records or too detailed for longer records; use Custom when one record needs a specific window."
    },
    {
      id: "windowSize",
      type: "number",
      label: "Window size",
      defaultValue: BASE_COMPOSITION_DEFAULTS.windowSize,
      min: 1,
      max: 1000000,
      step: 1,
      help: "Number of cleaned bases per window. A shorter record uses its full length.",
      visibleWhen: { option: "windowMode", value: "custom" }
    },
    {
      id: "stepSize",
      type: "number",
      label: "Step size",
      defaultValue: BASE_COMPOSITION_DEFAULTS.stepSize,
      min: 1,
      max: 1000000,
      step: 1,
      help: "Distance between window starts in cleaned bases. Incomplete trailing windows are omitted.",
      visibleWhen: { option: "windowMode", value: "custom" }
    },
    {
      id: "metric",
      type: "radio",
      label: "Metric",
      defaultValue: BASE_COMPOSITION_DEFAULTS.metric,
      choices: [
        { value: "gc_percent", label: "GC percent" },
        { value: "at_percent", label: "AT percent" },
        { value: "gc_skew", label: "GC skew" },
        { value: "at_skew", label: "AT skew" },
        { value: "ambiguous_percent", label: "Ambiguous percent" }
      ]
    },
    {
      id: "positionAxis",
      type: "radio",
      label: "Position axis",
      defaultValue: BASE_COMPOSITION_DEFAULTS.positionAxis,
      visibleWhen: { option: "outputFormat", value: "plot" },
      choices: [
        { value: "auto", label: "Auto" },
        { value: "absolute", label: "Sequence position" },
        { value: "relative", label: "Relative position (%)" }
      ],
      help: "Auto uses sequence positions unless record lengths differ greatly, then uses relative position so shorter records do not collapse against the left edge."
    },
    {
      id: "showLegend",
      type: "checkbox",
      label: "Show plot legend",
      defaultValue: BASE_COMPOSITION_DEFAULTS.showLegend,
      visibleWhen: { option: "outputFormat", value: "plot" }
    },
    {
      id: "pointMarkers",
      type: "radio",
      label: "Point markers",
      defaultValue: BASE_COMPOSITION_DEFAULTS.pointMarkers,
      visibleWhen: { option: "outputFormat", value: "plot" },
      choices: [
        { value: "auto", label: "Auto" },
        { value: "show", label: "Show" },
        { value: "hide", label: "Hide" }
      ],
      help: "Auto hides markers on dense line plots but keeps them for sparse series and single-window records."
    },
    axisLimits,
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: BASE_COMPOSITION_DEFAULTS.outputFormat,
      choices: [
        { showcase: false, value: "report", label: "Summary report" },
        { showcase: false, value: "tsv", label: "Table", resultView: { kind: "table", streamId: "table" } },
        { showcase: "base-composition-plot", value: "plot", label: "Base composition plot" }
      ]
    },
    {
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [{
        id: "streamingLimitsNote",
        type: "note",
        text: `Runs accept up to ${sourceLimits.maxAcceptedBases.toLocaleString("en-US")} accepted FASTA bases and ${sourceLimits.maxRecords.toLocaleString("en-US")} records. A run may produce at most ${limits.windowRows.toLocaleString("en-US")} windows and ${limits.outputCharacters.toLocaleString("en-US")} characters of materialized output; exceeding either ceiling rejects the run. Plots show at most ${limits.plotWindows.toLocaleString("en-US")} windows. Increase the step size or select fewer records when a limit is reached.`
      }]
    },
    {
      id: "methodNote",
      type: "note",
      text: `GC/AT percentages use A+C+G+T+U; ambiguity percentage uses all accepted symbols. T and U share a count. GC skew is (G−C)/(G+C); AT skew is (A−T−U)/(A+T+U). Zero denominators give n/a. Positions are 1-based in the cleaned sequence. ${STREAMED_FASTA_SCAN_NOTE}`
    }
  ]
};

export const baseCompositionPlotTableColumns = TABLE_COLUMNS;
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
