import "../vendor/d3/d3.min.js";
import { parseSequenceInput } from "./fasta.js";

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

const DNA_RNA_CHARACTERS = new Set("ACGTURYSWKMBDHVN".split(""));
const PROTEIN_CHARACTERS = new Set("ACDEFGHIKLMNPQRSTVWYBXZJUO*".split(""));
const DEFAULT_WORD_SIZE = {
  "dna-rna": 11,
  protein: 3
};
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
  N: "N"
}));

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

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

function cleanSequence(sequence, alphabet) {
  const allowed = alphabet === "protein" ? PROTEIN_CHARACTERS : DNA_RNA_CHARACTERS;
  return String(sequence ?? "")
    .toUpperCase()
    .replace(/[-.\s]/g, "")
    .split("")
    .filter((character) => allowed.has(character))
    .join("");
}

function reverseComplement(sequence) {
  return String(sequence ?? "")
    .toUpperCase()
    .split("")
    .reverse()
    .map((character) => DNA_COMPLEMENT.get(character) ?? "N")
    .join("");
}

function makeKmerIndex(sequence, wordSize) {
  const index = new Map();
  for (let position = 0; position <= sequence.length - wordSize; position += 1) {
    const word = sequence.slice(position, position + wordSize);
    if (!index.has(word)) {
      index.set(word, []);
    }
    index.get(word).push(position + 1);
  }
  return index;
}

async function collectMatches({
  sequenceA,
  sequenceB,
  sequenceATitle,
  sequenceBTitle,
  wordSize,
  includeReverseComplement,
  alphabet,
  maxMatches
}, context = {}) {
  const matches = [];
  let omittedMatches = 0;
  const directIndex = makeKmerIndex(sequenceB, wordSize);
  const reverseSequenceB = alphabet === "dna-rna" && includeReverseComplement ? reverseComplement(sequenceB) : "";
  const reverseIndex = reverseSequenceB ? makeKmerIndex(reverseSequenceB, wordSize) : null;

  const addMatch = (match) => {
    if (matches.length < maxMatches) {
      matches.push(match);
    } else {
      omittedMatches += 1;
    }
  };

  for (let positionA = 0; positionA <= sequenceA.length - wordSize; positionA += 1) {
    if (positionA > 0 && positionA % 1000 === 0) {
      await context.yieldIfNeeded?.();
    } else {
      context.throwIfCancelled?.();
    }
    const word = sequenceA.slice(positionA, positionA + wordSize);
    const startsB = directIndex.get(word) ?? [];
    for (const startB of startsB) {
      addMatch({
        orientation: "direct",
        sequence_a: sequenceATitle,
        sequence_a_start: positionA + 1,
        sequence_a_end: positionA + wordSize,
        sequence_b: sequenceBTitle,
        sequence_b_start: startB,
        sequence_b_end: startB + wordSize - 1,
        word
      });
    }
    if (reverseIndex) {
      const startsReverse = reverseIndex.get(word) ?? [];
      for (const startReverse of startsReverse) {
        const sequenceBEnd = sequenceB.length - startReverse + 1;
        const sequenceBStart = sequenceBEnd - wordSize + 1;
        addMatch({
          orientation: "reverse-complement",
          sequence_a: sequenceATitle,
          sequence_a_start: positionA + 1,
          sequence_a_end: positionA + wordSize,
          sequence_b: sequenceBTitle,
          sequence_b_start: sequenceBStart,
          sequence_b_end: sequenceBEnd,
          word
        });
      }
    }
  }

  return { matches, omittedMatches };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPosition(value) {
  if (value >= 1_000_000) return `${Number(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)} Mb`;
  if (value >= 10_000) return `${Number(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} kb`;
  return String(value);
}

function getD3() {
  return globalThis.d3 ?? null;
}

function axisTicks(length, count = 5) {
  if (length <= 0) return [];
  if (length === 1) return [1];
  const d3 = getD3();
  if (d3?.scaleLinear) {
    const ticks = d3.scaleLinear().domain([1, length]).nice(count).ticks(count);
    const rounded = ticks.map((tick) => Math.round(tick)).filter((tick) => tick >= 1 && tick <= length);
    if (rounded.length > 0) {
      return [...new Set(rounded)];
    }
  }
  const ticks = [];
  for (let index = 0; index < count; index += 1) {
    ticks.push(Math.round(1 + (index / Math.max(1, count - 1)) * (length - 1)));
  }
  return [...new Set(ticks)];
}

function matchPoint(match) {
  return {
    x: (match.sequence_a_start + match.sequence_a_end) / 2,
    y: (match.sequence_b_start + match.sequence_b_end) / 2,
    orientation: match.orientation,
    word: match.word
  };
}

function dotPlotTitle(alphabet) {
  return alphabet === "protein" ? "Protein dot plot" : "DNA/RNA dot plot";
}

export function renderAlignmentDotPlotSvg({ records, matches, omittedMatches, wordSize, alphabet = "dna-rna", includeReverseComplement = true }) {
  const [sequenceA, sequenceB] = records;
  const width = 900;
  const height = 800;
  const margin = { top: 82, right: 70, bottom: 128, left: 112 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const d3 = getD3();
  const d3XScale = d3?.scaleLinear?.().domain([1, Math.max(1, sequenceA.sequence.length)]).range([margin.left, margin.left + plotWidth]);
  const d3YScale = d3?.scaleLinear?.().domain([1, Math.max(1, sequenceB.sequence.length)]).range([margin.top + plotHeight, margin.top]);
  const xScale = (value) => d3XScale ? d3XScale(value) : margin.left + ((value - 1) / Math.max(1, sequenceA.sequence.length - 1)) * plotWidth;
  const yScale = (value) => d3YScale ? d3YScale(value) : margin.top + plotHeight - ((value - 1) / Math.max(1, sequenceB.sequence.length - 1)) * plotHeight;
  const points = matches.map(matchPoint);
  const directPoints = points.filter((point) => point.orientation === "direct");
  const reversePoints = points.filter((point) => point.orientation === "reverse-complement");
  const showReverseComplementLegend = alphabet === "dna-rna" && includeReverseComplement;
  const title = dotPlotTitle(alphabet);
  const unit = alphabet === "protein" ? "amino-acid" : "base";
  const plotNote = `Exact ${wordSize}-${unit} word matches between two sequences; ${omittedMatches > 0 ? `${omittedMatches.toLocaleString()} matches omitted by the match cap.` : "all detected matches shown."}`;
  const pointRadius = points.length > 8000 ? 1.1 : points.length > 2000 ? 1.4 : 1.9;
  const opacity = points.length > 8000 ? 0.38 : points.length > 2000 ? 0.55 : 0.78;
  const xTicks = axisTicks(sequenceA.sequence.length, 6);
  const yTicks = axisTicks(sequenceB.sequence.length, 6);

  const pointElements = (items, color) => items.map((point) =>
    `<circle cx="${xScale(point.x).toFixed(2)}" cy="${yScale(point.y).toFixed(2)}" r="${pointRadius}" fill="${color}" fill-opacity="${opacity}"><title>${escapeXml(`${point.orientation}: ${point.word} at ${Math.round(point.x)}, ${Math.round(point.y)}`)}</title></circle>`
  ).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-alignment-dot-plot" data-plot-renderer="sms3-d3">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${margin.left}" y="34" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#18212b">${escapeXml(title)}</text>
  <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#f9fbfc" stroke="#a8b4bf"/>
  ${xTicks.map((tick) => `<line x1="${xScale(tick).toFixed(2)}" x2="${xScale(tick).toFixed(2)}" y1="${margin.top}" y2="${margin.top + plotHeight}" stroke="#d7dee5" stroke-width="1"/>`).join("\n")}
  ${yTicks.map((tick) => `<line x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${yScale(tick).toFixed(2)}" y2="${yScale(tick).toFixed(2)}" stroke="#d7dee5" stroke-width="1"/>`).join("\n")}
  ${pointElements(directPoints, "#2563eb")}
  ${pointElements(reversePoints, "#d9480f")}
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#334155" stroke-width="1.2"/>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#334155" stroke-width="1.2"/>
  ${xTicks.map((tick) => `<text x="${xScale(tick).toFixed(2)}" y="${margin.top + plotHeight + 23}" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle" fill="#334155">${escapeXml(formatPosition(tick))}</text>`).join("\n")}
  ${yTicks.map((tick) => `<text x="${margin.left - 12}" y="${(yScale(tick) + 4).toFixed(2)}" font-family="system-ui, sans-serif" font-size="12" text-anchor="end" fill="#334155">${escapeXml(formatPosition(tick))}</text>`).join("\n")}
  <text x="${margin.left + plotWidth / 2}" y="${height - 36}" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle" fill="#18212b">${escapeXml(sequenceA.title)} position</text>
  <text x="${margin.left + plotWidth / 2}" y="${height - 12}" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle" fill="#52616f">${escapeXml(plotNote)}</text>
  <text transform="translate(30 ${margin.top + plotHeight / 2}) rotate(-90)" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle" fill="#18212b">${escapeXml(sequenceB.title)} position</text>
  <g transform="translate(${margin.left + plotWidth - 230} 24)" font-family="system-ui, sans-serif" font-size="13" fill="#334155">
    <circle cx="0" cy="0" r="4" fill="#2563eb"/>
    <text x="11" y="4">Direct matches (${directPoints.length.toLocaleString()})</text>
    ${showReverseComplementLegend ? `<circle cx="0" cy="22" r="4" fill="#d9480f"/>
    <text x="11" y="26">Reverse-complement matches (${reversePoints.length.toLocaleString()})</text>` : ""}
  </g>
</svg>`;
}

function makeTsv(rows) {
  const columns = alignmentDotPlotColumns.map((column) => column.id);
  return [
    columns.join("\t"),
    ...rows.map((row) => columns.map((column) => row[column]).join("\t"))
  ].join("\n");
}

function makeReport({ records, matches, omittedMatches, wordSize, alphabet, includeReverseComplement }) {
  const directCount = matches.filter((match) => match.orientation === "direct").length;
  const reverseCount = matches.filter((match) => match.orientation === "reverse-complement").length;
  const lines = [
    dotPlotTitle(alphabet),
    `Sequence A: ${records[0].title} (${records[0].sequence.length.toLocaleString()} ${alphabet === "protein" ? "aa" : "bases"})`,
    `Sequence B: ${records[1].title} (${records[1].sequence.length.toLocaleString()} ${alphabet === "protein" ? "aa" : "bases"})`,
    `Word size: ${wordSize}`,
    `Alphabet: ${alphabet === "protein" ? "protein" : "DNA/RNA"}`,
    `Direct matches shown: ${directCount.toLocaleString()}`
  ];
  if (alphabet === "dna-rna") {
    lines.push(`Reverse-complement matches shown: ${reverseCount.toLocaleString()}${includeReverseComplement ? "" : " (disabled)"}`);
  }
  lines.push(
    `Omitted after cap: ${omittedMatches.toLocaleString()}`,
    "",
    "Method: exact word matches are indexed from sequence B and plotted against every word position in sequence A. This is a review/teaching dot plot, not a substitute for a scored local alignment."
  );
  return lines.join("\n") + "\n";
}

export async function calculateAlignmentDotPlot(input, options = {}, context = {}) {
  const inputRecords = parseSequenceInput(input, "sequence");
  if (inputRecords.length < 2) {
    throw new Error("Provide at least two FASTA records for an alignment dot plot.");
  }
  const warnings = [];
  if (inputRecords.length > 2) {
    warnings.push(`Only the first two records were plotted; ${inputRecords.length - 2} additional records were ignored.`);
  }
  const alphabet = options.alphabet === "protein" || options.alphabet === "dna-rna"
    ? options.alphabet
    : detectAlphabet(inputRecords.slice(0, 2));
  const wordSize = normalizeInteger(options.wordSize, DEFAULT_WORD_SIZE[alphabet], 1, 100);
  const maxMatches = normalizeInteger(options.maxMatches, 25000, 100, 500000);
  const includeReverseComplement = alphabet === "dna-rna" && options.includeReverseComplement !== false;
  const records = inputRecords.slice(0, 2).map((record, index) => ({
    title: record.title || `Sequence ${index + 1}`,
    sequence: cleanSequence(record.sequence, alphabet)
  }));
  if (records.some((record) => record.sequence.length < wordSize)) {
    throw new Error("Both sequences must be at least as long as the selected word size.");
  }

  context.reportProgress?.({ phase: "indexing", progress: 0.25 });
  await context.yieldIfNeeded?.();
  const { matches, omittedMatches } = await collectMatches({
    sequenceA: records[0].sequence,
    sequenceB: records[1].sequence,
    sequenceATitle: records[0].title,
    sequenceBTitle: records[1].title,
    wordSize,
    includeReverseComplement,
    alphabet,
    maxMatches
  }, context);
  context.reportProgress?.({ phase: "rendering", progress: 0.8 });
  if (omittedMatches > 0) {
    warnings.push(`Detected matches exceeded the ${maxMatches.toLocaleString()} match cap; ${omittedMatches.toLocaleString()} additional matches were omitted from table and visual output.`);
  }
  const svg = renderAlignmentDotPlotSvg({ records, matches, omittedMatches, wordSize, alphabet, includeReverseComplement });
  const tsv = makeTsv(matches);
  const report = makeReport({ records, matches, omittedMatches, wordSize, alphabet, includeReverseComplement });
  return { records, matches, omittedMatches, wordSize, alphabet, includeReverseComplement, svg, tsv, report, warnings };
}
