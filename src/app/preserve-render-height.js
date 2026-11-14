// Keep the page's scroll range stable while a viewer replaces its DOM and
// measures the new canvas. WebKit can clamp scrollY during that brief collapse,
// even when the replacement has exactly the same final height.
const pending = new WeakMap();

export function preserveRenderHeight(element, render) {
  const window = element.ownerDocument.defaultView;
  let reservation = pending.get(element);
  if (reservation) window.cancelAnimationFrame(reservation.frame);
  else {
    reservation = {
      value: element.style.getPropertyValue('min-height'),
      priority: element.style.getPropertyPriority('min-height')
    };
    const height = element.getBoundingClientRect().height;
    const style = window.getComputedStyle(element);
    const inset = style.boxSizing === 'border-box' ? 0
      : ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((sum, key) => sum + (Number.parseFloat(style[key]) || 0), 0);
    element.style.minHeight = `${Math.max(0, height - inset)}px`;
    // Commit the reservation before removing the old children. WebKit can
    // otherwise combine both changes into the same collapsing layout update.
    element.getBoundingClientRect();
    pending.set(element, reservation);
  }
  const release = () => {
    element.style.setProperty('min-height', reservation.value, reservation.priority);
    pending.delete(element);
  };
  try {
    return render();
  } finally {
    // Viewers enqueue their first resize during render; release after it.
    reservation.frame = window.requestAnimationFrame(release);
  }
}
