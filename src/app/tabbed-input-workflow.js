function normalizeInputWorkflowModes(modes = {}) {
  if (Array.isArray(modes)) {
    return modes
      .map((config) => {
        const mode = config?.id ?? config?.mode ?? config?.value;
        return mode ? [mode, config] : null;
      })
      .filter(Boolean);
  }
  return Object.entries(modes);
}

function getTabMode(tab, datasetKey) {
  return (
    tab?.dataset?.[datasetKey] ??
    tab?.dataset?.inputWorkflowMode ??
    tab?.dataset?.sourceMode ??
    tab?.dataset?.workflowTab ??
    ""
  );
}

export function updateTabbedInputWorkflowTabs(
  root,
  selectedMode,
  { datasetKey = "sourceMode", tabSelector = '[role="tab"]' } = {}
) {
  if (!root) {
    return;
  }
  const scope = root.matches?.(tabSelector) ? root.parentElement : root;
  if (!scope) {
    return;
  }
  for (const tab of scope.querySelectorAll(tabSelector)) {
    const selected = getTabMode(tab, datasetKey) === selectedMode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}

export function createTabbedInputWorkflowTabs({
  document: ownerDocument = globalThis.document,
  modes,
  selectedMode,
  ariaLabel,
  className = "file-source-tabs",
  tabClassName = "file-source-tab",
  datasetKey = "sourceMode",
  onSelect = () => {}
} = {}) {
  const entries = normalizeInputWorkflowModes(modes);
  const tabs = ownerDocument.createElement("div");
  tabs.className = className;
  tabs.setAttribute("role", "tablist");
  if (ariaLabel) {
    tabs.setAttribute("aria-label", ariaLabel);
  }

  const selectMode = (mode, config, { focus = false } = {}) => {
    updateTabbedInputWorkflowTabs(tabs, mode, { datasetKey });
    if (focus) {
      const activeTab = Array.from(tabs.querySelectorAll('[role="tab"]')).find(
        (tab) => getTabMode(tab, datasetKey) === mode
      );
      activeTab?.focus();
    }
    onSelect(mode, config);
  };

  for (const [mode, config] of entries) {
    const tab = ownerDocument.createElement("button");
    tab.type = "button";
    tab.className = tabClassName;
    tab.dataset[datasetKey] = mode;
    tab.dataset.inputWorkflowMode = mode;
    tab.setAttribute("role", "tab");
    if (config?.ariaControls) {
      tab.setAttribute("aria-controls", config.ariaControls);
    }
    tab.textContent = config?.tabText ?? config?.label ?? mode;
    tab.addEventListener("click", () => selectMode(mode, config));
    tabs.append(tab);
  }

  tabs.addEventListener("keydown", (event) => {
    const tabElements = Array.from(tabs.querySelectorAll('[role="tab"]'));
    const currentIndex = tabElements.indexOf(event.target);
    if (currentIndex < 0) {
      return;
    }

    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabElements.length) % tabElements.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabElements.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabElements.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabElements[nextIndex];
    nextTab.focus();
    nextTab.click();
  });

  updateTabbedInputWorkflowTabs(tabs, selectedMode ?? entries[0]?.[0] ?? "", { datasetKey });
  return tabs;
}
