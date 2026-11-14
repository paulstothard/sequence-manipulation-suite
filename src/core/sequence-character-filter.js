function applyCaseMode(sequence, options = {}) {
  const caseMode = options.caseMode;
  if (caseMode === "uppercase") {
    return String(sequence ?? "").toUpperCase();
  }
  if (caseMode === "lowercase") {
    return String(sequence ?? "").toLowerCase();
  }
  return String(sequence ?? "");
}

function isDnaRnaIupac(character) {
  return /[ACGTURYSWKMBDHVNX]/i.test(character);
}

function isBasicDnaRna(character) {
  return /[ACGTUN]/i.test(character);
}

function isProteinIupac(character) {
  return /[ABCDEFGHIKLMNPQRSTUVWYZXJO*]/i.test(character);
}

function isStandardProtein(character) {
  return /[ACDEFGHIKLMNPQRSTVWY]/i.test(character);
}

function isAllowedGap(character, options = {}) {
  return options.keepGaps === true && /[.-]/.test(character);
}

function isLowercaseLetter(character) {
  return /[a-z]/.test(character);
}

function isUppercaseLetter(character) {
  return /[A-Z]/.test(character);
}

function shouldFilterCharacter(character, alphabet, options = {}) {
  const preset = options.filterPreset;

  if (alphabet === "protein") {
    if (preset === "standard-protein") {
      return !(isStandardProtein(character) || isAllowedGap(character, options));
    }
    if (preset === "standard-protein-stop") {
      return !(isStandardProtein(character) || character === "*" || isAllowedGap(character, options));
    }
    if (preset === "whitespace") {
      return /\s/.test(character);
    }
    if (preset === "digits") {
      return /\d/.test(character);
    }
    if (preset === "digits-whitespace") {
      return /[\s\d]/.test(character);
    }
    if (preset === "keep-lowercase-protein") {
      return !((isProteinIupac(character) && isLowercaseLetter(character)) || isAllowedGap(character, options));
    }
    if (preset === "keep-uppercase-protein") {
      return !((isProteinIupac(character) && isUppercaseLetter(character)) || isAllowedGap(character, options));
    }
    return !(isProteinIupac(character) || isAllowedGap(character, options));
  }

  if (preset === "valid-basic-dna-rna") {
    return !(isBasicDnaRna(character) || isAllowedGap(character, options));
  }
  if (preset === "remove-t") {
    return /[tT]/.test(character);
  }
  if (preset === "remove-u") {
    return /[uU]/.test(character);
  }
  if (preset === "whitespace") {
    return /\s/.test(character);
  }
  if (preset === "digits") {
    return /\d/.test(character);
  }
  if (preset === "digits-whitespace") {
    return /[\s\d]/.test(character);
  }
  if (preset === "keep-lowercase-dna-rna") {
    return !((isDnaRnaIupac(character) && isLowercaseLetter(character)) || isAllowedGap(character, options));
  }
  if (preset === "keep-uppercase-dna-rna") {
    return !((isDnaRnaIupac(character) && isUppercaseLetter(character)) || isAllowedGap(character, options));
  }

  return !(isDnaRnaIupac(character) || isAllowedGap(character, options));
}

export function applySequenceCharacterFilter(sequence, alphabet, options = {}) {
  let filteredCount = 0;
  let output = "";
  const replacement = String(options.replacement ?? "");

  for (const character of String(sequence ?? "")) {
    if (shouldFilterCharacter(character, alphabet, options)) {
      filteredCount += 1;
      output += replacement;
    } else {
      output += character;
    }
  }

  return {
    sequence: applyCaseMode(output, options),
    filteredCount
  };
}

