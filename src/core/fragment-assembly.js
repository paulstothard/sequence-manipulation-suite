import {
  assessFragmentEndCompatibility,
  fragmentEndGeometry,
  joinExtractedProducts
} from "./sequence-extractor.js";

export const FRAGMENT_ASSEMBLY_METHODS = Object.freeze([
  Object.freeze({
    id: "direct-ligation",
    label: "Direct ligation",
    shortLabel: "Ligate",
    category: "end-based",
    minimumFragments: 2,
    description: "Join adjacent fragments whose physical ends anneal and whose current terminal chemistry permits at least one phosphodiester bond."
  }),
  Object.freeze({
    id: "ta-cloning",
    label: "TA cloning",
    shortLabel: "Assemble by A/T ends",
    category: "end-based",
    minimumFragments: 2,
    description: "Ligate complementary single-nucleotide 3′ A and 3′ T overhangs while retaining their explicit end chemistry."
  }),
  Object.freeze({
    id: "golden-gate",
    label: "Golden Gate assembly",
    shortLabel: "Assemble Golden Gate fragments",
    category: "end-based",
    minimumFragments: 2,
    description: "Model post-digestion Type IIS ends used in a cyclic or simultaneous digestion-ligation reaction; SMS3 currently evaluates four-nucleotide 5′ overhangs."
  }),
  Object.freeze({
    id: "topo-ta",
    label: "TOPO TA cloning",
    shortLabel: "Assemble with TOPO vector",
    category: "activated-end",
    minimumFragments: 2,
    maximumFragments: 2,
    description: "Join a 3′ A-tailed insert to complementary 3′ T vector ends that explicitly carry covalently bound topoisomerase I."
  }),
  Object.freeze({
    id: "gibson",
    label: "Gibson Assembly / NEBuilder HiFi DNA Assembly",
    shortLabel: "Assemble overlaps",
    category: "overlap-based",
    minimumFragments: 2,
    defaultMinimumOverlap: 15,
    description: "Merge ordered fragments with terminal sequence overlaps, recording resection, annealing, fill-in, and sealing as one assembly operation."
  }),
  Object.freeze({
    id: "lic",
    label: "Ligation-independent cloning (LIC)",
    shortLabel: "Anneal LIC ends",
    category: "overlap-based",
    minimumFragments: 2,
    defaultMinimumOverlap: 12,
    description: "Model specially prepared complementary single-stranded ends; the 12 bp SMS3 default is configurable and protocol-specific."
  }),
  Object.freeze({
    id: "slic",
    label: "Sequence- and ligation-independent cloning (SLIC)",
    shortLabel: "Anneal SLIC overlaps",
    category: "overlap-based",
    minimumFragments: 2,
    defaultMinimumOverlap: 20,
    description: "Model homologous ends that anneal after exonuclease treatment and depend substantially on cellular repair."
  }),
  Object.freeze({
    id: "user-assembly",
    label: "USER assembly",
    shortLabel: "Assemble USER overhangs",
    category: "overlap-based",
    minimumFragments: 2,
    defaultMinimumOverlap: 8,
    description: "Assemble fragments whose uracil-containing ends were explicitly converted into USER-compatible 3′ overhangs."
  }),
  Object.freeze({
    id: "site-specific-recombination",
    label: "Site-specific recombination",
    shortLabel: "Recombine annotated sites",
    category: "recombination",
    minimumFragments: 2,
    description: "Recombine explicitly annotated compatible sites using their declared crossover product rather than DNA-end geometry."
  })
]);

export function fragmentAssemblyMethod(methodId) {
  return FRAGMENT_ASSEMBLY_METHODS.find((method) => method.id === methodId) || null;
}

function assemblyFragmentName(fragment, index, options = {}) {
  return options.names?.[index] || fragment?.title || `Fragment ${index + 1}`;
}

function uniqueWarnings(warnings) {
  return Array.from(new Set(warnings.filter(Boolean)));
}

function reverseComplementDna(sequence) {
  const complements = { A: "T", C: "G", G: "C", T: "A", U: "A", N: "N" };
  return Array.from(String(sequence || "").toUpperCase()).reverse().map((base) => complements[base] || "N").join("");
}

function physicalJunctionGeometries(leftFragment, rightFragment) {
  return {
    left: fragmentEndGeometry(leftFragment?.ends?.right, "right"),
    right: fragmentEndGeometry(rightFragment?.ends?.left, "left")
  };
}

function isTaJunction(geometries) {
  const sequences = new Set([geometries.left.sequence, geometries.right.sequence]);
  return geometries.left.overhang === "3 prime" &&
    geometries.right.overhang === "3 prime" &&
    geometries.left.sequence.length === 1 &&
    geometries.right.sequence.length === 1 &&
    sequences.has("A") && sequences.has("T");
}

function topoActivation(end) {
  return String(end?.terminalActivation || end?.activation || "").toLowerCase();
}

function isTopoActivatedJunction(leftFragment, rightFragment) {
  const activations = [
    topoActivation(leftFragment?.ends?.right),
    topoActivation(rightFragment?.ends?.left)
  ];
  return activations.filter((activation) => activation === "topoisomerase-i-bound").length === 1;
}

function canonicalOverhang(sequence) {
  const normalized = String(sequence || "").toUpperCase();
  const reverse = reverseComplementDna(normalized);
  return normalized < reverse ? normalized : reverse;
}

function assemblyJunctionPairs(fragments, options = {}) {
  const pairs = [];
  for (let rightIndex = 1; rightIndex < fragments.length; rightIndex += 1) {
    pairs.push({ leftIndex: rightIndex - 1, rightIndex, closure: false });
  }
  if (options.circular && fragments.length > 1) {
    pairs.push({ leftIndex: fragments.length - 1, rightIndex: 0, closure: true });
  }
  return pairs;
}

function isTypeIisEnd(end) {
  return String(end?.cleavageType || end?.cleavage_type || "").toLowerCase() === "type iis";
}

function longestSuffixPrefixOverlap(leftSequence, rightSequence, minimumLength) {
  const left = String(leftSequence || "").toUpperCase();
  const right = String(rightSequence || "").toUpperCase();
  const maximum = Math.min(left.length, right.length);
  for (let length = maximum; length >= minimumLength; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) {
      return { length, sequence: left.slice(-length) };
    }
  }
  return null;
}

function userProcessedEnd(end) {
  return ["user-generated-overhang", "user-excised"].includes(String(end?.terminalActivation || end?.activation || "").toLowerCase());
}

function recombinationSite(end) {
  return end?.recombinationSite && typeof end.recombinationSite === "object"
    ? end.recombinationSite
    : null;
}

function recombinationPartnerAllowed(site, partner) {
  const compatibleWith = Array.isArray(site?.compatibleWith) ? site.compatibleWith : [];
  return compatibleWith.length === 0 || compatibleWith.includes(partner?.type);
}

function assessRecombinationSites(leftSite, rightSite) {
  if (!leftSite || !rightSite) {
    return { compatible: false, ready: false, reason: "Both participating fragment ends need an explicit recombination-site annotation." };
  }
  if (!leftSite.system || leftSite.system !== rightSite.system) {
    return { compatible: false, ready: false, reason: "The participating sites belong to different recombination systems." };
  }
  if (leftSite.family && rightSite.family && leftSite.family !== rightSite.family) {
    return { compatible: false, ready: false, reason: "The participating recombination-site families do not match." };
  }
  if (!recombinationPartnerAllowed(leftSite, rightSite) || !recombinationPartnerAllowed(rightSite, leftSite)) {
    return { compatible: false, ready: false, reason: `${leftSite.type || "Left site"} and ${rightSite.type || "right site"} are not declared partners.` };
  }
  if (leftSite.orientation && rightSite.orientation && leftSite.orientation !== rightSite.orientation) {
    return { compatible: false, ready: false, reason: "The recombination sites have incompatible orientations for the displayed fragment order." };
  }
  const resultingJunctionSequence = String(
    leftSite.resultingJunctionSequence || rightSite.resultingJunctionSequence || ""
  ).toUpperCase();
  if (!resultingJunctionSequence) {
    return {
      compatible: true,
      ready: false,
      reason: "The sites are compatible, but an explicit resulting junction sequence is required before sequence-level assembly."
    };
  }
  return {
    compatible: true,
    ready: true,
    reason: "",
    system: leftSite.system,
    family: leftSite.family || rightSite.family || "",
    leftType: leftSite.type || "site",
    rightType: rightSite.type || "site",
    resultingType: leftSite.resultingType || rightSite.resultingType || "recombined site",
    resultingJunctionSequence,
    leftTrim: Math.max(0, Number(leftSite.trimFromEnd) || 0),
    rightTrim: Math.max(0, Number(rightSite.trimFromEnd) || 0)
  };
}

function previewDirectLigation(fragments, options = {}) {
  const junctions = [];
  const warnings = [];
  const pairs = assemblyJunctionPairs(fragments, options);
  for (const [junctionIndex, pair] of pairs.entries()) {
    const leftFragment = fragments[pair.leftIndex] || {};
    const rightFragment = fragments[pair.rightIndex] || {};
    const compatibility = assessFragmentEndCompatibility(leftFragment.ends?.right, rightFragment.ends?.left);
    const leftName = assemblyFragmentName(leftFragment, pair.leftIndex, options);
    const rightName = assemblyFragmentName(rightFragment, pair.rightIndex, options);
    junctions.push({
      index: junctionIndex,
      leftIndex: pair.leftIndex,
      rightIndex: pair.rightIndex,
      closure: pair.closure,
      leftName,
      rightName,
      compatibility,
      ready: compatibility.joinable
    });
    warnings.push(...(compatibility.warnings || []));
  }
  const geometryCompatible = junctions.length > 0 && junctions.every((junction) => junction.compatibility.compatible);
  const ready = junctions.length > 0 && junctions.every((junction) => junction.ready);
  return {
    method: fragmentAssemblyMethod("direct-ligation"),
    eligible: fragments.length >= 2,
    ready,
    geometryCompatible,
    predictedLength: fragments.reduce((sum, fragment) => sum + String(fragment?.sequence || "").length, 0),
    fragmentCount: fragments.length,
    circular: Boolean(options.circular),
    junctionCount: junctions.length,
    junctions,
    warnings: uniqueWarnings(warnings),
    summary: fragments.length < 2
      ? "Choose at least two fragments."
      : ready
        ? options.circular
          ? `All ${junctions.length} circular ligation junctions are compatible and sealable.`
          : `${junctions.length} compatible ligation junction${junctions.length === 1 ? "" : "s"} detected.`
        : geometryCompatible
          ? "The end geometry matches, but one or more junctions are not currently sealable."
          : "One or more adjacent fragment ends are incompatible."
  };
}

function previewSpecializedEndAssembly(methodId, fragments, options = {}) {
  const method = fragmentAssemblyMethod(methodId);
  const junctions = [];
  const warnings = [];
  const seenGoldenGateOverhangs = new Set();
  const pairs = assemblyJunctionPairs(fragments, options);
  for (const [junctionIndex, pair] of pairs.entries()) {
    const leftFragment = fragments[pair.leftIndex] || {};
    const rightFragment = fragments[pair.rightIndex] || {};
    const compatibility = assessFragmentEndCompatibility(leftFragment.ends?.right, rightFragment.ends?.left);
    const geometries = physicalJunctionGeometries(leftFragment, rightFragment);
    let methodCompatible = compatibility.compatible;
    let methodReason = "";
    if (methodId === "ta-cloning" || methodId === "topo-ta") {
      methodCompatible = compatibility.compatible && isTaJunction(geometries);
      if (!methodCompatible) methodReason = "This junction is not a complementary single-nucleotide 3′ A/T pair.";
      if (methodCompatible && methodId === "topo-ta" && !isTopoActivatedJunction(leftFragment, rightFragment)) {
        methodCompatible = false;
        methodReason = "Exactly one participating vector end must be marked as topoisomerase-I-bound.";
      }
    } else if (methodId === "golden-gate") {
      const typeIisEnds = isTypeIisEnd(leftFragment.ends?.right) && isTypeIisEnd(rightFragment.ends?.left);
      methodCompatible = compatibility.compatible &&
        typeIisEnds &&
        geometries.left.overhang === "5 prime" &&
        geometries.right.overhang === "5 prime" &&
        geometries.left.sequence.length === 4 &&
        geometries.right.sequence.length === 4;
      if (!methodCompatible) {
        methodReason = typeIisEnds
          ? "SMS3 currently evaluates Golden Gate junctions as reverse-complementary four-nucleotide 5′ overhangs on post-digestion ends."
          : "Golden Gate junctions must come from explicitly identified Type IIS restriction ends.";
      } else {
        const key = canonicalOverhang(geometries.left.sequence);
        if (seenGoldenGateOverhangs.has(key)) {
          warnings.push(`The ${geometries.left.sequence} overhang is reused; alternative joins may be possible.`);
        }
        if (geometries.left.sequence === reverseComplementDna(geometries.left.sequence)) {
          warnings.push(`The ${geometries.left.sequence} overhang is palindromic; orientation may be ambiguous.`);
        }
        seenGoldenGateOverhangs.add(key);
      }
    }
    const chemistryReady = methodId === "topo-ta"
      ? methodCompatible
      : compatibility.joinable;
    const ready = methodCompatible && chemistryReady;
    if (methodReason) warnings.push(methodReason);
    warnings.push(...(compatibility.warnings || []));
    junctions.push({
      index: junctionIndex,
      leftIndex: pair.leftIndex,
      rightIndex: pair.rightIndex,
      closure: pair.closure,
      leftName: assemblyFragmentName(leftFragment, pair.leftIndex, options),
      rightName: assemblyFragmentName(rightFragment, pair.rightIndex, options),
      compatibility,
      geometries,
      methodCompatible,
      methodReason,
      ready
    });
  }
  const eligible = fragments.length >= method.minimumFragments && (!method.maximumFragments || fragments.length <= method.maximumFragments);
  const geometryCompatible = junctions.length > 0 && junctions.every((junction) => junction.methodCompatible);
  const ready = eligible && junctions.length > 0 && junctions.every((junction) => junction.ready);
  return {
    method,
    eligible,
    ready,
    geometryCompatible,
    predictedLength: fragments.reduce((sum, fragment) => sum + String(fragment?.sequence || "").length, 0),
    fragmentCount: fragments.length,
    circular: Boolean(options.circular),
    junctionCount: junctions.length,
    junctions,
    warnings: uniqueWarnings(warnings),
    summary: fragments.length < method.minimumFragments
      ? `Choose at least ${method.minimumFragments} fragments.`
      : method.maximumFragments && fragments.length > method.maximumFragments
        ? `${method.label} currently accepts exactly ${method.maximumFragments} fragments per operation.`
      : ready
        ? options.circular
          ? `All ${junctions.length} circular ${method.label} junctions were validated.`
          : methodId === "ta-cloning"
            ? `${junctions.length} complementary 3′ A/T junction${junctions.length === 1 ? "" : "s"} detected.`
            : `${junctions.length} compatible ${method.label} junction${junctions.length === 1 ? "" : "s"} detected.`
        : geometryCompatible
          ? "The method-specific end geometry matches, but current ligation chemistry is not sealable."
          : `One or more displayed junctions are incompatible with the ${method.label} end model.`
  };
}

function previewOverlapAssembly(methodId, fragments, options = {}) {
  const method = fragmentAssemblyMethod(methodId);
  const minimumOverlap = Math.max(1, Number(options.minimumOverlap) || method.defaultMinimumOverlap);
  const junctions = [];
  const warnings = [];
  const pairs = assemblyJunctionPairs(fragments, options);
  for (const [junctionIndex, pair] of pairs.entries()) {
    const leftFragment = fragments[pair.leftIndex] || {};
    const rightFragment = fragments[pair.rightIndex] || {};
    const overlap = longestSuffixPrefixOverlap(leftFragment.sequence, rightFragment.sequence, minimumOverlap);
    let methodCompatible = Boolean(overlap);
    let methodReason = overlap ? "" : `No terminal overlap of at least ${minimumOverlap} bp was found in the displayed orientations.`;
    if (methodId === "user-assembly" && methodCompatible && !(
      userProcessedEnd(leftFragment.ends?.right) && userProcessedEnd(rightFragment.ends?.left)
    )) {
      methodCompatible = false;
      methodReason = "Both participating ends must be explicitly marked as USER-excised; sequence overlap alone is not sufficient.";
    }
    if (methodReason) warnings.push(methodReason);
    junctions.push({
      index: junctionIndex,
      leftIndex: pair.leftIndex,
      rightIndex: pair.rightIndex,
      closure: pair.closure,
      leftName: assemblyFragmentName(leftFragment, pair.leftIndex, options),
      rightName: assemblyFragmentName(rightFragment, pair.rightIndex, options),
      overlap,
      methodCompatible,
      methodReason,
      ready: methodCompatible
    });
  }
  const ready = junctions.length > 0 && junctions.every((junction) => junction.ready);
  const overlapBases = junctions.reduce((sum, junction) => sum + Number(junction.overlap?.length || 0), 0);
  return {
    method,
    eligible: fragments.length >= method.minimumFragments,
    ready,
    geometryCompatible: ready,
    minimumOverlap,
    predictedLength: fragments.reduce((sum, fragment) => sum + String(fragment?.sequence || "").length, 0) - overlapBases,
    fragmentCount: fragments.length,
    circular: Boolean(options.circular),
    junctionCount: junctions.length,
    junctions,
    warnings: uniqueWarnings(warnings),
    summary: fragments.length < method.minimumFragments
      ? `Choose at least ${method.minimumFragments} fragments.`
      : ready
        ? `${junctions.map((junction) => `${junction.overlap.length} bp`).join(" / ")} exact terminal homology detected at ${junctions.length} ${options.circular ? "circular " : "displayed "}junction${junctions.length === 1 ? "" : "s"}.`
        : `One or more adjacent fragments lack the required ${method.label} overlap.`
  };
}

function previewRecombinationAssembly(fragments, options = {}) {
  const method = fragmentAssemblyMethod("site-specific-recombination");
  const junctions = [];
  const warnings = [];
  let predictedLength = fragments.reduce((sum, fragment) => sum + String(fragment?.sequence || "").length, 0);
  for (let index = 1; index < fragments.length; index += 1) {
    const leftFragment = fragments[index - 1] || {};
    const rightFragment = fragments[index] || {};
    const recombination = assessRecombinationSites(
      recombinationSite(leftFragment.ends?.right),
      recombinationSite(rightFragment.ends?.left)
    );
    if (recombination.reason) warnings.push(recombination.reason);
    if (recombination.ready) {
      predictedLength += recombination.resultingJunctionSequence.length - recombination.leftTrim - recombination.rightTrim;
    }
    junctions.push({
      index: index - 1,
      leftIndex: index - 1,
      rightIndex: index,
      leftName: assemblyFragmentName(leftFragment, index - 1, options),
      rightName: assemblyFragmentName(rightFragment, index, options),
      recombination,
      methodCompatible: recombination.compatible,
      methodReason: recombination.reason,
      ready: recombination.ready
    });
  }
  const geometryCompatible = junctions.length > 0 && junctions.every((junction) => junction.recombination.compatible);
  const ready = junctions.length > 0 && junctions.every((junction) => junction.ready);
  return {
    method,
    eligible: fragments.length >= method.minimumFragments,
    ready,
    geometryCompatible,
    predictedLength,
    fragmentCount: fragments.length,
    junctionCount: Math.max(0, fragments.length - 1),
    junctions,
    warnings: uniqueWarnings(warnings),
    summary: fragments.length < method.minimumFragments
      ? `Choose at least ${method.minimumFragments} fragments.`
      : ready
        ? `${fragments.length} fragments have compatible annotated recombination sites and explicit crossover products.`
        : geometryCompatible
          ? "The recombination sites match, but their sequence-level crossover products are incomplete."
          : "One or more adjacent fragments lack compatible recombination sites."
  };
}

export function previewFragmentAssembly(methodId, fragments = [], options = {}) {
  const method = fragmentAssemblyMethod(methodId);
  const normalizedFragments = Array.isArray(fragments) ? fragments.filter(Boolean) : [];
  if (!method) {
    return {
      method: null,
      eligible: false,
      ready: false,
      geometryCompatible: false,
      fragmentCount: normalizedFragments.length,
      junctionCount: 0,
      junctions: [],
      warnings: [`Unknown assembly method: ${methodId}`],
      summary: "This assembly method is not available."
    };
  }
  if (method.id === "direct-ligation") return previewDirectLigation(normalizedFragments, options);
  if (["ta-cloning", "golden-gate", "topo-ta"].includes(method.id)) {
    return previewSpecializedEndAssembly(method.id, normalizedFragments, options);
  }
  if (["gibson", "lic", "slic", "user-assembly"].includes(method.id)) {
    return previewOverlapAssembly(method.id, normalizedFragments, options);
  }
  if (method.id === "site-specific-recombination") {
    return previewRecombinationAssembly(normalizedFragments, options);
  }
  return {
    method,
    eligible: false,
    ready: false,
    geometryCompatible: false,
    fragmentCount: normalizedFragments.length,
    junctionCount: 0,
    junctions: [],
    warnings: [`${method.label} is not implemented.`],
    summary: `${method.label} is not implemented.`
  };
}

function applyCompatibleEndAssembly(fragments, options, preview) {
  let product = fragments[0];
  for (let index = 1; index < fragments.length; index += 1) {
    const isFinal = index === fragments.length - 1;
    const leftName = index === 1
      ? assemblyFragmentName(fragments[0], 0, options)
      : product.title || `Assembly ${index}`;
    const rightName = assemblyFragmentName(fragments[index], index, options);
    const joined = joinExtractedProducts(product, fragments[index], {
      leftId: options.ids?.[index - 1],
      leftName,
      rightId: options.ids?.[index],
      rightName,
      title: isFinal
        ? options.title || fragments.map((fragment, fragmentIndex) => assemblyFragmentName(fragment, fragmentIndex, options)).join(" + ")
        : `${leftName} + ${rightName}`
    });
    if (!joined.product) {
      return {
        method: preview.method,
        preview,
        product: null,
        warnings: uniqueWarnings([...(preview.warnings || []), ...(joined.compatibility?.warnings || [])])
      };
    }
    product = joined.product;
  }
  product = {
    ...product,
    provenance: {
      ...(product.provenance || {}),
      method: preview.method.id,
      assembly: {
        methodId: preview.method.id,
        methodLabel: preview.method.label,
        fragmentCount: preview.fragmentCount,
        junctionCount: preview.junctionCount,
        assumptions: ["Fragments are ordered from left to right as displayed in the fragment stack."],
        ...(preview.method.id === "golden-gate" ? {
          recognitionSitesRemoved: true,
          digestionModel: "Pre-digested Type IIS fragment boundaries exclude the recognition sites from the assembled product."
        } : {})
      }
    }
  };
  return { method: preview.method, preview, product, warnings: preview.warnings };
}

function endWithSealableChemistry(end) {
  if (!end) return end;
  return { ...end, fivePrimePhosphate: "present", threePrimeHydroxyl: "present" };
}

function applyTopoTaAssembly(fragments, options, preview) {
  const left = {
    ...fragments[0],
    ends: { ...fragments[0].ends, right: endWithSealableChemistry(fragments[0].ends?.right) }
  };
  const right = {
    ...fragments[1],
    ends: { ...fragments[1].ends, left: endWithSealableChemistry(fragments[1].ends?.left) }
  };
  const leftName = assemblyFragmentName(fragments[0], 0, options);
  const rightName = assemblyFragmentName(fragments[1], 1, options);
  const joined = joinExtractedProducts(left, right, {
    leftId: options.ids?.[0],
    leftName,
    rightId: options.ids?.[1],
    rightName,
    title: options.title || `${leftName} + ${rightName}`
  });
  if (!joined.product) return { method: preview.method, preview, product: null, warnings: preview.warnings };
  const junctions = [...(joined.product.provenance?.junctions || [])];
  const junction = junctions.at(-1);
  if (junction) {
    junction.ligationStatus = "topoisomerase-transfer";
    junction.chemistryLabel = "Covalent strand transfer by vaccinia topoisomerase I";
    junction.label = "TOPO TA junction";
  }
  const product = {
    ...joined.product,
    warnings: [],
    provenance: {
      ...(joined.product.provenance || {}),
      method: preview.method.id,
      junctions,
      operations: [
        ...(joined.product.provenance?.operations || []),
        {
          operation: "topo-ta-assembly",
          leftName,
          rightName,
          mechanism: "covalent strand transfer by topoisomerase I",
          activationRequired: "topoisomerase-I-bound vector terminus"
        }
      ],
      assembly: {
        methodId: preview.method.id,
        methodLabel: preview.method.label,
        fragmentCount: 2,
        junctionCount: 1,
        assumptions: ["The annotated vector terminus carries covalently bound topoisomerase I and a complementary 3′ T overhang."]
      }
    }
  };
  return { method: preview.method, preview, product, warnings: [] };
}

function baseFragmentProvenance(fragment, index, options = {}) {
  if (fragment?.provenance?.sources?.length > 0) return fragment.provenance;
  const sequenceLength = String(fragment?.sequence || "").length;
  const name = assemblyFragmentName(fragment, index, options);
  const id = options.ids?.[index] || `fragment:${index + 1}:${name}`;
  return {
    method: "extracted-fragment",
    sources: [{ id, name, recordTitle: fragment?.recordTitle || name }],
    segments: [{
      sourceId: id,
      sourceName: name,
      outputStart: 1,
      outputEnd: sequenceLength,
      sourceStart: Number(fragment?.start || 1),
      sourceEnd: Number(fragment?.end || sequenceLength),
      orientation: fragment?.strand === "-" ? "-" : "+"
    }],
    junctions: [],
    operations: []
  };
}

function uniqueSources(sources) {
  const byId = new Map();
  for (const source of sources) byId.set(source.id, source);
  return Array.from(byId.values());
}

function shiftSegments(segments, offset) {
  return (segments || []).map((segment) => ({
    ...segment,
    outputStart: Number(segment.outputStart) + offset,
    outputEnd: Number(segment.outputEnd) + offset
  }));
}

function shiftJunctions(junctions, offset) {
  return (junctions || []).map((junction) => ({
    ...junction,
    position: Number(junction.position) + offset,
    overlapStart: junction.overlapStart == null ? undefined : Number(junction.overlapStart) + offset,
    overlapEnd: junction.overlapEnd == null ? undefined : Number(junction.overlapEnd) + offset
  }));
}

function retainLeftSegments(segments, retainedLength) {
  return (segments || [])
    .filter((segment) => Number(segment.outputStart) <= retainedLength)
    .map((segment) => ({
      ...segment,
      outputEnd: Math.min(Number(segment.outputEnd), retainedLength)
    }));
}

function retainRightSegments(segments, trimmedLength, offset) {
  return (segments || [])
    .filter((segment) => Number(segment.outputEnd) > trimmedLength)
    .map((segment) => ({
      ...segment,
      outputStart: Math.max(Number(segment.outputStart), trimmedLength + 1) + offset,
      outputEnd: Number(segment.outputEnd) + offset
    }));
}

function mergeOverlapPair(leftProduct, rightProduct, overlap, method, leftIndex, rightIndex, options = {}) {
  const leftSequence = String(leftProduct?.sequence || "").toUpperCase();
  const rightSequence = String(rightProduct?.sequence || "").toUpperCase();
  const sequence = leftSequence + rightSequence.slice(overlap.length);
  const leftName = assemblyFragmentName(leftProduct, leftIndex, options);
  const rightName = assemblyFragmentName(rightProduct, rightIndex, options);
  const leftProvenance = baseFragmentProvenance(leftProduct, leftIndex, options);
  const rightProvenance = baseFragmentProvenance(rightProduct, rightIndex, options);
  const offset = leftSequence.length - overlap.length;
  const junction = {
    position: offset,
    overlapStart: offset + 1,
    overlapEnd: leftSequence.length,
    overlapLength: overlap.length,
    overlapSequence: overlap.sequence,
    leftName,
    rightName,
    label: `${overlap.length} bp overlap`,
    ligationStatus: method.id === "gibson" ? "sealed" : "annealed-repair",
    chemistryLabel: method.id === "gibson" ? "Filled and sealed in vitro" : "Idealized annealed intermediate; cellular repair expected"
  };
  const warnings = method.id === "gibson"
    ? []
    : ["The predicted overlap assembly is annealed but retains nicks or gaps unless a separate repair/sealing step is specified."];
  return {
    type: "assembled-fragment",
    title: `${leftName} + ${rightName}`,
    recordTitle: "Assembly",
    length: sequence.length,
    strand: "+",
    topology: "linear",
    wrapsOrigin: false,
    sequence,
    directSequence: sequence,
    reverseComplement: reverseComplementDna(sequence),
    ends: { left: leftProduct?.ends?.left, right: rightProduct?.ends?.right },
    warnings,
    provenance: {
      method: method.id,
      sources: uniqueSources([...(leftProvenance.sources || []), ...(rightProvenance.sources || [])]),
      segments: [
        ...shiftSegments(leftProvenance.segments, 0),
        ...shiftSegments(rightProvenance.segments, offset)
      ],
      junctions: [
        ...shiftJunctions(leftProvenance.junctions, 0),
        junction,
        ...shiftJunctions(rightProvenance.junctions, offset)
      ],
      operations: [
        ...(leftProvenance.operations || []),
        ...(rightProvenance.operations || []),
        {
          operation: "overlap-assembly",
          method: method.id,
          leftName,
          rightName,
          overlapLength: overlap.length,
          overlapSequence: overlap.sequence,
          steps: method.id === "gibson"
            ? ["5′ resection", "overlap annealing", "polymerase fill-in", "nick sealing"]
            : method.id === "lic"
              ? ["controlled complementary-overhang preparation", "overlap annealing", "cellular repair"]
              : ["exonuclease resection", "overlap annealing", "cellular repair"]
        }
      ]
    }
  };
}

function applyOverlapAssembly(fragments, options, preview) {
  let product = fragments[0];
  for (let index = 1; index < fragments.length; index += 1) {
    const overlap = preview.junctions[index - 1]?.overlap;
    product = mergeOverlapPair(product, fragments[index], overlap, preview.method, index - 1, index, options);
  }
  const title = options.title || fragments.map((fragment, index) => assemblyFragmentName(fragment, index, options)).join(" + ");
  product = {
    ...product,
    title,
    warnings: uniqueWarnings([...(product.warnings || []), ...(preview.warnings || [])]),
    provenance: {
      ...(product.provenance || {}),
      method: preview.method.id,
      assembly: {
        methodId: preview.method.id,
        methodLabel: preview.method.label,
        fragmentCount: preview.fragmentCount,
        junctionCount: preview.junctionCount,
        minimumOverlap: preview.minimumOverlap,
        assumptions: ["Fragments are oriented and ordered as displayed in the fragment stack."]
      }
    }
  };
  return { method: preview.method, preview, product, warnings: product.warnings };
}

function mergeRecombinationPair(leftProduct, rightProduct, recombination, method, leftIndex, rightIndex, options = {}) {
  const leftSequence = String(leftProduct?.sequence || "").toUpperCase();
  const rightSequence = String(rightProduct?.sequence || "").toUpperCase();
  const retainedLeft = leftSequence.slice(0, Math.max(0, leftSequence.length - recombination.leftTrim));
  const retainedRight = rightSequence.slice(recombination.rightTrim);
  const sequence = retainedLeft + recombination.resultingJunctionSequence + retainedRight;
  const leftName = assemblyFragmentName(leftProduct, leftIndex, options);
  const rightName = assemblyFragmentName(rightProduct, rightIndex, options);
  const leftProvenance = baseFragmentProvenance(leftProduct, leftIndex, options);
  const rightProvenance = baseFragmentProvenance(rightProduct, rightIndex, options);
  const rightOffset = retainedLeft.length + recombination.resultingJunctionSequence.length - recombination.rightTrim;
  const junction = {
    position: retainedLeft.length,
    recombinationStart: retainedLeft.length + 1,
    recombinationEnd: retainedLeft.length + recombination.resultingJunctionSequence.length,
    recombinationSequence: recombination.resultingJunctionSequence,
    leftName,
    rightName,
    label: `${recombination.system} ${recombination.leftType} × ${recombination.rightType} → ${recombination.resultingType}`,
    system: recombination.system,
    family: recombination.family,
    resultingType: recombination.resultingType,
    ligationStatus: "recombined",
    chemistryLabel: "Site-specific recombination product"
  };
  return {
    type: "assembled-fragment",
    title: `${leftName} + ${rightName}`,
    recordTitle: "Assembly",
    length: sequence.length,
    strand: "+",
    topology: "linear",
    wrapsOrigin: false,
    sequence,
    directSequence: sequence,
    reverseComplement: reverseComplementDna(sequence),
    ends: { left: leftProduct?.ends?.left, right: rightProduct?.ends?.right },
    warnings: [],
    provenance: {
      method: method.id,
      sources: uniqueSources([...(leftProvenance.sources || []), ...(rightProvenance.sources || [])]),
      segments: [
        ...retainLeftSegments(leftProvenance.segments, retainedLeft.length),
        ...retainRightSegments(rightProvenance.segments, recombination.rightTrim, rightOffset)
      ],
      junctions: [
        ...shiftJunctions(leftProvenance.junctions, 0),
        junction,
        ...shiftJunctions(rightProvenance.junctions, rightOffset)
      ],
      operations: [
        ...(leftProvenance.operations || []),
        ...(rightProvenance.operations || []),
        {
          operation: "site-specific-recombination",
          method: recombination.system,
          leftName,
          rightName,
          leftType: recombination.leftType,
          rightType: recombination.rightType,
          resultingType: recombination.resultingType,
          resultingJunctionSequence: recombination.resultingJunctionSequence
        }
      ]
    }
  };
}

function applyRecombinationAssembly(fragments, options, preview) {
  let product = fragments[0];
  for (let index = 1; index < fragments.length; index += 1) {
    product = mergeRecombinationPair(
      product,
      fragments[index],
      preview.junctions[index - 1].recombination,
      preview.method,
      index - 1,
      index,
      options
    );
  }
  product = {
    ...product,
    title: options.title || fragments.map((fragment, index) => assemblyFragmentName(fragment, index, options)).join(" + "),
    provenance: {
      ...(product.provenance || {}),
      method: preview.method.id,
      assembly: {
        methodId: preview.method.id,
        methodLabel: preview.method.label,
        fragmentCount: preview.fragmentCount,
        junctionCount: preview.junctionCount,
        assumptions: ["Recombination-site annotations supply the compatible partners, crossover orientation, trimming, and exact resulting junction sequence."]
      }
    }
  };
  return { method: preview.method, preview, product, warnings: preview.warnings };
}

export function applyFragmentAssembly(methodId, fragments = [], options = {}) {
  const normalizedFragments = Array.isArray(fragments) ? fragments.filter(Boolean) : [];
  const preview = previewFragmentAssembly(methodId, normalizedFragments, options);
  if (!preview.ready) return { method: preview.method, preview, product: null, warnings: preview.warnings };
  if (["direct-ligation", "ta-cloning", "golden-gate"].includes(methodId)) {
    return applyCompatibleEndAssembly(normalizedFragments, options, preview);
  }
  if (methodId === "topo-ta") return applyTopoTaAssembly(normalizedFragments, options, preview);
  if (["gibson", "lic", "slic", "user-assembly"].includes(methodId)) {
    return applyOverlapAssembly(normalizedFragments, options, preview);
  }
  if (methodId === "site-specific-recombination") {
    return applyRecombinationAssembly(normalizedFragments, options, preview);
  }
  return { method: preview.method, preview, product: null, warnings: preview.warnings };
}
