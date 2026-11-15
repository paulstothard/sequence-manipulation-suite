import { makeDnaGelOptions } from "../dna-gel-options.js";
import { applyInSilicoPcrOptionDefinitions } from "../../core/in-silico-pcr-options.js";
import { PRIMER_INPUT_HELP } from "../primer-input-options.js";
import {
  pcrBindingSiteTableColumns,
  pcrProductTableColumns
} from "../../core/in-silico-pcr.js";

export const inSilicoPcrMetadata = {
  id: "in-silico-pcr",
  name: "In Silico PCR",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "raw", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "primer", "coordinates"],
  summary: "Find potential PCR products from one or more template sequences and multiple primer sequences.",
  inputType: "Template DNA sequence, FASTA records, GenBank/DDBJ/EMBL records, or GFF3/GTF/BED annotations with FASTA, plus primer DNA",
  outputType: "PCR product report, product table, binding-site table, product FASTA, primer text map, simulated gel, or linear DNA sequence viewer",
  splitInput: {
    separator: "---",
    displayOrder: ["primers", "template"],
    panels: [
      { id: "template", label: "Template sequences", dropLabel: "Drop one plain-text template DNA sequence, FASTA records, or GenBank/DDBJ/EMBL template records here", accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq" },
      { id: "primers", label: "Primer sequences", description: PRIMER_INPUT_HELP, dropLabel: "Drop primer FASTA or text file here", accept: ".fa,.fasta,.fa.gz,.fasta.gz,.gz,.txt,.seq" }
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
      { id: "alignments", kind: "text", mediaType: "text/plain" },
      { id: "analysis", kind: "text", mediaType: "application/json" },
      { id: "ampliconGff", kind: "text", mediaType: "text/plain" },
      { id: "gel", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/in-silico-pcr/run.js",
  workerExport: "runInSilicoPcr",
  options: applyInSilicoPcrOptionDefinitions([
    {
      id: "topology",
      type: "radio",
      label: "Template topology",
      choices: [
        { value: "linear", label: "Linear" },
        { value: "circular", label: "Circular" }
      ]
    },
    { id: "maxMismatches", type: "number", label: "Maximum mismatches per primer" },
    { id: "exactThreePrimeBases", type: "number", label: "Exact 3' bases", help: "Rejects a binding site unless this many bases at the primer 3' end match exactly." },
    { id: "minProductLength", type: "number", label: "Minimum product length" },
    { id: "maxProductLength", type: "number", label: "Maximum product length" },
    { id: "productSequenceMode", type: "radio", label: "Exported sequence", choices: [
      { value: "primer-incorporated", label: "Primer-incorporated amplicon" },
      { value: "template", label: "Original template interval" }
    ], help: "Amplicons include primer substitutions and any 5-prime tails. Template intervals preserve the submitted template bases and exclude tails. GFF3 annotates primers and tails and projects supported template feature parts as intervals; biological function and translation are not revalidated." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Product table" },
        { value: "binding-sites-tsv", label: "Binding-site table", resultView: { kind: "table", streamId: "bindingSites" } },
        { value: "alignments", label: "Primer/template alignments" },
        { value: "analysis-json", label: "Complete analysis JSON" },
        { value: "fasta", label: "Product FASTA" },
        { value: "amplicon-gff3", label: "Annotated products GFF3" },
        { value: "text-map", label: "Primer text map" },
        { value: "svg-gel", label: "Simulated gel" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    ...makeDnaGelOptions(),
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxBindingSitesPerTemplate", type: "number", label: "Maximum binding sites per template", help: "Stops binding-site enumeration at this count. A warning is shown when the cap is reached." },
        { id: "maxProducts", type: "number", label: "Maximum products", help: "Stops product enumeration after this many candidate amplicons. A warning is shown when the cap is reached." }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Primer binding uses IUPAC-aware matching on both strands and a literal exact 3' clamp. Coordinates are 1-based on the template. Enter cloning primers as 5-prime-tail|annealing-sequence; only the annealing region is matched. Primer-incorporated sequences retain unresolved IUPAC alternatives; conflicting overlapping primers have no sequence export. Product length limits include tails. This search does not predict amplification yield."
    }
  ])
};
