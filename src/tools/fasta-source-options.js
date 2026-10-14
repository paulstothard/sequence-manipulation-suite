import { recordParserExample, proteinRecordParserExample } from "../examples/record-parser-example.js";
import { parseFlatfileRecords } from "../core/flatfile-records.js";
import { formatFastaRecord } from "../core/fasta.js";
import { INDEXED_FASTA_BUNDLE_NOTE } from "./fasta-input-policy.js";

export function makeFastaSourceInputOptions({ includeIndexed = true, includeStreamedFile = false,
  alphabet = "any", allowPlainSequence = false, annotatedRecords = false, featurePolicy = "none" } = {}) {
  if (!includeIndexed && !annotatedRecords) return [];
  const protein = alphabet === "protein";
  const sequenceLabel = protein ? "protein" : "DNA/RNA";
  const sequenceAccept = protein ? ".fa,.fasta,.faa,.txt,.seq,.fa.gz,.fasta.gz,.faa.gz,.gz"
    : alphabet === "dna-rna" ? ".fa,.fasta,.fna,.ffn,.txt,.seq,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz"
    : ".fa,.fasta,.fna,.faa,.txt,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz";
  const annotatedExample = protein ? proteinRecordParserExample : recordParserExample;
  const choices = [{
    value: "loaded", label: allowPlainSequence ? "Sequence / FASTA" : "Paste/upload FASTA",
    description: allowPlainSequence
      ? `Paste one plain-text ${sequenceLabel} sequence or FASTA records, or upload a sequence file (gzip supported).`
      : "Paste FASTA records or upload a FASTA file (gzip supported).",
    fileLabel: allowPlainSequence ? "Sequence / FASTA file" : "FASTA/FASTA.GZ file",
    accept: sequenceAccept,
    dropLabel: allowPlainSequence ? `Drop one plain-text ${sequenceLabel} sequence or FASTA records here` : "Drop FASTA or FASTA.GZ here",
    ...(protein && annotatedRecords ? { example: parseFlatfileRecords(annotatedExample).records.map(record => formatFastaRecord(record.accession, record.sequence)).join("") } : {})
  }, ...(annotatedRecords ? [{
    value: "annotated", label: "Annotated records",
    description: protein ? "Upload or paste UniProt or GenPept records, including sequence and features."
      : "Upload or paste GenBank, EMBL, or DDBJ records, including sequence and features.",
    fileLabel: "Annotated records file",
    accept: protein ? ".gp,.gpep,.genpept,.uniprot,.txt,.gz" : ".gb,.gbk,.genbank,.embl,.ddbj,.txt,.gz",
    dropLabel: protein ? "Drop UniProt or GenPept records here" : "Drop GenBank, EMBL, or DDBJ records here",
    example: annotatedExample
  }] : []), ...(includeIndexed ? [
    { value: "indexed", label: "Indexed FASTA + FAI" },
    { value: "bgzf", label: "BGZF FASTA + FAI + GZI" }
  ] : [])];
  return [
    {
      id: "sourceMode", type: "radio", placement: "input",
      label: allowPlainSequence ? "Sequence input" : "FASTA source",
      defaultValue: protein && annotatedRecords ? "annotated" : "loaded",
      inputCapabilities: { alphabet, plainSequence: allowPlainSequence, annotatedRecords, featurePolicy, indexed: includeIndexed, streamed: includeStreamedFile },
      choices,
      help: "Choose the sequence format and file access mode in the input panel."
    },
    ...(includeStreamedFile ? [{
      id: "loadedFastaFile",
      sourceModes: ["loaded"],
      type: "file",
      placement: "input",
      label: choices[0].fileLabel,
      accept: sequenceAccept,
      dropLabel: choices[0].dropLabel,
      help: "Scanned incrementally in the worker without copying the complete file into the text editor."
    }] : []),
    ...(includeIndexed ? [{
      id: "fastaFile",
      sourceModes: ["indexed", "bgzf"],
      type: "file",
      placement: "input",
      label: "FASTA or BGZF FASTA",
      accept: `${sequenceAccept},.bgz`,
      dropLabel: "Drop FASTA or BGZF FASTA here",
      help: "Choose the sequence file used to create the .fai index."
    },
    {
      id: "faiFile",
      sourceModes: ["indexed", "bgzf"],
      type: "file",
      placement: "input",
      label: "Matching .fai",
      accept: ".fai",
      dropLabel: "Drop matching .fai here",
      help: "Choose the matching .fai index created from the same FASTA file."
    },
    {
      id: "gziFile",
      sourceModes: ["bgzf"],
      type: "file",
      placement: "input",
      label: "Matching .gzi for BGZF",
      accept: ".gzi",
      dropLabel: "Drop matching .gzi here",
      help: "Required for BGZF-compressed FASTA random access. Ordinary gzip FASTA belongs in Paste/upload FASTA."
    }] : [])
  ];
}

export function makeFastaSourceNote(prefix = "Paste/upload mode scans loaded FASTA records.") {
  return `${prefix} ${INDEXED_FASTA_BUNDLE_NOTE}`;
}
