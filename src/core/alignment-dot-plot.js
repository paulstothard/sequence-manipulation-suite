import { isolateSvgStyles } from "./svg-style-scope.js";
import "../vendor/d3/d3.min.js";
import { DOT_PLOT_LIMITS as LIMITS, normalizeDotPlotOptions } from "./alignment-dot-plot-options.js";
import { parseSequenceInput } from "./fasta.js";
import { exportDelimitedTable } from "./table.js";
import { cleanSequence as cleanBiologicalSequence } from "./sequence.js";
import { applyAxisLimits } from "./plot-tools.js";
import { makePlaceholderSvg } from "./plot-renderer.js";
import { annotatePointCrowding } from "./point-plot-inspection.js";
import { fitSideLegendLabel } from "./plot-side-legend.js";
import {
  makePublicationPlotStyle,
  publicationPlotCss,
  publicationSvgAttributes,
  SMS3_PLOT_THEME
} from "./publication-plot-style.js";

export const alignmentDotPlotColumns = [
  { id: "orientation", label: "Orientation", type: "string" },
  { id: "sequence_a", label: "Sequence A", type: "string" },
  { id: "sequence_a_start", label: "Sequence A start", type: "number" },
  { id: "sequence_a_end", label: "Sequence A end", type: "number" },
  { id: "sequence_b", label: "Sequence B", type: "string" },
  { id: "sequence_b_start", label: "Sequence B start", type: "number" },
  { id: "sequence_b_end", label: "Sequence B end", type: "number" },
  { id: "word", label: "Word", type: "string" }
];

const DNA_RNA_CHARACTERS = new Set("ACGTURYSWKMBDHVNX".split(""));
const PROTEIN_CHARACTERS = new Set("ACDEFGHIKLMNPQRSTVWYBXZJUO*".split(""));
const DNA_COMPLEMENT = new Map(Object.entries({
  A: "T",
  C: "G",
  G: "C",
  T: "A",
  U: "A",
  R: "Y",
  Y: "R",
  S: "S",
  W: "W",
  K: "M",
  M: "K",
  B: "V",
  D: "H",
  H: "D",
  V: "B",
  N: "N",
  X: "X"
}));

function detectAlphabet(records) {
  const joined = records.map((record) => record.sequence).join("").toUpperCase().replace(/[-.\s]/g, "");
  if (!joined) return "dna-rna";
  let dnaLike = 0;
  let proteinLike = 0;
  for (const character of joined) {
    if (DNA_RNA_CHARACTERS.has(character)) dnaLike += 1;
    if (PROTEIN_CHARACTERS.has(character)) proteinLike += 1;
  }
  return dnaLike / joined.length >= 0.85 ? "dna-rna" : "protein";
}

function reverseComplement(sequence) {
  return String(sequence ?? "")
    .toUpperCase()
    .split("")
    .reverse()
    .map((character) => DNA_COMPLEMENT.get(character) ?? "N")
    .join("");
}

async function makeKmerIndex(sequence, wordSize, context) {
  const index = new Map();
  for (let position = 0; position <= sequence.length - wordSize; position += 1) {
    if (position % 8192 === 0) { context.throwIfCancelled?.(); await context.yieldIfNeeded?.(); }
    const word = sequence.slice(position, position + wordSize);
    if (!index.has(word)) {
      index.set(word, []);
    }
    index.get(word).push(position + 1);
  }
  return index;
}

async function collectMatches({ sequenceA, sequenceB, sequenceATitle, sequenceBTitle, wordSize, includeReverseComplement, alphabet, maxMatches, outputFormat }, context = {}) {
  // Exact tuple matching background: EMBOSS dottup documentation,
  // https://emboss.sourceforge.net/apps/cvs/emboss/apps/dottup.html
  // This local implementation retains every overlapping word pair and displays
  // midpoints, with a separate reverse-complement orientation for nucleotides.
  const matches = [];
  const counts = { direct: 0, "reverse-complement": 0 };
  const retainedCounts = { direct: 0, "reverse-complement": 0 };
  let retainedCount = 0, retainedCharacters = 0, plotSuppressed = false;
  const comparisonB = alphabet === "dna-rna" ? sequenceB.replaceAll("U", "T") : sequenceB;
  const directIndex = await makeKmerIndex(comparisonB, wordSize, context);
  const reverseSequenceB = alphabet === "dna-rna" && includeReverseComplement ? reverseComplement(sequenceB) : "";
  const reverseIndex = reverseSequenceB ? await makeKmerIndex(reverseSequenceB, wordSize, context) : null;
  context.reportProgress?.({ phase: "matching", progress: 0.5 });
  for (let positionA = 0; positionA <= sequenceA.length - wordSize; positionA += 1) {
    if (positionA % 8192 === 0) { context.throwIfCancelled?.(); await context.yieldIfNeeded?.(); }
    const word = sequenceA.slice(positionA, positionA + wordSize);
    const comparisonWord = alphabet === "dna-rna" ? word.replaceAll("U", "T") : word;
    for (const [orientation,index] of [["direct",directIndex],["reverse-complement",reverseIndex]]) {
      const starts = index?.get(comparisonWord) ?? [];
      counts[orientation] += starts.length;
      const keep = Math.min(starts.length, maxMatches - retainedCount);
      retainedCounts[orientation] += keep;
      retainedCount += keep;
      if (outputFormat === "svg" && retainedCount > LIMITS.svgPoints) {
        plotSuppressed = true;
        matches.length = 0;
        retainedCharacters = 0;
      }
      // Omitted pairs are counted from the bucket length, never enumerated.
      // Reports need only counts; an over-dense plot retains no hidden rows.
      if (outputFormat === "report" || plotSuppressed) continue;
      for (let j = 0; j < keep; j += 1) {
        if (j % 2048 === 0) { context.throwIfCancelled?.(); if (j) await context.yieldIfNeeded?.(); }
        const endB = orientation === "direct" ? starts[j] + wordSize - 1 : sequenceB.length - starts[j] + 1;
        const match = { orientation, sequence_a: sequenceATitle, sequence_a_start: positionA + 1, sequence_a_end: positionA + wordSize,
          sequence_b: sequenceBTitle, sequence_b_start: endB - wordSize + 1, sequence_b_end: endB, word };
        retainedCharacters += JSON.stringify(match).length;
        if (retainedCharacters > LIMITS.outputCharacters) throw new Error(`Dot plot retained rows exceed the ${LIMITS.outputCharacters.toLocaleString()}-character output limit. Reduce Maximum matches to keep.`);
        matches.push(match);
      }
    }
  }
  return { matches, counts, retainedCounts, retainedCharacters, plotSuppressed, omittedMatches: counts.direct + counts["reverse-complement"] - retainedCount };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPosition(value) {
  return value.toLocaleString("en-US", { maximumSignificantDigits: 21 });
}

function getD3() {
  return globalThis.d3 ?? null;
}

function axisTicks(domain, count = 5) {
  const [min, max] = domain;
  const d3 = getD3();
  if (d3?.scaleLinear) {
    const ticks = d3.scaleLinear().domain(domain).ticks(count);
    const rounded = ticks.filter((tick) => tick >= min && tick <= max);
    if (rounded.length > 0) {
      return [...new Set(rounded)];
    }
  }
  const ticks = [];
  for (let index = 0; index < count; index += 1) {
    ticks.push(min + (index / Math.max(1, count - 1)) * (max - min));
  }
  return [...new Set(ticks)];
}

function matchPoint(match) {
  return {
    x: (match.sequence_a_start + match.sequence_a_end) / 2,
    y: (match.sequence_b_start + match.sequence_b_end) / 2,
    sequence_a_start: match.sequence_a_start,
    sequence_a_end: match.sequence_a_end,
    sequence_b_start: match.sequence_b_start,
    sequence_b_end: match.sequence_b_end,
    orientation: match.orientation,
    word: match.word
  };
}

function dotPlotTitle(alphabet) {
  return alphabet === "protein" ? "Protein dot plot" : "DNA/RNA dot plot";
}

export function renderAlignmentDotPlotSvg(...args) {
  return isolateSvgStyles(renderAlignmentDotPlotSvgUnscoped(...args));
}

function renderAlignmentDotPlotSvgUnscoped({ records, matches, omittedMatches, wordSize, alphabet = "dna-rna", includeReverseComplement = true, xDomain, yDomain }) {
  const [sequenceA, sequenceB] = records;
  const width = 900;
  const height = 800;
  const publicationStyle = makePublicationPlotStyle(width, height);
  const margin = { top: 82, right: 70, bottom: 128, left: 112 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const d3 = getD3();
  xDomain ??= sequenceA.sequence.length === 1 ? [0.5,1.5] : [1, sequenceA.sequence.length];
  yDomain ??= sequenceB.sequence.length === 1 ? [0.5,1.5] : [1, sequenceB.sequence.length];
  const d3XScale = d3?.scaleLinear?.().domain(xDomain).range([margin.left, margin.left + plotWidth]);
  const d3YScale = d3?.scaleLinear?.().domain(yDomain).range([margin.top + plotHeight, margin.top]);
  const xScale = (value) => d3XScale ? d3XScale(value) : margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const yScale = (value) => d3YScale ? d3YScale(value) : margin.top + plotHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight;
  const points = annotatePointCrowding(matches.map(matchPoint).filter(point => point.x >= xDomain[0] && point.x <= xDomain[1] && point.y >= yDomain[0] && point.y <= yDomain[1]).map((point) => ({
    ...point,
    plotX: xScale(point.x),
    plotY: yScale(point.y)
  })), { getX: (point) => point.plotX, getY: (point) => point.plotY });
  const directPoints = points.filter((point) => point.orientation === "direct");
  const reversePoints = points.filter((point) => point.orientation === "reverse-complement");
  const showReverseComplementLegend = alphabet === "dna-rna" && includeReverseComplement;
  const title = dotPlotTitle(alphabet);
  const hasStops = alphabet === "protein" && records.some(record => record.sequence.includes("*"));
  const unit = alphabet === "protein" ? (hasStops ? "position" : "residue") : "base";
  const plotNote = `Exact ${wordSize}-${unit} word matches between two sequences; ${omittedMatches > 0 ? `${omittedMatches.toLocaleString()} matches omitted by the match cap.` : ""} ${points.length < matches.length ? `${points.length.toLocaleString()} of ${matches.length.toLocaleString()} retained matches inside axis limits.` : "All retained matches shown."}`;
  const noteLines = plotNote.match(/.{1,105}(?:\s|$)/g).map(line => line.trim());
  const axisLabel = (title, availableWidth) => {
    // Use the shared label fitter; reserve room for wider non-Latin glyphs.
    const fontSize = publicationStyle.axisLabelFontSize * (/[^\x00-\x7f]/u.test(title) ? 1.6 : 1);
    const fitted = fitSideLegendLabel(title, availableWidth - 10 * fontSize, fontSize);
    return `${escapeXml(fitted)} position${fitted === title ? "" : `<title>${escapeXml(title)} position</title>`}`;
  };
  const pointRadius = points.length > 8000 ? 1.1 : points.length > 2000 ? 1.4 : 1.9;
  const opacity = points.length > 8000 ? 0.38 : points.length > 2000 ? 0.55 : 0.78;
  const xTicks = axisTicks(xDomain, 6);
  const yTicks = axisTicks(yDomain, 6);
  const coordinateUnit = alphabet === "protein" ? (hasStops ? "positions" : "aa") : "bp";

  const pointElements = (items, color) => items.map((point) => {
    const details = [
      point.orientation === "reverse-complement" ? "Reverse-complement match" : "Direct match",
      `Matched word: ${point.word}`,
      `Sequence A (x): ${point.sequence_a_start.toLocaleString()}–${point.sequence_a_end.toLocaleString()} ${coordinateUnit}`,
      `Sequence B (y): ${point.sequence_b_start.toLocaleString()}–${point.sequence_b_end.toLocaleString()} ${coordinateUnit}`
    ];
    const nearbyCount = point.inspectionCrowding?.count ?? 1;
    if (nearbyCount > 1) details.push(`Nearby matches: ${nearbyCount.toLocaleString()} shown here`);
    return `<circle data-sms3-nearest-point="true" cx="${point.plotX.toFixed(2)}" cy="${point.plotY.toFixed(2)}" r="${pointRadius}" fill="${color}" fill-opacity="${opacity}"><title>${escapeXml(details.join("; "))}</title></circle>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" ${publicationSvgAttributes(publicationStyle)} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-alignment-dot-plot" data-plot-renderer="sms3-d3" data-sms3-publication-theme="default" data-grid-lines="hidden" data-x-domain="${xDomain.join(",")}" data-y-domain="${yDomain.join(",")}">
  <style>${publicationPlotCss(publicationStyle)}</style>
  <rect width="${width}" height="${height}" fill="${SMS3_PLOT_THEME.surface}"/>
  <text class="title" x="${margin.left}" y="34">${escapeXml(title)}</text>
  <rect class="plot-background" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="${SMS3_PLOT_THEME.surface}"/>
  <defs><clipPath id="sms3-${alphabet}-dot-clip"><rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"/></clipPath></defs>
  <g clip-path="url(#sms3-${alphabet}-dot-clip)">${pointElements(directPoints, SMS3_PLOT_THEME.categorical[0])}
  ${pointElements(reversePoints, SMS3_PLOT_THEME.categorical[1])}</g>
  <line class="axis-rule" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}"/>
  <line class="axis-rule" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}"/>
  ${xTicks.map((tick) => `<line class="axis-tick x-tick" x1="${xScale(tick).toFixed(2)}" x2="${xScale(tick).toFixed(2)}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight + publicationStyle.tickLength}"/><text class="tick-label" x="${xScale(tick).toFixed(2)}" y="${margin.top + plotHeight + 23}" text-anchor="middle">${escapeXml(formatPosition(tick))}</text>`).join("\n")}
  ${yTicks.map((tick) => `<line class="axis-tick y-tick" x1="${margin.left - publicationStyle.tickLength}" x2="${margin.left}" y1="${yScale(tick).toFixed(2)}" y2="${yScale(tick).toFixed(2)}"/><text class="tick-label" x="${margin.left - publicationStyle.tickLength - 7}" y="${(yScale(tick) + publicationStyle.bodyFontSize * 0.34).toFixed(2)}" text-anchor="end">${escapeXml(formatPosition(tick))}</text>`).join("\n")}
  <text class="axis-label" x="${margin.left + plotWidth / 2}" y="${height - 64}" text-anchor="middle">${axisLabel(sequenceA.title, plotWidth)}</text>
  ${noteLines.map((line,index) => `<text class="note" x="${margin.left + plotWidth / 2}" y="${height - 40 + index * 14}" text-anchor="middle">${escapeXml(line)}</text>`).join("\n")}
  <text class="axis-label" transform="translate(30 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${axisLabel(sequenceB.title, plotHeight)}</text>
  <g class="legend" transform="translate(${margin.left + plotWidth - 230} 24)">
    <circle cx="0" cy="0" r="4" fill="${SMS3_PLOT_THEME.categorical[0]}"/>
    <text x="11" y="4">Direct matches (${directPoints.length.toLocaleString()})</text>
    ${showReverseComplementLegend ? `<circle cx="0" cy="22" r="4" fill="${SMS3_PLOT_THEME.categorical[1]}"/>
    <text x="11" y="26">Reverse-complement matches (${reversePoints.length.toLocaleString()})</text>` : ""}
  </g>
</svg>`;
}

function makeTsv(rows) {
  return exportDelimitedTable(alignmentDotPlotColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

function makeReport({ records, counts, retainedCounts, omittedMatches, wordSize, alphabet, includeReverseComplement, notes }) {
  const lengthUnit = record => alphabet === "protein" ? (record.sequence.includes("*") ? "positions" : "residues") : "bases";
  const lines = [
    dotPlotTitle(alphabet),
    `Sequence A: ${records[0].title} (${records[0].sequence.length.toLocaleString()} ${lengthUnit(records[0])})`,
    `Sequence B: ${records[1].title} (${records[1].sequence.length.toLocaleString()} ${lengthUnit(records[1])})`,
    `Word size: ${wordSize}`,
    `Alphabet: ${alphabet === "protein" ? "protein" : "DNA/RNA"}`,
    `Direct matches detected: ${counts.direct.toLocaleString()}`,
    `Direct matches within cap: ${retainedCounts.direct.toLocaleString()}`
  ];
  if (alphabet === "dna-rna") {
    lines.push(`Reverse-complement matches detected: ${counts["reverse-complement"].toLocaleString()}${includeReverseComplement ? "" : " (disabled)"}`, `Reverse-complement matches within cap: ${retainedCounts["reverse-complement"].toLocaleString()}`);
  }
  lines.push(
    `Omitted after cap: ${omittedMatches.toLocaleString()}`,
    "",
    "Method: compare every overlapping word on linear sequences. Coordinates are 1-based inclusive on cleaned inputs; dots mark word midpoints. Matching does not compute alignment scores or allow mismatches or gaps.",
    ...(alphabet === "dna-rna" ? ["T and U compare equally. Ambiguity symbols compare literally, including complemented codes; matches involving ambiguity do not establish resolved-base identity. Reverse matches use coordinates on supplied sequence B."] : ["Protein ambiguity codes, U, O and * compare literally. Stops retain a position and words can cross them."]),
    ...notes
  );
  return lines.join("\n") + "\n";
}

export async function calculateAlignmentDotPlot(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  if (String(input ?? "").length > LIMITS.inputCharacters) throw new Error(`Dot plot input exceeds ${LIMITS.inputCharacters.toLocaleString()} characters.`);
  const inputRecords = parseSequenceInput(input, "sequence", { strictHeaders: true });
  if (inputRecords.some(record => record.sequence.includes(">"))) {
    throw new Error("FASTA headers must start at the beginning of a line, with no sequence text before the first header.");
  }
  if (inputRecords.length !== 2) {
    throw new Error("Provide exactly two FASTA records for a dot plot.");
  }
  const warnings = [];
  const notes = [];
  let charactersRemoved = 0;
  const settings = normalizeDotPlotOptions(options, options?.alphabet ?? detectAlphabet(inputRecords));
  const { alphabet, wordSize, maxMatches, includeReverseComplement, outputFormat } = settings;
  const records = inputRecords.map((record, index) => {
    if (record.title.length > LIMITS.titleCharacters) throw new Error(`Dot plot titles are limited to ${LIMITS.titleCharacters} characters.`);
    const cleaned = cleanBiologicalSequence(record.sequence, { alphabet, preserveCase: false, keepGaps: false });
    if (cleaned.sequence.length > LIMITS.sequenceLength) throw new Error(`Each dot plot sequence is limited to ${LIMITS.sequenceLength.toLocaleString()} cleaned positions.`);
    const gaps = (record.sequence.match(/[-.]/g) ?? []).length;
    charactersRemoved += cleaned.removedCount;
    if (gaps) notes.push(`Sequence ${index === 0 ? "A" : "B"}: removed ${gaps} gap characters; coordinates refer to the cleaned sequence.`);
    if (cleaned.removedCount > gaps) warnings.push(`Sequence ${index === 0 ? "A" : "B"}: removed ${cleaned.removedCount - gaps} unsupported characters; coordinates refer to the cleaned sequence.`);
    return { title: record.title || `Sequence ${index + 1}`, sequence: cleaned.sequence };
  });
  if (records.some((record) => record.sequence.length < wordSize)) {
    throw new Error("Both sequences must be at least as long as the selected word size.");
  }
  if (alphabet === "dna-rna") {
    if (records.some(record => record.sequence.includes("U"))) notes.push("Compared U as T; matched words retain sequence A's supplied alphabet.");
    if (records.some(record => /[^ACGTU]/.test(record.sequence))) notes.push("Ambiguity symbols compare literally, including complemented codes; matches involving ambiguity do not establish resolved-base identity.");
  } else if (records.some(record => /[BJXZUO*]/.test(record.sequence))) {
    notes.push("Protein ambiguity codes, U, O and * compare literally; stops retain a position and words can cross them.");
  }

  context.reportProgress?.({ phase: "indexing", progress: 0.25 });
  await context.yieldIfNeeded?.();
  const analysis = await collectMatches({
    sequenceA: records[0].sequence,
    sequenceB: records[1].sequence,
    sequenceATitle: records[0].title,
    sequenceBTitle: records[1].title,
    wordSize,
    includeReverseComplement,
    alphabet,
    maxMatches,
    outputFormat
  }, context);
  const { matches, omittedMatches, counts, retainedCounts, retainedCharacters, plotSuppressed } = analysis;
  context.reportProgress?.({ phase: "rendering", progress: 0.8 });
  if (omittedMatches > 0) {
    warnings.push(`Detected matches exceeded the ${maxMatches.toLocaleString()} match cap; ${omittedMatches.toLocaleString()} additional matches were omitted from table and visual output.`);
  }
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const xDomain = outputFormat === "svg" ? applyAxisLimits(records[0].sequence.length === 1 ? [0.5,1.5] : [1,records[0].sequence.length], { ...settings, warnings }, "x") : undefined;
  const yDomain = outputFormat === "svg" ? applyAxisLimits(records[1].sequence.length === 1 ? [0.5,1.5] : [1,records[1].sequence.length], { ...settings, warnings }, "y") : undefined;
  const plotLimitMessage = `Dot plot suppressed: more than ${LIMITS.svgPoints.toLocaleString()} retained matches. Choose Match table or increase Word size.`;
  if (plotSuppressed) warnings.push(plotLimitMessage);
  const svg = outputFormat === "svg" ? (plotSuppressed ? makePlaceholderSvg(dotPlotTitle(alphabet), [`Dot plot suppressed: more than ${LIMITS.svgPoints.toLocaleString()} retained matches.`, "Choose Match table or increase Word size.", `${(counts.direct + counts["reverse-complement"]).toLocaleString()} matches detected; ${omittedMatches.toLocaleString()} beyond the match cap.`]) : renderAlignmentDotPlotSvg({ records, matches, omittedMatches, wordSize, alphabet, includeReverseComplement, xDomain, yDomain })) : undefined;
  const tsv = ["tsv", "matches"].includes(outputFormat) ? makeTsv(matches) : undefined;
  const report = outputFormat === "report" ? makeReport({ records, counts, retainedCounts, omittedMatches, wordSize, alphabet, includeReverseComplement, notes }) : undefined;
  if (retainedCharacters + (svg ?? tsv ?? report ?? "").length > LIMITS.outputCharacters) throw new Error(`Dot plot rows and output exceed the ${LIMITS.outputCharacters.toLocaleString()}-character limit. Reduce Maximum matches to keep.`);
  context.throwIfCancelled?.();
  return { records, matches, counts, retainedCounts, plotSuppressed, omittedMatches, wordSize, alphabet, includeReverseComplement, svg, tsv, report, warnings, notes, charactersRemoved, optionsUsed: { ...settings, limits: LIMITS } };
}
