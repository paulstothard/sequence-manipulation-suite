import { normalizeSangerTrimOptions } from './sanger-trimming.js';
import { assessSangerGenotypeSignal } from './sanger-genotype.js';
import { calculateMottTrimRange, prepareSangerTrace, prepareSangerTraceCollection } from './sanger-trace.js';

// Shared preprocessing for channel-based analysis. Manual bounds, edits and
// orientation remain in original read coordinates; mixed peaks survive Mott
// trimming when their combined signal is usable.
export function prepareSangerAlleleCollection(input, options = {}) {
  options = normalizeSangerTrimOptions(options);
  const collection = prepareSangerTraceCollection(input, { ...options, trimMethod: 'manual' });
  if (options.trimMethod === 'manual') return collection;
  collection.traces = collection.traces.map(prepared => {
    if (prepared.manualTrimRange) return prepared;
    if (prepared.trace.traceMode === 'base-call-preview') return prepared;
    const record = prepared.trace;
    const evidence = assessSangerGenotypeSignal(record);
    // Search inside the user's manual interval so a high-quality region outside
    // that interval cannot pull the automatic opposite end past their bound.
    const first = prepared.view.clipStart, last = prepared.view.clipEnd;
    const localTrim = calculateMottTrimRange(evidence.slice(first - 1, last).map((item, i) => ({
      quality: item.usable ? Math.max(20, record.baseCalls[first - 1 + i].quality ?? 20) : 0,
    })), { errorLimit: Number(options.mottErrorLimit ?? 0.05), minimumBases: 40 });
    const trim = { ...localTrim, start:localTrim.start + first - 1, end:localTrim.end + first - 1 };
    const clipStart = prepared.options.clipStart > 1 ? prepared.options.clipStart : trim.start;
    const clipEnd = prepared.options.clipEnd > 0 && prepared.options.clipEnd < record.baseCalls.length
      ? prepared.options.clipEnd : trim.end;
    const trace = { name: record.name, traceMode: record.traceMode,
      bases: record.baseCalls.map(call => call.base).join(''),
      qualities: record.baseCalls.map(call => call.quality),
      basePositions: record.baseCalls.map(call => call.originalTracePosition), traces: record.traces };
    const result = prepareSangerTrace(JSON.stringify(trace), { ...prepared.options, trimMethod: 'manual', clipStart, clipEnd });
    result.automaticTrim = { ...trim, method: 'signal-aware-mott' };
    return result;
  });
  return collection;
}
