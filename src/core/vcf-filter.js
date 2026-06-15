import { streamTextLines } from "./compressed-text-reader.js";
import { exportDelimitedTable } from "./table.js";

export const vcfFilterVariantColumns = [
  { id: "chrom", label: "Chrom", type: "string" },
  { id: "pos", label: "Pos", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "id", label: "ID", type: "string" },
  { id: "ref", label: "Ref", type: "string" },
  { id: "alt", label: "Alt", type: "string" },
  { id: "qual", label: "Qual", type: "string" },
  { id: "filter", label: "Filter", type: "string" },
  { id: "variant_type", label: "Variant type", type: "string" },
  { id: "missing_genotype_rate", label: "Missing genotype rate", type: "number" },
  { id: "consequence", label: "Consequence", type: "string" },
  { id: "matching_samples", label: "Matching samples", type: "string" },
  { id: "info", label: "Info", type: "string" }
];

const OUTPUT_FORMATS = new Set(["filtered-vcf", "variant-table", "report"]);
const FILTER_STATUSES = new Set(["any", "pass", "non-pass", "named"]);
const VARIANT_TYPES = new Set(["any", "snv", "mnv", "indel", "insertion", "deletion", "multiallelic", "symbolic"]);
const ID_MODES = new Set(["any", "has-id", "missing-id"]);
const GENOTYPE_MODES = new Set(["any", "called", "variant", "heterozygous", "homozygous-alt", "missing"]);
const SITE_GENOTYPE_MODES = new Set(["any", "all-called", "any-missing", "all-hom-ref", "all-reference"]);
const SAMPLE_SELECTION_MODES = new Set(["all", "keep", "remove"]);
const CONSEQUENCE_FIELDS = new Set(["auto", "ANN", "CSQ"]);
const CONSEQUENCE_IMPACTS = new Set(["any", "HIGH", "MODERATE", "LOW", "MODIFIER"]);

const DEFAULT_ANN_FIELDS = [
  "Allele",
  "Annotation",
  "Annotation_Impact",
  "Gene_Name",
  "Gene_ID",
  "Feature_Type",
  "Feature_ID",
  "Transcript_BioType",
  "Rank",
  "HGVS.c",
  "HGVS.p"
];

const DEFAULT_CSQ_FIELDS = [
  "Allele",
  "Consequence",
  "IMPACT",
  "SYMBOL",
  "Gene",
  "Feature_type",
  "Feature",
  "BIOTYPE",
  "EXON",
  "INTRON",
  "HGVSc",
  "HGVSp",
  "Amino_acids"
];

function normalizeChoice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function normalizePositiveInteger(value, fallback = null) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeNumber(value, fallback = null) {
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRate(value, fallback = null) {
  const number = normalizeNumber(value, fallback);
  return number === null ? null : Math.max(0, Math.min(1, number));
}

function normalizeMaxVariants(value) {
  const number = normalizePositiveInteger(value, 10000);
  return Math.min(Math.max(number, 1), 100000);
}

function parseList(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeOptions(options = {}) {
  return {
    chromosome: String(options.chromosome ?? "").trim(),
    regionStart: normalizePositiveInteger(options.regionStart),
    regionEnd: normalizePositiveInteger(options.regionEnd),
    filterStatus: normalizeChoice(options.filterStatus, FILTER_STATUSES, "pass"),
    filterNames: new Set(parseList(options.filterNames)),
    minQual: normalizeNumber(options.minQual, null),
    variantType: normalizeChoice(options.variantType, VARIANT_TYPES, "any"),
    idMode: normalizeChoice(options.idMode, ID_MODES, "any"),
    infoFilters: parseInfoFilters(options.infoFilters),
    consequenceField: normalizeChoice(String(options.consequenceField ?? "auto"), CONSEQUENCE_FIELDS, "auto"),
    consequenceImpact: normalizeChoice(String(options.consequenceImpact ?? "any").toUpperCase(), CONSEQUENCE_IMPACTS, "any"),
    consequenceTerms: parseList(options.consequenceTerms).map((value) => value.toLowerCase()),
    consequenceGenes: parseList(options.consequenceGenes).map((value) => value.toLowerCase()),
    consequenceTranscripts: parseList(options.consequenceTranscripts).map((value) => value.toLowerCase()),
    aminoAcidChanges: parseList(options.aminoAcidChanges).map((value) => value.toLowerCase()),
    sampleSelectionMode: normalizeChoice(options.sampleSelectionMode, SAMPLE_SELECTION_MODES, "all"),
    sampleSelectionNames: new Set(parseList(options.sampleSelectionNames)),
    sampleNames: new Set(parseList(options.sampleNames)),
    genotypeMode: normalizeChoice(options.genotypeMode, GENOTYPE_MODES, "any"),
    siteGenotypeMode: normalizeChoice(options.siteGenotypeMode, SITE_GENOTYPE_MODES, "any"),
    maxMissingGenotypeRate: normalizeRate(options.maxMissingGenotypeRate, null),
    minSampleDepth: normalizeNumber(options.minSampleDepth, null),
    minSampleGq: normalizeNumber(options.minSampleGq, null),
    maxVariants: normalizeMaxVariants(options.maxVariants),
    outputFormat: normalizeChoice(options.outputFormat, OUTPUT_FORMATS, "filtered-vcf"),
    sourceEngineLabel: String(options.sourceEngineLabel ?? "").trim()
  };
}

function createState(options = {}) {
  const normalized = makeOptions(options);
  const warnings = [];
  if (
    normalized.regionStart !== null &&
    normalized.regionEnd !== null &&
    normalized.regionStart > normalized.regionEnd
  ) {
    warnings.push("Region start is greater than region end; no VCF records will be kept.");
  }
  return {
    options: normalized,
    warnings,
    headerLines: [],
    columnHeader: "",
    samples: [],
    outputSampleIndexes: [],
    outputSamples: [],
    missingSampleSelectionNames: [],
    missingGenotypeSampleNames: [],
    consequenceFormats: new Map(),
    warnedInfoFilters: new Set(),
    keptLines: [],
    rows: [],
    inputVariants: 0,
    keptVariants: 0,
    malformedLines: 0,
    omittedAfterLimit: 0
  };
}

function parseInfoFilters(value) {
  return String(value ?? "")
    .split(/[;\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((expression) => {
      const match = expression.match(/^([A-Za-z0-9_.-]+)\s*(<=|>=|!=|==|=|<|>)\s*(.+)$/);
      if (!match) {
        return { raw: expression, invalid: true };
      }
      return {
        raw: expression,
        key: match[1],
        operator: match[2] === "==" ? "=" : match[2],
        value: match[3].trim().replace(/^"|"$/g, "")
      };
    });
}

function parseInfo(infoText = "") {
  const values = new Map();
  for (const item of String(infoText).split(";")) {
    if (!item || item === ".") {
      continue;
    }
    const equals = item.indexOf("=");
    if (equals === -1) {
      values.set(item, true);
    } else {
      values.set(item.slice(0, equals), item.slice(equals + 1).split(","));
    }
  }
  return values;
}

function parseInfoHeaderFormat(line) {
  const idMatch = line.match(/^##INFO=<ID=([^,>]+)/);
  if (!idMatch) {
    return null;
  }
  const descriptionMatch = line.match(/Description="([^"]*)"/);
  const description = descriptionMatch?.[1] ?? "";
  const formatMatch = description.match(/(?:Format|fields?)\s*:\s*([^"]+)$/i);
  if (!formatMatch) {
    return null;
  }
  const fields = formatMatch[1]
    .replace(/[. ]+$/g, "")
    .split("|")
    .map((field) => field.trim())
    .filter(Boolean);
  return fields.length > 0 ? { id: idMatch[1], fields } : null;
}

function compareInfoValue(actualValues, operator, expected) {
  const values = Array.isArray(actualValues) ? actualValues : [actualValues];
  return values.some((actual) => {
    if (actual === true) {
      return operator === "=" && ["true", "1", ""].includes(String(expected).toLowerCase());
    }
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);
    const canCompareNumeric = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber);
    if (canCompareNumeric) {
      if (operator === "<") return actualNumber < expectedNumber;
      if (operator === "<=") return actualNumber <= expectedNumber;
      if (operator === ">") return actualNumber > expectedNumber;
      if (operator === ">=") return actualNumber >= expectedNumber;
      if (operator === "=") return actualNumber === expectedNumber;
      if (operator === "!=") return actualNumber !== expectedNumber;
    }
    const left = String(actual);
    const right = String(expected);
    if (operator === "=") return left === right;
    if (operator === "!=") return left !== right;
    return false;
  });
}

function parseVariantLine(line) {
  const fields = line.split("\t");
  if (fields.length < 8) {
    return null;
  }
  const pos = Number.parseInt(fields[1], 10);
  if (!Number.isFinite(pos) || pos <= 0) {
    return null;
  }
  const ref = fields[3] ?? "";
  return {
    line,
    fields,
    chrom: fields[0],
    pos,
    end: pos + Math.max(1, ref.length) - 1,
    id: fields[2] ?? ".",
    ref,
    alt: fields[4] ?? ".",
    qual: fields[5] ?? ".",
    filter: fields[6] ?? ".",
    info: fields[7] ?? ".",
    format: fields[8] ?? "",
    sampleFields: fields.slice(9)
  };
}

function classifyVariant(record) {
  const alts = record.alt.split(",").filter(Boolean);
  if (alts.length > 1) {
    return "multiallelic";
  }
  const alt = alts[0] ?? "";
  if (alt.startsWith("<") || alt.includes("[") || alt.includes("]")) {
    return "symbolic";
  }
  if (record.ref.length === 1 && alt.length === 1) {
    return "snv";
  }
  if (record.ref.length > 1 && alt.length === record.ref.length) {
    return "mnv";
  }
  if (alt.length > record.ref.length) {
    return "insertion";
  }
  if (alt.length < record.ref.length) {
    return "deletion";
  }
  return "indel";
}

function variantTypeMatches(record, requestedType) {
  if (requestedType === "any") {
    return true;
  }
  const type = classifyVariant(record);
  if (requestedType === "indel") {
    return type === "insertion" || type === "deletion" || type === "indel";
  }
  return type === requestedType;
}

function recordOverlapsRegion(record, options) {
  if (options.regionStart !== null && options.regionEnd !== null && options.regionStart > options.regionEnd) {
    return false;
  }
  if (options.chromosome && record.chrom !== options.chromosome) {
    return false;
  }
  if (options.regionStart !== null && record.end < options.regionStart) {
    return false;
  }
  if (options.regionEnd !== null && record.pos > options.regionEnd) {
    return false;
  }
  return true;
}

function filterStatusMatches(record, options) {
  const value = record.filter || ".";
  const passes = value === "PASS" || value === ".";
  if (options.filterStatus === "any") {
    return true;
  }
  if (options.filterStatus === "pass") {
    return passes;
  }
  if (options.filterStatus === "non-pass") {
    return !passes;
  }
  const names = value.split(";").filter(Boolean);
  return names.some((name) => options.filterNames.has(name));
}

function idModeMatches(record, idMode) {
  const hasId = Boolean(record.id && record.id !== ".");
  if (idMode === "has-id") return hasId;
  if (idMode === "missing-id") return !hasId;
  return true;
}

function infoMatches(record, options, warnings) {
  if (options.infoFilters.length === 0) {
    return true;
  }
  const info = parseInfo(record.info);
  for (const filter of options.infoFilters) {
    if (filter.invalid) {
      continue;
    }
    if (!info.has(filter.key)) {
      return false;
    }
    if (!compareInfoValue(info.get(filter.key), filter.operator, filter.value)) {
      return false;
    }
  }
  return true;
}

function fieldValue(annotation, names) {
  for (const name of names) {
    const value = annotation[name];
    if (value !== undefined && value !== "") {
      return String(value);
    }
  }
  return "";
}

function splitConsequenceValues(value) {
  return String(value ?? "")
    .split(/[&,+]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function makeConsequenceAnnotations(record, state) {
  const { options } = state;
  const info = parseInfo(record.info);
  const candidateFields = options.consequenceField === "auto" ? ["ANN", "CSQ"] : [options.consequenceField];
  const annotations = [];
  for (const field of candidateFields) {
    if (!info.has(field)) {
      continue;
    }
    const format = state.consequenceFormats.get(field)
      ?? (field === "ANN" ? DEFAULT_ANN_FIELDS : DEFAULT_CSQ_FIELDS);
    for (const entry of info.get(field)) {
      const parts = String(entry ?? "").split("|");
      const annotation = {};
      format.forEach((name, index) => {
        annotation[name] = parts[index] ?? "";
      });
      annotations.push({ field, annotation, raw: String(entry ?? "") });
    }
  }
  return annotations;
}

function consequenceFiltersAreActive(options) {
  return options.consequenceImpact !== "any"
    || options.consequenceTerms.length > 0
    || options.consequenceGenes.length > 0
    || options.consequenceTranscripts.length > 0
    || options.aminoAcidChanges.length > 0;
}

function consequenceMatches(record, state) {
  const { options } = state;
  if (!consequenceFiltersAreActive(options)) {
    return { matches: true, summary: "" };
  }
  const annotations = makeConsequenceAnnotations(record, state);
  for (const item of annotations) {
    const annotation = item.annotation;
    const impact = fieldValue(annotation, ["Annotation_Impact", "IMPACT"]).toUpperCase();
    if (options.consequenceImpact !== "any" && impact !== options.consequenceImpact) {
      continue;
    }
    const terms = splitConsequenceValues(fieldValue(annotation, ["Annotation", "Consequence"]));
    if (options.consequenceTerms.length > 0 && !options.consequenceTerms.some((term) => terms.includes(term))) {
      continue;
    }
    const geneValues = [
      fieldValue(annotation, ["Gene_Name", "SYMBOL"]),
      fieldValue(annotation, ["Gene_ID", "Gene"])
    ].map((value) => value.toLowerCase()).filter(Boolean);
    if (options.consequenceGenes.length > 0 && !options.consequenceGenes.some((gene) => geneValues.includes(gene))) {
      continue;
    }
    const transcriptValues = [
      fieldValue(annotation, ["Feature_ID", "Feature"])
    ].map((value) => value.toLowerCase()).filter(Boolean);
    if (
      options.consequenceTranscripts.length > 0 &&
      !options.consequenceTranscripts.some((transcript) => transcriptValues.includes(transcript))
    ) {
      continue;
    }
    const aaValues = [
      fieldValue(annotation, ["HGVS.p", "HGVSp"]),
      fieldValue(annotation, ["Amino_acids"])
    ].map((value) => value.toLowerCase()).filter(Boolean);
    if (
      options.aminoAcidChanges.length > 0 &&
      !options.aminoAcidChanges.some((change) => aaValues.some((value) => value.includes(change)))
    ) {
      continue;
    }
    return {
      matches: true,
      summary: [
        fieldValue(annotation, ["Annotation", "Consequence"]),
        impact,
        fieldValue(annotation, ["Gene_Name", "SYMBOL"]),
        fieldValue(annotation, ["Feature_ID", "Feature"]),
        fieldValue(annotation, ["HGVS.p", "HGVSp"])
      ].filter(Boolean).join("|")
    };
  }
  return { matches: false, summary: "" };
}

function parseSample(formatKeys, sampleField) {
  const values = String(sampleField ?? "").split(":");
  const sample = {};
  formatKeys.forEach((key, index) => {
    sample[key] = values[index] ?? "";
  });
  return sample;
}

function splitGt(gt = "") {
  return String(gt).split(/[\/|]/).filter(Boolean);
}

function isMissingGt(gt = "") {
  return !gt || gt === "." || gt === "./." || gt === ".|." || splitGt(gt).every((allele) => allele === ".");
}

function isReferenceGt(gt = "") {
  if (isMissingGt(gt)) {
    return false;
  }
  const alleles = splitGt(gt).filter((allele) => allele !== ".");
  return alleles.length > 0 && alleles.every((allele) => allele === "0");
}

function isHomozygousReferenceGt(gt = "") {
  if (!isReferenceGt(gt)) {
    return false;
  }
  const alleles = splitGt(gt).filter((allele) => allele !== ".");
  return alleles.length >= 2 && new Set(alleles).size === 1;
}

function genotypeModeMatches(sample, mode) {
  if (mode === "any") {
    return true;
  }
  const gt = sample.GT ?? "";
  const alleles = splitGt(gt).filter((allele) => allele !== ".");
  const missing = isMissingGt(gt);
  if (mode === "missing") {
    return missing;
  }
  if (missing) {
    return false;
  }
  if (mode === "called") {
    return true;
  }
  const hasAlt = alleles.some((allele) => allele !== "0");
  if (mode === "variant") {
    return hasAlt;
  }
  if (mode === "heterozygous") {
    return hasAlt && new Set(alleles).size > 1;
  }
  if (mode === "homozygous-alt") {
    return alleles.length > 0 && new Set(alleles).size === 1 && alleles[0] !== "0";
  }
  return true;
}

function sampleCriteriaMatch(record, state) {
  const { options, samples } = state;
  if (
    options.genotypeMode === "any" &&
    options.siteGenotypeMode === "any" &&
    options.maxMissingGenotypeRate === null &&
    options.minSampleDepth === null &&
    options.minSampleGq === null &&
    options.sampleNames.size === 0
  ) {
    return { matches: true, matchingSamples: "" };
  }
  if (!record.format || record.sampleFields.length === 0) {
    return { matches: false, matchingSamples: "" };
  }
  const formatKeys = record.format.split(":");
  const candidateIndexes = getGenotypeSampleIndexes(state);
  if (candidateIndexes.length === 0) {
    return { matches: false, matchingSamples: "" };
  }
  const siteStats = genotypeSiteStats(record, formatKeys, candidateIndexes);
  if (!siteGenotypeMatches(siteStats, options)) {
    return { matches: false, matchingSamples: "" };
  }
  const matchingSamples = [];
  for (const index of candidateIndexes) {
    const sampleField = record.sampleFields[index];
    const sampleName = samples[index] ?? `sample_${index + 1}`;
    const sample = parseSample(formatKeys, sampleField);
    if (!genotypeModeMatches(sample, options.genotypeMode)) {
      continue;
    }
    const dp = normalizeNumber(sample.DP, null);
    const gq = normalizeNumber(sample.GQ, null);
    if (options.minSampleDepth !== null && (dp === null || dp < options.minSampleDepth)) {
      continue;
    }
    if (options.minSampleGq !== null && (gq === null || gq < options.minSampleGq)) {
      continue;
    }
    matchingSamples.push(sampleName);
  }
  return { matches: matchingSamples.length > 0, matchingSamples: matchingSamples.join(",") };
}

function getGenotypeSampleIndexes(state) {
  const sourceIndexes = state.outputSampleIndexes.length > 0
    ? state.outputSampleIndexes
    : state.samples.map((_, index) => index);
  if (state.options.sampleNames.size === 0) {
    return sourceIndexes;
  }
  return sourceIndexes.filter((index) => state.options.sampleNames.has(state.samples[index]));
}

function genotypeSiteStats(record, formatKeys, sampleIndexes) {
  let missing = 0;
  let called = 0;
  let reference = 0;
  let homRef = 0;
  for (const index of sampleIndexes) {
    const sample = parseSample(formatKeys, record.sampleFields[index]);
    const gt = sample.GT ?? "";
    if (isMissingGt(gt)) {
      missing += 1;
      continue;
    }
    called += 1;
    if (isReferenceGt(gt)) {
      reference += 1;
    }
    if (isHomozygousReferenceGt(gt)) {
      homRef += 1;
    }
  }
  return {
    total: sampleIndexes.length,
    missing,
    called,
    reference,
    homRef,
    missingRate: sampleIndexes.length > 0 ? missing / sampleIndexes.length : null
  };
}

function siteGenotypeMatches(stats, options) {
  if (stats.total === 0) {
    return false;
  }
  if (options.maxMissingGenotypeRate !== null && (stats.missingRate === null || stats.missingRate > options.maxMissingGenotypeRate)) {
    return false;
  }
  if (options.siteGenotypeMode === "all-called") {
    return stats.missing === 0;
  }
  if (options.siteGenotypeMode === "any-missing") {
    return stats.missing > 0;
  }
  if (options.siteGenotypeMode === "all-hom-ref") {
    return stats.homRef === stats.total;
  }
  if (options.siteGenotypeMode === "all-reference") {
    return stats.reference === stats.total;
  }
  return true;
}

function missingGenotypeRate(record, state) {
  if (!record.format || record.sampleFields.length === 0) {
    return "";
  }
  const indexes = getGenotypeSampleIndexes(state);
  if (indexes.length === 0) {
    return "";
  }
  const stats = genotypeSiteStats(record, record.format.split(":"), indexes);
  return stats.missingRate === null ? "" : Number(stats.missingRate.toFixed(4));
}

function configureOutputSamples(state) {
  const allIndexes = state.samples.map((_, index) => index);
  const { sampleSelectionMode, sampleSelectionNames } = state.options;
  if (sampleSelectionMode === "all" || sampleSelectionNames.size === 0) {
    state.outputSampleIndexes = allIndexes;
    state.outputSamples = [...state.samples];
  } else if (sampleSelectionMode === "keep") {
    state.outputSampleIndexes = allIndexes.filter((index) => sampleSelectionNames.has(state.samples[index]));
    state.outputSamples = state.outputSampleIndexes.map((index) => state.samples[index]);
  } else {
    state.outputSampleIndexes = allIndexes.filter((index) => !sampleSelectionNames.has(state.samples[index]));
    state.outputSamples = state.outputSampleIndexes.map((index) => state.samples[index]);
  }
  state.missingSampleSelectionNames = [...sampleSelectionNames].filter((sample) => !state.samples.includes(sample));
  state.missingGenotypeSampleNames = [...state.options.sampleNames].filter((sample) => !state.samples.includes(sample));
}

function projectedColumnHeader(state) {
  if (!state.columnHeader) {
    return "";
  }
  const fixed = state.columnHeader.split("\t").slice(0, 8);
  if (state.outputSamples.length === 0) {
    return fixed.join("\t");
  }
  return [...fixed, "FORMAT", ...state.outputSamples].join("\t");
}

function projectedRecordLine(record, state) {
  const fixed = record.fields.slice(0, 8);
  if (state.outputSamples.length === 0) {
    return fixed.join("\t");
  }
  return [
    ...fixed,
    record.format || ".",
    ...state.outputSampleIndexes.map((index) => record.sampleFields[index] ?? ".")
  ].join("\t");
}

function recordPasses(record, state) {
  const { options, warnings } = state;
  if (!recordOverlapsRegion(record, options)) return { passes: false, matchingSamples: "" };
  if (!filterStatusMatches(record, options)) return { passes: false, matchingSamples: "" };
  if (options.minQual !== null) {
    const qual = normalizeNumber(record.qual, null);
    if (qual === null || qual < options.minQual) return { passes: false, matchingSamples: "" };
  }
  if (!variantTypeMatches(record, options.variantType)) return { passes: false, matchingSamples: "" };
  if (!idModeMatches(record, options.idMode)) return { passes: false, matchingSamples: "" };
  if (!infoMatches(record, options, warnings)) return { passes: false, matchingSamples: "" };
  const consequenceMatch = consequenceMatches(record, state);
  if (!consequenceMatch.matches) return { passes: false, matchingSamples: "" };
  const sampleMatch = sampleCriteriaMatch(record, state);
  return { passes: sampleMatch.matches, matchingSamples: sampleMatch.matchingSamples, consequence: consequenceMatch.summary };
}

function addKeptRecord(record, result, state) {
  if (state.keptVariants >= state.options.maxVariants) {
    state.omittedAfterLimit += 1;
    return;
  }
  state.keptVariants += 1;
  state.keptLines.push(projectedRecordLine(record, state));
  state.rows.push({
    chrom: record.chrom,
    pos: record.pos,
    end: record.end,
    id: record.id,
    ref: record.ref,
    alt: record.alt,
    qual: record.qual,
    filter: record.filter,
    variant_type: classifyVariant(record),
    missing_genotype_rate: missingGenotypeRate(record, state),
    consequence: result.consequence ?? "",
    matching_samples: result.matchingSamples ?? "",
    info: record.info
  });
}

function processVcfLine(line, state) {
  if (!line) {
    return;
  }
  if (line.startsWith("##")) {
    state.headerLines.push(line);
    const infoFormat = parseInfoHeaderFormat(line);
    if (infoFormat) {
      state.consequenceFormats.set(infoFormat.id, infoFormat.fields);
    }
    return;
  }
  if (line.startsWith("#CHROM")) {
    state.columnHeader = line;
    state.samples = line.split("\t").slice(9);
    configureOutputSamples(state);
    return;
  }
  if (line.startsWith("#")) {
    state.headerLines.push(line);
    return;
  }
  const record = parseVariantLine(line);
  if (!record) {
    state.malformedLines += 1;
    return;
  }
  state.inputVariants += 1;
  const result = recordPasses(record, state);
  if (result.passes) {
    addKeptRecord(record, result, state);
  }
}

function filterDescription(options) {
  return [
    options.chromosome ? `Region chromosome: ${options.chromosome}` : "",
    options.regionStart !== null ? `Region start: ${options.regionStart}` : "",
    options.regionEnd !== null ? `Region end: ${options.regionEnd}` : "",
    `FILTER status: ${options.filterStatus}${options.filterStatus === "named" ? ` (${[...options.filterNames].join(", ") || "none"})` : ""}`,
    options.minQual !== null ? `Minimum QUAL: ${options.minQual}` : "",
    `Variant type: ${options.variantType}`,
    `ID mode: ${options.idMode}`,
    options.infoFilters.length > 0 ? `INFO filters: ${options.infoFilters.map((filter) => filter.raw).join("; ")}` : "",
    consequenceFiltersAreActive(options) ? `Consequence field: ${options.consequenceField}` : "",
    options.consequenceImpact !== "any" ? `Consequence impact: ${options.consequenceImpact}` : "",
    options.consequenceTerms.length > 0 ? `Consequence terms: ${options.consequenceTerms.join(", ")}` : "",
    options.consequenceGenes.length > 0 ? `Consequence genes: ${options.consequenceGenes.join(", ")}` : "",
    options.consequenceTranscripts.length > 0 ? `Consequence transcripts: ${options.consequenceTranscripts.join(", ")}` : "",
    options.aminoAcidChanges.length > 0 ? `Amino-acid changes: ${options.aminoAcidChanges.join(", ")}` : "",
    options.sampleSelectionMode !== "all" ? `Sample output: ${options.sampleSelectionMode} ${[...options.sampleSelectionNames].join(", ") || "none"}` : "",
    options.sampleNames.size > 0 ? `Genotype filter samples: ${[...options.sampleNames].join(", ")}` : "",
    options.maxMissingGenotypeRate !== null ? `Maximum missing genotype rate: ${options.maxMissingGenotypeRate}` : "",
    `Site genotype mode: ${options.siteGenotypeMode}`,
    `Genotype mode: ${options.genotypeMode}`,
    options.minSampleDepth !== null ? `Minimum sample DP: ${options.minSampleDepth}` : "",
    options.minSampleGq !== null ? `Minimum sample GQ: ${options.minSampleGq}` : ""
  ].filter(Boolean);
}

function finalizeState(state) {
  if (!state.columnHeader) {
    state.warnings.push("No #CHROM header line was found; filtered VCF output may be incomplete.");
  }
  if (state.malformedLines > 0) {
    state.warnings.push(`Skipped ${state.malformedLines.toLocaleString()} malformed VCF data line(s).`);
  }
  if (state.omittedAfterLimit > 0) {
    state.warnings.push(`Kept variants were capped at ${state.options.maxVariants.toLocaleString()}; ${state.omittedAfterLimit.toLocaleString()} additional matching variant(s) were omitted.`);
  }
  if (state.missingSampleSelectionNames.length > 0) {
    state.warnings.push(`Sample keep/remove name(s) not found in the VCF header: ${state.missingSampleSelectionNames.slice(0, 6).join(", ")}.`);
  }
  if (state.missingGenotypeSampleNames.length > 0) {
    state.warnings.push(`Genotype filter sample name(s) not found in the VCF header: ${state.missingGenotypeSampleNames.slice(0, 6).join(", ")}.`);
  }
  for (const filter of state.options.infoFilters) {
    if (filter.invalid) {
      state.warnings.push(`Ignored invalid INFO filter expression "${filter.raw}". Use forms like DP>=20 or AF<0.05.`);
    }
  }
  const filteredVcf = [
    ...state.headerLines,
    projectedColumnHeader(state),
    ...state.keptLines
  ].filter(Boolean).join("\n");
  const table = exportDelimitedTable(vcfFilterVariantColumns, state.rows, "\t");
  const report = [
    "VCF filter",
    "",
    `Input variant records: ${state.inputVariants}`,
    `Kept variant records: ${state.keptVariants}`,
    `Removed variant records: ${Math.max(0, state.inputVariants - state.keptVariants - state.omittedAfterLimit)}`,
    `Matching variants omitted by limit: ${state.omittedAfterLimit}`,
    `Samples in header: ${state.samples.length}`,
    state.options.sourceEngineLabel ? `Indexed source reader: ${state.options.sourceEngineLabel}` : "",
    "",
    "Filters:",
    ...filterDescription(state.options).map((line) => `- ${line}`)
  ].filter((line) => line !== "").join("\n");
  return {
    filteredVcf,
    table,
    rows: state.rows,
    report,
    warnings: [...new Set(state.warnings)],
    inputVariants: state.inputVariants,
    keptVariants: state.keptVariants,
    outputFormat: state.options.outputFormat
  };
}

export function filterVcfText(input, options = {}, context = {}) {
  const state = createState(options);
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    if (index % 1000 === 0) {
      context.throwIfCancelled?.();
    }
    processVcfLine(line, state);
  }
  return finalizeState(state);
}

export async function filterVcfChunks(chunks, options = {}, context = {}) {
  const state = createState(options);
  let index = 0;
  for await (const line of streamTextLines(chunks)) {
    if (index % 1000 === 0) {
      context.throwIfCancelled?.();
      context.reportProgress?.({ phase: "filtering-vcf", linesProcessed: index });
      await context.yieldIfNeeded?.();
    }
    processVcfLine(line, state);
    index += 1;
  }
  return finalizeState(state);
}
