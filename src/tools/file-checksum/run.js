import { calculateFileChecksums, checksumColumns, checksumManifest } from "../../core/file-checksum.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export async function runFileChecksum(input, options = {}, context = {}) {
  const format = options.outputFormat ?? "tsv";
  if (!["tsv", "manifest", "report"].includes(format)) throw new Error("Unknown checksum output format.");
  if (format === "manifest" && ["checksum", "manifest"].includes(options.verification)) {
    throw new Error("Verification requires a verification table or report. Choose Calculate checksums to create a checksum manifest.");
  }
  const result = await calculateFileChecksums(input, options, context);
  // Keep the automatic name for manifest matching; identify pasted input directly in results.
  const rows = result.rows.map((row, index) => options.fileSourceMode !== "files" && index === 0
    ? { ...row, filename: "Pasted text" } : row);
  const streams = {};
  let output;
  if (format === "tsv") {
    output = exportDelimitedTable(checksumColumns, rows);
    streams.table = makeTableStream(checksumColumns, rows, "file-checksums");
  } else if (format === "manifest") {
    output = checksumManifest(result.rows);
    streams.manifest = makeTextStream(output);
  } else {
    output = ["File Checksum", `Inputs processed: ${result.filesProcessed}`, `Bytes read: ${result.bytesRead}`, "Engine: hash-wasm 4.12.0", "", ...rows.flatMap((row) => [
      `Input: ${JSON.stringify(row.filename)}`, `Bytes: ${row.bytes ?? "unavailable"}`, `${row.algorithm}: ${row.checksum || "not calculated"}`,
      ...(row.expected ? [`Expected: ${row.expected}`] : []), `Verification: ${row.status}`, ""
    ]), "Reference: https://github.com/Daninet/hash-wasm"].join("\n");
    streams.report = makeTextStream(output);
  }
  return makeToolResult({ output, warnings: result.warnings, streams,
    recordsProcessed: result.filesProcessed, basesProcessed: result.bytesRead, processedUnitLabel: "byte",
    download: { filename: format === "manifest" ? `file-checksum-manifest.${result.algorithm}` : format === "report" ? "file-checksum-report.txt" : "file-checksum.tsv", mimeType: format === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8" }
  });
}
