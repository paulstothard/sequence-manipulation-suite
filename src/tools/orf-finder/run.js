import { makeOrfExplorerData, packOrfOverviewMarks } from "../../core/orf-explorer.js";
export { packOrfOverviewMarks } from "../../core/orf-explorer.js";
import { exportDelimitedTable } from "../../core/table.js";
import { normalizeOrfOptions, ORF_OUTPUT_FORMATS_BY_STREAM } from "../../core/orf-options.js";
import { formatFastaRecord } from "../../core/fasta.js";
import { findOrfs, createOrfBudget, ORF_LIMITS } from "../../core/orf.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
export { findOrfs } from "../../core/orf.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { featureArrowHeadLength } from "../../core/directional-feature-geometry.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const LARGE_TEXT_ORF_THRESHOLD = 2000;
export const SVG_OVERVIEW_ORF_THRESHOLD = 1500;
export const SVG_OVERVIEW_BASE_THRESHOLD = 500000;
export const SVG_OVERVIEW_HEIGHT_THRESHOLD = 2400;
const ORF_OVERVIEW_PLOT_ATTRIBUTE = `data-sms3-plot="orf-overview" data-plot-renderer="sms3-orf-overview"`;
const ORF_CHEVRON_SPACING = 24;
const ORF_LABEL_CHEVRON_GAP = 7;
const ORF_CHEVRON_HALF_HEIGHT = 3.5;
const ORF_ARROW_HEAD_SCALE = 0.75;
const ORF_OVERVIEW_WIDTH = 980;
const ORF_OVERVIEW_LEFT = 90;
const ORF_OVERVIEW_RIGHT = 64;
const ORF_OVERVIEW_ROW_HEIGHT = 18;
const ORF_OVERVIEW_MARK_HEIGHT = 14;
const ORF_OVERVIEW_BAND_PADDING = 3;
const ORF_OVERVIEW_FRAME_GAP = 3;
const ORF_OVERVIEW_RECORD_GAP = 38;
const ORF_OVERVIEW_TITLE_HEIGHT = 30;
const ORF_OVERVIEW_FRAMES = ["+1", "+2", "+3", "-1", "-2", "-3"];
const ORF_OVERVIEW_STYLE = [
  `[data-sms3-plot="orf-overview"] text{font-family:Inter,Arial,sans-serif;font-size:12px;fill:#172026;stroke:none;text-shadow:none;paint-order:normal}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-title{font-size:16px;font-weight:750}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-subtitle{font-size:10px;fill:#64748b}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-record-title{font-size:13px;font-weight:650}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-frame-label{font-size:11px;font-weight:700;fill:#334155}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-frame-slot{fill:#f8fafc;stroke:#e2e8f0;stroke-width:.8}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis{stroke:#475569;stroke-width:1.4}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-tick{stroke:#475569;stroke-width:1}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-minor-tick{stroke:#94a3b8;stroke-width:.75}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-label{font-size:11px;fill:#475569;stroke:none;text-shadow:none;paint-order:normal}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark{stroke-width:1.1;stroke-linejoin:round}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark.complete{fill:#0f766e;stroke:#115e59}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark.partial{fill:#b45309;stroke:#92400e}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark.is-tiny{stroke-width:1.4}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-chevron{fill:none;stroke:#fff;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.6;pointer-events:none}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark-label{fill:#fff;font-size:9px;font-weight:600;text-anchor:middle;dominant-baseline:middle;pointer-events:none}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-legend text{font-size:10px;fill:#475569}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-legend-note{font-size:10px;fill:#64748b}`
].join("");

const FRAME_SLOT = new Map([
  ["+1", 0],
  ["+2", 1],
  ["+3", 2],
  ["-1", 3],
  ["-2", 4],
  ["-3", 5]
]);
export const orfTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "orf", label: "ORF", type: "number" },
  { id: "frame", label: "Frame", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "nt_length", label: "Nucleotide length", type: "number" },
  { id: "aa_length", label: "Amino acid length", type: "number" },
  { id: "start_codon", label: "Start codon", type: "string" },
  { id: "stop_codon", label: "Stop codon", type: "string" },
  { id: "complete", label: "Complete", type: "boolean" },
  { id: "record_index", label: "Record number", type: "number" }
];

function formatOrfRow(recordTitle, index, orf) {
  return [
    recordTitle,
    index,
    orf.frame,
    orf.strand,
    orf.start,
    orf.end,
    orf.ntLength,
    orf.aaLength,
    orf.startCodon,
    orf.stopCodon || ".",
    orf.complete ? "yes" : "no"
  ];
}

function makeTsv(rows) {
  return exportDelimitedTable(orfTableColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

function makeReport(records) {
  const lines = [];

  for (const record of records) {
    lines.push(`Record ${record.recordIndex}: ${record.title} ORFs`);
    if (record.orfs.length === 0) {
      lines.push("No ORFs matched the selected options.");
      lines.push("");
      continue;
    }

    lines.push("orf\tframe\tstrand\tstart\tend\tnt_length\taa_length\tstart_codon\tstop_codon\tcomplete");
    record.orfs.forEach((orf, index) => {
      lines.push(formatOrfRow("", index + 1, orf).slice(1).join("\t"));
    });
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function makeSummaryReport(records) {
  const lines = ["ORF finder", ""];

  for (const record of records) {
    const completeCount = record.orfs.filter((orf) => orf.complete).length;
    const partialCount = record.orfs.length - completeCount;
    const longest = record.orfs.reduce((max, orf) => Math.max(max, orf.aaLength), 0);
    lines.push(`Record ${record.recordIndex}: ${record.title} ORFs`);
    lines.push(`ORFs found: ${record.orfs.length}`);
    lines.push(`Complete ORFs: ${completeCount}`);
    lines.push(`Partial ORFs: ${partialCount}`);
    lines.push(`Longest ORF: ${longest} aa`);
    lines.push("");
  }

  lines.push(`Total ORFs: ${records.reduce((sum, record) => sum + record.orfs.length, 0)}`);
  return lines.join("\n").trimEnd();
}

function makeFastaHeader(recordTitle, index, orf, recordIndex) {
  return `record=${recordTitle} orf=${index} strand=${orf.strand} frame=${orf.frame} start=${orf.start} end=${orf.end} aa_length=${orf.aaLength} complete=${orf.complete ? "yes" : "no"} record_index=${recordIndex}`;
}

function makeNucleotideFasta(records) {
  const outputParts = [];

  for (const record of records) {
    record.orfs.forEach((orf, index) => {
      outputParts.push(formatFastaRecord(makeFastaHeader(record.title, index + 1, orf, record.recordIndex), orf.nucleotide, 60));
    });
  }

  return outputParts.join("\n");
}

function makeProteinFasta(records, includeStopInProtein = false) {
  const outputParts = [];

  for (const record of records) {
    record.orfs.forEach((orf, index) => {
      const protein = includeStopInProtein && orf.complete ? `${orf.protein}*` : orf.protein;
      outputParts.push(formatFastaRecord(makeFastaHeader(record.title, index + 1, orf, record.recordIndex), protein, 60));
    });
  }

  return outputParts.join("\n");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function niceStep(span, target = 7) {
  const rough = Math.max(1, span / target);
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

function minorStepForMajor(majorStep) {
  if (!Number.isFinite(majorStep) || majorStep <= 1) return 0;
  const power = Math.pow(10, Math.floor(Math.log10(majorStep)));
  const scaled = Math.round(majorStep / power);
  const divisor = scaled === 2 ? 4 : 5;
  return Math.max(1, Math.round(majorStep / divisor));
}

export function getOrfOverviewPositionUnit(recordLength) {
  if (recordLength >= 1000000000) return { unit: "Gb", scale: 1000000000 };
  if (recordLength >= 1000000) return { unit: "Mb", scale: 1000000 };
  if (recordLength >= 10000) return { unit: "kb", scale: 1000 };
  return { unit: "bp", scale: 1 };
}

export function formatOrfOverviewPositionLabel(position, recordLength) {
  const safePosition = Math.max(1, Math.round(Number(position) || 1));
  if (safePosition <= 1) return "1 bp";
  const { unit, scale } = getOrfOverviewPositionUnit(recordLength);
  if (scale === 1) return `${safePosition.toLocaleString()} bp`;
  const value = safePosition / scale;
  const decimals = safePosition % scale === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${Number(value.toFixed(decimals)).toLocaleString()} ${unit}`;
}

function makeOverviewRulerTicks(sequenceLength, plotWidth) {
  const length = Math.max(1, Math.round(Number(sequenceLength) || 1));
  const targetTickCount = Math.max(3, Math.min(9, Math.round(plotWidth / 130)));
  const majorStep = niceStep(Math.max(1, length - 1), targetTickCount);
  const minorStep = minorStepForMajor(majorStep);
  const majorTicks = [1];
  const majorSeen = new Set(majorTicks);
  const addMajor = (position) => {
    const rounded = Math.max(1, Math.min(length, Math.round(position)));
    if (!majorSeen.has(rounded)) {
      majorSeen.add(rounded);
      majorTicks.push(rounded);
    }
  };
  for (let position = Math.max(majorStep, Math.ceil(2 / majorStep) * majorStep); position < length; position += majorStep) {
    if (length - position < majorStep * 0.45) continue;
    addMajor(position);
  }
  if (length > 1) addMajor(length);

  const minorTicks = [];
  if (minorStep > 0) {
    for (let position = Math.max(minorStep, Math.ceil(2 / minorStep) * minorStep); position < length; position += minorStep) {
      const rounded = Math.round(position);
      if (majorSeen.has(rounded)) continue;
      minorTicks.push(rounded);
    }
  }

  return {
    majorTicks: majorTicks.sort((left, right) => left - right),
    minorTicks,
    majorStep,
    minorStep
  };
}

function positionToRulerX(position, sequenceLength, left, plotWidth) {
  const length = Math.max(1, Number(sequenceLength) || 1);
  if (length <= 1) return left;
  return left + ((Math.max(1, Math.min(length, position)) - 1) / (length - 1)) * plotWidth;
}

function intervalStartToX(position, sequenceLength, left, plotWidth) {
  const length = Math.max(1, Number(sequenceLength) || 1);
  return left + ((Math.max(1, Math.min(length, position)) - 1) / length) * plotWidth;
}

function intervalEndToX(position, sequenceLength, left, plotWidth) {
  const length = Math.max(1, Number(sequenceLength) || 1);
  return left + (Math.max(1, Math.min(length, position)) / length) * plotWidth;
}

function appendOverviewRuler(parts, { y, left, rightX, plotWidth, sequenceLength }) {
  const { majorTicks, minorTicks } = makeOverviewRulerTicks(sequenceLength, plotWidth);
  const length = Math.max(1, Math.round(Number(sequenceLength) || 1));
  parts.push(`<line class="orf-overview-axis" x1="${left}" y1="${y}" x2="${rightX}" y2="${y}"></line>`);

  for (const tick of minorTicks) {
    const x = positionToRulerX(tick, length, left, plotWidth);
    parts.push(`<line class="orf-overview-axis-minor-tick" x1="${x.toFixed(2)}" y1="${y - 4}" x2="${x.toFixed(2)}" y2="${y + 4}"></line>`);
  }

  for (const tick of majorTicks) {
    const x = positionToRulerX(tick, length, left, plotWidth);
    parts.push(`<line class="orf-overview-axis-tick" x1="${x.toFixed(2)}" y1="${y - 7}" x2="${x.toFixed(2)}" y2="${y + 7}"></line>`);
    parts.push(`<text class="orf-overview-axis-label" x="${x.toFixed(2)}" y="${y + 18}" text-anchor="middle">${escapeXml(formatOrfOverviewPositionLabel(tick, length))}</text>`);
  }
}


function minimumWidthInterval(x1, x2, left, right, minimumWidth = 7) {
  const naturalWidth = Math.max(0, x2 - x1);
  if (naturalWidth >= minimumWidth) return { x1, x2, naturalWidth, minimumWidthApplied: false };
  const center = (x1 + x2) / 2;
  const drawX1 = Math.max(left, Math.min(right - minimumWidth, center - minimumWidth / 2));
  return {
    x1: drawX1,
    x2: drawX1 + minimumWidth,
    naturalWidth,
    minimumWidthApplied: true
  };
}

export function makeOrfOverviewLayout(records) {
  const plotWidth = ORF_OVERVIEW_WIDTH - ORF_OVERVIEW_LEFT - ORF_OVERVIEW_RIGHT;
  let y = 24 + 60;
  let maxFrameLaneCount = 1;
  const recordLayouts = records.map((record) => {
    const sequenceLength = Math.max(1, record.sequence.length, ...record.orfs.map((orf) => orf.end));
    const titleY = y;
    y += ORF_OVERVIEW_TITLE_HEIGHT;
    const frameLayouts = ORF_OVERVIEW_FRAMES.map((frame) => {
      const frameMarks = record.orfs.map((orf, index) => ({ orf, index }))
        .filter(({ orf }) => orf.frame === frame)
        .map(({ orf, index }) => {
          const naturalX1 = intervalStartToX(orf.start, sequenceLength, ORF_OVERVIEW_LEFT, plotWidth);
          const naturalX2 = intervalEndToX(orf.end, sequenceLength, ORF_OVERVIEW_LEFT, plotWidth);
          const interval = minimumWidthInterval(
            naturalX1,
            naturalX2,
            ORF_OVERVIEW_LEFT,
            ORF_OVERVIEW_WIDTH - ORF_OVERVIEW_RIGHT
          );
          return { ...interval, orf, index };
        });
      const packed = packOrfOverviewMarks(frameMarks);
      maxFrameLaneCount = Math.max(maxFrameLaneCount, packed.laneCount);
      const frameHeight = ORF_OVERVIEW_BAND_PADDING * 2
        + packed.laneCount * ORF_OVERVIEW_ROW_HEIGHT;
      const frameLayout = {
        frame,
        y,
        frameHeight,
        frameCenter: y + frameHeight / 2,
        packed
      };
      y += frameHeight + ORF_OVERVIEW_FRAME_GAP;
      if (frame === "+3") y += 5;
      return frameLayout;
    });
    const rulerY = y + 5;
    y += ORF_OVERVIEW_RECORD_GAP + 5;
    return { record, sequenceLength, titleY, frameLayouts, rulerY };
  });
  return {
    width: ORF_OVERVIEW_WIDTH,
    left: ORF_OVERVIEW_LEFT,
    right: ORF_OVERVIEW_RIGHT,
    plotWidth,
    height: Math.max(120, y),
    maxFrameLaneCount,
    records: recordLayouts
  };
}

function orfArrowPath(x1, x2, y, strand, height = ORF_OVERVIEW_MARK_HEIGHT) {
  const half = height / 2;
  const width = Math.max(1, x2 - x1);
  const naturalHead = featureArrowHeadLength(width, height, strand);
  const head = naturalHead > 0 ? Math.max(3, naturalHead * ORF_ARROW_HEAD_SCALE) : 0;
  if (!(head > 0)) {
    const radius = Math.min(2.5, half, width / 2);
    return {
      d: [
        `M${(x1 + radius).toFixed(2)} ${(y - half).toFixed(2)}`,
        `H${(x2 - radius).toFixed(2)}`,
        `Q${x2.toFixed(2)} ${(y - half).toFixed(2)} ${x2.toFixed(2)} ${(y - half + radius).toFixed(2)}`,
        `V${(y + half - radius).toFixed(2)}`,
        `Q${x2.toFixed(2)} ${(y + half).toFixed(2)} ${(x2 - radius).toFixed(2)} ${(y + half).toFixed(2)}`,
        `H${(x1 + radius).toFixed(2)}`,
        `Q${x1.toFixed(2)} ${(y + half).toFixed(2)} ${x1.toFixed(2)} ${(y + half - radius).toFixed(2)}`,
        `V${(y - half + radius).toFixed(2)}`,
        `Q${x1.toFixed(2)} ${(y - half).toFixed(2)} ${(x1 + radius).toFixed(2)} ${(y - half).toFixed(2)}`,
        "Z"
      ].join(" "),
      bodyStart: x1,
      bodyEnd: x2,
      hasArrowhead: false,
      headLength: 0,
      height
    };
  }
  if (strand === "-") {
    return {
      d: `M${x2.toFixed(2)} ${(y - half).toFixed(2)} H${(x1 + head).toFixed(2)} L${x1.toFixed(2)} ${y.toFixed(2)} L${(x1 + head).toFixed(2)} ${(y + half).toFixed(2)} H${x2.toFixed(2)} Z`,
      bodyStart: x1 + head,
      bodyEnd: x2,
      hasArrowhead: true,
      headLength: head,
      height
    };
  }
  return {
    d: `M${x1.toFixed(2)} ${(y - half).toFixed(2)} H${(x2 - head).toFixed(2)} L${x2.toFixed(2)} ${y.toFixed(2)} L${(x2 - head).toFixed(2)} ${(y + half).toFixed(2)} H${x1.toFixed(2)} Z`,
    bodyStart: x1,
    bodyEnd: x2 - head,
    hasArrowhead: true,
    headLength: head,
    height
  };
}

function orfChevronPath(bodyStart, bodyEnd, y, strand, headLength, arrowHeight, exclusion = null) {
  const available = bodyEnd - bodyStart;
  if (available < 24) return "";
  const arrowHalfHeight = Math.max(1, arrowHeight / 2);
  const chevronRun = Math.max(2, headLength * ORF_CHEVRON_HALF_HEIGHT / arrowHalfHeight);
  const chevronBounds = { min: -chevronRun / 2, max: chevronRun / 2 };
  const edgeInset = 7;
  const centers = [];
  if (exclusion) {
    const leftStart = exclusion.x1 - ORF_LABEL_CHEVRON_GAP - chevronBounds.max;
    const rightStart = exclusion.x2 + ORF_LABEL_CHEVRON_GAP - chevronBounds.min;
    for (let x = leftStart; x + chevronBounds.min >= bodyStart + edgeInset; x -= ORF_CHEVRON_SPACING) centers.push(x);
    centers.reverse();
    for (let x = rightStart; x + chevronBounds.max <= bodyEnd - edgeInset; x += ORF_CHEVRON_SPACING) centers.push(x);
  } else {
    for (let x = bodyStart + 10; x <= bodyEnd - edgeInset; x += ORF_CHEVRON_SPACING) centers.push(x);
  }
  const parts = [];
  for (const x of centers) {
    if (strand === "-") {
      parts.push(`M${(x + chevronRun / 2).toFixed(2)} ${(y - ORF_CHEVRON_HALF_HEIGHT).toFixed(2)} L${(x - chevronRun / 2).toFixed(2)} ${y.toFixed(2)} L${(x + chevronRun / 2).toFixed(2)} ${(y + ORF_CHEVRON_HALF_HEIGHT).toFixed(2)}`);
    } else {
      parts.push(`M${(x - chevronRun / 2).toFixed(2)} ${(y - ORF_CHEVRON_HALF_HEIGHT).toFixed(2)} L${(x + chevronRun / 2).toFixed(2)} ${y.toFixed(2)} L${(x - chevronRun / 2).toFixed(2)} ${(y + ORF_CHEVRON_HALF_HEIGHT).toFixed(2)}`);
    }
  }
  if (parts.length < 2) return "";
  return parts.join(" ");
}

function sequenceEndpointFacts(label, sequence, flankLength) {
  const value = String(sequence ?? "").replace(/\s+/g, "");
  if (!value) return [];
  if (value.length <= flankLength * 2) return [`${label}: ${value}`];
  return [
    `${label} start: ${value.slice(0, flankLength)}`,
    `${label} end: ${value.slice(-flankLength)}`
  ];
}

function makeOrfOverviewInspection(record, orf, index, geneticCode, minimumWidthApplied) {
  return [
    `ORF ${index + 1}: ${record.title}`,
    `record number: ${record.recordIndex}`,
    `frame: ${orf.frame}`,
    `coordinates: ${orf.start.toLocaleString()}–${orf.end.toLocaleString()}`,
    `strand: ${orf.strand}`,
    `status: ${orf.complete ? "complete" : "partial; no terminal stop"}`,
    `length: ${orf.ntLength.toLocaleString()} bp / ${orf.aaLength.toLocaleString()} aa`,
    `start codon: ${orf.startCodon || "none"}`,
    `stop codon: ${orf.stopCodon || "none"}`,
    `genetic code: NCBI table ${geneticCode}`,
    ...sequenceEndpointFacts("coding DNA", orf.nucleotide, 9),
    ...sequenceEndpointFacts("protein", orf.protein, 7),
    ...(minimumWidthApplied ? ["displayed with a minimum-width marker"] : [])
  ].join("; ");
}

function appendOrfOverviewLegend(parts) {
  const complete = orfArrowPath(590, 626, 59, "+", 10);
  const partial = orfArrowPath(690, 726, 59, "+", 10);
  parts.push(
    `<g class="orf-overview-legend" aria-label="ORF status legend">`,
    `<path class="orf-overview-mark complete" d="${complete.d}"></path>`,
    `<text x="632" y="63">Complete</text>`,
    `<path class="orf-overview-mark partial" d="${partial.d}"></path>`,
    `<text x="732" y="63">Partial</text>`,
    `<text class="orf-overview-legend-note" x="812" y="63">chevrons: 5′→3′</text>`,
    `</g>`
  );
}

function makeSvgOverview(records, options = {}, suppliedLayout = null) {
  const layout = suppliedLayout ?? makeOrfOverviewLayout(records);
  const { width, left, right, plotWidth } = layout;
  const geneticCode = String(options.geneticCode ?? "1");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${layout.height}" role="img" aria-label="ORF overview using NCBI translation table ${escapeXml(geneticCode)}" style="color-scheme:light;background:#ffffff" data-overview-height="${layout.height}" data-max-frame-lanes="${layout.maxFrameLaneCount}" ${ORF_OVERVIEW_PLOT_ATTRIBUTE}>`,
    `<style>${ORF_OVERVIEW_STYLE}</style>`,
    `<rect class="orf-overview-background" width="100%" height="100%" fill="#ffffff"></rect>`
  ];
  parts.push(
    `<text class="orf-overview-title" x="16" y="24">ORF overview</text>`,
    `<text class="orf-overview-subtitle" x="16" y="42">NCBI translation table ${escapeXml(geneticCode)} · hover or use arrow keys for sequence endpoints</text>`
  );
  appendOrfOverviewLegend(parts);

  for (const recordLayout of layout.records) {
    const { record, sequenceLength } = recordLayout;
    const orfCountLabel = `${record.orfs.length} ORF${record.orfs.length === 1 ? "" : "s"}`;
    parts.push(`<text class="orf-overview-record-title" x="16" y="${recordLayout.titleY}">Record ${record.recordIndex}: ${escapeXml(record.title)} (${orfCountLabel})</text>`);

    for (const frameLayout of recordLayout.frameLayouts) {
      const { frame, y, frameHeight, frameCenter, packed } = frameLayout;
      parts.push(`<text class="orf-overview-frame-label" x="24" y="${frameCenter + 4}">${frame}</text>`);
      for (let lane = 0; lane < packed.laneCount; lane += 1) {
        const slotY = y + ORF_OVERVIEW_BAND_PADDING + lane * ORF_OVERVIEW_ROW_HEIGHT;
        parts.push(`<rect class="orf-overview-frame-slot" data-record="${escapeXml(record.title)}" data-frame="${escapeXml(frame)}" data-overview-lane="${lane}" x="${left}" y="${slotY}" width="${plotWidth}" height="${ORF_OVERVIEW_ROW_HEIGHT}"></rect>`);
      }

      for (const mark of packed.marks) {
        const laneY = y + ORF_OVERVIEW_BAND_PADDING
          + mark.lane * ORF_OVERVIEW_ROW_HEIGHT
          + ORF_OVERVIEW_ROW_HEIGHT / 2;
        const arrow = orfArrowPath(mark.x1, mark.x2, laneY, mark.orf.strand);
        const width = mark.x2 - mark.x1;
        const markLabel = `ORF ${mark.index + 1} · ${mark.orf.aaLength} aa`;
        const estimatedLabelWidth = Math.max(50, markLabel.length * 5.1);
        const showLabel = width >= estimatedLabelWidth + 28;
        const labelCenter = (mark.x1 + mark.x2) / 2;
        const labelExclusion = showLabel
          ? { x1: labelCenter - estimatedLabelWidth / 2 - 6, x2: labelCenter + estimatedLabelWidth / 2 + 6 }
          : null;
        const chevrons = arrow.hasArrowhead
          ? orfChevronPath(arrow.bodyStart, arrow.bodyEnd, laneY, mark.orf.strand, arrow.headLength, arrow.height, labelExclusion)
          : "";
        const className = mark.orf.complete ? "complete" : "partial";
        const directionClass = mark.orf.strand === "-" ? "reverse" : "forward";
        const tinyClass = mark.minimumWidthApplied ? " is-tiny" : "";
        const inspection = makeOrfOverviewInspection(record, mark.orf, mark.index, geneticCode, mark.minimumWidthApplied);
        parts.push(
          `<path class="orf-overview-mark ${className} ${directionClass}${tinyClass}" data-record="${escapeXml(record.title)}" data-orf="${mark.index + 1}" data-frame="${escapeXml(frame)}" data-overview-lane="${mark.lane}" data-direction-shape="${arrow.hasArrowhead ? "arrow" : "bar"}" data-start="${mark.orf.start}" data-end="${mark.orf.end}" d="${arrow.d}"><title>${escapeXml(inspection)}</title></path>`
        );
        if (chevrons) parts.push(`<path class="orf-overview-chevron" data-record="${escapeXml(record.title)}" data-orf="${mark.index + 1}" d="${chevrons}"></path>`);
        if (showLabel) {
          parts.push(`<text class="orf-overview-mark-label" data-record="${escapeXml(record.title)}" data-orf="${mark.index + 1}" x="${labelCenter.toFixed(2)}" y="${laneY.toFixed(2)}">${escapeXml(markLabel)}</text>`);
        }
      }

    }

    appendOverviewRuler(parts, {
      y: recordLayout.rulerY,
      left,
      rightX: width - right,
      plotWidth,
      sequenceLength
    });
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function makePlaceholderSvg(title, lines) {
  const safeLines = lines.map((line) => escapeXml(line));
  const height = 120 + safeLines.length * 20;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${height}" role="img" aria-label="${escapeXml(title)}">`,
    "<style>",
    ".title{font:700 18px system-ui,sans-serif;fill:#263238}",
    ".note{font:12px system-ui,sans-serif;fill:#5c6b75}",
    "</style>",
    `<rect x="0" y="0" width="760" height="${height}" fill="white"/>`,
    `<text class="title" x="24" y="34">${escapeXml(title)}</text>`,
    ...safeLines.map((line, index) => `<text class="note" x="24" y="${66 + index * 20}">${line}</text>`),
    "</svg>"
  ].join("");
}

function makeOrfRows(records) {
  return records.flatMap((record) =>
    record.orfs.map((orf, index) => ({
      record: record.title,
      record_index: record.recordIndex,
      orf: index + 1,
      frame: orf.frame,
      strand: orf.strand,
      start: orf.start,
      end: orf.end,
      nt_length: orf.ntLength,
      aa_length: orf.aaLength,
      start_codon: orf.startCodon,
      stop_codon: orf.stopCodon,
      complete: orf.complete
    }))
  );
}

function makeOrfRecords(records) {
  return records.flatMap((record) =>
    record.orfs.map((orf, index) => ({
      record: record.title,
      sourceRecordIndex: record.recordIndex,
      orf: index + 1,
      header: makeFastaHeader(record.title, index + 1, orf, record.recordIndex),
      ...orf
    }))
  );
}

function getDownloadExtension(outputFormat) {
  if (outputFormat === "tsv") {
    return "tsv";
  }
  if (outputFormat === "nucleotide-fasta" || outputFormat === "protein-fasta") {
    return "fasta";
  }
  if (outputFormat === "svg-overview") {
    return "svg";
  }
  if (isInteractiveViewerFormat(outputFormat) || outputFormat === "orf-records") {
    return "json";
  }
  return "txt";
}

function getMimeType(outputFormat) {
  if (outputFormat === "svg-overview") {
    return "image/svg+xml;charset=utf-8";
  }
  if (outputFormat === "tsv") {
    return "text/tab-separated-values;charset=utf-8";
  }
  if (outputFormat === "nucleotide-fasta" || outputFormat === "protein-fasta") {
    return "text/x-fasta;charset=utf-8";
  }
  if (isInteractiveViewerFormat(outputFormat) || outputFormat === "orf-records") {
    return "application/json;charset=utf-8";
  }
  return "text/plain;charset=utf-8";
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}


function makeOrfViewerData(records, options = {}) {
  return makeDnaViewerData(records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.sequence.length,
    topology: options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear",
    tracks: record.orfs.length > 0
      ? [
          {
            id: "orfs",
            type: "features",
            label: "ORFs",
            layout: "stacked-intervals",
            items: record.orfs.map((orf, index) => ({
              start: orf.start,
              end: orf.end,
              length: orf.ntLength,
              label: `ORF ${index + 1} ${orf.frame} ${orf.aaLength} aa`,
              name: `ORF ${index + 1}`,
              type: orf.complete ? "complete ORF" : "partial ORF",
              color: orf.complete ? "#0f766e" : "#b7791f",
              strand: orf.strand,
              frame: orf.frame,
              translation: orf.protein,
              translationSource: "ORF Finder",
              translationTable: String(options.geneticCode ?? "1"),
              slot: FRAME_SLOT.get(orf.frame) ?? 0
            }))
          }
        ]
      : []
  })), {
    title: "ORF viewer",
    geneticCode: String(options.geneticCode ?? "1"),
    layout: options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear"
  });
}

function makeOrfFinderResult({ analyzedRecords, warnings, recordsProcessed, basesProcessed, charactersRemoved, options, formats }) {
  const outputFormat = options.outputFormat;
  const totalOrfs = analyzedRecords.reduce((sum, record) => sum + record.orfs.length, 0);
  const useSummaryReport = totalOrfs > LARGE_TEXT_ORF_THRESHOLD;
  if (useSummaryReport && formats.has("report")) {
    warnings.push(
      `Detailed ORF report rows were summarized because this run found ${totalOrfs} ORFs. Use table output for the full hit table.`
    );
  }
  const reportOutput = formats.has("report") ? (useSummaryReport ? makeSummaryReport(analyzedRecords) : makeReport(analyzedRecords)) : "";
  const tableRows = formats.has("tsv") ? makeOrfRows(analyzedRecords) : null;
  const tsvOutput = tableRows ? makeTsv(tableRows) : "";
  const nucleotideFastaOutput = formats.has("nucleotide-fasta") ? makeNucleotideFasta(analyzedRecords) : "";
  const proteinFastaOutput = formats.has("protein-fasta")
    ? makeProteinFasta(analyzedRecords, options.includeStopInProtein === true)
    : "";
  const withinOverviewSizeLimits = totalOrfs <= SVG_OVERVIEW_ORF_THRESHOLD &&
    basesProcessed <= SVG_OVERVIEW_BASE_THRESHOLD;
  const overviewLayout = formats.has("svg-overview") && withinOverviewSizeLimits
    ? makeOrfOverviewLayout(analyzedRecords)
    : null;
  const overviewLayoutTooTall = overviewLayout?.height > SVG_OVERVIEW_HEIGHT_THRESHOLD;
  const shouldDrawSvg = formats.has("svg-overview") &&
    withinOverviewSizeLimits &&
    !overviewLayoutTooTall;
  let svgOverviewOutput = "";
  const explorer = formats.has("orf-explorer") ? makeOrfExplorerData(analyzedRecords, options) : null;
  const viewer = [...formats].some(isInteractiveViewerFormat) ? makeOrfViewerData(analyzedRecords, options) : null;
  const orfRecords = formats.has("orf-records") ? makeOrfRecords(analyzedRecords) : null;
  if (shouldDrawSvg) {
    svgOverviewOutput = makeSvgOverview(analyzedRecords, options, overviewLayout);
  } else if (formats.has("svg-overview")) {
    const layoutDetail = overviewLayoutTooTall
      ? ` The densest reading frame needs ${overviewLayout.maxFrameLaneCount.toLocaleString()} non-overlapping display lanes, which would make the plot ${overviewLayout.height.toLocaleString()} px tall.`
      : "";
    warnings.push(`The ORF overview plot was not drawn because this run has ${totalOrfs} ORFs across ${basesProcessed} bases.${layoutDetail} Use table output, first-start nested ORFs, or stricter ORF filters for dense analyses.`);
    svgOverviewOutput = makePlaceholderSvg("ORF overview not drawn", [
      `${totalOrfs} ORFs across ${basesProcessed} bases.`,
      ...(overviewLayoutTooTall
        ? [`The densest reading frame needs ${overviewLayout.maxFrameLaneCount.toLocaleString()} lanes; the full plot would be ${overviewLayout.height.toLocaleString()} px tall.`]
        : []),
      "The graphical overview is suppressed for dense outputs to keep the figure usable.",
      "Use the ORF table, first start codon per stop region, or raise the minimum amino acid length."
    ]);
  }
  const output = outputFormat === "orf-explorer"
    ? `ORF explorer: ${totalOrfs} ORFs in ${recordsProcessed} sequence records.`
    : outputFormat === "tsv"
    ? tsvOutput
    : outputFormat === "nucleotide-fasta"
      ? nucleotideFastaOutput
    : outputFormat === "protein-fasta"
      ? proteinFastaOutput
      : outputFormat === "svg-overview"
        ? svgOverviewOutput
        : isInteractiveViewerFormat(outputFormat)
          ? JSON.stringify(viewer, null, 2)
          : outputFormat === "orf-records" ? JSON.stringify(orfRecords) : reportOutput;

  return makeToolResult({
    output,
    optionsUsed: options,
    visual: outputFormat === "orf-explorer" ? { viewer: explorer } : outputFormat === "svg-overview"
      ? { svg: output }
      : isInteractiveViewerFormat(outputFormat)
        ? { viewer }
        : undefined,
    download: {
      filename: `orf-finder.${getDownloadExtension(outputFormat)}`,
      mimeType: getMimeType(outputFormat)
    },
    warnings,
    recordsProcessed,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(explorer ? { explorer: { kind: "viewer", viewerType: "orf-explorer", viewer: explorer } } : {}),
      ...(formats.has("report") ? { report: makeTextStream(reportOutput, "text/plain") } : {}),
      ...(formats.has("tsv") ? { tsv: makeTextStream(tsvOutput, "text/tab-separated-values") } : {}),
      ...(formats.has("tsv") ? { table: makeTableStream(orfTableColumns, tableRows, "orf-finder") } : {}),
      ...(formats.has("nucleotide-fasta") ? { nucleotideFasta: makeTextStream(nucleotideFastaOutput, "text/x-fasta") } : {}),
      ...(formats.has("protein-fasta") ? { proteinFasta: makeTextStream(proteinFastaOutput, "text/x-fasta") } : {}),
      ...(formats.has("svg-overview") ? { overview: makeTextStream(svgOverviewOutput, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      ...(orfRecords ? { orfRecords: {
        kind: "orf-records",
        schema: "orf-finder",
        records: orfRecords
      } } : {})
    }
  });
}

export async function runOrfFinder(input, options = {}, executionContext = {}) {
  const effectiveOptions = normalizeOrfOptions(options);
  const formats = new Set([effectiveOptions.outputFormat]);
  for (const stream of Array.isArray(options?.requestedOrfOutputs) ? options.requestedOrfOutputs : []) {
    const format = Object.hasOwn(ORF_OUTPUT_FORMATS_BY_STREAM, stream) ? ORF_OUTPUT_FORMATS_BY_STREAM[stream] : null;
    if (format) formats.add(format === "interactive-viewer" && effectiveOptions.outputFormat === "interactive-circular-viewer" ? effectiveOptions.outputFormat : format);
  }
  const materializeSequences = [...formats].some(format => !["report", "tsv", "orf-explorer"].includes(format));
  // Many tiny records must not schedule a timer and UI update for each frame.
  let lastYield = -Infinity;
  let lastProgress = -Infinity;
  const context = {
    ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    },
    reportProgress(detail) {
      if (detail.phase === "parsing-input" || detail.phase === "building-output" || Date.now() - lastProgress >= 32) {
        executionContext.reportProgress?.(detail);
        lastProgress = Date.now();
      }
    }
  };
  context.reportProgress({ phase: "parsing-input", progress: 0.03 });
  await context.yieldIfNeeded();
  const opened = await openCleanDnaRnaFastaSource(input, {
    ...options, strictHeaders: true,
    maxSourceBases: ORF_LIMITS.maxInputCharacters,
    maxSourceRecords: 10_000, maxSourceBytes: 512 * 1024 * 1024, maxDecodedSourceBytes: 150 * 1024 * 1024,
    maxFastaHeaderCharacters: 10_000, maxTotalFastaHeaderCharacters: 5_000_000, maxIndexBytes: 16 * 1024 * 1024
  }, context);
  const budget = createOrfBudget();
  const analyzedRecords = [];
  const warnings = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let current;
  for await (const event of opened.events()) {
    context.throwIfCancelled?.();
    if (event.type === "record-start") current = { title: event.title, chunks: [] };
    else if (event.type === "sequence-chunk") current.chunks.push(event.text);
    else if (event.type === "record-end") {
      const sequence = current.chunks.join("");
      basesProcessed += event.length;
      charactersRemoved += event.removedCount;
      if (event.removedCount > 0) warnings.push(`${current.title}: removed ${event.removedCount} non-DNA/RNA character(s).`);
      if (!event.length) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      budget.setRecordTitle(formats.size === 1 && formats.has("orf-explorer") ? "" : current.title);
      const orfs = await findOrfs(sequence, effectiveOptions, context, budget, materializeSequences);
      analyzedRecords.push({ title: current.title, recordIndex: analyzedRecords.length + 1, sequence, orfs });
      context.reportProgress({ phase: "scanning-records", recordsProcessed: analyzedRecords.length, basesProcessed });
      current = null;
    }
  }
  warnings.push(...opened.warnings);
  if (!analyzedRecords.length) return makeToolResult({
    output: "", warnings: ["No sequence input was provided.", ...warnings],
    recordsProcessed: 0, basesProcessed: 0, charactersRemoved, optionsUsed: effectiveOptions
  });
  context.reportProgress({ phase: "building-output", progress: 0.95 });
  context.throwIfCancelled?.();
  const result = makeOrfFinderResult({ analyzedRecords, warnings, recordsProcessed: analyzedRecords.length,
    basesProcessed, charactersRemoved, options: effectiveOptions, formats });
  // Include the actual selected text and structured payload in the transport budget.
  // Explorer visual and workflow stream share one object in structured clone.
  // Count that payload once, without expanding nested ORF sequences.
  const transportResult = result.visual?.viewer?.viewerType === "orf-explorer"
    ? { ...result, visual: undefined } : result;
  if (JSON.stringify(transportResult).length > ORF_LIMITS.maxOutputCharacters) {
    throw new Error(`ORF result exceeds the ${ORF_LIMITS.maxOutputCharacters.toLocaleString("en-US")}-character output limit. Use fewer records or stricter ORF filters.`);
  }
  return result;
}

export const runOrfFinderWorker = runOrfFinder;
