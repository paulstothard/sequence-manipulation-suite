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
const WHEEL_ZOOM_FACTOR = 1.14;
const MAX_STRUCTURE_SEARCH_OPTIONS = 80;
const DEFAULT_STRUCTURE_SELECTION_COLOR = "#14b8a6";
const STRUCTURE_SELECTION_COLORS = [
  ["#14b8a6", "Teal"],
  ["#3b82f6", "Blue"],
  ["#f59e0b", "Amber"],
  ["#d946ef", "Magenta"],
  ["#84cc16", "Lime"]
];
const STRUCTURE_ORIENTATIONS = [
  ["front", "Front"],
  ["side", "Side"],
  ["top", "Top"],
  ["iso", "Iso"]
];
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

export function proteinStructureWheelZoomFactor(deltaY) {
  const numericDeltaY = Number(deltaY);
  if (!Number.isFinite(numericDeltaY) || numericDeltaY === 0) {
    return 1;
  }
  return numericDeltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
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

function atomChain(atom) {
  return String(atom?.chain || "_").trim() || "_";
}

function atomResidueNumber(atom) {
  return String(atom?.resi ?? atom?.residue_number ?? "").trim();
}

function atomInsertionCode(atom) {
  return String(atom?.icode ?? atom?.inscode ?? "").trim();
}

function atomResidueName(atom) {
  return String(atom?.resn ?? atom?.residue_name ?? "").trim() || "UNK";
}

function structureAtomKind(atom) {
  const residueName = atomResidueName(atom).toUpperCase();
  if (residueName === "HOH" || residueName === "WAT") {
    return "water";
  }
  return atom?.hetflag ? "ligand" : "residue";
}

function atomHasFinitePosition(atom) {
  return [atom?.x, atom?.y, atom?.z].every((value) => Number.isFinite(Number(value)));
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

function fitStructure(viewer) {
  viewer.zoomTo();
  if (typeof viewer.zoom === "function") {
    viewer.zoom(1.12);
  }
  viewer.render();
}

function quaternionFromAxisAngle(axis, degrees) {
  const radians = (Number(degrees) * Math.PI) / 180;
  const halfAngle = radians / 2;
  const sin = Math.sin(halfAngle);
  return [axis.x * sin, axis.y * sin, axis.z * sin, Math.cos(halfAngle)];
}

function multiplyQuaternions(left, right) {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function orientationQuaternion(orientation) {
  if (orientation === "side") {
    return quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 90);
  }
  if (orientation === "top") {
    return quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, 90);
  }
  if (orientation === "iso") {
    return multiplyQuaternions(
      quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 35),
      quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, 35)
    );
  }
  return [0, 0, 0, 1];
}

function orientStructure(viewer, orientation) {
  fitStructure(viewer);
  if (typeof viewer.getView !== "function" || typeof viewer.setView !== "function") {
    return;
  }
  const view = viewer.getView();
  const quaternion = orientationQuaternion(orientation);
  viewer.setView([...view.slice(0, 4), ...quaternion, ...view.slice(8)]);
}

function focusStructureSelection(viewer, selection, model) {
  if (!selection) {
    return;
  }
  if (typeof viewer.getView !== "function" || typeof viewer.setView !== "function") {
    viewer.zoomTo(withModelSelection(selection, model));
    viewer.render();
    return;
  }
  const currentView = viewer.getView();
  viewer.zoomTo(withModelSelection(selection, model));
  const selectedView = viewer.getView();
  viewer.setView([
    ...selectedView.slice(0, 3),
    currentView[3],
    ...currentView.slice(4)
  ]);
}

function getBackgroundColor(value) {
  return BACKGROUND_COLORS[value] ?? BACKGROUND_COLORS.white;
}

function mainSelection(settings) {
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

function withModelSelection(selection, model) {
  return model ? { ...selection, model } : selection;
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

function clearModelStyle(model) {
  model?.setStyle?.({}, {});
}

function setModelStyle(model, selection, style) {
  if (model?.setStyle) {
    model.setStyle(selection, style);
  }
}

function applyConservationResidueStyles(target, settings) {
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
    setModelStyle(target, selection, getProteinStructureRepresentationStyle(settings, color));
  }
}

function styleNucleicAcidContext(target, settings) {
  if (!isResidueSphereRepresentation(settings)) {
    return;
  }
  const color = settings.background === "black" ? "#cbd5e1" : "#64748b";
  for (const resn of NUCLEIC_ACID_RESIDUES) {
    setModelStyle(target, { resn }, { line: { linewidth: 1.4, color } });
  }
}

function selectedStructureLabelStyle(settings) {
  return {
    backgroundColor: settings.background === "black" ? "#0f172a" : "#ffffff",
    backgroundOpacity: 0.82,
    borderColor: settings.background === "black" ? "#475569" : "#cbd5e1",
    borderThickness: 1,
    fontColor: settings.background === "black" ? "#e2e8f0" : "#0f172a",
    fontSize: 11,
    inFront: true,
    showBackground: true
  };
}

function selectedStructureMarkerColor(settings) {
  return settings.selectedStructureColor || DEFAULT_STRUCTURE_SELECTION_COLOR;
}

function selectedStructureRepresentationStyle(item, settings) {
  const color = selectedStructureMarkerColor(settings);
  if (item?.type === "water") {
    return {
      sphere: { scale: 0.24, color, opacity: normalizeProteinStructureOpacity(settings.waterOpacity, DEFAULT_WATER_OPACITY) }
    };
  }
  if (item?.type === "ligand") {
    return {
      stick: { radius: 0.2, color, opacity: normalizeProteinStructureOpacity(settings.ligandOpacity, DEFAULT_LIGAND_OPACITY) },
      sphere: { scale: 0.24, color, opacity: normalizeProteinStructureOpacity(settings.ligandOpacity, DEFAULT_LIGAND_OPACITY) }
    };
  }
  return getProteinStructureRepresentationStyle(settings, color);
}

function applySelectedStructureRepresentationStyles(models, settings) {
  const selectedItems = Array.isArray(settings.selectedStructureItems) ? settings.selectedStructureItems : [];
  for (const item of selectedItems) {
    if (!item?.selection) continue;
    if (item.type === "ligand") {
      setModelStyle(models.ligandModel ?? models.primaryModel, item.selection, selectedStructureRepresentationStyle(item, settings));
    } else if (item.type === "water") {
      setModelStyle(models.waterModel ?? models.primaryModel, item.selection, selectedStructureRepresentationStyle(item, settings));
    } else {
      setModelStyle(models.primaryModel, item.selection, selectedStructureRepresentationStyle(item, settings));
    }
  }
}

function addSelectedStructureOverlays(viewer, settings, models = {}) {
  const selections = Array.isArray(settings.selectedStructureItems) ? settings.selectedStructureItems : [];
  if (selections.length === 0) {
    return;
  }
  const color = selectedStructureMarkerColor(settings);
  selections.forEach((item, index) => {
    const center = item.center ?? {};
    const x = Number(center.x);
    const y = Number(center.y);
    const z = Number(center.z);
    if (![x, y, z].every(Number.isFinite)) {
      return;
    }
    const radius = item.type === "chain" ? 1.05 : item.type === "ligand" ? 0.72 : 0.58;
    try {
      viewer.addSphere?.({
        center: { x, y, z },
        radius,
        color,
        opacity: settings.background === "black" ? 0.26 : 0.2
      });
      viewer.addSphere?.({
        center: { x, y, z },
        radius: Math.max(0.12, radius * 0.18),
        color,
        opacity: 0.92
      });
    } catch {
      // Shape overlays are optional; labels and chips still identify the selection.
    }
    if (item.showLabel !== false && typeof viewer.addLabel === "function") {
      try {
        viewer.addLabel(`${index + 1} ${item.shortLabel || item.label}`, {
          ...selectedStructureLabelStyle(settings),
          position: { x, y, z }
        });
      } catch {
        // Older 3Dmol builds can omit label support.
      }
    }
  });
}

function residueInsertionSuffix(value) {
  const text = String(value ?? "").trim();
  return text && text !== "?" ? text : "";
}

function residueDisplayPosition(residueNumber, insertionCode = "") {
  return `${String(residueNumber || "?")}${residueInsertionSuffix(insertionCode)}`;
}

function averageAtomCenter(atoms) {
  const finiteAtoms = atoms.filter(atomHasFinitePosition);
  if (finiteAtoms.length === 0) {
    return null;
  }
  const total = finiteAtoms.reduce((sum, atom) => ({
    x: sum.x + Number(atom.x),
    y: sum.y + Number(atom.y),
    z: sum.z + Number(atom.z)
  }), { x: 0, y: 0, z: 0 });
  return {
    x: total.x / finiteAtoms.length,
    y: total.y / finiteAtoms.length,
    z: total.z / finiteAtoms.length
  };
}

function representativeAtomForEntry(atoms, type) {
  if (type === "residue") {
    return atoms.find((atom) => String(atom?.atom ?? atom?.atom_name ?? "").trim().toUpperCase() === "CA") ?? atoms[0];
  }
  return atoms[0];
}

function selectionForStructureEntry({ type, chain, residueNumber, insertionCode, residueName }) {
  if (type === "chain") {
    return chain === "_" ? {} : { chain };
  }
  const numericResidue = Number.parseInt(residueNumber, 10);
  const selection = {};
  if (chain) selection.chain = chain;
  if (Number.isFinite(numericResidue)) selection.resi = numericResidue;
  if (insertionCode) selection.icode = insertionCode;
  if (residueName) selection.resn = residueName;
  if (type === "residue") selection.hetflag = false;
  if (type === "ligand" || type === "water") selection.hetflag = true;
  return selection;
}

function makeStructureSearchEntry({ type, chain, residueNumber = "", insertionCode = "", residueName = "", atoms = [] }) {
  const representativeAtom = representativeAtomForEntry(atoms, type);
  const center = type === "residue" && representativeAtom && atomHasFinitePosition(representativeAtom)
    ? { x: Number(representativeAtom.x), y: Number(representativeAtom.y), z: Number(representativeAtom.z) }
    : averageAtomCenter(atoms);
  const position = residueDisplayPosition(residueNumber, insertionCode);
  const moleculeType = type === "water" ? "Water" : type === "ligand" ? "Ligand" : type === "chain" ? "Chain" : "Residue";
  const shortLabel = type === "chain"
    ? `Chain ${chain}`
    : type === "residue"
      ? `${chain}:${position} ${residueName}`
      : `${moleculeType} ${residueName} ${position} chain ${chain}`;
  const label = type === "chain"
    ? `Chain ${chain} (${atoms.length.toLocaleString()} atoms)`
    : shortLabel;
  const aliases = type === "chain"
    ? [`CHAIN ${chain}`, chain]
    : [
        `${chain}:${position}`,
        `${chain}:${residueName}${position}`,
        position,
        residueName,
        `${residueName}${position}`,
        shortLabel,
        label
      ];
  return {
    id: `${type}|${chain}|${residueNumber}|${insertionCode}|${residueName}`,
    type,
    moleculeType,
    chain,
    residueNumber,
    insertionCode,
    residueName,
    atomCount: atoms.length,
    representativeAtom,
    center,
    selection: selectionForStructureEntry({ type, chain, residueNumber, insertionCode, residueName }),
    label,
    shortLabel,
    aliases
  };
}

function buildStructureSearchIndex(viewer, models = {}) {
  const primaryModel = models.primaryModel ?? null;
  let atoms = [];
  try {
    atoms = viewer.selectedAtoms(withModelSelection({}, primaryModel)).filter(atomHasFinitePosition);
  } catch {
    atoms = [];
  }
  const moleculeGroups = new Map();
  const chainGroups = new Map();
  for (const atom of atoms) {
    const chain = atomChain(atom);
    const residueNumber = atomResidueNumber(atom);
    const insertionCode = atomInsertionCode(atom);
    const residueName = atomResidueName(atom);
    const type = structureAtomKind(atom);
    const key = `${type}|${chain}|${residueNumber}|${insertionCode}|${residueName}`;
    if (!moleculeGroups.has(key)) {
      moleculeGroups.set(key, { type, chain, residueNumber, insertionCode, residueName, atoms: [] });
    }
    moleculeGroups.get(key).atoms.push(atom);
    if (!chainGroups.has(chain)) {
      chainGroups.set(chain, []);
    }
    chainGroups.get(chain).push(atom);
  }
  const entries = [
    ...[...chainGroups.entries()]
      .map(([chain, chainAtoms]) => makeStructureSearchEntry({ type: "chain", chain, atoms: chainAtoms })),
    ...[...moleculeGroups.values()].map(makeStructureSearchEntry)
  ].filter((entry) => entry.center);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return { entries, byId };
}

function normalizeStructureSearchText(value) {
  return String(value ?? "").trim().toUpperCase();
}

function parsedStructureSearchQuery(query) {
  const text = normalizeStructureSearchText(query);
  const noSpace = text.replace(/\s+/g, "");
  const chainMatch = text.match(/^CHAIN\s+(.+)$/i);
  const chainResidueMatch = noSpace.match(/^([^:]+):([A-Z]{3})?(-?\d+)([A-Z]?)$/);
  const residueNumberMatch = noSpace.match(/^-?\d+[A-Z]?$/);
  return {
    text,
    noSpace,
    chain: chainMatch?.[1]?.trim().toUpperCase() ?? "",
    chainResidue: chainResidueMatch
      ? {
          chain: chainResidueMatch[1],
          residueName: chainResidueMatch[2] || "",
          residueNumber: chainResidueMatch[3],
          insertionCode: chainResidueMatch[4] || ""
        }
      : null,
    residueNumber: residueNumberMatch ? noSpace.match(/^(-?\d+)([A-Z]?)$/)?.[1] ?? "" : "",
    insertionCode: residueNumberMatch ? noSpace.match(/^(-?\d+)([A-Z]?)$/)?.[2] ?? "" : ""
  };
}

function scoreStructureSearchEntry(entry, parsed) {
  if (!parsed.text) return -1;
  if (parsed.chain && entry.type === "chain" && entry.chain.toUpperCase() === parsed.chain) return 120;
  if (parsed.chainResidue) {
    const chainMatches = entry.chain.toUpperCase() === parsed.chainResidue.chain;
    const residueMatches = String(entry.residueNumber) === parsed.chainResidue.residueNumber;
    const insertionMatches = !parsed.chainResidue.insertionCode ||
      entry.insertionCode.toUpperCase() === parsed.chainResidue.insertionCode;
    const nameMatches = !parsed.chainResidue.residueName ||
      entry.residueName.toUpperCase() === parsed.chainResidue.residueName;
    if (chainMatches && residueMatches && insertionMatches && nameMatches) return 110;
  }
  if (parsed.residueNumber && String(entry.residueNumber) === parsed.residueNumber) {
    return parsed.insertionCode && entry.insertionCode.toUpperCase() !== parsed.insertionCode ? -1 : 90;
  }
  const entryResidue = entry.residueName.toUpperCase();
  if (entryResidue === parsed.noSpace) {
    return entry.type === "ligand" || entry.type === "water" ? 88 : 70;
  }
  const aliases = entry.aliases.map(normalizeStructureSearchText);
  if (aliases.some((alias) => alias === parsed.noSpace || alias === parsed.text)) return 82;
  if (aliases.some((alias) => alias.includes(parsed.noSpace) || alias.includes(parsed.text))) return 45;
  return -1;
}

function searchStructureEntries(index, query, limit = MAX_STRUCTURE_SEARCH_OPTIONS) {
  const parsed = parsedStructureSearchQuery(query);
  if (!parsed.text) {
    return index.entries.slice(0, limit);
  }
  return index.entries
    .map((entry) => ({ entry, score: scoreStructureSearchEntry(entry, parsed) }))
    .filter((match) => match.score >= 0)
    .sort((left, right) =>
      right.score - left.score ||
      left.entry.type.localeCompare(right.entry.type) ||
      left.entry.chain.localeCompare(right.entry.chain) ||
      Number(left.entry.residueNumber || 0) - Number(right.entry.residueNumber || 0) ||
      left.entry.residueName.localeCompare(right.entry.residueName)
    )
    .slice(0, limit)
    .map((match) => match.entry);
}

function styleViewer(viewer, settings, models = {}) {
  const primaryModel = models.primaryModel ?? viewer;
  const ligandModel = models.ligandModel ?? viewer;
  const waterModel = models.waterModel ?? viewer;
  viewer.setBackgroundColor(getBackgroundColor(settings.background));
  viewer.removeAllSurfaces?.();
  viewer.removeAllLabels?.();
  viewer.removeAllShapes?.();
  clearModelStyle(primaryModel);
  if (ligandModel !== primaryModel) clearModelStyle(ligandModel);
  if (waterModel !== primaryModel && waterModel !== ligandModel) clearModelStyle(waterModel);
  setModelStyle(primaryModel, primaryStructureSelection(settings), getProteinStructureRepresentationStyle(settings));
  applyConservationResidueStyles(primaryModel, settings);
  styleNucleicAcidContext(primaryModel, settings);
  if (settings.showHetAtoms) {
    setModelStyle(ligandModel, { hetflag: true, not: { resn: "HOH" } }, getProteinStructureLigandStyle(settings));
  }
  if (settings.showWaters) {
    setModelStyle(waterModel, { resn: "HOH" }, getProteinStructureWaterStyle(settings));
  }
  if (settings.showSurface && window.$3Dmol?.SurfaceType?.VDW) {
    viewer.addSurface(
      window.$3Dmol.SurfaceType.VDW,
      getProteinStructureSurfaceStyle(settings),
      withModelSelection(surfaceSelection(settings), primaryModel)
    );
  }
  applySelectedStructureRepresentationStyles({ primaryModel, ligandModel, waterModel }, settings);
  addSelectedStructureOverlays(viewer, settings, models);
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
    empty.textContent = "Click a residue to show its details.";
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
    const item = document.createElement("div");
    item.className = "protein-structure-details-chip";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    if (rest.length === 0) {
      dt.textContent = "Residue";
      dd.textContent = line;
    } else {
      dt.textContent = label;
      dd.textContent = rest.join(":").trim();
    }
    item.append(dt, dd);
    grid.append(item);
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

function makeStructureFindControl() {
  const group = document.createElement("div");
  group.className = "protein-structure-search-group";
  group.setAttribute("aria-label", "Find residue or molecule");
  const label = document.createElement("label");
  label.className = "protein-structure-search-label";
  const labelText = document.createElement("span");
  labelText.textContent = "Find residue / molecule";
  const inputRow = document.createElement("span");
  inputRow.className = "protein-structure-search-row";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "A:23, A:GLY23, NAG, HOH";
  input.autocomplete = "off";
  const datalist = document.createElement("datalist");
  datalist.id = `protein-structure-search-${Math.random().toString(36).slice(2)}`;
  input.setAttribute("list", datalist.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "protein-structure-search-button";
  button.textContent = "Find";
  inputRow.append(input, button);
  label.append(labelText, inputRow);
  const colorField = document.createElement("fieldset");
  colorField.className = "protein-structure-highlight-colors";
  const colorLegend = document.createElement("legend");
  colorLegend.textContent = "Selection color";
  const colorName = `protein-structure-highlight-${Math.random().toString(36).slice(2)}`;
  const colorInputs = [];
  for (const [value, colorLabel] of STRUCTURE_SELECTION_COLORS) {
    const colorChoice = document.createElement("label");
    colorChoice.className = "protein-structure-highlight-color";
    colorChoice.title = colorLabel;
    colorChoice.setAttribute("aria-label", colorLabel);
    const colorInput = document.createElement("input");
    colorInput.type = "radio";
    colorInput.name = colorName;
    colorInput.value = value;
    colorInput.checked = value === DEFAULT_STRUCTURE_SELECTION_COLOR;
    const swatch = document.createElement("span");
    swatch.style.backgroundColor = value;
    colorChoice.append(colorInput, swatch);
    colorField.append(colorChoice);
    colorInputs.push(colorInput);
  }
  const chips = document.createElement("div");
  chips.className = "protein-structure-selection-chips";
  group.append(label, colorField, datalist, chips);
  return { group, input, datalist, button, chips, colorInputs };
}

function renderStructureSearchOptions(datalist, entries) {
  datalist.textContent = "";
  for (const entry of entries.slice(0, MAX_STRUCTURE_SEARCH_OPTIONS)) {
    const option = document.createElement("option");
    option.value = entry.label;
    option.label = entry.moleculeType;
    datalist.append(option);
  }
}

function renderStructureSelectionChips(container, selectedItems, actions = {}) {
  container.textContent = "";
  if (!selectedItems.length) {
    const empty = document.createElement("span");
    empty.className = "protein-structure-selection-empty";
    empty.textContent = "No pinned items";
    container.append(empty);
    return;
  }
  selectedItems.forEach((item, index) => {
    const chip = document.createElement("span");
    chip.className = "protein-structure-selection-chip";
    chip.dataset.selectionType = item.type;
    const number = document.createElement("span");
    number.className = "protein-structure-selection-number";
    number.textContent = String(index + 1);
    const label = document.createElement("span");
    label.className = "protein-structure-selection-label";
    label.textContent = item.shortLabel || item.label;
    const center = document.createElement("button");
    center.type = "button";
    center.textContent = "Focus";
    center.addEventListener("click", () => actions.onCenter?.(item));
    const toggleLabel = document.createElement("button");
    toggleLabel.type = "button";
    toggleLabel.textContent = item.showLabel === false ? "Label" : "Hide label";
    toggleLabel.addEventListener("click", () => actions.onToggleLabel?.(item.id));
    const clear = document.createElement("button");
    clear.type = "button";
    clear.title = `Clear ${item.shortLabel || item.label}`;
    clear.setAttribute("aria-label", `Clear ${item.shortLabel || item.label}`);
    clear.textContent = "×";
    clear.addEventListener("click", () => actions.onClear?.(item.id));
    chip.append(number, label, center, toggleLabel, clear);
    container.append(chip);
  });
}

function findNearestAtomFromEvent(viewer, settings, event, maxPixelDistance = 18, models = {}) {
  let atoms = [];
  try {
    atoms = viewer
      .selectedAtoms(withModelSelection(interactionSelection(settings), models.primaryModel))
      .filter((atom) => Number.isFinite(atom.x) && Number.isFinite(atom.y) && Number.isFinite(atom.z));
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
    selectedStructureColor: DEFAULT_STRUCTURE_SELECTION_COLOR,
    selectedStructureItems: []
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
  const orientationButtons = STRUCTURE_ORIENTATIONS.map(([value, label]) => {
    const button = makeButton(`${label} view`, null, "protein-structure-orientation-button", label);
    button.dataset.orientation = value;
    return button;
  });
  const spinButton = makeButton("Toggle spin", null, "protein-structure-spin-button", "Spin");
  spinButton.setAttribute("aria-pressed", "false");
  const spinButtonLabel = spinButton.querySelector(".dna-viewer-export-label");
  const pngButton = makeButton("Download PNG", BUTTON_ICONS.download, "dna-viewer-export-button protein-structure-export-button", "PNG");
  const status = document.createElement("span");
  status.className = "protein-structure-status";
  status.setAttribute("aria-live", "polite");
  buttons.append(fitButton, ...orientationButtons, spinButton, pngButton);
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
  toggleGroup.className = "protein-structure-toggle-group";
  toggleGroup.setAttribute("aria-label", "Molecules to show");
  toggleGroup.append(hetControl.label, waterControl.label, surfaceControl.label);
  const opacityGroup = document.createElement("div");
  opacityGroup.className = "protein-structure-opacity-group";
  opacityGroup.setAttribute("aria-label", "Layer opacity controls");
  opacityGroup.append(ligandOpacityControl.label, waterOpacityControl.label, surfaceOpacityControl.label);
  const layerGroup = document.createElement("div");
  layerGroup.className = "protein-structure-layer-group";
  layerGroup.append(toggleGroup, opacityGroup);
  const findControl = makeStructureFindControl();
  findControl.group.style.setProperty("--protein-structure-selection-color", settings.selectedStructureColor);
  toolbar.append(heading, settingsGroup, layerGroup, findControl.group, actionGroup);

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
  let viewerModels;
  let structureSearchIndex = { entries: [], byId: new Map() };
  try {
    viewer = window.$3Dmol.createViewer(viewerHost, {
      backgroundColor: getBackgroundColor(settings.background),
      antialias: true
    });
    const viewerFormat = payload.viewerFormat ?? payload.format;
    const viewerModelFormat = viewerFormat === "mmcif" ? "cif" : "pdb";
    viewerModels = {
      primaryModel: viewer.addModel(structureText, viewerModelFormat),
      ligandModel: viewer.addModel(structureText, viewerModelFormat),
      waterModel: viewer.addModel(structureText, viewerModelFormat)
    };
    viewerHost._sms3ProteinStructureViewer = viewer;
    viewerHost._sms3ProteinStructureModels = viewerModels;
    structureSearchIndex = buildStructureSearchIndex(viewer, viewerModels);
    renderStructureSearchOptions(findControl.datalist, structureSearchIndex.entries);
    styleViewer(viewer, settings, viewerModels);
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
      settings.selectedStructureItems = [];
      renderSelectedDetails(detailsPanel, null, conservationDetails);
      renderStructureSelectionChips(findControl.chips, settings.selectedStructureItems, selectionChipActions);
      status.textContent = "Selection cleared";
      styleViewer(viewer, settings, viewerModels);
      fitStructure(viewer);
    };
    const centerStructureItem = (item, message = "") => {
      hideTooltip(tooltip);
      if (!item?.selection) {
        status.textContent = "No item selected";
        return;
      }
      focusStructureSelection(viewer, item.selection, viewerModels.primaryModel);
      status.textContent = message || `Focused ${item.shortLabel || item.label}`;
    };
    const centerLastSelection = () => {
      const item = settings.selectedStructureItems.at(-1);
      if (!item) {
        status.textContent = "No item selected";
        return;
      }
      centerStructureItem(item, "Focused selected residue");
    };
    const selectStructureEntry = (entry, { replace = false, source = "search" } = {}) => {
      hideTooltip(tooltip);
      if (!entry) {
        status.textContent = "No matching residue or molecule";
        return;
      }
      const selectedItem = { ...entry, showLabel: entry.showLabel !== false };
      const existingItems = replace
        ? []
        : settings.selectedStructureItems.filter((item) => item.id !== selectedItem.id);
      settings.selectedStructureItems = [...existingItems, selectedItem].slice(-8);
      if (selectedItem.representativeAtom) {
        renderSelectedDetails(detailsPanel, selectedItem.representativeAtom, conservationDetails, {
          onCopy: copyDetails,
          onFocus: centerLastSelection,
          onClear: clearSelection
        });
      } else {
        renderSelectedDetails(detailsPanel, null, conservationDetails);
      }
      renderStructureSelectionChips(findControl.chips, settings.selectedStructureItems, selectionChipActions);
      status.textContent = source === "canvas" ? "Residue selected" : `Selected ${selectedItem.shortLabel || selectedItem.label}`;
      styleViewer(viewer, settings, viewerModels);
    };
    const selectionChipActions = {
      onCenter: centerStructureItem,
      onToggleLabel: (id) => {
        settings.selectedStructureItems = settings.selectedStructureItems.map((item) =>
          item.id === id ? { ...item, showLabel: item.showLabel === false } : item
        );
        renderStructureSelectionChips(findControl.chips, settings.selectedStructureItems, selectionChipActions);
        styleViewer(viewer, settings, viewerModels);
      },
      onClear: (id) => {
        settings.selectedStructureItems = settings.selectedStructureItems.filter((item) => item.id !== id);
        renderStructureSelectionChips(findControl.chips, settings.selectedStructureItems, selectionChipActions);
        const lastItem = settings.selectedStructureItems.at(-1);
        renderSelectedDetails(detailsPanel, lastItem?.representativeAtom ?? null, conservationDetails, {
          onCopy: copyDetails,
          onFocus: centerLastSelection,
          onClear: clearSelection
        });
        status.textContent = "Selection cleared";
        styleViewer(viewer, settings, viewerModels);
      }
    };
    renderStructureSelectionChips(findControl.chips, settings.selectedStructureItems, selectionChipActions);
    const selectFirstSearchMatch = () => {
      const query = findControl.input.value.trim();
      const exactMatch = structureSearchIndex.entries.find((entry) => entry.label === query);
      const entry = exactMatch ?? searchStructureEntries(structureSearchIndex, query, 1)[0];
      selectStructureEntry(entry, { replace: false, source: "search" });
    };
    findControl.input.addEventListener("input", () => {
      renderStructureSearchOptions(findControl.datalist, searchStructureEntries(structureSearchIndex, findControl.input.value));
    });
    findControl.input.addEventListener("change", () => {
      const exactMatch = structureSearchIndex.entries.find((entry) => entry.label === findControl.input.value.trim());
      if (exactMatch) {
        selectStructureEntry(exactMatch, { replace: false, source: "search" });
      }
    });
    findControl.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        selectFirstSearchMatch();
      }
    });
    findControl.button.addEventListener("click", selectFirstSearchMatch);
    for (const colorInput of findControl.colorInputs) {
      colorInput.addEventListener("change", () => {
        if (!colorInput.checked) return;
        settings.selectedStructureColor = colorInput.value;
        findControl.group.style.setProperty("--protein-structure-selection-color", settings.selectedStructureColor);
        status.textContent = "Selection color updated";
        styleViewer(viewer, settings, viewerModels);
      });
    }
    const entryForAtom = (atom) => {
      const type = structureAtomKind(atom);
      const id = `${type}|${atomChain(atom)}|${atomResidueNumber(atom)}|${atomInsertionCode(atom)}|${atomResidueName(atom)}`;
      return structureSearchIndex.byId.get(id) ?? makeStructureSearchEntry({
        type,
        chain: atomChain(atom),
        residueNumber: atomResidueNumber(atom),
        insertionCode: atomInsertionCode(atom),
        residueName: atomResidueName(atom),
        atoms: [atom]
      });
    };
    const selectAtom = (atom) => {
      selectStructureEntry(entryForAtom(atom), { replace: true, source: "canvas" });
    };
    let lastMolHoverAt = 0;
    viewer.setHoverable(withModelSelection(interactionSelection(settings), viewerModels.primaryModel), true, (atom, _viewer, event) => {
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
    viewer.setClickable(withModelSelection(interactionSelection(settings), viewerModels.primaryModel), true, (atom) => {
      if (residuePickingSuppressed()) return;
      lastAtomClickAt = Date.now();
      selectAtom(atom);
    });
    viewerHost.addEventListener("mousemove", (event) => {
      if (hoverFrame) return;
      const pointer = { clientX: event.clientX, clientY: event.clientY };
      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = 0;
        const atom = findNearestAtomFromEvent(viewer, settings, pointer, 16, viewerModels);
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
    viewerHost.addEventListener("wheel", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelPointerPick();
      const factor = proteinStructureWheelZoomFactor(event.deltaY);
      if (factor !== 1 && typeof viewer.zoom === "function") {
        viewer.zoom(factor);
        viewer.render();
      }
    }, { capture: true, passive: false });
    viewerHost.addEventListener("touchstart", cancelPointerPick, { passive: true });
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
        const fallbackAtom = findNearestAtomFromEvent(viewer, settings, pointer, 18, viewerModels);
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
    let visibleCount = 0;
    for (const [control, enabled] of [
      [ligandOpacityControl, hetControl.input.checked],
      [waterOpacityControl, waterControl.input.checked],
      [surfaceOpacityControl, surfaceControl.input.checked]
    ]) {
      if (enabled) visibleCount += 1;
      control.input.disabled = !enabled;
      control.label.hidden = !enabled;
      control.label.toggleAttribute("aria-hidden", !enabled);
    }
    opacityGroup.hidden = visibleCount === 0;
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
    styleViewer(viewer, settings, viewerModels);
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
  for (const button of orientationButtons) {
    button.addEventListener("click", () => {
      hideTooltip(tooltip);
      orientStructure(viewer, button.dataset.orientation);
      status.textContent = `${button.textContent} view`;
    });
  }
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
