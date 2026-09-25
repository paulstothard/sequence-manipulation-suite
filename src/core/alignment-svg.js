import {
  makePublicationPlotStyle,
  publicationSvgAttributes,
  SMS3_PLOT_THEME
} from "./publication-plot-style.js";

export const DEFAULT_ALIGNMENT_SVG_CELL_LIMIT = 250000;
const CONSENSUS_BLOCK_GAP_PX = 40;
const ALIGNMENT_BLOCK_GAP_PX = 44;
const ALIGNMENT_FIGURE_FAMILY = "sequence-alignment";
const DEFAULT_ALIGNMENT_BLOCK_COLUMNS = 72;
const MIN_ALIGNMENT_LABEL_WIDTH_PX = 96;
const MAX_ALIGNMENT_LABEL_WIDTH_PX = 360;
const ALIGNMENT_CELL_GAP_PX = 1;
const ALIGNMENT_CELL_WIDTH_EM = 0.9;
const ALIGNMENT_CELL_HEIGHT_EM = 1.45;
const ALIGNMENT_LABEL_COORDINATE_GAP_PX = 6;
const ALIGNMENT_COORDINATE_SEQUENCE_GAP_PX = 8;
const ALIGNMENT_LAYOUT_ITERATION_LIMIT = 12;

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabelToWidth(value, maxWidth, fontSize, measure = estimateTextWidth) {
  const text = String(value || "sequence");
  if (measure(text, fontSize) <= maxWidth) return text;

  const characters = Array.from(text);
  const ellipsis = "...";
  if (measure(ellipsis, fontSize) >= maxWidth) return ellipsis;
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("")}${ellipsis}`;
    if (measure(candidate, fontSize) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${characters.slice(0, Math.max(1, low)).join("")}${ellipsis}`;
}

function normalizeLineWidth(lineWidth) {
  return Math.max(20, Math.min(120, Number.parseInt(lineWidth, 10) || DEFAULT_ALIGNMENT_BLOCK_COLUMNS));
}

function normalizeCellLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ALIGNMENT_SVG_CELL_LIMIT;
  }
  return Math.max(1, parsed);
}

function estimateTextWidth(value, fontSize) {
  return Array.from(String(value ?? "")).reduce((width, character) => {
    if (/\s/u.test(character)) return width + fontSize * 0.34;
    if (/[MW@#%&]/u.test(character)) return width + fontSize * 0.9;
    if (/[ilI.,:;!'|]/u.test(character)) return width + fontSize * 0.34;
    return width + fontSize * 0.6;
  }, 0);
}

function wrapTextLines(value, maxWidth, fontSize) {
  const text = String(value ?? "").trim();
  if (!text || estimateTextWidth(text, fontSize) <= maxWidth) return text ? [text] : [];

  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/u)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && estimateTextWidth(candidate, fontSize) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function coordinateWidthForRows(rows) {
  const maxLength = Math.max(...rows.map((row) => String(row.aligned ?? "").replace(/-/g, "").length), 1);
  const maxStart = Math.max(...rows.map((row) => Number(row.start ?? 1) || 1), 1);
  return Math.max(String(maxLength + maxStart - 1).length, 1);
}

function relationFill(relation, consensusSymbol, hasGap) {
  if (relation === "match" || consensusSymbol === "*") {
    return SMS3_PLOT_THEME.alignment.exact;
  }
  if (relation === "similar" || consensusSymbol === ":") {
    return SMS3_PLOT_THEME.alignment.similar;
  }
  if (relation === "gap" || hasGap) {
    return SMS3_PLOT_THEME.alignment.gap;
  }
  return SMS3_PLOT_THEME.alignment.mismatch;
}

function alignmentSvgRootAttributes(style, ariaLabel) {
  return [
    'xmlns="http://www.w3.org/2000/svg"',
    publicationSvgAttributes(style),
    `viewBox="0 0 ${style.viewBoxWidth} ${style.viewBoxHeight}"`,
    'role="img"',
    `aria-label="${escapeXml(ariaLabel)}"`,
    `data-sms3-figure-family="${ALIGNMENT_FIGURE_FAMILY}"`,
    'data-sms3-publication-theme="alignment"'
  ].join(" ");
}

function makeAlignmentMessageSvg({ title, lines, ariaLabel, height }) {
  const width = 760;
  const style = {
    ...makePublicationPlotStyle(width, height),
    viewBoxWidth: width,
    viewBoxHeight: height
  };
  const lineHeight = style.bodyFontSize + 8;
  return [
    `<svg ${alignmentSvgRootAttributes(style, ariaLabel)}>`,
    `<style>.title{font:600 ${style.titleFontSize}px ${style.fontFamily};fill:${SMS3_PLOT_THEME.text}}.note{font:400 ${style.bodyFontSize}px ${style.fontFamily};fill:${SMS3_PLOT_THEME.textMuted}}</style>`,
    `<rect width="100%" height="100%" fill="${SMS3_PLOT_THEME.surface}"/>`,
    `<text class="title" x="32" y="48">${escapeXml(title)}</text>`,
    ...lines.map((line, index) => `<text class="note" x="32" y="${82 + index * lineHeight}">${escapeXml(line)}</text>`),
    "</svg>"
  ].join("");
}

export function makeAlignmentSvg({
  title = "Colored sequence alignment",
  note = "Coordinates count bases or amino acids and ignore gaps.",
  rows = [],
  consensus = "",
  columnRelations = [],
  lineWidth = DEFAULT_ALIGNMENT_BLOCK_COLUMNS,
  maxCells = DEFAULT_ALIGNMENT_SVG_CELL_LIMIT,
  legend = "Teal conserved; blue similar; orange variable; gray gap.",
  summary = "",
  ariaLabel = "Colored sequence alignment"
} = {}) {
  const alignmentLength = Math.max(...rows.map((row) => String(row.aligned ?? "").length), 0);
  if (alignmentLength === 0 || rows.length === 0) {
    return makeAlignmentMessageSvg({
      title,
      lines: ["No aligned symbols were available to draw."],
      ariaLabel,
      height: 140
    });
  }
  const displayedCells = alignmentLength * rows.length;
  const cellLimit = normalizeCellLimit(maxCells);
  if (displayedCells > cellLimit) {
    return makeAlignmentMessageSvg({
      title: "Colored alignment not drawn",
      lines: [
        `The alignment has ${displayedCells.toLocaleString()} displayed cells, exceeding the ${cellLimit.toLocaleString()}-cell colored alignment limit.`,
        "Use text, CLUSTAL, FASTA, or TSV output for the complete alignment."
      ],
      ariaLabel: `${ariaLabel} not drawn`,
      height: 150
    });
  }

  const blockWidth = normalizeLineWidth(lineWidth);
  const labelX = 24;
  const endCoordinatePadding = 4;
  const blocks = Math.ceil(alignmentLength / blockWidth);
  const renderedBlockColumns = Math.min(blockWidth, alignmentLength);
  const hasConsensus = consensus.length > 0;
  const blockGap = hasConsensus ? CONSENSUS_BLOCK_GAP_PX : ALIGNMENT_BLOCK_GAP_PX;
  const coordinateCharacters = coordinateWidthForRows(rows);
  let cellWidth = 14;
  let cellHeight = 14;
  let cellStep = cellWidth + ALIGNMENT_CELL_GAP_PX;
  let labelPixelWidth = MIN_ALIGNMENT_LABEL_WIDTH_PX;
  let coordinatePixelWidth = coordinateCharacters * 7;
  let left = labelX + labelPixelWidth + ALIGNMENT_LABEL_COORDINATE_GAP_PX + coordinatePixelWidth + ALIGNMENT_COORDINATE_SEQUENCE_GAP_PX;
  let width = Math.max(760, left + renderedBlockColumns * cellStep + endCoordinatePadding + coordinatePixelWidth + 24);
  let publicationStyle = makePublicationPlotStyle(width, 1);
  for (let iteration = 0; iteration < ALIGNMENT_LAYOUT_ITERATION_LIMIT; iteration += 1) {
    labelPixelWidth = Math.max(
      MIN_ALIGNMENT_LABEL_WIDTH_PX,
      Math.min(
        MAX_ALIGNMENT_LABEL_WIDTH_PX,
        Math.ceil(Math.max(...rows.map((row) => estimateTextWidth(row.label || "sequence", publicationStyle.smallFontSize)), 0) + 8)
      )
    );
    coordinatePixelWidth = Math.max(16, Math.ceil(coordinateCharacters * publicationStyle.smallFontSize * 0.62));
    cellWidth = Math.max(10, Math.ceil(publicationStyle.smallFontSize * ALIGNMENT_CELL_WIDTH_EM));
    cellHeight = Math.max(14, Math.ceil(publicationStyle.smallFontSize * ALIGNMENT_CELL_HEIGHT_EM));
    cellStep = cellWidth + ALIGNMENT_CELL_GAP_PX;
    left = labelX + labelPixelWidth + ALIGNMENT_LABEL_COORDINATE_GAP_PX + coordinatePixelWidth + ALIGNMENT_COORDINATE_SEQUENCE_GAP_PX;
    width = Math.max(760, left + renderedBlockColumns * cellStep + endCoordinatePadding + coordinatePixelWidth + 24);
    publicationStyle = makePublicationPlotStyle(width, 1);
  }
  const labelRightX = labelX + labelPixelWidth;
  const startCoordinateX = left - ALIGNMENT_COORDINATE_SEQUENCE_GAP_PX;
  const rowHeight = cellHeight + ALIGNMENT_CELL_GAP_PX;
  const blockHeight = (rows.length + (hasConsensus ? 1 : 0)) * rowHeight;
  const captionWidth = width - 48;
  const titleLines = wrapTextLines(title, captionWidth, publicationStyle.titleFontSize);
  const titleLineHeight = publicationStyle.titleFontSize + 6;
  const top = 58 + Math.max(0, titleLines.length - 1) * titleLineHeight;
  const footerLines = [
    ...wrapTextLines(legend, captionWidth, publicationStyle.bodyFontSize).map((text) => ({ className: "legend", text })),
    ...wrapTextLines(note, captionWidth, publicationStyle.smallFontSize).map((text) => ({ className: "note", text })),
    ...wrapTextLines(summary, captionWidth, publicationStyle.smallFontSize).map((text) => ({ className: "note", text }))
  ];
  const footerLineHeight = publicationStyle.bodyFontSize + 6;
  const footerTop = top + blocks * (blockHeight + blockGap) + 20;
  const height = Math.ceil(footerTop + footerLines.length * footerLineHeight + 14);
  publicationStyle = {
    ...makePublicationPlotStyle(width, height),
    viewBoxWidth: width,
    viewBoxHeight: height
  };
  const parts = [
    `<svg ${alignmentSvgRootAttributes(publicationStyle, ariaLabel)} data-block-gap-px="${blockGap}" data-alignment-block-columns="${renderedBlockColumns}" data-alignment-cell-width-px="${cellWidth}" data-alignment-cell-height-px="${cellHeight}" data-alignment-label-width-px="${labelPixelWidth}">`,
    "<style>",
    `.title{font:600 ${publicationStyle.titleFontSize}px ${publicationStyle.fontFamily};fill:${SMS3_PLOT_THEME.text}}`,
    `.note{font:400 ${publicationStyle.smallFontSize}px ${publicationStyle.fontFamily};fill:${SMS3_PLOT_THEME.textMuted}}`,
    `.label{font:400 ${publicationStyle.smallFontSize}px ${publicationStyle.fontFamily};dominant-baseline:central;fill:${SMS3_PLOT_THEME.text}}`,
    `.coord{font:400 ${publicationStyle.smallFontSize}px ${publicationStyle.sequenceFontFamily};dominant-baseline:central;fill:${SMS3_PLOT_THEME.textMuted}}`,
    ".coord-start{text-anchor:end}",
    ".coord-end{text-anchor:start}",
    `.cell{font:400 ${publicationStyle.smallFontSize}px ${publicationStyle.sequenceFontFamily};text-anchor:middle;dominant-baseline:central;fill:${SMS3_PLOT_THEME.text}}`,
    `.consensus{font:400 ${publicationStyle.smallFontSize}px ${publicationStyle.sequenceFontFamily};fill:${SMS3_PLOT_THEME.text};text-anchor:middle;dominant-baseline:central}`,
    `.legend{font:400 ${publicationStyle.bodyFontSize}px ${publicationStyle.fontFamily};fill:${SMS3_PLOT_THEME.textMuted}}`,
    "</style>",
    `<rect width="100%" height="100%" fill="${SMS3_PLOT_THEME.surface}"/>`,
    ...titleLines.map((line, index) => `<text class="title" x="24" y="${30 + index * titleLineHeight}">${escapeXml(line)}</text>`)
  ];

  const positions = rows.map((row) => Number(row.start ?? 1) || 1);
  for (let block = 0; block < blocks; block += 1) {
    const start = block * blockWidth;
    const chunkLength = Math.min(blockWidth, alignmentLength - start);
    const blockTop = top + block * (blockHeight + blockGap);
    const consensusY = blockTop + rows.length * rowHeight + cellHeight / 2;

    rows.forEach((row, rowIndex) => {
      const y = blockTop + rowIndex * rowHeight;
      const chunk = String(row.aligned ?? "").slice(start, start + chunkLength);
      const count = chunk.replace(/-/g, "").length;
      const startCoord = positions[rowIndex];
      const endCoord = count > 0 ? positions[rowIndex] + count - 1 : positions[rowIndex] - 1;
      const rowLabel = String(row.label || `Sequence ${rowIndex + 1}`);
      const visibleRowLabel = truncateLabelToWidth(
        rowLabel,
        labelPixelWidth - 8,
        publicationStyle.smallFontSize,
        estimateTextWidth
      );
      const coordinateSummary = count > 0 ? `${startCoord}–${endCoord}` : "gap-only chunk";
      const rowTextY = y + cellHeight / 2;
      parts.push(`<g class="alignment-row" data-alignment-row-label="${escapeXml(rowLabel)}"><title>${escapeXml(`${rowLabel}; alignment columns ${start + 1}–${start + chunkLength}; sequence coordinates ${coordinateSummary}`)}</title>`);
      parts.push(`<text class="label" text-anchor="end" x="${labelRightX}" y="${rowTextY}">${escapeXml(visibleRowLabel)}</text>`);
      parts.push(`<text class="coord coord-start" x="${startCoordinateX}" y="${rowTextY}">${count > 0 ? startCoord : ""}</text>`);
      parts.push(`<text class="coord coord-end" x="${left + chunkLength * cellStep + endCoordinatePadding}" y="${rowTextY}">${count > 0 ? endCoord : ""}</text>`);
      let sequencePosition = startCoord - 1;
      for (let offset = 0; offset < chunkLength; offset += 1) {
        const columnIndex = start + offset;
        const symbol = String(row.aligned ?? "")[columnIndex] ?? "-";
        const relation = columnRelations[columnIndex] ?? row.relations?.[columnIndex] ?? "";
        const hasGap = rows.some((candidate) => String(candidate.aligned ?? "")[columnIndex] === "-");
        const fill = relationFill(relation, consensus[columnIndex], hasGap);
        const x = left + offset * cellStep;
        if (symbol !== "-") sequencePosition += 1;
        const inspectionRelation = relation || (hasGap ? "gap column" : consensus[columnIndex] === "*" ? "conserved" : "");
        parts.push(`<rect data-alignment-column="${columnIndex + 1}" data-alignment-symbol="${escapeXml(symbol)}" data-sequence-coordinate="${symbol === "-" ? "gap" : sequencePosition}" data-alignment-relation="${escapeXml(inspectionRelation)}" x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="${fill}"></rect>`);
        parts.push(`<text class="cell" pointer-events="none" x="${x + cellWidth / 2}" y="${y + cellHeight / 2}">${escapeXml(symbol)}</text>`);
      }
      parts.push("</g>");
      positions[rowIndex] += count;
    });

    if (hasConsensus) {
      parts.push(`<text class="label" text-anchor="end" x="${labelRightX}" y="${consensusY}">Consensus</text>`);
      for (let offset = 0; offset < chunkLength; offset += 1) {
        const columnIndex = start + offset;
        const x = left + offset * cellStep;
        const symbol = consensus[columnIndex] === " " ? "." : consensus[columnIndex];
        parts.push(`<text class="consensus" x="${x + cellWidth / 2}" y="${consensusY}">${escapeXml(symbol)}</text>`);
      }
    }
  }

  footerLines.forEach((line, index) => {
    parts.push(`<text class="${line.className}" x="24" y="${footerTop + index * footerLineHeight}">${escapeXml(line.text)}</text>`);
  });
  parts.push("</svg>");
  return parts.join("\n");
}
