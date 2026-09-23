import { parseInspectionTooltipText } from "../core/inspection-tooltip-layout.js";

const TITLE_MARK_ATTRIBUTE = "data-sms3-title-mark";
const ACTIVE_ATTRIBUTE = "data-sms3-inspection-active";
const NEARBY_ATTRIBUTE = "data-sms3-inspection-nearby";
const HIGHLIGHT_POLICY_ATTRIBUTE = "data-sms3-inspection-highlight";
const SHADE_STYLE_ATTRIBUTE = "data-sms3-inspection-shade-style";
const GLOW_STYLE_ATTRIBUTE = "data-sms3-inspection-glow-style";
const PLOT_SVG_SELECTOR = "svg:is([data-plot-foundation], [data-plot-backend], [data-plot-renderer])";
const GENOME_POSTER_SELECTOR = "svg.sms3-genome-comparison-poster";
const PLOT_OUTLINE_ATTRIBUTE = "data-sms3-inspection-outline";
const CONTRAST_PROPERTY = "--sms3-inspection-contrast";
const PLOT_STROKE_PROPERTY = "--sms3-inspection-plot-stroke-width";
const PLOT_HALO_PROPERTY = "--sms3-inspection-plot-halo-width";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const EXPLICIT_MARK_SELECTOR = [
  "[data-sms3-inspection-text]",
  "[data-alignment-column]",
  `[${TITLE_MARK_ATTRIBUTE}]`
].join(",");

let inspectionId = 0;
let inspectionGlowId = 0;
const MAX_KEYBOARD_TARGETS = 2000;
const MAX_NEARBY_LINE_MARKS = 400;
const NEARBY_LINE_HIT_RADIUS = 6;
const NEAREST_POINT_SELECTOR = '[data-sms3-nearest-point="true"]';
const NEAREST_POINT_HIT_RADIUS = 11;
const NEAREST_POINT_HYSTERESIS = 2;
const NEAREST_POINT_GRID_SIZE = 16;
const SHADED_MARK_SELECTOR = [
  `${PLOT_SVG_SELECTOR}:is([data-sms3-plot-kind="categorical-bar-plot"], [data-sms3-plot-kind="heatmap"]) rect[${TITLE_MARK_ATTRIBUTE}]`,
  'svg[data-sms3-plot="orf-overview"] rect:is(.complete, .partial)'
].join(",");

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function renderInspectionTooltip(tooltip, text) {
  if (tooltip._sms3InspectionText === text) return;
  const { sections } = parseInspectionTooltipText(text);
  const content = document.createElement("div");
  content.className = "visual-inspection-tooltip-content";
  for (const section of sections) {
    const row = document.createElement("div");
    row.className = section.kind === "heading"
      ? "visual-inspection-tooltip-heading"
      : `visual-inspection-tooltip-fact${section.parts ? "" : " is-note"}`;
    if (!section.parts && /^(?:[+-]|forward|reverse) strand$/i.test(section.text)) row.classList.add("is-strand");
    if (!section.parts && /^\d[\d,.]*\s*(?:bp|aa|reads?)$/i.test(section.text)) row.classList.add("is-measure");
    if (section.separator) {
      const separator = document.createElement("span");
      separator.className = "visual-inspection-tooltip-separator";
      separator.textContent = section.separator;
      row.append(separator);
    }
    if (section.parts) {
      const label = document.createElement("strong");
      label.className = "visual-inspection-tooltip-label";
      label.textContent = section.parts.label;
      const infix = document.createElement("span");
      infix.className = section.kind === "heading" ? "visual-inspection-tooltip-heading-infix" : "visual-inspection-tooltip-separator";
      infix.textContent = section.parts.infix;
      const value = document.createElement("span");
      value.className = "visual-inspection-tooltip-value";
      value.textContent = section.parts.value;
      row.append(label, infix, value);
    } else {
      const value = document.createElement(section.kind === "heading" ? "strong" : "span");
      value.className = "visual-inspection-tooltip-value";
      value.textContent = section.text;
      row.append(value);
    }
    content.append(row);
  }
  tooltip.replaceChildren(content);
  tooltip._sms3InspectionText = text;
}

function evenlyLimitedTargets(targets, limit = MAX_KEYBOARD_TARGETS) {
  const unique = [...new Set(targets)];
  if (unique.length <= limit) return unique;
  if (limit <= 1) return unique.slice(0, 1);
  return Array.from({ length: limit }, (_unused, index) =>
    unique[Math.round((index * (unique.length - 1)) / (limit - 1))]
  );
}

function directTitle(element) {
  return [...element.children].find((child) => child.tagName?.toLowerCase() === "title") ?? null;
}

function alignmentInspectionText(element) {
  const column = normalizedText(element.dataset.alignmentColumn);
  if (!column) return "";
  const row = element.closest("[data-alignment-row-label]");
  const label = normalizedText(row?.dataset.alignmentRowLabel) || "Sequence";
  const symbol = normalizedText(element.dataset.alignmentSymbol) || "symbol";
  const coordinate = normalizedText(element.dataset.sequenceCoordinate);
  const relation = normalizedText(element.dataset.alignmentRelation);
  const facts = [`${label}: ${symbol}`, `alignment column ${column}`];
  facts.push(coordinate === "gap" ? "gap in this sequence" : `sequence position ${coordinate}`);
  if (relation) facts.push(relation);
  return facts.join("; ");
}

export function getVisualInspectionText(element) {
  if (!(element instanceof Element)) return "";
  const explicit = normalizedText(element.dataset.sms3InspectionText);
  if (explicit) return explicit;
  const alignment = alignmentInspectionText(element);
  if (alignment) return alignment;
  return normalizedText(element.dataset.sms3TitleText ?? directTitle(element)?.textContent);
}

function isInteractiveMark(element) {
  return Boolean(element.closest("a,button,[role='button'],[role='link']"));
}

function joinTokens(existing, token) {
  return [...new Set(`${existing ?? ""} ${token}`.trim().split(/\s+/).filter(Boolean))].join(" ");
}

function removeToken(existing, token) {
  return String(existing ?? "").split(/\s+/).filter((value) => value && value !== token).join(" ");
}

function pointerPositionForElement(element) {
  const rect = element.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + Math.min(rect.height / 2, 18)
  };
}

function inspectionRgb(value) {
  const match = String(value ?? "").match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?/i);
  if (!match) return null;
  return {
    channels: match.slice(1, 4).map(Number),
    alpha: match[4] === undefined ? 1 : Number(match[4])
  };
}

function inspectionShadeColor(rgb, brightness, saturation) {
  const bright = rgb.channels.map((channel) => Math.min(255, channel * brightness));
  const gray = bright[0] * 0.2126 + bright[1] * 0.7152 + bright[2] * 0.0722;
  const channels = bright.map((channel) => Math.round(Math.max(0, Math.min(255, gray + (channel - gray) * saturation))));
  return `rgba(${channels.join(", ")}, ${rgb.alpha})`;
}

function applyInspectionShade(mark, originalFill) {
  if (!(mark instanceof SVGElement)) return;
  const filter = getComputedStyle(mark).filter;
  const match = /^brightness\(([\d.]+)\)(?:\s+saturate\(([\d.]+)\))?(.*)$/.exec(filter);
  const rgb = inspectionRgb(originalFill);
  if (!match || !rgb || rgb.alpha <= 0.01) return;
  const brightness = Number(match[1]);
  const saturation = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isFinite(brightness) || !Number.isFinite(saturation)) return;
  const original = {
    fill: [mark.style.getPropertyValue("fill"), mark.style.getPropertyPriority("fill")],
    filter: [mark.style.getPropertyValue("filter"), mark.style.getPropertyPriority("filter")]
  };
  mark.setAttribute(SHADE_STYLE_ATTRIBUTE, JSON.stringify(original));
  mark.style.setProperty("fill", inspectionShadeColor(rgb, brightness, saturation), "important");
  mark.style.setProperty("filter", match[3].trim() || "none", "important");
}

function restoreInspectionShade(mark) {
  const saved = mark?.getAttribute(SHADE_STYLE_ATTRIBUTE);
  if (!saved) return;
  const original = JSON.parse(saved);
  for (const property of ["fill", "filter"]) {
    const [value, priority] = original[property];
    if (value) mark.style.setProperty(property, value, priority);
    else mark.style.removeProperty(property);
  }
  mark.removeAttribute(SHADE_STYLE_ATTRIBUTE);
}

function applyInspectionGlow(mark) {
  if (!(mark instanceof SVGElement) || !getComputedStyle(mark).filter.includes("drop-shadow(")) return;
  const svg = mark.ownerSVGElement;
  if (!svg) return;
  const isOrf = Boolean(mark.closest('svg[data-sms3-plot="orf-overview"]'));
  const color = isOrf ? "#b7791f" : getComputedStyle(mark).getPropertyValue(CONTRAST_PROPERTY).trim() || "#0f172a";
  const id = `sms3-inspection-glow-${++inspectionGlowId}`;
  const defs = document.createElementNS(SVG_NAMESPACE, "defs");
  defs.setAttribute("data-sms3-inspection-glow-def", "");
  defs.innerHTML = `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${isOrf ? 3 : 1.5}" result="blur"/><feFlood flood-color="${color}" flood-opacity="${isOrf ? 0.5 : 0.75}" result="color"/><feComposite in="color" in2="blur" operator="in" result="halo"/><feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg.append(defs);
  mark.setAttribute(GLOW_STYLE_ATTRIBUTE, JSON.stringify({
    filter: [mark.style.getPropertyValue("filter"), mark.style.getPropertyPriority("filter")],
    id
  }));
  mark.style.setProperty("filter", `url(#${id})`, "important");
}

function restoreInspectionGlow(mark) {
  const saved = mark?.getAttribute(GLOW_STYLE_ATTRIBUTE);
  if (!saved) return;
  const { filter: [value, priority], id } = JSON.parse(saved);
  if (value) mark.style.setProperty("filter", value, priority);
  else mark.style.removeProperty("filter");
  mark.ownerSVGElement?.querySelector(`#${id}`)?.parentElement?.remove();
  mark.removeAttribute(GLOW_STYLE_ATTRIBUTE);
}

function inspectionLuminance(rgb) {
  const linear = rgb.map((component) => {
    const value = component / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function inspectionContrastRatio(left, right) {
  const a = inspectionLuminance(left);
  const b = inspectionLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function inspectionSurfaceRgb(mark) {
  const plotBackground = mark.closest(PLOT_SVG_SELECTOR)?.querySelector(":scope > rect");
  const plotColor = plotBackground && inspectionRgb(getComputedStyle(plotBackground).fill);
  if (plotColor?.alpha === 1) return plotColor.channels;
  const paper = mark.ownerSVGElement?.querySelector(".genome-figure-paper");
  const paperColor = paper && inspectionRgb(getComputedStyle(paper).fill);
  if (paperColor?.alpha === 1) return paperColor.channels;
  for (let element = mark.ownerSVGElement; element; element = element.parentElement) {
    const color = inspectionRgb(getComputedStyle(element).backgroundColor);
    if (color?.alpha === 1) return color.channels;
  }
  return document.documentElement.dataset.theme === "dark" ? [26, 32, 38] : [255, 255, 255];
}

function inspectionContrast(mark) {
  const style = getComputedStyle(mark);
  const tag = mark.tagName?.toLowerCase();
  const usesStroke = tag === "line" || tag === "polyline";
  const painted = inspectionRgb(usesStroke ? style.stroke : style.fill)
    ?? inspectionRgb(style.stroke);
  if (!painted) return "#0f172a";
  const isGenomePoster = Boolean(mark.closest(GENOME_POSTER_SELECTOR));
  if (mark.closest(PLOT_SVG_SELECTOR) && !isGenomePoster) {
    return inspectionLuminance(painted.channels) < 0.18 ? "#ffffff" : "#0f172a";
  }
  const surface = inspectionSurfaceRgb(mark);
  if (painted.alpha <= 0.01) {
    return inspectionLuminance(surface) < 0.18 ? "#67e8f9" : "#2563eb";
  }
  const opacity = Math.max(0, Math.min(1, painted.alpha * Number(style.opacity || 1) * Number(usesStroke ? style.strokeOpacity || 1 : style.fillOpacity || 1)));
  const fill = painted.channels.map((component, index) => component * opacity + surface[index] * (1 - opacity));
  const candidates = [
    { color: "#0f172a", rgb: [15, 23, 42] },
    { color: "#ffffff", rgb: [255, 255, 255] },
    { color: "#f59e0b", rgb: [245, 158, 11] }
  ];
  if (isGenomePoster) candidates.push({ color: "#2563eb", rgb: [37, 99, 235] });
  return candidates.reduce((best, candidate) => {
    const score = Math.min(
      inspectionContrastRatio(candidate.rgb, fill),
      inspectionContrastRatio(candidate.rgb, surface)
    );
    return score > best.score ? { color: candidate.color, score } : best;
  }, { color: "#0f172a", score: -1 }).color;
}

export function installVisualInspection(container, {
  allowPin = true,
  includeSvgTitles = true
} = {}) {
  if (!(container instanceof HTMLElement)) return () => {};
  container._sms3InspectionCleanup?.();

  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };
  const titleStates = new Map();
  const svgStates = new Map();
  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
        if (highlightedMark?.isConnected) showPlotOutline(highlightedMark);
      })
    : null;
  const id = `sms3-visual-inspection-${++inspectionId}`;
  const tooltip = document.createElement("div");
  tooltip.id = `${id}-tooltip`;
  tooltip.className = "visual-inspection-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  const liveStatus = document.createElement("div");
  liveStatus.className = "visually-hidden";
  liveStatus.setAttribute("role", "status");
  liveStatus.setAttribute("aria-live", "polite");
  const instructions = document.createElement("span");
  instructions.id = `${id}-instructions`;
  instructions.className = "visually-hidden";
  instructions.textContent = allowPin
    ? "Use Left and Right Arrow keys to inspect chart items. Press Enter or tap to pin details and Escape to dismiss them."
    : "Hover or focus a chart item to inspect its details.";
  container.append(tooltip, liveStatus, instructions);

  let activeMark = null;
  let activeSource = null;
  let pinnedMark = null;
  let keyboardIndex = -1;
  let pointerFrame = 0;
  let pendingPointer = null;
  let lastPointerPosition = null;
  let keyboardPointerAnchor = null;

  function cancelPendingPointerInspection() {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
  }

  function prepareTitle(title) {
    const mark = title.parentElement;
    const text = normalizedText(title.textContent);
    if (!mark || mark.tagName?.toLowerCase() === "svg" || !text || titleStates.has(title)) return;
    titleStates.set(title, text);
    mark.dataset.sms3TitleText = text;
    mark.setAttribute(TITLE_MARK_ATTRIBUTE, "");
    const tag = mark.tagName?.toLowerCase();
    if (tag === "line") {
      mark.setAttribute(NEARBY_ATTRIBUTE, "line");
    } else if (["rect", "circle", "ellipse", "path", "polygon", "polyline"].includes(tag)) {
      try {
        const box = mark.getBBox();
        if (box.width < 1 || box.height < 1) mark.setAttribute(NEARBY_ATTRIBUTE, "degenerate");
      } catch {
        // Some detached SVG engines do not expose geometry until the next frame.
      }
    }
    title.textContent = "";
  }

  function prepareSvg(svg) {
    if (svgStates.has(svg)) return;
    const state = {
      tabindex: svg.getAttribute("tabindex"),
      describedBy: svg.getAttribute("aria-describedby"),
      keyShortcuts: svg.getAttribute("aria-keyshortcuts"),
      nearestPointIndex: null,
      circlesByTitle: null,
      outlines: new Map()
    };
    svgStates.set(svg, state);
    if (svg.matches(PLOT_SVG_SELECTOR)) resizeObserver?.observe(svg);
    const hasFocusableMarks = Boolean(svg.querySelector("[tabindex],a,button,[role='button'],[role='link']"));
    if (!svg.hasAttribute("tabindex") && !hasFocusableMarks) svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-describedby", joinTokens(state.describedBy, instructions.id));
    if (!hasFocusableMarks) {
      svg.setAttribute("aria-keyshortcuts", allowPin
        ? "ArrowLeft ArrowRight Home End Enter Escape"
        : "ArrowLeft ArrowRight Home End Escape");
    }
    if (svg.matches(PLOT_SVG_SELECTOR) && !svg.matches(GENOME_POSTER_SELECTOR) && svg.getAttribute(HIGHLIGHT_POLICY_ATTRIBUTE) !== "none") {
      for (const tag of ["rect", "circle"]) {
        const outline = document.createElementNS(SVG_NAMESPACE, tag);
        outline.setAttribute(PLOT_OUTLINE_ATTRIBUTE, "");
        outline.setAttribute("aria-hidden", "true");
        outline.setAttribute("pointer-events", "none");
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke-width", tag === "circle" ? "1.5" : "1.25");
        outline.setAttribute("stroke-linejoin", "round");
        outline.setAttribute("vector-effect", "non-scaling-stroke");
        outline.setAttribute("shape-rendering", "geometricPrecision");
        outline.setAttribute("visibility", "hidden");
        svg.append(outline);
        state.outlines.set(tag, outline);
      }
    }
  }

  function inspectionScreenScale(matrix) {
    return Math.max(0.001, Math.min(
      Math.hypot(matrix.a, matrix.b),
      Math.hypot(matrix.c, matrix.d)
    ));
  }

  function showPlotOutline(mark) {
    const svg = mark.closest(PLOT_SVG_SELECTOR);
    if (!svg || svg.matches(GENOME_POSTER_SELECTOR)) return;
    const highlightPolicy = mark.getAttribute(HIGHLIGHT_POLICY_ATTRIBUTE);
    if (highlightPolicy === "glow" || highlightPolicy === "shade") return;
    // Dense bars and cells read more clearly when their own paint changes.
    // A second outlined shape can cover neighboring marks.
    if (mark.matches(SHADED_MARK_SELECTOR)) return;
    const state = svgStates.get(svg);
    const tag = mark.tagName?.toLowerCase();
    let geometryMark = mark;
    if (tag === "path" && getComputedStyle(mark).fill === "none") {
      if (!state?.circlesByTitle) {
        state.circlesByTitle = new Map();
        for (const circle of svg.querySelectorAll(`circle[${TITLE_MARK_ATTRIBUTE}]`)) {
          const title = getVisualInspectionText(circle);
          // Reused labels cannot safely identify the point that owns a line segment.
          state.circlesByTitle.set(title, state.circlesByTitle.has(title) ? null : circle);
        }
      }
      geometryMark = state.circlesByTitle.get(getVisualInspectionText(mark)) ?? mark;
    }
    const pointHit = tag === "rect" && mark.hasAttribute("data-sms3-point-x") && mark.hasAttribute("data-sms3-point-y");
    const outlineTag = pointHit || geometryMark.tagName?.toLowerCase() === "circle" ? "circle" : tag;
    const markMatrix = geometryMark.getScreenCTM?.();
    if (!markMatrix) return;
    const scale = inspectionScreenScale(markMatrix);
    mark.style.setProperty(PLOT_STROKE_PROPERTY, `${Math.max(1, 1.25 * scale)}px`);
    mark.style.setProperty(PLOT_HALO_PROPERTY, `${Math.max(0.8, 1.5 * scale)}px`);
    const outline = state?.outlines.get(outlineTag);
    if (!outline) return;
    const svgMatrix = svg.getScreenCTM?.();
    if (!svgMatrix) return;
    const strokeWidth = Math.max(1, (outlineTag === "circle" ? 1.5 : 1.25) * scale);
    outline.setAttribute("stroke-width", String(strokeWidth));
    let box;
    try {
      box = geometryMark.getBBox();
    } catch {
      return;
    }
    const transform = svgMatrix.inverse().multiply(markMatrix);
    outline.setAttribute("transform", `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f})`);
    if (outlineTag === "circle") {
      const cx = pointHit ? Number(mark.dataset.sms3PointX) : Number(geometryMark.getAttribute("cx"));
      const cy = pointHit ? Number(mark.dataset.sms3PointY) : Number(geometryMark.getAttribute("cy"));
      const radius = pointHit ? 0 : Number(geometryMark.getAttribute("r"));
      if (![cx, cy, radius].every(Number.isFinite)) return;
      outline.setAttribute("cx", String(cx));
      outline.setAttribute("cy", String(cy));
      const visibleRadius = radius * scale;
      // Match the rendered point; only tiny or invisible marks need a screen-pixel floor.
      const ringRadius = pointHit
        ? Math.max(4.5, Math.min(box.width, box.height) * scale * 0.45)
        : Math.max(2.5, visibleRadius + Math.max(0.85, visibleRadius * 0.3));
      outline.setAttribute("r", String(ringRadius / scale));
      outline.setAttribute("stroke", inspectionLuminance(inspectionSurfaceRgb(geometryMark)) < 0.18 ? "#ffffff" : "#0f172a");
      outline.setAttribute("visibility", "visible");
      return;
    }
    if (tag === "rect") {
      const scaleX = Math.hypot(markMatrix.a, markMatrix.b);
      const scaleY = Math.hypot(markMatrix.c, markMatrix.d);
      if (!scaleX || !scaleY || box.width * scaleX < 3 || box.height * scaleY < 3) return;
      // Inset the complete non-scaling stroke inside bars that meet a plot edge.
      const inset = Math.max(0.7, strokeWidth / 2 + 0.25);
      const insetX = inset / scaleX;
      const insetY = inset / scaleY;
      const width = box.width - 2 * insetX;
      const height = box.height - 2 * insetY;
      if (width <= 0 || height <= 0) return;
      outline.setAttribute("x", String(box.x + insetX));
      outline.setAttribute("y", String(box.y + insetY));
      outline.setAttribute("width", String(width));
      outline.setAttribute("height", String(height));
      const radiusX = Number(mark.getAttribute("rx") ?? 0);
      const radiusY = Number(mark.getAttribute("ry") ?? radiusX);
      outline.setAttribute("rx", String(Math.max(0, radiusX - insetX)));
      outline.setAttribute("ry", String(Math.max(0, radiusY - insetY)));
    } else if (tag === "path") {
      outline.setAttribute("d", mark.getAttribute("d") ?? "");
    } else if (tag === "polygon") {
      outline.setAttribute("points", mark.getAttribute("points") ?? "");
    }
    outline.setAttribute("stroke", inspectionContrast(mark));
    outline.setAttribute("visibility", "visible");
  }

  function prepareNearestPointIndex(svg) {
    const state = svgStates.get(svg);
    if (!state || state.nearestPointIndex) return;
    const marks = [...svg.querySelectorAll(NEAREST_POINT_SELECTOR)];
    if (marks.length === 0) {
      state.nearestPointIndex = { grid: new Map(), count: 0 };
      return;
    }
    const grid = new Map();
    const svgScreenMatrix = svg.getScreenCTM?.();
    if (!svgScreenMatrix) {
      state.nearestPointIndex = { grid, count: 0 };
      return;
    }
    const screenToSvg = svgScreenMatrix.inverse();
    let count = 0;
    for (const mark of marks) {
      const x = Number(mark.getAttribute("cx") ?? mark.dataset.sms3PointX);
      const y = Number(mark.getAttribute("cy") ?? mark.dataset.sms3PointY);
      const matrix = mark.getScreenCTM?.();
      if (!Number.isFinite(x) || !Number.isFinite(y) || !matrix) continue;
      const localPoint = svg.createSVGPoint();
      localPoint.x = x;
      localPoint.y = y;
      const point = localPoint.matrixTransform(matrix).matrixTransform(screenToSvg);
      const key = `${Math.floor(point.x / NEAREST_POINT_GRID_SIZE)}:${Math.floor(point.y / NEAREST_POINT_GRID_SIZE)}`;
      const bucket = grid.get(key) ?? [];
      bucket.push({ mark, x: point.x, y: point.y });
      grid.set(key, bucket);
      count += 1;
    }
    state.nearestPointIndex = { grid, count };
  }

  function refresh() {
    for (const title of titleStates.keys()) {
      if (!container.contains(title)) titleStates.delete(title);
    }
    for (const svg of svgStates.keys()) {
      if (!container.contains(svg)) {
        resizeObserver?.unobserve(svg);
        svgStates.delete(svg);
      }
    }
    if (activeMark && !container.contains(activeMark)) {
      activeMark = null;
      activeSource = null;
      pinnedMark = null;
      tooltip.hidden = true;
      tooltip.classList.remove("is-pinned");
    }
    for (const svg of container.querySelectorAll("svg")) prepareSvg(svg);
    if (includeSvgTitles) {
      for (const title of container.querySelectorAll("svg title")) prepareTitle(title);
    }
    for (const svg of container.querySelectorAll("svg")) prepareNearestPointIndex(svg);
  }

  function resolveDirectMark(node) {
    if (!(node instanceof Element)) return null;
    const mark = node.closest(EXPLICIT_MARK_SELECTOR);
    return mark && container.contains(mark) && getVisualInspectionText(mark) ? mark : null;
  }

  function resolveCircleMembershipMark(node, position) {
    if (!(node instanceof Element) || !position) return null;
    const svg = node.closest('svg[data-sms3-spatial-inspection="circle-membership"]');
    if (!(svg instanceof SVGSVGElement)) return null;
    const circles = [...svg.querySelectorAll("circle[data-sms3-membership-index]")]
      .sort((left, right) => Number(left.dataset.sms3MembershipIndex) - Number(right.dataset.sms3MembershipIndex));
    if (circles.length === 0) return null;

    const screenPoint = svg.createSVGPoint();
    screenPoint.x = position.clientX;
    screenPoint.y = position.clientY;
    const membership = circles.map((circle) => {
      const matrix = circle.getScreenCTM();
      if (!matrix) return "0";
      const point = screenPoint.matrixTransform(matrix.inverse());
      const cx = Number(circle.getAttribute("cx"));
      const cy = Number(circle.getAttribute("cy"));
      const radius = Number(circle.getAttribute("r"));
      return Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(radius)
        && Math.hypot(point.x - cx, point.y - cy) <= radius
        ? "1"
        : "0";
    }).join("");
    if (!membership.includes("1")) return null;

    const mark = svg.querySelector(`[data-sms3-region-membership="${membership}"]`);
    return mark && getVisualInspectionText(mark) ? mark : null;
  }

  function svgForPointer(node, position) {
    const closest = node instanceof Element ? node.closest("svg") : null;
    if (closest instanceof SVGSVGElement) return closest;
    if (!position) return null;
    return [...container.querySelectorAll("svg")].find((svg) => {
      const rect = svg.getBoundingClientRect();
      return position.clientX >= rect.left && position.clientX <= rect.right
        && position.clientY >= rect.top && position.clientY <= rect.bottom;
    }) ?? null;
  }

  function resolveNearestPointMark(node, position) {
    if (!position) return null;
    const svg = svgForPointer(node, position);
    if (!(svg instanceof SVGSVGElement)) return null;
    const index = svgStates.get(svg)?.nearestPointIndex;
    if (!index?.count) return null;
    const screenMatrix = svg.getScreenCTM();
    if (!screenMatrix) return null;
    const scaleX = Math.hypot(screenMatrix.a, screenMatrix.b);
    const scaleY = Math.hypot(screenMatrix.c, screenMatrix.d);
    const minimumScale = Math.max(0.001, Math.min(scaleX, scaleY));
    const localRadius = NEAREST_POINT_HIT_RADIUS / minimumScale;
    const screenPoint = svg.createSVGPoint();
    screenPoint.x = position.clientX;
    screenPoint.y = position.clientY;
    const localPointer = screenPoint.matrixTransform(screenMatrix.inverse());
    const minGridX = Math.floor((localPointer.x - localRadius) / NEAREST_POINT_GRID_SIZE);
    const maxGridX = Math.floor((localPointer.x + localRadius) / NEAREST_POINT_GRID_SIZE);
    const minGridY = Math.floor((localPointer.y - localRadius) / NEAREST_POINT_GRID_SIZE);
    const maxGridY = Math.floor((localPointer.y + localRadius) / NEAREST_POINT_GRID_SIZE);
    let nearest = null;
    let nearestDistance = NEAREST_POINT_HIT_RADIUS;
    let activeDistance = Infinity;
    for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
      for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
        for (const candidate of index.grid.get(`${gridX}:${gridY}`) ?? []) {
          const screenX = screenMatrix.a * candidate.x + screenMatrix.c * candidate.y + screenMatrix.e;
          const screenY = screenMatrix.b * candidate.x + screenMatrix.d * candidate.y + screenMatrix.f;
          const distance = Math.hypot(position.clientX - screenX, position.clientY - screenY);
          if (candidate.mark === activeMark) activeDistance = distance;
          if (distance <= nearestDistance && getVisualInspectionText(candidate.mark)) {
            nearest = candidate.mark;
            nearestDistance = distance;
          }
        }
      }
    }
    if (activeDistance <= NEAREST_POINT_HIT_RADIUS
      && activeDistance <= nearestDistance + NEAREST_POINT_HYSTERESIS) {
      return activeMark;
    }
    return nearest;
  }

  function resolveNearbyLineMark(node, position) {
    if (!(node instanceof Element) || !position) return null;
    const svg = svgForPointer(node, position);
    if (!(svg instanceof SVGSVGElement)) return null;
    const lines = [...svg.querySelectorAll(`line[${NEARBY_ATTRIBUTE}="line"]`)];
    if (lines.length === 0 || lines.length > MAX_NEARBY_LINE_MARKS) return null;
    let nearest = null;
    let nearestDistance = NEARBY_LINE_HIT_RADIUS;
    for (const line of lines) {
      const matrix = line.getScreenCTM();
      if (!matrix) continue;
      const makePoint = (x, y) => {
        const point = svg.createSVGPoint();
        point.x = Number(x);
        point.y = Number(y);
        return point.matrixTransform(matrix);
      };
      const start = makePoint(line.getAttribute("x1"), line.getAttribute("y1"));
      const end = makePoint(line.getAttribute("x2"), line.getAttribute("y2"));
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const projection = lengthSquared > 0
        ? Math.max(0, Math.min(1, ((position.clientX - start.x) * dx + (position.clientY - start.y) * dy) / lengthSquared))
        : 0;
      const x = start.x + projection * dx;
      const y = start.y + projection * dy;
      const distance = Math.hypot(position.clientX - x, position.clientY - y);
      if (distance <= nearestDistance && getVisualInspectionText(line)) {
        nearest = line;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function resolveNearbyDegenerateMark(node, position) {
    if (!(node instanceof Element) || !position) return null;
    const svg = svgForPointer(node, position);
    if (!(svg instanceof SVGSVGElement)) return null;
    const marks = [...svg.querySelectorAll(`[${NEARBY_ATTRIBUTE}="degenerate"]`)];
    if (marks.length === 0 || marks.length > 650) return null;
    let nearest = null;
    let nearestDistance = NEARBY_LINE_HIT_RADIUS;
    for (const mark of marks) {
      let rect = mark.getBoundingClientRect();
      try {
        const renderedBox = mark.getBBox();
        // WebKit collapses both dimensions of a zero-height SVG rect, including
        // its otherwise valid x position and width. Reconstruct that local box
        // from the rect attributes so its plotted baseline remains inspectable.
        const rectBox = mark.tagName?.toLowerCase() === "rect"
          ? {
              x: Number(mark.getAttribute("x") ?? 0),
              y: Number(mark.getAttribute("y") ?? 0),
              width: Number(mark.getAttribute("width") ?? 0),
              height: Number(mark.getAttribute("height") ?? 0)
            }
          : null;
        const box = rectBox && Object.values(rectBox).every(Number.isFinite)
          ? rectBox
          : renderedBox;
        const matrix = mark.getScreenCTM();
        if (matrix) {
          const corners = [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x, box.y + box.height],
            [box.x + box.width, box.y + box.height]
          ].map(([pointX, pointY]) => {
            const point = svg.createSVGPoint();
            point.x = pointX;
            point.y = pointY;
            return point.matrixTransform(matrix);
          });
          const xs = corners.map((point) => point.x);
          const ys = corners.map((point) => point.y);
          rect = {
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
          };
        }
      } catch {
        // Browser geometry fallback above remains sufficient for ordinary marks.
      }
      if (rect.width >= 1 && rect.height >= 1) continue;
      const x = Math.max(rect.left, Math.min(position.clientX, rect.right));
      const y = Math.max(rect.top, Math.min(position.clientY, rect.bottom));
      const distance = Math.hypot(position.clientX - x, position.clientY - y);
      if (distance < nearestDistance && getVisualInspectionText(mark)) {
        nearest = mark;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function resolveMark(node, position) {
    const spatialMark = resolveCircleMembershipMark(node, position);
    if (spatialMark) return spatialMark;
    const directMark = resolveDirectMark(node);
    if (directMark?.tagName?.toLowerCase() === "line") return directMark;
    if (directMark?.matches(NEAREST_POINT_SELECTOR)) {
      return resolveNearestPointMark(node, position) ?? directMark;
    }
    const nearbyLineMark = resolveNearbyLineMark(node, position);
    if (nearbyLineMark) return nearbyLineMark;
    const nearestPointMark = resolveNearestPointMark(node, position);
    if (nearestPointMark) return nearestPointMark;
    if (directMark || !position || typeof document.elementsFromPoint !== "function") return directMark;
    for (const candidate of document.elementsFromPoint(position.clientX, position.clientY)) {
      const candidateSpatialMark = resolveCircleMembershipMark(candidate, position);
      if (candidateSpatialMark) return candidateSpatialMark;
      const mark = resolveDirectMark(candidate);
      if (mark) return mark;
    }
    return resolveNearbyDegenerateMark(node, position);
  }

  function keyboardMarks(svg) {
    const titleMarks = [...svg.querySelectorAll(`[${TITLE_MARK_ATTRIBUTE}]`)]
      .filter((mark) => getVisualInspectionText(mark));
    const detailedMarks = [];
    const walker = document.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const mark = walker.currentNode;
      if (!mark.matches("[data-sms3-inspection-text],[data-alignment-column]")) continue;
      if (getVisualInspectionText(mark)) detailedMarks.push(mark);
      if (detailedMarks.length > MAX_KEYBOARD_TARGETS) {
        return evenlyLimitedTargets(titleMarks);
      }
    }
    // Dense alignments can contain hundreds of thousands of pointer targets. Keep
    // exact pointer inspection, while keyboard traversal uses titled row summaries.
    return evenlyLimitedTargets([...detailedMarks, ...titleMarks]);
  }

  let highlightedMark = null;

  function markContainsDetailedInspection(mark) {
    return Boolean(mark?.querySelector(EXPLICIT_MARK_SELECTOR));
  }

  function markAllowsVisualHighlight(mark) {
    if (!mark || mark.closest(`[${HIGHLIGHT_POLICY_ATTRIBUTE}="none"]`)) return false;
    const tag = mark.tagName?.toLowerCase();
    // A stroke or its dash pattern must not change when its tooltip opens.
    if (tag === "line" || tag === "polyline") return false;
    if ((tag === "path" || tag === "polygon") && getComputedStyle(mark).fill === "none") return false;
    return true;
  }

  function setActiveMark(mark) {
    if (activeMark === mark) return;
    const previousSvg = highlightedMark?.closest(PLOT_SVG_SELECTOR);
    for (const outline of svgStates.get(previousSvg)?.outlines.values() ?? []) {
      outline.setAttribute("visibility", "hidden");
    }
    highlightedMark?.style.removeProperty(CONTRAST_PROPERTY);
    highlightedMark?.style.removeProperty(PLOT_STROKE_PROPERTY);
    highlightedMark?.style.removeProperty(PLOT_HALO_PROPERTY);
    for (const glow of highlightedMark?.querySelectorAll(`[${GLOW_STYLE_ATTRIBUTE}]`) ?? []) restoreInspectionGlow(glow);
    restoreInspectionGlow(highlightedMark);
    restoreInspectionShade(highlightedMark);
    highlightedMark?.removeAttribute(ACTIVE_ATTRIBUTE);
    activeMark = mark;
    highlightedMark = mark && !markContainsDetailedInspection(mark) && markAllowsVisualHighlight(mark)
      ? mark
      : null;
    if (highlightedMark) {
      const originalFill = getComputedStyle(highlightedMark).fill;
      const tag = highlightedMark.tagName?.toLowerCase();
      const plotHalo = highlightedMark.closest(PLOT_SVG_SELECTOR)
        && !highlightedMark.closest(GENOME_POSTER_SELECTOR)
        && (tag === "path" || tag === "text");
      const contrast = plotHalo
        ? (inspectionLuminance(inspectionSurfaceRgb(highlightedMark)) < 0.18 ? "#ffffff" : "#0f172a")
        : inspectionContrast(highlightedMark);
      highlightedMark.style.setProperty(CONTRAST_PROPERTY, contrast);
      highlightedMark.setAttribute(ACTIVE_ATTRIBUTE, "true");
      applyInspectionShade(highlightedMark, originalFill);
      applyInspectionGlow(highlightedMark);
      if (highlightedMark.getAttribute("data-sms3-inspection-mark") === "intersection") {
        for (const child of highlightedMark.querySelectorAll(".intersection-member, .intersection-size-bar")) {
          applyInspectionGlow(child);
        }
      }
      showPlotOutline(highlightedMark);
    }
  }

  function placeTooltip(position, mark) {
    const containerRect = container.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const inset = 8;
    const preferredLeft = scrollLeft + position.clientX - containerRect.left + 12;
    let preferredTop = scrollTop + position.clientY - containerRect.top + 14;
    const minLeft = scrollLeft + inset;
    const maxLeft = scrollLeft + container.clientWidth - tooltipRect.width - inset;
    const minTop = scrollTop + inset;
    const maxTop = scrollTop + container.clientHeight - tooltipRect.height - inset;
    const shortPlotRect = mark?.tagName?.toLowerCase() === "rect" &&
      (mark.getAttribute(HIGHLIGHT_POLICY_ATTRIBUTE) === "fill" || Boolean(mark.closest(PLOT_SVG_SELECTOR))) &&
      mark.getBoundingClientRect().height <= 80;
    if (shortPlotRect) {
      const markRect = mark.getBoundingClientRect();
      const below = scrollTop + markRect.bottom - containerRect.top + inset;
      const above = scrollTop + markRect.top - containerRect.top - tooltipRect.height - inset;
      if (below <= maxTop) preferredTop = Math.max(preferredTop, below);
      else if (above >= minTop) preferredTop = above;
    }
    tooltip.style.left = `${Math.max(minLeft, Math.min(preferredLeft, Math.max(minLeft, maxLeft)))}px`;
    tooltip.style.top = `${Math.max(minTop, Math.min(preferredTop, Math.max(minTop, maxTop)))}px`;
  }

  function show(mark, position, { announce = false, source = "pointer" } = {}) {
    const text = getVisualInspectionText(mark);
    if (!text) return hide();
    setActiveMark(mark);
    activeSource = source;
    keyboardPointerAnchor = source === "keyboard" && lastPointerPosition
      ? { ...lastPointerPosition }
      : null;
    renderInspectionTooltip(tooltip, text);
    tooltip.hidden = false;
    tooltip.classList.toggle("is-pinned", mark === pinnedMark);
    placeTooltip(position ?? pointerPositionForElement(mark), mark);
    if (announce) {
      liveStatus.textContent = "";
      requestAnimationFrame(() => { liveStatus.textContent = text; });
    }
  }

  function hide({ force = false } = {}) {
    if (pinnedMark && !force) return;
    setActiveMark(null);
    activeSource = null;
    keyboardPointerAnchor = null;
    tooltip.hidden = true;
    tooltip.classList.remove("is-pinned");
  }

  function unpin({ hideTooltip = true } = {}) {
    pinnedMark = null;
    tooltip.classList.remove("is-pinned");
    if (hideTooltip) hide({ force: true });
  }

  function inspectFromPointer(event) {
    if (activeSource === "keyboard" || pinnedMark) return;
    const mark = resolveMark(event.target, event);
    if (mark) {
      show(mark, event);
    } else {
      hide();
    }
  }

  container.addEventListener("pointerover", inspectFromPointer, listenerOptions);
  container.addEventListener("pointermove", (event) => {
    pendingPointer = {
      target: event.target,
      clientX: event.clientX,
      clientY: event.clientY
    };
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      const pointer = pendingPointer;
      pendingPointer = null;
      if (pointer) inspectFromPointer(pointer);
    });
  }, listenerOptions);
  container.addEventListener("pointerleave", () => {
    cancelPendingPointerInspection();
    if (activeSource === "keyboard") return;
    hide();
  }, listenerOptions);
  document.addEventListener("pointermove", (event) => {
    const position = { clientX: event.clientX, clientY: event.clientY };
    const anchor = keyboardPointerAnchor ?? lastPointerPosition;
    lastPointerPosition = position;
    if (activeSource !== "keyboard") return;
    if (anchor && Math.hypot(position.clientX - anchor.clientX, position.clientY - anchor.clientY) <= 0.5) return;
    activeSource = null;
    keyboardPointerAnchor = null;
    if (!container.contains(event.target)) hide();
  }, listenerOptions);
  document.addEventListener("pointerdown", (event) => {
    if (pinnedMark && !container.contains(event.target)) unpin();
  }, listenerOptions);
  container.addEventListener("focusin", (event) => {
    const mark = resolveMark(event.target);
    if (mark && !pinnedMark) show(mark, pointerPositionForElement(mark), { announce: true, source: "keyboard" });
  }, listenerOptions);
  container.addEventListener("focusout", (event) => {
    if (!resolveMark(event.relatedTarget)) hide();
  }, listenerOptions);
  container.addEventListener("click", (event) => {
    if (!allowPin) return;
    const mark = resolveMark(event.target, event);
    if (!mark) {
      if (pinnedMark) unpin();
      return;
    }
    if (isInteractiveMark(mark)) return;
    if (pinnedMark === mark) {
      unpin();
      return;
    }
    pinnedMark = mark;
    show(mark, event, { announce: true });
  }, listenerOptions);
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cancelPendingPointerInspection();
      if (pinnedMark || !tooltip.hidden) {
        event.preventDefault();
        unpin();
      }
      return;
    }
    const svg = event.target.closest?.("svg");
    if (!svg || !container.contains(svg)) return;
    if (event.target !== svg) return;
    const marks = keyboardMarks(svg);
    if (marks.length === 0) return;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      cancelPendingPointerInspection();
      unpin({ hideTooltip: false });
      if (event.key === "Home") keyboardIndex = 0;
      else if (event.key === "End") keyboardIndex = marks.length - 1;
      else {
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        keyboardIndex = (keyboardIndex + direction + marks.length) % marks.length;
      }
      show(marks[keyboardIndex], pointerPositionForElement(marks[keyboardIndex]), { announce: true, source: "keyboard" });
      return;
    }
    if (allowPin && event.key === "Enter" && activeMark) {
      event.preventDefault();
      cancelPendingPointerInspection();
      pinnedMark = pinnedMark === activeMark ? null : activeMark;
      show(activeMark, pointerPositionForElement(activeMark), { announce: true, source: "keyboard" });
    }
  }, listenerOptions);

  const observer = new MutationObserver(refresh);
  observer.observe(container, { childList: true, subtree: true });
  refresh();

  const cleanup = () => {
    controller.abort();
    observer.disconnect();
    resizeObserver?.disconnect();
    cancelPendingPointerInspection();
    setActiveMark(null);
    for (const [title, text] of titleStates) {
      const mark = title.parentElement;
      title.textContent = text;
      if (mark) {
        delete mark.dataset.sms3TitleText;
        mark.removeAttribute(TITLE_MARK_ATTRIBUTE);
        mark.removeAttribute(NEARBY_ATTRIBUTE);
      }
    }
    for (const [svg, state] of svgStates) {
      for (const outline of state.outlines.values()) outline.remove();
      if (state.tabindex === null) svg.removeAttribute("tabindex");
      else svg.setAttribute("tabindex", state.tabindex);
      if (state.describedBy === null) svg.removeAttribute("aria-describedby");
      else svg.setAttribute("aria-describedby", state.describedBy);
      if (state.keyShortcuts === null) svg.removeAttribute("aria-keyshortcuts");
      else svg.setAttribute("aria-keyshortcuts", state.keyShortcuts);
    }
    tooltip.remove();
    liveStatus.remove();
    instructions.remove();
    if (container._sms3InspectionCleanup === cleanup) container._sms3InspectionCleanup = null;
  };
  container._sms3InspectionCleanup = cleanup;
  return cleanup;
}

export function installCanvasVisualInspection(container, {
  canvas,
  ariaLabel = "Interactive visualization",
  getTargets = () => [],
  hitTest = () => null,
  getText = (target) => target?.label,
  getKey = (target, index) => target?.key ?? index,
  getPosition = () => null,
  onActivate = () => {},
  onActiveChange = () => {},
  isInteractionSuppressed = () => false,
  keyboardNavigation = true,
  ariaKeyShortcuts = "",
  instructionsText = "",
  targetCursor = "pointer",
  emptyCursor = "grab"
} = {}) {
  const noop = () => {};
  if (!(container instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    return { cleanup: noop, hide: noop, inspect: noop, refresh: noop };
  }
  canvas._sms3CanvasInspectionCleanup?.();

  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };
  const id = `sms3-canvas-inspection-${++inspectionId}`;
  const tooltip = document.createElement("div");
  tooltip.id = `${id}-tooltip`;
  tooltip.className = "visual-inspection-tooltip visual-inspection-canvas-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  const liveStatus = document.createElement("div");
  liveStatus.className = "visually-hidden";
  liveStatus.setAttribute("role", "status");
  liveStatus.setAttribute("aria-live", "polite");
  const instructions = document.createElement("span");
  instructions.id = `${id}-instructions`;
  instructions.className = "visually-hidden";
  instructions.textContent = normalizedText(instructionsText) || (keyboardNavigation
    ? "Move over the viewer or use Arrow keys to inspect items. Press Enter or tap to open persistent details, and Escape to dismiss inspection."
    : "Move over the viewer to inspect items. Use the viewer keyboard controls for persistent selection, and Escape to dismiss inspection.");
  container.append(tooltip, liveStatus, instructions);

  const canvasState = {
    tabindex: canvas.getAttribute("tabindex"),
    ariaLabel: canvas.getAttribute("aria-label"),
    describedBy: canvas.getAttribute("aria-describedby"),
    keyShortcuts: canvas.getAttribute("aria-keyshortcuts")
  };
  if (!canvas.hasAttribute("tabindex")) canvas.setAttribute("tabindex", "0");
  if (normalizedText(ariaLabel)) canvas.setAttribute("aria-label", normalizedText(ariaLabel));
  canvas.setAttribute("aria-describedby", joinTokens(canvasState.describedBy, instructions.id));
  canvas.setAttribute("aria-keyshortcuts", normalizedText(ariaKeyShortcuts) || (keyboardNavigation
    ? "ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Escape"
    : "Escape"));

  let activeTarget = null;
  let activeKey = "";
  let keyboardIndex = -1;
  let pointerFrame = 0;
  let pendingPointer = null;
  let lastPointer = null;
  let dismissedPointer = null;

  function keyFor(target, index = -1) {
    return normalizedText(getKey(target, index));
  }

  function inspectionTargets() {
    const targets = [];
    const seen = new Set();
    for (const [index, target] of Array.from(getTargets() ?? []).entries()) {
      if (!target || !normalizedText(getText(target))) continue;
      const key = keyFor(target, index);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
      if (targets.length >= MAX_KEYBOARD_TARGETS) break;
    }
    return targets;
  }

  function fallbackPosition() {
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + Math.min(Math.max(rect.width / 2, 20), 120),
      clientY: rect.top + Math.min(Math.max(rect.height / 2, 20), 80)
    };
  }

  function targetPosition(target) {
    const position = getPosition(target);
    return Number.isFinite(Number(position?.clientX)) && Number.isFinite(Number(position?.clientY))
      ? position
      : fallbackPosition();
  }

  function placeTooltip(position) {
    const containerRect = container.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const inset = 8;
    const preferredLeft = scrollLeft + position.clientX - containerRect.left + 12;
    const preferredTop = scrollTop + position.clientY - containerRect.top + 14;
    const minLeft = scrollLeft + inset;
    const maxLeft = scrollLeft + container.clientWidth - tooltipRect.width - inset;
    const minTop = scrollTop + inset;
    const maxTop = scrollTop + container.clientHeight - tooltipRect.height - inset;
    tooltip.style.left = `${Math.max(minLeft, Math.min(preferredLeft, Math.max(minLeft, maxLeft)))}px`;
    tooltip.style.top = `${Math.max(minTop, Math.min(preferredTop, Math.max(minTop, maxTop)))}px`;
  }

  function setActive(target) {
    const nextKey = target ? keyFor(target) : "";
    if (activeKey === nextKey) {
      if (target) activeTarget = target;
      return;
    }
    activeTarget = target;
    activeKey = nextKey;
    onActiveChange(target);
  }

  function announce(text) {
    liveStatus.textContent = "";
    requestAnimationFrame(() => { liveStatus.textContent = text; });
  }

  function show(target, position, { shouldAnnounce = false } = {}) {
    const text = normalizedText(getText(target));
    if (!target || !text) return hide();
    setActive(target);
    renderInspectionTooltip(tooltip, text);
    tooltip.hidden = false;
    placeTooltip(position ?? targetPosition(target));
    if (shouldAnnounce) announce(text);
  }

  function hide() {
    setActive(null);
    tooltip.hidden = true;
  }

  function refresh() {
    if (!activeTarget) return;
    const current = inspectionTargets().find((target, index) => keyFor(target, index) === activeKey);
    if (!current) hide();
    else show(current, targetPosition(current));
  }

  function pointerRemainsDismissed(pointer) {
    if (!dismissedPointer) return false;
    const moved = Math.hypot(
      pointer.clientX - dismissedPointer.clientX,
      pointer.clientY - dismissedPointer.clientY
    ) > 1;
    if (moved) dismissedPointer = null;
    return !moved;
  }

  canvas.addEventListener("pointermove", (event) => {
    const pointer = { clientX: event.clientX, clientY: event.clientY };
    lastPointer = pointer;
    if (pointerRemainsDismissed(pointer)) {
      hide();
      return;
    }
    pendingPointer = pointer;
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      const pointer = pendingPointer;
      pendingPointer = null;
      if (!pointer || isInteractionSuppressed()) return;
      if (pointerRemainsDismissed(pointer)) {
        hide();
        return;
      }
      const target = hitTest(pointer);
      canvas.style.cursor = target ? targetCursor : emptyCursor;
      if (target) show(target, pointer);
      else hide();
    });
  }, listenerOptions);
  canvas.addEventListener("pointerleave", () => {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
    lastPointer = null;
    dismissedPointer = null;
    canvas.style.cursor = "";
    hide();
  }, listenerOptions);
  canvas.addEventListener("blur", () => hide(), listenerOptions);
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!tooltip.hidden) event.preventDefault();
      dismissedPointer = lastPointer;
      hide();
      return;
    }
    if (!keyboardNavigation) return;
    if (event.key === "Enter" && activeTarget) {
      event.preventDefault();
      onActivate(activeTarget);
      announce(normalizedText(getText(activeTarget)));
      return;
    }
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const targets = inspectionTargets();
    if (targets.length === 0) return;
    event.preventDefault();
    const activeIndex = targets.findIndex((target, index) => keyFor(target, index) === activeKey);
    if (activeIndex >= 0) keyboardIndex = activeIndex;
    if (event.key === "Home") keyboardIndex = 0;
    else if (event.key === "End") keyboardIndex = targets.length - 1;
    else {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      keyboardIndex = (keyboardIndex + direction + targets.length) % targets.length;
    }
    show(targets[keyboardIndex], targetPosition(targets[keyboardIndex]), { shouldAnnounce: true });
  }, listenerOptions);

  const cleanup = () => {
    controller.abort();
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
    setActive(null);
    if (canvasState.tabindex === null) canvas.removeAttribute("tabindex");
    else canvas.setAttribute("tabindex", canvasState.tabindex);
    if (canvasState.ariaLabel === null) canvas.removeAttribute("aria-label");
    else canvas.setAttribute("aria-label", canvasState.ariaLabel);
    if (canvasState.describedBy === null) canvas.removeAttribute("aria-describedby");
    else canvas.setAttribute("aria-describedby", canvasState.describedBy);
    if (canvasState.keyShortcuts === null) canvas.removeAttribute("aria-keyshortcuts");
    else canvas.setAttribute("aria-keyshortcuts", canvasState.keyShortcuts);
    tooltip.remove();
    liveStatus.remove();
    instructions.remove();
    if (canvas._sms3CanvasInspectionCleanup === cleanup) canvas._sms3CanvasInspectionCleanup = null;
  };
  canvas._sms3CanvasInspectionCleanup = cleanup;
  return { cleanup, hide, inspect: show, refresh };
}
