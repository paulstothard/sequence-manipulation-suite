import { createMD5, createSHA1, createSHA256, createSHA512 } from "../vendor/file-tools/hash-runtime.js";
import { FILE_TOOL_LIMITS, fileCheckpoint, readByteRange, requireLocalFile, textFile } from "./local-file-bytes.js";

export const CHECKSUM_ALGORITHMS = Object.freeze({
  sha256: { label: "SHA-256", length: 64, create: createSHA256 },
  md5: { label: "MD5", length: 32, create: createMD5 },
  sha1: { label: "SHA-1", length: 40, create: createSHA1 },
  sha512: { label: "SHA-512", length: 128, create: createSHA512 }
});
export const checksumColumns = [
  { id: "filename", label: "Input", type: "string" },
  { id: "bytes", label: "Bytes", type: "number" },
  { id: "algorithm", label: "Algorithm", type: "string" },
  { id: "checksum", label: "Checksum", type: "string" },
  { id: "expected", label: "Expected checksum", type: "string" },
  { id: "status", label: "Verification", type: "string" }
];

export function normalizeChecksumAlgorithm(value = "sha256") {
  const algorithm = String(value).toLowerCase().replaceAll("-", "");
  if (!Object.hasOwn(CHECKSUM_ALGORITHMS, algorithm)) throw new Error("Choose SHA-256, MD5, SHA-1, or SHA-512.");
  return algorithm;
}

function validateDigest(value, algorithm) {
  const digest = String(value).trim().toLowerCase();
  if (!new RegExp(`^[a-f0-9]{${CHECKSUM_ALGORITHMS[algorithm].length}}$`).test(digest)) {
    throw new Error(`Expected ${CHECKSUM_ALGORITHMS[algorithm].label} must contain ${CHECKSUM_ALGORITHMS[algorithm].length} hexadecimal characters.`);
  }
  return digest;
}

function manifestPath(name) { return name.replace(/^(\.\/)+/, ""); }
function unescapeFilename(value) {
  return value.replace(/\\([\s\S]|$)/g, (_, char) => {
    if (!["\\", "n", "r"].includes(char)) throw new Error("Unsupported filename escape in checksum manifest.");
    return char === "n" ? "\n" : char === "r" ? "\r" : "\\";
  });
}

// GNU md5sum/sha*sum and BSD shasum formats; filenames are data, never paths to open.
export function parseChecksumManifest(text, selectedAlgorithm) {
  const source = String(text ?? "");
  if (new TextEncoder().encode(source).length > FILE_TOOL_LIMITS.manifestBytes) throw new Error("Checksum manifest exceeds 1 MiB.");
  const entries = new Map();
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    if (!raw.trim() || raw.startsWith("#")) continue;
    let name, checksum;
    const bsd = raw.match(/^(MD5|SHA-?1|SHA-?256|SHA-?512) \((.*)\) = ([a-f\d]+)$/i);
    const gnu = raw.match(/^(\\?)([a-f\d]+) ([ *])(.*)$/i);
    if (bsd) {
      if (normalizeChecksumAlgorithm(bsd[1]) !== selectedAlgorithm) throw new Error(`Manifest line ${index + 1} uses a different algorithm. Choose ${bsd[1]}.`);
      [, , name, checksum] = bsd;
    } else if (gnu) {
      checksum = gnu[2]; name = gnu[1] ? unescapeFilename(gnu[4]) : gnu[4];
    } else throw new Error(`Invalid checksum manifest line ${index + 1}. Use GNU or BSD checksum format.`);
    name = manifestPath(name);
    if (!name || name.length > FILE_TOOL_LIMITS.archivePathCharacters) throw new Error(`Invalid filename on manifest line ${index + 1}.`);
    if (entries.has(name)) throw new Error(`Duplicate manifest filename: ${name}`);
    if (entries.size >= FILE_TOOL_LIMITS.files) throw new Error("Checksum manifest exceeds 1,000 entries.");
    entries.set(name, validateDigest(checksum, selectedAlgorithm));
  }
  if (!entries.size) throw new Error("The checksum manifest contains no checksum entries.");
  return entries;
}

export function checksumManifest(rows) {
  return rows.filter((row) => row.checksum).map((row) => {
    const escaped = /[\\\n\r]/.test(row.filename);
    const name = row.filename.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    return `${escaped ? "\\" : ""}${row.checksum}  ${name}`;
  }).join("\n") + "\n";
}

export async function calculateFileChecksums(input, options = {}, context = {}) {
  const algorithm = normalizeChecksumAlgorithm(options.algorithm);
  const spec = CHECKSUM_ALGORITHMS[algorithm];
  const sourceMode = options.fileSourceMode ?? "text";
  if (!["text", "files"].includes(sourceMode)) throw new Error("Choose pasted text or local files.");
  const files = sourceMode === "files" ? Array.from(options.checksumFiles ?? []) : [textFile(input)];
  if (!files.length) throw new Error("Select one or more files.");
  if (files.length > FILE_TOOL_LIMITS.files) throw new Error("Select at most 1,000 files per run.");
  const names = new Set();
  for (const file of files) {
    requireLocalFile(file);
    if (file.name?.length > FILE_TOOL_LIMITS.archivePathCharacters) throw new Error("Filenames must contain at most 4,096 characters.");
    if (!file.name || names.has(file.name)) throw new Error("Selected files must have distinct filenames for checksum reporting and verification.");
    names.add(file.name);
  }
  const verification = options.verification ?? "none";
  if (!["none", "checksum", "manifest"].includes(verification)) throw new Error("Unknown checksum verification mode.");
  let expected = null, manifest = null;
  if (verification === "checksum") {
    if (files.length !== 1) throw new Error("A single expected checksum requires exactly one input. Use a manifest for multiple files.");
    expected = validateDigest(options.expectedChecksum ?? "", algorithm);
  } else if (verification === "manifest") {
    let text = options.manifestText ?? "";
    if (options.manifestFile) {
      const file = requireLocalFile(options.manifestFile);
      if (file.size > FILE_TOOL_LIMITS.manifestBytes) throw new Error("Checksum manifest exceeds 1 MiB.");
      text = new TextDecoder("utf-8", { fatal: true }).decode(await readByteRange(file, 0, file.size, context));
    }
    manifest = parseChecksumManifest(text, algorithm);
  }
  const hasher = await spec.create();
  const rows = [], warnings = [], matched = new Set();
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (!Number.isSafeInteger(totalBytes)) throw new Error("Combined file size exceeds exact browser byte accounting.");
  let bytesRead = 0;
  for (const file of files) {
    await fileCheckpoint(context);
    hasher.init();
    for (let offset = 0; offset < file.size; offset += FILE_TOOL_LIMITS.hashChunkBytes) {
      const bytes = await readByteRange(file, offset, Math.min(file.size, offset + FILE_TOOL_LIMITS.hashChunkBytes), context);
      hasher.update(bytes);
      bytesRead += bytes.length;
      context.reportProgress?.({ phase: "hashing-files", progress: totalBytes ? bytesRead / totalBytes : 1, bytesRead, totalBytes });
      await fileCheckpoint(context);
    }
    let target = expected;
    if (manifest) {
      const candidates = [...manifest.keys()].filter((name) => name === file.name || name.split("/").at(-1) === file.name);
      const exact = manifest.has(file.name) ? file.name : candidates.length === 1 ? candidates[0] : null;
      if (!exact && candidates.length > 1) throw new Error(`Ambiguous manifest paths for ${file.name}. Select a manifest with unique filenames.`);
      if (exact) {
        matched.add(exact); target = manifest.get(exact);
        if (exact !== file.name) warnings.push(`Matched ${file.name} to manifest path ${exact} by its unique filename.`);
      }
    }
    const checksum = hasher.digest("hex");
    rows.push({ filename: file.name, bytes: file.size, algorithm: spec.label, checksum, expected: target ?? "", status: target ? checksum === target ? "Match" : "Mismatch" : manifest ? "Not in manifest" : "Not checked" });
  }
  if (manifest) for (const [filename, checksum] of manifest) {
    if (!matched.has(filename)) rows.push({ filename, bytes: null, algorithm: spec.label, checksum: "", expected: checksum, status: "File not selected" });
  }
  if (rows.some((row) => row.status === "Mismatch")) warnings.push("One or more checksums do not match the expected values.");
  if (rows.some((row) => ["Not in manifest", "File not selected"].includes(row.status))) warnings.push("Manifest verification is incomplete. See the verification status for each file.");
  return { rows, warnings, bytesRead, algorithm, filesProcessed: files.length };
}
