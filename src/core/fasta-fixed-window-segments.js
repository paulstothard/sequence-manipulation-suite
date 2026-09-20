/**
 * Partition cleaned FASTA chunks into bounded overlapping scan segments.
 * A caller owns a match only when its zero-based start lies in
 * [ownedStart0, ownedEnd0); this prevents duplicate hits at chunk boundaries.
 * maxWindowLength includes any right-context bases the caller needs.
 */
export async function* iterateFastaFixedWindowSegments(events, {
  maxWindowLength,
  segmentLength = 64 * 1024
} = {}) {
  const width = Number(maxWindowLength);
  if (!Number.isSafeInteger(width) || width < 1 || width > 65_536) {
    throw new Error("Fixed-window FASTA scan width must be between 1 and 65,536 bases.");
  }
  const size = Math.max(width, Math.min(1024 * 1024, Number(segmentLength) || 64 * 1024));
  // The unfinished starts need width-1 bases to their right. Keep a second
  // width of history so those late starts still have left context and any
  // upstream cleavage offsets when the record ends.
  const overlap = 2 * width - 1;
  let carry = "";
  let nextOwnedStart = 0;
  let position = 0;

  for await (const event of events) {
    if (event.type === "record-start") {
      carry = "";
      nextOwnedStart = 0;
      position = 0;
      yield event;
      continue;
    }
    if (event.type === "sequence-chunk") {
      const text = String(event.text ?? "");
      for (let index = 0; index < text.length; index += size) {
        const piece = text.slice(index, index + size);
        const segmentStart0 = position - carry.length;
        const segment = carry + piece;
        position += piece.length;
        const readyThrough = Math.max(nextOwnedStart, position - width + 1);
        if (readyThrough > nextOwnedStart) {
          yield {
            type: "scan-segment",
            text: segment,
            segmentStart0,
            ownedStart0: nextOwnedStart,
            ownedEnd0: readyThrough,
            record: event.record
          };
          nextOwnedStart = readyThrough;
        }
        carry = overlap ? segment.slice(-overlap) : "";
      }
      continue;
    }
    if (event.type === "record-end") {
      if (nextOwnedStart < position) {
        yield {
          type: "scan-segment",
          text: carry,
          segmentStart0: position - carry.length,
          ownedStart0: nextOwnedStart,
          ownedEnd0: position,
          record: event.record
        };
      }
      yield event;
    }
  }
}
