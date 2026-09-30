import { checksumColumns } from "../../core/file-checksum.js";

export const fileChecksumExample = `Run: pilot_2026_09
Assay: RNA-seq
Reads: paired-end, 150 bp
Controls: 2 samples
Treated: 2 samples
Reference: GRCh38
`;
export const fileChecksumMetadata = {
  id: "file-checksum", name: "File Checksum", category: "Text & Notes",
  tags: ["text", "validation"],
  summary: "Calculate checksums for files or pasted text, or verify them against an expected checksum or manifest.",
  whenToUse: "Check whether downloaded or transferred files match their expected checksums, or record checksums for your own files.",
  inputType: "Pasted text or local files of any format",
  outputType: "Checksum or verification table/report, or checksum manifest",
  inputSource: { option: "fileSourceMode", textValue: "text" },
  fileInput: { multipleFiles: true, accept: "", dropLabel: "Drop files here" },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain", catalogVisible: false },
      { id: "table", kind: "table", schema: "file-checksums", columns: checksumColumns, label: "Checksum table", outputFormat: "tsv" },
      { id: "manifest", kind: "text", mediaType: "text/plain", label: "Checksum manifest", outputFormat: "manifest" },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report", outputFormat: "report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true, workerModule: "../tools/file-checksum/run.js", workerExport: "runFileChecksum",
  options: [
    { id: "fileSourceMode", type: "radio", placement: "input", presentation: "tabs", label: "Input source", defaultValue: "text", choices: [
      { value: "text", label: "Paste text" }, { value: "files", label: "Local files" }
    ] },
    { id: "checksumFiles", type: "file", multiple: true, multipleFiles: true, placement: "input", label: "Files", dropLabel: "Drop files here", defaultValue: null, visibleWhen: { option: "fileSourceMode", value: "files" } },
    { id: "algorithm", type: "select", label: "Algorithm", defaultValue: "sha256", choices: [
      { value: "sha256", label: "SHA-256" }, { value: "md5", label: "MD5" }, { value: "sha1", label: "SHA-1" }, { value: "sha512", label: "SHA-512" }
    ], help: "Choose the algorithm used by the supplied checksum. MD5 and SHA-1 support legacy checksum lists; use SHA-256 for new integrity records." },
    { id: "verification", type: "radio", label: "Operation", defaultValue: "none", choices: [
      { value: "none", label: "Calculate checksums" }, { value: "checksum", label: "Verify against an expected checksum" }, { value: "manifest", label: "Verify against a checksum manifest" }
    ] },
    { id: "expectedChecksum", type: "text", label: "Expected checksum", defaultValue: "", visibleWhen: { option: "verification", value: "checksum" }, help: "One hexadecimal checksum for one input file or the pasted text." },
    { id: "manifestText", type: "textarea", label: "Checksum manifest", defaultValue: "", visibleWhen: { option: "verification", value: "manifest" }, help: "Paste GNU or BSD checksum lines using the selected algorithm, or select a manifest file below. Pasted text uses the manifest entry name pasted-text.txt." },
    { id: "manifestFile", type: "file", label: "Manifest file", dropLabel: "Drop checksum manifest here", defaultValue: null, visibleWhen: { option: "verification", value: "manifest" }, help: "The selected manifest file takes precedence over pasted manifest text." },
    { id: "outputFormat", type: "radio", label: "Output format", defaultValue: "tsv", dependsOn: "verification", choices: [
      { value: "tsv", label: "Checksum table", labelsByParentValue: { checksum: "Verification table", manifest: "Verification table" } },
      { value: "manifest", label: "Checksum manifest", dependsOnValue: "none" },
      { value: "report", label: "Summary report", always: true, labelsByParentValue: { checksum: "Verification report", manifest: "Verification report" } }
    ] },
    { type: "group", label: "Limits", collapsible: true, collapsed: true, options: [
      { type: "limit-value", label: "Files and manifest entries", value: "1,000 each", detail: "Larger batches or manifests are rejected." },
      { type: "limit-value", label: "Pasted text", value: "5,000,000 characters", detail: "Larger text must be supplied as a local file." },
      { type: "limit-value", label: "Manifest size", value: "1 MiB", detail: "Larger manifests are rejected. File contents are hashed in 1 MiB chunks." }
    ] },
    { type: "note", text: "Files are hashed byte for byte, including compressed data. Pasted text is encoded as UTF-8 without trimming; browser text fields use LF line endings. Every byte must be read to calculate a complete checksum." },
    { type: "note", text: "Calculation can produce a checksum table, GNU checksum manifest, or report. Verification accepts an expected checksum or a GNU/BSD manifest and produces a table or report with comparison results." },
    { type: "note", text: "References:\n\nIncremental checksums: hash-wasm documentation." }
  ]
};
