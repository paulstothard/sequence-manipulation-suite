const WORKFLOW_EXAMPLE_LOADERS = {
  "human-mitochondrion-genbank": async () => {
    const module = await import("../examples/organellar-workflow-example.js");
    return module.humanMitochondrionGenBankExample;
  },
  "arabidopsis-chloroplast-genbank": async () => {
    const module = await import("../examples/chloroplast-workflow-example.js");
    return module.arabidopsisChloroplastGenBankExample;
  }
};

export async function loadWorkflowPresetExample(presetOrId) {
  const preset = typeof presetOrId === "string"
    ? workflowPresets.find((item) => item.id === presetOrId)
    : presetOrId;
  if (!preset) return "";
  if (typeof preset.example === "string") return preset.example;
  const loader = WORKFLOW_EXAMPLE_LOADERS[preset.exampleId];
  return loader ? loader() : "";
}

export const workflowPresets = [
  {
    id: "organellar-mitochondrial-record-review",
    name: "Mitochondrial record review",
    summary:
      "Review an annotated mitochondrial GenBank, DDBJ, or EMBL record by extracting the whole sequence, calculating sequence statistics, and opening a circular feature viewer.",
    exampleId: "human-mitochondrion-genbank",
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "whole-sequence",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "wholeSequenceRecords",
          options: { outputFormat: "whole-fasta" }
        },
        {
          id: "sequence-stats",
          type: "tool",
          toolId: "sequence-stats-dna-rna",
          input: { from: "whole-sequence", stream: "wholeSequenceRecords" },
          selectStream: "table",
          options: {
            outputFormat: "tsv"
          }
        },
        {
          id: "feature-viewer",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          input: { from: "input", stream: "primary" },
          selectStream: "viewer",
          options: {
            featureFilter: "gene,CDS,tRNA,rRNA,D-loop,rep_origin,misc_feature",
            strandFilter: "all",
            outputFormat: "interactive-circular-viewer"
          }
        }
      ]
    }
  },
  {
    id: "organellar-chloroplast-record-review",
    name: "Chloroplast record review",
    summary:
      "Review an annotated chloroplast GenBank, DDBJ, or EMBL record by extracting the whole sequence, calculating sequence statistics, and opening a circular feature viewer.",
    exampleId: "arabidopsis-chloroplast-genbank",
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "whole-sequence",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "wholeSequenceRecords",
          options: { outputFormat: "whole-fasta" }
        },
        {
          id: "sequence-stats",
          type: "tool",
          toolId: "sequence-stats-dna-rna",
          input: { from: "whole-sequence", stream: "wholeSequenceRecords" },
          selectStream: "table",
          options: {
            outputFormat: "tsv"
          }
        },
        {
          id: "feature-viewer",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          input: { from: "input", stream: "primary" },
          selectStream: "viewer",
          options: {
            featureFilter: "gene,CDS,tRNA,rRNA,exon,rep_origin,misc_feature",
            strandFilter: "all",
            outputFormat: "interactive-circular-viewer"
          }
        }
      ]
    }
  },
  {
    id: "organellar-feature-table-review",
    name: "Mitochondrial feature table review",
    summary:
      "Extract annotated mitochondrial features, keep review-relevant feature classes, sort them by coordinate, and show the feature table.",
    exampleId: "human-mitochondrion-genbank",
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "feature-table",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "table",
          options: {
            strandFilter: "all",
            outputFormat: "features-tsv"
          }
        },
        {
          id: "review-feature-types",
          type: "filter",
          criteria: { field: "feature", operator: "matches", value: "^(gene|CDS|tRNA|rRNA|D-loop|rep_origin|misc_feature)$" }
        },
        {
          id: "sort-by-coordinate",
          type: "sort",
          criteria: { field: "start", direction: "asc" }
        }
      ]
    }
  },
  {
    id: "organellar-mitochondrial-genome-figure",
    name: "Mitochondrial genome figure",
    summary:
      "Extract a mitochondrial sequence and curated feature table, keep organelle-relevant annotations, and draw an editable circular genome figure from the prepared GFF3 + FASTA bundle.",
    exampleId: "human-mitochondrion-genbank",
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "whole-sequence",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "wholeSequenceRecords",
          options: { outputFormat: "whole-fasta" }
        },
        {
          id: "feature-table",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          input: { from: "input", stream: "primary" },
          selectStream: "table",
          options: {
            strandFilter: "all",
            outputFormat: "features-tsv"
          }
        },
        {
          id: "figure-feature-types",
          type: "filter",
          criteria: { field: "feature", operator: "matches", value: "^(gene|CDS|tRNA|rRNA|D-loop|rep_origin|misc_feature)$" }
        },
        {
          id: "sort-features",
          type: "sort",
          criteria: { field: "start", direction: "asc" }
        },
        {
          id: "feature-annotation-bundle",
          type: "feature-table-gff3-bundle",
          input: { from: "whole-sequence", stream: "wholeSequenceRecords" },
          features: { from: "sort-features", stream: "primary" }
        },
        {
          id: "genome-figure",
          type: "tool",
          toolId: "circular-genome-figure",
          input: { from: "feature-annotation-bundle", stream: "primary" },
          selectStream: "figure",
          options: {
            layout: "circular",
            featureLayout: "type-slots",
            labelDensity: "high"
          }
        }
      ]
    }
  },
  {
    id: "mitochondrial-cds-codon-usage",
    name: "Mitochondrial CDS codon usage",
    summary:
      "Extract CDS nucleotide records from an annotated mitochondrial GenBank, DDBJ, or EMBL record and summarize codon usage across the coding regions.",
    exampleId: "human-mitochondrion-genbank",
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "extract-cds",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "cdsSequenceRecords",
          options: {
            outputFormat: "cds-fasta"
          }
        },
        {
          id: "codon-usage",
          type: "tool",
          toolId: "codon-usage",
          input: { from: "extract-cds", stream: "cdsSequenceRecords" },
          selectStream: "table",
          options: {
            frame: "1",
            excludeTerminalStop: false,
            outputFormat: "table"
          }
        }
      ]
    }
  },
  {
    id: "organellar-chloroplast-feature-table-review",
    name: "Chloroplast feature table review",
    summary:
      "Extract annotated chloroplast features, keep review-relevant feature classes, sort them by coordinate, and show the feature table.",
    exampleId: "arabidopsis-chloroplast-genbank",
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "feature-table",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "table",
          options: {
            strandFilter: "all",
            outputFormat: "features-tsv"
          }
        },
        {
          id: "review-feature-types",
          type: "filter",
          criteria: { field: "feature", operator: "matches", value: "^(gene|CDS|tRNA|rRNA|exon|rep_origin|misc_feature)$" }
        },
        {
          id: "sort-by-coordinate",
          type: "sort",
          criteria: { field: "start", direction: "asc" }
        }
      ]
    }
  },
  {
    id: "organellar-chloroplast-genome-figure",
    name: "Chloroplast genome figure",
    summary:
      "Extract a chloroplast sequence and curated feature table, keep organelle-relevant annotations, and draw an editable circular genome figure from the prepared GFF3 + FASTA bundle.",
    exampleId: "arabidopsis-chloroplast-genbank",
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "whole-sequence",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "wholeSequenceRecords",
          options: { outputFormat: "whole-fasta" }
        },
        {
          id: "feature-table",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          input: { from: "input", stream: "primary" },
          selectStream: "table",
          options: {
            strandFilter: "all",
            outputFormat: "features-tsv"
          }
        },
        {
          id: "figure-feature-types",
          type: "filter",
          criteria: { field: "feature", operator: "matches", value: "^(gene|CDS|tRNA|rRNA|exon|rep_origin|misc_feature)$" }
        },
        {
          id: "sort-features",
          type: "sort",
          criteria: { field: "start", direction: "asc" }
        },
        {
          id: "feature-annotation-bundle",
          type: "feature-table-gff3-bundle",
          input: { from: "whole-sequence", stream: "wholeSequenceRecords" },
          features: { from: "sort-features", stream: "primary" }
        },
        {
          id: "genome-figure",
          type: "tool",
          toolId: "circular-genome-figure",
          input: { from: "feature-annotation-bundle", stream: "primary" },
          selectStream: "figure",
          options: {
            layout: "circular",
            featureLayout: "type-slots",
            labelDensity: "low"
          }
        }
      ]
    }
  },
  {
    id: "annotated-record-restriction-viewer",
    name: "Annotated record to restriction viewer",
    summary: "Extract the nucleotide sequence from a flatfile record, add common restriction-site tracks, and open a linear DNA sequence viewer.",
    example: `LOCUS       VIEWDEMO                 180 bp    DNA     circular SYN 01-JAN-2026
DEFINITION  Synthetic viewer workflow demo record.
ACCESSION   VIEWDEMO
VERSION     VIEWDEMO.1
SOURCE      synthetic construct
  ORGANISM  synthetic construct
FEATURES             Location/Qualifiers
     source          1..180
                     /organism="synthetic construct"
                     /mol_type="other DNA"
     promoter        15..45
                     /gene="lac"
                     /note="lac promoter region"
     CDS             54..137
                     /gene="lacZalpha"
                     /locus_tag="VIEW_0001"
                     /product="beta-galactosidase alpha peptide fragment"
                     /codon_start=1
                     /transl_table=11
                     /translation="MTMITPSLHACRSTLED"
ORIGIN
        1 ttgacaggat ccgctagcga attcaccatg accatgatca cccccagcct gcacgcctgc
       61 cgcagcaccct ggaagacgac ggatccgcat gcgactacaag cttaacgttg
      121 acgactgagaa ttcaagcttg ggatccctcg agtcgacctg cagaaattcc
//`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "whole-sequence",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "wholeSequenceRecords",
          options: { outputFormat: "whole-fasta" }
        },
        {
          id: "restriction-viewer",
          type: "tool",
          toolId: "restriction-summary",
          input: { from: "whole-sequence", stream: "wholeSequenceRecords" },
          selectStream: "viewer",
          options: {
            enzymeIds: "common",
            topology: "circular",
            minimumSites: 1,
            maximumSites: 8,
            outputFormat: "interactive-circular-viewer"
          }
        }
      ]
    }
  },
  {
    id: "predicted-orfs-genome-figure",
    name: "Predicted ORFs genome figure",
    summary:
      "Find open reading frames on a DNA/RNA sequence, write the ORFs as GFF3 feature annotations, pair them with the sequence FASTA, and draw an editable circular genome figure.",
    example: `>orf_figure_plasmid
TTGACAGGATCCGCTAGCGAATTCACCATGACCATGATCACCCCCAGCCTG
CACGCCTGCCGCAGCACCCTGGAAGACGACTAAGGATCCGCATGCGACTAC
AAGCTTAACGTTGACGACTGAGAATTCAAGCTTGGGATCCCTCGAGTCGAC
CTGCAGAAATTCC`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "find-orfs",
          type: "tool",
          toolId: "orf-finder",
          selectStream: "orfRecords",
          options: {
            strand: "both",
            startMode: "start-codon",
            geneticCode: "11",
            minimumAminoAcids: 6,
            includePartial: false,
            nestedMode: "first-start",
            sortBy: "start",
            outputFormat: "report"
          }
        },
        {
          id: "orf-annotation-bundle",
          type: "orf-gff3-bundle",
          input: { from: "input", stream: "primary" },
          orfs: { from: "find-orfs", stream: "orfRecords" }
        },
        {
          id: "genome-figure",
          type: "tool",
          toolId: "circular-genome-figure",
          input: { from: "orf-annotation-bundle", stream: "primary" },
          selectStream: "figure",
          options: {
            layout: "circular",
            featureLayout: "type-slots",
            labelDensity: "high"
          }
        }
      ]
    }
  },
  {
    id: "orf-codon-usage",
    name: "ORFs to codon usage",
    summary: "Find complete forward-strand ORFs, pass ORF nucleotide records to Codon Usage, and show the codon usage table.",
    example: `>orf-example-one
AAACCCATGAAATAGGGGATGCCCTAA
>orf-example-two
TTTATGGCTGCTGCTTAACCCATGTTTTAG
>orf-example-three
GGGATGAAACCCGGGTAAATGCCCAAATAG`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "find-orfs",
          type: "tool",
          toolId: "orf-finder",
          selectStream: "orfRecords",
          options: {
            strand: "forward",
            startMode: "start-codon",
            minimumAminoAcids: 1,
            includePartial: false,
            outputFormat: "report"
          }
        },
        {
          id: "codon-usage",
          type: "tool",
          toolId: "codon-usage",
          input: { from: "find-orfs", stream: "orfRecords" },
          selectStream: "table",
          options: { outputFormat: "table" }
        }
      ]
    }
  },
  {
    id: "genbank-cds-codon-usage",
    name: "GenBank CDS to codon usage",
    summary: "Parse annotated flatfile records, pass extracted CDS DNA/RNA records to Codon Usage, and show the codon usage table.",
    example: `LOCUS       TEST0001                  39 bp    DNA     circular SYN 01-JAN-2026
DEFINITION  Synthetic parser example record.
ACCESSION   TEST0001
VERSION     TEST0001.1
SOURCE      synthetic construct
  ORGANISM  synthetic construct
FEATURES             Location/Qualifiers
     source          1..39
                     /organism="synthetic construct"
     CDS             1..9
                     /gene="aaa"
                     /locus_tag="TEST_0001"
                     /product="forward peptide"
                     /protein_id="AAA00001.1"
                     /translation="MKF"
     CDS             complement(22..30)
                     /gene="bbb"
                     /product="reverse peptide"
                     /protein_id="AAA00002.1"
                     /translation="MPF"
ORIGIN
        1 atgaaattta acccgggtta caaagggcat aaatttcca
//`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "parse-records",
          type: "tool",
          toolId: "annotated-dna-record-extractor",
          selectStream: "cdsSequenceRecords",
          options: { outputFormat: "cds-fasta" }
        },
        {
          id: "codon-usage",
          type: "tool",
          toolId: "codon-usage",
          input: { from: "parse-records", stream: "cdsSequenceRecords" },
          selectStream: "table",
          options: {
            frame: "1",
            excludeTerminalStop: false,
            outputFormat: "table"
          }
        }
      ]
    }
  },
  {
    id: "filter-reverse-complement",
    name: "Filter records and reverse complement",
    summary: "Split FASTA records, keep records at least 9 bases long, reverse-complement each, and gather sequence records.",
    example: `>short
ATG
>keep-one
ATGAAATAG
>keep-two
CCCTTTAAA
>keep-three
ACGTRYSWKMBDHVN
>tiny
AC`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        { id: "split", type: "split" },
        {
          id: "filter-length",
          type: "filter",
          criteria: { field: "length", operator: ">=", value: 9 }
        },
        {
          id: "reverse-complement",
          type: "map",
          toolId: "reverse-complement",
          selectStream: "sequenceRecords",
          options: {
            preserveCase: false,
            formatFasta: true
          }
        },
        { id: "gather", type: "gather", as: "sequence-records" }
      ]
    }
  },
  {
    id: "rank-records-by-gc",
    name: "Rank records by GC",
    summary:
      "Split FASTA records, calculate DNA/RNA stats for each record, gather the table rows, sort by GC percent, and keep the top five records.",
    example: `>balanced-control
ACGTACGTACGT
>gc-rich-isolate-a
GGGCGCGCCGCGGCCG
>at-rich-isolate
ATATTAATATATTA
>moderate-gc-isolate
ATGCGTACGCGTAT
>ambiguous-survey-read
ACGTRYSWKMBDHVN
>gc-rich-isolate-b
GCGCGGCCGCGG`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        { id: "split-records", type: "split" },
        {
          id: "stats-per-record",
          type: "map",
          toolId: "sequence-stats-dna-rna",
          selectStream: "table",
          options: { outputFormat: "tsv" }
        },
        { id: "gather-stats", type: "gather", as: "table" },
        {
          id: "sort-gc",
          type: "sort",
          criteria: { field: "gc_percent", direction: "desc" }
        },
        { id: "top-five", type: "take", count: 5 }
      ]
    }
  },
  {
    id: "coding-records-protein-stats",
    name: "Coding records to protein stats",
    summary:
      "Split coding DNA/RNA records, translate each record with the bacterial genetic code, gather protein records, and calculate protein statistics.",
    example: `>lac_alpha_fragment
ATGACCATGATCACCCCCAGCCTGCACGCCTGCCGCAGC
>gfp_peptide_fragment
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTG
>signal_peptide_fragment
ATGAAACGTTTCTTCTTCTTGGCGCTGCTGGCCGCCGCT`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        { id: "split-coding-records", type: "split" },
        {
          id: "translate-records",
          type: "map",
          toolId: "translate",
          selectStream: "proteinRecords",
          options: {
            frame: "1",
            geneticCode: "11",
            outputFormat: "fasta"
          }
        },
        { id: "gather-proteins", type: "gather", as: "sequence-records" },
        {
          id: "protein-stats",
          type: "tool",
          toolId: "sequence-stats-protein",
          selectStream: "table",
          options: { outputFormat: "tsv" }
        }
      ]
    }
  },
  {
    id: "translate-reverse-translate",
    name: "Translate then reverse translate",
    summary: "Translate DNA/RNA to protein records, then reverse translate those protein records using the E. coli codon reference.",
    example: `>coding-one
ATGGCTTTATGG
>coding-two
ATGGCATTATTG`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "translate",
          type: "tool",
          toolId: "translate",
          selectStream: "proteinRecords",
          options: {
            frame: "1",
            geneticCode: "11",
            formatFasta: true
          }
        },
        {
          id: "reverse-translate",
          type: "tool",
          toolId: "reverse-translate",
          input: { from: "translate", stream: "proteinRecords" },
          selectStream: "dnaRecords",
          options: {
            referenceId: "ecoli-k12-mg1655-refseq",
            mode: "most-likely",
            outputFormat: "fasta"
          }
        }
      ]
    }
  },
  {
    id: "stats-gc-filter",
    name: "Sequence stats GC filter",
    summary: "Calculate sequence stats and keep table rows with GC percent at least 60.",
    example: `>one
ACGT
>two
GGNN
>three
ATATAT
>gc-rich
GGGCCCGCGCGC
>mixed-ambiguous
ACGTRYSWKMBDHVN`,
    workflow: {
      steps: [
        { id: "input", type: "input", text: "" },
        {
          id: "stats",
          type: "tool",
          toolId: "sequence-stats-dna-rna",
          selectStream: "table",
          options: { outputFormat: "tsv" }
        },
        {
          id: "gc-filter",
          type: "filter",
          criteria: { field: "gc_percent", operator: ">=", value: 60 }
        }
      ]
    }
  },
  {
    id: "random-rna-stats",
    name: "Random RNA sequence stats",
    summary: "Generate random RNA records, calculate stats for each record, gather the table rows, and sort the records by GC percent.",
    example: "",
    workflow: {
      steps: [
        {
          id: "random-rna",
          type: "tool",
          toolId: "random-dna-rna",
          selectStream: "sequenceRecords",
          options: {
            nucleotideAlphabet: "rna",
            sequenceLength: 120,
            sequenceCount: 3,
            seed: "",
            outputFormat: "fasta"
          }
        },
        { id: "split-random-records", type: "split" },
        {
          id: "stats-per-record",
          type: "map",
          toolId: "sequence-stats-dna-rna",
          selectStream: "table",
          options: { outputFormat: "tsv" }
        },
        { id: "gather-stats", type: "gather", as: "table" },
        {
          id: "sort-gc",
          type: "sort",
          criteria: { field: "gc_percent", direction: "desc" }
        }
      ]
    }
  }
];
