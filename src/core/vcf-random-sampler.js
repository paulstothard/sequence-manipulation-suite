import { streamTextLines } from "./compressed-text-reader.js";
import { resolveRandom, randomInteger } from "./random-sequence.js";
import { exportDelimitedTable } from "./table.js";

export const vcfRandomSamplerColumns = [
  { id: "sample_order", label: "Sample order", type: "number" },
  { id: "source_index", label: "Source index", type: "number" },
  { id: "chrom", label: "Chrom", type: "string" },
  { id: "pos", label: "Pos", type: "number" },
  { id: "id", label: "ID", type: "string" },
  { id: "ref", label: "Ref", type: "string" },
  { id: "alt", label: "Alt", type: "string" },
  { id: "qual", label: "Qual", type: "string" },
  { id: "filter", label: "Filter", type: "string" },
  { id: "variant_type", label: "Variant type", type: "string" },
  { id: "missing_genotype_rate", label: "Missing genotype rate", type: "number" },
  { id: "info", label: "Info", type: "string" }
];

const VARIANT_TYPES = new Set([
  "any",
  "snv",
  "mnv",
  "indel",
  "insertion",
  "deletion",
  "multiallelic",
  "symbolic"
]);

function normalizeChoice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function normalizeNonnegativeInteger(value, fallback = 0) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeRate(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function normalizeMaxInputVariants(value) {
  const number = normalizePositiveInteger(value, 100000);
  return Math.min(Math.max(number, 1), 5000000);
}

function normalizeOptions(options = {}) {
  return {
    sampleSize: normalizeNonnegativeInteger(options.sampleSize, 5),
    withReplacement: options.withReplacement === true,
    autosomesOnly: options.autosomesOnly === true,
    biallelicOnly: options.biallelicOnly === true,
    maxMissingGenotypeRate: normalizeRate(options.maxMissingGenotypeRate),
    variantType: normalizeChoice(String(options.variantType ?? "any"), VARIANT_TYPES, "any"),
    maxInputVariants: normalizeMaxInputVariants(options.maxInputVariants)
  };
}

function createState(options = {}) {
  const { seed, random } = resolveRandom(options);
  return {
    options: normalizeOptions(options),
    seed,
    random,
    warnings: [],
    headerLines: [],
    columnHeader: "",
    sampleNames: [],
    candidates: [],
    inputVariants: 0,
    malformedLines: 0,
    filteredCounts: {
      autosome: 0,
      biallelic: 0,
      missingGenotypeRate: 0,
      variantType: 0
    },
    unevaluableMissingRate: 0,
    stoppedAtLimit: false
  };
}

function splitLines(input) {
  return String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
}

function checkCancelled(context, counter = 0, interval = 2048) {
  if (counter % interval === 0) {
    context?.throwIfCancelled?.();
  }
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
  return {
    line,
    fields,
    chrom: fields[0],
    pos,
    id: fields[2] ?? ".",
    ref: fields[3] ?? "",
    alt: fields[4] ?? ".",
    qual: fields[5] ?? ".",
    filter: fields[6] ?? ".",
    info: fields[7] ?? ".",
    format: fields[8] ?? "",
    sampleFields: fields.slice(9)
  };
}

export function classifyVcfVariant(record) {
  const alts = String(record.alt ?? ".").split(",").filter(Boolean);
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
  const type = classifyVcfVariant(record);
  if (requestedType === "indel") {
    return type === "indel" || type === "insertion" || type === "deletion";
  }
  return type === requestedType;
}

function isAutosome(chrom) {
  const normalized = String(chrom ?? "").replace(/^chr/i, "");
  const number = Number.parseInt(normalized, 10);
  return String(number) === normalized && number >= 1 && number <= 22;
}

function isBiallelic(record) {
  const alts = String(record.alt ?? ".").split(",").filter(Boolean);
  return alts.length === 1 && alts[0] !== ".";
}

function parseGt(sampleText, formatKeys) {
  const gtIndex = formatKeys.indexOf("GT");
  if (gtIndex === -1) {
    return null;
  }
  return String(sampleText ?? "").split(":")[gtIndex] ?? "";
}

function isMissingGt(gt) {
  if (!gt || gt === ".") {
    return true;
  }
  const alleles = gt.split(/[\/|]/);
  return alleles.length === 0 || alleles.every((allele) => allele === ".");
}

function missingGenotypeRate(record) {
  if (record.sampleFields.length === 0 || !record.format) {
    return null;
  }
  const formatKeys = record.format.split(":");
  if (!formatKeys.includes("GT")) {
    return null;
  }
  let missing = 0;
  for (const sampleField of record.sampleFields) {
    if (isMissingGt(parseGt(sampleField, formatKeys))) {
      missing += 1;
    }
  }
  return missing / record.sampleFields.length;
}

function rowFromRecord(record, order) {
  const rate = missingGenotypeRate(record);
  return {
    sample_order: order,
    source_index: record.sourceIndex,
    chrom: record.chrom,
    pos: record.pos,
    id: record.id,
    ref: record.ref,
    alt: record.alt,
    qual: record.qual,
    filter: record.filter,
    variant_type: classifyVcfVariant(record),
    missing_genotype_rate: rate === null ? "" : Number(rate.toFixed(4)),
    info: record.info
  };
}

function recordPassesFilters(state, record) {
  const { options } = state;
  if (options.autosomesOnly && !isAutosome(record.chrom)) {
    state.filteredCounts.autosome += 1;
    return false;
  }
  if (options.biallelicOnly && !isBiallelic(record)) {
    state.filteredCounts.biallelic += 1;
    return false;
  }
  if (!variantTypeMatches(record, options.variantType)) {
    state.filteredCounts.variantType += 1;
    return false;
  }
  if (options.maxMissingGenotypeRate !== null) {
    const rate = missingGenotypeRate(record);
    if (rate === null) {
      state.unevaluableMissingRate += 1;
      state.filteredCounts.missingGenotypeRate += 1;
      return false;
    }
    if (rate > options.maxMissingGenotypeRate) {
      state.filteredCounts.missingGenotypeRate += 1;
      return false;
    }
  }
  return true;
}

function processLine(state, line, context) {
  if (line.startsWith("##")) {
    state.headerLines.push(line);
    return;
  }
  if (line.startsWith("#CHROM")) {
    state.columnHeader = line;
    state.sampleNames = line.split("\t").slice(9);
    return;
  }
  if (!line.trim()) {
    return;
  }
  if (line.startsWith("#")) {
    state.headerLines.push(line);
    return;
  }
  if (state.inputVariants >= state.options.maxInputVariants) {
    state.stoppedAtLimit = true;
    return;
  }
  state.inputVariants += 1;
  checkCancelled(context, state.inputVariants);
  const record = parseVariantLine(line);
  if (!record) {
    state.malformedLines += 1;
    return;
  }
  record.sourceIndex = state.inputVariants;
  if (recordPassesFilters(state, record)) {
    state.candidates.push(record);
  }
}

function sampleCandidateIndexes(count, options, random, context) {
  if (count <= 0) {
    return [];
  }
  const size = options.withReplacement
    ? options.sampleSize
    : Math.min(options.sampleSize, count);
  if (options.withReplacement) {
    return Array.from({ length: size }, (_, index) => {
      checkCancelled(context, index);
      return randomInteger(random, count);
    });
  }
  const pool = Array.from({ length: count }, (_, index) => index);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    checkCancelled(context, pool.length - index);
    const swap = randomInteger(random, index + 1);
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, size).sort((left, right) => left - right);
}

function finalizeState(state, context = {}) {
  const indexes = sampleCandidateIndexes(
    state.candidates.length,
    state.options,
    state.random,
    context
  );
  const sampledRecords = indexes
    .map((index) => state.candidates[index])
    .filter(Boolean);

  if (!state.columnHeader) {
    state.warnings.push("No #CHROM header line was found; sampled VCF output may not be a valid VCF.");
  }
  if (state.inputVariants === 0) {
    state.warnings.push("No VCF variant records were found.");
  }
  if (state.candidates.length === 0) {
    state.warnings.push("No variants passed the selected candidate filters.");
  }
  if (!state.options.withReplacement && state.options.sampleSize > state.candidates.length) {
    state.warnings.push(`Requested ${state.options.sampleSize} variants but only ${state.candidates.length} candidate variants were available.`);
  }
  if (state.malformedLines > 0) {
    state.warnings.push(`${state.malformedLines} malformed VCF line(s) were skipped.`);
  }
  if (state.stoppedAtLimit) {
    state.warnings.push(`Stopped after scanning the first ${state.options.maxInputVariants} variant records because the input limit was reached.`);
  }
  if (state.unevaluableMissingRate > 0) {
    state.warnings.push(`${state.unevaluableMissingRate} variant record(s) lacked evaluable FORMAT/GT sample genotypes and failed the missing-genotype-rate filter.`);
  }

  const rows = sampledRecords.map((record, index) => rowFromRecord(record, index + 1));
  const header = [
    ...state.headerLines,
    ...(state.columnHeader ? [state.columnHeader] : [])
  ];
  const sampledVcf = [
    ...header,
    ...sampledRecords.map((record) => record.line)
  ].join("\n");
  const table = makeVcfRandomSamplerTsv(rows);

  return {
    seed: state.seed,
    options: state.options,
    inputVariants: state.inputVariants,
    candidateVariants: state.candidates.length,
    sampledVariants: sampledRecords.length,
    sampleNames: state.sampleNames,
    filteredCounts: state.filteredCounts,
    rows,
    sampledRecords,
    sampledVcf,
    table,
    report: "",
    warnings: state.warnings
  };
}

export function sampleVcfText(input, options = {}, context = {}) {
  const state = createState(options);
  for (const line of splitLines(input)) {
    processLine(state, line, context);
  }
  const result = finalizeState(state, context);
  result.report = makeVcfRandomSamplerReport(result);
  return result;
}

export async function sampleVcfChunks(chunks, options = {}, context = {}) {
  const state = createState(options);
  for await (const line of streamTextLines(chunks)) {
    processLine(state, line, context);
    if (state.inputVariants % 5000 === 0 && state.inputVariants > 0) {
      await context.yieldIfNeeded?.();
    }
  }
  const result = finalizeState(state, context);
  result.report = makeVcfRandomSamplerReport(result);
  return result;
}

function filtersSummary(options) {
  const filters = [];
  if (options.autosomesOnly) filters.push("autosomes only");
  if (options.biallelicOnly) filters.push("biallelic sites only");
  if (options.variantType !== "any") filters.push(`variant type ${options.variantType}`);
  if (options.maxMissingGenotypeRate !== null) {
    filters.push(`missing genotype rate <= ${options.maxMissingGenotypeRate}`);
  }
  return filters.length > 0 ? filters.join("; ") : "none";
}

export function makeVcfRandomSamplerReport(result) {
  return [
    "VCF random sampler",
    `Random seed: ${result.seed}`,
    `Input variants scanned: ${result.inputVariants}`,
    `Candidate variants after filters: ${result.candidateVariants}`,
    `Requested sample size: ${result.options.sampleSize}`,
    `Sampled variants: ${result.sampledVariants}`,
    `Sample with replacement: ${result.options.withReplacement ? "yes" : "no"}`,
    `Candidate filters: ${filtersSummary(result.options)}`,
    `Samples detected: ${result.sampleNames.length}`,
    `Filtered by autosome option: ${result.filteredCounts.autosome}`,
    `Filtered by biallelic option: ${result.filteredCounts.biallelic}`,
    `Filtered by variant type: ${result.filteredCounts.variantType}`,
    `Filtered by missing genotype rate: ${result.filteredCounts.missingGenotypeRate}`,
    ...result.warnings.map((warning) => `Warning: ${warning}`)
  ].join("\n") + "\n";
}

export function makeVcfRandomSamplerTsv(rows) {
  return exportDelimitedTable(vcfRandomSamplerColumns, rows, "\t");
}
