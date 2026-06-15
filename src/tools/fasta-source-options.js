import { INDEXED_FASTA_BUNDLE_NOTE } from "./fasta-input-policy.js";

export function makeFastaSourceInputOptions({ includeIndexed = true } = {}) {
  if (!includeIndexed) {
    return [];
  }
  return [
    {
      id: "sourceMode",
      type: "radio",
      placement: "input",
      label: "FASTA source",
      defaultValue: "loaded",
      choices: [
        { value: "loaded", label: "Paste/upload FASTA" },
        { value: "indexed", label: "Indexed FASTA + FAI" },
        { value: "bgzf", label: "BGZF FASTA + FAI + GZI" }
      ],
      help: "Choose pasted/uploaded FASTA or FASTA.GZ, uncompressed FASTA+FAI, or BGZF FASTA+FAI+GZI in the input panel."
    },
    {
      id: "fastaFile",
      type: "file",
      placement: "input",
      label: "FASTA or BGZF FASTA",
      accept: ".fa,.fasta,.fna,.faa,.txt,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.bgz",
      dropLabel: "Drop FASTA or BGZF FASTA here",
      help: "Choose the sequence file used to create the .fai index."
    },
    {
      id: "faiFile",
      type: "file",
      placement: "input",
      label: "Matching .fai",
      accept: ".fai",
      dropLabel: "Drop matching .fai here",
      help: "Choose the matching .fai index created from the same FASTA file."
    },
    {
      id: "gziFile",
      type: "file",
      placement: "input",
      label: "Matching .gzi for BGZF",
      accept: ".gzi",
      dropLabel: "Drop matching .gzi here",
      help: "Required for BGZF-compressed FASTA random access. Ordinary gzip FASTA belongs in Paste/upload FASTA."
    }
  ];
}

export function makeFastaSourceNote(prefix = "Paste/upload mode scans loaded FASTA records.") {
  return `${prefix} ${INDEXED_FASTA_BUNDLE_NOTE}`;
}
