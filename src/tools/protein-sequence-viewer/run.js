import { parseSequenceInput } from "../../core/fasta.js";
import {
  flatfileRecordsToSequenceRecords,
  parseFlatfileRecords
} from "../../core/flatfile-records.js";
import { makeProteinViewerData, makeProteinViewerStream } from "../../core/protein-viewer-data.js";
import { cleanProteinSequence } from "../../core/sequence.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

function looksLikeFlatfileInput(input) {
  const text = String(input ?? "").trim();
  return /^LOCUS\s/m.test(text) || (/^ID\s/m.test(text) && /^SQ\s/m.test(text));
}

function shortText(value, maxLength = 36) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function getProteinFeatureLabel(feature) {
  const detail = feature.product || feature.gene || feature.locus_tag || feature.protein_id;
  return detail ? `${feature.feature} ${shortText(detail)}` : feature.feature;
}

function makeFeatureItems(record) {
  return (record.features ?? [])
    .filter((feature) =>
      feature.parsedLocation?.supported &&
      Number.isFinite(Number(feature.parsedLocation.start)) &&
      Number.isFinite(Number(feature.parsedLocation.end))
    )
    .map((feature) => ({
      start: Number(feature.parsedLocation.start),
      end: Number(feature.parsedLocation.end),
      label: getProteinFeatureLabel(feature),
      name: feature.gene || feature.locus_tag || feature.product || feature.protein_id || feature.feature,
      type: feature.feature,
      location: feature.location
    }));
}

function countTrackItems(record) {
  return (record.tracks ?? []).reduce((sum, track) => sum + (track.items?.length ?? 0), 0);
}

function makeProteinViewerSummaryReport(records, metrics) {
  const featureCount = records.reduce((sum, record) => sum + countTrackItems(record), 0);
  const lines = [
    "Protein sequence viewer summary report",
    "",
    `Records: ${records.length.toLocaleString()}`,
    `Residues: ${metrics.basesProcessed.toLocaleString()}`,
    `Feature track items: ${featureCount.toLocaleString()}`
  ];

  if (metrics.charactersRemoved > 0) {
    lines.push(`Characters removed during cleanup: ${metrics.charactersRemoved.toLocaleString()}`);
  }

  lines.push("", "Record details");
  for (const record of records) {
    const trackCount = (record.tracks ?? []).length;
    const trackItems = countTrackItems(record);
    lines.push(`- ${record.title}: ${record.length.toLocaleString()} residues; ${trackCount.toLocaleString()} track(s); ${trackItems.toLocaleString()} feature item(s)`);
  }

  return lines.join("\n");
}

function makeFlatfileViewerRecords(parsed) {
  const proteinFlatfileRecords = parsed.records.filter((record) => record.molecule === "protein" && record.sequence);
  if (proteinFlatfileRecords.length > 0) {
    return proteinFlatfileRecords.map((record) => {
      const items = makeFeatureItems(record);
      return {
        title: record.accession,
        sequence: record.sequence,
        length: record.sequence.length,
        tracks: items.length > 0
          ? [{
              id: "protein-features",
              type: "features",
              label: "Protein features",
              items
            }]
          : []
      };
    });
  }

  return flatfileRecordsToSequenceRecords(parsed.records, "protein").map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.sequence.length,
    tracks: []
  }));
}

function parseProteinViewerInput(input, warnings) {
  if (!looksLikeFlatfileInput(input)) {
    return parseSequenceInput(input, "sequence");
  }

  const parsed = parseFlatfileRecords(input);
  warnings.push(...parsed.warnings);
  const records = makeFlatfileViewerRecords(parsed);
  if (records.length === 0) {
    warnings.push("No protein sequence was found in the flatfile input.");
  }
  return records;
}

export async function runProteinSequenceViewer(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const warnings = [];
  const sequenceRecords = parseProteinViewerInput(input, warnings);
  let basesProcessed = 0;
  let charactersRemoved = 0;

  const records = [];
  for (const [recordIndex, record] of sequenceRecords.entries()) {
    context.throwIfCancelled?.();
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-protein character(s).`);
    }
    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }
    records.push({
      title: record.title,
      sequence: cleaned.sequence,
      length: cleaned.sequence.length,
      tracks: record.tracks ?? []
    });
    context.reportProgress?.({
      phase: "preparing-records",
      progress: 0.1 + ((recordIndex + 1) / Math.max(1, sequenceRecords.length)) * 0.65,
      record: record.title,
      currentRecord: recordIndex + 1,
      totalRecords: sequenceRecords.length
    });
    await context.yieldIfNeeded?.();
  }

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No protein sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel: "residue",
      charactersRemoved: 0
    });
  }

  if (options.outputFormat === "report") {
    context.reportProgress?.({ phase: "building-output", progress: 0.85 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();

    const output = makeProteinViewerSummaryReport(records, {
      basesProcessed,
      charactersRemoved
    });
    context.reportProgress?.({ phase: "finished", progress: 1 });
    return makeToolResult({
      output,
      download: {
        filename: "protein-sequence-viewer-report.txt",
        mimeType: "text/plain;charset=utf-8"
      },
      warnings,
      recordsProcessed: records.length,
      basesProcessed,
      processedUnitLabel: "residue",
      charactersRemoved,
      streams: {
        report: makeTextStream(output, "text/plain")
      }
    });
  }

  const viewer = makeProteinViewerData(records, {
    title: "Protein sequence viewer"
  });
  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const output = JSON.stringify(viewer, null, 2);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: "protein-sequence-viewer.json",
      mimeType: "application/json;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    processedUnitLabel: "residue",
    charactersRemoved,
    streams: {
      viewer: makeProteinViewerStream(viewer)
    },
    visual: { viewer }
  });
}

export const proteinSequenceViewerRunner = runProteinSequenceViewer;
