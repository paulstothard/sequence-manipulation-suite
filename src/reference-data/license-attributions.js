export const softwareLicenseAttributions = [
  {
    category: "Runtime library",
    name: "@gmod/bam",
    version: "7.1.21",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/bam",
    bundledPath: "node_modules/@gmod/bam; browser bundles where imported",
    notes: "Indexed BAM/BAI region reading support.",
    packageNames: ["@gmod/bam"]
  },
  {
    category: "Runtime library",
    name: "@gmod/bgzf-filehandle",
    version: "6.0.19",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/bgzf-filehandle",
    bundledPath: "node_modules/@gmod/bgzf-filehandle; browser bundles where imported",
    notes: "BGZF random-access filehandle support used by indexed genomics readers.",
    packageNames: ["@gmod/bgzf-filehandle"]
  },
  {
    category: "Runtime library",
    name: "@gmod/indexedfasta",
    version: "5.0.5",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/indexedfasta",
    bundledPath: "node_modules/@gmod/indexedfasta; browser bundles where imported",
    notes: "FASTA+FAI and BGZF FASTA+FAI+GZI region reading support.",
    packageNames: ["@gmod/indexedfasta"]
  },
  {
    category: "Runtime library",
    name: "@gmod/tabix",
    version: "3.3.3",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/tabix",
    bundledPath: "node_modules/@gmod/tabix; browser bundles where imported",
    notes: "Tabix/CSI indexed region reading support.",
    packageNames: ["@gmod/tabix"]
  },
  {
    category: "Runtime library",
    name: "@gmod/vcf",
    version: "7.0.2",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@gmod/vcf",
    bundledPath: "node_modules/@gmod/vcf; browser bundles where imported",
    notes: "VCF header and record parsing support.",
    packageNames: ["@gmod/vcf"]
  },
  {
    category: "Runtime library",
    name: "generic-filehandle2",
    version: "2.1.7",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/generic-filehandle2",
    bundledPath: "node_modules/generic-filehandle2; browser bundles where imported",
    notes: "Browser BlobFile wrapper used by indexed genomics readers.",
    packageNames: ["generic-filehandle2"]
  },
  {
    category: "Runtime library",
    name: "Observable Plot",
    version: "0.6.17",
    license: "ISC",
    sourceUrl: "https://observablehq.com/plot/",
    bundledPath: "node_modules/@observablehq/plot; src/vendor/observablehq-plot/",
    notes: "Shared plotting foundation for browser-rendered statistical and tabular plots.",
    packageNames: ["@observablehq/plot"]
  },
  {
    category: "Vendored runtime",
    name: "D3",
    version: "7.9.0",
    license: "ISC",
    sourceUrl: "https://d3js.org/",
    bundledPath: "src/vendor/d3/",
    notes: "Vendored plotting and interaction support used by plot tools.",
    packageNames: ["d3"]
  },
  {
    category: "Runtime library",
    name: "3Dmol.js",
    version: "2.5.4",
    license: "BSD-3-Clause with bundled component notices",
    sourceUrl: "https://3dmol.csb.pitt.edu/",
    bundledPath: "node_modules/3dmol; src/vendor/3dmol/",
    notes: "Protein structure viewer and conservation-on-structure visualization support.",
    packageNames: ["3dmol"]
  },
  {
    category: "Runtime library",
    name: "ExcelJS",
    version: "4.4.0",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/exceljs",
    bundledPath: "node_modules/exceljs; src/vendor/exceljs/",
    notes: "Browser XLSX import/export support through a third-party parser/writer.",
    packageNames: ["exceljs"]
  },
  {
    category: "Vendored runtime",
    name: "Indexed genomics runtime bundle",
    version: "built from package-lock dependency versions",
    license: "MIT components",
    sourceUrl: "scripts/vendor/build-indexed-genomics-runtime.mjs",
    bundledPath: "src/vendor/indexed-genomics/indexed-vcf-runtime.bundle.js",
    notes: "Browser ESM bundle for indexed VCF/BGZF/Tabix access; rebuild with npm run vendor:indexed-genomics after dependency changes.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm Aioli",
    version: "3.2.1",
    license: "MIT",
    sourceUrl: "https://biowasm.com/documentation",
    bundledPath: "src/vendor/biowasm/aioli/3.2.1/aioli.js; src/vendor/biowasm/licenses/Aioli-MIT-LICENSE",
    notes: "Browser-local BioWasm runtime used to execute vendored WebAssembly tools without a runtime CDN dependency; vendored bootstrap patched for SMS3 worker execution.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm MUSCLE",
    version: "5.1.0",
    license: "GPL-3.0 via upstream MUSCLE v5",
    sourceUrl: "https://biowasm.com/cdn/v3/muscle/5.1.0",
    bundledPath: "src/vendor/biowasm/muscle/5.1.0/; src/vendor/biowasm/licenses/MUSCLE-5-GPL-3.0-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of MUSCLE used by the multiple alignment tools; cite Edgar 2022 for MUSCLE v5.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm seq-align",
    version: "2017.10.18",
    license: "Public Domain via upstream seq-align",
    sourceUrl: "https://biowasm.com/cdn/v3/seq-align/2017.10.18",
    bundledPath: "src/vendor/biowasm/seq-align/2017.10.18/; src/vendor/biowasm/licenses/SEQ-ALIGN-PUBLIC-DOMAIN-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of seq-align used by pairwise alignment tools for browser-local Needleman-Wunsch and Smith-Waterman alignment.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm SAMtools",
    version: "1.21",
    license: "MIT/Expat via upstream SAMtools",
    sourceUrl: "https://biowasm.com/cdn/v3/samtools/1.21",
    bundledPath: "src/vendor/biowasm/samtools/1.21/; src/vendor/biowasm/licenses/SAMTOOLS-1.21-MIT-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of SAMtools used for browser-local indexed FASTA region extraction through samtools faidx and indexed BAM region extraction through samtools view.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm BCFtools",
    version: "1.10",
    license: "MIT/Expat or GPL-3.0 via upstream BCFtools",
    sourceUrl: "https://biowasm.com/cdn/v3/bcftools/1.10",
    bundledPath: "src/vendor/biowasm/bcftools/1.10/; src/vendor/biowasm/licenses/BCFTOOLS-1.10-DUAL-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of BCFtools prepared for browser-local indexed VCF/BCF region queries.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm minimap2",
    version: "2.22",
    license: "MIT via upstream minimap2",
    sourceUrl: "https://biowasm.com/cdn/v3/minimap2/2.22",
    bundledPath: "src/vendor/biowasm/minimap2/2.22/; src/vendor/biowasm/licenses/MINIMAP2-2.22-MIT-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of minimap2 used by Genome Comparison Poster and Read Mapping Coverage for browser-local genome alignments and small-reference read mapping.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm wgsim",
    version: "2011.10.17",
    license: "MIT via upstream wgsim",
    sourceUrl: "https://biowasm.com/cdn/v3/wgsim/2011.10.17",
    bundledPath: "src/vendor/biowasm/wgsim/2011.10.17/; src/vendor/biowasm/licenses/WGSIM-2011-MIT-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of wgsim used by Read Simulator for browser-local compact read simulation.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm bhtsne",
    version: "2016.08.22",
    license: "BSD-4-Clause-style via upstream bhtsne",
    sourceUrl: "https://biowasm.com/cdn/v3/bhtsne/2016.08.22",
    bundledPath: "src/vendor/biowasm/bhtsne/2016.08.22/; src/vendor/biowasm/licenses/BHTSNE-2016-BSD-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of Barnes-Hut t-SNE used by t-SNE Plot for browser-local numeric table embeddings.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm fastp",
    version: "0.20.1",
    license: "MIT via upstream fastp",
    sourceUrl: "https://biowasm.com/cdn/v3/fastp/0.20.1",
    bundledPath: "src/vendor/biowasm/fastp/0.20.1/; src/vendor/biowasm/licenses/FASTP-0.20.1-MIT-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of fastp used by FASTQ Quality Trimmer for browser-local quality trimming and filtering.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm gffread",
    version: "0.12.7",
    license: "MIT via upstream gffread",
    sourceUrl: "https://biowasm.com/cdn/v3/gffread/0.12.7",
    bundledPath: "src/vendor/biowasm/gffread/0.12.7/; src/vendor/biowasm/licenses/GFFREAD-0.12.7-MIT-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of gffread used by GFF/GTF Feature Extractor for browser-local transcript, CDS, protein, and normalized GFF3 extraction.",
    packageNames: []
  },
  {
    category: "Vendored runtime",
    name: "BioWasm bedtools",
    version: "2.31.0",
    license: "MIT via upstream bedtools2",
    sourceUrl: "https://biowasm.com/cdn/v3/bedtools/2.31.0",
    bundledPath: "src/vendor/biowasm/bedtools/2.31.0/; src/vendor/biowasm/licenses/BEDTOOLS-2.31.0-MIT-LICENSE",
    notes: "Vendored BioWasm JavaScript/WebAssembly build of bedtools used by BED/GFF/VCF Interval Operations for browser-local interval intersections, subtraction, nearest-neighbor searches, and merges.",
    packageNames: []
  },
  {
    category: "Development/test",
    name: "Playwright",
    version: "1.59.1",
    license: "Apache-2.0",
    sourceUrl: "https://playwright.dev/",
    bundledPath: "node_modules/@playwright/test",
    notes: "Browser smoke, visual, and interaction tests.",
    packageNames: ["@playwright/test"]
  },
  {
    category: "Development/build",
    name: "esbuild",
    version: "0.28.0",
    license: "MIT",
    sourceUrl: "https://esbuild.github.io/",
    bundledPath: "node_modules/esbuild",
    notes: "Builds the browser indexed-genomics runtime bundle.",
    packageNames: ["esbuild"]
  }
];

export const referenceDataLicenseTerms = {
  "codon-usage": {
    version: "2026-05 generated",
    license: "Mixed provenance; each codon reference records its own source and redistribution note.",
    source: "NCBI RefSeq source records plus SMS3 synthetic equal-synonymous seed.",
    sourceUrl: "https://www.ncbi.nlm.nih.gov/refseq/",
    notes: "Generated references are compact derived data with organism-specific source metadata in the codon usage reference page."
  },
  motifs: {
    version: "2026-05 motif references with JASPAR CORE",
    license: "Mixed SMS3-curated cited records and JASPAR CORE CC BY 4.0 derived PWM records.",
    source: "JASPAR 2024 CORE plus SMS3 curated motif records.",
    sourceUrl: "https://jaspar.elixir.no/",
    notes: "Protein databases with more restrictive terms are candidates only and are not bundled wholesale."
  },
  "technical-sequences": {
    version: "2026-05-14 seed",
    license: "Project-curated cited technical sequence records; review source terms before bulk redistribution.",
    source: "Addgene sequencing-primer reference and Illumina adapter-trimming guidance.",
    sourceUrl: "https://www.addgene.org/mol-bio-reference/sequencing-primers/",
    notes: "Small curated common primer/adapter set; full records are lazy-loaded by the worker-backed scanner."
  },
  "restriction-enzymes": {
    version: "2026-05-17-common-type-ii-2",
    license: "Curated common-enzyme seed set; review source terms before importing full upstream restriction-enzyme databases.",
    source: "NEB recognition specificity list and REBASE literature.",
    sourceUrl: "https://rebase.neb.com/",
    notes: "Curated common Type II enzyme data with simple single-site recognition patterns."
  },
  "vector-contamination": {
    version: "UniVec_Core build 10.0",
    license: "NCBI public reference data with README.uv disclaimer; bundled as derived browser-local reference data.",
    source: "NCBI UniVec_Core.",
    sourceUrl: "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/UniVec_Core",
    notes: "Generated normalized records and runtime k-mer index for the browser-local vector contamination scanner."
  },
  "plasmid-common-features": {
    version: "0.3.0",
    license: "SMS3-curated sequence seed; expand only with source-specific license review.",
    source: "SMS3 curated plasmid signatures plus Addgene-listed plasmid/Sanger sequencing primers from the SMS3 technical-sequence references.",
    sourceUrl: "https://www.addgene.org/mol-bio-reference/sequencing-primers/",
    notes: "Focused seed set for common plasmid-feature scanning; the Plasmid Common Feature Scanner now exposes the bundled records in-tool."
  },
  "text-stop-words": {
    version: "2026-05-17-snowball-english-seed",
    license: "BSD-3-Clause style Snowball project terms.",
    source: "Snowball English stop-word list.",
    sourceUrl: "https://snowballstem.org/algorithms/english/stop.txt",
    notes: "Bundled English stop-word seed for Word Cloud; additional user stop words are merged at run time."
  }
};
