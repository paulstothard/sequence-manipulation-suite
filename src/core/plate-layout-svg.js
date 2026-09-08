import { plateDimensions, plateAssignmentRows, unassignedPlateItems } from "./plate-layout.js";

export const plateRoleStyle = {
  sample: { fill: "#dff5f2", stroke: "#0f766e", label: "Sample", code: "S" },
  control: { fill: "#fff0cc", stroke: "#926500", label: "Control", code: "C" },
  standard: { fill: "#eee8fa", stroke: "#76539a", label: "Standard", code: "STD" },
  blank: { fill: "#e9eef2", stroke: "#52616b", label: "Blank", code: "B" }
};
export const escapePlateText = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
// Conservative glyph widths keep wide Latin and non-Latin labels within wells.
// Preserve both ends so sample names with a common prefix retain their suffix.
const fit = (value, maxWidth, fontSize) => {
  const chars = [...String(value)];
  const width = text => [...text].reduce((sum, c) => sum + fontSize * (/[^\x20-\x7e]/u.test(c) || /[MWmw@#]/.test(c) ? 1.1 : 0.65), 0);
  if (width(value) <= maxWidth) return value;
  for (let count = chars.length - 1; count > 1; count--) {
    const prefix = Math.max(1, Math.floor(count / 3)), suffix = count - prefix;
    const label = chars.slice(0, prefix).join("") + "…" + chars.slice(-suffix).join("");
    if (width(label) <= maxWidth) return label;
  }
  return "…";
};
export function renderPlateSvg(layout, plateIndex = 0, { interactive = false, selected = "A1" } = {}) {
  const plate = layout.plates[plateIndex];
  if (!plate) throw new Error("Choose an existing plate.");
  const { rows, columns } = plateDimensions(layout.size);
  const cellW = layout.size === 96 ? 84 : 62, cellH = layout.size === 96 ? 57 : 45;
  const width = 70 + columns * cellW, height = 152 + rows * cellH;
  const e = escapePlateText, items = new Map(layout.items.map(i => [i.id, i]));
  const used = plate.wells.filter(w => w.itemId).length, reserved = plate.wells.filter(w => w.reserved).length;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="${interactive ? "group" : "img"}" aria-label="${e(plate.name)} well map" data-plate-map="${layout.size}" style="font-family:Arial,sans-serif;color-scheme:light"><rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="24" y="30" font-size="19" font-weight="bold" fill="#172026">${e(fit(`${layout.title} · ${plate.name}`, width - 48, 20))}</text>`,
    `<text x="24" y="53" font-size="13" fill="#52616b">Plate ${plateIndex + 1} of ${layout.plates.length} · ${used} assigned · ${reserved} reserved · ${layout.size - used - reserved} empty</text>`];
  for (let c = 0; c < columns; c++) out.push(`<text x="${52 + (c + 0.5) * cellW}" y="79" text-anchor="middle" font-size="13" fill="#172026">${c + 1}</text>`);
  for (let r = 0; r < rows; r++) out.push(`<text x="29" y="${90 + (r + 0.5) * cellH + 5}" text-anchor="middle" font-size="13" font-weight="bold" fill="#172026">${String.fromCharCode(65 + r)}</text>`);
  for (const [i, well] of plate.wells.entries()) {
    const x = 52 + i % columns * cellW, y = 91 + Math.floor(i / columns) * cellH;
    const item = items.get(well.itemId), style = plateRoleStyle[item?.role];
    const description = item ? `${well.well}: ${item.sample}, replicate ${item.replicate}, ${item.role}${item.group ? ", group " + item.group : ""}, ${item.id}` : `${well.well}: ${well.reserved ? "reserved" : "empty"}`;
    out.push(`<g data-well="${well.well}"${interactive ? ` role="button" tabindex="${well.well === selected ? 0 : -1}" aria-label="${e(description)}" aria-pressed="${well.well === selected}"` : ""}><title>${e(description)}</title>`);
    out.push(`<rect x="${x}" y="${y}" width="${cellW - 6}" height="${cellH - 6}" rx="5" fill="${style?.fill ?? (well.reserved ? "#f1f3f5" : "#ffffff")}" stroke="${interactive && well.well === selected ? "#172026" : style?.stroke ?? "#b1bcc4"}" stroke-width="${interactive && well.well === selected ? 3 : 1}"${well.reserved ? ' stroke-dasharray="3 2"' : ""}/>`);
    if (item) {
      out.push(`<text x="${x + (cellW - 6) / 2}" y="${y + (layout.size === 96 ? 20 : 15)}" text-anchor="middle" font-size="${layout.size === 96 ? 11 : 9}" fill="#172026">${e(fit(item.sample, cellW - 14, layout.size === 96 ? 11 : 9))}</text>`);
      out.push(`<text x="${x + (cellW - 6) / 2}" y="${y + cellH - 16}" text-anchor="middle" font-size="9" fill="#354550">${style.code} · R${item.replicate}</text>`);
    } else out.push(`<text x="${x + (cellW - 6) / 2}" y="${y + (cellH - 6) / 2 + 4}" text-anchor="middle" font-size="10" fill="#65737e">${well.reserved ? "Reserved" : well.well}</text>`);
    out.push("</g>");
  }
  let x = 24;
  for (const [role, style] of Object.entries(plateRoleStyle)) {
    const y = 111 + rows * cellH;
    out.push(`<rect x="${x}" y="${y - 11}" width="13" height="13" rx="2" fill="${style.fill}" stroke="${style.stroke}"/><text x="${x + 19}" y="${y}" font-size="12" fill="#172026">${style.code}: ${style.label}</text>`);
    x += 150;
  }
  out.push(`<text x="24" y="${height - 13}" font-size="11" fill="#52616b">R = replicate. Long labels are shortened; the assignment table retains full sample names and notes.</text></svg>`);
  return out.join("");
}
export function renderPlatePrintHtml(layout) {
  const e = escapePlateText, rows = plateAssignmentRows(layout);
  const unassigned = unassignedPlateItems(layout);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${e(layout.title)}</title><style>body{font:12px Arial,sans-serif;color:#172026;margin:24px}svg{width:100%;height:auto}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{text-align:left;border:1px solid #cfd8df;padding:5px;overflow-wrap:anywhere}th{background:#eef2f5}button{padding:10px}section{break-before:page}section:first-of-type{break-before:auto}tr{break-inside:avoid}@page{size:landscape;margin:12mm}@media print{button{display:none}body{margin:0}*{print-color-adjust:exact}}</style><button onclick="window.print()">Print / Save as PDF</button><h1>${e(layout.title)}</h1>${unassigned.length ? `<p>${unassigned.length} sample replicates are unassigned; see the final table.</p>` : ""}${layout.plates.map((p, i) => `<section>${renderPlateSvg(layout, i)}<table><thead><tr><th>Well</th><th>Assignment ID</th><th>Sample</th><th>Replicate</th><th>Group</th><th>Role / status</th><th>Notes</th></tr></thead><tbody>${rows.filter(row => row.plate === i + 1 && row.status !== "empty").map(row => `<tr>${[row.well, row.assignment_id, row.sample, row.replicate, row.group, row.role || row.status, row.notes].map(v => `<td>${e(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`).join("")}${unassigned.length ? `<section><h2>Unassigned replicates</h2><table>${unassigned.map(item => `<tr><td>${e(item.id)}</td><td>${e(item.sample)}</td><td>Replicate ${item.replicate}</td></tr>`).join("")}</table></section>` : ""}</html>`;
}
