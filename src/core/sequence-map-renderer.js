function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(value, maxLength = 30) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function lastInformativeWords(value, maxLength = 28) {
  const stop = new Set([
    "dna",
    "rna",
    "protein",
    "putative",
    "hypothetical",
    "fragment",
    "partial"
  ]);
  const words = String(value ?? "")
    .replace(/[;,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((word) => !stop.has(word.toLowerCase()));
  const picked = [];
  for (const word of words.reverse()) {
    picked.unshift(word);
    if (picked.join(" ").length >= maxLength - 4) {
      break;
    }
  }
  return truncateLabel(picked.join(" ") || value, maxLength);
}

function polarToCartesian(centerX, centerY, radius, angleDegrees) {
  const radians = (angleDegrees - 90) * Math.PI / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians)
  };
}

function describeArc(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function estimateTextWidth(text, fontSize = 13, widthFactor = 0.58) {
  return String(text ?? "").length * fontSize * widthFactor;
}

const LINEAR_FEATURE_BAR_HEIGHT = 13;
const LINEAR_SOURCE_BAR_HEIGHT = 5;
const INSIDE_FEATURE_LABEL_FONT_SIZE = 9.25;
const INSIDE_FEATURE_LABEL_COMPACT_FONT_SIZE = 8.5;
const INSIDE_FEATURE_LABEL_MIN_BAR_HEIGHT = 9;
const INSIDE_FEATURE_LABEL_PADDING = 16;
const CIRCULAR_LABEL_FONT_SIZE = 11.5;
const CIRCULAR_LABEL_BOX_HEIGHT = 17;
const CIRCULAR_LABEL_BOX_PADDING_X = 6;
const CIRCULAR_LABEL_RING_CLEARANCE = 4;
const CIRCULAR_FEATURE_STROKE_WIDTH = 8;

function parseHexColor(value) {
  const text = String(value ?? "").trim();
  const short = /^#([0-9a-f]{3})$/iu.exec(text);
  if (short) {
    return short[1].split("").map((digit) => Number.parseInt(`${digit}${digit}`, 16));
  }
  const full = /^#([0-9a-f]{6})$/iu.exec(text);
  if (full) {
    return [0, 2, 4].map((offset) => Number.parseInt(full[1].slice(offset, offset + 2), 16));
  }
  return null;
}

function relativeLuminance(rgb) {
  if (!rgb) {
    return 0;
  }
  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function insideFeatureLabelStyle(featureStyle, compact = false) {
  const luminance = relativeLuminance(parseHexColor(featureStyle.fill));
  const lightFeature = luminance >= 0.48;
  const fill = lightFeature ? "#0f172a" : "#f8fafc";
  const stroke = lightFeature ? "#f8fafc" : "#0f172a";
  const strokeOpacity = lightFeature ? 0.94 : 0.76;
  const strokeWidth = compact
    ? lightFeature ? 1.05 : 0.7
    : lightFeature ? 1.25 : 0.85;
  return [
    `fill:${fill}`,
    `stroke:${stroke}`,
    `stroke-opacity:${strokeOpacity}`,
    `stroke-width:${strokeWidth}px`
  ].join(";");
}

function featureLabelPriority(feature) {
  if (feature.className === "coding") {
    return 0;
  }
  if (feature.className === "gene") {
    return 1;
  }
  if (feature.className === "regulatory") {
    return 2;
  }
  if (feature.className === "repeat" || feature.className === "other") {
    return 3;
  }
  if (feature.className === "variant") {
    return 9;
  }
  return 5;
}

function largestPartLength(feature) {
  const parts = feature.parts?.length ? feature.parts : [feature];
  return Math.max(...parts.map((part) => part.end - part.start + 1));
}

const defaultFeatureStyles = {
  coding: { label: "CDS/exon", fill: "#2563eb", stroke: "#1d4ed8" },
  gene: { label: "Gene", fill: "#16a34a", stroke: "#15803d" },
  source: { label: "Source", fill: "#94a3b8", stroke: "#64748b" },
  regulatory: { label: "Regulatory", fill: "#d97706", stroke: "#b45309" },
  repeat: { label: "Repeat", fill: "#9333ea", stroke: "#7e22ce" },
  variant: { label: "Variation", fill: "#dc2626", stroke: "#b91c1c" },
  other: { label: "Other", fill: "#0891b2", stroke: "#0e7490" }
};

function normalizeFeature(feature, sequenceLength) {
  const rawStart = Number(feature.start);
  const rawEnd = Number(feature.end);
  const spansOrigin = Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawStart > rawEnd;
  const start = spansOrigin
    ? Math.max(1, Math.min(sequenceLength, rawEnd))
    : Math.max(1, Math.min(sequenceLength, rawStart));
  const end = spansOrigin
    ? Math.max(1, Math.min(sequenceLength, rawStart))
    : Math.max(start, Math.min(sequenceLength, rawEnd));
  const rawParts = Array.isArray(feature.parts) && feature.parts.length > 0
    ? feature.parts
    : spansOrigin
      ? [
          { start: rawStart, end: sequenceLength, strand: feature.strand },
          { start: 1, end: rawEnd, strand: feature.strand }
        ]
      : [{ start, end, strand: feature.strand }];
  const parts = rawParts
    .map((part) => {
      const partStart = Math.max(1, Math.min(sequenceLength, Number(part.start)));
      const partEnd = Math.max(partStart, Math.min(sequenceLength, Number(part.end)));
      return {
        start: partStart,
        end: partEnd,
        strand: part.strand ?? feature.strand ?? "+"
      };
    })
    .filter((part) => Number.isFinite(part.start) && Number.isFinite(part.end));
  return {
    ...feature,
    start,
    end,
    parts,
    className: feature.className ?? "other",
    slot: Number.isFinite(Number(feature.slot)) ? Number(feature.slot) : null,
    ring: Number.isFinite(Number(feature.ring)) ? Number(feature.ring) : null,
    label: truncateLabel(feature.label ?? feature.type ?? "feature", 36)
  };
}

function featureMidAngle(feature, sequenceLength) {
  const parts = feature.parts?.length ? feature.parts : [feature];
  const largestPart = parts
    .slice()
    .sort((left, right) => (right.end - right.start) - (left.end - left.start))[0];
  return (((largestPart.start + largestPart.end) / 2 - 1) / sequenceLength) * 360;
}

function scaleLinearPosition(position, sequenceLength, left, width) {
  if (sequenceLength <= 1) {
    return left;
  }
  return left + ((position - 1) / (sequenceLength - 1)) * width;
}

function getLegendLayout(classes, styles, { maxWidth = 760 } = {}) {
  const visible = Object.keys(styles)
    .filter((className) => classes.has(className) && className !== "source" && styles[className]?.legend !== false)
    .map((className) => ({
      className,
      style: styles[className] ?? styles.other
    }));
  const items = [];
  let row = 0;
  let cursorX = 0;
  for (const item of visible) {
    const itemWidth = Math.max(78, Math.min(210, estimateTextWidth(item.style.label, 12) + 34));
    if (cursorX > 0 && cursorX + itemWidth > maxWidth) {
      row += 1;
      cursorX = 0;
    }
    items.push({
      ...item,
      x: cursorX,
      y: row * 24,
      width: itemWidth
    });
    cursorX += itemWidth;
  }
  return {
    items,
    rows: items.length === 0 ? 0 : row + 1
  };
}

function renderLegend(classes, styles, x, y, { maxWidth = 760 } = {}) {
  const layout = getLegendLayout(classes, styles, { maxWidth });
  if (layout.items.length === 0) {
    return "";
  }
  const legendWidth = Math.min(
    maxWidth,
    Math.max(...layout.items.map((item) => item.x + item.width), 0) + 10
  );
  const legendHeight = layout.rows * 22 + 10;
  const parts = [`<g class="legend" transform="translate(${x} ${y})" aria-label="Legend">`];
  parts.push(`<rect class="legend-frame" x="-10" y="-9" width="${legendWidth}" height="${legendHeight}" rx="4"></rect>`);
  for (const item of layout.items) {
    parts.push(`<rect x="${item.x}" y="${item.y}" width="10" height="10" rx="2" fill="${item.style.fill}" stroke="${item.style.stroke}"></rect>`);
    parts.push(`<text x="${item.x + 16}" y="${item.y + 9}">${escapeXml(item.style.label)}</text>`);
  }
  parts.push("</g>");
  return parts.join("\n");
}

function styleForFeature(feature, styles) {
  const baseStyle = styles[feature.className] ?? styles.other;
  return {
    ...baseStyle,
    fill: feature.fill ?? baseStyle.fill,
    stroke: feature.stroke ?? baseStyle.stroke
  };
}

function assignLinearFeatureLanes(features) {
  const laneEnds = [];
  return features
    .slice()
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .map((feature) => {
      if (feature.slot !== null) {
        laneEnds[feature.slot] = Math.max(laneEnds[feature.slot] ?? 0, feature.end);
        return { ...feature, lane: feature.slot };
      }
      let lane = laneEnds.findIndex((end) => feature.start > end);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = feature.end;
      return { ...feature, lane };
    });
}

function assignLinearLabelLanes(labels, leftLimit, rightLimit) {
  const laneIntervals = [];
  const minGap = 14;
  const maxNudge = 88;
  const maxLabelLanes = 12;
  return labels
    .slice()
    .sort((left, right) => left.x - right.x)
    .map((label) => {
      const halfWidth = Math.min(estimateTextWidth(label.label, 13), 220) / 2;
      const minCenter = leftLimit + halfWidth;
      const maxCenter = rightLimit - halfWidth;
      const anchoredTextX = Math.max(minCenter, Math.min(maxCenter, label.x));

      for (let lane = 0; lane < maxLabelLanes; lane += 1) {
        if (!laneIntervals[lane]) {
          laneIntervals[lane] = [];
        }
        const left = anchoredTextX - halfWidth;
        const right = anchoredTextX + halfWidth;
        const collides = laneIntervals[lane].some((interval) => left <= interval.right + minGap && right >= interval.left - minGap);
        if (!collides) {
          laneIntervals[lane].push({ left, right });
          laneIntervals[lane].sort((leftInterval, rightInterval) => leftInterval.left - rightInterval.left);
          return { ...label, lane, textX: anchoredTextX };
        }
      }

      for (let lane = 0; lane < maxLabelLanes; lane += 1) {
        if (!laneIntervals[lane]) {
          laneIntervals[lane] = [];
        }
        const textX = findLinearLabelPosition({
          anchorX: label.x,
          halfWidth,
          intervals: laneIntervals[lane],
          leftLimit,
          rightLimit,
          minGap,
          maxNudge
        });
        if (textX === null) continue;
        laneIntervals[lane].push({ left: textX - halfWidth, right: textX + halfWidth });
        laneIntervals[lane].sort((leftInterval, rightInterval) => leftInterval.left - rightInterval.left);
        return { ...label, lane, textX };
      }
      return { ...label, hidden: true };
    });
}

function findLinearLabelPosition({ anchorX, halfWidth, intervals, leftLimit, rightLimit, minGap, maxNudge }) {
  const minCenter = leftLimit + halfWidth;
  const maxCenter = rightLimit - halfWidth;
  const clampedAnchor = Math.max(minCenter, Math.min(maxCenter, anchorX));
  const candidates = [clampedAnchor];
  for (const interval of intervals) {
    candidates.push(interval.left - minGap - halfWidth, interval.right + minGap + halfWidth);
  }
  const sorted = Array.from(new Set(candidates.map((value) => Number(value.toFixed(3)))))
    .filter((value) => value >= minCenter && value <= maxCenter)
    .filter((value) => Math.abs(value - anchorX) <= maxNudge || value === clampedAnchor)
    .sort((left, right) => Math.abs(left - anchorX) - Math.abs(right - anchorX));
  for (const center of sorted) {
    const left = center - halfWidth;
    const right = center + halfWidth;
    const collides = intervals.some((interval) => left <= interval.right + minGap && right >= interval.left - minGap);
    if (!collides) {
      return center;
    }
  }
  const sweepStep = 8;
  for (let distance = sweepStep; distance <= maxNudge; distance += sweepStep) {
    for (const direction of [-1, 1]) {
      const center = clampedAnchor + direction * distance;
      if (center < minCenter || center > maxCenter) continue;
      const left = center - halfWidth;
      const right = center + halfWidth;
      const collides = intervals.some((interval) => left <= interval.right + minGap && right >= interval.left - minGap);
      if (!collides) {
        return center;
      }
    }
  }
  return null;
}

function shouldLabelLinearFeature(feature) {
  if (feature.className === "source") {
    return false;
  }
  if (feature.showLabel === false) {
    return false;
  }
  return feature.className !== "variant" || feature.showLabel === true;
}

function linearSegmentCount(sequenceLength, options = {}) {
  if (options.segmentLength) {
    return Math.max(1, Math.ceil(sequenceLength / Math.max(1, Number(options.segmentLength))));
  }
  if (sequenceLength <= 600) {
    return 1;
  }
  if (sequenceLength <= 7000) {
    return 3;
  }
  if (sequenceLength <= 12000) {
    return 4;
  }
  return 6;
}

function roundSegmentSpan(rawSpan) {
  const span = Math.max(1, Number(rawSpan) || 1);
  let step = 1;
  if (span >= 50000) {
    step = 5000;
  } else if (span >= 5000) {
    step = 1000;
  } else if (span >= 1000) {
    step = 100;
  } else if (span >= 250) {
    step = 50;
  } else if (span >= 50) {
    step = 10;
  }
  return Math.max(1, Math.ceil(span / step) * step);
}

function linearSegmentSpan(sequenceLength, count, options = {}) {
  if (options.segmentLength) {
    return Math.max(1, Number(options.segmentLength));
  }
  if (count <= 1) {
    return Math.max(1, sequenceLength);
  }
  return roundSegmentSpan(Math.ceil(sequenceLength / count));
}

function linearSegments(sequenceLength, options = {}) {
  const count = linearSegmentCount(sequenceLength, options);
  const span = linearSegmentSpan(sequenceLength, count, options);
  const segmentCount = Math.max(1, Math.ceil(sequenceLength / span));
  return Array.from({ length: segmentCount }, (_, index) => {
    const start = index * span + 1;
    return {
      start,
      end: Math.min(sequenceLength, start + span - 1),
      span
    };
  });
}

function niceTickStep(rawStep) {
  const value = Math.max(1, Number(rawStep) || 1);
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const choices = [1, 1.5, 2, 2.5, 5, 10];
  const picked = choices.find((choice) => normalized <= choice) ?? 10;
  return Math.max(1, Math.round(picked * magnitude));
}

function linearSegmentTicks(segment, targetTickCount) {
  const span = Math.max(1, Number(segment.span) || (segment.end - segment.start + 1));
  const tickStep = niceTickStep(span / Math.max(1, targetTickCount));
  const ticks = [];
  let position = Math.ceil(segment.start / tickStep) * tickStep;
  if (position <= segment.start) {
    position += tickStep;
  }
  while (position < segment.end) {
    ticks.push(position);
    position += tickStep;
  }
  return ticks;
}

function axisLabelBounds(x, label, anchor = "middle") {
  const width = estimateTextWidth(label, 12) + 8;
  if (anchor === "end") {
    return { left: x - width, right: x };
  }
  if (anchor === "start") {
    return { left: x, right: x + width };
  }
  return { left: x - width / 2, right: x + width / 2 };
}

function axisLabelOverlaps(bounds, placedBounds, gap = 8) {
  return placedBounds.some((placed) =>
    bounds.left < placed.right + gap && placed.left < bounds.right + gap
  );
}

function clippedFeatureForSegment(feature, segment) {
  const parts = (feature.parts?.length ? feature.parts : [feature])
    .map((part) => ({
      ...part,
      clippedStart: Math.max(part.start, segment.start),
      clippedEnd: Math.min(part.end, segment.end)
    }))
    .filter((part) => part.clippedStart <= part.clippedEnd);
  if (parts.length === 0) {
    return null;
  }
  return { ...feature, clippedParts: parts };
}

function linearFeaturePartGeometry(feature, part, renderedSegment, segmentLength, left, width) {
  const x1 = scaleLinearPosition(part.clippedStart - renderedSegment.start + 1, segmentLength, left, width);
  const x2 = scaleLinearPosition(part.clippedEnd - renderedSegment.start + 1, segmentLength, left, width);
  if (feature.pointMarker === true) {
    const markerWidth = Number.isFinite(Number(feature.markerWidth)) ? Number(feature.markerWidth) : 6;
    const anchorX = (x1 + x2) / 2;
    return {
      x1,
      x2,
      left: anchorX - markerWidth / 2,
      right: anchorX + markerWidth / 2,
      centerX: anchorX,
      renderedWidth: markerWidth,
      markerWidth
    };
  }
  const renderedWidth = Math.max(3, x2 - x1);
  return {
    x1,
    x2,
    left: x1,
    right: x1 + renderedWidth,
    centerX: x1 + renderedWidth / 2,
    renderedWidth,
    markerWidth: renderedWidth
  };
}

function renderLinearFeaturePart(feature, part, renderedSegment, segmentLength, left, width, y, height, style) {
  const geometry = linearFeaturePartGeometry(feature, part, renderedSegment, segmentLength, left, width);
  const { x1, x2, renderedWidth } = geometry;
  if (feature.connector === true) {
    const centerY = y + height / 2;
    const segmentBaseCount = renderedSegment.end - renderedSegment.start + 1;
    const segmentRight = scaleLinearPosition(segmentBaseCount, segmentLength, left, width);
    const baseStepPx = segmentLength > 1 ? width / (segmentLength - 1) : 0;
    const connectorEndGapPx = Number(feature.connectorEndGapPx);
    const connectorExtensionPx = Number.isFinite(connectorEndGapPx)
      ? Math.max(0, baseStepPx - Math.max(0, connectorEndGapPx))
      : 0;
    const connectorX1 = Math.max(left, x1 - connectorExtensionPx);
    const connectorX2 = Math.min(segmentRight, x2 + connectorExtensionPx);
    const dash = feature.dashArray ? ` stroke-dasharray="${escapeXml(feature.dashArray)}"` : "";
    const opacity = Number.isFinite(Number(feature.opacity)) ? ` opacity="${Number(feature.opacity)}"` : "";
    return `<line class="feature-connector feature-${feature.className}" x1="${connectorX1.toFixed(2)}" y1="${centerY.toFixed(2)}" x2="${connectorX2.toFixed(2)}" y2="${centerY.toFixed(2)}" stroke="${style.stroke}"${dash}${opacity}></line>`;
  }
  if (feature.pointMarker === true) {
    const markerWidth = geometry.markerWidth;
    const anchorX = geometry.centerX;
    const markerX = anchorX - markerWidth / 2;
    return `<rect class="feature feature-${feature.className}" data-point-marker="true" data-anchor-x="${anchorX.toFixed(2)}" x="${markerX.toFixed(2)}" y="${y}" width="${markerWidth.toFixed(2)}" height="${height}" rx="2" fill="${style.fill}" stroke="${style.stroke}"></rect>`;
  }
  const opacity = feature.className === "source" ? "0.35" : "1";
  const continuesBefore = part.clippedStart > part.start;
  const continuesAfter = part.clippedEnd < part.end;
  if (!continuesBefore && !continuesAfter) {
    return `<rect class="feature feature-${feature.className}" x="${x1.toFixed(2)}" y="${y}" width="${renderedWidth.toFixed(2)}" height="${height}" rx="2" fill="${style.fill}" stroke="${style.stroke}" opacity="${opacity}"></rect>`;
  }
  const right = x1 + renderedWidth;
  const top = y;
  const bottom = y + height;
  const parts = [
    `<rect class="feature feature-${feature.className}" data-open-boundary="true" x="${x1.toFixed(2)}" y="${y}" width="${renderedWidth.toFixed(2)}" height="${height}" rx="0" fill="${style.fill}" stroke="none" opacity="${opacity}"></rect>`,
    `<line class="feature-boundary feature-${feature.className}-boundary" x1="${x1.toFixed(2)}" y1="${top}" x2="${right.toFixed(2)}" y2="${top}" stroke="${style.stroke}"></line>`,
    `<line class="feature-boundary feature-${feature.className}-boundary" x1="${x1.toFixed(2)}" y1="${bottom}" x2="${right.toFixed(2)}" y2="${bottom}" stroke="${style.stroke}"></line>`
  ];
  if (!continuesBefore) {
    parts.push(`<line class="feature-boundary feature-${feature.className}-boundary" x1="${x1.toFixed(2)}" y1="${top}" x2="${x1.toFixed(2)}" y2="${bottom}" stroke="${style.stroke}"></line>`);
  }
  if (!continuesAfter) {
    parts.push(`<line class="feature-boundary feature-${feature.className}-boundary" x1="${right.toFixed(2)}" y1="${top}" x2="${right.toFixed(2)}" y2="${bottom}" stroke="${style.stroke}"></line>`);
  }
  return parts.join("\n");
}

function renderLinearRecord(record, rowTop, styles, classes, options = {}) {
  const left = 70;
  const right = 890;
  const width = right - left;
  const sequenceLength = Math.max(0, Number(record.length) || 0);
  const features = assignLinearFeatureLanes(
    (record.features ?? [])
      .filter((feature) => feature.start && feature.end)
      .map((feature) => normalizeFeature(feature, sequenceLength))
  );
  for (const feature of features) {
    classes.add(feature.className);
  }
  const segments = linearSegments(sequenceLength, options);
  const renderedSegments = [];
  let segmentOffset = 42;
  let totalHiddenLabels = 0;
  for (const segment of segments) {
    const segmentFeatures = features
      .map((feature) => clippedFeatureForSegment(feature, segment))
      .filter(Boolean);
    const inlineLabels = [];
    const maxFeatureLane = Math.max(0, ...segmentFeatures.map((feature) => feature.lane));
    const segmentHeightBase = 58 + (maxFeatureLane + 1) * 18;
    const maxSegmentLabels = Number.isFinite(Number(options.maxLinearLabelsPerSegment))
      ? Math.max(0, Number(options.maxLinearLabelsPerSegment))
      : 64;
    const sortedLabelFeatures = segmentFeatures
      .filter(shouldLabelLinearFeature)
      .sort((leftFeature, rightFeature) =>
        featureLabelPriority(leftFeature) - featureLabelPriority(rightFeature) ||
        largestPartLength(rightFeature) - largestPartLength(leftFeature)
      );
    totalHiddenLabels += Math.max(0, sortedLabelFeatures.length - maxSegmentLabels);
    const labelCandidates = sortedLabelFeatures
      .slice(0, maxSegmentLabels)
      .map((feature) => {
        const largestPart = feature.clippedParts
          .slice()
          .sort((leftPart, rightPart) => (rightPart.clippedEnd - rightPart.clippedStart) - (leftPart.clippedEnd - leftPart.clippedStart))[0];
        const segmentSpan = segment.span ?? (segment.end - segment.start + 1);
        const geometry = linearFeaturePartGeometry(feature, largestPart, segment, segmentSpan, left, width);
        const markerWidth = geometry.markerWidth;
        const label = truncateLabel(feature.label, 32);
        const barHeight = feature.className === "source" ? LINEAR_SOURCE_BAR_HEIGHT : LINEAR_FEATURE_BAR_HEIGHT;
        const labelFitsInside = barHeight >= INSIDE_FEATURE_LABEL_MIN_BAR_HEIGHT &&
          geometry.renderedWidth >= estimateTextWidth(label, INSIDE_FEATURE_LABEL_FONT_SIZE, 0.62) + INSIDE_FEATURE_LABEL_PADDING;
        if (feature.labelPlacement !== "external" && labelFitsInside) {
          inlineLabels.push({ ...feature, label, x: geometry.centerX, lane: feature.lane, height: barHeight });
          return null;
        }
        return {
          ...feature,
          label,
          x: geometry.centerX,
          featureLane: feature.lane,
          leaderStartOffset: 14 + feature.lane * 18 + barHeight / 2,
          markerWidth
        };
      })
      .filter(Boolean);
    const labels = assignLinearLabelLanes(labelCandidates, left, right);
    const maxLabelLane = Math.max(0, ...labels.map((label) => label.lane));
    const labelTop = segmentHeightBase + 20;
    const segmentHeight = labelTop + (maxLabelLane + 1) * 22 + 18;
    totalHiddenLabels += labels.filter((label) => label.hidden).length;
    renderedSegments.push({ segment, segmentFeatures, inlineLabels, labels, top: segmentOffset, height: segmentHeight, labelTop });
    segmentOffset += segmentHeight + 12;
  }
  const recordNotes = Array.isArray(record.notes) ? record.notes.filter(Boolean) : [];
  const noteCount = totalHiddenLabels > 0
    ? recordNotes.length + 1
    : recordNotes.length;
  const hasRecordNotes = noteCount > 0 || (options.forceLinearCircularNote && record.topology === "circular");
  const rowHeight = segmentOffset + (hasRecordNotes ? 18 + Math.max(1, noteCount) * 18 : -10);
  const parts = [`<g class="map-record" transform="translate(0 ${rowTop})">`];
  const unit = record.molecule === "protein" ? "aa" : "bp";
  const recordTitle = record.molecule === "protein"
    ? `${record.title} (${sequenceLength.toLocaleString()} ${unit})`
    : `${record.title} linear feature map (${sequenceLength.toLocaleString()} ${unit})`;
  parts.push(`<text class="record-title" x="${left}" y="22">${escapeXml(recordTitle)}</text>`);
  const externalLabelOverlayParts = [];
  const inlineLabelOverlayParts = [];
  for (const rendered of renderedSegments) {
    const axisY = rendered.top + 22;
    const segmentLength = rendered.segment.end - rendered.segment.start + 1;
    const segmentSpan = rendered.segment.span ?? segmentLength;
    const segmentRight = scaleLinearPosition(segmentLength, segmentSpan, left, width);
    parts.push(`<line class="axis" x1="${left}" y1="${axisY}" x2="${segmentRight.toFixed(2)}" y2="${axisY}" data-segment-span="${segmentSpan}" data-segment-start="${rendered.segment.start}" data-segment-end="${rendered.segment.end}"></line>`);
    const startLabel = rendered.segment.start.toLocaleString();
    const endLabel = rendered.segment.end.toLocaleString();
    const axisLabelY = axisY - 10;
    const placedAxisLabelBounds = [axisLabelBounds(left, startLabel, "start")];
    parts.push(`<text class="axis-label" x="${left}" y="${axisLabelY}">${escapeXml(startLabel)}</text>`);
    const endBounds = axisLabelBounds(segmentRight, endLabel, "end");
    if (!axisLabelOverlaps(endBounds, placedAxisLabelBounds, 10)) {
      placedAxisLabelBounds.push(endBounds);
      parts.push(`<text class="axis-label" x="${segmentRight.toFixed(2)}" y="${axisLabelY}" text-anchor="end">${escapeXml(endLabel)}</text>`);
    }
    const tickCount = segmentSpan >= 1000 ? 5 : 4;
    for (const position of linearSegmentTicks(rendered.segment, tickCount)) {
      const offset = position - rendered.segment.start + 1;
      const x = scaleLinearPosition(offset, segmentSpan, left, width);
      parts.push(`<line class="axis-tick" x1="${x.toFixed(2)}" y1="${axisY - 5}" x2="${x.toFixed(2)}" y2="${axisY + 5}"></line>`);
      const tickLabel = position.toLocaleString();
      const tickBounds = axisLabelBounds(x, tickLabel, "middle");
      if (!axisLabelOverlaps(tickBounds, placedAxisLabelBounds)) {
        placedAxisLabelBounds.push(tickBounds);
        parts.push(`<text class="axis-label" x="${x.toFixed(2)}" y="${axisLabelY}" text-anchor="middle">${escapeXml(tickLabel)}</text>`);
      }
    }
    const leaderParts = [];
    const externalLabelParts = [];
    for (const label of rendered.labels) {
      if (label.hidden) {
        continue;
      }
      const y = rendered.top + rendered.labelTop + label.lane * 21;
      const leaderStartY = axisY + (Number.isFinite(Number(label.leaderStartOffset)) ? Number(label.leaderStartOffset) : 0);
      leaderParts.push(`<line class="label-leader" x1="${label.x.toFixed(2)}" y1="${leaderStartY.toFixed(2)}" x2="${label.x.toFixed(2)}" y2="${y - 11}"></line>`);
      externalLabelParts.push(`<text class="feature-label" x="${label.textX.toFixed(2)}" y="${y}" text-anchor="middle">${escapeXml(truncateLabel(label.label, 34))}</text>`);
    }
    parts.push(...leaderParts);
    for (const feature of rendered.segmentFeatures) {
      const style = styleForFeature(feature, styles);
      const y = axisY + 14 + feature.lane * 18;
      const height = feature.className === "source" ? LINEAR_SOURCE_BAR_HEIGHT : LINEAR_FEATURE_BAR_HEIGHT;
      for (const part of feature.clippedParts) {
        parts.push(renderLinearFeaturePart(feature, part, rendered.segment, segmentSpan, left, width, y, height, style));
      }
    }
    externalLabelOverlayParts.push(...externalLabelParts);
    for (const label of rendered.inlineLabels) {
      const y = axisY + 14 + label.lane * 18 + Math.max(1, Number(label.height) || 10) / 2;
      const className = label.compactLabel ? "feature-label-inside feature-label-inside-compact" : "feature-label-inside";
      const labelStyle = insideFeatureLabelStyle(styleForFeature(label, styles), label.compactLabel);
      inlineLabelOverlayParts.push(`<text class="${className}" x="${label.x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" style="${labelStyle}">${escapeXml(label.label)}</text>`);
    }
  }
  parts.push(...externalLabelOverlayParts, ...inlineLabelOverlayParts);
  let noteY = rowHeight - 12 - Math.max(0, noteCount - 1) * 18;
  for (const note of recordNotes) {
    parts.push(`<text class="axis-note" x="${left}" y="${noteY}">${escapeXml(note)}</text>`);
    noteY += 18;
  }
  if (totalHiddenLabels > 0) {
    parts.push(`<text class="axis-note" x="${left}" y="${noteY}">${totalHiddenLabels} feature label(s) hidden; see feature table.</text>`);
    noteY += 18;
  }
  if (options.forceLinearCircularNote && record.topology === "circular") {
    parts.push(`<text class="axis-note" x="${left}" y="${rowHeight - 28}">Circular record shown as a linear coordinate overview.</text>`);
  }
  parts.push("</g>");
  return { svg: parts.join("\n"), height: rowHeight };
}

function labelAnchorForAngle(angle) {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized > 20 && normalized < 160) {
    return "start";
  }
  if (normalized > 200 && normalized < 340) {
    return "end";
  }
  return "middle";
}

function circularLabelZoneForAngle(angle) {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized >= 330 || normalized <= 30) {
    return "top";
  }
  if (normalized >= 150 && normalized <= 210) {
    return "bottom";
  }
  return normalized < 180 ? "right" : "left";
}

function boxesOverlap(left, right, padding = 0) {
  return !(
    left.right + padding <= right.left
    || right.right + padding <= left.left
    || left.bottom + padding <= right.top
    || right.bottom + padding <= left.top
  );
}

function lineBoxIntersection(x1, y1, x2, y2, box) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const candidates = [];
  const addCandidate = (t, x, y) => {
    if (
      t >= 0
      && t <= 1
      && x >= box.left - 0.1
      && x <= box.right + 0.1
      && y >= box.top - 0.1
      && y <= box.bottom + 0.1
    ) {
      candidates.push({ t, x, y });
    }
  };
  if (Math.abs(dx) > 0.001) {
    for (const x of [box.left, box.right]) {
      const t = (x - x1) / dx;
      addCandidate(t, x, y1 + t * dy);
    }
  }
  if (Math.abs(dy) > 0.001) {
    for (const y of [box.top, box.bottom]) {
      const t = (y - y1) / dy;
      addCandidate(t, x1 + t * dx, y);
    }
  }
  candidates.sort((left, right) => left.t - right.t);
  return candidates[0] ?? null;
}

function circularLabelBox(centerX, centerY, width) {
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - CIRCULAR_LABEL_BOX_HEIGHT / 2,
    bottom: centerY + CIRCULAR_LABEL_BOX_HEIGHT / 2
  };
}

function boxDistanceFromPoint(box, x, y) {
  const nearestX = Math.max(box.left, Math.min(x, box.right));
  const nearestY = Math.max(box.top, Math.min(y, box.bottom));
  return Math.hypot(nearestX - x, nearestY - y);
}

function placeCircularLabels(labels, bounds) {
  const { minY, maxY, minX, maxX, centerX, centerY, exclusionRadius = 0 } = bounds;
  const placed = [];
  const placedBoxes = [];
  const padding = 5;
  const radiusStep = 14;
  const sorted = labels
    .slice()
    .sort((left, right) => (left.labelRank ?? 0) - (right.labelRank ?? 0) || left.angle - right.angle);

  for (const label of sorted) {
    const vectorX = label.leaderStart.x - centerX;
    const vectorY = label.leaderStart.y - centerY;
    const anchorRadius = Math.max(1, Math.hypot(vectorX, vectorY));
    const ux = vectorX / anchorRadius;
    const uy = vectorY / anchorRadius;
    const width = Math.max(26, Math.min(estimateTextWidth(label.text, CIRCULAR_LABEL_FONT_SIZE) + CIRCULAR_LABEL_BOX_PADDING_X * 2, 230));
    const halfWidth = width / 2;
    const halfHeight = CIRCULAR_LABEL_BOX_HEIGHT / 2;
    let maxRadius = Number.POSITIVE_INFINITY;
    if (ux > 0.001) maxRadius = Math.min(maxRadius, (maxX - halfWidth - centerX) / ux);
    if (ux < -0.001) maxRadius = Math.min(maxRadius, (minX + halfWidth - centerX) / ux);
    if (uy > 0.001) maxRadius = Math.min(maxRadius, (maxY - halfHeight - centerY) / uy);
    if (uy < -0.001) maxRadius = Math.min(maxRadius, (minY + halfHeight - centerY) / uy);
    if (!Number.isFinite(maxRadius)) {
      continue;
    }
    const radialBoxHalfExtent = Math.abs(ux) * halfWidth + Math.abs(uy) * halfHeight;
    const startRadius = Math.max(
      anchorRadius + 22,
      anchorRadius + radialBoxHalfExtent + 12,
      exclusionRadius + Math.min(halfWidth, halfHeight)
    );
    for (let radius = startRadius; radius <= maxRadius + 0.1; radius += radiusStep) {
      const x = centerX + ux * radius;
      const y = centerY + uy * radius;
      const box = circularLabelBox(x, y, width);
      if (exclusionRadius > 0 && boxDistanceFromPoint(box, centerX, centerY) < exclusionRadius) {
        continue;
      }
      if (placedBoxes.some((existing) => boxesOverlap(box, existing, padding))) {
        continue;
      }
      placedBoxes.push(box);
      placed.push({
        ...label,
        anchor: "middle",
        textX: x,
        textY: y + 4,
        labelBox: box,
        connector: lineBoxIntersection(label.leaderStart.x, label.leaderStart.y, x, y, box) ?? { x, y }
      });
      break;
    }
  }
  return placed.sort((left, right) => left.angle - right.angle);
}

function circularAxisTicks(sequenceLength, targetTickCount = 8) {
  if (!Number.isFinite(sequenceLength) || sequenceLength <= 0) {
    return [];
  }
  const step = niceTickStep(sequenceLength / Math.max(1, targetTickCount));
  const ticks = [{ position: 1, label: "1", major: true }];
  for (let position = step; position < sequenceLength; position += step) {
    ticks.push({ position, label: position.toLocaleString(), major: true });
  }
  return ticks;
}

function circularMinorAxisTicks(sequenceLength, majorTicks) {
  if (majorTicks.length < 2) {
    return [];
  }
  const majorStep = majorTicks[1].position - majorTicks[0].position;
  const minorStep = niceTickStep(majorStep / 5);
  if (minorStep >= majorStep || minorStep < 2) {
    return [];
  }
  const majorPositions = new Set(majorTicks.map((tick) => tick.position));
  const ticks = [];
  for (let position = minorStep; position < sequenceLength; position += minorStep) {
    if (!majorPositions.has(position)) {
      ticks.push({ position });
    }
  }
  return ticks;
}

function renderCircularAxis(centerX, centerY, axisRadius, sequenceLength) {
  const parts = [`<circle class="circle-axis" cx="${centerX}" cy="${centerY}" r="${axisRadius}" fill="none"></circle>`];
  const majorTicks = circularAxisTicks(sequenceLength);
  const minorTicks = circularMinorAxisTicks(sequenceLength, majorTicks);
  for (const tick of minorTicks) {
    const angle = ((tick.position - 1) / sequenceLength) * 360;
    const inner = polarToCartesian(centerX, centerY, axisRadius - 4, angle);
    const outer = polarToCartesian(centerX, centerY, axisRadius + 4, angle);
    parts.push(`<line class="axis-tick axis-tick-minor" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}"></line>`);
  }
  for (const tick of majorTicks) {
    const angle = ((tick.position - 1) / sequenceLength) * 360;
    const inner = polarToCartesian(centerX, centerY, axisRadius - 8, angle);
    const outer = polarToCartesian(centerX, centerY, axisRadius + 8, angle);
    const label = polarToCartesian(centerX, centerY, axisRadius - 28, angle);
    const anchor = labelAnchorForAngle(angle);
    parts.push(`<line class="axis-tick" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}"></line>`);
    parts.push(`<text class="axis-label axis-label-circular" x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" text-anchor="${anchor}">${escapeXml(tick.label)}</text>`);
  }
  return parts.join("\n");
}

function renderCircularLabelLeader(label) {
  if (label.connector) {
    const points = [
      `${label.leaderStart.x.toFixed(2)},${label.leaderStart.y.toFixed(2)}`,
      `${label.connector.x.toFixed(2)},${label.connector.y.toFixed(2)}`
    ].join(" ");
    return `<polyline class="label-leader" points="${points}"></polyline>`;
  }
  const textEdgeX = label.anchor === "start" ? label.textX - 10 : label.textX + 10;
  const points = [
    `${label.leaderStart.x.toFixed(2)},${label.leaderStart.y.toFixed(2)}`,
    `${label.leaderEnd.x.toFixed(2)},${label.leaderEnd.y.toFixed(2)}`,
    `${textEdgeX.toFixed(2)},${label.textY.toFixed(2)}`
  ].join(" ");
  return `<polyline class="label-leader" points="${points}"></polyline>`;
}

function renderCircularRecord(record, styles, classes) {
  const sequenceLength = Math.max(0, Number(record.length) || 0);
  const centerX = 550;
  const centerY = 362;
  const axisRadius = 118;
  const ringBase = 142;
  const features = (record.features ?? [])
    .filter((feature) => feature.start && feature.end)
    .map((feature) => normalizeFeature(feature, sequenceLength));
  const drawable = features.filter((feature) => feature.className !== "source");
  const featureRadii = new Map();
  drawable.forEach((feature, index) => {
    featureRadii.set(feature, ringBase + (feature.ring ?? feature.slot ?? index % 3) * 12);
  });
  for (const feature of drawable) {
    classes.add(feature.className);
  }
  const parts = [];
  parts.push(`<text class="record-title" x="32" y="54">${escapeXml(record.title)} circular feature map (${sequenceLength.toLocaleString()} bp)</text>`);
  if (drawable.some((feature) => feature.parts.length > 1)) {
    parts.push(`<text class="axis-note" x="32" y="74">Joined or origin-spanning locations are drawn as separate arcs.</text>`);
  }
  parts.push(renderCircularAxis(centerX, centerY, axisRadius, sequenceLength));
  drawable.forEach((feature) => {
    const style = styleForFeature(feature, styles);
    const radius = featureRadii.get(feature) ?? ringBase;
    for (const part of feature.parts) {
      const startAngle = ((part.start - 1) / sequenceLength) * 360;
      const endAngle = Math.min(359.9, Math.max(startAngle + 1, (part.end / sequenceLength) * 360));
      parts.push(`<path class="feature feature-${feature.className}" d="${describeArc(centerX, centerY, radius, startAngle, endAngle)}" fill="none" stroke="${style.stroke}" stroke-width="8" stroke-linecap="butt"></path>`);
    }
  });
  const labelLimit = 64;
  const labelableFeatures = drawable.filter((feature) => feature.className !== "variant").length;
  const labelMaxY = 704;
  const labelMinY = 86;
  const labelMinX = 24;
  const labelMaxX = 1076;
  const rawLabels = drawable
    .filter((feature) => feature.className !== "variant")
    .sort((left, right) => {
      return featureLabelPriority(left) - featureLabelPriority(right) ||
        largestPartLength(right) - largestPartLength(left);
    })
    .slice(0, labelLimit)
    .map((feature, index) => {
      const angle = featureMidAngle(feature, sequenceLength);
      const radius = featureRadii.get(feature) ?? ringBase;
      const leaderStart = polarToCartesian(centerX, centerY, radius, angle);
      const leaderEnd = polarToCartesian(centerX, centerY, radius + 19, angle);
      const textPoint = polarToCartesian(centerX, centerY, radius + 55, angle);
      const zone = circularLabelZoneForAngle(angle);
      const anchor = zone === "right" ? "start" : zone === "left" ? "end" : "middle";
      const text = truncateLabel(feature.label, 30);
      return {
        feature,
        angle,
        labelRank: index,
        leaderStart,
        leaderEnd,
        text,
        naturalX: textPoint.x,
        naturalY: textPoint.y,
        anchor,
        zone
      };
    });
  const labels = placeCircularLabels(rawLabels, {
    minY: labelMinY,
    maxY: labelMaxY,
    minX: labelMinX,
    maxX: labelMaxX,
    centerX,
    centerY,
    exclusionRadius: Math.max(
      ...drawable.map((feature) => featureRadii.get(feature) ?? ringBase),
      ringBase
    ) + CIRCULAR_FEATURE_STROKE_WIDTH / 2 + CIRCULAR_LABEL_RING_CLEARANCE
  });
  const circularAnchorParts = [];
  const circularLeaderParts = [];
  const circularLabelBoxParts = [];
  const circularLabelTextParts = [];
  for (const label of labels) {
    const style = styleForFeature(label.feature, styles);
    circularLeaderParts.push(renderCircularLabelLeader(label));
    circularAnchorParts.push(`<circle class="circular-label-anchor" cx="${label.leaderStart.x.toFixed(2)}" cy="${label.leaderStart.y.toFixed(2)}" r="2.15" fill="${style.stroke}" stroke="#ffffff" stroke-width="0.8"></circle>`);
    if (label.labelBox) {
      circularLabelBoxParts.push(`<rect class="feature-label-box" x="${label.labelBox.left.toFixed(2)}" y="${label.labelBox.top.toFixed(2)}" width="${(label.labelBox.right - label.labelBox.left).toFixed(2)}" height="${CIRCULAR_LABEL_BOX_HEIGHT}" rx="2"></rect>`);
    }
    circularLabelTextParts.push(`<text class="feature-label feature-label-circular-boxed" data-label-zone="${label.zone}" x="${label.textX.toFixed(2)}" y="${label.textY.toFixed(2)}" text-anchor="${label.anchor}">${escapeXml(label.text)}</text>`);
  }
  parts.push(...circularLeaderParts, ...circularAnchorParts, ...circularLabelBoxParts, ...circularLabelTextParts);
  const hiddenLabels = Math.max(0, labelableFeatures - labels.length);
  if (hiddenLabels > 0) {
    parts.push(`<text class="axis-note" x="32" y="710">${hiddenLabels} feature label(s) hidden; see feature table.</text>`);
  }
  return { svg: parts.join("\n"), height: hiddenLabels > 0 ? 780 : 736 };
}

export function renderSequenceMap({ title = "Feature map", records = [], styles = defaultFeatureStyles, layout = "auto" } = {}) {
  const drawableRecords = records.filter((record) => record.length > 0);
  if (drawableRecords.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 130" role="img" aria-label="No feature map available"><style>.title{font:600 18px system-ui,sans-serif;fill:#111827}.note{font:13px system-ui,sans-serif;fill:#475569}</style><text class="title" x="32" y="42">${escapeXml(title)}</text><text class="note" x="32" y="78">No sequence was available to draw.</text></svg>`;
  }
  const requestedLayout = layout === "linear" || layout === "circular" ? layout : "auto";
  const classes = new Set();
  let width = 840;
  let height = 0;
  let body = "";
  const shouldRenderCircular = (record) => record.molecule !== "protein" && (
    requestedLayout === "circular" ||
    (requestedLayout === "auto" && record.topology === "circular" && drawableRecords.length === 1)
  );
  if (drawableRecords.some(shouldRenderCircular)) {
    width = 1100;
    let rowTop = 62;
    const parts = [];
    for (const record of drawableRecords) {
      if (shouldRenderCircular(record)) {
        const rendered = renderCircularRecord(record, styles, classes);
        parts.push(`<g transform="translate(0 ${rowTop})">`);
        parts.push(rendered.svg);
        parts.push("</g>");
        rowTop += rendered.height;
      } else {
        const rendered = renderLinearRecord(record, rowTop, styles, classes);
        parts.push(rendered.svg);
        rowTop += rendered.height;
      }
    }
    body = parts.join("\n");
    height = rowTop + 40;
  } else {
    width = 960;
    let rowTop = 62;
    const parts = [];
    for (const record of drawableRecords) {
      const rendered = renderLinearRecord(record, rowTop, styles, classes, { forceLinearCircularNote: drawableRecords.length > 1 });
      parts.push(rendered.svg);
      rowTop += rendered.height;
    }
    body = parts.join("\n");
    height = rowTop + 40;
  }
  const legendX = 32;
  const legendMaxWidth = width - legendX - 32;
  const legendRows = getLegendLayout(classes, styles, { maxWidth: legendMaxWidth }).rows;
  const legendTop = height - 24;
  const legend = renderLegend(classes, styles, legendX, legendTop, { maxWidth: legendMaxWidth });
  const viewHeight = legend ? legendTop + legendRows * 24 + 20 : height;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${viewHeight}" role="img" aria-label="${escapeXml(title)}" data-sequence-map-renderer="sms3">`,
    "<style>",
    "[data-sequence-map-renderer=\"sms3\"] .title{font:700 18px system-ui,-apple-system,Segoe UI,sans-serif;fill:#111827}",
    "[data-sequence-map-renderer=\"sms3\"] .record-title{font:600 15px system-ui,-apple-system,Segoe UI,sans-serif;fill:#111827}",
    "[data-sequence-map-renderer=\"sms3\"] .axis,[data-sequence-map-renderer=\"sms3\"] .circle-axis{stroke:#334155;stroke-width:1.5}",
    "[data-sequence-map-renderer=\"sms3\"] .axis-tick{stroke:#64748b;stroke-width:1}",
    "[data-sequence-map-renderer=\"sms3\"] .axis-tick-minor{stroke:#94a3b8;stroke-width:.75}",
    "[data-sequence-map-renderer=\"sms3\"] .feature-boundary{stroke-width:1}",
    "[data-sequence-map-renderer=\"sms3\"] .axis-label,[data-sequence-map-renderer=\"sms3\"] .axis-note{font:12px system-ui,-apple-system,Segoe UI,sans-serif;fill:#475569;stroke:none;stroke-width:0;paint-order:normal}",
    "[data-sequence-map-renderer=\"sms3\"] .axis-label-circular{font-size:10.5px;fill:#64748b}",
    "[data-sequence-map-renderer=\"sms3\"] .feature-connector{stroke-width:1.25;fill:none;stroke-linecap:round}",
    "[data-sequence-map-renderer=\"sms3\"] .feature-label{font:12.5px system-ui,-apple-system,Segoe UI,sans-serif;fill:#111827;paint-order:stroke;stroke:#fff;stroke-width:2.75px;stroke-linejoin:round}",
    `[data-sequence-map-renderer="sms3"] .feature-label-circular-boxed{font-size:${CIRCULAR_LABEL_FONT_SIZE}px}`,
    "[data-sequence-map-renderer=\"sms3\"] .feature-label-box{fill:#f8fafc;stroke:#dfe7ec;stroke-width:1}",
    `[data-sequence-map-renderer="sms3"] .feature-label-inside{font:600 ${INSIDE_FEATURE_LABEL_FONT_SIZE}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:#f8fafc;paint-order:stroke;stroke:#0f172a;stroke-width:.85px;stroke-opacity:.76;stroke-linejoin:round}`,
    `[data-sequence-map-renderer="sms3"] .feature-label-inside-compact{font-size:${INSIDE_FEATURE_LABEL_COMPACT_FONT_SIZE}px;stroke-width:.7px}`,
    "[data-sequence-map-renderer=\"sms3\"] .label-leader{stroke:#cbd5e1;stroke-width:1;fill:none}",
    "[data-sequence-map-renderer=\"sms3\"] .legend-frame{fill:#f8fafc;stroke:#dfe7ec;stroke-width:1}",
    "[data-sequence-map-renderer=\"sms3\"] .legend text{font:12px system-ui,-apple-system,Segoe UI,sans-serif;fill:#111827}",
    "</style>",
    `<text class="title" x="32" y="28">${escapeXml(title)}</text>`,
    body,
    legend,
    "</svg>"
  ].join("\n");
}
