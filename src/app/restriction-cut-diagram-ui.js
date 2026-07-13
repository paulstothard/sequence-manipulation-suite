import { complementDnaRnaSequence } from "../core/sequence.js";

export function makeRestrictionCutDiagram(enzyme) {
  const recognition = String(enzyme.recognition ?? "").toUpperCase();
  const complement = complementDnaRnaSequence(recognition, { preserveCase: false });
  const cutTop = Number.parseInt(enzyme.cutTop, 10);
  const cutBottom = Number.parseInt(enzyme.cutBottom, 10);
  const left = Math.min(cutTop, cutBottom);
  const right = Math.max(cutTop, cutBottom);
  const hasOverhang = right > left;
  const diagram = document.createElement("div");
  diagram.className = "restriction-cut-diagram";
  diagram.style.setProperty("--site-length", String(Math.max(1, recognition.length)));
  diagram.style.setProperty("--top-cut", String(Number.isFinite(cutTop) ? cutTop : 0));
  diagram.style.setProperty("--bottom-cut", String(Number.isFinite(cutBottom) ? cutBottom : 0));
  diagram.setAttribute(
    "aria-label",
    `${enzyme.name} recognition site ${recognition}; top strand cut after ${cutTop}; bottom strand cut after ${cutBottom}.`
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
      span.className = hasOverhang && index >= left && index < right
        ? "restriction-base overhang-region"
        : "restriction-base";
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
    makeStrand(recognition, "5'", "3'", "top"),
    makeStrand(complement, "3'", "5'", "bottom")
  );
  return diagram;
}
