import { parseSequenceInput } from "../../core/fasta.js";
import { getCodonsForCode, getGeneticCode } from "../../core/genetic-code.js";
import {
  makeCategoricalBarPlotSpec,
  makeObservablePlotConfig,
  renderCategoricalBarPlotSvg
} from "../../core/plot-renderer.js";
import { cleanDnaRnaSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const codonUsageTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "amino_acid", label: "Amino acid", type: "string" },
  { id: "codon", label: "Codon", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "per_1000", label: "Per 1000", type: "number" },
  { id: "fraction", label: "Fraction", type: "number" },
  { id: "amino_acid_total", label: "Amino acid total", type: "number" }
];

function formatNumber(value) {
  return value.toFixed(3);
}

function normalizeSequence(sequence) {
  return String(sequence ?? "").toUpperCase().replaceAll("U", "T");
}

function makeEmptyUsage(codeOrId = "1") {
  const codons = getCodonsForCode(codeOrId);
  const counts = new Map(codons.map((item) => [item.codon, 0]));
  return { codons, counts };
}

function countCodons(sequence, options = {}) {
  const code = getGeneticCode(options.geneticCode ?? "1");
  const { codons, counts } = makeEmptyUsage(code);
  const source = normalizeSequence(sequence);
  const completeCodons = [];
  let ambiguousCodons = 0;

  for (let index = 0; index + 3 <= source.length; index += 3) {
    const codon = source.slice(index, index + 3);
    if (/^[ACGT]{3}$/.test(codon)) {
      completeCodons.push(codon);
    } else {
      ambiguousCodons += 1;
    }
  }

  for (const codon of completeCodons) {
    counts.set(codon, (counts.get(codon) ?? 0) + 1);
  }

  const countedCodons = completeCodons.length;
  const aminoAcidsByCodon = new Map(codons.map((item) => [item.codon, item.aa]));
  const stopCodons = completeCodons.filter((codon) => aminoAcidsByCodon.get(codon) === "*").length;
  const senseCodons = countedCodons - stopCodons;
  const gc3Count = completeCodons.filter((codon) => codon[2] === "G" || codon[2] === "C").length;

  return {
    code,
    codons,
    counts,
    countedCodons,
    senseCodons,
    stopCodons,
    ambiguousCodons,
    trailingBases: source.length % 3,
    gc3Percent: countedCodons > 0 ? (gc3Count / countedCodons) * 100 : 0
  };
}

function buildRows(title, usage) {
  const aminoAcidTotals = new Map();

  for (const item of usage.codons) {
    aminoAcidTotals.set(item.aa, (aminoAcidTotals.get(item.aa) ?? 0) + (usage.counts.get(item.codon) ?? 0));
  }

  return usage.codons.map((item) => {
    const count = usage.counts.get(item.codon) ?? 0;
    const aminoAcidTotal = aminoAcidTotals.get(item.aa) ?? 0;
    return {
      record: title,
      amino_acid: item.aa,
      codon: item.codon,
      count,
      per_1000: usage.countedCodons > 0 ? (count / usage.countedCodons) * 1000 : 0,
      fraction: aminoAcidTotal > 0 ? count / aminoAcidTotal : 0,
      amino_acid_total: aminoAcidTotal
    };
  });
}

function mergeUsages(usages, codeOrId = "1") {
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
    lines.push(`${record.title} codon usage`);
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
  const columns = codonUsageTableColumns.map((column) => column.id);
  return [
    columns.join("\t"),
    ...rows.map((row) =>
      [
        row.record,
        row.amino_acid,
        row.codon,
        row.count,
        formatNumber(row.per_1000),
        formatNumber(row.fraction),
        row.amino_acid_total
      ].join("\t")
    )
  ].join("\n");
}

const PLOT_VALUE_LABELS = {
  count: "Count",
  per_1000: "Per 1000",
  fraction: "Fraction"
};

function normalizeOptions(options = {}) {
  const outputFormats = new Set(["report", "table", "tsv", "plot", "svg-plot", "sms3-svg", "observable-svg"]);
  const outputFormat = outputFormats.has(options.outputFormat)
    ? options.outputFormat
    : "table";
  return {
    geneticCode: getGeneticCode(options.geneticCode ?? "1").id,
    plotValue: Object.hasOwn(PLOT_VALUE_LABELS, options.plotValue) ? options.plotValue : "count",
    showLegend: options.showLegend !== false,
    outputFormat: outputFormat === "tsv"
      ? "table"
      : ["svg-plot", "sms3-svg", "observable-svg"].includes(outputFormat)
        ? "plot"
        : outputFormat
  };
}

function makeCodonPlotSpec(analyzedRecords, options) {
  const plotRecords = analyzedRecords.filter((record) => record.title !== "Total");
  const rowRecords = plotRecords.length > 0 ? plotRecords : analyzedRecords;
  const codonOrder = rowRecords[0]?.rows.map((row) => row.codon) ?? [];
  const rowsByRecord = new Map(rowRecords.map((record) => [record.title, new Map(record.rows.map((row) => [row.codon, row]))]));
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
    const rowsByCodon = rowsByRecord.get(record.title);
    for (const category of categories) {
      const row = rowsByCodon?.get(category.id);
      const value = row?.[options.plotValue] ?? 0;
      bars.push({
        category: category.id,
        series: record.title,
        value,
        title: `${record.title} ${category.id} (${category.group}): ${formatNumber(value)}`
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
    series: rowRecords.map((record) => ({ id: record.title, label: record.title })),
    bars,
    yDomain: [0, yMax],
    showLegend: options.showLegend,
    notes: ["Codons are shown in the same genetic-code table order used by SMS3 reference data."]
  });
}

export function calculateCodonUsage(sequence, options = {}) {
  return countCodons(sequence, options);
}

export function runCodonUsage(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const normalizedOptions = normalizeOptions(options);

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  const allRows = [];
  const code = getGeneticCode(normalizedOptions.geneticCode);
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    const usage = calculateCodonUsage(cleaned.sequence, {
      geneticCode: code.id
    });

    if (usage.ambiguousCodons > 0) {
      warnings.push(`${record.title}: skipped ${usage.ambiguousCodons} ambiguous codon(s).`);
    }

    if (usage.trailingBases > 0) {
      warnings.push(`${record.title}: ignored ${usage.trailingBases} trailing base(s).`);
    }

    const rows = buildRows(record.title, usage);
    analyzedRecords.push({ title: record.title, usage, rows });
    allRows.push(...rows);
  }

  if (analyzedRecords.length > 1) {
    const totalUsage = mergeUsages(
      analyzedRecords.map((record) => record.usage),
      code
    );
    const totalRows = buildRows("Total", totalUsage);
    analyzedRecords.push({ title: "Total", usage: totalUsage, rows: totalRows });
    allRows.push(...totalRows);
  }

  const outputFormat = normalizedOptions.outputFormat;
  const isTableOutput = outputFormat === "table";
  const isPlotOutput = outputFormat === "plot";
  const reportOutput = makeReport(analyzedRecords);
  const plotSpec = isPlotOutput ? makeCodonPlotSpec(analyzedRecords, normalizedOptions) : null;
  const svgPlot = plotSpec ? renderCategoricalBarPlotSvg(plotSpec) : "";
  const output =
    isTableOutput
      ? makeTsv(allRows)
      : isPlotOutput
        ? svgPlot
        : reportOutput;
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
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      table: makeTableStream(codonUsageTableColumns, allRows, "codon-usage"),
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

export async function runCodonUsageWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "counting-codons", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const result = runCodonUsage(input, options);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
