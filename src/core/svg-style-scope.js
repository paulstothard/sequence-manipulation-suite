import { parse, walk } from "../vendor/svg-parser/runtime.js";

export const SVG_STYLE_SCOPE_ATTRIBUTE = "data-sms3-svg-style";
const cache = new Map();

function styleToken(css) {
  // Stable across workers and exports, including independently rendered figures.
  let a = 2166136261, b = 5381;
  for (let i = 0; i < css.length; i += 1) {
    const code = css.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b, 33) ^ code;
  }
  return `s${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}-${css.length}`;
}

export function scopeSvgCss(css) {
  const cached = cache.get(css);
  if (cached) return cached;
  const token = styleToken(css);
  const scope = `[${SVG_STYLE_SCOPE_ATTRIBUTE}="${token}"]`;
  const replacements = [];
  const ast = parse(css, { positions: true, parseValue: false });
  walk(ast, {
    visit: "Rule",
    enter(rule) {
      if (this.atrule?.name.endsWith("keyframes") || rule.prelude?.type !== "SelectorList") return;
      rule.prelude.children.forEach(selector => {
        const { start, end } = selector.loc;
        const original = css.slice(start.offset, end.offset);
        let compoundEnd = end.offset;
        let previousEnd = start.offset;
        selector.children.forEach(part => {
          if (part.type === "Combinator" || part.type === "PseudoElementSelector") {
            compoundEnd = Math.min(compoundEnd, part.loc?.start.offset ?? previousEnd);
          }
          previousEnd = part.loc?.end.offset ?? previousEnd;
        });
        const split = compoundEnd - start.offset;
        const rootSelector = original.slice(0, split) + `:where(${scope})` + original.slice(split);
        // Qualify the root/ancestor directly. Filtering every potential mark
        // through :is(selector):where(scope, scope *) is costly in WebKit.
        replacements.push({ start: start.offset, end: end.offset,
          text: `${rootSelector},:where(${scope}) ${original}` });
      });
    }
  });
  let scopedCss = css;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    scopedCss = scopedCss.slice(0, replacement.start) + replacement.text + scopedCss.slice(replacement.end);
  }
  const result = { token, css: scopedCss };
  if (cache.size >= 128) cache.clear();
  cache.set(css, result);
  return result;
}

// Called by SVG producers before insertion/export, never by a page observer.
// Parse only stylesheets; no per-mark rewriting or text measurement.
export function isolateSvgStyles(svg) {
  const root = /^<svg\b[^>]*>/u.exec(svg);
  if (!root || root[0].includes(`${SVG_STYLE_SCOPE_ATTRIBUTE}=`)) return svg;
  const styles = [...svg.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gu)];
  if (!styles.length) return svg;
  const combined = styles.map(match => match[1]).join("\n");
  const scoped = scopeSvgCss(combined);
  let first = true;
  return svg.replace(/^<svg\b/u, `<svg ${SVG_STYLE_SCOPE_ATTRIBUTE}="${scoped.token}"`)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gu, () => {
      if (!first) return "";
      first = false;
      return `<style>${scoped.css}</style>`;
    });
}

export function isolateSvgElementStyles(svg) {
  if (svg.hasAttribute(SVG_STYLE_SCOPE_ATTRIBUTE)) return svg;
  const styles = [...svg.querySelectorAll("style")];
  if (!styles.length) return svg;
  const scoped = scopeSvgCss(styles.map(style => style.textContent).join("\n"));
  svg.setAttribute(SVG_STYLE_SCOPE_ATTRIBUTE, scoped.token);
  styles[0].textContent = scoped.css;
  for (const style of styles.slice(1)) style.remove();
  return svg;
}
