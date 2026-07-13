import {
  makeBiologicalRecordViewerRecords,
  parseBiologicalRecordInput
} from "./biological-record-format-converter.js";
import { parseSequenceInput } from "./fasta.js";
import { findInSilicoPcrProductsAsync } from "./in-silico-pcr.js";
import { makeDnaViewerData, makeRestrictionViewerTracks } from "./dna-viewer-data.js";
import { findRestrictionSites, selectRestrictionEnzymes } from "./restriction-tools.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";
import { getGeneticCode } from "./genetic-code.js";
import { restrictionEnzymeRecords } from "../reference-data/restriction-enzymes/records.js";

export const SEQUENCE_EXTRACTOR_SEPARATOR = "##SEQUENCE_EXTRACTOR_PART##";

export function splitSequenceExtractorInput(input) {
  const parts = String(input ?? "").split(new RegExp(`\\n${SEQUENCE_EXTRACTOR_SEPARATOR}\\n`));
  return {
    annotationText: parts[0] ?? "",
    fastaText: parts[1] ?? "",
    primerText: parts.slice(2).join(`\n${SEQUENCE_EXTRACTOR_SEPARATOR}\n`)
  };
}

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function cleanPlainRecords(input, warnings) {
  return parseSequenceInput(input, "sequence")
    .map((record, index) => {
      const title = record.title || `Record ${index + 1}`;
      const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
      if (cleaned.removedCount > 0) {
        warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
      }
      return {
        id: `record-${index + 1}`,
        title,
        sequence: cleaned.sequence.replaceAll("U", "T"),
        length: cleaned.sequence.length,
        topology: "linear",
        tracks: []
      };
    })
    .filter((record) => record.sequence.length > 0);
}

export function parseSequenceExtractorRecords(input, options = {}) {
  const { annotationText, fastaText } = splitSequenceExtractorInput(input);
  const combined = fastaText.trim()
    ? `${annotationText}\n##FASTA\n${fastaText}`
    : annotationText;
  const warnings = [];
  const parsed = parseBiologicalRecordInput(combined, options);
  warnings.push(...parsed.warnings);
  const annotated = parsed.records.filter((record) => record.sequence && record.molecule !== "protein");
  const records = annotated.length > 0
    ? makeBiologicalRecordViewerRecords(annotated, { topology: options.topology })
    : cleanPlainRecords(annotationText, warnings);
  return {
    records: records.map((record) => ({
      ...record,
      sequence: String(record.sequence ?? "").toUpperCase().replaceAll("U", "T"),
      length: String(record.sequence ?? "").length,
      topology: options.topology === "circular" ? "circular" : record.topology === "circular" ? "circular" : "linear"
    })),
    warnings,
    sourceFormat: annotated.length > 0 ? parsed.sourceFormat : "plain sequence or FASTA"
  };
}

function selectedEnzymes(options) {
  if (options.enzymeIds !== undefined) {
    return selectRestrictionEnzymes(restrictionEnzymeRecords, options.enzymeIds);
  }
  const ids = [options.enzyme1 ?? "ecori", options.enzyme2 ?? "bamhi", options.enzyme3 ?? ""]
    .map((value) => String(value).trim())
    .filter(Boolean);
  return selectRestrictionEnzymes(restrictionEnzymeRecords, ids.join(","));
}

function makePrimerTrack(siteRows, title) {
  const items = siteRows
    .filter((row) => row.template === title)
    .map((row, index) => ({
      id: `primer-${index + 1}`,
      start: row.start,
      end: row.end,
      length: row.primer_sequence.length,
      label: `${row.primer} ${row.strand}`,
      name: row.primer,
      type: row.strand === "+" ? "Forward primer" : "Reverse primer",
      strand: row.strand,
      primerSequence: row.primer_sequence,
      primer_sequence: row.primer_sequence,
      mismatches: row.mismatches
    }));
  return items.length > 0
    ? [{
        id: "sequence-extractor-primers",
        type: "pcr-primer-sites",
        label: "Primer sites",
        layout: "stacked-intervals",
        fixedSlotsByType: { "Forward primer": 0, "Reverse primer": 1 },
        items
      }]
    : [];
}

export async function prepareSequenceExtractor(input, options = {}, context = {}) {
  const parsed = parseSequenceExtractorRecords(input, options);
  const { primerText } = splitSequenceExtractorInput(input);
  const enzymes = selectedEnzymes(options);
  const records = [];
  const warnings = [...parsed.warnings];
  const computedGeneticCode = getGeneticCode(options.geneticCode ?? "1");
  let totalPrimerSites = 0;
  let totalRestrictionSites = 0;

  for (const [recordIndex, sourceRecord] of parsed.records.entries()) {
    context.throwIfCancelled?.();
    context.reportProgress?.({
      phase: "scanning-restriction-sites",
      progress: 0.15 + (recordIndex / Math.max(1, parsed.records.length)) * 0.25,
      record: sourceRecord.title
    });
    const hits = options.showRestrictionSites === false
      ? []
      : findRestrictionSites(sourceRecord.sequence, enzymes, context);
    totalRestrictionSites += hits.length;

    let siteRows = [];
    if (primerText.trim()) {
      context.reportProgress?.({
        phase: "scanning-primers",
        progress: 0.45 + (recordIndex / Math.max(1, parsed.records.length)) * 0.3,
        record: sourceRecord.title
      });
      const pcr = await findInSilicoPcrProductsAsync(
        `>${sourceRecord.title}\n${sourceRecord.sequence}\n---\n${primerText}`,
        {
          topology: sourceRecord.topology,
          maxMismatches: options.maxMismatches,
          exactThreePrimeBases: options.exactThreePrimeBases,
          minProductLength: 1,
          maxProductLength: sourceRecord.sequence.length,
          maxBindingSitesPerTemplate: options.maxPrimerSites ?? 5000,
          maxProducts: 1
        },
        context
      );
      siteRows = pcr.siteRows ?? [];
      warnings.push(...(pcr.warnings ?? []).filter((warning) =>
        !/^No PCR products/.test(warning) &&
        !/^Product calling stopped after/.test(warning)
      ));
      totalPrimerSites += siteRows.length;
    }

    records.push({
      ...sourceRecord,
      restrictionSites: hits,
      primerBindingSites: siteRows,
      tracks: [
        ...(sourceRecord.tracks ?? []),
        ...makeRestrictionViewerTracks({ hits }),
        ...makePrimerTrack(siteRows, sourceRecord.title)
      ]
    });
    await context.yieldIfNeeded?.();
  }

  const viewer = makeDnaViewerData(records, {
    title: "Sequence Extractor",
    layout: options.topology === "circular" ? "circular" : "linear",
    geneticCode: computedGeneticCode.id
  });
  return {
    viewerType: "sequence-extractor",
    version: 1,
    title: "Sequence Extractor",
    sourceFormat: parsed.sourceFormat,
    geneticCode: computedGeneticCode.id,
    translationPolicy: {
      recordCds: {
        source: "input CDS /translation qualifier",
        usesComputedGeneticCode: false
      },
      computedFrames: {
        frames: ["+1", "+2", "+3", "-1", "-2", "-3"],
        geneticCode: { id: computedGeneticCode.id, name: computedGeneticCode.name }
      }
    },
    lineWidth: 60,
    records: viewer.records,
    warnings,
    metrics: {
      records: records.length,
      bases: records.reduce((sum, record) => sum + record.sequence.length, 0),
      restrictionSites: totalRestrictionSites,
      primerSites: totalPrimerSites
    }
  };
}

function recordSequence(record) {
  return String(record?.sequence ?? "").toUpperCase();
}

const END_CHEMISTRY_VALUES = new Set(["present", "absent", "blocked", "unknown"]);

function normalizeEndChemistryValue(value, fallback = "unknown") {
  const normalized = String(value || "").toLowerCase();
  return END_CHEMISTRY_VALUES.has(normalized) ? normalized : fallback;
}

function defaultEndChemistry(source) {
  if (source === "restriction") {
    return { fivePrimePhosphate: "present", threePrimeHydroxyl: "present" };
  }
  if (source === "primer") {
    return { fivePrimePhosphate: "absent", threePrimeHydroxyl: "present" };
  }
  return { fivePrimePhosphate: "unknown", threePrimeHydroxyl: "present" };
}

function withDefaultEndChemistry(end, source = end?.kind) {
  const defaults = defaultEndChemistry(source);
  return {
    ...end,
    fivePrimePhosphate: normalizeEndChemistryValue(end?.fivePrimePhosphate, defaults.fivePrimePhosphate),
    threePrimeHydroxyl: normalizeEndChemistryValue(end?.threePrimeHydroxyl, defaults.threePrimeHydroxyl)
  };
}

function makeBluntEnd(label, position, source = "coordinate") {
  return withDefaultEndChemistry({
    kind: source,
    label,
    position,
    overhang: "blunt",
    compatibilityKey: "blunt"
  }, source);
}

function makeSingleRestrictionEnd(site) {
  const overhang = String(site?.overhang || "unknown");
  const overhangSequence = String(site?.overhangSequence ?? site?.overhang_sequence ?? "").toUpperCase();
  const recognition = String(site?.recognition || "").toUpperCase();
  return withDefaultEndChemistry({
    kind: "restriction",
    label: site?.enzyme || site?.label || "Restriction cut",
    position: Number(site?.cutAfter ?? site?.cut_after),
    recognition,
    overhang,
    overhangSequence,
    compatibilityKey: overhang === "blunt" ? "blunt" : `${overhang}:${overhangSequence || recognition}`
  }, "restriction");
}

function makeRestrictionEnd(site) {
  const alternatives = Array.isArray(site?.groupedSites)
    ? site.groupedSites.map((candidate) => makeSingleRestrictionEnd(candidate))
    : [];
  if (alternatives.length > 1) {
    return withDefaultEndChemistry({
      kind: "restriction",
      label: site?.enzyme || site?.label || "Restriction sites",
      position: Number(site?.cutAfter ?? site?.cut_after),
      overhang: "multiple",
      alternatives,
      compatibilityKey: "multiple"
    }, "restriction");
  }
  return alternatives[0] ?? makeSingleRestrictionEnd(site);
}

function makePrimerEnd(site) {
  return makeBluntEnd(site?.name || site?.primer || site?.label || "Primer end", site?.start, "primer");
}

function fragmentEndAlternatives(end) {
  return Array.isArray(end?.alternatives) && end.alternatives.length > 0 ? end.alternatives : end ? [end] : [];
}

function normalizedEndGeometry(end) {
  const overhang = String(end?.overhang || "unknown").toLowerCase();
  return {
    overhang,
    sequence: String(end?.overhangSequence || "").toUpperCase()
  };
}

function endGeometryKey(geometry) {
  return geometry.overhang === "blunt" ? "blunt" : `${geometry.overhang}:${geometry.sequence}`;
}

function describeEndGeometry(geometry) {
  if (geometry.overhang === "blunt") return "blunt";
  if (geometry.overhang === "5 prime") return `5′${geometry.sequence ? ` ${geometry.sequence}` : " overhang"}`;
  if (geometry.overhang === "3 prime") return `3′${geometry.sequence ? ` ${geometry.sequence}` : " overhang"}`;
  return "unknown end";
}

function commonEndChemistry(end) {
  const alternatives = fragmentEndAlternatives(end);
  const fivePrimeValues = new Set(alternatives.map((candidate) => normalizeEndChemistryValue(candidate?.fivePrimePhosphate)));
  const threePrimeValues = new Set(alternatives.map((candidate) => normalizeEndChemistryValue(candidate?.threePrimeHydroxyl)));
  return {
    fivePrimePhosphate: fivePrimeValues.size === 1 ? fivePrimeValues.values().next().value : "unknown",
    threePrimeHydroxyl: threePrimeValues.size === 1 ? threePrimeValues.values().next().value : "unknown"
  };
}

function phosphodiesterBondState(fivePrimePhosphate, threePrimeHydroxyl) {
  if (fivePrimePhosphate === "unknown" || threePrimeHydroxyl === "unknown") return "unknown";
  return fivePrimePhosphate === "present" && threePrimeHydroxyl === "present" ? "sealable" : "blocked";
}

function assessLigationChemistry(leftEnd, rightEnd, geometryCompatible) {
  if (!geometryCompatible) {
    return { status: "incompatible", sealability: "not-sealable", sealableBonds: 0, label: "End geometry is incompatible" };
  }
  const left = commonEndChemistry(leftEnd);
  const right = commonEndChemistry(rightEnd);
  const bonds = [
    phosphodiesterBondState(right.fivePrimePhosphate, left.threePrimeHydroxyl),
    phosphodiesterBondState(left.fivePrimePhosphate, right.threePrimeHydroxyl)
  ];
  if (bonds.includes("unknown")) {
    return {
      status: "unknown",
      sealability: "unknown",
      sealableBonds: null,
      label: "Ligation chemistry unknown",
      warning: "End geometry matches, but 5′ phosphate or 3′ hydroxyl state is unknown. Treat or define the fragment ends before relying on this ligation."
    };
  }
  const sealableBonds = bonds.filter((state) => state === "sealable").length;
  if (sealableBonds === 2) return { status: "sealed", sealability: "sealable", sealableBonds, label: "Fully sealable junction" };
  if (sealableBonds === 1) {
    return {
      status: "nicked",
      sealability: "sealable",
      sealableBonds,
      label: "One sealable bond; one nick remains",
      warning: "This ligation can form one phosphodiester bond, leaving one nick that is not sealed in vitro."
    };
  }
  return {
    status: "unsealed",
    sealability: "not-sealable",
    sealableBonds,
    label: "No sealable phosphodiester bond",
    warning: "These ends can match geometrically but cannot be covalently joined with their current end chemistry."
  };
}

export function assessFragmentEndCompatibility(leftFragmentRightEnd, rightFragmentLeftEnd) {
  const leftGeometries = fragmentEndAlternatives(leftFragmentRightEnd).map((end) => normalizedEndGeometry(end));
  const rightGeometries = fragmentEndAlternatives(rightFragmentLeftEnd).map((end) => normalizedEndGeometry(end));
  const matches = new Map();
  for (const left of leftGeometries) {
    for (const right of rightGeometries) {
      const cohesiveMatch = left.overhang === right.overhang &&
        ["5 prime", "3 prime"].includes(left.overhang) &&
        left.sequence &&
        left.sequence === reverseComplement(right.sequence);
      const bluntMatch = left.overhang === "blunt" && right.overhang === "blunt";
      if (!cohesiveMatch && !bluntMatch) continue;
      matches.set(endGeometryKey(left), left);
    }
  }
  const geometries = Array.from(matches.values());
  const geometry = geometries[0];
  const compatible = geometries.length > 0;
  const ligation = assessLigationChemistry(leftFragmentRightEnd, rightFragmentLeftEnd, compatible);
  return {
    compatible,
    endGeometryStatus: compatible ? "compatible" : "incompatible",
    ligationChemistryStatus: ligation.sealability,
    joinable: compatible && ["sealed", "nicked"].includes(ligation.status),
    ambiguous: geometries.length > 1,
    geometry: geometry || null,
    label: compatible
      ? geometries.length > 1
        ? `${geometries.length} compatible end geometries`
        : `${describeEndGeometry(geometry)} compatible`
      : "Incompatible ends",
    leftDescription: leftGeometries.length > 0 ? Array.from(new Set(leftGeometries.map(describeEndGeometry))).join(" / ") : "unknown end",
    rightDescription: rightGeometries.length > 0 ? Array.from(new Set(rightGeometries.map(describeEndGeometry))).join(" / ") : "unknown end",
    ligation,
    warnings: ligation.warning ? [ligation.warning] : []
  };
}

export const FRAGMENT_END_TREATMENTS = Object.freeze([
  {
    id: "phosphorylate",
    label: "Phosphorylate 5′ ends",
    enzyme: "T4 polynucleotide kinase (T4 PNK)",
    method: "5′ phosphorylation"
  },
  {
    id: "dephosphorylate",
    label: "Dephosphorylate 5′ ends",
    enzyme: "Alkaline phosphatase",
    method: "5′ dephosphorylation"
  },
  {
    id: "polymerase-end-repair",
    label: "Blunt ends with polymerase",
    enzyme: "T4 DNA polymerase",
    method: "5′ fill-in and 3′ chew-back"
  },
  {
    id: "single-strand-nuclease",
    label: "Remove overhangs with nuclease",
    enzyme: "Mung bean nuclease",
    method: "Single-stranded overhang removal"
  }
]);

function treatmentTargets(target) {
  if (target === "left") return ["left"];
  if (target === "right") return ["right"];
  return ["left", "right"];
}

function cloneEnd(end) {
  if (!end) return end;
  return {
    ...end,
    alternatives: Array.isArray(end.alternatives) ? end.alternatives.map((alternative) => ({ ...alternative })) : end.alternatives
  };
}

function treatmentEndGeometry(end) {
  const alternatives = fragmentEndAlternatives(end);
  const geometries = new Map(alternatives.map((candidate) => {
    const geometry = normalizedEndGeometry(candidate);
    return [endGeometryKey(geometry), geometry];
  }));
  return geometries.size === 1 ? geometries.values().next().value : null;
}

export function applicableFragmentEndTreatments(product = {}, target = "both") {
  const selectedSides = treatmentTargets(["left", "right", "both"].includes(target) ? target : "both");
  const ends = selectedSides.map((side) => product.ends?.[side]).filter(Boolean);
  const geometries = ends.map((end) => treatmentEndGeometry(end));
  const geometryCanChange = geometries.length > 0 &&
    geometries.every(Boolean) &&
    geometries.some((geometry) => geometry.overhang !== "blunt" && geometry.overhang !== "unknown");
  const canPhosphorylate = ends.some((end) => commonEndChemistry(end).fivePrimePhosphate !== "present");
  const canDephosphorylate = ends.some((end) => commonEndChemistry(end).fivePrimePhosphate !== "absent");
  return FRAGMENT_END_TREATMENTS.filter((treatment) => {
    if (treatment.id === "phosphorylate") return canPhosphorylate;
    if (treatment.id === "dephosphorylate") return canDephosphorylate;
    return geometryCanChange;
  });
}

function setEndChemistry(end, updates) {
  const updated = { ...end, ...updates };
  if (Array.isArray(end?.alternatives)) {
    updated.alternatives = end.alternatives.map((alternative) => ({ ...alternative, ...updates }));
  }
  return updated;
}

function setEndGeometry(end, overhang, overhangSequence, treatment) {
  return {
    ...end,
    alternatives: undefined,
    overhang,
    overhangSequence,
    compatibilityKey: overhang === "blunt" ? "blunt" : `${overhang}:${overhangSequence}`,
    treatedBy: treatment
  };
}

function treatmentLabel(type) {
  return FRAGMENT_END_TREATMENTS.find((treatment) => treatment.id === type)?.label || type;
}

function treatmentDefinition(type) {
  return FRAGMENT_END_TREATMENTS.find((treatment) => treatment.id === type);
}

function treatmentOperationId(product, type, target) {
  const seed = `${product.recordTitle || ""}|${product.title || "fragment"}|${product.sequence || ""}|${type}|${target}|${product.treatments?.length || 0}`;
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `end-treatment-${(hash >>> 0).toString(36)}`;
}

function rebaseTreatmentProvenance(provenance, originalLength, leftTrim, rightTrim, appendedSequence, operation) {
  if (!provenance) return provenance;
  const retainedStart = leftTrim + 1;
  const retainedEnd = originalLength - rightTrim;
  const segments = [];
  for (const segment of provenance.segments || []) {
    const segmentStart = Number(segment.outputStart);
    const segmentEnd = Number(segment.outputEnd);
    const clippedStart = Math.max(segmentStart, retainedStart);
    const clippedEnd = Math.min(segmentEnd, retainedEnd);
    if (clippedStart > clippedEnd) continue;
    const clippedFromLeft = clippedStart - segmentStart;
    const clippedFromRight = segmentEnd - clippedEnd;
    const rebased = {
      ...segment,
      outputStart: clippedStart - leftTrim,
      outputEnd: clippedEnd - leftTrim
    };
    if (Number.isFinite(Number(segment.sourceStart)) && Number.isFinite(Number(segment.sourceEnd))) {
      if (segment.orientation === "-") {
        rebased.sourceStart = Number(segment.sourceStart) + clippedFromRight;
        rebased.sourceEnd = Number(segment.sourceEnd) - clippedFromLeft;
      } else {
        rebased.sourceStart = Number(segment.sourceStart) + clippedFromLeft;
        rebased.sourceEnd = Number(segment.sourceEnd) - clippedFromRight;
      }
    }
    segments.push(rebased);
  }
  const sources = [...(provenance.sources || [])];
  if (appendedSequence) {
    const sourceId = operation.id;
    sources.push({
      id: sourceId,
      name: operation.label,
      type: "end-treatment",
      sequence: appendedSequence,
      length: appendedSequence.length
    });
    const retainedLength = Math.max(0, retainedEnd - retainedStart + 1);
    segments.push({
      sourceId,
      sourceName: operation.label,
      outputStart: retainedLength + 1,
      outputEnd: retainedLength + appendedSequence.length,
      sourceStart: 1,
      sourceEnd: appendedSequence.length,
      orientation: "+"
    });
  }
  return {
    ...provenance,
    sources: uniqueProvenanceSources(sources),
    segments,
    junctions: (provenance.junctions || [])
      .filter((junction) => Number(junction.position) >= retainedStart && Number(junction.position) < retainedEnd)
      .map((junction) => ({ ...junction, position: Number(junction.position) - leftTrim })),
    operations: [...(provenance.operations || []), operation]
  };
}

export function applyFragmentEndTreatment(product = {}, options = {}) {
  const type = String(options.type || "");
  const target = ["left", "right", "both"].includes(options.target) ? options.target : "both";
  const definition = treatmentDefinition(type);
  if (!definition) {
    return { product: null, error: "Choose a supported fragment-end treatment." };
  }
  const selectedSides = treatmentTargets(target);
  const originalEnds = {
    left: cloneEnd(product.ends?.left),
    right: cloneEnd(product.ends?.right)
  };
  const ends = { left: cloneEnd(originalEnds.left), right: cloneEnd(originalEnds.right) };
  let sequence = String(product.sequence || "").toUpperCase();
  const originalSequence = sequence;
  let leftTrim = 0;
  let rightTrim = 0;
  let appendedSequence = "";

  for (const side of selectedSides) {
    const end = ends[side];
    if (!end) return { product: null, error: `The fragment has no ${side} end to treat.` };
    if (type === "phosphorylate") {
      ends[side] = setEndChemistry(end, { fivePrimePhosphate: "present" });
      continue;
    }
    if (type === "dephosphorylate") {
      ends[side] = setEndChemistry(end, { fivePrimePhosphate: "absent" });
      continue;
    }
    const geometry = treatmentEndGeometry(end);
    if (!geometry) return { product: null, error: `The ${side} end has multiple possible geometries; choose a specific restriction enzyme first.` };
    const overhangLength = Array.from(geometry.sequence).length;
    if (geometry.overhang === "blunt") {
      ends[side] = { ...end, treatedBy: treatmentLabel(type) };
      continue;
    }
    if (type === "polymerase-end-repair") {
      if (side === "right" && geometry.overhang === "5 prime") {
        sequence += geometry.sequence;
        appendedSequence += geometry.sequence;
      }
      if (side === "right" && geometry.overhang === "3 prime" && overhangLength > 0) {
        sequence = sequence.slice(0, -overhangLength);
        rightTrim += overhangLength;
      }
    } else if (type === "single-strand-nuclease") {
      if (side === "left" && geometry.overhang === "5 prime" && overhangLength > 0) {
        sequence = sequence.slice(overhangLength);
        leftTrim += overhangLength;
      }
      if (side === "right" && geometry.overhang === "3 prime" && overhangLength > 0) {
        sequence = sequence.slice(0, -overhangLength);
        rightTrim += overhangLength;
      }
    }
    ends[side] = setEndGeometry(end, "blunt", "", treatmentLabel(type));
  }

  const operation = {
    id: treatmentOperationId(product, type, target),
    operation: "end-treatment",
    treatment: type,
    label: definition.label,
    enzyme: definition.enzyme,
    method: definition.method,
    target,
    beforeSequence: originalSequence,
    afterSequence: sequence,
    before: originalEnds,
    after: ends
  };
  const treatedProduct = {
    ...product,
    sequence,
    directSequence: sequence,
    reverseComplement: reverseComplement(sequence),
    length: sequence.length,
    ends,
    treatments: [...(product.treatments || []), operation],
    warnings: []
  };
  if (product.provenance) {
    treatedProduct.provenance = rebaseTreatmentProvenance(
      product.provenance,
      originalSequence.length,
      leftTrim,
      rightTrim,
      appendedSequence,
      operation
    );
  }
  return { product: treatedProduct, operation, error: "" };
}

function baseProvenance(product, sourceId, sourceName) {
  const sequence = String(product?.sequence || "").toUpperCase();
  return {
    sources: [{
      id: sourceId,
      name: sourceName,
      type: product?.type || "fragment",
      sequence,
      length: sequence.length,
      recordTitle: product?.recordTitle,
      sourceStart: product?.start,
      sourceEnd: product?.end,
      sourceStrand: product?.strand || "+"
    }],
    segments: [{
      sourceId,
      sourceName,
      outputStart: 1,
      outputEnd: sequence.length,
      sourceStart: product?.start ?? 1,
      sourceEnd: product?.end ?? sequence.length,
      orientation: product?.strand === "-" ? "-" : "+"
    }],
    junctions: [],
    operations: [...(product?.treatments || [])]
  };
}

function productProvenance(product, sourceId, sourceName) {
  return product?.provenance?.sources?.length > 0
    ? product.provenance
    : baseProvenance(product, sourceId, sourceName);
}

function shiftedSegments(segments, offset) {
  return (segments || []).map((segment) => ({
    ...segment,
    outputStart: Number(segment.outputStart) + offset,
    outputEnd: Number(segment.outputEnd) + offset
  }));
}

function shiftedJunctions(junctions, offset) {
  return (junctions || []).map((junction) => ({ ...junction, position: Number(junction.position) + offset }));
}

function uniqueProvenanceSources(sources) {
  const unique = new Map();
  for (const source of sources) unique.set(source.id, source);
  return Array.from(unique.values());
}

export function joinExtractedProducts(leftProduct = {}, rightProduct = {}, options = {}) {
  const compatibility = assessFragmentEndCompatibility(leftProduct.ends?.right, rightProduct.ends?.left);
  if (!compatibility.joinable) return { compatibility, product: null };
  const leftSequence = String(leftProduct.sequence || "").toUpperCase();
  const rightSequence = String(rightProduct.sequence || "").toUpperCase();
  const sequence = leftSequence + rightSequence;
  const leftName = options.leftName || leftProduct.title || "Left fragment";
  const rightName = options.rightName || rightProduct.title || "Right fragment";
  const leftId = options.leftId || `left:${leftName}`;
  const rightId = options.rightId || `right:${rightName}`;
  const leftProvenance = productProvenance(leftProduct, leftId, leftName);
  const rightProvenance = productProvenance(rightProduct, rightId, rightName);
  const junction = {
    position: leftSequence.length,
    leftName,
    rightName,
    overhang: compatibility.geometry?.overhang,
    overhangSequence: compatibility.geometry?.sequence || "",
    label: compatibility.label,
    ligationStatus: compatibility.ligation.status,
    sealableBonds: compatibility.ligation.sealableBonds,
    chemistryLabel: compatibility.ligation.label
  };
  const product = {
    type: "assembled-fragment",
    title: options.title || `${leftName} + ${rightName}`,
    recordTitle: "Assembly",
    length: sequence.length,
    strand: "+",
    topology: "linear",
    wrapsOrigin: false,
    sequence,
    directSequence: sequence,
    reverseComplement: reverseComplement(sequence),
    ends: {
      left: leftProduct.ends?.left,
      right: rightProduct.ends?.right
    },
    warnings: [...compatibility.warnings],
    provenance: {
      method: "compatible-end ligation",
      sources: uniqueProvenanceSources([...(leftProvenance.sources || []), ...(rightProvenance.sources || [])]),
      segments: [
        ...shiftedSegments(leftProvenance.segments, 0),
        ...shiftedSegments(rightProvenance.segments, leftSequence.length)
      ],
      junctions: [
        ...shiftedJunctions(leftProvenance.junctions, 0),
        junction,
        ...shiftedJunctions(rightProvenance.junctions, leftSequence.length)
      ],
      operations: [
        ...(leftProvenance.operations || []),
        ...(rightProvenance.operations || []),
        { operation: "join", leftName, rightName, position: junction.position, compatibility: junction.label }
      ]
    }
  };
  return { compatibility, product };
}

function reverseComplementProvenance(provenance, length) {
  if (!provenance) return provenance;
  return {
    ...provenance,
    segments: [...(provenance.segments || [])].reverse().map((segment) => ({
      ...segment,
      outputStart: length - Number(segment.outputEnd) + 1,
      outputEnd: length - Number(segment.outputStart) + 1,
      orientation: segment.orientation === "-" ? "+" : "-"
    })),
    junctions: [...(provenance.junctions || [])].reverse().map((junction) => ({
      ...junction,
      position: length - Number(junction.position),
      leftName: junction.rightName,
      rightName: junction.leftName
    })),
    operations: [...(provenance.operations || []), { operation: "reverse-complement" }]
  };
}

export function reverseComplementExtractedProduct(product = {}) {
  const sequence = String(product.sequence || "").toUpperCase();
  const reversed = {
    ...product,
    sequence: reverseComplement(sequence),
    reverseComplement: sequence,
    strand: product.strand === "-" ? "+" : "-",
    orientationReversed: !product.orientationReversed,
    endpointA: product.endpointB,
    endpointB: product.endpointA,
    ends: product.ends
      ? { left: product.ends.right, right: product.ends.left }
      : product.ends,
    parts: Array.isArray(product.parts) ? [...product.parts].reverse() : product.parts,
    segments: Array.isArray(product.segments)
      ? [...product.segments].reverse().map((segment) => ({
          ...segment,
          sequence: reverseComplement(segment.sequence || "")
      }))
      : product.segments,
    provenance: reverseComplementProvenance(product.provenance, sequence.length)
  };
  if ("startBoundary" in product || "endBoundary" in product) {
    reversed.startBoundary = product.endBoundary;
    reversed.endBoundary = product.startBoundary;
  }
  return reversed;
}

export function extractCoordinateRange(record, start, end, options = {}) {
  const sequence = recordSequence(record);
  const safeStart = Math.max(1, Math.min(sequence.length, Math.round(Number(start))));
  const safeEnd = Math.max(1, Math.min(sequence.length, Math.round(Number(end))));
  const left = Math.min(safeStart, safeEnd);
  const right = Math.max(safeStart, safeEnd);
  const circular = options.topology === "circular";
  const wrapsOrigin = circular && options.preserveOrder === true && safeEnd < safeStart;
  const directSequence = wrapsOrigin
    ? sequence.slice(safeStart - 1) + sequence.slice(0, safeEnd)
    : sequence.slice(left - 1, right);
  const strand = options.strand === "-" ? "-" : "+";
  const productStart = wrapsOrigin ? safeStart : left;
  const productEnd = wrapsOrigin ? safeEnd : right;
  return {
    type: options.type ?? "coordinate-range",
    title: options.title ?? `${record.title || "sequence"}_${productStart}_${productEnd}`,
    recordTitle: record.title || "sequence",
    start: productStart,
    end: productEnd,
    length: directSequence.length,
    strand,
    topology: circular ? "circular" : "linear",
    wrapsOrigin,
    sequence: strand === "-" ? reverseComplement(directSequence) : directSequence,
    directSequence,
    reverseComplement: reverseComplement(directSequence),
    endpointA: options.endpointA,
    endpointB: options.endpointB,
    ends: {
      left: makeBluntEnd("Start coordinate", productStart),
      right: makeBluntEnd("End coordinate", productEnd)
    },
    warnings: []
  };
}

export function extractRestrictionFragment(record, firstSite, secondSite, options = {}) {
  const sequence = recordSequence(record);
  const first = Math.max(0, Math.min(sequence.length, Number(firstSite?.cutAfter ?? firstSite?.cut_after)));
  const second = Math.max(0, Math.min(sequence.length, Number(secondSite?.cutAfter ?? secondSite?.cut_after)));
  const left = Math.min(first, second);
  const right = Math.max(first, second);
  const circular = options.topology === "circular";
  const wrapsOrigin = circular && second < first;
  const fragment = wrapsOrigin ? sequence.slice(first) + sequence.slice(0, second) : sequence.slice(left, right);
  const startSite = circular ? firstSite : first <= second ? firstSite : secondSite;
  const endSite = circular ? secondSite : first <= second ? secondSite : firstSite;
  const fragmentStart = wrapsOrigin ? (first % sequence.length) + 1 : left + 1;
  const fragmentEnd = wrapsOrigin ? (second === 0 ? sequence.length : second) : right;
  return {
    type: "restriction-fragment",
    title: `${record.title || "sequence"}_${firstSite?.enzyme || "cut"}_${secondSite?.enzyme || "cut"}_${fragmentStart}_${fragmentEnd}`,
    recordTitle: record.title || "sequence",
    startBoundary: circular ? first : left,
    endBoundary: circular ? second : right,
    start: fragment.length > 0 ? fragmentStart : left,
    end: fragmentEnd,
    length: fragment.length,
    strand: "+",
    topology: circular ? "circular" : "linear",
    wrapsOrigin,
    sequence: fragment,
    directSequence: fragment,
    reverseComplement: reverseComplement(fragment),
    endpointA: firstSite,
    endpointB: secondSite,
    ends: {
      left: makeRestrictionEnd(startSite),
      right: makeRestrictionEnd(endSite)
    },
    warnings: first === second ? ["The selected restriction cuts are at the same boundary."] : []
  };
}

export function extractPrimerProduct(record, firstSite, secondSite, options = {}) {
  const forward = firstSite?.strand === "+" ? firstSite : secondSite?.strand === "+" ? secondSite : null;
  const reverse = firstSite?.strand === "-" ? firstSite : secondSite?.strand === "-" ? secondSite : null;
  if (!forward || !reverse) {
    return { type: "pcr-product", sequence: "", length: 0, warnings: ["Choose one forward and one reverse primer site."] };
  }
  const sequence = recordSequence(record);
  const forwardStart = Number(forward.start);
  const forwardEnd = Number(forward.end);
  const reverseStart = Number(reverse.start);
  const reverseEnd = Number(reverse.end);
  const circular = options.topology === "circular";
  if (![forwardStart, forwardEnd, reverseStart, reverseEnd].every(Number.isFinite) || (!circular && forwardStart > reverseStart)) {
    return { type: "pcr-product", sequence: "", length: 0, warnings: ["The forward primer must be upstream of the reverse primer for a linear PCR product."] };
  }
  const forwardPrimer = String(forward.primerSequence ?? forward.primer_sequence ?? "").toUpperCase();
  const reversePrimer = String(reverse.primerSequence ?? reverse.primer_sequence ?? "").toUpperCase();
  const wrapsOrigin = circular && reverseStart < forwardStart;
  const templateMiddle = wrapsOrigin
    ? sequence.slice(forwardEnd) + sequence.slice(0, reverseStart - 1)
    : sequence.slice(forwardEnd, reverseStart - 1);
  const product = forwardPrimer + templateMiddle + reverseComplement(reversePrimer);
  const directSequence = wrapsOrigin
    ? sequence.slice(forwardStart - 1) + sequence.slice(0, reverseEnd)
    : sequence.slice(forwardStart - 1, reverseEnd);
  return {
    type: "pcr-product",
    title: `${record.title || "sequence"}_${forward.name || forward.primer || "forward"}_${reverse.name || reverse.primer || "reverse"}`,
    recordTitle: record.title || "sequence",
    start: forwardStart,
    end: reverseEnd,
    length: product.length,
    strand: "+",
    topology: circular ? "circular" : "linear",
    wrapsOrigin,
    sequence: product,
    directSequence,
    reverseComplement: reverseComplement(product),
    endpointA: forward,
    endpointB: reverse,
    ends: {
      left: makePrimerEnd(forward),
      right: makePrimerEnd(reverse)
    },
    segments: [
      { type: "forward-primer", sequence: forwardPrimer },
      { type: "template", sequence: templateMiddle },
      { type: "reverse-primer", sequence: reverseComplement(reversePrimer) }
    ],
    warnings: []
  };
}
