// Updating an existing text node avoids a transient empty control/status line.
// WebKit can clamp the page scroll range when textContent replaces that node,
// even when the finished line has exactly the same dimensions.
export function setUiText(element, value) {
  const text = String(value);
  if (element.textContent === text) return;
  if (element.childNodes.length === 1 && element.firstChild.nodeType === 3) {
    element.firstChild.data = text;
  } else element.textContent = text;
}
