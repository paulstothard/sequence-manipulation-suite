// Image-editor colors use CSS hex, with an optional alpha byte. Existing
// six-digit colors stay opaque and retain their original document representation.
export const isImageColor = value => typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value);
export const colorOpacity = value => value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1;
export function withColorOpacity(value, opacity) {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return value.slice(0, 7).toLowerCase() + (alpha === 255 ? '' : alpha.toString(16).padStart(2, '0'));
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
