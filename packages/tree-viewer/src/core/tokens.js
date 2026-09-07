import { LIMITS, TreeInputError } from "./limits.js";
export function* treeTokens(
  source,
  { nexus = false, baseOffset = 0, fullSource = source } = {},
) {
  let i = 0,
    comments = 0;
  const fail = (message, offset = i) => {
    throw new TreeInputError(message, fullSource, baseOffset + offset);
  };
  while (i < source.length) {
    const start = i,
      c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (("(),:;" + (nexus ? "=" : "")).includes(c)) {
      yield { kind: "punctuation", value: c, offset: baseOffset + i++ };
      continue;
    }
    if (c === "[") {
      if (++comments > LIMITS.comments)
        fail("Comment count limit exceeded", start);
      let depth = 1;
      i++;
      const beginning = i;
      while (i < source.length && depth) {
        if (source[i] === "[") depth++;
        if (source[i] === "]") depth--;
        if (depth) i++;
        if (i - beginning > LIMITS.commentCharacters)
          fail("Comment exceeds size limit", start);
      }
      if (depth) fail("Unterminated tree comment", start);
      yield {
        kind: "comment",
        value: source.slice(beginning, i),
        offset: baseOffset + start,
      };
      i++;
      continue;
    }
    if (c === "'") {
      i++;
      let value = "",
        closed = false;
      while (i < source.length) {
        if (source[i] === "'") {
          if (source[i + 1] === "'") {
            value += "'";
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else value += source[i++];
        if (value.length > LIMITS.labelCharacters)
          fail("Label exceeds size limit", start);
      }
      if (!closed) fail("Unterminated quoted label", start);
      yield { kind: "label", value, quoted: true, offset: baseOffset + start };
      continue;
    }
    while (
      i < source.length &&
      !/\s/.test(source[i]) &&
      !("(),:;[]" + (nexus ? "=" : "")).includes(source[i])
    ) {
      if (source[i] === "'") fail("Quote must start a label", i);
      i++;
      if (i - start > LIMITS.labelCharacters)
        fail("Label exceeds size limit", start);
    }
    if (i === start) fail("Unexpected closing comment", start);
    yield {
      kind: "label",
      value: source.slice(start, i),
      quoted: false,
      offset: baseOffset + start,
    };
  }
}
