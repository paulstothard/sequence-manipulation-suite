// Nucleotide ambiguity symbols: https://doi.org/10.1093/nar/13.9.3021
// Compatible set intersection, T/U equivalence and X-as-N are the SMS3 search convention.
// Regex syntax: https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp.prototype.exec
const DNA_RNA_SYMBOL_SETS = {
  A: ["A"],
  C: ["C"],
  G: ["G"],
  T: ["T", "U"],
  U: ["T", "U"],
  R: ["A", "G"],
  Y: ["C", "T", "U"],
  S: ["G", "C"],
  W: ["A", "T", "U"],
  K: ["G", "T", "U"],
  M: ["A", "C"],
  B: ["C", "G", "T", "U"],
  D: ["A", "G", "T", "U"],
  H: ["A", "C", "T", "U"],
  V: ["A", "C", "G"],
  N: ["A", "C", "G", "T", "U"],
  X: ["A", "C", "G", "T", "U"]
};

const PROTEIN_SYMBOL_SETS = {
  A: ["A"],
  C: ["C"],
  D: ["D"],
  E: ["E"],
  F: ["F"],
  G: ["G"],
  H: ["H"],
  I: ["I"],
  K: ["K"],
  L: ["L"],
  M: ["M"],
  N: ["N"],
  P: ["P"],
  Q: ["Q"],
  R: ["R"],
  S: ["S"],
  T: ["T"],
  V: ["V"],
  W: ["W"],
  Y: ["Y"],
  B: ["D", "N"],
  J: ["I", "L"],
  Z: ["E", "Q"],
  X: ["A", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "Y"],
  O: ["O"],
  U: ["U"],
  "*": ["*"]
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSymbolSets(alphabet) {
  return alphabet === "protein" ? PROTEIN_SYMBOL_SETS : DNA_RNA_SYMBOL_SETS;
}

function setsOverlap(left, right) {
  return left.some((item) => right.includes(item));
}

export function dnaRnaSymbolsOverlap(left, right) {
  const a = DNA_RNA_SYMBOL_SETS[String(left ?? "").toUpperCase()];
  const b = DNA_RNA_SYMBOL_SETS[String(right ?? "").toUpperCase()];
  return Boolean(a && b && setsOverlap(a, b));
}

function makeIupacRegexSource(pattern, alphabet) {
  const symbolSets = getSymbolSets(alphabet);
  const symbols = Object.keys(symbolSets);
  const parts = [];

  for (const character of String(pattern ?? "")) {
    const patternSet = symbolSets[character.toUpperCase()];
    if (!patternSet) {
      parts.push(escapeRegExp(character));
      continue;
    }

    const matchingSymbols = symbols.filter((symbol) => setsOverlap(patternSet, symbolSets[symbol]));
    const caseSymbols = character === character.toLowerCase() ? matchingSymbols.map(symbol => symbol.toLowerCase()) : matchingSymbols;
    parts.push(`[${caseSymbols.map((symbol) => escapeRegExp(symbol)).join("")}]`);
  }

  return parts.join("");
}

export function makePatternRegex(pattern, options = {}) {
  const mode = options.patternMode === "regex" ? "regex" : options.patternMode === "iupac" ? "iupac" : "plain";
  const flags = options.caseInsensitive !== false ? "i" : "";
  let source;

  if (mode === "regex") {
    source = String(pattern ?? "");
  } else if (mode === "iupac") {
    source = makeIupacRegexSource(pattern, options.alphabet);
  } else {
    source = escapeRegExp(pattern);
  }

  return new RegExp(source, flags);
}

const CANCELLATION_CHECK_INTERVAL = 4096;

function checkPatternCancellation(context, counter) {
  if (counter % CANCELLATION_CHECK_INTERVAL === 0) {
    context.throwIfCancelled?.();
  }
}

export function* findPatternMatchSteps(sequence, pattern, options = {}, context = {}) {
  const regex = makePatternRegex(pattern, options);
  const allowOverlaps = options.allowOverlaps !== false;
  const matches = [];
  const maxMatches = options.maxMatches != null && Number.isFinite(Number(options.maxMatches))
    ? Math.max(0, Number(options.maxMatches))
    : Number.POSITIVE_INFINITY;
  const maxMatchedCharacters = Number.isFinite(Number(options.maxMatchedCharacters))
    ? Math.max(0, Number(options.maxMatchedCharacters)) : Number.POSITIVE_INFINITY;
  let matchedCharacters = 0;
  const addMatch = (match) => {
    matchedCharacters += match.matchedText.length;
    if (matchedCharacters > maxMatchedCharacters) throw new Error(`Pattern matched sequence exceeds the ${maxMatchedCharacters.toLocaleString()}-character retention limit.`);
    if (matches.length >= maxMatches) throw new Error(`Pattern matches exceed the ${maxMatches.toLocaleString()}-hit scan limit.`);
    matches.push(match);
  };

  context.throwIfCancelled?.();
  if (allowOverlaps) {
    if (options.patternMode === "regex") {
      const stickyFlags = `${regex.flags.replace(/[gy]/g, "")}y`;
      const stickyRegex = new RegExp(regex.source, stickyFlags);
      // Include the terminal position so zero-width end assertions are rejected
      // consistently with the non-overlapping regex path.
      for (let index = 0; index <= sequence.length; index += 1) {
        checkPatternCancellation(context, index);
        if ((index & 4095) === 0) yield;
        stickyRegex.lastIndex = index;
        const match = stickyRegex.exec(sequence);
        if (!match) {
          continue;
        }
        if (match[0].length === 0) {
          throw new Error("Pattern matched zero characters.");
        }
        addMatch({
          start: index + 1,
          end: index + match[0].length,
          length: match[0].length,
          matchedText: match[0]
        });
      }
      return matches;
    }

    const globalFlags = `${regex.flags.replaceAll("g", "")}g`;
    const lookaheadRegex = new RegExp(`(?=(${regex.source}))`, globalFlags);
    let match;
    let iterations = 0;
    while ((match = lookaheadRegex.exec(sequence)) !== null) {
      iterations += 1;
      checkPatternCancellation(context, iterations);
      if ((iterations & 4095) === 0) yield;
      const matchedText = match[1] ?? "";
      lookaheadRegex.lastIndex = match.index + 1;
      if (matchedText.length === 0) {
        throw new Error("Pattern matched zero characters.");
      }
      addMatch({
        start: match.index + 1,
        end: match.index + matchedText.length,
        length: matchedText.length,
        matchedText
      });
    }
    return matches;
  }

  const globalFlags = `${regex.flags.replaceAll("g", "")}g`;
  const globalRegex = new RegExp(regex.source, globalFlags);
  let match;
  let iterations = 0;
  while ((match = globalRegex.exec(sequence)) !== null) {
    iterations += 1;
    checkPatternCancellation(context, iterations);
    if ((iterations & 4095) === 0) yield;
    if (match[0].length === 0) {
      throw new Error("Pattern matched zero characters.");
    }
    addMatch({
      start: match.index + 1,
      end: match.index + match[0].length,
      length: match[0].length,
      matchedText: sequence.slice(match.index, match.index + match[0].length)
    });
  }

  return matches;
}

export function findPatternMatches(sequence, pattern, options = {}, context = {}) {
  const steps = findPatternMatchSteps(sequence, pattern, options, context);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
