import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { getGeneticCode, getStartCodons, getStopCodons, makeCodonMap } from "../../core/genetic-code.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const LARGE_TEXT_ORF_THRESHOLD = 2000;
const SVG_OVERVIEW_ORF_THRESHOLD = 1500;
const SVG_OVERVIEW_BASE_THRESHOLD = 500000;
const ORF_OVERVIEW_PLOT_ATTRIBUTE = `data-sms3-plot="orf-overview" data-plot-renderer="sms3-orf-overview"`;
const ORF_OVERVIEW_STYLE = [
  `[data-sms3-plot="orf-overview"] text{font-family:Inter,Arial,sans-serif;font-size:12px;fill:#172026;stroke:none;text-shadow:none;paint-order:normal}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis{stroke:#475569;stroke-width:1.4}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-tick{stroke:#475569;stroke-width:1}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-minor-tick{stroke:#94a3b8;stroke-width:.75}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-axis-label{font-size:11px;fill:#475569;stroke:none;text-shadow:none;paint-order:normal}`,
  `[data-sms3-plot="orf-overview"] .complete{fill:#0f766e}`,
  `[data-sms3-plot="orf-overview"] .partial{fill:#b7791f}`,
  `[data-sms3-plot="orf-overview"] .orf-overview-lane{stroke:#eef2f5;stroke-width:8;stroke-linecap:round}`
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

function makeSvgOverview(records) {
  const width = 980;
  const left = 90;
  const right = 64;
  const laneHeight = 26;
  const recordGap = 36;
  const titleHeight = 28;
  const plotWidth = width - left - right;
  const frames = ["+1", "+2", "+3", "-1", "-2", "-3"];
  let y = 24;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 1" role="img" aria-label="ORF overview" ${ORF_OVERVIEW_PLOT_ATTRIBUTE}>`,
    `<style>${ORF_OVERVIEW_STYLE}</style>`
  ];

  for (const record of records) {
    const sequenceLength = Math.max(1, record.sequence.length, ...record.orfs.map((orf) => orf.end));
    parts.push(`<text x="16" y="${y}">${escapeXml(record.title)} (${record.orfs.length} ORFs)</text>`);
    y += titleHeight;

    for (const frame of frames) {
      const laneY = y + laneHeight / 2;
      parts.push(`<text x="24" y="${laneY + 4}">${frame}</text>`);
      parts.push(`<line class="orf-overview-lane" x1="${left}" y1="${laneY}" x2="${width - right}" y2="${laneY}"></line>`);

      for (const orf of record.orfs.filter((item) => item.frame === frame)) {
        const x = intervalStartToX(orf.start, sequenceLength, left, plotWidth);
        const x2 = intervalEndToX(orf.end, sequenceLength, left, plotWidth);
        const rectWidth = Math.max(2, x2 - x);
        const className = orf.complete ? "complete" : "partial";
        parts.push(
          `<rect class="${className}" x="${x.toFixed(2)}" y="${laneY - 6}" width="${rectWidth.toFixed(2)}" height="12" rx="2"><title>${escapeXml(`${record.title} ${orf.frame} ${orf.start}-${orf.end} ${orf.aaLength} aa ${orf.complete ? "complete" : "partial"}`)}</title></rect>`
        );
      }

      y += laneHeight;
    }

    appendOverviewRuler(parts, {
      y,
      left,
      rightX: width - right,
      plotWidth,
      sequenceLength
    });
    y += recordGap;
  }

  parts[0] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${Math.max(120, y)}" role="img" aria-label="ORF overview" ${ORF_OVERVIEW_PLOT_ATTRIBUTE}>`;
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
  return outputFormats.has(outputFormat) ? outputFormat : "report";
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
  const shouldDrawSvg = outputFormat === "svg-overview" &&
    totalOrfs <= SVG_OVERVIEW_ORF_THRESHOLD &&
    basesProcessed <= SVG_OVERVIEW_BASE_THRESHOLD;
  let svgOverviewOutput = "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makeOrfViewerData(analyzedRecords, options) : null;
  if (shouldDrawSvg) {
    svgOverviewOutput = makeSvgOverview(analyzedRecords);
  } else if (outputFormat === "svg-overview") {
    warnings.push(
      `The ORF overview plot was not drawn because this run has ${totalOrfs} ORFs across ${basesProcessed} bases. Use table output or stricter ORF filters for dense analyses.`
    );
    svgOverviewOutput = makePlaceholderSvg("ORF overview not drawn", [
      `${totalOrfs} ORFs across ${basesProcessed} bases.`,
      "The graphical overview is suppressed for dense outputs to keep the browser responsive.",
      "Use the ORF table or raise the minimum amino acid length for a drawable overview."
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
