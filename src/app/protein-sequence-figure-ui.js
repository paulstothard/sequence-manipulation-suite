import { makeSafeFileStem } from "./canvas-export.js";
import { downloadText } from "./file-download.js";
import { downloadSvgAsPng, serializeSvgElement } from "./svg-export.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FIGURE_FONT = "Arial, Helvetica, 'Liberation Sans', sans-serif";
const THREE_LETTER_CODES = {
  A: "Ala", R: "Arg", N: "Asn", D: "Asp", C: "Cys", Q: "Gln", E: "Glu", G: "Gly", H: "His", I: "Ile",
  L: "Leu", K: "Lys", M: "Met", F: "Phe", P: "Pro", S: "Ser", T: "Thr", W: "Trp", Y: "Tyr", V: "Val",
  B: "Asx", Z: "Glx", J: "Xle", U: "Sec", O: "Pyl", X: "Xaa", "*": "Ter"
};
const CHEMISTRY = {
  hydrophobic: new Set("AILMFWVY"),
  polar: new Set("STNQCU"),
  acidic: new Set("DE"),
  basic: new Set("KRHO")
};
const PALETTES = {
  color: {
    domain: { fill: "#d8eef1", stroke: "#3c929e", text: "#215f68" },
    region: { fill: "#e8e3f3", stroke: "#7864a4", text: "#56437e" },
    motif: { fill: "#f5e7ca", stroke: "#a96f20", text: "#714910" },
    processing: { fill: "#eef1f2", stroke: "#6c7a83", text: "#44525b" },
    other: { fill: "#e5edf5", stroke: "#66829a", text: "#3f5b72" },
    ptm: "#ba555d",
    active: "#8f4b7a",
    binding: "#2d7d7b",
    variant: "#a8731e",
    site: "#4f6f8f",
    boundary: "#94691f",
    bond: "#496b96"
  },
  grayscale: {
    domain: { fill: "#e5e5e5", stroke: "#565656", text: "#292929" },
    region: { fill: "#f0f0f0", stroke: "#777777", text: "#3b3b3b" },
    motif: { fill: "#d6d6d6", stroke: "#484848", text: "#262626" },
    processing: { fill: "#f7f7f7", stroke: "#888888", text: "#494949" },
    other: { fill: "#e9e9e9", stroke: "#707070", text: "#383838" },
    ptm: "#303030",
    active: "#525252",
    binding: "#6a6a6a",
    variant: "#858585",
    site: "#5d5d5d",
    boundary: "#606060",
    bond: "#454545"
  }
};
const TRACK_HEIGHT = 16;
const TRACK_STEP = 18;
const DETAIL_BASELINE = 34;
const DETAIL_LANE_STEP = 16;

function svgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null && value !== "") element.setAttribute(key, String(value));
  }
  if (text) element.textContent = text;
  return element;
}

function makeTextMeasurer() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  return (text, size = 10.5, weight = 500) => {
    if (!context) return String(text ?? "").length * size * 0.56;
    context.font = `${weight} ${size}px ${FIGURE_FONT}`;
    return context.measureText(String(text ?? "")).width;
  };
}

function fitText(text, maxWidth, measure, size = 10.5, weight = 500) {
  const value = String(text ?? "");
  if (measure(value, size, weight) <= maxWidth) return value;
  if (maxWidth <= measure("…", size, weight)) return "";
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(`${value.slice(0, middle)}…`, size, weight) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${value.slice(0, low).trimEnd()}…`;
}

function titleText(label, facts = []) {
  return [label, ...facts.map(([name, value]) => `${name}: ${value}`)].filter(Boolean).join("; ");
}

function featureFacts(feature, record, coordinateText) {
  return [
    ["type", feature.type?.replaceAll("_", " ").toLowerCase()],
    ["coordinates", coordinateText],
    ["record", record.accession || record.title],
    ...(feature.details ?? [])
  ];
}

function residueStyle(aminoAcid, state) {
  if (state.palette === "grayscale" || state.residueColor === "neutral") {
    return {
      fill: state.palette === "grayscale" ? "#f1f1f1" : "#f4f7f8",
      stroke: "#a8b2b8",
      text: "#26343c"
    };
  }
  if (CHEMISTRY.hydrophobic.has(aminoAcid)) return { fill: "#e3edf8", stroke: "#84a7ca", text: "#315d87" };
  if (CHEMISTRY.polar.has(aminoAcid)) return { fill: "#e1f1ec", stroke: "#7db7a5", text: "#2f6f5b" };
  if (CHEMISTRY.acidic.has(aminoAcid)) return { fill: "#fae8e4", stroke: "#d99a8d", text: "#914b42" };
  if (CHEMISTRY.basic.has(aminoAcid)) return { fill: "#eee8f7", stroke: "#a898c7", text: "#655187" };
  return { fill: "#f7efdc", stroke: "#cbb27a", text: "#7a612a" };
}

function intervalsCollide(left, right, gap = 5) {
  return left[0] < right[1] + gap && left[1] > right[0] - gap;
}

function firstOpenLane(lanes, interval) {
  let lane = 0;
  while (lanes[lane]?.some((occupied) => intervalsCollide(interval, occupied))) lane += 1;
  if (!lanes[lane]) lanes[lane] = [];
  lanes[lane].push(interval);
  return lane;
}

function visibleSpanSegments(spans, rowStart, rowEnd) {
  return spans.flatMap((feature) => (feature.parts?.length ? feature.parts : [feature])
    .filter((part) => part.start <= rowEnd && part.end >= rowStart)
    .map((part, partIndex) => ({
      feature,
      partIndex,
      start: Math.max(part.start, rowStart),
      end: Math.min(part.end, rowEnd)
    })));
}

function packSpanSegments(spans, rowStart, rowEnd, cellWidth, leftEdge, rightEdge, measure) {
  const lanes = [];
  return visibleSpanSegments(spans, rowStart, rowEnd)
    .sort((left, right) => left.start - right.start || right.end - left.end || left.feature.id.localeCompare(right.feature.id))
    .map((entry) => {
      const x = leftEdge + (entry.start - rowStart) * cellWidth;
      const width = Math.max(2, (entry.end - entry.start + 1) * cellWidth);
      const fullLabel = entry.feature.label;
      const fullLabelWidth = measure(fullLabel);
      let mode = "inside";
      let label = fullLabel;
      let labelX = x + width / 2;
      let anchor = "middle";
      let occupied = [x, x + width];

      if (width < fullLabelWidth + 12) {
        const rightRoom = Math.max(0, rightEdge - (x + width) - 6);
        const leftRoom = Math.max(0, x - leftEdge - 6);
        const placeLeft = leftRoom > rightRoom;
        const room = Math.max(leftRoom, rightRoom);
        label = fitText(fullLabel, room, measure);
        if (label) {
          const labelWidth = measure(label);
          mode = placeLeft ? "left" : "right";
          labelX = placeLeft ? x - 6 : x + width + 6;
          anchor = placeLeft ? "end" : "start";
          occupied = placeLeft
            ? [labelX - labelWidth, x + width]
            : [x, labelX + labelWidth];
        } else {
          label = fitText(fullLabel, Math.max(0, width - 6), measure, 9.5);
        }
      }

      const lane = firstOpenLane(lanes, occupied);
      return { ...entry, x, width, lane, mode, label, labelX, anchor, occupied };
    });
}

function placeSideLabel({ x, label, leftEdge, rightEdge, measure, maxWidth = 210 }) {
  const rightRoom = Math.max(0, rightEdge - x - 6);
  const leftRoom = Math.max(0, x - leftEdge - 6);
  const placeLeft = leftRoom > rightRoom;
  const room = Math.min(maxWidth, Math.max(leftRoom, rightRoom));
  const displayLabel = fitText(label, room, measure);
  const labelWidth = measure(displayLabel);
  if (displayLabel && room >= labelWidth) {
    return {
      label: displayLabel,
      labelX: x + (placeLeft ? -6 : 6),
      anchor: placeLeft ? "end" : "start",
      interval: placeLeft ? [x - 6 - labelWidth, x - 6] : [x + 6, x + 6 + labelWidth]
    };
  }
  const centeredLabel = fitText(label, Math.min(maxWidth, rightEdge - leftEdge), measure);
  const centeredWidth = measure(centeredLabel);
  const start = Math.max(leftEdge, Math.min(rightEdge - centeredWidth, x - centeredWidth / 2));
  return {
    label: centeredLabel,
    labelX: start + centeredWidth / 2,
    anchor: "middle",
    interval: [start, start + centeredWidth]
  };
}

function packBoundaries(boundaries, rowStart, rowEnd, cellWidth, leftEdge, rightEdge, measure) {
  const lanes = [];
  return boundaries
    .filter((boundary) => boundary.after >= rowStart && boundary.after < rowEnd)
    .map((boundary) => {
      const x = leftEdge + (boundary.after - rowStart + 1) * cellWidth;
      const placement = placeSideLabel({ x, label: boundary.label, leftEdge, rightEdge, measure, maxWidth: 190 });
      const lane = firstOpenLane(lanes, placement.interval);
      return { boundary, x, lane, ...placement };
    });
}

function packDetails(record, rowStart, rowEnd, cellWidth, leftEdge, rightEdge, measure) {
  const lanes = [];
  const bonds = record.bonds.flatMap((bond) => [bond.start, bond.end]
    .filter((endpoint) => endpoint >= rowStart && endpoint <= rowEnd)
    .map((endpoint) => {
      const x = leftEdge + (endpoint - rowStart + 0.5) * cellWidth;
      const interval = [x - 9, x + 9];
      return { bond, endpoint, x, lane: firstOpenLane(lanes, interval), interval };
    }));
  const sites = record.sites
    .filter((site) => site.position >= rowStart && site.position <= rowEnd)
    .map((site) => {
      const x = leftEdge + (site.position - rowStart + 0.5) * cellWidth;
      const placement = placeSideLabel({ x, label: site.label, leftEdge, rightEdge, measure, maxWidth: 180 });
      const lane = firstOpenLane(lanes, placement.interval);
      return { site, x, lane, ...placement };
    });
  return { bonds, sites, laneCount: lanes.length };
}

function wrappedSequenceRows(record, columns) {
  const preferredBreaks = new Set(record.boundaries.map((boundary) => boundary.after));
  for (const feature of record.spans) {
    for (const part of feature.parts?.length ? feature.parts : [feature]) {
      if (part.start > 1) preferredBreaks.add(part.start - 1);
      if (part.end < record.sequence.length) preferredBreaks.add(part.end);
    }
  }
  const rows = [];
  let rowStart = 1;
  while (rowStart <= record.sequence.length) {
    const targetEnd = Math.min(record.sequence.length, rowStart + columns - 1);
    let rowEnd = targetEnd;
    if (columns <= 30 && targetEnd < record.sequence.length) {
      const candidate = [...preferredBreaks]
        .filter((position) => position >= targetEnd - 4 && position < targetEnd && position >= rowStart + columns - 6)
        .sort((left, right) => right - left)[0];
      if (candidate) rowEnd = candidate;
    }
    rows.push({ rowStart, rowEnd });
    rowStart = rowEnd + 1;
  }
  return rows;
}

function addFeatureTitle(group, label, facts) {
  group.append(svgElement("title", {}, titleText(label, facts)));
}

function addText(parent, attributes, text) {
  parent.append(svgElement("text", attributes, text));
}

function renderSpan(svg, entry, layout, record, palette) {
  const feature = entry.feature;
  const style = palette[feature.kind] ?? palette.other;
  const y = layout.rowTop + entry.lane * TRACK_STEP;
  const group = svgElement("g", {
    class: "protein-figure-span",
    "aria-label": `${feature.label}, residues ${feature.start} to ${feature.end}`
  });
  addFeatureTitle(group, feature.label, featureFacts(feature, record, `${feature.start}–${feature.end}`));
  group.append(svgElement("rect", {
    x: entry.x,
    y,
    width: entry.width,
    height: TRACK_HEIGHT,
    rx: 1.5,
    fill: style.fill,
    stroke: style.stroke,
    "stroke-width": 0.8
  }));
  if (feature.uncertainStart && entry.start === feature.start) {
    group.append(svgElement("line", {
      x1: entry.x,
      y1: y,
      x2: entry.x,
      y2: y + TRACK_HEIGHT,
      stroke: style.stroke,
      "stroke-width": 1.5,
      "stroke-dasharray": "2 1"
    }));
  }
  if (feature.uncertainEnd && entry.end === feature.end) {
    group.append(svgElement("line", {
      x1: entry.x + entry.width,
      y1: y,
      x2: entry.x + entry.width,
      y2: y + TRACK_HEIGHT,
      stroke: style.stroke,
      "stroke-width": 1.5,
      "stroke-dasharray": "2 1"
    }));
  }
  if (entry.label) {
    addText(group, {
      class: "protein-figure-feature-label",
      x: entry.labelX,
      y: y + TRACK_HEIGHT / 2 + 3.7,
      fill: style.text,
      "font-size": entry.mode === "inside" && entry.width < 42 ? 9.5 : 10.5,
      "font-weight": 500,
      "text-anchor": entry.anchor
    }, entry.label);
  }
  svg.append(group);
}

function renderBoundary(svg, placement, layout, record, palette) {
  const { boundary, x, lane } = placement;
  const baseline = layout.sequenceY - 10 - lane * 15;
  const group = svgElement("g", {
    class: "protein-figure-boundary",
    "aria-label": `${boundary.label}, between residues ${boundary.after} and ${boundary.before}`
  });
  addFeatureTitle(group, boundary.label, featureFacts(boundary, record, `between ${boundary.after} and ${boundary.before}`));
  group.append(svgElement("polygon", {
    points: `${x - 3.5},${layout.sequenceY - 8} ${x + 3.5},${layout.sequenceY - 8} ${x},${layout.sequenceY - 2}`,
    fill: palette.boundary
  }));
  addText(group, {
    class: "protein-figure-boundary-label",
    x: placement.labelX,
    y: baseline,
    fill: palette.boundary,
    "font-size": 10.5,
    "font-weight": 500,
    "text-anchor": placement.anchor
  }, placement.label);
  svg.append(group);
}

function renderResidue(svg, record, position, x, y, width, state) {
  const aminoAcid = record.sequence[position - 1] || "X";
  const residueName = THREE_LETTER_CODES[aminoAcid] || "Xaa";
  const style = residueStyle(aminoAcid, state);
  const group = svgElement("g", {
    class: "protein-figure-residue",
    "aria-label": `${residueName} at position ${position}`
  });
  addFeatureTitle(group, `${residueName} (${aminoAcid})`, [["position", position], ["record", record.accession || record.title]]);
  group.append(svgElement("rect", {
    x,
    y,
    width,
    height: 20,
    rx: 0.8,
    fill: style.fill,
    stroke: style.stroke,
    "stroke-width": 0.7
  }));
  addText(group, {
    x: x + width / 2,
    y: y + 14,
    fill: style.text,
    "font-size": state.residueCode === "three" ? 10.5 : 11.5,
    "font-weight": 500,
    "text-anchor": "middle"
  }, state.residueCode === "three" ? residueName : aminoAcid);
  svg.append(group);
}

function renderSite(svg, placement, layout, record, palette) {
  const { site, x, lane } = placement;
  const baseline = layout.sequenceY + DETAIL_BASELINE + lane * DETAIL_LANE_STEP;
  const markerY = baseline - 3;
  const color = palette[site.kind] ?? palette.site;
  const aminoAcid = record.sequence[site.position - 1] || "X";
  const group = svgElement("g", {
    class: "protein-figure-site",
    "aria-label": `${site.label} at residue ${site.position}`
  });
  addFeatureTitle(group, site.label, [
    ...featureFacts(site, record, String(site.position)),
    ["residue", `${THREE_LETTER_CODES[aminoAcid] || "Xaa"} (${aminoAcid})`]
  ]);
  group.append(svgElement("line", {
    x1: x,
    y1: layout.sequenceY + 20,
    x2: x,
    y2: markerY - 3,
    stroke: color,
    "stroke-width": 0.9
  }));
  const marker = site.kind === "variant"
    ? svgElement("polygon", {
      points: `${x},${markerY - 3} ${x + 3},${markerY} ${x},${markerY + 3} ${x - 3},${markerY}`,
      fill: color
    })
    : site.kind === "active"
      ? svgElement("rect", { x: x - 2.8, y: markerY - 2.8, width: 5.6, height: 5.6, rx: 0.8, fill: color })
      : svgElement("circle", { cx: x, cy: markerY, r: 2.6, fill: color });
  group.append(marker);
  addText(group, {
    class: "protein-figure-site-label",
    x: placement.labelX,
    y: baseline,
    fill: color,
    "font-size": 10.5,
    "font-weight": 500,
    "text-anchor": placement.anchor
  }, placement.label);
  svg.append(group);
}

function addBondTag(parent, x, baseline, id, color) {
  parent.append(svgElement("rect", {
    x: x - 9,
    y: baseline - 9,
    width: 18,
    height: 12,
    rx: 2,
    fill: "#ffffff",
    stroke: color,
    "stroke-width": 0.9
  }));
  addText(parent, {
    x,
    y: baseline,
    fill: color,
    "font-size": 10.5,
    "font-weight": 500,
    "text-anchor": "middle"
  }, id);
}

function renderBondEndpoint(svg, placement, layout, record, palette) {
  const { bond, endpoint, x, lane } = placement;
  const baseline = layout.sequenceY + DETAIL_BASELINE + lane * DETAIL_LANE_STEP;
  const group = svgElement("g", {
    class: "protein-figure-bond-endpoint",
    "aria-label": `${bond.label} endpoint at residue ${endpoint}`
  });
  addFeatureTitle(group, bond.label, featureFacts(bond, record, `${bond.start} and ${bond.end}`));
  group.append(svgElement("line", {
    x1: x,
    y1: layout.sequenceY + 20,
    x2: x,
    y2: baseline - 10,
    stroke: palette.bond,
    "stroke-width": 0.9
  }));
  addBondTag(group, x, baseline, bond.figureId, palette.bond);
  svg.append(group);
}

function layoutBondKey(record, leftEdge, rightEdge, measure) {
  const entries = [];
  let x = leftEdge;
  let row = 0;
  for (const bond of record.bonds) {
    const fullLabel = `${bond.label} · ${bond.start} ↔ ${bond.end}`;
    const label = fitText(fullLabel, Math.min(210, rightEdge - leftEdge - 34), measure);
    const width = Math.max(100, measure(label) + 36);
    if (x > leftEdge && x + width > rightEdge) {
      row += 1;
      x = leftEdge;
    }
    entries.push({ bond, label, x, row, width });
    x += width + 12;
  }
  return { entries, rows: entries.length ? row + 1 : 0 };
}

export function buildProteinSequenceFigureSvg(record, state, availableWidth) {
  const measure = makeTextMeasurer();
  const available = Math.max(292, Math.min(Number(availableWidth) || 900, 1120));
  const coordinateWidth = measure(`N · ${record.sequence.length}`);
  const leftMargin = Math.max(38, coordinateWidth + 8);
  const rightMargin = Math.max(38, measure(`${record.sequence.length} · C`) + 8);
  const nominalCell = state.residueCode === "three" ? 31 : available < 520 ? 11.5 : 13.5;
  const columnCap = state.residueCode === "three" ? 28 : 60;
  const preferredWidth = leftMargin + rightMargin + Math.min(record.sequence.length, columnCap) * nominalCell;
  const width = Math.max(292, Math.min(available, preferredWidth));
  const maximumColumns = Math.max(8, Math.floor((width - leftMargin - rightMargin) / nominalCell));
  const columns = Math.max(1, Math.min(record.sequence.length, columnCap, maximumColumns));
  const plotWidth = width - leftMargin - rightMargin;
  const cellWidth = plotWidth / columns;
  const rows = wrappedSequenceRows(record, columns);
  const showAnnotations = state.annotations !== "sequence-only";
  const palette = PALETTES[state.palette] ?? PALETTES.color;
  const layouts = [];
  const subtitle = [record.accession && record.accession !== record.title ? record.accession : "", `${record.sequence.length} amino acids`, record.organism]
    .filter(Boolean)
    .join(" · ");
  const title = fitText(record.title, width, measure, 17, 500);
  const inlineSubtitle = fitText(subtitle, Math.max(0, width - measure(title, 17, 500) - 12), measure, 10.5, 400);
  const stackTitle = !inlineSubtitle || width < 520;
  let cursorY = stackTitle ? 49 : 34;

  for (const { rowStart, rowEnd } of rows) {
    const packed = showAnnotations
      ? packSpanSegments(record.spans, rowStart, rowEnd, cellWidth, leftMargin, leftMargin + plotWidth, measure)
      : [];
    const spanLaneCount = packed.reduce((maximum, entry) => Math.max(maximum, entry.lane + 1), 0);
    const boundaries = showAnnotations
      ? packBoundaries(record.boundaries, rowStart, rowEnd, cellWidth, leftMargin, leftMargin + plotWidth, measure)
      : [];
    const boundaryLaneCount = boundaries.reduce((maximum, entry) => Math.max(maximum, entry.lane + 1), 0);
    const trackArea = spanLaneCount * TRACK_STEP;
    const boundaryArea = boundaryLaneCount * 15;
    const sequenceY = cursorY + trackArea + boundaryArea + 7;
    const details = showAnnotations
      ? packDetails(record, rowStart, rowEnd, cellWidth, leftMargin, leftMargin + plotWidth, measure)
      : { bonds: [], sites: [], laneCount: 0 };
    const detailBottom = details.laneCount
      ? sequenceY + DETAIL_BASELINE + (details.laneCount - 1) * DETAIL_LANE_STEP + 5
      : sequenceY + (showAnnotations ? 30 : 27);
    const rowHeight = detailBottom - cursorY + 5;
    layouts.push({ rowStart, rowEnd, rowTop: cursorY, sequenceY, packed, boundaries, details });
    cursorY += rowHeight;
  }

  const bondsWithIds = record.bonds.map((bond, index) => ({ ...bond, figureId: `B${index + 1}` }));
  const bondById = new Map(bondsWithIds.map((bond) => [bond.id, bond]));
  for (const layout of layouts) {
    layout.details.bonds = layout.details.bonds.map((placement) => ({
      ...placement,
      bond: bondById.get(placement.bond.id) ?? placement.bond
    }));
  }
  const bondRecord = { ...record, bonds: bondsWithIds };
  const bondKey = showAnnotations ? layoutBondKey(bondRecord, leftMargin, leftMargin + plotWidth, measure) : { entries: [], rows: 0 };
  const height = Math.max(80, cursorY + bondKey.rows * 18 + 5);
  const svg = svgElement("svg", {
    class: "protein-sequence-figure-svg",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${record.title}, annotated protein sequence figure`,
    "data-sms3-inspection-highlight": "none",
    "data-protein-sequence-figure-svg": "true",
    xmlns: SVG_NS,
    "font-family": FIGURE_FONT
  });
  svg.append(svgElement("desc", {}, "A wrapped protein sequence with directly labelled feature intervals, residue sites, processing boundaries, and paired bond endpoints."));
  svg.append(svgElement("rect", { width, height, fill: "#ffffff" }));
  addText(svg, { x: 0, y: 20, fill: "#1e2932", "font-size": 17, "font-weight": 500 }, title);
  addText(svg, {
    x: stackTitle ? 0 : measure(title, 17, 500) + 11,
    y: stackTitle ? 38 : 20,
    fill: "#68747d",
    "font-size": 10.5,
    "font-weight": 400
  }, stackTitle ? fitText(subtitle, width, measure, 10.5, 400) : inlineSubtitle);

  for (const layout of layouts) {
    for (const entry of layout.packed) renderSpan(svg, entry, layout, record, palette);
    for (const boundary of layout.boundaries) renderBoundary(svg, boundary, layout, record, palette);

    addText(svg, {
      class: "protein-figure-coordinate-label",
      x: leftMargin - 6,
      y: layout.sequenceY + 14,
      fill: "#68747d",
      "font-size": 10.5,
      "font-weight": 500,
      "text-anchor": "end"
    }, layout.rowStart === 1 ? "N · 1" : String(layout.rowStart));

    for (let column = 0; column < columns && layout.rowStart + column <= record.sequence.length; column += 1) {
      const position = layout.rowStart + column;
      const x = leftMargin + column * cellWidth + 0.4;
      renderResidue(svg, record, position, x, layout.sequenceY, Math.max(5, cellWidth - 0.8), state);
    }

    addText(svg, {
      class: "protein-figure-coordinate-label",
      x: width - rightMargin + 6,
      y: layout.sequenceY + 14,
      fill: "#68747d",
      "font-size": 10.5,
      "font-weight": 500,
      "text-anchor": "start"
    }, layout.rowEnd === record.sequence.length ? `${layout.rowEnd} · C` : String(layout.rowEnd));

    for (const placement of layout.details.sites) renderSite(svg, placement, layout, record, palette);
    for (const placement of layout.details.bonds) renderBondEndpoint(svg, placement, layout, record, palette);
  }

  for (const entry of bondKey.entries) {
    const baseline = cursorY + entry.row * 18 + 11;
    const group = svgElement("g", {
      class: "protein-figure-bond-key",
      "aria-label": `${entry.bond.label}, residues ${entry.bond.start} and ${entry.bond.end}`
    });
    addFeatureTitle(group, entry.bond.label, featureFacts(entry.bond, record, `${entry.bond.start} and ${entry.bond.end}`));
    addBondTag(group, entry.x + 9, baseline, entry.bond.figureId, palette.bond);
    addText(group, {
      x: entry.x + 24,
      y: baseline,
      fill: palette.bond,
      "font-size": 10.5,
      "font-weight": 500,
      "text-anchor": "start"
    }, entry.label);
    svg.append(group);
  }
  return svg;
}

function makeSelect(labelText, choices, value, onChange) {
  const label = document.createElement("label");
  label.className = "protein-figure-field";
  label.append(document.createTextNode(labelText));
  const select = document.createElement("select");
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  label.append(select);
  return { label, select };
}

function exportButton(format, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dna-viewer-export-button";
  button.title = `Download current figure as ${format}`;
  button.setAttribute("aria-label", button.title);
  const label = document.createElement("span");
  label.className = "dna-viewer-export-label";
  label.textContent = format;
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 20 20");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<path d="M10 3.25v8"></path><path d="m6.9 8.55 3.1 3.1 3.1-3.1"></path><path d="M4.25 15.75h11.5"></path>';
  button.append(label, icon);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await onClick();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

export function renderProteinSequenceFigure(container, figure) {
  container.classList.add("protein-sequence-figure-output");
  const records = figure?.records ?? [];
  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "protein-figure-empty";
    empty.textContent = "No protein sequence was available for this figure.";
    container.append(empty);
    container._sms3VisualCleanup = () => {
      container.classList.remove("protein-sequence-figure-output");
    };
    return;
  }

  const state = {
    recordIndex: 0,
    residueCode: figure.appearance?.residueCode === "three" ? "three" : "one",
    residueColor: figure.appearance?.residueColor === "neutral" ? "neutral" : "chemistry",
    palette: figure.appearance?.palette === "grayscale" ? "grayscale" : "color",
    annotations: figure.appearance?.annotations === "sequence-only" ? "sequence-only" : "compact"
  };
  const workspace = document.createElement("section");
  workspace.className = "protein-figure-workspace";
  const toolbar = document.createElement("div");
  toolbar.className = "protein-figure-toolbar";
  const title = document.createElement("div");
  title.className = "protein-figure-toolbar-title";
  const titleStrong = document.createElement("strong");
  titleStrong.textContent = "Protein sequence figure";
  const titleDetail = document.createElement("span");
  titleDetail.textContent = "Compact publication layout";
  title.append(titleStrong, titleDetail);
  toolbar.append(title);

  let currentSvg = null;
  let renderFrame = 0;
  const paper = document.createElement("div");
  paper.className = "protein-figure-paper";
  const host = document.createElement("div");
  host.className = "protein-figure-svg-host";
  paper.append(host);

  const render = () => {
    const record = records[state.recordIndex] ?? records[0];
    const paperStyle = getComputedStyle(paper);
    const paperPadding = Number.parseFloat(paperStyle.paddingLeft || "0")
      + Number.parseFloat(paperStyle.paddingRight || "0");
    const availableWidth = Math.max(292, (paper.clientWidth || 900) - paperPadding);
    currentSvg = buildProteinSequenceFigureSvg(record, state, availableWidth);
    const viewBoxWidth = Number(currentSvg.viewBox.baseVal.width) || availableWidth;
    host.style.width = `${viewBoxWidth + 34}px`;
    host.style.maxWidth = "100%";
    host.replaceChildren(currentSvg);
  };
  const queueRender = () => {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(render);
  };

  if (records.length > 1) {
    const recordChoice = makeSelect(
      "Protein",
      records.map((record, index) => ({ value: String(index), label: record.accession || record.title })),
      "0",
      (value) => {
        state.recordIndex = Number(value) || 0;
        render();
      }
    );
    recordChoice.select.setAttribute("aria-label", "Displayed protein");
    toolbar.append(recordChoice.label);
  }
  toolbar.append(
    makeSelect("Residues", [
      { value: "one", label: "One letter" },
      { value: "three", label: "Three letter" }
    ], state.residueCode, (value) => { state.residueCode = value; render(); }).label,
    makeSelect("Color", [
      { value: "chemistry", label: "Chemistry" },
      { value: "neutral", label: "Neutral" }
    ], state.residueColor, (value) => { state.residueColor = value; render(); }).label,
    makeSelect("Palette", [
      { value: "color", label: "Color" },
      { value: "grayscale", label: "Grayscale" }
    ], state.palette, (value) => { state.palette = value; render(); }).label,
    makeSelect("Annotations", [
      { value: "compact", label: "Compact" },
      { value: "sequence-only", label: "Sequence only" }
    ], state.annotations, (value) => { state.annotations = value; render(); }).label
  );

  const downloads = document.createElement("div");
  downloads.className = "dna-viewer-buttons protein-figure-downloads";
  downloads.setAttribute("role", "group");
  downloads.setAttribute("aria-label", "Figure downloads");
  const filename = () => `${makeSafeFileStem(records[state.recordIndex]?.accession || records[state.recordIndex]?.title, "protein-sequence")}.figure`;
  downloads.append(
    exportButton("PNG", async () => {
      if (currentSvg) await downloadSvgAsPng(serializeSvgElement(currentSvg), `${filename()}.png`);
    }),
    exportButton("SVG", () => {
      if (currentSvg) downloadText(serializeSvgElement(currentSvg), `${filename()}.svg`, "image/svg+xml;charset=utf-8");
    })
  );
  toolbar.append(downloads);
  workspace.append(toolbar, paper);
  container.append(workspace);
  render();

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(queueRender) : null;
  resizeObserver?.observe(paper);
  container._sms3VisualCleanup = () => {
    cancelAnimationFrame(renderFrame);
    resizeObserver?.disconnect();
    container.classList.remove("protein-sequence-figure-output");
  };
}
