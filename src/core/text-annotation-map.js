import { complementDnaRnaSequence } from "./sequence.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeBlank(width) {
  return Array.from({ length: width }, () => " ");
}

function placeText(lanes, text, startIndex, width, options = {}) {
  const label = String(text ?? "").slice(0, width);
  const start = clamp(startIndex, 0, Math.max(0, width - label.length));
  const spacing = Math.max(0, Number.parseInt(options.spacing, 10) || 0);
  for (const lane of lanes) {
    const end = Math.min(width, start + label.length);
    const collisionStart = Math.max(0, start - spacing);
    const collisionEnd = Math.min(width, end + spacing);
    const hasCollision = lane.slice(collisionStart, collisionEnd).some((character) => character !== " ");
    if (!hasCollision) {
      for (let index = 0; index < label.length && start + index < width; index += 1) {
        lane[start + index] = label[index];
      }
      return;
    }
  }
  const lane = makeBlank(width);
  for (let index = 0; index < label.length && start + index < width; index += 1) {
    lane[start + index] = label[index];
  }
  lanes.push(lane);
}

function hasCollision(line, start, end, spacing = 0) {
  const collisionStart = Math.max(0, start - spacing);
  const collisionEnd = Math.min(line.length, end + spacing);
  return line.slice(collisionStart, collisionEnd).some((character) => character !== " ");
}

function makeSpanMarker(length, strand) {
  if (length <= 1) {
    return "|";
  }
  if (strand === "-") {
    return `<${"-".repeat(Math.max(0, length - 2))}|`;
  }
  if (strand === "+") {
    return `|${"-".repeat(Math.max(0, length - 2))}>`;
  }
  return `[${"-".repeat(Math.max(0, length - 2))}]`;
}

function placeAnnotationLane(lanes, label, labelStartIndex, spanStartIndex, spanLength, width, strand) {
  const span = makeSpanMarker(spanLength, strand);
  const labelText = String(label ?? "").slice(0, width);
  const labelStart = clamp(labelStartIndex, 0, Math.max(0, width - labelText.length));
  const spanStart = clamp(spanStartIndex, 0, Math.max(0, width - span.length));
  const labelEnd = Math.min(width, labelStart + labelText.length);
  const spanEnd = Math.min(width, spanStart + span.length);
  let lane = lanes.find((item) =>
    !hasCollision(item.labels, labelStart, labelEnd, 1) &&
    !hasCollision(item.spans, spanStart, spanEnd, 0)
  );
  if (!lane) {
    lane = { labels: makeBlank(width), spans: makeBlank(width) };
    lanes.push(lane);
  }
  for (let index = 0; index < labelText.length && labelStart + index < width; index += 1) {
    lane.labels[labelStart + index] = labelText[index];
  }
  for (let index = 0; index < span.length && spanStart + index < width; index += 1) {
    lane.spans[spanStart + index] = span[index];
  }
}

function formatLine(label, value) {
  return `${label.padEnd(10)}${value}`;
}

function chooseRulerStep(start, end, width) {
  const maxCoordinateWidth = Math.max(String(start).length, String(end).length);
  const minimumSpacing = maxCoordinateWidth + 2;
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  return steps.find((step) => Math.min(step, width) >= minimumSpacing) ?? 100000;
}

function placeRulerLabel(line, text, startIndex, width, spacing = 1) {
  const label = String(text ?? "").slice(0, width);
  const start = clamp(startIndex, 0, Math.max(0, width - label.length));
  const end = Math.min(width, start + label.length);
  if (hasCollision(line, start, end, spacing)) {
    return false;
  }
  for (let index = 0; index < label.length && start + index < width; index += 1) {
    line[start + index] = label[index];
  }
  return true;
}

function makeRuler(start, end) {
  const width = end - start + 1;
  const line = makeBlank(width);
  const step = chooseRulerStep(start, end, width);
  placeRulerLabel(line, String(start), 0, width, 1);
  for (let position = Math.ceil(start / step) * step; position <= end; position += step) {
    if (position !== start && position !== end) {
      placeRulerLabel(line, String(position), position - start, width, 1);
    }
  }
  placeRulerLabel(line, String(end), width - String(end).length, width, 1);
  return line.join("").trimEnd();
}

function getAnnotationLabel(annotation) {
  const label = annotation.label || annotation.type || "hit";
  const strand = annotation.strand && annotation.strand !== "+" ? ` ${annotation.strand}` : "";
  return `${label}${strand} ${annotation.start}-${annotation.end}`;
}

function shouldShowSecondStrand(options = {}) {
  const alphabet = String(options.alphabet ?? options.molecule ?? "").toLowerCase();
  if (alphabet === "protein") {
    return false;
  }
  return options.showSecondStrand === true || options.showComplement === true || options.secondStrand === "complement";
}

function renderBlock(sequence, annotations, start, end, options = {}) {
  const width = end - start + 1;
  const chunk = sequence.slice(start - 1, end);
  const lanes = [];

  for (const annotation of annotations) {
    if (annotation.end < start || annotation.start > end) {
      continue;
    }
    const annotationStart = clamp(annotation.start, start, end);
    const annotationEnd = clamp(annotation.end, start, end);
    const offset = annotationStart - start;
    placeAnnotationLane(
      lanes,
      getAnnotationLabel(annotation),
      offset,
      offset,
      annotationEnd - annotationStart + 1,
      width,
      annotation.strand
    );
  }

  const lines = [];
  lines.push(formatLine("pos", makeRuler(start, end)));
  for (const lane of lanes) {
    lines.push(formatLine("label", lane.labels.join("").trimEnd()));
    lines.push(formatLine("span", lane.spans.join("").trimEnd()));
  }
  lines.push(formatLine("seq", chunk));
  if (shouldShowSecondStrand(options)) {
    lines.push(formatLine(options.secondStrandLabel ?? "comp", complementDnaRnaSequence(chunk, { preserveCase: false })));
  }
  return lines.join("\n");
}

export function renderTextAnnotationMap(records, options = {}) {
  const width = Math.max(10, Number.parseInt(options.width, 10) || 60);
  const sections = [];

  for (const record of records) {
    const sequence = String(record.sequence ?? "").toUpperCase();
    const annotations = (record.annotations ?? [])
      .filter((annotation) => Number.isFinite(Number(annotation.start)) && Number.isFinite(Number(annotation.end)))
      .map((annotation) => ({
        ...annotation,
        start: Number(annotation.start),
        end: Number(annotation.end)
      }))
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const lines = [`>${record.title ?? "sequence"} text annotation map`, `length ${sequence.length}`];
    for (let start = 1; start <= sequence.length; start += width) {
      const end = Math.min(sequence.length, start + width - 1);
      lines.push("", renderBlock(sequence, annotations, start, end, options));
    }
    sections.push(lines.join("\n").trimEnd());
  }

  return sections.join("\n\n");
}

export function makeTextAnnotationRecord({
  title,
  sequence,
  items = [],
  labelPrefix = "m",
  startField = "start",
  endField = "end",
  strandField = "strand",
  labelField = "label",
  labelForItem,
  includeStrand = true
} = {}) {
  return {
    title,
    sequence,
    annotations: items.flatMap((item, index) => {
      const label = typeof labelForItem === "function"
        ? labelForItem(item, index)
        : item[labelField] ?? `${labelPrefix}${index + 1}`;
      const parts = Array.isArray(item.parts) && item.parts.length > 0
        ? item.parts
        : [{ start: item[startField], end: item[endField], strand: item[strandField] }];
      return parts.map((part) => ({
        start: item[startField],
        end: item[endField],
        ...part,
        ...(includeStrand ? { strand: part.strand ?? item[strandField] } : {}),
        label
      }));
    })
  };
}

export function renderTextAnnotationMapFromItems(records, options = {}) {
  return renderTextAnnotationMap(records.map((record) =>
    makeTextAnnotationRecord({
      title: record.title,
      sequence: record.sequence,
      items: record.items ?? record.annotations ?? [],
      labelPrefix: options.labelPrefix ?? "m",
      startField: options.startField ?? "start",
      endField: options.endField ?? "end",
      strandField: options.strandField ?? "strand",
      labelField: options.labelField ?? "label",
      labelForItem: options.labelForItem,
      includeStrand: options.includeStrand !== false
    })
  ), options);
}
