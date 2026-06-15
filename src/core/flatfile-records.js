import { complementDnaRnaSequence } from "./sequence.js";

export const flatfileFeatureColumns = [
  { id: "record", label: "Record" },
  { id: "format", label: "Format" },
  { id: "feature", label: "Feature" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "strand", label: "Strand" },
  { id: "partial", label: "Partial" },
  { id: "location", label: "Location" },
  { id: "gene", label: "Gene" },
  { id: "locus_tag", label: "Locus tag" },
  { id: "product", label: "Product" },
  { id: "protein_id", label: "Protein ID" },
  { id: "translation_length", label: "Translation length" }
];

function cleanSequence(text) {
  return String(text ?? "").replace(/[^A-Za-z*]/g, "").toUpperCase();
}

function normalizeHeaderValue(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function splitRecords(text) {
  return String(text ?? "")
    .split(/\n\/\/\s*(?=\n|$)/)
    .map((record) => record.trim())
    .filter(Boolean);
}

function parseHeaderLines(recordText) {
  const lines = recordText.split(/\r?\n/);
  const fields = new Map();
  let currentKey = "";
  for (const line of lines) {
    if (/^(FEATURES|ORIGIN|CONTIG|BASE COUNT)\b/.test(line)) {
      break;
    }
    const key = line.slice(0, 12).trim();
    const value = line.slice(12).trim();
    if (key) {
      currentKey = key;
      fields.set(key, value);
    } else if (currentKey && value) {
      fields.set(currentKey, `${fields.get(currentKey)} ${value}`);
    }
  }
  return fields;
}

function getFirstQualifier(feature, name, defaultValue = "") {
  const value = feature.qualifiers[name];
  if (Array.isArray(value)) {
    return value[0] ?? defaultValue;
  }
  return value ?? defaultValue;
}

function addQualifier(qualifiers, rawLine) {
  const match = rawLine.match(/^\/([^=]+)(?:=(.*))?$/);
  if (!match) {
    return;
  }
  const name = match[1];
  const rawValue = match[2] ?? "true";
  const value = rawValue.replace(/^"|"$/g, "");
  if (!qualifiers[name]) {
    qualifiers[name] = [];
  }
  qualifiers[name].push(value);
}

function appendQualifierContinuation(qualifiers, rawLine) {
  const names = Object.keys(qualifiers);
  const name = names[names.length - 1];
  if (!name) {
    return;
  }
  const values = qualifiers[name];
  values[values.length - 1] = `${values[values.length - 1]}${rawLine.trim().replace(/"$/g, "")}`;
}

function splitLocationParts(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function parseInsdcLocation(locationText) {
  const compact = String(locationText ?? "").replace(/\s+/g, "");
  const partial = compact.includes("<") || compact.includes(">");

  function parsePart(part, complement = false) {
    if (part.startsWith("complement(") && part.endsWith(")")) {
      return parsePart(part.slice("complement(".length, -1), !complement);
    }
    if ((part.startsWith("join(") || part.startsWith("order(")) && part.endsWith(")")) {
      const inner = part.slice(part.indexOf("(") + 1, -1);
      return splitLocationParts(inner).flatMap((child) => parsePart(child, complement));
    }
    const rangeMatch = part.match(/^<?(\d+)\.\.>?(\d+)$/);
    if (rangeMatch) {
      return [{
        start: Number(rangeMatch[1]),
        end: Number(rangeMatch[2]),
        strand: complement ? "-" : "+"
      }];
    }
    const betweenMatch = part.match(/^<?(\d+)\^>?(\d+)$/);
    if (betweenMatch) {
      return [{
        start: Number(betweenMatch[1]),
        end: Number(betweenMatch[2]),
        strand: complement ? "-" : "+"
      }];
    }
    const singleMatch = part.match(/^<?(\d+)$/);
    if (singleMatch) {
      return [{
        start: Number(singleMatch[1]),
        end: Number(singleMatch[1]),
        strand: complement ? "-" : "+"
      }];
    }
    return [];
  }

  const ranges = parsePart(compact);
  const starts = ranges.map((range) => range.start);
  const ends = ranges.map((range) => range.end);
  return {
    location: compact,
    ranges,
    start: starts.length ? Math.min(...starts) : "",
    end: ends.length ? Math.max(...ends) : "",
    strand: ranges.some((range) => range.strand === "-") ? "-" : "+",
    partial,
    supported: ranges.length > 0
  };
}

export function extractLocationSequence(sequence, parsedLocation) {
  if (!parsedLocation?.ranges?.length) {
    return "";
  }
  const pieces = parsedLocation.ranges.map((range) =>
    sequence.slice(range.start - 1, range.end)
  );
  let extracted = pieces.join("");
  if (parsedLocation.strand === "-") {
    extracted = complementDnaRnaSequence(extracted, { preserveCase: false }).split("").reverse().join("");
  }
  return extracted.toUpperCase();
}

function parseGenbankFeatures(recordText) {
  const match = recordText.match(/\nFEATURES\s+Location\/Qualifiers\n([\s\S]*?)(?:\nORIGIN|\nCONTIG|\n\/\/|$)/);
  if (!match) {
    return [];
  }
  const features = [];
  let current = null;
  for (const line of match[1].split(/\r?\n/)) {
    const featureMatch = line.match(/^ {5}(\S+)\s+(.+)$/);
    if (featureMatch) {
      if (current) {
        features.push(current);
      }
      current = {
        key: featureMatch[1],
        locationLines: [featureMatch[2].trim()],
        qualifiers: {}
      };
      continue;
    }
    if (!current) {
      continue;
    }
    const continuation = line.slice(21).trim();
    if (!continuation) {
      continue;
    }
    if (continuation.startsWith("/")) {
      addQualifier(current.qualifiers, continuation);
    } else if (Object.keys(current.qualifiers).length > 0) {
      appendQualifierContinuation(current.qualifiers, continuation);
    } else {
      current.locationLines.push(continuation);
    }
  }
  if (current) {
    features.push(current);
  }
  return features;
}

function parseGenbankRecord(recordText) {
  const fields = parseHeaderLines(recordText);
  const locusLine = recordText.match(/^LOCUS\s+(.+)$/m)?.[1] ?? "";
  const locusParts = locusLine.trim().split(/\s+/);
  const sequence = cleanSequence(recordText.match(/\nORIGIN\s*\n([\s\S]*?)(?:\n\/\/|$)/)?.[1] ?? "");
  const features = parseGenbankFeatures(recordText);
  const accession = fields.get("VERSION") || fields.get("ACCESSION") || locusParts[0] || "GenBank record";
  const isProtein = locusParts.some((part) => part.toLowerCase() === "aa");
  return makeParsedRecord({
    format: isProtein ? "GenPept" : recordText.startsWith("LOCUS") ? "GenBank/DDBJ" : "GenBank",
    accession,
    title: normalizeHeaderValue(fields.get("DEFINITION") || accession),
    organism: normalizeHeaderValue(fields.get("SOURCE") || ""),
    molecule: isProtein ? "protein" : locusParts.includes("RNA") ? "RNA" : locusParts.includes("DNA") ? "DNA" : "",
    topology: locusParts.includes("circular") ? "circular" : locusParts.includes("linear") ? "linear" : "",
    sequence,
    features
  });
}

function parseEmblFeatures(recordText) {
  const features = [];
  let current = null;
  for (const line of recordText.split(/\r?\n/)) {
    if (!line.startsWith("FT")) {
      continue;
    }
    const key = line.slice(5, 21).trim();
    const value = line.slice(21).trim();
    if (key) {
      if (current) {
        features.push(current);
      }
      current = { key, locationLines: [value], qualifiers: {} };
      continue;
    }
    if (!current || !value) {
      continue;
    }
    if (value.startsWith("/")) {
      addQualifier(current.qualifiers, value);
    } else if (Object.keys(current.qualifiers).length > 0) {
      appendQualifierContinuation(current.qualifiers, value);
    } else {
      current.locationLines.push(value);
    }
  }
  if (current) {
    features.push(current);
  }
  return features;
}

function parseEmblRecord(recordText) {
  const idLine = recordText.match(/^ID\s+(.+)$/m)?.[1] ?? "";
  const accession = recordText.match(/^AC\s+([^;]+)/m)?.[1]?.trim() || idLine.split(/\s+/)[0] || "EMBL record";
  const definition = normalizeHeaderValue(
    recordText.split(/\r?\n/).filter((line) => line.startsWith("DE")).map((line) => line.slice(5).trim()).join(" ")
  );
  const organism = normalizeHeaderValue(
    recordText.split(/\r?\n/).filter((line) => line.startsWith("OS")).map((line) => line.slice(5).trim()).join(" ")
  );
  const sequence = cleanSequence(recordText.match(/\nSQ\s+.*\n([\s\S]*?)(?:\n\/\/|$)/)?.[1] ?? "");
  return makeParsedRecord({
    format: "EMBL",
    accession,
    title: definition || accession,
    organism,
    molecule: idLine.includes("RNA") ? "RNA" : idLine.includes("DNA") ? "DNA" : "",
    topology: idLine.includes("circular") ? "circular" : idLine.includes("linear") ? "linear" : "",
    sequence,
    features: parseEmblFeatures(recordText)
  });
}

function parseUniprotFeatures(recordText) {
  const features = [];
  for (const line of recordText.split(/\r?\n/)) {
    if (!line.startsWith("FT")) {
      continue;
    }
    const match = line.match(/^FT\s+(\S+)\s+(?:(\d+)\.\.(\d+)|(\d+)\s+(\d+))(?:\s+(.+))?$/);
    if (!match) {
      continue;
    }
    const start = match[2] ?? match[4];
    const end = match[3] ?? match[5];
    features.push({
      key: match[1],
      locationLines: [`${start}..${end}`],
      qualifiers: {
        product: [normalizeHeaderValue(match[6] ?? "")]
      }
    });
  }
  return features;
}

function parseUniprotRecord(recordText) {
  const id = recordText.match(/^ID\s+(\S+)/m)?.[1] ?? "UniProt record";
  const accession = recordText.match(/^AC\s+([^;]+)/m)?.[1]?.trim() || id;
  const recommended = recordText.match(/^DE\s+RecName: Full=([^;]+);/m)?.[1];
  const organism = normalizeHeaderValue(
    recordText.split(/\r?\n/).filter((line) => line.startsWith("OS")).map((line) => line.slice(5).trim()).join(" ")
  );
  const sequence = cleanSequence(recordText.match(/\nSQ\s+.*\n([\s\S]*?)(?:\n\/\/|$)/)?.[1] ?? "");
  return makeParsedRecord({
    format: "UniProt",
    accession,
    title: recommended || id,
    organism,
    molecule: "protein",
    topology: "",
    sequence,
    features: parseUniprotFeatures(recordText)
  });
}

function makeParsedRecord({ format, accession, title, organism, molecule, topology, sequence, features }) {
  const normalizedFeatures = features.map((feature, index) => {
    const parsedLocation = parseInsdcLocation(feature.locationLines.join(""));
    const translation = getFirstQualifier(feature, "translation");
    return {
      id: `${accession}:${index + 1}`,
      record: accession,
      format,
      feature: feature.key,
      location: feature.locationLines.join(""),
      parsedLocation,
      qualifiers: feature.qualifiers,
      gene: getFirstQualifier(feature, "gene"),
      locus_tag: getFirstQualifier(feature, "locus_tag"),
      product: getFirstQualifier(feature, "product"),
      protein_id: getFirstQualifier(feature, "protein_id"),
      translation,
      nucleotide: sequence && feature.key === "CDS" && molecule !== "protein" ? extractLocationSequence(sequence, parsedLocation) : ""
    };
  });
  return {
    format,
    accession,
    title,
    organism,
    molecule,
    topology,
    sequence,
    features: normalizedFeatures,
    warnings: sequence ? [] : [`${accession}: no sequence section was found.`]
  };
}

function detectRecordFormat(recordText) {
  if (/^LOCUS\s/m.test(recordText)) {
    return "genbank";
  }
  if (/^ID\s+.*;.*\b(SV|linear|circular|DNA|RNA)\b/im.test(recordText) && /^FH\s|^FT\s/m.test(recordText)) {
    return "embl";
  }
  if (/^ID\s+\S+.*\bReviewed;|\nDE\s+RecName:|\nGN\s+/m.test(recordText)) {
    return "uniprot";
  }
  if (/^ID\s/m.test(recordText) && /^SQ\s/m.test(recordText)) {
    return "embl";
  }
  return "unknown";
}

export function parseFlatfileRecords(input) {
  const warnings = [];
  const records = [];
  for (const recordText of splitRecords(input)) {
    const format = detectRecordFormat(recordText);
    if (format === "genbank") {
      records.push(parseGenbankRecord(recordText));
    } else if (format === "embl") {
      records.push(parseEmblRecord(recordText));
    } else if (format === "uniprot") {
      records.push(parseUniprotRecord(recordText));
    } else {
      warnings.push("Skipped a record that did not look like GenBank/DDBJ, EMBL, or UniProt flatfile text.");
    }
  }
  return {
    records,
    warnings: [...warnings, ...records.flatMap((record) => record.warnings)]
  };
}

export function flatfileRecordsToFeatureRows(records) {
  return records.flatMap((record) =>
    record.features.map((feature) => ({
      record: record.accession,
      format: record.format,
      feature: feature.feature,
      start: feature.parsedLocation.start,
      end: feature.parsedLocation.end,
      strand: feature.parsedLocation.strand,
      partial: feature.parsedLocation.partial ? "yes" : "no",
      location: feature.location,
      gene: feature.gene,
      locus_tag: feature.locus_tag,
      product: feature.product,
      protein_id: feature.protein_id,
      translation_length: feature.translation?.length ?? ""
    }))
  );
}

export function flatfileRecordsToSequenceRecords(records, mode = "whole") {
  if (mode === "cds-nucleotide") {
    return records.flatMap((record) =>
      record.features
        .filter((feature) => feature.feature === "CDS" && feature.nucleotide)
        .map((feature) => ({
          title: feature.protein_id || feature.locus_tag || feature.gene || `${record.accession} CDS`,
          sequence: feature.nucleotide,
          sourceTitle: record.accession,
          featureId: feature.id
        }))
    );
  }
  if (mode === "protein") {
    const translated = records.flatMap((record) =>
      record.features
        .filter((feature) => feature.translation)
        .map((feature) => ({
          title: feature.protein_id || feature.locus_tag || feature.gene || `${record.accession} protein`,
          sequence: feature.translation,
          sourceTitle: record.accession,
          featureId: feature.id
        }))
    );
    if (translated.length > 0) {
      return translated;
    }
    return records
      .filter((record) => record.molecule === "protein" && record.sequence)
      .map((record) => ({
        title: record.accession,
        sequence: record.sequence,
        sourceTitle: record.accession
      }));
  }
  return records
    .filter((record) => record.sequence && record.molecule !== "protein")
    .map((record) => ({
      title: record.accession,
      sequence: record.sequence,
      sourceTitle: record.accession
    }));
}
