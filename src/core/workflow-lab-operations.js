import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { prepareSangerSimulation } from "./simulate-sanger-trace.js";
import { makeCollectionStream, makeTableStream, makeTextStream } from "./workflow.js";

const textOutput = { id: "primary", kind: "text", mediaType: "text/plain" };
const comparisonColumns = [
  { id: "metric", label: "Metric" }, { id: "before", label: "Before trimming", type: "number" },
  { id: "after", label: "After trimming", type: "number" }, { id: "change", label: "Change", type: "number" },
  { id: "unit", label: "Unit" }, { id: "retained_percent", label: "Retained %", type: "number" }
];
export const labWorkflowOperations = Object.assign(Object.create(null), {
  "sanger-read-templates": { name: "Split Sanger read templates", summary: "Validate 2–20 FASTA records, at most 2,000 bases each and 5,000 bases total, before simulating a separate trace for each record. Supply each sequence in its sequencing orientation.", output: { id: "primary", kind: "collection", itemKind: "sequence-records", label: "Read templates" } },
  "sanger-trace-bundle": { name: "Gather Sanger traces", summary: "Combine up to 20 simulated Trace JSON outputs and 5,000 read positions into one trace session, preserving chromatogram channels, base calls, positions, qualities and simulation settings.", output: { ...textOutput, mediaType: "application/json", label: "Trace JSON" } },
  "text-section": { name: "Read input section", summary: "Read one section separated by the marker shown in the workflow input.", output: textOutput },
  "text-bundle": { name: "Combine tool inputs", summary: "Join the two selected inputs at the next tool's input boundary.", secondary: "other", output: textOutput },
  "pcr-product-sequences": { name: "Check PCR products", summary: "Require one exact-match product per haplotype before digestion. Missing, ambiguous or multiple products stop this recipe.", secondary: "templates", output: { ...textOutput, mediaType: "text/x-fasta", label: "Checked PCR products" } },
  "compare-fastq-qc": { name: "Compare trimming results", summary: "Compare read retention, retained bases, length and quality before and after trimming. Percentage changes are shown in percentage points. Positive changes are not always improvements.", secondary: "before", output: { id: "primary", kind: "table", schema: "workflow-fastq-comparison", columns: comparisonColumns } }
});

function boundaryPattern(separator) {
  const escaped = separator.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[ \\t]*${escaped}[ \\t]*\\r?$`, "gm");
}

export function validateLabOperation(step, source, secondary) {
  const errors = [];
  if (step.type === "sanger-trace-bundle") {
    return source?.kind === "collection" ? [] : [`Step "${step.id}" requires a collection of simulated Trace JSON outputs.`];
  }
  const expected = step.type === "pcr-product-sequences" ? ["table", "sequence-records"]
    : step.type === "compare-fastq-qc" ? ["table", "table"] : ["text", "text"];
  const compatible = (value, kind) => value?.kind === kind || (step.type === "text-bundle" && value?.kind === "sequence-records" && value.alphabet !== "protein");
  if (!compatible(source, expected[0])) errors.push(`Step "${step.id}" requires ${expected[0]} input.`);
  if (labWorkflowOperations[step.type].secondary && !compatible(secondary, expected[1])) errors.push(`Step "${step.id}" requires a ${expected[1]} secondary input.`);
  if (["text-section", "text-bundle"].includes(step.type) && (typeof step.separator !== "string" || !step.separator.trim() || /[\r\n]/.test(step.separator))) errors.push(`Step "${step.id}" requires a nonempty single-line separator.`);
  if (step.type === "text-section" && ![0, 1].includes(step.section)) errors.push(`Step "${step.id}" must select section 0 or 1.`);
  return errors;
}

export function runLabOperation(step, source, secondary, { toText, sourceWarnings = [], sourceSites = [] } = {}) {
  const errors = validateLabOperation(step, source, secondary);
  if (errors.length) throw new Error(errors.join(" "));
  if (step.type === "sanger-read-templates") {
    const text = toText(source);
    const prepared = prepareSangerSimulation(text);
    if (prepared.templates.length < 2) throw new Error("Sanger assembly requires at least two read templates.");
    if (prepared.templates.reduce((sum, template) => sum + template.sequence.length, 0) > 5000) throw new Error("Sanger assembly workflow input exceeds 5,000 total template bases.");
    // Keep original records so each simulator run still reports any input cleanup.
    const records = parseSequenceInput(text);
    if (records.length !== prepared.templates.length) throw new Error("Supply Sanger assembly templates as plain FASTA records.");
    return makeCollectionStream(records.map(record => ({ kind: "sequence-records", alphabet: "dna-rna", records: [record] })), "sequence-records");
  }
  if (step.type === "sanger-trace-bundle") {
    const items = source.items ?? [];
    if (!items.length || items.length > 20) throw new Error("Gather Sanger traces requires 1–20 traces; no traces were discarded.");
    if (items.some(item => item.kind !== "text" || typeof item.text !== "string")) throw new Error("Gather Sanger traces requires simulated Trace JSON outputs.");
    if (items.reduce((sum, item) => sum + item.text.length, 0) > 20_000_000) throw new Error("Combined trace input exceeds the 20,000,000-character workflow limit.");
    const traces = items.map((item, index) => {
      let trace;
      try { trace = JSON.parse(item.text); } catch { throw new Error(`Trace ${index + 1}: invalid Trace JSON.`); }
      if (trace?.format !== "sms3-sanger-trace-v1" || trace.traceMode !== "simulated-channels" ||
          typeof trace.bases !== "string" || !/^[ACGTRYSWKMBDHVN]+$/.test(trace.bases) || trace.bases.length > 3000 ||
          !Array.isArray(trace.basePositions) || trace.basePositions.length !== trace.bases.length ||
          !Array.isArray(trace.qualities) || trace.qualities.length !== trace.bases.length ||
          !["A", "C", "G", "T"].every(base => Array.isArray(trace.traces?.[base]) && trace.traces[base].length > 0)) {
        throw new Error(`Trace ${index + 1}: choose Trace JSON from Simulate Sanger Trace, with all four signal channels.`);
      }
      const samples = trace.traces.A.length;
      if (!["A", "C", "G", "T"].every(base => trace.traces[base].length === samples && trace.traces[base].every(value => Number.isFinite(value) && value >= 0)) ||
          !trace.basePositions.every((position, i, positions) => Number.isInteger(position) && position >= 1 && position <= samples && (!i || position > positions[i - 1])) ||
          !trace.qualities.every(quality => Number.isInteger(quality) && quality >= 0 && quality <= 93)) {
        throw new Error(`Trace ${index + 1}: inconsistent signal channels, peak positions or qualities.`);
      }
      // Give separately simulated reads distinct display names without changing signals.
      const templates = trace.simulation?.templates;
      const title = templates?.length === 1 ? templates[0].title : trace.name;
      return { ...trace, name: `${index + 1}: ${title || "Simulated trace"}` };
    });
    if (traces.reduce((sum, trace) => sum + trace.bases.length, 0) > 5000) throw new Error("Sanger assembly workflow exceeds 5,000 total read positions, including flanks.");
    return makeTextStream(JSON.stringify({ format: "sms3-sanger-trace-session-v1", traces, reference: "" }), "application/json");
  }
  if (step.type === "text-section") {
    const text = toText(source);
    if (text.length > 50_000_000) throw new Error("Section input exceeds the 50,000,000-character workflow limit.");
    const pattern = boundaryPattern(step.separator);
    const boundary = pattern.exec(text);
    if (!boundary || pattern.exec(text)) throw new Error(`Input must contain exactly one standalone ${step.separator} line.`);
    const parts = [text.slice(0, boundary.index), text.slice(boundary.index + boundary[0].length)];
    if (parts.some(part => !part.trim())) throw new Error(`Both sections around ${step.separator} are required.`);
    return makeTextStream(parts[step.section].trim().replace(/\r\n?/g, "\n") + "\n", "text/plain");
  }
  if (step.type === "text-bundle") {
    const parts = [toText(source).trim(), toText(secondary).trim()];
    if (parts.some(part => !part)) throw new Error("Both tool inputs are required.");
    if (parts[0].length + parts[1].length > 50_000_000) throw new Error("Combined input exceeds the 50,000,000-character workflow limit.");
    if (parts.some(part => boundaryPattern(step.separator).test(part))) throw new Error("A tool input already contains the separator; provide exactly two inputs.");
    return makeTextStream(`${parts[0]}\n${step.separator}\n${parts[1]}\n`, "text/plain");
  }
  if (step.type === "pcr-product-sequences") {
    if (source.schema !== "in-silico-pcr-products") throw new Error("Checked PCR products require an In Silico PCR product table.");
    if (sourceWarnings.length) throw new Error(`Resolve PCR warnings before digestion: ${sourceWarnings.join(" ")}`);
    const templates = secondary.records ?? [];
    if (!templates.length || templates.length > 2) throw new Error("This PCR-RFLP recipe requires one region from one haploid or diploid sample.");
    const identities = templates.map(t => String(t.title).split("|").map(s => s.trim()));
    if (identities.some(p => p.length !== 4 || !/^haplotype-[12]$/.test(p[0])) || new Set(identities.map(p => p.slice(1).join("|"))).size !== 1) throw new Error("PCR-RFLP requires haplotypes from the same sample, region and continuous phase set.");
    if (new Set(templates.map(t => t.title)).size !== templates.length) throw new Error("Haplotype names must be distinct.");
    if (source.rows.some(row => !templates.some(t => t.title === row.template))) throw new Error("PCR products do not match the selected haplotypes.");
    const products = templates.map(template => {
      const rows = source.rows.filter(row => row.template === template.title);
      if (rows.length !== 1) throw new Error(`${template.title}: expected one PCR product, found ${rows.length}. Check primer binding and product-length settings; this is not evidence of a missing allele.`);
      const row = rows[0];
      if (row.topology !== "linear" || row.forward_mismatches !== 0 || row.reverse_mismatches !== 0 || row.forward_primer === row.reverse_primer || !/^[ACGT]+$/.test(row.product_sequence) || row.product_sequence.length !== row.length) throw new Error("PCR-RFLP requires two distinct, exact-match primers and an unambiguous linear product. Mismatch-bearing template exports are not primer-corrected products.");
      for (const [side, strand] of [["forward", "+"], ["reverse", "-"]]) {
        const site = sourceSites.find(site => site.template === row.template && site.primer === row[`${side}_primer`] && site.strand === strand && site.start === row[`${side}_start`] && site.end === row[`${side}_end`]);
        if (!site || !/^[ACGT]+$/.test(site.primer_sequence)) throw new Error("PCR-RFLP requires unambiguous A/C/G/T primer sequences; degenerate primers can alter the product sequence.");
      }
      return formatFastaRecord(template.title, row.product_sequence);
    });
    return makeTextStream(products.join(""), "text/x-fasta");
  }
  if (source.schema !== "fastq-summary" || secondary.schema !== "fastq-summary") throw new Error("Trimming comparison requires FASTQ QC summary tables.");
  const metrics = [["read_count", "Reads"], ["total_bases", "Bases"], ["mean_read_length", "Mean read length"], ["min_read_length", "Shortest read"], ["max_read_length", "Longest read"], ["mean_phred_quality", "Mean base quality"], ["q20_bases_percent", "Q20 bases"], ["q30_bases_percent", "Q30 bases"], ["reads_with_n_percent", "Reads with N"], ["gc_percent", "GC"]];
  const rows = metrics.map(([id, label]) => {
    const before = secondary.rows.find(row => row.metric === id), after = source.rows.find(row => row.metric === id);
    if (!before || !after || !Number.isFinite(Number(before.value)) || !Number.isFinite(Number(after.value)) || before.unit !== after.unit) throw new Error(`Missing or incompatible FASTQ QC metric: ${id}.`);
    const isCount = ["read_count", "total_bases"].includes(id);
    const b = !isCount && Number(secondary.rows.find(r => r.metric === "read_count")?.value) === 0 ? "" : Number(before.value);
    const a = !isCount && Number(source.rows.find(r => r.metric === "read_count")?.value) === 0 ? "" : Number(after.value);
    return { metric: label, before: b === "" ? "" : +b.toFixed(3), after: a === "" ? "" : +a.toFixed(3), change: b !== "" && a !== "" ? +(a - b).toFixed(3) : "", unit: before.unit, retained_percent: isCount && b > 0 ? +(100 * a / b).toFixed(2) : "" };
  });
  return makeTableStream(comparisonColumns, rows, "workflow-fastq-comparison");
}
