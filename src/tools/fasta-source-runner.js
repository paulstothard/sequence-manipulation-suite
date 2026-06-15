import {
  makeIndexedFastaReader,
  parseFaiIndex,
  resolveIndexedFastaRegionInput
} from "../core/indexed-genomics/indexed-fasta-reader.js";
import { formatFastaRecord } from "../core/fasta.js";

function shouldUseIndexedFasta(options = {}) {
  return ["indexed", "bgzf"].includes(options.sourceMode) ||
    Boolean(options.fastaFile?.slice || options.faiFile?.text || options.gziFile?.slice);
}

export async function resolveFastaSourceInput(input, options = {}, context = {}) {
  if (!shouldUseIndexedFasta(options)) {
    return { input, warnings: [] };
  }

  const indexedInput = await resolveIndexedFastaRegionInput(input, options);
  const fai = parseFaiIndex(indexedInput.faiText);
  const warnings = [...fai.warnings];
  const reader = makeIndexedFastaReader(indexedInput);
  warnings.push(...(reader.warnings ?? []));
  const records = [];
  const indexedRecords = [...fai.records.values()];
  context.reportProgress?.({ phase: "reading-indexed-fasta", progress: 0.1 });
  context.throwIfCancelled?.();

  for (const [index, record] of indexedRecords.entries()) {
    const sequence = await reader.getSequence(record.name, 0, record.length, { signal: context.signal }) || "";
    if (sequence.length !== record.length) {
      warnings.push(`${record.name}: extracted ${sequence.length} character(s), expected ${record.length}; check FASTA/FAI pairing.`);
    }
    records.push(formatFastaRecord(record.name, sequence, options.lineWidth ?? 60));
    context.reportProgress?.({
      phase: "extracting-indexed-fasta-records",
      progress: 0.1 + ((index + 1) / Math.max(1, indexedRecords.length)) * 0.75
    });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
  }

  return {
    input: records.join(""),
    warnings
  };
}
