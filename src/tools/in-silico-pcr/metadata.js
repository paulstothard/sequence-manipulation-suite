import {
  pcrBindingSiteTableColumns,
  pcrProductTableColumns
} from "../../core/in-silico-pcr.js";

export const inSilicoPcrMetadata = {
  id: "in-silico-pcr",
  name: "In Silico PCR",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "primer", "coordinates"],
  summary: "Find potential PCR products from one or more template sequences and multiple primer sequences.",
  inputType: "Template DNA sequence, FASTA records, or GenBank/DDBJ/EMBL template records plus primer DNA",
  outputType: "PCR product report, product table, binding-site table, product FASTA, primer text map, simulated gel, or linear DNA sequence viewer",
  splitInput: {
    separator: "---",
    displayOrder: ["primers", "template"],
    panels: [
      { id: "template", label: "Template sequence", dropLabel: "Drop one plain-text template DNA sequence, FASTA records, or GenBank/DDBJ/EMBL template records here", accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq" },
      { id: "primers", label: "Primer sequences", dropLabel: "Drop primer sequences or FASTA records here", accept: ".fa,.fasta,.fa.gz,.fasta.gz,.gz,.txt,.seq" }
    ]
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "in-silico-pcr-products", columns: pcrProductTableColumns },
      { id: "bindingSites", kind: "table", schema: "in-silico-pcr-binding-sites", columns: pcrBindingSiteTableColumns },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "gel", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/in-silico-pcr/run.js",
  workerExport: "runInSilicoPcr",
  options: [
    {
      id: "topology",
      type: "radio",
      label: "Template topology",
      defaultValue: "linear",
      choices: [
        { value: "linear", label: "Linear" },
        { value: "circular", label: "Circular" }
      ]
    },
    { id: "maxMismatches", type: "number", label: "Maximum mismatches per primer", defaultValue: 0, min: 0, max: 6, step: 1 },
    { id: "exactThreePrimeBases", type: "number", label: "Exact 3' bases", defaultValue: 3, min: 0, max: 12, step: 1, help: "Rejects a binding site unless this many bases at the primer 3' end match exactly." },
    { id: "minProductLength", type: "number", label: "Minimum product length", defaultValue: 20, min: 1, step: 1 },
    { id: "maxProductLength", type: "number", label: "Maximum product length", defaultValue: 5000, min: 1, step: 1 },
    { id: "maxBindingSitesPerTemplate", type: "number", label: "Maximum binding sites per template", defaultValue: 5000, min: 1, max: 100000, step: 100, help: "Stops very broad or degenerate primer searches before they create misleadingly huge tables. A warning is shown when the cap is reached." },
    { id: "maxProducts", type: "number", label: "Maximum products", defaultValue: 1000, min: 1, max: 100000, step: 100, help: "Stops product enumeration after this many candidate amplicons. A warning is shown when the cap is reached." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "report",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Product table" },
        { value: "binding-sites-tsv", label: "Binding-site table" },
        { value: "fasta", label: "Product FASTA" },
        { value: "text-map", label: "Primer text map" },
        { value: "svg-gel", label: "Simulated gel" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Primer binding is modeled by direct IUPAC-aware sequence matching on both template strands with optional mismatches and an exact 3' end requirement. Coordinates are 1-based on the submitted template. FASTA.GZ uploads are decompressed by the shared input loader when supported by the browser."
    }
  ]
};
