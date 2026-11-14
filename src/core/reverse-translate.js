import { isolateSvgStyles } from "./svg-style-scope.js";
import { REVERSE_TRANSLATE_DEFAULTS as defaults } from "./reverse-translate-options.js";
import "../vendor/d3/d3.min.js";
import { getCodonsForCode } from "./genetic-code.js";
import { escapeXml } from "./plot-renderer.js";
import {
  makePublicationPlotStyle,
  publicationSvgAttributes,
  PUBLICATION_SEQUENCE_FONT_FAMILY
} from "./publication-plot-style.js";

const DNA_IUPAC_BY_BASES = new Map([
  ["A", "A"],
  ["C", "C"],
  ["G", "G"],
  ["T", "T"],
  ["AC", "M"],
  ["AG", "R"],
  ["AT", "W"],
  ["CG", "S"],
  ["CT", "Y"],
  ["GT", "K"],
  ["ACG", "V"],
  ["ACT", "H"],
  ["AGT", "D"],
  ["CGT", "B"],
  ["ACGT", "N"]
]);

const AMBIGUOUS_PROTEIN_RESIDUES = {
  B: ["D", "N"],
  J: ["I", "L"],
  Z: ["E", "Q"],
  X: []
};

export const reverseTranslateTableColumns = [
  { id: "record_index", label: "Record index", type: "number" },
  { id: "record", label: "Record", type: "string" },
  { id: "reference_id", label: "Reference ID", type: "string" },
  { id: "reference_name", label: "Reference", type: "string" },
  { id: "reference_source", label: "Reference source", type: "string" },
  { id: "genetic_code", label: "Genetic code", type: "string" },
  { id: "position", label: "Position", type: "number" },
  { id: "residue", label: "Residue", type: "string" },
  { id: "codon", label: "Codon", type: "string" },
  { id: "candidate_codons", label: "Candidate codons", type: "string" },
  { id: "candidate_count", label: "Candidate count", type: "number" },
  { id: "degenerate_codon", label: "Degenerate codon", type: "string" },
  { id: "fixed_bases", label: "Fixed bases", type: "number" },
  { id: "reference_fraction", label: "Reference fraction", type: "number" },
  { id: "reference_per_1000", label: "Reference per 1000", type: "number" },
  { id: "mode", label: "Mode", type: "string" },
  { id: "note", label: "Note", type: "string" }
];

const BASE_ORDER = ["A", "C", "G", "T"];
const BASE_COLORS = {
  A: "#18864b",
  C: "#2563eb",
  G: "#d97706",
  T: "#dc2626"
};

function sortCodonsByGeneticCodeOrder(codeId) {
  const order = new Map(getCodonsForCode(codeId).map((item, index) => [item.codon, index]));
  return (left, right) => (order.get(left) ?? 999) - (order.get(right) ?? 999);
}

export function getCodonsByAminoAcid(reference) {
  const codeId = reference?.geneticCode?.id ?? "1";
  const byAminoAcid = new Map();

  for (const item of getCodonsForCode(codeId)) {
    const codonRecord = reference?.codons?.[item.codon] ?? {};
    const codon = {
      codon: item.codon,
      aminoAcid: item.aa,
      referenceFraction: codonRecord.fraction ?? 0,
      referencePer1000: codonRecord.perThousand ?? 0,
      referenceCount: codonRecord.count ?? 0
    };
    byAminoAcid.set(item.aa, [...(byAminoAcid.get(item.aa) ?? []), codon]);
  }

  return byAminoAcid;
}

function getCandidateCodons(residue, codonsByAminoAcid) {
  if (residue === "X") {
    return [...codonsByAminoAcid.entries()]
      .filter(([aminoAcid]) => aminoAcid !== "*")
      .flatMap(([, codons]) => codons);
  }

  const possibleResidues = AMBIGUOUS_PROTEIN_RESIDUES[residue] ?? [residue];
  return possibleResidues.flatMap((aminoAcid) => codonsByAminoAcid.get(aminoAcid) ?? []);
}

function chooseMostLikelyCodon(candidateCodons, codeId) {
  const ordered = [...candidateCodons].sort((left, right) => {
    const fractionDifference = right.referenceFraction - left.referenceFraction;
    if (fractionDifference !== 0) {
      return fractionDifference;
    }
    const per1000Difference = right.referencePer1000 - left.referencePer1000;
    if (per1000Difference !== 0) {
      return per1000Difference;
    }
    return sortCodonsByGeneticCodeOrder(codeId)(left.codon, right.codon);
  });

  return ordered[0];
}

function collapseBaseSetToIupac(bases) {
  const key = [...new Set(bases)].sort().join("");
  return DNA_IUPAC_BY_BASES.get(key) ?? "N";
}

function makeDegenerateCodon(candidateCodons) {
  if (candidateCodons.length === 0) {
    return "NNN";
  }

  const positions = [0, 1, 2].map((position) =>
    collapseBaseSetToIupac(candidateCodons.map((candidate) => candidate.codon[position]))
  );
  return positions.join("");
}

// A positional IUPAC union is a Cartesian product; it can contain codons
// outside the synonymous family. NCBI assignments: https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi
function additionalUnionCodons(candidateCodons, degenerate, codeId) {
  const bases = new Map([...DNA_IUPAC_BY_BASES].map(([letters, symbol]) => [symbol, letters]));
  const intended = new Set(candidateCodons.map(candidate => candidate.codon));
  return getCodonsForCode(codeId).filter(item => !intended.has(item.codon) &&
    [...degenerate].every((symbol, index) => bases.get(symbol)?.includes(item.codon[index])));
}

function getCandidateWeights(candidateCodons, mode) {
  if (candidateCodons.length === 0) {
    return [];
  }

  if (mode === "degenerate") {
    const weight = 1 / candidateCodons.length;
    return candidateCodons.map((candidate) => ({ codon: candidate.codon, weight }));
  }

  const weightKeys = ["referenceFraction", "referencePer1000", "referenceCount"];
  for (const key of weightKeys) {
    const rawWeights = candidateCodons.map((candidate) => Number(candidate[key]) || 0);
    const total = rawWeights.reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      return candidateCodons.map((candidate, index) => ({
        codon: candidate.codon,
        weight: rawWeights[index] / total
      }));
    }
  }

  const equalWeight = 1 / candidateCodons.length;
  return candidateCodons.map((candidate) => ({ codon: candidate.codon, weight: equalWeight }));
}

function makeBaseProbabilities(candidateCodons, mode) {
  if (candidateCodons.length === 0) {
    return [0, 1, 2].map((codonPosition) => ({
      codonPosition: codonPosition + 1,
      probabilities: Object.fromEntries(BASE_ORDER.map((base) => [base, 0.25])),
      fixedBase: "",
      maxProbability: 0.25
    }));
  }

  const weights = getCandidateWeights(candidateCodons, mode);
  return [0, 1, 2].map((codonPosition) => {
    const probabilities = Object.fromEntries(BASE_ORDER.map((base) => [base, 0]));
    for (const candidate of weights) {
      const base = candidate.codon[codonPosition];
      if (Object.hasOwn(probabilities, base)) {
        probabilities[base] += candidate.weight;
      }
    }
    const maxProbability = Math.max(...Object.values(probabilities));
    const fixedBase = maxProbability >= 0.999999
      ? BASE_ORDER.find((base) => probabilities[base] >= 0.999999) ?? ""
      : "";
    return {
      codonPosition: codonPosition + 1,
      probabilities,
      fixedBase,
      maxProbability
    };
  });
}

function* reverseTranslateSteps(sequence, reference, options) {
  const mode = options.mode ?? defaults.mode;
  const codeId = reference?.geneticCode?.id ?? "1";
  const codonsByAminoAcid = getCodonsByAminoAcid(reference);
  const cache = new Map(), warningCounts = new Map();
  const dnaParts = [], rows = [];
  const residues = String(sequence ?? "").replace(/[a-z]/g, letter => letter.toUpperCase());
  for (let index = 0; index < residues.length; index++) {
    if (index % 4096 === 0) yield { phase: "reverse-translating", progress: index / Math.max(1,residues.length) };
    const residue = residues[index];
    if (!cache.has(residue)) {
      const candidates = getCandidateCodons(residue, codonsByAminoAcid);
      const degenerate = makeDegenerateCodon(candidates);
      const probabilities = makeBaseProbabilities(candidates, mode);
      const codon = mode === "degenerate" ? degenerate : chooseMostLikelyCodon(candidates, codeId)?.codon ?? "NNN";
      const selected = candidates.find(candidate => candidate.codon === codon);
      let warning = "", note = "";
      if (!candidates.length) {
        note = "No codon candidates";
        warning = `no codon candidates for residue ${residue}; used NNN.`;
      } else if (Object.hasOwn(AMBIGUOUS_PROTEIN_RESIDUES,residue)) {
        note = `Ambiguous residue ${residue}`;
        warning = residue === "X"
          ? `residue X was reverse translated as ${mode === "degenerate" ? "NNN" : "the highest-scoring available codon"}.`
          : `residue ${residue} was interpreted as ${AMBIGUOUS_PROTEIN_RESIDUES[residue].join(" or ")}.`;
      }
      if (candidates.length) {
        const extra = additionalUnionCodons(candidates, degenerate, codeId);
        if (extra.length) {
          const unionNote = `IUPAC ${degenerate} also encodes ${extra.map(item => `${item.codon}=${item.aa === "*" ? "stop" : item.aa}`).join(", ")}.`;
          note = [note, unionNote].filter(Boolean).join("; ");
          if (mode === "degenerate") warning = [warning, unionNote].filter(Boolean).join(" ");
        }
      }
      cache.set(residue, { warning, row: {
        residue, codon, candidate_codons: candidates.map(candidate => candidate.codon).sort(sortCodonsByGeneticCodeOrder(codeId)).join(","),
        candidate_count: candidates.length, degenerate_codon: degenerate,
        fixed_bases: probabilities.filter(item => item.fixedBase).length, base_probabilities: probabilities,
        reference_fraction: selected?.referenceFraction ?? 0, reference_per_1000: selected?.referencePer1000 ?? 0, mode, note
      }});
    }
    const {row,warning} = cache.get(residue);
    if (warning) {
      const previous = warningCounts.get(warning) ?? { count: 0, first: index + 1 };
      previous.count++; warningCounts.set(warning,previous);
    }
    if (options.includeDna !== false) dnaParts.push(row.codon);
    if (index < (options.rowLimit ?? Infinity)) rows.push({position:index+1,...row});
  }
  return { dna: dnaParts.join(""), rows, warnings: [...warningCounts].map(([message,{count,first}]) => `Position ${first}: ${message}${count > 1 ? ` (${count} positions; first position shown.)` : ""}`) };
}

export function reverseTranslateProteinSequence(sequence, reference, options = {}) {
  const steps = reverseTranslateSteps(sequence,reference,options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export async function reverseTranslateProteinSequenceWithContext(sequence, reference, options = {}, context = {}) {
  const steps = reverseTranslateSteps(sequence,reference,options);
  let step = steps.next();
  while (!step.done) {
    context.throwIfCancelled?.();
    context.reportProgress?.(step.value);
    await context.yieldIfNeeded?.();
    context.throwIfCancelled?.();
    step = steps.next();
  }
  return step.value;
}

function formatProbability(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getD3() {
  return globalThis.d3 ?? null;
}

function clampInteger(value, defaultValue, min, max) {
  const parsed = Number.parseInt(value, 10);
  const numeric = Number.isFinite(parsed) ? parsed : defaultValue;
  return Math.max(min, Math.min(max, numeric));
}

function chunkRows(rows, size) {
  if (rows.length === 0) {
    return [{ rows: [], offset: 0 }];
  }
  const chunks = [];
  for (let offset = 0; offset < rows.length; offset += size) {
    chunks.push({ rows: rows.slice(offset, offset + size), offset });
  }
  return chunks;
}

function nicePositionTickStep(columnCount) {
  const requestedStep = Math.max(1, Math.ceil((Math.max(1, columnCount) - 1) / 8));
  const magnitude = 10 ** Math.floor(Math.log10(requestedStep));
  const normalized = requestedStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStep * magnitude;
}

export function renderReverseTranslateProbabilitySvg(...args) {
  return isolateSvgStyles(renderReverseTranslateProbabilitySvgUnscoped(...args));
}

function renderReverseTranslateProbabilitySvgUnscoped(records, options = {}) {
  const title = options.title ?? "Reverse translation codon base probability plot";
  const residuesPerRow = clampInteger(options.residuesPerRow, defaults.plotResiduesPerRow, 20, 40);
  const maxResidues = clampInteger(options.maxResidues, defaults.plotMaxResidues, 10, 5000);
  const visibleRecords = (records ?? []).map((record, recordIndex) => {
    const sourceRows = record.rows ?? [];
    const rows = sourceRows.slice(0, maxResidues);
    return {
      ...record,
      inspectionLabel: `R${recordIndex + 1}`,
      rows,
      chunks: chunkRows(rows, residuesPerRow),
      omittedRows: (record.omittedRows ?? 0) + Math.max(0, sourceRows.length - maxResidues)
    };
  });
  const maxVisibleResidues = Math.max(
    1,
    ...visibleRecords.flatMap((record) => record.chunks.map((chunk) => chunk.rows.length))
  );
  const residueWidth =
    residuesPerRow <= 40
      ? 24
      : residuesPerRow <= 60
        ? 20
        : residuesPerRow <= 80
          ? 17
          : residuesPerRow <= 120
            ? 14
            : 12;
  const codonGroupWidth = Math.max(7.2, Math.min(14, residueWidth - 6));
  const barGap = 0.9;
  const barWidth = Math.max(1.8, (codonGroupWidth - 2 * barGap) / 3);
  const barHeight = 54;
  const firstChunkTopGap = 90;
  const continuationTopGap = 56;
  const rowLabelGap = 36;
  const residueLabelGap = 12;
  const showCodons = true;
  const probabilityScale = getD3()?.scaleLinear?.().domain([0, 1]).range([0, barHeight]);
  const left = 112;
  const right = 34;
  const top = 104;
  const bottom = 74;
  const width = Math.max(900, Math.ceil(left + maxVisibleResidues * residueWidth + right));
  const labelStyle = makePublicationPlotStyle(width, 260, options);
  const labelCharacters = Math.max(1, Math.floor((width - 56) / (labelStyle.bodyFontSize * 1.2)));
  const labelLineHeight = labelStyle.bodyFontSize * 1.5;
  const layout = [];
  let cursorY = top;
  for (const record of visibleRecords) {
    const characters = [...record.title];
    record.titleLines = [];
    for (let offset = 0; offset < characters.length; offset += labelCharacters) record.titleLines.push(characters.slice(offset, offset + labelCharacters).join(""));
    const labelExtra = Math.max(0, record.titleLines.length - 1) * labelLineHeight;
    record.chunks.forEach((chunk, chunkIndex) => {
      const isFirstChunk = chunkIndex === 0;
      const isLastChunk = chunkIndex === record.chunks.length - 1;
      const barTop = cursorY + (isFirstChunk ? firstChunkTopGap + labelExtra : continuationTopGap);
      const axisY = barTop + barHeight;
      const textBottom = axisY + (showCodons ? 40 : 25);
      const omitY = isLastChunk && record.omittedRows > 0 ? textBottom + 16 : null;
      layout.push({
        record,
        labelExtra,
        chunk,
        chunkIndex,
        isFirstChunk,
        isLastChunk,
        segmentTop: cursorY,
        labelY: barTop - rowLabelGap,
        barTop,
        axisY,
        omitY
      });
      cursorY = (omitY ?? textBottom) + (isLastChunk ? 22 : 12);
    });
  }
  const height = Math.max(260, cursorY + bottom);
  const publicationStyle = makePublicationPlotStyle(width, height, options);
  const positionTickStep = nicePositionTickStep(residuesPerRow);
  const methodLabel = options.mode === "degenerate"
    ? `Degenerate IUPAC codons; genetic code ${options.geneticCodeLabel ?? ""}`.trim()
    : `Most likely codons; ${options.referenceLabel ?? ""}`.trim();
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" ${publicationSvgAttributes(publicationStyle)} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-reverse-translate-probability" data-plot-renderer="sms3-d3" data-sms3-publication-theme="default" data-grid-lines="hidden" data-sms3-inspection-highlight="none">`,
    "<style>",
    `.title{font:600 ${publicationStyle.titleFontSize}px ${publicationStyle.fontFamily};fill:#172026}.subtitle,.note{font:${publicationStyle.smallFontSize}px ${publicationStyle.fontFamily};fill:#526273}.record{font:600 ${publicationStyle.bodyFontSize}px ${publicationStyle.fontFamily};fill:#172026}.row-label{font:600 ${publicationStyle.smallFontSize}px ${publicationStyle.fontFamily};fill:#334155}.axis,.axis-tick{stroke:#374151;stroke-width:${publicationStyle.axisStrokeWidth}}.tick{font:${publicationStyle.smallFontSize}px ${publicationStyle.fontFamily};fill:#475569}.residue{font:600 ${publicationStyle.bodyFontSize}px ${PUBLICATION_SEQUENCE_FONT_FAMILY};font-variant-ligatures:none;fill:#172026;text-anchor:middle}.codon{font:${publicationStyle.smallFontSize}px ${PUBLICATION_SEQUENCE_FONT_FAMILY};font-variant-ligatures:none;fill:#475569;text-anchor:middle}.legend{font:${publicationStyle.bodyFontSize}px ${publicationStyle.fontFamily};fill:#334155}.bar{stroke:none;shape-rendering:geometricPrecision}.bar-outline{fill:none;stroke:#334155;stroke-opacity:.22;stroke-width:.55;vector-effect:non-scaling-stroke;shape-rendering:geometricPrecision}.fixed{fill:#f8fafc;stroke:#cbd5e1}.omit{font:${publicationStyle.smallFontSize}px ${publicationStyle.fontFamily};fill:#7c2d12}`,
    "</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"></rect>`,
    `<text class="title" x="28" y="34">${escapeXml(title)}</text>`,
    `<text class="subtitle" x="28" y="56">${escapeXml(methodLabel)}</text>`,
    `<text class="note" x="28" y="78">Candidate-codon marginal probabilities; each residue has three codon-position bars.</text>`
  ];

  BASE_ORDER.forEach((base, index) => {
    const x = width - 280 + index * 66;
    parts.push(`<rect x="${x}" y="24" width="12" height="12" rx="2" fill="${BASE_COLORS[base]}"></rect>`);
    parts.push(`<text class="legend" x="${x + 18}" y="34">${base}</text>`);
  });

  for (const item of layout) {
    const { record, labelExtra, chunk, isFirstChunk, isLastChunk, segmentTop, labelY, barTop, axisY, omitY } = item;
    const fixedBaseCount = record.rows.reduce((sum, row) => sum + (row.fixed_bases ?? 0), 0);
    const totalBaseCount = Math.max(1, record.rows.length * 3);
    const fixedFraction = fixedBaseCount / totalBaseCount;
    const positionUnit = record.hasStops || record.rows.some(row => row.residue === "*") ? "positions" : "residues";
    const summary = `${record.rows.length}${record.omittedRows ? ` of ${record.rows.length + record.omittedRows}` : ""} ${positionUnit} plotted in ${record.chunks.length} row${record.chunks.length === 1 ? "" : "s"}; ${formatPercent(fixedFraction)} fixed bases`;
    if (isFirstChunk) {
      parts.push(`<text class="record" x="28" y="${segmentTop + 18}">${record.titleLines.map((line, index) => `<tspan x="28" dy="${index ? labelLineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`);
      parts.push(`<text class="note" x="28" y="${segmentTop + 38 + labelExtra}">${escapeXml(summary)}</text>`);
    }
    const firstPosition = chunk.rows[0]?.position ?? 0;
    const lastPosition = chunk.rows.at(-1)?.position ?? 0;
    const rowLabel = chunk.rows.length > 0 ? `${positionUnit === "positions" ? "Positions" : "Residues"} ${firstPosition}-${lastPosition}` : "No residues to plot";
    parts.push(`<text class="row-label" x="${left}" y="${labelY}">${escapeXml(rowLabel)}</text>`);

    const plotWidth = Math.max(1, chunk.rows.length * residueWidth);
    parts.push(`<line class="axis" x1="${left}" x2="${left + plotWidth}" y1="${axisY}" y2="${axisY}"></line>`);
    parts.push(`<line class="axis" x1="${left}" x2="${left}" y1="${barTop}" y2="${axisY}"></line>`);
    [0, 0.5, 1].forEach((tick) => {
      const y = barTop + (1 - tick) * barHeight;
      parts.push(`<line class="axis-tick y-tick" x1="${left - 5}" x2="${left}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>`);
      parts.push(`<text class="tick" x="${left - 9}" y="${(y + publicationStyle.smallFontSize * 0.34).toFixed(2)}" text-anchor="end">${tick === 1 ? "1.0" : tick}</text>`);
    });

    chunk.rows.forEach((row, rowIndex) => {
      const groupX = left + rowIndex * residueWidth;
      const centerX = groupX + residueWidth / 2;
      const showPositionTick = rowIndex === 0
        || rowIndex === chunk.rows.length - 1
        || row.position % positionTickStep === 0;
      if (showPositionTick) {
        parts.push(`<line class="axis-tick position-tick" data-position="${row.position}" x1="${centerX.toFixed(2)}" x2="${centerX.toFixed(2)}" y1="${axisY}" y2="${axisY + 4}"></line>`);
        parts.push(`<text class="tick position-tick-label" data-position="${row.position}" x="${centerX.toFixed(2)}" y="${axisY + 18}" text-anchor="middle">${row.position}</text>`);
      }
      if (residueWidth >= 14 || rowIndex % 2 === 0) {
        parts.push(`<text class="residue" x="${centerX.toFixed(2)}" y="${barTop - residueLabelGap}">${escapeXml(row.residue)}</text>`);
      }
      if (showCodons) {
        parts.push(`<text class="codon" x="${centerX.toFixed(2)}" y="${axisY + 35}">${escapeXml(row.codon)}</text>`);
      }

      (row.base_probabilities ?? []).forEach((positionProbability, positionIndex) => {
        const barX = groupX + (residueWidth - codonGroupWidth) / 2 + positionIndex * (barWidth + barGap);
        let currentY = axisY;
        for (const base of BASE_ORDER) {
          const probability = Number(positionProbability.probabilities?.[base]) || 0;
          if (probability <= 0) {
            continue;
          }
          const segmentHeight = Math.max(0.5, probabilityScale ? probabilityScale(probability) : probability * barHeight);
          currentY -= segmentHeight;
          const inspectionText = [
            `${positionUnit === "positions" ? "Position" : "Residue"} ${row.position} (${row.residue})`,
            `${base} probability: ${formatProbability(probability)}`,
            `Codon position: ${positionIndex + 1} of 3`,
            `Codon: ${row.codon}`,
            record.inspectionLabel
          ].join("; ");
          parts.push(
            `<rect class="bar" x="${barX.toFixed(2)}" y="${currentY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${segmentHeight.toFixed(2)}" fill="${BASE_COLORS[base]}"><title>${escapeXml(inspectionText)}</title></rect>`
          );
        }
        parts.push(`<rect class="bar-outline" x="${barX.toFixed(2)}" y="${barTop}" width="${barWidth.toFixed(2)}" height="${barHeight}"></rect>`);
      });
    });

    if (isLastChunk && record.omittedRows > 0) {
      parts.push(`<text class="omit" x="${left}" y="${omitY}">${record.omittedRows.toLocaleString()} ${positionUnit} not shown. Select fewer records or increase the per-record setting within the total plot limit.</text>`);
    }
  }

  parts.push(`<text class="note" x="28" y="${height - 40}">Fixed bases are codon positions where one nucleotide has probability 1.0; the percent is calculated from the residues shown here.</text>`);
  parts.push(`<text class="note" x="28" y="${height - 22}">${options.mode === "degenerate" ? "Equal candidate weights; IUPAC unions can also encode other residues or stops." : "Reference-weighted candidates; bars describe the candidate family, not the single chosen codon."}</text>`);
  parts.push("</svg>");
  return parts.join("");
}
