export function normalizeSequenceEditorFilename(value) {
  const name = String(value || "sequence-editor.fasta").trim() || "sequence-editor.fasta";
  return /\.(fa|fasta|fna|txt)$/i.test(name) ? name : `${name}.fasta`;
}

export function cloneSequenceEditorFeatureOverrides(overrides) {
  return JSON.parse(JSON.stringify(Array.isArray(overrides) ? overrides : []));
}

export function getSequenceEditorDirectSelection(selection) {
  if (!selection) {
    return null;
  }
  const recordIndex = Number(selection.recordIndex) || 0;
  const target = selection.target;
  const range = selection.range;
  if (!target || !range) {
    return null;
  }
  const start = Number(range.start);
  const end = Number(range.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  const label = target.label || target.name || target.enzyme || target.base || target.codon || target.kind || "selection";
  let kind = target.kind || "feature";
  if (kind === "base" && start === end) {
    kind = "base";
  } else if (kind === "codon") {
    kind = "codon";
  } else if (kind === "restriction-site") {
    kind = "site";
  } else if (Math.abs(end - start) + 1 > 1 && kind === "search-result") {
    kind = "range";
  }
  const normalizedStart = Math.min(start, end);
  const normalizedEnd = Math.max(start, end);
  return {
    kind,
    label,
    start: normalizedStart,
    end: normalizedEnd,
    length: normalizedEnd - normalizedStart + 1,
    wraps: start > end,
    recordIndex,
    recordTitle: selection.recordTitle || "",
    selectedSequence: selection.selectedSequence || "",
    target
  };
}

export function getSequenceEditorRangeSelection(selection) {
  if (!selection?.currentRange?.ready) {
    return null;
  }
  const recordIndex = Number(selection.recordIndex) || 0;
  return {
    kind: "range",
    label: `Range ${selection.currentRange.label}`,
    start: Number(selection.currentRange.start),
    end: Number(selection.currentRange.end),
    length: Number(selection.currentRange.length),
    wraps: selection.currentRange.wraps === true,
    recordIndex,
    recordTitle: selection.recordTitle || "",
    selectedSequence: selection.rangeSelectedSequence || "",
    target: null
  };
}

export function getActiveSequenceEditorSelection(selection) {
  if (!selection) {
    return null;
  }
  return getSequenceEditorRangeSelection(selection) || getSequenceEditorDirectSelection(selection);
}

export function getSequenceEditorSelectionKey(active) {
  if (!active) return "";
  return [
    active.kind,
    active.recordIndex,
    active.start,
    active.end,
    active.label,
    active.wraps ? "wraps" : "linear"
  ].join("|");
}

export function shortSequencePreview(sequence, maxLength = 72) {
  const text = String(sequence || "");
  if (text.length <= maxLength) return text;
  const flank = Math.max(8, Math.floor((maxLength - 3) / 2));
  return `${text.slice(0, flank)}...${text.slice(-flank)}`;
}

export function describeSequenceEditorEditTarget(active) {
  if (!active) {
    return "Current target: none. Click a base, codon, feature interval, or build a range in the viewer.";
  }
  const coordinates = Number.isFinite(active.start) && Number.isFinite(active.end)
    ? active.start === active.end
      ? active.start.toLocaleString()
      : `${active.start.toLocaleString()}-${active.end.toLocaleString()}`
    : "";
  const kindLabel = active.kind === "range"
    ? "range"
    : active.kind === "base"
      ? "base"
      : active.kind === "codon"
        ? "codon"
        : active.kind === "site"
          ? "restriction site"
          : "interval";
  const lengthText = Number.isFinite(active.length)
    ? `, ${active.length.toLocaleString()} bp`
    : "";
  return `Current target: ${kindLabel} ${active.label}${coordinates ? ` (${coordinates}${lengthText})` : ""}.`;
}

export function getSequenceEditorQuickEditCapabilities(active) {
  if (!active) {
    return {
      canEditSequence: false,
      canReverseComplement: false,
      canCopy: false,
      canExport: false,
      reason: "Select a base, codon, feature interval, or range in the viewer to edit sequence."
    };
  }
  const selectedText = String(active.selectedSequence || "");
  const canCopy = selectedText.length > 0;
  const hasCoordinateInterval = Number.isFinite(Number(active.start)) && Number.isFinite(Number(active.end));
  const selectedTextMatchesInterval = selectedText.length === 0 || selectedText.length === active.length;
  let canEditSequence = Boolean(hasCoordinateInterval && !active.wraps && selectedTextMatchesInterval);
  if (active.kind === "site") {
    canEditSequence = false;
  }
  let reason = "Edits apply to the edit target shown above.";
  if (active.wraps) {
    reason = "This range wraps the circular origin. Split it into two ranges before editing sequence.";
  } else if (active.kind === "site") {
    reason = "This restriction-site selection marks a cut or site position. Copy/export use the recognition sequence; select bases or define a range before editing sequence.";
  } else if (!hasCoordinateInterval) {
    reason = "This viewer item does not have editable coordinates.";
  } else if (!selectedTextMatchesInterval) {
    reason = "This viewer item is not a direct base interval. Select bases or define a range before editing sequence.";
  } else if (active.length === 1) {
    reason = "Base target: replace, insert before/after, or delete. Reverse complement is only available for ranges of two or more bases.";
  } else if (active.kind === "codon") {
    reason = "Codon selected: edits apply to all three bases, with translation effects previewed below.";
  } else if (active.kind === "range") {
    reason = "Range selected: edits apply to the selected interval.";
  }
  return {
    canEditSequence,
    canReverseComplement: canEditSequence && active.length > 1,
    canCopy,
    canExport: canCopy,
    reason
  };
}
