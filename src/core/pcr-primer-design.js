import { appVersion } from "../app-version.js";
import { resolveDesignFeatureTarget, designFeatureTargetLabel, primerPairMatchesFeature } from "./design-feature-targets.js";
import { parsePcrTemplateInput } from "./pcr-template-input.js";
import { formatFastaRecord } from "./fasta.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";
import { normalizePcrPrimerDesignOptions, PCR_PRIMER_DESIGN_DEFAULTS } from "./pcr-primer-design-options.js";
export { normalizePcrPrimerDesignOptions } from "./pcr-primer-design-options.js";

export const pcrPrimerDesignTableColumns = [
  { id: "rank", label: "Rank", type: "number" },
  { id: "template", label: "Template", type: "string" },
  { id: "score", label: "Score", type: "number" },
  { id: "product_size", label: "Product size", type: "number" },
  { id: "target_region", label: "Target region", type: "string" },
  { id: "left_primer", label: "Left primer", type: "string" },
  { id: "right_primer", label: "Right primer", type: "string" },
  { id: "left_start", label: "Left start", type: "number" },
  { id: "left_end", label: "Left end", type: "number" },
  { id: "right_start", label: "Right start", type: "number" },
  { id: "right_end", label: "Right end", type: "number" },
  { id: "left_tm_c", label: "Left Tm C", type: "number" },
  { id: "right_tm_c", label: "Right Tm C", type: "number" },
  { id: "tm_difference_c", label: "Tm difference C", type: "number" },
  { id: "left_gc_percent", label: "Left GC percent", type: "number" },
  { id: "right_gc_percent", label: "Right GC percent", type: "number" },
  { id: "left_length", label: "Left length", type: "number" },
  { id: "right_length", label: "Right length", type: "number" },
  { id: "left_gc_clamp", label: "Left GC clamp", type: "number" },
  { id: "right_gc_clamp", label: "Right GC clamp", type: "number" },
  { id: "left_self_complement_run", label: "Left self-complement run", type: "number" },
  { id: "right_self_complement_run", label: "Right self-complement run", type: "number" },
  { id: "left_three_prime_complement_run", label: "Left 3-prime complement run", type: "number" },
  { id: "right_three_prime_complement_run", label: "Right 3-prime complement run", type: "number" },
  { id: "left_hairpin_stem", label: "Left hairpin stem", type: "number" },
  { id: "right_hairpin_stem", label: "Right hairpin stem", type: "number" },
  { id: "left_reference_matches", label: "Left reference matches", type: "number" },
  { id: "right_reference_matches", label: "Right reference matches", type: "number" },
  { id: "target_feature", label: "Target feature", type: "string" },
  { id: "candidate_search_status", label: "Candidate search status", type: "string" },
  { id: "reference_search_status", label: "Reference search status", type: "string" },
  { id: "reference_records_skipped", label: "Reference records skipped", type: "number" },
  { id: "reference_count_interpretation", label: "Reference count interpretation", type: "string" }
];

const EXACT_DNA = /^[ACGT]+$/;
const COMPLEMENTS = new Map([
  ["A", "T"],
  ["C", "G"],
  ["G", "C"],
  ["T", "A"]
]);

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(digits));
}

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
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

function countReferenceOligoMatches(query, referenceRecords) {
  if (!query || referenceRecords.length === 0) {
    return 0;
  }
  const normalizedQuery = String(query).toUpperCase().replaceAll("U", "T");
  const reverse = reverseComplement(normalizedQuery).replaceAll("U", "T");
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

function formatRegion(region) {
  return region.start === region.end ? String(region.start) : `${region.start}-${region.end}`;
}

function parseCoordinateRanges(value, sequenceLength, warnings, label) {
  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }
  const ranges = [];
  const parts = text.split(/[\n,;]+/u).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*(?:-|\.\.|:)\s*(\d+))?$/u);
    if (!match) {
      warnings.push(`${label}: ignored invalid coordinate "${part}". Use 1-based ranges such as 120-240.`);
      continue;
    }
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2] ?? match[1], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1 || start > end) {
      warnings.push(`${label}: ignored invalid coordinate "${part}". Coordinates must be positive with start <= end.`);
      continue;
    }
    const clippedStart = Math.max(1, Math.min(sequenceLength, start));
    const clippedEnd = Math.max(1, Math.min(sequenceLength, end));
    if (clippedStart > clippedEnd) {
      warnings.push(`${label}: ignored coordinate "${part}" because it is outside the ${sequenceLength} bp template.`);
      continue;
    }
    if (clippedStart !== start || clippedEnd !== end) {
      warnings.push(`${label}: clipped coordinate "${part}" to ${formatRegion({ start: clippedStart, end: clippedEnd })} for the ${sequenceLength} bp template.`);
    }
    ranges.push({ start: clippedStart, end: clippedEnd });
  }
  return ranges;
}

function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function overlapsAnyRegion(candidate, regions) {
  return regions.some((region) => intervalsOverlap(candidate.start, candidate.end, region.start, region.end));
}

function findFlankedTarget(left, right, targetRegions) {
  return targetRegions.find((region) => left.start <= region.start && right.end >= region.end) ?? null;
}

function isWatsonCrickPair(left, right) {
  return COMPLEMENTS.get(left) === right;
}

function countGc(sequence) {
  let count = 0;
  for (const base of sequence) {
    if (base === "G" || base === "C") {
      count += 1;
    }
  }
  return count;
}

function estimateTm(sequence) {
  // Quick scoring formulas only. Short oligos use Wallace RB et al.,
  // Nucleic Acids Res. 1979. Longer oligos use the Marmur-Doty GC
  // approximation used elsewhere in SMS3 basic oligo reporting.
  const length = sequence.length;
  if (length === 0) {
    return 0;
  }
  const gc = countGc(sequence);
  const at = length - gc;
  if (length < 14) {
    return 2 * at + 4 * gc;
  }
  return 69.3 + 0.41 * ((gc / length) * 100) - 650 / length;
}

function maxSelfComplementRun(sequence) {
  const source = String(sequence ?? "").toUpperCase();
  const reversed = Array.from(source).reverse().join("");
  let maxRun = 0;
  for (let offset = -source.length + 1; offset < source.length; offset += 1) {
    let run = 0;
    for (let index = 0; index < source.length; index += 1) {
      const otherIndex = index + offset;
      if (otherIndex < 0 || otherIndex >= reversed.length) {
        run = 0;
        continue;
      }
      if (isWatsonCrickPair(source[index], reversed[otherIndex])) {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
    }
  }
  return maxRun;
}

function maxThreePrimeComplementRun(sequence) {
  const source = String(sequence ?? "").toUpperCase();
  // Anchor one end at this copy's 3′ nucleotide. Each otherStart fixes a
  // single antiparallel alignment against a second copy; stop at a mismatch.
  let best = 0;
  for (let otherStart = 0; otherStart < source.length; otherStart += 1) {
    let run = 0;
    while (run < source.length && otherStart + run < source.length &&
      isWatsonCrickPair(source[source.length - 1 - run], source[otherStart + run])) {
      run += 1;
    }
    best = Math.max(best, run);
  }
  return best;
}

function maxHairpinStem(sequence, minLoop = 3) {
  const source = String(sequence ?? "").toUpperCase();
  let best = 0;
  for (let left = 0; left < source.length; left += 1) {
    for (let right = left + minLoop + 1; right < source.length; right += 1) {
      let stem = 0;
      while (
        // The next paired bases must still enclose minLoop unpaired bases.
        right - stem - (left + stem) - 1 >= minLoop &&
        isWatsonCrickPair(source[left + stem], source[right - stem])
      ) {
        stem += 1;
      }
      best = Math.max(best, stem);
    }
  }
  return best;
}

function makePrimerMetrics(sequence, options) {
  const gcCount = countGc(sequence);
  const gcPercent = sequence.length > 0 ? (gcCount / sequence.length) * 100 : 0;
  const tm = estimateTm(sequence);
  const gcClamp = countGc(sequence.slice(-5));
  const selfComplementRun = maxSelfComplementRun(sequence);
  const threePrimeComplementRun = maxThreePrimeComplementRun(sequence);
  const hairpinStem = maxHairpinStem(sequence);
  const score =
    Math.abs(tm - options.primerOptTm) * 2 +
    Math.abs(sequence.length - options.primerOptLength) * 0.35 +
    Math.abs(gcPercent - 50) * 0.08 +
    Math.max(0, options.gcClampMin - gcClamp) * 3 +
    Math.max(0, gcClamp - options.gcClampMax) * 1.5 +
    Math.max(0, selfComplementRun - options.maxSelfComplementRun) * 3 +
    Math.max(0, threePrimeComplementRun - options.maxThreePrimeComplementRun) * 4 +
    Math.max(0, hairpinStem - options.maxHairpinStem) * 3;
  return {
    length: sequence.length,
    gcPercent,
    tm,
    gcClamp,
    selfComplementRun,
    threePrimeComplementRun,
    hairpinStem,
    score
  };
}

function primerPasses(metrics, options) {
  return metrics.tm >= options.primerMinTm &&
    metrics.tm <= options.primerMaxTm &&
    metrics.gcPercent >= options.primerMinGc &&
    metrics.gcPercent <= options.primerMaxGc &&
    metrics.gcClamp >= options.gcClampMin &&
    metrics.gcClamp <= options.gcClampMax &&
    metrics.selfComplementRun <= options.maxSelfComplementRun &&
    metrics.threePrimeComplementRun <= options.maxThreePrimeComplementRun &&
    metrics.hairpinStem <= options.maxHairpinStem;
}

function makeLeftCandidate(sequence, startIndex, length, options, excludedRegions = []) {
  const primer = sequence.slice(startIndex, startIndex + length);
  if (primer.length !== length || !EXACT_DNA.test(primer)) {
    return null;
  }
  const metrics = makePrimerMetrics(primer, options);
  if (!primerPasses(metrics, options)) {
    return null;
  }
  const candidate = {
    sequence: primer,
    startIndex,
    endExclusive: startIndex + length,
    start: startIndex + 1,
    end: startIndex + length,
    ...metrics
  };
  if (overlapsAnyRegion(candidate, excludedRegions)) {
    return null;
  }
  return candidate;
}

function makeRightCandidate(sequence, startIndex, length, options, excludedRegions = []) {
  const binding = sequence.slice(startIndex, startIndex + length);
  if (binding.length !== length || !EXACT_DNA.test(binding)) {
    return null;
  }
  const primer = reverseComplement(binding);
  const metrics = makePrimerMetrics(primer, options);
  if (!primerPasses(metrics, options)) {
    return null;
  }
  const candidate = {
    sequence: primer,
    startIndex,
    endExclusive: startIndex + length,
    start: startIndex + 1,
    end: startIndex + length,
    ...metrics
  };
  if (overlapsAnyRegion(candidate, excludedRegions)) {
    return null;
  }
  return candidate;
}

function addCandidate(map, key, candidate, limit = 8) {
  if (!candidate) {
    return;
  }
  const items = map.get(key) ?? [];
  items.push(candidate);
  items.sort((left, right) => left.score - right.score || left.length - right.length);
  map.set(key, items.slice(0, limit));
}

function makeCandidateMaps(sequence, options, excludedRegions = []) {
  const leftByStart = new Map();
  const rightByEnd = new Map();
  for (let start = 0; start < sequence.length; start += 1) {
    for (let length = options.primerMinLength; length <= options.primerMaxLength; length += 1) {
      addCandidate(leftByStart, start, makeLeftCandidate(sequence, start, length, options, excludedRegions));
      const right = makeRightCandidate(sequence, start, length, options, excludedRegions);
      if (right) {
        addCandidate(rightByEnd, right.endExclusive, right);
      }
    }
  }
  return { leftByStart, rightByEnd };
}

function makePairRow(record, left, right, productSize, sequence, options, targetRegion = null) {
  const tmDifference = Math.abs(left.tm - right.tm);
  const productMidpoint = (options.minProductLength + options.maxProductLength) / 2;
  const productSpread = Math.max(1, options.maxProductLength - options.minProductLength);
  const score = left.score + right.score + tmDifference * 1.5 + (Math.abs(productSize - productMidpoint) / productSpread) * 4;
  const productSequence = sequence.slice(left.startIndex, right.endExclusive);
  return {
    rank: 0,
    template: record.title,
    score: round(score, 3),
    product_size: productSize,
    target_region: targetRegion ? formatRegion(targetRegion) : "",
    left_primer: left.sequence,
    right_primer: right.sequence,
    left_start: left.start,
    left_end: left.end,
    right_start: right.start,
    right_end: right.end,
    left_tm_c: round(left.tm),
    right_tm_c: round(right.tm),
    tm_difference_c: round(tmDifference),
    left_gc_percent: round(left.gcPercent),
    right_gc_percent: round(right.gcPercent),
    left_length: left.length,
    right_length: right.length,
    left_gc_clamp: left.gcClamp,
    right_gc_clamp: right.gcClamp,
    left_self_complement_run: left.selfComplementRun,
    right_self_complement_run: right.selfComplementRun,
    left_three_prime_complement_run: left.threePrimeComplementRun,
    right_three_prime_complement_run: right.threePrimeComplementRun,
    left_hairpin_stem: left.hairpinStem,
    right_hairpin_stem: right.hairpinStem,
    product_sequence: productSequence
  };
}

function compareCandidatePairs(left, right) {
  return left.score - right.score || left.product_size - right.product_size ||
    left.left_start - right.left_start || left.right_end - right.right_end;
}

// Keep the best returnCount candidates throughout the scan, including a capped
// scan. Insert after ties to preserve the original stable enumeration order.
function retainCandidate(rows, candidate, limit) {
  if (rows.length === limit && compareCandidatePairs(candidate, rows.at(-1)) >= 0) return;
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareCandidatePairs(candidate, rows[middle]) < 0) high = middle;
    else low = middle + 1;
  }
  rows.splice(low, 0, candidate);
  if (rows.length > limit) rows.pop();
}

function cleanTemplateRecords(input, warnings, options) {
  const parsed = parsePcrTemplateInput(input, {
    workflowSequenceRecords: options.workflowSequenceRecords,
    fallbackTitle: "template",
    label: "Template input",
    convertUtoT: true
  });
  warnings.push(...parsed.warnings);
  const cleanedRecords = parsed.records.map((record, index) => {
    const sequence = record.sequence;
    const ambiguousCount = Array.from(sequence).filter((base) => !/[ACGT]/.test(base)).length;
    if (ambiguousCount > 0) {
      warnings.push(`${record.title || `Template ${index + 1}`}: ${ambiguousCount} ambiguous base(s) were kept in the template but skipped as primer-binding positions.`);
    }
    return {
      ...record,
      title: record.title || `Template ${index + 1}`,
      sequence
    };
  }).filter((record) => record.sequence.length > 0);
  return { records: cleanedRecords, charactersRemoved: parsed.charactersRemoved };
}

export async function designPcrPrimers(input, options = {}, context = {}) {
  const normalized = normalizePcrPrimerDesignOptions(options);
  const warnings = [...(Array.isArray(options.referenceWarnings) ? options.referenceWarnings : [])];
  const notes = [];
  const referenceRecords = Array.isArray(options.referenceRecords)
    ? options.referenceRecords.filter((record) => String(record?.sequence ?? "").length > 0)
    : [];
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const { records, charactersRemoved } = cleanTemplateRecords(input, warnings, options);
  const featureTarget = resolveDesignFeatureTarget(records, normalized.targetFeature);
  if (featureTarget?.partial && normalized.featureTargetMode === "flank") throw new Error("This feature has partial boundaries. Choose Design within feature or provide a template with complete feature boundaries.");
  if (featureTarget?.crossesOrigin && normalized.featureTargetMode === "flank") throw new Error("This feature crosses the sequence origin or has parts out of coordinate order. Amplify entire feature requires a linear span; choose Design within feature or rotate the annotated template first.");
  const search = {
    status: "complete", evaluatedPairs: 0,
    templates: records.map((record, recordIndex) => ({
      recordIndex, id: record.id ?? "", title: record.title, length: record.sequence.length,
      status: featureTarget && featureTarget.recordIndex !== recordIndex ? "not selected" : "not searched",
      evaluatedPairs: 0
    }))
  };
  if (records.length === 0) {
    return { records, rows: [], warnings: [...warnings, "No template sequence was provided."], charactersRemoved, options: normalized, search };
  }

  const rows = [];
  let totalBases = 0;
  let evaluatedPairs = 0;
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (featureTarget && featureTarget.recordIndex !== recordIndex) continue;
    const scope = search.templates[recordIndex];
    totalBases += record.sequence.length;
    context.reportProgress?.({
      phase: "scanning-template",
      detail: record.title,
      progress: 0.1 + (recordIndex / records.length) * 0.7
    });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();

    if (record.sequence.length > normalized.maxTemplateLength) {
      scope.status = "skipped limit";
      search.status = "partial";
      warnings.push(`${record.title}: skipped because ${record.sequence.length} bp exceeds the current design limit of ${normalized.maxTemplateLength} bp.`);
      continue;
    }
    if (record.sequence.length < normalized.minProductLength) {
      scope.status = "below minimum length";
      warnings.push(`${record.title}: sequence is shorter than the minimum product size.`);
      continue;
    }

    const targetRegions = parseCoordinateRanges(normalized.targetRegion, record.sequence.length, warnings, `${record.title} target region`);
    const excludedRegions = parseCoordinateRanges(normalized.excludedRegions, record.sequence.length, warnings, `${record.title} excluded primer-binding region`);
    if (targetRegions.length > 0) {
      const impossibleTargets = targetRegions
        .filter((region) => (region.end - region.start + 1) > normalized.maxProductLength)
        .map(formatRegion);
      if (impossibleTargets.length > 0) {
        warnings.push(`${record.title}: target region(s) ${impossibleTargets.join(", ")} are longer than the maximum product size and cannot be flanked by a valid pair.`);
      }
    }

    scope.status = "complete";
    scope.targetRegions = targetRegions;
    scope.excludedRegions = excludedRegions;
    const { leftByStart, rightByEnd } = makeCandidateMaps(record.sequence, normalized, excludedRegions);
    const candidateRows = [];
    let capped = false;
    for (const [leftStart, leftCandidates] of leftByStart.entries()) {
      const minEnd = leftStart + normalized.minProductLength;
      const maxEnd = Math.min(record.sequence.length, leftStart + normalized.maxProductLength);
      for (const left of leftCandidates) {
        for (let rightEnd = minEnd; rightEnd <= maxEnd; rightEnd += 1) {
          const rightCandidates = rightByEnd.get(rightEnd);
          if (!rightCandidates) {
            continue;
          }
          for (const right of rightCandidates) {
            if (right.startIndex <= left.endExclusive) {
              continue;
            }
            if (!primerPairMatchesFeature(featureTarget, normalized.featureTargetMode, left, right)) continue;
            const productSize = right.endExclusive - left.startIndex;
            const flankedTarget = targetRegions.length > 0 ? findFlankedTarget(left, right, targetRegions) : null;
            if (targetRegions.length > 0 && !flankedTarget) {
              continue;
            }
            retainCandidate(candidateRows, { ...makePairRow(record, left, right, productSize, record.sequence, normalized, flankedTarget), recordIndex, target_feature: featureTarget?.label ?? "" }, normalized.returnCount);
            scope.evaluatedPairs += 1;
            evaluatedPairs += 1;
            if (evaluatedPairs >= normalized.maxPairsToEvaluate) {
              capped = true;
              break;
            }
          }
          if (capped) {
            break;
          }
        }
        if (capped) {
          break;
        }
      }
      if (capped) {
        break;
      }
    }
    rows.push(...candidateRows);
    if (capped) {
      scope.status = "partial";
      search.status = "partial";
      search.stopReason = `Pair scanning stopped after ${normalized.maxPairsToEvaluate.toLocaleString()} evaluated pairs. Returned candidates are best-so-far from a partial search; any later templates remain unsearched. Tighten the product range or template size for a more exhaustive design.`;
      warnings.push(search.stopReason);
      break;
    }
  }

  search.evaluatedPairs = evaluatedPairs;
  rows.sort((left, right) =>
    left.score - right.score ||
    left.template.localeCompare(right.template) ||
    left.product_size - right.product_size ||
    left.left_start - right.left_start
  );
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  if (referenceRecords.length > 0) {
    for (const row of rows) {
      row.left_reference_matches = countReferenceOligoMatches(row.left_primer, referenceRecords);
      row.right_reference_matches = countReferenceOligoMatches(row.right_primer, referenceRecords);
    }
  } else {
    for (const row of rows) {
      row.left_reference_matches = "";
      row.right_reference_matches = "";
    }
  }

  if (rows.length === 0) {
    notes.push(search.status === "partial" ? "No primer pairs were returned from the partial search; unsearched templates may contain candidates." : "No primer pairs passed the current constraints.");
  }
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return {
    records,
    rows,
    warnings,
    notes,
    charactersRemoved: charactersRemoved + (options.referenceCharactersRemoved ?? 0),
    basesProcessed: totalBases + (options.referenceBasesProcessed ?? 0),
    options: normalized,
    evaluatedPairs,
    search: { ...search, candidatesReturned: rows.length },
    referenceScreen: {
      status: referenceRecords.length > 0 ? "run" : "not run",
      source: options.referenceSource ?? "",
      records: referenceRecords.length,
      basesProcessed: options.referenceBasesProcessed ?? referenceRecords.reduce((sum, record) => sum + String(record.sequence ?? "").length, 0)
    }
  };
}

export function makePcrPrimerDesignTsv(rows) {
  return exportDelimitedTable(pcrPrimerDesignTableColumns, rows, "\t");
}

export function makePcrPrimerDesignReport(result) {
  const lines = [
    "PCR Primer Design",
    "",
    `Templates: ${result.records.length}`,
    `Feature target: ${designFeatureTargetLabel(result.options.targetFeature)}${result.options.targetFeature ? (result.options.featureTargetMode === "within" ? "; product within one feature part" : "; primers outside the full feature span") : ""}`,
    `Candidate primer pairs returned: ${result.rows.length}`,
    `Pair search: ${result.search?.status ?? "complete"}; ${result.search?.evaluatedPairs ?? 0} accepted pairs evaluated`,
    ...(result.search?.templates ?? []).map(record => `Template ${record.recordIndex + 1} (${record.title}; ${record.length} bp; id ${record.id || "none"}): ${record.status}; ${record.evaluatedPairs} accepted pairs evaluated`),

    `Product size range: ${result.options.minProductLength}-${result.options.maxProductLength} bp`,
    `Target region(s): ${result.options.targetRegion || "none"}`,
    `Excluded primer-binding region(s): ${result.options.excludedRegions || "none"}`,
    `Reference genome hits: ${result.referenceScreen?.status ?? "not run"}; ${result.referenceScreen?.records ?? 0} record(s) scanned; ${result.referenceScreen?.recordsSkipped ?? 0} record(s) skipped`,
    `Primer length range: ${result.options.primerMinLength}-${result.options.primerMaxLength} nt; optimum ${result.options.primerOptLength} nt`,
    `Tm range: ${result.options.primerMinTm}-${result.options.primerMaxTm} C; optimum ${result.options.primerOptTm} C`,
    `GC percent range: ${result.options.primerMinGc}-${result.options.primerMaxGc}%`,
    `GC clamp: ${result.options.gcClampMin}-${result.options.gcClampMax} G/C bases in the 3' five bases`,
    "",
    "Method: SMS3 enumerates local primer-pair candidates, filters by length, GC, approximate Tm, GC clamp, simple self-complementarity, simple 3' complementarity, hairpin-stem checks, and product size, then ranks lower scores first.",
    "",
    `SMS3 version: ${appVersion}; PCR analysis revision: 2026-11-01`,
    "Effective settings:",
    JSON.stringify(result.options, (key, value) => typeof value === "number" && !Number.isFinite(value) ? "unlimited" : value, 2),
    "Input files:",
    JSON.stringify(result.inputFiles ?? {}, null, 2),
    "Reference scope:",
    JSON.stringify(result.referenceScreen ?? {}, null, 2),
    "Warnings:",
    ...(result.warnings.length ? result.warnings : ["None"]),
    "",
    "References:",
    "",
    "Wallace rule Tm: Wallace et al. 1979.",
    "Marmur-Doty Tm approximation: Marmur and Doty 1962.",
    "Primer3 oracle comparisons: Untergasser et al. 2012.",
    "Note: the browser scorer is intentionally transparent and is not an exact reimplementation of Primer3.",
    ""
  ];
  if (result.rows.length === 0) {
    lines.push(result.search?.status === "partial" ? "No primer pairs were returned from the partial search; unsearched templates may contain candidates." : "No primer pairs passed the current constraints.");
    return lines.join("\n");
  }
  lines.push("rank\ttemplate\tproduct_size\ttarget_region\tleft_primer\tright_primer\tleft_reference_matches\tright_reference_matches\tleft_start\tright_end\tleft_tm_c\tright_tm_c\tscore");
  for (const row of result.rows) {
    lines.push([
      row.rank,
      row.template,
      row.product_size,
      row.target_region,
      row.left_primer,
      row.right_primer,
      row.left_reference_matches,
      row.right_reference_matches,
      row.left_start,
      row.right_end,
      row.left_tm_c,
      row.right_tm_c,
      row.score
    ].join("\t"));
  }
  return lines.join("\n");
}

export function makePcrPrimerDesignPrimerFasta(rows, lineWidth = PCR_PRIMER_DESIGN_DEFAULTS.lineWidth) {
  return rows.map((row) => [
    formatFastaRecord(`${row.template}_candidate_${row.rank}_left_${row.left_start}_${row.left_end}`, row.left_primer, lineWidth),
    formatFastaRecord(`${row.template}_candidate_${row.rank}_right_${row.right_start}_${row.right_end}`, row.right_primer, lineWidth)
  ].join("")).join("");
}

export function makePcrPrimerDesignProductFasta(rows, lineWidth = PCR_PRIMER_DESIGN_DEFAULTS.lineWidth) {
  return rows.map((row) =>
    formatFastaRecord(`${row.template}_candidate_${row.rank}_product_${row.product_size}_bp`, row.product_sequence, lineWidth)
  ).join("");
}
