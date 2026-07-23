import { genomeFigureExample } from "./genome-figure-example.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function deterministicGenomeSequence(length, options) {
  const {
    seed,
    meanGc,
    gcAmplitude,
    gcPeriod,
    skewAmplitude,
    skewPeriod,
    phase = 0
  } = options;
  let state = seed >>> 0;
  const bases = new Array(length);
  for (let position = 0; position < length; position += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const random = state / 4294967296;
    const gcFraction = clamp(
      meanGc
        + gcAmplitude * Math.sin((Math.PI * 2 * position) / gcPeriod + phase)
        + gcAmplitude * 0.35 * Math.sin((Math.PI * 2 * position) / (gcPeriod * 0.43) + phase * 1.7),
      0.16,
      0.72
    );
    const gcSkew = clamp(
      skewAmplitude * Math.sin((Math.PI * 2 * position) / skewPeriod + phase * 0.6),
      -0.65,
      0.65
    );
    const atSkew = 0.12 * Math.sin((Math.PI * 2 * position) / (skewPeriod * 0.71) + phase);
    const gFraction = gcFraction * (1 + gcSkew) / 2;
    const cFraction = gcFraction - gFraction;
    const aFraction = (1 - gcFraction) * (1 + atSkew) / 2;
    bases[position] = random < gFraction
      ? "g"
      : random < gFraction + cFraction
        ? "c"
        : random < gFraction + cFraction + aFraction
          ? "a"
          : "t";
  }
  return bases.join("");
}

function formatGenbankOrigin(sequence) {
  const lines = [];
  for (let offset = 0; offset < sequence.length; offset += 60) {
    const groups = sequence.slice(offset, offset + 60).match(/.{1,10}/g) ?? [];
    lines.push(`${String(offset + 1).padStart(9)} ${groups.join(" ")}`);
  }
  return lines.join("\n");
}

function makeContig({ id, definition, sequence, features }) {
  const featureText = (Array.isArray(features) ? [...features].sort((left, right) => left.start - right.start) : [])
    .map((feature) => feature.text)
    .join("\n");
  return `LOCUS       ${id.padEnd(20)} ${String(sequence.length).padStart(7)} bp    DNA     linear   01-JAN-2026
DEFINITION  ${definition}
ACCESSION   ${id}
VERSION     ${id}.1
KEYWORDS    draft genome; contig.
SOURCE      SMS3 realistic demonstration isolate
  ORGANISM  SMS3 realistic demonstration isolate
            Bacteria.
FEATURES             Location/Qualifiers
     source          1..${sequence.length}
                     /organism="SMS3 realistic demonstration isolate"
                     /mol_type="genomic DNA"
                     /note="draft genome contig"
${featureText}
ORIGIN
${formatGenbankOrigin(sequence)}
//`;
}

function featureLocation(start, end, strand = "+") {
  const range = `${start}..${end}`;
  return strand === "-" ? `complement(${range})` : range;
}

function codingFeature({ start, end, locusTag, gene = "", product, strand = "+" }) {
  const location = featureLocation(start, end, strand);
  const geneQualifier = gene ? `\n                     /gene="${gene}"` : "";
  return {
    start,
    end,
    text: `     gene            ${location}${geneQualifier}
                     /locus_tag="${locusTag}"
     CDS             ${location}${geneQualifier}
                     /locus_tag="${locusTag}"
                     /product="${product}"`
  };
}

function simpleFeature({ type, start, end, qualifiers = [], strand = "+" }) {
  return {
    start,
    end,
    text: `     ${type.padEnd(16)}${featureLocation(start, end, strand)}${qualifiers
      .map((qualifier) => `\n                     ${qualifier}`)
      .join("")}`
  };
}

const backgroundProducts = [
  "conserved hypothetical protein",
  "ATP-binding protein",
  "membrane-associated protein",
  "putative oxidoreductase",
  "transcriptional regulator",
  "metabolic enzyme"
];

function overlapsReservedRange(start, end, reservedRanges) {
  return reservedRanges.find(([reservedStart, reservedEnd]) => start <= reservedEnd && end >= reservedStart);
}

function backgroundCodingFeatures({ sequenceLength, locusPrefix, reservedRanges }) {
  const features = [];
  let start = 720;
  let index = 1;
  while (start < sequenceLength - 900) {
    const codingLength = 630 + (index % 8) * 90;
    const end = Math.min(sequenceLength - 360, start + codingLength - 1);
    const overlap = overlapsReservedRange(start, end, reservedRanges);
    if (overlap) {
      start = overlap[1] + 150 + (index % 4) * 30;
      index += 1;
      continue;
    }
    features.push(codingFeature({
      start,
      end,
      locusTag: `${locusPrefix}${String(index).padStart(4, "0")}`,
      product: backgroundProducts[(index - 1) % backgroundProducts.length],
      strand: index % 3 === 0 ? "-" : "+"
    }));
    start = end + 150 + (index % 5) * 30;
    index += 1;
  }
  return features;
}

const resistanceSpecialFeatures = [
  codingFeature({
    start: 8400,
    end: 9455,
    gene: "recA",
    locusTag: "SMS3_0101",
    product: "recombinase RecA"
  }),
  simpleFeature({
    type: "mobile_element",
    start: 42000,
    end: 43499,
    qualifiers: [
      "/mobile_element_type=\"insertion sequence:IS-demo\"",
      "/note=\"demonstration transposable element\""
    ]
  }),
  codingFeature({
    start: 90000,
    end: 90629,
    gene: "tetR",
    locusTag: "SMS3_0102",
    product: "tetracycline-responsive transcriptional regulator",
    strand: "-"
  })
];

const resistanceFragment = makeContig({
  id: "SMS3_CONTIG_02",
  definition: "Draft chromosome contig 2 with stress-response and resistance loci.",
  sequence: deterministicGenomeSequence(120000, {
    seed: 0x5a17c2d3,
    meanGc: 0.33,
    gcAmplitude: 0.052,
    gcPeriod: 41000,
    skewAmplitude: 0.24,
    skewPeriod: 69000,
    phase: 0.45
  }),
  features: [
    ...backgroundCodingFeatures({
      sequenceLength: 120000,
      locusPrefix: "SMS3_C2_",
      reservedRanges: resistanceSpecialFeatures.map((feature) => [feature.start, feature.end])
    }),
    ...resistanceSpecialFeatures
  ]
});

const plasmidSpecialFeatures = [
  simpleFeature({
    type: "repeat_region",
    start: 2038,
    end: 2217,
    qualifiers: [
      "/rpt_type=\"direct\"",
      "/note=\"putative origin of transfer repeats\""
    ]
  }),
  codingFeature({
    start: 15070,
    end: 18069,
    gene: "mobA",
    locusTag: "SMS3_P001",
    product: "plasmid mobilization protein MobA"
  }),
  codingFeature({
    start: 42000,
    end: 43049,
    gene: "repB",
    locusTag: "SMS3_P002",
    product: "plasmid replication protein",
    strand: "-"
  })
];

const plasmidFragment = makeContig({
  id: "SMS3_PLASMID_01",
  definition: "Small draft plasmid contig with mobilization features.",
  sequence: deterministicGenomeSequence(60000, {
    seed: 0x71c09e4b,
    meanGc: 0.38,
    gcAmplitude: 0.061,
    gcPeriod: 27000,
    skewAmplitude: 0.28,
    skewPeriod: 43000,
    phase: 1.3
  }),
  features: [
    ...backgroundCodingFeatures({
      sequenceLength: 60000,
      locusPrefix: "SMS3_P_",
      reservedRanges: plasmidSpecialFeatures.map((feature) => [feature.start, feature.end])
    }),
    ...plasmidSpecialFeatures
  ]
});

export const multiContigGenomeFigureExampleSource = {
  label: "Annotated bacterial chromosome with two realistic draft contigs",
  source: "NCBI NC_000908.2 plus SMS3 curated demonstration contigs",
  fetchedFor: "SMS3 multi-contig Genome Figure and Pseudomolecule Builder examples"
};

export const multiContigGenomeFigureExample = [
  genomeFigureExample,
  resistanceFragment,
  plasmidFragment
].join("\n");

export const pseudomoleculeBuilderExample = [
  resistanceFragment,
  plasmidFragment
].join("\n");
