// Keep deletion available throughout an editor, without stealing text-editing
// keys or the native behavior of unrelated form controls.
export function bindImageEditorDeletion(root, button, remove, selectionList) {
  button.dataset.controlHelp = 'Delete selected item (Backspace or Delete)';
  button.setAttribute('aria-keyshortcuts', 'Backspace Delete');
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        !['Backspace', 'Delete'].includes(event.key) || button.disabled) return;
    const editing = event.composedPath().some(node => node instanceof Element &&
      node !== selectionList && (node.matches('input,textarea,select,[role="textbox"]') || node.isContentEditable));
    if (editing) return;
    event.preventDefault();
    event.stopPropagation();
    remove();
  });
}
