const TABLE_COLUMNS = [
  { id: "record", label: "Record", type: "string" },
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
  inputType: "DNA/RNA sequence",
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
    {
      id: "windowMode",
      type: "radio",
      label: "Window settings",
      defaultValue: "auto",
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
      defaultValue: 100,
      min: 1,
      max: 1000000,
      step: 1,
      visibleWhen: { option: "windowMode", value: "custom" }
    },
    {
      id: "stepSize",
      type: "number",
      label: "Step size",
      defaultValue: 25,
      min: 1,
      max: 1000000,
      step: 1,
      visibleWhen: { option: "windowMode", value: "custom" }
    },
    {
      id: "metric",
      type: "radio",
      label: "Metric",
      defaultValue: "gc_percent",
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
      defaultValue: "auto",
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
      defaultValue: true,
      visibleWhen: { option: "outputFormat", value: "plot" }
    },
    {
      id: "pointMarkers",
      type: "radio",
      label: "Point markers",
      defaultValue: "auto",
      visibleWhen: { option: "outputFormat", value: "plot" },
      choices: [
        { value: "auto", label: "Auto" },
        { value: "show", label: "Show" },
        { value: "hide", label: "Hide" }
      ],
      help: "Auto hides markers on dense line plots but keeps them for sparse series and single-window records."
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "plot",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Table" },
        { value: "plot", label: "Base composition plot" }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Percent metrics use A+C+G+T+U as the denominator. Skew metrics return n/a when their denominator is zero."
    }
  ]
};

export const baseCompositionPlotTableColumns = TABLE_COLUMNS;
