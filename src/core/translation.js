import { getGeneticCode, makeCodonMap } from "./genetic-code.js";
import { complementDnaRnaSequence } from "./sequence.js";

export const DNA_TRANSLATION_FRAMES = [
  { frame: "+1", label: "+1", strand: "+", offset: 0 },
  { frame: "+2", label: "+2", strand: "+", offset: 1 },
  { frame: "+3", label: "+3", strand: "+", offset: 2 },
  { frame: "-1", label: "−1", strand: "-", offset: 0 },
  { frame: "-2", label: "−2", strand: "-", offset: 1 },
  { frame: "-3", label: "−3", strand: "-", offset: 2 }
];

export function reverseComplementDnaRnaSequence(sequence) {
  return Array.from(
    complementDnaRnaSequence(String(sequence ?? ""), { preserveCase: false })
  ).reverse().join("");
}

export function translateSequence(sequence, options = {}) {
  const code = getGeneticCode(options.geneticCode ?? "1");
  const codonMap = makeCodonMap(code);
  const offset = Math.max(0, Math.min(2, Number.parseInt(options.offset, 10) || 0));
  const source = String(sequence ?? "").toUpperCase().replaceAll("U", "T");
  let protein = "";
  let ambiguousCodons = 0;

  for (let index = offset; index + 3 <= source.length; index += 3) {
    const codon = source.slice(index, index + 3);
    const aminoAcid = codonMap.get(codon);
    if (aminoAcid) {
      protein += aminoAcid;
    } else {
      protein += "X";
      ambiguousCodons += 1;
    }
  }

  return {
    protein,
    ambiguousCodons,
    trailingBases: Math.max(0, (source.length - offset) % 3)
  };
}

export function makeSixFrameTranslations(sequence, options = {}) {
  const source = String(sequence ?? "").toUpperCase().replaceAll("U", "T");
  const reverseSource = reverseComplementDnaRnaSequence(source).replaceAll("U", "T");
  const code = getGeneticCode(options.geneticCode ?? "1");
  const codonMap = makeCodonMap(code);

  return DNA_TRANSLATION_FRAMES.map((definition) => {
    const orientedSource = definition.strand === "-" ? reverseSource : source;
    const codons = [];
    let ambiguousCodons = 0;

    for (let index = definition.offset; index + 3 <= orientedSource.length; index += 3) {
      const codon = orientedSource.slice(index, index + 3);
      const aminoAcid = codonMap.get(codon) ?? "X";
      if (aminoAcid === "X") {
        ambiguousCodons += 1;
      }
      const positions = definition.strand === "+"
        ? [index + 1, index + 2, index + 3]
        : [source.length - index, source.length - index - 1, source.length - index - 2];
      codons.push({
        aminoAcid,
        codon,
        positions,
        centerPosition: positions[1],
        directStart: Math.min(...positions),
        directEnd: Math.max(...positions),
        orientedStart: index + 1
      });
    }

    return {
      ...definition,
      geneticCode: code.id,
      protein: codons.map((item) => item.aminoAcid).join(""),
      codons,
      ambiguousCodons,
      trailingBases: Math.max(0, (orientedSource.length - definition.offset) % 3)
    };
  });
}
