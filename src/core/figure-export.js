export const PNG_EXPORT_DPI = 600;
export const CSS_PIXELS_PER_INCH = 96;
export const MAX_PNG_PIXELS = 32000000;
export const MAX_PNG_SIDE = 16384;

// A physical figure determines its pixels. Screen-only views use the CSS inch
// convention; neither path silently changes the requested resolution to fit.
export function figurePngSize(width, height, physicalSize) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0))
    throw new Error("Invalid figure dimensions.");
  const widthMm = physicalSize?.widthMm ?? width * 25.4 / CSS_PIXELS_PER_INCH;
  const heightMm = physicalSize?.heightMm ?? height * 25.4 / CSS_PIXELS_PER_INCH;
  if (![widthMm, heightMm].every(value => Number.isFinite(value) && value > 0))
    throw new Error("Invalid physical figure dimensions.");
  const pixelWidth = Math.max(1, Math.round(widthMm / 25.4 * PNG_EXPORT_DPI));
  const pixelHeight = Math.max(1, Math.round(heightMm / 25.4 * PNG_EXPORT_DPI));
  if (pixelWidth > MAX_PNG_SIDE || pixelHeight > MAX_PNG_SIDE || pixelWidth * pixelHeight > MAX_PNG_PIXELS)
    throw new Error("The 600 DPI PNG exceeds browser image limits. Export SVG or select a smaller region.");
  return { width: pixelWidth, height: pixelHeight, scale: pixelWidth / width, widthMm, heightMm };
}
