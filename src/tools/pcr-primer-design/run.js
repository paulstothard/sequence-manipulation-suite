import { appVersion } from "../../app-version.js";
import { makeDesignAnalysisJson } from "../../core/design-analysis.js";
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
import { loadReferenceGenomeRecords, normalizeReferenceGenomeMode } from "../reference-genome-runner.js";
import { makePcrTemplateFeatureTracks } from "../../core/pcr-template-input.js";
import { normalizePcrPrimerDesignOptions } from "../../core/pcr-primer-design-options.js";

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function makePrimerDesignViewerData(result, outputFormat) {
  const circular = outputFormat === "interactive-circular-viewer";
  return makeDnaViewerData(result.records.map((record, index) => {
    const title = record.title || `Template ${index + 1}`;
    const rows = result.rows.filter(row => row.recordIndex === index);
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
        ...makePcrTemplateFeatureTracks(record),
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
  options = { ...options, ...normalizePcrPrimerDesignOptions(options) };
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const reference = await loadReferenceGenomeRecords(options, {
    loadedRecordLimit: options.maxReferenceRecordLength,
    indexedBaseLimit: options.maxIndexedReferenceBases
  }, context);
  const result = await designPcrPrimers(input, {
    ...options,
    referenceRecords: reference.records,
    referenceWarnings: reference.warnings,
    referenceCharactersRemoved: reference.charactersRemoved,
    referenceBasesProcessed: reference.basesProcessed,
    referenceSource: reference.source
  }, context);
  const outputFormat = options.outputFormat;

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const recordsSkipped = reference.recordsSkipped ?? 0;
  const status = reference.records.length ? (recordsSkipped ? "partial" : "complete")
    : (normalizeReferenceGenomeMode(options.referenceGenomeMode) === "none" ? "not run" : "skipped");
  result.referenceScreen = {
    ...result.referenceScreen, status, source: reference.source, records: reference.records.length,
    recordsSkipped, basesProcessed: reference.basesProcessed,
    recordScopes: reference.recordScopes ?? [],
    searchModel: "Per-primer exact matches on both strands of linear reference records; no pair specificity or circular-origin search",
    countInterpretation: status === "partial" ? "lower bound in scanned reference" : status === "complete" ? "exact count in scanned reference" : "unavailable"
  };
  result.search.candidatesReturned = result.rows.length;
  for (const row of result.rows) {
    row.candidate_search_status = result.search.status;
    row.reference_search_status = status;
    row.reference_records_skipped = recordsSkipped;
    row.reference_count_interpretation = result.referenceScreen.countInterpretation;
  }
  const inputFiles = Object.fromEntries(Object.entries(options)
    .filter(([, value]) => value && typeof value.slice === "function" && Number.isFinite(value.size))
    .map(([key, value]) => [key, { name: value.name ?? "unnamed file", size: value.size }]));
  result.inputFiles = inputFiles;
  const analysisContext = {
    tool: "pcr-primer-design", appVersion, analysisRevision: "2026-11-01",
    options: result.options, inputFiles, search: result.search, referenceScreen: result.referenceScreen,
    warnings: result.warnings, notes: result.notes ?? [],
    method: "Heuristic linear PCR candidate search; approximate composition Tm; uninterrupted Watson–Crick structure runs; at most eight lengths retained per endpoint; reference matches do not filter or rerank pairs"
  };
  const report = outputFormat === "report" ? makePcrPrimerDesignReport(result) : "";
  const tsv = outputFormat === "tsv" ? makePcrPrimerDesignTsv(result.rows) : "";
  const analysis = outputFormat === "analysis-json" ? makeDesignAnalysisJson("pcr-primer-design", {
    ...result, analysisRevision: analysisContext.analysisRevision, method: analysisContext.method,
    referenceRecords: reference.records
  }, options) : "";
  const primerFasta = outputFormat === "primer-fasta" ? makePcrPrimerDesignPrimerFasta(result.rows, result.options.lineWidth) : "";
  const productFasta = outputFormat === "product-fasta" ? makePcrPrimerDesignProductFasta(result.rows, result.options.lineWidth) : "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makePrimerDesignViewerData(result, outputFormat) : null;
  if (viewer) viewer.analysisContext = JSON.parse(JSON.stringify(analysisContext, (key, value) => typeof value === "number" && !Number.isFinite(value) ? "unlimited" : value));
  const outputs = {
    "analysis-json": analysis,
    report,
    tsv,
    "primer-fasta": primerFasta,
    "product-fasta": productFasta,
    "interactive-viewer": viewer ? JSON.stringify(viewer, null, 2) : "",
    "interactive-circular-viewer": viewer ? JSON.stringify(viewer, null, 2) : ""
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return { search: result.search, analysisContext, ...makeToolResult({
    optionsUsed: result.options,
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "analysis-json" ? "pcr-primer-design-analysis.json" : outputFormat === "tsv"
        ? "pcr-primer-design-candidates.tsv"
        : outputFormat === "primer-fasta"
          ? "pcr-primer-design-primers.fasta"
          : outputFormat === "product-fasta"
            ? "pcr-primer-design-products.fasta"
            : isInteractiveViewerFormat(outputFormat)
              ? "pcr-primer-design-viewer.json"
            : "pcr-primer-design.txt",
      mimeType: outputFormat === "analysis-json" ? "application/json;charset=utf-8" : outputFormat === "tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat.endsWith("fasta")
          ? "text/x-fasta;charset=utf-8"
          : isInteractiveViewerFormat(outputFormat)
            ? "application/json;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    notes: [...(result.notes ?? []), ...(["tsv", "primer-fasta", "product-fasta"].includes(outputFormat) ? ["Sequence and candidate exports contain the selected data. Choose Summary report or Analysis JSON to save settings, search scope and warnings."] : [])],
    recordsProcessed: result.records.length,
    basesProcessed: result.basesProcessed ?? result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    charactersRemoved: result.charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(outputFormat === "tsv" ? { table: makeTableStream(pcrPrimerDesignTableColumns, result.rows, "pcr-primer-design") } : {}),
      ...(outputFormat === "analysis-json" ? { analysis: makeTextStream(analysis, "application/json") } : {}),
      ...(outputFormat === "primer-fasta" ? { primerFasta: makeTextStream(primerFasta, "text/x-fasta") } : {}),
      ...(outputFormat === "product-fasta" ? { productFasta: makeTextStream(productFasta, "text/x-fasta") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: viewer ? { viewer } : undefined
  }) };
}
