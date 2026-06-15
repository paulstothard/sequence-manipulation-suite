export const biowasmToolManifest = [
  {
    id: "aioli",
    tool: "aioli",
    program: "Aioli",
    biowasmVersion: "3.2.1",
    upstreamVersion: "3.2.1",
    assetPaths: [
      "src/vendor/biowasm/aioli/3.2.1/aioli.js",
      "src/vendor/biowasm/aioli/3.2.1/aioli-module.js"
    ],
    license: "MIT",
    licensePath: "src/vendor/biowasm/licenses/Aioli-MIT-LICENSE",
    sourceUrl: "https://biowasm.com/documentation",
    accessDate: "2026-05-16",
    commandSyntax: "Imported by SMS3 through the shared createBioWasmCli runner.",
    sms3Tools: ["Multiple Align DNA/RNA", "Multiple Align Protein", "Multiple Align Coding DNA", "Pairwise Align DNA/RNA", "Pairwise Align Protein", "Pairwise Align Coding DNA", "Protein Set Reciprocal Best Match", "FASTA Region Extractor", "SAM/BAM Summary And Region Viewer", "VCF Extractor", "Genome Comparison Poster", "Read Simulator", "Read Mapping Coverage", "FASTQ Quality Trimmer", "GFF/GTF Feature Extractor", "BED/GFF/VCF Interval Operations", "t-SNE Plot"]
  },
  {
    id: "bhtsne",
    tool: "bhtsne",
    program: "bhtsne",
    biowasmVersion: "2016.08.22",
    upstreamVersion: "2016.08.22 BioWasm build of Barnes-Hut t-SNE",
    assetPaths: [
      "src/vendor/biowasm/bhtsne/2016.08.22/bhtsne.js",
      "src/vendor/biowasm/bhtsne/2016.08.22/bhtsne.wasm",
      "src/vendor/biowasm/bhtsne/2016.08.22/bhtsne.data"
    ],
    license: "BSD-4-Clause-style via upstream bhtsne",
    licensePath: "src/vendor/biowasm/licenses/BHTSNE-2016-BSD-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/bhtsne/2016.08.22",
    accessDate: "2026-06-13",
    commandSyntax: "bhtsne -d 2 -e <theta> -p <perplexity> -s <seed> -n <iterations> -r <report-every> <input.snd>",
    sms3Tools: ["t-SNE Plot"]
  },
  {
    id: "muscle",
    tool: "muscle",
    program: "muscle",
    biowasmVersion: "5.1.0",
    upstreamVersion: "5.1.0",
    assetPaths: [
      "src/vendor/biowasm/muscle/5.1.0/muscle.js",
      "src/vendor/biowasm/muscle/5.1.0/muscle.wasm"
    ],
    license: "GPL-3.0 via upstream MUSCLE v5",
    licensePath: "src/vendor/biowasm/licenses/MUSCLE-5-GPL-3.0-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/muscle/5.1.0",
    accessDate: "2026-05-16",
    commandSyntax: "muscle -align <input.fasta> -output <output.afa>",
    sms3Tools: ["Multiple Align DNA/RNA", "Multiple Align Protein", "Multiple Align Coding DNA"]
  },
  {
    id: "seq-align",
    tool: "seq-align",
    program: "needleman_wunsch",
    biowasmVersion: "2017.10.18",
    upstreamVersion: "2017.10.18 BioWasm build of public-domain seq-align",
    assetPaths: [
      "src/vendor/biowasm/seq-align/2017.10.18/needleman_wunsch.js",
      "src/vendor/biowasm/seq-align/2017.10.18/needleman_wunsch.wasm"
    ],
    license: "Public Domain via upstream seq-align",
    licensePath: "src/vendor/biowasm/licenses/SEQ-ALIGN-PUBLIC-DOMAIN-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/seq-align/2017.10.18",
    accessDate: "2026-05-16",
    commandSyntax: "needleman_wunsch --printscores [--match N --mismatch N | --scoring BLOSUM62] --gapopen N --gapextend N <seq1> <seq2>",
    sms3Tools: ["Pairwise Align DNA/RNA", "Pairwise Align Protein", "Pairwise Align Coding DNA", "Protein Set Reciprocal Best Match"]
  },
  {
    id: "seq-align-smith-waterman",
    tool: "seq-align",
    program: "smith_waterman",
    biowasmVersion: "2017.10.18",
    upstreamVersion: "2017.10.18 BioWasm build of public-domain seq-align",
    assetPaths: [
      "src/vendor/biowasm/seq-align/2017.10.18/smith_waterman.js",
      "src/vendor/biowasm/seq-align/2017.10.18/smith_waterman.wasm"
    ],
    license: "Public Domain via upstream seq-align",
    licensePath: "src/vendor/biowasm/licenses/SEQ-ALIGN-PUBLIC-DOMAIN-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/seq-align/2017.10.18",
    accessDate: "2026-05-16",
    commandSyntax: "smith_waterman --maxhits 1 --minscore 1 [--match N --mismatch N | --scoring BLOSUM62] --gapopen N --gapextend N <seq1> <seq2>",
    sms3Tools: ["Pairwise Align DNA/RNA", "Pairwise Align Protein", "Pairwise Align Coding DNA", "Protein Set Reciprocal Best Match"]
  },
  {
    id: "samtools",
    tool: "samtools",
    program: "samtools",
    biowasmVersion: "1.21",
    upstreamVersion: "1.21",
    assetPaths: [
      "src/vendor/biowasm/samtools/1.21/samtools.js",
      "src/vendor/biowasm/samtools/1.21/samtools.wasm",
      "src/vendor/biowasm/samtools/1.21/samtools.data"
    ],
    license: "MIT/Expat via upstream SAMtools",
    licensePath: "src/vendor/biowasm/licenses/SAMTOOLS-1.21-MIT-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/samtools/1.21",
    accessDate: "2026-05-18",
    commandSyntax: "samtools faidx <reference.fa|reference.fa.gz> <region...>, with matching <reference>.fai and optional <reference>.gzi mounted beside it; samtools view -h <input.bam> <region>, with matching <input.bam>.bai or <input.bam>.csi mounted beside it",
    sms3Tools: ["FASTA Region Extractor", "SAM/BAM Summary And Region Viewer"]
  },
  {
    id: "bcftools",
    tool: "bcftools",
    program: "bcftools",
    biowasmVersion: "1.10",
    upstreamVersion: "1.10",
    assetPaths: [
      "src/vendor/biowasm/bcftools/1.10/bcftools.js",
      "src/vendor/biowasm/bcftools/1.10/bcftools.wasm",
      "src/vendor/biowasm/bcftools/1.10/bcftools.data"
    ],
    license: "MIT/Expat or GPL-3.0 via upstream BCFtools",
    licensePath: "src/vendor/biowasm/licenses/BCFTOOLS-1.10-DUAL-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/bcftools/1.10",
    accessDate: "2026-05-18",
    commandSyntax: "bcftools view -h <input.vcf.gz>; bcftools view -H -r <region> <input.vcf.gz>",
    sms3Tools: ["VCF Extractor"]
  },
  {
    id: "minimap2",
    tool: "minimap2",
    program: "minimap2",
    biowasmVersion: "2.22",
    upstreamVersion: "2.22",
    assetPaths: [
      "src/vendor/biowasm/minimap2/2.22/minimap2.js",
      "src/vendor/biowasm/minimap2/2.22/minimap2.wasm",
      "src/vendor/biowasm/minimap2/2.22/minimap2.data",
      "src/vendor/biowasm/minimap2/2.22/minimap2-simd.js",
      "src/vendor/biowasm/minimap2/2.22/minimap2-simd.wasm",
      "src/vendor/biowasm/minimap2/2.22/minimap2-simd.data"
    ],
    license: "MIT via upstream minimap2",
    licensePath: "src/vendor/biowasm/licenses/MINIMAP2-2.22-MIT-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/minimap2/2.22",
    accessDate: "2026-05-19",
    commandSyntax: "minimap2 -c --cs <reference.fasta> <comparisons.fasta>; minimap2 -a --secondary=no [-x preset] <reference.fasta> <reads.fastq|reads.fasta>",
    sms3Tools: ["Genome Comparison Poster", "Read Mapping Coverage"]
  },
  {
    id: "wgsim",
    tool: "wgsim",
    program: "wgsim",
    biowasmVersion: "2011.10.17",
    upstreamVersion: "2011.10.17",
    assetPaths: [
      "src/vendor/biowasm/wgsim/2011.10.17/wgsim.js",
      "src/vendor/biowasm/wgsim/2011.10.17/wgsim.wasm"
    ],
    license: "MIT via upstream wgsim",
    licensePath: "src/vendor/biowasm/licenses/WGSIM-2011-MIT-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/wgsim/2011.10.17",
    accessDate: "2026-05-19",
    commandSyntax: "wgsim -e <error-rate> -d <insert-size> -s <std-dev> -N <read-count> -1 <read-length> -2 <read-length> -r <mutation-rate> -R <indel-fraction> -X <indel-extension-probability> -S <seed> <reference.fasta> <reads_R1.fastq> <reads_R2.fastq>",
    sms3Tools: ["Read Simulator"]
  },
  {
    id: "fastp",
    tool: "fastp",
    program: "fastp",
    biowasmVersion: "0.20.1",
    upstreamVersion: "0.20.1",
    assetPaths: [
      "src/vendor/biowasm/fastp/0.20.1/fastp.js",
      "src/vendor/biowasm/fastp/0.20.1/fastp.wasm",
      "src/vendor/biowasm/fastp/0.20.1/fastp.data"
    ],
    license: "MIT via upstream fastp",
    licensePath: "src/vendor/biowasm/licenses/FASTP-0.20.1-MIT-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/fastp/0.20.1",
    accessDate: "2026-05-19",
    commandSyntax: "fastp -i <input.fastq> -o <trimmed.fastq> -j <summary.json> -h <summary.html> -q <quality> -u <low-quality-percent> -n <max-n> -l <minimum-length> -A [--cut_tail --cut_tail_mean_quality <quality>]",
    sms3Tools: ["FASTQ Quality Trimmer"]
  },
  {
    id: "gffread",
    tool: "gffread",
    program: "gffread",
    biowasmVersion: "0.12.7",
    upstreamVersion: "0.12.7",
    assetPaths: [
      "src/vendor/biowasm/gffread/0.12.7/gffread.js",
      "src/vendor/biowasm/gffread/0.12.7/gffread.wasm",
      "src/vendor/biowasm/gffread/0.12.7/gffread.data"
    ],
    license: "MIT via upstream gffread",
    licensePath: "src/vendor/biowasm/licenses/GFFREAD-0.12.7-MIT-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/gffread/0.12.7",
    accessDate: "2026-05-19",
    commandSyntax: "gffread <annotation.gff3|annotation.gtf> -g <genome.fasta> -w <transcripts.fasta> -x <cds.fasta> -y <proteins.fasta> -o <normalized.gff3>",
    sms3Tools: ["GFF/GTF Feature Extractor"]
  },
  {
    id: "bedtools",
    tool: "bedtools",
    program: "bedtools",
    biowasmVersion: "2.31.0",
    upstreamVersion: "2.31.0",
    assetPaths: [
      "src/vendor/biowasm/bedtools/2.31.0/bedtools.js",
      "src/vendor/biowasm/bedtools/2.31.0/bedtools.wasm",
      "src/vendor/biowasm/bedtools/2.31.0/bedtools.data"
    ],
    license: "MIT via upstream bedtools2",
    licensePath: "src/vendor/biowasm/licenses/BEDTOOLS-2.31.0-MIT-LICENSE",
    sourceUrl: "https://biowasm.com/cdn/v3/bedtools/2.31.0",
    accessDate: "2026-05-19",
    commandSyntax: "bedtools intersect|subtract|closest|merge -a <query.bed> -b <reference.bed>",
    sms3Tools: ["BED/GFF/VCF Interval Operations"]
  }
];
