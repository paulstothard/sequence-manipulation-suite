import { getGeneticCode, makeCodonMap } from "../core/genetic-code.js";
import {
  applicableFragmentEndTreatments,
  applyFragmentEndTreatment,
  assessFragmentEndCompatibility,
  extractCoordinateRange,
  extractPrimerProduct,
  extractRestrictionFragment,
  reverseComplementExtractedProduct
} from "../core/sequence-extractor.js";
import {
  FRAGMENT_ASSEMBLY_METHODS,
  applyFragmentAssembly,
  previewFragmentAssembly
} from "../core/fragment-assembly.js";
import { fragmentDuplexMetrics, fragmentEndGeometry } from "../core/fragment-ends.js";
import { complementDnaRnaSequence } from "../core/sequence.js";
import { formatFastaRecord } from "../core/fasta.js";
import { downloadText } from "./file-download.js";
import {
  createViewerSearchControls,
  getViewerFeatureTypeStyle,
  makeViewerFeatureSuggestions,
  updateViewerSearchControls
} from "./dna-viewer-interactions.js";
import { makeRestrictionCutDiagram } from "./restriction-cut-diagram-ui.js";

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function safeFilename(value) {
  return String(value || "sequence-extractor-selection")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sequence-extractor-selection";
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function configureDisclosure(details, summary, label, collapsedSummary = "") {
  summary.classList.add("sequence-extractor-section-header");
  summary.textContent = "";
  const copy = document.createElement("span");
  copy.className = "sequence-extractor-section-header-copy";
  const title = document.createElement("span");
  title.className = "sequence-extractor-section-header-title";
  title.textContent = label;
  copy.append(title);
  if (collapsedSummary) {
    const description = document.createElement("span");
    description.className = "sequence-extractor-section-header-summary";
    description.textContent = collapsedSummary;
    copy.append(description);
  }
  const chevron = document.createElement("span");
  chevron.className = "sequence-extractor-section-header-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";
  summary.append(copy, chevron);
  const updateState = () => {
    summary.setAttribute("aria-expanded", String(details.open));
    summary.title = details.open ? `Collapse ${label}` : `Expand ${label}`;
  };
  details.addEventListener("toggle", updateState);
  updateState();
}

function itemPosition(item) {
  return Number(item.cutAfter ?? item.cutPosition ?? item.position ?? item.start);
}

function featureItemType(item = {}) {
  return String(item.type || item.featureType || "Feature").trim() || "Feature";
}

export function sequenceExtractorFeatureTypeCounts(record = {}) {
  const counts = new Map();
  for (const item of (record.tracks ?? [])
    .filter((track) => track.type === "features")
    .flatMap((track) => track.items ?? [])) {
    const type = featureItemType(item);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return Array.from(counts, ([type, count]) => ({ type, count }))
    .sort((left, right) => left.type.localeCompare(right.type, undefined, { numeric: true, sensitivity: "base" }));
}

function featureSearchValues(item = {}) {
  const qualifierValues = item.qualifiers && typeof item.qualifiers === "object"
    ? Object.values(item.qualifiers).flatMap((value) => Array.isArray(value) ? value : [value])
    : [];
  return [
    item.label,
    item.name,
    item.gene,
    item.product,
    item.locus_tag,
    item.locusTag,
    item.standard_name,
    item.standardName,
    item.regulatory_class,
    item.regulatoryClass,
    item.note,
    featureItemType(item),
    ...qualifierValues
  ];
}

export function sequenceExtractorFeatureMatches(record = {}, query = "", hiddenTypes = new Set()) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  return (record.tracks ?? [])
    .filter((track) => track.type === "features")
    .flatMap((track) => track.items ?? [])
    .filter((item) => !hiddenTypes.has(featureItemType(item)))
    .filter((item) => featureSearchValues(item)
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedQuery)))
    .sort((left, right) => Number(left.start) - Number(right.start) || Number(left.end) - Number(right.end));
}

export function makeSequenceExtractorFeatureTarget(item = {}) {
  return {
    ...item,
    kind: "feature",
    type: featureItemType(item),
    label: item.label || item.name || item.gene || item.product || featureItemType(item),
    position: Number(item.start),
    start: Number(item.start),
    end: Number(item.end),
    strand: item.strand || "+"
  };
}

export function groupRestrictionSitesByCutPosition(items = []) {
  const groups = new Map();
  for (const item of items) {
    const position = itemPosition(item);
    groups.set(position, [...(groups.get(position) ?? []), item]);
  }
  return Array.from(groups.values());
}

export function makeRestrictionSiteTarget(site, siteCount = 1) {
  const position = itemPosition(site);
  const label = site.enzyme || site.label || "Restriction site";
  const count = Math.max(1, Number(siteCount) || 1);
  return {
    ...site,
    kind: "restriction-site",
    type: "Restriction site",
    position,
    label,
    groupedSites: [site],
    siteCounts: [{ name: label, count }],
    siteFrequency: count === 1
      ? "Single cutter (1 site)"
      : count === 2
        ? "Cuts twice (2 sites)"
        : `Repeated cutter (${count} sites)`,
    parts: Number.isFinite(Number(site.siteStart)) && Number.isFinite(Number(site.siteEnd))
      ? [{ start: Number(site.siteStart), end: Number(site.siteEnd) }]
      : [],
    overhang: site.overhang || "",
    overhangSequence: site.overhangSequence || "",
    complementCutAfters: Number.isFinite(Number(site.complementCutAfter))
      ? [Number(site.complementCutAfter)]
      : []
  };
}

export function restrictionDisplayPosition(item, recordLength) {
  const position = itemPosition(item);
  return Number.isFinite(position)
    ? Math.max(1, Math.min(Number(recordLength), position))
    : position;
}

function restrictionComplementCuts(target) {
  const values = Array.isArray(target?.complementCutAfters)
    ? target.complementCutAfters
    : Array.isArray(target?.groupedSites)
      ? target.groupedSites.map((site) => site.complementCutAfter ?? site.complement_cut_after)
      : [target?.complementCutAfter ?? target?.complement_cut_after];
  return Array.from(new Set(values.map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function restrictionSites(target) {
  return Array.isArray(target?.groupedSites) && target.groupedSites.length > 0
    ? target.groupedSites
    : target
      ? [target]
      : [];
}

function describeRestrictionEnds(target) {
  const descriptions = restrictionSites(target).map((site) => {
    const overhang = String(site.overhang || "").toLowerCase();
    const label = overhang === "5 prime"
      ? "5′ overhang"
      : overhang === "3 prime"
        ? "3′ overhang"
        : overhang === "blunt"
          ? "Blunt ends"
          : site.overhang;
    const sequence = String(site.overhangSequence || "").toUpperCase();
    return `${label || "Unknown ends"}${sequence ? ` · ${sequence}` : ""}`;
  });
  return Array.from(new Set(descriptions.filter(Boolean))).join("; ");
}

function describeRestrictionSiteCounts(target) {
  const counts = Array.isArray(target?.siteCounts) ? target.siteCounts : [];
  if (counts.length === 0) return target?.siteFrequency;
  if (counts.length === 1) return counts[0].count.toLocaleString();
  return counts.map((item) => `${item.name}: ${item.count.toLocaleString()}`).join(" · ");
}

export function nonOverlappingCoordinateTickIndexes(measurements, minimumGap = 6) {
  const visible = [];
  let previousRight = Number.NEGATIVE_INFINITY;
  for (const [index, measurement] of measurements.entries()) {
    const left = Number(measurement?.left);
    const right = Number(measurement?.right);
    if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) continue;
    if (left < previousRight + minimumGap) continue;
    visible.push(index);
    previousRight = right;
  }
  return visible;
}

export function translationCodonPlacements(codonPositions, blockStart, blockEnd) {
  const positions = codonPositions.map(Number).filter(Number.isFinite);
  if (positions.length === 0) return [];
  const directStart = Math.min(...positions);
  const directEnd = Math.max(...positions);
  const centerPosition = positions.length >= 3
    ? positions[1]
    : positions[Math.floor((positions.length - 1) / 2)];
  const visiblePositions = Array.from(new Set(positions
    .filter((position) => position >= blockStart && position <= blockEnd)))
    .sort((left, right) => left - right);
  if (visiblePositions.length === 0) return [];
  const visibleRanges = [];
  for (const position of visiblePositions) {
    const previous = visibleRanges.at(-1);
    if (previous && previous.visibleEnd + 1 === position) previous.visibleEnd = position;
    else visibleRanges.push({ visibleStart: position, visibleEnd: position });
  }
  const crossesBlock = positions.some((position) => position < blockStart || position > blockEnd);
  return visibleRanges.map(({ visibleStart, visibleEnd }) => ({
    centerPosition,
    directStart,
    directEnd,
    visibleStart,
    visibleEnd,
    gridStart: visibleStart - blockStart + 1,
    span: visibleEnd - visibleStart + 1,
    containsCenter: centerPosition >= visibleStart && centerPosition <= visibleEnd,
    crossesBlock
  }));
}

export function translationCodonPlacement(codonPositions, blockStart, blockEnd) {
  const placements = translationCodonPlacements(codonPositions, blockStart, blockEnd);
  return placements.find((placement) => placement.containsCenter) ?? placements[0] ?? null;
}

export function intervalPlacementForBlock(intervalStart, intervalEnd, blockStart, blockEnd) {
  const sourceStart = Number(intervalStart);
  const sourceEnd = Number(intervalEnd);
  const visibleBlockStart = Number(blockStart);
  const visibleBlockEnd = Number(blockEnd);
  if (![sourceStart, sourceEnd, visibleBlockStart, visibleBlockEnd].every(Number.isFinite) ||
      sourceEnd < sourceStart || visibleBlockEnd < visibleBlockStart ||
      sourceEnd < visibleBlockStart || sourceStart > visibleBlockEnd) {
    return null;
  }
  const visibleStart = Math.max(sourceStart, visibleBlockStart);
  const visibleEnd = Math.min(sourceEnd, visibleBlockEnd);
  return {
    clippedLeft: sourceStart < visibleBlockStart,
    clippedRight: sourceEnd > visibleBlockEnd,
    gridStart: visibleStart - visibleBlockStart + 1,
    span: visibleEnd - visibleStart + 1,
    visibleEnd,
    visibleStart
  };
}

function sameTarget(left, right) {
  if (!left || !right) return false;
  return left.kind === right.kind &&
    Number(left.position ?? left.start) === Number(right.position ?? right.start) &&
    String(left.label || "") === String(right.label || "") &&
    String(left.strand || "") === String(right.strand || "");
}

function humanizeFeatureType(value) {
  const text = String(value || "Feature").replaceAll("_", " ").trim();
  return text.toLowerCase() === "cds" ? "CDS" : text.replace(/^./, (letter) => letter.toUpperCase());
}

function describeStrand(value) {
  if (value === "+") return "+ (forward)";
  if (value === "-") return "− (reverse)";
  return value;
}

function applyDirectionalClass(element, target) {
  if (target?.strand === "+") {
    element.classList.add("sequence-extractor-direction-forward");
    element.dataset.strandDirection = "forward";
  } else if (target?.strand === "-") {
    element.classList.add("sequence-extractor-direction-reverse");
    element.dataset.strandDirection = "reverse";
  }
}

function describeFragmentEnd(end, side) {
  if (!end) return "Unknown";
  if (Array.isArray(end.alternatives) && end.alternatives.length > 0) {
    return end.alternatives.map((alternative) => describeFragmentEnd(alternative, side)).join("; ");
  }
  const geometry = fragmentEndGeometry(end, side);
  if (geometry.overhang === "blunt") return `Blunt · ${end.label || "end"}`;
  const overhang = geometry.overhang === "5 prime" ? "5′ overhang" : geometry.overhang === "3 prime" ? "3′ overhang" : geometry.overhang;
  const sequence = geometry.sequence ? ` ${geometry.sequence}` : "";
  return `${overhang}${sequence} · ${end.label || "end"}`;
}

function commonFragmentEndChemistry(end) {
  const alternatives = Array.isArray(end?.alternatives) && end.alternatives.length > 0 ? end.alternatives : end ? [end] : [];
  const commonValue = (key) => {
    const values = new Set(alternatives.map((candidate) => String(candidate?.[key] || "unknown")));
    return values.size === 1 ? values.values().next().value : "unknown";
  };
  return {
    fivePrimePhosphate: commonValue("fivePrimePhosphate"),
    threePrimeHydroxyl: commonValue("threePrimeHydroxyl")
  };
}

function compactFragmentEndChemistry(end) {
  const chemistry = commonFragmentEndChemistry(end);
  const fivePrime = chemistry.fivePrimePhosphate === "present"
    ? "5′-P"
    : chemistry.fivePrimePhosphate === "absent"
      ? "5′-OH"
      : "5′ chemistry ?";
  if (chemistry.threePrimeHydroxyl === "present") return fivePrime;
  return `${fivePrime} · ${chemistry.threePrimeHydroxyl === "blocked" ? "3′ blocked" : "3′ chemistry ?"}`;
}

function describeFragmentEndChemistry(end) {
  const chemistry = commonFragmentEndChemistry(end);
  const fivePrime = chemistry.fivePrimePhosphate === "present"
    ? "5′ phosphate present"
    : chemistry.fivePrimePhosphate === "absent"
      ? "5′ phosphate absent"
      : "5′ phosphate unknown";
  const threePrime = chemistry.threePrimeHydroxyl === "present"
    ? "3′ hydroxyl present"
    : chemistry.threePrimeHydroxyl === "blocked"
      ? "3′ hydroxyl blocked"
      : "3′ hydroxyl unknown";
  return `${fivePrime} · ${threePrime}`;
}

function ligationChemistryOutcome(compatibility) {
  const status = compatibility?.ligation?.status;
  const sealability = compatibility?.ligationChemistryStatus || compatibility?.ligation?.sealability;
  if (sealability === "unknown") return { state: "unknown", label: "Unknown" };
  if (sealability === "sealable") {
    return {
      state: "sealable",
      label: status === "nicked" ? "Sealable · one nick remains" : "Sealable"
    };
  }
  return { state: "not-sealable", label: "Not sealable" };
}

function makeCompatibilityResults(compatibility) {
  const results = document.createElement("div");
  results.className = "sequence-extractor-stack-compatibility";
  const geometry = document.createElement("span");
  geometry.className = `sequence-extractor-stack-compatibility-result is-${compatibility.compatible ? "compatible" : "incompatible"}`;
  const geometryLabel = document.createElement("strong");
  geometryLabel.textContent = "End geometry";
  const geometryValue = document.createElement("span");
  geometryValue.className = "sequence-extractor-stack-compatibility-value";
  geometryValue.textContent = compatibility.compatible ? "Compatible" : "Incompatible";
  geometry.append(geometryLabel, geometryValue);
  const chemistryOutcome = ligationChemistryOutcome(compatibility);
  const chemistry = document.createElement("span");
  chemistry.className = `sequence-extractor-stack-compatibility-result is-${chemistryOutcome.state}`;
  const chemistryLabel = document.createElement("strong");
  chemistryLabel.textContent = "Ligation chemistry";
  const chemistryValue = document.createElement("span");
  chemistryValue.className = "sequence-extractor-stack-compatibility-value";
  chemistryValue.textContent = chemistryOutcome.label;
  chemistry.append(chemistryLabel, chemistryValue);
  results.append(geometry, chemistry);
  return results;
}

function makeAssemblyPreviewResults(preview) {
  const methodId = preview?.method?.id;
  const junction = preview?.junctions?.[0];
  if (!methodId || methodId === "direct-ligation") {
    return makeCompatibilityResults(junction?.compatibility || {});
  }
  const results = document.createElement("div");
  results.className = "sequence-extractor-stack-compatibility";
  const addResult = (label, value, state) => {
    const row = document.createElement("span");
    row.className = `sequence-extractor-stack-compatibility-result is-${state}`;
    const heading = document.createElement("strong");
    heading.textContent = label;
    const resultValue = document.createElement("span");
    resultValue.className = "sequence-extractor-stack-compatibility-value";
    resultValue.textContent = value;
    row.append(heading, resultValue);
    results.append(row);
  };
  if (["gibson", "lic", "slic", "user-assembly"].includes(methodId)) {
    addResult(
      "Terminal overlap",
      junction?.overlap ? `${junction.overlap.length.toLocaleString()} bp` : "Not found",
      junction?.overlap ? "compatible" : "incompatible"
    );
    addResult(
      "Predicted product",
      methodId === "gibson" ? "Filled and sealed" : "Idealized annealed intermediate; cellular repair expected",
      preview.ready ? (methodId === "gibson" ? "compatible" : "conditional") : "incompatible"
    );
    return results;
  }
  if (methodId === "site-specific-recombination") {
    addResult(
      "Recombination sites",
      junction?.recombination?.compatible ? "Compatible" : "Incompatible",
      junction?.recombination?.compatible ? "compatible" : "incompatible"
    );
    addResult(
      "Crossover sequence",
      junction?.recombination?.resultingJunctionSequence ? "Defined" : "Missing",
      junction?.recombination?.resultingJunctionSequence ? "compatible" : "conditional"
    );
    return results;
  }
  addResult(
    "Method requirements",
    junction?.methodCompatible ? "Satisfied" : "Not satisfied",
    junction?.methodCompatible ? "compatible" : "incompatible"
  );
  const chemistryOutcome = methodId === "topo-ta"
    ? { label: junction?.ready ? "TOPO-activated" : "Activation missing", state: junction?.ready ? "compatible" : "conditional" }
    : ligationChemistryOutcome(junction?.compatibility);
  addResult("Junction chemistry", chemistryOutcome.label, chemistryOutcome.state);
  return results;
}

function summarizeFragmentEndVisual(end, side) {
  const alternatives = Array.isArray(end?.alternatives) && end.alternatives.length > 0
    ? end.alternatives
    : end
      ? [end]
      : [];
  if (alternatives.length === 0) {
    return { kind: "unknown", labels: ["Unknown end"], overhang: "unknown", sequence: "", variantCount: 0 };
  }
  const geometries = new Map();
  for (const alternative of alternatives) {
    const geometry = fragmentEndGeometry(alternative, side);
    geometries.set(`${geometry.overhang}:${geometry.sequence}`, geometry);
  }
  const labels = Array.from(new Set(alternatives.map((alternative) => alternative.label).filter(Boolean)));
  const kinds = Array.from(new Set(alternatives.map((alternative) => alternative.kind).filter(Boolean)));
  if (geometries.size > 1) {
    return {
      kind: kinds.length === 1 ? kinds[0] : "multiple",
      labels,
      overhang: "multiple",
      sequence: "",
      ...commonFragmentEndChemistry(end),
      variantCount: geometries.size
    };
  }
  return {
    kind: kinds.length === 1 ? kinds[0] : "multiple",
    labels,
    ...geometries.values().next().value,
    ...commonFragmentEndChemistry(end),
    variantCount: 1
  };
}

export function fragmentEndProtrudingRow(overhang, side) {
  if (overhang === "5 prime") return side === "left" ? "top" : "bottom";
  if (overhang === "3 prime") return side === "left" ? "bottom" : "top";
  if (overhang === "multiple") return side === "left" ? "top" : "bottom";
  return "";
}

function fragmentSequenceCell(text, kind = "base", overhang = false, position = null) {
  return { kind, overhang, position, text };
}

const fragmentPreviewProducts = new WeakMap();

function complementPreviewSequence(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false }));
}

function fragmentPreviewExtensionColumns(product) {
  const left = summarizeFragmentEndVisual(product?.ends?.left, "left");
  const right = summarizeFragmentEndVisual(product?.ends?.right, "right");
  return (left.overhang === "3 prime" ? Array.from(left.sequence).length : 0) +
    (right.overhang === "5 prime" ? Array.from(right.sequence).length : 0);
}

export function fragmentPreviewFlankLengthForColumns(product, maxColumns, maximumFlankLength = 48) {
  const sequenceLength = Array.from(String(product?.sequence || "")).length;
  if (sequenceLength <= 1) return 1;
  const extensionColumns = fragmentPreviewExtensionColumns(product);
  const safeColumns = Math.max(3, Math.floor(Number(maxColumns) || 3));
  if (sequenceLength + extensionColumns <= safeColumns) return sequenceLength;
  const fittedFlankLength = Math.floor((safeColumns - extensionColumns - 1) / 2);
  return Math.max(1, Math.min(sequenceLength, Math.floor(Number(maximumFlankLength) || 48), fittedFlankLength));
}

export function makeFragmentSequencePreview(product, flankLength = 6) {
  const sequence = String(product?.sequence || "").toUpperCase();
  const safeFlankLength = Math.max(1, Math.floor(Number(flankLength) || 6));
  const left = summarizeFragmentEndVisual(product?.ends?.left, "left");
  const right = summarizeFragmentEndVisual(product?.ends?.right, "right");
  const sequenceCharacters = Array.from(sequence);
  const visibleCharacters = sequenceCharacters.length > safeFlankLength * 2
    ? [
        ...sequenceCharacters.slice(0, safeFlankLength).map((base, position) => ({ base, position })),
        { base: "…", position: null },
        ...sequenceCharacters.slice(-safeFlankLength).map((base, index) => ({
          base,
          position: sequenceCharacters.length - safeFlankLength + index
        }))
      ]
    : sequenceCharacters.map((base, position) => ({ base, position }));
  const top = visibleCharacters.map(({ base, position }) => fragmentSequenceCell(base, base === "…" ? "ellipsis" : "base", false, position));
  const bottom = visibleCharacters.map(({ base, position }) => fragmentSequenceCell(
    base === "…" ? "…" : complementPreviewSequence(base)[0] || "N",
    base === "…" ? "ellipsis" : "base",
    false,
    position
  ));
  const leftOverhangLength = Array.from(left.sequence).length;
  const rightOverhangLength = Array.from(right.sequence).length;

  if (left.overhang === "5 prime") {
    for (let index = 0; index < top.length; index += 1) {
      if (top[index].kind !== "base" || top[index].position >= leftOverhangLength) continue;
      top[index].overhang = true;
      bottom[index] = fragmentSequenceCell("", "gap");
    }
  } else if (left.overhang === "3 prime" && leftOverhangLength > 0) {
    const extension = Array.from(left.sequence).reverse();
    top.unshift(...extension.map(() => fragmentSequenceCell("", "gap")));
    bottom.unshift(...extension.map((base) => fragmentSequenceCell(base, "base", true)));
  }

  if (right.overhang === "5 prime" && rightOverhangLength > 0) {
    const extension = Array.from(right.sequence).reverse();
    top.push(...extension.map(() => fragmentSequenceCell("", "gap")));
    bottom.push(...extension.map((base) => fragmentSequenceCell(base, "base", true)));
  } else if (right.overhang === "3 prime") {
    const overhangStart = sequenceCharacters.length - rightOverhangLength;
    for (let index = top.length - 1; index >= 0; index -= 1) {
      if (top[index].kind !== "base" || top[index].position < overhangStart) continue;
      top[index].overhang = true;
      bottom[index] = fragmentSequenceCell("", "gap");
    }
  }

  return {
    bottom,
    left,
    right,
    top,
    truncated: sequenceCharacters.length > safeFlankLength * 2
  };
}

function fragmentEndCaption(summary, side, options = {}) {
  const geometry = summary.overhang === "blunt"
    ? "blunt"
    : summary.overhang === "5 prime"
      ? `5′${summary.sequence ? ` ${summary.sequence}` : " overhang"}`
      : summary.overhang === "3 prime"
        ? `3′${summary.sequence ? ` ${summary.sequence}` : " overhang"}`
        : summary.overhang === "multiple"
          ? `${summary.variantCount} possible ends`
          : "unknown end";
  const source = summary.labels.join(" / ");
  const chemistry = compactFragmentEndChemistry(summary);
  const chemistrySuffix = options.omitUnknownChemistry && chemistry.includes("?")
    ? ""
    : ` · ${chemistry}`;
  return `${side === "left" ? "L" : "R"} · ${geometry}${source ? ` · ${source}` : ""}${chemistrySuffix}`;
}

function makeFragmentSequenceRow(cells, startLabel, endLabel, rowName) {
  const row = document.createElement("div");
  row.className = `sequence-extractor-fragment-strand is-${rowName}`;
  const start = document.createElement("span");
  start.className = "sequence-extractor-fragment-orientation";
  start.textContent = startLabel;
  const sequence = document.createElement("span");
  sequence.className = "sequence-extractor-fragment-sequence";
  sequence.style.setProperty("--sequence-extractor-fragment-columns", String(cells.length));
  const occupiedIndexes = cells
    .map((cell, index) => cell.kind === "gap" ? -1 : index)
    .filter((index) => index >= 0);
  const firstOccupied = occupiedIndexes[0] ?? -1;
  const lastOccupied = occupiedIndexes.at(-1) ?? -1;
  for (const [index, cell] of cells.entries()) {
    const base = document.createElement("span");
    base.className = `sequence-extractor-fragment-base is-${cell.kind}${cell.overhang ? " is-overhang" : ""}`;
    if (index === firstOccupied) {
      base.classList.add("is-left-terminus");
      base.dataset.terminus = startLabel;
    }
    if (index === lastOccupied) {
      base.classList.add("is-right-terminus");
      base.dataset.terminus = endLabel;
    }
    if (cell.overhang && !cells[index - 1]?.overhang) base.classList.add("is-overhang-start");
    if (cell.overhang && !cells[index + 1]?.overhang) base.classList.add("is-overhang-end");
    base.textContent = cell.text;
    base.setAttribute("aria-hidden", cell.kind === "gap" ? "true" : "false");
    sequence.append(base);
  }
  const end = document.createElement("span");
  end.className = "sequence-extractor-fragment-orientation";
  end.textContent = endLabel;
  row.append(start, sequence, end);
  return row;
}

function renderFragmentSequenceRows(strands, product, flankLength) {
  const preview = makeFragmentSequencePreview(product, flankLength);
  strands.replaceChildren(
    makeFragmentSequenceRow(preview.top, "5′", "3′", "forward"),
    makeFragmentSequenceRow(preview.bottom, "3′", "5′", "reverse")
  );
  strands.dataset.flankLength = String(flankLength);
  return preview;
}

function fragmentSequenceColumnCapacity(strands) {
  const row = strands.querySelector(".sequence-extractor-fragment-strand");
  const sequence = row?.querySelector(".sequence-extractor-fragment-sequence");
  const base = sequence?.querySelector(".sequence-extractor-fragment-base");
  const orientations = row?.querySelectorAll(".sequence-extractor-fragment-orientation") ?? [];
  if (!row || !sequence || !base) return 13;
  const orientationWidth = Array.from(orientations)
    .reduce((total, element) => total + element.getBoundingClientRect().width, 0);
  const availableWidth = Math.max(0, row.getBoundingClientRect().width - orientationWidth);
  const cellWidth = base.getBoundingClientRect().width || 8.8;
  return Math.max(3, Math.floor(availableWidth / cellWidth));
}

function fitFragmentSequenceRows(visual, product) {
  const strands = visual.querySelector(".sequence-extractor-fragment-strands");
  if (!strands?.isConnected) return;
  const flankLength = fragmentPreviewFlankLengthForColumns(
    product,
    fragmentSequenceColumnCapacity(strands)
  );
  if (Number(strands.dataset.flankLength) === flankLength) return;
  renderFragmentSequenceRows(strands, product, flankLength);
}

export function makeFragmentEndsVisual(product, options = {}) {
  const flankLength = Math.max(1, Math.floor(Number(options.flankLength) || 6));
  const preview = makeFragmentSequencePreview(product, flankLength);
  const visual = document.createElement("div");
  visual.className = "sequence-extractor-stack-end-visual";
  fragmentPreviewProducts.set(visual, product);
  visual.setAttribute("aria-label", `Fragment ends. Left: ${describeFragmentEnd(product?.ends?.left, "left")}. Right: ${describeFragmentEnd(product?.ends?.right, "right")}.`);
  const captions = document.createElement("div");
  captions.className = "sequence-extractor-fragment-end-captions";
  const left = document.createElement("span");
  left.className = "is-left";
  left.textContent = fragmentEndCaption(preview.left, "left", options);
  left.title = describeFragmentEnd(product?.ends?.left, "left");
  const right = document.createElement("span");
  right.className = "is-right";
  right.textContent = fragmentEndCaption(preview.right, "right", options);
  right.title = describeFragmentEnd(product?.ends?.right, "right");
  captions.append(left, right);
  const strands = document.createElement("div");
  strands.className = "sequence-extractor-fragment-strands";
  renderFragmentSequenceRows(strands, product, flankLength);
  visual.append(captions, strands);
  return visual;
}

function makeExpandedFragmentDuplex(product) {
  const preview = makeFragmentSequencePreview(product);
  const panel = document.createElement("section");
  panel.className = "sequence-extractor-stack-duplex";
  fragmentPreviewProducts.set(panel, product);
  panel.setAttribute("aria-label", `Aligned fragment duplex. Left: ${describeFragmentEnd(product?.ends?.left, "left")}. Right: ${describeFragmentEnd(product?.ends?.right, "right")}.`);
  const heading = document.createElement("h5");
  heading.textContent = "Aligned duplex";
  const captions = document.createElement("div");
  captions.className = "sequence-extractor-fragment-end-captions";
  const left = document.createElement("span");
  left.className = "is-left";
  left.textContent = fragmentEndCaption(preview.left, "left");
  left.title = describeFragmentEnd(product?.ends?.left, "left");
  const right = document.createElement("span");
  right.className = "is-right";
  right.textContent = fragmentEndCaption(preview.right, "right");
  right.title = describeFragmentEnd(product?.ends?.right, "right");
  captions.append(left, right);
  const strands = document.createElement("div");
  strands.className = "sequence-extractor-fragment-strands";
  renderFragmentSequenceRows(strands, product, 6);
  const note = document.createElement("p");
  note.className = "sequence-extractor-stack-duplex-note";
  note.textContent = "Rows are aligned antiparallel. Colored terminal bases are unpaired overhangs; dots mark absent partners. The gap-free fields below are written 5′→3′, and Fragment sequence follows the card’s current orientation—not necessarily the source record’s forward strand.";
  panel.append(heading, captions, strands, note);
  return panel;
}

function makeAssemblySourceMap(product) {
  const segments = product?.provenance?.segments ?? [];
  if (segments.length === 0) return null;
  const sources = product?.provenance?.sources ?? [];
  const sourceNames = Array.from(new Set(segments.map((segment) => segment.sourceName).filter(Boolean)));
  const map = document.createElement("div");
  map.className = "sequence-extractor-assembly-source-map";
  map.setAttribute("aria-label", `Assembly sources: ${sourceNames.join(", ")}`);
  for (const [index, segment] of segments.entries()) {
    const length = Math.max(1, Number(segment.outputEnd) - Number(segment.outputStart) + 1);
    const sourceIndex = sources.findIndex((source) => source.id === segment.sourceId || source.name === segment.sourceName);
    const bar = document.createElement("span");
    bar.className = `sequence-extractor-assembly-source-segment source-color-${(sourceIndex >= 0 ? sourceIndex : index) % 6}`;
    bar.style.flexGrow = String(length);
    bar.textContent = segment.sourceName || `Source ${index + 1}`;
    bar.title = `${bar.textContent} · output ${Number(segment.outputStart).toLocaleString()}–${Number(segment.outputEnd).toLocaleString()} · ${segment.orientation === "-" ? "reverse" : "forward"} orientation`;
    bar.tabIndex = 0;
    bar.setAttribute("aria-label", bar.title);
    map.append(bar);
  }
  return map;
}

function makeAssemblyProvenanceDetails(product) {
  const provenance = product?.provenance;
  if (!provenance?.sources?.length) return null;
  const details = document.createElement("details");
  details.className = "sequence-extractor-assembly-provenance";
  const summary = document.createElement("summary");
  const sourceCount = provenance.sources.filter((source) => source.type !== "end-treatment").length;
  const junctionCount = provenance.junctions?.length ?? 0;
  configureDisclosure(
    details,
    summary,
    "Sources & junctions",
    `${sourceCount.toLocaleString()} ${sourceCount === 1 ? "fragment" : "fragments"} · ${junctionCount.toLocaleString()} ${junctionCount === 1 ? "junction" : "junctions"}`
  );
  const method = document.createElement("p");
  method.textContent = `Method: ${provenance.assembly?.methodLabel || provenance.method || "assembly"}`;
  const methodNote = provenance.assembly?.digestionModel
    ? document.createElement("p")
    : null;
  if (methodNote) {
    methodNote.className = "sequence-extractor-assembly-method-note";
    methodNote.textContent = provenance.assembly.recognitionSitesRemoved
      ? `Recognition sites removed. ${provenance.assembly.digestionModel}`
      : provenance.assembly.digestionModel;
  }
  const sourceHeading = document.createElement("h5");
  sourceHeading.textContent = "Source fragments";
  const sourceList = document.createElement("ul");
  for (const source of provenance.sources) {
    const item = document.createElement("li");
    item.textContent = `${source.name} · ${Number(source.length || 0).toLocaleString()} bp${source.recordTitle ? ` · ${source.recordTitle}` : ""}`;
    sourceList.append(item);
  }
  const junctionHeading = document.createElement("h5");
  junctionHeading.textContent = "Junctions";
  const junctionList = document.createElement("ul");
  for (const junction of provenance.junctions ?? []) {
    const item = document.createElement("li");
    const location = junction.overlapStart != null && junction.overlapEnd != null
      ? `overlap ${Number(junction.overlapStart).toLocaleString()}–${Number(junction.overlapEnd).toLocaleString()}`
      : junction.recombinationStart != null && junction.recombinationEnd != null
        ? `recombined site ${Number(junction.recombinationStart).toLocaleString()}–${Number(junction.recombinationEnd).toLocaleString()}`
        : `between ${Number(junction.position).toLocaleString()} and ${(Number(junction.position) + 1).toLocaleString()}`;
    item.textContent = `${junction.leftName} → ${junction.rightName} · ${location} · ${junction.label}${junction.chemistryLabel ? ` · ${junction.chemistryLabel}` : ""}`;
    junctionList.append(item);
  }
  details.append(summary, method);
  if (methodNote) details.append(methodNote);
  details.append(sourceHeading, sourceList, junctionHeading, junctionList);
  if (provenance.operations?.length) {
    const operationHeading = document.createElement("h5");
    operationHeading.textContent = "Operations";
    const operationList = document.createElement("ol");
    operationList.className = "sequence-extractor-assembly-operation-list";
    for (const operation of provenance.operations) {
      const item = document.createElement("li");
      if (operation.operation === "end-treatment") {
        const target = operation.target === "both" ? "whole fragment" : `${operation.target} end`;
        item.textContent = `${operation.label} · ${target} · ${operation.enzyme || operation.method || "method not recorded"}${operation.method ? ` · ${operation.method}` : ""}`;
      } else if (operation.operation === "join") {
        item.textContent = `Join ${operation.leftName} → ${operation.rightName} · ${operation.compatibility}`;
      } else if (operation.operation === "overlap-assembly") {
        item.textContent = `${operation.method === "gibson" ? "Gibson Assembly / NEBuilder HiFi" : operation.method === "lic" ? "LIC" : operation.method === "slic" ? "SLIC" : "USER"} · ${operation.leftName} → ${operation.rightName} · ${Number(operation.overlapLength).toLocaleString()} bp overlap · ${(operation.steps || []).join(" → ")}`;
      } else if (operation.operation === "topo-ta-assembly") {
        item.textContent = `TOPO TA · ${operation.leftName} → ${operation.rightName} · ${operation.mechanism}`;
      } else if (operation.operation === "site-specific-recombination") {
        item.textContent = `${operation.method} · ${operation.leftType} × ${operation.rightType} → ${operation.resultingType}`;
      } else {
        item.textContent = operation.label || operation.operation || "Operation";
      }
      operationList.append(item);
    }
    details.append(operationHeading, operationList);
  }
  return details;
}

function makeTreatmentDuplexSnapshot(label, product) {
  const snapshot = document.createElement("section");
  snapshot.className = "sequence-extractor-stack-treatment-duplex";
  fragmentPreviewProducts.set(snapshot, product);
  const heading = document.createElement("h6");
  heading.textContent = label;
  const captions = document.createElement("div");
  captions.className = "sequence-extractor-fragment-end-captions";
  const preview = makeFragmentSequencePreview(product);
  const left = document.createElement("span");
  left.className = "is-left";
  left.textContent = fragmentEndCaption(preview.left, "left");
  const right = document.createElement("span");
  right.className = "is-right";
  right.textContent = fragmentEndCaption(preview.right, "right");
  captions.append(left, right);
  const strands = document.createElement("div");
  strands.className = "sequence-extractor-fragment-strands";
  renderFragmentSequenceRows(strands, product, 6);
  snapshot.append(heading, captions, strands);
  return snapshot;
}

function treatmentCompatibilityComparisons(beforeProduct, afterProduct, previousProduct, nextProduct) {
  const comparisons = [];
  if (previousProduct) {
    comparisons.push({
      label: "Left interface",
      before: assessFragmentEndCompatibility(previousProduct.ends?.right, beforeProduct.ends?.left),
      after: assessFragmentEndCompatibility(previousProduct.ends?.right, afterProduct.ends?.left)
    });
  }
  if (nextProduct) {
    comparisons.push({
      label: "Right interface",
      before: assessFragmentEndCompatibility(beforeProduct.ends?.right, nextProduct.ends?.left),
      after: assessFragmentEndCompatibility(afterProduct.ends?.right, nextProduct.ends?.left)
    });
  }
  return comparisons;
}

function makeTreatmentCompatibilityReport(beforeProduct, afterProduct, previousProduct, nextProduct) {
  const report = document.createElement("div");
  report.className = "sequence-extractor-stack-treatment-compatibility";
  const comparisons = treatmentCompatibilityComparisons(beforeProduct, afterProduct, previousProduct, nextProduct);
  if (!comparisons.length) {
    const empty = document.createElement("p");
    empty.textContent = "Ligation compatibility · no adjacent fragment to compare.";
    report.append(empty);
    return report;
  }
  for (const comparison of comparisons) {
    const row = document.createElement("div");
    row.className = "sequence-extractor-stack-treatment-compatibility-row";
    const heading = document.createElement("strong");
    heading.textContent = comparison.label;
    const geometry = document.createElement("span");
    geometry.textContent = `End geometry · ${comparison.before.compatible ? "compatible" : "incompatible"} → ${comparison.after.compatible ? "compatible" : "incompatible"}`;
    const beforeChemistry = ligationChemistryOutcome(comparison.before).label.toLowerCase();
    const afterChemistry = ligationChemistryOutcome(comparison.after).label.toLowerCase();
    const chemistry = document.createElement("span");
    chemistry.textContent = `Ligation chemistry · ${beforeChemistry} → ${afterChemistry}`;
    row.append(heading, geometry, chemistry);
    report.append(row);
  }
  return report;
}

function makeFragmentTreatmentDetails(product, options = {}) {
  const { onApply, onUndo, canUndo = false, previousProduct = null, nextProduct = null } = options;
  const details = document.createElement("details");
  details.className = "sequence-extractor-stack-treatments";
  const summary = document.createElement("summary");
  configureDisclosure(
    details,
    summary,
    "End treatments",
    `L ${compactFragmentEndChemistry(product.ends?.left)} · R ${compactFragmentEndChemistry(product.ends?.right)}`
  );
  const chemistry = document.createElement("div");
  chemistry.className = "sequence-extractor-stack-treatment-chemistry";
  const leftChemistry = document.createElement("span");
  leftChemistry.textContent = `Left · ${describeFragmentEndChemistry(product.ends?.left)}`;
  const rightChemistry = document.createElement("span");
  rightChemistry.textContent = `Right · ${describeFragmentEndChemistry(product.ends?.right)}`;
  chemistry.append(leftChemistry, rightChemistry);

  const controls = document.createElement("div");
  controls.className = "sequence-extractor-stack-treatment-controls";
  const treatmentLabel = document.createElement("label");
  treatmentLabel.textContent = "Treatment";
  const treatmentSelect = document.createElement("select");
  treatmentSelect.setAttribute("aria-label", "Fragment end treatment");
  treatmentLabel.append(treatmentSelect);
  const method = document.createElement("div");
  method.className = "sequence-extractor-stack-treatment-method";
  const methodLabel = document.createElement("strong");
  methodLabel.textContent = "Method";
  const methodValue = document.createElement("span");
  method.append(methodLabel, methodValue);
  const apply = makeButton("Apply treatment", "sequence-extractor-stack-treatment-apply", () => {});
  const undo = makeButton("Undo last treatment", "sequence-extractor-stack-treatment-undo", () => onUndo?.());
  undo.disabled = !canUndo;
  const actions = document.createElement("div");
  actions.className = "sequence-extractor-stack-treatment-actions";
  actions.append(apply, undo);
  controls.append(treatmentLabel, actions);
  const scopeNote = document.createElement("p");
  scopeNote.className = "sequence-extractor-stack-treatment-scope";
  scopeNote.textContent = "Applied to every compatible end on this fragment; incompatible or already-correct ends remain unchanged.";

  const preview = document.createElement("div");
  preview.className = "sequence-extractor-stack-treatment-preview";
  const fitTreatmentDuplexPreviews = () => {
    for (const snapshot of preview.querySelectorAll(".sequence-extractor-stack-treatment-duplex")) {
      const snapshotProduct = fragmentPreviewProducts.get(snapshot);
      if (snapshotProduct) fitFragmentSequenceRows(snapshot, snapshotProduct);
    }
  };
  let proposedProduct = null;
  let applicableTreatments = [];
  const updatePreview = () => {
    preview.replaceChildren();
    const selectedTreatment = applicableTreatments.find((treatment) => treatment.id === treatmentSelect.value);
    methodValue.textContent = selectedTreatment
      ? `${selectedTreatment.enzyme} · ${selectedTreatment.method}`
      : "No applicable treatment for this fragment.";
    if (!selectedTreatment) {
      proposedProduct = null;
      apply.disabled = true;
      preview.classList.add("is-error");
      const error = document.createElement("p");
      error.textContent = "Choose an applicable treatment.";
      preview.append(error);
      return;
    }
    const result = applyFragmentEndTreatment(product, { type: treatmentSelect.value, target: "both" });
    proposedProduct = result.product;
    apply.disabled = !proposedProduct;
    preview.classList.toggle("is-error", !proposedProduct);
    if (!proposedProduct) {
      const error = document.createElement("p");
      error.textContent = result.error;
      preview.append(error);
      return;
    }
    const sides = ["left", "right"];
    const operation = proposedProduct.treatments?.at(-1);
    const beforeMetrics = fragmentDuplexMetrics(product);
    const afterMetrics = fragmentDuplexMetrics(proposedProduct);
    const lengthChange = afterMetrics.strandLengths.top - beforeMetrics.strandLengths.top;
    const spanChange = afterMetrics.duplexSpan - beforeMetrics.duplexSpan;
    const resultSummary = document.createElement("div");
    resultSummary.className = "sequence-extractor-stack-treatment-result";
    const resultHeading = document.createElement("h6");
    resultHeading.textContent = "Predicted result";
    resultSummary.append(resultHeading);
    for (const side of sides) {
      const row = document.createElement("div");
      row.className = `sequence-extractor-stack-treatment-result-row is-${side}`;
      const label = document.createElement("strong");
      label.textContent = side === "left" ? "Left end" : "Right end";
      const value = document.createElement("span");
      value.className = "sequence-extractor-stack-treatment-result-value";
      const geometry = document.createElement("span");
      geometry.textContent = describeFragmentEnd(proposedProduct.ends?.[side], side);
      const endChemistry = document.createElement("span");
      endChemistry.className = "sequence-extractor-stack-treatment-result-chemistry";
      endChemistry.textContent = compactFragmentEndChemistry(proposedProduct.ends?.[side]);
      value.append(geometry, endChemistry);
      const action = document.createElement("span");
      action.className = "sequence-extractor-stack-treatment-result-action";
      action.textContent = operation?.endResults?.[side]?.action || "No reported change.";
      row.append(label, value);
      row.append(action);
      resultSummary.append(row);
    }
    const lengthRow = document.createElement("div");
    lengthRow.className = "sequence-extractor-stack-treatment-result-row is-length";
    const lengthLabel = document.createElement("strong");
    lengthLabel.textContent = "DNA span";
    const lengthValue = document.createElement("span");
    lengthValue.className = "sequence-extractor-stack-treatment-result-value";
    const lengthTransition = document.createElement("span");
    lengthTransition.textContent = `Displayed 5′→3′ strand · ${beforeMetrics.strandLengths.top.toLocaleString()} → ${afterMetrics.strandLengths.top.toLocaleString()} nt`;
    lengthValue.append(lengthTransition);
    if (lengthChange !== 0) {
      const lengthDelta = document.createElement("span");
      lengthDelta.className = "sequence-extractor-stack-treatment-result-delta";
      lengthDelta.textContent = `${lengthChange > 0 ? "+" : ""}${lengthChange.toLocaleString()} nt`;
      lengthValue.append(lengthDelta);
    }
    const spanTransition = document.createElement("span");
    spanTransition.textContent = `Aligned duplex span · ${beforeMetrics.duplexSpan.toLocaleString()} → ${afterMetrics.duplexSpan.toLocaleString()} nt`;
    lengthValue.append(spanTransition);
    if (spanChange !== 0) {
      const spanDelta = document.createElement("span");
      spanDelta.className = "sequence-extractor-stack-treatment-result-delta";
      spanDelta.textContent = `${spanChange > 0 ? "+" : ""}${spanChange.toLocaleString()} columns`;
      lengthValue.append(spanDelta);
    }
    lengthRow.append(lengthLabel, lengthValue);
    resultSummary.append(lengthRow);
    const duplexes = document.createElement("div");
    duplexes.className = "sequence-extractor-stack-treatment-duplexes";
    duplexes.append(
      makeTreatmentDuplexSnapshot("Before", product),
      makeTreatmentDuplexSnapshot("After", proposedProduct)
    );
    preview.append(
      resultSummary,
      duplexes,
      makeTreatmentCompatibilityReport(product, proposedProduct, previousProduct, nextProduct)
    );
    if (details.open) requestAnimationFrame(fitTreatmentDuplexPreviews);
  };
  const updateTreatments = () => {
    const previousValue = treatmentSelect.value;
    applicableTreatments = applicableFragmentEndTreatments(product, "both");
    treatmentSelect.replaceChildren();
    for (const treatment of applicableTreatments) {
      const option = document.createElement("option");
      option.value = treatment.id;
      option.textContent = treatment.label;
      treatmentSelect.append(option);
    }
    if (applicableTreatments.some((treatment) => treatment.id === previousValue)) {
      treatmentSelect.value = previousValue;
    }
    updatePreview();
  };
  treatmentSelect.addEventListener("change", updatePreview);
  details.addEventListener("toggle", () => {
    if (details.open) requestAnimationFrame(fitTreatmentDuplexPreviews);
  });
  apply.addEventListener("click", () => {
    if (proposedProduct) onApply?.(proposedProduct);
  });
  updateTreatments();

  details.append(summary, chemistry, controls, scopeNote, method, preview);
  if (product.treatments?.length) {
    const history = document.createElement("div");
    history.className = "sequence-extractor-stack-treatment-history";
    const historySummary = document.createElement("h5");
    historySummary.textContent = `Treatment history · ${product.treatments.length.toLocaleString()}`;
    const list = document.createElement("ol");
    for (const treatment of product.treatments) {
      const item = document.createElement("li");
      item.textContent = `${treatment.label} · ${treatment.target === "both" ? "whole fragment" : `${treatment.target} end`} · ${treatment.enzyme || treatment.method || "method not recorded"}`;
      list.append(item);
    }
    history.append(historySummary, list);
    details.append(history);
  }
  return details;
}

function itemsInBlock(record, type, start, end) {
  return (record.tracks ?? [])
    .filter((track) => track.type === type)
    .flatMap((track) => track.items ?? [])
    .filter((item) => {
      const position = type === "restriction-sites"
        ? restrictionDisplayPosition(item, record.length)
        : Number(item.start);
      const itemEnd = type === "restriction-sites" ? position : Number(item.end ?? position);
      return Number.isFinite(position) && position <= end && itemEnd >= start;
    });
}

function translateCodon(codon, codonMap) {
  return codonMap.get(String(codon).replaceAll("U", "T")) || "X";
}

export function translateFragmentFrames(sequence, geneticCode = "1") {
  const source = String(sequence || "").toUpperCase().replaceAll("U", "T");
  const reverseSource = reverseComplement(source);
  const frameCodonMap = makeCodonMap(getGeneticCode(geneticCode));
  return [
    { label: "+1", offset: 0, source },
    { label: "+2", offset: 1, source },
    { label: "+3", offset: 2, source },
    { label: "−1", offset: 0, source: reverseSource },
    { label: "−2", offset: 1, source: reverseSource },
    { label: "−3", offset: 2, source: reverseSource }
  ].map((frame) => {
    let protein = "";
    for (let index = frame.offset; index + 2 < frame.source.length; index += 3) {
      protein += translateCodon(frame.source.slice(index, index + 3), frameCodonMap);
    }
    return { frame: frame.label, protein };
  });
}

function appendDetails(panel, rows) {
  const list = document.createElement("dl");
  list.className = "sequence-extractor-detail-list";
  for (const [label, value] of rows) {
    if (value === undefined || value === null || value === "") continue;
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = String(value);
    list.append(term, detail);
  }
  panel.append(list);
}

function renderSequenceTextarea(parent, label, sequence) {
  if (!sequence) return;
  const field = document.createElement("label");
  field.className = "sequence-extractor-sequence-field";
  const heading = document.createElement("span");
  heading.textContent = `${label} (${sequence.length.toLocaleString()})`;
  const textarea = document.createElement("textarea");
  textarea.readOnly = true;
  textarea.value = sequence.replace(/(.{60})/g, "$1\n").trim();
  textarea.spellcheck = false;
  field.append(heading, textarea);
  parent.append(field);
}

function makeFragmentTranslationDetails(product, geneticCode) {
  const translations = translateFragmentFrames(product.sequence, geneticCode.id);
  const details = document.createElement("details");
  details.className = "sequence-extractor-stack-translations";
  const summary = document.createElement("summary");
  configureDisclosure(details, summary, "Six-frame translation", `6 frames · NCBI table ${geneticCode.id}`);
  const note = document.createElement("p");
  note.className = "sequence-extractor-stack-translation-note";
  note.textContent = `Computed from this fragment with NCBI table ${geneticCode.id}: ${geneticCode.name}.`;
  const controls = document.createElement("div");
  controls.className = "sequence-extractor-stack-translation-controls";
  const frameLabel = document.createElement("label");
  frameLabel.textContent = "Frame";
  const frameSelect = document.createElement("select");
  frameSelect.setAttribute("aria-label", "Fragment translation frame");
  for (const translation of translations) {
    const option = document.createElement("option");
    option.value = translation.frame;
    option.textContent = translation.frame;
    frameSelect.append(option);
  }
  frameLabel.append(frameSelect);
  const length = document.createElement("span");
  length.className = "sequence-extractor-stack-translation-length";
  controls.append(frameLabel, length);
  const proteinField = document.createElement("label");
  proteinField.className = "sequence-extractor-sequence-field sequence-extractor-protein-field";
  const proteinHeading = document.createElement("span");
  proteinHeading.textContent = "Protein";
  const protein = document.createElement("textarea");
  protein.readOnly = true;
  protein.spellcheck = false;
  protein.setAttribute("aria-label", "Fragment protein translation");
  proteinField.append(proteinHeading, protein);
  const copy = makeButton("Copy protein", "", () => navigator.clipboard?.writeText(protein.value.replaceAll("\n", "")));
  copy.classList.add("sequence-extractor-stack-copy-protein");
  const update = () => {
    const translation = translations.find((candidate) => candidate.frame === frameSelect.value) ?? translations[0];
    protein.value = translation.protein.replace(/(.{60})/g, "$1\n").trim();
    length.textContent = `${translation.protein.length.toLocaleString()} aa`;
    proteinHeading.textContent = `Protein ${translation.frame}`;
  };
  frameSelect.addEventListener("change", update);
  update();
  details.append(summary, note, controls, proteinField, copy);
  return details;
}

const MAX_SELECTION_STACK_ITEMS = 10;

export function renderSequenceExtractorWorkspace(container, extractor, options = {}) {
  container.textContent = "";
  container.classList.add("sequence-extractor-output");
  const records = extractor?.records ?? [];
  if (records.length === 0) {
    container.textContent = "No nucleotide records were prepared.";
    return;
  }

  let recordIndex = 0;
  let selected = null;
  let endpoints = [];
  let product = null;
  let selectionStack = [];
  let selectionStackCounter = 0;
  let shownSelectionId = null;
  let lastStackJoin = null;
  let assemblyMethodId = "direct-ligation";
  let draggedSelectionId = null;
  let selectionTopology = "linear";
  let showFeatures = true;
  const hiddenFeatureTypesByRecord = records.map(() => new Set());
  let featureSearchMatches = [];
  let featureSearchIndex = -1;
  let showCuts = true;
  let translationMode = "cds";
  let renderedLineWidth = 0;
  let resizeFrame = 0;
  let selectionScrollFrame = 0;
  let pageScrollFrame = 0;
  let pendingRenderPageScroll = null;
  let fragmentStackScrollTop = 0;
  let resetFragmentStackScroll = false;
  let baseElementsByPosition = new Map();
  let hoverHighlightedElements = [];
  let hoverAnchor = null;
  const selectedGeneticCode = getGeneticCode(extractor.geneticCode || "1");
  const codonMap = makeCodonMap(selectedGeneticCode);

  const shell = document.createElement("div");
  shell.className = "sequence-extractor-workspace";
  const main = document.createElement("section");
  main.className = "sequence-extractor-main";
  const toolbar = document.createElement("div");
  toolbar.className = "sequence-extractor-toolbar";
  const captureToolbarPageScroll = () => {
    pendingRenderPageScroll = capturePageScrollState();
  };
  toolbar.addEventListener("pointerdown", captureToolbarPageScroll);
  toolbar.addEventListener("keydown", captureToolbarPageScroll);
  const recordControl = document.createElement("label");
  recordControl.className = "sequence-extractor-toolbar-field sequence-extractor-record-control";
  const recordLabel = document.createElement("span");
  recordLabel.textContent = records.length > 1 ? "Sequence panel" : "Record";
  const recordSelect = document.createElement("select");
  recordSelect.setAttribute("aria-label", "Sequence record");
  records.forEach((record, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${record.title} (${record.length.toLocaleString()} bp)`;
    recordSelect.append(option);
  });
  recordControl.append(recordLabel, recordSelect);
  const topologyControl = document.createElement("label");
  topologyControl.className = "sequence-extractor-toolbar-field sequence-extractor-topology-control";
  const topologyLabel = document.createElement("span");
  topologyLabel.textContent = "Selection topology";
  const topologySelect = document.createElement("select");
  topologySelect.setAttribute("aria-label", "Selection topology");
  for (const [value, label] of [["linear", "Linear"], ["circular", "Circular"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    topologySelect.append(option);
  }
  topologySelect.value = selectionTopology;
  topologyControl.append(topologyLabel, topologySelect);
  const featureToggle = document.createElement("label");
  featureToggle.className = "sequence-extractor-toolbar-toggle";
  const featureCheckbox = document.createElement("input");
  featureCheckbox.type = "checkbox";
  featureCheckbox.checked = true;
  featureCheckbox.addEventListener("change", () => {
    showFeatures = featureCheckbox.checked;
    renderDocument();
  });
  featureToggle.append(featureCheckbox, document.createTextNode("Features"));
  const featureTypeDetails = document.createElement("details");
  featureTypeDetails.className = "sequence-extractor-feature-type-control";
  const featureTypeSummary = document.createElement("summary");
  const featureTypeSummaryLabel = document.createElement("span");
  featureTypeSummaryLabel.textContent = "Feature types ·";
  const featureTypeSummaryCount = document.createElement("span");
  featureTypeSummaryCount.className = "sequence-extractor-feature-type-count";
  featureTypeSummary.append(featureTypeSummaryLabel, document.createTextNode(" "), featureTypeSummaryCount);
  const featureTypePanel = document.createElement("div");
  featureTypePanel.className = "sequence-extractor-feature-type-panel";
  const featureTypeActions = document.createElement("div");
  featureTypeActions.className = "sequence-extractor-feature-type-actions";
  const featureTypeList = document.createElement("div");
  featureTypeList.className = "sequence-extractor-feature-type-list";
  const showAllFeatureTypes = makeButton("Show all", "sequence-extractor-feature-type-action", () => {
    hiddenFeatureTypesByRecord[recordIndex].clear();
    updateFeatureTypeControl();
    runFeatureSearch("features", featureSearch.input.value);
    renderDocument();
  });
  const hideAllFeatureTypes = makeButton("Hide all", "sequence-extractor-feature-type-action", () => {
    for (const { type } of sequenceExtractorFeatureTypeCounts(activeRecord())) {
      hiddenFeatureTypesByRecord[recordIndex].add(type);
    }
    updateFeatureTypeControl();
    runFeatureSearch("features", featureSearch.input.value);
    renderDocument();
  });
  featureTypeActions.append(showAllFeatureTypes, hideAllFeatureTypes);
  featureTypePanel.append(featureTypeActions, featureTypeList);
  featureTypeDetails.append(featureTypeSummary, featureTypePanel);
  featureTypeDetails.addEventListener("toggle", () => {
    if (featureTypeDetails.open) {
      requestAnimationFrame(positionFeatureTypePanel);
    }
  });
  const cutToggle = document.createElement("label");
  cutToggle.className = "sequence-extractor-toolbar-toggle";
  const cutCheckbox = document.createElement("input");
  cutCheckbox.type = "checkbox";
  cutCheckbox.checked = true;
  cutCheckbox.addEventListener("change", () => {
    showCuts = cutCheckbox.checked;
    renderDocument();
  });
  cutToggle.append(cutCheckbox, document.createTextNode("Restriction sites"));
  const cutLegend = document.createElement("span");
  cutLegend.className = "sequence-extractor-cut-legend";
  cutLegend.title = "Restriction-site frequency in the current sequence";
  cutLegend.innerHTML = [
    '<span class="unique" aria-hidden="true"></span>single',
    '<span class="double" aria-hidden="true"></span>cuts twice',
    '<span class="repeated" aria-hidden="true"></span>3+ cuts'
  ].join(" ");
  const cutCoverage = document.createElement("span");
  cutCoverage.className = "sequence-extractor-cut-coverage";
  cutCoverage.setAttribute("aria-live", "polite");
  cutLegend.append(cutCoverage);
  const translationControl = document.createElement("label");
  translationControl.className = "sequence-extractor-toolbar-field";
  const translationLabel = document.createElement("span");
  translationLabel.textContent = "Translation";
  const translationSelect = document.createElement("select");
  translationSelect.setAttribute("aria-label", "Translation display");
  for (const [value, label] of [["cds", "Annotated CDS translations"], ["six-frame", "Six reading frames"], ["none", "Hidden"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    translationSelect.append(option);
  }
  translationSelect.value = translationMode;
  translationSelect.addEventListener("change", () => {
    translationMode = translationSelect.value;
    renderDocument();
  });
  translationControl.append(translationLabel, translationSelect);
  const translationNote = document.createElement("span");
  translationNote.className = "sequence-extractor-translation-note";
  const coordinate = document.createElement("input");
  coordinate.type = "number";
  coordinate.min = "1";
  coordinate.setAttribute("aria-label", "Jump to coordinate");
  const coordinateControl = document.createElement("label");
  coordinateControl.className = "sequence-extractor-toolbar-field sequence-extractor-coordinate-control";
  const coordinateLabel = document.createElement("span");
  coordinateLabel.textContent = "Coordinate";
  coordinateControl.append(coordinateLabel, coordinate);
  const jump = makeButton("Jump", "sequence-extractor-jump", () => {
    const value = Math.max(1, Math.min(records[recordIndex].length, Number(coordinate.value) || 1));
    document.getElementById(`sequence-extractor-base-${recordIndex}-${value}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  const status = document.createElement("span");
  status.className = "sequence-extractor-toolbar-status";
  const documentBar = document.createElement("div");
  documentBar.className = "sequence-extractor-document-bar";
  const printHeader = document.createElement("header");
  printHeader.className = "sequence-extractor-print-header";
  const printHeading = document.createElement("h1");
  printHeading.textContent = "Sequence Extractor";
  const printRecordTitle = document.createElement("strong");
  printRecordTitle.className = "sequence-extractor-print-record-title";
  const printMetadata = document.createElement("span");
  printMetadata.className = "sequence-extractor-print-metadata";
  printHeader.append(printHeading, printRecordTitle, printMetadata);
  const printActions = document.createElement("div");
  printActions.className = "sequence-extractor-print-actions";
  const printSequenceView = () => {
    featureTypeDetails.open = false;
    hideHoverCard();
    const record = activeRecord();
    const panelLabel = records.length > 1 ? `Panel ${recordIndex + 1} of ${records.length} · ` : "";
    const translationLabel = translationSelect.selectedOptions[0]?.textContent || "Translations hidden";
    printRecordTitle.textContent = record.title;
    printMetadata.textContent = `${panelLabel}${record.length.toLocaleString()} bp · ${selectionTopology} · ${translationLabel} · ${showFeatures ? "features shown" : "features hidden"} · ${showCuts ? "restriction sites shown" : "restriction sites hidden"}`;
    container.classList.add("sequence-extractor-print-target");
    document.body.classList.add("sequence-extractor-printing");

    const previousDocumentTitle = document.title;
    document.title = `${record.title} - Sequence Extractor`;
    const printMedia = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.body.classList.remove("sequence-extractor-printing");
      container.classList.remove("sequence-extractor-print-target");
      document.title = previousDocumentTitle;
      window.removeEventListener("afterprint", cleanup);
      printMedia?.removeEventListener?.("change", handlePrintMediaChange);
    };
    const handlePrintMediaChange = (event) => {
      if (!event.matches) cleanup();
    };
    window.addEventListener("afterprint", cleanup);
    printMedia?.addEventListener?.("change", handlePrintMediaChange);
    window.print();
  };
  const printView = makeButton("Print / save PDF", "sequence-extractor-print-view", printSequenceView);
  printView.title = "Print this complete color sequence view, or save it as a color PDF; choose grayscale in the system print dialog if needed";
  printActions.append(printView);
  documentBar.append(status, printActions);
  const allFeatureTracks = records.flatMap((record) => (record.tracks ?? []).filter((track) => track.type === "features"));
  const featureSearch = createViewerSearchControls({
    onSearch: runFeatureSearch,
    onPrevious: () => moveFeatureSearch(-1),
    onNext: () => moveFeatureSearch(1)
  }, {
    scopes: [["features", "Features"]],
    placeholder: "Find gene, product, locus, note, or feature type",
    featureSuggestions: makeViewerFeatureSuggestions({ tracks: allFeatureTracks })
  });
  featureSearch.element.classList.add("sequence-extractor-feature-search");
  featureSearch.scope.hidden = true;
  featureSearch.clear.textContent = "Clear search";
  const featureSearchLabel = featureSearch.element.querySelector("label > span");
  if (featureSearchLabel) featureSearchLabel.textContent = "Find feature";
  toolbar.append(
    recordControl,
    topologyControl,
    featureToggle,
    featureTypeDetails,
    cutToggle,
    cutLegend,
    translationControl,
    coordinateControl,
    jump,
    featureSearch.element,
    translationNote,
    documentBar
  );
  const documentView = document.createElement("div");
  documentView.className = "sequence-extractor-document";
  main.append(toolbar, documentView);

  const inspector = document.createElement("aside");
  inspector.className = "sequence-extractor-inspector";
  inspector.setAttribute("aria-label", "Sequence extraction details");
  const hoverCard = document.createElement("div");
  hoverCard.id = "sequence-extractor-hover-card";
  hoverCard.className = "sequence-extractor-hover-card";
  hoverCard.setAttribute("role", "tooltip");
  hoverCard.hidden = true;
  shell.append(printHeader, main, inspector, hoverCard);
  container.append(shell);

  function targetSequenceRanges(target) {
    if (!target) return [];
    const sourceRanges = Array.isArray(target.parts) && target.parts.length > 0
      ? target.parts
      : [{
          start: target.kind === "restriction-site" ? target.siteStart ?? target.position : target.start ?? target.position,
          end: target.kind === "restriction-site" ? target.siteEnd ?? target.position : target.end ?? target.position
        }];
    return sourceRanges.flatMap((range) => {
      const start = Number(range.start);
      const end = Number(range.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
      return [{
        start: Math.max(1, Math.min(start, end)),
        end: Math.min(activeRecord().length, Math.max(start, end))
      }];
    });
  }

  function targetSequenceRange(target) {
    const ranges = targetSequenceRanges(target);
    if (ranges.length === 0) return null;
    return {
      start: Math.min(...ranges.map((range) => range.start)),
      end: Math.max(...ranges.map((range) => range.end))
    };
  }

  function addBaseRangeClass(range, className) {
    if (!range) return [];
    const elements = [];
    for (let position = range.start; position <= range.end; position += 1) {
      for (const element of baseElementsByPosition.get(position) ?? []) {
        element.classList.add(className);
        elements.push(element);
      }
    }
    return elements;
  }

  function addTargetRangeClass(target, className) {
    return targetSequenceRanges(target).flatMap((range) => addBaseRangeClass(range, className));
  }

  function addStrandAwareTargetRangeClass(target, className, primaryClassName, contextClassName) {
    const elements = addTargetRangeClass(target, className);
    if (target?.strand !== "+" && target?.strand !== "-") return elements;
    for (const element of elements) {
      const isReverseDisplayStrand = element.classList.contains("complement");
      const isPrimaryStrand = target.strand === "-" ? isReverseDisplayStrand : !isReverseDisplayStrand;
      element.classList.add(isPrimaryStrand ? primaryClassName : contextClassName);
    }
    return elements;
  }

  function markRestrictionCleavage(boundary, complement, className, beforeFirstBaseClass) {
    if (!Number.isFinite(Number(boundary))) return [];
    const beforeFirstBase = Number(boundary) <= 0;
    const position = beforeFirstBase ? 1 : Math.min(activeRecord().length, Number(boundary));
    const elements = [];
    for (const element of baseElementsByPosition.get(position) ?? []) {
      if (element.classList.contains("complement") !== complement) continue;
      element.classList.add(className);
      if (beforeFirstBase && beforeFirstBaseClass) element.classList.add(beforeFirstBaseClass);
      elements.push(element);
    }
    return elements;
  }

  function addRestrictionOverhangClass(target, className) {
    const elements = [];
    for (const site of restrictionSites(target)) {
      const topCut = itemPosition(site);
      const bottomCut = Number(site.complementCutAfter ?? site.complement_cut_after);
      if (!Number.isFinite(topCut) || !Number.isFinite(bottomCut) || topCut === bottomCut) continue;
      const start = Math.max(1, Math.min(topCut, bottomCut) + 1);
      const end = Math.min(activeRecord().length, Math.max(topCut, bottomCut));
      elements.push(...addBaseRangeClass({ start, end }, className));
    }
    return elements;
  }

  function addRestrictionHoverHighlight(target) {
    const elements = addTargetRangeClass(target, "restriction-hover-range");
    elements.push(...addRestrictionOverhangClass(target, "restriction-overhang-hover"));
    elements.push(...markRestrictionCleavage(target.position, false, "restriction-hover-cleavage-forward", "is-hover-before-first-base"));
    for (const reverseCut of restrictionComplementCuts(target)) {
      elements.push(...markRestrictionCleavage(reverseCut, true, "restriction-hover-cleavage-reverse", "is-hover-before-first-base"));
    }
    return elements;
  }

  function clearHoverHighlight() {
    for (const element of hoverHighlightedElements) {
      element.classList.remove(
        "hover-range",
        "hover-strand-primary",
        "hover-strand-context",
        "restriction-hover-range",
        "restriction-overhang-hover",
        "restriction-hover-cleavage-forward",
        "restriction-hover-cleavage-reverse",
        "is-hover-before-first-base"
      );
    }
    hoverHighlightedElements = [];
  }

  function hideHoverCard() {
    hoverAnchor = null;
    hoverCard.hidden = true;
    clearHoverHighlight();
  }

  function hoverDetailRows(target) {
    const range = targetSequenceRange(target);
    const ranges = targetSequenceRanges(target);
    const sequenceLength = ranges.reduce((sum, item) => sum + item.end - item.start + 1, 0);
    if (target.kind === "restriction-site") {
      const rows = [];
      if (range) {
        rows.push(["Coordinates", ranges.map((item) => `${item.start.toLocaleString()}–${item.end.toLocaleString()}`).join(", ")]);
      }
      const reverseCuts = restrictionComplementCuts(target);
      const cutDescription = [
        `${Number(target.position).toLocaleString()} (forward)`,
        reverseCuts.length > 0 ? `${reverseCuts.map((position) => position.toLocaleString()).join(", ")} (reverse)` : ""
      ].filter(Boolean).join(" · ");
      rows.push(
        ["Class", Array.from(new Set(restrictionSites(target).map((site) => site.cleavageType).filter(Boolean))).join(" · ")],
        ["Cuts after", cutDescription],
        ["Ends", describeRestrictionEnds(target)],
        ["Sites in record", describeRestrictionSiteCounts(target)]
      );
      const recognitionRules = Array.from(new Set(restrictionSites(target).map((site) => String(site.recognition || "").toUpperCase()).filter(Boolean)));
      const matchedSequences = Array.from(new Set(restrictionSites(target).map((site) => {
        const start = Number(site.siteStart);
        const end = Number(site.siteEnd);
        return Number.isFinite(start) && Number.isFinite(end)
          ? activeRecord().sequence.slice(start - 1, end).toUpperCase()
          : "";
      }).filter(Boolean)));
      if (recognitionRules.some((rule) => !matchedSequences.includes(rule))) {
        rows.push(["Recognition pattern", recognitionRules.join(" · ")]);
      }
      return rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
    }
    const type = target.kind === "feature" ? humanizeFeatureType(target.type) : target.type || target.kind;
    const rows = [["Type", type]];
    if (range?.start === range?.end) rows.push(["Position", range.start.toLocaleString()]);
    if (range && range.start !== range.end) {
      rows.push(["Coordinates", ranges.map((item) => `${item.start.toLocaleString()}–${item.end.toLocaleString()}`).join(", ")]);
      rows.push(["Length", `${sequenceLength.toLocaleString()} bp`]);
    }
    rows.push(
      ["Recognition", target.recognition],
      ["Cut frequency", target.siteFrequency],
      ["Overhang", target.overhang],
      ["Overhang sequence", target.overhangSequence],
      ["Strand", describeStrand(target.strand)],
      ["Frame", target.frame],
      ["Codon", target.codon],
      ["Amino acid", target.aminoAcid],
      ["Translation source", target.translationSource],
      ["Computed genetic code", target.geneticCodeLabel],
      ["Input CDS transl_table", target.recordTranslationTable],
      ["CDS codon_start", target.codonStart],
      ["Mismatches", target.mismatches],
      ["Standard name", target.standardName && target.standardName !== target.label ? target.standardName : ""],
      ["Bound molecule", target.boundMoiety],
      ["Regulatory class", target.regulatoryClass],
      ["Gene", target.gene],
      ["Locus tag", target.locus_tag],
      ["Product", target.product],
      ["Feature", target.feature]
    );
    return rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
  }

  function makeRestrictionHoverDiagrams(target) {
    const groups = new Map();
    for (const site of restrictionSites(target)) {
      const start = Number(site.siteStart);
      const end = Number(site.siteEnd);
      const topCut = itemPosition(site);
      const bottomCut = Number(site.complementCutAfter ?? site.complement_cut_after);
      if (![start, end, topCut, bottomCut].every(Number.isFinite)) continue;
      const displayLeftBoundary = Math.min(start - 1, topCut, bottomCut);
      const displayRightBoundary = Math.max(end, topCut, bottomCut);
      const displaySequence = activeRecord().sequence.slice(displayLeftBoundary, displayRightBoundary).toUpperCase();
      const recognitionSequence = activeRecord().sequence.slice(start - 1, end).toUpperCase();
      if (!displaySequence || !recognitionSequence) continue;
      const key = `${start}:${end}:${topCut}:${bottomCut}`;
      if (!groups.has(key)) {
        groups.set(key, {
          bottomCut: bottomCut - displayLeftBoundary,
          displaySequence,
          names: [],
          recognitionSequence,
          recognitionStart: start - displayLeftBoundary - 1,
          topCut: topCut - displayLeftBoundary
        });
      }
      groups.get(key).names.push(site.enzyme || site.label || target.label);
    }
    if (groups.size === 0) return null;

    const container = document.createElement("div");
    container.className = "sequence-extractor-restriction-diagrams";
    for (const group of groups.values()) {
      const item = document.createElement("div");
      item.className = "sequence-extractor-restriction-diagram-item";
      if (groups.size > 1) {
        const label = document.createElement("span");
        label.className = "sequence-extractor-restriction-diagram-label";
        label.textContent = Array.from(new Set(group.names)).join(" / ");
        item.append(label);
      }
      item.append(makeRestrictionCutDiagram({
        name: Array.from(new Set(group.names)).join(" / "),
        recognition: group.recognitionSequence,
        displaySequence: group.displaySequence,
        recognitionStart: group.recognitionStart,
        cutTop: group.topCut,
        cutBottom: group.bottomCut
      }));
      container.append(item);
    }
    return container;
  }

  function positionHoverCard(anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    const cardRect = hoverCard.getBoundingClientRect();
    const margin = 10;
    const left = Math.max(margin, Math.min(window.innerWidth - cardRect.width - margin, anchorRect.left + anchorRect.width / 2 - cardRect.width / 2));
    let top = anchorRect.top - cardRect.height - 8;
    if (top < margin) top = anchorRect.bottom + 8;
    hoverCard.style.left = `${Math.round(left)}px`;
    hoverCard.style.top = `${Math.round(top)}px`;
  }

  function showHoverCard(anchor, target) {
    hoverAnchor = anchor;
    hoverCard.textContent = "";
    const title = document.createElement("strong");
    title.textContent = target.label || target.type || "Sequence item";
    const details = document.createElement("dl");
    for (const [label, value] of hoverDetailRows(target)) {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = String(value);
      details.append(term, detail);
    }
    hoverCard.append(title);
    if (target.kind === "restriction-site") {
      const diagrams = makeRestrictionHoverDiagrams(target);
      if (diagrams) hoverCard.append(diagrams);
    }
    hoverCard.append(details);
    hoverCard.hidden = false;
    positionHoverCard(anchor);
    clearHoverHighlight();
    hoverHighlightedElements = target.kind === "restriction-site"
      ? addRestrictionHoverHighlight(target)
      : addStrandAwareTargetRangeClass(target, "hover-range", "hover-strand-primary", "hover-strand-context");
  }

  function attachHoverInfo(button, target) {
    const refreshLinkedCodonHover = () => {
      if (target.kind !== "amino-acid" || !button.dataset.targetKey) return;
      requestAnimationFrame(() => {
        const selector = `[data-target-key="${CSS.escape(button.dataset.targetKey)}"]`;
        const linkedElements = Array.from(documentView.querySelectorAll(selector));
        const active = linkedElements.some((element) => element.matches(":hover, :focus"));
        linkedElements.forEach((element) => element.classList.toggle("linked-codon-hover", active));
      });
    };
    button.removeAttribute("title");
    button.addEventListener("pointerenter", () => {
      showHoverCard(button, target);
      refreshLinkedCodonHover();
    });
    button.addEventListener("pointerleave", () => {
      hideHoverCard();
      refreshLinkedCodonHover();
    });
    button.addEventListener("focus", () => {
      showHoverCard(button, target);
      refreshLinkedCodonHover();
    });
    button.addEventListener("blur", () => {
      hideHoverCard();
      refreshLinkedCodonHover();
    });
  }

  function registerBaseElement(button, position) {
    button.dataset.sequencePosition = String(position);
    baseElementsByPosition.set(position, [...(baseElementsByPosition.get(position) ?? []), button]);
  }

  function baseElementForTarget(target) {
    if (!target || !Number.isFinite(Number(target.position))) return null;
    const reverse = target.strand === "-";
    return (baseElementsByPosition.get(Number(target.position)) ?? [])
      .find((element) => element.classList.contains("complement") === reverse) ?? null;
  }

  documentView.addEventListener("scroll", () => {
    if (!hoverAnchor?.matches(":hover, :focus")) {
      hideHoverCard();
      return;
    }
    positionHoverCard(hoverAnchor);
  }, { passive: true });

  function activeRecord() {
    return records[recordIndex];
  }

  function activeHiddenFeatureTypes() {
    return hiddenFeatureTypesByRecord[recordIndex] ?? new Set();
  }

  function positionFeatureTypePanel() {
    if (!featureTypeDetails.open || !featureTypeDetails.isConnected) return;
    const mainBounds = main.getBoundingClientRect();
    const controlBounds = featureTypeDetails.getBoundingClientRect();
    const edgePadding = 8;
    const availableWidth = Math.max(0, mainBounds.width - edgePadding * 2);
    const desiredWidth = Math.min(416, availableWidth);
    const mainLeft = mainBounds.left + edgePadding;
    const mainRight = mainBounds.right - edgePadding;
    let panelLeft = controlBounds.left;
    if (panelLeft + desiredWidth > mainRight) {
      panelLeft = controlBounds.right - desiredWidth;
    }
    panelLeft = Math.max(mainLeft, Math.min(panelLeft, mainRight - desiredWidth));
    featureTypePanel.style.width = `${Math.floor(desiredWidth)}px`;
    featureTypePanel.style.left = `${Math.round(panelLeft - controlBounds.left)}px`;
  }

  function updateFeatureTypeControl() {
    const entries = sequenceExtractorFeatureTypeCounts(activeRecord());
    const hiddenTypes = activeHiddenFeatureTypes();
    const visibleCount = entries.filter(({ type }) => !hiddenTypes.has(type)).length;
    featureTypeSummaryCount.textContent = `${visibleCount}/${entries.length}`;
    featureTypeDetails.hidden = entries.length === 0;
    const labels = [];
    for (const { type, count } of entries) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = type;
      checkbox.checked = !hiddenTypes.has(type);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) hiddenTypes.delete(type);
        else hiddenTypes.add(type);
        updateFeatureTypeControl();
        runFeatureSearch("features", featureSearch.input.value);
        renderDocument();
      });
      label.append(checkbox, document.createTextNode(`${type} (${count.toLocaleString()})`));
      labels.push(label);
    }
    featureTypeList.replaceChildren(...labels);
  }

  function runFeatureSearch(_scope, query) {
    featureSearchMatches = sequenceExtractorFeatureMatches(activeRecord(), query, activeHiddenFeatureTypes());
    featureSearchIndex = -1;
    updateViewerSearchControls(featureSearch, featureSearchMatches, featureSearchIndex);
    renderDocumentHighlights();
  }

  function showFeatureSearchMatch(index) {
    if (featureSearchMatches.length === 0) {
      runFeatureSearch("features", featureSearch.input.value);
    }
    if (featureSearchMatches.length === 0) return;
    featureSearchIndex = (index + featureSearchMatches.length) % featureSearchMatches.length;
    const target = makeSequenceExtractorFeatureTarget(featureSearchMatches[featureSearchIndex]);
    const needsRender = !showFeatures;
    showFeatures = true;
    featureCheckbox.checked = true;
    selected = target;
    endpoints = [];
    product = null;
    if (needsRender) renderDocument();
    else renderDocumentHighlights();
    renderInspector();
    updateViewerSearchControls(featureSearch, featureSearchMatches, featureSearchIndex);
    requestAnimationFrame(() => {
      const key = `${target.kind}-${target.position}-${target.label}`;
      const match = documentView.querySelector(`[data-target-key="${CSS.escape(key)}"]`);
      match?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function moveFeatureSearch(direction) {
    if (featureSearchMatches.length === 0) {
      runFeatureSearch("features", featureSearch.input.value);
    }
    if (featureSearchMatches.length === 0) return;
    showFeatureSearchMatch(featureSearchIndex < 0 ? (direction < 0 ? featureSearchMatches.length - 1 : 0) : featureSearchIndex + direction);
  }

  function selectionStackEntryName(entry) {
    return entry?.name || entry?.product?.title || entry?.product?.type || "Fragment";
  }

  function makeSelectionStackEntry(nextProduct, overrides = {}) {
    selectionStackCounter += 1;
    return {
      id: `selection-${selectionStackCounter}`,
      product: nextProduct,
      sourceRecordIndex: recordIndex,
      sourceRecordId: activeRecord().id,
      sourceRecordTitle: activeRecord().title,
      ...overrides
    };
  }

  function primerEndpointIdentity(endpoint = {}) {
    return [
      endpoint.name || endpoint.primer || endpoint.label || "primer",
      Number(endpoint.start),
      Number(endpoint.end),
      endpoint.strand || "",
      String(endpoint.primerSequence ?? endpoint.primer_sequence ?? "").toUpperCase()
    ].join("|");
  }

  function pcrProductIdentity(nextProduct) {
    if (nextProduct?.type !== "pcr-product") return "";
    const endpointKeys = [nextProduct.endpointA, nextProduct.endpointB]
      .map(primerEndpointIdentity)
      .sort();
    return [
      nextProduct.recordTitle || activeRecord().title,
      nextProduct.topology || "linear",
      Number(nextProduct.start),
      Number(nextProduct.end),
      nextProduct.wrapsOrigin ? "wraps" : "direct",
      ...endpointKeys
    ].join("::");
  }

  function addSelectionStackItem(nextProduct) {
    if (!nextProduct?.sequence) return { added: false, entry: null };
    const pcrIdentity = pcrProductIdentity(nextProduct);
    if (pcrIdentity) {
      const existingEntry = selectionStack.find((entry) =>
        entry.sourceRecordIndex === recordIndex && pcrProductIdentity(entry.product) === pcrIdentity
      );
      if (existingEntry) return { added: false, entry: existingEntry };
    }
    lastStackJoin = null;
    const entry = makeSelectionStackEntry(nextProduct);
    selectionStack = [entry, ...selectionStack].slice(0, MAX_SELECTION_STACK_ITEMS);
    fragmentStackScrollTop = 0;
    resetFragmentStackScroll = true;
    if (shownSelectionId && !selectionStack.some((candidate) => candidate.id === shownSelectionId)) {
      shownSelectionId = null;
    }
    return { added: true, entry };
  }

  function selectionStackEntryRecordIndex(entry) {
    if (Number.isInteger(entry?.sourceRecordIndex)) return entry.sourceRecordIndex;
    return records.findIndex((record) => record.id === entry?.sourceRecordId || record.title === entry?.sourceRecordTitle);
  }

  function setSelectionStackEntryVisibility(entry, visible) {
    if (!visible) {
      if (shownSelectionId === entry.id) shownSelectionId = null;
      renderInspector();
      renderDocumentHighlights();
      return;
    }
    const sourceIndex = selectionStackEntryRecordIndex(entry);
    if (sourceIndex >= 0 && sourceIndex < records.length) {
      recordIndex = sourceIndex;
      recordSelect.value = String(recordIndex);
    }
    selected = null;
    endpoints = [];
    product = entry.product;
    shownSelectionId = entry.id;
    renderDocument();
    renderInspector();
    requestAnimationFrame(() => {
      document.getElementById(`sequence-extractor-base-${recordIndex}-${entry.product.start}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function moveSelectionStackItem(id, offset) {
    const index = selectionStack.findIndex((entry) => entry.id === id);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectionStack.length) return;
    const [entry] = selectionStack.splice(index, 1);
    selectionStack.splice(nextIndex, 0, entry);
    lastStackJoin = null;
    renderInspector();
  }

  function reverseComplementSelectionStackItem(entry) {
    const previousProduct = entry.product;
    entry.product = reverseComplementExtractedProduct(previousProduct);
    entry.treatmentUndoStack = [];
    if (product === previousProduct) product = entry.product;
    lastStackJoin = null;
    renderInspector();
    renderDocumentHighlights();
  }

  function applySelectionStackEndTreatment(entry, treatedProduct) {
    const previousProduct = entry.product;
    entry.treatmentUndoStack = [...(entry.treatmentUndoStack || []), previousProduct].slice(-20);
    entry.product = treatedProduct;
    if (product === previousProduct) product = treatedProduct;
    lastStackJoin = null;
    renderInspector();
    renderDocumentHighlights();
  }

  function undoSelectionStackEndTreatment(entry) {
    if (!entry.treatmentUndoStack?.length) return;
    const currentProduct = entry.product;
    const previousProduct = entry.treatmentUndoStack.pop();
    entry.product = previousProduct;
    if (product === currentProduct) product = previousProduct;
    lastStackJoin = null;
    renderInspector();
    renderDocumentHighlights();
  }

  function reorderSelectionStackItem(id, targetId, placeAfter) {
    if (!id || id === targetId) return;
    const sourceIndex = selectionStack.findIndex((entry) => entry.id === id);
    if (sourceIndex < 0) return;
    const [entry] = selectionStack.splice(sourceIndex, 1);
    const targetIndex = selectionStack.findIndex((candidate) => candidate.id === targetId);
    if (targetIndex < 0) {
      selectionStack.splice(sourceIndex, 0, entry);
      return;
    }
    selectionStack.splice(targetIndex + (placeAfter ? 1 : 0), 0, entry);
    lastStackJoin = null;
    renderInspector();
  }

  function joinSelectionStackEntries(leftId, rightId, methodId = assemblyMethodId) {
    const leftIndex = selectionStack.findIndex((entry) => entry.id === leftId);
    const rightIndex = selectionStack.findIndex((entry) => entry.id === rightId);
    if (leftIndex < 0 || rightIndex !== leftIndex + 1) return;
    const leftEntry = selectionStack[leftIndex];
    const rightEntry = selectionStack[rightIndex];
    const leftName = selectionStackEntryName(leftEntry);
    const rightName = selectionStackEntryName(rightEntry);
    const joined = applyFragmentAssembly(methodId, [leftEntry.product, rightEntry.product], {
      ids: [leftEntry.id, rightEntry.id],
      names: [leftName, rightName],
      title: `${leftName} + ${rightName}`
    });
    if (!joined.product) return;
    lastStackJoin = {
      selectionStack: [...selectionStack],
      selected,
      endpoints: [...endpoints],
      product,
      shownSelectionId
    };
    const remaining = selectionStack.filter((entry) => entry.id !== leftId && entry.id !== rightId);
    const sourceCount = joined.product.provenance?.sources?.length || 2;
    const assemblyEntry = makeSelectionStackEntry(joined.product, {
      name: joined.product.title,
      sourceRecordIndex: undefined,
      sourceRecordId: undefined,
      sourceRecordTitle: `Assembly · ${sourceCount.toLocaleString()} source fragment${sourceCount === 1 ? "" : "s"}`
    });
    selectionStack = [
      ...remaining.slice(0, leftIndex),
      assemblyEntry,
      ...remaining.slice(leftIndex)
    ].slice(0, MAX_SELECTION_STACK_ITEMS);
    selected = null;
    endpoints = [];
    product = joined.product;
    shownSelectionId = null;
    renderInspector();
    renderDocumentHighlights();
  }

  function undoLastSelectionStackJoin() {
    if (!lastStackJoin) return;
    selectionStack = lastStackJoin.selectionStack;
    selected = lastStackJoin.selected;
    endpoints = lastStackJoin.endpoints;
    product = lastStackJoin.product;
    shownSelectionId = lastStackJoin.shownSelectionId;
    lastStackJoin = null;
    renderInspector();
    renderDocumentHighlights();
  }

  function clearStackDropIndicators() {
    inspector.querySelectorAll(".sequence-extractor-stack-item.is-drop-before, .sequence-extractor-stack-item.is-drop-after")
      .forEach((element) => element.classList.remove("is-drop-before", "is-drop-after"));
  }

  function setProduct(nextProduct) {
    product = nextProduct;
    const stackResult = addSelectionStackItem(nextProduct);
    shownSelectionId = stackResult.entry?.id ?? null;
    if (stackResult.entry) {
      selected = null;
      endpoints = [];
      product = null;
      hideHoverCard();
    }
    renderInspector();
    renderDocumentHighlights();
  }

  function extractAminoAcidCodon(target) {
    const extracted = extractCoordinateRange(activeRecord(), target.start, target.end, {
      strand: target.strand,
      type: "coding-dna",
      title: `${activeRecord().title || "sequence"}_${target.frame || "codon"}_${target.start}_${target.end}`
    });
    const codingDna = String(target.codon || extracted.sequence).toUpperCase();
    return {
      ...extracted,
      length: codingDna.length,
      sequence: codingDna,
      directSequence: target.strand === "-" ? reverseComplement(codingDna) : codingDna,
      reverseComplement: reverseComplement(codingDna),
      parts: Array.isArray(target.parts) ? target.parts : undefined,
      translationSource: target.translationSource,
      geneticCodeLabel: target.geneticCodeLabel,
      recordTranslationTable: target.recordTranslationTable
    };
  }

  function endpointFamily(target) {
    if (target?.kind === "restriction-site") return "restriction-site";
    if (target?.kind === "primer") return "primer";
    return "coordinate";
  }

  function makePrimerTarget(item) {
    return {
      ...item,
      kind: "primer",
      type: item.type || "Primer",
      position: Number(item.start),
      label: item.label || item.name || "Primer"
    };
  }

  function primerProductLength(firstPrimer, secondPrimer) {
    const forward = firstPrimer?.strand === "+" ? firstPrimer : secondPrimer?.strand === "+" ? secondPrimer : null;
    const reverse = firstPrimer?.strand === "-" ? firstPrimer : secondPrimer?.strand === "-" ? secondPrimer : null;
    if (!forward || !reverse) return null;
    const forwardStart = Number(forward.start);
    const forwardEnd = Number(forward.end);
    const reverseStart = Number(reverse.start);
    if (![forwardStart, forwardEnd, reverseStart].every(Number.isFinite)) return null;
    if (selectionTopology !== "circular" && forwardStart > reverseStart) return null;
    const forwardPrimerLength = String(forward.primerSequence ?? forward.primer_sequence ?? "").length || Math.max(0, Number(forward.end) - forwardStart + 1);
    const reversePrimerLength = String(reverse.primerSequence ?? reverse.primer_sequence ?? "").length || Math.max(0, Number(reverse.end) - reverseStart + 1);
    const templateLength = selectionTopology === "circular" && reverseStart < forwardStart
      ? activeRecord().length - forwardEnd + reverseStart - 1
      : reverseStart - 1 - forwardEnd;
    return forwardPrimerLength + Math.max(0, templateLength) + reversePrimerLength;
  }

  function compatiblePrimerCandidates(firstPrimer) {
    if (firstPrimer?.kind !== "primer") return [];
    const seen = new Set();
    return (activeRecord().tracks ?? [])
      .filter((track) => track.type === "pcr-primer-sites")
      .flatMap((track) => track.items ?? [])
      .map((item) => makePrimerTarget(item))
      .filter((candidate) => {
        const key = `${candidate.id || candidate.name || candidate.label}:${candidate.start}:${candidate.end}:${candidate.strand}`;
        if (seen.has(key) || sameTarget(firstPrimer, candidate) || candidate.strand === firstPrimer.strand) return false;
        seen.add(key);
        return true;
      })
      .map((target) => ({ target, length: primerProductLength(firstPrimer, target) }))
      .filter((candidate) => Number.isFinite(candidate.length) && candidate.length > 0)
      .sort((left, right) => left.length - right.length || Number(left.target.start) - Number(right.target.start));
  }

  function extractEndpointPair(first, second) {
    if (first.kind === "restriction-site") {
      return extractRestrictionFragment(activeRecord(), first, second, { topology: selectionTopology });
    }
    if (first.kind === "primer") {
      return extractPrimerProduct(activeRecord(), first, second, { topology: selectionTopology });
    }
    const firstStart = Number(first.start ?? first.position);
    const secondEnd = Number(second.end ?? second.position);
    const start = selectionTopology === "circular" ? firstStart : Math.min(firstStart, secondEnd);
    const end = selectionTopology === "circular" ? secondEnd : Math.max(firstStart, secondEnd);
    return extractCoordinateRange(activeRecord(), start, end, {
      endpointA: first,
      endpointB: second,
      topology: selectionTopology,
      preserveOrder: selectionTopology === "circular"
    });
  }

  function captureSelectionScrollState() {
    return {
      windowX: window.scrollX,
      windowY: window.scrollY,
      documentTop: documentView.scrollTop,
      documentLeft: documentView.scrollLeft
    };
  }

  function capturePageScrollState() {
    return {
      windowX: window.scrollX,
      windowY: window.scrollY
    };
  }

  function keepPageScrollStable(scrollState) {
    if (!scrollState) return;
    if (pageScrollFrame) cancelAnimationFrame(pageScrollFrame);
    window.scrollTo(scrollState.windowX, scrollState.windowY);
    pageScrollFrame = requestAnimationFrame(() => {
      pageScrollFrame = 0;
      window.scrollTo(scrollState.windowX, scrollState.windowY);
    });
  }

  function restoreSelectionScrollState(scrollState) {
    if (!scrollState) return;
    documentView.scrollTop = scrollState.documentTop;
    documentView.scrollLeft = scrollState.documentLeft;
    window.scrollTo(scrollState.windowX, scrollState.windowY);
  }

  function keepSelectionScrollStable(scrollState) {
    if (selectionScrollFrame) cancelAnimationFrame(selectionScrollFrame);
    restoreSelectionScrollState(scrollState);
    selectionScrollFrame = requestAnimationFrame(() => {
      selectionScrollFrame = 0;
      restoreSelectionScrollState(scrollState);
    });
  }

  function selectTarget(target) {
    const scrollState = captureSelectionScrollState();
    if (target && sameTarget(selected, target)) target = null;
    selected = target;
    if (!target) {
      endpoints = [];
      product = null;
    } else if (endpoints.length === 1 && endpointFamily(endpoints[0]) === endpointFamily(target)) {
      endpoints = [endpoints[0], target];
      product = extractEndpointPair(endpoints[0], endpoints[1]);
      const stackResult = addSelectionStackItem(product);
      if (product?.type !== "pcr-product" && stackResult.entry) shownSelectionId = stackResult.entry.id;
      if (stackResult.entry) {
        selected = null;
        endpoints = [];
        product = null;
        hideHoverCard();
        if (documentView.contains(document.activeElement)) document.activeElement?.blur?.();
      }
    } else {
      endpoints = [target];
      product = null;
    }
    renderInspector();
    renderDocumentHighlights();
    keepSelectionScrollStable(scrollState);
  }

  documentView.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, textarea, summary, a")) return;
    if (selected || endpoints.length > 0 || product) selectTarget(null);
  });

  function fitSelectionStackFragmentPreviews() {
    for (const visual of inspector.querySelectorAll(".sequence-extractor-stack-end-visual, .sequence-extractor-stack-duplex, .sequence-extractor-stack-treatment-duplex")) {
      if (visual.getClientRects().length === 0) continue;
      const selectionId = visual.closest(".sequence-extractor-stack-item")?.dataset.selectionId;
      const entry = selectionStack.find((candidate) => candidate.id === selectionId);
      const previewProduct = fragmentPreviewProducts.get(visual) ?? entry?.product;
      if (previewProduct) fitFragmentSequenceRows(visual, previewProduct);
    }
  }

  function clearCurrentInteraction() {
    selected = null;
    endpoints = [];
    product = null;
    renderInspector();
    renderDocumentHighlights();
  }

  function renderInspector() {
    const previousStackList = inspector.querySelector(".sequence-extractor-stack-list");
    if (previousStackList && !resetFragmentStackScroll) fragmentStackScrollTop = previousStackList.scrollTop;
    const restoreFragmentStackScrollTop = resetFragmentStackScroll ? 0 : fragmentStackScrollTop;
    resetFragmentStackScroll = false;
    inspector.textContent = "";
    inspector.classList.toggle("has-scrollable-stack", selectionStack.length >= 2);
    const heading = document.createElement("div");
    heading.className = "sequence-extractor-inspector-heading";
    const headingText = document.createElement("div");
    headingText.className = "sequence-extractor-inspector-heading-text";
    const title = document.createElement("h3");
    title.textContent = "Inspector";
    const note = document.createElement("span");
    note.textContent = "Inspect sequence items and build fragments";
    headingText.append(title, note);
    const clear = makeButton("Clear current", "sequence-extractor-clear", clearCurrentInteraction);
    clear.hidden = !selected && endpoints.length === 0 && !product;
    heading.append(headingText, clear);
    const body = document.createElement("div");
    body.className = "sequence-extractor-inspector-body";
    inspector.append(heading, body);

    const pendingPrimerPair = endpoints.length === 1 && endpoints[0]?.kind === "primer";
    if (selected) {
      const selectedRanges = targetSequenceRanges(selected);
      const selectedSequenceLength = selectedRanges.reduce((sum, range) => sum + range.end - range.start + 1, 0);
      const selectedSection = document.createElement("section");
      selectedSection.className = "sequence-extractor-inspector-section sequence-extractor-selected-item";
      const selectedRole = document.createElement("span");
      selectedRole.className = "sequence-extractor-inspector-section-label";
      selectedRole.textContent = "Current item";
      const selectedTitle = document.createElement("h4");
      selectedTitle.textContent = selected.label || selected.type || "Item";
      const selectedHeaderText = document.createElement("div");
      selectedHeaderText.className = "sequence-extractor-inspector-section-heading-text";
      selectedHeaderText.append(selectedRole, selectedTitle);
      const dismissSelected = makeButton("×", "sequence-extractor-inspector-section-dismiss", clearCurrentInteraction);
      dismissSelected.setAttribute("aria-label", "Clear current item and fragment builder");
      dismissSelected.title = "Clear current item";
      const selectedHeader = document.createElement("div");
      selectedHeader.className = "sequence-extractor-inspector-section-heading";
      selectedHeader.append(selectedHeaderText, dismissSelected);
      selectedSection.append(selectedHeader);
      const selectedIsPoint = selectedRanges.length === 1 && selectedRanges[0].start === selectedRanges[0].end;
      appendDetails(selectedSection, [
        ["Type", selected.kind === "feature" ? humanizeFeatureType(selected.type) : selected.type || selected.kind],
        [selected.kind === "restriction-site" ? "Cut position" : "Position", selected.kind === "restriction-site" ? selected.position : selectedIsPoint ? selectedRanges[0].start : ""],
        ["Coordinates", !selectedIsPoint && selectedRanges.length > 0 ? selectedRanges.map((range) => `${range.start}-${range.end}`).join(", ") : ""],
        ["Length", !selectedIsPoint && selectedRanges.length > 0 ? `${selectedSequenceLength} bp` : ""],
        ["Strand", selected.kind === "restriction-site" ? "" : describeStrand(selected.strand)],
        ["Frame", selected.frame],
        ["Base", selected.base],
        ["Codon", selected.codon],
        ["Amino acid", selected.aminoAcid],
        ["Translation source", selected.translationSource],
        ["Computed genetic code", selected.geneticCodeLabel],
        ["Input CDS transl_table", selected.recordTranslationTable],
        ["CDS codon_start", selected.codonStart],
        ["Recognition", selected.recognition],
        ["Forward-strand cut", selected.kind === "restriction-site" ? `after base ${Number(selected.position).toLocaleString()}` : ""],
        ["Reverse-strand cut", selected.kind === "restriction-site" && restrictionComplementCuts(selected).length > 0
          ? `after base${restrictionComplementCuts(selected).length > 1 ? "s" : ""} ${restrictionComplementCuts(selected).map((position) => position.toLocaleString()).join(", ")}`
          : ""],
        ["Sites in record", selected.kind === "restriction-site" ? describeRestrictionSiteCounts(selected) : ""],
        ["Ends", selected.kind === "restriction-site" ? describeRestrictionEnds(selected) : ""],
        ["Mismatches", selected.mismatches],
        ["Standard name", selected.standardName && selected.standardName !== selected.label ? selected.standardName : ""],
        ["Bound molecule", selected.boundMoiety],
        ["Regulatory class", selected.regulatoryClass],
        ["Gene", selected.gene],
        ["Locus tag", selected.locus_tag],
        ["Product", selected.product],
        ["Feature", selected.feature]
      ]);
      const selectedActions = document.createElement("div");
      selectedActions.className = "sequence-extractor-actions";
      if (selected.kind === "feature" || selected.kind === "amino-acid") {
        const actionLabel = selected.kind === "feature" ? "Add feature as fragment" : "Add codon as fragment";
        selectedActions.append(makeButton(actionLabel, "", () => setProduct(selected.kind === "amino-acid"
          ? extractAminoAcidCodon(selected)
          : extractCoordinateRange(activeRecord(), selected.start, selected.end, { strand: selected.strand, type: "selection" }))));
      } else if (selected.kind === "base" && selected.position) {
        selectedActions.append(makeButton("Add 1 bp fragment", "", () => setProduct(extractCoordinateRange(activeRecord(), selected.position, selected.position))));
      }
      if (selectedActions.childElementCount > 0) selectedSection.append(selectedActions);
      body.append(selectedSection);
    }

    if (endpoints.length > 0 && !product?.sequence) {
      const endpointSection = document.createElement("section");
      endpointSection.className = "sequence-extractor-inspector-section sequence-extractor-fragment-builder";
      const endpointRole = document.createElement("span");
      endpointRole.className = "sequence-extractor-inspector-section-label";
      endpointRole.textContent = "Fragment builder";
      const endpointTitle = document.createElement("h4");
      endpointTitle.textContent = pendingPrimerPair ? "Choose a second primer" : "Choose a second endpoint";
      const endpointHeaderText = document.createElement("div");
      endpointHeaderText.className = "sequence-extractor-inspector-section-heading-text";
      endpointHeaderText.append(endpointRole, endpointTitle);
      const dismissEndpoint = makeButton("×", "sequence-extractor-inspector-section-dismiss", clearCurrentInteraction);
      dismissEndpoint.setAttribute("aria-label", "Cancel fragment building");
      dismissEndpoint.title = "Cancel fragment building";
      const endpointHeader = document.createElement("div");
      endpointHeader.className = "sequence-extractor-inspector-section-heading";
      endpointHeader.append(endpointHeaderText, dismissEndpoint);
      const endpointProgress = document.createElement("div");
      endpointProgress.className = "sequence-extractor-fragment-builder-progress";
      const endpointProgressLabel = document.createElement("strong");
      endpointProgressLabel.textContent = pendingPrimerPair ? "First primer" : "First endpoint";
      const endpointProgressValue = document.createElement("span");
      endpointProgressValue.textContent = `${endpoints[0].label || endpoints[0].kind} · coordinate ${endpoints[0].position ?? endpoints[0].start}`;
      endpointProgress.append(endpointProgressLabel, endpointProgressValue);
      endpointSection.append(endpointHeader, endpointProgress);
      const endpointText = document.createElement("p");
      endpointText.textContent = pendingPrimerPair
        ? "Compatible opposite-strand primers are highlighted in the sequence. Choose one to create the PCR fragment."
        : endpoints.length === 2
          ? product?.warnings?.join(" ") || endpoints.map((endpoint) => `${endpoint.label || endpoint.kind} @ ${endpoint.position ?? endpoint.start}`).join(" → ")
          : "Choose a compatible second endpoint to create the fragment. The completed fragment will be added below.";
      endpointSection.append(endpointText);
      if (pendingPrimerPair) {
        const compatiblePrimers = compatiblePrimerCandidates(endpoints[0]);
        const pairActions = document.createElement("div");
        pairActions.className = "sequence-extractor-primer-pair-actions";
        if (compatiblePrimers.length === 0) {
          const noPair = document.createElement("p");
          noPair.textContent = "No compatible opposite-strand primer sites are available with the current topology.";
          pairActions.append(noPair);
        } else {
          const pairLabel = document.createElement("span");
          pairLabel.textContent = compatiblePrimers.length === 1
            ? "Compatible primer"
            : `${compatiblePrimers.length.toLocaleString()} compatible primers`;
          pairActions.append(pairLabel);
          for (const candidate of compatiblePrimers.slice(0, 6)) {
            const pairButton = makeButton(
              `Create PCR fragment with ${candidate.target.label} · ${candidate.length.toLocaleString()} bp`,
              "sequence-extractor-primer-pair-action",
              () => selectTarget(candidate.target)
            );
            pairActions.append(pairButton);
          }
          if (compatiblePrimers.length > 6) {
            const remainder = document.createElement("p");
            remainder.textContent = `${(compatiblePrimers.length - 6).toLocaleString()} additional compatible primer sites are highlighted in the sequence.`;
            pairActions.append(remainder);
          }
        }
        endpointSection.append(pairActions);
      }
      body.append(endpointSection);
    }

    const stackSection = document.createElement("section");
    stackSection.className = "sequence-extractor-inspector-section sequence-extractor-stack";
    stackSection.setAttribute("aria-label", "Fragments");
    const stackHeading = document.createElement("div");
    stackHeading.className = "sequence-extractor-stack-heading";
    const stackTitle = document.createElement("h4");
    stackTitle.textContent = "Fragments";
    const stackCount = document.createElement("span");
    stackCount.textContent = `${selectionStack.length} of ${MAX_SELECTION_STACK_ITEMS} fragments`;
    stackHeading.append(stackTitle, stackCount);
    let assemblyControls = null;
    if (selectionStack.length >= 2) {
      const leftEntry = selectionStack[0];
      const rightEntry = selectionStack[1];
      const names = [selectionStackEntryName(leftEntry), selectionStackEntryName(rightEntry)];
      const topPreview = previewFragmentAssembly(assemblyMethodId, [leftEntry.product, rightEntry.product], { names });
      assemblyControls = document.createElement("div");
      assemblyControls.className = "sequence-extractor-stack-assembly-controls";
      const methodField = document.createElement("div");
      methodField.className = "sequence-extractor-assembly-method-field";
      const methodHeader = document.createElement("div");
      methodHeader.className = "sequence-extractor-assembly-method-header";
      const methodLabel = document.createElement("label");
      methodLabel.className = "sequence-extractor-assembly-method-label";
      methodLabel.htmlFor = "sequence-extractor-assembly-method";
      methodLabel.textContent = "Cloning / joining method";
      const methodHelp = document.createElement("details");
      methodHelp.className = "sequence-extractor-assembly-help";
      const methodHelpToggle = document.createElement("summary");
      methodHelpToggle.textContent = "?";
      methodHelpToggle.setAttribute("aria-label", "About cloning and fragment-joining methods");
      const methodHelpPopover = document.createElement("span");
      methodHelpPopover.className = "sequence-extractor-assembly-help-popover";
      methodHelpPopover.setAttribute("popover", "manual");
      methodHelpPopover.append("SMS3 evaluates the displayed fragment order using end geometry, terminal chemistry, Type IIS overhangs, or sequence overlap. ");
      const methodReferenceLink = document.createElement("a");
      methodReferenceLink.href = "#reference=dna-cloning-methods";
      methodReferenceLink.target = "_blank";
      methodReferenceLink.rel = "noopener noreferrer";
      methodReferenceLink.textContent = "Open examples and method references in a new tab";
      methodHelpPopover.append(methodReferenceLink);
      methodHelp.append(methodHelpToggle, methodHelpPopover);
      const positionMethodHelp = () => {
        requestAnimationFrame(() => {
          if (!methodHelp.open) return;
          const margin = 12;
          const width = Math.min(320, Math.max(180, window.innerWidth - margin * 2));
          methodHelpPopover.style.width = `${width}px`;
          const toggleRect = methodHelpToggle.getBoundingClientRect();
          const popoverRect = methodHelpPopover.getBoundingClientRect();
          const height = popoverRect.height || 96;
          const left = Math.min(
            Math.max(margin, toggleRect.right - width),
            Math.max(margin, window.innerWidth - width - margin)
          );
          let top = toggleRect.bottom + 8;
          if (top + height > window.innerHeight - margin) {
            top = toggleRect.top - height - 8;
          }
          top = Math.min(
            Math.max(margin, top),
            Math.max(margin, window.innerHeight - height - margin)
          );
          methodHelpPopover.style.setProperty("--sequence-extractor-help-left", `${left}px`);
          methodHelpPopover.style.setProperty("--sequence-extractor-help-top", `${top}px`);
        });
      };
      const closeMethodHelpOnViewportChange = () => {
        methodHelp.open = false;
      };
      methodHelp.addEventListener("toggle", () => {
        if (methodHelp.open) {
          methodHelpPopover.showPopover();
          positionMethodHelp();
          window.addEventListener("scroll", closeMethodHelpOnViewportChange, { capture: true, once: true });
          window.addEventListener("resize", closeMethodHelpOnViewportChange, { once: true });
        } else if (methodHelpPopover.matches(":popover-open")) {
          methodHelpPopover.hidePopover();
          window.removeEventListener("scroll", closeMethodHelpOnViewportChange, { capture: true });
          window.removeEventListener("resize", closeMethodHelpOnViewportChange);
        }
      });
      const methodSelect = document.createElement("select");
      methodSelect.id = "sequence-extractor-assembly-method";
      methodSelect.setAttribute("aria-label", "Cloning or joining method for the top two fragments");
      const stackEnds = selectionStack.flatMap((entry) => [entry.product?.ends?.left, entry.product?.ends?.right]).filter(Boolean);
      const hasTopoActivation = stackEnds.some((end) => String(end.terminalActivation || end.activation || "").toLowerCase() === "topoisomerase-i-bound");
      const hasUserActivation = stackEnds.some((end) => ["user-generated-overhang", "user-excised"].includes(String(end.terminalActivation || end.activation || "").toLowerCase()));
      const hasRecombinationSites = stackEnds.some((end) => end.recombinationSite);
      const visibleMethods = FRAGMENT_ASSEMBLY_METHODS.filter((candidate) => {
        if (candidate.id === "topo-ta") return hasTopoActivation;
        if (candidate.id === "user-assembly") return hasUserActivation;
        if (candidate.id === "site-specific-recombination") return hasRecombinationSites;
        return true;
      });
      if (!visibleMethods.some((method) => method.id === assemblyMethodId)) assemblyMethodId = "direct-ligation";
      for (const method of visibleMethods) {
        const option = document.createElement("option");
        option.value = method.id;
        option.textContent = method.label;
        option.selected = method.id === assemblyMethodId;
        methodSelect.append(option);
      }
      methodSelect.title = visibleMethods.find((method) => method.id === assemblyMethodId)?.description || "";
      methodSelect.addEventListener("change", () => {
        assemblyMethodId = methodSelect.value;
        lastStackJoin = null;
        renderInspector();
      });
      methodHeader.append(methodLabel, methodHelp);
      methodField.append(methodHeader, methodSelect);
      const assembleTop = makeButton("Assemble top two", "sequence-extractor-stack-join-top", () => {
        joinSelectionStackEntries(leftEntry.id, rightEntry.id, assemblyMethodId);
      });
      assembleTop.disabled = !topPreview.ready;
      assembleTop.title = `${topPreview.method?.label || "Assembly"}: ${topPreview.summary}${topPreview.warnings.length ? ` ${topPreview.warnings.join(" ")}` : ""}`;
      const assemblySummary = document.createElement("span");
      assemblySummary.className = `sequence-extractor-stack-assembly-summary is-${topPreview.ready ? "ready" : "blocked"}`;
      assemblySummary.textContent = [topPreview.summary, ...(topPreview.warnings ?? [])].filter(Boolean).join(" ");
      assemblyControls.append(methodField, assembleTop, assemblySummary);
    }
    if (lastStackJoin) {
      stackHeading.append(makeButton("Undo assembly", "sequence-extractor-stack-undo-join", undoLastSelectionStackJoin));
    }
    if (assemblyControls) stackHeading.append(assemblyControls);
    if (selectionStack.length > 0) {
      stackHeading.append(makeButton("Clear all", "sequence-extractor-stack-clear", () => {
        lastStackJoin = null;
        selectionStack = [];
        selected = null;
        endpoints = [];
        product = null;
        shownSelectionId = null;
        renderInspector();
        renderDocumentHighlights();
      }));
    }
    stackSection.append(stackHeading);
    if (records.length > 1) {
      const sharedStackNote = document.createElement("p");
      sharedStackNote.className = "sequence-extractor-stack-shared-note";
      sharedStackNote.textContent = `Shared across ${records.length.toLocaleString()} sequence panels`;
      stackSection.append(sharedStackNote);
    }
    const stackList = document.createElement("div");
    stackList.className = `sequence-extractor-stack-list${selectionStack.length >= 2 ? " is-scrollable" : ""}`;
    stackList.setAttribute("aria-label", "Fragment stack entries");
    if (selectionStack.length > 0) stackList.tabIndex = 0;
    stackList.addEventListener("scroll", () => {
      fragmentStackScrollTop = stackList.scrollTop;
    }, { passive: true });
    stackList.addEventListener("dragover", (event) => {
      if (!draggedSelectionId || !stackList.classList.contains("is-scrollable")) return;
      const bounds = stackList.getBoundingClientRect();
      const edgeSize = Math.min(72, Math.max(36, bounds.height * 0.16));
      const distanceFromTop = event.clientY - bounds.top;
      const distanceFromBottom = bounds.bottom - event.clientY;
      if (distanceFromTop < edgeSize) {
        stackList.scrollTop -= Math.ceil((edgeSize - distanceFromTop) / 4);
      } else if (distanceFromBottom < edgeSize) {
        stackList.scrollTop += Math.ceil((edgeSize - distanceFromBottom) / 4);
      }
    });
    stackSection.append(stackList);

    if (selectionStack.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sequence-extractor-stack-empty";
      const emptyTitle = document.createElement("strong");
      emptyTitle.textContent = "No fragments yet";
      const emptyText = document.createElement("span");
      emptyText.textContent = "Complete a two-endpoint extraction or use an “Add … as fragment” action. Finished fragments stay here for treatment, reordering, and assembly.";
      empty.append(emptyTitle, emptyText);
      stackList.append(empty);
    }

    for (const [entryIndex, entry] of selectionStack.entries()) {
      const entryProduct = entry.product;
      const entryGroup = document.createElement("div");
      entryGroup.className = "sequence-extractor-stack-entry-group";
      if (entryIndex > 0) {
        const previousEntry = selectionStack[entryIndex - 1];
        const previousName = selectionStackEntryName(previousEntry);
        const entryName = selectionStackEntryName(entry);
        const methodPreview = previewFragmentAssembly(assemblyMethodId, [previousEntry.product, entryProduct], {
          names: [previousName, entryName]
        });
        const compatibility = methodPreview.junctions[0]?.compatibility || assessFragmentEndCompatibility(previousEntry.product.ends?.right, entryProduct.ends?.left);
        const joinControl = document.createElement("div");
        const compatibilityClass = !methodPreview.geometryCompatible
          ? "incompatible"
          : methodPreview.ready
            ? "compatible"
            : "conditional";
        joinControl.className = `sequence-extractor-stack-join-control is-${compatibilityClass}`;
        const joinButton = makeButton("Assemble", "sequence-extractor-stack-join", () => joinSelectionStackEntries(previousEntry.id, entry.id, assemblyMethodId));
        joinButton.disabled = !methodPreview.ready;
        joinButton.setAttribute("aria-label", `${methodPreview.method?.label || "Assemble"}: ${previousName}, then ${entryName}`);
        const compatibilityResults = makeAssemblyPreviewResults(methodPreview);
        compatibilityResults.title = `${methodPreview.method?.label || "Assembly"}: ${methodPreview.summary}${methodPreview.warnings.length ? ` ${methodPreview.warnings.join(" ")}` : ""}`;
        joinControl.append(joinButton, compatibilityResults);
        entryGroup.append(joinControl);
      }
      const item = document.createElement("article");
      item.className = "sequence-extractor-stack-item sequence-extractor-product";
      item.dataset.selectionId = entry.id;
      item.setAttribute("aria-posinset", String(entryIndex + 1));
      item.setAttribute("aria-setsize", String(selectionStack.length));
      item.addEventListener("dragover", (event) => {
        if (!draggedSelectionId || draggedSelectionId === entry.id) return;
        event.preventDefault();
        const sourceIndex = selectionStack.findIndex((candidate) => candidate.id === draggedSelectionId);
        const targetIndex = selectionStack.findIndex((candidate) => candidate.id === entry.id);
        const placeAfter = sourceIndex < targetIndex;
        clearStackDropIndicators();
        item.classList.add(placeAfter ? "is-drop-after" : "is-drop-before");
        item.dataset.dropPosition = placeAfter ? "after" : "before";
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      item.addEventListener("dragleave", (event) => {
        if (!item.contains(event.relatedTarget)) item.classList.remove("is-drop-before", "is-drop-after");
      });
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer?.getData("text/plain") || draggedSelectionId;
        const placeAfter = item.dataset.dropPosition === "after";
        draggedSelectionId = null;
        stackList.classList.remove("is-reordering");
        clearStackDropIndicators();
        reorderSelectionStackItem(sourceId, entry.id, placeAfter);
      });
      const itemHeading = document.createElement("div");
      itemHeading.className = "sequence-extractor-stack-item-heading";
      const defaultItemTitle = entryProduct.title || entryProduct.type || "Fragment";
      const itemTitle = entry.name || defaultItemTitle;
      const dragHandle = makeButton("⋮⋮", "sequence-extractor-stack-drag-handle", () => {});
      dragHandle.draggable = true;
      dragHandle.title = "Drag to reorder";
      dragHandle.setAttribute("aria-label", `Drag ${itemTitle} to reorder`);
      dragHandle.addEventListener("dragstart", (event) => {
        draggedSelectionId = entry.id;
        stackList.classList.add("is-reordering");
        item.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", entry.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      dragHandle.addEventListener("dragend", () => {
        draggedSelectionId = null;
        stackList.classList.remove("is-reordering");
        item.classList.remove("is-dragging");
        clearStackDropIndicators();
      });
      const itemName = document.createElement("span");
      itemName.className = "sequence-extractor-stack-show is-static";
      itemName.textContent = itemTitle;
      itemName.title = itemTitle;
      const itemControls = document.createElement("div");
      itemControls.className = "sequence-extractor-stack-item-controls";
      const moveUp = makeButton("↑", "sequence-extractor-stack-move", () => moveSelectionStackItem(entry.id, -1));
      moveUp.disabled = entryIndex === 0;
      moveUp.setAttribute("aria-label", `Move ${itemTitle} up`);
      const moveDown = makeButton("↓", "sequence-extractor-stack-move", () => moveSelectionStackItem(entry.id, 1));
      moveDown.disabled = entryIndex === selectionStack.length - 1;
      moveDown.setAttribute("aria-label", `Move ${itemTitle} down`);
      const rename = makeButton("✎", "sequence-extractor-stack-rename", () => {
        renameEditor.hidden = false;
        renameInput.focus();
        renameInput.select();
      });
      rename.setAttribute("aria-label", `Rename ${itemTitle}`);
      rename.title = "Rename";
      const reverseComplementButton = makeButton("⇄", "sequence-extractor-stack-reverse-complement", () => {
        reverseComplementSelectionStackItem(entry);
      });
      reverseComplementButton.setAttribute("aria-label", `Reverse complement ${itemTitle}`);
      reverseComplementButton.title = "Reverse complement";
      const removeEntry = () => {
        lastStackJoin = null;
        selectionStack = selectionStack.filter((candidate) => candidate.id !== entry.id);
        selected = null;
        endpoints = [];
        product = null;
        if (shownSelectionId === entry.id) shownSelectionId = null;
        renderInspector();
        renderDocumentHighlights();
      };
      let removeConfirmation;
      let confirmRemove;
      const remove = makeButton("×", "sequence-extractor-stack-remove", () => {
        removeConfirmation.hidden = false;
        remove.disabled = true;
        remove.setAttribute("aria-expanded", "true");
        confirmRemove.focus();
      });
      remove.setAttribute("aria-label", `Remove ${itemTitle}`);
      remove.setAttribute("aria-expanded", "false");
      remove.title = "Remove";
      itemControls.append(moveUp, moveDown, reverseComplementButton, rename, remove);
      itemHeading.append(dragHandle, itemName, itemControls);
      const renameEditor = document.createElement("div");
      renameEditor.className = "sequence-extractor-stack-rename-editor";
      renameEditor.hidden = true;
      const renameInput = document.createElement("input");
      renameInput.type = "text";
      renameInput.maxLength = 80;
      renameInput.value = itemTitle;
      renameInput.setAttribute("aria-label", "Name fragment");
      const saveRename = () => {
        lastStackJoin = null;
        entry.name = renameInput.value.trim() || undefined;
        renderInspector();
      };
      renameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveRename();
        } else if (event.key === "Escape") {
          renameEditor.hidden = true;
          renameInput.value = itemTitle;
        }
      });
      const save = makeButton("Save", "sequence-extractor-stack-rename-save", saveRename);
      const cancel = makeButton("Cancel", "sequence-extractor-stack-rename-cancel", () => {
        renameEditor.hidden = true;
        renameInput.value = itemTitle;
      });
      renameEditor.append(renameInput, save, cancel);
      removeConfirmation = document.createElement("div");
      removeConfirmation.className = "sequence-extractor-stack-remove-confirmation";
      removeConfirmation.hidden = true;
      const removeWarning = document.createElement("span");
      removeWarning.textContent = "Remove this fragment?";
      confirmRemove = makeButton("Remove", "sequence-extractor-stack-remove-confirm", removeEntry);
      confirmRemove.setAttribute("aria-label", `Confirm removal of ${itemTitle}`);
      const cancelRemove = makeButton("Cancel", "sequence-extractor-stack-remove-cancel", () => {
        removeConfirmation.hidden = true;
        remove.disabled = false;
        remove.setAttribute("aria-expanded", "false");
        remove.focus();
      });
      cancelRemove.setAttribute("aria-label", `Cancel removal of ${itemTitle}`);
      removeConfirmation.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cancelRemove.click();
      });
      removeConfirmation.append(removeWarning, confirmRemove, cancelRemove);
      const compactSummary = document.createElement("p");
      compactSummary.className = "sequence-extractor-stack-item-summary";
      compactSummary.textContent = `${entryProduct.type || "selection"} · ${Number(entryProduct.length || 0).toLocaleString()} bp · ${entryProduct.topology || "linear"}${entryProduct.orientationReversed ? " · reverse complement" : ""}`;
      const sourceSummary = document.createElement("p");
      sourceSummary.className = "sequence-extractor-stack-source";
      sourceSummary.textContent = entry.sourceRecordTitle || entryProduct.recordTitle || "Sequence";
      sourceSummary.title = `Source sequence: ${sourceSummary.textContent}`;
      let sequenceVisibilityControl = null;
      if (!entryProduct.provenance?.sources?.length) {
        sequenceVisibilityControl = document.createElement("label");
        sequenceVisibilityControl.className = "sequence-extractor-stack-sequence-visibility";
        const sequenceVisibilityCheckbox = document.createElement("input");
        sequenceVisibilityCheckbox.type = "checkbox";
        sequenceVisibilityCheckbox.checked = shownSelectionId === entry.id;
        sequenceVisibilityCheckbox.setAttribute("aria-label", `Keep ${itemTitle} highlighted on the sequence`);
        sequenceVisibilityCheckbox.addEventListener("change", () => {
          setSelectionStackEntryVisibility(entry, sequenceVisibilityCheckbox.checked);
        });
        sequenceVisibilityControl.append(sequenceVisibilityCheckbox, document.createTextNode("Keep highlighted on sequence"));
      }
      const assemblySourceMap = makeAssemblySourceMap(entryProduct);
      const endSummary = makeFragmentEndsVisual(entryProduct);
      const entryDetails = document.createElement("details");
      entryDetails.className = "sequence-extractor-stack-details";
      const entrySummary = document.createElement("summary");
      configureDisclosure(
        entryDetails,
        entrySummary,
        "Details",
        `${Number(entryProduct.length || 0).toLocaleString()} bp · ${entryProduct.topology || "linear"} · ${entryProduct.orientationReversed ? "reverse complemented" : "as extracted"}`
      );
      entryDetails.append(entrySummary);
      item.append(itemHeading, renameEditor, removeConfirmation, sourceSummary, compactSummary);
      if (sequenceVisibilityControl) item.append(sequenceVisibilityControl);
      if (assemblySourceMap) item.append(assemblySourceMap);
      item.append(endSummary, entryDetails);
      appendDetails(entryDetails, [
        ["Source sequence", entry.sourceRecordTitle || entryProduct.recordTitle],
        ["Product", entryProduct.type],
        ["Coordinates", entryProduct.start !== undefined && entryProduct.end !== undefined ? `${entryProduct.start}-${entryProduct.end}` : ""],
        ["Length", `${Number(entryProduct.length || 0).toLocaleString()} bp`],
        ["Strand", entryProduct.strand],
        ["Orientation", entryProduct.orientationReversed ? "Reverse complement of extracted sequence" : "As extracted"],
        ["Topology", entryProduct.topology],
        ["Path", entryProduct.wrapsOrigin ? "Wraps origin" : "Direct"],
        ["Translation source", entryProduct.translationSource],
        ["Computed genetic code", entryProduct.geneticCodeLabel],
        ["Input CDS transl_table", entryProduct.recordTranslationTable],
        ["Left end", describeFragmentEnd(entryProduct.ends?.left, "left")],
        ["Left chemistry", describeFragmentEndChemistry(entryProduct.ends?.left)],
        ["Right end", describeFragmentEnd(entryProduct.ends?.right, "right")],
        ["Right chemistry", describeFragmentEndChemistry(entryProduct.ends?.right)]
      ]);
      const treatmentDetails = makeFragmentTreatmentDetails(entryProduct, {
        previousProduct: entryIndex > 0 ? selectionStack[entryIndex - 1].product : null,
        nextProduct: entryIndex + 1 < selectionStack.length ? selectionStack[entryIndex + 1].product : null,
        canUndo: Boolean(entry.treatmentUndoStack?.length),
        onApply: (treatedProduct) => applySelectionStackEndTreatment(entry, treatedProduct),
        onUndo: () => undoSelectionStackEndTreatment(entry)
      });
      const provenanceDetails = makeAssemblyProvenanceDetails(entryProduct);
      const sequenceDetails = document.createElement("details");
      sequenceDetails.className = "sequence-extractor-stack-sequences";
      const sequenceSummary = document.createElement("summary");
      configureDisclosure(
        sequenceDetails,
        sequenceSummary,
        "DNA sequences",
        `${Number(entryProduct.length || 0).toLocaleString()} bp · fragment and reverse complement`
      );
      sequenceDetails.append(sequenceSummary);
      const expandedDuplex = makeExpandedFragmentDuplex(entryProduct);
      sequenceDetails.append(expandedDuplex);
      renderSequenceTextarea(sequenceDetails, "Fragment sequence · current orientation · 5′→3′", entryProduct.sequence);
      renderSequenceTextarea(sequenceDetails, "Reverse complement · 5′→3′", entryProduct.reverseComplement);
      sequenceDetails.addEventListener("toggle", () => {
        if (!sequenceDetails.open) return;
        requestAnimationFrame(() => fitFragmentSequenceRows(expandedDuplex, entryProduct));
      });
      const translationDetails = makeFragmentTranslationDetails(entryProduct, selectedGeneticCode);
      item.append(treatmentDetails);
      if (provenanceDetails) item.append(provenanceDetails);
      item.append(sequenceDetails, translationDetails);
      const actions = document.createElement("div");
      actions.className = "sequence-extractor-actions";
      actions.append(
        makeButton("Copy DNA", "primary", () => navigator.clipboard?.writeText(entryProduct.sequence || "")),
        makeButton("Download FASTA", "", () => {
          const name = safeFilename(entry.name || entryProduct.title || "sequence-extractor-product");
          downloadText(formatFastaRecord(name, entryProduct.sequence || "", 60), `${name}.fasta`, "text/x-fasta;charset=utf-8");
        })
      );
      item.append(actions);
      for (const warning of entryProduct.warnings ?? []) {
        const message = document.createElement("p");
        message.className = "sequence-extractor-product-warning";
        message.textContent = warning;
        item.append(message);
      }
      entryGroup.append(item);
      stackList.append(entryGroup);
    }
    body.append(stackSection);
    requestAnimationFrame(() => {
      stackList.scrollTop = Math.min(restoreFragmentStackScrollTop, Math.max(0, stackList.scrollHeight - stackList.clientHeight));
      fitSelectionStackFragmentPreviews();
    });
  }

  function makeAnnotationRow(items, blockStart, blockEnd, kind, record) {
    if (!items.length) return null;
    const row = document.createElement("div");
    row.className = `sequence-extractor-annotation-row sequence-extractor-${kind}-row`;
    const rowLabel = document.createElement("span");
    rowLabel.className = "sequence-extractor-row-label";
    rowLabel.textContent = kind === "restriction" ? "Sites" : "Primers";
    const content = document.createElement("div");
    content.className = "sequence-extractor-annotation-content";
    const renderedItems = kind === "restriction"
      ? groupRestrictionSitesByCutPosition(items)
      : items;
    const restrictionCounts = new Map();
    if (kind === "restriction") {
      for (const site of (record?.tracks ?? []).filter((track) => track.type === "restriction-sites").flatMap((track) => track.items ?? [])) {
        const key = site.enzymeId || site.enzyme || site.label;
        restrictionCounts.set(key, (restrictionCounts.get(key) ?? 0) + 1);
      }
    }
    const restrictionLaneEnds = [];
    for (const item of renderedItems) {
      const position = kind === "restriction" ? itemPosition(item[0]) : Number(item.start);
      const columnCount = blockEnd - blockStart + 1;
      const coordinateColumn = Math.max(1, Math.min(columnCount, position - blockStart + 1));
      if (kind === "restriction") {
        const groupedSites = item;
        const combinedLabel = groupedSites.map((site) => site.enzyme || site.label).join(" / ");
        const group = document.createElement("div");
        group.className = "sequence-extractor-annotation-target sequence-extractor-restriction-group";
        group.dataset.restrictionSiteCount = String(groupedSites.length);
        group.dataset.restrictionCutPosition = String(position);
        group.setAttribute("aria-label", combinedLabel);
        const siteFrequencies = groupedSites.map((site) => restrictionCounts.get(site.enzymeId || site.enzyme || site.label) ?? 1);
        for (const [index, site] of groupedSites.entries()) {
          if (index > 0) {
            const separator = document.createElement("span");
            separator.className = "sequence-extractor-restriction-separator";
            separator.textContent = "/";
            separator.setAttribute("aria-hidden", "true");
            group.append(separator);
          }
          const target = makeRestrictionSiteTarget(site, siteFrequencies[index]);
          const button = makeButton(target.label, "sequence-extractor-restriction-subtarget", () => selectTarget(target));
          button.classList.add(
            siteFrequencies[index] === 1
              ? "is-unique-cutter"
              : siteFrequencies[index] === 2
                ? "is-double-cutter"
                : "is-repeated-cutter"
          );
          button.dataset.targetKey = `${target.kind}-${position}-${target.label}`;
          attachHoverInfo(button, target);
          group.append(button);
        }
        const labelSpan = Math.max(4, Math.min(columnCount, Math.ceil((combinedLabel.length * 5.5 + 14) / 8)));
        const labelStart = Math.max(1, Math.min(columnCount - labelSpan + 1, coordinateColumn - Math.floor(labelSpan / 2)));
        const labelEnd = labelStart + labelSpan - 1;
        let lane = restrictionLaneEnds.findIndex((laneEnd) => laneEnd < labelStart);
        if (lane === -1) lane = restrictionLaneEnds.length;
        restrictionLaneEnds[lane] = labelEnd;
        group.style.gridColumn = `${labelStart} / span ${labelSpan}`;
        group.style.gridRow = String(lane + 1);
        group.style.setProperty("--sequence-extractor-cut-marker-left", `${((coordinateColumn - labelStart + 0.5) / labelSpan) * 100}%`);
        content.append(group);
      } else {
        const target = makePrimerTarget(item);
        const placement = intervalPlacementForBlock(item.start, item.end, blockStart, blockEnd);
        if (!placement) continue;
        const button = makeButton(target.label, "sequence-extractor-annotation-target", () => selectTarget(target));
        applyDirectionalClass(button, target);
        button.textContent = "";
        const texture = document.createElement("span");
        texture.className = "sequence-extractor-primer-direction-texture";
        texture.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "sequence-extractor-primer-label";
        label.textContent = target.label;
        button.append(texture, label);
        button.classList.toggle("is-clipped-left", placement.clippedLeft);
        button.classList.toggle("is-clipped-right", placement.clippedRight);
        button.style.gridColumn = `${placement.gridStart} / span ${placement.span}`;
        button.title = `${target.label}: ${item.start}-${item.end}; ${item.strand} strand; ${item.mismatches || 0} mismatch(es)`;
        button.dataset.targetKey = `${target.kind}-${position}-${target.label}`;
        button.dataset.segmentEnd = String(placement.visibleEnd);
        button.dataset.segmentStart = String(placement.visibleStart);
        attachHoverInfo(button, target);
        content.append(button);
      }
    }
    if (kind === "restriction") content.style.setProperty("--sequence-extractor-restriction-lanes", String(restrictionLaneEnds.length));
    row.append(rowLabel, content);
    return row;
  }

  function featureItems(record) {
    return (record.tracks ?? [])
      .filter((track) => track.type === "features")
      .flatMap((track) => track.items ?? [])
      .filter((item) => Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end)));
  }

  function featureRowForBlock(record, blockStart, blockEnd) {
    if (!showFeatures) return null;
    const entries = featureItems(record)
      .filter((item) => !activeHiddenFeatureTypes().has(featureItemType(item)))
      .map((item) => ({
        item,
        parts: (Array.isArray(item.parts) && item.parts.length > 0 ? item.parts : [{ start: item.start, end: item.end, strand: item.strand }])
          .map((part) => ({ ...part, start: Number(part.start), end: Number(part.end) }))
          .filter((part) => part.start <= blockEnd && part.end >= blockStart)
      }))
      .filter((entry) => entry.parts.length > 0)
      .sort((left, right) => Math.min(...left.parts.map((part) => part.start)) - Math.min(...right.parts.map((part) => part.start)));
    if (entries.length === 0) return null;
    const row = document.createElement("div");
    row.className = "sequence-extractor-feature-row";
    const rowLabel = document.createElement("span");
    rowLabel.className = "sequence-extractor-row-label sequence-extractor-feature-row-label";
    rowLabel.setAttribute("aria-hidden", "true");
    const content = document.createElement("div");
    content.className = "sequence-extractor-feature-content";
    const laneIntervals = [];
    for (const { item, parts } of entries) {
      const visibleIntervals = parts.map((part) => ({ start: Math.max(blockStart, part.start), end: Math.min(blockEnd, part.end) }));
      let lane = laneIntervals.findIndex((intervals) => visibleIntervals.every((candidate) => intervals.every((placed) => candidate.end < placed.start || candidate.start > placed.end)));
      if (lane === -1) lane = laneIntervals.length;
      laneIntervals[lane] = [...(laneIntervals[lane] ?? []), ...visibleIntervals];
      const target = makeSequenceExtractorFeatureTarget(item);
      const featureStyle = getViewerFeatureTypeStyle(target);
      for (const part of parts) {
        const placement = intervalPlacementForBlock(part.start, part.end, blockStart, blockEnd);
        if (!placement) continue;
        const button = makeButton("", "sequence-extractor-feature-target", () => selectTarget(target));
        applyDirectionalClass(button, target);
        button.setAttribute("aria-label", target.label);
        const label = document.createElement("span");
        label.className = "sequence-extractor-feature-label";
        label.textContent = target.label;
        button.append(label);
        button.classList.toggle("is-continuation", placement.clippedLeft);
        button.classList.toggle("is-clipped-left", placement.clippedLeft);
        button.classList.toggle("is-clipped-right", placement.clippedRight);
        button.style.setProperty("--sequence-extractor-feature-stroke", featureStyle.stroke);
        button.style.setProperty("--sequence-extractor-feature-fill", featureStyle.fill);
        button.style.gridColumn = `${placement.gridStart} / span ${placement.span}`;
        button.style.gridRow = String(lane + 1);
        button.dataset.targetKey = `${target.kind}-${target.position}-${target.label}`;
        button.dataset.featureType = target.type;
        button.dataset.segmentEnd = String(placement.visibleEnd);
        button.dataset.segmentStart = String(placement.visibleStart);
        button.title = `${target.type}: ${target.start}-${target.end}${target.strand ? ` (${target.strand})` : ""}${target.product ? `; ${target.product}` : ""}`;
        attachHoverInfo(button, target);
        content.append(button);
      }
    }
    content.style.setProperty("--sequence-extractor-feature-lanes", String(laneIntervals.length));
    row.append(rowLabel, content);
    return row;
  }

  function positionRanges(positions) {
    const sorted = Array.from(new Set(positions.map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
    const ranges = [];
    for (const position of sorted) {
      const previous = ranges.at(-1);
      if (previous && previous.end + 1 === position) previous.end = position;
      else ranges.push({ start: position, end: position });
    }
    return ranges;
  }

  function makeTranslationTarget({ positions, codon, aminoAcid, frame, strand = "+", translationSource, geneticCodeLabel, recordTranslationTable, codonStart }) {
    const directPositions = positions.map(Number).filter(Number.isFinite);
    const start = Math.min(...directPositions);
    const end = Math.max(...directPositions);
    return {
      kind: "amino-acid",
      type: "Amino acid",
      label: `${aminoAcid} (${codon})`,
      position: start,
      start,
      end,
      parts: positionRanges(directPositions),
      strand,
      frame,
      codon,
      aminoAcid,
      translationSource,
      geneticCodeLabel,
      recordTranslationTable,
      codonStart
    };
  }

  function appendTranslationCodonSegments(cells, placements, target, aminoAcid, className, title) {
    const targetKey = `${target.kind}-${target.position}-${target.label}`;
    for (const placement of placements) {
      const button = makeButton("", className, () => selectTarget(target));
      const label = document.createElement("span");
      label.className = "sequence-extractor-aa-label";
      label.textContent = placement.containsCenter ? aminoAcid : "";
      button.append(label);
      button.setAttribute("aria-label", target.label);
      button.classList.toggle("is-codon-continuation", !placement.containsCenter);
      button.title = title;
      button.style.gridColumn = `${placement.gridStart} / span ${placement.span}`;
      button.style.gridRow = "1";
      button.style.setProperty("--sequence-extractor-aa-segment-columns", String(placement.span));
      if (placement.containsCenter) {
        button.style.setProperty(
          "--sequence-extractor-aa-label-column",
          String(placement.centerPosition - placement.visibleStart + 1)
        );
      }
      button.dataset.codonStart = String(placement.directStart);
      button.dataset.codonEnd = String(placement.directEnd);
      button.dataset.codonCenter = String(placement.centerPosition);
      button.dataset.codonCrossesWrap = String(placement.crossesBlock);
      button.dataset.codonSegmentStart = String(placement.visibleStart);
      button.dataset.codonSegmentEnd = String(placement.visibleEnd);
      button.dataset.targetKey = targetKey;
      attachHoverInfo(button, target);
      cells.append(button);
    }
  }

  function makeFrameTranslationRow(record, blockStart, blockEnd, frameOffset, strand) {
    const row = document.createElement("div");
    row.className = "sequence-extractor-sequence-row sequence-extractor-translation-row sequence-extractor-computed-translation-row";
    row.classList.add(strand === "-" ? "is-reverse-frame" : "is-forward-frame");
    const label = document.createElement("span");
    label.className = "sequence-extractor-row-label";
    const frame = `${strand}${frameOffset + 1}`;
    label.textContent = `${frame} · calc`;
    label.title = `${frame} computed with NCBI genetic code ${selectedGeneticCode.id}. ${selectedGeneticCode.name}`;
    const cells = document.createElement("div");
    cells.className = "sequence-extractor-cells";
    const sourceSequence = strand === "-" ? reverseComplement(record.sequence) : record.sequence;
    for (let codonIndex = frameOffset; codonIndex + 2 < sourceSequence.length; codonIndex += 3) {
      const positions = strand === "+"
        ? [codonIndex + 1, codonIndex + 2, codonIndex + 3]
        : [record.length - codonIndex, record.length - codonIndex - 1, record.length - codonIndex - 2];
      const placements = translationCodonPlacements(positions, blockStart, blockEnd);
      if (placements.length === 0) continue;
      const directStart = Math.min(...positions);
      const directEnd = Math.max(...positions);
      const codon = sourceSequence.slice(codonIndex, codonIndex + 3);
      const aminoAcid = translateCodon(codon, codonMap);
      const target = makeTranslationTarget({
        positions,
        codon,
        aminoAcid,
        frame,
        strand,
        translationSource: "Computed from DNA",
        geneticCodeLabel: `${selectedGeneticCode.id}. ${selectedGeneticCode.name}`
      });
      appendTranslationCodonSegments(
        cells,
        placements,
        target,
        aminoAcid,
        "sequence-extractor-aa",
        `${aminoAcid}: ${codon}, bases ${directStart}-${directEnd}, computed frame ${frame}, genetic code ${selectedGeneticCode.id}`
      );
    }
    row.append(label, cells);
    return row;
  }

  function makeCdsTranslationRows(record, blockStart, blockEnd) {
    const cdsFeatures = featureItems(record).filter((item) =>
      String(item.type || item.featureType).toUpperCase() === "CDS" && String(item.translation || "").replace(/\s+/g, "")
    );
    return cdsFeatures
      .filter((item) => Number(item.start) <= blockEnd && Number(item.end) >= blockStart)
      .map((item) => {
        const row = document.createElement("div");
        row.className = "sequence-extractor-sequence-row sequence-extractor-translation-row sequence-extractor-cds-translation-row";
        const label = document.createElement("span");
        label.className = "sequence-extractor-row-label sequence-extractor-cds-source-label";
        label.textContent = `${item.gene || item.label || "CDS"} · CDS`;
        label.title = "Protein supplied by the input CDS /translation qualifier";
        const cells = document.createElement("div");
        cells.className = "sequence-extractor-cells";
        const parts = Array.isArray(item.parts) && item.parts.length > 0 ? item.parts : [{ start: item.start, end: item.end }];
        let codingPositions = parts.flatMap((part) => {
          const positions = [];
          for (let position = Number(part.start); position <= Number(part.end); position += 1) positions.push(position);
          return positions;
        });
        if (item.strand === "-") codingPositions = codingPositions.reverse();
        const codonStart = Math.max(1, Math.min(3, Number(item.codonStart) || 1));
        codingPositions = codingPositions.slice(codonStart - 1);
        const recordTranslation = String(item.translation).replace(/\s+/g, "");
        for (let aminoAcidIndex = 0; aminoAcidIndex < recordTranslation.length; aminoAcidIndex += 1) {
          const codonPositions = codingPositions.slice(aminoAcidIndex * 3, aminoAcidIndex * 3 + 3);
          if (codonPositions.length === 0) break;
          const placements = translationCodonPlacements(codonPositions, blockStart, blockEnd);
          if (placements.length === 0) continue;
          const directStart = Math.min(...codonPositions);
          const directEnd = Math.max(...codonPositions);
          const codon = codonPositions.map((position) => {
            const base = record.sequence[position - 1] || "N";
            return item.strand === "-" ? reverseComplement(base) : base;
          }).join("");
          const aminoAcid = recordTranslation[aminoAcidIndex];
          const target = makeTranslationTarget({
            positions: codonPositions,
            codon,
            aminoAcid,
            frame: item.strand === "-" ? "annotated CDS −" : "annotated CDS +",
            strand: item.strand || "+",
            translationSource: "Input CDS /translation qualifier",
            recordTranslationTable: item.translationTable,
            codonStart
          });
          target.feature = item.label || item.gene || item.product || "CDS";
          appendTranslationCodonSegments(
            cells,
            placements,
            target,
            aminoAcid,
            "sequence-extractor-aa sequence-extractor-cds-aa",
            `${target.feature}: ${aminoAcid} from input CDS /translation; ${codon || "partial codon"}, bases ${directStart}-${directEnd}`
          );
        }
        row.append(label, cells);
        return row;
      });
  }

  function renderDocumentHighlights() {
    documentView.querySelectorAll(".selected, .endpoint, .compatible-endpoint, .feature-search-match, .base-selection-range, .base-selection-primary, .base-selection-context, .selection-range, .selection-strand-primary, .selection-strand-context, .primer-selection-range, .primer-selection-primary, .primer-selection-context, .is-forward-primer-selection, .is-reverse-primer-selection, .restriction-selection-range, .restriction-overhang-selection, .restriction-cleavage-forward, .restriction-cleavage-reverse, .is-before-first-base, .product-range")
      .forEach((element) => element.classList.remove("selected", "endpoint", "compatible-endpoint", "feature-search-match", "base-selection-range", "base-selection-primary", "base-selection-context", "selection-range", "selection-strand-primary", "selection-strand-context", "primer-selection-range", "primer-selection-primary", "primer-selection-context", "is-forward-primer-selection", "is-reverse-primer-selection", "restriction-selection-range", "restriction-overhang-selection", "restriction-cleavage-forward", "restriction-cleavage-reverse", "is-before-first-base", "product-range"));
    if (selected?.kind === "base" && selected.position) {
      addStrandAwareTargetRangeClass(selected, "base-selection-range", "base-selection-primary", "base-selection-context");
      baseElementForTarget(selected)?.classList.add("selected");
    } else if (selected?.kind === "restriction-site") {
      addTargetRangeClass(selected, "restriction-selection-range");
      addRestrictionOverhangClass(selected, "restriction-overhang-selection");
      markRestrictionCleavage(selected.position, false, "restriction-cleavage-forward", "is-before-first-base");
      for (const reverseCut of restrictionComplementCuts(selected)) {
        markRestrictionCleavage(reverseCut, true, "restriction-cleavage-reverse", "is-before-first-base");
      }
    } else if (selected?.kind === "primer") {
      const primerElements = addStrandAwareTargetRangeClass(selected, "primer-selection-range", "primer-selection-primary", "primer-selection-context");
      const primerDirectionClass = selected.strand === "-" ? "is-reverse-primer-selection" : "is-forward-primer-selection";
      primerElements.forEach((element) => element.classList.add(primerDirectionClass));
    } else if (selected && selected.kind !== "base") {
      addStrandAwareTargetRangeClass(selected, "selection-range", "selection-strand-primary", "selection-strand-context");
    }
    for (const endpoint of endpoints) {
      if (endpoint.position && endpoint.kind === "base") baseElementForTarget(endpoint)?.classList.add("endpoint");
      documentView.querySelectorAll(`[data-target-key="${CSS.escape(`${endpoint.kind}-${endpoint.position ?? endpoint.start}-${endpoint.label}`)}"]`)
        .forEach((element) => element.classList.add("endpoint"));
    }
    if (endpoints.length === 1 && endpoints[0].kind === "primer") {
      for (const candidate of compatiblePrimerCandidates(endpoints[0])) {
        documentView.querySelectorAll(`[data-target-key="${CSS.escape(`${candidate.target.kind}-${candidate.target.position}-${candidate.target.label}`)}"]`)
          .forEach((element) => element.classList.add("compatible-endpoint"));
      }
    }
    const activeSearchFeature = featureSearchMatches[featureSearchIndex];
    if (activeSearchFeature) {
      const target = makeSequenceExtractorFeatureTarget(activeSearchFeature);
      const key = `${target.kind}-${target.position}-${target.label}`;
      documentView.querySelectorAll(`[data-target-key="${CSS.escape(key)}"]`)
        .forEach((element) => element.classList.add("feature-search-match"));
    }
    const shownEntry = selectionStack.find((entry) => entry.id === shownSelectionId);
    const shownProduct = shownEntry?.product;
    if (shownEntry && selectionStackEntryRecordIndex(shownEntry) === recordIndex && shownProduct?.start && shownProduct?.end) {
      if (Array.isArray(shownProduct.parts) && shownProduct.parts.length > 0) {
        for (const range of shownProduct.parts) addBaseRangeClass(range, "product-range");
      } else if (shownProduct.wrapsOrigin) {
        addBaseRangeClass({ start: shownProduct.start, end: activeRecord().length }, "product-range");
        addBaseRangeClass({ start: 1, end: shownProduct.end }, "product-range");
      } else {
        addBaseRangeClass({ start: shownProduct.start, end: shownProduct.end }, "product-range");
      }
    }
  }

  function renderDocument() {
    const pageScroll = pendingRenderPageScroll ?? capturePageScrollState();
    pendingRenderPageScroll = null;
    const scrollAnchor = captureDocumentScrollAnchor();
    hideHoverCard();
    documentView.textContent = "";
    baseElementsByPosition = new Map();
    const record = activeRecord();
    const recordCdsFeatures = featureItems(record).filter((item) => String(item.type || item.featureType).toUpperCase() === "CDS");
    const translatedCdsCount = recordCdsFeatures.filter((item) => String(item.translation || "").replace(/\s+/g, "")).length;
    translationNote.className = `sequence-extractor-translation-note is-${translationMode}`;
    translationNote.textContent = translationMode === "cds"
      ? translatedCdsCount > 0
        ? `Annotated CDS translations · ${translatedCdsCount}/${recordCdsFeatures.length} CDS with /translation · genetic code setting is not applied`
        : `No annotated CDS /translation in this panel · genetic code setting is not applied`
      : translationMode === "six-frame"
        ? `Computed six-frame translation · NCBI table ${selectedGeneticCode.id}: ${selectedGeneticCode.name}`
        : "Translations hidden";
    status.textContent = `${records.length > 1 ? `panel ${recordIndex + 1}/${records.length} · ` : ""}${record.length.toLocaleString()} bp · ${selectionTopology} selections · arrows point 5′→3′ · click bases, amino acids, primers, or restriction sites`;
    const preferredLineWidth = Number(extractor.lineWidth) || 60;
    const mainWidth = main.getBoundingClientRect().width || shell.getBoundingClientRect().width;
    const sequenceWidth = Math.max(160, mainWidth - 28 - 76);
    const responsiveLineWidth = Math.max(20, Math.floor(sequenceWidth / 8));
    const lineWidth = Math.min(preferredLineWidth, responsiveLineWidth);
    renderedLineWidth = lineWidth;
    for (let offset = 0; offset < record.sequence.length; offset += lineWidth) {
      const blockStart = offset + 1;
      const blockEnd = Math.min(record.length, offset + lineWidth);
      const chunk = record.sequence.slice(offset, blockEnd);
      const block = document.createElement("section");
      block.className = "sequence-extractor-block";
      block.style.setProperty("--sequence-extractor-columns", String(lineWidth));
      block.dataset.start = String(blockStart);
      block.dataset.end = String(blockEnd);

      const restrictionRow = showCuts
        ? makeAnnotationRow(itemsInBlock(record, "restriction-sites", blockStart, blockEnd), blockStart, blockEnd, "restriction", record)
        : null;
      const primerRow = makeAnnotationRow(itemsInBlock(record, "pcr-primer-sites", blockStart, blockEnd), blockStart, blockEnd, "primer", record);
      const featureRow = featureRowForBlock(record, blockStart, blockEnd);
      if (featureRow) block.append(featureRow);
      if (primerRow) block.append(primerRow);
      if (restrictionRow) block.append(restrictionRow);
      if (translationMode === "six-frame") {
        block.append(
          makeFrameTranslationRow(record, blockStart, blockEnd, 0, "+"),
          makeFrameTranslationRow(record, blockStart, blockEnd, 1, "+"),
          makeFrameTranslationRow(record, blockStart, blockEnd, 2, "+"),
          makeFrameTranslationRow(record, blockStart, blockEnd, 0, "-"),
          makeFrameTranslationRow(record, blockStart, blockEnd, 1, "-"),
          makeFrameTranslationRow(record, blockStart, blockEnd, 2, "-")
        );
      } else if (translationMode === "cds") {
        const cdsRows = makeCdsTranslationRows(record, blockStart, blockEnd);
        if (cdsRows.length > 0) block.append(...cdsRows);
      }

      const ruler = document.createElement("div");
      ruler.className = "sequence-extractor-sequence-row sequence-extractor-coordinate-row";
      const rulerLabel = document.createElement("span");
      rulerLabel.className = "sequence-extractor-row-label";
      rulerLabel.setAttribute("aria-hidden", "true");
      const rulerCells = document.createElement("div");
      rulerCells.className = "sequence-extractor-cells sequence-extractor-coordinate-cells";
      rulerCells.setAttribute("aria-label", `Coordinates ${blockStart.toLocaleString()} to ${blockEnd.toLocaleString()}`);
      const tickPositions = [blockStart];
      for (let position = Math.ceil(blockStart / 5) * 5; position <= blockEnd; position += 5) {
        if (position - tickPositions.at(-1) >= 4) tickPositions.push(position);
      }
      if (blockEnd - tickPositions.at(-1) >= 6) tickPositions.push(blockEnd);
      for (const position of tickPositions) {
        const tick = document.createElement("span");
        tick.className = "sequence-extractor-coordinate-tick";
        tick.textContent = position.toLocaleString();
        tick.style.gridColumn = String(position - blockStart + 1);
        tick.dataset.position = String(position);
        rulerCells.append(tick);
      }
      ruler.append(rulerLabel, rulerCells);
      block.append(ruler);

      const dnaRow = document.createElement("div");
      dnaRow.className = "sequence-extractor-sequence-row sequence-extractor-dna-row";
      const dnaLabel = document.createElement("span");
      dnaLabel.className = "sequence-extractor-row-label";
      dnaLabel.textContent = "Forward";
      const dnaCells = document.createElement("div");
      dnaCells.className = "sequence-extractor-cells";
      Array.from(chunk).forEach((base, index) => {
        const position = blockStart + index;
        const target = { kind: "base", type: "Base", label: `${base} at ${position}`, position, start: position, end: position, strand: "+", base };
        const button = makeButton(base, "sequence-extractor-base", () => selectTarget(target));
        button.id = `sequence-extractor-base-${recordIndex}-${position}`;
        button.title = `Base ${base} at ${position}`;
        registerBaseElement(button, position);
        attachHoverInfo(button, target);
        dnaCells.append(button);
      });
      dnaRow.append(dnaLabel, dnaCells);
      block.append(dnaRow);

      const complementRow = document.createElement("div");
      complementRow.className = "sequence-extractor-sequence-row sequence-extractor-complement-row";
      const complementLabel = document.createElement("span");
      complementLabel.className = "sequence-extractor-row-label";
      complementLabel.textContent = "Reverse";
      const complementCells = document.createElement("div");
      complementCells.className = "sequence-extractor-cells";
      Array.from(complementDnaRnaSequence(chunk, { preserveCase: false })).forEach((base, index) => {
        const position = blockStart + index;
        const target = { kind: "base", type: "Complement base", label: `${base} at ${position}`, position, start: position, end: position, strand: "-", base };
        const button = makeButton(base, "sequence-extractor-base complement", () => selectTarget(target));
        button.id = `sequence-extractor-complement-base-${recordIndex}-${position}`;
        button.title = `Complement base ${base} at direct coordinate ${position}`;
        registerBaseElement(button, position);
        attachHoverInfo(button, target);
        complementCells.append(button);
      });
      complementRow.append(complementLabel, complementCells);
      block.append(complementRow);
      documentView.append(block);
      pruneCoordinateTickCollisions(rulerCells);
      updateFeatureLabelPresentation(block);
    }
    const expectedRestrictionSites = (record.tracks ?? [])
      .filter((track) => track.type === "restriction-sites")
      .flatMap((track) => track.items ?? [])
      .length;
    const renderedRestrictionSites = showCuts
      ? Array.from(documentView.querySelectorAll("[data-restriction-site-count]"))
          .reduce((total, element) => total + Number(element.dataset.restrictionSiteCount || 0), 0)
      : 0;
    const restrictionDisplayComplete = !showCuts || renderedRestrictionSites === expectedRestrictionSites;
    cutCoverage.hidden = !showCuts;
    cutCoverage.dataset.expectedSites = String(expectedRestrictionSites);
    cutCoverage.dataset.renderedSites = String(renderedRestrictionSites);
    cutCoverage.classList.toggle("is-incomplete", !restrictionDisplayComplete);
    cutCoverage.textContent = restrictionDisplayComplete
      ? `${renderedRestrictionSites.toLocaleString()}/${expectedRestrictionSites.toLocaleString()} sites shown`
      : `${renderedRestrictionSites.toLocaleString()}/${expectedRestrictionSites.toLocaleString()} sites shown — incomplete`;
    cutCoverage.setAttribute(
      "aria-label",
      restrictionDisplayComplete
        ? `All ${expectedRestrictionSites.toLocaleString()} detected restriction enzyme sites are shown`
        : `Warning: only ${renderedRestrictionSites.toLocaleString()} of ${expectedRestrictionSites.toLocaleString()} detected restriction enzyme sites are shown`
    );
    renderDocumentHighlights();
    restoreDocumentScrollAnchor(scrollAnchor);
    keepPageScrollStable(pageScroll);
  }

  function captureDocumentScrollAnchor() {
    const viewport = documentView.getBoundingClientRect();
    const rows = Array.from(documentView.querySelectorAll(".sequence-extractor-coordinate-row"));
    const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > viewport.top + 1);
    const block = row?.closest(".sequence-extractor-block") ?? null;
    return {
      blockStart: block?.dataset.start ?? null,
      rowOffset: row ? row.getBoundingClientRect().top - viewport.top : 0,
      scrollTop: documentView.scrollTop,
      scrollLeft: documentView.scrollLeft
    };
  }

  function restoreDocumentScrollAnchor(anchor) {
    if (!anchor) return;
    documentView.scrollLeft = anchor.scrollLeft;
    const block = anchor.blockStart
      ? documentView.querySelector(`.sequence-extractor-block[data-start="${CSS.escape(anchor.blockStart)}"]`)
      : null;
    if (!block) {
      documentView.scrollTop = anchor.scrollTop;
      return;
    }
    const row = block.querySelector(".sequence-extractor-coordinate-row");
    if (!row) {
      documentView.scrollTop = anchor.scrollTop;
      return;
    }
    const viewportTop = documentView.getBoundingClientRect().top;
    const currentOffset = row.getBoundingClientRect().top - viewportTop;
    documentView.scrollTop += currentOffset - anchor.rowOffset;
  }

  function pruneCoordinateTickCollisions(container) {
    const ticks = Array.from(container.querySelectorAll(".sequence-extractor-coordinate-tick"));
    for (const tick of ticks) tick.hidden = false;
    const measurements = ticks.map((tick) => {
      const rect = tick.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    const visibleIndexes = new Set(nonOverlappingCoordinateTickIndexes(measurements));
    ticks.forEach((tick, index) => {
      tick.hidden = !visibleIndexes.has(index);
    });
  }

  function pruneAllCoordinateTickCollisions() {
    documentView.querySelectorAll(".sequence-extractor-coordinate-cells")
      .forEach((container) => pruneCoordinateTickCollisions(container));
  }

  function updateFeatureLabelPresentation(container = documentView) {
    container.querySelectorAll(".sequence-extractor-feature-target").forEach((button) => {
      const label = button.querySelector(".sequence-extractor-feature-label");
      if (!label) return;
      button.classList.remove("is-compact-feature");
      const availableWidth = Math.max(0, button.clientWidth - 10);
      const labelFits = label.scrollWidth <= availableWidth;
      button.classList.toggle("is-compact-feature", !labelFits && availableWidth < 28);
    });
  }

  recordSelect.addEventListener("change", () => {
    recordIndex = Number(recordSelect.value) || 0;
    selected = null;
    endpoints = [];
    product = null;
    updateFeatureTypeControl();
    renderDocument();
    runFeatureSearch("features", featureSearch.input.value);
    renderInspector();
  });
  topologySelect.addEventListener("change", () => {
    selectionTopology = topologySelect.value === "circular" ? "circular" : "linear";
    selected = null;
    endpoints = [];
    product = null;
    renderDocument();
    renderInspector();
  });
  updateFeatureTypeControl();
  renderDocument();
  renderInspector();
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const mainWidth = main.getBoundingClientRect().width || shell.getBoundingClientRect().width;
        const nextLineWidth = Math.min(
          Number(extractor.lineWidth) || 60,
          Math.max(20, Math.floor(Math.max(160, mainWidth - 28 - 76) / 8))
        );
        if (nextLineWidth !== renderedLineWidth) renderDocument();
        else {
          pruneAllCoordinateTickCollisions();
          updateFeatureLabelPresentation();
        }
        fitSelectionStackFragmentPreviews();
        positionFeatureTypePanel();
      });
    });
    observer.observe(main);
    observer.observe(inspector);
  }
}
