import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import {
  extractLocationSequence,
  flatfileFeatureColumns,
  flatfileRecordsToFeatureRows,
  flatfileRecordsToSequenceRecords,
  parseInsdcLocation,
  parseFlatfileRecords
} from "./flatfile-records.js";
import { makeDnaViewerData } from "./dna-viewer-data.js";

export const gff3Columns = [
  { id: "seqid", label: "Seqid", type: "string" },
  { id: "source", label: "Source", type: "string" },
  { id: "type", label: "Type", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "score", label: "Score", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "phase", label: "Phase", type: "string" },
  { id: "attributes", label: "Attributes", type: "string" }
];

export const bedColumns = [
  { id: "chrom", label: "Chrom", type: "string" },
  { id: "chromStart", label: "Start 0-based", type: "number" },
  { id: "chromEnd", label: "End", type: "number" },
  { id: "name", label: "Name", type: "string" },
  { id: "score", label: "Score", type: "string" },
  { id: "strand", label: "Strand", type: "string" }
];

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function tableToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => escapeTsv(row[column.id])).join("\t"))
  ].join("\n");
}

function recordsToFasta(records) {
  return records.map((record) => formatFastaRecord(record.title, record.sequence, 60)).join("\n");
}

function encodeGffAttribute(value) {
  return encodeURIComponent(String(value ?? "").replace(/\s+/g, " ").trim()).replaceAll("%20", " ");
}

function featureName(feature) {
  return feature.gene || feature.locus_tag || feature.protein_id || feature.product || feature.feature;
}

function parseGff3Attributes(text) {
  const attributes = {};
  for (const part of String(text ?? "").split(";")) {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    attributes[key] = decodeURIComponent(rawValue.join("=").trim() || "true");
  }
  return attributes;
}

function parseGtfAttributes(text) {
  const attributes = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_.-]*)\s+"([^"]*)"\s*;?/gu;
  let match = pattern.exec(String(text ?? ""));
  while (match) {
    attributes[match[1]] = match[2];
    match = pattern.exec(String(text ?? ""));
  }
  return Object.keys(attributes).length > 0 ? attributes : parseGff3Attributes(text);
}

function parseAttributes(text, format = "gff3") {
  return format === "gtf" ? parseGtfAttributes(text) : parseGff3Attributes(text);
}

function pairedFeatureId(attributes, fallback) {
  return attributes.ID ||
    attributes.Name ||
    attributes.transcript_id ||
    attributes.gene_id ||
    attributes.gene_name ||
    fallback;
}

function pairedFeatureGene(attributes) {
  return attributes.gene ||
    attributes.Name ||
    attributes.gene_name ||
    attributes.gene_id ||
    "";
}

function makeGffFeatureFromParts(record, parts, featureIndex, sourceFormat = "GFF3+FASTA") {
  const first = parts[0];
  const attributes = first.attributes ?? {};
  const id = pairedFeatureId(attributes, `${record.accession}:feature:${featureIndex + 1}`);
  const strand = first.strand === "-" ? "-" : "+";
  const ranges = parts.map((part) => ({
    start: part.start,
    end: part.end,
    strand
  }));
  const location = makeInsdcLocation(ranges, strand);
  const parsedLocation = {
    ...parseInsdcLocation(location),
    ranges,
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
    strand,
    supported: true
  };
  const qualifiers = Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) => key !== "part")
      .map(([key, value]) => [key, [value]])
  );
  const feature = {
    id,
    record: record.accession,
    format: sourceFormat,
    feature: first.type,
    location,
    parsedLocation,
    qualifiers,
    gene: pairedFeatureGene(attributes),
    locus_tag: attributes.locus_tag || attributes.transcript_id || "",
    product: attributes.product || "",
    protein_id: attributes.protein_id || "",
    translation: attributes.translation || "",
    nucleotide: ""
  };
  if (first.type === "CDS") {
    feature.nucleotide = extractLocationSequence(record.sequence, parsedLocation);
  }
  return feature;
}

function makeInsdcLocation(ranges, strand = "+") {
  const body = ranges.length === 1
    ? `${ranges[0].start}..${ranges[0].end}`
    : `join(${ranges.map((range) => `${range.start}..${range.end}`).join(",")})`;
  return strand === "-" ? `complement(${body})` : body;
}

function splitPairedAnnotationAndFasta(input) {
  const text = String(input ?? "");
  const marker = text.match(/^##FASTA\s*$/m) ?? text.match(/^---\s*FASTA\s*---\s*$/im);
  if (!marker) {
    return { annotationPart: text, fastaPart: "", hasMarker: false };
  }
  return {
    annotationPart: text.slice(0, marker.index),
    fastaPart: text.slice(marker.index + marker[0].length),
    hasMarker: true
  };
}

function flatfileInputPart(input) {
  const parts = splitPairedAnnotationAndFasta(input);
  return parts.hasMarker && !parts.fastaPart.trim() ? parts.annotationPart : String(input ?? "");
}

function looksLikeGtf(text) {
  return /\b(?:gene_id|transcript_id)\s+"[^"]*"\s*;?/u.test(String(text ?? ""));
}

function recordsFromGff3Fasta(input, warnings) {
  const text = String(input ?? "");
  if (looksLikeGtf(text)) {
    return [];
  }
  if (!/^##gff-version\s+3/m.test(text) && !/\t(?:gene|CDS|mRNA|exon|region)\t/m.test(text)) {
    return [];
  }
  const { annotationPart: gffPart, fastaPart } = splitPairedAnnotationAndFasta(text);
  const sequenceRecords = parseSequenceInput(fastaPart, "sequence");
  if (sequenceRecords.length === 0) {
    warnings.push("GFF3-like feature rows were found, but no FASTA section was available for paired conversion.");
    return [];
  }
  const recordsById = new Map(sequenceRecords.map((record) => [record.title.split(/\s+/)[0], {
    format: "GFF3+FASTA",
    accession: record.title.split(/\s+/)[0],
    title: record.title,
    organism: "",
    molecule: "DNA",
    topology: "",
    sequence: record.sequence.toUpperCase(),
    features: [],
    warnings: []
  }]));
  let featureIndex = 0;
  const groupedParts = new Map();
  const featureOrder = [];
  for (const line of gffPart.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (fields.length < 9) continue;
    const [seqid, source, type, rawStart, rawEnd, , strand, , rawAttributes] = fields;
    const record = recordsById.get(seqid);
    if (!record) {
      warnings.push(`${seqid}: skipped GFF3 feature because no matching FASTA record was found.`);
      continue;
    }
    const start = Number(rawStart);
    const end = Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const attributes = parseAttributes(rawAttributes, "gff3");
    const id = pairedFeatureId(attributes, `${seqid}:gff3:${featureIndex + 1}`);
    const partNumber = Number(attributes.part);
    if (attributes.part && Number.isInteger(partNumber) && partNumber > 0 && id) {
      const groupKey = [seqid, type, strand === "-" ? "-" : "+", id].join("\u0000");
      const list = groupedParts.get(groupKey) ?? [];
      if (list.length === 0) {
        featureOrder.push({ type: "group", groupKey, seqid });
      }
      list.push({
        seqid,
        type,
        strand: strand === "-" ? "-" : "+",
        start,
        end,
        partNumber,
        attributes
      });
      groupedParts.set(groupKey, list);
      continue;
    }
    const ranges = start <= end
      ? [{ start, end, strand: strand === "-" ? "-" : "+" }]
      : [
          { start, end: record.sequence.length, strand: strand === "-" ? "-" : "+" },
          { start: 1, end, strand: strand === "-" ? "-" : "+" }
        ];
    if (start > end) {
      record.topology = "circular";
      warnings.push(`${seqid} ${type} ${id}: start > end was treated as an origin-spanning circular feature and split into two parts.`);
    }
    const location = makeInsdcLocation(ranges, strand === "-" ? "-" : "+");
    const parsedLocation = {
      ...parseInsdcLocation(location),
      ranges,
      start: Math.min(...ranges.map((range) => range.start)),
      end: Math.max(...ranges.map((range) => range.end)),
      strand: strand === "-" ? "-" : "+",
      supported: true
    };
    const qualifiers = Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, [value]]));
    const feature = {
      id,
      record: record.accession,
      format: "GFF3+FASTA",
      feature: type,
      location,
      parsedLocation,
      qualifiers,
      gene: pairedFeatureGene(attributes),
      locus_tag: attributes.locus_tag || "",
      product: attributes.product || "",
      protein_id: attributes.protein_id || "",
      translation: attributes.translation || "",
      nucleotide: ""
    };
    if (type === "CDS") {
      feature.nucleotide = extractLocationSequence(record.sequence, parsedLocation);
    }
    featureOrder.push({ type: "direct", record, feature });
    featureIndex += 1;
  }
  const emittedGroups = new Set();
  for (const item of featureOrder) {
    if (item.type === "direct") {
      item.record.features.push(item.feature);
      continue;
    }
    if (emittedGroups.has(item.groupKey)) {
      continue;
    }
    emittedGroups.add(item.groupKey);
    const sorted = (groupedParts.get(item.groupKey) ?? []).slice().sort((left, right) => left.partNumber - right.partNumber);
    const record = recordsById.get(item.seqid);
    if (!record || sorted.length === 0) continue;
    record.features.push(makeGffFeatureFromParts(record, sorted, featureIndex));
    featureIndex += 1;
  }
  return [...recordsById.values()];
}

function recordsFromGtfFasta(input, warnings) {
  const text = String(input ?? "");
  if (!looksLikeGtf(text)) {
    return [];
  }
  const { annotationPart: gtfPart, fastaPart } = splitPairedAnnotationAndFasta(text);
  const sequenceRecords = parseSequenceInput(fastaPart, "sequence");
  if (sequenceRecords.length === 0) {
    warnings.push("GTF-like feature rows were found, but no FASTA section was available for paired conversion.");
    return [];
  }
  const recordsById = new Map(sequenceRecords.map((record) => [record.title.split(/\s+/)[0], {
    format: "GTF+FASTA",
    accession: record.title.split(/\s+/)[0],
    title: record.title,
    organism: "",
    molecule: "DNA",
    topology: "",
    sequence: record.sequence.toUpperCase(),
    features: [],
    warnings: []
  }]));
  let featureIndex = 0;
  const groupedParts = new Map();
  const featureOrder = [];
  for (const line of gtfPart.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (fields.length < 9) continue;
    const [seqid, , type, rawStart, rawEnd, , strand, , rawAttributes] = fields;
    const record = recordsById.get(seqid);
    if (!record) {
      warnings.push(`${seqid}: skipped GTF feature because no matching FASTA record was found.`);
      continue;
    }
    const start = Number(rawStart);
    const end = Number(rawEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      warnings.push(`${seqid}: skipped GTF feature with invalid 1-based inclusive coordinates (${rawStart}, ${rawEnd}).`);
      continue;
    }
    const attributes = parseAttributes(rawAttributes, "gtf");
    const transcriptId = attributes.transcript_id || "";
    const geneId = attributes.gene_id || "";
    if ((type === "CDS" || type.toLowerCase() === "exon") && transcriptId) {
      const groupAttributes = {
        ...attributes,
        ID: `${transcriptId}:${type}`,
        Parent: transcriptId
      };
      const groupKey = [seqid, type, strand === "-" ? "-" : "+", transcriptId].join("\u0000");
      const list = groupedParts.get(groupKey) ?? [];
      if (list.length === 0) {
        featureOrder.push({ type: "group", groupKey, seqid });
      }
      list.push({
        seqid,
        type,
        strand: strand === "-" ? "-" : "+",
        start,
        end,
        partNumber: list.length + 1,
        attributes: groupAttributes
      });
      groupedParts.set(groupKey, list);
      continue;
    }
    const id = pairedFeatureId(attributes, `${seqid}:gtf:${featureIndex + 1}`);
    const normalizedStrand = strand === "-" ? "-" : "+";
    const location = makeInsdcLocation([{ start, end, strand: normalizedStrand }], normalizedStrand);
    const parsedLocation = {
      ...parseInsdcLocation(location),
      ranges: [{ start, end, strand: normalizedStrand }],
      start,
      end,
      strand: normalizedStrand,
      supported: true
    };
    const qualifiers = Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, [value]]));
    const feature = {
      id,
      record: record.accession,
      format: "GTF+FASTA",
      feature: type,
      location,
      parsedLocation,
      qualifiers,
      gene: pairedFeatureGene(attributes),
      locus_tag: attributes.locus_tag || transcriptId || geneId || "",
      product: attributes.product || "",
      protein_id: attributes.protein_id || "",
      translation: attributes.translation || "",
      nucleotide: ""
    };
    if (type === "CDS") {
      feature.nucleotide = extractLocationSequence(record.sequence, parsedLocation);
    }
    featureOrder.push({ type: "direct", record, feature });
    featureIndex += 1;
  }
  const emittedGroups = new Set();
  for (const item of featureOrder) {
    if (item.type === "direct") {
      item.record.features.push(item.feature);
      continue;
    }
    if (emittedGroups.has(item.groupKey)) {
      continue;
    }
    emittedGroups.add(item.groupKey);
    const sorted = (groupedParts.get(item.groupKey) ?? []).slice().sort((left, right) => left.start - right.start || left.end - right.end);
    const record = recordsById.get(item.seqid);
    if (!record || sorted.length === 0) continue;
    record.features.push(makeGffFeatureFromParts(record, sorted, featureIndex, "GTF+FASTA"));
    featureIndex += 1;
  }
  return [...recordsById.values()];
}

function recordsFromBedFasta(input, warnings) {
  const { annotationPart: bedPart, fastaPart } = splitPairedAnnotationAndFasta(input);
  if (!fastaPart.trim()) {
    return [];
  }
  const bedLines = bedPart.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  if (bedLines.length === 0 || !bedLines.some((line) => line.split("\t").length >= 3)) {
    return [];
  }
  const sequenceRecords = parseSequenceInput(fastaPart, "sequence");
  if (sequenceRecords.length === 0) {
    warnings.push("BED-like interval rows were found, but no FASTA sequence records were available for paired conversion.");
    return [];
  }
  const recordsById = new Map(sequenceRecords.map((record) => [record.title.split(/\s+/)[0], {
    format: "BED+FASTA",
    accession: record.title.split(/\s+/)[0],
    title: record.title,
    organism: "",
    molecule: "DNA",
    topology: "",
    sequence: record.sequence.toUpperCase(),
    features: [],
    warnings: []
  }]));
  let featureIndex = 0;
  for (const line of bedLines) {
    const fields = line.split("\t");
    if (fields.length < 3) continue;
    const [chrom, rawStart, rawEnd, rawName = "", rawScore = "0", rawStrand = "."] = fields;
    const record = recordsById.get(chrom);
    if (!record) {
      warnings.push(`${chrom}: skipped BED interval because no matching FASTA record was found.`);
      continue;
    }
    const chromStart = Number(rawStart);
    const chromEnd = Number(rawEnd);
    if (!Number.isInteger(chromStart) || !Number.isInteger(chromEnd) || chromStart < 0 || chromEnd < chromStart) {
      warnings.push(`${chrom}: skipped BED interval with invalid 0-based half-open coordinates (${rawStart}, ${rawEnd}).`);
      continue;
    }
    featureIndex += 1;
    const start = chromStart + 1;
    const end = chromEnd;
    const id = rawName || `${chrom}:bed:${featureIndex}`;
    const strand = rawStrand === "+" || rawStrand === "-" ? rawStrand : ".";
    const location = makeInsdcLocation([{ start, end }], strand);
    const parsedLocation = {
      ...parseInsdcLocation(location),
      ranges: [{ start, end, strand }],
      start,
      end,
      strand,
      supported: true
    };
    record.features.push({
      id,
      record: record.accession,
      format: "BED+FASTA",
      feature: "region",
      location,
      parsedLocation,
      qualifiers: {
        Name: [rawName || id],
        score: [rawScore]
      },
      gene: "",
      locus_tag: rawName || "",
      product: "",
      protein_id: "",
      translation: "",
      nucleotide: ""
    });
  }
  return [...recordsById.values()];
}

function featureParts(feature, recordLength) {
  const ranges = feature.parsedLocation?.ranges?.length
    ? feature.parsedLocation.ranges
    : [{ start: feature.parsedLocation?.start, end: feature.parsedLocation?.end, strand: feature.parsedLocation?.strand }];
  return ranges
    .map((range) => ({
      start: Math.max(1, Math.min(recordLength || Number.MAX_SAFE_INTEGER, Number(range.start))),
      end: Math.max(1, Math.min(recordLength || Number.MAX_SAFE_INTEGER, Number(range.end))),
      strand: range.strand || feature.parsedLocation?.strand || "."
    }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start && range.end);
}

function firstQualifier(feature, key) {
  const value = feature.qualifiers?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export function makeGff3Rows(records) {
  return records.flatMap((record) =>
    record.features
      .filter((feature) => feature.parsedLocation?.supported && feature.parsedLocation.start && feature.parsedLocation.end)
      .flatMap((feature) => {
        const parts = featureParts(feature, record.sequence?.length ?? 0);
        const attributes = [
          `ID=${encodeGffAttribute(feature.id)}`,
          featureName(feature) ? `Name=${encodeGffAttribute(featureName(feature))}` : "",
          firstQualifier(feature, "gene_id") ? `gene_id=${encodeGffAttribute(firstQualifier(feature, "gene_id"))}` : "",
          firstQualifier(feature, "transcript_id") ? `transcript_id=${encodeGffAttribute(firstQualifier(feature, "transcript_id"))}` : "",
          firstQualifier(feature, "gene_name") ? `gene_name=${encodeGffAttribute(firstQualifier(feature, "gene_name"))}` : "",
          firstQualifier(feature, "Parent") ? `Parent=${encodeGffAttribute(firstQualifier(feature, "Parent"))}` : "",
          feature.product ? `product=${encodeGffAttribute(feature.product)}` : "",
          feature.protein_id ? `protein_id=${encodeGffAttribute(feature.protein_id)}` : ""
        ].filter(Boolean).join(";");
        return parts.map((part, index) => ({
          seqid: record.accession,
          source: "SMS3",
          type: feature.feature,
          start: part.start,
          end: part.end,
          score: ".",
          strand: part.strand || ".",
          phase: ".",
          attributes: parts.length > 1 ? `${attributes};part=${index + 1}` : attributes
        }));
      })
  );
}

export function makeBedRows(records) {
  return records.flatMap((record) =>
    record.features
      .filter((feature) => feature.parsedLocation?.supported && feature.parsedLocation.start && feature.parsedLocation.end)
      .flatMap((feature) =>
        featureParts(feature, record.sequence?.length ?? 0).map((part, index, parts) => ({
          chrom: record.accession,
          chromStart: Math.max(0, Number(part.start) - 1),
          chromEnd: Number(part.end),
          name: parts.length > 1 ? `${featureName(feature)} part ${index + 1}` : featureName(feature),
          score: "0",
          strand: part.strand || "."
        }))
      )
  );
}

function makeGff3Fasta(records, gff3Rows) {
  const gffBody = tableToTsv(gff3Columns, gff3Rows).split("\n").slice(1).join("\n");
  const fasta = recordsToFasta(flatfileRecordsToSequenceRecords(records, "whole"));
  return [`##gff-version 3`, gffBody, "##FASTA", fasta].filter((part) => part !== "").join("\n");
}

function makeBedFasta(records, bedRows) {
  const bedBody = tableToTsv(bedColumns, bedRows).split("\n").slice(1).join("\n");
  const fasta = recordsToFasta(flatfileRecordsToSequenceRecords(records, "whole"));
  return [`# SMS3 BED + FASTA bundle`, bedBody, "##FASTA", fasta].filter((part) => part !== "").join("\n");
}

function todayInsdcDate() {
  const date = new Date();
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][date.getUTCMonth()];
  return `${String(date.getUTCDate()).padStart(2, "0")}-${month}-${date.getUTCFullYear()}`;
}

function quoteQualifierValue(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/"/g, "'");
}

function normalizedQualifierEntries(feature) {
  const seen = new Set();
  const entries = [];
  const add = (name, value) => {
    if (!name || value === "" || value == null) return;
    const key = `${name}\u0000${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push([name, value]);
  };
  for (const [name, values] of Object.entries(feature.qualifiers ?? {})) {
    const list = Array.isArray(values) ? values : [values];
    for (const value of list) add(name, value);
  }
  add("gene", feature.gene);
  add("locus_tag", feature.locus_tag);
  add("product", feature.product);
  add("protein_id", feature.protein_id);
  add("translation", feature.translation);
  return entries;
}

function formatGenbankFeature(feature) {
  const lines = [`     ${String(feature.feature || "misc_feature").padEnd(15, " ")} ${feature.location || `${feature.parsedLocation?.start || 1}..${feature.parsedLocation?.end || 1}`}`];
  for (const [name, value] of normalizedQualifierEntries(feature)) {
    if (value === true || value === "true") {
      lines.push(`                     /${name}`);
    } else {
      lines.push(`                     /${name}="${quoteQualifierValue(value)}"`);
    }
  }
  return lines.join("\n");
}

function formatEmblFeature(feature) {
  const lines = [`FT   ${String(feature.feature || "misc_feature").padEnd(16, " ")}${feature.location || `${feature.parsedLocation?.start || 1}..${feature.parsedLocation?.end || 1}`}`];
  for (const [name, value] of normalizedQualifierEntries(feature)) {
    if (value === true || value === "true") {
      lines.push(`FT                   /${name}`);
    } else {
      lines.push(`FT                   /${name}="${quoteQualifierValue(value)}"`);
    }
  }
  return lines.join("\n");
}

function formatOriginSequence(sequence) {
  const clean = String(sequence ?? "").toLowerCase();
  const lines = [];
  for (let offset = 0; offset < clean.length; offset += 60) {
    const chunk = clean.slice(offset, offset + 60);
    const grouped = chunk.match(/.{1,10}/g)?.join(" ") ?? "";
    lines.push(`${String(offset + 1).padStart(9, " ")} ${grouped}`);
  }
  return lines.join("\n");
}

function sequenceComposition(sequence) {
  const clean = String(sequence ?? "").toLowerCase();
  return {
    a: [...clean].filter((base) => base === "a").length,
    c: [...clean].filter((base) => base === "c").length,
    g: [...clean].filter((base) => base === "g").length,
    t: [...clean].filter((base) => base === "t" || base === "u").length,
    other: [...clean].filter((base) => !["a", "c", "g", "t", "u"].includes(base)).length
  };
}

function makeGenbankLikeFlatfile(records, { flavor = "GenBank" } = {}) {
  return records.map((record) => {
    const sequenceLength = record.sequence?.length ?? 0;
    const molecule = record.molecule === "protein" ? "aa" : (record.molecule || "DNA");
    const topology = record.topology || "linear";
    const source = flavor === "DDBJ" ? "DDBJ" : "SMS3";
    return [
      `LOCUS       ${String(record.accession || "SMS3_RECORD").slice(0, 16).padEnd(16, " ")} ${String(sequenceLength).padStart(11, " ")} ${String(molecule).padEnd(6, " ")} ${topology.padEnd(8, " ")} ${source} ${todayInsdcDate()}`,
      `DEFINITION  ${record.title || record.accession || "Converted SMS3 record"}`,
      `ACCESSION   ${record.accession || "SMS3_RECORD"}`,
      `SOURCE      ${record.organism || "."}`,
      "FEATURES             Location/Qualifiers",
      ...record.features.map((feature) => formatGenbankFeature(feature)),
      "ORIGIN",
      formatOriginSequence(record.sequence),
      "//"
    ].filter(Boolean).join("\n");
  }).join("\n");
}

function makeEmblFlatfile(records) {
  return records.map((record) => {
    const sequenceLength = record.sequence?.length ?? 0;
    const molecule = record.molecule === "protein" ? "AA" : `${record.molecule || "DNA"}`;
    const topology = record.topology || "linear";
    const counts = sequenceComposition(record.sequence);
    return [
      `ID   ${record.accession || "SMS3_RECORD"}; SV 1; ${topology}; ${molecule}; STD; UNC; ${sequenceLength} BP.`,
      `DE   ${record.title || record.accession || "Converted SMS3 record"}`,
      `AC   ${record.accession || "SMS3_RECORD"};`,
      `OS   ${record.organism || "."}`,
      "XX",
      "FH   Key             Location/Qualifiers",
      "FH",
      ...record.features.map((feature) => formatEmblFeature(feature)),
      `SQ   Sequence ${sequenceLength} BP; ${counts.a} A; ${counts.c} C; ${counts.g} G; ${counts.t} T; ${counts.other} other;`,
      formatOriginSequence(record.sequence),
      "//"
    ].filter(Boolean).join("\n");
  }).join("\n");
}

export function makeBiologicalRecordViewerRecords(records, options = {}) {
  const topologyOverride = options.topology === "circular" || options.topology === "linear" ? options.topology : "";
  return records
    .filter((record) => record.sequence)
    .map((record) => ({
      id: record.accession,
      title: record.accession,
      sequence: record.sequence,
      topology: topologyOverride || record.topology,
      alphabet: record.molecule === "protein" ? "protein" : "dna-rna",
      compositionControls: options.compositionControls,
      tracks: [{
        id: "features",
        type: "features",
        label: "Features",
        layout: "stacked",
        items: record.features
          .filter((feature) => feature.parsedLocation?.supported && feature.parsedLocation.start && feature.parsedLocation.end)
          .map((feature) => ({
            start: feature.parsedLocation.start,
            end: feature.parsedLocation.end,
            strand: feature.parsedLocation.strand,
            parts: featureParts(feature, record.sequence?.length ?? 0),
            label: featureName(feature),
            type: feature.feature,
            gene: feature.gene,
            locus_tag: feature.locus_tag,
            product: feature.product
          }))
      }]
    }));
}

export function parseBiologicalRecordInput(input, options = {}) {
  const requestedInputFormat = options.inputFormat && options.inputFormat !== "auto" ? options.inputFormat : "auto";
  const flatfileInput = flatfileInputPart(input);
  const requestedPaired = requestedInputFormat === "gff3-fasta" || requestedInputFormat === "gtf-fasta" || requestedInputFormat === "bed-fasta";
  const parsed = requestedPaired
    ? { records: [], warnings: [] }
    : parseFlatfileRecords(flatfileInput);
  const gffWarnings = [];
  const gtfWarnings = [];
  const bedWarnings = [];
  const allowGff = requestedInputFormat === "auto" || requestedInputFormat === "gff3-fasta";
  const allowGtf = requestedInputFormat === "auto" || requestedInputFormat === "gtf-fasta";
  const allowBed = requestedInputFormat === "auto" || requestedInputFormat === "bed-fasta";
  const gffRecords = parsed.records.length > 0 || !allowGff ? [] : recordsFromGff3Fasta(input, gffWarnings);
  const gtfRecords = parsed.records.length > 0 || gffRecords.length > 0 || !allowGtf ? [] : recordsFromGtfFasta(input, gtfWarnings);
  const bedRecords = parsed.records.length > 0 || gffRecords.length > 0 || gtfRecords.length > 0 || !allowBed ? [] : recordsFromBedFasta(input, bedWarnings);
  const records = parsed.records.length > 0 ? parsed.records : gffRecords.length > 0 ? gffRecords : gtfRecords.length > 0 ? gtfRecords : bedRecords;
  const sourceWarnings = parsed.records.length > 0 ? parsed.warnings : gffRecords.length > 0 ? gffWarnings : gtfRecords.length > 0 ? gtfWarnings : bedWarnings;
  const sourceFormat = parsed.records.length > 0
    ? parsed.records.map((record) => record.format).filter(Boolean).join(", ") || "annotated flatfile"
    : gffRecords.length > 0
      ? "GFF3+FASTA"
      : gtfRecords.length > 0
        ? "GTF+FASTA"
        : bedRecords.length > 0
          ? "BED+FASTA"
          : requestedInputFormat;
  return {
    records,
    warnings: sourceWarnings,
    sourceFormat
  };
}

export function convertBiologicalRecord(input, options = {}) {
  const parsedInput = parseBiologicalRecordInput(input, options);
  const { records, sourceFormat } = parsedInput;
  const featureRows = flatfileRecordsToFeatureRows(records);
  const wholeRecords = flatfileRecordsToSequenceRecords(records, "whole");
  const cdsRecords = flatfileRecordsToSequenceRecords(records, "cds-nucleotide");
  const proteinRecords = flatfileRecordsToSequenceRecords(records, "protein");
  const gff3Rows = makeGff3Rows(records);
  const bedRows = makeBedRows(records);
  const gff3Fasta = makeGff3Fasta(records, gff3Rows);
  const bedFasta = makeBedFasta(records, bedRows);
  const genbankFlatfile = makeGenbankLikeFlatfile(records, { flavor: "GenBank" });
  const ddbjFlatfile = makeGenbankLikeFlatfile(records, { flavor: "DDBJ" });
  const emblFlatfile = makeEmblFlatfile(records);
  const hasProteinOnly = records.length > 0 && records.every((record) => record.molecule === "protein");
  const viewer = makeDnaViewerData(makeBiologicalRecordViewerRecords(records), {
    title: "Converted biological record",
    alphabet: hasProteinOnly ? "protein" : "dna-rna"
  });
  const parsedJson = JSON.stringify({ records }, null, 2);
  const viewerJson = JSON.stringify(viewer, null, 2);
  const report = [
    "Biological record format converter",
    `Input interpreted as: ${sourceFormat}`,
    `Records parsed: ${records.length}`,
    `Features parsed: ${featureRows.length}`,
    `Whole DNA/RNA FASTA records: ${wholeRecords.length}`,
    `CDS FASTA records: ${cdsRecords.length}`,
    `Protein FASTA records: ${proteinRecords.length}`,
    `GFF3 rows: ${gff3Rows.length}`,
    `BED rows: ${bedRows.length}`,
    "Coordinate policy: GFF3 uses 1-based inclusive coordinates; BED uses 0-based half-open coordinates.",
    "",
    "Supported conversion paths",
    "- GenBank/DDBJ, EMBL, GenPept, and UniProt flatfiles -> FASTA, feature TSV, GFF3-like rows, BED-like rows, paired GFF3+FASTA, paired BED+FASTA, GenBank-style flatfile, EMBL flatfile, DDBJ-style flatfile, parsed JSON, and SMS3 viewer JSON.",
    "- Paired GFF3+FASTA -> feature TSV, interval rows, paired exports, GenBank/EMBL/DDBJ-style flatfiles, parsed JSON, and SMS3 viewer JSON.",
    "- Paired BED+FASTA -> interval-style features, paired exports, GenBank/EMBL/DDBJ-style flatfiles, parsed JSON, and SMS3 viewer JSON.",
    "Loss policy: FASTA, BED, GFF3, and reconstructed flatfile exports cannot preserve every original flatfile qualifier, reference, date, fuzzy-location detail, or protein-feature semantic. Use parsed JSON or SMS3 viewer JSON when preserving SMS3-parsed structure matters."
  ].join("\n") + "\n";
  return {
    records,
    warnings: parsedInput.warnings,
    featureRows,
    wholeFasta: recordsToFasta(wholeRecords),
    cdsFasta: recordsToFasta(cdsRecords),
    proteinFasta: recordsToFasta(proteinRecords),
    featureTsv: tableToTsv(flatfileFeatureColumns, featureRows),
    gff3Rows,
    gff3: `##gff-version 3\n${tableToTsv(gff3Columns, gff3Rows).split("\n").slice(1).join("\n")}`,
    gff3Fasta,
    genbankFlatfile,
    emblFlatfile,
    ddbjFlatfile,
    bedRows,
    bed: tableToTsv(bedColumns, bedRows).split("\n").slice(1).join("\n"),
    bedFasta,
    viewer,
    viewerJson,
    parsedJson,
    report
  };
}

export function makeBiologicalRecordOutput(result, outputFormat) {
  if (outputFormat === "cds-fasta") return result.cdsFasta;
  if (outputFormat === "protein-fasta") return result.proteinFasta;
  if (outputFormat === "feature-tsv") return result.featureTsv;
  if (outputFormat === "gff3") return result.gff3;
  if (outputFormat === "gff3-bundle" || outputFormat === "gff3-fasta") return result.gff3Fasta;
  if (outputFormat === "genbank") return result.genbankFlatfile;
  if (outputFormat === "embl") return result.emblFlatfile;
  if (outputFormat === "ddbj") return result.ddbjFlatfile;
  if (outputFormat === "bed") return result.bed;
  if (outputFormat === "bed-bundle" || outputFormat === "bed-fasta") return result.bedFasta;
  if (outputFormat === "viewer-json") return result.viewerJson;
  if (outputFormat === "parsed-json") return result.parsedJson;
  if (outputFormat === "report") return result.report;
  return result.wholeFasta;
}
