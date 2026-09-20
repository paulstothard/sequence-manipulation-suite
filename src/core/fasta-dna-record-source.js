import { openFastaRecordSource } from "./fasta-record-source.js";
import { cleanDnaRnaSequence } from "./sequence.js";

/**
 * Open a FASTA source and expose DNA/RNA-cleaned sequence chunks while
 * preserving record identity and coordinates in the cleaned sequence.
 *
 * The underlying source remains responsible for file, decoded-text, record,
 * header, sidecar, and accepted-character limits. This adapter deliberately
 * does not retain complete records: consumers must keep only the bounded state
 * their algorithm requires.
 */
export async function openCleanDnaRnaFastaSource(input, options = {}, context = {}) {
  const source = await openFastaRecordSource(input, {
    ...options,
    allowRawSequence: true
  }, context);

  return {
    source,
    sourceMode: source.sourceMode,
    sourceLabel: source.sourceLabel,
    supportsRanges: source.supportsRanges,
    stats: source.stats,
    warnings: source.warnings,
    async *events(iterationOptions = {}) {
      let current = null;

      for await (const event of source.events(iterationOptions)) {
        if (event.type === "record-start") {
          current = {
            cleanedLength: 0,
            removedCount: 0,
            sourceLength: 0
          };
          yield event;
          continue;
        }

        if (event.type === "sequence-chunk") {
          if (!current) {
            throw new Error("FASTA sequence chunk was received outside a record.");
          }
          const cleaned = cleanDnaRnaSequence(event.text, {
            preserveCase: false,
            keepGaps: false
          });
          const sourceOffset = current.sourceLength;
          const cleanedOffset = current.cleanedLength;
          current.sourceLength += String(event.text ?? "").length;
          current.cleanedLength += cleaned.sequence.length;
          current.removedCount += cleaned.removedCount;
          if (cleaned.sequence) {
            yield {
              ...event,
              text: cleaned.sequence,
              sourceOffset,
              sequenceOffset: cleanedOffset,
              removedCount: cleaned.removedCount
            };
          }
          continue;
        }

        if (event.type === "record-end") {
          const summary = current ?? {
            cleanedLength: 0,
            removedCount: 0,
            sourceLength: event.length ?? 0
          };
          yield {
            ...event,
            length: summary.cleanedLength,
            sourceLength: summary.sourceLength,
            removedCount: summary.removedCount
          };
          current = null;
        }
      }
    }
  };
}
