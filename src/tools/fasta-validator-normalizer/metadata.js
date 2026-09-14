import { fastaValidationTableColumns } from "../../core/fasta-validator.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const fastaValidatorNormalizerMetadata = {
  id: "fasta-validator-normalizer",
  name: "FASTA Summarizer",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "FASTA", "validation", "format conversion", "statistics"],
  summary: "Summarize FASTA records, unique titles, unique sequences, duplicate titles, duplicate sequences, and formatting issues.",
  inputType: "FASTA records",
  outputType: "Summary report, normalized FASTA, table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      {
        id: "table",
        kind: "table",
        schema: "fasta-validation",
        columns: fastaValidationTableColumns
      },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fasta-validator-normalizer/run.js",
  workerExport: "runFastaValidatorNormalizer",
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true }),
    {
      id: "checkReverseComplement",
      type: "checkbox",
      label: "Check for reverse-complement duplicates",
      defaultValue: false,
      help: "Also flags records whose sequence is the reverse complement of another FASTA record. Useful for DNA/RNA record QC."
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "report",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "fasta", label: "Normalized FASTA" },
            { value: "tsv", label: "Record table" }
          ]
        }
      ]
    },
    {
      id: "scopeNote",
      type: "note",
      text: `This tool summarizes FASTA structure and duplicates. ${STREAMED_FASTA_SCAN_NOTE}`
    },
    {
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "streamingLimitsNote",
          type: "note",
          text: "Runs accept source files up to 512 MiB, 150 MiB of decoded text, 10,000 records, 100 million accepted sequence characters, 10,000 characters per header, and 5 million header characters in total. FAI and GZI sidecars are limited to 16 MiB each. Materialized output is limited to 26,214,400 characters. Reverse-complement duplicate checking retains sequence text and is limited to 25 million bases."
        }
      ]
    }
  ]
};
