import { ORF_EXPLORER_PAGE_SIZE, ORF_SEQUENCE_PAGE_SIZE } from "../../core/orf-explorer.js";
import { ORF_MAP_ARROW_LIMIT } from "../../core/orf-explorer-map.js";
import { ORF_DEFAULTS } from "../../core/orf-options.js";
import { geneticCodes } from "../../core/genetic-code.js";
import {
  LARGE_TEXT_ORF_THRESHOLD,
  SVG_OVERVIEW_BASE_THRESHOLD,
  SVG_OVERVIEW_HEIGHT_THRESHOLD,
  SVG_OVERVIEW_ORF_THRESHOLD,
  orfTableColumns
} from "./run.js";

export const orfFinderMetadata = {
  id: "orf-finder",
  name: "ORF Finder",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "ORF", "genetic code", "translation"],
  summary:
    "Find open reading frames on forward and reverse-complement strands with selectable genetic codes and length filters.",
  whenToUse: "Locate candidate coding regions in DNA/RNA and export their coordinates or translations under a chosen genetic code.",
  inputType: "DNA/RNA sequence",
  showcaseOutputs: [{ id: "orf-explorer", label: "ORF explorer",
    summary: "Explore ORFs and their DNA and protein sequences in a short lambda phage fragment.",
    options: { outputFormat: "orf-explorer", nestedMode: "first-start" } }],
  outputType: "ORF explorer, report, table, FASTA, overview, or linear DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/orf-finder/run.js",
  workerExport: "runOrfFinderWorker",
  workflow: {
    requestedOutputStreamsOption: "requestedOrfOutputs",
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "explorer", outputFormat: "orf-explorer", kind: "viewer", viewerType: "orf-explorer", label: "ORF explorer" },
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      { id: "tsv", outputFormat: "tsv", kind: "text", mediaType: "text/tab-separated-values" },
      { id: "table", outputFormat: "tsv", kind: "table", schema: "orf-finder", columns: orfTableColumns },
      { id: "nucleotideFasta", outputFormat: "nucleotide-fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "proteinFasta", outputFormat: "protein-fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "overview", outputFormat: "svg-overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", outputFormat: "interactive-viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "orfRecords", outputFormat: "orf-records", kind: "orf-records", schema: "orf-finder" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "strand",
      type: "radio",
      label: "Strand",
      help: "Reverse-complement hits are reported using coordinates on the original submitted sequence.",
      defaultValue: ORF_DEFAULTS.strand,
      choices: [
        { value: "both", label: "Both strands" },
        { value: "forward", label: "Forward only" },
        { value: "reverse", label: "Reverse complement only" }
      ]
    },
    {
      id: "startMode",
      type: "radio",
      label: "ORF start",
      help: "Require start codon uses the selected code’s initiators and translates the first codon as methionine. Any codon to stop reports stop-delimited segments using ordinary codon translation.",
      defaultValue: ORF_DEFAULTS.startMode,
      choices: [
        { value: "start-codon", label: "Require start codon" },
        { value: "any-codon", label: "Any codon to stop" }
      ]
    },
    {
      id: "geneticCode",
      type: "radio",
      label: "Genetic code",
      help: "Selects the codon table used to identify start codons, stop codons, and translated amino acids.",
      defaultValue: ORF_DEFAULTS.geneticCode,
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
    },
    {
      id: "minimumAminoAcids",
      type: "number",
      label: "Minimum amino acids",
      help: "Filters ORFs by translated protein length. Terminal stop symbols are not counted as amino acids.",
      defaultValue: ORF_DEFAULTS.minimumAminoAcids,
      min: 1,
      max: 1000000
    },
    { id: "includePartial", type: "checkbox", label: "Include ORFs without terminal stop", defaultValue: ORF_DEFAULTS.includePartial, help: "Reports ORFs that reach the sequence end before a stop codon is found." },
    {
      id: "nestedMode",
      type: "radio",
      label: "Nested ORFs",
      help: "When several start codons occur before the same stop codon, choose whether to report only the first start or every possible nested ORF.",
      defaultValue: ORF_DEFAULTS.nestedMode,
      choices: [
        { value: "first-start", label: "First start codon per stop region" },
        { value: "all-starts", label: "All start codons to the next stop" }
      ]
    },
    {
      id: "sortBy",
      type: "radio",
      label: "Sort ORFs",
      help: "Changes the displayed ORF order and ORF numbering in reports, tables, FASTA, maps, and viewers. Coordinates and ORF sequences are not recalculated.",
      defaultValue: ORF_DEFAULTS.sortBy,
      choices: [
        { value: "start", label: "Start coordinate" },
        { value: "length-desc", label: "Length descending" },
        { value: "frame", label: "Strand/frame then start" },
        { value: "complete", label: "Complete ORFs first" }
      ]
    },
    { id: "includeStopInProtein", type: "checkbox", label: "Include stop symbol in protein FASTA", defaultValue: ORF_DEFAULTS.includeStopInProtein, visibleWhen: { option: "outputFormat", value: "protein-fasta" }, help: "Adds an asterisk at the end of complete translated ORFs in protein FASTA output." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: ORF_DEFAULTS.outputFormat,
      choices: [
        { value: "orf-explorer", label: "ORF explorer" },
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } },
        { value: "nucleotide-fasta", label: "Nucleotide FASTA" },
        { value: "protein-fasta", label: "Protein FASTA" },
        { value: "svg-overview", label: "ORF overview plot" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "advancedLimits", type: "group", label: "Limits", collapsible: true, collapsed: true,
      options: [
        { type: "limit-value", label: "Sequence input", value: "5,000,000 non-whitespace characters; 10,000 records", detail: "The shared FASTA reader rejects larger inputs. Each cleaned record and the selected result are held in memory." },
        { type: "limit-value", label: "FASTA source", value: "512 MiB source; 150 MiB decoded text", detail: "Header ceilings are 10,000 characters per record and 5,000,000 combined; indexed sidecars are limited to 16 MiB." },
        { type: "limit-value", label: "ORF candidates", value: "100,000 ORFs per run", detail: "Larger candidate sets are rejected before sequence materialization." },
        { type: "limit-value", label: "ORF sequences and output", value: "26,214,400 characters each", detail: "Rejects larger combined ORF nucleotide/protein sequence and record-title content or serialized result payloads; no partial result is returned." },
        { type: "limit-value", label: "ORF explorer", value: `${ORF_EXPLORER_PAGE_SIZE} table rows per page; ${ORF_MAP_ARROW_LIMIT} individual map ORFs; ${ORF_SEQUENCE_PAGE_SIZE} DNA bases per sequence page`, detail: "The map includes every matching ORF in the visible region. Dense regions count all ORFs overlapping each interval; large records retain density where more than two packed lanes per frame would be needed. Zoom reveals individual ORFs, their translations using the analysis genetic code, and both DNA strands in a fixed strip between forward and reverse ORFs. Table pagination does not limit map coverage. SVG/PNG export the current view; DNA and protein exports include full sequences within the output limit." },
        { type: "limit-value", label: "Detailed text report", value: `${LARGE_TEXT_ORF_THRESHOLD.toLocaleString("en-US")} ORFs`, detail: "Larger results switch to a summary; select Summary table to generate all found ORFs." },
        { type: "limit-value", label: "ORF overview plot", value: `${SVG_OVERVIEW_ORF_THRESHOLD.toLocaleString("en-US")} ORFs, ${SVG_OVERVIEW_BASE_THRESHOLD.toLocaleString("en-US")} bases, and ${SVG_OVERVIEW_HEIGHT_THRESHOLD.toLocaleString("en-US")} px planned height`, detail: "The plot is withheld above any bound after optimally packing the visible intervals into lanes." },
        { type: "note", text: `Above ${LARGE_TEXT_ORF_THRESHOLD.toLocaleString("en-US")} ORFs, the text report switches to a summary; select Summary table to generate all found ORFs. An overview that exceeds its ORF, base, or packed-height bound is replaced with an explanation; choose the table, first-start nested ORFs, or narrower filters to see a drawable overview.` }
      ]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is cleaned to DNA/RNA IUPAC symbols with gaps removed. Ambiguous codons translate as X and do not define starts or stops. RNA U is treated as T for ORF detection and nucleotide FASTA."
    },
    { type: "note", text: "Coordinates are 1-based and inclusive on the cleaned input, with start ≤ end on both strands. Nucleotide ORFs include the terminal stop; amino-acid lengths exclude it. Complete means a terminal stop was found. Partial ORFs omit incomplete terminal codons." },
    { type: "note", text: "Each record is scanned as a linear sequence; the circular viewer changes the display only. Splicing, frameshifts and context-dependent recoding are not modeled." },
    { type: "note", text: "References:\n\nGenetic codes and alternative initiators: NCBI Genetic Codes." }
  ]
};
