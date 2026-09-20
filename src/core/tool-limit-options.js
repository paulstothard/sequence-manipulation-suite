import { DEFAULT_ALIGNMENT_SVG_CELL_LIMIT } from "./alignment-svg.js";
import { DEFAULT_MAX_DECODED_TEXT_BYTES } from "./compressed-text-reader.js";
import { PROTEIN_STRUCTURE_KEYBOARD_INSPECTION_LIMIT, PROTEIN_STRUCTURE_NEAREST_ATOM_PICK_LIMIT, PROTEIN_STRUCTURE_SEARCH_SUGGESTION_LIMIT, PROTEIN_STRUCTURE_SUGGESTION_CHAR_LIMIT } from "./viewer-limits.js";

const TECHNICAL_LIMIT_GROUP_IDS = new Set(["advancedLimits", "referenceMatchLimitsGroup"]);
export const STANDARD_BROWSER_FILE_BYTES = 25 * 1024 * 1024;
export const WORKBOOK_IMPORT_ROW_LIMIT = 50_000;
export const WORKBOOK_IMPORT_CELL_LIMIT = 250_000;
export const XLSX_EXPORT_ROW_LIMIT = 50_000;
export const XLSX_EXPORT_CELL_LIMIT = 250_000;
export const TABLE_PREVIEW_MAX_CHARACTERS = 1_000_000;
export const TABLE_PREVIEW_MAX_CELLS = 250_000;
export const TABLE_PREVIEW_VISIBLE_ROWS = 50;
export const TABLE_PREVIEW_VISIBLE_COLUMNS = 12;
export const TABLE_RESULT_RENDER_ROW_LIMIT = 1_000;
export const TABLE_RESULT_RENDER_CELL_LIMIT = 20_000;
export const OUTPUT_SEARCH_HIGHLIGHT_LIMIT = 300_000;
export const OUTPUT_SEARCH_HIGHLIGHT_WINDOW = 8_000;

const SPECIAL_FILE_WORKSPACES = new Set([
  "markdown-notebook",
  "tree-viewer",
  "alignment-viewer",
  "sanger-trace-viewer",
  "sanger-trace-assembly",
  "sanger-trace-reference-comparison",
  "sam-bam-summary-region-viewer",
  "vcf-genotype-table",
  "vcf-filter",
  "indexed-fasta-region-extractor",
  "variant-consensus-builder"
]);
const EDITOR_DOCUMENT_TOOLS = new Set([
  "plate-layout-planner", "sequence-editor", "markdown-notebook",
  "linear-genome-figure", "circular-genome-figure", "sequence-extractor",
  "sanger-trace-viewer", "sanger-trace-assembly", "sanger-trace-reference-comparison"
]);
const SANGER_WORKSPACE_TOOLS = new Set([
  "sanger-trace-viewer", "sanger-trace-assembly", "sanger-trace-reference-comparison"
]);

function hasStandardFileImport(metadata) {
  const hasDirectFileOption = (options = []) => options.some((option) =>
    (option.id === "loadedFastaFile" && option.type === "file") ||
    (option.type === "group" && hasDirectFileOption(option.options ?? []))
  );
  const hasDirectLoadedFasta = !metadata?.splitInput &&
    hasDirectFileOption(metadata?.options);
  return metadata?.inputRequired !== false &&
    !metadata?.fileInput?.directFileOption &&
    !hasDirectLoadedFasta &&
    !SPECIAL_FILE_WORKSPACES.has(metadata?.id);
}

function acceptsWorkbook(metadata) {
  const fileTypes = [
    metadata?.fileInput?.accept,
    ...(metadata?.splitInput?.panels ?? []).map((panel) => panel.accept)
  ].join(",");
  return /\.xlsx\b/i.test(fileTypes) ||
    (!metadata?.fileInput && !metadata?.splitInput && /\bExcel\b/i.test(metadata?.inputType ?? ""));
}

function tablePreviewCharacterLimit(metadata) {
  if (metadata?.inputTable === false) return null;
  const previewConfigs = [metadata?.inputTable, ...(metadata?.splitInput?.panels ?? []).map((panel) => panel.inputTable)].filter(Boolean);
  if (!previewConfigs.length) {
    const tableTag = (metadata?.tags ?? []).some((tag) => String(tag).toLowerCase() === "table");
    if (!metadata?.splitInput && tableTag && /^CSV,\s*TSV\b/i.test(metadata?.inputType ?? "")) {
      return TABLE_PREVIEW_MAX_CHARACTERS;
    }
    return null;
  }
  return Math.min(...previewConfigs.map((config) => Number(config.maxCharacters) || TABLE_PREVIEW_MAX_CHARACTERS));
}

function limit(id, label, value, detail = "") {
  return { id, type: "limit-value", label, value, detail };
}

// These limits belong to particular UI paths. They are not universal run limits.
export function getApplicableSharedToolLimits(metadata = {}) {
  const limits = [];
  const standardImport = hasStandardFileImport(metadata);
  if (standardImport) {
    limits.push(limit("standardFileUploadLimit", "Text file upload", `${STANDARD_BROWSER_FILE_BYTES / 1048576} MiB per file`, "Larger files are rejected during text upload."));
    limits.push(limit("decodedTextImportLimit", "Decoded text size", `${DEFAULT_MAX_DECODED_TEXT_BYTES / 1048576} MiB`, "The decoder stops at this size."));
  }
  if (SANGER_WORKSPACE_TOOLS.has(metadata?.id)) {
    limits.push(limit("sangerTraceFileLimit", "Trace/reference file upload", `${STANDARD_BROWSER_FILE_BYTES / 1048576} MiB per file`, "Larger uploads are rejected before parsing."));
    limits.push(limit("sangerDecodedTextLimit", "Decoded text trace/reference import", `${DEFAULT_MAX_DECODED_TEXT_BYTES / 1048576} MiB`, "Applies to uploaded text traces and references."));
  }
  if (metadata?.id === "variant-consensus-builder") {
    limits.push(limit("variantConsensusLoadedInputLimit", "Loaded reference FASTA or VCF text", "20,000,000 decoded bytes per file", "Applies to paste/upload mode. Indexed mode reads the selected region."));
    limits.push(limit("variantConsensusPreviewLimit", "Indexed VCF sample preview", "2,000,000 decoded bytes", "The sample chooser reads a preview of the indexed file."));
  }
  if (metadata?.id === "alignment-viewer") {
    limits.push(limit("alignmentReferenceTextUploadLimit", "Reference text/annotation upload", `${STANDARD_BROWSER_FILE_BYTES / 1048576} MiB per file`, "Larger uploads are rejected."));
  }
  if (metadata?.id === "indexed-fasta-region-extractor") {
    limits.push(limit("fastaRegionLoadedUploadLimit", "Paste/upload FASTA file", `${STANDARD_BROWSER_FILE_BYTES / 1048576} MiB per file`, "Applies to loaded text; indexed FASTA is read by region."));
  }
  if (EDITOR_DOCUMENT_TOOLS.has(metadata?.id)) {
    limits.push(limit("editorDocumentLimit", "Saved editable document import", `${STANDARD_BROWSER_FILE_BYTES / 1048576} MiB`, "Larger SMS3 JSON documents are rejected."));
  }
  if (standardImport && acceptsWorkbook(metadata)) {
    limits.push(limit("workbookImportLimit", "Excel worksheet import", `${WORKBOOK_IMPORT_ROW_LIMIT.toLocaleString("en-US")} rows and ${WORKBOOK_IMPORT_CELL_LIMIT.toLocaleString("en-US")} cells`, "The first nonempty worksheet is rejected above either bound."));
  }
  const previewCharacters = tablePreviewCharacterLimit(metadata);
  if (previewCharacters !== null) {
    limits.push(limit("tablePreviewParseLimit", "Table preview parsing", `${previewCharacters.toLocaleString("en-US")} characters and ${TABLE_PREVIEW_MAX_CELLS.toLocaleString("en-US")} cells`, "Preview stops above either bound; Run uses the accepted input."));
    limits.push(limit("tablePreviewVisibleLimit", "Table preview shown", `${TABLE_PREVIEW_VISIBLE_ROWS} rows and ${TABLE_PREVIEW_VISIBLE_COLUMNS} columns`, "Run uses the full accepted input."));
  }
  if (metadata?.workflow?.outputs?.some((output) => output.kind === "table")) {
    limits.push(limit("tableResultRenderLimit", "Result table displayed at once", `${TABLE_RESULT_RENDER_ROW_LIMIT.toLocaleString("en-US")} rows or ${TABLE_RESULT_RENDER_CELL_LIMIT.toLocaleString("en-US")} visible cells`, "The table switches to a preview above either bound; Copy all rows and TSV/CSV download use the full result."));
    limits.push(limit("xlsxExportLimit", "Excel download of a result table", `${XLSX_EXPORT_ROW_LIMIT.toLocaleString("en-US")} rows and ${XLSX_EXPORT_CELL_LIMIT.toLocaleString("en-US")} cells`, "XLSX download stops above either bound; TSV/CSV remains available."));
  }
  if (metadata?.workflow?.outputs?.some((output) => output.id === "coloredSvg")) {
    limits.push(limit("coloredAlignmentCellLimit", "Colored alignment figure", `${DEFAULT_ALIGNMENT_SVG_CELL_LIMIT.toLocaleString("en-US")} displayed cells`, "The figure is withheld above this size; other alignment outputs contain the full result."));
  }
  if (metadata?.id !== "markdown-notebook" && metadata?.workflow?.outputs?.some((output) => output.kind === "text" && !String(output.mediaType ?? "").startsWith("image/"))) {
    limits.push(limit("outputSearchHighlightLimit", "Search highlights in text results", `${OUTPUT_SEARCH_HIGHLIGHT_LIMIT.toLocaleString("en-US")} characters for full highlighting`, `For longer results, highlighting follows the selected match in an ${OUTPUT_SEARCH_HIGHLIGHT_WINDOW.toLocaleString("en-US")}-character window; search, copy, and download use the full text.`));
  }
  if (metadata?.workflow?.outputs?.some((output) => output.viewerType === "protein-structure-viewer")) {
    limits.push(limit("structureInputSuggestionsLimit", "3D model/chain/assembly option suggestions", `${PROTEIN_STRUCTURE_SUGGESTION_CHAR_LIMIT.toLocaleString("en-US")} input characters`, "Suggestions stop pre-parsing above this size."));
    limits.push(limit("structureSearchSuggestionLimit", "3D structure search suggestions", `${PROTEIN_STRUCTURE_SEARCH_SUGGESTION_LIMIT} matches shown`, "Typing a specific name searches beyond the visible suggestions."));
    limits.push(limit("structureNearestAtomPickLimit", "3D nearest-atom fallback picking", `${PROTEIN_STRUCTURE_NEAREST_ATOM_PICK_LIMIT.toLocaleString("en-US")} selected atoms`, "Fallback click picking stops above this size."));
    limits.push(limit("structureKeyboardInspectionLimit", "3D keyboard inspection targets", `${PROTEIN_STRUCTURE_KEYBOARD_INSPECTION_LIMIT.toLocaleString("en-US")} residues/atoms`, "Keyboard inspection cycles through this many targets."));
  }
  return limits;
}

export function isTechnicalLimitsGroup(option) {
  return option?.type === "group" && (
    TECHNICAL_LIMIT_GROUP_IDS.has(option.id) ||
    /^limits$/i.test(String(option.label ?? ""))
  );
}

export function getToolLimitGroups(metadata) {
  const groups = [];
  function visit(options = []) {
    for (const option of options) {
      if (isTechnicalLimitsGroup(option)) groups.push(option);
      if (option.type === "group") visit(option.options);
    }
  }
  visit(metadata?.options);
  return groups;
}

export function getFixedLimitOptionDefaults(metadata) {
  return Object.fromEntries(getToolLimitGroups(metadata)
    .flatMap((group) => group.options ?? [])
    .filter((option) => option.id && option.type !== "note" && option.defaultValue !== undefined)
    .map((option) => [option.id, option.defaultValue]));
}

export function applyFixedToolLimits(metadata, options = {}) {
  return { ...options, ...getFixedLimitOptionDefaults(metadata) };
}
