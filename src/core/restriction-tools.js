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

export const COMMON_DNA_LADDER_BP = [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 750, 500, 250, 100];

const COMMON_DNA_LADDER_MASS_NG = new Map([
  // NEB 1 kb DNA Ladder N3232/N0468 lists the 3,001 bp band as the high-intensity
  // reference band at 125 ng for a 0.5 ug lane; most other bands are about 33-50 ng.
  [10000, 42],
  [8000, 42],
  [6000, 50],
  [5000, 42],
  [4000, 33],
  [3000, 125],
  [2000, 48],
  [1500, 36],
  [1000, 42],
  [750, 30],
  [500, 42],
  [250, 22],
  [100, 16]
]);
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
  const patterns = [{ strand: "+", pattern: forward, cutOffset: enzyme.cutTop }];
  if (reverse !== forward) {
    patterns.push({
      strand: "-",
      pattern: reverse,
      cutOffset: forward.length - enzyme.cutBottom
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

export function findRestrictionSites(sequence, enzymes, context = {}) {
  const hits = [];

  for (const [enzymeIndex, enzyme] of enzymes.entries()) {
    context.throwIfCancelled?.();
    for (const orientation of makeOrientationPatterns(enzyme)) {
      const matches = findPatternMatches(sequence, orientation.pattern, {
        alphabet: "dna-rna",
        patternMode: "iupac",
        caseInsensitive: true,
        allowOverlaps: true
      }, context);

      for (const [matchIndex, match] of matches.entries()) {
        if (matchIndex > 0 && matchIndex % 4096 === 0) {
          context.throwIfCancelled?.();
        }
        const sequenceContext = makeSequenceContext(sequence, match.start, match.end);
        hits.push({
          enzyme: enzyme.name,
          enzyme_id: enzyme.id,
          recognition: enzyme.recognition,
          strand: orientation.strand,
          site_start: match.start,
          site_end: match.end,
          cut_after: match.start + orientation.cutOffset - 1,
          overhang: enzyme.overhang,
          ...sequenceContext
        });
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
  const cutPositions = getUniqueCutPositions(hits, sequenceLength);
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
        end: next,
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

function estimateTextWidth(text, characterWidth = 7.5) {
  return String(text ?? "").length * characterWidth;
}

function truncateTextToWidth(text, maxWidth, characterWidth = 7) {
  const source = String(text ?? "");
  const maxCharacters = Math.max(4, Math.floor(maxWidth / characterWidth));
  if (source.length <= maxCharacters) {
    return source;
  }
  return `${source.slice(0, maxCharacters - 3)}...`;
}

function makeStableFraction(seed) {
  let hash = 2166136261;
  for (const character of String(seed ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function deterministicRange(seed, min, max) {
  return min + makeStableFraction(seed) * (max - min);
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

export function makeRestrictionGelSvg(records, options = {}) {
  const title = options.title || "Simulated restriction digest gel";
  const subtitle = options.subtitle || "Uncut plasmids are modeled as mixed conformations; restriction digests are modeled primarily as linear fragments.";
  const note = options.note || "Qualitative schematic gel: apparent-size migration, mass-scaled intensity, merged overlapping bands.";
  const laneCount = records.length + 1;
  const ladderLabelGutter = 74;
  const margin = { top: 96, right: 30, bottom: 54, left: 58 };
  const width = Math.max(720, margin.left + margin.right + ladderLabelGutter + laneCount * 110);
  const laneAreaLeft = margin.left + ladderLabelGutter;
  const laneWidth = (width - laneAreaLeft - margin.right) / laneCount;
  const gelWidth = width;
  const gelHeight = 430;
  const height = margin.top + gelHeight + margin.bottom;
  const laneCenter = (index) => laneAreaLeft + laneWidth * index + laneWidth / 2;
  const minBp = 80;
  const bandComponentsForRecord = (record) => {
    const length = Math.max(1, record.length);
    const isCircular = options.topology === "circular";
    const isUncutCircular = isCircular && (record.hits ?? []).length === 0;
    const component = (name, abundanceRange, apparentRange, trueMassMultiplier, type, scale = 1) => ({
      apparentSize: length * deterministicRange(`${record.title}:${name}:apparent`, apparentRange[0], apparentRange[1]),
      trueMass: length * trueMassMultiplier,
      abundance: deterministicRange(`${record.title}:${name}:abundance`, abundanceRange[0], abundanceRange[1]) * scale,
      type,
      name
    });
    if (isUncutCircular) {
      return [
        component("supercoiled", [0.75, 0.90], [0.55, 0.75], 1, "supercoiled"),
        component("open-circular", [0.08, 0.20], [1.6, 2.8], 1, "open"),
        component("linear", [0.01, 0.08], [0.96, 1.04], 1, "linear"),
        component("supercoiled-dimer", [0.01, 0.05], [1.1, 1.5], 2, "supercoiled"),
        component("open-circular-dimer", [0, 0.03], [3, 5], 2, "open")
      ];
    }
    const fragments = record.fragments?.length
      ? record.fragments
      : options.emptyFragmentsAsNoBand
        ? []
        : [{ length, topology: options.topology ?? "linear" }];
    const components = fragments
      .filter((fragment) => fragment.length > 0)
      .map((fragment) => ({
        apparentSize: fragment.length,
        trueMass: fragment.length,
        abundance: 1,
        type: "linear"
      }));
    if (isCircular && (record.hits ?? []).length > 0) {
      components.push(
        component("residual-supercoiled", [0, 0.20], [0.55, 0.75], 1, "supercoiled"),
        component("residual-open-circular", [0, 0.10], [1.6, 2.8], 1, "open")
      );
    }
    return components;
  };
  const allComponents = records.flatMap((record) => bandComponentsForRecord(record));
  const maxBp = Math.max(
    12000,
    ...COMMON_DNA_LADDER_BP,
    ...allComponents.map((component) => component.apparentSize)
  );
  const logMin = Math.log10(minBp);
  const logMax = Math.log10(maxBp);
  const yForSize = (size) => {
    const clamped = Math.max(minBp, Math.min(maxBp, size));
    const fraction = (logMax - Math.log10(clamped)) / Math.max(0.1, logMax - logMin);
    return margin.top + 18 + fraction * (gelHeight - 38);
  };
  const mergeLaneBands = (components) => {
    const sorted = components
      .map((component) => ({
        ...component,
        y: yForSize(component.apparentSize),
        mass: component.trueMass * component.abundance
      }))
      .sort((left, right) => left.y - right.y);
    const merged = [];
    for (const component of sorted) {
      const previous = merged.at(-1);
      if (previous && Math.abs(previous.y - component.y) <= 5) {
        const totalMass = previous.mass + component.mass;
        previous.y = (previous.y * previous.mass + component.y * component.mass) / totalMass;
        previous.mass = totalMass;
        previous.types.add(component.type);
      } else {
        const jitter = deterministicRange(`${component.name ?? component.type}:${component.apparentSize}:gel-jitter`, -1.5, 1.5);
        merged.push({ y: component.y + jitter, mass: component.mass, types: new Set([component.type]) });
      }
    }
    const maxMass = Math.max(1, ...merged.map((band) => band.mass));
    return merged.map((band) => ({
      ...band,
      relativeMass: band.mass / maxMass
    }));
  };
  const ladderMassForSize = (size) => COMMON_DNA_LADDER_MASS_NG.get(size) ?? 30;
  const bandWidthForSize = (size) => Math.max(30, Math.min(54, 34 + Math.log10(Math.max(100, size)) * 3.2));
  const pushGelBand = (parts, {
    x,
    y,
    width: bandWidth,
    height: bandHeight,
    signal,
    className = "band",
    coreClassName = "band-core",
    haloClassName = "band-halo",
    open = false
  }) => {
    const clampedSignal = Math.max(0, Math.min(1, signal));
    const haloOpacity = Math.min(0.72, 0.08 + clampedSignal * 0.58);
    const bodyOpacity = Math.min(0.98, 0.22 + clampedSignal * 0.76);
    const coreOpacity = Math.max(0, (clampedSignal - 0.58) / 0.42) * 0.9;
    const haloHeight = bandHeight * (open ? 2.7 : 2.15);
    const haloWidth = bandWidth + (open ? 10 : 7);
    parts.push(`<rect class="${haloClassName}" x="${(x - haloWidth / 2).toFixed(1)}" y="${(y - haloHeight / 2).toFixed(1)}" width="${haloWidth.toFixed(1)}" height="${haloHeight.toFixed(1)}" rx="${(haloHeight / 2).toFixed(1)}" opacity="${haloOpacity.toFixed(2)}"/>`);
    parts.push(`<rect class="${className}" x="${(x - bandWidth / 2).toFixed(1)}" y="${(y - bandHeight / 2).toFixed(1)}" width="${bandWidth.toFixed(1)}" height="${bandHeight.toFixed(1)}" rx="${(bandHeight / 2).toFixed(1)}" opacity="${bodyOpacity.toFixed(2)}"/>`);
    if (coreOpacity > 0.02) {
      const coreHeight = Math.max(1.2, bandHeight * 0.42);
      const coreWidth = bandWidth * 0.82;
      parts.push(`<rect class="${coreClassName}" x="${(x - coreWidth / 2).toFixed(1)}" y="${(y - coreHeight / 2).toFixed(1)}" width="${coreWidth.toFixed(1)}" height="${coreHeight.toFixed(1)}" rx="${(coreHeight / 2).toFixed(1)}" opacity="${coreOpacity.toFixed(2)}"/>`);
    }
  };
  const sampleBandWidth = Math.max(34, Math.min(56, laneWidth * 0.42));
  const placeLadderLabels = (sizes) => {
    const labelHeight = 11;
    const gap = 2;
    const x = laneAreaLeft - 12;
    return sizes.map((size) => {
      const y = yForSize(size) + 3;
      const textWidth = estimateTextWidth(size.toLocaleString(), 5.8);
      return {
        size,
        x,
        y,
        box: { left: x - textWidth, right: x, top: y - labelHeight + gap, bottom: y + gap }
      };
    });
  };
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    "<defs>",
    '<filter id="bandBlur" x="-30%" y="-95%" width="160%" height="290%"><feGaussianBlur stdDeviation="1.35"/></filter>',
    '<filter id="bandHaloBlur" x="-60%" y="-220%" width="220%" height="540%"><feGaussianBlur stdDeviation="4.2"/></filter>',
    '<filter id="openBandBlur" x="-45%" y="-150%" width="190%" height="400%"><feGaussianBlur stdDeviation="2.7"/></filter>',
    '<linearGradient id="gelBackground" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#101c35"/><stop offset="0.55" stop-color="#172a4c"/><stop offset="1" stop-color="#203862"/></linearGradient>',
    '<radialGradient id="wellGlow" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#4b6f9e" stop-opacity="0.45"/><stop offset="1" stop-color="#14233e" stop-opacity="0"/></radialGradient>',
    "</defs>",
    "<style>",
    ".title{font:700 18px system-ui,sans-serif;fill:#18202a}",
    ".subtitle{font:12px system-ui,sans-serif;fill:#53616d}",
    ".lane-label{font:600 11px system-ui,sans-serif;fill:#24313d;text-anchor:middle}",
    ".size-label{font:10px system-ui,sans-serif;fill:#d7e8ff;text-anchor:end}",
    ".gel-note{font:11px system-ui,sans-serif;fill:#53616d}",
    ".band-halo{fill:#89dfff;filter:url(#bandHaloBlur)}",
    ".band-core{fill:#ffffff;filter:url(#bandBlur)}",
    ".band{fill:#c9efff;filter:url(#bandBlur)}",
    ".band-open{filter:url(#openBandBlur)}",
    ".ladder-band{fill:#e7f8ff;filter:url(#bandBlur)}",
    ".ladder-core{fill:#ffffff;filter:url(#bandBlur)}",
    ".gel-speckle{fill:#a7dfff;opacity:0.035}",
    "</style>",
    `<rect x="0" y="0" width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="24" y="34">${escapeXml(title)}</text>`,
    `<text class="subtitle" x="24" y="54">${escapeXml(subtitle)}</text>`,
    `<rect x="${margin.left}" y="${margin.top}" width="${gelWidth - margin.left - margin.right}" height="${gelHeight}" rx="8" fill="url(#gelBackground)"/>`,
    `<rect x="${margin.left}" y="${margin.top}" width="${gelWidth - margin.left - margin.right}" height="${gelHeight}" rx="8" fill="url(#wellGlow)" opacity="0.65"/>`,
    `<rect class="gel-speckle" x="${margin.left + 8}" y="${margin.top + 30}" width="${gelWidth - margin.left - margin.right - 16}" height="${gelHeight - 46}" rx="6"/>`
  ];

  for (let index = 0; index < laneCount; index += 1) {
    const center = laneCenter(index);
    parts.push(`<rect x="${(center - 24).toFixed(1)}" y="${margin.top + 8}" width="48" height="16" rx="4" fill="#091426" opacity="0.72"/>`);
    parts.push(`<line x1="${center.toFixed(1)}" y1="${margin.top + 26}" x2="${center.toFixed(1)}" y2="${margin.top + gelHeight - 10}" stroke="#d8ecff" stroke-opacity="0.022" stroke-width="54"/>`);
  }

  parts.push(`<text class="lane-label" x="${laneCenter(0)}" y="${margin.top - 14}">Ladder</text>`);
  const ladderLabels = placeLadderLabels(COMMON_DNA_LADDER_BP);
  const maxLadderMass = Math.max(...COMMON_DNA_LADDER_BP.map((size) => ladderMassForSize(size)));
  COMMON_DNA_LADDER_BP.forEach((size) => {
    const y = yForSize(size);
    const signal = Math.pow(ladderMassForSize(size) / maxLadderMass, 0.55);
    const bandHeight = 2.6 + signal * 1.9;
    pushGelBand(parts, {
      x: laneCenter(0),
      y,
      width: bandWidthForSize(size),
      height: bandHeight,
      signal,
      className: "ladder-band",
      coreClassName: "ladder-core"
    });
  });
  for (const label of ladderLabels) {
    parts.push(`<text class="size-label" x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" data-label-left="${label.box.left.toFixed(1)}" data-label-right="${label.box.right.toFixed(1)}">${label.size.toLocaleString()}</text>`);
  }

  records.forEach((record, recordIndex) => {
    const laneIndex = recordIndex + 1;
    const center = laneCenter(laneIndex);
    const label = truncateTextToWidth(record.title, laneWidth - 8, 6.2);
    parts.push(`<text class="lane-label" x="${center.toFixed(1)}" y="${margin.top - 14}" data-full-title="${escapeXml(record.title)}">${escapeXml(label)}</text>`);
    const bands = mergeLaneBands(bandComponentsForRecord(record));
    for (const band of bands) {
      const isOpen = band.types.has("open");
      const isSupercoiled = band.types.has("supercoiled") && !isOpen;
      const massSignal = Math.pow(band.relativeMass, 0.55);
      const baseHeight = isOpen ? 7.2 : isSupercoiled ? 2.7 : 3.5;
      const bandHeight = baseHeight * (0.82 + massSignal * 0.52);
      const bandWidth = isOpen ? sampleBandWidth * 1.08 : isSupercoiled ? sampleBandWidth * 0.74 : sampleBandWidth * 0.92;
      const className = isOpen ? "band band-open" : "band";
      pushGelBand(parts, {
        x: center,
        y: band.y,
        width: bandWidth,
        height: bandHeight,
        signal: massSignal,
        className,
        open: isOpen
      });
    }
  });

  parts.push(`<text class="gel-note" x="24" y="${height - 20}">${escapeXml(note)}</text>`);
  parts.push("</svg>");
  return parts.join("");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
