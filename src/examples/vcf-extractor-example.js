const vcfExampleVariants = [
  {
    chrom: "1",
    pos: 10177,
    id: "rs367896724",
    ref: "A",
    alt: "AC",
    qual: 100,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=60",
    samples: ["0/1:42:18:12,6", "0/0:55:20:20,0", "./.:.:0:0,0"]
  },
  {
    chrom: "1",
    pos: 10472,
    id: "rsSMS3ex0",
    ref: "C",
    alt: "T",
    qual: 79,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=52",
    samples: ["0/1:39:17:9,8", "0/0:50:18:18,0", "0/0:48:17:17,0"]
  },
  {
    chrom: "1",
    pos: 10483,
    id: "rsSMS3ex1",
    ref: "G",
    alt: "A",
    qual: 88,
    filter: "PASS",
    info: "AC=2;AF=0.333;DP=57",
    samples: ["0/1:45:18:10,8", "0/1:41:17:9,8", "0/0:52:22:22,0"]
  },
  {
    chrom: "1",
    pos: 10494,
    id: "rsSMS3ex2",
    ref: "T",
    alt: "TA",
    qual: 76,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=54",
    samples: ["0/0:50:18:18,0", "0/1:38:16:8,8", "0/0:46:20:20,0"]
  },
  {
    chrom: "1",
    pos: 10504,
    id: "rsSMS3ex3",
    ref: "T",
    alt: "C",
    qual: 73,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=54",
    samples: ["0/0:50:18:18,0", "0/1:38:16:8,8", "0/0:46:20:20,0"]
  },
  {
    chrom: "1",
    pos: 10512,
    id: "rsSMS3ex4",
    ref: "C",
    alt: "G",
    qual: 69,
    filter: "PASS",
    info: "AC=2;AF=0.333;DP=49",
    samples: ["0/1:36:15:8,7", "0/0:47:18:18,0", "0/1:33:16:9,7"]
  },
  {
    chrom: "1",
    pos: 10518,
    id: "rsSMS3ex5",
    ref: "AT",
    alt: "A",
    qual: 67,
    filter: "PASS",
    info: "AC=2;AF=0.333;DP=49",
    samples: ["0/1:36:15:8,7", "0/0:47:18:18,0", "0/1:33:16:9,7"]
  },
  {
    chrom: "1",
    pos: 10527,
    id: "rsSMS3ex6",
    ref: "G",
    alt: "C",
    qual: 84,
    filter: "PASS",
    info: "AC=2;AF=0.333;DP=56",
    samples: ["0/1:44:19:11,8", "0/0:53:20:20,0", "0/1:35:17:8,9"]
  },
  {
    chrom: "1",
    pos: 10539,
    id: "rsSMS3ex7",
    ref: "C",
    alt: "CT",
    qual: 91,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=63",
    samples: ["0/0:57:23:23,0", "0/0:54:21:21,0", "0/1:44:19:10,9"]
  },
  {
    chrom: "1",
    pos: 10549,
    id: "rsSMS3ex8",
    ref: "A",
    alt: "G",
    qual: 77,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=50",
    samples: ["0/0:49:16:16,0", "0/1:37:17:9,8", "0/0:45:17:17,0"]
  },
  {
    chrom: "1",
    pos: 10562,
    id: "rsSMS3ex9",
    ref: "G",
    alt: "T",
    qual: 82,
    filter: "PASS",
    info: "AC=3;AF=0.500;DP=58",
    samples: ["0/1:40:18:9,9", "0/1:39:20:11,9", "0/1:37:20:10,10"]
  },
  {
    chrom: "1",
    pos: 10570,
    id: "rsSMS3ex10",
    ref: "T",
    alt: "C",
    qual: 72,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=46",
    samples: ["0/0:45:15:15,0", "0/1:34:14:7,7", "0/0:43:17:17,0"]
  },
  {
    chrom: "1",
    pos: 11008,
    id: "rs575272151",
    ref: "C",
    alt: "G",
    qual: 99,
    filter: "PASS",
    info: "AC=1;AF=0.167;DP=62",
    samples: ["0/0:60:22:22,0", "0/1:48:19:11,8", "0/0:52:21:21,0"]
  },
  {
    chrom: "2",
    pos: 20000,
    id: "rsTest2",
    ref: "G",
    alt: "A",
    qual: 8,
    filter: "q10",
    info: "AC=2;AF=0.333;DP=51",
    samples: ["0/1:30:17:9,8", "1/1:12:14:1,13", "0/0:40:20:20,0"]
  }
];

function wrapSequence(sequence, width = 60) {
  return String(sequence ?? "").match(new RegExp(`.{1,${width}}`, "gu"))?.join("\n") ?? "";
}

function makeDemoReferenceSequence() {
  const bases = Array.from({ length: 11008 }, (_, index) => "ACGT"[index % 4]);
  for (const variant of vcfExampleVariants.filter((item) => item.chrom === "1")) {
    [...variant.ref].forEach((base, offset) => {
      bases[variant.pos - 1 + offset] = base;
    });
  }
  return bases.join("");
}

function makeVariantLine(variant) {
  return [
    variant.chrom,
    variant.pos,
    variant.id,
    variant.ref,
    variant.alt,
    variant.qual,
    variant.filter,
    variant.info,
    "GT:GQ:DP:AD",
    ...variant.samples
  ].join("\t");
}

export const vcfExtractorExample = [
  "##fileformat=VCFv4.2",
  "##source=SMS3 compact VCF example",
  "##contig=<ID=1,length=11008,assembly=SMS3-demo>",
  "##contig=<ID=2,length=242193529,assembly=GRCh38>",
  "##FILTER=<ID=PASS,Description=\"All filters passed\">",
  "##FILTER=<ID=q10,Description=\"Quality below 10\">",
  "##INFO=<ID=AC,Number=A,Type=Integer,Description=\"Allele count in genotypes\">",
  "##INFO=<ID=AF,Number=A,Type=Float,Description=\"Allele frequency\">",
  "##INFO=<ID=DP,Number=1,Type=Integer,Description=\"Total read depth\">",
  "##FORMAT=<ID=GT,Number=1,Type=String,Description=\"Genotype\">",
  "##FORMAT=<ID=GQ,Number=1,Type=Integer,Description=\"Genotype quality\">",
  "##FORMAT=<ID=DP,Number=1,Type=Integer,Description=\"Read depth\">",
  "##FORMAT=<ID=AD,Number=R,Type=Integer,Description=\"Allelic depths\">",
  "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSRR2584863\tSRR2584864\tSRR2584865",
  ...vcfExampleVariants.map(makeVariantLine)
].join("\n");

export const vcfExtractorReferenceExample = `>1 SMS3 compact VCF example reference
${wrapSequence(makeDemoReferenceSequence())}`;
