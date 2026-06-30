export const DEFAULT_ALIGNMENT_SVG_CELL_LIMIT = 250000;
const CONSENSUS_BLOCK_GAP_PX = 40;
const ALIGNMENT_BLOCK_GAP_PX = 44;

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(value, maxLength = 20) {
  const text = String(value || "sequence");
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1))}...` : text;
}

function normalizeLineWidth(lineWidth) {
  return Math.max(20, Math.min(120, Number.parseInt(lineWidth, 10) || 60));
}

function normalizeCellLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ALIGNMENT_SVG_CELL_LIMIT;
  }
  return Math.max(1, parsed);
}

function coordinateWidthForRows(rows) {
  const maxLength = Math.max(...rows.map((row) => String(row.aligned ?? "").replace(/-/g, "").length), 1);
  const maxStart = Math.max(...rows.map((row) => Number(row.start ?? 1) || 1), 1);
  return Math.max(String(maxLength + maxStart - 1).length, 1);
}

function relationFill(relation, consensusSymbol, hasGap) {
  if (relation === "match" || consensusSymbol === "*") {
    return "#bbf7d0";
  }
  if (relation === "similar" || consensusSymbol === ":") {
    return "#dbeafe";
  }
  if (relation === "gap" || hasGap) {
    return "#e5e7eb";
  }
  return "#fecaca";
}

export function makeAlignmentSvg({
  title = "Colored sequence alignment",
  note = "Coordinates count bases or amino acids and ignore gaps.",
  rows = [],
  consensus = "",
  columnRelations = [],
  lineWidth = 60,
  maxCells = DEFAULT_ALIGNMENT_SVG_CELL_LIMIT,
  legend = "Green conserved; blue similar; red variable; gray gap.",
  summary = "",
  ariaLabel = "Colored sequence alignment"
} = {}) {
  const alignmentLength = Math.max(...rows.map((row) => String(row.aligned ?? "").length), 0);
  if (alignmentLength === 0 || rows.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 140" role="img" aria-label="${escapeXml(ariaLabel)}"><style>.title{font:600 18px system-ui,sans-serif;fill:#111827}.note{font:13px system-ui,sans-serif;fill:#475569}</style><rect width="100%" height="100%" fill="white"/><text class="title" x="32" y="48">${escapeXml(title)}</text><text class="note" x="32" y="82">No aligned symbols were available to draw.</text></svg>`;
  }
  const displayedCells = alignmentLength * rows.length;
  const cellLimit = normalizeCellLimit(maxCells);
  if (displayedCells > cellLimit) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 150" role="img" aria-label="${escapeXml(ariaLabel)} not drawn"><style>.title{font:600 18px system-ui,sans-serif;fill:#111827}.note{font:13px system-ui,sans-serif;fill:#475569}</style><rect width="100%" height="100%" fill="white"/><text class="title" x="32" y="48">Colored alignment not drawn</text><text class="note" x="32" y="82">The alignment has ${displayedCells.toLocaleString()} displayed cells, exceeding the current ${cellLimit.toLocaleString()}-cell colored alignment limit.</text><text class="note" x="32" y="106">Use text, CLUSTAL, FASTA, or TSV output for the complete alignment, or raise the alignment input limit if the browser can handle the SVG.</text></svg>`;
  }

  const blockWidth = normalizeLineWidth(lineWidth);
  const cell = 15;
  const rowHeight = 17;
  const labelX = 24;
  const labelPixelWidth = 132;
  const coordinatePixelWidth = Math.max(6, coordinateWidthForRows(rows)) * 7;
  const left = labelX + labelPixelWidth + 12 + coordinatePixelWidth + 12;
  const startCoordinateX = left - 8;
  const endCoordinatePadding = 4;
  const blocks = Math.ceil(alignmentLength / blockWidth);
  const renderedBlockColumns = Math.min(blockWidth, alignmentLength);
  const top = 58;
  const hasConsensus = consensus.length > 0;
  const blockGap = hasConsensus ? CONSENSUS_BLOCK_GAP_PX : ALIGNMENT_BLOCK_GAP_PX;
  const blockHeight = rows.length * rowHeight + (hasConsensus ? 20 : 0);
  const width = left + renderedBlockColumns * cell + endCoordinatePadding + coordinatePixelWidth + 24;
  const footerLines = [legend, note, summary].filter(Boolean);
  const footerLineHeight = 18;
  const footerTop = top + blocks * (blockHeight + blockGap) + 20;
  const height = footerTop + footerLines.length * footerLineHeight + 14;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}" data-block-gap-px="${blockGap}">`,
    "<style>",
    ".title{font:600 18px system-ui,sans-serif;fill:#111827}",
    ".note{font:12px system-ui,sans-serif;fill:#475569}",
    ".label{font:12px system-ui,sans-serif;fill:#334155}",
    ".coord{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#475569}",
    ".coord-start{text-anchor:end}",
    ".coord-end{text-anchor:start}",
    ".cell{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;text-anchor:middle;dominant-baseline:central;fill:#111827}",
    ".consensus{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#334155;text-anchor:middle;dominant-baseline:central}",
    ".legend{font:12px system-ui,sans-serif;fill:#475569}",
    "</style>",
    '<rect width="100%" height="100%" fill="white"/>',
    `<text class="title" x="24" y="30">${escapeXml(title)}</text>`
  ];

  const positions = rows.map((row) => Number(row.start ?? 1) || 1);
  for (let block = 0; block < blocks; block += 1) {
    const start = block * blockWidth;
    const chunkLength = Math.min(blockWidth, alignmentLength - start);
    const blockTop = top + block * (blockHeight + blockGap);
    const consensusY = blockTop + rows.length * rowHeight + 9;

    rows.forEach((row, rowIndex) => {
      const y = blockTop + rowIndex * rowHeight;
      const chunk = String(row.aligned ?? "").slice(start, start + chunkLength);
      const count = chunk.replace(/-/g, "").length;
      const startCoord = positions[rowIndex];
      const endCoord = count > 0 ? positions[rowIndex] + count - 1 : positions[rowIndex] - 1;
      parts.push(`<text class="label" x="${labelX}" y="${y + 11}">${escapeXml(truncateLabel(row.label, 20))}</text>`);
      parts.push(`<text class="coord coord-start" x="${startCoordinateX}" y="${y + 11}">${count > 0 ? startCoord : ""}</text>`);
      parts.push(`<text class="coord coord-end" x="${left + chunkLength * cell + endCoordinatePadding}" y="${y + 11}">${count > 0 ? endCoord : ""}</text>`);
      for (let offset = 0; offset < chunkLength; offset += 1) {
        const columnIndex = start + offset;
        const symbol = String(row.aligned ?? "")[columnIndex] ?? "-";
        const relation = columnRelations[columnIndex] ?? row.relations?.[columnIndex] ?? "";
        const hasGap = rows.some((candidate) => String(candidate.aligned ?? "")[columnIndex] === "-");
        const fill = relationFill(relation, consensus[columnIndex], hasGap);
        const x = left + offset * cell;
        parts.push(`<rect x="${x}" y="${y}" width="${cell - 1}" height="${cell}" fill="${fill}"></rect>`);
        parts.push(`<text class="cell" x="${x + cell / 2}" y="${y + cell / 2}">${escapeXml(symbol)}</text>`);
      }
      positions[rowIndex] += count;
    });

    if (hasConsensus) {
      parts.push(`<text class="label" x="${labelX}" y="${consensusY + 4}">Consensus</text>`);
      for (let offset = 0; offset < chunkLength; offset += 1) {
        const columnIndex = start + offset;
        const x = left + offset * cell;
        const symbol = consensus[columnIndex] === " " ? "." : consensus[columnIndex];
        parts.push(`<text class="consensus" x="${x + cell / 2}" y="${consensusY}">${escapeXml(symbol)}</text>`);
      }
    }
  }

  footerLines.forEach((line, index) => {
    const className = index === 0 ? "legend" : "note";
    parts.push(`<text class="${className}" x="24" y="${footerTop + index * footerLineHeight}">${escapeXml(line)}</text>`);
  });
  parts.push("</svg>");
  return parts.join("\n");
}
