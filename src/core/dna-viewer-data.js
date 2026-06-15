import { makeViewerTrackSummary } from "./viewer-track-summary.js";

export function makeDnaViewerStream(viewer) {
  return {
    kind: "viewer",
    viewerType: "dna-sequence-viewer",
    viewer
  };
}

export function makeDnaViewerData(records, options = {}) {
  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  return {
    viewerType: "dna-sequence-viewer",
    version: 1,
    layout: options.layout === "circular" ? "circular" : "linear",
    title: options.title || "Linear DNA sequence viewer",
    alphabet,
    geneticCode: String(options.geneticCode ?? "1"),
    records: records.map((record, index) => {
      const recordLength = Number(record.length) || String(record.sequence ?? "").length;
      return {
        id: record.id || `record-${index + 1}`,
        title: record.title || `Record ${index + 1}`,
        sequence: String(record.sequence ?? "").toUpperCase(),
        length: recordLength,
        topology: record.topology === "circular" ? "circular" : "linear",
        alphabet: record.alphabet === "protein" ? "protein" : alphabet,
        hideSequenceInterpretationControls: record.hideSequenceInterpretationControls === true,
        showSecondStrandDefault: record.showSecondStrandDefault,
        showForwardTranslationsDefault: record.showForwardTranslationsDefault,
        showReverseTranslationsDefault: record.showReverseTranslationsDefault,
        compositionControls: normalizeCompositionControls(record.compositionControls ?? options.compositionControls),
        tracks: (record.tracks ?? []).map((track) => normalizeTrack(track, recordLength))
      };
    })
  };
}

function normalizeCompositionControls(value) {
  if (value?.enabled !== true) return undefined;
  const normalized = {
    enabled: true,
    showGcPercent: value.showGcPercent !== false,
    showGcSkew: value.showGcSkew !== false,
    autoWindow: value.autoWindow !== false
  };
  if (Number.isFinite(Number(value.windowSize))) {
    normalized.windowSize = Math.max(1, Math.floor(Number(value.windowSize)));
  }
  return normalized;
}

export function makeRestrictionViewerTracks(record, options = {}) {
  const tracks = [];
  const hits = (record.hits ?? [])
    .map((hit) => {
      const cutPosition = Number(hit.cut_after);
      const siteStart = Number(hit.site_start);
      const siteEnd = Number(hit.site_end);
      if (!Number.isFinite(cutPosition)) {
        return null;
      }
      return {
        position: cutPosition,
        cutPosition,
        cutAfter: cutPosition,
        start: cutPosition,
        end: cutPosition,
        siteStart: Number.isFinite(siteStart) ? siteStart : undefined,
        siteEnd: Number.isFinite(siteEnd) ? siteEnd : undefined,
        label: hit.enzyme,
        enzyme: hit.enzyme,
        recognition: hit.recognition,
        strand: hit.strand
      };
    })
    .filter(Boolean);
  if (hits.length > 0) {
    tracks.push({
      id: "restriction-sites",
      type: "restriction-sites",
      label: "Restriction sites",
      items: hits
    });
  }
  if (options.includeFragments && (record.fragments ?? []).length > 0) {
    tracks.push({
      id: "digest-fragments",
      type: "digest-fragments",
      label: "Digest fragments",
      items: record.fragments.map((fragment) => ({
        fragment: fragment.fragment,
        start: fragment.start,
        end: fragment.end,
        length: fragment.length,
        topology: fragment.topology,
        label: `${fragment.length} bp`
      }))
    });
  }
  return tracks;
}

function normalizeTrack(track, recordLength) {
  const normalized = {
    id: track.id || track.type || "track",
    type: track.type || "features",
    label: track.label || track.type || "Track",
    axisLabel: track.axisLabel,
    metric: track.metric,
    unit: track.unit,
    yMin: track.yMin,
    yMax: track.yMax,
    baseline: track.baseline,
    color: track.color,
    positiveColor: track.positiveColor,
    negativeColor: track.negativeColor,
    windowSize: track.windowSize,
    layout: track.layout,
    fixedSlotsByType: track.fixedSlotsByType || track.slotByType,
    allowFixedSlotOverlaps: track.allowFixedSlotOverlaps === true,
    featureOpacity: track.featureOpacity,
    generatedBy: track.generatedBy,
    items: Array.isArray(track.items) ? track.items : []
  };
  return {
    ...normalized,
    summary: normalized.type === "quantitative"
      ? undefined
      : track.summary && track.summary.version ? track.summary : makeViewerTrackSummary(normalized, recordLength)
  };
}
