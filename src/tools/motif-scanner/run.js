import { PROTEIN_MOTIF_LIMITS, DNA_RNA_MOTIF_LIMITS, normalizeMotifScannerOptions } from "../../core/motif-scanner-options.js";
import { exportDelimitedTable } from "../../core/table.js";
import { parseSequenceInput } from "../../core/fasta.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { iterateFastaFixedWindowSegments } from "../../core/fasta-fixed-window-segments.js";
import {
  motifMatchTableColumns,
  scanMotifRecordsWithContext
} from "../../core/motif-scanner.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { makeProteinViewerData, makeProteinViewerStream } from "../../core/protein-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import dnaRnaMotifs from "../../reference-data/motifs/dna-rna-motifs.js";
import proteinMotifs from "../../reference-data/motifs/protein-motifs.js";
import motifProvenance from "../../reference-data/motifs/provenance.js";
import { MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS } from "../fasta-input-policy.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";

const DETAILED_REPORT_MATCH_THRESHOLD = 2000;
const MAX_STREAMED_MOTIF_BASES = DNA_RNA_MOTIF_LIMITS.inputCharacters;
const MAX_MOTIF_WORK = DNA_RNA_MOTIF_LIMITS.work;
const MAX_STREAMED_MOTIF_HITS = DNA_RNA_MOTIF_LIMITS.hits;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = DNA_RNA_MOTIF_LIMITS.outputCharacters;
export const MOTIF_TEXT_MAP_MATCH_THRESHOLD = 5000;
export const MOTIF_SVG_MAP_MATCH_THRESHOLD = 120;
export const MOTIF_SVG_RECORD_MATCH_THRESHOLD = 30;
export const MOTIF_SVG_LABEL_MATCH_THRESHOLD = 48;
export const MOTIF_SVG_RECORD_LABEL_THRESHOLD = 12;

function getSelectedMotifs(motifs, options = {}) {
  const motifDatabase = options.motifDatabase;
  return motifs.filter((motif) => {
    if (motifDatabase !== "all" && motif.database !== motifDatabase) {
      return false;
    }
    if (options.motifId && options.motifId !== "all" && motif.id !== options.motifId) {
      return false;
    }
    if (options.motifClass && options.motifClass !== "all" && motif.class !== options.motifClass) {
      return false;
    }
    return true;
  });
}

function makeTsv(rows) {
  return exportDelimitedTable(motifMatchTableColumns.map((column) => ({ ...column, label: column.id })), rows, "\t");
}

function getSyntaxSummary(selectedMotifs) {
  const counts = new Map();
  for (const motif of selectedMotifs) {
    counts.set(motif.syntax, (counts.get(motif.syntax) ?? 0) + 1);
  }
  return ["exact", "iupac", "regex", "pwm"]
    .filter((syntax) => counts.has(syntax))
    .map((syntax) => `${syntax}:${counts.get(syntax)}`)
    .join(", ") || "none";
}

function makeReport({ title, rows, selectedMotifs, recordsProcessed, residuesProcessed, alphabet, options = {}, summarizeMatches = false, includesStops = false }) {
  const lines = [
    title,
    `Motif records scanned: ${selectedMotifs.length}`,
    `Motif syntax counts: ${getSyntaxSummary(selectedMotifs)}`,
    alphabet === "protein"
      ? "Matching policy: bundled residue patterns are matched directly to stop-delimited peptide chains to locate candidate sites."
      : "Matching policy: exact/IUPAC/regex motifs are matched directly; PWM/PSSM motifs are scored by relative PWM score.",
    `Sequences scanned: ${recordsProcessed}`,
    `${alphabet === "protein" ? includesStops ? "Sequence characters" : "Residues" : "Bases"} scanned: ${residuesProcessed}`,
    `Matches found: ${rows.length}`,
    `Database: ${motifProvenance.dataset} ${motifProvenance.version}`,
    `Database note: ${motifProvenance.description}`,
    ""
  ];

  const pwmCount = selectedMotifs.filter((motif) => motif.syntax === "pwm").length;
  if (pwmCount > 0) {
    lines.push(`PWM/PSSM threshold: ${Number(options.pwmThresholdPercent)}% relative score`);
    lines.push("PWM scoring policy: SMS3 converts bundled PFMs to log2 PWM weights with the source-record pseudocount/background and reports relative percent scores.");
    lines.push("");
  }

  if (selectedMotifs.length > 0) {
    lines.push("Selected motifs:");
    const listedMotifs = selectedMotifs.slice(0, 40);
    for (const motif of listedMotifs) {
      const source = `${motif.source?.name ?? ""} ${motif.source?.version ?? ""}`.trim();
      lines.push(`- ${motif.name} (${motif.id}; ${motif.class}; ${source})`);
    }
    if (selectedMotifs.length > listedMotifs.length) {
      lines.push(`- ... ${selectedMotifs.length - listedMotifs.length} additional motif records not listed in the report. Use the motif selector or TSV output for detailed review.`);
    }
    lines.push("");
  }

  if (rows.length === 0) {
    lines.push("No motif matches found.");
    return lines.join("\n");
  }

  if (summarizeMatches) {
    lines.push("Detailed match rows were summarized for this report. Use table output for the full hit table.");
    return lines.join("\n");
  }

  lines.push("record\tmotif\tclass\tstrand\tstart\tend\tmatched_text\tcontext_sequence\trecord_number");
  for (const row of rows) {
    lines.push(
      [
        row.record,
        row.motif_name,
        row.motif_class,
        row.strand,
        row.start,
        row.end,
        row.matched_text,
        row.context_sequence,
        row.record_index
      ].join("\t")
    );
  }

  return lines.join("\n");
}

function rowsByRecord(analyzedRecords) {
  return analyzedRecords.map((record) => ({
    ...record,
    rows: record.rows
  }));
}

function makeCompactMotifLabel(row) {
  const fallback = row.motif_name || row.motif_id || "motif";
  const labels = {
    "dna-polyadenylation-signal-aataaa": "polyA AATAAA",
    "dna-bacterial-minus-10-pribnow": "-10 Pribnow",
    "dna-bacterial-minus-35-core": "-35 promoter",
    "dna-tata-box-like": "TATA-like",
    "dna-kozak-vertebrate-consensus": "Kozak",
    "dna-shine-dalgarno-core": "Shine-Dalgarno",
    "protein-n-myristoylation-site": "N-myristoyl",
    "protein-n-glycosylation-sequon": "N-glyco",
    "protein-nls-basic-cluster": "basic NLS",
    "protein-casein-kinase-ii-site": "CK2 site",
    "protein-pkc-phosphorylation-site": "PKC site",
    "protein-c-terminal-peroxisomal-targeting-signal": "PTS1"
  };
  return labels[row.motif_id] ?? fallback;
}

function makeTextMap(analyzedRecords, config, maxMatches = MOTIF_TEXT_MAP_MATCH_THRESHOLD) {
  let remaining = maxMatches;
  const records = rowsByRecord(analyzedRecords).map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.rows.flatMap((row, index) => {
      if (remaining <= 0) {
        return [];
      }
      remaining -= 1;
      return [{ ...row, label: `m${index + 1}` }];
    })
  }));
  return records.map(record => renderTextAnnotationMapFromItems([record], {
    width: 60,
    headerPrefix: "",
    alphabet: config.alphabet,
    showSecondStrand: config.alphabet === "dna-rna"
  }) + (record.items.length ? "\n\nMotif labels:\n" + record.items.map(row => `${row.label}\t${row.start}-${row.end} (${row.strand})\t${row.motif_name}\t${row.motif_id}`).join("\n") : "")).join("\n\n");
}

function allocateSvgMatchCaps(records, maxTotal = MOTIF_SVG_MAP_MATCH_THRESHOLD, maxPerRecord = MOTIF_SVG_RECORD_MATCH_THRESHOLD) {
  const caps = new Array(records.length).fill(0);
  let remaining = Math.max(0, Number(maxTotal) || 0);

  while (remaining > 0) {
    const active = records
      .map((record, index) => ({
        index,
        remainingCapacity: Math.min(maxPerRecord, record.rows.length) - caps[index]
      }))
      .filter((record) => record.remainingCapacity > 0);
    if (active.length === 0) {
      break;
    }

    const share = Math.max(1, Math.floor(remaining / active.length));
    let assigned = 0;
    for (const record of active) {
      const add = Math.min(record.remainingCapacity, share, remaining);
      caps[record.index] += add;
      remaining -= add;
      assigned += add;
      if (remaining <= 0) {
        break;
      }
    }
    if (assigned === 0) {
      break;
    }
  }

  return caps;
}

function makeSvgMap(analyzedRecords, config, maxMatches = MOTIF_SVG_MAP_MATCH_THRESHOLD) {
  let remainingLabels = MOTIF_SVG_LABEL_MATCH_THRESHOLD;
  const rowRecords = rowsByRecord(analyzedRecords);
  const recordCaps = allocateSvgMatchCaps(rowRecords, maxMatches);
  const records = rowRecords.map((record, recordIndex) => {
    const features = [];
    let recordRemaining = recordCaps[recordIndex] ?? 0;
    let recordLabelsRemaining = MOTIF_SVG_RECORD_LABEL_THRESHOLD;
    for (const row of record.rows) {
      if (recordRemaining <= 0) {
        break;
      }
      recordRemaining -= 1;
      const showLabel = remainingLabels > 0 && recordLabelsRemaining > 0;
      if (showLabel) {
        remainingLabels -= 1;
        recordLabelsRemaining -= 1;
      }
      features.push({
        start: row.start,
        end: row.end,
        strand: row.strand,
        label: makeCompactMotifLabel(row),
        className: "variant",
        showLabel
      });
    }
    const hiddenMatches = Math.max(0, record.rows.length - features.length);
    return {
      title: record.title,
      sequence: record.sequence,
      length: record.sequenceLength,
      topology: "linear",
      molecule: config.alphabet === "protein" ? "protein" : "dna",
      features,
      notes: record.rows.length > 0
        ? [`Motif matches: ${record.rows.length.toLocaleString()} total; ${features.length.toLocaleString()} shown in map; ${hiddenMatches.toLocaleString()} omitted. Select Summary table for all coordinates.`]
        : ["Motif matches: 0 total; 0 shown in map; 0 omitted."]
    };
  });
  return renderSequenceMap({
    title: `${config.alphabet === "protein" ? "Protein" : "DNA/RNA"} motif match map`,
    records,
    styles: {
      variant: config.alphabet === "protein"
        ? { label: "Motif match", fill: "#9333ea", stroke: "#7e22ce" }
        : { label: "Motif match", fill: "#0891b2", stroke: "#0e7490" }
    }
  });
}

function isInteractiveViewerFormat(outputFormat, config) {
  if (config.alphabet === "protein") {
    return outputFormat === "interactive-viewer";
  }
  return config.alphabet === "dna-rna" &&
    (outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer");
}

function makeMotifViewerData(analyzedRecords, options = {}, config = {}) {
  const records = analyzedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.sequenceLength,
    topology: config.alphabet === "protein" ? "linear" : options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear",
    alphabet: config.alphabet,
    tracks: record.rows.length > 0
      ? [
          {
            id: "motif-matches",
            type: "features",
            label: "Motif matches",
            layout: "stacked-intervals",
            featureOpacity: 0.72,
            items: record.rows.map((row) => ({
              start: row.start,
              end: row.end,
              length: row.length,
              strand: config.alphabet === "protein" ? "" : row.strand,
              label: makeCompactMotifLabel(row),
              name: row.motif_name,
              type: row.motif_class,
              motifId: row.motif_id,
              score: row.score,
              source: row.source,
              matchedText: row.matched_text
            }))
          }
        ]
      : []
  }));
  if (config.alphabet === "protein") {
    return makeProteinViewerData(records, {
      title: "Protein motif viewer"
    });
  }
  return makeDnaViewerData(records, {
    title: "DNA/RNA motif viewer",
    layout: options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear"
  });
}

function buildMotifScannerOutput({ analyzedRecords, rows, selectedMotifs, recordsProcessed, sequenceLength, alphabet, title, options, config, warnings }) {
  const outputFormat = options.outputFormat;
  for (const [index, record] of analyzedRecords.entries()) {
    for (const row of record.rows) row.record_index = index + 1;
  }
  const totalMatches = rows.length;
  if (outputFormat === "text-map" && totalMatches > MOTIF_TEXT_MAP_MATCH_THRESHOLD) {
    warnings.push(
      `Motif text map was capped at ${MOTIF_TEXT_MAP_MATCH_THRESHOLD} of ${totalMatches} matches to keep output manageable. Use table output for all coordinates.`
    );
  }
  if (outputFormat === "svg-map" && totalMatches > MOTIF_SVG_MAP_MATCH_THRESHOLD) {
    warnings.push(
      `Linear motif map was capped at ${MOTIF_SVG_MAP_MATCH_THRESHOLD} of ${totalMatches} matches to keep output manageable. Use table output for all coordinates.`
    );
  }
  if (outputFormat === "svg-map" && analyzedRecords.some((record) => record.rows.length > MOTIF_SVG_RECORD_MATCH_THRESHOLD)) {
    warnings.push(
      `Linear motif map matches were distributed across records with a per-record ceiling of ${MOTIF_SVG_RECORD_MATCH_THRESHOLD} matches to avoid misleading empty records and extremely tall dense-hit maps. Use table output for all coordinates.`
    );
  }
  if (outputFormat === "svg-map" && (totalMatches > MOTIF_SVG_LABEL_MATCH_THRESHOLD || analyzedRecords.some((record) => record.rows.length > MOTIF_SVG_RECORD_LABEL_THRESHOLD))) {
    warnings.push(
      `Linear motif map labels were capped at ${MOTIF_SVG_RECORD_LABEL_THRESHOLD} labels per record and ${MOTIF_SVG_LABEL_MATCH_THRESHOLD} labels total to avoid an unreadable map. Use table output for all motif names and coordinates.`
    );
  }
  if (outputFormat === "report" && totalMatches > DETAILED_REPORT_MATCH_THRESHOLD) {
    warnings.push(
      `Detailed report rows were summarized because this run found ${totalMatches} matches. Use table output for the full hit table.`
    );
  }
  const report = outputFormat === "report" ? makeReport({
    title,
    rows,
    selectedMotifs,
    recordsProcessed,
    residuesProcessed: sequenceLength,
    alphabet,
    options,
    includesStops: alphabet === "protein" && analyzedRecords.some(record => record.sequence.includes("*")),
    summarizeMatches: totalMatches > DETAILED_REPORT_MATCH_THRESHOLD
  }) : "";
  const tsv = outputFormat === "tsv" ? makeTsv(rows) : "";
  const textMap = outputFormat === "text-map" ? makeTextMap(analyzedRecords, config) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(analyzedRecords, config) : "";
  const viewer = isInteractiveViewerFormat(outputFormat, config) ? makeMotifViewerData(analyzedRecords, options, config) : null;
  const output = outputFormat === "tsv"
    ? tsv
    : outputFormat === "text-map"
      ? textMap
      : outputFormat === "svg-map"
        ? svgMap
        : viewer
          ? JSON.stringify(viewer, null, 2)
          : report;

  return {
    outputFormat,
    output,
    report,
    textMap,
    svgMap,
    viewer
  };
}

async function runDnaRnaScanner(input, options, config, context) {
  // The source and matcher request checkpoints per chunk/record. Coalesce real
  // timer yields and progress messages, while checking cancellation at every call.
  const executionContext = context;
  let lastYield = -Infinity;
  let lastProgress = -Infinity;
  let lastPhase;
  context = {
    ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    },
    reportProgress(detail) {
      const now = Date.now();
      if (detail.phase !== lastPhase || now - lastProgress >= 32) {
        executionContext.reportProgress?.(detail);
        lastPhase = detail.phase;
        lastProgress = now;
      }
    }
  };
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const richOutput = ["text-map", "interactive-viewer", "interactive-circular-viewer"].includes(options.outputFormat);
  const boundedPaste = !options.loadedFastaFile?.stream && !["indexed", "bgzf"].includes(options.sourceMode) && String(input ?? "").length <= MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS;
  const maxWork = effectiveToolLimit(options, "motifScoring", MAX_MOTIF_WORK);
  const maxCandidateHits = effectiveToolLimit(options, "motifCandidates", MAX_STREAMED_MOTIF_HITS);
  const maxOutputCharacters = effectiveToolLimit(options, "motifOutput", MAX_MATERIALIZED_OUTPUT_CHARACTERS);
  const selectedMotifs = getSelectedMotifs(config.motifs, options);
  if (selectedMotifs.some((motif) => motif.syntax === "regex")) {
    throw new Error("Large FASTA motif scans support fixed-width exact, IUPAC, and PWM motifs. Regex motifs require bounded pasted input.");
  }
  const outputFormat = options.outputFormat;
  if (richOutput && !boundedPaste) {
    throw new Error("Large FASTA motif scans support report, table, and linear map output. Text maps and sequence viewers require bounded pasted input.");
  }
  const widths = selectedMotifs.map((motif) => motif.syntax === "pwm" ? motif.pwm?.weights?.length ?? 0 : motif.pattern?.length ?? 0);
  const maxWidth = Math.max(1, ...widths);
  if (maxWidth > 32_000) throw new Error("Selected motif exceeds the 32,000-base fixed-window scan limit.");
  const workPerBase = selectedMotifs.reduce((sum, motif, index) => sum + widths[index] * (options.strand === "forward" || motif.match?.strand !== "both" ? 1 : 2), 0);
  const sourceOptions = applyDisabledFastaSourceLimits({
    ...options,
    strictHeaders: true,
    sourceChunkSize: Math.min(65_536, Number(options.sourceChunkSize) || 65_536),
    maxSourceBases: Math.min(MAX_STREAMED_MOTIF_BASES, Number(options.maxSourceBases) || MAX_STREAMED_MOTIF_BASES)
  }, {
    maxSourceBases: "motifSource",
    maxSourceRecords: "motifSource",
    maxDecodedSourceBytes: "motifSource",
    maxSourceBytes: "motifSource"
  });
  const opened = await openCleanDnaRnaFastaSource(input, sourceOptions, context);
  const analyzedRecords = [];
  const warnings = [];
  const motifOrder = new Map(selectedMotifs.map((motif, index) => [motif.id, index]));
  let current = null;
  let work = 0;
  let candidateHits = 0;
  let retainedRowCharacters = 0;
  let sequenceLength = 0;
  let charactersRemoved = 0;
  async function* events() {
    for await (const event of opened.events()) {
      if (richOutput && event.type === "sequence-chunk") current.sequenceChunks.push(event.text);
      yield event;
    }
  }
  for await (const event of iterateFastaFixedWindowSegments(events(), { maxWindowLength: maxWidth + 20, segmentLength: 8192 })) {
    if (event.type === "record-start") {
      current = { title: event.title ?? "sequence", sequence: "", sequenceChunks: [], sequenceLength: 0, rows: [] };
      continue;
    }
    if (event.type === "scan-segment") {
      work += (event.ownedEnd0 - event.ownedStart0) * workPerBase;
      if (work > maxWork) throw new Error(`Motif scan exceeds the ${maxWork.toLocaleString()}-symbol scoring budget. Choose fewer motifs, one strand, or fewer records.`);
      if (selectedMotifs.length) {
        const scanned = await scanMotifRecordsWithContext({ title: current.title, sequence: event.text }, selectedMotifs, {
          alphabet: "dna-rna", strand: options.strand ?? "both", allowOverlaps: true,
          pwmThresholdPercent: options.pwmThresholdPercent,
          maxMatches: maxCandidateHits, failOnLimit: true
        }, context);
        for (const row of scanned.rows) {
          const start0 = event.segmentStart0 + row.start - 1;
          if (start0 < event.ownedStart0 || start0 >= event.ownedEnd0) continue;
          const retained = { ...row, start: start0 + 1, end: event.segmentStart0 + row.end };
          retainedRowCharacters += JSON.stringify(retained).length;
          if (retainedRowCharacters > maxOutputCharacters) throw new Error(`Motif hit table exceeds the materialized-output limit of ${maxOutputCharacters.toLocaleString()} characters. Choose fewer motifs or records.`);
          current.rows.push(retained);
          candidateHits += 1;
          if (candidateHits > maxCandidateHits) throw new Error(`Motif scan exceeds the ${maxCandidateHits.toLocaleString()}-candidate-hit limit. Raise the PWM threshold or choose fewer motifs.`);
        }
        warnings.push(...scanned.warnings);
      }
      await context.yieldIfNeeded?.();
      continue;
    }
    if (event.type === "record-end" && current) {
      current.sequence = richOutput ? current.sequenceChunks.join("") : "";
      delete current.sequenceChunks;
      current.sequenceLength = event.length;
      sequenceLength += event.length;
      charactersRemoved += event.removedCount;
      if (event.removedCount) warnings.push(`${current.title}: removed ${event.removedCount} non-DNA/RNA character(s).`);
      if (!event.length) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      if (options.allowOverlaps === false) {
        const groups = new Map();
        for (const row of current.rows) {
          const key = `${row.motif_id}\t${row.strand}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }
        const retained = [];
        for (const group of groups.values()) {
          const reverse = group[0].strand === "-";
          group.sort((a, b) => reverse ? b.start - a.start : a.start - b.start);
          let edge = reverse ? event.length + 1 : 0;
          for (const row of group) {
            if (reverse ? row.end < edge : row.start > edge) {
              retained.push(row);
              edge = reverse ? row.start : row.end;
            }
          }
        }
        current.rows = retained;
      }
      current.rows.sort((a, b) => (motifOrder.get(a.motif_id) ?? 0) - (motifOrder.get(b.motif_id) ?? 0) || a.start - b.start || a.end - b.end || a.strand.localeCompare(b.strand));
      analyzedRecords.push(current);
      current = null;
      context.reportProgress?.({ phase: "scanning-records", recordsProcessed: analyzedRecords.length, progress: Math.min(0.9, 0.1 + sequenceLength / MAX_STREAMED_MOTIF_BASES * 0.8) });
    }
  }
  warnings.push(...opened.warnings);
  if (!analyzedRecords.length) return makeToolResult({ output: "", warnings: [opened.source.stats.inputProvided ? "No DNA/RNA records were found." : "No DNA/RNA sequence input was provided.", ...warnings], recordsProcessed: 0, basesProcessed: 0, charactersRemoved: 0, streams: {} });
  if (!selectedMotifs.length) warnings.push("No bundled motif records matched the selected filters.");
  const rows = analyzedRecords.flatMap((record) => record.rows);
  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  const materialized = buildMotifScannerOutput({ analyzedRecords, rows, selectedMotifs, recordsProcessed: analyzedRecords.length, sequenceLength, alphabet: "dna-rna", title: config.title, options, config, warnings });
  if (Math.max(materialized.output.length, materialized.report.length) > maxOutputCharacters) throw new Error(`Motif output exceeds the materialized-output limit of ${maxOutputCharacters.toLocaleString()} characters. Choose fewer motifs or records.`);
  return makeToolResult({
    output: materialized.output,
    sequenceSearch: outputFormat === "text-map" ? { format: "labelled-blocks", plainMapHeadings: true, alphabet: "dna-rna" } : undefined,
    download: { filename: `${config.filenameBase}.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : materialized.viewer ? "json" : "txt"}`, mimeType: outputFormat === "tsv" ? "text/tab-separated-values" : outputFormat === "svg-map" ? "image/svg+xml;charset=utf-8" : materialized.viewer ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" },
    warnings, notes: [`Reference build: ${motifProvenance.version}.`],
    recordsProcessed: analyzedRecords.length, basesProcessed: sequenceLength, charactersRemoved,
    streams: {
      ...(materialized.outputFormat === "report" ? { report: makeTextStream(materialized.report, "text/plain") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(materialized.textMap, "text/plain", { format: "labelled-blocks", plainMapHeadings: true, alphabet: "dna-rna" }) } : {}),
      ...(materialized.viewer ? { viewer: makeDnaViewerStream(materialized.viewer) } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(materialized.svgMap, "image/svg+xml") } : {}),
      ...(materialized.outputFormat === "tsv" ? { table: makeTableStream(motifMatchTableColumns, rows, config.schema) } : {})
    },
    visual: outputFormat === "svg-map" ? { svg: materialized.svgMap } : materialized.viewer ? { viewer: materialized.viewer } : undefined
  });
}

async function runMotifScannerWorker(input, options = {}, config, context = {}) {
  if (config.alphabet === "dna-rna") return runDnaRnaScanner(input, options, config, context);
  const executionContext = context;
  let lastYield = -Infinity, lastProgress = -Infinity, lastPhase;
  context = { ...executionContext,
    async yieldIfNeeded() { executionContext.throwIfCancelled?.(); if (Date.now() - lastYield >= 8) { await executionContext.yieldIfNeeded?.(); lastYield = Date.now(); } },
    reportProgress(detail) { const now = Date.now(); if (detail.phase !== lastPhase || now - lastProgress >= 32) { executionContext.reportProgress?.(detail); lastPhase = detail.phase; lastProgress = now; } }
  };
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const limits = PROTEIN_MOTIF_LIMITS;
  const maxInput = effectiveToolLimit(options, "proteinMotifInput", limits.inputCharacters);
  const maxHits = effectiveToolLimit(options, "proteinMotifHits", limits.hits);
  const maxOutput = effectiveToolLimit(options, "proteinMotifOutput", limits.outputCharacters);
  if (String(input ?? "").length > maxInput) throw new Error("Protein motif input exceeds 2,000,000 characters.");
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const records = parseSequenceInput(input, config.alphabet, { strictHeaders: true });
  if (records.length > effectiveToolLimit(options, "proteinMotifRecords", limits.records)) throw new Error("Protein motif input exceeds 10,000 records.");
  if (records.some(record => record.title.length > limits.headerCharacters)) throw new Error("Protein motif FASTA headers must not exceed 1,000 characters.");
  const selectedMotifs = getSelectedMotifs(config.motifs, options);
  const warnings = [];
  const notes = [`Reference build: ${motifProvenance.version}.`];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: [`No ${config.alphabet === "protein" ? "protein" : "DNA/RNA"} sequence input was provided.`],
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel: config.alphabet === "protein" ? "residue" : "base",
      charactersRemoved: 0,
      streams: {}
    });
  }

  if (selectedMotifs.length === 0) {
    warnings.push("No bundled motif records matched the selected filters.");
  }

  const rows = [];
  const analyzedRecords = [];
  let sequenceLength = 0;
  let charactersRemoved = 0;
  let work = 0, rowCharacters = 0, matchedCharacters = 0;

  for (const [index, record] of records.entries()) {
    await context.yieldIfNeeded?.();
    work += record.sequence.length * selectedMotifs.length;
    if (work > effectiveToolLimit(options, "proteinMotifWork", limits.work)) throw new Error("Protein motif scan exceeds 50,000,000 residue-pattern positions. Select fewer motifs or records.");
    const result = await scanMotifRecordsWithContext(
      record,
      selectedMotifs,
      {
        alphabet: config.alphabet,
        strand: config.alphabet === "dna-rna" ? options.strand ?? "both" : "forward",
        allowOverlaps: options.allowOverlaps !== false,
        pwmThresholdPercent: options.pwmThresholdPercent,
        maxMatches: maxHits - rows.length,
        maxMatchedCharacters: maxOutput / 2 - matchedCharacters
      },
      context
    );
    for (const row of result.rows) {
      rowCharacters += JSON.stringify(row).length;
      matchedCharacters += row.matched_text.length;
      if (rowCharacters > maxOutput) throw new Error("Protein motif retained rows exceed 26,214,400 characters. Select fewer motifs or records.");
      rows.push(row);
    }
    analyzedRecords.push({
      title: record.title ?? "sequence",
      sequence: result.sequence,
      sequenceLength: result.sequenceLength,
      rows: result.rows
    });
    warnings.push(...result.warnings);
    notes.push(...(result.notes ?? []));
    sequenceLength += result.sequenceLength;
    charactersRemoved += result.charactersRemoved;
    context.reportProgress?.({
      phase: "scanning-records",
      progress: 0.05 + ((index + 1) / records.length) * 0.85,
      recordsProcessed: index + 1,
      totalRecords: records.length
    });
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  context.throwIfCancelled?.();
  const materialized = buildMotifScannerOutput({
    analyzedRecords,
    rows,
    selectedMotifs,
    recordsProcessed: records.length,
    sequenceLength,
    alphabet: config.alphabet,
    title: config.title,
    options,
    config,
    warnings
  });

  if (materialized.output.length > maxOutput) throw new Error("Protein motif output exceeds 26,214,400 characters. Select fewer motifs or records.");
  return makeToolResult({
    output: materialized.output,
    sequenceSearch: materialized.outputFormat === "text-map"
      ? { format: "labelled-blocks", plainMapHeadings: true, alphabet: config.alphabet }
      : undefined,
    download: {
      filename: `${config.filenameBase}.${materialized.outputFormat === "tsv" ? "tsv" : materialized.outputFormat === "svg-map" ? "svg" : materialized.viewer ? "json" : "txt"}`,
      mimeType:
        materialized.outputFormat === "tsv"
          ? "text/tab-separated-values"
          : materialized.outputFormat === "svg-map"
            ? "image/svg+xml;charset=utf-8"
            : materialized.viewer
              ? "application/json;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    notes: [...notes, ...(analyzedRecords.some(record => record.sequence.includes("*")) ? ["Stop symbols separate peptide chains; matches cannot cross them. Coordinates include retained stop positions, and terminal patterns apply to each chain."] : [])],
    recordsProcessed: records.length,
    basesProcessed: sequenceLength,
    processedUnitLabel: analyzedRecords.some(record => record.sequence.includes("*")) ? "character" : "residue",
    charactersRemoved,
    streams: {
      ...(materialized.outputFormat === "report" ? { report: makeTextStream(materialized.report, "text/plain") } : {}),
      ...(materialized.outputFormat === "text-map" ? {
        textMap: makeTextStream(materialized.textMap, "text/plain", {
          format: "labelled-blocks", plainMapHeadings: true,
          alphabet: config.alphabet
        })
      } : {}),
      ...(materialized.outputFormat === "svg-map" ? { overview: makeTextStream(materialized.svgMap, "image/svg+xml") } : {}),
      ...(materialized.viewer ? { viewer: config.alphabet === "protein" ? makeProteinViewerStream(materialized.viewer) : makeDnaViewerStream(materialized.viewer) } : {}),
      ...(materialized.outputFormat === "tsv" ? { table: makeTableStream(motifMatchTableColumns, rows, config.schema) } : {})
    },
    visual: materialized.outputFormat === "svg-map"
      ? { svg: materialized.svgMap }
      : materialized.viewer
        ? { viewer: materialized.viewer }
        : undefined
  });
}

export const runDnaRnaMotifScanner = runDnaRnaMotifScannerWorker;

export const runProteinMotifScanner = runProteinMotifScannerWorker;

export async function runDnaRnaMotifScannerWorker(input, options = {}, context = {}) {
  const optionsUsed = normalizeMotifScannerOptions(options, "dna-rna");
  const result = await runMotifScannerWorker(
    input,
    { ...options, ...optionsUsed },
    {
      alphabet: "dna-rna",
      motifs: dnaRnaMotifs,
      schema: "dna-rna-motif-scanner",
      title: "DNA/RNA motif scanner",
      filenameBase: "dna-rna-motif-scanner"
    },
    context
  );
  return { ...result, optionsUsed };
}

export async function runProteinMotifScannerWorker(input, options = {}, context = {}) {
  const optionsUsed = normalizeMotifScannerOptions(options, "protein");
  const result = await runMotifScannerWorker(
    input,
    { ...options, ...optionsUsed },
    {
      alphabet: "protein",
      motifs: proteinMotifs,
      schema: "protein-motif-scanner",
      title: "Protein motif scanner",
      filenameBase: "protein-motif-scanner"
    },
    context
  );
  return { ...result, optionsUsed };
}
