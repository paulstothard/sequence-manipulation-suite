// Simulated Cq measurements, not published experimental data. Three independent
// conditions, four biological samples each, two references and two targets,
// measured in technical triplicate with assay-specific efficiencies.
const rows = ["sample,target,condition,cq,efficiency,replicate,role,run"];
const assays = [["RPLP0", 21.4, 98], ["HPRT1", 24.2, 94], ["IL6", 28.8, 92], ["CXCL8", 26.6, 96]];
const conditions = ["Control", "Low dose", "High dose"];
const shifts = [[0, 0, 0, 0], [0.03, -0.02, -1.1, -0.7], [-0.02, 0.03, -2.3, -1.8]];
for (let c = 0; c < 3; c++) for (let b = 0; b < 4; b++) for (let g = 0; g < assays.length; g++) {
  const [gene, base, efficiency] = assays[g];
  for (let t = 0; t < 3; t++) {
    const biological = [0.14, -0.27, 0.31, -0.1][b] + Math.sin((c + 1) * (b + 2) * (g + 1)) * (g < 2 ? 0.06 : 0.3);
    const cq = base + shifts[c][g] + biological + [-0.09, 0.02, 0.08][t];
    rows.push(`${["C", "L", "H"][c]}${b + 1},${gene},${conditions[c]},${cq.toFixed(3)},${efficiency},${t + 1},sample,Run1`);
  }
}
for (const [gene, , efficiency] of assays) for (const role of ["ntc", "nort"]) rows.push(`${role.toUpperCase()},${gene},,undetermined,${efficiency},1,${role},Run1`);
export const qpcrExample = rows.join("\n");
