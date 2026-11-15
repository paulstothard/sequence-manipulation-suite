import { findPatternMatches } from "./pattern.js";
import { colorForEnzyme } from "./restriction-line-map-renderer.js";
import { complementDnaRnaSequence, makeSequenceContext } from "./sequence.js";
import { renderSequenceMap } from "./sequence-map-renderer.js";

export const restrictionHitTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "enzyme", label: "Enzyme", type: "string" },
  { id: "recognition", label: "Recognition", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "site_start", label: "Site start", type: "number" },
  { id: "site_end", label: "Site end", type: "number" },
  { id: "cut_after", label: "Cut after base", type: "number" },
  { id: "overhang", label: "Overhang", type: "string" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched text", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];

export const restrictionFragmentTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "fragment", label: "Fragment", type: "number" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "topology", label: "Topology", type: "string" }
];

export const restrictionSummaryTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "enzyme", label: "Enzyme", type: "string" },
  { id: "recognition", label: "Recognition", type: "string" },
  { id: "sites", label: "Sites", type: "number" },
  { id: "cut_positions", label: "Cut positions", type: "string" },
  { id: "site_positions", label: "Site positions", type: "string" },
  { id: "fragment_sizes", label: "Fragment sizes", type: "string" },
  { id: "topology", label: "Topology", type: "string" }
];

export const restrictionMapTableColumns = [
  ...restrictionHitTableColumns,
  { id: "record_length", label: "Record length", type: "number" }
];

const RESTRICTION_SITE_LEGEND_LIMIT = 6;
const RESTRICTION_SITE_MARKER_WIDTH = 4;

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function normalizeEnzymeIds(enzymeIds, records) {
  const validIds = new Set(records.map((record) => record.id));
  const selected = String(enzymeIds ?? "common")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (selected.length === 0 || selected.includes("common") || selected.includes("all")) {
    return records.map((record) => record.id);
  }

  return selected.filter((id) => validIds.has(id));
}

function makeOrientationPatterns(enzyme) {
  const forward = enzyme.recognition.toUpperCase().replace(/[^A-Z]/g, "");
  const reverse = reverseComplement(forward);
  const patterns = [{
    strand: "+",
    pattern: forward,
    cutOffset: enzyme.cutTop,
    topOffset: enzyme.cutTop,
    bottomOffset: enzyme.cutBottom
  }];
  if (reverse !== forward) {
    patterns.push({
      strand: "-",
      pattern: reverse,
      cutOffset: forward.length - enzyme.cutBottom,
      topOffset: forward.length - enzyme.cutBottom,
      bottomOffset: forward.length - enzyme.cutTop
    });
  }
  return patterns;
}

export function getRestrictionEnzymeChoices(records) {
  return records
    .map((record) => ({ value: record.id, label: `${record.name} (${record.recognition})` }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function selectRestrictionEnzymes(records, enzymeIds) {
  const selectedIds = normalizeEnzymeIds(enzymeIds, records);
  const selected = records.filter((record) => selectedIds.includes(record.id));
  return selected.length > 0 ? selected : records;
}

export function findRestrictionSites(sequence, enzymes, context = {}, options = {}) {
  const hits = [];
  const circular = options.topology === "circular";
  const length = sequence.length;
  if (!length) return hits;
  const modulo = n => ((n % length) + length) % length;
  const circularSlice = (start, count) => Array.from({length: count}, (_, i) => sequence[modulo(start + i)]).join("");

  for (const [enzymeIndex, enzyme] of enzymes.entries()) {
    context.throwIfCancelled?.();
    for (const orientation of makeOrientationPatterns(enzyme)) {
      if (circular && orientation.pattern.length > length) continue;
      const searchSequence = circular ? sequence + sequence.slice(0, orientation.pattern.length - 1) : sequence;
      const matches = findPatternMatches(searchSequence, orientation.pattern, {
        alphabet: "dna-rna",
        patternMode: "iupac",
        caseInsensitive: true,
        allowOverlaps: true,
        ...(Number.isFinite(options.maxHits) ? { maxMatches: Math.max(0, options.maxHits - hits.length) } : {})
      }, context);

      for (const [matchIndex, match] of matches.entries()) {
        if (matchIndex > 0 && matchIndex % 4096 === 0) {
          context.throwIfCancelled?.();
        }
        if (circular && match.start > length) continue;
        const flank = Math.min(10, length);
        const sequenceContext = circular
          ? makeSequenceContext(circularSlice(match.start - 1 - flank, orientation.pattern.length + 2 * flank), flank + 1, flank + orientation.pattern.length, flank)
          : makeSequenceContext(sequence, match.start, match.end);
        const topCutAfter = match.start + orientation.topOffset - 1;
        const bottomCutAfter = match.start + orientation.bottomOffset - 1;
        if (!circular && (
          topCutAfter < 0 || topCutAfter > sequence.length ||
          bottomCutAfter < 0 || bottomCutAfter > sequence.length
        )) {
          continue;
        }
        const overhangSequence = (circular
          ? circularSlice(Math.min(topCutAfter, bottomCutAfter), Math.abs(topCutAfter - bottomCutAfter))
          : String(sequence).slice(Math.min(topCutAfter, bottomCutAfter), Math.max(topCutAfter, bottomCutAfter))).toUpperCase();
        hits.push({
          enzyme: enzyme.name,
          enzyme_id: enzyme.id,
          recognition: enzyme.recognition,
          cleavage_type: enzyme.cleavageType,
          cut_notation: enzyme.cutNotation,
          strand: orientation.strand,
          site_start: match.start,
          site_end: circular ? modulo(match.end - 1) + 1 : match.end,
          ...(circular && match.end > length ? {wraps_origin:true} : {}),
          cut_after: circular ? modulo(topCutAfter) : topCutAfter,
          complement_cut_after: circular ? modulo(bottomCutAfter) : bottomCutAfter,
          overhang: enzyme.overhang,
          overhang_sequence: overhangSequence,
          ...sequenceContext
        });
        if (Number.isFinite(options.maxHits) && hits.length > options.maxHits) {
          throw new Error(`Restriction sites exceed the ${options.maxHits.toLocaleString()}-site scan limit.`);
        }
      }
    }
    if (enzymeIndex > 0 && enzymeIndex % 25 === 0) {
      context.throwIfCancelled?.();
    }
  }

  return hits.sort((left, right) =>
    left.site_start - right.site_start ||
    left.cut_after - right.cut_after ||
    left.enzyme.localeCompare(right.enzyme)
  );
}

export function getUniqueCutPositions(hits, sequenceLength) {
  return [...new Set(
    hits
      .map((hit) => hit.cut_after)
      .filter((position) => Number.isFinite(position) && position >= 0 && position <= sequenceLength)
  )].sort((left, right) => left - right);
}

export function makeRestrictionFragments(sequenceLength, hits, topology = "linear") {
  const cutPositions = [...new Set(getUniqueCutPositions(hits, sequenceLength)
    .map((position) => topology === "circular" && position === sequenceLength ? 0 : position))]
    .sort((left, right) => left - right);
  if (topology === "circular") {
    if (cutPositions.length === 0) {
      return [{ fragment: 1, start: 1, end: sequenceLength, length: sequenceLength, topology: "circular" }];
    }
    return cutPositions.map((position, index) => {
      const next = cutPositions[(index + 1) % cutPositions.length];
      const length = index === cutPositions.length - 1 ? sequenceLength - position + next : next - position;
      return {
        fragment: index + 1,
        start: position + 1,
        end: next === 0 ? sequenceLength : next,
        length,
        topology: "circular"
      };
    });
  }

  const boundaries = [0, ...cutPositions.filter((position) => position > 0 && position < sequenceLength), sequenceLength];
  return boundaries.slice(0, -1).map((start, index) => ({
    fragment: index + 1,
    start: start + 1,
    end: boundaries[index + 1],
    length: boundaries[index + 1] - start,
    topology: "linear"
  }));
}

function restrictionCutClassName(enzyme) {
  const source = String(enzyme ?? "site").trim();
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "site";
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `restrictionCut-${slug}-${(hash >>> 0).toString(36)}`;
}

function restrictionCutInspectionText(recordTitle, hit) {
  const facts = [`${recordTitle} — ${hit.enzyme}`];
  if (hit.recognition) facts.push(`recognition ${hit.recognition}`);
  const siteStart = Number(hit.site_start);
  const siteEnd = Number(hit.site_end);
  if (Number.isFinite(siteStart) && Number.isFinite(siteEnd)) {
    facts.push(`site ${siteStart.toLocaleString()}–${siteEnd.toLocaleString()}${hit.wraps_origin ? " (wraps origin)" : ""}`);
  }
  const topCut = Number(hit.cut_after);
  const bottomCut = Number(hit.complement_cut_after);
  if (Number.isFinite(topCut)) {
    facts.push(Number.isFinite(bottomCut)
      ? `cuts after base ${topCut.toLocaleString()} (+) and ${bottomCut.toLocaleString()} (−)`
      : `cut after base ${topCut.toLocaleString()} (+)`);
  }
  return facts.join("; ");
}

export function makeRestrictionMapSvg(records, options = {}) {
  const showFragmentLabels = options.showFragmentLabels !== false;
  const siteLegendLimit = Number.isFinite(Number(options.siteLegendLimit))
    ? Math.max(0, Number(options.siteLegendLimit))
    : RESTRICTION_SITE_LEGEND_LIMIT;
  const uniqueSiteEnzymes = new Set(records.flatMap((record) =>
    (record.hits ?? []).map((hit) => String(hit.enzyme ?? "").trim()).filter(Boolean)
  ));
  const showPerEnzymeSiteLegend = uniqueSiteEnzymes.size <= siteLegendLimit;
  const cutStyles = new Map();
  const mapRecords = records.map((record) => {
    const length = Math.max(1, Number(record.length) || 1);
    const fragmentFeatures = showFragmentLabels
      ? (record.fragments ?? [])
        .filter((fragment) => fragment.length > 0)
        .map((fragment) => {
          const wraps = fragment.topology === "circular" && fragment.start > fragment.end;
          const labelFitsInside = fragment.length >= 30 || fragment.length / length >= 0.08;
          return {
            start: wraps ? 1 : fragment.start,
            end: wraps ? length : fragment.end,
            parts: wraps
              ? [
                  { start: fragment.start, end: length },
                  { start: 1, end: fragment.end }
                ]
              : [{ start: fragment.start, end: fragment.end }],
            strand: "+",
            label: wraps ? `${fragment.length} bp total` : `${fragment.length} bp`,
            className: "restrictionFragment",
            showLabel: true,
            labelPlacement: labelFitsInside ? "inside" : "external",
            compactLabel: true,
            slot: 0
          };
        })
      : [];
    const cutFeatures = (record.hits ?? [])
      .map((hit) => {
        const cutAfter = Number(hit.cut_after);
        if (!Number.isFinite(cutAfter)) {
          return null;
        }
        const cutPosition = Math.max(1, Math.min(length, cutAfter || 1));
        const color = colorForEnzyme(hit.enzyme);
        const className = restrictionCutClassName(hit.enzyme);
        if (!cutStyles.has(className)) {
          cutStyles.set(className, {
            label: `${hit.enzyme} site`,
            fill: color,
            stroke: color,
            legend: showPerEnzymeSiteLegend
          });
        }
        return {
          start: cutPosition,
          end: cutPosition,
          strand: "+",
          label: hit.enzyme,
          inspectionText: restrictionCutInspectionText(record.title, hit),
          className,
          fill: color,
          stroke: color,
          labelPlacement: "external",
          pointMarker: true,
          markerWidth: RESTRICTION_SITE_MARKER_WIDTH,
          slot: showFragmentLabels ? 1 : 0
        };
      })
      .filter(Boolean);
    const notes = [];
    if (options.topology === "circular") {
      notes.push("Circular digest fragments are computed circularly; the SVG is a linear coordinate overview.");
      if ((record.fragments ?? []).some((fragment) => fragment.topology === "circular" && fragment.start > fragment.end)) {
        notes.push("A wrap-around circular fragment is drawn as split coordinate parts representing one digest fragment.");
      }
    }
    if (record.hits?.length) {
      notes.push(`Restriction sites: ${record.hits.length.toLocaleString()}. Full coordinates are in the table or text map.`);
      if (!showPerEnzymeSiteLegend) {
        notes.push("Site marker colors are assigned by enzyme; colors may repeat when many enzymes are shown.");
      }
    } else {
      notes.push("Restriction sites: 0.");
    }
    return {
      title: record.title,
      length,
      topology: "linear",
      molecule: "dna",
      features: [...fragmentFeatures, ...cutFeatures],
      notes
    };
  });
  return renderSequenceMap({
    title: options.title || "Restriction map",
    records: mapRecords,
    styles: {
      restrictionFragment: { label: "Digest fragment", fill: "#bae6fd", stroke: "#0284c7" },
      ...Object.fromEntries(cutStyles)
    }
  });
}

export function makeRestrictionLineMapSvg(records, options = {}) {
  return makeRestrictionMapSvg(records.map((record) => ({
    title: record.title,
    length: record.length,
    hits: record.hits,
    fragments: []
  })), {
    ...options,
    title: options.title || "Restriction single-line map",
    showFragmentLabels: false
  });
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
