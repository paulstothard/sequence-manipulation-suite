// Keep inspection inside the visible part of its panel. Absolutely positioned
// cards still contribute to scrollable overflow, so constrain them before
// revealing/measuring them, including when a longer card replaces a short one.
export function placeInspectionTooltip(container, tooltip, position, anchorRect = null) {
  tooltip.hidden = true;
  const document = container.ownerDocument;
  const view = document.defaultView;
  const rect = container.getBoundingClientRect();
  const originX = rect.left + container.clientLeft;
  const originY = rect.top + container.clientTop;
  let left = Math.max(0, originX);
  let top = Math.max(0, originY);
  let right = Math.min(document.documentElement.clientWidth, originX + container.clientWidth);
  let bottom = Math.min(view.innerHeight, originY + container.clientHeight);
  for (let parent = container.parentElement; parent; parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const box = parent.getBoundingClientRect();
    if (style.overflowX !== "visible") {
      left = Math.max(left, box.left + parent.clientLeft);
      right = Math.min(right, box.left + parent.clientLeft + parent.clientWidth);
    }
    if (style.overflowY !== "visible") {
      top = Math.max(top, box.top + parent.clientTop);
      bottom = Math.min(bottom, box.top + parent.clientTop + parent.clientHeight);
    }
  }
  const inset = 8;
  left += inset;
  top += inset;
  right -= inset;
  bottom -= inset;
  if (right <= left || bottom <= top) return;
  tooltip.style.setProperty("--inspection-available-width", `${right - left}px`);
  tooltip.style.setProperty("--inspection-available-height", `${bottom - top}px`);
  const localX = x => container.scrollLeft + x - originX;
  const localY = y => container.scrollTop + y - originY;
  tooltip.style.left = `${localX(left)}px`;
  tooltip.style.top = `${localY(top)}px`;
  tooltip.hidden = false;
  const { width, height } = tooltip.getBoundingClientRect();
  let x = position.clientX + 12;
  let y = anchorRect ? Math.max(position.clientY + 14, anchorRect.bottom + inset) : position.clientY + 14;
  if (x + width > right) x = position.clientX - width - 12;
  if (y + height > bottom) y = (anchorRect ? anchorRect.top - inset : position.clientY - 14) - height;
  tooltip.style.left = `${localX(Math.max(left, Math.min(x, right - width)))}px`;
  tooltip.style.top = `${localY(Math.max(top, Math.min(y, bottom - height)))}px`;
}
