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
            sourceLength: 0,
            trailingHighSurrogate: false
          };
          yield event;
          continue;
        }

        if (event.type === "sequence-chunk") {
          if (!current) {
            throw new Error("FASTA sequence chunk was received outside a record.");
          }
          if (options.strictHeaders === true && event.text.includes(">")) {
            throw new Error("FASTA headers must start at the beginning of a line, with no sequence text before the first header.");
          }
          options.onSourceChunk?.(event.text);
          const cleaned = cleanDnaRnaSequence(event.text, {
            preserveCase: options.preserveCase === true,
            keepGaps: false
          });
          // A supplementary code point is unsupported DNA/RNA, but counts as
          // one removed character even when its UTF-16 halves span chunks.
          // Both halves are discarded, so no sequence buffering is needed.
          const firstCodeUnit = event.text.charCodeAt(0);
          const removedCount = cleaned.removedCount - (
            current.trailingHighSurrogate && firstCodeUnit >= 0xdc00 && firstCodeUnit <= 0xdfff ? 1 : 0
          );
          if (event.text.length) {
            const lastCodeUnit = event.text.charCodeAt(event.text.length - 1);
            current.trailingHighSurrogate = lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff;
          }
          const sourceOffset = current.sourceLength;
          const cleanedOffset = current.cleanedLength;
          current.sourceLength += String(event.text ?? "").length;
          current.cleanedLength += cleaned.sequence.length;
          current.removedCount += removedCount;
          if (cleaned.sequence) {
            yield {
              ...event,
              text: cleaned.sequence,
              sourceOffset,
              sequenceOffset: cleanedOffset,
              removedCount
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
