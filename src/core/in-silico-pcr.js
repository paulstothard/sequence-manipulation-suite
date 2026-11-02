import { parsePcrTemplateInput, makePcrTemplateFeatureTracks } from "./pcr-template-input.js";
import { formatFastaRecord } from "./fasta.js";
import { makeDnaViewerData } from "./dna-viewer-data.js";
import { makeRestrictionGelSvg } from "./restriction-tools.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";
import { parsePrimerRecords, parsePrimerSequences } from "./primer-input.js";
import { normalizePcrOptions, normalizePcrNumber } from "./in-silico-pcr-options.js";
export { normalizePcrOptions } from "./in-silico-pcr-options.js";

export const pcrProductTableColumns = [
  { id: "template", label: "Template", type: "string" },
  { id: "forward_primer", label: "Forward primer", type: "string" },
  { id: "reverse_primer", label: "Reverse primer", type: "string" },
  { id: "product", label: "Product", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "topology", label: "Topology", type: "string" },
  { id: "forward_start", label: "Forward start", type: "number" },
  { id: "forward_end", label: "Forward end", type: "number" },
  { id: "reverse_start", label: "Reverse start", type: "number" },
  { id: "reverse_end", label: "Reverse end", type: "number" },
  { id: "forward_mismatches", label: "Forward mismatches", type: "number" },
  { id: "reverse_mismatches", label: "Reverse mismatches", type: "number" },
  { id: "product_sequence", label: "Selected sequence", type: "string" },
  { id: "template_id", label: "Template ID", type: "string" },
  { id: "forward_primer_id", label: "Forward primer ID", type: "string" },
  { id: "reverse_primer_id", label: "Reverse primer ID", type: "string" },
  { id: "template_span_length", label: "Template span length", type: "number" },
  { id: "sequence_mode", label: "Sequence mode", type: "string" },
  { id: "sequence_status", label: "Sequence status", type: "string" },
  { id: "search_status", label: "Search status", type: "string" }
];

export const pcrBindingSiteTableColumns = [
  { id: "template", label: "Template", type: "string" },
  { id: "primer", label: "Primer", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "primer_sequence", label: "Annealing sequence", type: "string" },
  { id: "template_id", label: "Template ID", type: "string" },
  { id: "primer_id", label: "Primer ID", type: "string" },
  { id: "tail_sequence", label: "5-prime tail", type: "string" },
  { id: "template_binding_sequence", label: "Template in primer orientation", type: "string" },
  { id: "alignment", label: "Match alignment", type: "string" },
  { id: "mismatch_positions", label: "Mismatch positions from primer 5-prime end", type: "string" },
  { id: "exact_three_prime_bases", label: "Exact 3-prime bases", type: "number" },
  { id: "search_status", label: "Search status", type: "string" }
];

const DNA_SYMBOLS = {
  A: new Set(["A"]),
  C: new Set(["C"]),
  G: new Set(["G"]),
  T: new Set(["T", "U"]),
  U: new Set(["T", "U"]),
  R: new Set(["A", "G"]),
  Y: new Set(["C", "T", "U"]),
  S: new Set(["G", "C"]),
  W: new Set(["A", "T", "U"]),
  K: new Set(["G", "T", "U"]),
  M: new Set(["A", "C"]),
  B: new Set(["C", "G", "T", "U"]),
  D: new Set(["A", "G", "T", "U"]),
  H: new Set(["A", "C", "T", "U"]),
  V: new Set(["A", "C", "G"]),
  N: new Set(["A", "C", "G", "T", "U"])
};

const SCAN_CHECK_INTERVAL = 2048;

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function splitInput(input, separator = "---") {
  const pattern = new RegExp(`\\n${separator.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\n`);
  const parts = String(input ?? "").replace(/\r\n?/g, "\n").split(pattern);
  return {
    templateText: parts[0] ?? "",
    primerText: parts.slice(1).join(`\n${separator}\n`)
  };
}

function parsePcrPrimers(text, warnings) {
  return parsePrimerRecords(text).flatMap((record, index) => {
    const parts = record.sequence.split("|");
    if (parts.length > 2 || parts.some((part) => !part)) {
      throw new Error(`${record.title}: use annealing sequence alone or 5-prime-tail|annealing-sequence.`);
    }
    const sequence = parts.at(-1);
    const parsed = parsePrimerSequences(`>${record.title}\n${sequence}`, warnings)[0];
    const tail = parts.length === 2 ? parsePrimerSequences(`>${record.title} tail\n${parts[0]}`, warnings)[0]?.sequence ?? "" : "";
    return parsed ? [{ ...parsed, id: `primer-${index + 1}`, tail_sequence: tail, full_sequence: tail + parsed.sequence }] : [];
  });
}

function makeBindingSite(template, primer, start, strand, mismatches, options) {
  const direct = circularSlice(template, start, start + primer.sequence.length);
  const target = strand === "+" ? direct : reverseComplement(direct);
  const mismatchPositions = [];
  const alignment = Array.from(primer.sequence, (base, index) => {
    if (base === target[index]) return "|";
    if (symbolsOverlap(base, target[index])) return ":";
    mismatchPositions.push(index + 1);
    return "X";
  }).join("");
  return {
    primer: primer.title, primer_id: primer.id,
    primer_sequence: primer.sequence, tail_sequence: primer.tail_sequence,
    template_binding_sequence: target, alignment,
    mismatch_positions: mismatchPositions.join(","),
    exact_three_prime_bases: Math.min(options.exactThreePrimeBases, primer.sequence.length),
    strand, start: start + 1, end: ((start + primer.sequence.length - 1) % template.length) + 1,
    startIndex: start, endIndex: start + primer.sequence.length - 1, mismatches
  };
}

function symbolsOverlap(left, right) {
  if (left === right) {
    return true;
  }
  const leftSet = DNA_SYMBOLS[left];
  const rightSet = DNA_SYMBOLS[right];
  if (!leftSet || !rightSet) {
    return false;
  }
  for (const symbol of leftSet) {
    if (rightSet.has(symbol)) {
      return true;
    }
  }
  return false;
}

function comparePrimerAt(template, primer, start, options, threePrimeSide = "right") {
  let mismatches = 0;
  for (let index = 0; index < primer.length; index += 1) {
    if (!symbolsOverlap(primer[index], template[start + index])) {
      mismatches += 1;
      if (mismatches > options.maxMismatches) {
        return null;
      }
    }
  }
  if (options.exactThreePrimeBases > 0) {
    const exactCount = Math.min(options.exactThreePrimeBases, primer.length);
    const exactStart = threePrimeSide === "left" ? 0 : Math.max(0, primer.length - exactCount);
    const exactEnd = threePrimeSide === "left" ? exactCount : primer.length;
    for (let index = exactStart; index < exactEnd; index += 1) {
      if (primer[index] !== template[start + index]) {
        return null;
      }
    }
  }
  return mismatches;
}

function* scanPrimerBindingSites(template, primer, options, remainingSiteLimit, context = {}, progress = {}) {
  const sites = [];
  if (primer.sequence.length > template.length) return { sites, capped: false };
  const forwardPrimer = primer.sequence;
  const reversePrimer = reverseComplement(primer.sequence).replaceAll("U", "T");
  const scanTemplate = options.topology === "circular"
    ? template + template.slice(0, Math.max(0, primer.sequence.length - 1))
    : template;
  const limit = template.length;

  for (let start = 0; start < limit; start += 1) {
    if (start % SCAN_CHECK_INTERVAL === 0) {
      const progressValue = progress.base + (progress.span * start) / Math.max(1, limit);
      context.reportProgress?.({ phase: "scanning-primers", detail: progress.detail, progress: progressValue });
      context.throwIfCancelled?.();
      yield;
    }
    if (start + primer.sequence.length > scanTemplate.length) {
      break;
    }
    const forwardMismatches = comparePrimerAt(scanTemplate, forwardPrimer, start, options);
    if (forwardMismatches !== null) {
      sites.push(makeBindingSite(template, primer, start, "+", forwardMismatches, options));
      if (sites.length >= remainingSiteLimit) {
        return { sites, capped: true };
      }
    }
    const reverseMismatches = comparePrimerAt(scanTemplate, reversePrimer, start, options, "left");
    if (reverseMismatches !== null) {
      sites.push(makeBindingSite(template, primer, start, "-", reverseMismatches, options));
      if (sites.length >= remainingSiteLimit) {
        return { sites, capped: true };
      }
    }
  }
  return { sites, capped: false };
}

function circularSlice(sequence, startInclusive, endExclusive) {
  const span = endExclusive - startInclusive;
  const start = startInclusive % sequence.length;
  return sequence.repeat(Math.ceil((start + span) / sequence.length)).slice(start, start + span);
}

// Real PCR incorporates primer bases. A template-interval export is explicitly
// separate; see https://bigsdb.readthedocs.io/en/latest/data_analysis/in_silico_pcr.html.
function incorporatePrimers(templateSequence, forward, reverse) {
  const bases = Array.from(templateSequence);
  const reverseBases = reverseComplement(reverse.primer_sequence);
  const reverseStart = bases.length - reverseBases.length;
  const codes = Object.entries(DNA_SYMBOLS).filter(([code]) => code !== "U");
  for (let index = 0; index < forward.primer_sequence.length; index += 1) bases[index] = forward.primer_sequence[index];
  for (let index = 0; index < reverseBases.length; index += 1) {
    const position = reverseStart + index;
    const base = reverseBases[index];
    if (position < forward.primer_sequence.length) {
      const shared = [...DNA_SYMBOLS[bases[position]]].filter((symbol) => symbol !== "U" && DNA_SYMBOLS[base].has(symbol));
      if (shared.length === 0) return { sequence: "", status: "unavailable: conflicting overlapping primers" };
      bases[position] = codes.find(([, symbols]) => [...symbols].filter((symbol) => symbol !== "U").length === shared.length && shared.every((symbol) => symbols.has(symbol)))[0];
    } else bases[position] = base;
  }
  const sequence = forward.tail_sequence + bases.join("") + reverseComplement(reverse.tail_sequence);
  return { sequence, status: /^[ACGT]+$/.test(sequence) ? "resolved sequence" : "IUPAC alternatives; individual molecules unresolved" };
}

function makeProductRows(templateRecord, sites, options, remainingProductLimit = Number.POSITIVE_INFINITY) {
  const rows = [];
  const forwardSites = sites.filter((site) => site.strand === "+");
  const reverseSites = sites.filter((site) => site.strand === "-");
  for (const forwardSite of forwardSites) {
    for (const reverseSite of reverseSites) {
      let reverseStart = reverseSite.startIndex;
      if (options.topology === "circular" && reverseStart < forwardSite.startIndex) reverseStart += templateRecord.sequence.length;
      const templateLength = reverseStart + reverseSite.primer_sequence.length - forwardSite.startIndex;
      // Both complete annealing regions must fit; ordinary compatible overlaps remain valid.
      if (reverseStart < forwardSite.startIndex || templateLength < forwardSite.primer_sequence.length || templateLength < reverseSite.primer_sequence.length) continue;
      const length = templateLength + forwardSite.tail_sequence.length + reverseSite.tail_sequence.length;
      if (length < options.minProductLength || length > options.maxProductLength) continue;
      const templateSequence = circularSlice(templateRecord.sequence, forwardSite.startIndex, forwardSite.startIndex + templateLength);
      const incorporated = incorporatePrimers(templateSequence, forwardSite, reverseSite);
      rows.push({
        template: templateRecord.title, template_id: templateRecord.id,
        forward_primer: forwardSite.primer, forward_primer_id: forwardSite.primer_id,
        reverse_primer: reverseSite.primer, reverse_primer_id: reverseSite.primer_id,
        product: 0, length, template_span_length: templateLength, topology: options.topology,
        forward_start: forwardSite.start, forward_end: forwardSite.end,
        reverse_start: reverseSite.start, reverse_end: reverseSite.end,
        forward_mismatches: forwardSite.mismatches, reverse_mismatches: reverseSite.mismatches,
        sequence_mode: options.productSequenceMode,
        sequence_status: options.productSequenceMode === "template" ? "template-derived interval; excludes primer changes and tails" : incorporated.status,
        product_sequence: options.productSequenceMode === "template" ? templateSequence : incorporated.sequence,
        template_sequence: templateSequence, amplicon_sequence: incorporated.sequence
      });
      if (rows.length >= remainingProductLimit) return { rows: rows.sort((a, b) => a.length - b.length || a.forward_start - b.forward_start), capped: true };
    }
  }
  return { rows: rows.sort((a, b) => a.length - b.length || a.forward_start - b.forward_start), capped: false };
}

function cleanTemplateRecords(templateRecords, warnings) {
  let charactersRemoved = 0;
  const records = templateRecords.map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title || `Template ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    return {
      ...record,
      id: `template-${index + 1}`,
      title: record.title || `Template ${index + 1}`,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((record) => record.sequence.length > 0);
  return { records, charactersRemoved };
}

function makeSiteRows(record, sites) {
  return sites.map(({ startIndex, endIndex, ...site }) => ({ template: record.title, template_id: record.id, ...site }));
}

function finishPcrResult(result) {
  result.analysisRevision = "2026-11-01";
  result.searchStatus = result.searchStatus ?? "complete";
  const unresolved = result.rows.filter((row) => !row.product_sequence).length;
  if (unresolved) result.warnings.push(`${unresolved} candidate product(s) have conflicting overlapping primer bases; their sequences are unavailable and omitted from FASTA.`);
  for (const row of [...result.rows, ...result.siteRows]) row.search_status = result.searchStatus;
  return result;
}

function* scanPcrProducts(input, normalized, context, bindingSitesOnly = false) {
  const warnings = [];
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  yield;

  const { templateText, primerText } = splitInput(input);
  const parsedTemplates = parsePcrTemplateInput(templateText, {
    fallbackTitle: "sequence",
    label: "Template input",
    convertUtoT: true
  });
  warnings.push(...parsedTemplates.warnings);
  const templateRecords = parsedTemplates.records;
  const primers = parsePcrPrimers(primerText, warnings);
  if (templateRecords.length === 0) {
    return finishPcrResult({ records: [], primers, rows: [], siteRows: [], sitesByTemplate: [], searchStatus: "not run", options: normalized, warnings: [...warnings, "No template sequence was provided."], charactersRemoved: parsedTemplates.charactersRemoved });
  }
  if (primers.length === 0) {
    return finishPcrResult({ records: [], primers, rows: [], siteRows: [], sitesByTemplate: [], searchStatus: "not run", options: normalized, warnings: ["No primer sequences were provided."], charactersRemoved: 0 });
  }

  const { records, charactersRemoved } = cleanTemplateRecords(templateRecords, warnings);
  const rows = [];
  const siteRows = [];
  const sitesByTemplate = [];
  let searchStatus = "complete";
  const scanCount = Math.max(1, records.length * primers.length);
  let scanIndex = 0;
  for (const [recordIndex, record] of records.entries()) {
    const sites = [];
    for (const primer of primers) {
      const remainingSites = normalized.maxBindingSitesPerTemplate - sites.length;
      if (remainingSites <= 0) {
        searchStatus = "partial";
        warnings.push(`${record.title}: binding-site scan stopped after ${normalized.maxBindingSitesPerTemplate.toLocaleString()} site(s). Product calls may be incomplete; tighten primer settings or raise the cap.`);
        break;
      }
      const progressBase = 0.1 + (scanIndex / scanCount) * 0.65;
      const progressSpan = 0.65 / scanCount;
      const scan = yield* scanPrimerBindingSites(record.sequence, primer, normalized, remainingSites, context, {
        base: progressBase,
        span: progressSpan,
        detail: `${record.title}: ${primer.title}`
      });
      scanIndex += 1;
      sites.push(...scan.sites);
      if (scan.capped) {
        searchStatus = "partial";
        warnings.push(`${record.title}: binding-site scan stopped after ${normalized.maxBindingSitesPerTemplate.toLocaleString()} site(s). Product calls may be incomplete; tighten primer settings or raise the cap.`);
        break;
      }
    }
    context.reportProgress?.({ phase: "calling-products", detail: record.title, progress: 0.78 + (recordIndex / Math.max(1, records.length)) * 0.07 });
    context.throwIfCancelled?.();
    yield;
    sitesByTemplate.push({ record, sites });
    siteRows.push(...makeSiteRows(record, sites));
    if (bindingSitesOnly) continue;
    const remainingProducts = normalized.maxProducts - rows.length;
    if (remainingProducts <= 0) {
      searchStatus = "partial";
      warnings.push(`Product calling stopped after ${normalized.maxProducts.toLocaleString()} product(s). Tighten the product range or primer settings, or raise the cap.`);
      break;
    }
    const productResult = makeProductRows(record, sites, normalized, remainingProducts);
    rows.push(...productResult.rows.map((row, index) => ({ ...row, product: rows.length + index + 1 })));
    if (productResult.capped) {
      searchStatus = "partial";
      warnings.push(`Product calling stopped after ${normalized.maxProducts.toLocaleString()} product(s). Tighten the product range or primer settings, or raise the cap.`);
      break;
    }
  }
  return finishPcrResult({ records, primers, rows, siteRows, sitesByTemplate, warnings, searchStatus, charactersRemoved: parsedTemplates.charactersRemoved + charactersRemoved, options: normalized });
}

// Compatibility entry points drain the same computation. Only the async wrapper
// waits at cooperative checkpoints; no biological or normalization logic differs.
export function findInSilicoPcrProducts(input, options = {}, context = {}) {
  const scan = scanPcrProducts(input, normalizePcrOptions(options), context);
  let step = scan.next();
  while (!step.done) step = scan.next();
  return step.value;
}

async function finishPcrScanAsync(scan, context) {
  let step = scan.next();
  while (!step.done) {
    await context.yieldIfNeeded?.();
    context.throwIfCancelled?.();
    step = scan.next();
  }
  return step.value;
}

export function findInSilicoPcrProductsAsync(input, options = {}, context = {}) {
  return finishPcrScanAsync(scanPcrProducts(input, normalizePcrOptions(options), context), context);
}

// Sequence Extractor consumes sites only and owns its own site ceiling. Keep
// that internal consumer separate from the In Silico PCR tool's fixed ceilings.
export function findPcrPrimerSitesAsync(input, options = {}, context = {}) {
  const normalized = normalizePcrOptions(options);
  normalized.maxBindingSitesPerTemplate = normalizePcrNumber("maxBindingSitesPerTemplate", options.maxBindingSitesPerTemplate);
  return finishPcrScanAsync(scanPcrProducts(input, normalized, context, true), context);
}

export function makePcrReport(result) {
  const lines = [];
  lines.push("In silico PCR");
  lines.push(`Templates: ${result.records.length}`);
  lines.push(`Primers: ${result.primers.length}`);
  lines.push(`Topology: ${result.options.topology}`);
  lines.push(`Allowed mismatches per primer: ${result.options.maxMismatches}`);
  lines.push(`Required exact 3' bases: ${result.options.exactThreePrimeBases}`);
  lines.push(`Product length range: ${result.options.minProductLength}-${result.options.maxProductLength} bp`);
  lines.push(`Products found: ${result.rows.length}`);
  lines.push(`Search status: ${result.searchStatus}`);
  lines.push(`Sequence mode: ${result.options.productSequenceMode}; product lengths include specified 5-prime tails.`);
  lines.push(...result.warnings.map((warning) => `Warning: ${warning}`));
  lines.push("");
  if (result.rows.length === 0) {
    lines.push(result.searchStatus === "partial" ? "No products found in the partial search; additional products may have been excluded by limits." : "No products matched the current primer and product-length settings.");
    return lines.join("\n");
  }
  lines.push("template\tproduct\tlength\tforward_primer\tforward_start\tforward_end\treverse_primer\treverse_start\treverse_end\tmismatches");
  for (const row of result.rows) {
    lines.push([
      row.template,
      row.product,
      row.length,
      row.forward_primer,
      row.forward_start,
      row.forward_end,
      row.reverse_primer,
      row.reverse_start,
      row.reverse_end,
      `${row.forward_mismatches}+${row.reverse_mismatches}`
    ].join("\t"));
  }
  return lines.join("\n");
}

export function makePcrBindingAlignments(result) {
  const lines = ["PCR primer/template alignments", `Search status: ${result.searchStatus}`, "Coordinates are 1-based on the submitted template; primer positions run 5-prime to 3-prime.", "Match key: | exact; : compatible IUPAC; X mismatch. * marks the exact 3-prime clamp.", ...result.warnings.map((warning) => `Warning: ${warning}`), ""];
  for (const row of result.siteRows) {
    const tail = row.tail_sequence;
    lines.push(`${row.template_id} ${row.template}: ${row.start}-${row.end} (${row.strand}); ${row.primer_id} ${row.primer}`,
      `primer   5' ${tail}${row.primer_sequence} 3'`,
      `            ${" ".repeat(tail.length)}${row.alignment}`,
      `template 3' ${"-".repeat(tail.length)}${complementDnaRnaSequence(row.template_binding_sequence)} 5'`,
      `clamp       ${" ".repeat(tail.length + row.primer_sequence.length - row.exact_three_prime_bases)}${"*".repeat(row.exact_three_prime_bases)}`,
      `5-prime tail: ${tail || "none"}; mismatch positions in annealing region: ${row.mismatch_positions || "none"}`, "");
  }
  return lines.join("\n");
}

export function makePcrProductsTsv(rows) {
  const headers = pcrProductTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => String(row[header] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function makePcrBindingSitesTsv(rows) {
  const headers = pcrBindingSiteTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => String(row[header] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function makePcrProductsFasta(rows, lineWidth) {
  const width = normalizePcrNumber("lineWidth", lineWidth);
  return rows.filter((row) => row.product_sequence).map((row) =>
    formatFastaRecord(
      `${row.template}_pcr_product_${row.product} ${row.forward_primer}/${row.reverse_primer} ${row.product_sequence.length} bp; template_id=${row.template_id}; sequence=${row.sequence_mode}; search=${row.search_status}; ${row.sequence_status}`,
      row.product_sequence,
      width
    )
  ).join("\n");
}

export function makePcrProductGelSvg(result) {
  const records = (result.records ?? []).map((record) => ({
    title: record.title,
    length: record.sequence.length,
    fragments: (result.rows ?? [])
      .filter((row) => row.template_id === record.id)
      .map((row) => ({
        ...row,
        length: row.length,
        topology: "linear",
        label: `${row.product}`,
        product: row.product,
        sourceRecordTitle: record.title,
        start: row.forward_start,
        end: row.reverse_end
      })),
    hits: []
  }));
  return makeRestrictionGelSvg(records, {
    topology: "linear",
    emptyFragmentsAsNoBand: true,
    title: "Simulated PCR product gel",
    subtitle: "PCR lanes show amplified products only; low-abundance template DNA is not drawn.",
    note: `Qualitative schematic gel: band intensity does not predict amplification yield. Search: ${result.searchStatus}; lanes with no products found are empty.`
  });
}

function makeProductViewerItem(row) {
  return {
    start: row.forward_start,
    end: row.reverse_end,
    length: row.template_span_length,
    label: `Product ${row.product} (${row.length} bp)`,
    name: `PCR product ${row.product}`,
    type: "PCR product",
    product: row.product,
    forward_primer: row.forward_primer,
    reverse_primer: row.reverse_primer,
    forward_start: row.forward_start,
    forward_end: row.forward_end,
    reverse_start: row.reverse_start,
    reverse_end: row.reverse_end,
    forward_mismatches: row.forward_mismatches,
    reverse_mismatches: row.reverse_mismatches
  };
}

function makePrimerViewerItem(row) {
  const orientation = row.strand === "+" ? "Forward binding site" : "Reverse binding site";
  return {
    start: row.start,
    end: row.end,
    length: row.primer_sequence.length,
    label: `${row.primer} ${row.strand}`,
    name: row.primer,
    type: orientation,
    strand: row.strand,
    primer: row.primer,
    primer_sequence: row.primer_sequence,
    mismatches: row.mismatches
  };
}

export function makePcrViewerData(result, options = {}) {
  const layout = options.layout === "circular" ? "circular" : "linear";
  const records = (result.records ?? []).map((record) => {
    const productItems = (result.rows ?? [])
      .filter((row) => row.template_id === record.id)
      .map(makeProductViewerItem);
    const primerItems = (result.siteRows ?? [])
      .filter((row) => row.template_id === record.id)
      .map(makePrimerViewerItem);
    const tracks = makePcrTemplateFeatureTracks(record);
    if (productItems.length > 0) {
      tracks.push({
        id: "pcr-products",
        type: "pcr-products",
        label: "PCR products",
        layout: "stacked-intervals",
        items: productItems
      });
    }
    if (primerItems.length > 0) {
      tracks.push({
        id: "pcr-primer-sites",
        type: "pcr-primer-sites",
        label: "Primer sites",
        layout: "stacked-intervals",
        fixedSlotsByType: {
          "Forward binding site": 0,
          "Reverse binding site": 1
        },
        featureOpacity: 0.76,
        items: primerItems
      });
    }
    return {
      title: record.title,
      sequence: record.sequence,
      length: record.sequence.length,
      topology: result.options?.topology === "circular" ? "circular" : "linear",
      tracks
    };
  });
  return makeDnaViewerData(records, {
    title: "In silico PCR viewer",
    layout
  });
}

function markerText(site) {
  const length = Math.max(1, Math.abs(site.endIndex - site.startIndex) + 1);
  const arrow = site.strand === "+" ? ">" : "<";
  return arrow.repeat(Math.min(length, 24));
}

export function makePcrTextMap(result, lineWidth) {
  const width = normalizePcrNumber("textMapWidth", lineWidth);
  const lines = [];
  for (const entry of result.sitesByTemplate ?? []) {
    const sequence = entry.record.sequence;
    const mapSites = entry.sites.flatMap((site) => site.endIndex >= sequence.length
      ? [{ ...site, endIndex: sequence.length - 1 }, { ...site, startIndex: 0, endIndex: site.endIndex % sequence.length }] : [site]);
    lines.push(entry.record.title);
    lines.push(`Length: ${sequence.length} bp; primer binding sites: ${entry.sites.length}`);
    for (let offset = 0; offset < sequence.length; offset += width) {
      const chunk = sequence.slice(offset, offset + width);
      const blockStart = offset + 1;
      const blockEnd = offset + chunk.length;
      const leftLabel = String(blockStart).padStart(8, " ");
      const rightLabel = String(blockEnd).padStart(8, " ");
      lines.push(`pos ${leftLabel} ${" ".repeat(Math.max(0, chunk.length - 8))}${rightLabel}`);
      lines.push(`seq ${" ".repeat(8)} ${chunk}`);
      const visibleSites = mapSites
        .filter((site) => site.startIndex <= blockEnd - 1 && site.endIndex >= offset)
        .slice(0, 8);
      for (const site of visibleSites) {
        const relativeStart = Math.max(0, site.startIndex - offset);
        const relativeEnd = Math.min(chunk.length - 1, site.endIndex - offset);
        const span = Math.max(1, relativeEnd - relativeStart + 1);
        const label = `${site.primer} ${site.strand} ${site.start}-${site.end}`;
        const marker = markerText({ ...site, endIndex: site.startIndex + span - 1 });
        lines.push(`hit ${" ".repeat(8)} ${" ".repeat(relativeStart)}${marker.padEnd(span, site.strand === "+" ? ">" : "<")} ${label}`);
      }
      const omitted = mapSites.filter((site) => site.startIndex <= blockEnd - 1 && site.endIndex >= offset).length - visibleSites.length;
      if (omitted > 0) {
        lines.push(`hit ${" ".repeat(8)} +${omitted} additional site(s) in this block; see the binding-site table.`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}
