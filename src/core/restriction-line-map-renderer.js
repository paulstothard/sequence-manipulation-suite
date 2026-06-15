const DEFAULT_WIDTH = 1000;
const DEFAULT_MARGIN = { top: 68, right: 62, bottom: 42, left: 168 };
const RECORD_HEIGHT_WITH_FRAGMENTS = 210;
const RECORD_HEIGHT_WITHOUT_FRAGMENTS = 178;
const LABEL_FONT_SIZE = 12;
const FRAGMENT_FONT_SIZE = 10;
const LABEL_ROWS = 4;
const LABEL_ROW_GAP = 17;
const LABEL_OFFSET = 22;
const LABEL_PADDING = 7;
const LABEL_MAX_SHIFT = 96;
const FRAGMENT_LABEL_PADDING = 10;
const ENZYME_COLORS = [
  "#c2410c",
  "#2563eb",
  "#15803d",
  "#7c3aed",
  "#be123c",
  "#0f766e",
  "#a16207",
  "#4338ca"
];

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function estimateTextWidth(text, fontSize = LABEL_FONT_SIZE) {
  return String(text ?? "").length * fontSize * 0.62;
}

function intervalsOverlap(candidate, existing, padding) {
  return !(candidate.right + padding <= existing.left || candidate.left - padding >= existing.right);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function colorForEnzyme(enzyme) {
  let hash = 0;
  for (const character of String(enzyme ?? "")) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return ENZYME_COLORS[Math.abs(hash) % ENZYME_COLORS.length];
}

function packRestrictionLabelLane(items, leftBound, rightBound, padding = LABEL_PADDING) {
  if (!items.length) {
    return { items: [], totalShift: 0, maxShift: 0 };
  }
  const sorted = [...items].sort((left, right) =>
    left.desiredX - right.desiredX || String(left.id).localeCompare(String(right.id))
  );
  const span = rightBound - leftBound;
  const requiredWidth = sorted.reduce((sum, item) => sum + item.width, 0) + Math.max(0, sorted.length - 1) * padding;
  if (requiredWidth > span) {
    return null;
  }

  const packed = sorted.map((item) => ({
    ...item,
    labelX: clamp(item.desiredX, leftBound + item.width / 2, rightBound - item.width / 2)
  }));

  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 1; index < packed.length; index += 1) {
      const previousRight = packed[index - 1].labelX + packed[index - 1].width / 2;
      packed[index].labelX = Math.max(packed[index].labelX, previousRight + padding + packed[index].width / 2);
    }
    const last = packed.at(-1);
    if (last && last.labelX + last.width / 2 > rightBound) {
      last.labelX = rightBound - last.width / 2;
    }
    for (let index = packed.length - 2; index >= 0; index -= 1) {
      const nextLeft = packed[index + 1].labelX - packed[index + 1].width / 2;
      packed[index].labelX = Math.min(packed[index].labelX, nextLeft - padding - packed[index].width / 2);
    }
    const first = packed[0];
    if (first && first.labelX - first.width / 2 < leftBound) {
      const shift = leftBound - (first.labelX - first.width / 2);
      for (const item of packed) {
        item.labelX += shift;
      }
    }
  }

  let totalShift = 0;
  let maxShift = 0;
  for (const item of packed) {
    const shift = Math.abs(item.labelX - item.desiredX);
    totalShift += shift;
    maxShift = Math.max(maxShift, shift);
  }
  return { items: packed, totalShift, maxShift };
}

function truncateTextToWidth(text, maxWidth, fontSize = 12) {
  const source = String(text ?? "");
  if (estimateTextWidth(source, fontSize) <= maxWidth) {
    return source;
  }
  const maxCharacters = Math.max(4, Math.floor(maxWidth / (fontSize * 0.62)));
  return `${source.slice(0, maxCharacters - 3)}...`;
}

export function placeRestrictionLineLabels(sites, options = {}) {
  const {
    sequenceLength,
    plotLeft = DEFAULT_MARGIN.left,
    plotRight = DEFAULT_WIDTH - DEFAULT_MARGIN.right,
    backboneY = 120,
    maxRows = LABEL_ROWS,
    rowGap = LABEL_ROW_GAP,
    labelOffset = LABEL_OFFSET,
    fontSize = LABEL_FONT_SIZE,
    labelPadding = LABEL_PADDING,
    maxShift = LABEL_MAX_SHIFT,
    textWidthFn = (label) => estimateTextWidth(label, fontSize)
  } = options;

  if (!sequenceLength || sequenceLength <= 0) {
    throw new Error("placeRestrictionLineLabels requires a positive sequenceLength.");
  }

  const plotWidth = Math.max(1, plotRight - plotLeft);
  const xScale = (position) => plotLeft + (clamp(position, 0, sequenceLength) / sequenceLength) * plotWidth;
  const rows = Array.from({ length: maxRows }, () => []);
  const omitted = [];
  const sortedSites = [...sites].map((site, index) => ({
    ...site,
    id: site.id || `restriction-site-${index}`
  })).sort((left, right) =>
    xScale(left.position) - xScale(right.position) ||
    String(left.enzyme ?? "").localeCompare(String(right.enzyme ?? ""))
  );

  for (const site of sortedSites) {
    const label = site.label || site.enzyme || `${site.position}`;
    const cutX = xScale(site.position);
    const textWidth = textWidthFn(label);
    const width = Math.max(28, textWidth + 6);
    const half = width / 2;
    const desiredX = clamp(cutX, plotLeft + half, plotRight - half);
    const candidate = {
      ...site,
      label,
      cutX,
      desiredX,
      textWidth,
      width
    };
    let best = null;

    for (let row = 0; row < maxRows; row += 1) {
      const packed = packRestrictionLabelLane([...rows[row], candidate], plotLeft, plotRight, labelPadding);
      if (!packed) {
        continue;
      }
      if (packed.maxShift > maxShift) {
        continue;
      }
      best = { row, packed };
      break;
    }

    if (best) {
      rows[best.row] = best.packed.items;
    } else {
      omitted.push({ ...site, label, cutX });
    }
  }

  const placed = rows.flatMap((rowItems, row) =>
    rowItems.map((item) => {
      const half = item.width / 2;
      const textHalf = item.textWidth / 2;
      const labelY = backboneY - labelOffset - row * rowGap;
      return {
        ...item,
        labelY,
        row,
        left: item.labelX - half,
        right: item.labelX + half,
        leaderX: clamp(item.cutX, item.labelX - textHalf, item.labelX + textHalf),
        leaderY: labelY + 5
      };
    })
  );

  return { placed, omitted, rows, xScale };
}

function fragmentParts(fragment, sequenceLength) {
  if (fragment.topology === "circular" && fragment.start > fragment.end) {
    return [
      { start: fragment.start, end: sequenceLength },
      { start: 1, end: fragment.end }
    ];
  }
  return [{ start: fragment.start, end: fragment.end }];
}

function placeFragmentLabels(fragments, options = {}) {
  const {
    sequenceLength,
    xScale,
    plotLeft,
    plotRight,
    backboneY,
    rowGap = 16,
    maxRows = 2,
    fontSize = FRAGMENT_FONT_SIZE,
    labelPadding = FRAGMENT_LABEL_PADDING
  } = options;
  const rows = Array.from({ length: maxRows }, () => []);
  const placed = [];
  const omitted = [];

  for (const fragment of fragments.filter((item) => item.length > 0)) {
    const parts = fragmentParts(fragment, sequenceLength)
      .map((part) => {
        const x1 = xScale(part.start - 1);
        const x2 = xScale(part.end);
        return { ...part, x1, x2, width: Math.max(0, x2 - x1) };
      })
      .sort((left, right) => right.width - left.width);
    const bestPart = parts[0];
    if (!bestPart) {
      omitted.push(fragment);
      continue;
    }
    const wraps = fragment.topology === "circular" && fragment.start > fragment.end;
    const label = wraps ? `${fragment.length} bp total` : `${fragment.length} bp`;
    const labelWidth = estimateTextWidth(label, fontSize);
    if (bestPart.width < labelWidth + 12) {
      omitted.push(fragment);
      continue;
    }
    const centerX = (bestPart.x1 + bestPart.x2) / 2;
    const half = labelWidth / 2;
    let wasPlaced = false;
    for (let row = 0; row < maxRows; row += 1) {
      const labelX = clamp(centerX, plotLeft + half, plotRight - half);
      const candidate = {
        ...fragment,
        label,
        labelX,
        labelY: backboneY + 32 + row * rowGap,
        width: labelWidth,
        left: labelX - half,
        right: labelX + half,
        row
      };
      if (rows[row].every((existing) => !intervalsOverlap(candidate, existing, labelPadding))) {
        rows[row].push(candidate);
        placed.push(candidate);
        wasPlaced = true;
        break;
      }
    }
    if (!wasPlaced) {
      omitted.push(fragment);
    }
  }

  return { placed, omitted };
}

function makeSites(hits) {
  return (hits ?? [])
    .filter((hit) => Number.isFinite(hit.cut_after))
    .map((hit) => ({
      enzyme: hit.enzyme,
      label: hit.enzyme,
      position: hit.cut_after,
      siteStart: hit.site_start,
      siteEnd: hit.site_end,
      color: colorForEnzyme(hit.enzyme)
    }));
}

export function renderRestrictionLineMap(records, options = {}) {
  const showFragmentLabels = options.showFragmentLabels === true;
  const width = Number(options.width) || DEFAULT_WIDTH;
  const margin = DEFAULT_MARGIN;
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const recordHeight = showFragmentLabels ? RECORD_HEIGHT_WITH_FRAGMENTS : RECORD_HEIGHT_WITHOUT_FRAGMENTS;
  const title = options.title || "Restriction single-line map";
  const height = margin.top + margin.bottom + Math.max(1, records.length) * recordHeight;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    "<style>",
    ".title{font:700 18px system-ui,sans-serif;fill:#17202a}",
    ".subtitle{font:12px system-ui,sans-serif;fill:#53616d}",
    ".record-title{font:600 12px system-ui,sans-serif;fill:#24313d}",
    ".backbone{stroke:#1f2937;stroke-width:3;stroke-linecap:round}",
    ".site-tick{stroke-width:2;stroke-linecap:round}",
    ".site-leader{stroke:#94a3b8;stroke-width:1;stroke-linecap:round}",
    ".site-label{font:12px system-ui,sans-serif;fill:#111827;text-anchor:middle}",
    ".fragment-size-label{font:10px system-ui,sans-serif;fill:#475569;text-anchor:middle}",
    ".axis-label{font:10px system-ui,sans-serif;fill:#64748b;text-anchor:middle}",
    ".map-note{font:11px system-ui,sans-serif;fill:#64748b}",
    ".record-separator{stroke:#e5e7eb;stroke-width:1}",
    "</style>",
    `<rect x="0" y="0" width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="24" y="30">${escapeXml(title)}</text>`,
    '<text class="subtitle" x="24" y="50">Each input record is drawn as one independently scaled line; full cut coordinates remain in the table or text map.</text>'
  ];

  records.forEach((record, recordIndex) => {
    const rowTop = margin.top + recordIndex * recordHeight;
    const backboneY = rowTop + 96;
    const sequenceLength = Math.max(1, Number(record.length) || 1);
    const sites = makeSites(record.hits);
    const layout = placeRestrictionLineLabels(sites, {
      sequenceLength,
      plotLeft,
      plotRight,
      backboneY
    });
    const fragments = showFragmentLabels ? (record.fragments ?? []) : [];
    const fragmentLayout = showFragmentLabels
      ? placeFragmentLabels(fragments, {
          sequenceLength,
          xScale: layout.xScale,
          plotLeft,
          plotRight,
          backboneY
        })
      : { placed: [], omitted: [] };
    const fullRecordTitle = `${record.title || `Record ${recordIndex + 1}`} (${sequenceLength.toLocaleString()} bp)`;
    const recordTitle = truncateTextToWidth(fullRecordTitle, plotLeft - 38, 12);

    if (recordIndex > 0) {
      parts.push(`<line class="record-separator" x1="24" y1="${(rowTop - 10).toFixed(1)}" x2="${width - 24}" y2="${(rowTop - 10).toFixed(1)}"/>`);
    }
    parts.push(`<text class="record-title" x="24" y="${(rowTop + 14).toFixed(1)}" data-full-title="${escapeXml(fullRecordTitle)}">${escapeXml(recordTitle)}</text>`);
    parts.push(`<line class="backbone" x1="${plotLeft}" y1="${backboneY}" x2="${plotRight}" y2="${backboneY}"/>`);
    parts.push(`<text class="axis-label" x="${plotLeft}" y="${backboneY + (showFragmentLabels ? 68 : 44)}">1</text>`);
    parts.push(`<text class="axis-label" x="${plotRight}" y="${backboneY + (showFragmentLabels ? 68 : 44)}">${sequenceLength.toLocaleString()} bp</text>`);

    for (const site of sites) {
      const x = layout.xScale(site.position);
      parts.push(`<line class="site-tick" x1="${x.toFixed(1)}" y1="${backboneY - 12}" x2="${x.toFixed(1)}" y2="${backboneY + 12}" stroke="${site.color}" data-enzyme="${escapeXml(site.enzyme)}"/>`);
    }

    for (const label of layout.placed) {
      parts.push(`<line class="site-leader" x1="${label.cutX.toFixed(1)}" y1="${backboneY - 13}" x2="${label.leaderX.toFixed(1)}" y2="${label.leaderY.toFixed(1)}" stroke="${label.color}" opacity="0.78" data-enzyme="${escapeXml(label.enzyme)}"/>`);
      parts.push(`<text class="site-label" x="${label.labelX.toFixed(1)}" y="${label.labelY.toFixed(1)}" data-enzyme="${escapeXml(label.enzyme)}" data-cut-x="${label.cutX.toFixed(1)}" data-label-row="${label.row}">${escapeXml(label.label)}</text>`);
    }

    for (const label of fragmentLayout.placed) {
      parts.push(`<text class="fragment-size-label" x="${label.labelX.toFixed(1)}" y="${label.labelY.toFixed(1)}">${escapeXml(label.label)}</text>`);
    }

    const notes = [];
    if (layout.omitted.length > 0) {
      notes.push(`${layout.omitted.length.toLocaleString()} site label${layout.omitted.length === 1 ? "" : "s"} omitted; see table/text map.`);
    }
    if (fragmentLayout.omitted.length > 0) {
      notes.push(`${fragmentLayout.omitted.length.toLocaleString()} fragment-size label${fragmentLayout.omitted.length === 1 ? "" : "s"} omitted; see fragment table.`);
    }
    if (notes.length > 0) {
      parts.push(`<text class="map-note" x="${plotLeft}" y="${(rowTop + recordHeight - 18).toFixed(1)}">${escapeXml(notes.join(" "))}</text>`);
    }
  });

  parts.push("</svg>");
  return parts.join("");
}
