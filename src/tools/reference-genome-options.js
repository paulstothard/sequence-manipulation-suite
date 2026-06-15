export function makeOptionalReferenceGenomeOptionGroup({
  help = "Optional reference sequence used to replace placeholder bases in bounded viewers. Leave this set to None when the alignment or variant input is enough."
} = {}) {
  return {
    type: "group",
    id: "referenceGenome",
    label: "Reference genome",
    collapsible: true,
    collapsed: true,
    help,
    options: [
      {
        id: "referenceGenomeMode",
        type: "select",
        label: "Reference source",
        defaultValue: "none",
        choices: [
          { value: "none", label: "None" },
          { value: "loaded", label: "FASTA / FASTA.GZ" },
          { value: "indexed", label: "FASTA + FAI" },
          { value: "bgzf", label: "BGZF FASTA + FAI + GZI" }
        ],
        help: "Use FASTA/FASTA.GZ for small local references. Use FASTA+FAI or BGZF FASTA+FAI+GZI for random-access genome regions."
      },
      {
        id: "referenceGenomeFastaFile",
        type: "file",
        label: "Reference FASTA",
        accept: ".fa,.fasta,.fna,.ffn,.txt,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.bgz",
        defaultValue: null,
        dropLabel: "Drop reference FASTA here",
        visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] },
        help: "Choose the FASTA sequence file. Ordinary FASTA.GZ is supported only in loaded mode; compressed random-access mode requires BGZF plus .fai and .gzi."
      },
      {
        id: "referenceGenomeFaiFile",
        type: "file",
        label: "Matching .fai",
        accept: ".fai",
        defaultValue: null,
        dropLabel: "Drop matching .fai here",
        visibleWhen: { option: "referenceGenomeMode", value: ["indexed", "bgzf"] },
        help: "Matching FASTA index created from the same reference FASTA file, for example with samtools faidx."
      },
      {
        id: "referenceGenomeGziFile",
        type: "file",
        label: "Matching .gzi",
        accept: ".gzi",
        defaultValue: null,
        dropLabel: "Drop matching .gzi here",
        visibleWhen: { option: "referenceGenomeMode", value: "bgzf" },
        help: "Required for BGZF-compressed FASTA random access. Ordinary gzip FASTA is not random-access indexed FASTA."
      }
    ]
  };
}
