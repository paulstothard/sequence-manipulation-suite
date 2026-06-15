import { renderObservablePlotPreview } from "./plot-preview-ui.js";
import { alignmentViewerReferenceExample } from "../examples/alignment-viewer-example.js";
import { vcfExtractorReferenceExample } from "../examples/vcf-extractor-example.js";

const SHOWCASE_VISUAL_INCLUDE = /\b(plot|map|gel|figure|heatmap|cloud|sankey|venn|upset|tree|chromatogram|diagram|poster)\b|\bcolored alignment\b|\bdot plot\b|svg/i;
const SHOWCASE_VIEWER_INCLUDE = /\bviewer\b|\binteractive-viewer\b/i;
const SHOWCASE_VISUAL_EXCLUDE = /\b(json|table|report|text|fasta|fastq|tsv|csv|xlsx|records?|summary)\b/i;
const SHOWCASE_VIEWER_ALLOWLIST = new Map([
  ["alignment-viewer", new Set(["interactive-viewer"])],
  ["circular-dna-sequence-viewer", new Set(["interactive-viewer"])],
  ["dna-sequence-viewer", new Set(["interactive-viewer"])],
  ["protein-conservation-structure-viewer", new Set(["interactive-viewer"])],
  ["protein-sequence-viewer", new Set(["interactive-viewer"])],
  ["protein-structure-viewer", new Set(["interactive-viewer"])],
  ["read-mapping-coverage", new Set(["interactive-viewer"])],
  ["sam-bam-summary-region-viewer", new Set(["interactive-viewer"])],
  ["vcf-genotype-table", new Set(["interactive-viewer"])]
]);
const SHOWCASE_TOOL_OPTION_OVERRIDES = new Map([
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

function getShowcaseOutputOption(metadata, flattenOptions) {
  return flattenOptions(metadata.options ?? []).find((option) => option.id === "outputFormat");
}

function isShowcaseVisualChoice(tool, choice) {
  const text = `${choice?.label ?? ""} ${choice?.value ?? ""}`;
  if (SHOWCASE_VISUAL_EXCLUDE.test(text)) {
    return false;
  }
  const viewerChoice = SHOWCASE_VIEWER_INCLUDE.test(text);
  if (viewerChoice) {
    return SHOWCASE_VIEWER_ALLOWLIST.get(tool?.metadata?.id)?.has(choice?.value) === true;
  }
  if (SHOWCASE_VISUAL_INCLUDE.test(text)) {
    return true;
  }
  return false;
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
  const detailSpan = widestRange <= 2 && !alignedReadDetails ? Math.max(targetSpan, 72) : targetSpan;
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
  if (record?.alphabet === "protein") {
    return 70;
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

function makeShowcaseItems({ tools, flattenOptions, getDefaultOptionValues, compareToolCategories }) {
  return tools.flatMap((tool) => {
    const outputOption = getShowcaseOutputOption(tool.metadata, flattenOptions);
    const toolOptionOverrides = SHOWCASE_TOOL_OPTION_OVERRIDES.get(tool.metadata.id) ?? {};
    return (outputOption?.choices ?? [])
      .filter((choice) => isShowcaseVisualChoice(tool, choice))
      .map((choice) => {
        const options = {
          ...getDefaultOptionValues(tool.metadata.options ?? []),
          ...toolOptionOverrides,
          [outputOption.id]: choice.value
        };
        return {
          id: `${tool.metadata.id}:${choice.value}`,
          toolId: tool.metadata.id,
          title: `${tool.metadata.name}: ${choice.label}`,
          summary: `Generated from the bundled ${tool.metadata.name} example using the ${choice.label} output.`,
          outputLabel: choice.label,
          options
        };
      });
  }).sort((left, right) => {
    const leftTool = tools.find((tool) => tool.metadata.id === left.toolId);
    const rightTool = tools.find((tool) => tool.metadata.id === right.toolId);
    return compareToolCategories(leftTool?.metadata.category, rightTool?.metadata.category) ||
      String(leftTool?.metadata.name || left.toolId).localeCompare(String(rightTool?.metadata.name || right.toolId)) ||
      left.title.localeCompare(right.title);
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
    const matchesQuery = !query || card.dataset.showcaseFilterText?.includes(query);
    const matchesCategory = !category || card.dataset.showcaseCategory === category;
    const visible = Boolean(matchesQuery && matchesCategory);
    card.hidden = !visible;
    if (visible) visibleCount += 1;
  }
  filterControls.clearButton.disabled = !query && !category;
  filterControls.count.textContent = `${visibleCount.toLocaleString()} of ${cards.length.toLocaleString()} previews`;
}

function renderShowcaseViewer(preview, viewer, context) {
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

async function renderShowcaseCard(card, item, token, context) {
  const tool = context.tools.find((candidate) => candidate.metadata.id === item.toolId);
  const preview = card.querySelector(".showcase-preview");
  const status = card.querySelector(".showcase-run-status");
  if (!tool || !preview || !status) {
    return;
  }

  try {
    const result = await context.runTool(tool, tool.example ?? "", item.options ?? {});
    if (context.state.showcaseRenderToken !== token) {
      return;
    }
    preview.textContent = "";
    preview.classList.remove("showcase-preview-viewer");
    const plotPreview = result.visual?.renderer === "observable-plot"
      ? renderObservablePlotPreview(result.visual.plotSpec)
      : null;
    const svg = result.visual?.svg ?? (String(result.output ?? "").trimStart().startsWith("<svg") ? result.output : "");
    if (plotPreview) {
      preview.append(plotPreview);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
    } else if (svg) {
      preview.insertAdjacentHTML("beforeend", svg);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
    } else if (result.visual?.viewer) {
      preview.classList.add("showcase-preview-viewer");
      renderShowcaseViewer(preview, result.visual.viewer, context);
    } else if (result.visual?.proteinStructure) {
      preview.classList.add("showcase-preview-viewer");
      context.renderProteinStructureViewer?.(preview, result.visual.proteinStructure);
    } else if (result.visual?.figure) {
      context.renderGenomeFigure(preview, result.visual.figure);
      preview.querySelectorAll("svg").forEach(normalizeShowcaseSvg);
    } else {
      const pre = document.createElement("pre");
      pre.textContent = String(result.output ?? "").slice(0, 1600);
      preview.append(pre);
    }
    const warningCount = result.warnings?.length ?? 0;
    status.textContent = warningCount
      ? `Generated from ${tool.metadata.name}; ${item.outputLabel}; ${warningCount} warning(s).`
      : `Generated from ${tool.metadata.name}; ${item.outputLabel}.`;
    status.classList.remove("error");
  } catch (error) {
    if (context.state.showcaseRenderToken !== token) {
      return;
    }
    preview.textContent = "";
    preview.append(makeShowcaseStatus(error.message || "Preview generation failed.", "error"));
    status.textContent = "Preview generation failed.";
    status.classList.add("error");
  }
}

export function appendShowcase(topic, context) {
  const token = {};
  context.state.showcaseRenderToken = token;
  const grid = document.createElement("div");
  grid.className = "showcase-grid";
  const showcaseItems = makeShowcaseItems(context);
  const filterControls = makeShowcaseFilters(showcaseItems, context);
  const renderQueue = [];
  const cards = [];

  for (const item of showcaseItems) {
    const tool = context.tools.find((candidate) => candidate.metadata.id === item.toolId);
    const card = document.createElement("article");
    card.className = "showcase-card";
    card.dataset.showcaseCategory = tool?.metadata.category ?? "SMS3 tool";
    card.dataset.showcaseFilterText = makeShowcaseFilterText(item, tool);

    const header = document.createElement("div");
    header.className = "showcase-card-header";
    const headingGroup = document.createElement("div");
    headingGroup.className = "showcase-card-title";
    const category = document.createElement("span");
    category.className = "showcase-card-category";
    category.textContent = tool?.metadata.category ?? "SMS3 tool";
    const heading = document.createElement("h3");
    heading.textContent = item.title;
    headingGroup.append(category, heading);
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = tool ? `Open ${tool.metadata.name}` : "Tool unavailable";
    openButton.disabled = !tool;
    openButton.addEventListener("click", () => {
      if (tool) {
        context.selectTool(tool);
      }
    });
    header.append(headingGroup, openButton);

    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = item.summary;

    const preview = document.createElement("div");
    preview.className = "showcase-preview";
    preview.append(makeShowcaseStatus("Generating preview from current tool code..."));

    const status = makeShowcaseStatus(
      tool ? `Queued ${tool.metadata.name}.` : "Tool is not registered.",
      tool ? "showcase-run-status" : "showcase-run-status error"
    );

    card.append(header, summary, preview, status);
    grid.append(card);
    cards.push(card);

    if (tool) {
      renderQueue.push({ card, item });
    }
  }

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
  void (async () => {
    for (const entry of renderQueue) {
      if (context.state.showcaseRenderToken !== token) {
        return;
      }
      await renderShowcaseCard(entry.card, entry.item, token, context);
    }
  })();
}
