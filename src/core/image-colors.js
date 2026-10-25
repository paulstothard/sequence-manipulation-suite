// Image-editor colors use CSS hex, with an optional alpha byte. Existing
// six-digit colors stay opaque and retain their original document representation.
export const isImageColor = value => typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value);
export const colorOpacity = value => value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1;
export function withColorOpacity(value, opacity) {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return value.slice(0, 7).toLowerCase() + (alpha === 255 ? '' : alpha.toString(16).padStart(2, '0'));
}

// Older fills/highlights applied fixed alpha in the renderer. Move it into
// paint once so the picker shows and controls the full value. Keep highlight
// types intact because text images paint them beneath the source characters.
export function normalizeAnnotationFill(annotation, { highlightOpacity = .25 } = {}) {
  const highlight = annotation.type === 'highlight';
  const multiplier = annotation.fillStyle === 'soft' ? .25
    : annotation.fillOpacity ?? (highlight ? highlightOpacity : annotation.fillStyle === 'hatched' ? .55 : 1);
  if (multiplier !== 1) {
    const key = highlight ? 'color' : 'fill', fill = annotation[key] ?? annotation.color;
    annotation[key] = withColorOpacity(fill, colorOpacity(fill) * multiplier);
  }
  if (annotation.fillStyle === 'soft') annotation.fillStyle = 'solid';
  // Explicitly distinguish current paint alpha from legacy renderer defaults.
  annotation.fillOpacity = 1;
}

export const annotationColor = (annotation, key) => {
  const color = annotation[key] ?? annotation.color;
  return withColorOpacity(color, colorOpacity(color) * (annotation.opacity ?? 1));
};
export function setAnnotationColor(annotation, key, color) {
  // Preserve the other paint when editing older documents with object opacity.
  annotation.fill = annotationColor(annotation, 'fill');
  annotation.color = annotationColor(annotation, 'color');
  annotation.opacity = 1;
  annotation[key] = color;
}
