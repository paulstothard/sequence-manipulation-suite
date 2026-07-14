import {
  FRAGMENT_ASSEMBLY_METHODS,
  applyFragmentAssembly,
  previewFragmentAssembly
} from "../core/fragment-assembly.js";

export const SEQUENCE_EXTRACTOR_ASSEMBLY_METHOD_IDS = Object.freeze([
  "direct-ligation",
  "ta-cloning",
  "golden-gate",
  "gibson",
  "lic",
  "slic"
]);

function cohesiveEnd(overhang, overhangSequence, extra = {}) {
  return {
    kind: "restriction",
    overhang,
    overhangSequence,
    fivePrimePhosphate: "present",
    threePrimeHydroxyl: "present",
    ...extra
  };
}

function bluntFragment(title, sequence) {
  const end = cohesiveEnd("blunt", "");
  return {
    type: "reference-example-fragment",
    title,
    sequence,
    ends: { left: { ...end }, right: { ...end } }
  };
}

const EXAMPLE_DEFINITIONS = Object.freeze({
  "direct-ligation": {
    principle: "DNA ligase covalently joins compatible DNA ends by forming phosphodiester bonds between 5′-phosphate and 3′-hydroxyl termini.",
    use: "Restriction cloning or other prepared fragments with compatible blunt or cohesive ends.",
    requirements: "Compatible blunt ends or complementary cohesive ends with ligatable terminal chemistry.",
    predictionRule: "Compares each pair of facing ends for geometry, overhang complementarity, 5′ phosphate, and 3′ hydroxyl.",
    limitations: "Efficiency depends on end type, ligase and buffer choice, DNA concentration, and background from self-ligation.",
    inputState: "Restriction-cut or otherwise prepared dsDNA ends.",
    mechanism: "Compatible ends anneal; DNA ligase seals each backbone nick that has a 5′ phosphate and 3′ hydroxyl.",
    predictedState: "Fully sealed or nicked according to each strand’s recorded terminal chemistry.",
    notEvaluated: "Ligation efficiency, DNA concentration, vector background, transformation, or circular closure unless explicitly requested.",
    fragments: [
      {
        ...bluntFragment("EcoRI-cut fragment A", "AACCGGTT"),
        ends: {
          left: cohesiveEnd("blunt", ""),
          right: cohesiveEnd("5 prime", "AATT")
        }
      },
      {
        ...bluntFragment("EcoRI-cut fragment B", "AATTGGCC"),
        ends: {
          left: cohesiveEnd("5 prime", "AATT"),
          right: cohesiveEnd("blunt", "")
        }
      }
    ],
    sources: [{
      label: "Bauer RJ et al. Comparative analysis of the end-joining activity of several DNA ligases. PLoS One. 2017;12:e0190062. doi:10.1371/journal.pone.0190062",
      url: "https://pubmed.ncbi.nlm.nih.gov/29284038/"
    }]
  },
  "ta-cloning": {
    principle: "DNA ligase joins a single-nucleotide 3′ A overhang to a complementary single-nucleotide 3′ T overhang.",
    use: "Cloning A-tailed amplification products into a prepared T-vector.",
    requirements: "A linear T-vector with a 3′ T at each vector end and an A-tailed PCR insert with a 3′ A at each insert end.",
    predictionRule: "Evaluates the displayed 3′ A/T junction and reports each strand’s sealability from its recorded terminal chemistry.",
    limitations: "Insert orientation is usually uncontrolled; A-tailing, vector self-ligation, and colony yield affect recovery.",
    inputState: "A T-vector end and an A-tailed PCR-product end; the card is a single-junction crop of a two-junction cloning reaction.",
    mechanism: "The complementary 3′ T/A pair anneals and ligase seals backbone nicks that carry the required terminal chemistry.",
    predictedState: "Often nicked when the unmodified PCR product lacks 5′ phosphates; cellular repair can complete the construct after transformation.",
    notEvaluated: "The second vector–insert junction, circular closure, insert orientation, A-tailing yield, self-ligation, or colony recovery.",
    fragments: [
      {
        ...bluntFragment("One T-vector end", "CCTGCAGT"),
        ends: {
          left: cohesiveEnd("blunt", ""),
          right: cohesiveEnd("3 prime", "T")
        }
      },
      {
        ...bluntFragment("One A-tailed PCR insert end", "TGACCTA"),
        ends: {
          left: cohesiveEnd("3 prime", "T", { kind: "primer", fivePrimePhosphate: "absent" }),
          right: cohesiveEnd("blunt", "", { kind: "primer", fivePrimePhosphate: "absent" })
        }
      }
    ],
    sources: [{
      label: "Marchuk D, Drumm M, Saulino A, Collins FS. Construction of T-vectors, a rapid and general system for direct cloning of unmodified PCR products. Nucleic Acids Res. 1991;19:1154. doi:10.1093/nar/19.5.1154",
      url: "https://pubmed.ncbi.nlm.nih.gov/2020552/"
    }]
  },
  "golden-gate": {
    principle: "Golden Gate combines Type IIS restriction digestion and ligation simultaneously or cyclically in one reaction; cutting outside each recognition site exposes designed assembly overhangs.",
    use: "Directional, potentially scarless assembly of multiple designed parts.",
    requirements: "Type IIS-flanked parts whose post-digestion overhangs are reverse-complementary at every intended junction.",
    predictionRule: "SMS3 currently checks post-digestion Type IIS metadata, reverse-complementary 4-nt 5′ overhangs, displayed order, and terminal chemistry. Reused or palindromic overhangs produce ambiguity warnings.",
    limitations: "Overhang choice influences fidelity; reused or palindromic overhangs can permit alternative joins, and internal Type IIS sites usually require removal or accommodation.",
    inputState: "Post-digestion, assembly-ready Type IIS ends derived from parts used in a digestion–ligation reaction.",
    mechanism: "Repeated or simultaneous Type IIS cleavage and ligation enriches products in which recognition sites have been removed.",
    predictedState: "Sealed at each displayed junction whose overhang geometry and chemistry are compatible.",
    notEvaluated: "Digestion or ligation kinetics, enzyme fidelity, internal sites, product distribution, or circular closure unless explicitly requested.",
    fragments: [
      {
        ...bluntFragment("Post-digestion part A", "TTGACCAT"),
        ends: {
          left: cohesiveEnd("blunt", ""),
          right: cohesiveEnd("5 prime", "GACT", { cleavageType: "Type IIS" })
        }
      },
      {
        ...bluntFragment("Post-digestion part B", "GACTTAAC"),
        ends: {
          left: cohesiveEnd("5 prime", "GACT", { cleavageType: "Type IIS" }),
          right: cohesiveEnd("blunt", "")
        }
      }
    ],
    sources: [{
      label: "Engler C, Kandzia R, Marillonnet S. A one pot, one step, precision cloning method with high throughput capability. PLoS One. 2008;3:e3647. doi:10.1371/journal.pone.0003647",
      url: "https://pubmed.ncbi.nlm.nih.gov/18985154/"
    }]
  },
  gibson: {
    principle: "A 5′ exonuclease exposes complementary 3′ overlaps, the overlaps anneal, DNA polymerase fills gaps, and DNA ligase seals nicks.",
    use: "Seamless assembly of two or more fragments designed with homologous ends.",
    requirements: "Adjacent fragments with terminal homology long enough for specific annealing under the assembly conditions.",
    predictionRule: "Finds the longest exact suffix-to-prefix overlap in displayed order; the configurable SMS3 minimum is 15 bp.",
    limitations: "Overlap length and melting temperature, secondary structure, repeated sequences, fragment number, and DNA quality affect performance.",
    inputState: "Ordinary double-stranded DNA fragments with homologous terminal sequences.",
    mechanism: "A 5′ exonuclease generates complementary 3′ single-stranded regions during the reaction; they anneal, polymerase fills gaps, and ligase seals nicks.",
    predictedState: "An idealized filled and covalently sealed in-vitro product.",
    notEvaluated: "Overlap melting temperature or composition, secondary structure, repeated-sequence ambiguity, fragment-count effects, or experimental efficiency.",
    fragments: [
      { title: "Fragment A", sequence: "TTGACCGCTAACCGTTACGAT" },
      { title: "Fragment B", sequence: "GCTAACCGTTACGATGGATCCAA" }
    ],
    sources: [
      {
        label: "Gibson DG et al. Enzymatic assembly of DNA molecules up to several hundred kilobases. Nat Methods. 2009;6:343–345. doi:10.1038/nmeth.1318",
        url: "https://pubmed.ncbi.nlm.nih.gov/19363495/"
      },
      {
        label: "NEBuilder HiFi DNA Assembly optimization guidance",
        url: "https://www.neb.com/en-us/tools-and-resources/usage-guidelines/optimization-tips-for-nebuilder-hifi-dna-assembly-and-neb-gibson-assembly"
      }
    ]
  },
  lic: {
    principle: "LIC uses controlled T4 DNA polymerase treatment, commonly with one selected dNTP, to create long complementary single-stranded ends that anneal without in-vitro ligase.",
    use: "Directional cloning with vector and insert ends designed for a specific LIC preparation protocol.",
    requirements: "Specially prepared complementary overhangs whose length and sequence match the chosen LIC protocol.",
    predictionRule: "Finds exact suffix-to-prefix terminal homology; the configurable 12 bp SMS3 default describes this example rather than a universal LIC requirement.",
    limitations: "Overhang length and treatment depend on the protocol, and cellular repair completes the annealed construct after transformation.",
    inputState: "Specially prepared complementary single-stranded ends, typically generated by controlled T4 DNA polymerase treatment.",
    mechanism: "Prepared overhangs anneal without ligase; host-cell repair completes the construct.",
    predictedState: "Idealized annealed intermediate with two strand discontinuities and no modeled gaps or flaps in this example.",
    notEvaluated: "Overhang-generation kinetics, incomplete treatment, annealing yield, transformation, or cellular repair efficiency.",
    fragments: [
      { title: "Fragment A", sequence: "TTGGAACCGGTTAACC" },
      { title: "Fragment B", sequence: "AACCGGTTAACCGGCCAT" }
    ],
    sources: [{
      label: "Aslanidis C, de Jong PJ. Ligation-independent cloning of PCR products (LIC-PCR). Nucleic Acids Res. 1990;18:6069–6074. doi:10.1093/nar/18.20.6069",
      url: "https://pubmed.ncbi.nlm.nih.gov/2235490/"
    }]
  },
  slic: {
    principle: "SLIC uses homologous fragment ends and exonuclease-generated single-stranded regions that anneal before transformation and rely substantially on cellular repair.",
    use: "Sequence-independent joining of PCR-derived fragments designed with longer homologous ends.",
    requirements: "Adjacent dsDNA fragments with sufficiently long, specific terminal homology for the selected SLIC protocol.",
    predictionRule: "Finds exact suffix-to-prefix terminal homology; SMS3 uses a configurable 20 bp default for SLIC.",
    limitations: "Homology length and sequence composition, exonuclease treatment, fragment number, repeated sequences, annealing, and host repair affect recovery.",
    inputState: "Double-stranded DNA fragments with homologous ends; exonuclease-generated single-stranded regions arise during preparation.",
    mechanism: "Exonuclease treatment exposes homologous single-stranded regions, which anneal and are repaired after transformation.",
    predictedState: "Idealized annealed intermediate with two strand discontinuities and no modeled gaps or flaps in this example.",
    notEvaluated: "Exonuclease kinetics, overlap melting behavior, repeated-sequence ambiguity, transformation, or cellular repair efficiency.",
    fragments: [
      { title: "Fragment A", sequence: "TTGGAACCGGTTAACCGGTAACCG" },
      { title: "Fragment B", sequence: "AACCGGTTAACCGGTAACCGGCCAT" }
    ],
    sources: [{
      label: "Li MZ, Elledge SJ. Harnessing homologous recombination in vitro to generate recombinant DNA via SLIC. Nat Methods. 2007;4:251–256. doi:10.1038/nmeth1010",
      url: "https://pubmed.ncbi.nlm.nih.gov/17293868/"
    }]
  }
});

function makeFragmentDisplayProducts(methodId, fragments, preview) {
  const junction = preview.junctions?.[0];
  if (!junction?.overlap) {
    return fragments.map((fragment) => ({
      ...fragment,
      length: fragment.sequence.length,
      topology: "linear"
    }));
  }
  if (["gibson", "slic"].includes(methodId)) {
    return fragments.map((fragment) => ({
      ...bluntFragment(fragment.title, fragment.sequence),
      length: fragment.sequence.length,
      topology: "linear"
    }));
  }
  const [left, right] = fragments;
  const overlap = junction.overlap;
  const endLabel = "supplied LIC overhang";
  const preparedOverlapEnd = () => cohesiveEnd("3 prime", overlap.sequence, {
    kind: "prepared-overlap",
    label: endLabel,
    fivePrimePhosphate: "unknown"
  });
  const leftDisplay = bluntFragment(left.title, left.sequence);
  leftDisplay.ends.right = preparedOverlapEnd();
  const rightDisplay = bluntFragment(right.title, right.sequence.slice(overlap.length));
  rightDisplay.ends.left = preparedOverlapEnd();
  return [
    { ...leftDisplay, length: left.sequence.length, topology: "linear" },
    { ...rightDisplay, length: right.sequence.length, topology: "linear" }
  ];
}

function splitStrandSegments(sequence, boundary, labels) {
  const safeBoundary = Math.max(0, Math.min(sequence.length, boundary));
  return [
    {
      kind: "fragment",
      fragmentIndex: 0,
      label: labels[0],
      sequence: sequence.slice(0, safeBoundary)
    },
    {
      kind: "fragment",
      fragmentIndex: 1,
      label: labels[1],
      sequence: sequence.slice(safeBoundary)
    }
  ].filter((segment) => segment.sequence.length > 0);
}

function makeProductStrandModel(methodId, fragments, preview, productSequence, productSegments) {
  const junction = preview.junctions?.[0];
  if (fragments.length !== 2 || !junction) {
    return { top: productSegments, bottom: productSegments, annealedNickCoordinates: [] };
  }
  if (junction.overlap) {
    return {
      top: productSegments,
      bottom: productSegments,
      annealedNickCoordinates: methodId === "gibson" ? [] : [
        { strand: "top", coordinate: fragments[0].sequence.length - junction.overlap.length },
        { strand: "bottom", coordinate: fragments[0].sequence.length }
      ]
    };
  }

  const labels = fragments.map((fragment) => fragment.title);
  const topBoundary = fragments[0].sequence.length;
  const geometry = junction.geometries?.left ?? junction.compatibility?.geometry;
  const overhangLength = String(geometry?.sequence || "").length;
  const bottomBoundary = geometry?.protrudingStrand === "bottom"
    ? topBoundary + overhangLength
    : geometry?.protrudingStrand === "top"
      ? topBoundary - overhangLength
      : topBoundary;
  return {
    top: splitStrandSegments(productSequence, topBoundary, labels),
    bottom: splitStrandSegments(productSequence, bottomBoundary, labels),
    annealedNickCoordinates: [
      { strand: "top", coordinate: topBoundary, state: junction.compatibility?.ligation?.strandBonds?.find((bond) => bond.strand === "top")?.state ?? "unknown" },
      { strand: "bottom", coordinate: bottomBoundary, state: junction.compatibility?.ligation?.strandBonds?.find((bond) => bond.strand === "bottom")?.state ?? "unknown" }
    ]
  };
}

function methodResultSummary(methodId, preview) {
  const junction = preview.junctions?.[0];
  if (!junction) return preview.summary;
  if (methodId === "direct-ligation") return "One compatible ligation junction detected.";
  if (methodId === "ta-cloning") return "The displayed 3′ T/A junction is compatible; this is one end of a two-junction cloning reaction.";
  if (methodId === "golden-gate") return "One compatible post-digestion Type IIS junction detected; circular closure is not represented in this demonstration.";
  if (junction.overlap) return `${junction.overlap.length} bp exact terminal homology detected at one displayed junction.`;
  return preview.summary;
}

function makeProductSegments(fragments, preview, productSequence) {
  const overlapLength = preview.junctions?.[0]?.overlap?.length ?? 0;
  if (fragments.length === 2 && overlapLength > 0) {
    const [left, right] = fragments;
    const segments = [
      {
        kind: "fragment",
        fragmentIndex: 0,
        label: left.title,
        sequence: left.sequence.slice(0, -overlapLength)
      },
      {
        kind: "overlap",
        fragmentIndex: null,
        label: `Shared ${overlapLength} bp overlap`,
        sequence: left.sequence.slice(-overlapLength)
      },
      {
        kind: "fragment",
        fragmentIndex: 1,
        label: right.title,
        sequence: right.sequence.slice(overlapLength)
      }
    ].filter((segment) => segment.sequence.length > 0);
    if (segments.map((segment) => segment.sequence).join("") === productSequence) {
      return segments;
    }
  }

  const directSegments = fragments.map((fragment, fragmentIndex) => ({
    kind: "fragment",
    fragmentIndex,
    label: fragment.title,
    sequence: fragment.sequence
  }));
  return directSegments.map((segment) => segment.sequence).join("") === productSequence
    ? directSegments
    : [{ kind: "product", fragmentIndex: null, label: "Predicted product", sequence: productSequence }];
}

export function makeAssemblyMethodReferenceRecords() {
  return SEQUENCE_EXTRACTOR_ASSEMBLY_METHOD_IDS.map((methodId) => {
    const method = FRAGMENT_ASSEMBLY_METHODS.find((candidate) => candidate.id === methodId);
    const definition = EXAMPLE_DEFINITIONS[methodId];
    const names = definition.fragments.map((fragment) => fragment.title);
    const preview = previewFragmentAssembly(methodId, definition.fragments, { names });
    const applied = applyFragmentAssembly(methodId, definition.fragments, { names });
    const productSequence = applied.product?.sequence ?? "";
    const productSegments = makeProductSegments(definition.fragments, preview, productSequence);
    const productStrandModel = makeProductStrandModel(methodId, definition.fragments, preview, productSequence, productSegments);
    const overlapIntermediate = ["lic", "slic"].includes(methodId)
      ? { nicks: 2, gaps: 0, flaps: 0 }
      : null;
    return {
      id: methodId,
      label: method.label,
      category: method.category,
      defaultMinimumOverlap: method.defaultMinimumOverlap ?? null,
      principle: definition.principle,
      use: definition.use,
      requirements: definition.requirements,
      predictionRule: definition.predictionRule,
      limitations: definition.limitations,
      inputState: definition.inputState,
      mechanism: definition.mechanism,
      predictedState: definition.predictedState,
      notEvaluated: definition.notEvaluated,
      fragments: definition.fragments.map((fragment) => ({
        title: fragment.title,
        sequence: fragment.sequence
      })),
      fragmentDisplayProducts: makeFragmentDisplayProducts(methodId, definition.fragments, preview),
      preview,
      productSequence,
      productSegments,
      productStrandModel,
      overlapIntermediate,
      resultSummary: methodResultSummary(methodId, preview),
      singleJunctionDemonstration: true,
      productChemistry: preview.junctions?.[0]?.compatibility?.ligation?.label ??
        applied.product?.provenance?.junctions?.[0]?.chemistryLabel ?? "",
      productJunctionStatus: preview.junctions?.[0]?.compatibility?.ligation?.status ??
        applied.product?.provenance?.junctions?.[0]?.ligationStatus ?? "",
      sources: definition.sources,
      sourceLabel: definition.sources[0].label,
      sourceUrl: definition.sources[0].url
    };
  });
}
