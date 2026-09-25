import "../vendor/d3/d3.min.js";
import { escapeXml } from "./plot-renderer.js";
import { QPCR_LIMITS } from "./qpcr-analysis.js";
import {
  makePublicationPlotStyle,
  publicationPlotCss,
  publicationSvgAttributes,
  SMS3_PLOT_THEME
} from "./publication-plot-style.js";
const esc = escapeXml;
const short = (s, max) => s.length > max ? `${s.slice(0, max - 1)}…` : s;

// D3 scales/ticks/symbols, serialized SVG for the shared worker/figure shell.
// Horizontal panels keep biological points, means and comparison CIs distinct.
export function renderQpcrPlot(analysis) {
  const { settings, groupRows, sampleRows } = analysis, d3 = globalThis.d3;
  const targets = settings.plotTarget ? analysis.targets.filter(t => t === settings.plotTarget) : analysis.targets;
  if (!targets.length) throw new Error(`Plot target ${settings.plotTarget} was not found among target genes.`);
  const groups = groupRows.filter(r => targets.includes(r.target));
  const points = sampleRows.filter(r => targets.includes(r.target) && r.fold_change !== null);
  const conditions = [settings.calibrator, ...analysis.conditions.filter(c => c !== settings.calibrator)];
  if (!points.length) throw new Error("No relative expression is available to plot. Run the Sample expression table to review missing references, target measurements and calibrators.");
  if (points.length > QPCR_LIMITS.plotPoints || targets.length > QPCR_LIMITS.plotTargets || conditions.length > QPCR_LIMITS.plotConditions || groups.length > QPCR_LIMITS.plotGroups) throw new Error("Expression plot exceeds 1,000 points, 12 targets, 12 conditions or 72 groups. Choose one Plot target, reduce the input, or select a table output; no samples were hidden automatically.");
  const log = settings.plotScale === "log2", value = log ? "log2_fold_change" : "fold_change";
  const low = log ? "ci_low_log2" : "ci_low_fold", high = log ? "ci_high_log2" : "ci_high_fold";
  if (!log && groups.some(r => r.ci_low_log2 !== null && (r.ci_low_fold === null || r.ci_high_fold === null))) throw new Error("A confidence bound is outside the numeric range for a fold-scale plot. Choose Log2 fold change or a table output.");
  const baseline = log ? 0 : 1;
  const values = [baseline, ...points.map(r => r[value]), ...groups.flatMap(r => [r[value], r[low], r[high]]).filter(v => v !== null)];
  const extent = d3.extent(values), span = extent[1] - extent[0] || 1;
  const x = d3.scaleLinear().domain([log ? extent[0] - span * 0.08 : Math.max(0, extent[0] - span * 0.08), extent[1] + span * 0.08]).nice().range([242, 934]);
  const rowHeight = 64, panelHeight = conditions.length * rowHeight + 56, height = 160 + targets.length * panelHeight + 90;
  const style = makePublicationPlotStyle(980, height);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" ${publicationSvgAttributes(style)} viewBox="0 0 980 ${height}" role="img" aria-label="qPCR relative expression" data-plot-foundation="d3" data-plot-renderer="sms3-qpcr" data-sms3-publication-theme="default" data-grid-lines="hidden">`,
    `<style>${publicationPlotCss(style)}.target{font-size:${style.axisLabelFontSize}px;font-weight:600}.condition{font-size:${style.bodyFontSize}px}.condition-note,.status,.section-note{font-size:${style.smallFontSize}px;fill:${SMS3_PLOT_THEME.textMuted}}.baseline{stroke:${SMS3_PLOT_THEME.reference};stroke-width:${style.axisStrokeWidth};stroke-dasharray:4 4}.ci{stroke:${SMS3_PLOT_THEME.outline};stroke-width:${style.dataStrokeWidth}}</style>`,
    `<rect width="980" height="${height}" fill="${SMS3_PLOT_THEME.surface}"/>`,
    '<g>',
    '<text class="title" x="30" y="38">qPCR relative expression</text>',
    `<text class="subtitle" x="30" y="65">${settings.method === "ddcq" ? "ΔΔCq · 100% efficiency assumed" : "Efficiency-corrected · technical wells averaged as quantities"}</text>`,
    `<text class="subtitle" x="30" y="88">Calibrator: ${esc(short(settings.calibrator, 60))}<title>${esc(settings.calibrator)}</title></text>`,
    `<circle cx="37" cy="113" r="4" fill="${SMS3_PLOT_THEME.categorical[0]}"/><text class="legend" x="50" y="118">Biological sample</text>`,
    `<path d="M205,108 L210,113 L205,118 L200,113 Z" fill="${SMS3_PLOT_THEME.outline}"/><text class="legend" x="218" y="118">Geometric mean</text>`,
    ...(settings.comparisons === "welch" ? [`<line x1="388" x2="413" y1="113" y2="113" stroke="${SMS3_PLOT_THEME.outline}"/><text class="legend" x="421" y="118">95% CI for comparison with calibrator (when estimable)</text>`] : [])];
  const ticks = x.ticks(7), fmt = x.tickFormat(7, "~g"), colors = SMS3_PLOT_THEME.categorical;
  for (let ti = 0; ti < targets.length; ti++) {
    const target = targets[ti], top = 156 + ti * panelHeight;
    parts.push(`<text class="target" x="30" y="${top}">${esc(short(target, 58))}<title>${esc(target)}</title></text>`);
    const bottom = top + 30 + (conditions.length - 1) * rowHeight + 20;
    parts.push(`<line class="axis" x1="242" x2="934" y1="${bottom}" y2="${bottom}"/>`);
    for (const tick of ticks) parts.push(`<line class="axis-tick" x1="${x(tick)}" x2="${x(tick)}" y1="${bottom}" y2="${bottom + style.tickLength}"/><text class="tick" x="${x(tick)}" y="${bottom + style.tickLength + style.bodyFontSize + 4}" text-anchor="middle">${esc(fmt(tick))}</text>`);
    parts.push(`<line class="baseline" x1="${x(baseline)}" x2="${x(baseline)}" y1="${top + 12}" y2="${bottom}"/>`);
    for (let ci = 0; ci < conditions.length; ci++) {
      const condition = conditions[ci], r = groups.find(g => g.target === target && g.condition === condition), y = top + 36 + ci * rowHeight;
      const ps = points.filter(p => p.target === target && p.condition === condition);
      parts.push(`<text class="condition" x="225" y="${y - 2}" text-anchor="end">${esc(short(condition, 16))}<title>${esc(condition)}</title></text>`, `<text class="condition-note" x="225" y="${y + 16}" text-anchor="end">n = ${r.n}${r.excluded_samples ? ` · ${r.excluded_samples} unavailable` : ""}</text>`);
      if (r[value] === null) { parts.push(`<text class="status" x="254" y="${y + 2}">${esc(r.status)}</text>`); continue; }
      if (r[low] !== null && r[high] !== null) parts.push(`<g class="ci" data-qpcr-ci="true"><line x1="${x(r[low])}" x2="${x(r[high])}" y1="${y - 8}" y2="${y - 8}"/><line x1="${x(r[low])}" x2="${x(r[low])}" y1="${y - 12}" y2="${y - 4}"/><line x1="${x(r[high])}" x2="${x(r[high])}" y1="${y - 12}" y2="${y - 4}"/></g>`);
      parts.push(`<path data-qpcr-mean="true" transform="translate(${x(r[value])},${y - 8})" d="${d3.symbol().type(d3.symbolDiamond).size(45)()}" fill="${SMS3_PLOT_THEME.outline}"><title>${esc(`${target} / ${condition}: geometric mean ${r.fold_change.toPrecision(5)}; ${r.inference}`)}</title></path>`);
      ps.forEach((p, i) => {
        const jitter = ps.length <= 1 ? 0 : ((i * 0.618033988749895) % 1 - 0.5) * 14;
        parts.push(`<circle data-qpcr-sample="true" data-sms3-nearest-point="true" cx="${x(p[value])}" cy="${y + 10 + jitter}" r="3.5" fill="${colors[ci % colors.length]}" fill-opacity="0.8"><title>${esc(`${p.sample} / ${target}: relative expression ${p.fold_change.toPrecision(5)}${p.qc ? `; ${p.qc}` : ""}`)}</title></circle>`);
      });
    }
  }
  parts.push(`<text class="label" x="588" y="${height - 66}" text-anchor="middle">${log ? "Log2 fold change" : "Relative expression (fold change)"}</text>`,
    `<text class="section-note" x="30" y="${height - 38}">n counts usable biological samples. Reference genes: ${esc(short(settings.referenceGenes.join(", "), 45))}<title>${esc(settings.referenceGenes.join(", "))}</title></text>`,
    `<text class="section-note" x="30" y="${height - 17}">${settings.comparisons === "welch" ? "Intervals include biological variance in both groups; assay efficiencies are treated as fixed." : "Descriptive expression only; no confidence intervals or significance tests requested."}</text>`, "</g></svg>");
  return parts.join("");
}
