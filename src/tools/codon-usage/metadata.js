import { FASTA_RECORD_SOURCE_LIMITS as sourceLimits } from "../../core/fasta-record-source.js";
import { CODON_USAGE_DEFAULTS, CODON_USAGE_LIMITS as limits } from "../../core/codon-usage-options.js";
import { geneticCodes } from "../../core/genetic-code.js";
import { codonUsageTableColumns } from "./run.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const codonUsageMetadata = {
  id: "codon-usage",
  name: "Codon Usage",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "FASTA", "codon", "statistics", "translation"],
  summary:
    "Calculate observed codon usage for coding DNA/RNA sequences using complete codons from the first cleaned base.",
  whenToUse: "Compare observed codon counts and synonymous codon preferences across coding sequences under a selected genetic code.",
  inputType: "Coding DNA/RNA sequence or FASTA records",
  outputType: "Codon usage table, plot, or summary report",
  fileInput: {
    dropLabel: "Drop one plain-text coding DNA/RNA sequence or FASTA records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
  },
  runInWorker: true,
  workerModule: "../tools/codon-usage/run.js",
  workerExport: "runCodonUsageWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" },
      { id: "orfRecords", kind: "orf-records", schema: "orf-finder" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "codon-usage", columns: codonUsageTableColumns },
      { id: "plot", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }),
    {
      id: "geneticCode",
      type: "radio",
      label: "Genetic code",
      help: "Selects the codon table used to assign codons to amino acids and identify stop codons.",
      defaultValue: CODON_USAGE_DEFAULTS.geneticCode,
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
    },
    {
      id: "plotValue",
      type: "radio",
      label: "Plot value",
      help: "Choose whether bar height shows raw counts, codons per 1000 counted codons, or fraction within synonymous codons for each amino acid. Each stacked segment represents one record; per-1000 and fraction values are normalized separately for each record.",
      defaultValue: CODON_USAGE_DEFAULTS.plotValue,
      choices: [
        { value: "count", label: "Count" },
        { value: "per_1000", label: "Per 1000" },
        { value: "fraction", label: "Fraction" }
      ],
      visibleWhen: { option: "outputFormat", value: "plot" }
    },
    {
      id: "showLegend",
      type: "checkbox",
      label: "Show plot legend",
      defaultValue: CODON_USAGE_DEFAULTS.showLegend,
      visibleWhen: { option: "outputFormat", value: "plot" }
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: CODON_USAGE_DEFAULTS.outputFormat,
      choices: [
        { showcase: false, value: "table", label: "Codon usage table" },
        { showcase: "codon-usage-plot", value: "plot", label: "Codon usage plot" },
        { showcase: false, value: "report", label: "Summary report" }
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
        text: `Runs accept up to ${limits.maxRecords.toLocaleString("en-US")} coding records and ${sourceLimits.maxAcceptedBases.toLocaleString("en-US")} non-whitespace sequence characters. Plots accept at most ${limits.maxPlotRecords} input records; use the table or report for larger collections. Materialized output is limited to ${limits.maxMaterializedOutputCharacters.toLocaleString("en-US")} characters. Source files are limited to ${sourceLimits.maxSourceBytes / 1048576} MiB and decoded text to ${sourceLimits.maxDecodedBytes / 1048576} MiB; shared header and index limits also apply.`
      }]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: `Each FASTA record is an independent coding sequence. Triplets start at the first base after removing whitespace, gaps and unsupported characters; U is counted as T. Stop codons are counted, ambiguous codons are skipped, and trailing bases outside complete codons are ignored. ${STREAMED_FASTA_SCAN_NOTE}`
    }
  ]
};
