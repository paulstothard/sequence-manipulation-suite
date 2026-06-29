import {
  extractVcfData,
  extractVcfDataFromChunks,
  makeVcfGenotypeTableTsv,
  vcfGenotypeTableColumns
} from "../../core/vcf-genotype-table.js";
import { streamTextFileChunks } from "../../core/compressed-text-reader.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import {
  hasIndexedVcfInputs,
  makeVcfTextFromIndexedRegion,
  readIndexedVcfRegion
} from "../../core/indexed-genomics/indexed-vcf-reader.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { readOptionalReferenceGenomeRegion } from "../../core/optional-reference-genome.js";

const OUTPUT_FORMATS = new Set(["tsv", "xlsx", "report", "interactive-viewer"]);
const SOURCE_MODES = new Set(["paste-upload", "indexed-vcf"]);
const INDEXED_REGION_DATA_TYPES = new Set(["genotypes", "region-variants", "region-split-info", "region-viewer"]);
export const VCF_GENOTYPE_VIEWER_MAX_REGION_SPAN = 1000000;
export const VCF_GENOTYPE_VIEWER_MAX_RECORDS = 12;

function normalizeOutputFormat(value, dataType = "") {
  if (dataType === "region-viewer") {
    return "interactive-viewer";
  }
  return OUTPUT_FORMATS.has(value) ? value : "tsv";
}

function normalizeSourceMode(value, options = {}) {
  if (SOURCE_MODES.has(value)) {
    return value;
  }
  return hasIndexedVcfInputs(options) ? "indexed-vcf" : "paste-upload";
}

function isInteractiveViewerFormat(value) {
  return value === "interactive-viewer";
}

function isRegionDataType(value) {
  return INDEXED_REGION_DATA_TYPES.has(value);
}

function normalizePosition(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function variantKey(row) {
  return [row.chrom, row.pos, row.id, row.ref, row.alt].join("\u0001");
}

function classifyVariant(row) {
  const ref = String(row.ref ?? "");
  const alts = String(row.alt ?? "").split(",");
  if (alts.length > 1) return "multi-allelic";
  const alt = alts[0] ?? "";
  if (ref.length === 1 && alt.length === 1) return "SNV";
  if (ref.length === alt.length) return "MNV";
  if (ref.length < alt.length) return "insertion";
  if (ref.length > alt.length) return "deletion";
  return "indel";
}

function makeVariantLabel(row) {
  const id = row.id && row.id !== "." ? row.id : `${row.chrom}:${row.pos}`;
  return `${id} ${row.ref}>${row.alt}`;
}

function makeVariantViewerRows(result) {
  if (result.dataType !== "genotypes") {
    return result.rows.map((row) => ({
      ...row,
      sampleGenotypes: ""
    }));
  }

  const grouped = new Map();
  for (const row of result.rows) {
    const key = variantKey(row);
    if (!grouped.has(key)) {
      grouped.set(key, {
        chrom: row.chrom,
        pos: row.pos,
        id: row.id,
        ref: row.ref,
        alt: row.alt,
        sampleGenotypes: []
      });
    }
    const parts = [
      `${row.sample || "sample"}=${row.gt || "."}`,
      row.dp ? `DP ${row.dp}` : "",
      row.gq ? `GQ ${row.gq}` : ""
    ].filter(Boolean);
    grouped.get(key).sampleGenotypes.push(parts.join(" "));
  }

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    sampleGenotypes: row.sampleGenotypes.join("; ")
  }));
}

async function makeVcfViewerData(result, options, warnings, context = {}) {
  const rows = makeVariantViewerRows(result)
    .filter((row) => row.chrom && Number.isFinite(Number(row.pos)));
  const regionStart = normalizePosition(options.regionStart);
  const regionEnd = normalizePosition(options.regionEnd);
  const selectedChromosome = String(options.chromosome ?? "").trim();
  const rowsByChrom = new Map();

  for (const row of rows) {
    if (!rowsByChrom.has(row.chrom)) rowsByChrom.set(row.chrom, []);
    rowsByChrom.get(row.chrom).push(row);
  }

  const records = [];
  for (const [chrom, chromRows] of rowsByChrom) {
    if (records.length >= VCF_GENOTYPE_VIEWER_MAX_RECORDS) {
      warnings.push(`Variant viewer was limited to ${VCF_GENOTYPE_VIEWER_MAX_RECORDS} contigs/chromosomes. Use the table for the full set.`);
      break;
    }
    const positions = chromRows.map((row) => Number(row.pos)).filter(Number.isFinite);
    const start = selectedChromosome === chrom && regionStart !== null
      ? regionStart
      : Math.min(...positions);
    const end = selectedChromosome === chrom && regionEnd !== null
      ? regionEnd
      : Math.max(...positions.map((pos, index) => pos + Math.max(1, String(chromRows[index].ref ?? "").length) - 1));
    const span = end - start + 1;
    if (!Number.isFinite(span) || span <= 0) {
      continue;
    }
    if (span > VCF_GENOTYPE_VIEWER_MAX_REGION_SPAN) {
      warnings.push(
        `Skipped ${chrom} in the variant viewer because the displayed span would be ${span.toLocaleString()} bp. Select a smaller genotype region or use the table output.`
      );
      continue;
    }
    const referenceRegion = await readOptionalReferenceGenomeRegion(options, {
      seqid: chrom,
      start,
      end,
      label: `${chrom}:${start}-${end}`
    }, context);
    const referenceSequence = String(referenceRegion?.sequence ?? "").toUpperCase();
    if (referenceRegion?.warnings?.length) {
      warnings.push(...referenceRegion.warnings);
    }
    const hasReferenceSequence = referenceSequence.length === span;
    if (referenceSequence && !hasReferenceSequence) {
      warnings.push(`Reference genome sequence for ${chrom}:${start}-${end} was ${referenceSequence.length.toLocaleString()} bp; expected ${span.toLocaleString()} bp, so placeholder bases were used in the variant viewer.`);
    }

    const items = chromRows
      .map((row) => {
        const pos = Number(row.pos);
        const refLength = Math.max(1, String(row.ref ?? "").length);
        const localStart = pos - start + 1;
        const localEnd = localStart + refLength - 1;
        if (localEnd < 1 || localStart > span) {
          return null;
        }
        return {
          start: Math.max(1, localStart),
          end: Math.min(span, localEnd),
          length: refLength,
          label: makeVariantLabel(row),
          name: makeVariantLabel(row),
          type: classifyVariant(row),
          genomicPosition: pos,
          genomicCoordinates: `${chrom}:${pos}-${pos + refLength - 1}`,
          variantId: row.id && row.id !== "." ? row.id : "",
          refAllele: row.ref,
          altAllele: row.alt,
          filter: row.filter,
          qual: row.qual,
          info: row.info,
          sampleGenotypes: row.sampleGenotypes
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.start - right.start || left.end - right.end);

    if (items.length === 0) {
      continue;
    }
    records.push({
      id: `vcf-${chrom}-${start}-${end}`,
      title: `${chrom}:${start}-${end} VCF variants`,
      sequence: hasReferenceSequence ? referenceSequence : "N".repeat(span),
      length: span,
      topology: "linear",
      hideSequenceInterpretationControls: !hasReferenceSequence,
      showSecondStrandDefault: false,
      showForwardTranslationsDefault: false,
      showReverseTranslationsDefault: false,
      tracks: [
        {
          id: "vcf-variants",
          type: "features",
          label: "Variant sites",
          axisLabel: "Variants",
          layout: "stacked-intervals",
          featureOpacity: 0.78,
          items
        }
      ]
    });
  }

  if (rows.length > 0) {
    if (!records.some((record) => !record.hideSequenceInterpretationControls)) {
      warnings.push("Variant viewer uses placeholder N bases because VCF input does not contain the reference sequence. Provide a reference genome in Options to show real bases; variant selection details show true genomic coordinates and alleles.");
    }
  }

  return makeDnaViewerData(records, {
    title: "VCF variant viewer",
    layout: "linear"
  });
}

export async function runVcfGenotypeTable(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  let effectiveInput = input;
  let indexedWarnings = [];
  let indexedEngineLabel = "";
  const sourceMode = normalizeSourceMode(options.vcfSourceMode, options);
  const dataType = options.dataType === "region-viewer" ? "region-viewer" : options.dataType;
  const useIndexedVcf = sourceMode === "indexed-vcf" || (hasIndexedVcfInputs(options) && isRegionDataType(dataType));
  if (sourceMode === "indexed-vcf" && !hasIndexedVcfInputs(options)) {
    throw new Error("Indexed VCF mode requires a bgzip-compressed VCF.GZ file and its matching TBI or CSI index.");
  }
  if (useIndexedVcf && !isRegionDataType(dataType)) {
    throw new Error("Indexed VCF mode is for bounded region tasks. Choose variants in region, sample genotypes in region, or the variant region viewer output.");
  }
  if (useIndexedVcf) {
    const indexedRegion = await readIndexedVcfRegion(options, context);
    effectiveInput = makeVcfTextFromIndexedRegion(indexedRegion);
    indexedWarnings = indexedRegion.warnings;
    indexedEngineLabel = indexedRegion.engineLabel || indexedRegion.engine || "";
    if (!effectiveInput.trim()) {
      indexedWarnings = [
        ...indexedWarnings,
        "Indexed VCF query returned no header or variant lines for the requested region."
      ];
    }
  }

  const effectiveOptions = {
    ...options,
    dataType: dataType === "region-viewer" ? "region-viewer" : dataType
  };
  const result = !useIndexedVcf && options.vcfInputFile?.stream
    ? await extractVcfDataFromChunks(
        streamTextFileChunks(options.vcfInputFile, {
          onProgress: (detail) => context.reportProgress?.({
            ...detail,
            phase: detail.phase === "decompressing-text" ? "decompressing-vcf" : "reading-vcf"
          })
        }),
        effectiveOptions,
        context
      )
    : extractVcfData(effectiveInput, effectiveOptions, context);
  if (indexedWarnings.length > 0) {
    result.warnings.push(...indexedWarnings);
  }
  if (useIndexedVcf) {
    result.report = [
      result.report,
      "",
      "Indexed VCF query:",
      indexedEngineLabel ? `- Reader: ${indexedEngineLabel}` : "",
      ...indexedWarnings.map((warning) => `- ${warning}`)
    ].filter(Boolean).join("\n");
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat, result.dataType);
  const columns = result.columns ?? vcfGenotypeTableColumns;
  const tsv = makeVcfGenotypeTableTsv(result.rows, columns);
  const viewerCompatibleDataTypes = ["variants", "genotypes", "region-variants", "region-viewer"];
  if (isInteractiveViewerFormat(outputFormat) && !viewerCompatibleDataTypes.includes(result.dataType)) {
    result.warnings.push("Variant region viewer output uses variant records from the VCF; choose Variants in region or Sample genotypes in region for matching table output.");
  }
  const viewer = isInteractiveViewerFormat(outputFormat)
    ? await makeVcfViewerData(
        viewerCompatibleDataTypes.includes(result.dataType)
          ? result
          : options.vcfInputFile?.stream && !useIndexedVcf
            ? await extractVcfDataFromChunks(
                streamTextFileChunks(options.vcfInputFile),
                { ...effectiveOptions, dataType: "variants" },
                context
              )
            : extractVcfData(effectiveInput, { ...effectiveOptions, dataType: "variants" }, context),
        effectiveOptions,
        result.warnings,
        context
      )
    : null;
  const outputs = {
    tsv,
    xlsx: result.report,
    report: result.report,
    "interactive-viewer": viewer ? JSON.stringify(viewer, null, 2) : ""
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "report"
        ? "vcf-extractor.txt"
        : outputFormat === "xlsx"
          ? `vcf-${result.dataType ?? "data"}.xlsx`
        : isInteractiveViewerFormat(outputFormat)
          ? "vcf-variant-viewer.json"
          : `vcf-${result.dataType ?? "data"}.tsv`,
      mimeType: outputFormat === "report"
        ? "text/plain;charset=utf-8"
        : outputFormat === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : isInteractiveViewerFormat(outputFormat)
          ? "application/json;charset=utf-8"
          : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: isInteractiveViewerFormat(outputFormat)
      ? (viewer?.records ?? []).reduce((sum, record) => sum + (record.tracks?.[0]?.items?.length ?? 0), 0)
      : result.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(columns, result.rows, "vcf-extractor"),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: viewer ? { viewer } : undefined
  });
}
