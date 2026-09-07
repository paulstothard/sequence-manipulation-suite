import { multipleAlignDnaRnaExample, multipleAlignProteinExample } from "./multiple-alignment-examples.js";

// The source module retains full NCBI provenance headers. These workflow labels
// retain the nucleotide record accession, species and gene; sequences are unchanged.
function workflowFasta(source) {
  return source.trim().split(/\n(?=>)/).map(record => {
    const [header, ...lines] = record.split("\n");
    const match = /^>((?:NM|XM)_\d+\.\d+)_(.+)_CDS_/.exec(header);
    if (!match) throw new Error("Unexpected phylogeny example provenance header.");
    const sequence = lines.join("");
    return `>${match[2]}|${match[1]}\n${sequence.match(/.{1,60}/g).join("\n")}`;
  }).join("\n");
}
export const workflowDnaFamilyExample = workflowFasta(multipleAlignDnaRnaExample);
export const workflowProteinFamilyExample = workflowFasta(multipleAlignProteinExample);
