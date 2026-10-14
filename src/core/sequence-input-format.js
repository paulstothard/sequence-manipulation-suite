import { streamTextFileChunks } from "./compressed-text-reader.js";

// Inspect content, not the filename: uploads can be renamed or dropped into any slot.
export function isAnnotatedSequenceText(text) {
  return /^(?:LOCUS[ \t]+\S+[ \t]+\d+[ \t]+(?:bp|aa)\b|ID[ \t]+\S+[^\n]*(?:;|[ \t](?:BP|AA)\.)|FEATURES[ \t]+Location\/Qualifiers|FH[ \t]+Key|FT[ \t]+\S+[ \t]+\d)/i.test(String(text ?? "").trimStart());
}

export function assertPlainSequenceOrFasta(text) {
  if (isAnnotatedSequenceText(text)) {
    throw new Error("Annotated records cannot be scanned as plain sequence or FASTA. Use an Annotated records input or convert the records to FASTA.");
  }
}

export async function isAnnotatedSequenceFile(file, context = {}) {
  let prefix = "";
  for await (const chunk of streamTextFileChunks(file, { signal: context.signal })) {
    context.throwIfCancelled?.();
    prefix = (prefix + chunk).trimStart().slice(0, 128);
    if (prefix.length >= 128 || /\n/.test(prefix)) break;
  }
  return isAnnotatedSequenceText(prefix);
}

/** Keep chunk boundaries and bounded memory while checking the first content line. */
export async function* requireSequenceTextChunks(chunks) {
  let prefix = "";
  let pending = [];
  let checked = false;
  for await (const chunk of chunks) {
    if (checked) {
      yield chunk;
      continue;
    }
    // Leading whitespace is harmless and need not be retained for inspection.
    if (!prefix && !chunk.trim()) {
      yield chunk;
      continue;
    }
    pending.push(chunk);
    prefix = (prefix + chunk).trimStart().slice(0, 128);
    if (prefix.length < 128 && !/\n/.test(prefix)) continue;
    assertPlainSequenceOrFasta(prefix);
    checked = true;
    yield* pending;
    pending = [];
  }
  if (!checked) assertPlainSequenceOrFasta(prefix);
  yield* pending;
}
