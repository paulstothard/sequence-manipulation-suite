import {
  makeGff3Rows,
  parseBiologicalRecordInput,
  serializeBiologicalRecords
} from "./biological-record-format-converter.js";
import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";

export const pseudomoleculeMappingColumns = [
  { id: "order", label: "Order", type: "number" },
  { id: "source_id", label: "Source ID", type: "string" },
  { id: "source_title", label: "Source title", type: "string" },
  { id: "source_length", label: "Source length", type: "number" },
  { id: "orientation", label: "Orientation", type: "string" },
  { id: "source_start", label: "Source start", type: "number" },
  { id: "source_end", label: "Source end", type: "number" },
  { id: "pseudomolecule_start", label: "Pseudomolecule start", type: "number" },
  { id: "pseudomolecule_end", label: "Pseudomolecule end", type: "number" },
  { id: "gap_after", label: "Gap after", type: "number" },
  { id: "feature_count", label: "Features", type: "number" }
];

function sourceId(record, index) {
  return String(record.accession || record.title || `sequence_${index + 1}`).trim().split(/\s+/u)[0];
}

function normalizedPseudomoleculeId(value) {
  return String(value || "pseudomolecule")
    .trim()
    .split(/\s+/u)[0]
    .replace(/[^A-Za-z0-9_.:-]+/gu, "_") || "pseudomolecule";
}

function requestedReverseIds(value) {
  return new Set(String(value ?? "")
    .split(/[\s,;]+/u)
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean));
}

function recordMatchKeys(record, index) {
  return new Set([
    sourceId(record, index),
    record.accession,
    record.title,
    String(record.title || "").trim().split(/\s+/u)[0]
  ].map((item) => String(item ?? "").trim().toLocaleLowerCase()).filter(Boolean));
}

function reverseComplement(sequence) {
  return complementDnaRnaSequence(sequence, { preserveCase: false })
    .split("")
    .reverse()
    .join("");
}

function cleanInputRecord(record, index, warnings) {
  if (record.molecule === "protein") {
    warnings.push(`${record.title || record.accession || `Record ${index + 1}`}: skipped protein record.`);
    return null;
  }
  const cleaned = cleanDnaRnaSequence(record.sequence, {
    preserveCase: false,
    keepGaps: false
  });
  if (cleaned.removedCount > 0) {
    warnings.push(`${record.title || record.accession || `Record ${index + 1}`}: removed ${cleaned.removedCount} non-DNA character(s).`);
  }
  if (!cleaned.sequence) {
    warnings.push(`${record.title || record.accession || `Record ${index + 1}`}: skipped because no DNA sequence remained.`);
    return null;
  }
  const uracilCount = cleaned.sequence.match(/U/gu)?.length ?? 0;
  if (uracilCount > 0) {
    warnings.push(`${record.title || record.accession || `Record ${index + 1}`}: converted ${uracilCount} uracil residue(s) to thymine.`);
  }
  return {
    ...record,
    accession: sourceId(record, index),
    title: record.title || record.accession || `sequence_${index + 1}`,
    sequence: cleaned.sequence.replaceAll("U", "T"),
    features: record.features ?? [],
    inputIndex: index
  };
}

export function parsePseudomoleculeInput(input, options = {}) {
  const parsed = parseBiologicalRecordInput(input, options);
  const warnings = [...parsed.warnings];
  let sourceRecords = parsed.records;
  if (sourceRecords.length === 0 && !parsed.warnings.length) {
    sourceRecords = parseSequenceInput(input, "sequence").map((record, index) => ({
      format: record.hadHeader ? "FASTA" : "sequence",
      accession: record.title.split(/\s+/u)[0] || `sequence_${index + 1}`,
      title: record.title,
      organism: "",
      molecule: "DNA",
      topology: "linear",
      sequence: record.sequence,
      features: [],
      warnings: []
    }));
  }
  const records = sourceRecords
    .map((record, index) => cleanInputRecord(record, index, warnings))
    .filter(Boolean);
  return { records, warnings, sourceFormat: parsed.sourceFormat };
}

function orderRecords(records, order) {
  const ordered = [...records];
  if (order === "length-desc") {
    ordered.sort((left, right) =>
      right.sequence.length - left.sequence.length
      || left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
      || left.inputIndex - right.inputIndex);
  } else if (order === "name") {
    ordered.sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
      || left.inputIndex - right.inputIndex);
  }
  return ordered;
}

function flipStrand(strand) {
  return strand === "+" ? "-" : strand === "-" ? "+" : strand || ".";
}

function prefixedQualifierValues(values, prefix) {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  return list.map((value) => `${prefix}:${value}`);
}

function insdcLocation(ranges, strand = ".") {
  const body = ranges.length === 1
    ? `${ranges[0].start}..${ranges[0].end}`
    : `join(${ranges.map((range) => `${range.start}..${range.end}`).join(",")})`;
  return strand === "-" ? `complement(${body})` : body;
}

function remapFeature(feature, mapping, pseudomoleculeId, featureIndex) {
  const sourceRanges = feature.parsedLocation?.ranges?.length
    ? feature.parsedLocation.ranges
    : feature.parsedLocation?.start && feature.parsedLocation?.end
      ? [{
          start: feature.parsedLocation.start,
          end: feature.parsedLocation.end,
          strand: feature.parsedLocation.strand
        }]
      : [];
  if (!sourceRanges.length) return null;
  const localRanges = sourceRanges.map((range) => {
    const start = Math.max(1, Math.min(mapping.source_length, Number(range.start)));
    const end = Math.max(1, Math.min(mapping.source_length, Number(range.end)));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (mapping.orientation === "-") {
      return {
        start: mapping.source_length - Math.max(start, end) + 1,
        end: mapping.source_length - Math.min(start, end) + 1,
        strand: flipStrand(range.strand || feature.parsedLocation?.strand)
      };
    }
    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
      strand: range.strand || feature.parsedLocation?.strand || "."
    };
  }).filter(Boolean);
  if (!localRanges.length) return null;
  if (mapping.orientation === "-") localRanges.reverse();
  const ranges = localRanges.map((range) => ({
    ...range,
    start: mapping.pseudomolecule_start + range.start - 1,
    end: mapping.pseudomolecule_start + range.end - 1
  }));
  const qualifiers = Object.fromEntries(Object.entries(feature.qualifiers ?? {})
    .map(([name, values]) => [name, Array.isArray(values) ? [...values] : values]));
  if (qualifiers.Parent) qualifiers.Parent = prefixedQualifierValues(qualifiers.Parent, mapping.source_id);
  qualifiers.note = [
    ...(Array.isArray(qualifiers.note) ? qualifiers.note : qualifiers.note == null ? [] : [qualifiers.note]),
    `SMS3 pseudomolecule source=${mapping.source_id}; source_location=${feature.location || `${feature.parsedLocation?.start}..${feature.parsedLocation?.end}`}; orientation=${mapping.orientation}`
  ];
  const featureId = `${mapping.source_id}:${feature.id || `${feature.feature || "feature"}_${featureIndex + 1}`}`;
  const start = Math.min(...ranges.map((range) => range.start));
  const end = Math.max(...ranges.map((range) => range.end));
  const strand = ranges.every((range) => range.strand === ranges[0].strand) ? ranges[0].strand : ".";
  return {
    ...feature,
    id: featureId,
    record: pseudomoleculeId,
    location: insdcLocation(ranges, strand),
    qualifiers,
    parsedLocation: {
      ...(feature.parsedLocation ?? {}),
      ranges,
      start,
      end,
      strand,
      supported: true
    },
    nucleotide: ""
  };
}

function makeComponentFeature(pseudomoleculeId, mapping, index) {
  const start = mapping.pseudomolecule_start;
  const end = mapping.pseudomolecule_end;
  return {
    id: `${pseudomoleculeId}:component_${index + 1}`,
    record: pseudomoleculeId,
    format: "SMS3 pseudomolecule",
    feature: "misc_feature",
    location: `${start}..${end}`,
    parsedLocation: {
      ranges: [{ start, end, strand: "." }],
      start,
      end,
      strand: ".",
      supported: true
    },
    qualifiers: {
      label: [mapping.source_id],
      note: [`Source sequence ${mapping.source_id}: ${mapping.source_title}; source coordinates 1..${mapping.source_length}; orientation ${mapping.orientation}`]
    },
    gene: "",
    locus_tag: "",
    product: "",
    protein_id: "",
    translation: "",
    nucleotide: ""
  };
}

function makeGapFeature(pseudomoleculeId, start, end, index) {
  return {
    id: `${pseudomoleculeId}:gap_${index + 1}`,
    record: pseudomoleculeId,
    format: "SMS3 pseudomolecule",
    feature: "assembly_gap",
    location: `${start}..${end}`,
    parsedLocation: {
      ranges: [{ start, end, strand: "." }],
      start,
      end,
      strand: ".",
      supported: true
    },
    qualifiers: {
      gap_type: ["between scaffolds"],
      estimated_length: [String(end - start + 1)]
    },
    gene: "",
    locus_tag: `gap_${index + 1}`,
    product: `assembly gap of ${end - start + 1} N bases`,
    protein_id: "",
    translation: "",
    nucleotide: ""
  };
}

export async function buildPseudomolecule(records, options = {}, context = {}) {
  const order = new Set(["input", "length-desc", "name"]).has(options.recordOrder)
    ? options.recordOrder
    : "input";
  const gapLength = Math.max(0, Math.min(1000000, Number.parseInt(options.gapLength ?? 100, 10) || 0));
  const pseudomoleculeId = normalizedPseudomoleculeId(options.pseudomoleculeName);
  const reverseIds = requestedReverseIds(options.reverseComplementIds);
  const matchedReverseIds = new Set();
  const ordered = orderRecords(records, order);
  const mappingRows = [];
  const sequenceParts = [];
  const remappedFeatures = [];
  let nextStart = 1;

  for (const [index, record] of ordered.entries()) {
    context.throwIfCancelled?.();
    const keys = recordMatchKeys(record, record.inputIndex);
    const matchedKey = [...reverseIds].find((key) => keys.has(key));
    if (matchedKey) matchedReverseIds.add(matchedKey);
    const reversed = Boolean(matchedKey);
    const length = record.sequence.length;
    const gapAfter = index < ordered.length - 1 ? gapLength : 0;
    const row = {
      order: index + 1,
      source_id: sourceId(record, record.inputIndex),
      source_title: record.title,
      source_length: length,
      orientation: reversed ? "-" : "+",
      source_start: 1,
      source_end: length,
      pseudomolecule_start: nextStart,
      pseudomolecule_end: nextStart + length - 1,
      gap_after: gapAfter,
      feature_count: record.features.length
    };
    mappingRows.push(row);
    if (options.materializeSequence) {
      sequenceParts.push(reversed ? reverseComplement(record.sequence) : record.sequence);
      if (gapAfter) sequenceParts.push("N".repeat(gapAfter));
    }
    if (options.materializeFeatures) {
      remappedFeatures.push(makeComponentFeature(pseudomoleculeId, row, index));
      for (const [featureIndex, feature] of record.features.entries()) {
        const remapped = remapFeature(feature, row, pseudomoleculeId, featureIndex);
        if (remapped) remappedFeatures.push(remapped);
      }
      if (gapAfter) {
        remappedFeatures.push(makeGapFeature(
          pseudomoleculeId,
          row.pseudomolecule_end + 1,
          row.pseudomolecule_end + gapAfter,
          index
        ));
      }
    }
    nextStart = row.pseudomolecule_end + gapAfter + 1;
    await context.yieldIfNeeded?.();
  }

  const warnings = [];
  for (const id of reverseIds) {
    if (!matchedReverseIds.has(id)) warnings.push(`No input sequence matched reverse-complement ID "${id}".`);
  }
  if (ordered.length > 1) {
    warnings.push(`Created an artificial pseudomolecule from ${ordered.length} source sequences; coordinates across joins are synthetic and each join contains ${gapLength} N base(s).`);
  }
  const length = nextStart - 1;
  const sequence = options.materializeSequence ? sequenceParts.join("") : "";
  const organisms = [...new Set(ordered.map((sourceRecord) => String(sourceRecord.organism || "").trim()).filter(Boolean))];
  const record = options.materializeFeatures ? {
    format: "SMS3 pseudomolecule",
    accession: pseudomoleculeId,
    title: `${pseudomoleculeId} artificial pseudomolecule assembled from ${mappingRows.length} source sequence${mappingRows.length === 1 ? "" : "s"}`,
    organism: organisms.length === 1 ? organisms[0] : "artificial sequence",
    molecule: "DNA",
    topology: "linear",
    sequence,
    features: remappedFeatures,
    warnings: []
  } : null;
  return {
    id: pseudomoleculeId,
    title: pseudomoleculeId,
    length,
    sequence,
    record,
    mappingRows,
    warnings,
    sourceRecords: ordered
  };
}

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/gu, " ").replace(/\r?\n/gu, " ");
}

export function makePseudomoleculeMappingTsv(rows) {
  const headers = pseudomoleculeMappingColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => escapeTsv(row[header])).join("\t"))
  ].join("\n");
}

export function makePseudomoleculeFasta(result) {
  return formatFastaRecord(
    `${result.id} artificial pseudomolecule; sources=${result.mappingRows.length}`,
    result.sequence,
    60
  ).trimEnd();
}

export function makePseudomoleculeGff3Bundle(result) {
  const rows = result.record ? makeGff3Rows([result.record]) : [];
  const body = rows.map((row) => [
    row.seqid,
    row.source,
    row.type,
    row.start,
    row.end,
    row.score,
    row.strand,
    row.phase,
    row.attributes
  ].map(escapeTsv).join("\t")).join("\n");
  return [
    "##gff-version 3",
    `##sequence-region ${result.id} 1 ${result.length}`,
    body,
    "##FASTA",
    makePseudomoleculeFasta(result)
  ].filter((part) => part !== "").join("\n");
}

export function makePseudomoleculeBedBundle(result) {
  return result.record ? serializeBiologicalRecords([result.record], "bed-bundle") : "";
}

export function makePseudomoleculeFlatfile(result, outputFormat) {
  if (!new Set(["genbank", "embl", "ddbj"]).has(outputFormat)) return "";
  return result.record ? serializeBiologicalRecords([result.record], outputFormat) : "";
}

export function makePseudomoleculeRecordJson(result) {
  return result.record ? serializeBiologicalRecords([result.record], "parsed-json") : "";
}

export function makePseudomoleculeReport(result, options = {}) {
  const gapLength = Math.max(0, Number.parseInt(options.gapLength ?? 100, 10) || 0);
  return [
    "Pseudomolecule builder",
    `Output ID: ${result.id}`,
    `Source sequences: ${result.mappingRows.length}`,
    `Pseudomolecule length: ${result.length}`,
    `Gap between sequences: ${gapLength} N base(s)`,
    `Reverse-complemented sequences: ${result.mappingRows.filter((row) => row.orientation === "-").length}`,
    "Coordinates: 1-based inclusive; mapping rows preserve each source interval and orientation."
  ].join("\n");
}
