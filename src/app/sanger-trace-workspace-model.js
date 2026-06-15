import { parseSequenceInput } from "../core/fasta.js";
import { parseSangerTraceInput } from "../core/sanger-trace.js";
import { cleanDnaRnaSequence } from "../core/sequence.js";

export const sangerTaskSummaries = {
  review: "Inspect a chromatogram, quality calls, trim range, and export a cleaned read.",
  edit: "Open the trace viewer, click base calls, and edit the displayed sequence.",
  assemble: "Combine multiple clipped traces into a small Sanger consensus.",
  compare: "Compare clipped traces or consensus sequence against a reference DNA record."
};

export function normalizeSangerTraceFormatLabel(trace) {
  const source = String(trace?.sourceFormat ?? "").toLowerCase();
  if (source === "ab1" || source.includes("binary-ab1") || source.includes("abif")) {
    return "AB1/ABIF";
  }
  if (source.includes("binary-scf") || source.includes("scf")) {
    return "SCF";
  }
  if (trace?.traceMode === "measured-channels") {
    return "Measured trace channels";
  }
  if (trace?.traceMode === "base-call-preview") {
    return "Base-called sequence";
  }
  return "Trace session data";
}

export function qualitySummaryFromBaseCalls(baseCalls = []) {
  const qualities = baseCalls
    .map((call) => Number.parseInt(call.quality, 10))
    .filter((quality) => Number.isFinite(quality));
  if (qualities.length === 0) {
    return "No quality values";
  }
  const min = Math.min(...qualities);
  const max = Math.max(...qualities);
  const mean = qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length;
  return `Q ${min}-${max}, mean ${mean.toFixed(1)}`;
}

export function summarizeSangerTraceInput(text, index) {
  const source = String(text ?? "").trim();
  if (!source) {
    return {
      title: `Trace ${index + 1}`,
      format: "No trace loaded",
      length: "0 bases",
      quality: "No quality values",
      warnings: ["Add a trace file or paste raw trace/base-call input in the advanced area."],
      error: false
    };
  }
  try {
    const trace = parseSangerTraceInput(source);
    return {
      title: trace.name || `Trace ${index + 1}`,
      format: normalizeSangerTraceFormatLabel(trace),
      length: `${trace.baseCalls.length.toLocaleString()} called bases`,
      quality: qualitySummaryFromBaseCalls(trace.baseCalls),
      sourceNote: trace.sourceNote,
      warnings: trace.warnings ?? [],
      error: false
    };
  } catch (error) {
    return {
      title: `Trace ${index + 1}`,
      format: "Unrecognized input",
      length: "0 bases",
      quality: "No quality values",
      warnings: [error?.message ?? "Could not parse this trace."],
      error: true
    };
  }
}

export function summarizeSangerReferenceInput(text) {
  const source = String(text ?? "").trim();
  if (!source) {
    return {
      text: "No reference loaded",
      warning: ""
    };
  }
  try {
    const record = parseSequenceInput(source, "sanger_reference")[0];
    if (!record) {
      throw new Error("No reference sequence was found.");
    }
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    if (!cleaned.sequence) {
      throw new Error("No DNA bases were found in the reference.");
    }
    return {
      text: `${record.title || "Reference"} \u2022 ${cleaned.sequence.length.toLocaleString()} bp`,
      warning: cleaned.warnings?.[0] ?? ""
    };
  } catch (error) {
    return {
      text: "Reference needs attention",
      warning: error?.message ?? "Could not parse this reference."
    };
  }
}

export function serializeSangerTraceWorkspaceInput({
  traceTexts = [],
  reference = "",
  task = "review",
  separator = "---"
} = {}) {
  const includedTraceTexts = traceTexts.filter((text) => String(text ?? "").trim());
  if (includedTraceTexts.length === 0) {
    return "";
  }
  if (includedTraceTexts.length === 1 && !String(reference ?? "").trim() && task !== "assemble" && task !== "compare") {
    return includedTraceTexts[0];
  }
  return [...includedTraceTexts, reference].join(`\n${separator}\n`);
}

export function makeSangerTraceSettingsText(traceRows = [], existingText = "") {
  const rows = [];
  let includedIndex = 0;
  for (const row of traceRows) {
    const include = row?.included !== false;
    const orientation = row?.orientation ?? "auto";
    const text = String(row?.text ?? "").trim();
    if (!include || orientation === "ignore" || !text) {
      continue;
    }
    includedIndex += 1;
    const clipStart = String(row?.clipStart ?? "").trim();
    const clipEnd = String(row?.clipEnd ?? "").trim();
    const reverseComplement = orientation === "reverse-complement" ? "true" : orientation === "forward" ? "false" : "";
    if (clipStart || clipEnd || reverseComplement) {
      rows.push([includedIndex, clipStart, clipEnd, reverseComplement].join("\t"));
    }
  }
  const generated = rows.length > 0
    ? ["trace\tclip_start\tclip_end\treverse_complement", ...rows].join("\n")
    : "";
  return [generated, String(existingText ?? "").trim()].filter(Boolean).join("\n");
}

export function summarizeSangerTraceSet(traceItems = [], {
  task = "review",
  referenceText = "",
  reverseComplementTesting = true
} = {}) {
  if (traceItems.length === 0) {
    return "No traces loaded.";
  }
  const formats = new Map();
  const qualityRanges = [];
  for (const item of traceItems) {
    const summary = item.summary ?? item;
    formats.set(summary.format, (formats.get(summary.format) ?? 0) + 1);
    const match = String(summary.quality ?? "").match(/^Q\s+(\d+)-(\d+)/);
    if (match) {
      qualityRanges.push(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
    }
  }
  const formatText = [...formats.entries()].map(([format, count]) => `${count} ${format}`).join(", ");
  const qualityText = qualityRanges.length > 0
    ? `quality range ${Math.min(...qualityRanges)}-${Math.max(...qualityRanges)}`
    : "quality values unavailable";
  const parts = [
    `${traceItems.length} trace${traceItems.length === 1 ? "" : "s"} loaded`,
    formatText,
    qualityText
  ];
  if (task === "assemble" || task === "compare") {
    parts.push(`reverse-complement testing ${reverseComplementTesting ? "enabled" : "disabled"}`);
  }
  if (task === "compare") {
    parts.push(`reference ${String(referenceText ?? "").trim() ? "provided" : "not provided"}`);
  }
  return `${parts.join("; ")}.`;
}
