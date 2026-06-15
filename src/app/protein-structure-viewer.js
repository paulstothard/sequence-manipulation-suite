import { addTimestampToFilename, makeSafeFileStem } from "./canvas-export.js";

const BACKGROUND_COLORS = {
  white: "#ffffff",
  light: "#f8fafc",
  black: "#05070a"
};
const RESIDUE_PICK_MOVE_TOLERANCE_PX = 4;
const RESIDUE_PICK_SUPPRESS_MS = 220;
const DEFAULT_LIGAND_OPACITY = 1;
const DEFAULT_WATER_OPACITY = 0.85;
const DEFAULT_SURFACE_OPACITY = 0.55;
const RESIDUE_SPHERE_SCALE = 1.18;
const SELECTED_RESIDUE_SPHERE_SCALE = 1.52;
const NUCLEIC_ACID_RESIDUES = ["A", "C", "G", "U", "I", "DA", "DC", "DG", "DT", "DU", "DI"];

const CONTROL_CHOICES = {
  representation: [
    ["residue-spheres", "Residue spheres"],
    ["cartoon-stick", "Cartoon + sticks"],
    ["cartoon", "Cartoon"],
    ["stick", "Sticks"],
    ["sphere", "Space-filling spheres"],
    ["line", "Lines"]
  ],
  colorScheme: [
    ["chain", "By chain"],
    ["spectrum", "N to C spectrum"],
    ["secondary", "Secondary structure"],
    ["element", "By element"],
    ["fixed", "Single color"]
  ],
  background: [
    ["white", "White"],
    ["light", "Light gray"],
    ["black", "Black"]
  ]
};

function makeConservationColorMap(conservation) {
  const entries = conservation?.residueColors ?? {};
  return new Map(Object.entries(entries).map(([key, value]) => [key, value?.color ?? "#94a3b8"]));
}

function makeConservationDetailMap(conservation) {
  const rows = conservation?.residueDetails ?? [];
  const details = new Map();
  for (const row of rows) {
    details.set(residueKeyFromParts(row.chain, row.residue_number, row.insertion_code), row);
    if (row.residue_id) {
      details.set(row.residue_id, row);
    }
  }
  return details;
}

export function isProteinStructureResiduePickGesture(startPoint, endPoint, options = {}) {
  if (!startPoint || !endPoint) return false;
  const tolerance = Number.isFinite(Number(options.tolerancePx))
    ? Math.max(0, Number(options.tolerancePx))
    : RESIDUE_PICK_MOVE_TOLERANCE_PX;
  const dx = Number(endPoint.clientX) - Number(startPoint.clientX);
  const dy = Number(endPoint.clientY) - Number(startPoint.clientY);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  return Math.hypot(dx, dy) <= tolerance;
}

function residueKeyFromParts(chain, residueNumber, insertionCode = "") {
  const chainText = String(chain ?? "").trim() || "_";
  const residueText = String(residueNumber ?? "").trim();
  const insertionText = String(insertionCode ?? "").trim();
  return `${chainText}|${residueText}|${insertionText}`;
}

function atomResidueKey(atom) {
  return residueKeyFromParts(atom?.chain || "_", atom?.resi ?? atom?.residue_number ?? "", atom?.icode ?? atom?.inscode ?? "");
}

function selectionFromResidueKey(key) {
  const [chain, residueNumber, insertionCode] = String(key ?? "").split("|");
  const residue = Number.parseInt(residueNumber, 10);
  if (!Number.isFinite(residue)) return {};
  const selection = { chain, resi: residue };
  if (insertionCode) selection.icode = insertionCode;
  return selection;
}

const BUTTON_ICONS = {
  fit: [
    "M8 3.75H4.75V7",
    "M16 3.75h3.25V7",
    "M8 20.25H4.75V17",
    "M16 20.25h3.25V17",
    "M9.25 12h5.5",
    "M12 9.25v5.5"
  ],
  spin: [
    "M17.5 4.5h-4.75v4.75",
    "M6.5 19.5h4.75v-4.75",
    "M17.2 7.1a7.5 7.5 0 0 0-12.6 2.7",
    "M6.8 16.9a7.5 7.5 0 0 0 12.6-2.7"
  ],
  download: [
    "M12 3.75v9",
    "m8.8 9.55 3.2 3.2 3.2-3.2",
    "M5 19.25h14"
  ]
};

function buttonIcon(pathData) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  for (const data of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.9");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("fill", "none");
    svg.append(path);
  }
  return svg;
}

function makeButton(label, iconPath, className = "", visibleLabel = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  if (className) button.className = className;
  if (visibleLabel) {
    const span = document.createElement("span");
    span.className = "dna-viewer-export-label";
    span.textContent = visibleLabel;
    button.append(span);
  }
  if (iconPath) {
    button.append(buttonIcon(iconPath));
  }
  return button;
}

function makeSelect(labelText, value, choices) {
  const label = document.createElement("label");
  label.className = "protein-structure-control";
  const span = document.createElement("span");
  span.textContent = labelText;
  const select = document.createElement("select");
  for (const [choiceValue, choiceLabel] of choices) {
    const option = document.createElement("option");
    option.value = choiceValue;
    option.textContent = choiceLabel;
    select.append(option);
  }
  select.value = value;
  label.append(span, select);
  return { label, select };
}

function makeCheckbox(labelText, checked, helpText = labelText) {
  const label = document.createElement("label");
  label.className = "protein-structure-check";
  label.title = helpText;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(input, span);
  return { label, input };
}

export function normalizeProteinStructureOpacity(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0.05, numeric));
}

function makeOpacityControl(labelText, value, helpText = labelText) {
  const label = document.createElement("label");
  label.className = "protein-structure-opacity-control";
  label.title = helpText;
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0.1";
  input.max = "1";
  input.step = "0.05";
  input.value = String(normalizeProteinStructureOpacity(value));
  const output = document.createElement("output");
  const updateOutput = () => {
    output.textContent = `${Math.round(normalizeProteinStructureOpacity(input.value) * 100)}%`;
  };
  input.addEventListener("input", updateOutput);
  updateOutput();
  label.append(span, input, output);
  return { label, input, output };
}

function makeOverlayDisplayControl(toggleControl, opacityControl) {
  const group = document.createElement("div");
  group.className = "protein-structure-overlay-control";
  group.append(toggleControl.label, opacityControl.label);
  return group;
}

function fitStructure(viewer) {
  viewer.zoomTo();
  if (typeof viewer.zoom === "function") {
    viewer.zoom(1.12);
  }
  viewer.render();
}

function getBackgroundColor(value) {
  return BACKGROUND_COLORS[value] ?? BACKGROUND_COLORS.white;
}

function mainSelection(settings) {
  if (settings.showHetAtoms && settings.showWaters) {
    return {};
  }
  if (settings.showHetAtoms) {
    return { not: { resn: "HOH" } };
  }
  return { hetflag: false };
}

function isResidueSphereRepresentation(settings) {
  return settings?.representation === "residue-spheres";
}

function residueSphereSelection() {
  return { atom: "CA", hetflag: false };
}

function primaryStructureSelection(settings) {
  return isResidueSphereRepresentation(settings) ? residueSphereSelection() : mainSelection(settings);
}

function interactionSelection(settings) {
  return settings?.residueOnlyPicking || isResidueSphereRepresentation(settings)
    ? residueSphereSelection()
    : mainSelection(settings);
}

function surfaceSelection(settings) {
  return isResidueSphereRepresentation(settings) ? residueSphereSelection() : mainSelection(settings);
}

export function getProteinStructureRepresentationStyle(settings, forcedColor = "") {
  const color = forcedColor ? { color: forcedColor } : colorStyle(settings);
  const stickColor = forcedColor ? { color: forcedColor } : { colorscheme: "Jmol" };
  if (settings.representation === "residue-spheres") {
    return { sphere: { scale: RESIDUE_SPHERE_SCALE, ...color } };
  }
  if (settings.representation === "stick") {
    return { stick: { radius: 0.18, ...color } };
  }
  if (settings.representation === "sphere") {
    return { sphere: { scale: 1, ...color } };
  }
  if (settings.representation === "line") {
    return { line: { linewidth: 1.2, ...color } };
  }
  const cartoon = { cartoon: { thickness: 0.18, ...color } };
  if (settings.representation === "cartoon-stick") {
    return {
      ...cartoon,
      stick: { radius: 0.12, ...stickColor }
    };
  }
  return cartoon;
}

export function getProteinStructureLigandStyle(settings = {}) {
  const opacity = normalizeProteinStructureOpacity(settings.ligandOpacity, DEFAULT_LIGAND_OPACITY);
  return {
    stick: { radius: 0.18, colorscheme: "Jmol", opacity },
    sphere: { scale: 0.22, colorscheme: "Jmol", opacity }
  };
}

export function getProteinStructureWaterStyle(settings = {}) {
  const opacity = normalizeProteinStructureOpacity(settings.waterOpacity, DEFAULT_WATER_OPACITY);
  return {
    sphere: { scale: 0.2, color: "#60a5fa", opacity }
  };
}

export function getProteinStructureSurfaceStyle(settings = {}) {
  return {
    opacity: normalizeProteinStructureOpacity(settings.surfaceOpacity, DEFAULT_SURFACE_OPACITY),
    color: settings.background === "black" ? "#dbeafe" : "#cbd5e1"
  };
}

function colorStyle(settings) {
  if (settings.colorScheme === "conservation" && settings.conservationColorMap) {
    return { color: "#94a3b8" };
  }
  if (settings.colorScheme === "spectrum") {
    return { color: "spectrum" };
  }
  if (settings.colorScheme === "secondary") {
    return { colorscheme: "ssPyMOL" };
  }
  if (settings.colorScheme === "element") {
    return { colorscheme: "Jmol" };
  }
  if (settings.colorScheme === "fixed") {
    return { color: "#2563eb" };
  }
  return { colorscheme: "chain" };
}

function applyConservationResidueStyles(viewer, settings) {
  if (settings.colorScheme !== "conservation" || !settings.conservationColorMap) {
    return;
  }
  for (const [key, color] of settings.conservationColorMap.entries()) {
    const [chain, residueNumber, insertionCode] = key.split("|");
    const residue = Number.parseInt(residueNumber, 10);
    if (!Number.isFinite(residue)) {
      continue;
    }
    const selection = { chain, resi: residue };
    if (isResidueSphereRepresentation(settings)) {
      selection.atom = "CA";
      selection.hetflag = false;
    }
    if (insertionCode) {
      selection.icode = insertionCode;
    }
    viewer.setStyle(selection, getProteinStructureRepresentationStyle(settings, color));
  }
}

function styleNucleicAcidContext(viewer, settings) {
  if (!isResidueSphereRepresentation(settings)) {
    return;
  }
  const color = settings.background === "black" ? "#cbd5e1" : "#64748b";
  for (const resn of NUCLEIC_ACID_RESIDUES) {
    viewer.setStyle({ resn }, { line: { linewidth: 1.4, color } });
  }
}

function styleViewer(viewer, settings) {
  viewer.setBackgroundColor(getBackgroundColor(settings.background));
  viewer.removeAllSurfaces?.();
  viewer.setStyle({}, {});
  viewer.setStyle(primaryStructureSelection(settings), getProteinStructureRepresentationStyle(settings));
  applyConservationResidueStyles(viewer, settings);
  styleNucleicAcidContext(viewer, settings);
  if (settings.showHetAtoms) {
    viewer.setStyle({ hetflag: true, not: { resn: "HOH" } }, getProteinStructureLigandStyle(settings));
  }
  if (settings.showWaters) {
    viewer.setStyle({ resn: "HOH" }, getProteinStructureWaterStyle(settings));
  }
  if (settings.showSurface && window.$3Dmol?.SurfaceType?.VDW) {
    viewer.addSurface(window.$3Dmol.SurfaceType.VDW, getProteinStructureSurfaceStyle(settings), surfaceSelection(settings));
  }
  if (settings.selectedResidueKey) {
    const selection = selectionFromResidueKey(settings.selectedResidueKey);
    if (isResidueSphereRepresentation(settings)) {
      selection.atom = "CA";
      selection.hetflag = false;
      viewer.addStyle(selection, {
        sphere: { scale: SELECTED_RESIDUE_SPHERE_SCALE, color: "#facc15" }
      });
    } else {
      viewer.addStyle(selection, {
        stick: { radius: 0.32, color: "#f97316" },
        sphere: { scale: 0.34, color: "#facc15" }
      });
    }
  }
  viewer.render();
}

function shortResidueLabel(atom) {
  const chain = atom?.chain || "_";
  const residue = atom?.resi ?? atom?.residue_number ?? "?";
  const insertion = atom?.icode ?? atom?.inscode ?? "";
  const name = atom?.resn ?? atom?.residue_name ?? "Residue";
  return `${name} ${chain}:${residue}${insertion}`;
}

function formatScore(score) {
  const number = Number(score);
  return Number.isFinite(number) ? number.toFixed(3) : "not mapped";
}

function detailLinesForAtom(atom, conservationDetails) {
  const key = atomResidueKey(atom);
  const detail = conservationDetails.get(key);
  const lines = [
    shortResidueLabel(atom),
    `Atom: ${atom?.atom ?? atom?.atom_name ?? "unknown"}${atom?.elem ? ` (${atom.elem})` : ""}`
  ];
  if (detail) {
    lines.push(
      `Alignment position: ${detail.alignment_position || "not mapped"}`,
      `Conservation score: ${formatScore(detail.conservation_score)}`,
      `Consensus residue: ${detail.consensus_residue || "not mapped"}`,
      `Structure residue: ${detail.structure_residue || "unknown"}`,
      `Alignment residue: ${detail.alignment_residue || "not mapped"}`,
      `Column residues/gaps: ${detail.residue_count || 0}/${detail.gap_count || 0}`,
      `Status: ${detail.mapped ? (detail.mismatch ? "mapped with mismatch" : "mapped") : "unmapped"}`
    );
  }
  return { key, detail, lines };
}

function tsvValue(value) {
  const text = String(value ?? "");
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function selectedResidueTsv(atom, conservationDetails) {
  const { detail } = detailLinesForAtom(atom, conservationDetails);
  const columns = [
    "chain",
    "residue_number",
    "insertion_code",
    "residue_name",
    "atom_name",
    "element",
    "conservation_score",
    "alignment_position",
    "consensus_residue",
    "mapped"
  ];
  const row = {
    chain: atom?.chain || "_",
    residue_number: atom?.resi ?? atom?.residue_number ?? "",
    insertion_code: atom?.icode ?? atom?.inscode ?? "",
    residue_name: atom?.resn ?? atom?.residue_name ?? "",
    atom_name: atom?.atom ?? atom?.atom_name ?? "",
    element: atom?.elem ?? atom?.element ?? "",
    conservation_score: detail?.conservation_score ?? "",
    alignment_position: detail?.alignment_position ?? "",
    consensus_residue: detail?.consensus_residue ?? "",
    mapped: detail ? String(Boolean(detail.mapped)) : ""
  };
  return `${columns.join("\t")}\n${columns.map((column) => tsvValue(row[column])).join("\t")}`;
}

function positionTooltip(tooltip, event, text) {
  if (!text) {
    hideTooltip(tooltip);
    return;
  }
  tooltip.textContent = text;
  tooltip.hidden = false;
  const hostRect = tooltip.parentElement.getBoundingClientRect();
  const x = Math.max(8, Math.min(hostRect.width - 20, (event?.clientX ?? hostRect.left + 20) - hostRect.left + 12));
  const y = Math.max(8, Math.min(hostRect.height - 20, (event?.clientY ?? hostRect.top + 20) - hostRect.top + 12));
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip(tooltip) {
  tooltip.hidden = true;
  tooltip.textContent = "";
  tooltip.style.left = "-9999px";
  tooltip.style.top = "-9999px";
}

function renderSelectedDetails(detailsPanel, atom, conservationDetails, actions = {}) {
  detailsPanel.textContent = "";
  if (!atom) {
    const empty = document.createElement("div");
    empty.className = "protein-structure-details-empty";
    empty.textContent = "Click a residue to keep its details here.";
    detailsPanel.append(empty);
    return;
  }
  const { lines } = detailLinesForAtom(atom, conservationDetails);
  const atomText = lines[1]?.replace(/^Atom:\s*/i, "atom ") ?? "atom unknown";
  const info = document.createElement("div");
  info.className = "protein-structure-details-info";
  const heading = document.createElement("div");
  heading.className = "protein-structure-details-heading";
  heading.textContent = `Selected residue: ${lines[0]}, ${atomText}`;
  const grid = document.createElement("dl");
  grid.className = "protein-structure-details-grid";
  for (const line of lines.slice(2)) {
    const [label, ...rest] = line.split(":");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    if (rest.length === 0) {
      dt.textContent = "Residue";
      dd.textContent = line;
    } else {
      dt.textContent = label;
      dd.textContent = rest.join(":").trim();
    }
    grid.append(dt, dd);
  }
  info.append(heading);
  if (grid.childElementCount > 0) {
    info.append(grid);
  }
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "protein-structure-copy-button";
  copy.textContent = "Copy details";
  copy.addEventListener("click", () => actions.onCopy?.(lines.join("\n"), "Details copied"));

  const copyTsv = document.createElement("button");
  copyTsv.type = "button";
  copyTsv.className = "protein-structure-copy-button";
  copyTsv.textContent = "Copy residue TSV";
  copyTsv.addEventListener("click", () => actions.onCopy?.(selectedResidueTsv(atom, conservationDetails), "Residue TSV copied"));

  const focus = document.createElement("button");
  focus.type = "button";
  focus.className = "protein-structure-copy-button";
  focus.textContent = "Focus residue";
  focus.addEventListener("click", () => actions.onFocus?.());

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "protein-structure-copy-button secondary";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => actions.onClear?.());

  const actionRow = document.createElement("div");
  actionRow.className = "protein-structure-details-actions";
  actionRow.append(focus, copy, copyTsv, clear);

  detailsPanel.append(info, actionRow);
}

function findNearestAtomFromEvent(viewer, settings, event, maxPixelDistance = 18) {
  let atoms = [];
  try {
    atoms = viewer.selectedAtoms(interactionSelection(settings)).filter((atom) =>
      Number.isFinite(atom.x) && Number.isFinite(atom.y) && Number.isFinite(atom.z)
    );
  } catch {
    atoms = [];
  }
  if (atoms.length === 0 || atoms.length > 12000) {
    return null;
  }
  const positions = viewer.modelToScreen(atoms);
  const pageX = (event?.clientX ?? 0) + window.pageXOffset;
  const pageY = (event?.clientY ?? 0) + window.pageYOffset;
  let bestAtom = null;
  let bestDistance = maxPixelDistance * maxPixelDistance;
  positions.forEach((position, index) => {
    const dx = position.x - pageX;
    const dy = position.y - pageY;
    const distance = dx * dx + dy * dy;
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestAtom = atoms[index];
    }
  });
  return bestAtom;
}

function createMappingSummary(conservation) {
  const summary = document.createElement("div");
  summary.className = "protein-structure-mapping-summary";
  const coloredChains = Array.isArray(conservation.equivalentChains) && conservation.equivalentChains.length > 0
    ? conservation.equivalentChains.join(", ")
    : conservation.chainId || "auto";
  const items = [
    ["Anchor chain", conservation.chainId || "auto"],
    ["Colored chains", coloredChains],
    ["Alignment row", conservation.alignmentTitle || "auto"],
    ["Identity", `${(Number(conservation.alignmentIdentity ?? 0) * 100).toFixed(1)}%`],
    ["Mapped", Number(conservation.mappedResidues ?? 0).toLocaleString()],
    ["Unmapped", Number(conservation.unmappedResidues ?? 0).toLocaleString()],
    ["Mismatches", Number(conservation.mismatchCount ?? 0).toLocaleString()]
  ];
  for (const [label, value] of items) {
    const chip = document.createElement("span");
    chip.className = "protein-structure-mapping-chip";
    const labelSpan = document.createElement("span");
    labelSpan.className = "protein-structure-mapping-label";
    labelSpan.textContent = label;
    const valueSpan = document.createElement("span");
    valueSpan.className = "protein-structure-mapping-value";
    valueSpan.textContent = value;
    chip.append(labelSpan, valueSpan);
    summary.append(chip);
  }
  return summary;
}

function downloadPngFromViewer(viewer, filename) {
  let href = "";
  try {
    href = typeof viewer.pngURI === "function" ? viewer.pngURI() : "";
  } catch {
    href = "";
  }
  if (!href) {
    const canvas = viewer.getCanvas?.() ?? document.querySelector(".protein-structure-canvas-host canvas");
    href = canvas?.toDataURL?.("image/png") ?? "";
  }
  if (!href) {
    return false;
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = addTimestampToFilename(filename);
  link.click();
  return true;
}

export function renderProteinStructureViewer(container, payload = {}) {
  const structureText = String(payload.structureText ?? "");
  const conservation = payload.conservation ?? null;
  const colorChoices = conservation
    ? [["conservation", "Conservation"], ...CONTROL_CHOICES.colorScheme]
    : CONTROL_CHOICES.colorScheme;
  const settings = {
    representation: payload.settings?.representation ?? "cartoon-stick",
    colorScheme: payload.settings?.colorScheme ?? (conservation ? "conservation" : "chain"),
    background: payload.settings?.background ?? "white",
    showHetAtoms: payload.settings?.showHetAtoms !== false,
    showWaters: payload.settings?.showWaters === true,
    showSurface: payload.settings?.showSurface === true,
    ligandOpacity: normalizeProteinStructureOpacity(payload.settings?.ligandOpacity, DEFAULT_LIGAND_OPACITY),
    waterOpacity: normalizeProteinStructureOpacity(payload.settings?.waterOpacity, DEFAULT_WATER_OPACITY),
    surfaceOpacity: normalizeProteinStructureOpacity(payload.settings?.surfaceOpacity, DEFAULT_SURFACE_OPACITY),
    conservationColorMap: makeConservationColorMap(conservation),
    residueOnlyPicking: payload.settings?.residueOnlyPicking === true || Boolean(conservation),
    selectedResidueKey: ""
  };
  const conservationDetails = makeConservationDetailMap(conservation);
  const panel = document.createElement("section");
  panel.className = "protein-structure-viewer";

  const toolbar = document.createElement("div");
  toolbar.className = "protein-structure-toolbar";
  const title = document.createElement("div");
  title.className = "protein-structure-title";
  title.textContent = payload.title || "Protein structure";
  title.title = payload.title || "Protein structure";
  const summary = document.createElement("div");
  summary.className = "protein-structure-summary";
  const atoms = payload.summary?.atomCount ?? 0;
  const residues = payload.summary?.residueCount ?? 0;
  const chains = payload.summary?.chains?.join(", ") || "none";
  const modelCount = Number(payload.summary?.modelCount ?? 0);
  const selectedModel = payload.summary?.selectedModel ?? "all";
  const modelText = modelCount > 0
    ? `; models ${modelCount.toLocaleString()}; shown ${selectedModel === "all" ? "all models" : `model ${selectedModel}`}`
    : "";
  const assemblyText = payload.summary?.biologicalAssemblyApplied
    ? `; assembly ${payload.summary.selectedBiologicalAssembly}`
    : "";
  summary.textContent = conservation
    ? `${atoms.toLocaleString()} atoms; ${residues.toLocaleString()} residues; chains ${chains}${modelText}${assemblyText}; ${Number(conservation.mappedResidues ?? 0).toLocaleString()} residues mapped`
    : `${atoms.toLocaleString()} atoms; ${residues.toLocaleString()} residues; chains ${chains}${modelText}${assemblyText}`;

  const repControl = makeSelect("Representation", settings.representation, CONTROL_CHOICES.representation);
  const colorControl = makeSelect("Coloring", settings.colorScheme, colorChoices);
  const bgControl = makeSelect("Background", settings.background, CONTROL_CHOICES.background);
  const hetControl = makeCheckbox("Ligands", settings.showHetAtoms, "Show non-water hetero atoms such as bound ligands, ions, and cofactors.");
  const waterControl = makeCheckbox("Waters", settings.showWaters, "Show crystallographic water molecules.");
  const surfaceControl = makeCheckbox("Surface", settings.showSurface, "Show the van der Waals molecular surface.");
  const ligandOpacityControl = makeOpacityControl("Ligand opacity", settings.ligandOpacity, "Opacity for shown non-water hetero atoms.");
  const waterOpacityControl = makeOpacityControl("Water opacity", settings.waterOpacity, "Opacity for shown water molecules.");
  const surfaceOpacityControl = makeOpacityControl("Surface opacity", settings.surfaceOpacity, "Opacity for the molecular surface.");

  const buttons = document.createElement("div");
  buttons.className = "dna-viewer-buttons protein-structure-buttons";
  const fitButton = makeButton("Fit structure in view", BUTTON_ICONS.fit, "protein-structure-fit-button", "Fit");
  const spinButton = makeButton("Toggle spin", null, "protein-structure-spin-button", "Spin");
  spinButton.setAttribute("aria-pressed", "false");
  const spinButtonLabel = spinButton.querySelector(".dna-viewer-export-label");
  const pngButton = makeButton("Download PNG", BUTTON_ICONS.download, "dna-viewer-export-button protein-structure-export-button", "PNG");
  const status = document.createElement("span");
  status.className = "protein-structure-status";
  status.setAttribute("aria-live", "polite");
  buttons.append(fitButton, spinButton, pngButton);
  const actionGroup = document.createElement("div");
  actionGroup.className = "protein-structure-action-group";
  actionGroup.append(buttons);

  const heading = document.createElement("div");
  heading.className = "protein-structure-heading";
  heading.append(title, summary);
  const settingsGroup = document.createElement("div");
  settingsGroup.className = "protein-structure-setting-group";
  settingsGroup.setAttribute("aria-label", "Display controls");
  settingsGroup.append(repControl.label, colorControl.label, bgControl.label);
  const toggleGroup = document.createElement("div");
  toggleGroup.className = "protein-structure-toggle-group protein-structure-opacity-group";
  toggleGroup.setAttribute("aria-label", "Molecules to show");
  toggleGroup.append(
    makeOverlayDisplayControl(hetControl, ligandOpacityControl),
    makeOverlayDisplayControl(waterControl, waterOpacityControl),
    makeOverlayDisplayControl(surfaceControl, surfaceOpacityControl)
  );
  toolbar.append(heading, settingsGroup, toggleGroup, actionGroup);

  const viewerHost = document.createElement("div");
  viewerHost.className = "protein-structure-canvas-host";
  const tooltip = document.createElement("div");
  tooltip.className = "protein-structure-tooltip";
  hideTooltip(tooltip);
  viewerHost.append(tooltip);
  const detailsPanel = document.createElement("div");
  detailsPanel.className = "protein-structure-details";
  renderSelectedDetails(detailsPanel, null, conservationDetails);
  const legend = document.createElement("div");
  legend.className = "protein-structure-conservation-legend";
  if (conservation?.legend?.length) {
    for (const item of conservation.legend) {
      const chip = document.createElement("span");
      chip.className = "protein-structure-conservation-chip";
      const swatch = document.createElement("span");
      swatch.className = "protein-structure-conservation-swatch";
      swatch.style.backgroundColor = item.color;
      const label = document.createElement("span");
      label.textContent = `${item.label}${item.range ? ` (${item.range})` : ""}`;
      chip.append(swatch, label);
      legend.append(chip);
    }
  }
  panel.append(toolbar);
  if (conservation) {
    panel.append(createMappingSummary(conservation));
  }
  panel.append(viewerHost, status, detailsPanel);
  if (legend.childElementCount > 0) {
    panel.append(legend);
  }
  container.append(panel);

  if (!window.$3Dmol?.createViewer) {
    viewerHost.textContent = "3Dmol.js is not available. The local viewer library did not load.";
    return;
  }

  let hoverFrame = 0;
  let viewer;
  try {
    viewer = window.$3Dmol.createViewer(viewerHost, {
      backgroundColor: getBackgroundColor(settings.background),
      antialias: true
    });
    const viewerFormat = payload.viewerFormat ?? payload.format;
    viewer.addModel(structureText, viewerFormat === "mmcif" ? "cif" : "pdb");
    styleViewer(viewer, settings);
    fitStructure(viewer);
    const copyDetails = async (text, message = "Details copied") => {
      try {
        await navigator.clipboard?.writeText(text);
        status.textContent = message;
      } catch {
        status.textContent = "Copy unavailable";
      }
    };
    const clearSelection = () => {
      hideTooltip(tooltip);
      settings.selectedResidueKey = "";
      renderSelectedDetails(detailsPanel, null, conservationDetails);
      status.textContent = "Selection cleared";
      styleViewer(viewer, settings);
    };
    const focusSelectedResidue = () => {
      hideTooltip(tooltip);
      if (!settings.selectedResidueKey) {
        status.textContent = "No residue selected";
        return;
      }
      viewer.zoomTo(selectionFromResidueKey(settings.selectedResidueKey));
      viewer.render();
      status.textContent = "Focused selected residue";
    };
    const selectAtom = (atom) => {
      hideTooltip(tooltip);
      settings.selectedResidueKey = atomResidueKey(atom);
      renderSelectedDetails(detailsPanel, atom, conservationDetails, {
        onCopy: copyDetails,
        onFocus: focusSelectedResidue,
        onClear: clearSelection
      });
      status.textContent = "Residue selected";
      styleViewer(viewer, settings);
    };
    let lastMolHoverAt = 0;
    viewer.setHoverable(interactionSelection(settings), true, (atom, _viewer, event) => {
      lastMolHoverAt = performance.now();
      const { lines } = detailLinesForAtom(atom, conservationDetails);
      positionTooltip(tooltip, event, lines.slice(0, conservation ? 5 : 2).join("\n"));
    }, () => {
      hideTooltip(tooltip);
    });
    let pointerStart = null;
    let suppressResiduePickUntil = 0;
    const suppressResiduePick = () => {
      suppressResiduePickUntil = performance.now() + RESIDUE_PICK_SUPPRESS_MS;
    };
    const residuePickingSuppressed = () => performance.now() < suppressResiduePickUntil;
    const trackPointerStart = (event) => {
      hideTooltip(tooltip);
      pointerStart = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY
      };
    };
    const trackPointerEnd = (event) => {
      if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
        pointerStart = null;
        return;
      }
      if (!isProteinStructureResiduePickGesture(pointerStart, event)) {
        suppressResiduePick();
      }
      pointerStart = null;
    };
    const cancelPointerPick = () => {
      pointerStart = null;
      suppressResiduePick();
      hideTooltip(tooltip);
    };
    let lastAtomClickAt = 0;
    viewer.setClickable(interactionSelection(settings), true, (atom) => {
      if (residuePickingSuppressed()) return;
      lastAtomClickAt = Date.now();
      selectAtom(atom);
    });
    viewerHost.addEventListener("mousemove", (event) => {
      if (hoverFrame) return;
      const pointer = { clientX: event.clientX, clientY: event.clientY };
      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = 0;
        const atom = findNearestAtomFromEvent(viewer, settings, pointer, 16);
        if (atom) {
          const { lines } = detailLinesForAtom(atom, conservationDetails);
          positionTooltip(tooltip, pointer, lines.slice(0, conservation ? 5 : 2).join("\n"));
        } else if (performance.now() - lastMolHoverAt > 80) {
          hideTooltip(tooltip);
        }
      });
    }, { capture: true });
    viewerHost.addEventListener("pointerdown", trackPointerStart, { capture: true, passive: true });
    viewerHost.addEventListener("pointerup", trackPointerEnd, { capture: true, passive: true });
    for (const eventName of ["mouseleave", "pointerleave", "pointercancel", "blur"]) {
      viewerHost.addEventListener(eventName, cancelPointerPick);
    }
    for (const eventName of ["wheel", "touchstart"]) {
      viewerHost.addEventListener(eventName, cancelPointerPick, { passive: true });
    }
    viewerHost.addEventListener("click", (event) => {
      hideTooltip(tooltip);
      if (residuePickingSuppressed()) {
        return;
      }
      const pointer = { clientX: event.clientX, clientY: event.clientY };
      setTimeout(() => {
        if (residuePickingSuppressed()) {
          return;
        }
        if (Date.now() - lastAtomClickAt < 80) {
          return;
        }
        const fallbackAtom = findNearestAtomFromEvent(viewer, settings, pointer, 18);
        if (fallbackAtom) {
          selectAtom(fallbackAtom);
        } else {
          clearSelection();
        }
      }, 0);
    }, { capture: true });
    viewer.render();
    status.textContent = "Ready";
  } catch (error) {
    viewerHost.textContent = error?.message || "Could not render this structure.";
    return;
  }

  const syncOpacityControls = () => {
    for (const [control, enabled] of [
      [ligandOpacityControl, hetControl.input.checked],
      [waterOpacityControl, waterControl.input.checked],
      [surfaceOpacityControl, surfaceControl.input.checked]
    ]) {
      control.input.disabled = !enabled;
      control.label.classList.toggle("is-disabled", !enabled);
      control.label.setAttribute("aria-disabled", String(!enabled));
    }
  };
  syncOpacityControls();

  const applyControls = () => {
    hideTooltip(tooltip);
    settings.representation = repControl.select.value;
    settings.colorScheme = colorControl.select.value;
    settings.background = bgControl.select.value;
    settings.showHetAtoms = hetControl.input.checked;
    settings.showWaters = waterControl.input.checked;
    settings.showSurface = surfaceControl.input.checked;
    settings.ligandOpacity = normalizeProteinStructureOpacity(ligandOpacityControl.input.value, DEFAULT_LIGAND_OPACITY);
    settings.waterOpacity = normalizeProteinStructureOpacity(waterOpacityControl.input.value, DEFAULT_WATER_OPACITY);
    settings.surfaceOpacity = normalizeProteinStructureOpacity(surfaceOpacityControl.input.value, DEFAULT_SURFACE_OPACITY);
    syncOpacityControls();
    status.textContent = "Updated";
    styleViewer(viewer, settings);
  };
  for (const control of [
    repControl.select,
    colorControl.select,
    bgControl.select,
    hetControl.input,
    waterControl.input,
    surfaceControl.input,
    ligandOpacityControl.input,
    waterOpacityControl.input,
    surfaceOpacityControl.input
  ]) {
    control.addEventListener("change", applyControls);
  }
  for (const control of [ligandOpacityControl.input, waterOpacityControl.input, surfaceOpacityControl.input]) {
    control.addEventListener("input", applyControls);
  }
  fitButton.addEventListener("click", () => {
    hideTooltip(tooltip);
    fitStructure(viewer);
    status.textContent = "Fit structure";
  });
  let spinning = false;
  spinButton.addEventListener("click", () => {
    hideTooltip(tooltip);
    spinning = !spinning;
    spinButton.setAttribute("aria-pressed", String(spinning));
    if (spinButtonLabel) {
      spinButtonLabel.textContent = spinning ? "Stop spin" : "Spin";
    }
    viewer.spin(spinning ? "y" : false);
    viewer.render();
    status.textContent = spinning ? "Spinning" : "Spin stopped";
  });
  pngButton.addEventListener("click", () => {
    hideTooltip(tooltip);
    const stem = makeSafeFileStem(payload.title || "protein-structure", "protein-structure");
    if (!downloadPngFromViewer(viewer, `${stem}.png`)) {
      status.textContent = "PNG snapshot unavailable";
    } else {
      status.textContent = "PNG downloaded";
    }
  });
  const resizeObserver = new ResizeObserver(() => {
    hideTooltip(tooltip);
    viewer.resize();
    viewer.render();
  });
  resizeObserver.observe(viewerHost);
  container._sms3VisualCleanup = () => {
    hideTooltip(tooltip);
    if (hoverFrame) {
      window.cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
    }
    resizeObserver.disconnect();
    try {
      viewer.spin(false);
      viewer.clear?.();
    } catch {
      // Best effort cleanup for WebGL resources owned by 3Dmol.
    }
  };
}
