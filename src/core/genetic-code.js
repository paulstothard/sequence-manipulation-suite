const geneticCodeBases = {
  base1: "TTTTTTTTTTTTTTTTCCCCCCCCCCCCCCCCAAAAAAAAAAAAAAAAGGGGGGGGGGGGGGGG",
  base2: "TTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGG",
  base3: "TCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAGTCAG"
};

// NCBI Genetic Codes, transl_table identifiers and codon assignments:
// https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi
export const geneticCodes = [
  {
    id: "1",
    name: "Standard",
    aas: "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG",
    starts: "---M------**--*----M---------------M----------------------------"
  },
  {
    id: "2",
    name: "Vertebrate mitochondrial",
    aas: "FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSS**VVVVAAAADDEEGGGG",
    starts: "----------**--------------------MMMM----------**---M------------"
  },
  {
    id: "3",
    name: "Yeast mitochondrial",
    aas: "FFLLSSSSYY**CCWWTTTTPPPPHHQQRRRRIIMMTTTTNNKKSSRRVVVVAAAADDEEGGGG",
    starts: "----------**----------------------MM---------------M------------"
  },
  {
    id: "4",
    name: "Mold, protozoan, coelenterate mitochondrial; Mycoplasma/Spiroplasma",
    aas: "FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG",
    starts: "--MM------**-------M------------MMMM---------------M------------"
  },
  {
    id: "5",
    name: "Invertebrate mitochondrial",
    aas: "FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSSSVVVVAAAADDEEGGGG",
    starts: "---M------**--------------------MMMM---------------M------------"
  },
  {
    id: "6",
    name: "Ciliate, Dasycladacean, and Hexamita nuclear",
    aas: "FFLLSSSSYYQQCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG",
    starts: "--------------*--------------------M----------------------------"
  },
  {
    id: "11",
    name: "Bacterial, archaeal, and plant plastid",
    aas: "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG",
    starts: "---M------**--*----M------------MMMM---------------M------------"
  }
];

export function getGeneticCode(id = "1") {
  return geneticCodes.find((code) => code.id === String(id)) ?? geneticCodes[0];
}

export function getCodonsForCode(codeOrId = "1") {
  const code = typeof codeOrId === "string" ? getGeneticCode(codeOrId) : codeOrId;

  return Array.from(code.aas, (aa, index) => ({
    codon: `${geneticCodeBases.base1[index]}${geneticCodeBases.base2[index]}${geneticCodeBases.base3[index]}`,
    aa,
    isStart: code.starts[index] === "M",
    isStop: aa === "*"
  }));
}

export function makeCodonMap(codeOrId = "1") {
  return new Map(getCodonsForCode(codeOrId).map((item) => [item.codon, item.aa]));
}

export function getStartCodons(codeOrId = "1") {
  return new Set(getCodonsForCode(codeOrId).filter((item) => item.isStart).map((item) => item.codon));
}

export function getStopCodons(codeOrId = "1") {
  return new Set(getCodonsForCode(codeOrId).filter((item) => item.isStop).map((item) => item.codon));
}
