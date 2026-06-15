import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { parseFlatfileRecords } from "./flatfile-records.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence, makeSequenceContext } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";

export const talenTargetColumns = [
  { id: "rank", label: "Rank", type: "number" },
  { id: "pair_id", label: "Pair ID", type: "string" },
  { id: "record", label: "Record", type: "string" },
  { id: "strand", label: "Design strand", type: "string" },
  { id: "target_start", label: "Target start", type: "number" },
  { id: "target_end", label: "Target end", type: "number" },
  { id: "left_start", label: "Left half-site start", type: "number" },
  { id: "left_end", label: "Left half-site end", type: "number" },
  { id: "spacer_start", label: "Spacer start", type: "number" },
  { id: "spacer_end", label: "Spacer end", type: "number" },
  { id: "right_start", label: "Right half-site start", type: "number" },
  { id: "right_end", label: "Right half-site end", type: "number" },
  { id: "left_length", label: "Left length", type: "number" },
  { id: "right_length", label: "Right length", type: "number" },
  { id: "spacer_length", label: "Spacer length", type: "number" },
  { id: "left_site_dna", label: "Left site DNA", type: "string" },
  { id: "right_site_dna", label: "Right site DNA", type: "string" },
  { id: "right_binding_dna", label: "Right binding DNA", type: "string" },
  { id: "left_zero_base", label: "Left 5-prime base", type: "string" },
  { id: "right_zero_base", label: "Right 5-prime base", type: "string" },
  { id: "left_rvd", label: "Left RVDs", type: "string" },
  { id: "right_rvd", label: "Right RVDs", type: "string" },
  { id: "reference_match_count", label: "Reference matches", type: "number" },
  { id: "score", label: "Review score", type: "number" },
  { id: "flags", label: "Flags", type: "string" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Target context", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];

export const talenRvdColumns = [
  { id: "pair_id", label: "Pair ID", type: "string" },
  { id: "record", label: "Record", type: "string" },
  { id: "side", label: "TALEN side", type: "string" },
  { id: "repeat_number", label: "Repeat number", type: "number" },
  { id: "target_base", label: "Target base", type: "string" },
  { id: "rvd", label: "RVD", type: "string" }
];

const EXACT_DNA = /^[ACGT]+$/;

// Scope/citation note:
// This first production scope implements transparent TALEN target-pair review
// using common TAL effector design conventions: an upstream 5-prime T/position
// 0 preference, paired half-sites flanking a spacer, and the canonical RVD
// mapping NI=A, HD=C, NG=T, and NN or NH=G. These rules follow the TAL effector
// targeting model reviewed by Boch and Bonas, Annu Rev Phytopathol 2010, and
// Bogdanove and Voytas, Science 2011, with TALEN genome-editing design context
// from Miller et al., Nat Biotechnol 2011. The score here is an SMS3 review
// heuristic, not an experimentally validated activity model.

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function reverseComplementDna(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false }))
    .reverse()
    .join("")
    .replaceAll("U", "T");
}

function countExactOccurrences(sequence, query) {
  if (!sequence || !query || query.length > sequence.length) {
    return 0;
  }
  let count = 0;
  for (let index = 0; index <= sequence.length - query.length; index += 1) {
    if (sequence.slice(index, index + query.length) === query) {
      count += 1;
    }
  }
  return count;
}

function countReferenceTargetMatches(query, referenceRecords) {
  if (!query || referenceRecords.length === 0) {
    return 0;
  }
  const normalizedQuery = String(query).toUpperCase().replaceAll("U", "T");
  const reverse = reverseComplementDna(normalizedQuery);
  let count = 0;
  for (const record of referenceRecords) {
    const sequence = String(record.sequence ?? "").toUpperCase().replaceAll("U", "T");
    count += countExactOccurrences(sequence, normalizedQuery);
    if (reverse !== normalizedQuery) {
      count += countExactOccurrences(sequence, reverse);
    }
  }
  return count;
}

function gcPercent(sequence) {
  if (!sequence) return 0;
  let gc = 0;
  for (const base of sequence) {
    if (base === "G" || base === "C") gc += 1;
  }
  return (gc / sequence.length) * 100;
}

function longestHomopolymer(sequence) {
  let best = 0;
  let run = 0;
  let previous = "";
  for (const base of sequence) {
    if (base === previous) {
      run += 1;
    } else {
      previous = base;
      run = 1;
    }
    best = Math.max(best, run);
  }
  return best;
}

function rvdForBase(base, guanineRvd) {
  if (base === "A") return "NI";
  if (base === "C") return "HD";
  if (base === "G") return guanineRvd;
  if (base === "T") return "NG";
  return "NN?";
}

function makeRvdString(sequence, guanineRvd) {
  return Array.from(sequence, (base) => rvdForBase(base, guanineRvd)).join(" ");
}

function projectInterval(start, end, length, strand) {
  if (strand === "+") {
    return { start, end };
  }
  return {
    start: length - end + 1,
    end: length - start + 1
  };
}

function scoreCandidate(candidate, options) {
  let score = 100;
  const flags = [];
  const preferredHalf = Math.round((options.minHalfSiteLength + options.maxHalfSiteLength) / 2);
  const preferredSpacer = Math.round((options.minSpacerLength + options.maxSpacerLength) / 2);
  score -= Math.abs(candidate.leftLength - preferredHalf) * 1.5;
  score -= Math.abs(candidate.rightLength - preferredHalf) * 1.5;
  score -= Math.abs(candidate.spacerLength - preferredSpacer) * 2;

  for (const [side, site] of [["left", candidate.leftSite], ["right", candidate.rightBindingSite]]) {
    const gc = gcPercent(site);
    if (gc < 25 || gc > 75) {
      flags.push(`${side} GC outside 25-75%`);
      score -= Math.min(25, Math.abs(gc - 50) * 0.8);
    }
    const run = longestHomopolymer(site);
    if (run >= 5) {
      flags.push(`${side} homopolymer ${run}`);
      score -= (run - 4) * 6;
    }
    if (!EXACT_DNA.test(site)) {
      flags.push(`${side} contains ambiguity`);
      score -= 20;
    }
  }
  if (candidate.leftZeroBase !== "T") {
    flags.push("left 5-prime base is not T");
    score -= 25;
  }
  if (candidate.rightZeroBase !== "A") {
    flags.push("right 5-prime base is not A on the reported strand");
    score -= 25;
  }
  return {
    score: round(Math.max(0, score), 2),
    flags
  };
}

function normalizeOptions(options = {}) {
  const minHalfSiteLength = clampInteger(options.minHalfSiteLength, 15, 10, 25);
  const maxHalfSiteLength = Math.max(minHalfSiteLength, clampInteger(options.maxHalfSiteLength, 18, 10, 25));
  const minSpacerLength = clampInteger(options.minSpacerLength, 14, 5, 40);
  const maxSpacerLength = Math.max(minSpacerLength, clampInteger(options.maxSpacerLength, 20, 5, 40));
  const guanineRvd = options.guanineRvd === "NH" ? "NH" : "NN";
  return {
    minHalfSiteLength,
    maxHalfSiteLength,
    minSpacerLength,
    maxSpacerLength,
    requireFivePrimeT: options.requireFivePrimeT !== false,
    allowAmbiguousTargets: options.allowAmbiguousTargets === true,
    guanineRvd,
    maxPairsPerRecord: clampInteger(options.maxPairsPerRecord, 100, 1, 2000),
    maxRecordLength: clampInteger(options.maxRecordLength, 200000, 100, 10000000),
    maxCandidateWindows: clampInteger(options.maxCandidateWindows, 2000000, 1000, 50000000),
    contextBases: clampInteger(options.contextBases, 20, 0, 200),
    mapMaxPairsPerRecord: clampInteger(options.mapMaxPairsPerRecord, 30, 1, 500)
  };
}

function parseDnaRecords(input, warnings) {
  const text = String(input ?? "");
  if (/^(LOCUS|ID)\s/m.test(text) || /\nFEATURES\s+Location\/Qualifiers\n/.test(text)) {
    const flatfile = parseFlatfileRecords(text);
    let removedTotal = 0;
    const flatfileRecords = flatfile.records
      .filter((record) => record.sequence && record.molecule !== "protein")
      .map((record, index) => {
        const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
        removedTotal += cleaned.removedCount;
        if (cleaned.removedCount > 0) {
          warnings.push(`${record.accession || `Record ${index + 1}`}: removed ${cleaned.removedCount} unsupported character(s).`);
        }
        return {
          title: record.accession || record.title || `Record ${index + 1}`,
          sequence: cleaned.sequence.replaceAll("U", "T"),
          sourceFormat: record.format
        };
      })
      .filter((record) => record.sequence.length > 0);
    if (flatfileRecords.length > 0) {
      warnings.push(...flatfile.warnings);
      flatfileRecords.removedTotal = removedTotal;
      return flatfileRecords;
    }
  }

  const records = parseSequenceInput(text, "sequence");
  if (records.length === 0) {
    warnings.push("No DNA/RNA sequence records were found.");
    return [];
  }
  let removedTotal = 0;
  const parsed = records.map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    removedTotal += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title || `record_${index + 1}`}: removed ${cleaned.removedCount} unsupported character(s).`);
    }
    const sequence = cleaned.sequence.replaceAll("U", "T");
    if (!sequence) {
      warnings.push(`${record.title || `record_${index + 1}`}: no DNA/RNA sequence characters remain after cleaning.`);
    }
    return {
      title: record.title || `record_${index + 1}`,
      sequence
    };
  }).filter((record) => record.sequence.length > 0);
  parsed.removedTotal = removedTotal;
  return parsed;
}

function makeCandidate(record, recordIndex, oriented, strand, leftStart, leftLength, spacerLength, rightLength, options) {
  const sequenceLength = oriented.length;
  const leftEnd = leftStart + leftLength - 1;
  const spacerStart = leftEnd + 1;
  const spacerEnd = spacerStart + spacerLength - 1;
  const rightStart = spacerEnd + 1;
  const rightEnd = rightStart + rightLength - 1;
  if (rightEnd > sequenceLength) return null;

  const leftSite = oriented.slice(leftStart - 1, leftEnd);
  const spacer = oriented.slice(spacerStart - 1, spacerEnd);
  const rightSite = oriented.slice(rightStart - 1, rightEnd);
  const rightBindingSite = reverseComplementDna(rightSite);
  const leftZeroBase = leftStart > 1 ? oriented[leftStart - 2] : "";
  const rightZeroBase = rightEnd < sequenceLength ? oriented[rightEnd] : "";
  if (options.requireFivePrimeT && (leftZeroBase !== "T" || rightZeroBase !== "A")) {
    return null;
  }
  if (!options.allowAmbiguousTargets && (!EXACT_DNA.test(leftSite) || !EXACT_DNA.test(rightBindingSite) || !EXACT_DNA.test(spacer))) {
    return null;
  }

  const leftOriginal = projectInterval(leftStart, leftEnd, sequenceLength, strand);
  const rightOriginal = projectInterval(rightStart, rightEnd, sequenceLength, strand);
  const spacerOriginal = projectInterval(spacerStart, spacerEnd, sequenceLength, strand);
  const targetStart = Math.min(leftOriginal.start, leftOriginal.end, rightOriginal.start, rightOriginal.end);
  const targetEnd = Math.max(leftOriginal.start, leftOriginal.end, rightOriginal.start, rightOriginal.end);
  const context = makeSequenceContext(record.sequence, targetStart, targetEnd, options.contextBases);
  const scored = scoreCandidate({
    leftSite,
    rightBindingSite,
    leftLength,
    rightLength,
    spacerLength,
    leftZeroBase,
    rightZeroBase
  }, options);

  return {
    recordIndex,
    record: record.title,
    strand,
    target_start: targetStart,
    target_end: targetEnd,
    left_start: Math.min(leftOriginal.start, leftOriginal.end),
    left_end: Math.max(leftOriginal.start, leftOriginal.end),
    spacer_start: Math.min(spacerOriginal.start, spacerOriginal.end),
    spacer_end: Math.max(spacerOriginal.start, spacerOriginal.end),
    right_start: Math.min(rightOriginal.start, rightOriginal.end),
    right_end: Math.max(rightOriginal.start, rightOriginal.end),
    left_length: leftLength,
    right_length: rightLength,
    spacer_length: spacerLength,
    left_site_dna: leftSite,
    right_site_dna: rightSite,
    right_binding_dna: rightBindingSite,
    spacer_dna: spacer,
    left_zero_base: leftZeroBase || "missing",
    right_zero_base: rightZeroBase || "missing",
    left_rvd: makeRvdString(leftSite, options.guanineRvd),
    right_rvd: makeRvdString(rightBindingSite, options.guanineRvd),
    score: scored.score,
    flags: scored.flags.join("; ") || "none",
    ...context
  };
}

async function scanRecord(record, recordIndex, options, context, warnings) {
  const candidates = [];
  let evaluated = 0;
  let stoppedByLimit = false;
  const orientations = [
    { strand: "+", sequence: record.sequence },
    { strand: "-", sequence: reverseComplementDna(record.sequence) }
  ];

  for (const orientation of orientations) {
    for (let leftStart = 1; leftStart <= orientation.sequence.length; leftStart += 1) {
      if (options.requireFivePrimeT && (leftStart <= 1 || orientation.sequence[leftStart - 2] !== "T")) {
        continue;
      }
      for (let leftLength = options.minHalfSiteLength; leftLength <= options.maxHalfSiteLength; leftLength += 1) {
        for (let spacerLength = options.minSpacerLength; spacerLength <= options.maxSpacerLength; spacerLength += 1) {
          for (let rightLength = options.minHalfSiteLength; rightLength <= options.maxHalfSiteLength; rightLength += 1) {
            evaluated += 1;
            if (evaluated > options.maxCandidateWindows) {
              stoppedByLimit = true;
              break;
            }
            const candidate = makeCandidate(record, recordIndex, orientation.sequence, orientation.strand, leftStart, leftLength, spacerLength, rightLength, options);
            if (candidate) {
              candidates.push(candidate);
            }
          }
          if (stoppedByLimit) break;
        }
        if (stoppedByLimit) break;
      }
      if (leftStart % 1000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (stoppedByLimit) break;
    }
    if (stoppedByLimit) break;
  }

  candidates.sort((a, b) =>
    b.score - a.score ||
    Math.abs(a.spacer_length - 16) - Math.abs(b.spacer_length - 16) ||
    a.target_start - b.target_start ||
    a.strand.localeCompare(b.strand)
  );
  const selected = candidates.slice(0, options.maxPairsPerRecord);
  if (stoppedByLimit) {
    warnings.push(`${record.title}: TALEN scan stopped after ${options.maxCandidateWindows.toLocaleString()} candidate windows; increase the limit to scan more combinations.`);
  }
  if (candidates.length > selected.length) {
    warnings.push(`${record.title}: ${candidates.length.toLocaleString()} TALEN target pair(s) matched filters; reporting top ${selected.length.toLocaleString()}.`);
  }
  return {
    candidates: selected,
    candidateCount: candidates.length,
    evaluated
  };
}

export async function designTalenTargets(input, options = {}, context = {}) {
  const normalized = normalizeOptions(options);
  const warnings = [...(Array.isArray(options.referenceWarnings) ? options.referenceWarnings : [])];
  const referenceRecords = Array.isArray(options.referenceRecords)
    ? options.referenceRecords.filter((record) => String(record?.sequence ?? "").length > 0)
    : [];
  const records = parseDnaRecords(input, warnings);
  const rows = [];
  const recordSummaries = [];
  const charactersRemoved = records.removedTotal ?? 0;
  let basesProcessed = 0;
  let globalRank = 1;

  for (const [recordIndex, record] of records.entries()) {
    context.throwIfCancelled?.();
    if (record.sequence.length > normalized.maxRecordLength) {
      warnings.push(`${record.title}: sequence length ${record.sequence.length.toLocaleString()} exceeds the ${normalized.maxRecordLength.toLocaleString()} bp scan limit and was skipped.`);
      continue;
    }
    basesProcessed += record.sequence.length;
    context.reportProgress?.({ phase: "scanning", current: recordIndex + 1, total: records.length });
    const scan = await scanRecord(record, recordIndex, normalized, context, warnings);
    for (const row of scan.candidates) {
      row.rank = globalRank;
      row.pair_id = `talen_${globalRank}`;
      rows.push(row);
      globalRank += 1;
    }
    recordSummaries.push({
      record: record.title,
      length: record.sequence.length,
      evaluatedCandidateWindows: scan.evaluated,
      matchedPairs: scan.candidateCount,
      reportedPairs: scan.candidates.length
    });
  }

  if (records.length === 0) {
    warnings.push("No records were scanned.");
  }
  if (rows.length === 0 && records.length > 0) {
    warnings.push("No TALEN target pairs matched the selected half-site, spacer, 5-prime base, and ambiguity settings.");
  }
  if (referenceRecords.length > 0) {
    for (const row of rows) {
      row.reference_match_count = countReferenceTargetMatches(row.matched_text, referenceRecords);
    }
  } else {
    for (const row of rows) {
      row.reference_match_count = "";
    }
  }

  const rvdRows = makeTalenRvdRows(rows);
  return {
    options: normalized,
    records,
    rows,
    rvdRows,
    recordSummaries,
    warnings,
    charactersRemoved: charactersRemoved + (options.referenceCharactersRemoved ?? 0),
    basesProcessed: basesProcessed + (options.referenceBasesProcessed ?? 0),
    referenceScreen: {
      status: referenceRecords.length > 0 ? "run" : "not run",
      source: options.referenceSource ?? "",
      records: referenceRecords.length,
      basesProcessed: options.referenceBasesProcessed ?? referenceRecords.reduce((sum, record) => sum + String(record.sequence ?? "").length, 0)
    }
  };
}

export function makeTalenRvdRows(rows) {
  const result = [];
  for (const row of rows) {
    for (const [side, sequence] of [["left", row.left_site_dna], ["right", row.right_binding_dna]]) {
      const rvds = side === "left" ? row.left_rvd.split(" ") : row.right_rvd.split(" ");
      for (let index = 0; index < sequence.length; index += 1) {
        result.push({
          pair_id: row.pair_id,
          record: row.record,
          side,
          repeat_number: index + 1,
          target_base: sequence[index],
          rvd: rvds[index]
        });
      }
    }
  }
  return result;
}

export function makeTalenTargetTsv(rows) {
  return exportDelimitedTable(talenTargetColumns, rows, "\t");
}

export function makeTalenRvdTsv(rows) {
  return exportDelimitedTable(talenRvdColumns, rows, "\t");
}

export function makeTalenReport(result) {
  const lines = [
    "TALEN Design / Review report",
    "",
    "Scope: finds paired TALEN half-sites in local DNA/RNA input and proposes simple RVD strings for review. The score is an SMS3 review heuristic, not a validated activity model.",
    `Half-site length range: ${result.options.minHalfSiteLength}-${result.options.maxHalfSiteLength} nt`,
    `Spacer length range: ${result.options.minSpacerLength}-${result.options.maxSpacerLength} nt`,
    `5-prime T rule: ${result.options.requireFivePrimeT ? "required" : "reported but not required"}`,
    `Guanine RVD: ${result.options.guanineRvd}`,
    `Reference genome hits: ${result.referenceScreen?.status === "run" ? `${result.referenceScreen.records} reference record(s) scanned; exact full target-pair hit counts are shown in the table` : "not run"}`,
    "",
    "Coordinate policy: coordinates are 1-based inclusive on the original input record. The right TALEN RVD string is based on the reverse complement of the reported right half-site.",
    "",
    "Record summary:"
  ];
  for (const summary of result.recordSummaries) {
    lines.push(`- ${summary.record}: ${summary.length.toLocaleString()} bp; reported ${summary.reportedPairs.toLocaleString()} of ${summary.matchedPairs.toLocaleString()} matching pair(s) after evaluating ${summary.evaluatedCandidateWindows.toLocaleString()} candidate windows.`);
  }
  lines.push("", "Top target pairs:");
  for (const row of result.rows.slice(0, 20)) {
    lines.push(`- ${row.pair_id}: ${row.record} ${row.strand} ${row.target_start}-${row.target_end}; L ${row.left_start}-${row.left_end}; spacer ${row.spacer_length} nt; R ${row.right_start}-${row.right_end}; score ${row.score}; flags: ${row.flags}.`);
  }
  if (result.rows.length > 20) {
    lines.push(`- ${result.rows.length - 20} additional pair(s) are available in the TSV output.`);
  }
  lines.push("", "Citations: Boch and Bonas, Annu Rev Phytopathol 2010; Bogdanove and Voytas, Science 2011; Miller et al., Nat Biotechnol 2011.");
  if (result.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push("", "Warnings: none");
  }
  return `${lines.join("\n")}\n`;
}

export function makeTalenContextText(rows) {
  if (rows.length === 0) {
    return "No TALEN target pairs were found.\n";
  }
  return `${rows.map((row) => [
    `${row.pair_id} ${row.record} ${row.strand} ${row.target_start}-${row.target_end}`,
    row.context_sequence,
    `left RVD: ${row.left_rvd}`,
    `right RVD: ${row.right_rvd}`
  ].join("\n")).join("\n\n")}\n`;
}

export function makeTalenHalfSiteFasta(rows, lineWidth = 60) {
  if (rows.length === 0) return "";
  const records = [];
  for (const row of rows) {
    records.push(formatFastaRecord(`${row.pair_id}_left_${row.record}_${row.strand}_${row.left_start}_${row.left_end}`, row.left_site_dna, lineWidth));
    records.push(formatFastaRecord(`${row.pair_id}_right_binding_${row.record}_${row.strand}_${row.right_start}_${row.right_end}`, row.right_binding_dna, lineWidth));
  }
  return records.join("\n");
}
