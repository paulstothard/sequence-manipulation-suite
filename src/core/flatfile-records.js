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
  // Double quotes delimit INSDC qualifier values. Apostrophes inside that
  // value (for example lacZ' or 'lacZ') are biological notation and must not
  // be treated as delimiters.
  const value = rawValue.startsWith('"')
    ? rawValue.slice(1, rawValue.endsWith('"') ? -1 : undefined)
    : rawValue;
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
  const previous = values[values.length - 1];
  const continuation = rawLine.trim().replace(/"$/g, "");
  const compactQualifier = name === "translation" || name === "replace" || name === "rpt_unit_seq";
  const separator = previous && continuation && !compactQualifier ? " " : "";
  values[values.length - 1] = `${previous}${separator}${continuation}`;
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

// Local INSDC subset: exact/partial spans and nested join/complement.
// https://www.insdc.org/submitting-standards/feature-table/ sections 3.4.2–3.4.3.
function locationExpression(part, depth = 0) {
  if (depth > 128 || part.length > 1_000_000) return {kind:'unsupported', reason:'Location exceeds supported syntax limits.'};
  const operator = /^(complement|join|order)\((.*)\)$/.exec(part);
  if (operator) {
    const pieces = splitLocationParts(operator[2]);
    if (!pieces.length || /^,|,$|,,/.test(operator[2]) || (operator[1] === 'complement' && pieces.length !== 1)) return {kind:'unsupported',reason:'Malformed location operator.'};
    return {kind:operator[1],children:pieces.map(child=>locationExpression(child,depth+1))};
  }
  const match = /^[<>]?(\d+)(?:(\.\.|\^)[<>]?(\d+))?$/.exec(part);
  if (!match) return {kind:'unsupported',reason:part.includes(':')?'Remote location requires an external sequence; extraction is unavailable.':'Unsupported or malformed location syntax.'};
  const start=Number(match[1]),end=Number(match[3]??match[1]);
  if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<1||(match[2]!=='^'&&end<start)) return {kind:'unsupported',reason:'Invalid location coordinates.'};
  return {kind:match[2]==='^'?'site':'span',start,end};
}

export function parseInsdcLocation(locationText) {
  const compact = String(locationText ?? '').replace(/\s+/g,'');
  const ranges=[],sites=[],diagnostics=[];
  const visit=(node,reverse=false)=>{
    if(node.kind==='unsupported') {diagnostics.push(node.reason);return;}
    if(node.kind==='site') {sites.push({after:node.start,before:node.end});diagnostics.push('Between-base site has no extractable nucleotide span.');return;}
    if(node.kind==='span') {ranges.push({start:node.start,end:node.end,strand:reverse?'-':'+'});return;}
    if(node.kind==='order') diagnostics.push('Order does not define a contiguous joined sequence; extraction is unavailable.');
    for(const child of node.children) visit(child,node.kind==='complement'?!reverse:reverse);
  };
  visit(locationExpression(compact));
  return {
    location:compact,ranges,
    start:ranges.length?Math.min(...ranges.map(r=>r.start)):'',
    end:ranges.length?Math.max(...ranges.map(r=>r.end)):'',
    strand:ranges.length&&ranges.every(r=>r.strand==='-')?'-':ranges.some(r=>r.strand==='-')?'.':'+',
    partial:compact.includes('<')||compact.includes('>'),
    supported:ranges.length>0&&diagnostics.length===0,
    ...(sites.length?{sites}:{}),...(diagnostics.length?{diagnostics:[...new Set(diagnostics)]}:{})
  };
}

export function extractLocationSequence(sequence, parsedLocation) {
  if (!parsedLocation?.supported || !parsedLocation.ranges?.length) return '';
  if (parsedLocation.ranges.some(r=>r.start<1||r.end>sequence.length||r.end<r.start)) return '';
  const reverseComplement=s=>complementDnaRnaSequence(s,{preserveCase:false}).split('').reverse().join('');
  const extract=node=>{
    if(node.kind==='span') return sequence.slice(node.start-1,node.end);
    if(node.kind==='join') return node.children.map(extract).join('');
    if(node.kind==='complement') return reverseComplement(extract(node.children[0]));
    throw new Error('Unsupported location cannot produce a complete sequence.');
  };
  if(parsedLocation.location) return extract(locationExpression(parsedLocation.location)).toUpperCase();
  // Legacy normalized records without source syntax only describe a uniform-strand join.
  const joined=parsedLocation.ranges.map(r=>sequence.slice(r.start-1,r.end)).join('');
  return (parsedLocation.strand==='-'?reverseComplement(joined):joined).toUpperCase();
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
  const warnings = sequence ? [] : [`${accession}: no sequence section was found.`];
  const normalizedFeatures = features.map((feature, index) => {
    const parsedLocation = parseInsdcLocation(feature.locationLines.join(""));
    if (parsedLocation.ranges.some(range => range.end > sequence.length)) {
      parsedLocation.supported = false;
      parsedLocation.diagnostics = [...(parsedLocation.diagnostics ?? []), "Location extends beyond the owning sequence; extraction is unavailable."];
    }
    for (const diagnostic of parsedLocation.diagnostics ?? []) warnings.push(`${accession} ${feature.key}: ${diagnostic}`);
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
    warnings
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
    return records.flatMap(record => {
      if (record.molecule === "protein" && record.sequence) return [{title:record.accession,sequence:record.sequence,sourceTitle:record.accession}];
      return record.features.filter(feature=>feature.translation).map(feature=>({
        title:feature.protein_id||feature.locus_tag||feature.gene||`${record.accession} protein`,
        sequence:feature.translation,sourceTitle:record.accession,featureId:feature.id
      }));
    });
  }
  return records
    .filter((record) => record.sequence && record.molecule !== "protein")
    .map((record) => ({
      title: record.accession,
      sequence: record.sequence,
      sourceTitle: record.accession
    }));
}
