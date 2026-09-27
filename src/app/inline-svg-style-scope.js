const INLINE_SVG_STYLE_SCOPE_ATTRIBUTE = "data-sms3-inline-style-scope";

let nextInlineSvgStyleScope = 1;
const isolatedStyleElements = new WeakSet();

function splitSelectorList(selectorText) {
  const selectors = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < selectorText.length; index += 1) {
    const character = selectorText[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "," && parentheses === 0 && brackets === 0) {
      selectors.push(selectorText.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(selectorText.slice(start).trim());
  return selectors.filter(Boolean);
}

export function scopeInlineSvgSelectorText(selectorText, scopeSelector) {
  const insideScope = `:where(${scopeSelector}, ${scopeSelector} *)`;
  return splitSelectorList(String(selectorText ?? ""))
    .map((selector) => `${insideScope}:is(${selector})`)
    .join(", ");
}

function scopeCssRules(ruleList, scopeSelector) {
  for (const rule of ruleList ?? []) {
    if (typeof rule.selectorText === "string") {
      rule.selectorText = scopeInlineSvgSelectorText(rule.selectorText, scopeSelector);
    } else if (rule.cssRules) {
      scopeCssRules(rule.cssRules, scopeSelector);
    }
  }
}

export function isolateInlineSvgStyles(svg) {
  if (svg?.localName !== "svg") return;
  const styles = [...svg.querySelectorAll("style")]
    .filter((style) => style.closest("svg") === svg && !isolatedStyleElements.has(style));
  if (styles.length === 0) return;
  let scopeToken = svg.getAttribute(INLINE_SVG_STYLE_SCOPE_ATTRIBUTE);
  if (!scopeToken) {
    scopeToken = `sms3-inline-svg-${nextInlineSvgStyleScope}`;
    nextInlineSvgStyleScope += 1;
    svg.setAttribute(INLINE_SVG_STYLE_SCOPE_ATTRIBUTE, scopeToken);
  }
  const scopeSelector = `[${INLINE_SVG_STYLE_SCOPE_ATTRIBUTE}="${scopeToken}"]`;
  for (const style of styles) {
    const rules = style.sheet?.cssRules;
    if (!rules) continue;
    scopeCssRules(rules, scopeSelector);
    isolatedStyleElements.add(style);
  }
}

function isolateSvgStylesWithin(node) {
  if (node?.nodeType !== 1) return;
  if (node.localName === "svg") isolateInlineSvgStyles(node);
  for (const svg of node.querySelectorAll?.("svg") ?? []) {
    isolateInlineSvgStyles(svg);
  }
  if (node.localName === "style") {
    isolateInlineSvgStyles(node.closest("svg"));
  }
}

export function installInlineSvgStyleIsolation(root) {
  isolateSvgStylesWithin(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) isolateSvgStylesWithin(node);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
