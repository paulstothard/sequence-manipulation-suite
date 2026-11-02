import { appVersion } from "../app-version.js";
// Shared interpretation fields for bounded local design-tool reference searches.
export const referenceCoverageColumns = [
  { id: "reference_search_status", label: "Reference search status", type: "string" },
  { id: "reference_count_interpretation", label: "Reference count interpretation", type: "string" },
  { id: "reference_bases_scanned", label: "Reference bases scanned", type: "number" },
  { id: "reference_records_skipped", label: "Reference records skipped", type: "number" },
  { id: "reference_ambiguous_windows_skipped", label: "Reference ambiguous windows skipped", type: "number" },
  { id: "reference_search_model", label: "Reference search model", type: "string" },
  { id: "reference_detail_rows_omitted", label: "Reference detail rows omitted", type: "number" }
];

export function finalizeReferenceCoverage(rows, screen) {
  screen.recordsScanned ??= 0;
  screen.recordsSkipped ??= 0;
  screen.skippedAmbiguousWindows ??= 0;
  if (screen.status === "run") {
    screen.status = screen.recordsSkipped > 0 || screen.skippedAmbiguousWindows > 0
      ? (screen.recordsScanned > 0 ? "partial" : "skipped") : "complete";
  }
  const available = screen.status === "complete" || screen.status === "partial";
  for (const row of rows) {
    row.reference_search_status = screen.status;
    row.reference_search_model = screen.searchModel ?? "";
    row.reference_detail_rows_omitted = screen.omittedRows ?? screen.detailRowsOmitted ?? 0;
    row.reference_count_interpretation = screen.status === "partial" ? "lower bound in scanned reference" : available ? "count under stated search rules" : "unavailable";
    row.reference_bases_scanned = screen.basesProcessed ?? 0;
    row.reference_records_skipped = screen.recordsSkipped;
    row.reference_ambiguous_windows_skipped = screen.skippedAmbiguousWindows;
    if (!available) {
      for (const key of ["reference_match_count", "exact_reference_match_count", "near_reference_match_count", "reference_matches_beyond_first_exact", "best_reference_mismatches"]) {
        if (key in row) row[key] = "";
      }
    }
  }
  return screen;
}

export function referenceCoverageText(screen) {
  return `${screen.status}; ${screen.recordsScanned ?? 0} record(s) scanned, ${screen.basesProcessed ?? 0} bp; ${screen.recordsSkipped ?? 0} record(s) and ${screen.skippedAmbiguousWindows ?? 0} ambiguous window(s) skipped${screen.status === "partial" ? "; match counts are lower bounds" : ""}${screen.skipReason ? `; ${screen.skipReason}` : ""}`;
}

export function makeDesignAnalysisJson(tool, result, sourceOptions = {}) {
  // Self-contained selected export: retain inputs, settings, warnings and typed
  // results. Internal Map indexes are recomputable and intentionally excluded.
  const inputFiles = Object.fromEntries(Object.entries(sourceOptions).filter(([, value]) => value && typeof value === "object" && typeof value.slice === "function" && Number.isFinite(value.size))
    .map(([key, file]) => [key, { name: file.name ?? "unnamed file", size: file.size, mediaType: file.type ?? "", lastModified: file.lastModified ?? null }]));
  const referenceSequenceAvailability = (result.referenceScreen?.recordsSkipped ?? 0) > 0 || result.referenceRecords?.some(record => !record.sequence && (record.length ?? 0) > 0)
    ? "Reference metadata only for skipped/indexed records; retain the original reference files to reproduce the search"
    : "Normalized reference sequences embedded when supplied";
  return JSON.stringify({ schema: "sms3-design-analysis", schemaVersion: 1, tool, appVersion, analysisRevision: "2026-10-31", inputFiles, referenceSequenceAvailability, ...result }, (key, value) => {
    if (value instanceof Map || value instanceof Set || typeof value === "function") return undefined;
    if (typeof value === "number" && !Number.isFinite(value)) return "unlimited";
    return value;
  }, 2) + "\n";
}

export const designSearchColumns = [
  { id: "candidate_search_status", label: "Candidate search status", type: "string" },
  { id: "candidates_omitted", label: "Candidates omitted by result limits", type: "number" },
  { id: "target_records_skipped", label: "Target records skipped", type: "number" }
];
export function finalizeDesignSearch(rows, search) {
  search.status = search.recordsSkipped || search.windowLimitReached ? "partial" : search.recordsScanned ? "complete" : "not run";
  search.candidatesReported = rows.length;
  search.candidatesOmitted = Math.max(0, search.candidatesMatched - rows.length);
  search.interpretation = "Completion under selected filters; reference matches do not rerank candidates";
  for (const row of rows) {
    row.candidate_search_status = search.status;
    row.candidates_omitted = search.candidatesOmitted;
    row.target_records_skipped = search.recordsSkipped;
  }
  return search;
}
export function designSearchText(search) {
  return search ? `Candidate enumeration: ${search.status}; ${search.recordsScanned} records scanned, ${search.recordsSkipped} skipped; ${search.candidatesOmitted} candidates omitted by result limits. Reference matches do not rerank candidates.` : "Candidate enumeration: not run";
}
