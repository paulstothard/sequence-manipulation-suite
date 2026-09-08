import { detectDelimiter, parseDelimitedRows, buildTableFromRows, exportDelimitedTable } from "./table.js";
import { resolveRandom, randomInteger } from "./random-sequence.js";

// Standard A1 orientation: rows A–H / A–P, columns 1–12 / 1–24.
// https://docs.opentrons.com/python-api/labware/#well-ordering
export const PLATE_LIMITS = Object.freeze({ rows: 2000, assignments: 7680, plates: 20, input: 1_000_000, assignmentBytes: 8 * 1024 * 1024 });
export const PLATE_ROLES = ["sample", "control", "standard", "blank"];
export const plateColumns = [
  ["plate", "Plate", "number"], ["plate_name", "Plate name"], ["well", "Well"], ["status", "Status"],
  ["assignment_id", "Assignment ID"], ["sample", "Sample"], ["replicate", "Replicate", "number"],
  ["group", "Group"], ["role", "Role"], ["notes", "Notes"], ["metadata", "Additional metadata"]
].map(([id, label, type = "string"]) => ({ id, label, type }));
const clone = value => structuredClone(value);
function integer(value, fallback, min, max, name) {
  const n = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
}
function text(value, max, label, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${label} must ${required ? "not be empty and " : ""}contain at most ${max} characters.`);
  return value;
}
export function plateDimensions(size) {
  if (Number(size) === 96) return { rows: 8, columns: 12 };
  if (Number(size) === 384) return { rows: 16, columns: 24 };
  throw new Error("Choose a 96- or 384-well plate.");
}
export function wellIndex(well, size) {
  const { rows, columns } = plateDimensions(size);
  const match = /^([A-P])0?([1-9]|1\d|2[0-4])$/i.exec(String(well).trim());
  const row = match ? match[1].toUpperCase().charCodeAt(0) - 65 : -1, column = match ? Number(match[2]) - 1 : -1;
  if (row < 0 || row >= rows || column < 0 || column >= columns) throw new Error(`Invalid well ${JSON.stringify(well)} for a ${size}-well plate.`);
  return row * columns + column;
}
export function wellName(index, size) {
  const { columns } = plateDimensions(size);
  integer(index, -1, 0, Number(size) - 1, "Well index");
  return `${String.fromCharCode(65 + Math.floor(index / columns))}${index % columns + 1}`;
}
export function parseReservedWells(value, size, excludeEdges = false) {
  const result = new Set();
  for (const token of String(value ?? "").split(/[\s,;]+/).filter(Boolean)) {
    const endpoints = token.split(":");
    if (endpoints.length > 2) throw new Error(`Invalid well range ${token}. Use A1:C3.`);
    const start = wellIndex(endpoints[0], size), end = wellIndex(endpoints.at(-1), size);
    const { columns } = plateDimensions(size);
    const r1 = Math.floor(start / columns), r2 = Math.floor(end / columns), c1 = start % columns, c2 = end % columns;
    if (r1 > r2 || c1 > c2) throw new Error(`Well range ${token} must run from top left to bottom right.`);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) result.add(r * columns + c);
  }
  if (excludeEdges) {
    const { rows, columns } = plateDimensions(size);
    for (let i = 0; i < Number(size); i++) if (i < columns || i >= (rows - 1) * columns || i % columns === 0 || i % columns === columns - 1) result.add(i);
  }
  return [...result].sort((a, b) => a - b);
}
export function normalizePlateOptions(options = {}) {
  const size = Number(options.plateSize ?? 96);
  plateDimensions(size);
  const fillOrder = options.fillOrder ?? "row";
  if (!["row", "column", "random"].includes(fillOrder)) throw new Error("Choose a row, column, or randomized fill order.");
  const replicateOrder = options.replicateOrder ?? "together";
  if (!["together", "interleaved"].includes(replicateOrder)) throw new Error("Choose a supported replicate order.");
  const outputFormat = options.outputFormat ?? "plate-map";
  if (!["plate-map", "table"].includes(outputFormat)) throw new Error("Choose plate map or well-assignment table output.");
  const reserved = parseReservedWells(options.reservedWells, size, options.excludeEdges === true);
  if (reserved.length === size) throw new Error("All wells are reserved. Leave at least one well available.");
  return { size, fillOrder, replicateOrder: fillOrder === "random" ? "together" : replicateOrder, outputFormat, reserved,
    replicates: integer(options.replicates, 3, 1, 384, "Replicates"),
    maxPlates: integer(options.maxPlates, 20, 1, 20, "Maximum plates"),
    title: text(String(options.title ?? "Plate layout").trim(), 120, "Layout title", true),
    seed: text(String(options.seed ?? ""), 160, "Random seed") };
}

export function parsePlateSamples(input, settings) {
  if (String(input).length > PLATE_LIMITS.input) throw new Error("Sample input exceeds 1 million characters.");
  const detection = detectDelimiter(input);
  const parsed = parseDelimitedRows(input, detection.delimiter);
  if (parsed.rows.length > PLATE_LIMITS.rows + 1) throw new Error("Enter a sample table with 1 to 2,000 sample rows.");
  if (parsed.rows.some(row => row.length > 107)) throw new Error("Sample tables support at most 107 columns: the seven named fields and up to 100 metadata columns.");
  const built = buildTableFromRows(parsed.rows);
  const table = { ...built, warnings: [...parsed.warnings, ...built.warnings] };
  const malformed = table.warnings.filter(warning => !/^Column ".*" is empty for all rows\.$/.test(warning));
  if (malformed.length) throw new Error(`Correct the sample table before allocation: ${malformed.join(" ")}`);
  if (!table.rows.length || table.rows.length > PLATE_LIMITS.rows) throw new Error("Enter a sample table with 1 to 2,000 sample rows.");
  const lookup = new Map(table.columns.map(c => [c.label.trim().toLowerCase(), c.id]));
  if (!lookup.has("sample")) throw new Error('The sample table needs a header named "sample". Optional columns: group, role, replicates, plate, well, notes.');
  const known = new Set(["sample", "group", "role", "replicates", "plate", "well", "notes"]);
  const items = [], fixed = [];
  let assignmentBytes = 0;
  const encoder = new TextEncoder();
  for (const [i, row] of table.rows.entries()) {
    const read = name => String(row[lookup.get(name)] ?? "").trim();
    const sample = text(read("sample"), 120, `Sample in row ${i + 2}`, true);
    const group = text(read("group"), 120, "Group"), notes = text(read("notes"), 1000, "Notes");
    const role = read("role").toLowerCase() || "sample";
    if (!PLATE_ROLES.includes(role)) throw new Error(`Row ${i + 2}: role must be sample, control, standard, or blank.`);
    const replicates = integer(read("replicates"), settings.replicates, 1, 384, `Replicates in row ${i + 2}`);
    if (items.length + replicates > PLATE_LIMITS.assignments) throw new Error("Layout exceeds 7,680 assignments. Reduce samples or replicates.");
    const wells = read("well").split(/[\s,;]+/).filter(Boolean);
    if (read("plate") && !wells.length) throw new Error(`Row ${i + 2}: a fixed plate requires a well.`);
    if (wells.length && wells.length !== replicates) throw new Error(`Row ${i + 2}: supply ${replicates} fixed wells (one per replicate), or leave well empty for automatic placement.`);
    const plate = integer(read("plate"), 1, 1, settings.maxPlates, `Plate in row ${i + 2}`) - 1;
    const metadata = Object.fromEntries(table.columns.filter(c => !known.has(c.label.trim().toLowerCase())).map(c => [c.label, text(String(row[c.id] ?? ""), 1000, c.label)]));
    for (let rep = 1; rep <= replicates; rep++) {
      const item = { id: `S${i + 1}-R${rep}`, sample, group, role, replicate: rep, notes, metadata };
      assignmentBytes += encoder.encode(JSON.stringify(item)).length;
      if (assignmentBytes > PLATE_LIMITS.assignmentBytes) throw new Error("Assignment data exceeds 8 MB after expanding replicates. Reduce metadata, notes, or replicates.");
      items.push(item);
      if (wells.length) fixed.push({ id: item.id, plate, index: wellIndex(wells[rep - 1], settings.size) });
    }
  }
  return { items, fixed };
}
function blankPlate(size, index, reserved = []) {
  const blocked = new Set(reserved);
  return { name: `Plate ${index + 1}`, wells: Array.from({ length: size }, (_, i) => ({ well: wellName(i, size), reserved: blocked.has(i), itemId: null })) };
}
export async function buildPlateLayout(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "reading-samples", progress: 0.05 });
  await context.yieldIfNeeded?.();
  const settings = normalizePlateOptions(options);
  const { items, fixed } = parsePlateSamples(input, settings);
  const capacity = settings.size - settings.reserved.length;
  const plateCount = Math.max(Math.ceil(items.length / capacity), ...fixed.map(f => f.plate + 1));
  if (plateCount > settings.maxPlates) throw new Error(`These samples need ${plateCount} plates with the reserved wells. Increase Maximum plates or reduce the assignments.`);
  const plates = Array.from({ length: plateCount }, (_, i) => blankPlate(settings.size, i, settings.reserved));
  for (const f of fixed) {
    const well = plates[f.plate].wells[f.index];
    if (well.reserved || well.itemId) throw new Error(`Plate ${f.plate + 1}, ${well.well}: fixed assignment conflicts with a reserved or occupied well.`);
    well.itemId = f.id;
  }
  const fixedIds = new Set(fixed.map(f => f.id));
  let remaining = items.filter(item => !fixedIds.has(item.id));
  if (settings.replicateOrder === "interleaved") remaining = remaining.sort((a, b) => a.replicate - b.replicate);
  const { columns, rows } = plateDimensions(settings.size);
  const indexes = settings.fillOrder === "column"
    ? Array.from({ length: settings.size }, (_, i) => (i % rows) * columns + Math.floor(i / rows))
    : Array.from({ length: settings.size }, (_, i) => i);
  const slots = plates.flatMap((plate, p) => indexes.filter(i => !plate.wells[i].reserved && !plate.wells[i].itemId).map(i => [p, i]));
  if (settings.fillOrder === "random") {
    const { seed, random } = resolveRandom(settings);
    settings.seed = seed;
    for (let i = slots.length - 1; i > 0; i--) {
      const j = randomInteger(random, i + 1);
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
  } else settings.seed = "";
  for (const [i, item] of remaining.entries()) {
    if (i % 256 === 0) {
      context.reportProgress?.({ phase: "assigning-wells", progress: 0.15 + 0.7 * i / remaining.length });
      await context.yieldIfNeeded?.();
      context.throwIfCancelled?.();
    }
    const [p, w] = slots[i];
    plates[p].wells[w].itemId = item.id;
  }
  const layout = { version: 1, title: settings.title, size: settings.size, settings, items, plates };
  validatePlateLayout(layout);
  context.throwIfCancelled?.();
  return layout;
}

export function validatePlateLayout(layout) {
  if (!layout || layout.version !== 1) throw new Error("Unsupported plate layout version.");
  plateDimensions(layout.size);
  if (![96, 384].includes(layout.size)) throw new Error("Invalid plate size.");
  text(layout.title, 120, "Layout title", true);
  if (!layout.settings || typeof layout.settings !== "object" || typeof layout.settings.seed !== "string") throw new Error("The layout is missing allocation settings.");
  text(layout.settings.seed, 160, "Seed");
  if (!Array.isArray(layout.settings.reserved) || layout.settings.reserved.length > layout.size || layout.settings.reserved.some(i => !Number.isInteger(i) || i < 0 || i >= layout.size) || new Set(layout.settings.reserved).size !== layout.settings.reserved.length) throw new Error("Invalid reserved-well settings.");
  if (layout.settings.size !== layout.size || !["row", "column", "random"].includes(layout.settings.fillOrder)) throw new Error("Invalid allocation settings.");
  if (!Array.isArray(layout.items) || layout.items.length > PLATE_LIMITS.assignments) throw new Error("Invalid assignment list.");
  const ids = new Set();
  let assignmentBytes = 0;
  const encoder = new TextEncoder();
  for (const item of layout.items) {
    if (!item || ids.has(item.id) || typeof item.id !== "string" || !/^[\w-]{1,80}$/.test(item.id)) throw new Error("Assignment IDs must be unique.");
    ids.add(item.id);
    text(item.sample, 120, "Sample", true); text(item.group, 120, "Group"); text(item.notes, 1000, "Notes");
    integer(item.replicate, -1, 1, 384, "Replicate");
    if (!PLATE_ROLES.includes(item.role)) throw new Error("Invalid assignment role.");
    if (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata) || Object.keys(item.metadata).length > 100) throw new Error("Invalid sample metadata.");
    for (const [key, value] of Object.entries(item.metadata)) { text(key, 200, "Metadata column"); text(value, 1000, "Metadata value"); }
    assignmentBytes += encoder.encode(JSON.stringify(item)).length;
    if (assignmentBytes > PLATE_LIMITS.assignmentBytes) throw new Error("Assignment data exceeds 8 MB. Reduce metadata, notes, or replicates.");
  }
  if (!Array.isArray(layout.plates) || !layout.plates.length || layout.plates.length > 20) throw new Error("A layout needs 1 to 20 plates.");
  const assigned = new Set();
  for (const plate of layout.plates) {
    text(plate.name, 120, "Plate name", true);
    if (!Array.isArray(plate.wells) || plate.wells.length !== layout.size) throw new Error("Plate well count does not match its size.");
    for (const [i, well] of plate.wells.entries()) {
      if (!well || well.well !== wellName(i, layout.size) || typeof well.reserved !== "boolean") throw new Error("Invalid plate well ordering or reservation.");
      if (well.itemId !== null) {
        if (well.reserved || !ids.has(well.itemId) || assigned.has(well.itemId)) throw new Error("An assignment cannot occupy multiple, reserved, or invalid wells.");
        assigned.add(well.itemId);
      }
    }
  }
  return layout;
}
export function unassignedPlateItems(layout) {
  const assigned = new Set(layout.plates.flatMap(p => p.wells.map(w => w.itemId)));
  return layout.items.filter(item => !assigned.has(item.id));
}
export function reviewPlateContents(layout) {
  const items = new Map(layout.items.map(item => [item.id, item]));
  const plates = layout.plates.map((plate, index) => {
    const counts = { sample: 0, control: 0, standard: 0, blank: 0, reserved: 0, empty: 0 };
    for (const well of plate.wells) {
      const item = items.get(well.itemId);
      counts[item ? item.role : well.reserved ? "reserved" : "empty"]++;
    }
    return { number: index + 1, name: plate.name, ...counts };
  });
  const notices = [];
  for (const role of ["control", "standard"]) {
    if (!plates.some(plate => plate[role])) continue;
    const missing = plates.filter(p => !p[role] && p.sample + p.control + p.standard + p.blank > 0);
    if (missing.length) notices.push(`No ${role}s assigned on plate${missing.length === 1 ? "" : "s"} ${missing.map(p => p.number).join(", ")}. ${role === "control" ? "Controls" : "Standards"} are not copied automatically; check whether your assay needs them on each plate.`);
  }
  return { plates, notices };
}
export function editPlateLayout(layout, action) {
  const next = clone(layout);
  const getWell = (plate, well) => {
    if (!Number.isInteger(plate) || !next.plates[plate]) throw new Error("Choose an existing plate.");
    return next.plates[plate].wells[wellIndex(well, next.size)];
  };
  if (action.type === "move") {
    const source = getWell(action.plate, action.well), target = getWell(action.toPlate, action.toWell);
    if (!source.itemId) throw new Error("Choose an occupied well to move.");
    if (target.reserved) throw new Error("Release the destination well before moving an assignment there.");
    [source.itemId, target.itemId] = [target.itemId, source.itemId];
  } else if (action.type === "reserve") {
    const well = getWell(action.plate, action.well);
    if (well.itemId) throw new Error("Unassign this well before reserving it.");
    well.reserved = !well.reserved;
  } else if (action.type === "unassign") {
    getWell(action.plate, action.well).itemId = null;
  } else if (action.type === "assign") {
    const well = getWell(action.plate, action.well);
    if (well.reserved || well.itemId) throw new Error("Choose an empty, unreserved well.");
    if (!unassignedPlateItems(next).some(item => item.id === action.itemId)) throw new Error("Choose an unassigned sample replicate.");
    well.itemId = action.itemId;
  } else if (action.type === "edit-item") {
    const item = next.items.find(item => item.id === action.itemId);
    if (!item) throw new Error("Assignment not found.");
    for (const key of ["sample", "group", "role", "notes"]) if (action.values[key] !== undefined) item[key] = action.values[key];
  } else if (action.type === "add-item") {
    const well = getWell(action.plate, action.well);
    if (well.reserved || well.itemId) throw new Error("Choose an empty, unreserved well.");
    let n = 1;
    const used = new Set(next.items.map(i => i.id));
    while (used.has(`M${n}-R1`)) n++;
    const id = `M${n}-R1`;
    next.items.push({ id, sample: action.values.sample, group: action.values.group ?? "", role: action.values.role ?? "sample", notes: action.values.notes ?? "", replicate: 1, metadata: {} });
    well.itemId = id;
  } else if (action.type === "title") next.title = action.value;
  else if (action.type === "plate-name") {
    if (!next.plates[action.plate]) throw new Error("Choose an existing plate.");
    next.plates[action.plate].name = action.value;
  } else if (action.type === "add-plate") next.plates.push(blankPlate(next.size, next.plates.length, next.settings.reserved));
  else if (action.type === "remove-plate") {
    if (next.plates.length === 1) throw new Error("Keep at least one plate.");
    if (!next.plates[action.plate] || next.plates[action.plate].wells.some(w => w.itemId)) throw new Error("Only an empty plate can be removed. Move or unassign its samples first.");
    next.plates.splice(action.plate, 1);
  } else throw new Error("Unknown layout edit.");
  return validatePlateLayout(next);
}
export function plateAssignmentRows(layout) {
  const items = new Map(layout.items.map(item => [item.id, item]));
  const row = (item, plate = "", plate_name = "", well = "", status = "unassigned") => ({ plate, plate_name, well, status,
    assignment_id: item?.id ?? "", sample: item?.sample ?? "", replicate: item?.replicate ?? "", group: item?.group ?? "", role: item?.role ?? "", notes: item?.notes ?? "",
    metadata: item && Object.keys(item.metadata).length ? JSON.stringify(item.metadata) : "" });
  return [...layout.plates.flatMap((plate, p) => plate.wells.map(w => row(items.get(w.itemId), p + 1, plate.name, w.well, w.reserved ? "reserved" : w.itemId ? "assigned" : "empty"))), ...unassignedPlateItems(layout).map(item => row(item))];
}
export function plateAssignmentText(layout, delimiter = "\t") { return exportDelimitedTable(plateColumns, plateAssignmentRows(layout), delimiter); }
