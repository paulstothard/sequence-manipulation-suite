// SVG viewers can receive two contacts on different child marks. targetTouches
// only includes the original event target; collect contacts owned by the whole
// surface, retaining their identities and excluding other viewers/page content.
export function viewerSurfaceTouches(event, surface) {
  return Array.from(event.touches ?? event.targetTouches ?? [])
    .filter(touch => !touch.target || touch.target === surface || surface.contains?.(touch.target));
}
