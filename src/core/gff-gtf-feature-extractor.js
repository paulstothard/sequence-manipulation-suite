import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import { parseSequenceInput } from "./fasta.js";
import { exportDelimitedTable } from "./table.js";

export const GFFREAD_VERSION = "0.12.7";

export const gffGtfFeatureColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "feature", label: "Feature", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "phase", label: "Phase", type: "string" },
  { id: "id", label: "ID", type: "string" },
  { id: "parent", label: "Parent", type: "string" },
  { id: "gene_id", label: "Gene ID", type: "string" },
  { id: "transcript_id", label: "Transcript ID", type: "string" },
  { id: "name", label: "Name", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "source", label: "Source", type: "string" }
];

const OUTPUT_FORMATS = new Set([
  "feature-table",
  "transcript-fasta",
  "cds-fasta",
  "protein-fasta",
  "gff3",
  "report"
]);
const INPUT_FORMATS = new Set(["auto", "gff3", "gtf"]);
let gffreadCliPromise = null;
let gffreadRunCounter = 0;

function outputFormatLabel(value) {
  if (value === "transcript-fasta") return "Transcript FASTA";
  if (value === "cds-fasta") return "CDS DNA/RNA FASTA";
  if (value === "protein-fasta") return "Protein FASTA";
  if (value === "gff3") return "Normalized GFF3";
  if (value === "report") return "Summary report";
  return "Feature table";
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeGffGtfFeatureExtractorOptions(options = {}) {
  const inputFormat = INPUT_FORMATS.has(String(options.inputFormat ?? "auto"))
    ? String(options.inputFormat ?? "auto")
    : "auto";
  const outputFormat = OUTPUT_FORMATS.has(String(options.outputFormat ?? "feature-table"))
    ? String(options.outputFormat ?? "feature-table")
    : "feature-table";
  return {
    inputFormat,
    outputFormat,
    featureTypes: String(options.featureTypes ?? "").trim(),
    maxFeatures: parseInteger(options.maxFeatures, 50000, 1, 1000000),
    maxOutputRecords: parseInteger(options.maxOutputRecords, 5000, 1, 1000000),
    maxInputBases: parseInteger(options.maxInputBases, 20000000, 1000, 2000000000)
  };
}

function checkCancelled(context, counter = 0, interval = 1024) {
  if (counter % interval === 0) {
    context?.throwIfCancelled?.();
  }
}

export function splitGffGtfInput(input) {
  const text = String(input ?? "").replace(/\r\n?/g, "\n");
  const marker = text.match(/^##FASTA\s*$/m);
  if (marker) {
    return {
      annotationText: text.slice(0, marker.index).trim(),
      fastaText: text.slice(marker.index + marker[0].length).trim(),
      hasMarker: true
    };
  }

  const fastaStart = text.search(/^>/m);
  if (fastaStart > 0) {
    return {
      annotationText: text.slice(0, fastaStart).trim(),
      fastaText: text.slice(fastaStart).trim(),
      hasMarker: false
    };
  }

  return {
    annotationText: text.trim(),
    fastaText: "",
    hasMarker: false
  };
}

function normalizeRecordId(title) {
  return String(title ?? "").trim().split(/\s+/u)[0] || "sequence";
}

function detectAnnotationFormat(annotationText, requested = "auto") {
  if (requested !== "auto") return requested;
  const dataLine = String(annotationText ?? "")
    .split("\n")
    .find((line) => line.trim() && !line.startsWith("#"));
  if (!dataLine) return "gff3";
  const fields = dataLine.split("\t");
  const attributes = fields[8] ?? "";
  if (/\b(?:gene_id|transcript_id)\s+"[^"]*"\s*;/u.test(attributes)) {
    return "gtf";
  }
  return "gff3";
}

function parseGff3Attributes(value) {
  const attributes = {};
  for (const part of String(value ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      attributes[trimmed] = "true";
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (key) {
      attributes[key] = decodeURIComponent(rawValue);
    }
  }
  return attributes;
}

function parseGtfAttributes(value) {
  const attributes = {};
  const source = String(value ?? "");
  const pattern = /([A-Za-z_][A-Za-z0-9_.-]*)\s+"([^"]*)"\s*;?/gu;
  let match = pattern.exec(source);
  while (match) {
    attributes[match[1]] = match[2];
    match = pattern.exec(source);
  }
  if (Object.keys(attributes).length === 0) {
    return parseGff3Attributes(value);
  }
  return attributes;
}

function parseAttributes(value, format) {
  return format === "gtf" ? parseGtfAttributes(value) : parseGff3Attributes(value);
}

function parentList(attributes, format) {
  if (format === "gtf") {
    return attributes.transcript_id ? [attributes.transcript_id] : [];
  }
  return String(attributes.Parent ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function featureId(attributes, format, seqid, type, index) {
  if (format === "gtf") {
    return attributes.transcript_id || attributes.gene_id || `${seqid}:${type}:${index + 1}`;
  }
  return attributes.ID || attributes.Name || `${seqid}:${type}:${index + 1}`;
}

function featureNameFromAttributes(attributes, fallback = "") {
  return attributes.Name ||
    attributes.gene_name ||
    attributes.gene ||
    attributes.product ||
    attributes.locus_tag ||
    attributes.transcript_id ||
    attributes.gene_id ||
    fallback;
}

export function parseGffGtfAnnotation(annotationText, rawOptions = {}, context = {}) {
  const options = normalizeGffGtfFeatureExtractorOptions(rawOptions);
  const format = detectAnnotationFormat(annotationText, options.inputFormat);
  const warnings = [];
  const features = [];
  const typeFilter = featureTypeFilter(options.featureTypes);

  let lineNumber = 0;
  for (const line of String(annotationText ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    lineNumber += 1;
    if (!line.trim() || line.startsWith("#")) continue;
    checkCancelled(context, lineNumber, 512);
    if (features.length >= options.maxFeatures) {
      warnings.push(`Only the first ${options.maxFeatures.toLocaleString()} annotation feature(s) were parsed.`);
      break;
    }
    const fields = line.split("\t");
    if (fields.length < 9) {
      warnings.push(`Line ${lineNumber} was skipped because it has fewer than 9 GFF/GTF fields.`);
      continue;
    }
    const [seqid, source, type, rawStart, rawEnd, score, strand, phase, rawAttributes] = fields;
    if (typeFilter.size && !typeFilter.has(type.toLowerCase())) {
      continue;
    }
    const start = Number.parseInt(rawStart, 10);
    const end = Number.parseInt(rawEnd, 10);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      warnings.push(`Line ${lineNumber} was skipped because coordinates are not valid 1-based inclusive values.`);
      continue;
    }
    const attributes = parseAttributes(rawAttributes, format);
    const parents = parentList(attributes, format);
    const id = featureId(attributes, format, seqid, type, features.length);
    const name = featureNameFromAttributes(attributes, id);
    features.push({
      seqid,
      source,
      type,
      start,
      end,
      score,
      strand: strand === "+" || strand === "-" ? strand : ".",
      phase,
      attributes,
      rawAttributes,
      id,
      parents,
      name,
      lineNumber
    });
  }

  return { format, features, warnings };
}

function featureTypeFilter(featureTypes) {
  return new Set(
    String(featureTypes ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function filterFeaturesByType(features, featureTypes) {
  const typeFilter = featureTypeFilter(featureTypes);
  if (typeFilter.size === 0) return features;
  return features.filter((feature) => typeFilter.has(String(feature.type ?? "").toLowerCase()));
}

function makeFeatureRows(features) {
  return features.map((feature) => ({
    record: feature.seqid,
    feature: feature.type,
    start: feature.start,
    end: feature.end,
    strand: feature.strand,
    phase: feature.phase,
    id: feature.id,
    parent: feature.parents.join(","),
    gene_id: feature.attributes.gene_id || feature.attributes.gene || "",
    transcript_id: feature.attributes.transcript_id || (["mRNA", "transcript"].includes(feature.type) ? feature.id : ""),
    name: feature.name,
    length: feature.end - feature.start + 1,
    source: feature.source
  }));
}

function encodeGff3Value(value) {
  return encodeURIComponent(String(value ?? "").trim()).replaceAll("%20", " ");
}

function attributesToGff3(feature) {
  const entries = [];
  const add = (key, value) => {
    if (value == null || value === "") return;
    entries.push(`${key}=${encodeGff3Value(value)}`);
  };
  add("ID", feature.id);
  if (feature.parents.length > 0) add("Parent", feature.parents.join(","));
  if (feature.name && feature.name !== feature.id) add("Name", feature.name);
  for (const key of ["gene_id", "transcript_id", "gene_name", "product", "locus_tag", "protein_id"]) {
    if (feature.attributes[key]) add(key, feature.attributes[key]);
  }
  return entries.join(";") || ".";
}

function makeNormalizedGff3(features) {
  const body = features.map((feature) => [
    feature.seqid,
    feature.source || "SMS3",
    feature.type,
    feature.start,
    feature.end,
    feature.score || ".",
    feature.strand || ".",
    feature.phase || ".",
    attributesToGff3(feature)
  ].join("\t"));
  return ["##gff-version 3", ...body].join("\n");
}

function groupTranscriptParts(features) {
  const transcripts = new Map();
  const ensure = (id, seed = {}) => {
    if (!id) return null;
    if (!transcripts.has(id)) {
      transcripts.set(id, {
        id,
        seqid: seed.seqid || "",
        strand: seed.strand || ".",
        name: seed.name || id,
        gene_id: seed.attributes?.gene_id || seed.parents?.[0] || "",
        transcript_id: seed.attributes?.transcript_id || id,
        exons: [],
        cds: [],
        transcriptFeature: null
      });
    }
    const transcript = transcripts.get(id);
    if (seed.seqid && !transcript.seqid) transcript.seqid = seed.seqid;
    if (seed.strand && seed.strand !== ".") transcript.strand = seed.strand;
    if (seed.name && transcript.name === id) transcript.name = seed.name;
    if (seed.attributes?.gene_id && !transcript.gene_id) transcript.gene_id = seed.attributes.gene_id;
    if (seed.attributes?.transcript_id && !transcript.transcript_id) transcript.transcript_id = seed.attributes.transcript_id;
    return transcript;
  };

  for (const feature of features) {
    const type = feature.type.toLowerCase();
    if (["mrna", "transcript"].includes(type)) {
      const transcript = ensure(feature.id, feature);
      transcript.transcriptFeature = feature;
      continue;
    }
    if (type === "exon" || type === "cds") {
      const parentIds = feature.parents.length > 0
        ? feature.parents
        : [feature.attributes.transcript_id || feature.id];
      for (const parentId of parentIds) {
        const transcript = ensure(parentId, feature);
        transcript[type === "exon" ? "exons" : "cds"].push(feature);
      }
    }
  }

  for (const transcript of transcripts.values()) {
    if (transcript.exons.length === 0 && transcript.transcriptFeature) {
      transcript.exons.push(transcript.transcriptFeature);
    }
  }

  return [...transcripts.values()].filter((transcript) => transcript.exons.length > 0 || transcript.cds.length > 0);
}

async function getGffreadCli() {
  if (!gffreadCliPromise) {
    gffreadCliPromise = createBioWasmCli({
      tool: "gffread",
      program: "gffread",
      version: GFFREAD_VERSION,
      assetPath: "../vendor/biowasm/gffread/0.12.7"
    });
  }
  return gffreadCliPromise;
}

function nextGffreadRunId() {
  gffreadRunCounter += 1;
  return `sms3_gffread_${Date.now()}_${gffreadRunCounter}`;
}

function collectGffreadWarnings(stderr) {
  return String(stderr ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^FASTA index file .+\.fai created\.$/iu.test(line))
    .map((line) => `gffread reported: ${line}`);
}

async function runGffread(annotationText, fastaText, format, options, context = {}) {
  requireBioWasmRuntime("GFF/GTF Feature Extractor");
  const cli = await getGffreadCli();
  const runId = nextGffreadRunId();
  const extension = format === "gtf" ? "gtf" : "gff3";
  const annotationName = `${runId}_annotation.${extension}`;
  const fastaName = `${runId}_genome.fa`;
  const transcriptPath = `/shared/data/${runId}_transcripts.fa`;
  const cdsPath = `/shared/data/${runId}_cds.fa`;
  const proteinPath = `/shared/data/${runId}_proteins.fa`;
  const gff3Path = `/shared/data/${runId}_normalized.gff3`;

  context.reportProgress?.({ phase: "mounting-annotation-and-fasta", progress: 0.1 });
  const [annotationPath, fastaPath] = await cli.mount([
    { name: annotationName, data: new Blob([annotationText], { type: "text/plain" }) },
    { name: fastaName, data: new Blob([fastaText], { type: "text/plain" }) }
  ]);
  context.throwIfCancelled?.();

  const args = [
    annotationPath,
    "-g", fastaPath,
    "-w", transcriptPath,
    "-x", cdsPath,
    "-y", proteinPath,
    "-o", gff3Path
  ];
  const command = `gffread ${args.map((arg) => arg.startsWith("/shared/") ? arg.replace(/^\/shared\/data\//u, "") : arg).join(" ")}`;
  context.reportProgress?.({ phase: "running-gffread", progress: 0.52 });
  const result = await cli.exec("gffread", args);
  context.throwIfCancelled?.();
  const stderr = String(result?.stderr ?? "").trim();
  if (result?.code && result.code !== 0) {
    throw new Error(stderr || `gffread exited with code ${result.code}.`);
  }

  context.reportProgress?.({ phase: "reading-gffread-output", progress: 0.82 });
  const [transcriptFasta, cdsFasta, proteinFasta, gff3] = await Promise.all([
    cli.cat(transcriptPath).catch(() => ""),
    cli.cat(cdsPath).catch(() => ""),
    cli.cat(proteinPath).catch(() => ""),
    cli.cat(gff3Path).catch(() => "")
  ]);

  return {
    engine: "gffread",
    engineLabel: `gffread ${GFFREAD_VERSION}`,
    command,
    transcriptFasta: String(transcriptFasta ?? "").trim(),
    cdsFasta: String(cdsFasta ?? "").trim(),
    proteinFasta: String(proteinFasta ?? "").trim(),
    gff3: String(gff3 ?? "").trim(),
    warnings: collectGffreadWarnings(stderr)
  };
}

function makeReport({
  format,
  parsedFeatureCount,
  featureRows,
  transcripts,
  fastaRecords,
  engineLabel,
  command,
  outputFormat,
  options
}) {
  const typeCounts = featureRows.reduce((counts, row) => {
    counts[row.feature] = (counts[row.feature] ?? 0) + 1;
    return counts;
  }, {});
  const topTypes = Object.entries(typeCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([type, count]) => `${type}: ${count.toLocaleString()}`)
    .join("; ") || "none";

  return [
    "GFF/GTF feature extractor report",
    "",
    `Input format: ${format.toUpperCase()}`,
    `Engine: ${engineLabel}`,
    command ? `Command: ${command}` : "",
    `FASTA records: ${fastaRecords.length.toLocaleString()}`,
    `Features parsed: ${parsedFeatureCount.toLocaleString()}`,
    `Feature table rows: ${featureRows.length.toLocaleString()}`,
    `Transcript groups: ${transcripts.length.toLocaleString()}`,
    `Output format: ${outputFormatLabel(outputFormat)}`,
    `Feature types: ${topTypes}`,
    "",
    "Settings",
    `Feature type filter: ${options.featureTypes || "none"}`,
    `Maximum parsed features: ${options.maxFeatures.toLocaleString()}`,
    `Maximum output records: ${options.maxOutputRecords.toLocaleString()}`,
    "",
    "Method",
    `Browser runs use the bundled local gffread ${GFFREAD_VERSION} runtime for transcript, CDS, protein, and normalized GFF3 extraction.`,
    "Citation: Pertea G and Pertea M. GFF utilities: GffRead and GffCompare. F1000Research 2020;9:304."
  ].filter((line) => line !== "").join("\n");
}

export async function extractGffGtfFeatures(input, rawOptions = {}, context = {}) {
  const options = normalizeGffGtfFeatureExtractorOptions(rawOptions);
  const warnings = [];
  const { annotationText, fastaText } = splitGffGtfInput(input);
  if (!annotationText) {
    throw new Error("GFF/GTF Feature Extractor requires GFF3 or GTF annotation rows.");
  }
  if (!fastaText) {
    throw new Error("GFF/GTF Feature Extractor requires matching FASTA sequence records after the ##FASTA separator or in the matching FASTA input box.");
  }
  if (annotationText.length + fastaText.length > options.maxInputBases) {
    throw new Error(`Input is larger than the current ${options.maxInputBases.toLocaleString()} character limit for this tool.`);
  }

  context.reportProgress?.({ phase: "parsing-annotation", progress: 0.05 });
  const parsed = parseGffGtfAnnotation(annotationText, { ...options, featureTypes: "" }, context);
  warnings.push(...parsed.warnings);
  const tableFeatures = filterFeaturesByType(parsed.features, options.featureTypes);
  const featureRows = makeFeatureRows(tableFeatures);
  const fastaRecords = parseSequenceInput(fastaText, "sequence").map((record) => ({
    ...record,
    id: normalizeRecordId(record.title),
    sequence: String(record.sequence ?? "").toUpperCase()
  }));
  if (fastaRecords.length === 0) {
    throw new Error("No matching FASTA sequence records were found.");
  }
  const transcripts = groupTranscriptParts(parsed.features);
  const normalizedGff3 = makeNormalizedGff3(tableFeatures);
  const biowasm = await runGffread(annotationText, fastaText, parsed.format, options, context);
  const engine = biowasm.engine;
  const engineLabel = biowasm.engineLabel;
  const command = biowasm.command;
  const transcriptFasta = biowasm.transcriptFasta;
  const cdsFasta = biowasm.cdsFasta;
  const proteinFasta = biowasm.proteinFasta;
  const gff3 = options.featureTypes ? normalizedGff3 : biowasm.gff3;
  warnings.push(...biowasm.warnings);

  const report = makeReport({
    format: parsed.format,
    parsedFeatureCount: parsed.features.length,
    featureRows,
    transcripts,
    fastaRecords,
    engineLabel,
    command,
    outputFormat: options.outputFormat,
    options
  });

  return {
    options,
    format: parsed.format,
    engine,
    engineLabel,
    command,
    features: parsed.features,
    featureRows,
    transcripts,
    fastaRecords,
    transcriptFasta,
    cdsFasta,
    proteinFasta,
    gff3,
    report,
    warnings,
    recordsProcessed: featureRows.length,
    basesProcessed: fastaRecords.reduce((sum, record) => sum + record.sequence.length, 0)
  };
}

export function makeGffGtfFeatureTable(rows) {
  return exportDelimitedTable(gffGtfFeatureColumns, rows);
}
