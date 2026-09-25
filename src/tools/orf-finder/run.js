import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { getGeneticCode, getStartCodons, getStopCodons, makeCodonMap } from "../../core/genetic-code.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { featureArrowHeadLength } from "../../core/directional-feature-geometry.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const LARGE_TEXT_ORF_THRESHOLD = 2000;
export const SVG_OVERVIEW_ORF_THRESHOLD = 1500;
export const SVG_OVERVIEW_BASE_THRESHOLD = 500000;
export const SVG_OVERVIEW_HEIGHT_THRESHOLD = 2400;
const ORF_OVERVIEW_PLOT_ATTRIBUTE = `data-sms3-plot="orf-overview" data-plot-renderer="sms3-orf-overview"`;
const ORF_CHEVRON_SPACING = 24;
const ORF_LABEL_CHEVRON_GAP = 7;
const ORF_OVERVIEW_WIDTH = 980;
const ORF_OVERVIEW_LEFT = 90;
const ORF_OVERVIEW_RIGHT = 64;
const ORF_OVERVIEW_ROW_HEIGHT = 18;
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
  `[data-sms3-plot="orf-overview"] .orf-overview-frame-band{fill:#f8fafc;stroke:#e2e8f0;stroke-width:.8}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis{stroke:#475569;stroke-width:1.4}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-tick{stroke:#475569;stroke-width:1}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-minor-tick{stroke:#94a3b8;stroke-width:.75}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-label{font-size:11px;fill:#475569;stroke:none;text-shadow:none;paint-order:normal}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-lane{stroke:#dbe4ea;stroke-width:2;stroke-linecap:round}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark{stroke-width:1.1;stroke-linejoin:round}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark.complete{fill:#0f766e;stroke:#115e59}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark.partial{fill:#b45309;stroke:#92400e}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark.is-tiny{stroke-width:1.4}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-chevron{fill:none;stroke:#fff;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.6;pointer-events:none}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-mark-label{fill:#fff;font-size:9px;font-weight:600;text-anchor:middle;dominant-baseline:middle;pointer-events:none}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-legend text{font-size:10px;fill:#475569}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-legend-note{font-size:10px;fill:#64748b}`
].join("");

const FORWARD_FRAMES = [
  { label: "+1", strand: "+", offset: 0 },
  { label: "+2", strand: "+", offset: 1 },
  { label: "+3", strand: "+", offset: 2 }
];

const REVERSE_FRAMES = [
  { label: "-1", strand: "-", offset: 0 },
  { label: "-2", strand: "-", offset: 1 },
  { label: "-3", strand: "-", offset: 2 }
];
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
  { id: "complete", label: "Complete", type: "boolean" }
];

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function normalizeSequence(sequence) {
  return String(sequence ?? "").toUpperCase().replaceAll("U", "T");
}

function translateCodon(codon, codonMap) {
  return codonMap.get(codon) ?? "X";
}

function getFrames(strandOption) {
  if (strandOption === "forward") {
    return FORWARD_FRAMES;
  }
  if (strandOption === "reverse") {
    return REVERSE_FRAMES;
  }
  return [...FORWARD_FRAMES, ...REVERSE_FRAMES];
}

function mapCoordinates(sequenceLength, frame, startIndex, endExclusive) {
  if (frame.strand === "+") {
    return {
      start: startIndex + 1,
      end: endExclusive
    };
  }

  return {
    start: sequenceLength - endExclusive + 1,
    end: sequenceLength - startIndex
  };
}

function makeOrf({ sequence, sequenceLength, frame, startIndex, endExclusive, stopCodon, protein }) {
  const coordinates = mapCoordinates(sequenceLength, frame, startIndex, endExclusive);
  return {
    frame: frame.label,
    strand: frame.strand,
    start: coordinates.start,
    end: coordinates.end,
    ntLength: endExclusive - startIndex,
    aaLength: protein.length,
    startCodon: sequence.slice(startIndex, startIndex + 3),
    stopCodon,
    complete: stopCodon !== "",
    nucleotide: sequence.slice(startIndex, endExclusive),
    protein
  };
}

function findStartCodonOrfs(sequence, frame, context) {
  const orfs = [];
  let activeOrfs = [];

  for (let index = frame.offset; index + 3 <= sequence.length; index += 3) {
    const codon = sequence.slice(index, index + 3);

    if (context.stopCodons.has(codon)) {
      for (const active of activeOrfs) {
        orfs.push(
          makeOrf({
            sequence,
            sequenceLength: context.sequenceLength,
            frame,
            startIndex: active.startIndex,
            endExclusive: index + 3,
            stopCodon: codon,
            protein: active.protein
          })
        );
      }
      activeOrfs = [];
      continue;
    }

    for (const active of activeOrfs) {
      if (index !== active.startIndex) {
        active.protein += translateCodon(codon, context.codonMap);
      }
    }

    if (context.startCodons.has(codon) && (context.nestedMode === "all-starts" || activeOrfs.length === 0)) {
      activeOrfs.push({ startIndex: index, protein: "M" });
    }
  }

  if (context.includePartial) {
    for (const active of activeOrfs) {
      orfs.push(
        makeOrf({
          sequence,
          sequenceLength: context.sequenceLength,
          frame,
          startIndex: active.startIndex,
          endExclusive: active.startIndex + active.protein.length * 3,
          stopCodon: "",
          protein: active.protein
        })
      );
    }
  }

  return orfs;
}

function findAnyCodonOrfs(sequence, frame, context) {
  const orfs = [];
  let activeStart = frame.offset;
  let protein = "";

  for (let index = frame.offset; index + 3 <= sequence.length; index += 3) {
    const codon = sequence.slice(index, index + 3);

    if (context.stopCodons.has(codon)) {
      orfs.push(
        makeOrf({
          sequence,
          sequenceLength: context.sequenceLength,
          frame,
          startIndex: activeStart,
          endExclusive: index + 3,
          stopCodon: codon,
          protein
        })
      );
      activeStart = index + 3;
      protein = "";
      continue;
    }

    protein += translateCodon(codon, context.codonMap);
  }

  if (protein.length > 0 && context.includePartial) {
    orfs.push(
      makeOrf({
        sequence,
        sequenceLength: context.sequenceLength,
        frame,
        startIndex: activeStart,
        endExclusive: activeStart + protein.length * 3,
        stopCodon: "",
        protein
      })
    );
  }

  return orfs;
}

async function findStartCodonOrfsWithContext(sequence, frame, context, workerContext = {}) {
  const orfs = [];
  let activeOrfs = [];

  for (let index = frame.offset; index + 3 <= sequence.length; index += 3) {
    if (index > frame.offset && index % 30000 === frame.offset) {
      await workerContext.yieldIfNeeded?.();
    } else {
      workerContext.throwIfCancelled?.();
    }

    const codon = sequence.slice(index, index + 3);

    if (context.stopCodons.has(codon)) {
      for (const active of activeOrfs) {
        orfs.push(
          makeOrf({
            sequence,
            sequenceLength: context.sequenceLength,
            frame,
            startIndex: active.startIndex,
            endExclusive: index + 3,
            stopCodon: codon,
            protein: active.protein
          })
        );
      }
      activeOrfs = [];
      continue;
    }

    for (const active of activeOrfs) {
      if (index !== active.startIndex) {
        active.protein += translateCodon(codon, context.codonMap);
      }
    }

    if (context.startCodons.has(codon) && (context.nestedMode === "all-starts" || activeOrfs.length === 0)) {
      activeOrfs.push({ startIndex: index, protein: "M" });
    }
  }

  if (context.includePartial) {
    for (const active of activeOrfs) {
      orfs.push(
        makeOrf({
          sequence,
          sequenceLength: context.sequenceLength,
          frame,
          startIndex: active.startIndex,
          endExclusive: active.startIndex + active.protein.length * 3,
          stopCodon: "",
          protein: active.protein
        })
      );
    }
  }

  return orfs;
}

async function findAnyCodonOrfsWithContext(sequence, frame, context, workerContext = {}) {
  const orfs = [];
  let activeStart = frame.offset;
  let protein = "";

  for (let index = frame.offset; index + 3 <= sequence.length; index += 3) {
    if (index > frame.offset && index % 30000 === frame.offset) {
      await workerContext.yieldIfNeeded?.();
    } else {
      workerContext.throwIfCancelled?.();
    }

    const codon = sequence.slice(index, index + 3);

    if (context.stopCodons.has(codon)) {
      orfs.push(
        makeOrf({
          sequence,
          sequenceLength: context.sequenceLength,
          frame,
          startIndex: activeStart,
          endExclusive: index + 3,
          stopCodon: codon,
          protein
        })
      );
      activeStart = index + 3;
      protein = "";
      continue;
    }

    protein += translateCodon(codon, context.codonMap);
  }

  if (protein.length > 0 && context.includePartial) {
    orfs.push(
      makeOrf({
        sequence,
        sequenceLength: context.sequenceLength,
        frame,
        startIndex: activeStart,
        endExclusive: activeStart + protein.length * 3,
        stopCodon: "",
        protein
      })
    );
  }

  return orfs;
}

function sortOrfs(orfs, sortBy = "start") {
  const byStart = (left, right) =>
    left.start - right.start || left.end - right.end || left.frame.localeCompare(right.frame);
  const byFrame = (left, right) =>
    left.strand.localeCompare(right.strand) ||
    left.frame.localeCompare(right.frame) ||
    left.start - right.start ||
    left.end - right.end;

  return [...orfs].sort((left, right) => {
    if (sortBy === "length-desc") {
      return right.aaLength - left.aaLength || byStart(left, right);
    }
    if (sortBy === "frame") {
      return byFrame(left, right);
    }
    if (sortBy === "complete") {
      return Number(right.complete) - Number(left.complete) || byStart(left, right);
    }
    return byStart(left, right);
  });
}

export function findOrfs(sequence, options = {}) {
  const normalized = normalizeSequence(sequence);
  const code = getGeneticCode(options.geneticCode ?? "1");
  const context = {
    codonMap: makeCodonMap(code),
    startCodons: getStartCodons(code),
    stopCodons: getStopCodons(code),
    includePartial: options.includePartial !== false,
    nestedMode: options.nestedMode === "all-starts" ? "all-starts" : "first-start",
    sequenceLength: normalized.length
  };
  const frames = getFrames(options.strand);
  const minimumAminoAcids = Math.max(1, Number.parseInt(options.minimumAminoAcids, 10) || 1);
  const startMode = options.startMode === "any-codon" ? "any-codon" : "start-codon";
  const orfs = [];

  for (const frame of frames) {
    const frameSequence = frame.strand === "-" ? reverseComplement(normalized) : normalized;
    const frameOrfs =
      startMode === "any-codon"
        ? findAnyCodonOrfs(frameSequence, frame, context)
        : findStartCodonOrfs(frameSequence, frame, context);

    orfs.push(...frameOrfs.filter((orf) => orf.aaLength >= minimumAminoAcids));
  }

  return sortOrfs(orfs, options.sortBy);
}

async function findOrfsWithContext(sequence, options = {}, workerContext = {}) {
  const normalized = normalizeSequence(sequence);
  const code = getGeneticCode(options.geneticCode ?? "1");
  const context = {
    codonMap: makeCodonMap(code),
    startCodons: getStartCodons(code),
    stopCodons: getStopCodons(code),
    includePartial: options.includePartial !== false,
    nestedMode: options.nestedMode === "all-starts" ? "all-starts" : "first-start",
    sequenceLength: normalized.length
  };
  const frames = getFrames(options.strand);
  const minimumAminoAcids = Math.max(1, Number.parseInt(options.minimumAminoAcids, 10) || 1);
  const startMode = options.startMode === "any-codon" ? "any-codon" : "start-codon";
  const orfs = [];

  for (const [index, frame] of frames.entries()) {
    await workerContext.yieldIfNeeded?.();
    const frameSequence = frame.strand === "-" ? reverseComplement(normalized) : normalized;
    const frameOrfs =
      startMode === "any-codon"
        ? await findAnyCodonOrfsWithContext(frameSequence, frame, context, workerContext)
        : await findStartCodonOrfsWithContext(frameSequence, frame, context, workerContext);

    orfs.push(...frameOrfs.filter((orf) => orf.aaLength >= minimumAminoAcids));
    workerContext.reportProgress?.({
      phase: "scanning-frames",
      progress: (index + 1) / frames.length,
      framesProcessed: index + 1,
      totalFrames: frames.length
    });
  }

  return sortOrfs(orfs, options.sortBy);
}

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

function makeTsv(records) {
  const rows = [
    [
      "record",
      "orf",
      "frame",
      "strand",
      "start",
      "end",
      "nt_length",
      "aa_length",
      "start_codon",
      "stop_codon",
      "complete"
    ].join("\t")
  ];

  for (const record of records) {
    record.orfs.forEach((orf, index) => {
      rows.push(formatOrfRow(record.title, index + 1, orf).join("\t"));
    });
  }

  return rows.join("\n");
}

function makeReport(records) {
  const lines = [];

  for (const record of records) {
    lines.push(`${record.title} ORFs`);
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
    lines.push(`${record.title} ORFs`);
    lines.push(`ORFs found: ${record.orfs.length}`);
    lines.push(`Complete ORFs: ${completeCount}`);
    lines.push(`Partial ORFs: ${partialCount}`);
    lines.push(`Longest ORF: ${longest} aa`);
    lines.push("");
  }

  lines.push(`Total ORFs: ${records.reduce((sum, record) => sum + record.orfs.length, 0)}`);
  return lines.join("\n").trimEnd();
}

function makeFastaHeader(recordTitle, index, orf) {
  return `record=${recordTitle} orf=${index} strand=${orf.strand} frame=${orf.frame} start=${orf.start} end=${orf.end} aa_length=${orf.aaLength} complete=${orf.complete ? "yes" : "no"}`;
}

function makeNucleotideFasta(records) {
  const outputParts = [];

  for (const record of records) {
    record.orfs.forEach((orf, index) => {
      outputParts.push(formatFastaRecord(makeFastaHeader(record.title, index + 1, orf), orf.nucleotide, 60));
    });
  }

  return outputParts.join("\n");
}

function makeProteinFasta(records, includeStopInProtein = false) {
  const outputParts = [];

  for (const record of records) {
    record.orfs.forEach((orf, index) => {
      const protein = includeStopInProtein && orf.complete ? `${orf.protein}*` : orf.protein;
      outputParts.push(formatFastaRecord(makeFastaHeader(record.title, index + 1, orf), protein, 60));
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

export function packOrfOverviewMarks(marks, gap = 3) {
  const laneEnds = [];
  const packed = [...marks]
    .sort((left, right) => left.x1 - right.x1 || right.x2 - left.x2 || left.index - right.index)
    .map((mark) => {
      let lane = laneEnds.findIndex((laneEnd) => mark.x1 > laneEnd + gap);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = Math.max(laneEnds[lane] ?? Number.NEGATIVE_INFINITY, mark.x2);
      return { ...mark, lane };
    });
  return { marks: packed, laneCount: Math.max(1, laneEnds.length) };
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

function orfArrowPath(x1, x2, y, strand, height = 12) {
  const half = height / 2;
  const width = Math.max(1, x2 - x1);
  const head = featureArrowHeadLength(width, height, strand);
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
      hasArrowhead: false
    };
  }
  if (strand === "-") {
    return {
      d: `M${x2.toFixed(2)} ${(y - half).toFixed(2)} H${(x1 + head).toFixed(2)} L${x1.toFixed(2)} ${y.toFixed(2)} L${(x1 + head).toFixed(2)} ${(y + half).toFixed(2)} H${x2.toFixed(2)} Z`,
      bodyStart: x1 + head,
      bodyEnd: x2,
      hasArrowhead: true
    };
  }
  return {
    d: `M${x1.toFixed(2)} ${(y - half).toFixed(2)} H${(x2 - head).toFixed(2)} L${x2.toFixed(2)} ${y.toFixed(2)} L${(x2 - head).toFixed(2)} ${(y + half).toFixed(2)} H${x1.toFixed(2)} Z`,
    bodyStart: x1,
    bodyEnd: x2 - head,
    hasArrowhead: true
  };
}

function orfChevronPath(bodyStart, bodyEnd, y, strand, exclusion = null) {
  const available = bodyEnd - bodyStart;
  if (available < 24) return "";
  const chevronBounds = strand === "-" ? { min: -1, max: 3 } : { min: -3, max: 1 };
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
      parts.push(`M${(x + 3).toFixed(2)} ${(y - 3.5).toFixed(2)} L${(x - 1).toFixed(2)} ${y.toFixed(2)} L${(x + 3).toFixed(2)} ${(y + 3.5).toFixed(2)}`);
    } else {
      parts.push(`M${(x - 3).toFixed(2)} ${(y - 3.5).toFixed(2)} L${(x + 1).toFixed(2)} ${y.toFixed(2)} L${(x - 3).toFixed(2)} ${(y + 3.5).toFixed(2)}`);
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
    parts.push(`<text class="orf-overview-record-title" x="16" y="${recordLayout.titleY}">${escapeXml(record.title)} (${orfCountLabel})</text>`);

    for (const frameLayout of recordLayout.frameLayouts) {
      const { frame, y, frameHeight, frameCenter, packed } = frameLayout;
      parts.push(`<rect class="orf-overview-frame-band" x="${left - 5}" y="${y}" width="${plotWidth + 10}" height="${frameHeight}" rx="5"></rect>`);
      parts.push(`<text class="orf-overview-frame-label" x="24" y="${frameCenter + 4}">${frame}</text>`);
      for (let lane = 0; lane < packed.laneCount; lane += 1) {
        const laneY = y + ORF_OVERVIEW_BAND_PADDING
          + lane * ORF_OVERVIEW_ROW_HEIGHT
          + ORF_OVERVIEW_ROW_HEIGHT / 2;
        parts.push(`<line class="orf-overview-lane" x1="${left}" y1="${laneY}" x2="${width - right}" y2="${laneY}"></line>`);
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
          ? orfChevronPath(arrow.bodyStart, arrow.bodyEnd, laneY, mark.orf.strand, labelExclusion)
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
      orf: index + 1,
      header: makeFastaHeader(record.title, index + 1, orf),
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
  if (isInteractiveViewerFormat(outputFormat)) {
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
  if (isInteractiveViewerFormat(outputFormat)) {
    return "application/json;charset=utf-8";
  }
  return "text/plain;charset=utf-8";
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function normalizeOutputFormat(outputFormat) {
  const outputFormats = new Set(["report", "tsv", "nucleotide-fasta", "protein-fasta", "svg-overview", "interactive-viewer", "interactive-circular-viewer"]);
  return outputFormats.has(outputFormat) ? outputFormat : "svg-overview";
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

function makeOrfFinderResult({ analyzedRecords, warnings, recordsProcessed, basesProcessed, charactersRemoved, options }) {
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const totalOrfs = analyzedRecords.reduce((sum, record) => sum + record.orfs.length, 0);
  const useSummaryReport = totalOrfs > LARGE_TEXT_ORF_THRESHOLD;
  if (useSummaryReport && outputFormat === "report") {
    warnings.push(
      `Detailed ORF report rows were summarized because this run found ${totalOrfs} ORFs. Use table output for the full hit table.`
    );
  }
  const reportOutput = useSummaryReport ? makeSummaryReport(analyzedRecords) : makeReport(analyzedRecords);
  const tsvOutput = outputFormat === "tsv" ? makeTsv(analyzedRecords) : "";
  const nucleotideFastaOutput = outputFormat === "nucleotide-fasta" ? makeNucleotideFasta(analyzedRecords) : "";
  const proteinFastaOutput = outputFormat === "protein-fasta"
    ? makeProteinFasta(analyzedRecords, options.includeStopInProtein === true)
    : "";
  const withinOverviewSizeLimits = totalOrfs <= SVG_OVERVIEW_ORF_THRESHOLD &&
    basesProcessed <= SVG_OVERVIEW_BASE_THRESHOLD;
  const overviewLayout = outputFormat === "svg-overview" && withinOverviewSizeLimits
    ? makeOrfOverviewLayout(analyzedRecords)
    : null;
  const overviewLayoutTooTall = overviewLayout?.height > SVG_OVERVIEW_HEIGHT_THRESHOLD;
  const shouldDrawSvg = outputFormat === "svg-overview" &&
    withinOverviewSizeLimits &&
    !overviewLayoutTooTall;
  let svgOverviewOutput = "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makeOrfViewerData(analyzedRecords, options) : null;
  if (shouldDrawSvg) {
    svgOverviewOutput = makeSvgOverview(analyzedRecords, options, overviewLayout);
  } else if (outputFormat === "svg-overview") {
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
  const output = outputFormat === "tsv"
    ? tsvOutput
    : outputFormat === "nucleotide-fasta"
      ? nucleotideFastaOutput
    : outputFormat === "protein-fasta"
      ? proteinFastaOutput
      : outputFormat === "svg-overview"
        ? svgOverviewOutput
        : isInteractiveViewerFormat(outputFormat)
          ? JSON.stringify(viewer, null, 2)
          : reportOutput;

  return makeToolResult({
    output,
    visual: outputFormat === "svg-overview"
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
      ...(outputFormat === "report" ? { report: makeTextStream(reportOutput, "text/plain") } : {}),
      ...(outputFormat === "tsv" ? { tsv: makeTextStream(tsvOutput, "text/tab-separated-values") } : {}),
      table: makeTableStream(orfTableColumns, makeOrfRows(analyzedRecords), "orf-finder"),
      ...(outputFormat === "nucleotide-fasta" ? { nucleotideFasta: makeTextStream(nucleotideFastaOutput, "text/x-fasta") } : {}),
      ...(outputFormat === "protein-fasta" ? { proteinFasta: makeTextStream(proteinFastaOutput, "text/x-fasta") } : {}),
      ...(outputFormat === "svg-overview" ? { overview: makeTextStream(svgOverviewOutput, "image/svg+xml") } : {}),
      ...(isInteractiveViewerFormat(outputFormat) ? { viewer: makeDnaViewerStream(viewer) } : {}),
      orfRecords: {
        kind: "orf-records",
        schema: "orf-finder",
        records: makeOrfRecords(analyzedRecords)
      }
    }
  });
}

export function runOrfFinder(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    analyzedRecords.push({
      title: record.title,
      sequence: cleaned.sequence,
      orfs: findOrfs(cleaned.sequence, options)
    });
  }

  return makeOrfFinderResult({
    analyzedRecords,
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    options
  });
}

export async function runOrfFinderWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.03 });
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const [index, record] of records.entries()) {
    await context.yieldIfNeeded?.();
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    const orfs = await findOrfsWithContext(cleaned.sequence, options, context);
    analyzedRecords.push({
      title: record.title,
      sequence: cleaned.sequence,
      orfs
    });
    context.reportProgress?.({
      phase: "scanning-records",
      progress: 0.03 + ((index + 1) / records.length) * 0.87,
      recordsProcessed: index + 1,
      totalRecords: records.length
    });
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  context.throwIfCancelled?.();
  return makeOrfFinderResult({
    analyzedRecords,
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    options
  });
}
