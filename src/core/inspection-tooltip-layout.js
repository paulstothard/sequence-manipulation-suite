const FACT_LABELS = [
  "alignment column", "assembly position", "baseline", "comparison", "coordinates",
  "coverage depth", "coverage", "cuts after base", "frame", "genomic coordinates",
  "identity", "length", "Phred quality", "quality", "read position",
  "recognition", "reference position", "sample", "scale", "sequence position",
  "sequence", "site", "source location", "strand", "trace position", "type",
  "window size", "window"
].sort((left, right) => right.length - left.length);

function factParts(text) {
  const colon = text.match(/^([^:]{1,48})(:\s+)(.+)$/);
  if (colon) return { label: colon[1], infix: colon[2], value: colon[3] };
  const accessionRange = text.match(/^([A-Za-z][A-Za-z0-9_.-]+)(:)(\d[\d,–-]*)$/);
  if (accessionRange) return { label: accessionRange[1], infix: accessionRange[2], value: accessionRange[3] };
  const lower = text.toLowerCase();
  for (const label of FACT_LABELS) {
    if (lower.startsWith(`${label.toLowerCase()} `)) {
      return { label: text.slice(0, label.length), infix: " ", value: text.slice(label.length + 1) };
    }
  }
  const numeric = text.match(/^([A-Za-z][A-Za-z_ /-]{1,36})(\s+)([-+]?\d[\s\S]*)$/);
  return numeric ? { label: numeric[1], infix: numeric[2], value: numeric[3] } : null;
}

export function parseInspectionTooltipText(input) {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { text, sections: [] };
  const pieces = text.split(/(; | \| )/);
  if (pieces.some((piece, index) => index % 2 === 0 && !piece)) {
    return { text, sections: [{ text, separator: "", kind: "heading", parts: factParts(text) }] };
  }
  const sections = [];
  for (let index = 0; index < pieces.length; index += 2) {
    const sectionText = pieces[index];
    sections.push({
      text: sectionText,
      separator: index === 0 ? "" : pieces[index - 1],
      kind: index === 0 ? "heading" : "fact",
      parts: factParts(sectionText)
    });
  }
  return { text, sections };
}
