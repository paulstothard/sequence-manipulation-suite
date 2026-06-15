function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function getFeatureLabelFontSize(pixelsPerUnit, options = {}) {
  const minSize = clampNumber(options.minSize, 6, 24, 8);
  const maxSize = Math.max(minSize, clampNumber(options.maxSize, minSize, 24, 11));
  const lowZoom = clampNumber(options.lowZoom, 0.01, 100, 0.75);
  const mediumZoom = clampNumber(options.mediumZoom, lowZoom, 100, 1.5);
  const highZoom = clampNumber(options.highZoom, mediumZoom, 100, 3);
  const zoom = Number(pixelsPerUnit);

  if (!Number.isFinite(zoom) || zoom <= 0) return minSize;
  if (zoom < lowZoom) return minSize;
  if (zoom < mediumZoom) return Math.min(maxSize, minSize + 1);
  if (zoom < highZoom) return Math.min(maxSize, minSize + 2);
  return maxSize;
}

export function makeFeatureLabelFont(fontSize, options = {}) {
  const size = clampNumber(fontSize, 6, 24, 10);
  const weight = options.weight ?? 600;
  const family = options.family || "system-ui, sans-serif";
  return `${weight} ${size}px ${family}`;
}

export function getFeatureLabelRenderPlan(ctx, label, availableWidth, pixelsPerUnit, options = {}) {
  const text = String(label ?? "").trim();
  const width = Number(availableWidth);
  const fontSize = getFeatureLabelFontSize(pixelsPerUnit, options);
  const font = makeFeatureLabelFont(fontSize, options);
  const padding = clampNumber(options.padding, 0, 200, 8);
  const minAvailableWidth = clampNumber(options.minAvailableWidth, 0, 500, 18);

  if (!text || !Number.isFinite(width) || width < minAvailableWidth) {
    return { label: text, font, fontSize, fits: false, measuredWidth: 0, requiredWidth: padding };
  }
  if (!ctx || typeof ctx.measureText !== "function") {
    return { label: text, font, fontSize, fits: false, measuredWidth: 0, requiredWidth: padding };
  }

  const previousFont = ctx.font;
  ctx.font = font;
  const measuredWidth = ctx.measureText(text).width;
  ctx.font = previousFont;
  const requiredWidth = measuredWidth + padding;

  return {
    label: text,
    font,
    fontSize,
    fits: requiredWidth <= width,
    measuredWidth,
    requiredWidth
  };
}
