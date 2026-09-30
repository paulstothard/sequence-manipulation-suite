import {
  makePublicationPlotStyle,
  publicationPlotCss,
  publicationSvgAttributes,
  SMS3_PLOT_THEME as theme,
} from "./publication-plot-style.js";

const xml = (value) => String(value ?? "").replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const shorten = (value, length) => value.length > length ? value.slice(0, length - 1) + "…" : value;

// Coverage describes aligned spans, including internal alignment gaps and
// positions with uncertain calls. Count a trace once even when it supplies two
// candidate haplotypes. Sweep interval endpoints so long references stay cheap.
export function sangerGenotypeCoverage(result) {
  const { firstBase: first, lastBase: last } = result.reference;
  return result.samples.map((sample) => {
    const reads = result.reads.filter((read) => read.sample === sample).map((read) => {
      const projections = read.projections.filter((projection) =>
        Number.isFinite(projection.start) && Number.isFinite(projection.end));
      const start = projections.length ? Math.max(first, Math.min(...projections.map(p => p.start))) : null;
      const end = projections.length ? Math.min(last, Math.max(...projections.map(p => p.end))) : null;
      return { read, start, end, placed: start !== null && end >= start };
    });
    const events = new Map([[first, 0], [last + 1, 0]]);
    for (const { start, end, placed } of reads) if (placed) {
      events.set(start, (events.get(start) ?? 0) + 1);
      events.set(end + 1, (events.get(end + 1) ?? 0) - 1);
    }
    const endpoints = [...events.keys()].sort((a, b) => a - b);
    const intervals = [];
    let depth = 0;
    for (let i = 0; i < endpoints.length - 1; i++) {
      const start = endpoints[i], end = endpoints[i + 1] - 1;
      depth += events.get(start);
      const previous = intervals.at(-1);
      if (previous?.depth === depth) previous.end = end;
      else intervals.push({ start, end, depth });
    }
    return { sample, reads, intervals };
  });
}

function arrow(left, right, y, reverse) {
  const head = Math.min(7, (right - left) / 2);
  return reverse
    ? `${left},${y + 8} ${left + head},${y} ${right},${y} ${right},${y + 16} ${left + head},${y + 16}`
    : `${left},${y} ${right - head},${y} ${right},${y + 8} ${right - head},${y + 16} ${left},${y + 16}`;
}

function arrowChevrons(left, right, y, reverse) {
  // Match the ORF plot's spacing and inset white marks. Keep chevrons inside
  // the rectangular body and parallel to the arrowhead's sloping edges.
  const head = Math.min(7, (right - left) / 2);
  const start = left + (reverse ? head : 0), end = right - (reverse ? 0 : head);
  const halfHeight = 3.5, halfRun = head * halfHeight / 8 / 2;
  const segments = [];
  for (let center = start + 10; center + halfRun <= end - 4; center += 24) {
    const tip = center + (reverse ? -halfRun : halfRun);
    const tail = center + (reverse ? halfRun : -halfRun);
    segments.push(`M${tail} ${y + 8 - halfHeight}L${tip} ${y + 8}L${tail} ${y + 8 + halfHeight}`);
  }
  return segments.length
    ? `<path data-coverage-chevrons="${reverse ? 'reverse' : 'forward'}" d="${segments.join(' ')}" fill="none" stroke="${theme.surface}" stroke-width="1.25" stroke-opacity="0.6" stroke-linecap="round" stroke-linejoin="round" pointer-events="none" aria-hidden="true"/>`
    : '';
}

export function sangerGenotypeCoverageSvg(result) {
  const groups = sangerGenotypeCoverage(result);
  const width = 980, height = 168 + groups.length * 90 + result.reads.length * 28;
  const style = makePublicationPlotStyle(width, height);
  const { firstBase: first, lastBase: last } = result.reference;
  const left = 238, right = 952, axisY = 112;
  // Base intervals occupy [start, end + 1); single-base reads retain their width.
  const x = (position) => left + (position - first) / (last - first + 1) * (right - left);
  const parts = [];
  const text = (x, y, value, attributes = "") => `<text x="${x}" y="${y}" ${attributes}>${xml(value)}</text>`;
  parts.push(text(24, 28, "Sanger reference coverage", 'class="title" font-weight="600"'));
  parts.push(text(24, 50, "Aligned trace spans and overlap per sample", 'class="subtitle"'));
  parts.push(text(24, 76, shorten(result.reference.title, 85), 'class="note"'));
  parts.push(text(left, 94, "Reference position (bp)", 'class="label"'));
  // Direction uses both arrow geometry and the shared categorical palette.
  for (const [label, reverse, at] of [["Forward", false, 758], ["Reverse", true, 863]]) {
    parts.push(`<polygon points="${arrow(at, at + 22, 31, reverse)}" fill="${theme.categorical[reverse ? 1 : 0]}"/>`);
    parts.push(text(at + 28, 43, label, 'class="legend"'));
  }
  parts.push(`<path class="axis-rule" d="M${left} ${axisY}H${right}"/>`);
  // A small, bounded set of integer ticks, preserving the supplied offset.
  const step = Math.max(1, 10 ** Math.floor(Math.log10(Math.max(1, (last - first) / 5))));
  const niceStep = step * (((last - first) / step > 12) ? 5 : ((last - first) / step > 6) ? 2 : 1);
  const ticks = [first];
  for (let position = Math.ceil(first / niceStep) * niceStep; position < last; position += niceStep)
    if (x(position) - x(first) > 45 && x(last) - x(position) > 45) ticks.push(position);
  if (last !== first) ticks.push(last);
  for (const position of ticks) {
    const at = x(position + 0.5);
    parts.push(`<path class="axis-tick" d="M${at} ${axisY}v${style.tickLength}"/>`);
    parts.push(text(at, axisY + 22, position, `class="tick-label" text-anchor="${position === first ? 'start' : position === last ? 'end' : 'middle'}"`));
  }
  const maxDepth = Math.max(1, ...groups.flatMap(group => group.intervals.map(interval => interval.depth)));
  let y = 163;
  for (const group of groups) {
    const baseline = y + 46, depthHeight = 34;
    parts.push(text(24, y, shorten(group.sample, 28), 'font-weight="600"'));
    parts.push(text(24, y + 26, "Aligned traces", 'class="note"'));
    parts.push(text(left - 10, baseline + 4, "0", 'class="tick-label" text-anchor="end"'));
    parts.push(text(left - 10, baseline - depthHeight + 4, maxDepth, 'class="tick-label" text-anchor="end"'));
    parts.push(`<path class="axis-rule" fill="none" d="M${left} ${baseline - depthHeight}V${baseline}H${right}"/>`);
    const outline = [`M${left} ${baseline}`];
    for (const { start, end, depth } of group.intervals) {
      const span = x(end + 1) - x(start), h = depth / maxDepth * depthHeight;
      const facts = `${group.sample}; reference ${start}–${end}; ${depth} aligned ${depth === 1 ? 'trace' : 'traces'}. Each trace counts once; spans include internal gaps and uncertain calls.`;
      parts.push(`<rect data-sanger-inspection-target="" data-coverage-depth="${depth}" x="${x(start)}" y="${baseline - (h || 5)}" width="${span}" height="${h || 5}" fill="${depth ? theme.categorical[0] : theme.missing}" fill-opacity="${depth ? 0.25 : 1}"><title>${xml(facts)}</title></rect>`);
      outline.push(`H${x(start)}V${baseline - h}H${x(end + 1)}`);
      if (span > 35 && depth > 0) parts.push(text(x(start) + span / 2, baseline - h - 5, depth, 'class="note" text-anchor="middle"'));
    }
    parts.push(`<path d="${outline.join(' ')}" stroke="${theme.categorical[0]}" stroke-width="${style.axisStrokeWidth}" fill="none" pointer-events="none"/>`);
    y = baseline + 18;
    for (const { read, start, end, placed } of group.reads) {
      parts.push(text(24, y + 12, shorten(read.name, 28)));
      if (placed) {
        const reverse = read.orientation === "reverse-complement";
        parts.push(`<polygon data-sanger-inspection-target="" data-coverage-read="" points="${arrow(x(start), x(end + 1), y, reverse)}" fill="${theme.categorical[reverse ? 1 : 0]}"><title>${xml(group.sample)}; ${xml(read.name)}; reference ${start}–${end}; original bases ${read.trim.start}–${read.trim.end}; ${reverse ? 'reverse' : 'forward'} read</title></polygon>`);
        parts.push(arrowChevrons(x(start), x(end + 1), y, reverse));
      } else {
        parts.push(`<g data-sanger-inspection-target=""><title>${xml(group.sample)}; ${xml(read.name)}; ${xml(read.reason || "No supported placement")}</title>${text(left, y + 12, shorten(read.reason || "No supported placement", 100), 'class="note"')}</g>`);
      }
      y += 28;
    }
    y += 26;
  }
  parts.push(text(24, height - 16, "Depth counts aligned trace spans, including internal gaps and uncertain calls.", 'class="note"'));
  return `<svg class="sanger-svg sanger-coverage-svg" xmlns="http://www.w3.org/2000/svg" ${publicationSvgAttributes(style)} viewBox="0 0 ${width} ${height}" role="img" aria-label="Sanger reference coverage by sample" data-plot-foundation="sanger-coverage" data-sms3-publication-theme="light" data-grid-lines="hidden"><style>${publicationPlotCss(style, { scope: '.sanger-coverage-svg' })}</style><rect width="${width}" height="${height}" fill="${theme.surface}"/><g font-family="${style.fontFamily}" font-size="${style.bodyFontSize}" fill="${theme.text}">${parts.join('')}</g></svg>`;
}
