import {
  designPcrPrimers,
  makePcrPrimerDesignPrimerFasta,
  makePcrPrimerDesignProductFasta,
  makePcrPrimerDesignReport,
  makePcrPrimerDesignTsv,
  pcrPrimerDesignTableColumns
} from "../../core/pcr-primer-design.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { loadReferenceGenomeRecords } from "../reference-genome-runner.js";

const OUTPUT_FORMATS = new Set(["report", "tsv", "primer-fasta", "product-fasta", "interactive-viewer", "interactive-circular-viewer"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function makePrimerDesignViewerData(result, outputFormat) {
  const rowsByTemplate = new Map();
  for (const row of result.rows) {
    const key = row.template || "Template";
    if (!rowsByTemplate.has(key)) rowsByTemplate.set(key, []);
    rowsByTemplate.get(key).push(row);
  }
  const circular = outputFormat === "interactive-circular-viewer";
  return makeDnaViewerData(result.records.map((record, index) => {
    const title = record.title || `Template ${index + 1}`;
    const rows = rowsByTemplate.get(title) ?? [];
    const productItems = rows.map((row) => ({
      start: row.left_start,
      end: row.right_end,
      length: row.product_size,
      label: `Pair ${row.rank}: ${row.product_size} bp`,
      name: `Primer pair ${row.rank} product`,
      type: "PCR product",
      score: row.score,
      productSize: row.product_size,
      color: "#2563eb"
    }));
    const primerItems = rows.flatMap((row) => [
      {
        start: row.left_start,
        end: row.left_end,
        length: row.left_length,
        label: `P${row.rank} left`,
        name: `Primer pair ${row.rank} left primer`,
        type: "left primer",
        strand: "+",
        primerSequence: row.left_primer,
        tmC: row.left_tm_c,
        gcPercent: row.left_gc_percent,
        score: row.score,
        referenceMatches: row.left_reference_matches,
        color: "#059669"
      },
      {
        start: row.right_start,
        end: row.right_end,
        length: row.right_length,
        label: `P${row.rank} right`,
        name: `Primer pair ${row.rank} right primer`,
        type: "right primer",
        strand: "-",
        primerSequence: row.right_primer,
        tmC: row.right_tm_c,
        gcPercent: row.right_gc_percent,
        score: row.score,
        referenceMatches: row.right_reference_matches,
        color: "#c2410c"
      }
    ]);
    return {
      title,
      sequence: record.sequence,
      length: record.sequence.length,
      topology: circular ? "circular" : "linear",
      tracks: [
        ...(productItems.length > 0
          ? [{
              id: "primer-design-products",
              type: "features",
              label: "Candidate amplicons",
              axisLabel: "Amplicons",
              layout: "stacked-intervals",
              featureOpacity: 0.5,
              items: productItems
            }]
          : []),
        ...(primerItems.length > 0
          ? [{
              id: "primer-design-sites",
              type: "features",
              label: "Primer binding sites",
              axisLabel: "Primer sites",
              layout: "stacked-intervals",
              featureOpacity: 0.72,
              items: primerItems
            }]
          : [])
      ]
    };
  }), {
    title: "PCR primer design viewer",
    layout: circular ? "circular" : "linear"
  });
}

export async function runPcrPrimerDesign(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const reference = await loadReferenceGenomeRecords(options, {
    loadedRecordLimit: Number.parseInt(options.maxReferenceRecordLength, 10) || 500000,
    indexedBaseLimit: Number.parseInt(options.maxIndexedReferenceBases, 10) || 5000000
  }, context);
  const result = await designPcrPrimers(input, {
    ...options,
    referenceRecords: reference.records,
    referenceWarnings: reference.warnings,
    referenceCharactersRemoved: reference.charactersRemoved,
    referenceBasesProcessed: reference.basesProcessed,
    referenceSource: reference.source
  }, context);
  const outputFormat = normalizeOutputFormat(options.outputFormat);

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makePcrPrimerDesignReport(result);
  const tsv = makePcrPrimerDesignTsv(result.rows);
  const primerFasta = outputFormat === "primer-fasta" ? makePcrPrimerDesignPrimerFasta(result.rows, result.options.lineWidth) : "";
  const productFasta = outputFormat === "product-fasta" ? makePcrPrimerDesignProductFasta(result.rows, result.options.lineWidth) : "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makePrimerDesignViewerData(result, outputFormat) : null;
  const outputs = {
    report,
    tsv,
    "primer-fasta": primerFasta,
    "product-fasta": productFasta,
    "interactive-viewer": viewer ? JSON.stringify(viewer, null, 2) : "",
    "interactive-circular-viewer": viewer ? JSON.stringify(viewer, null, 2) : ""
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "tsv"
        ? "pcr-primer-design-candidates.tsv"
        : outputFormat === "primer-fasta"
          ? "pcr-primer-design-primers.fasta"
          : outputFormat === "product-fasta"
            ? "pcr-primer-design-products.fasta"
            : isInteractiveViewerFormat(outputFormat)
              ? "pcr-primer-design-viewer.json"
            : "pcr-primer-design.txt",
      mimeType: outputFormat === "tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat.endsWith("fasta")
          ? "text/x-fasta;charset=utf-8"
          : isInteractiveViewerFormat(outputFormat)
            ? "application/json;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.basesProcessed ?? result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    charactersRemoved: result.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(pcrPrimerDesignTableColumns, result.rows, "pcr-primer-design"),
      ...(outputFormat === "primer-fasta" ? { primerFasta: makeTextStream(primerFasta, "text/x-fasta") } : {}),
      ...(outputFormat === "product-fasta" ? { productFasta: makeTextStream(productFasta, "text/x-fasta") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: viewer ? { viewer } : undefined
  });
}
