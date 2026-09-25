import "../vendor/d3/d3.min.js";
import { makePublicationPlotStyle, publicationSvgAttributes, SMS3_PLOT_THEME } from "./publication-plot-style.js";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getD3() {
  return globalThis.d3 ?? null;
}

function formatCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(absolute >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`;
  }
  if (absolute >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }
  if (absolute >= 10_000) {
    return `${Math.round(number / 1_000)}k`;
  }
  if (absolute >= 1_000) {
    return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(number);
}

function textWidth(value, charWidth = 7) {
  return String(value ?? "").length * charWidth;
}

function positiveRange(values) {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length === 0) {
    return { min: 0, max: 0, ratio: 1 };
  }
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  return { min, max, ratio: min > 0 ? max / min : 1 };
}

function resolveScaleMode(values, requested = "auto") {
  const mode = ["auto", "linear", "log"].includes(requested) ? requested : "auto";
  if (mode !== "auto") return mode;
  const range = positiveRange(values);
  return range.ratio >= 100 ? "log" : "linear";
}

function makeBarScale(values, width, requested = "auto") {
  const mode = resolveScaleMode(values, requested);
  const max = Math.max(1, ...values.map((value) => Number(value) || 0));
  if (mode === "log") {
    const maxLog = Math.log10(max + 1);
    return {
      mode,
      scale(value) {
        const number = Math.max(0, Number(value) || 0);
        return number > 0 ? Math.max(2, Math.round((Math.log10(number + 1) / maxLog) * width)) : 0;
      }
    };
  }
  const d3Scale = getD3()?.scaleLinear?.().domain([0, max]).range([0, width]);
  return {
    mode,
    scale(value) {
      const number = Math.max(0, Number(value) || 0);
      const scaled = d3Scale ? d3Scale(number) : (number / max) * width;
      return number > 0 ? Math.max(2, Math.round(scaled)) : 0;
    }
  };
}

export function makeUpsetStyleSvg({
  title = "UpSet-style plot",
  subtitle = "Bars show distinct item counts for each intersection; dots show set membership.",
  setLabels = [],
  setSizes = [],
  intersections = [],
  maxIntersections = 24,
  scaleMode = "auto",
  publicationWidthMm,
  showTitle = true,
  ariaLabel = "UpSet-style overlap plot"
} = {}) {
  const shown = intersections.slice(0, Math.max(1, maxIntersections));
  const omitted = Math.max(0, intersections.length - shown.length);
  const rowHeight = 26;
  const barWidth = 300;
  const setBarMaxHeight = 42;
  const contentLeft = 32;
  const left = contentLeft + 12;
  const top = 150;
  const matrixTop = top + 18;
  const normalizedSetSizes = setLabels.map((_, index) => Math.max(0, Number(setSizes[index] ?? 0) || 0));
  const setCountLabels = normalizedSetSizes.map(formatCompactNumber);
  const maxSetLabelWidth = Math.max(
    12,
    ...setLabels.map((label) => textWidth(label, 7)),
    ...setCountLabels.map((label) => textWidth(label, 6))
  );
  const matrixColGap = Math.max(32, Math.min(64, maxSetLabelWidth + 12));
  const lastSetX = left + Math.max(0, setLabels.length - 1) * matrixColGap;
  const barX = lastSetX + 34;
  const countLabels = shown.map((row) => formatCompactNumber(row.count));
  const rightLabelWidth = Math.max(28, ...countLabels.map((label) => textWidth(label, 7)));
  const width = Math.max(560, barX + barWidth + rightLabelWidth + 28);
  const height = matrixTop + shown.length * rowHeight + 104;
  const style = makePublicationPlotStyle(width, height, { publicationWidthMm, showTitle });
  const setSizeScale = makeBarScale(normalizedSetSizes, setBarMaxHeight, scaleMode);
  const countScale = makeBarScale(shown.map((row) => row.count), barWidth, scaleMode);
  const setBarBaseline = top - 22;
  const setBars = setLabels.map((label, index) => {
    const x = left + index * matrixColGap;
    const size = normalizedSetSizes[index];
    const barHeight = setSizeScale.scale(size);
    const y = setBarBaseline - barHeight;
    return `<g data-sms3-inspection-mark="set-size"><title>${escapeXml(`${label}: ${size.toLocaleString()} distinct item${size === 1 ? "" : "s"}; ${setSizeScale.mode} bar scale`)}</title><rect class="set-size-bar" data-count="${size}" data-scale="${setSizeScale.mode}" x="${x - 5}" y="${y}" width="10" height="${barHeight}" fill="${SMS3_PLOT_THEME.textMuted}"></rect><text class="set-count" x="${x}" y="${Math.max(12, y - 6)}" text-anchor="middle">${setCountLabels[index]}</text></g>`;
  }).join("");
  const rows = shown.map((row, rowIndex) => {
    const y = matrixTop + rowIndex * rowHeight;
    const membership = row.membership ?? [];
    const dots = membership.map((present, index) => {
      const x = left + index * matrixColGap;
      return `<circle class="${present ? "intersection-member" : "intersection-nonmember"}" cx="${x}" cy="${y}" r="5" fill="${present ? SMS3_PLOT_THEME.highlight : SMS3_PLOT_THEME.missingOutline}"></circle>`;
    }).join("");
    const presentIndexes = membership.map((present, index) => present ? index : -1).filter((index) => index >= 0);
    const connectors = presentIndexes.length > 1
      ? `<line class="intersection-connector" x1="${left + presentIndexes[0] * matrixColGap}" y1="${y}" x2="${left + presentIndexes[presentIndexes.length - 1] * matrixColGap}" y2="${y}" stroke="${SMS3_PLOT_THEME.highlight}" stroke-width="2"></line>`
      : "";
    const bar = countScale.scale(row.count);
    const members = presentIndexes.map((index) => setLabels[index]).join(" + ") || "No sets";
    return `<g data-sms3-inspection-mark="intersection"><title>${escapeXml(`${members}: ${Number(row.count).toLocaleString()} distinct item${Number(row.count) === 1 ? "" : "s"}; ${countScale.mode} bar scale`)}</title>${connectors}${dots}<rect class="intersection-size-bar" data-count="${row.count}" data-scale="${countScale.mode}" x="${barX}" y="${y - 8}" width="${bar}" height="16" fill="${SMS3_PLOT_THEME.selection}"></rect><text class="count" x="${barX + bar + 8}" y="${y + 5}">${countLabels[rowIndex]}</text></g>`;
  }).join("");
  const labels = setLabels.map((label, index) => `<text class="set-label" x="${left + index * matrixColGap}" y="${top}" text-anchor="middle">${escapeXml(label)}</text>`).join("");
  const setAxisLabel = setLabels.length > 0
    ? `<line x1="${left - 12}" y1="${setBarBaseline}" x2="${lastSetX + 12}" y2="${setBarBaseline}" stroke="${SMS3_PLOT_THEME.axis}" stroke-width="${style.axisStrokeWidth}"></line>`
    : "";
  const scaleNote = setSizeScale.mode === countScale.mode
    ? `Scale: ${setSizeScale.mode === "log" ? "log10" : "linear"}; labels show raw counts.`
    : `Scale: top ${setSizeScale.mode === "log" ? "log10" : "linear"}, right ${countScale.mode === "log" ? "log10" : "linear"}; labels show raw counts.`;
  const note = omitted > 0
    ? `${omitted} lower-count intersection${omitted === 1 ? "" : "s"} omitted; table contains all items.`
    : `All ${shown.length} intersection${shown.length === 1 ? "" : "s"} shown; table contains item-level counts.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${publicationSvgAttributes(style)} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}" data-plot-foundation="d3-upset-svg" data-plot-renderer="sms3-d3" data-sms3-publication-theme="default" data-set-bar-scale="${setSizeScale.mode}" data-intersection-bar-scale="${countScale.mode}"><style>text{font-family:${style.fontFamily};fill:${SMS3_PLOT_THEME.text};stroke:none;text-shadow:none;paint-order:normal}.title{font-size:${style.titleFontSize}px;font-weight:600}.set-label{font-size:${style.bodyFontSize}px;font-weight:400;fill:${SMS3_PLOT_THEME.axis}}.count{font-size:${style.bodyFontSize}px}.set-count{font-size:${style.smallFontSize}px;fill:${SMS3_PLOT_THEME.axis}}.note{font-size:${style.bodyFontSize}px;fill:${SMS3_PLOT_THEME.textMuted}}</style><rect width="${width}" height="${height}" fill="${SMS3_PLOT_THEME.surface}"/>${style.showTitle ? `<text class="title" x="32" y="34">${escapeXml(title)}</text>` : ""}<text class="note" x="32" y="54">${escapeXml(subtitle)}</text>${setAxisLabel}${setBars}${labels}${rows}<text class="note" x="32" y="${height - 48}">${escapeXml(scaleNote)}</text><text class="note" x="32" y="${height - 28}">${escapeXml(note)}</text></svg>`;
}
