import {
  extractFastaById,
  fastaExtractByIdColumns,
  makeFastaExtractByIdTsv,
  parseFastaIdList,
  splitFastaExtractByIdInput
} from "../../core/fasta-extract-by-id.js";
import { formatFastaRecord } from "../../core/fasta.js";
import {
  makeIndexedFastaReader,
  parseFaiIndex,
  resolveIndexedFastaRegionInput
} from "../../core/indexed-genomics/indexed-fasta-reader.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["fasta", "table-tsv", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "fasta";
}

function sourceModeUsesIndexedFasta(options) {
  return ["indexed", "bgzf"].includes(options.sourceMode) ||
    Boolean(options.fastaFile?.slice || options.faiFile?.text || options.gziFile?.slice);
}

function normalizeQuery(value, caseSensitive) {
  return caseSensitive ? String(value) : String(value).toLowerCase();
}

async function makeIndexedLookupInput(input, options, context) {
  const separator = String(options.separator ?? "---").trim() || "---";
  const split = splitFastaExtractByIdInput(input, separator);
  const queries = parseFastaIdList(split.queryText);
  const caseSensitive = options.caseSensitive !== false;
  const action = ["remove"].includes(options.action) ? "remove" : "keep";
  const matchMode = ["id-exact", "title-exact", "title-contains"].includes(options.matchMode)
    ? options.matchMode
    : "id-exact";
  const outputOrder = options.action === "order" || options.outputOrder === "id-list" ? "id-list" : "input";

  if (action !== "keep") {
    throw new Error("Indexed FASTA ID lookup can keep matching records, but cannot remove non-matching records without scanning every FASTA record. Use paste/upload mode for remove workflows.");
  }
  if (matchMode !== "id-exact") {
    throw new Error("Indexed FASTA ID lookup supports exact first-title-word matching because .fai indexes store sequence names, not full FASTA titles. Use paste/upload mode for full-title or contains matching.");
  }

  const indexedInput = await resolveIndexedFastaRegionInput(input, options);
  const fai = parseFaiIndex(indexedInput.faiText);
  const warnings = [...split.warnings, ...fai.warnings];
  const nameByKey = new Map();
  for (const name of fai.records.keys()) {
    const key = normalizeQuery(name, caseSensitive);
    if (!nameByKey.has(key)) {
      nameByKey.set(key, name);
    } else {
      warnings.push(`Multiple indexed FASTA records normalize to "${key}"; ID lookup uses the first matching record.`);
    }
  }

  const requestedKeys = new Set(queries.map((query) => normalizeQuery(query, caseSensitive)));
  const namesToFetch = outputOrder === "id-list"
    ? queries.map((query) => nameByKey.get(normalizeQuery(query, caseSensitive))).filter(Boolean)
    : [...fai.records.keys()].filter((name) => requestedKeys.has(normalizeQuery(name, caseSensitive)));

  const reader = makeIndexedFastaReader(indexedInput);
  const fastaRecords = [];
  context.reportProgress?.({ phase: "reading-indexed-fasta", progress: 0.15 });
  context.throwIfCancelled?.();
  for (const [index, name] of namesToFetch.entries()) {
    const faiRecord = fai.records.get(name);
    if (!faiRecord) {
      continue;
    }
    const sequence = await reader.getSequence(name, 0, faiRecord.length, { signal: context.signal }) || "";
    fastaRecords.push(formatFastaRecord(name, sequence, options.lineWidth ?? 60));
    context.reportProgress?.({
      phase: "extracting-indexed-fasta-records",
      progress: 0.15 + ((index + 1) / Math.max(1, namesToFetch.length)) * 0.6
    });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
  }

  return {
    input: `${fastaRecords.join("")}\n${separator}\n${split.queryText}`,
    warnings
  };
}

export async function runFastaExtractById(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const indexedLookup = sourceModeUsesIndexedFasta(options)
    ? await makeIndexedLookupInput(input, options, context)
    : null;
  const result = extractFastaById(indexedLookup?.input ?? input, options);
  if (indexedLookup?.warnings.length) {
    result.warnings.unshift(...indexedLookup.warnings);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const tsv = makeFastaExtractByIdTsv(result.rows);
  const outputs = {
    fasta: result.fasta,
    "table-tsv": tsv,
    report: result.report
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "fasta" ? "fasta-extract-by-id.fasta" : outputFormat === "table-tsv" ? "fasta-extract-by-id.tsv" : "fasta-extract-by-id.txt",
      mimeType: outputFormat === "fasta" ? "text/x-fasta;charset=utf-8" : outputFormat === "table-tsv" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    streams: {
      fasta: makeTextStream(result.fasta, "text/x-fasta"),
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(fastaExtractByIdColumns, result.rows, "fasta-extract-by-id"),
      sequenceRecords: {
        kind: "sequence-records",
        alphabet: "dna-rna",
        schema: "fasta-extract-by-id",
        records: result.outputRecords
      }
    }
  });
}
