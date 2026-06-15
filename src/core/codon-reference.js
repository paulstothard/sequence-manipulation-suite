import { getCodonsForCode } from "./genetic-code.js";

export const codonReferenceTableColumns = [
  { id: "reference_id", label: "Reference ID", type: "string" },
  { id: "reference_name", label: "Reference name", type: "string" },
  { id: "amino_acid", label: "Amino acid", type: "string" },
  { id: "codon", label: "Codon", type: "string" },
  { id: "reference_count", label: "Reference count", type: "number" },
  { id: "reference_per_1000", label: "Reference per 1000", type: "number" },
  { id: "reference_fraction", label: "Reference fraction", type: "number" }
];

export function listCodonUsageReferences(references = []) {
  return references.map((reference) => ({
    id: reference.id,
    name: reference.name,
    organism: reference.organism,
    taxonomyId: reference.taxonomyId,
    geneticCodeId: reference.geneticCode?.id,
    sourceName: reference.source?.name,
    sourceVersion: reference.source?.version
  }));
}

export function getCodonUsageReference(references = [], id = "") {
  return references.find((reference) => reference.id === id) ?? references[0];
}

export function makeCodonUsageReferenceRows(reference) {
  if (!reference) {
    return [];
  }

  return getCodonsForCode(reference.geneticCode?.id).map((item) => {
    const codon = reference.codons?.[item.codon] ?? {};
    return {
      reference_id: reference.id,
      reference_name: reference.name,
      amino_acid: codon.aminoAcid ?? item.aa,
      codon: item.codon,
      reference_count: codon.count ?? 0,
      reference_per_1000: codon.perThousand ?? 0,
      reference_fraction: codon.fraction ?? 0
    };
  });
}
