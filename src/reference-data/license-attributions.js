export const softwareLicenseAttributions = [
  {
    category: "Runtime library",
    name: "saxes",
    version: "6.0.0",
    license: "ISC",
    sourceUrl: "https://github.com/lddubeau/saxes",
    bundledPath: "packages/tree-viewer/src/vendor/saxes.js",
    notes: "Parses XML tree files in Tree Viewer.",
    packageNames: ["saxes"]
  },
  {
    category: "Example data",
    name: "Biopython Bcl-2 phyloXML example",
    version: "dc262b5c437e07a8cc1cfb8a734c0d84a4434b23",
    license: "Biopython License Agreement",
    sourceUrl: "https://github.com/biopython/biopython/blob/dc262b5c437e07a8cc1cfb8a734c0d84a4434b23/Tests/PhyloXML/bcl_2.xml",
    bundledPath: "src/examples/tree-viewer-example.js; packages/tree-viewer/examples/data/bcl2-source/",
    notes: "Provides the 18-tip Tree Viewer example. SMS3 adds species labels and group colors while retaining original labels and bootstrap values.",
    packageNames: [],
    licenseNotice: "Permission to use, copy, modify, and distribute this software and its\ndocumentation with or without modifications and for any purpose and\nwithout fee is hereby granted, provided that any copyright notices\nappear in all copies and that both those copyright notices and this\npermission notice appear in supporting documentation, and that the\nnames of the contributors or copyright holders not be used in\nadvertising or publicity pertaining to distribution of the software\nwithout specific prior permission.\n\nTHE CONTRIBUTORS AND COPYRIGHT HOLDERS OF THIS SOFTWARE DISCLAIM ALL\nWARRANTIES WITH REGARD TO THIS SOFTWARE, INCLUDING ALL IMPLIED\nWARRANTIES OF MERCHANTABILITY AND FITNESS, IN NO EVENT SHALL THE\nCONTRIBUTORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY SPECIAL, INDIRECT\nOR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS\nOF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE\nOR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE\nOR PERFORMANCE OF THIS SOFTWARE."
  },
  {
    category: "Runtime library",
    name: "@gmod/bam",
    version: "7.1.21",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/bam",
    bundledPath: "node_modules/@gmod/bam; browser bundles where imported",
    notes: "Reads indexed alignment regions from BAM files.",
    packageNames: ["@gmod/bam"]
  },
  {
    category: "Runtime library",
    name: "@gmod/bgzf-filehandle",
    version: "6.0.19",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/bgzf-filehandle",
    bundledPath: "node_modules/@gmod/bgzf-filehandle; browser bundles where imported",
    notes: "Reads compressed BGZF blocks for indexed genomic file access.",
    packageNames: ["@gmod/bgzf-filehandle"]
  },
  {
    category: "Runtime library",
    name: "@gmod/indexedfasta",
    version: "5.0.5",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/indexedfasta",
    bundledPath: "node_modules/@gmod/indexedfasta; browser bundles where imported",
    notes: "Reads sequence regions from indexed FASTA files, including BGZF-compressed files.",
    packageNames: ["@gmod/indexedfasta"]
  },
  {
    category: "Runtime library",
    name: "@gmod/tabix",
    version: "3.3.3",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/tabix",
    bundledPath: "node_modules/@gmod/tabix; browser bundles where imported",
    notes: "Locates genomic records using Tabix or CSI indexes.",
    packageNames: ["@gmod/tabix"]
  },
  {
    category: "Runtime library",
    name: "@gmod/vcf",
    version: "7.0.2",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/vcf",
    bundledPath: "node_modules/@gmod/vcf; browser bundles where imported",
    notes: "Parses VCF headers and variant records.",
    packageNames: ["@gmod/vcf"]
  },
  {
    category: "Runtime library",
    name: "generic-filehandle2",
    version: "2.1.7",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/generic-filehandle2",
    bundledPath: "node_modules/generic-filehandle2; browser bundles where imported",
    notes: "Provides access to local files for the indexed genomic file readers.",
    packageNames: ["generic-filehandle2"]
  },
  {
    category: "Runtime library",
    name: "Observable Plot",
    version: "0.6.17",
    license: "ISC",
    sourceUrl: "https://observablehq.com/plot/",
    bundledPath: "node_modules/@observablehq/plot; src/vendor/observablehq-plot/",
    notes: "Renders statistical and tabular plots.",
    packageNames: ["@observablehq/plot"]
  },
  {
    category: "Vendored runtime",
    name: "D3",
    version: "7.9.0",
    license: "ISC",
    sourceUrl: "https://d3js.org/",
    bundledPath: "src/vendor/d3/",
    notes: "Provides scales, layouts, and interactions for plots and viewers.",
    packageNames: ["d3"]
  },
  {
    category: "Runtime library",
    name: "3Dmol.js",
    version: "2.5.4",
    license: "BSD-3-Clause with bundled component notices",
    sourceUrl: "https://3dmol.csb.pitt.edu/",
    bundledPath: "node_modules/3dmol; src/vendor/3dmol/",
    notes: "Renders protein structures and conservation scores on structures.",
    packageNames: ["3dmol"]
  },
  {
    category: "Runtime library",
    name: "ExcelJS",
    version: "4.4.0",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/exceljs",
    bundledPath: "node_modules/exceljs; src/vendor/exceljs/",
    notes: "Reads and writes Excel workbooks.",
    packageNames: ["exceljs"]
  },
  {
    category: "Vendored runtime",
    name: "Indexed genomics runtime bundle",
    version: "built from package-lock dependency versions",
    license: "MIT components",
    sourceUrl: "scripts/vendor/build-indexed-genomics-runtime.mjs",
    bundledPath: "src/vendor/indexed-genomics/indexed-vcf-runtime.bundle.js",
    notes: "Combines libraries for indexed FASTA, BAM, and VCF file access.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm Aioli",
    version: "3.2.1",
    license: "MIT",
    sourceUrl: "https://biowasm.com/documentation",
    bundledPath: "src/vendor/biowasm/aioli/3.2.1/aioli.js; src/vendor/biowasm/licenses/Aioli-MIT-LICENSE",
    notes: "Runs the bundled WebAssembly analysis programs in the browser. Adapted for SMS3 workers.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm MUSCLE",
    version: "5.1.0",
    license: "GPL-3.0 via upstream MUSCLE v5",
    sourceUrl: "https://biowasm.com/cdn/v3/muscle/5.1.0",
    bundledPath: "src/vendor/biowasm/muscle/5.1.0/; src/vendor/biowasm/licenses/MUSCLE-5-GPL-3.0-LICENSE",
    notes: "Aligns multiple DNA/RNA or protein sequences.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm seq-align",
    version: "2017.10.18",
    license: "Public Domain via upstream seq-align",
    sourceUrl: "https://biowasm.com/cdn/v3/seq-align/2017.10.18",
    bundledPath: "src/vendor/biowasm/seq-align/2017.10.18/; src/vendor/biowasm/licenses/SEQ-ALIGN-PUBLIC-DOMAIN-LICENSE",
    notes: "Aligns pairs of sequences using Needleman–Wunsch or Smith–Waterman methods.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm SAMtools",
    version: "1.21",
    license: "MIT/Expat via upstream SAMtools",
    sourceUrl: "https://biowasm.com/cdn/v3/samtools/1.21",
    bundledPath: "src/vendor/biowasm/samtools/1.21/; src/vendor/biowasm/licenses/SAMTOOLS-1.21-MIT-LICENSE",
    notes: "Extracts sequence regions from indexed FASTA files and alignment regions from indexed BAM files.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm BCFtools",
    version: "1.10",
    license: "MIT/Expat or GPL-3.0 via upstream BCFtools",
    sourceUrl: "https://biowasm.com/cdn/v3/bcftools/1.10",
    bundledPath: "src/vendor/biowasm/bcftools/1.10/; src/vendor/biowasm/licenses/BCFTOOLS-1.10-DUAL-LICENSE",
    notes: "Extracts variant regions from indexed VCF and BCF files.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm minimap2",
    version: "2.22",
    license: "MIT via upstream minimap2",
    sourceUrl: "https://biowasm.com/cdn/v3/minimap2/2.22",
    bundledPath: "src/vendor/biowasm/minimap2/2.22/; src/vendor/biowasm/licenses/MINIMAP2-2.22-MIT-LICENSE",
    notes: "Aligns genomes in Genome Comparison Poster and maps reads in Read Mapping Coverage.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm wgsim",
    version: "2011.10.17",
    license: "MIT via upstream wgsim",
    sourceUrl: "https://biowasm.com/cdn/v3/wgsim/2011.10.17",
    bundledPath: "src/vendor/biowasm/wgsim/2011.10.17/; src/vendor/biowasm/licenses/WGSIM-2011-MIT-LICENSE",
    notes: "Generates simulated sequencing reads in Read Simulator.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm bhtsne",
    version: "2016.08.22",
    license: "BSD-4-Clause-style via upstream bhtsne",
    sourceUrl: "https://biowasm.com/cdn/v3/bhtsne/2016.08.22",
    bundledPath: "src/vendor/biowasm/bhtsne/2016.08.22/; src/vendor/biowasm/licenses/BHTSNE-2016-BSD-LICENSE",
    notes: "Calculates Barnes–Hut t-SNE embeddings for t-SNE Plot.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm fastp",
    version: "0.20.1",
    license: "MIT via upstream fastp",
    sourceUrl: "https://biowasm.com/cdn/v3/fastp/0.20.1",
    bundledPath: "src/vendor/biowasm/fastp/0.20.1/; src/vendor/biowasm/licenses/FASTP-0.20.1-MIT-LICENSE",
    notes: "Trims and filters sequencing reads in FASTQ Quality Trimmer.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm gffread",
    version: "0.12.7",
    license: "MIT via upstream gffread",
    sourceUrl: "https://biowasm.com/cdn/v3/gffread/0.12.7",
    bundledPath: "src/vendor/biowasm/gffread/0.12.7/; src/vendor/biowasm/licenses/GFFREAD-0.12.7-MIT-LICENSE",
    notes: "Extracts transcripts, coding sequences, proteins, and normalized annotations in GFF/GTF Feature Extractor.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm bedtools",
    version: "2.31.0",
    license: "MIT via upstream bedtools2",
    sourceUrl: "https://biowasm.com/cdn/v3/bedtools/2.31.0",
    bundledPath: "src/vendor/biowasm/bedtools/2.31.0/; src/vendor/biowasm/licenses/BEDTOOLS-2.31.0-MIT-LICENSE",
    notes: "Finds overlaps and nearby features, subtracts regions, and merges regions in BED/GFF/VCF Interval Operations.",
    packageNames: []
  },
  {
    category: "Development/test",
    name: "Playwright",
    version: "1.59.1",
    license: "Apache-2.0",
    sourceUrl: "https://playwright.dev/",
    bundledPath: "node_modules/@playwright/test",
    notes: "Checks browser behavior, appearance, and interactions during SMS3 development.",
    packageNames: ["@playwright/test"]
  },
  {
    category: "Development/build",
    name: "esbuild",
    version: "0.28.0",
    license: "MIT",
    sourceUrl: "https://esbuild.github.io/",
    bundledPath: "node_modules/esbuild",
    notes: "Builds the SMS3 browser application, workers, and viewer bundles.",
    packageNames: ["esbuild"]
  }
];

export const referenceDataLicenseTerms = {
  "protein-digest": {
    version: "1.0.0 (2026-09-07)",
    license: "Independently encoded scientific specificity facts; no upstream software or descriptive passages bundled.",
    source: "ExPASy PeptideCutter specificity documentation.",
    sourceUrl: "https://web.expasy.org/peptide_cutter/peptidecutter_enzymes.html",
    notes: "Provides six protease cleavage models for Protein Digest, encoded from published specificity rules."
  },
  "codon-usage": {
    version: "2026-05 generated",
    license: "Mixed provenance; each codon reference records its own source and redistribution note.",
    source: "NCBI RefSeq source records plus SMS3 synthetic equal-synonymous seed.",
    sourceUrl: "https://www.ncbi.nlm.nih.gov/refseq/",
    notes: "Provides codon frequencies for codon analysis tools, derived from selected reference sequences or defined synthetic frequencies."
  },
  motifs: {
    version: "2026-05 motif references with JASPAR CORE",
    license: "Mixed SMS3-curated cited records and JASPAR CORE CC BY 4.0 derived PWM records.",
    source: "JASPAR 2024 CORE plus SMS3 curated motif records.",
    sourceUrl: "https://jaspar.elixir.no/",
    notes: "Provides DNA/RNA and protein patterns and JASPAR-derived position weight matrices for motif scanning."
  },
  "technical-sequences": {
    version: "2026-05-14 seed",
    license: "Project-curated cited technical sequence records; review source terms before bulk redistribution.",
    source: "Addgene sequencing-primer reference and Illumina adapter-trimming guidance.",
    sourceUrl: "https://www.addgene.org/mol-bio-reference/sequencing-primers/",
    notes: "Provides a curated set of common primers and adapters for Technical Sequence Scanner."
  },
  "restriction-enzymes": {
    version: "2026-05-17-common-type-ii-2",
    license: "Curated common-enzyme seed set; review source terms before importing full upstream restriction-enzyme databases.",
    source: "NEB recognition specificity list and REBASE literature.",
    sourceUrl: "https://rebase.neb.com/",
    notes: "Provides curated recognition sites and cut positions for restriction analysis tools."
  },
  "vector-contamination": {
    version: "UniVec_Core build 10.0",
    license: "NCBI public reference data with README.uv disclaimer; bundled as derived browser-local reference data.",
    source: "NCBI UniVec_Core.",
    sourceUrl: "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/UniVec_Core",
    notes: "Provides UniVec_Core sequences and a derived search index for Vector Contamination Scanner."
  },
  "plasmid-common-features": {
    version: "0.3.0",
    license: "SMS3-curated sequence seed; expand only with source-specific license review.",
    source: "SMS3 curated plasmid signatures plus Addgene-listed plasmid/Sanger sequencing primers from the SMS3 technical-sequence references.",
    sourceUrl: "https://www.addgene.org/mol-bio-reference/sequencing-primers/",
    notes: "Provides curated feature signatures and sequencing primers for Plasmid Common Feature Scanner."
  },
  "text-stop-words": {
    version: "2026-05-17-snowball-english-seed",
    license: "BSD-3-Clause style Snowball project terms.",
    source: "Snowball English stop-word list.",
    sourceUrl: "https://snowballstem.org/algorithms/english/stop.txt",
    notes: "Provides English stop words for excluding common words from Word Cloud."
  }
};
