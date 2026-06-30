export const outputDescriptionConfig = {
  checksumMaxInputCharacters: 5_000_000,
  sms3Citation:
    "Stothard, P. (2000) The Sequence Manipulation Suite: JavaScript Programs for Analyzing and Formatting Protein and DNA Sequences. BioTechniques, 28(6), 1102-1104. https://doi.org/10.2144/00286ir01",
  localProcessingNote: "SMS3 runs locally in the browser."
};

function isFileLike(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function formatOptionValue(value) {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatOptionValue).join(", ")}]`;
  }
  if (typeof value === "object") {
    const sorted = Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    );
    return JSON.stringify(sorted);
  }
  return String(value);
}

export function stableOptionsSummary(options = {}) {
  return stableOptionEntries(options)
    .map(([key, value]) => `${key}: ${formatOptionValue(value)}`)
    .join("; ");
}

function stableOptionEntries(options = {}) {
  return Object.entries(options)
    .filter(([, value]) => !isFileLike(value))
    .sort(([left], [right]) => left.localeCompare(right));
}

function appendSection(lines, title, entries) {
  const content = entries.filter(Boolean);
  if (content.length === 0) {
    return;
  }
  lines.push("", title, ...content);
}

function formatCitationLines(citations = []) {
  return citations
    .map((citation) => citation.text)
    .filter(Boolean)
    .map((text) => `Method/source note: ${text}`);
}

function capitalize(value) {
  const text = String(value ?? "");
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : "";
}

function pluralUnitLabel(unit = "base") {
  return unit.endsWith("s") ? unit : `${unit}s`;
}

function formatWarningSummary(warnings = []) {
  if (warnings.length === 0) {
    return "none reported.";
  }
  return `${warnings.length} warning${warnings.length === 1 ? "" : "s"} reported. See the SMS3 warning summary for details.`;
}

export function shouldCalculateInputChecksum(text, config = outputDescriptionConfig) {
  const source = String(text ?? "");
  return Boolean(source && source.length <= config.checksumMaxInputCharacters);
}

export async function sha256Hex(text, { crypto = globalThis.crypto, config = outputDescriptionConfig } = {}) {
  const source = String(text ?? "");
  if (!shouldCalculateInputChecksum(source, config) || !crypto?.subtle) {
    return "";
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildOutputDescriptionText({
  tool,
  result,
  options = {},
  formatLabel,
  inputChecksum = "",
  appVersion = "",
  config = outputDescriptionConfig
}) {
  const processedUnitLabel = pluralUnitLabel(result?.processedUnitLabel ?? "base");
  const optionLines = stableOptionEntries(options).map(
    ([key, value]) => `${key}: ${formatOptionValue(value)}`
  );
  const lines = ["SMS3 Output Description"];

  appendSection(lines, "Tool", [
    `Name: ${tool?.name ?? "Tool"}`,
    `SMS3 version: ${appVersion || "not recorded"}`,
    tool?.summary ? `Purpose: ${tool.summary}` : ""
  ]);

  appendSection(lines, "Output", [
    `Selected output: ${formatLabel}`,
    `Default download: ${result?.download?.filename ?? "sms3-output.txt"}`,
    `MIME type: ${result?.download?.mimeType ?? "text/plain"}`
  ]);

  appendSection(lines, "Processing", [
    `Records processed: ${result?.recordsProcessed ?? 0}`,
    `${capitalize(processedUnitLabel)} processed: ${result?.basesProcessed ?? 0}`,
    `Warnings: ${formatWarningSummary(result?.warnings ?? [])}`
  ]);

  appendSection(lines, "Options", optionLines.length > 0 ? optionLines : ["Default settings used."]);

  appendSection(lines, "Input", [
    inputChecksum
      ? `SHA-256: ${inputChecksum}`
      : "SHA-256: not calculated for this run."
  ]);

  appendSection(lines, "References", [
    ...formatCitationLines(tool?.citations ?? []),
    config.sms3Citation ? `SMS3: ${config.sms3Citation}` : ""
  ]);

  appendSection(lines, "Environment", [
    config.localProcessingNote
  ]);

  return lines.join("\n");
}
