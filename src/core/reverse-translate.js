import "../vendor/d3/d3.min.js";
import { getCodonsForCode } from "./genetic-code.js";
import { escapeXml } from "./plot-renderer.js";

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

export function reverseTranslateProteinSequence(sequence, reference, options = {}) {
  const mode = options.mode === "degenerate" ? "degenerate" : "most-likely";
  const codeId = reference?.geneticCode?.id ?? "1";
  const codonsByAminoAcid = getCodonsByAminoAcid(reference);
  const dnaParts = [];
  const rows = [];
  const warnings = [];
  const residues = String(sequence ?? "").toUpperCase();

  for (const [index, residue] of Array.from(residues).entries()) {
    let note = "";
    const candidateCodons = getCandidateCodons(residue, codonsByAminoAcid);
    const degenerateCodon = makeDegenerateCodon(candidateCodons);
    const baseProbabilities = makeBaseProbabilities(candidateCodons, mode);
    const fixedBases = baseProbabilities.filter((item) => item.fixedBase).length;

    if (candidateCodons.length === 0) {
      dnaParts.push("NNN");
      note = "No codon candidates";
      warnings.push(`Position ${index + 1}: no codon candidates for residue ${residue}; used NNN.`);
      rows.push({
        position: index + 1,
        residue,
        codon: "NNN",
        candidate_codons: "",
        candidate_count: 0,
        degenerate_codon: "NNN",
        fixed_bases: 0,
        base_probabilities: baseProbabilities,
        reference_fraction: 0,
        reference_per_1000: 0,
        mode,
        note
      });
      continue;
    }

    if (Object.hasOwn(AMBIGUOUS_PROTEIN_RESIDUES, residue)) {
      if (residue === "X") {
        note = "Ambiguous residue X";
        warnings.push(`Position ${index + 1}: residue X was reverse translated as ${mode === "degenerate" ? "NNN" : "the highest-scoring available codon"}.`);
      } else {
        note = `Ambiguous residue ${residue}`;
        warnings.push(`Position ${index + 1}: residue ${residue} was interpreted as ${AMBIGUOUS_PROTEIN_RESIDUES[residue].join(" or ")}.`);
      }
    }

    const codon =
      mode === "degenerate" ? degenerateCodon : chooseMostLikelyCodon(candidateCodons, codeId)?.codon ?? "NNN";
    const selectedCodon = candidateCodons.find((candidate) => candidate.codon === codon);
    dnaParts.push(codon);
    rows.push({
      position: index + 1,
      residue,
      codon,
      candidate_codons: candidateCodons.map((candidate) => candidate.codon).sort(sortCodonsByGeneticCodeOrder(codeId)).join(","),
      candidate_count: candidateCodons.length,
      degenerate_codon: degenerateCodon,
      fixed_bases: fixedBases,
      base_probabilities: baseProbabilities,
      reference_fraction: selectedCodon?.referenceFraction ?? 0,
      reference_per_1000: selectedCodon?.referencePer1000 ?? 0,
      mode,
      note
    });
  }

  return {
    dna: dnaParts.join(""),
    rows,
    warnings
  };
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

export function renderReverseTranslateProbabilitySvg(records, options = {}) {
  const title = options.title ?? "Reverse translation codon base probability plot";
  const residuesPerRow = clampInteger(options.residuesPerRow, 60, 20, 160);
  const maxResidues = clampInteger(options.maxResidues, 1000, 10, 5000);
  const visibleRecords = (records ?? []).map((record) => {
    const sourceRows = record.rows ?? [];
    const rows = sourceRows.slice(0, maxResidues);
    return {
      ...record,
      rows,
      chunks: chunkRows(rows, residuesPerRow),
      omittedRows: Math.max(0, sourceRows.length - maxResidues)
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
  const showCodons = residueWidth >= 20;
  const probabilityScale = getD3()?.scaleLinear?.().domain([0, 1]).range([0, barHeight]);
  const left = 112;
  const right = 34;
  const top = 104;
  const bottom = 74;
  const width = Math.max(900, Math.ceil(left + maxVisibleResidues * residueWidth + right));
  const layout = [];
  let cursorY = top;
  for (const record of visibleRecords) {
    record.chunks.forEach((chunk, chunkIndex) => {
      const isFirstChunk = chunkIndex === 0;
      const isLastChunk = chunkIndex === record.chunks.length - 1;
      const barTop = cursorY + (isFirstChunk ? firstChunkTopGap : continuationTopGap);
      const axisY = barTop + barHeight;
      const textBottom = axisY + (showCodons ? 40 : 25);
      const omitY = isLastChunk && record.omittedRows > 0 ? textBottom + 16 : null;
      layout.push({
        record,
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
  const methodLabel = options.mode === "degenerate"
    ? `Degenerate IUPAC codons; genetic code ${options.geneticCodeLabel ?? ""}`.trim()
    : `Most likely codons; ${options.referenceLabel ?? ""}`.trim();
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-reverse-translate-probability" data-plot-renderer="sms3-d3">`,
    "<style>",
    ".title{font:700 19px system-ui,sans-serif;fill:#172026}.subtitle,.note{font:12px system-ui,sans-serif;fill:#526273}.record{font:700 13px system-ui,sans-serif;fill:#172026}.row-label{font:700 11px system-ui,sans-serif;fill:#334155}.axis{stroke:#8393a3;stroke-width:1}.grid{stroke:#e2e8f0;stroke-width:1}.tick{font:10px system-ui,sans-serif;fill:#64748b}.residue{font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#172026;text-anchor:middle}.codon{font:10px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#475569;text-anchor:middle}.legend{font:12px system-ui,sans-serif;fill:#334155}.bar{stroke:none;shape-rendering:geometricPrecision}.bar-outline{fill:none;stroke:#334155;stroke-opacity:.22;stroke-width:.55;vector-effect:non-scaling-stroke;shape-rendering:geometricPrecision}.fixed{fill:#f8fafc;stroke:#cbd5e1}.omit{font:11px system-ui,sans-serif;fill:#7c2d12}",
    "</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"></rect>`,
    `<text class="title" x="28" y="34">${escapeXml(title)}</text>`,
    `<text class="subtitle" x="28" y="56">${escapeXml(methodLabel)}</text>`,
    `<text class="note" x="28" y="78">Each residue column contains three codon-position bars. Long records wrap across plot rows.</text>`
  ];

  BASE_ORDER.forEach((base, index) => {
    const x = width - 280 + index * 66;
    parts.push(`<rect x="${x}" y="24" width="12" height="12" rx="2" fill="${BASE_COLORS[base]}"></rect>`);
    parts.push(`<text class="legend" x="${x + 18}" y="34">${base}</text>`);
  });

  for (const item of layout) {
    const { record, chunk, isFirstChunk, isLastChunk, segmentTop, labelY, barTop, axisY, omitY } = item;
    const fixedBaseCount = record.rows.reduce((sum, row) => sum + (row.fixed_bases ?? 0), 0);
    const totalBaseCount = Math.max(1, record.rows.length * 3);
    const fixedFraction = fixedBaseCount / totalBaseCount;
    const summary = `${record.rows.length}${record.omittedRows ? ` of ${record.rows.length + record.omittedRows}` : ""} residues plotted in ${record.chunks.length} row${record.chunks.length === 1 ? "" : "s"}; ${formatPercent(fixedFraction)} fixed bases`;
    if (isFirstChunk) {
      parts.push(`<text class="record" x="28" y="${segmentTop + 18}">${escapeXml(record.title)}</text>`);
      parts.push(`<text class="note" x="28" y="${segmentTop + 38}">${escapeXml(summary)}</text>`);
    }
    const firstPosition = chunk.rows[0]?.position ?? 0;
    const lastPosition = chunk.rows.at(-1)?.position ?? 0;
    const rowLabel = chunk.rows.length > 0 ? `Residues ${firstPosition}-${lastPosition}` : "No residues to plot";
    parts.push(`<text class="row-label" x="${left}" y="${labelY}">${escapeXml(rowLabel)}</text>`);

    const plotWidth = Math.max(1, chunk.rows.length * residueWidth);
    parts.push(`<line class="axis" x1="${left}" x2="${left + plotWidth}" y1="${axisY}" y2="${axisY}"></line>`);
    [0.25, 0.5, 0.75, 1].forEach((tick) => {
      const y = barTop + (1 - tick) * barHeight;
      parts.push(`<line class="grid" x1="${left}" x2="${left + plotWidth}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>`);
    });
    parts.push(`<text class="tick" x="${left - 9}" y="${barTop + 4}" text-anchor="end">1.0</text>`);
    parts.push(`<text class="tick" x="${left - 9}" y="${axisY + 4}" text-anchor="end">0</text>`);

    chunk.rows.forEach((row, rowIndex) => {
      const groupX = left + rowIndex * residueWidth;
      const centerX = groupX + residueWidth / 2;
      if (rowIndex % Math.max(1, Math.ceil(chunk.rows.length / 16)) === 0) {
        parts.push(`<text class="tick" x="${centerX.toFixed(2)}" y="${axisY + 18}" text-anchor="middle">${row.position}</text>`);
      }
      if (residueWidth >= 14 || rowIndex % 2 === 0) {
        parts.push(`<text class="residue" x="${centerX.toFixed(2)}" y="${barTop - residueLabelGap}">${escapeXml(row.residue)}</text>`);
      }
      if (showCodons) {
        parts.push(`<text class="codon" x="${centerX.toFixed(2)}" y="${axisY + 34}">${escapeXml(row.codon)}</text>`);
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
          parts.push(
            `<rect class="bar" x="${barX.toFixed(2)}" y="${currentY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${segmentHeight.toFixed(2)}" fill="${BASE_COLORS[base]}"><title>${escapeXml(`${record.title} residue ${row.position} ${row.residue}, codon base ${positionIndex + 1}: ${base} ${formatProbability(probability)}`)}</title></rect>`
          );
        }
        parts.push(`<rect class="bar-outline" x="${barX.toFixed(2)}" y="${barTop}" width="${barWidth.toFixed(2)}" height="${barHeight}"></rect>`);
      });
    });

    if (isLastChunk && record.omittedRows > 0) {
      parts.push(`<text class="omit" x="${left}" y="${omitY}">${record.omittedRows.toLocaleString()} residues not shown. Increase the maximum plotted residues to show more.</text>`);
    }
  }

  parts.push(`<text class="note" x="28" y="${height - 40}">Fixed bases are codon positions where one nucleotide has probability 1.0; the percent is calculated from the residues shown here.</text>`);
  parts.push(`<text class="note" x="28" y="${height - 22}">Use the codon choice table for exact candidates and reference values.</text>`);
  parts.push("</svg>");
  return parts.join("");
}
