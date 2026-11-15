import { normalizeCodonUsageOptions, CODON_USAGE_LIMITS } from "../../core/codon-usage-options.js";
import { exportDelimitedTable } from "../../core/table.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { getCodonsForCode, getGeneticCode } from "../../core/genetic-code.js";
import {
  makeCategoricalBarPlotSpec,
  makeObservablePlotConfig,
  renderCategoricalBarPlotSvg
} from "../../core/plot-renderer.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const codonUsageTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "amino_acid", label: "Amino acid", type: "string" },
  { id: "codon", label: "Codon", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "per_1000", label: "Per 1000", type: "number" },
  { id: "fraction", label: "Fraction", type: "number" },
  { id: "amino_acid_total", label: "Amino acid total", type: "number" },
  { id: "record_index", label: "Record number", type: "number" },
  { id: "is_total", label: "Combined total", type: "boolean" }
];

export { CODON_USAGE_LIMITS } from "../../core/codon-usage-options.js";

function formatNumber(value) {
  return value !== 0 && Math.abs(value) < 0.0005 ? value.toPrecision(3) : value.toFixed(3);
}

function normalizeSequence(sequence) {
  return String(sequence ?? "").toUpperCase().replaceAll("U", "T");
}

function makeEmptyUsage(codeOrId) {
  const codons = getCodonsForCode(codeOrId);
  const counts = new Map(codons.map((item) => [item.codon, 0]));
  return { codons, counts };
}

function makeUsageAccumulator(codeOrId) {
  const code = getGeneticCode(codeOrId);
  const { codons, counts } = makeEmptyUsage(code);
  return {
    code,
    codons,
    counts,
    carry: "",
    countedCodons: 0,
    senseCodons: 0,
    stopCodons: 0,
    ambiguousCodons: 0,
    gc3Count: 0
  };
}

function appendUsageChunk(accumulator, sequence) {
  const source = `${accumulator.carry}${normalizeSequence(sequence)}`;
  const usableLength = source.length - (source.length % 3);
  const aminoAcidsByCodon = new Map(accumulator.codons.map((item) => [item.codon, item.aa]));
  for (let index = 0; index < usableLength; index += 3) {
    const codon = source.slice(index, index + 3);
    if (!/^[ACGT]{3}$/.test(codon)) {
      accumulator.ambiguousCodons += 1;
      continue;
    }
    accumulator.counts.set(codon, (accumulator.counts.get(codon) ?? 0) + 1);
    accumulator.countedCodons += 1;
    if (aminoAcidsByCodon.get(codon) === "*") accumulator.stopCodons += 1;
    else accumulator.senseCodons += 1;
    if (codon[2] === "G" || codon[2] === "C") accumulator.gc3Count += 1;
  }
  accumulator.carry = source.slice(usableLength);
}

function finishUsageAccumulator(accumulator) {
  return {
    code: accumulator.code,
    codons: accumulator.codons,
    counts: accumulator.counts,
    countedCodons: accumulator.countedCodons,
    senseCodons: accumulator.senseCodons,
    stopCodons: accumulator.stopCodons,
    ambiguousCodons: accumulator.ambiguousCodons,
    trailingBases: accumulator.carry.length,
    gc3Percent: accumulator.countedCodons > 0
      ? (accumulator.gc3Count / accumulator.countedCodons) * 100
      : 0
  };
}

function countCodons(sequence, options) {
  const accumulator = makeUsageAccumulator(options.geneticCode);
  appendUsageChunk(accumulator, sequence);
  return finishUsageAccumulator(accumulator);
}

function buildRows(title, usage, recordIndex, isTotal = false) {
  const aminoAcidTotals = new Map();

  for (const item of usage.codons) {
    aminoAcidTotals.set(item.aa, (aminoAcidTotals.get(item.aa) ?? 0) + (usage.counts.get(item.codon) ?? 0));
  }

  return usage.codons.map((item) => {
    const count = usage.counts.get(item.codon) ?? 0;
    const aminoAcidTotal = aminoAcidTotals.get(item.aa) ?? 0;
    return {
      record: title,
      record_index: recordIndex,
      is_total: isTotal,
      amino_acid: item.aa,
      codon: item.codon,
      count,
      per_1000: usage.countedCodons > 0 ? (count / usage.countedCodons) * 1000 : 0,
      fraction: aminoAcidTotal > 0 ? count / aminoAcidTotal : 0,
      amino_acid_total: aminoAcidTotal
    };
  });
}

function mergeUsages(usages, codeOrId) {
  const merged = {
    ...makeEmptyUsage(codeOrId),
    countedCodons: 0,
    senseCodons: 0,
    stopCodons: 0,
    ambiguousCodons: 0,
    trailingBases: 0,
    gc3WeightedCount: 0
  };

  for (const usage of usages) {
    for (const [codon, count] of usage.counts.entries()) {
      merged.counts.set(codon, (merged.counts.get(codon) ?? 0) + count);
    }
    merged.countedCodons += usage.countedCodons;
    merged.senseCodons += usage.senseCodons;
    merged.stopCodons += usage.stopCodons;
    merged.ambiguousCodons += usage.ambiguousCodons;
    merged.trailingBases += usage.trailingBases;
    merged.gc3WeightedCount += (usage.gc3Percent / 100) * usage.countedCodons;
  }

  merged.gc3Percent =
    merged.countedCodons > 0 ? (merged.gc3WeightedCount / merged.countedCodons) * 100 : 0;
  return merged;
}

function makeReport(analyzedRecords) {
  const lines = [];

  for (const record of analyzedRecords) {
    lines.push(`${record.isTotal ? "Combined total" : `Record ${record.recordIndex}: ${record.title}`} codon usage`);
    lines.push(`Codons counted: ${record.usage.countedCodons}`);
    lines.push(`Sense codons: ${record.usage.senseCodons}`);
    lines.push(`Stop codons counted: ${record.usage.stopCodons}`);
    lines.push(`Ambiguous codons skipped: ${record.usage.ambiguousCodons}`);
    lines.push(`Trailing bases ignored: ${record.usage.trailingBases}`);
    lines.push(`GC3 percent: ${formatNumber(record.usage.gc3Percent)}`);
    lines.push("aa\tcodon\tcount\tper_1000\tfraction\tamino_acid_total");
    for (const row of record.rows.filter((item) => item.count > 0)) {
      lines.push(
        [
          row.amino_acid,
          row.codon,
          row.count,
          formatNumber(row.per_1000),
          formatNumber(row.fraction),
          row.amino_acid_total
        ].join("\t")
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function makeTsv(rows) {
  return exportDelimitedTable(codonUsageTableColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

const PLOT_VALUE_LABELS = {
  count: "Count",
  per_1000: "Per 1000",
  fraction: "Fraction"
};

function makeCodonPlotSpec(analyzedRecords, options) {
  const plotRecords = analyzedRecords.filter((record) => !record.isTotal);
  const rowRecords = plotRecords.length > 0 ? plotRecords : analyzedRecords;
  const codonOrder = rowRecords[0]?.rows.map((row) => row.codon) ?? [];
  const duplicateTitles = new Set(rowRecords.map(record => record.title)).size !== rowRecords.length;
  const label = record => duplicateTitles ? `Record ${record.recordIndex}: ${record.title}` : record.title;
  const categories = codonOrder.map((codon) => {
    const row = rowRecords[0]?.rows.find((item) => item.codon === codon);
    return {
      id: codon,
      label: codon,
      group: row?.amino_acid ?? ""
    };
  });
  const bars = [];
  for (const record of rowRecords) {
    const rowsByCodon = new Map(record.rows.map(row => [row.codon, row]));
    for (const category of categories) {
      const row = rowsByCodon?.get(category.id);
      const value = row?.[options.plotValue] ?? 0;
      bars.push({
        category: category.id,
        series: `record-${record.recordIndex}`,
        value,
        title: `${label(record)} ${category.id} (${category.group}): ${formatNumber(value)}`
      });
    }
  }
  const totalsByCodon = new Map(categories.map((category) => [category.id, 0]));
  for (const bar of bars) {
    totalsByCodon.set(bar.category, (totalsByCodon.get(bar.category) ?? 0) + (Number(bar.value) || 0));
  }
  const yMax = Math.max(1, ...totalsByCodon.values()) * 1.08;
  return makeCategoricalBarPlotSpec({
    title: `${PLOT_VALUE_LABELS[options.plotValue]} codon usage plot`,
    xLabel: "Codon",
    yLabel: PLOT_VALUE_LABELS[options.plotValue],
    categories,
    series: rowRecords.map((record) => ({ id: `record-${record.recordIndex}`, label: label(record) })),
    bars,
    yDomain: [0, yMax],
    barLayout: "stacked",
    showLegend: options.showLegend,
    notes: ["Codons are shown in the same genetic-code table order used by SMS3 reference data."]
  });
}

function makeCodonUsageResult(analyzedInputRecords, normalizedOptions, {
  warnings = [],
  recordsProcessed = analyzedInputRecords.length,
  basesProcessed = 0,
  charactersRemoved = 0,
  limitOptions = {}
} = {}) {
  if (normalizedOptions.outputFormat === "plot" && recordsProcessed > CODON_USAGE_LIMITS.maxPlotRecords) {
    throw new Error(`Codon usage plots support at most ${CODON_USAGE_LIMITS.maxPlotRecords.toLocaleString()} input records per run. Choose the table or summary report for larger record collections.`);
  }
  const analyzedRecords = [...analyzedInputRecords];
  const code = getGeneticCode(normalizedOptions.geneticCode);
  if (analyzedRecords.length > 1 && normalizedOptions.outputFormat !== "plot") {
    const totalUsage = mergeUsages(analyzedRecords.map((record) => record.usage), code);
    const totalRows = buildRows("Total", totalUsage, 0, true);
    analyzedRecords.push({ title: "Total", recordIndex: 0, isTotal: true, usage: totalUsage, rows: totalRows });
  }

  const outputFormat = normalizedOptions.outputFormat;
  const isTableOutput = outputFormat === "table";
  const isPlotOutput = outputFormat === "plot";
  const allRows = isTableOutput || isPlotOutput ? analyzedRecords.flatMap(record => record.rows) : null;
  const reportOutput = outputFormat === "report" ? makeReport(analyzedRecords) : "";
  const plotSpec = isPlotOutput ? makeCodonPlotSpec(analyzedRecords, normalizedOptions) : null;
  const svgPlot = plotSpec ? renderCategoricalBarPlotSvg(plotSpec) : "";
  const output = isTableOutput ? makeTsv(allRows) : isPlotOutput ? svgPlot : reportOutput;
  const maxOutputCharacters = effectiveToolLimit(limitOptions, "codonUsageOutput", CODON_USAGE_LIMITS.maxMaterializedOutputCharacters);
  if (output.length > maxOutputCharacters) {
    throw new Error(`Codon usage output contains ${output.length.toLocaleString()} characters, above the current materialized-output limit of ${maxOutputCharacters.toLocaleString()}.`);
  }

  return makeToolResult({
    output,
    download: {
      filename: `codon-usage.${isTableOutput ? "tsv" : isPlotOutput ? "svg" : "txt"}`,
      mimeType:
        isTableOutput
          ? "text/tab-separated-values"
          : isPlotOutput
            ? "image/svg+xml;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(reportOutput, "text/plain") } : {}),
      ...(allRows ? { table: makeTableStream(codonUsageTableColumns, allRows, "codon-usage") } : {}),
      ...(isPlotOutput ? { plot: makeTextStream(svgPlot, "image/svg+xml") } : {})
    },
    visual: isPlotOutput
      ? {
          svg: svgPlot,
          renderer: "observable-plot",
          plotSpec,
          observablePlotConfig: plotSpec ? makeObservablePlotConfig(plotSpec) : undefined,
          pngDownload: true
        }
      : undefined,
    optionsUsed: normalizedOptions
  });
}

export function calculateCodonUsage(sequence, options = {}) {
  return countCodons(sequence, normalizeCodonUsageOptions(options));
}

export async function runCodonUsage(input, options = {}, executionContext = {}) {
  let lastYield = 0;
  const context = {
    ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      // Source and counting chunks share a scheduling slice, so tiny records
      // still poll cancellation without paying two browser timer delays each.
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    }
  };
  const normalizedOptions = normalizeCodonUsageOptions(options);
  options = { ...options, ...normalizedOptions };
  context.reportProgress?.({ phase: "counting-codons", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const sourceOptions = applyDisabledFastaSourceLimits({
    ...options,
    maxSourceRecords: Math.min(CODON_USAGE_LIMITS.maxRecords, Number(options.maxSourceRecords) || CODON_USAGE_LIMITS.maxRecords)
  }, {
    maxSourceBases: "codonUsageInput",
    maxSourceRecords: "codonUsageInput",
    maxDecodedSourceBytes: "codonUsageInput",
    maxSourceBytes: "codonUsageInput"
  });
  const opened = await openCleanDnaRnaFastaSource(input, { ...sourceOptions, strictHeaders: true }, context);
  const analyzedRecords = [];
  const warnings = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let current = null;

  for await (const event of opened.events()) {
    context.throwIfCancelled?.();
    if (event.type === "record-start") {
      current = {
        title: event.title,
        recordIndex: analyzedRecords.length + 1,
        accumulator: makeUsageAccumulator(normalizedOptions.geneticCode)
      };
    } else if (event.type === "sequence-chunk" && current) {
      for (let start = 0; start < event.text.length; start += 65536) {
        context.throwIfCancelled?.();
        appendUsageChunk(current.accumulator, event.text.slice(start, start + 65536));
        await context.yieldIfNeeded?.();
      }
      basesProcessed += event.text.length;
    } else if (event.type === "record-end" && current) {
      const usage = finishUsageAccumulator(current.accumulator);
      charactersRemoved += event.removedCount;
      if (event.removedCount > 0) {
        warnings.push(`${current.title}: removed ${event.removedCount} non-DNA/RNA character(s).`);
      }
      if (event.length === 0) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      if (usage.ambiguousCodons > 0) warnings.push(`${current.title}: skipped ${usage.ambiguousCodons} ambiguous codon(s).`);
      if (usage.trailingBases > 0) warnings.push(`${current.title}: ignored ${usage.trailingBases} trailing base(s).`);
      analyzedRecords.push({ title: current.title, recordIndex: current.recordIndex, usage, rows: buildRows(current.title, usage, current.recordIndex) });
      current = null;
    }
  }
  warnings.push(...opened.warnings);
  if (analyzedRecords.length === 0) {
    const warning = opened.source.stats.inputProvided ? "No DNA/RNA records were found." : "No sequence input was provided.";
    const result = makeToolResult({ output: "", warnings: [warning, ...warnings], recordsProcessed: 0, basesProcessed: 0, charactersRemoved, optionsUsed: normalizedOptions });
    context.reportProgress?.({ phase: "finished", progress: 1 });
    return result;
  }
  const result = makeCodonUsageResult(analyzedRecords, normalizedOptions, {
    warnings,
    recordsProcessed: analyzedRecords.length,
    basesProcessed,
    charactersRemoved,
    limitOptions: options
  });
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}

// The browser worker and registry/default workflow share one computation path.
export const runCodonUsageWorker = runCodonUsage;
