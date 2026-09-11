import { plateColumns } from "../../core/plate-layout.js";
export const plateLayoutMetadata = {
  id: "plate-layout-planner", name: "Plate Layout Planner", category: "Viewers & Figures",
  tags: ["table", "CSV", "TSV", "Excel", "map"],
  summary: "Assign samples, replicates, and controls to editable 96- or 384-well plate maps.",
  whenToUse: "Use this to plan and review sample placement across plates, reserve wells, and export a map and assignment table for your assay.",
  inputType: "CSV, TSV, Excel sample table, or saved plate layout", outputType: "Editable plate map, well-assignment table",
  fileInput: { dropLabel: "Drop CSV, TSV, Excel, or saved plate layouts here", accept: ".csv,.tsv,.tab,.txt,.xlsx,.json", description: "CSV, TSV, Excel (.xlsx), or a saved SMS3 plate layout (.sms3.json)." },
  inputTable: {
    label: "Sample table format",
    requiredColumns: ["sample"], maxCharacters: 1_000_000,
    description: "Paste CSV or tab-separated cells copied from a spreadsheet, or choose a CSV, TSV, or Excel (.xlsx) file. Excel imports the first non-empty worksheet. One row describes a sample or control; only sample is required. Choose file also reopens saved SMS3 plate layouts (.sms3.json). The preview shows input rows; Run expands replicates into wells.",
    columns: [
      { name: "sample", description: "Required name. Use a separate row for each distinct biological sample or condition." },
      { name: "group", description: "Optional treatment or cohort label. Groups are recorded, not automatically balanced across plates." },
      { name: "role", description: "sample (default), control (an assay check), standard (a reference of known value), or blank (background measurement). These labels do not calculate concentrations or subtract background." },
      { name: "replicates", description: "Number of wells for this row. Blank uses Replicates per sample. Repeating a row into wells does not create independent biological samples." },
      { name: "plate", description: "Plate number for fixed wells, starting at 1. Blank means plate 1 when well is set. Leave both plate and well blank for automatic placement." },
      { name: "well", description: "One fixed well per replicate, for example A1,A2 for two replicates. In CSV, quote this cell as \"A1,A2\". Controls and standards are not repeated on every plate automatically; add rows for each plate that needs them." },
      { name: "notes", description: "Optional notes. Additional columns are also preserved as metadata." }
    ]
  },
  runInWorker: true, workerModule: "../tools/plate-layout-planner/run.js", workerExport: "runPlateLayout",
  workflow: { inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }], outputs: [
    { id: "primary", kind: "text", mediaType: "text/plain" },
    { id: "table", kind: "table", schema: "plate-assignments", columns: plateColumns },
    { id: "document", kind: "text", mediaType: "application/json", label: "Plate layout" },
    { id: "warnings", kind: "warnings" }
  ] },
  options: [
    { type: "group", label: "Plate layout", options: [
      { id: "title", type: "text", label: "Layout title", defaultValue: "Plate layout" },
      { id: "plateSize", type: "radio", label: "Plate size", defaultValue: "96", choices: [{ value: "96", label: "96 wells" }, { value: "384", label: "384 wells" }] },
      { id: "maxPlates", type: "number", label: "Maximum plates", defaultValue: 20, min: 1, max: 20, step: 1,
        help: "Allocation stops if the requested wells need more plates. Choose a lower value when the plan must fit within a fixed plate count." },
      { id: "replicates", type: "number", label: "Replicates per sample", defaultValue: 3, min: 1, max: 384, step: 1,
        help: "Number of repeated wells for each input row when its replicates cell is blank. Three wells of the same sample are technical repeats, not three independent biological samples. Enter separate rows for distinct biological samples. Each repeat gets its own assignment ID." },
      { id: "fillOrder", type: "select", label: "Fill order", defaultValue: "row", choices: [{ value: "row", label: "By row" }, { value: "column", label: "By column" }, { value: "random", label: "Randomized" }],
        help: "Rows fill A1, A2, …; columns fill A1, B1, …. Randomization shuffles available wells across all required plates. Fixed and reserved wells stay in place. Randomization does not balance experimental groups or guarantee separation of replicates." },
      { id: "replicateOrder", type: "select", label: "Replicate order", defaultValue: "together", choices: [{ value: "together", label: "Sample by sample" }, { value: "interleaved", label: "Replicate by replicate" }], visibleWhen: { option: "fillOrder", value: ["row", "column"] },
        help: "Sample by sample places all replicates of a sample before the next sample. Replicate by replicate places the first replicate of every sample, then the second, and so on. Reserved wells and plate boundaries can separate neighbors." },
      { id: "seed", type: "text", label: "Random seed", defaultValue: "", visibleWhen: { option: "fillOrder", value: "random" },
        help: "Leave blank for a new random layout. The generated seed is shown and saved with the layout. Reuse it with the same input and settings to reproduce the initial allocation." }
    ] },
    { type: "group", label: "Reserved wells", options: [
      { id: "reservedWells", type: "text", label: "Reserve on every plate", defaultValue: "", help: "Enter wells separated by commas, such as A1, H12, or rectangular ranges such as B2:C4. Reserved wells cannot receive samples, including fixed assignments." },
      { id: "excludeEdges", type: "checkbox", label: "Reserve outer wells", defaultValue: false, help: "Reserves the first and last row and column on every plate, leaving 60 wells (96-well plate) or 308 wells (384-well plate). Remove fixed assignments from those wells first. Edge handling depends on the assay; this option excludes positions and does not correct evaporation or temperature effects." }
    ] },
    { type: "group", label: "Planning guidance", collapsible: true, collapsed: true, options: [
      { id: "planningNote", type: "note", text: "This tool assigns well positions. Choose controls, standards, replicate counts, and edge handling for your assay. Check every plate: controls are not copied automatically, and randomization does not guarantee balanced groups or separated replicates. The example illustrates the input format; it is not a validated assay protocol." }
    ] },
    { type: "group", label: "Output", options: [
      { id: "outputFormat", type: "radio", label: "Output format", defaultValue: "plate-map", choices: [{ value: "plate-map", label: "Editable plate map" }, { value: "table", label: "Well-assignment table" }],
        help: "The map supports manual edits, Undo/Redo, browser recovery, and current-layout exports. The table includes assigned, empty, and reserved wells. Saved layouts reopen through Choose file." }
    ] },
    { type: "group", label: "Limits", collapsible: true, collapsed: true, options: [
      { id: "plateLayoutLimitNote", type: "note", text: "Each run supports at most 20 plates, 2,000 sample rows, 7,680 assignments, 1 million input characters, and 8 MB of expanded assignment data. The editor displays one plate at a time." }
    ] },
    { id: "planningReference", type: "note", text: "References:\n\nPlate use and positional effects: Assay Guidance Manual, Microplate Selection and Recommended Practices in High-throughput Screening and Quantitative Biology." }
  ]
};
