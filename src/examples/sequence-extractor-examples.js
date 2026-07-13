import { u01668GenBank } from "./data/u01668-1-genbank.js";
import { u29515GenBank } from "./data/u29515-1-genbank.js";

const sequence = `ATGAAACCCGGGTTTGAATTCGCTAGCGGATCCGACGTCGAGCTCAAGCTTACCGGTATGGCT
GCTGCTGCTGCTGACTACGATCGTACCGGTTACGATGCTAGCTGACCTGATCGAGGCTAACGTT
GACTACGGTGGTGACCTGAAGGTTGCTGCTAACGATCCGTTTGACGAGGCTGCTTAAACCGGTT
AAAACCGGTTCCGATGCTGACTGA`;

const primers = `>construct_forward
ATGAAACCCGGGTTT
>construct_reverse
TCAGTCAGCATCGGA`;

const pKssPrimers = `>pKSS_forward
GGTACCGGGCCCCCCCTCGA
>pKSS_reverse
AGCTTTTGTTCCCTTTAGTG`;

const multiRecordGenBank = `${u01668GenBank.trim()}
${u29515GenBank.trim()}`;

const multiRecordGenBankPrimers = `${pKssPrimers}
>fem2_forward
TTTTTGATCCATTTTTGATT
>fem2_reverse
TGTAAGCGGGAAATTTGAAA`;

const embl = `ID   SMS3_EXTRACTOR; SV 1; linear; genomic DNA; STD; SYN; 215 BP.
XX
AC   SMS3_EXTRACTOR;
XX
DE   SMS3 Sequence Extractor example construct.
XX
OS   synthetic DNA construct
OC   other sequences; artificial sequences.
XX
FH   Key             Location/Qualifiers
FH
FT   source          1..215
FT                   /organism="synthetic DNA construct"
FT                   /mol_type="other DNA"
FT   promoter        1..30
FT                   /label="demo promoter"
FT   primer_bind     1..15
FT                   /label="construct_forward"
FT   CDS             61..180
FT                   /gene="demoA"
FT                   /codon_start=1
FT                   /product="demonstration protein"
FT   primer_bind     complement(201..215)
FT                   /label="construct_reverse"
FT   terminator      181..215
FT                   /label="demo terminator"
XX
SQ   Sequence 215 BP; 50 A; 65 C; 65 G; 35 T; 0 other;
     atgaaacccg ggtttgaatt cgctagcgga tccgacgtcg agctcaagct taccggtatg        60
     gctgctgctg ctgctgacta cgatcgtacc ggttacgatg ctagctgacc tgatcgaggc       120
     taacgttgac tacggtggtg acctgaaggt tgctgctaac gatccgtttg acgaggctgc       180
     ttaaaccggt taaaaccggt tccgatgctg actga                                      215
//`;

const gff3 = `##gff-version 3
clickable_construct	SMS3	promoter	1	30	.	+	.	ID=promoter1;Name=demo_promoter
clickable_construct	SMS3	primer_bind	1	15	.	+	.	ID=primer_forward;Name=construct_forward
clickable_construct	SMS3	gene	61	180	.	+	.	ID=gene_demoA;Name=demoA
clickable_construct	SMS3	CDS	61	180	.	+	0	ID=cds_demoA;Parent=gene_demoA;product=demonstration_protein
clickable_construct	SMS3	primer_bind	201	215	.	-	.	ID=primer_reverse;Name=construct_reverse
clickable_construct	SMS3	terminator	181	215	.	+	.	ID=terminator1;Name=demo_terminator`;

const gtf = `clickable_construct	SMS3	gene	61	180	.	+	.	gene_id "demoA"; gene_name "demoA";
clickable_construct	SMS3	transcript	61	180	.	+	.	gene_id "demoA"; transcript_id "demoA.1";
clickable_construct	SMS3	exon	61	120	.	+	.	gene_id "demoA"; transcript_id "demoA.1";
clickable_construct	SMS3	exon	121	180	.	+	.	gene_id "demoA"; transcript_id "demoA.1";
clickable_construct	SMS3	CDS	61	120	.	+	0	gene_id "demoA"; transcript_id "demoA.1"; product "demonstration protein";
clickable_construct	SMS3	CDS	121	180	.	+	0	gene_id "demoA"; transcript_id "demoA.1"; product "demonstration protein";`;

const bed = `clickable_construct	0	30	demo_promoter	0	+
clickable_construct	0	15	construct_forward	0	+
clickable_construct	60	180	demoA_CDS	0	+
clickable_construct	180	215	demo_terminator	0	+
clickable_construct	200	215	construct_reverse	0	-`;

const fasta = `>clickable_construct
${sequence}`;

export const sequenceExtractorExamples = {
  sequence: {
    label: "Plain DNA",
    annotation: sequence.replaceAll("\n", ""),
    fasta: "",
    primers
  },
  fasta: {
    label: "FASTA",
    annotation: fasta,
    fasta: "",
    primers
  },
  genbank: {
    label: "GenBank (2 records)",
    annotation: multiRecordGenBank,
    fasta: "",
    primers: multiRecordGenBankPrimers
  },
  embl: {
    label: "EMBL",
    annotation: embl,
    fasta: "",
    primers
  },
  "gff3-fasta": {
    label: "GFF3 + FASTA",
    annotation: gff3,
    fasta,
    primers
  },
  "gtf-fasta": {
    label: "GTF + FASTA",
    annotation: gtf,
    fasta,
    primers
  },
  "bed-fasta": {
    label: "BED + FASTA",
    annotation: bed,
    fasta,
    primers
  }
};

export const defaultSequenceExtractorExample = sequenceExtractorExamples.genbank;

export const sequenceExtractorExampleSources = [
  {
    accession: "U01668.1",
    label: "Legacy Sequence Extractor pKSS example",
    source: "NCBI Nucleotide GenBank gbwithparts",
    sourceUrl: "https://www.ncbi.nlm.nih.gov/nuccore/U01668.1",
    checked: "2026-07-11"
  },
  {
    accession: "U29515.1",
    label: "Legacy Sequence Extractor fem-2 GenBank example",
    source: "NCBI Nucleotide GenBank gbwithparts",
    sourceUrl: "https://www.ncbi.nlm.nih.gov/nuccore/U29515.1",
    checked: "2026-07-12"
  },
  {
    accession: "AF177870.1",
    label: "Legacy Sequence Extractor fem-2 EMBL example",
    source: "ENA EMBL flatfile",
    sourceUrl: "https://www.ebi.ac.uk/ena/browser/view/AF177870.1",
    checked: "2026-07-11"
  }
];
