import { renderAlignedSequenceViewer } from "./aligned-sequence-viewer-ui.js";
import { getShowcaseOutputs, groupShowcaseItems } from "./showcase-catalog.js";
import { renderOrfExplorer } from "./orf-explorer-ui.js";
import {renderGraphicEditor} from './graphic-editor-ui.js';
import { renderTextTableImage } from './text-table-image-ui.js';
import { makeShowcaseGraphicDocument, makeShowcaseTextImageDocument } from './showcase-image-editors.js';
import { renderSangerPlotControls } from './sanger-plot-ui.js';
import { renderPlateSvg } from "../core/plate-layout-svg.js";
import { renderObservablePlotPreview } from "./plot-preview-ui.js";
import { renderProteinSequenceFigure } from "./protein-sequence-figure-ui.js";
import { renderSequenceLogo } from "./sequence-logo-ui.js";
import { renderSequenceEditorOutput } from "./sequence-editor-workspace-ui.js";
import { renderSequenceExtractorWorkspace } from "./sequence-extractor-workspace-ui.js";
import { renderSangerTraceViewer } from "./sanger-trace-viewer.js";
import { installVisualInspection } from "./visual-inspection.js";
import { renderTreeViewer } from "./tree-viewer-ui.js";
import { alignmentViewerReferenceExample } from "../examples/alignment-viewer-example.js";
import { vcfExtractorReferenceExample } from "../examples/vcf-extractor-example.js";
import { rerootTree } from "../../packages/tree-viewer/src/core/reroot.js";
import { installShowcaseZoomHint } from "./showcase-zoom-hint.js";

const SHOWCASE_TOOL_OPTION_OVERRIDES = new Map([
  ["restriction-digest", { gelStain: "red" }],
  ["in-silico-pcr", { gelStain: "green" }],
  ["alignment-viewer", {
    chromosome: "NC_001422.1",
    regionStart: 3920,
    regionEnd: 4130,
    maxAlignments: 20,
    maxVariants: 20,
    referenceGenomeMode: "loaded",
    referenceGenomeFastaFile: {
      text: alignmentViewerReferenceExample,
      name: "alignment-viewer-reference.fasta",
      size: alignmentViewerReferenceExample.length
    }
  }],
  ["sam-bam-summary-region-viewer", {
    chromosome: "NC_001422.1",
    regionStart: 3920,
    regionEnd: 4130,
    maxAlignments: 20,
    referenceGenomeMode: "loaded",
    referenceGenomeFastaFile: {
      text: alignmentViewerReferenceExample,
      name: "phix174-reference.fasta",
      size: alignmentViewerReferenceExample.length
    }
  }],
  ["sanger-trace-viewer", {
    showForwardTranslations: true,
    showReverseTranslations: true,
    geneticCode: "1"
  }],
  ["sanger-trace-assembly", {
    showForwardTranslations: true,
    showReverseTranslations: true,
    geneticCode: "1"
  }],
  ["vcf-genotype-table", {
    dataType: "region-variants",
    chromosome: "1",
    regionStart: 10460,
    regionEnd: 10590,
    maxVariants: 50,
    referenceGenomeMode: "loaded",
    referenceGenomeFastaFile: {
      text: vcfExtractorReferenceExample,
      name: "sms3-compact-vcf-reference.fasta",
      size: vcfExtractorReferenceExample.length
    }
  }]
]);
const SHOWCASE_TREE_OUTGROUPS = new Map([
  ["phylogeny-builder", "Mus_musculus"],
  ["multiple-align-dna-rna", "Mus_musculus"],
  ["multiple-align-protein", "Mus_musculus"]
]);

export async function makeShowcaseTreeViewerPreset(item, treeViewer) {
  const outgroupLabel = SHOWCASE_TREE_OUTGROUPS.get(item?.toolId);
  if (!outgroupLabel || !treeViewer?.document?.trees?.length) {
    return treeViewer;
  }
  const document = structuredClone(treeViewer.document);
  const tree = document.trees[0];
  const outgroup = tree.nodes.find((node) => node.label.includes(outgroupLabel));
  if (!outgroup || outgroup.id === tree.root.nodeId) {
    return treeViewer;
  }
  await rerootTree(tree, { edgeChildId: outgroup.id });
  Object.assign(document.presentation[tree.id], {
    layout: "rectangular",
    metric: "cladogram",
    labelAlignment: "aligned"
  });
  return { ...treeViewer, document };
}

function makeShowcaseStatus(text, className = "") {
  const status = document.createElement("p");
  status.className = ["showcase-status", className].filter(Boolean).join(" ");
  status.textContent = text;
  return status;
}

function normalizeShowcaseSvg(svg) {
  if (typeof SVGSVGElement !== "undefined" && !(svg instanceof SVGSVGElement)) {
    return;
  }
  if (svg.matches?.("[data-plot-foundation], [data-plot-backend], [data-plot-renderer]")) {
    svg.style.background = "#ffffff";
    svg.style.color = "#172026";
    svg.style.colorScheme = "light";
    svg.setAttribute("data-plot-color-scheme", "light");
  }
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) {
    return;
  }
  const [, , width, height] = viewBox.trim().split(/\s+/u).map(Number);
  if (Number.isFinite(width) && width > 0 && !svg.hasAttribute("width")) {
    svg.setAttribute("width", String(Math.ceil(width)));
  }
  if (Number.isFinite(height) && height > 0 && !svg.hasAttribute("height")) {
    svg.setAttribute("height", String(Math.ceil(height)));
  }
  if (!svg.hasAttribute("preserveAspectRatio")) {
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
}

function numericCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampCoordinate(value, length) {
  return Math.max(1, Math.min(length, value));
}

function makeRange(start, end, length) {
  const numericStart = numericCoordinate(start);
  const numericEnd = numericCoordinate(end ?? start);
  if (numericStart === null || numericEnd === null || !Number.isFinite(length) || length < 1) {
    return null;
  }
  const clampedStart = clampCoordinate(Math.min(numericStart, numericEnd), length);
  const clampedEnd = clampCoordinate(Math.max(numericStart, numericEnd), length);
  if (clampedEnd < 1 || clampedStart > length) {
    return null;
  }
  return {
    start: Math.floor(clampedStart),
    end: Math.ceil(clampedEnd)
  };
}

function itemRanges(item, length) {
  const ranges = [];
  if (Array.isArray(item?.parts)) {
    for (const part of item.parts) {
      const range = makeRange(part?.start, part?.end, length);
      if (range) ranges.push(range);
    }
  }
  for (const [startKey, endKey] of [
    ["start", "end"],
    ["siteStart", "siteEnd"],
    ["pamStart", "pamEnd"]
  ]) {
    const range = makeRange(item?.[startKey], item?.[endKey], length);
    if (range) ranges.push(range);
  }
  for (const key of ["position", "cutPosition", "cutAfter"]) {
    const range = makeRange(item?.[key], item?.[key], length);
    if (range) ranges.push(range);
  }
  return ranges;
}

function recordTrackRanges(record) {
  const length = Math.floor(Number(record?.length) || String(record?.sequence ?? "").length);
  if (!Number.isFinite(length) || length < 1) {
    return [];
  }
  return (record.tracks ?? []).flatMap((track) => {
    if (track?.type === "quantitative") {
      return [];
    }
    return (track?.items ?? []).flatMap((item) => itemRanges(item, length));
  });
}

function recordHasAlignedReadDetails(record) {
  return (record?.tracks ?? []).some((track) =>
    (track?.items ?? []).some((item) => Array.isArray(item?.alignedReadBases) && item.alignedReadBases.length > 0)
  );
}

function recordHasVariantSites(record) {
  return (record?.tracks ?? []).some((track) => track?.id === "vcf-variants");
}

function clampShowcaseWindow(start, span, length) {
  const safeSpan = Math.max(1, Math.min(length, Math.ceil(span)));
  let safeStart = Math.floor(start);
  if (safeStart < 1) {
    safeStart = 1;
  }
  if (safeStart + safeSpan - 1 > length) {
    safeStart = Math.max(1, length - safeSpan + 1);
  }
  return {
    start: safeStart,
    end: safeStart + safeSpan - 1
  };
}

function chooseShowcaseFocusRange(record, targetSpan) {
  const length = Math.floor(Number(record?.length) || String(record?.sequence ?? "").length);
  const ranges = recordTrackRanges(record).sort((left, right) => left.start - right.start || left.end - right.end);
  if (!Number.isFinite(length) || length < 1 || ranges.length === 0) {
    return null;
  }
  const widestRange = ranges.reduce((max, range) => Math.max(max, range.end - range.start + 1), 0);
  const alignedReadDetails = recordHasAlignedReadDetails(record);
  const detailSpan = widestRange <= 2 && !alignedReadDetails && !recordHasVariantSites(record)
    ? Math.max(targetSpan, 72)
    : targetSpan;
  const maxFocusSpan = record?.alphabet === "protein" || alignedReadDetails
    ? detailSpan
    : Math.max(detailSpan, Math.ceil(detailSpan * 2.5));
  let best = null;
  for (const range of ranges) {
    const rangeSpan = range.end - range.start + 1;
    const span = Math.max(
      detailSpan,
      Math.min(rangeSpan + Math.ceil(detailSpan * 0.35), maxFocusSpan)
    );
    const center = (range.start + range.end) / 2;
    const window = clampShowcaseWindow(Math.round(center - span / 2 + 0.5), span, length);
    const visibleCount = ranges.filter((candidate) =>
      candidate.end >= window.start && candidate.start <= window.end
    ).length;
    const visibleWidth = ranges.reduce((sum, candidate) =>
      candidate.end >= window.start && candidate.start <= window.end
        ? sum + Math.min(candidate.end, window.end) - Math.max(candidate.start, window.start) + 1
        : sum,
    0);
    const score = visibleCount * 10000 + visibleWidth - (window.end - window.start + 1);
    if (!best || score > best.score) {
      best = { ...window, score };
    }
  }
  return best ? { start: best.start, end: best.end } : null;
}

function showcaseViewerTargetSpan(record) {
  if (record?.alphabet === "protein" || recordHasVariantSites(record)) {
    return 48;
  }
  return recordHasAlignedReadDetails(record) ? 42 : 48;
}

function chooseShowcaseLinearFallbackRange(record) {
  const length = Math.floor(Number(record?.length) || String(record?.sequence ?? "").length);
  if (!Number.isFinite(length) || length < 1) {
    return null;
  }
  const targetSpan = record?.alphabet === "protein" ? 80 : 90;
  return clampShowcaseWindow(1, Math.min(length, targetSpan), length);
}

function makeLinearShowcaseSnapshot(viewer, record) {
  const focusRange = chooseShowcaseFocusRange(record, showcaseViewerTargetSpan(record)) ||
    chooseShowcaseLinearFallbackRange(record);
  if (!focusRange) {
    return null;
  }
  return {
    title: record.title || "",
    length: record.length,
    viewStart: Math.max(0, focusRange.start - 1),
    viewEnd: focusRange.end,
    geneticCode: viewer?.geneticCode || record.geneticCode || "1",
    showSecondStrand: record.showSecondStrandDefault !== false,
    showForwardTranslations: record.showForwardTranslationsDefault !== false,
    showReverseTranslations: record.showReverseTranslationsDefault !== false,
    trackDisplayModes: []
  };
}

function makeCircularShowcaseSnapshot(viewer, record) {
  const focusRange = chooseShowcaseFocusRange(record, 72);
  if (!focusRange) {
    return null;
  }
  return {
    title: record.title || "",
    length: record.length,
    viewCenter: (focusRange.start + focusRange.end - 1) / 2,
    viewSpan: focusRange.end - focusRange.start + 1,
    gapCenterAngle: -Math.PI / 2,
    viewMoved: false,
    userRotated: false,
    geneticCode: viewer?.geneticCode || record.geneticCode || "1",
    showSecondStrand: record.showSecondStrandDefault !== false,
    showForwardTranslations: record.showForwardTranslationsDefault !== false,
    showReverseTranslations: record.showReverseTranslationsDefault !== false
  };
}

function scoreShowcaseViewerRecord(record, index) {
  const ranges = recordTrackRanges(record);
  const length = Math.floor(Number(record?.length) || String(record?.sequence ?? "").length);
  const labelledItems = (record?.tracks ?? []).reduce((count, track) =>
    count + (track?.items ?? []).filter((item) => item?.label || item?.name || item?.id || item?.enzyme).length,
  0);
  const nonPointRanges = ranges.filter((range) => range.end > range.start).length;
  const sequenceDetailBonus = String(record?.sequence ?? "").length > 0 ? 25 : 0;
  return ranges.length * 1000 +
    labelledItems * 80 +
    nonPointRanges * 120 +
    Math.min(Number.isFinite(length) ? length : 0, 500) +
    sequenceDetailBonus -
    index;
}

function makeShowcaseViewerPayload(viewer) {
  const records = Array.isArray(viewer?.records) ? viewer.records : [];
  if (records.length <= 1) {
    return viewer;
  }
  const best = records
    .map((record, index) => ({ record, score: scoreShowcaseViewerRecord(record, index) }))
    .sort((left, right) => right.score - left.score)[0]?.record;
  return {
    ...viewer,
    records: best ? [best] : records.slice(0, 1)
  };
}

function makeShowcaseViewerInitialState(viewer) {
  const records = Array.isArray(viewer?.records) ? viewer.records : [];
  const snapshots = records.map((record) =>
    viewer?.layout === "circular"
      ? makeCircularShowcaseSnapshot(viewer, record)
      : makeLinearShowcaseSnapshot(viewer, record)
  );
  return snapshots.some(Boolean) ? snapshots : undefined;
}

export function formatShowcaseItemTitle(toolName, outputLabel) {
  return `Tool: ${toolName} · Output: ${outputLabel}`;
}

export function formatShowcaseRunStatus(toolName, outputLabel, warningCount = 0) {
  const warnings = warningCount > 0 ? ` · Warnings: ${warningCount.toLocaleString()}` : "";
  return `Generated locally · Tool: ${toolName} · Output: ${outputLabel}${warnings}.`;
}

export function makeShowcaseItems({ tools, getDefaultOptionValues, compareToolCategories }) {
  return tools.flatMap((tool) => getShowcaseOutputs(tool.metadata).map((output) => ({
    id: `${tool.metadata.id}:${output.id}`,
    family: output.family,
    toolId: tool.metadata.id,
    title: formatShowcaseItemTitle(tool.metadata.name, output.label),
    summary: output.summary ?? `Generated from the bundled ${tool.metadata.name} example using the ${output.label} output.`,
    outputLabel: output.label,
    options: {
      ...getDefaultOptionValues(tool.metadata.options ?? []),
      ...(SHOWCASE_TOOL_OPTION_OVERRIDES.get(tool.metadata.id) ?? {}),
      ...(output.outputFormat === undefined ? {} : { outputFormat: output.outputFormat }),
      ...(output.options ?? {})
    }
  }))).sort((left, right) => {
    const leftTool = tools.find((tool) => tool.metadata.id === left.toolId);
    const rightTool = tools.find((tool) => tool.metadata.id === right.toolId);
    return compareToolCategories(leftTool?.metadata.category, rightTool?.metadata.category) ||
      String(leftTool?.metadata.name || left.toolId).localeCompare(String(rightTool?.metadata.name || right.toolId));
  });
}

function normalizeShowcaseFilterText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function makeShowcaseFilterText(item, tool) {
  return [
    tool?.metadata?.name,
    tool?.metadata?.category,
    tool?.metadata?.summary,
    tool?.metadata?.tags?.join(" "),
    item.title,
    item.summary,
    item.outputLabel
  ].filter(Boolean).join(" ").toLowerCase();
}

function makeShowcaseCategoryOptions(items, tools) {
  return [...new Set(items.map((item) =>
    tools.find((tool) => tool.metadata.id === item.toolId)?.metadata.category || "SMS3 tool"
  ))].sort((left, right) => left.localeCompare(right));
}

function makeShowcaseFilters(showcaseItems, context) {
  const controls = document.createElement("div");
  controls.className = "showcase-filters";

  const searchLabel = document.createElement("label");
  searchLabel.className = "showcase-filter-field showcase-search-field";
  const searchText = document.createElement("span");
  searchText.textContent = "Search";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Find tools or outputs";
  searchInput.autocomplete = "off";
  searchLabel.append(searchText, searchInput);

  const categoryLabel = document.createElement("label");
  categoryLabel.className = "showcase-filter-field showcase-category-field";
  const categoryText = document.createElement("span");
  categoryText.textContent = "Category";
  const categorySelect = document.createElement("select");
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  categorySelect.append(allOption);
  for (const category of makeShowcaseCategoryOptions(showcaseItems, context.tools)) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.append(option);
  }
  categoryLabel.append(categoryText, categorySelect);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "showcase-clear-filter";
  clearButton.textContent = "Clear";
  clearButton.disabled = true;

  const count = document.createElement("span");
  count.className = "showcase-filter-count";
  count.setAttribute("aria-live", "polite");

  controls.append(searchLabel, categoryLabel, clearButton, count);
  return {
    controls,
    searchInput,
    categorySelect,
    clearButton,
    count
  };
}

function applyShowcaseFilters(filterControls, cards) {
  const query = normalizeShowcaseFilterText(filterControls.searchInput.value);
  const category = filterControls.categorySelect.value;
  let visibleCount = 0;
  for (const card of cards) {
    const visible = card._sms3ShowcaseFilters.some(member =>
      (!query || member.text.includes(query)) && (!category || member.category === category));
    card.hidden = !visible;
    if (visible) visibleCount += 1;
  }
  filterControls.clearButton.disabled = !query && !category;
  filterControls.count.textContent = `${visibleCount.toLocaleString()} of ${cards.length.toLocaleString()} output types`;
}

const SHOWCASE_ZOOM_HINT_SELECTOR = [
  ".orf-explorer-map",
  ".dna-viewer-canvas",
  ".sanger-trace-canvas",
  ".protein-structure-canvas-host",
  ".sms3-tree-viewer"
].join(", ");

export function showcasePreviewSupportsZoomHint(preview) {
  return Boolean(preview?.querySelector?.(SHOWCASE_ZOOM_HINT_SELECTOR));
}

export function installShowcaseWheelIntentGuard(preview) {
  const handleWheel = (event) => {
    if (event.ctrlKey || event.metaKey) return;
    event.stopPropagation();
  };
  preview.addEventListener("wheel", handleWheel, { capture: true, passive: true });
  return () => preview.removeEventListener("wheel", handleWheel, { capture: true });
}

function renderShowcaseViewer(preview, viewer, context) {
  if (viewer?.viewerType === "orf-explorer") return renderOrfExplorer(preview, viewer);
  const showcaseViewer = makeShowcaseViewerPayload(viewer);
  const viewerOptions = {
    preserveState: false,
    embedded: true,
    compactPreview: true,
    showInspectorPanels: true,
    initialState: makeShowcaseViewerInitialState(showcaseViewer)
  };
  if (showcaseViewer?.viewerType === "protein-sequence-viewer") {
    context.renderProteinViewer?.(preview, showcaseViewer, viewerOptions);
  } else if (showcaseViewer?.layout === "circular") {
    context.renderCircularDnaViewer?.(preview, showcaseViewer, viewerOptions);
  } else {
    context.renderDnaViewer?.(preview, showcaseViewer, viewerOptions);
  }
}

function disposeShowcasePreview(preview) {
  for (const key of ["_sms3InspectionCleanup", "_sms3VisualCleanup", "_sms3ShowcaseWheelCleanup"]) {
    preview[key]?.();
    preview[key] = null;
  }
}

async function renderShowcaseCard(card, item, token, generation, context) {
  const tool = context.tools.find((candidate) => candidate.metadata.id === item.toolId);
  const preview = card.querySelector(".showcase-preview");
  const status = card.querySelector(".showcase-run-status");
  if (!tool || !preview || !status) {
    return;
  }

  const isCurrent = () => !token.cancelled && context.state.showcaseRenderToken === token && card._sms3ShowcaseGeneration === generation;
  card.dataset.showcaseState = "rendering";
  try {
    // Keep this interactive preview small before analysis and rendering. The
    // ORF Finder itself retains the complete multi-record bundled example.
    const example = tool.metadata.id === "orf-finder"
      ? (tool.example ?? "").split(/\n(?=>)/, 1)[0] : tool.example ?? "";
    const result = await context.runTool(tool, example, item.options ?? {});
    if (!isCurrent()) {
      return;
    }
    preview._sms3InspectionCleanup?.();
    preview._sms3VisualCleanup?.();
    preview._sms3VisualCleanup = null;
    preview.textContent = "";
    preview.classList.remove("showcase-preview-viewer");
    const plotPreview = result.visual?.renderer === "observable-plot"
      ? renderObservablePlotPreview(result.visual.plotSpec)
      : null;
    const svg = result.visual?.svg ?? (String(result.output ?? "").trimStart().startsWith("<svg") ? result.output : "");
    let sharedInspection = false;
    if (result.visual?.alignedSequence) {
      preview.classList.add("showcase-preview-viewer");
      await renderAlignedSequenceViewer(preview,result.visual.alignedSequence,undefined,{preview:true});
    } else if (result.visual?.graphicEditor) {
      preview.classList.add("showcase-preview-viewer");
      const document = await makeShowcaseGraphicDocument(result.visual.graphicEditor);
      if (!isCurrent()) return;
      await renderGraphicEditor(preview,document.source,document,{preview:true});
    } else if (result.visual?.textTableImage) {
      preview.classList.add("showcase-preview-viewer");
      const document = await makeShowcaseTextImageDocument(result.visual.textTableImage);
      if (!isCurrent()) return;
      await renderTextTableImage(preview, result.visual.textTableImage, document, { preview: true });
    } else if (result.visual?.plateLayout) {
      preview.insertAdjacentHTML("beforeend", renderPlateSvg(result.visual.plateLayout.layout));
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
      sharedInspection = true;
    } else if (result.visual?.treeViewer) {
      preview.classList.add("showcase-preview-viewer");
      const preset = await makeShowcaseTreeViewerPreset(item, result.visual.treeViewer);
      if (!isCurrent()) return;
      renderTreeViewer(preview, preset, undefined, { preview: true });
    } else if (plotPreview) {
      preview.append(plotPreview);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
      sharedInspection = true;
    } else if (result.visual?.sangerPlot) {
      renderSangerPlotControls(preview, result.visual.sangerPlot, svg);
    } else if (svg) {
      preview.insertAdjacentHTML("beforeend", svg);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
      sharedInspection = true;
    } else if (result.visual?.sequenceExtractor) {
      preview.classList.add("showcase-preview-viewer");
      await renderSequenceExtractorWorkspace(preview, result.visual.sequenceExtractor);
    } else if (result.visual?.sangerTrace) {
      preview.classList.add("showcase-preview-viewer");
      renderSangerTraceViewer(preview, result.visual.sangerTrace);
    } else if (result.visual?.sequenceEditor) {
      preview.classList.add("showcase-preview-viewer");
      renderSequenceEditorOutput(preview, result.visual.sequenceEditor, null, { initialViewerSpan: 48 });
    } else if (result.visual?.viewer) {
      preview.classList.add("showcase-preview-viewer");
      renderShowcaseViewer(preview, result.visual.viewer, context);
    } else if (result.visual?.proteinStructure) {
      preview.classList.add("showcase-preview-viewer");
      context.renderProteinStructureViewer?.(preview, result.visual.proteinStructure);
    } else if (result.visual?.proteinFigure) {
      renderProteinSequenceFigure(preview, result.visual.proteinFigure);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
      sharedInspection = true;
    } else if (result.visual?.sequenceLogo) {
      renderSequenceLogo(preview, result.visual.sequenceLogo);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
      sharedInspection = true;
    } else if (result.visual?.figure) {
      context.renderGenomeFigure(preview, result.visual.figure);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
      sharedInspection = true;
    } else {
      const pre = document.createElement("pre");
      pre.textContent = String(result.output ?? "").slice(0, 1600);
      preview.append(pre);
    }
    if (!isCurrent()) {
      disposeShowcasePreview(preview);
      return;
    }
    card._sms3ShowcaseZoomHint?.setAvailable(showcasePreviewSupportsZoomHint(preview));
    if (sharedInspection) installVisualInspection(preview);
    const warningCount = result.warnings?.length ?? 0;
    status.textContent = formatShowcaseRunStatus(tool.metadata.name, item.outputLabel, warningCount);
    status.classList.remove("error");
  } catch (error) {
    if (!isCurrent()) {
      disposeShowcasePreview(preview);
      return;
    }
    disposeShowcasePreview(preview);
    preview.textContent = "";
    preview.append(makeShowcaseStatus(error.message || "Preview generation failed.", "error"));
    card._sms3ShowcaseZoomHint?.setAvailable(false);
    status.textContent = "Preview generation failed.";
    status.classList.add("error");
  } finally {
    if (isCurrent()) {
      card.dataset.showcaseState = status.classList.contains("error") ? "error" : "complete";
      preview.removeAttribute("aria-busy");
      requestAnimationFrame(() => { preview.style.minHeight = ""; });
    }
  }
}

export function appendShowcase(topic, context) {
  context.container._sms3ShowcaseCleanup?.();
  const token = {};
  context.state.showcaseRenderToken = token;
  const eventController = new AbortController();
  const grid = document.createElement("div");
  grid.className = "showcase-grid";
  const showcaseItems = makeShowcaseItems(context);
  const groups = groupShowcaseItems(showcaseItems, context.tools, context.compareToolCategories);
  const filterControls = makeShowcaseFilters(showcaseItems, context);
  const renderQueue = [];
  const cards = [];
  const zoomHintEntries = [];

  let rendering = false;
  const drainQueue = async () => {
    if (rendering) return;
    rendering = true;
    try {
      while (renderQueue.length && !token.cancelled && context.state.showcaseRenderToken === token) {
        // Prioritize requested examples, then previews matching the current filter.
        let next = renderQueue.findIndex(entry => entry.requested);
        if (next < 0) next = renderQueue.findIndex(entry => !entry.card.hidden);
        const [entry] = renderQueue.splice(Math.max(0, next), 1);
        await renderShowcaseCard(entry.card, entry.item, token, entry.generation, context);
      }
    } finally {
      rendering = false;
    }
  };

  for (const group of groups) {
    const card = document.createElement("article");
    card.className = "showcase-card";
    card.dataset.showcaseFamily = group.id;
    card.dataset.showcaseMembers = group.items.map(item => item.id).join(" ");
    card._sms3ShowcaseFilters = group.items.map(item => {
      const tool = context.tools.find(candidate => candidate.metadata.id === item.toolId);
      return { category: tool?.metadata.category, text: `${group.title} ${makeShowcaseFilterText(item, tool)}`.toLowerCase() };
    });

    const header = document.createElement("div");
    header.className = "showcase-card-header";
    const headingGroup = document.createElement("div");
    headingGroup.className = "showcase-card-title";
    const category = document.createElement("span");
    category.className = "showcase-card-category";
    category.textContent = group.categories.join(" · ");
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    headingGroup.append(category, heading);
    header.append(headingGroup);

    const producers = document.createElement("div");
    producers.className = "showcase-producers";
    const producerLabel = document.createElement("span");
    producerLabel.textContent = "Available in";
    const producerList = document.createElement("ul");
    for (const tool of group.producers) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#tool=${encodeURIComponent(tool.metadata.id)}`;
      link.textContent = tool.metadata.name;
      link.addEventListener("click", event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        context.selectTool(tool);
      });
      li.append(link);
      producerList.append(li);
    }
    producers.append(producerLabel, producerList);

    const source = group.items.length === 1 ? document.createElement("h4") : null;
    if (source) source.className = "showcase-example-source";
    const exampleLabel = document.createElement("label");
    exampleLabel.className = "showcase-filter-field showcase-example-field";
    const exampleText = document.createElement("span");
    exampleText.textContent = "Example";
    const exampleSelect = document.createElement("select");
    for (const item of group.items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.title;
      exampleSelect.append(option);
    }
    exampleSelect.value = group.representative.id;
    exampleLabel.append(exampleText, exampleSelect);
    exampleLabel.hidden = group.items.length === 1;

    const previewGuidance = document.createElement("div");
    previewGuidance.className = "showcase-preview-guidance";
    previewGuidance.hidden = true;
    const zoomHint = document.createElement("div");
    zoomHint.className = "showcase-zoom-hint";
    zoomHint.id = `showcase-zoom-hint-${group.id}`;
    previewGuidance.append(zoomHint);

    const preview = document.createElement("div");
    preview.className = "showcase-preview";
    const zoomHintEntry = {
      preview,
      setAvailable(available) {
        this.cleanupHint?.();
        this.cleanupHint = null;
        previewGuidance.hidden = !available;
        if (available) {
          this.preview.setAttribute("role", "group");
          this.preview.setAttribute("aria-label", `${group.title} preview`);
          this.preview.setAttribute("aria-describedby", zoomHint.id);
          this.cleanupHint = installShowcaseZoomHint(this.preview, zoomHint);
        }
      }
    };
    zoomHintEntries.push(zoomHintEntry);
    card._sms3ShowcaseZoomHint = zoomHintEntry;
    const status = makeShowcaseStatus("", "showcase-run-status");
    card.append(header, producers, exampleLabel);
    if (source) card.append(source);
    card.append(previewGuidance, preview, status);
    grid.append(card);
    cards.push(card);

    const queueExample = (item, requested = false) => {
      const previous = zoomHintEntry.preview;
      zoomHintEntry.setAvailable(false);
      const height = previous.getBoundingClientRect().height;
      disposeShowcasePreview(previous);
      const next = document.createElement("div");
      next.className = "showcase-preview";
      if (height) next.style.minHeight = `${height}px`;
      next.setAttribute("aria-busy", "true");
      next.append(makeShowcaseStatus("Generating preview from current tool code..."));
      next._sms3ShowcaseWheelCleanup = installShowcaseWheelIntentGuard(next);
      previous.replaceWith(next);
      zoomHintEntry.preview = next;
      const generation = (card._sms3ShowcaseGeneration ?? 0) + 1;
      card._sms3ShowcaseGeneration = generation;
      card.dataset.showcaseExample = item.id;
      card.dataset.showcaseState = "queued";
      if (source) source.textContent = item.title;
      status.textContent = `Queued ${item.title}.`;
      status.classList.remove("error");
      const pending = renderQueue.findIndex(entry => entry.card === card);
      if (pending >= 0) renderQueue.splice(pending, 1);
      renderQueue.push({ card, item, generation, requested });
      if (requested) void drainQueue();
    };
    exampleSelect.addEventListener("change", () => {
      queueExample(group.items.find(item => item.id === exampleSelect.value), true);
    }, { signal: eventController.signal });
    queueExample(group.representative);
  }

  context.container._sms3ShowcaseCleanup = () => {
    token.cancelled = true;
    renderQueue.length = 0;
    eventController.abort();
    for (const entry of zoomHintEntries) {
      entry.cleanupHint?.();
      disposeShowcasePreview(entry.preview);
    }
    context.container._sms3ShowcaseCleanup = null;
  };

  for (const eventName of ["input", "change"]) {
    filterControls.searchInput.addEventListener(eventName, () => applyShowcaseFilters(filterControls, cards));
  }
  filterControls.categorySelect.addEventListener("change", () => applyShowcaseFilters(filterControls, cards));
  filterControls.clearButton.addEventListener("click", () => {
    filterControls.searchInput.value = "";
    filterControls.categorySelect.value = "";
    applyShowcaseFilters(filterControls, cards);
    filterControls.searchInput.focus();
  });
  applyShowcaseFilters(filterControls, cards);

  context.container.append(filterControls.controls);
  context.container.append(grid);
  context.appendTopicNotesAndCitations(topic);
  void drainQueue();
}
