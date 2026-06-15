import { fastaValidationTableColumns } from "../../core/fasta-validator.js";
import { WHOLE_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
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
    ...makeFastaSourceInputOptions(),
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
      text: `This tool summarizes FASTA structure and duplicates. ${WHOLE_FASTA_SCAN_NOTE}`
    }
  ]
};
