import { editPlateLayout, validatePlateLayout, unassignedPlateItems, plateAssignmentText, plateDimensions, wellIndex, wellName, PLATE_ROLES, reviewPlateContents } from "../core/plate-layout.js";
import { renderPlateSvg, renderPlatePrintHtml } from "../core/plate-layout-svg.js";
import { createEditorSession } from "./editor-session.js";
import { downloadText } from "./file-download.js";
import { downloadSvgAsPng } from "./svg-export.js";

export function renderPlateLayout(container, source, editorDocument) {
  let layout = structuredClone(validatePlateLayout(editorDocument?.state?.layout ?? source.layout));
  let currentPlate = 0, selected = "A1", session;
  const root = document.createElement("section");
  root.className = "plate-layout-editor";
  root.setAttribute("aria-label", "Plate Layout Planner");
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const button = (name, action, parent) => {
    const el = make("button", name);
    el.type = "button";
    el.addEventListener("click", () => Promise.resolve().then(action).catch(error => { message.textContent = error.message; }));
    parent.append(el);
    return el;
  };
  const field = (name, parent, value = "", choices) => {
    const label = make("label");
    label.append(make("span", name));
    const input = make(choices ? "select" : name === "Notes" ? "textarea" : "input");
    input.setAttribute("aria-label", name);
    if (choices) for (const choice of choices) {
      const option = make("option", choice.label ?? choice);
      option.value = choice.value ?? choice;
      input.append(option);
    }
    else input.maxLength = name === "Notes" ? 1000 : 120;
    input.value = value;
    label.append(input); parent.append(label);
    return input;
  };
  const toolbar = make("div", undefined, "plate-layout-toolbar");
  const title = field("Layout title", toolbar, layout.title);
  title.addEventListener("change", () => change({ type: "title", value: title.value.trim() }, "Rename layout"));
  const exports = make("details", undefined, "plate-layout-export");
  exports.append(make("summary", "Export"));
  const menu = make("div"); exports.append(menu);
  const exporting = fn => async () => { exports.open = false; await fn(); };
  button("Current plate SVG", exporting(() => downloadText(renderPlateSvg(layout, currentPlate), `plate-${currentPlate + 1}.svg`, "image/svg+xml")), menu);
  button("Current plate PNG", exporting(() => downloadSvgAsPng(renderPlateSvg(layout, currentPlate), `plate-${currentPlate + 1}.png`)), menu);
  button("All assignments TSV", exporting(() => downloadText(plateAssignmentText(layout), "plate-assignments.tsv", "text/tab-separated-values")), menu);
  button("All assignments CSV", exporting(() => downloadText(plateAssignmentText(layout, ","), "plate-assignments.csv", "text/csv")), menu);
  button("Printable layouts (HTML)", exporting(() => downloadText(renderPlatePrintHtml(layout), "plate-layouts.html", "text/html")), menu);
  toolbar.append(exports);
  const navigation = make("div", undefined, "plate-layout-navigation");
  const prev = button("Previous plate", () => { currentPlate--; render(); }, navigation);
  const plateSelect = field("Plate", navigation, "", []);
  plateSelect.addEventListener("change", () => { currentPlate = Number(plateSelect.value); render(); });
  const next = button("Next plate", () => { currentPlate++; render(); }, navigation);
  const plateName = field("Plate name", navigation, layout.plates[0].name);
  plateName.addEventListener("change", () => change({ type: "plate-name", plate: currentPlate, value: plateName.value.trim() }, "Rename plate"));
  const search = field("Find sample or group", navigation);
  search.addEventListener("input", highlight);
  const zoom = field("Map size", navigation, "fit", [{ value: "fit", label: "Fit width" }, { value: "1", label: "100%" }, { value: "1.5", label: "150%" }, { value: "2", label: "200%" }]);
  zoom.addEventListener("change", renderMap);
  const add = button("Add plate", () => { if (change({ type: "add-plate" }, "Add plate")) { currentPlate = layout.plates.length - 1; render(); } }, navigation);
  const remove = button("Remove empty plate", () => change({ type: "remove-plate", plate: currentPlate }, "Remove empty plate"), navigation);
  const status = make("p", undefined, "plate-layout-status"); status.setAttribute("role", "status");
  const message = make("p", "", "plate-layout-error"); message.setAttribute("role", "alert");
  const review = make("details", undefined, "plate-layout-review");
  const body = make("div", undefined, "plate-layout-body");
  const mapArea = make("div", undefined, "plate-layout-map-area");
  const map = make("div", undefined, "plate-layout-map");
  const hint = make("p", "Select a well to inspect or edit it. Arrow keys move between wells. Increase Map size for larger labels; scroll within the map to see more wells. Colors identify sample roles.", "plate-layout-hint");
  const inspector = make("div", undefined, "plate-layout-inspector");
  mapArea.append(map, hint); body.append(mapArea, inspector);
  const footer = make("div", undefined, "plate-layout-footer");
  root.append(toolbar, navigation, status, review, message, body, footer); container.append(root);
  function change(action, label) {
    try {
      layout = editPlateLayout(layout, action);
      message.textContent = "";
      render();
      session?.changed(label);
      return true;
    } catch (error) { message.textContent = error.message; return false; }
  }
  function highlight() {
    const query = search.value.trim().toLowerCase();
    const matching = new Set(layout.items.filter(item => `${item.sample} ${item.group} ${item.id}`.toLowerCase().includes(query)).map(item => item.id));
    for (const well of layout.plates[currentPlate].wells) {
      const node = map.querySelector(`[data-well="${well.well}"]`);
      node?.classList.toggle("plate-well-dim", !!query && !matching.has(well.itemId));
    }
  }
  function selectWell(name, focus = false) {
    selected = name;
    renderMap(); renderInspector();
    if (focus) map.querySelector(`[data-well="${selected}"]`).focus();
  }
  function renderMap() {
    map.innerHTML = renderPlateSvg(layout, currentPlate, { interactive: true, selected });
    const svg = map.querySelector("svg");
    if (zoom.value !== "fit") {
      const width = svg.viewBox.baseVal.width * Number(zoom.value);
      svg.style.width = `${width}px`;
      svg.style.minWidth = `${width}px`;
      svg.style.maxWidth = "none";
    }
    highlight();
  }
  map.addEventListener("click", event => {
    const well = event.target.closest("[data-well]");
    if (well) selectWell(well.dataset.well);
  });
  map.addEventListener("keydown", event => {
    const well = event.target.closest("[data-well]");
    if (!well) return;
    const { columns } = plateDimensions(layout.size), index = wellIndex(well.dataset.well, layout.size);
    let target = index;
    if (event.key === "ArrowRight" && index % columns < columns - 1) target++;
    else if (event.key === "ArrowLeft" && index % columns > 0) target--;
    else if (event.key === "ArrowDown" && index + columns < layout.size) target += columns;
    else if (event.key === "ArrowUp" && index >= columns) target -= columns;
    else if (!["Enter", " ", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); selectWell(wellName(target, layout.size), true);
  });
  function itemFields(parent, item = {}) {
    const sample = field("Sample", parent, item.sample ?? "");
    const group = field("Group", parent, item.group ?? "");
    const role = field("Role", parent, item.role ?? "sample", PLATE_ROLES.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })));
    const notes = field("Notes", parent, item.notes ?? "");
    return () => ({ sample: sample.value.trim(), group: group.value.trim(), role: role.value, notes: notes.value });
  }
  function renderInspector() {
    inspector.replaceChildren();
    const well = layout.plates[currentPlate].wells[wellIndex(selected, layout.size)];
    const item = layout.items.find(i => i.id === well.itemId);
    inspector.append(make("h3", `${layout.plates[currentPlate].name} · ${selected}`));
    if (item) {
      inspector.append(make("p", `${item.id} · Replicate ${item.replicate}`, "plate-layout-hint"));
      const read = itemFields(inspector, item);
      button("Save assignment", () => change({ type: "edit-item", itemId: item.id, values: read() }, `Edit ${selected}`), inspector);
      const move = make("details"); move.append(make("summary", "Move or swap"));
      const targetPlate = field("Destination plate", move, String(currentPlate), layout.plates.map((p, i) => ({ value: String(i), label: `${i + 1}: ${p.name}` })));
      const destination = field("Destination well", move, selected, layout.plates[0].wells.map(w => w.well));
      move.append(make("p", "An occupied destination swaps the two assignments. Reserved wells are unavailable.", "plate-layout-hint"));
      button("Move / swap", () => change({ type: "move", plate: currentPlate, well: selected, toPlate: Number(targetPlate.value), toWell: destination.value }, `Move ${selected}`), move);
      inspector.append(move);
      button("Unassign replicate", () => change({ type: "unassign", plate: currentPlate, well: selected }, `Unassign ${selected}`), inspector);
      inspector.append(make("p", "Unassigned replicates remain in the layout and exports. Select an empty well to place them again.", "plate-layout-hint"));
      if (Object.keys(item.metadata).length) {
        const details = make("details"); details.append(make("summary", "Additional metadata"));
        const dl = make("dl");
        for (const [key, value] of Object.entries(item.metadata)) dl.append(make("dt", key), make("dd", value));
        details.append(dl); inspector.append(details);
      }
    } else {
      inspector.append(make("p", well.reserved ? "Reserved · excluded from assignment" : "Empty · available for assignment"));
      button(well.reserved ? "Release well" : "Reserve well", () => change({ type: "reserve", plate: currentPlate, well: selected }, `Change reservation ${selected}`), inspector);
      if (!well.reserved) {
        const pending = unassignedPlateItems(layout);
        if (pending.length) {
          const select = field("Unassigned replicate", inspector, pending[0].id, pending.map(i => ({ value: i.id, label: `${i.sample} · R${i.replicate} · ${i.id}` })));
          button("Assign replicate", () => change({ type: "assign", plate: currentPlate, well: selected, itemId: select.value }, `Assign ${selected}`), inspector);
        }
        const details = make("details"); details.append(make("summary", "Add a new sample"));
        const read = itemFields(details);
        button("Add sample to well", () => change({ type: "add-item", plate: currentPlate, well: selected, values: read() }, `Add sample ${selected}`), details);
        inspector.append(details);
      }
    }
  }
  function render() {
    currentPlate = Math.max(0, Math.min(currentPlate, layout.plates.length - 1));
    title.value = layout.title;
    plateName.value = layout.plates[currentPlate].name;
    plateSelect.replaceChildren();
    layout.plates.forEach((plate, i) => { const o = make("option", `${i + 1}: ${plate.name}`); o.value = String(i); plateSelect.append(o); });
    plateSelect.value = String(currentPlate);
    prev.disabled = currentPlate === 0; next.disabled = currentPlate === layout.plates.length - 1;
    add.disabled = layout.plates.length >= 20;
    remove.disabled = layout.plates.length === 1 || layout.plates[currentPlate].wells.some(w => w.itemId);
    const pending = unassignedPlateItems(layout).length;
    status.textContent = `${layout.items.length - pending} assigned · ${pending} unassigned · ${layout.plates.length} plate${layout.plates.length === 1 ? "" : "s"}${layout.settings.seed ? ` · Initial random seed: ${layout.settings.seed}` : ""}`;
    status.classList.toggle("plate-layout-pending", pending > 0);
    const contents = reviewPlateContents(layout);
    review.replaceChildren(make("summary", `Plate contents${contents.notices.length ? " · check controls / standards" : ""}`));
    const scroll = make("div"), table = make("table", undefined, "result-table");
    table.setAttribute("aria-label", "Well counts by plate");
    const head = make("thead"), header = make("tr"), rows = make("tbody");
    for (const name of ["Plate", "Samples", "Controls", "Standards", "Blanks", "Reserved", "Empty"]) { const cell = make("th", name); cell.scope = "col"; header.append(cell); }
    head.append(header); table.append(head);
    for (const p of contents.plates) {
      const tr = make("tr");
      for (const value of [`${p.number}: ${p.name}`, p.sample, p.control, p.standard, p.blank, p.reserved, p.empty]) tr.append(make("td", value));
      rows.append(tr);
    }
    table.append(rows); scroll.append(table); review.append(scroll);
    review.append(make("p", "Counts are wells, including each replicate. Roles describe well contents; they do not perform assay calculations.", "plate-layout-hint"));
    for (const notice of contents.notices) review.append(make("p", notice, "plate-layout-hint"));
    renderMap(); renderInspector();
  }
  render();
  session = createEditorSession({ host: root, toolbar: footer, tool: "plate-layout-planner", source,
    read: () => ({ layout: structuredClone(layout) }),
    apply: state => { layout = structuredClone(validatePlateLayout(state.layout)); render(); }, initial: editorDocument?.state });
  container._sms3VisualCleanup = () => session.dispose();
}
