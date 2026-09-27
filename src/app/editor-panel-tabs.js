let nextTabSet = 0;

// Local editor panels stay mounted so switching tabs preserves draft fields.
export function createEditorPanelTabs(label, entries) {
  const id = `editor-panels-${++nextTabSet}`;
  const element = document.createElement("div");
  element.className = "editor-panel-tabs";
  element.setAttribute("role", "tablist");
  element.setAttribute("aria-label", label);
  const buttons = entries.map((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `${id}-${entry.id}-tab`;
    button.textContent = entry.label;
    button.dataset.editorTab = entry.id;
    button.setAttribute("role", "tab");
    entry.panel.id = `${id}-${entry.id}-panel`;
    entry.panel.setAttribute("role", "tabpanel");
    entry.panel.setAttribute("aria-labelledby", button.id);
    button.setAttribute("aria-controls", entry.panel.id);
    button.addEventListener("click", () => select(entry.id));
    element.append(button);
    return button;
  });
  function select(selectedId, focus = false) {
    entries.forEach((entry, index) => {
      const selected = entry.id === selectedId;
      buttons[index].setAttribute("aria-selected", String(selected));
      buttons[index].tabIndex = selected ? 0 : -1;
      entry.panel.hidden = !selected;
      if (selected && focus) buttons[index].focus();
    });
  }
  element.addEventListener("keydown", (event) => {
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % entries.length;
    else if (event.key === "ArrowLeft") next = (index + entries.length - 1) % entries.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = entries.length - 1;
    else return;
    event.preventDefault();
    select(entries[next].id, true);
  });
  select(entries[0].id);
  return { element, select };
}
