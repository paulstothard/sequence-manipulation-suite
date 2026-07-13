import { getRestrictionEnzymeChoices } from "../../core/restriction-tools.js";
import { geneticCodes } from "../../core/genetic-code.js";
import { restrictionEnzymeRecords } from "../../reference-data/restriction-enzymes/records.js";
import { SEQUENCE_EXTRACTOR_SEPARATOR } from "../../core/sequence-extractor.js";

const enzymeChoices = getRestrictionEnzymeChoices(restrictionEnzymeRecords);

export const sequenceExtractorMetadata = {
  id: "sequence-extractor",
  name: "Sequence Extractor",
  category: "Viewers & Figures",
  tags: ["DNA", "FASTA", "GenBank", "EMBL", "DDBJ", "primer", "restriction", "annotation", "coordinates", "translation"],
  summary: "Explore a scrollable base-level sequence document and extract DNA or protein by clicking bases, amino acids, features, restriction sites, and primers.",
  whenToUse: "Use this when you want to inspect an annotated sequence and interactively isolate restriction fragments, PCR products, coordinate ranges, coding DNA, or protein.",
  inputType: "Plain-text DNA sequence, FASTA records, GenBank/DDBJ or EMBL nucleotide records, GFF3/GTF/BED plus FASTA, and optional primer sequences",
  outputType: "Interactive scrollable sequence extractor",
  showcaseOutputs: [
    {
      id: "interactive-sequence-extractor",
      label: "Interactive sequence extractor",
      options: { enzymeIds: "ecori" }
    }
  ],
  splitInput: {
    separator: SEQUENCE_EXTRACTOR_SEPARATOR,
    workspaceSourcePanel: true,
    panels: [
      {
        id: "annotation",
        label: "Sequence, annotated record, or annotation rows",
        dropLabel: "Drop plain-text DNA, FASTA records, or annotated records here",
        accept: ".gb,.gbk,.genbank,.embl,.ddbj,.txt,.fa,.fasta,.fna,.ffn,.gff,.gff3,.gtf,.bed",
        placeholder: "Paste DNA, FASTA, GenBank, DDBJ, EMBL, GFF3, GTF, or BED here."
      },
      {
        id: "fasta",
        label: "FASTA sequence for GFF3/GTF/BED pairs",
        dropLabel: "Drop matching FASTA for GFF3, GTF, or BED here",
        accept: ".fa,.fasta,.fna,.ffn,.txt",
        placeholder: "Paste matching FASTA here only for paired GFF3, GTF, or BED input."
      },
      {
        id: "primers",
        label: "Primer sequences (optional)",
        dropLabel: "Drop primer sequences or FASTA records here",
        accept: ".fa,.fasta,.txt,.seq",
        placeholder: "Paste named primer FASTA records. Primers are matched on both strands."
      }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/sequence-extractor/run.js",
  workerExport: "runSequenceExtractor",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "application/json" },
      { id: "sequenceExtractor", kind: "viewer", viewerType: "sequence-extractor", label: "Interactive sequence extraction workspace" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer", label: "Linear DNA viewer compatibility stream", catalogVisible: false, advanced: true },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Restriction sites",
      help: "Choose the bundled common set or one specific enzyme from the current restriction enzyme reference data.",
      options: [
        { id: "showRestrictionSites", type: "checkbox", label: "Show restriction sites", defaultValue: true },
        {
          id: "enzymeIds",
          type: "select",
          label: "Enzymes to screen",
          defaultValue: "common",
          choices: [
            { value: "common", label: "Common seed set" },
            ...enzymeChoices
          ]
        },
        {
          id: "restrictionSourceNote",
          type: "note",
          text: "Uses the shared SMS3 restriction-enzyme reference data. Recognition and cut definitions match Restriction Summary and Restriction Digest."
        }
      ]
    },
    {
      type: "group",
      label: "Primer matching",
      options: [
        { id: "maxMismatches", type: "number", label: "Maximum mismatches per primer", defaultValue: 0, min: 0, max: 6, step: 1 },
        { id: "exactThreePrimeBases", type: "number", label: "Exact 3' bases", defaultValue: 3, min: 0, max: 12, step: 1 }
      ]
    },
    {
      type: "group",
      label: "Translation",
      help: "This genetic code applies only to computed reading-frame translations. Annotated CDS /translation qualifiers from the input are displayed unchanged.",
      options: [
        {
          id: "geneticCode",
          type: "select",
          label: "Genetic code",
          defaultValue: "1",
          choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
        },
        {
          id: "translationScopeNote",
          type: "note",
          text: "Annotated CDS translations come from /translation qualifiers supplied in the input. Six-frame translations are computed from DNA using the selected genetic code."
        }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxPrimerSites", type: "number", label: "Maximum primer sites per record", defaultValue: 5000, min: 1, max: 100000, step: 100 }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Restriction-site detection and primer matching use the same browser-local SMS3 engines as Restriction Digest and In Silico PCR. Coordinates are 1-based on the direct input record. Linear or circular selection behavior is chosen in the output viewer and does not inherit the annotation file's topology."
    }
  ]
};
