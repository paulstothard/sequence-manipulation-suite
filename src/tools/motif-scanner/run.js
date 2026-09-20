import { parseSequenceInput } from "../../core/fasta.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { iterateFastaFixedWindowSegments } from "../../core/fasta-fixed-window-segments.js";
import {
  motifMatchTableColumns,
  scanMotifRecords,
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

const DETAILED_REPORT_MATCH_THRESHOLD = 2000;
const MAX_STREAMED_MOTIF_BASES = 50_000_000;
const MAX_MOTIF_WORK = 200_000_000;
const MAX_STREAMED_MOTIF_HITS = 50_000;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = 25 * 1024 * 1024;
export const MOTIF_TEXT_MAP_MATCH_THRESHOLD = 5000;
export const MOTIF_SVG_MAP_MATCH_THRESHOLD = 120;
export const MOTIF_SVG_RECORD_MATCH_THRESHOLD = 30;
export const MOTIF_SVG_LABEL_MATCH_THRESHOLD = 48;
export const MOTIF_SVG_RECORD_LABEL_THRESHOLD = 12;

function getSelectedMotifs(motifs, options = {}) {
  const motifDatabase = options.motifDatabase ?? "sms3-curated";
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

function formatScore(value) {
  return value === null || value === undefined ? "" : String(value);
}

function makeTsv(rows) {
  const columns = motifMatchTableColumns.map((column) => column.id);
  return [
    columns.join("\t"),
    ...rows.map((row) =>
      [
        row.record,
        row.motif_id,
        row.motif_name,
        row.motif_class,
        row.source,
        row.syntax,
        row.strand,
        row.start,
        row.end,
        row.length,
        row.left_context,
        row.matched_text,
        row.right_context,
        row.context_sequence,
        formatScore(row.score),
        row.description
      ].join("\t")
    )
  ].join("\n");
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

function makeReport({ title, rows, selectedMotifs, recordsProcessed, residuesProcessed, alphabet, options = {}, summarizeMatches = false }) {
  const lines = [
    title,
    `Motif records scanned: ${selectedMotifs.length}`,
    `Motif syntax counts: ${getSyntaxSummary(selectedMotifs)}`,
    "Matching policy: exact/IUPAC/regex motifs are matched directly; PWM/PSSM motifs are scored by relative PWM score. Spacing models, profile HMMs, structural context, and functional annotation are not applied.",
    `Sequences scanned: ${recordsProcessed}`,
    `${alphabet === "protein" ? "Residues" : "Bases"} scanned: ${residuesProcessed}`,
    `Matches found: ${rows.length}`,
    `Database: ${motifProvenance.dataset} ${motifProvenance.version}`,
    `Database note: ${motifProvenance.description}`,
    ""
  ];

  const pwmCount = selectedMotifs.filter((motif) => motif.syntax === "pwm").length;
  if (pwmCount > 0) {
    lines.push(`PWM/PSSM threshold: ${Number(options.pwmThresholdPercent ?? 85)}% relative score`);
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

  lines.push("record\tmotif\tclass\tstrand\tstart\tend\tmatched_text\tcontext_sequence");
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
        row.context_sequence
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
  return renderTextAnnotationMapFromItems(rowsByRecord(analyzedRecords).map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.rows.flatMap((row, index) => {
      if (remaining <= 0) {
        return [];
      }
      remaining -= 1;
      return [{ ...row, label: `m${index + 1}` }];
    })
  })), {
    width: 60,
    alphabet: config.alphabet,
    showSecondStrand: config.alphabet === "dna-rna"
  });
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
      length: record.sequenceLength,
      topology: "linear",
      molecule: config.alphabet === "protein" ? "protein" : "dna",
      features,
      notes: record.rows.length > 0
        ? [`Motif matches: ${record.rows.length.toLocaleString()} total; ${features.length.toLocaleString()} shown in map; ${hiddenMatches.toLocaleString()} omitted. Full coordinates are in the table.`]
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

function getOutputFormat(options, config) {
  if (isInteractiveViewerFormat(options.outputFormat, config)) {
    return options.outputFormat;
  }
  if (options.outputFormat === "text-map" || options.outputFormat === "svg-map") {
    return options.outputFormat;
  }
  return options.outputFormat === "tsv" ? "tsv" : "report";
}

function buildMotifScannerOutput({ analyzedRecords, rows, selectedMotifs, recordsProcessed, sequenceLength, alphabet, title, options, config, warnings }) {
  const outputFormat = getOutputFormat(options, config);
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
  const report = makeReport({
    title,
    rows,
    selectedMotifs,
    recordsProcessed,
    residuesProcessed: sequenceLength,
    alphabet,
    options,
    summarizeMatches: outputFormat === "report" && totalMatches > DETAILED_REPORT_MATCH_THRESHOLD
  });
  const tsv = makeTsv(rows);
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

function runMotifScanner(input, options = {}, config) {
  const records = parseSequenceInput(input, config.alphabet);
  const selectedMotifs = getSelectedMotifs(config.motifs, options);
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: [`No ${config.alphabet === "protein" ? "protein" : "DNA/RNA"} sequence input was provided.`],
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel: config.alphabet === "protein" ? "residue" : "base",
      charactersRemoved: 0,
      streams: {
        table: makeTableStream(motifMatchTableColumns, [], config.schema)
      }
    });
  }

  if (selectedMotifs.length === 0) {
    warnings.push("No bundled motif records matched the selected filters.");
  }

  const rows = [];
  const analyzedRecords = [];
  let sequenceLength = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    const result = scanMotifRecords(record, selectedMotifs, {
      alphabet: config.alphabet,
      strand: config.alphabet === "dna-rna" ? options.strand ?? "both" : "forward",
      allowOverlaps: options.allowOverlaps !== false,
      pwmThresholdPercent: options.pwmThresholdPercent
    });
    rows.push(...result.rows);
    analyzedRecords.push({
      title: record.title ?? "sequence",
      sequence: result.sequence,
      sequenceLength: result.sequenceLength,
      rows: result.rows
    });
    warnings.push(...result.warnings);
    sequenceLength += result.sequenceLength;
    charactersRemoved += result.charactersRemoved;
  }

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

  return makeToolResult({
    output: materialized.output,
    sequenceSearch: materialized.outputFormat === "text-map"
      ? { format: "labelled-blocks", alphabet: config.alphabet }
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
    recordsProcessed: records.length,
    basesProcessed: sequenceLength,
    processedUnitLabel: config.alphabet === "protein" ? "residue" : "base",
    charactersRemoved,
    streams: {
      report: makeTextStream(materialized.report, "text/plain"),
      ...(materialized.outputFormat === "text-map" ? {
        textMap: makeTextStream(materialized.textMap, "text/plain", {
          format: "labelled-blocks",
          alphabet: config.alphabet
        })
      } : {}),
      ...(materialized.outputFormat === "svg-map" ? { overview: makeTextStream(materialized.svgMap, "image/svg+xml") } : {}),
      ...(materialized.viewer ? { viewer: config.alphabet === "protein" ? makeProteinViewerStream(materialized.viewer) : makeDnaViewerStream(materialized.viewer) } : {}),
      table: makeTableStream(motifMatchTableColumns, rows, config.schema)
    },
    visual: materialized.outputFormat === "svg-map"
      ? { svg: materialized.svgMap }
      : materialized.viewer
        ? { viewer: materialized.viewer }
        : undefined
  });
}

async function runStreamedDnaRnaMotifScanner(input, options, config, context) {
  const selectedMotifs = getSelectedMotifs(config.motifs, options);
  if (selectedMotifs.some((motif) => motif.syntax === "regex")) {
    throw new Error("Large FASTA motif scans support fixed-width exact, IUPAC, and PWM motifs. Regex motifs require bounded pasted input.");
  }
  const outputFormat = getOutputFormat(options, config);
  if (!["report", "tsv", "svg-map"].includes(outputFormat)) {
    throw new Error("Large FASTA motif scans support report, table, and linear map output. Text maps and sequence viewers require bounded pasted input.");
  }
  const widths = selectedMotifs.map((motif) => motif.syntax === "pwm" ? motif.pwm?.weights?.length ?? 0 : motif.pattern?.length ?? 0);
  const maxWidth = Math.max(1, ...widths);
  if (maxWidth > 32_000) throw new Error("Selected motif exceeds the 32,000-base fixed-window scan limit.");
  const workPerBase = selectedMotifs.reduce((sum, motif, index) => sum + widths[index] * (options.strand === "forward" || motif.match?.strand !== "both" ? 1 : 2), 0);
  const opened = await openCleanDnaRnaFastaSource(input, {
    ...options,
    maxSourceBases: Math.min(MAX_STREAMED_MOTIF_BASES, Number(options.maxSourceBases) || MAX_STREAMED_MOTIF_BASES)
  }, context);
  const analyzedRecords = [];
  const warnings = [];
  const motifOrder = new Map(selectedMotifs.map((motif, index) => [motif.id, index]));
  let current = null;
  let work = 0;
  let candidateHits = 0;
  let retainedRowCharacters = 0;
  let sequenceLength = 0;
  let charactersRemoved = 0;
  for await (const event of iterateFastaFixedWindowSegments(opened.events(), { maxWindowLength: maxWidth + 20 })) {
    if (event.type === "record-start") {
      current = { title: event.title ?? "sequence", sequence: "", sequenceLength: 0, rows: [] };
      continue;
    }
    if (event.type === "scan-segment") {
      work += (event.ownedEnd0 - event.ownedStart0) * workPerBase;
      if (work > MAX_MOTIF_WORK) throw new Error(`Motif scan exceeds the ${MAX_MOTIF_WORK.toLocaleString()}-symbol scoring budget. Choose fewer motifs, one strand, or fewer records.`);
      if (selectedMotifs.length) {
        const scanned = await scanMotifRecordsWithContext({ title: current.title, sequence: event.text }, selectedMotifs, {
          alphabet: "dna-rna", strand: options.strand ?? "both", allowOverlaps: true,
          pwmThresholdPercent: options.pwmThresholdPercent,
          maxMatches: MAX_STREAMED_MOTIF_HITS, failOnLimit: true
        }, context);
        for (const row of scanned.rows) {
          const start0 = event.segmentStart0 + row.start - 1;
          if (start0 < event.ownedStart0 || start0 >= event.ownedEnd0) continue;
          const retained = { ...row, start: start0 + 1, end: event.segmentStart0 + row.end };
          retainedRowCharacters += JSON.stringify(retained).length;
          if (retainedRowCharacters > MAX_MATERIALIZED_OUTPUT_CHARACTERS) throw new Error("Motif hit table exceeds the 25 MiB materialized-output limit. Choose fewer motifs or records.");
          current.rows.push(retained);
          candidateHits += 1;
          if (candidateHits > MAX_STREAMED_MOTIF_HITS) throw new Error(`Motif scan exceeds the ${MAX_STREAMED_MOTIF_HITS.toLocaleString()}-candidate-hit limit. Raise the PWM threshold or choose fewer motifs.`);
        }
        warnings.push(...scanned.warnings);
      }
      await context.yieldIfNeeded?.();
      continue;
    }
    if (event.type === "record-end" && current) {
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
  if (!analyzedRecords.length) return makeToolResult({ output: "", warnings: [opened.source.stats.inputProvided ? "No DNA/RNA records were found." : "No DNA/RNA sequence input was provided.", ...warnings], recordsProcessed: 0, basesProcessed: 0, charactersRemoved: 0, streams: { table: makeTableStream(motifMatchTableColumns, [], config.schema) } });
  if (!selectedMotifs.length) warnings.push("No bundled motif records matched the selected filters.");
  const rows = analyzedRecords.flatMap((record) => record.rows);
  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  const materialized = buildMotifScannerOutput({ analyzedRecords, rows, selectedMotifs, recordsProcessed: analyzedRecords.length, sequenceLength, alphabet: "dna-rna", title: config.title, options, config, warnings });
  if (Math.max(materialized.output.length, materialized.report.length) > MAX_MATERIALIZED_OUTPUT_CHARACTERS) throw new Error("Motif output exceeds the 25 MiB materialized-output limit. Choose fewer motifs or records.");
  return makeToolResult({
    output: materialized.output,
    download: { filename: `${config.filenameBase}.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : "txt"}`, mimeType: outputFormat === "tsv" ? "text/tab-separated-values" : outputFormat === "svg-map" ? "image/svg+xml;charset=utf-8" : "text/plain;charset=utf-8" },
    warnings, recordsProcessed: analyzedRecords.length, basesProcessed: sequenceLength, charactersRemoved,
    streams: {
      report: makeTextStream(materialized.report, "text/plain"),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(materialized.svgMap, "image/svg+xml") } : {}),
      table: makeTableStream(motifMatchTableColumns, rows, config.schema)
    },
    visual: outputFormat === "svg-map" ? { svg: materialized.svgMap } : undefined
  });
}

async function runMotifScannerWorker(input, options = {}, config, context = {}) {
  const largeSource = config.alphabet === "dna-rna" && Boolean(
    options.loadedFastaFile?.stream || ["indexed", "bgzf"].includes(options.sourceMode) || String(input ?? "").length > 1_000_000
  );
  if (largeSource) return runStreamedDnaRnaMotifScanner(input, options, config, context);
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, config.alphabet);
  const selectedMotifs = getSelectedMotifs(config.motifs, options);
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: [`No ${config.alphabet === "protein" ? "protein" : "DNA/RNA"} sequence input was provided.`],
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel: config.alphabet === "protein" ? "residue" : "base",
      charactersRemoved: 0,
      streams: {
        table: makeTableStream(motifMatchTableColumns, [], config.schema)
      }
    });
  }

  if (selectedMotifs.length === 0) {
    warnings.push("No bundled motif records matched the selected filters.");
  }

  const rows = [];
  const analyzedRecords = [];
  let sequenceLength = 0;
  let charactersRemoved = 0;

  for (const [index, record] of records.entries()) {
    await context.yieldIfNeeded?.();
    const result = await scanMotifRecordsWithContext(
      record,
      selectedMotifs,
      {
        alphabet: config.alphabet,
        strand: config.alphabet === "dna-rna" ? options.strand ?? "both" : "forward",
        allowOverlaps: options.allowOverlaps !== false,
        pwmThresholdPercent: options.pwmThresholdPercent
      },
      context
    );
    rows.push(...result.rows);
    analyzedRecords.push({
      title: record.title ?? "sequence",
      sequence: result.sequence,
      sequenceLength: result.sequenceLength,
      rows: result.rows
    });
    warnings.push(...result.warnings);
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

  return makeToolResult({
    output: materialized.output,
    sequenceSearch: materialized.outputFormat === "text-map"
      ? { format: "labelled-blocks", alphabet: config.alphabet }
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
    recordsProcessed: records.length,
    basesProcessed: sequenceLength,
    processedUnitLabel: config.alphabet === "protein" ? "residue" : "base",
    charactersRemoved,
    streams: {
      report: makeTextStream(materialized.report, "text/plain"),
      ...(materialized.outputFormat === "text-map" ? {
        textMap: makeTextStream(materialized.textMap, "text/plain", {
          format: "labelled-blocks",
          alphabet: config.alphabet
        })
      } : {}),
      ...(materialized.outputFormat === "svg-map" ? { overview: makeTextStream(materialized.svgMap, "image/svg+xml") } : {}),
      ...(materialized.viewer ? { viewer: config.alphabet === "protein" ? makeProteinViewerStream(materialized.viewer) : makeDnaViewerStream(materialized.viewer) } : {}),
      table: makeTableStream(motifMatchTableColumns, rows, config.schema)
    },
    visual: materialized.outputFormat === "svg-map"
      ? { svg: materialized.svgMap }
      : materialized.viewer
        ? { viewer: materialized.viewer }
        : undefined
  });
}

export function runDnaRnaMotifScanner(input, options = {}) {
  return runMotifScanner(input, options, {
    alphabet: "dna-rna",
    motifs: dnaRnaMotifs,
    schema: "dna-rna-motif-scanner",
    title: "DNA/RNA motif scanner",
    filenameBase: "dna-rna-motif-scanner"
  });
}

export function runProteinMotifScanner(input, options = {}) {
  return runMotifScanner(input, options, {
    alphabet: "protein",
    motifs: proteinMotifs,
    schema: "protein-motif-scanner",
    title: "Protein motif scanner",
    filenameBase: "protein-motif-scanner"
  });
}

export async function runDnaRnaMotifScannerWorker(input, options = {}, context = {}) {
  return runMotifScannerWorker(
    input,
    options,
    {
      alphabet: "dna-rna",
      motifs: dnaRnaMotifs,
      schema: "dna-rna-motif-scanner",
      title: "DNA/RNA motif scanner",
      filenameBase: "dna-rna-motif-scanner"
    },
    context
  );
}

export async function runProteinMotifScannerWorker(input, options = {}, context = {}) {
  return runMotifScannerWorker(
    input,
    options,
    {
      alphabet: "protein",
      motifs: proteinMotifs,
      schema: "protein-motif-scanner",
      title: "Protein motif scanner",
      filenameBase: "protein-motif-scanner"
    },
    context
  );
}
