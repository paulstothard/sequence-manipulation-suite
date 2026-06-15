import { parseDnaRnaSequenceOrFlatfile } from "./dna-input-records.js";
import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { makeDnaViewerData } from "./dna-viewer-data.js";
import { makeRestrictionGelSvg } from "./restriction-tools.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";

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
  { id: "product_sequence", label: "Product sequence", type: "string" }
];

export const pcrBindingSiteTableColumns = [
  { id: "template", label: "Template", type: "string" },
  { id: "primer", label: "Primer", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "primer_sequence", label: "Primer sequence", type: "string" }
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
const DEFAULT_MAX_BINDING_SITES_PER_TEMPLATE = 5000;
const DEFAULT_MAX_PRODUCTS = 1000;

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function splitInput(input, separator = "---") {
  const pattern = new RegExp(`\\n${separator.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\n`);
  const parts = String(input ?? "").split(pattern);
  return {
    templateText: parts[0] ?? "",
    primerText: parts.slice(1).join(`\n${separator}\n`)
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

function parsePrimers(text, warnings) {
  const fastaRecords = parseSequenceInput(text, "sequence");
  const records = fastaRecords.length > 0
    ? fastaRecords
    : String(text ?? "")
      .split(/\r?\n/)
      .map((line, index) => ({ title: `Primer ${index + 1}`, sequence: line.trim() }))
      .filter((record) => record.sequence);

  return records.map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title || `Primer ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    return {
      title: record.title || `Primer ${index + 1}`,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((primer) => primer.sequence.length > 0);
}

function findPrimerBindingSites(template, primer, options, remainingSiteLimit = Number.POSITIVE_INFINITY, context = {}) {
  const sites = [];
  const forwardPrimer = primer.sequence;
  const reversePrimer = reverseComplement(primer.sequence).replaceAll("U", "T");
  const scanTemplate = options.topology === "circular"
    ? template + template.slice(0, Math.max(0, primer.sequence.length - 1))
    : template;
  const limit = template.length;

  for (let start = 0; start < limit; start += 1) {
    if (start % SCAN_CHECK_INTERVAL === 0) {
      context.throwIfCancelled?.();
    }
    if (start + primer.sequence.length > scanTemplate.length) {
      break;
    }
    const forwardMismatches = comparePrimerAt(scanTemplate, forwardPrimer, start, options);
    if (forwardMismatches !== null) {
      sites.push({
        primer: primer.title,
        primer_sequence: primer.sequence,
        strand: "+",
        start: start + 1,
        end: ((start + primer.sequence.length - 1) % template.length) + 1,
        startIndex: start,
        endIndex: start + primer.sequence.length - 1,
        mismatches: forwardMismatches
      });
      if (sites.length >= remainingSiteLimit) {
        return { sites, capped: true };
      }
    }
    const reverseMismatches = comparePrimerAt(scanTemplate, reversePrimer, start, options, "left");
    if (reverseMismatches !== null) {
      sites.push({
        primer: primer.title,
        primer_sequence: primer.sequence,
        strand: "-",
        start: start + 1,
        end: ((start + primer.sequence.length - 1) % template.length) + 1,
        startIndex: start,
        endIndex: start + primer.sequence.length - 1,
        mismatches: reverseMismatches
      });
      if (sites.length >= remainingSiteLimit) {
        return { sites, capped: true };
      }
    }
  }
  return { sites, capped: false };
}

async function findPrimerBindingSitesAsync(template, primer, options, remainingSiteLimit, context = {}, progress = {}) {
  const sites = [];
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
      await context.yieldIfNeeded?.();
    }
    if (start + primer.sequence.length > scanTemplate.length) {
      break;
    }
    const forwardMismatches = comparePrimerAt(scanTemplate, forwardPrimer, start, options);
    if (forwardMismatches !== null) {
      sites.push({
        primer: primer.title,
        primer_sequence: primer.sequence,
        strand: "+",
        start: start + 1,
        end: ((start + primer.sequence.length - 1) % template.length) + 1,
        startIndex: start,
        endIndex: start + primer.sequence.length - 1,
        mismatches: forwardMismatches
      });
      if (sites.length >= remainingSiteLimit) {
        return { sites, capped: true };
      }
    }
    const reverseMismatches = comparePrimerAt(scanTemplate, reversePrimer, start, options, "left");
    if (reverseMismatches !== null) {
      sites.push({
        primer: primer.title,
        primer_sequence: primer.sequence,
        strand: "-",
        start: start + 1,
        end: ((start + primer.sequence.length - 1) % template.length) + 1,
        startIndex: start,
        endIndex: start + primer.sequence.length - 1,
        mismatches: reverseMismatches
      });
      if (sites.length >= remainingSiteLimit) {
        return { sites, capped: true };
      }
    }
  }
  return { sites, capped: false };
}

function circularSlice(sequence, startInclusive, endExclusive) {
  if (endExclusive <= sequence.length) {
    return sequence.slice(startInclusive, endExclusive);
  }
  return sequence.slice(startInclusive) + sequence.slice(0, endExclusive - sequence.length);
}

function productSequence(template, forwardSite, reverseSite, topology) {
  const start = forwardSite.startIndex;
  let end = reverseSite.endIndex + 1;
  if (topology === "linear") {
    return template.slice(start, end);
  }
  if (end <= start) {
    end += template.length;
  }
  return circularSlice(template, start, end);
}

function makeProductRows(templateRecord, sites, options, remainingProductLimit = Number.POSITIVE_INFINITY) {
  const rows = [];
  const forwardSites = sites.filter((site) => site.strand === "+");
  const reverseSites = sites.filter((site) => site.strand === "-");
  for (const forwardSite of forwardSites) {
    for (const reverseSite of reverseSites) {
      let length = reverseSite.endIndex - forwardSite.startIndex + 1;
      if (options.topology === "circular" && length <= 0) {
        length += templateRecord.sequence.length;
      }
      if (length < options.minProductLength || length > options.maxProductLength) {
        continue;
      }
      if (options.topology === "linear" && forwardSite.startIndex > reverseSite.startIndex) {
        continue;
      }
      rows.push({
        template: templateRecord.title,
        forward_primer: forwardSite.primer,
        reverse_primer: reverseSite.primer,
        product: 0,
        length,
        topology: options.topology,
        forward_start: forwardSite.start,
        forward_end: forwardSite.end,
        reverse_start: reverseSite.start,
        reverse_end: reverseSite.end,
        forward_mismatches: forwardSite.mismatches,
        reverse_mismatches: reverseSite.mismatches,
        product_sequence: productSequence(templateRecord.sequence, forwardSite, reverseSite, options.topology)
      });
      if (rows.length >= remainingProductLimit) {
        return { rows: rows.sort((left, right) => left.length - right.length || left.forward_start - right.forward_start), capped: true };
      }
    }
  }
  return { rows: rows.sort((left, right) => left.length - right.length || left.forward_start - right.forward_start), capped: false };
}

export function normalizePcrOptions(options = {}) {
  const exactThreePrimeBases = Number.parseInt(options.exactThreePrimeBases, 10);
  const minProductLength = Math.max(1, Number.parseInt(options.minProductLength, 10) || 20);
  const maxProductLength = Math.max(minProductLength, Number.parseInt(options.maxProductLength, 10) || 5000);
  return {
    topology: options.topology === "circular" ? "circular" : "linear",
    maxMismatches: Math.max(0, Math.min(6, Number.parseInt(options.maxMismatches, 10) || 0)),
    exactThreePrimeBases: Math.max(0, Math.min(12, Number.isFinite(exactThreePrimeBases) ? exactThreePrimeBases : 3)),
    minProductLength,
    maxProductLength,
    maxBindingSitesPerTemplate: Math.max(1, Math.min(100000, Number.parseInt(options.maxBindingSitesPerTemplate, 10) || DEFAULT_MAX_BINDING_SITES_PER_TEMPLATE)),
    maxProducts: Math.max(1, Math.min(100000, Number.parseInt(options.maxProducts, 10) || DEFAULT_MAX_PRODUCTS))
  };
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
      title: record.title || `Template ${index + 1}`,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((record) => record.sequence.length > 0);
  return { records, charactersRemoved };
}

function makeSiteRows(record, sites) {
  return sites.map((site) => ({
    template: record.title,
    primer: site.primer,
    strand: site.strand,
    start: site.start,
    end: site.end,
    mismatches: site.mismatches,
    primer_sequence: site.primer_sequence
  }));
}

export function findInSilicoPcrProducts(input, options = {}, context = {}) {
  const normalized = normalizePcrOptions(options);
  const warnings = [];
  const { templateText, primerText } = splitInput(input);
  const parsedTemplates = parseDnaRnaSequenceOrFlatfile(templateText, {
    fallbackTitle: "sequence",
    label: "Template input",
    convertUtoT: true
  });
  warnings.push(...parsedTemplates.warnings);
  const templateRecords = parsedTemplates.records;
  const primers = parsePrimers(primerText, warnings);
  if (templateRecords.length === 0) {
    return { records: [], primers, rows: [], warnings: [...warnings, "No template sequence was provided."], charactersRemoved: parsedTemplates.charactersRemoved };
  }
  if (primers.length === 0) {
    return { records: [], primers, rows: [], warnings: ["No primer sequences were provided."], charactersRemoved: 0 };
  }

  const { records, charactersRemoved } = cleanTemplateRecords(templateRecords, warnings);

  const rows = [];
  const siteRows = [];
  const sitesByTemplate = [];
  for (const record of records) {
    context.throwIfCancelled?.();
    const sites = [];
    for (const primer of primers) {
      const remainingSites = normalized.maxBindingSitesPerTemplate - sites.length;
      if (remainingSites <= 0) {
        warnings.push(`${record.title}: binding-site scan stopped after ${normalized.maxBindingSitesPerTemplate.toLocaleString()} site(s). Product calls may be incomplete; tighten primer settings or raise the cap.`);
        break;
      }
      const scan = findPrimerBindingSites(record.sequence, primer, normalized, remainingSites, context);
      sites.push(...scan.sites);
      if (scan.capped) {
        warnings.push(`${record.title}: binding-site scan stopped after ${normalized.maxBindingSitesPerTemplate.toLocaleString()} site(s). Product calls may be incomplete; tighten primer settings or raise the cap.`);
        break;
      }
    }
    sitesByTemplate.push({ record, sites });
    siteRows.push(...makeSiteRows(record, sites));
    const remainingProducts = normalized.maxProducts - rows.length;
    if (remainingProducts <= 0) {
      warnings.push(`Product calling stopped after ${normalized.maxProducts.toLocaleString()} product(s). Tighten the product range or primer settings, or raise the cap.`);
      break;
    }
    const productResult = makeProductRows(record, sites, normalized, remainingProducts);
    rows.push(...productResult.rows.map((row, index) => ({ ...row, product: rows.length + index + 1 })));
    if (productResult.capped) {
      warnings.push(`Product calling stopped after ${normalized.maxProducts.toLocaleString()} product(s). Tighten the product range or primer settings, or raise the cap.`);
      break;
    }
  }
  return { records, primers, rows, siteRows, sitesByTemplate, warnings, charactersRemoved: parsedTemplates.charactersRemoved + charactersRemoved, options: normalized };
}

export async function findInSilicoPcrProductsAsync(input, options = {}, context = {}) {
  const normalized = normalizePcrOptions(options);
  const warnings = [];
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const { templateText, primerText } = splitInput(input);
  const parsedTemplates = parseDnaRnaSequenceOrFlatfile(templateText, {
    fallbackTitle: "sequence",
    label: "Template input",
    convertUtoT: true
  });
  warnings.push(...parsedTemplates.warnings);
  const templateRecords = parsedTemplates.records;
  const primers = parsePrimers(primerText, warnings);
  if (templateRecords.length === 0) {
    return { records: [], primers, rows: [], warnings: [...warnings, "No template sequence was provided."], charactersRemoved: parsedTemplates.charactersRemoved, options: normalized };
  }
  if (primers.length === 0) {
    return { records: [], primers, rows: [], warnings: ["No primer sequences were provided."], charactersRemoved: 0, options: normalized };
  }

  const { records, charactersRemoved } = cleanTemplateRecords(templateRecords, warnings);
  const rows = [];
  const siteRows = [];
  const sitesByTemplate = [];
  const scanCount = Math.max(1, records.length * primers.length);
  let scanIndex = 0;
  for (const [recordIndex, record] of records.entries()) {
    const sites = [];
    for (const primer of primers) {
      const remainingSites = normalized.maxBindingSitesPerTemplate - sites.length;
      if (remainingSites <= 0) {
        warnings.push(`${record.title}: binding-site scan stopped after ${normalized.maxBindingSitesPerTemplate.toLocaleString()} site(s). Product calls may be incomplete; tighten primer settings or raise the cap.`);
        break;
      }
      const progressBase = 0.1 + (scanIndex / scanCount) * 0.65;
      const progressSpan = 0.65 / scanCount;
      const scan = await findPrimerBindingSitesAsync(record.sequence, primer, normalized, remainingSites, context, {
        base: progressBase,
        span: progressSpan,
        detail: `${record.title}: ${primer.title}`
      });
      scanIndex += 1;
      sites.push(...scan.sites);
      if (scan.capped) {
        warnings.push(`${record.title}: binding-site scan stopped after ${normalized.maxBindingSitesPerTemplate.toLocaleString()} site(s). Product calls may be incomplete; tighten primer settings or raise the cap.`);
        break;
      }
    }
    context.reportProgress?.({ phase: "calling-products", detail: record.title, progress: 0.78 + (recordIndex / Math.max(1, records.length)) * 0.07 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    sitesByTemplate.push({ record, sites });
    siteRows.push(...makeSiteRows(record, sites));
    const remainingProducts = normalized.maxProducts - rows.length;
    if (remainingProducts <= 0) {
      warnings.push(`Product calling stopped after ${normalized.maxProducts.toLocaleString()} product(s). Tighten the product range or primer settings, or raise the cap.`);
      break;
    }
    const productResult = makeProductRows(record, sites, normalized, remainingProducts);
    rows.push(...productResult.rows.map((row, index) => ({ ...row, product: rows.length + index + 1 })));
    if (productResult.capped) {
      warnings.push(`Product calling stopped after ${normalized.maxProducts.toLocaleString()} product(s). Tighten the product range or primer settings, or raise the cap.`);
      break;
    }
  }
  return { records, primers, rows, siteRows, sitesByTemplate, warnings, charactersRemoved: parsedTemplates.charactersRemoved + charactersRemoved, options: normalized };
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
  lines.push("");
  if (result.rows.length === 0) {
    lines.push("No products matched the current primer and product-length settings.");
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

export function makePcrProductsFasta(rows, lineWidth = 60) {
  return rows.map((row) =>
    formatFastaRecord(
      `${row.template}_pcr_product_${row.product} ${row.forward_primer}/${row.reverse_primer} ${row.length} bp`,
      row.product_sequence,
      lineWidth
    )
  ).join("\n");
}

export function makePcrProductGelSvg(result) {
  const records = (result.records ?? []).map((record) => ({
    title: record.title,
    length: record.sequence.length,
    fragments: (result.rows ?? [])
      .filter((row) => row.template === record.title)
      .map((row) => ({
        length: row.length,
        topology: "linear",
        label: `${row.product}`,
        product: row.product
      })),
    hits: []
  }));
  return makeRestrictionGelSvg(records, {
    topology: "linear",
    emptyFragmentsAsNoBand: true,
    title: "Simulated PCR product gel",
    subtitle: "PCR lanes show amplified products only; low-abundance template DNA is not drawn.",
    note: "Qualitative schematic gel: PCR product bands use product length and mass-scaled intensity; lanes with no products are empty."
  });
}

function makeProductViewerItem(row) {
  return {
    start: row.forward_start,
    end: row.reverse_end,
    length: row.length,
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
      .filter((row) => row.template === record.title)
      .map(makeProductViewerItem);
    const primerItems = (result.siteRows ?? [])
      .filter((row) => row.template === record.title)
      .map(makePrimerViewerItem);
    const tracks = [];
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

export function makePcrTextMap(result, lineWidth = 80) {
  const width = Math.max(40, Math.min(140, Number.parseInt(lineWidth, 10) || 80));
  const lines = [];
  for (const entry of result.sitesByTemplate ?? []) {
    const sequence = entry.record.sequence;
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
      const visibleSites = entry.sites
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
      const omitted = entry.sites.filter((site) => site.startIndex <= blockEnd - 1 && site.endIndex >= offset).length - visibleSites.length;
      if (omitted > 0) {
        lines.push(`hit ${" ".repeat(8)} +${omitted} additional site(s) in this block; see the binding-site table.`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}
