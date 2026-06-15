import { exportDelimitedTable } from "./table.js";
import { streamTextLines } from "./compressed-text-reader.js";

export const vcfGenotypeTableColumns = [
  { id: "chrom", label: "Chrom", type: "string" },
  { id: "pos", label: "Pos", type: "number" },
  { id: "id", label: "ID", type: "string" },
  { id: "ref", label: "Ref", type: "string" },
  { id: "alt", label: "Alt", type: "string" },
  { id: "sample", label: "Sample", type: "string" },
  { id: "gt", label: "GT", type: "string" },
  { id: "gq", label: "GQ", type: "string" },
  { id: "dp", label: "DP", type: "string" },
  { id: "ad", label: "AD", type: "string" },
  { id: "format", label: "FORMAT", type: "string" },
  { id: "sample_values", label: "Sample values", type: "string" }
];

export const vcfMetadataColumns = [
  { id: "key", label: "Key", type: "string" },
  { id: "id", label: "ID", type: "string" },
  { id: "value", label: "Value", type: "string" },
  { id: "line", label: "Line", type: "string" }
];

export const vcfSampleColumns = [
  { id: "sample", label: "Sample", type: "string" },
  { id: "index", label: "Index", type: "number" }
];

export const vcfInfoTagColumns = [
  { id: "id", label: "ID", type: "string" },
  { id: "number", label: "Number", type: "string" },
  { id: "type", label: "Type", type: "string" },
  { id: "description", label: "Description", type: "string" },
  { id: "source", label: "Source", type: "string" },
  { id: "version", label: "Version", type: "string" },
  { id: "line", label: "Line", type: "string" }
];

export const vcfFormatFieldColumns = [
  { id: "id", label: "ID", type: "string" },
  { id: "number", label: "Number", type: "string" },
  { id: "type", label: "Type", type: "string" },
  { id: "description", label: "Description", type: "string" },
  { id: "line", label: "Line", type: "string" }
];

export const vcfFilterColumns = [
  { id: "id", label: "ID", type: "string" },
  { id: "description", label: "Description", type: "string" },
  { id: "line", label: "Line", type: "string" }
];

export const vcfContigColumns = [
  { id: "id", label: "Chromosome", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "assembly", label: "Assembly", type: "string" },
  { id: "species", label: "Species", type: "string" },
  { id: "taxonomy", label: "Taxonomy", type: "string" },
  { id: "line", label: "Line", type: "string" }
];

export const vcfVariantColumns = [
  { id: "chrom", label: "Chrom", type: "string" },
  { id: "pos", label: "Pos", type: "number" },
  { id: "id", label: "ID", type: "string" },
  { id: "ref", label: "Ref", type: "string" },
  { id: "alt", label: "Alt", type: "string" },
  { id: "qual", label: "Qual", type: "string" },
  { id: "filter", label: "Filter", type: "string" },
  { id: "info", label: "Info", type: "string" }
];

export const vcfSplitInfoBaseColumns = vcfVariantColumns;

const LARGE_REGION_WARNING_SPAN = 5_000_000;

function parseStructuredValue(value) {
  if (!value.startsWith("<") || !value.endsWith(">")) {
    return {};
  }
  const body = value.slice(1, -1);
  const fields = {};
  let key = "";
  let field = "";
  let inKey = true;
  let inQuotes = false;
  const commit = () => {
    if (!key) {
      return;
    }
    fields[key] = field.replace(/^"|"$/g, "").replace(/\\"/g, "\"");
    key = "";
    field = "";
    inKey = true;
  };
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '"' && body[index - 1] !== "\\") {
      inQuotes = !inQuotes;
      field += character;
      continue;
    }
    if (!inQuotes && inKey && character === "=") {
      inKey = false;
      continue;
    }
    if (!inQuotes && !inKey && character === ",") {
      commit();
      continue;
    }
    if (inKey) {
      key += character;
    } else {
      field += character;
    }
  }
  commit();
  return fields;
}

function parseMetadataLine(line) {
  const body = line.slice(2);
  const equals = body.indexOf("=");
  if (equals < 0) {
    return { key: body, id: "", value: "", line };
  }
  const key = body.slice(0, equals);
  const value = body.slice(equals + 1);
  const idMatch = value.match(/^<ID=([^,>]+)/);
  return {
    key,
    id: idMatch ? idMatch[1] : "",
    value,
    line
  };
}

function extractDataType(options) {
  return [
    "metadata",
    "info-tags",
    "format-fields",
    "filters",
    "contigs",
    "samples",
    "variants",
    "split-info-variants",
    "genotypes",
    "region-variants",
    "region-split-info",
    "region-viewer"
  ].includes(options.dataType) ? options.dataType : "info-tags";
}

function normalizeChromosome(value) {
  return String(value ?? "").trim();
}

function normalizePosition(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeMaxVariants(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? Math.min(10000, number) : 500;
}

function hasRegionFilter(options) {
  return Boolean(
    normalizeChromosome(options.chromosome) ||
    normalizePosition(options.regionStart) ||
    normalizePosition(options.regionEnd)
  );
}

function selectedRegionText(options) {
  return hasRegionFilter(options)
    ? `${normalizeChromosome(options.chromosome) || "all chromosomes"}:${normalizePosition(options.regionStart) ?? "start"}-${normalizePosition(options.regionEnd) ?? "end"} (1-based inclusive)`
    : "not applied";
}

function inSelectedRegion(chrom, pos, options, warnings) {
  const selectedChrom = normalizeChromosome(options.chromosome);
  const start = normalizePosition(options.regionStart);
  const end = normalizePosition(options.regionEnd);
  if (start !== null && end !== null && start > end) {
    warnings.push("Region start is greater than region end; no genotype rows were selected.");
    return false;
  }
  if (selectedChrom && chrom !== selectedChrom) {
    return false;
  }
  if (start !== null && pos < start) {
    return false;
  }
  if (end !== null && pos > end) {
    return false;
  }
  return true;
}

function rowInSelectedRegion(row, options) {
  const selectedChrom = normalizeChromosome(options.chromosome);
  const start = normalizePosition(options.regionStart);
  const end = normalizePosition(options.regionEnd);
  const pos = Number(row.pos);
  if (start !== null && end !== null && start > end) {
    return false;
  }
  if (selectedChrom && row.chrom !== selectedChrom) {
    return false;
  }
  if (start !== null && pos < start) {
    return false;
  }
  if (end !== null && pos > end) {
    return false;
  }
  return true;
}

function variantRowKey(row) {
  return [row.chrom, row.pos, row.id, row.ref, row.alt].join("\u0001");
}

function sanitizeInfoColumnId(tag, usedIds) {
  const base = `info_${String(tag ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field"}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function parseVcfInfoField(info) {
  const text = String(info ?? "");
  if (!text || text === ".") {
    return {};
  }
  const values = {};
  for (const part of text.split(";")) {
    if (!part) continue;
    const equals = part.indexOf("=");
    if (equals < 0) {
      values[part] = "true";
      continue;
    }
    const key = part.slice(0, equals);
    if (!key) continue;
    const value = part.slice(equals + 1);
    values[key] = value === "." ? "" : value;
  }
  return values;
}

function registerInfoTags(state, infoValues) {
  for (const tag of Object.keys(infoValues)) {
    if (!state.infoTagOrder.includes(tag)) {
      state.infoTagOrder.push(tag);
    }
  }
}

function makeSplitInfoVariantRow(variantRow, infoValues, columnsByTag) {
  const row = { ...variantRow };
  for (const [tag, columnId] of columnsByTag.entries()) {
    row[columnId] = infoValues[tag] ?? "";
  }
  return row;
}

function limitRowsByMaxVariants(rows, maxVariants, warnings, label = "variant") {
  if (rows.length <= maxVariants) {
    return rows;
  }
  warnings.push(`Displayed ${maxVariants.toLocaleString()} ${label} rows; additional rows were omitted by the maximum variants setting.`);
  return rows.slice(0, maxVariants);
}

function limitGenotypeRowsByMaxVariants(rows, maxVariants, warnings) {
  const keptKeys = new Set();
  const keptRows = [];
  for (const row of rows) {
    const key = variantRowKey(row);
    if (!keptKeys.has(key)) {
      if (keptKeys.size >= maxVariants) {
        continue;
      }
      keptKeys.add(key);
    }
    keptRows.push(row);
  }
  if (keptRows.length < rows.length) {
    warnings.push(`Displayed genotypes for ${maxVariants.toLocaleString()} variants; additional variants were omitted by the maximum variants setting.`);
  }
  return keptRows;
}

function parseSelectedSamples(value) {
  return new Set(
    String(value ?? "")
      .split(/[,\n\r\t]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function addVcfSelectionWarnings(state, options) {
  const selectedChrom = normalizeChromosome(options.chromosome);
  const start = normalizePosition(options.regionStart);
  const end = normalizePosition(options.regionEnd);
  const regionDataType = ["genotypes", "region-variants", "region-split-info", "region-viewer"].includes(state.dataType);
  if (start !== null && end !== null && start > end) {
    state.warnings.push("Region start is greater than region end; no region rows were selected.");
  }
  if (start !== null && end !== null && end - start + 1 > LARGE_REGION_WARNING_SPAN) {
    state.warnings.push(`Requested region spans ${(end - start + 1).toLocaleString()} bp; paste/upload mode must scan the supplied VCF and large regions can produce large outputs.`);
  }
  if (selectedChrom && state.contigRows.length > 0 && !state.contigRows.some((row) => row.id === selectedChrom)) {
    const examples = state.contigRows.slice(0, 6).map((row) => row.id).join(", ");
    state.warnings.push(`Requested contig "${selectedChrom}" was not found in the VCF header. Header contigs include: ${examples}.`);
  }
  if (state.dataType === "genotypes" && state.samples.length === 0) {
    state.warnings.push("No samples were detected in the VCF header, so genotype rows cannot be produced.");
  }
  if (state.dataType === "genotypes") {
    const selectedSamples = parseSelectedSamples(options.sampleNames);
    const missingSamples = [...selectedSamples].filter((sample) => !state.samples.includes(sample));
    if (missingSamples.length > 0) {
      state.warnings.push(`Selected sample(s) not found in the VCF header: ${missingSamples.slice(0, 6).join(", ")}.`);
    }
  }
  if (regionDataType && selectedChrom && state.contigRows.length === 0 && state.variantRows.length > 0) {
    const observedChroms = [...new Set(state.variantRows.map((row) => row.chrom))];
    if (!observedChroms.includes(selectedChrom)) {
      state.warnings.push(`Requested contig "${selectedChrom}" was not found in the scanned variant records. Observed contigs include: ${observedChroms.slice(0, 6).join(", ")}.`);
    }
  }
}

function createVcfExtractionState(options = {}) {
  const dataType = extractDataType(options);
  return {
    dataType,
    genotypeRows: [],
    warnings: [],
    metadataRows: [],
    infoRows: [],
    formatRows: [],
    filterRows: [],
    contigRows: [],
    variantRows: [],
    variantInfoValues: [],
    infoTagOrder: [],
    samples: []
  };
}

function processVcfLine(state, line, options = {}) {
  if (!line) {
    return;
  }
  if (line.startsWith("##")) {
    const metadata = parseMetadataLine(line);
    state.metadataRows.push(metadata);
    const fields = parseStructuredValue(metadata.value);
    if (metadata.key === "INFO") {
      state.infoRows.push({
        id: fields.ID ?? metadata.id,
        number: fields.Number ?? "",
        type: fields.Type ?? "",
        description: fields.Description ?? "",
        source: fields.Source ?? "",
        version: fields.Version ?? "",
        line
      });
      const infoId = fields.ID ?? metadata.id;
      if (infoId && !state.infoTagOrder.includes(infoId)) {
        state.infoTagOrder.push(infoId);
      }
    } else if (metadata.key === "FORMAT") {
      state.formatRows.push({
        id: fields.ID ?? metadata.id,
        number: fields.Number ?? "",
        type: fields.Type ?? "",
        description: fields.Description ?? "",
        line
      });
    } else if (metadata.key === "FILTER") {
      state.filterRows.push({
        id: fields.ID ?? metadata.id,
        description: fields.Description ?? "",
        line
      });
    } else if (metadata.key === "contig") {
      state.contigRows.push({
        id: fields.ID ?? metadata.id,
        length: fields.length ? Number(fields.length) : "",
        assembly: fields.assembly ?? "",
        species: fields.species ?? "",
        taxonomy: fields.taxonomy ?? "",
        line
      });
    }
    return;
  }
  if (line.startsWith("#CHROM")) {
    state.samples = line.split("\t").slice(9);
    return;
  }
  if (line.startsWith("#")) {
    return;
  }
  const fields = line.split("\t");
  if (fields.length < 8) {
    state.warnings.push("Skipped a VCF data line with fewer than 8 fixed fields.");
    return;
  }
  const pos = Number(fields[1]);
  const infoValues = parseVcfInfoField(fields[7]);
  registerInfoTags(state, infoValues);
  const variantRow = {
    chrom: fields[0],
    pos,
    id: fields[2],
    ref: fields[3],
    alt: fields[4],
    qual: fields[5],
    filter: fields[6],
    info: fields[7]
  };
  state.variantRows.push(variantRow);
  state.variantInfoValues.push(infoValues);
  if (fields.length < 9) {
    if (state.dataType === "genotypes") {
      state.warnings.push("Skipped a VCF data line without FORMAT/sample columns.");
    }
    return;
  }
  if (!inSelectedRegion(fields[0], pos, options, state.warnings)) {
    return;
  }
  const formatKeys = fields[8].split(":");
  const selectedSamples = parseSelectedSamples(options.sampleNames);
  fields.slice(9).forEach((sampleField, sampleIndex) => {
    const sampleName = state.samples[sampleIndex] ?? `sample_${sampleIndex + 1}`;
    if (selectedSamples.size > 0 && !selectedSamples.has(sampleName)) {
      return;
    }
    const values = sampleField.split(":");
    const valueByKey = Object.fromEntries(formatKeys.map((key, index) => {
      const value = values[index] ?? "";
      return [key, key === "GT" ? value : (value === "." ? "" : value)];
    }));
    const normalizedSampleValues = formatKeys.map((key, index) => {
      const value = values[index] ?? "";
      return key === "GT" ? value : (value === "." ? "" : value);
    }).join(":");
    state.genotypeRows.push({
      chrom: fields[0],
      pos: Number(fields[1]),
      id: fields[2],
      ref: fields[3],
      alt: fields[4],
      sample: sampleName,
      gt: valueByKey.GT ?? "",
      gq: valueByKey.GQ ?? "",
      dp: valueByKey.DP ?? "",
      ad: valueByKey.AD ?? "",
      format: fields[8],
      sample_values: normalizedSampleValues
    });
  });
}

function finalizeVcfExtractionState(state, options = {}) {
  addVcfSelectionWarnings(state, options);
  const sampleRows = state.samples.map((sample, index) => ({ sample, index: index + 1 }));
  const maxVariants = normalizeMaxVariants(options.maxVariants);
  const infoColumnUsedIds = new Set(vcfSplitInfoBaseColumns.map((column) => column.id));
  const infoColumnsByTag = new Map(
    state.infoTagOrder.map((tag) => [
      tag,
      sanitizeInfoColumnId(tag, infoColumnUsedIds)
    ])
  );
  const splitInfoColumns = [
    ...vcfSplitInfoBaseColumns,
    ...state.infoTagOrder.map((tag) => ({
      id: infoColumnsByTag.get(tag),
      label: `INFO ${tag}`,
      type: "string"
    }))
  ];
  const splitInfoRows = state.variantRows.map((row, index) =>
    makeSplitInfoVariantRow(row, state.variantInfoValues[index] ?? {}, infoColumnsByTag)
  );
  const regionVariantRows = state.variantRows.filter((row) => rowInSelectedRegion(row, options));
  const regionSplitInfoRows = splitInfoRows.filter((row) => rowInSelectedRegion(row, options));
  const limitedRegionVariantRows = limitRowsByMaxVariants(regionVariantRows, maxVariants, state.warnings);
  const limitedRegionSplitInfoRows = limitRowsByMaxVariants(regionSplitInfoRows, maxVariants, state.warnings);
  const selectedGenotypeRows = ["genotypes"].includes(state.dataType)
    ? limitGenotypeRowsByMaxVariants(state.genotypeRows, maxVariants, state.warnings)
    : state.genotypeRows;
  const rowsByType = {
    metadata: state.metadataRows,
    "info-tags": state.infoRows,
    "format-fields": state.formatRows,
    filters: state.filterRows,
    contigs: state.contigRows,
    samples: sampleRows,
    variants: state.variantRows,
    "split-info-variants": splitInfoRows,
    genotypes: selectedGenotypeRows,
    "region-variants": limitedRegionVariantRows,
    "region-split-info": limitedRegionSplitInfoRows,
    "region-viewer": limitedRegionVariantRows
  };
  const columnsByType = {
    metadata: vcfMetadataColumns,
    "info-tags": vcfInfoTagColumns,
    "format-fields": vcfFormatFieldColumns,
    filters: vcfFilterColumns,
    contigs: vcfContigColumns,
    samples: vcfSampleColumns,
    variants: vcfVariantColumns,
    "split-info-variants": splitInfoColumns,
    genotypes: vcfGenotypeTableColumns,
    "region-variants": vcfVariantColumns,
    "region-split-info": splitInfoColumns,
    "region-viewer": vcfVariantColumns
  };
  const selectedRows = rowsByType[state.dataType] ?? state.metadataRows;
  const columns = columnsByType[state.dataType] ?? vcfMetadataColumns;
  const regionText = ["genotypes", "region-variants", "region-split-info", "region-viewer"].includes(state.dataType)
    ? selectedRegionText(options)
    : "not applied";
  const report = [
    "VCF extractor",
    "",
    `Metadata lines: ${state.metadataRows.length}`,
    `INFO tag definitions: ${state.infoRows.length}`,
    `FORMAT field definitions: ${state.formatRows.length}`,
    `FILTER definitions: ${state.filterRows.length}`,
    `Contigs/chromosomes: ${state.contigRows.length}`,
    `Samples: ${state.samples.length}`,
    `Variant sites: ${state.variantRows.length}`,
    `Genotype rows: ${state.genotypeRows.length}`,
    `Selected data: ${state.dataType}`,
    `Selected region: ${regionText}`,
    `Selected rows: ${selectedRows.length}`
  ].join("\n");
  return { rows: selectedRows, allGenotypeRows: state.genotypeRows, report, warnings: state.warnings, columns, dataType: state.dataType };
}

export function extractVcfData(input, options = {}, context = {}) {
  const state = createVcfExtractionState(options);
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const [lineIndex, line] of lines.entries()) {
    if (lineIndex % 1000 === 0) {
      context.throwIfCancelled?.();
    }
    processVcfLine(state, line, options);
  }
  return finalizeVcfExtractionState(state, options);
}

export async function extractVcfDataFromChunks(chunks, options = {}, context = {}) {
  const state = createVcfExtractionState(options);
  let lineIndex = 0;
  for await (const line of streamTextLines(chunks)) {
    if (lineIndex % 1000 === 0) {
      context.throwIfCancelled?.();
      context.reportProgress?.({ phase: "parsing-vcf", linesProcessed: lineIndex });
      await context.yieldIfNeeded?.();
    }
    processVcfLine(state, line, options);
    lineIndex += 1;
  }
  return finalizeVcfExtractionState(state, options);
}

export function extractVcfGenotypeTable(input) {
  return extractVcfData(input, { dataType: "genotypes" });
}

export function makeVcfGenotypeTableTsv(rows, columns = vcfGenotypeTableColumns) {
  return exportDelimitedTable(columns, rows, "\t");
}
