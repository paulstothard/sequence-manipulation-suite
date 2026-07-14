import { complementDnaRnaSequence } from "../core/sequence.js";

export function makeRestrictionCutDiagram(enzyme) {
  const recognition = String(enzyme.recognition ?? "").toUpperCase();
  const parsedCutTop = Number.parseInt(enzyme.cutTop, 10);
  const parsedCutBottom = Number.parseInt(enzyme.cutBottom, 10);
  const rawCutTop = Number.isFinite(parsedCutTop) ? parsedCutTop : 0;
  const rawCutBottom = Number.isFinite(parsedCutBottom) ? parsedCutBottom : 0;
  const suppliedDisplaySequence = String(enzyme.displaySequence ?? "").toUpperCase();
  const hasSuppliedDisplaySequence = suppliedDisplaySequence.length > 0;
  const leftBoundary = hasSuppliedDisplaySequence ? 0 : Math.min(0, rawCutTop, rawCutBottom);
  const rightBoundary = hasSuppliedDisplaySequence
    ? suppliedDisplaySequence.length
    : Math.max(recognition.length, rawCutTop, rawCutBottom);
  const recognitionStart = hasSuppliedDisplaySequence
    ? Math.max(0, Number.parseInt(enzyme.recognitionStart, 10) || 0)
    : Math.max(0, -leftBoundary);
  const displaySequence = hasSuppliedDisplaySequence
    ? suppliedDisplaySequence
    : `${"N".repeat(recognitionStart)}${recognition}${"N".repeat(Math.max(0, rightBoundary - recognition.length))}`;
  const complement = complementDnaRnaSequence(displaySequence, { preserveCase: false });
  const cutTop = hasSuppliedDisplaySequence ? rawCutTop : rawCutTop + recognitionStart;
  const cutBottom = hasSuppliedDisplaySequence ? rawCutBottom : rawCutBottom + recognitionStart;
  const left = Math.min(cutTop, cutBottom);
  const right = Math.max(cutTop, cutBottom);
  const hasOverhang = right > left;
  const diagram = document.createElement("div");
  diagram.className = "restriction-cut-diagram";
  diagram.style.setProperty("--site-length", String(Math.max(1, displaySequence.length)));
  diagram.style.setProperty("--top-cut", String(Number.isFinite(cutTop) ? cutTop : 0));
  diagram.style.setProperty("--bottom-cut", String(Number.isFinite(cutBottom) ? cutBottom : 0));
  diagram.setAttribute(
    "aria-label",
    `${enzyme.name} recognition site ${recognition}; top strand cut at offset ${rawCutTop}; bottom strand cut at offset ${rawCutBottom}.`
  );

  const makeStrand = (sequence, startLabel, endLabel, strandClass) => {
    const row = document.createElement("div");
    row.className = `restriction-cut-strand ${strandClass}`;

    const start = document.createElement("span");
    start.className = "restriction-strand-end";
    start.textContent = startLabel;
    row.append(start);

    const bases = document.createElement("span");
    bases.className = "restriction-bases";
    bases.setAttribute("aria-hidden", "true");
    for (const [index, base] of Array.from(sequence).entries()) {
      const span = document.createElement("span");
      const classes = ["restriction-base"];
      if (index < recognitionStart || index >= recognitionStart + recognition.length) classes.push("cleavage-flank");
      if (hasOverhang && index >= left && index < right) classes.push("overhang-region");
      span.className = classes.join(" ");
      span.textContent = base;
      bases.append(span);
    }
    const marker = document.createElement("span");
    marker.className = `restriction-cut-marker ${strandClass}`;
    bases.append(marker);
    row.append(bases);

    const end = document.createElement("span");
    end.className = "restriction-strand-end";
    end.textContent = endLabel;
    row.append(end);
    return row;
  };

  diagram.append(
    makeStrand(displaySequence, "5'", "3'", "top"),
    makeStrand(complement, "3'", "5'", "bottom")
  );
  return diagram;
}
