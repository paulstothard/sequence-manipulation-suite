import { parseSequenceInput, formatFastaRecord } from "./fasta.js";
import {
  makeBiologicalRecordViewerRecords,
  parseBiologicalRecordInput
} from "./biological-record-format-converter.js";
import { parseFlatfileRecords } from "./flatfile-records.js";
import { getGeneticCode } from "./genetic-code.js";
import { makeDnaViewerData, makeDnaViewerStream, makeRestrictionViewerTracks } from "./dna-viewer-data.js";
import { findRestrictionSites, selectRestrictionEnzymes } from "./restriction-tools.js";
import { complementDnaRnaSequence, cleanDnaRnaSequence, getDnaRnaStats } from "./sequence.js";
import { restrictionEnzymeRecords } from "../reference-data/restriction-enzymes/records.js";

export const sequenceEditorSummaryColumns = [
  { id: "record", label: "Record" },
  { id: "title", label: "Title" },
  { id: "length", label: "Length" },
  { id: "gc_percent", label: "GC percent" },
  { id: "ambiguous_bases", label: "Ambiguous bases" },
  { id: "annotated_features", label: "Annotated features" },
  { id: "restriction_sites", label: "Restriction sites" },
  { id: "characters_removed", label: "Characters removed" }
];

const DEFAULT_EDITOR_RESTRICTION_SCAN_LIMIT = 250000;

function getRestrictionScanLimit(options = {}) {
  const value = Number.parseInt(options.maxRestrictionScanBases, 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EDITOR_RESTRICTION_SCAN_LIMIT;
}

function getEditorRestrictionEnzymes(options = {}) {
  if (Array.isArray(options.restrictionEnzymes)) {
    return options.restrictionEnzymes;
  }
  return selectRestrictionEnzymes(restrictionEnzymeRecords, options.restrictionEnzymeIds ?? "common");
}

function looksLikeAnnotatedDnaRecord(input) {
  const text = String(input ?? "");
  return /^(LOCUS|ID)\s/m.test(text) || /\nFEATURES\s+Location\/Qualifiers\n/.test(text);
}

function featureLabel(feature) {
  return feature.gene || feature.locus_tag || feature.protein_id || feature.product || feature.feature || "feature";
}

function featureParts(feature) {
  return (feature.parsedLocation?.ranges ?? []).map((range) => ({
    start: Math.min(range.start, range.end),
    end: Math.max(range.start, range.end),
    strand: range.strand || feature.parsedLocation?.strand || "."
  }));
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isAnnotatedFeatureTrack(track) {
  return track?.id === "annotated-features" || track?.type === "features";
}

function cloneFeatureTracks(tracks = []) {
  return cloneJson((tracks ?? []).filter(isAnnotatedFeatureTrack)) ?? [];
}

function countFeatureTrackItems(tracks = []) {
  return (tracks ?? []).reduce((sum, track) => sum + (Array.isArray(track.items) ? track.items.length : 0), 0);
}

export function makeSequenceEditorFeatureTrackOverrides(records = []) {
  return (records ?? [])
    .map((record, index) => {
      const featureTracks = cloneFeatureTracks(record.featureTracks ?? record.tracks ?? []);
      return {
        record: index + 1,
        title: record.title,
        length: Number(record.length) || String(record.sequence ?? "").length,
        featureTracks,
        annotatedFeatureCount: countFeatureTrackItems(featureTracks)
      };
    })
    .filter((record) => record.featureTracks.length > 0);
}

function applyFeatureTrackOverrides(records, overrides = []) {
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return records;
  }
  const byTitle = new Map(overrides.filter((override) => override?.title).map((override) => [String(override.title), override]));
  return records.map((record, index) => {
    const override = byTitle.get(String(record.title)) || overrides[index];
    const featureTracks = cloneFeatureTracks(override?.featureTracks);
    if (featureTracks.length === 0) {
      return record;
    }
    return {
      ...record,
      featureTracks,
      annotatedFeatureCount: override.annotatedFeatureCount ?? countFeatureTrackItems(featureTracks)
    };
  });
}

function makeAnnotatedFeatureTrack(record) {
  const items = (record.features ?? [])
    .filter((feature) => feature.feature !== "source" && feature.parsedLocation?.supported && feature.parsedLocation.start && feature.parsedLocation.end)
    .map((feature) => ({
      start: feature.parsedLocation.start,
      end: feature.parsedLocation.end,
      strand: feature.parsedLocation.strand,
      parts: featureParts(feature),
      label: featureLabel(feature),
      type: feature.feature,
      gene: feature.gene,
      locus_tag: feature.locus_tag,
      product: feature.product
    }));
  return items.length > 0
    ? [{
        id: "annotated-features",
        type: "features",
        label: "Annotated features",
        layout: "stacked",
        featureOpacity: 0.76,
        fixedSlotsByType: true,
        allowFixedSlotOverlaps: true,
        items
      }]
    : [];
}

function parseEditorInputRecords(input, fallbackTitle, warnings = [], options = {}) {
  const requestedInputFormat = String(options.inputFormat ?? "").toLowerCase();
  const pairedFormat = ["gff3-fasta", "gtf-fasta", "bed-fasta"].includes(requestedInputFormat) ||
    /^##FASTA\s*$/m.test(String(input ?? ""));
  if (pairedFormat) {
    const parsed = parseBiologicalRecordInput(input, { inputFormat: requestedInputFormat || "auto" });
    const nucleotideRecords = parsed.records.filter((record) => record.sequence && record.molecule !== "protein");
    if (nucleotideRecords.length > 0) {
      const viewerRecords = makeBiologicalRecordViewerRecords(nucleotideRecords);
      warnings.push(...parsed.warnings);
      const featureCount = viewerRecords.reduce((sum, record) =>
        sum + countFeatureTrackItems(record.tracks), 0);
      if (featureCount > 0) {
        warnings.push(`Parsed ${featureCount.toLocaleString()} annotated feature(s) from ${parsed.sourceFormat} input for the editor viewer. Coordinate edits shift, clip, or flag displayed feature coordinates where possible; exported FASTA does not preserve annotation rows.`);
      }
      return viewerRecords.map((record, index) => {
        const cleaned = cleanDnaRnaSequence(record.sequence, {
          preserveCase: false,
          keepGaps: false
        });
        const title = record.title || `${fallbackTitle}_${index + 1}`;
        if (cleaned.removedCount > 0) {
          warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
        }
        return {
          title,
          sequence: cleaned.sequence.replaceAll("U", "T"),
          sourceFormat: parsed.sourceFormat,
          topology: record.topology,
          featureTracks: cloneFeatureTracks(record.tracks),
          annotatedFeatureCount: countFeatureTrackItems(record.tracks),
          charactersRemoved: cleaned.removedCount
        };
      }).filter((record) => record.sequence.length > 0);
    }
    warnings.push(...parsed.warnings);
  }

  if (looksLikeAnnotatedDnaRecord(input)) {
    const parsed = parseFlatfileRecords(input);
    const records = parsed.records
      .filter((record) => record.sequence && record.molecule !== "protein")
      .map((record, index) => {
        const featureTracks = makeAnnotatedFeatureTrack(record);
        const cleaned = cleanDnaRnaSequence(record.sequence, {
          preserveCase: false,
          keepGaps: false
        });
        const title = record.accession || record.title || `${fallbackTitle}_${index + 1}`;
        if (cleaned.removedCount > 0) {
          warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
        }
        return {
          title,
          sequence: cleaned.sequence.replaceAll("U", "T"),
          sourceFormat: record.format,
          topology: record.topology,
          featureTracks,
          annotatedFeatureCount: featureTracks[0]?.items.length ?? 0,
          charactersRemoved: cleaned.removedCount
        };
      })
      .filter((record) => record.sequence.length > 0);
    if (records.length > 0) {
      warnings.push(...parsed.warnings);
      const featureCount = records.reduce((sum, record) => sum + record.annotatedFeatureCount, 0);
      if (featureCount > 0) {
        warnings.push(`Parsed ${featureCount.toLocaleString()} annotated feature(s) from flatfile input for the editor viewer. Coordinate edits shift, clip, or flag displayed feature coordinates where possible; exported FASTA does not preserve flatfile annotation records.`);
      }
      return records;
    }
  }

  return parseSequenceInput(input, fallbackTitle).map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    const title = record.title || `${fallbackTitle}_${index + 1}`;
    if (cleaned.removedCount > 0) {
      warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    return {
      title,
      sequence: cleaned.sequence,
      featureTracks: [],
      annotatedFeatureCount: 0,
      charactersRemoved: cleaned.removedCount
    };
  });
}

function scanEditorRestrictionSites(sequence, options = {}) {
  if (options.showRestrictionSites === false) {
    return {
      hits: [],
      skipped: false,
      reason: "disabled"
    };
  }
  const normalized = String(sequence ?? "").toUpperCase();
  const limit = getRestrictionScanLimit(options);
  if (normalized.length > limit) {
    return {
      hits: [],
      skipped: true,
      reason: `sequence length ${normalized.length.toLocaleString()} exceeds live restriction-site scan limit ${limit.toLocaleString()}`
    };
  }
  return {
    hits: findRestrictionSites(normalized, getEditorRestrictionEnzymes(options), options.context),
    skipped: false,
    reason: ""
  };
}

function countRestrictionSitesByEnzyme(sequence, options = {}) {
  const scan = scanEditorRestrictionSites(sequence, options);
  const counts = new Map();
  for (const hit of scan.hits) {
    const enzymeId = hit.enzyme_id || hit.enzyme;
    const existing = counts.get(enzymeId) || { id: enzymeId, name: hit.enzyme, count: 0 };
    existing.count += 1;
    counts.set(enzymeId, existing);
  }
  return { ...scan, counts };
}

function summarizeRestrictionSiteCountChanges(beforeSequence, afterSequence, options = {}) {
  if (options.showRestrictionSites === false) {
    return null;
  }
  const before = countRestrictionSitesByEnzyme(beforeSequence, options);
  const after = countRestrictionSitesByEnzyme(afterSequence, options);
  if (before.skipped || after.skipped) {
    return {
      skipped: true,
      changed: false,
      summary: `Restriction-site count changes were not calculated because ${before.reason || after.reason}.`
    };
  }

  const enzymeNames = new Map(getEditorRestrictionEnzymes(options).map((enzyme) => [enzyme.id, enzyme.name]));
  const enzymeIds = new Set([...before.counts.keys(), ...after.counts.keys()]);
  const changes = [...enzymeIds].map((id) => {
    const beforeCount = before.counts.get(id)?.count || 0;
    const afterCount = after.counts.get(id)?.count || 0;
    return {
      id,
      name: enzymeNames.get(id) || before.counts.get(id)?.name || after.counts.get(id)?.name || id,
      before: beforeCount,
      after: afterCount,
      delta: afterCount - beforeCount
    };
  }).filter((change) => change.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.name.localeCompare(right.name));

  if (changes.length === 0) {
    return {
      skipped: false,
      changed: false,
      changes,
      summary: "Selected restriction-site counts are unchanged."
    };
  }

  const shown = changes.slice(0, 8).map((change) => `${change.name} ${change.before}->${change.after}`).join(", ");
  const omitted = changes.length > 8 ? `; ${changes.length - 8} more enzyme(s) changed` : "";
  return {
    skipped: false,
    changed: true,
    changes,
    summary: `Restriction-site counts changed: ${shown}${omitted}.`
  };
}

export function prepareSequenceEditorData(input, options = {}) {
  const fallbackTitle = options.fallbackTitle || "edited_sequence";
  const viewerLayout = options.viewerLayout === "circular" ? "circular" : "linear";
  const warnings = [];
  const records = applyFeatureTrackOverrides(parseEditorInputRecords(input, fallbackTitle, warnings, options), options.featureTrackOverrides);
  const cleanedRecords = [];
  const rows = [];
  let charactersRemoved = 0;
  let basesProcessed = 0;

  records.forEach((record, index) => {
    charactersRemoved += record.charactersRemoved ?? 0;
    basesProcessed += record.sequence.length;
    if (record.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }
    const stats = getDnaRnaStats(record.sequence);
    const title = record.title || `${fallbackTitle}_${index + 1}`;
    const restrictionScan = scanEditorRestrictionSites(record.sequence, options);
    if (restrictionScan.skipped) {
      warnings.push(`${title}: live restriction-site track skipped because ${restrictionScan.reason}.`);
    }
    const tracks = [
      ...(record.featureTracks ?? []),
      ...makeRestrictionViewerTracks({ hits: restrictionScan.hits })
    ];
    cleanedRecords.push({
      id: `edited-record-${index + 1}`,
      title,
      sequence: record.sequence,
      length: record.sequence.length,
      topology: viewerLayout,
      tracks
    });
    rows.push({
      record: index + 1,
      title,
      length: record.sequence.length,
      gc_percent: stats.length > 0 ? stats.gcPercent.toFixed(2) : "",
      ambiguous_bases: stats.ambiguityCount,
      annotated_features: record.annotatedFeatureCount ?? 0,
      restriction_sites: restrictionScan.skipped ? "" : restrictionScan.hits.length,
      characters_removed: record.charactersRemoved ?? 0
    });
  });

  const nonemptyRecords = cleanedRecords.filter((record) => record.sequence.length > 0);
  const viewer = nonemptyRecords.length > 0
    ? makeDnaViewerData(nonemptyRecords, {
      title: "Sequence editor",
      layout: viewerLayout,
      geneticCode: options.geneticCode || "1"
    })
    : null;
  const fasta = nonemptyRecords
    .map((record) => formatFastaRecord(record.title, record.sequence, options.lineWidth || 60).trimEnd())
    .join("\n");
  const report = formatSequenceEditorReport({
    rows,
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved
  });

  return {
    records: nonemptyRecords,
    rows,
    warnings,
    basesProcessed,
    charactersRemoved,
    recordsProcessed: records.length,
    fasta,
    report,
    viewer,
    viewerStream: viewer ? makeDnaViewerStream(viewer) : null
  };
}

export function formatSequenceEditorReport(result) {
  const lines = [
    "Sequence Editor summary",
    `Records parsed: ${result.recordsProcessed}`,
    `Bases retained: ${result.basesProcessed}`,
    `Characters removed: ${result.charactersRemoved}`,
    ""
  ];

  if (result.rows.length > 0) {
    lines.push("Records:");
    for (const row of result.rows) {
      const gc = row.gc_percent === "" ? "n/a" : `${row.gc_percent}% GC`;
      const restrictionText = row.restriction_sites === ""
        ? ", restriction sites not scanned"
        : `, ${row.restriction_sites} selected restriction site(s)`;
      lines.push(`- ${row.title}: ${row.length} bp, ${gc}, ${row.ambiguous_bases} ambiguous base(s)${restrictionText}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push("Warnings: none");
  }

  return lines.join("\n");
}

function cleanComparableRecords(input, fallbackTitle = "edited_sequence") {
  return parseEditorInputRecords(input, fallbackTitle, []).map((record) => ({
    title: record.title,
    sequence: record.sequence
  })).filter((record) => record.sequence.length > 0);
}

function cleanEditableRecords(input, fallbackTitle = "edited_sequence", warnings = [], options = {}) {
  return applyFeatureTrackOverrides(parseEditorInputRecords(input, fallbackTitle, warnings), options.featureTrackOverrides).map((record) => ({
    title: record.title,
    sequence: record.sequence,
    featureTracks: cloneFeatureTracks(record.featureTracks),
    annotatedFeatureCount: record.annotatedFeatureCount ?? countFeatureTrackItems(record.featureTracks)
  }));
}

function clampCoordinate(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function reverseComplementCleanSequence(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function normalizeFeaturePart(part, fallbackStrand = ".") {
  const start = Number.parseInt(part?.start, 10);
  const end = Number.parseInt(part?.end, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    strand: part?.strand || fallbackStrand || "."
  };
}

function featureItemParts(item) {
  const rawParts = Array.isArray(item.parts) && item.parts.length > 0
    ? item.parts
    : [{ start: item.start, end: item.end, strand: item.strand }];
  return rawParts.map((part) => normalizeFeaturePart(part, item.strand)).filter(Boolean);
}

function invertStrand(strand) {
  if (strand === "+") return "-";
  if (strand === "-") return "+";
  return strand || ".";
}

function featureStatusPriority(status) {
  return {
    unchanged: 0,
    shifted: 1,
    affected: 2,
    stale: 3,
    removed: 4
  }[status] ?? 0;
}

function combineFeatureStatuses(statuses) {
  return statuses.reduce((best, status) =>
    featureStatusPriority(status) > featureStatusPriority(best) ? status : best,
  "unchanged");
}

function featureStatusText(status, operation) {
  if (status === "shifted") return "Shifted after coordinate edit";
  if (status === "affected") return "Affected by coordinate edit";
  if (status === "stale") return operation === "reverse-complement-range"
    ? "Stale: overlaps a partially reverse-complemented region"
    : "Stale: overlaps an edit that may invalidate annotation semantics";
  if (status === "removed") return "Removed by coordinate edit";
  return "";
}

function sumPartLength(parts) {
  return (parts ?? []).reduce((sum, part) => sum + Math.max(0, Number(part.end) - Number(part.start) + 1), 0);
}

function remapFeaturePart(part, edit) {
  const start = Number(part.start);
  const end = Number(part.end);
  if (edit.operation === "insert-after") {
    if (end <= edit.insertAfter) {
      return { parts: [{ ...part }], status: "unchanged" };
    }
    if (start > edit.insertAfter) {
      return {
        parts: [{ ...part, start: start + edit.insertedLength, end: end + edit.insertedLength }],
        status: "shifted"
      };
    }
    return {
      parts: [{ ...part, start, end: end + edit.insertedLength }],
      status: "affected"
    };
  }

  if (edit.operation === "reverse-complement-range") {
    if (end < edit.start || start > edit.end) {
      return { parts: [{ ...part }], status: "unchanged" };
    }
    if (start >= edit.start && end <= edit.end) {
      return {
        parts: [{
          ...part,
          start: edit.start + (edit.end - end),
          end: edit.start + (edit.end - start),
          strand: invertStrand(part.strand)
        }],
        status: "affected"
      };
    }
    return {
      parts: [{ ...part }],
      status: "stale"
    };
  }

  const delta = edit.insertedLength - edit.removedLength;
  if (end < edit.start) {
    return { parts: [{ ...part }], status: "unchanged" };
  }
  if (start > edit.end) {
    return {
      parts: [{ ...part, start: start + delta, end: end + delta }],
      status: "shifted"
    };
  }

  if (edit.operation === "replace-range" && edit.insertedLength > 0) {
    const newStart = start < edit.start ? start : edit.start;
    const newEnd = end > edit.end ? end + delta : edit.start + edit.insertedLength - 1;
    if (newEnd < newStart) {
      return { parts: [], status: "removed" };
    }
    return {
      parts: [{ ...part, start: newStart, end: newEnd }],
      status: "affected"
    };
  }

  if (start < edit.start && end > edit.end) {
    return {
      parts: [{ ...part, start, end: end - edit.removedLength }],
      status: "affected"
    };
  }
  const pieces = [];
  if (start < edit.start) {
    pieces.push({ ...part, start, end: edit.start - 1 });
  }
  if (end > edit.end) {
    pieces.push({ ...part, start: edit.start, end: end - edit.removedLength });
  }
  return {
    parts: pieces.filter((piece) => piece.end >= piece.start),
    status: pieces.length > 0 ? "affected" : "removed"
  };
}

function remapFeatureItemForEdit(item, edit) {
  const originalParts = featureItemParts(item);
  if (originalParts.length === 0) {
    return {
      item: null,
      update: {
        label: item.label || item.name || item.type || "feature",
        type: item.type || item.featureType || "feature",
        status: "removed",
        note: "Feature had no supported editable coordinates."
      }
    };
  }
  const mapped = originalParts.map((part) => remapFeaturePart(part, edit));
  const parts = mapped.flatMap((result) => result.parts);
  const status = combineFeatureStatuses(mapped.map((result) => result.status));
  const label = item.label || item.name || item.type || "feature";
  const type = item.type || item.featureType || "feature";
  const originalStart = Math.min(...originalParts.map((part) => part.start));
  const originalEnd = Math.max(...originalParts.map((part) => part.end));
  if (parts.length === 0 || status === "removed") {
    return {
      item: null,
      update: {
        label,
        type,
        originalStart,
        originalEnd,
        status: "removed",
        note: "Feature was fully removed by the coordinate edit."
      }
    };
  }

  const sortedParts = parts
    .map((part) => ({ ...part }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const newStart = Math.min(...sortedParts.map((part) => part.start));
  const newEnd = Math.max(...sortedParts.map((part) => part.end));
  const partStrands = new Set(sortedParts.map((part) => part.strand).filter(Boolean));
  const updated = {
    ...item,
    start: newStart,
    end: newEnd,
    strand: partStrands.size === 1 ? sortedParts[0].strand : item.strand,
    parts: sortedParts,
    length: sumPartLength(sortedParts)
  };
  if (status !== "unchanged") {
    updated.status = featureStatusText(status, edit.operation);
    updated.editStatus = status;
    updated.editEffect = updated.status;
    updated.originalStart = originalStart;
    updated.originalEnd = originalEnd;
  }
  return {
    item: updated,
    update: status === "unchanged"
      ? null
      : {
          label,
          type,
          originalStart,
          originalEnd,
          start: newStart,
          end: newEnd,
          status,
          note: featureStatusText(status, edit.operation)
        }
  };
}

function remapFeatureTracksForEdit(featureTracks = [], edit) {
  const updates = [];
  const tracks = cloneFeatureTracks(featureTracks).map((track) => {
    if (!isAnnotatedFeatureTrack(track)) {
      return track;
    }
    const remappedItems = [];
    for (const item of track.items ?? []) {
      const remapped = remapFeatureItemForEdit(item, edit);
      if (remapped.item) {
        remappedItems.push(remapped.item);
      }
      if (remapped.update) {
        updates.push({
          track: track.label || track.id || "Annotated features",
          ...remapped.update
        });
      }
    }
    return {
      ...track,
      items: remappedItems
    };
  });
  return { featureTracks: tracks, updates };
}

function summarizeFeatureUpdates(updates = []) {
  if (updates.length === 0) {
    return null;
  }
  const counts = updates.reduce((map, update) => {
    map.set(update.status, (map.get(update.status) || 0) + 1);
    return map;
  }, new Map());
  return [...counts.entries()]
    .sort((left, right) => featureStatusPriority(right[0]) - featureStatusPriority(left[0]))
    .map(([status, count]) => `${count.toLocaleString()} ${status}`)
    .join(", ");
}

export function applySequenceEditorCoordinateEdit(input, options = {}) {
  const warnings = [];
  const fallbackTitle = options.fallbackTitle || "edited_sequence";
  const lineWidth = Math.min(120, Math.max(20, Number.parseInt(options.lineWidth, 10) || 60));
  const records = cleanEditableRecords(input, fallbackTitle, warnings, options);
  if (records.length === 0) {
    return {
      records: [],
      fasta: "",
      warnings: ["No DNA/RNA records were available to edit."],
      edit: {
        applied: false,
        summary: "No edit was applied because no sequence was available."
      }
    };
  }

  const operation = ["insert-after", "delete-range", "replace-range", "reverse-complement-range"].includes(options.operation)
    ? options.operation
    : "insert-after";
  const requestedRecord = Math.max(1, Number.parseInt(options.recordNumber, 10) || 1);
  const recordNumber = clampCoordinate(requestedRecord, 1, records.length, 1);
  if (recordNumber !== requestedRecord) {
    warnings.push(`Record number was clipped to ${recordNumber}.`);
  }

  const record = records[recordNumber - 1];
  const original = record.sequence;
  const editSequenceCleaned = cleanDnaRnaSequence(options.editSequence || "", {
    preserveCase: false,
    keepGaps: false
  });
  if (editSequenceCleaned.removedCount > 0) {
    warnings.push(`Edit sequence: removed ${editSequenceCleaned.removedCount} non-DNA/RNA character(s).`);
  }

  let edited = original;
  let summary = "";
  let start = 0;
  let end = 0;
  let inserted = "";
  let removed = "";
  let applied = true;
  let featureUpdates = [];

  if (operation === "insert-after") {
    const requestedInsertAfter = Number.parseInt(options.insertAfter ?? options.start, 10) || 0;
    const insertAfter = clampCoordinate(requestedInsertAfter, 0, original.length, 0);
    if (insertAfter !== requestedInsertAfter) {
      warnings.push(`Insert-after coordinate was clipped to ${insertAfter}.`);
    }
    inserted = editSequenceCleaned.sequence;
    if (!inserted) {
      warnings.push("No valid DNA/RNA edit sequence was provided; no insertion was made.");
      applied = false;
    } else {
      edited = `${original.slice(0, insertAfter)}${inserted}${original.slice(insertAfter)}`;
      start = insertAfter + 1;
      end = insertAfter + inserted.length;
      summary = `Inserted ${inserted.length.toLocaleString()} bp after base ${insertAfter.toLocaleString()} in record ${recordNumber}.`;
    }
  } else {
    const requestedStart = Number.parseInt(options.start, 10) || 1;
    start = clampCoordinate(requestedStart, 1, Math.max(1, original.length), 1);
    const requestedEnd = Number.parseInt(options.end, 10) || start;
    end = clampCoordinate(requestedEnd, start, Math.max(start, original.length), start);
    if (start !== requestedStart || end !== requestedEnd) {
      warnings.push(`Edit range was clipped to ${start}-${end}.`);
    }
    removed = original.slice(start - 1, end);
    if (operation === "delete-range") {
      edited = `${original.slice(0, start - 1)}${original.slice(end)}`;
      summary = `Deleted ${removed.length.toLocaleString()} bp at ${start.toLocaleString()}-${end.toLocaleString()} in record ${recordNumber}.`;
    } else if (operation === "replace-range") {
      inserted = editSequenceCleaned.sequence;
      if (!inserted) {
        warnings.push("No valid DNA/RNA edit sequence was provided; no replacement was made.");
        applied = false;
      } else {
        edited = `${original.slice(0, start - 1)}${inserted}${original.slice(end)}`;
        summary = `Replaced ${removed.length.toLocaleString()} bp at ${start.toLocaleString()}-${end.toLocaleString()} with ${inserted.length.toLocaleString()} bp in record ${recordNumber}.`;
      }
    } else {
      inserted = reverseComplementCleanSequence(removed);
      edited = `${original.slice(0, start - 1)}${inserted}${original.slice(end)}`;
      summary = `Reverse-complemented ${removed.length.toLocaleString()} bp at ${start.toLocaleString()}-${end.toLocaleString()} in record ${recordNumber}.`;
    }
  }

  if (applied) {
    record.sequence = edited;
    if ((record.featureTracks ?? []).length > 0) {
      const remapped = remapFeatureTracksForEdit(record.featureTracks, {
        operation,
        start,
        end,
        insertAfter: operation === "insert-after" ? start - 1 : start - 1,
        insertedLength: inserted.length,
        removedLength: removed.length,
        lengthDelta: edited.length - original.length
      });
      record.featureTracks = remapped.featureTracks;
      record.annotatedFeatureCount = countFeatureTrackItems(record.featureTracks);
      featureUpdates = remapped.updates;
      const featureUpdateSummary = summarizeFeatureUpdates(featureUpdates);
      if (featureUpdateSummary) {
        warnings.push(`${record.title}: annotated feature coordinates updated after edit (${featureUpdateSummary}). Click affected features in the viewer to inspect their status.`);
      }
    }
  } else {
    summary = "No edit was applied.";
  }

  return {
    records,
    fasta: records.map((item) => formatFastaRecord(item.title, item.sequence, lineWidth).trimEnd()).join("\n"),
    warnings,
    featureUpdates,
    edit: {
      applied,
      operation,
      recordNumber,
      title: record.title,
      start,
      end,
      insertedLength: inserted.length,
      removedLength: removed.length,
      lengthDelta: edited.length - original.length,
      affectedFeatureCount: featureUpdates.length,
      featureUpdateSummary: summarizeFeatureUpdates(featureUpdates),
      summary
    }
  };
}

function summarizeSingleContiguousEdit(beforeSequence, afterSequence) {
  const before = String(beforeSequence ?? "");
  const after = String(afterSequence ?? "");
  if (before === after) {
    return {
      type: "unchanged",
      start: 0,
      beforeEnd: 0,
      afterEnd: 0,
      removedLength: 0,
      insertedLength: 0,
      lengthDelta: 0,
      summary: "No sequence changes relative to the baseline."
    };
  }

  let prefixLength = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefixLength < maxPrefix && before[prefixLength] === after[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength &&
    suffixLength < after.length - prefixLength &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const removed = before.slice(prefixLength, before.length - suffixLength);
  const inserted = after.slice(prefixLength, after.length - suffixLength);
  const start = prefixLength + 1;
  const beforeEnd = removed.length > 0 ? prefixLength + removed.length : prefixLength;
  const afterEnd = inserted.length > 0 ? prefixLength + inserted.length : prefixLength;
  const lengthDelta = after.length - before.length;
  let type = "replacement";
  if (removed.length === 0) {
    type = "insertion";
  } else if (inserted.length === 0) {
    type = "deletion";
  } else if (removed.length === inserted.length) {
    type = "substitution";
  }

  const changePhrase = type === "insertion"
    ? `inserted ${inserted.length.toLocaleString()} bp after base ${prefixLength.toLocaleString()}`
    : type === "deletion"
      ? `deleted ${removed.length.toLocaleString()} bp at ${start.toLocaleString()}-${beforeEnd.toLocaleString()}`
      : type === "substitution"
        ? `substituted ${removed.length.toLocaleString()} bp at ${start.toLocaleString()}-${beforeEnd.toLocaleString()}`
        : `replaced ${removed.length.toLocaleString()} bp at ${start.toLocaleString()}-${beforeEnd.toLocaleString()} with ${inserted.length.toLocaleString()} bp`;

  const shortenChangedSegment = (segment) => {
    if (!segment) return "|";
    if (segment.length <= 48) return segment;
    return `${segment.slice(0, 22)}...${segment.slice(-22)}`;
  };
  const flank = 16;
  const beforePreviewStart = Math.max(0, prefixLength - flank);
  const beforePreviewEnd = Math.min(before.length, before.length - suffixLength + flank);
  const afterPreviewStart = Math.max(0, prefixLength - flank);
  const afterPreviewEnd = Math.min(after.length, after.length - suffixLength + flank);
  const beforePreview = `${before.slice(beforePreviewStart, prefixLength).toLowerCase()}${shortenChangedSegment(removed)}${before.slice(before.length - suffixLength, beforePreviewEnd).toLowerCase()}`;
  const afterPreview = `${after.slice(afterPreviewStart, prefixLength).toLowerCase()}${shortenChangedSegment(inserted)}${after.slice(after.length - suffixLength, afterPreviewEnd).toLowerCase()}`;
  const frameImpact = lengthDelta === 0
    ? "No length change; reading frame length is unchanged for coding regions that span the edit."
    : Math.abs(lengthDelta) % 3 === 0
      ? `Length changed by ${lengthDelta > 0 ? "+" : ""}${lengthDelta.toLocaleString()} bp, which is divisible by 3. A coding region spanning the edit may stay in frame, but codons at the junction still need inspection.`
      : `Length changed by ${lengthDelta > 0 ? "+" : ""}${lengthDelta.toLocaleString()} bp, which is not divisible by 3. Any coding region spanning the edit would shift reading frame.`;

  return {
    type,
    start,
    beforeEnd,
    afterEnd,
    removedLength: removed.length,
    insertedLength: inserted.length,
    lengthDelta,
    removed,
    inserted,
    beforePreview,
    afterPreview,
    frameImpact,
    summary: `${changePhrase}; length ${before.length.toLocaleString()} -> ${after.length.toLocaleString()} bp (${lengthDelta > 0 ? "+" : ""}${lengthDelta.toLocaleString()}).`
  };
}

export function summarizeSequenceEditorChanges(baselineInput, currentInput, options = {}) {
  const baselineRecords = cleanComparableRecords(baselineInput, options.fallbackTitle || "edited_sequence");
  const currentRecords = cleanComparableRecords(currentInput, options.fallbackTitle || "edited_sequence");
  const baselineBases = baselineRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  const currentBases = currentRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  const code = getGeneticCode(options.geneticCode || "1");
  const changes = [];
  const recordCount = Math.max(baselineRecords.length, currentRecords.length);

  for (let index = 0; index < recordCount; index += 1) {
    const baseline = baselineRecords[index] || null;
    const current = currentRecords[index] || null;
    if (!baseline && current) {
      changes.push({
        record: index + 1,
        title: current.title,
        type: "record-added",
        summary: `Added record ${current.title} (${current.sequence.length.toLocaleString()} bp).`,
        lengthDelta: current.sequence.length,
        frameImpact: current.sequence.length % 3 === 0
          ? "Added record length is divisible by 3."
          : "Added record length is not divisible by 3."
      });
      continue;
    }
    if (baseline && !current) {
      changes.push({
        record: index + 1,
        title: baseline.title,
        type: "record-removed",
        summary: `Removed record ${baseline.title} (${baseline.sequence.length.toLocaleString()} bp).`,
        lengthDelta: -baseline.sequence.length,
        frameImpact: "Removed record; coding-frame impact depends on how this record was used."
      });
      continue;
    }
    const edit = summarizeSingleContiguousEdit(baseline.sequence, current.sequence);
    if (baseline.title !== current.title && edit.type === "unchanged") {
      changes.push({
        record: index + 1,
        title: current.title,
        type: "title-change",
        summary: `Renamed record ${baseline.title} to ${current.title}; sequence unchanged.`,
        lengthDelta: 0,
        frameImpact: "No sequence length change."
      });
      continue;
    }
    if (edit.type !== "unchanged") {
      const restrictionImpact = summarizeRestrictionSiteCountChanges(baseline.sequence, current.sequence, options);
      changes.push({
        record: index + 1,
        title: current.title,
        ...edit,
        restrictionImpact
      });
    }
  }

  const firstChange = changes[0] || null;
  const headline = changes.length === 0
    ? "No sequence changes relative to the baseline."
    : changes.length === 1
      ? firstChange.summary
      : `${changes.length.toLocaleString()} record(s) changed; total length ${baselineBases.toLocaleString()} -> ${currentBases.toLocaleString()} bp (${currentBases - baselineBases > 0 ? "+" : ""}${(currentBases - baselineBases).toLocaleString()}).`;

  return {
    baselineRecords: baselineRecords.length,
    currentRecords: currentRecords.length,
    baselineBases,
    currentBases,
    lengthDelta: currentBases - baselineBases,
    changedRecords: changes.length,
    geneticCode: code.id,
    geneticCodeName: code.name,
    headline,
    firstChange,
    changes
  };
}

export function makeSequenceEditorReverseComplementFasta(input, options = {}) {
  const records = parseSequenceInput(input, options.fallbackTitle || "edited_sequence");
  const lineWidth = options.lineWidth || 60;
  return records
    .map((record, index) => {
      const cleaned = cleanDnaRnaSequence(record.sequence, {
        preserveCase: false,
        keepGaps: false
      }).sequence;
      const reversed = reverseComplementCleanSequence(cleaned);
      const title = `${record.title || `record_${index + 1}`} reverse complement`;
      return formatFastaRecord(title, reversed, lineWidth).trimEnd();
    })
    .join("\n");
}
