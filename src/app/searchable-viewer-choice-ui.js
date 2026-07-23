const DEFAULT_MAX_VISIBLE_CHOICES = 100;

let nextChoiceControlId = 1;

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function choiceSearchText(choice) {
  return `${choice.label ?? ""} ${choice.searchText ?? ""}`.trim().toLocaleLowerCase();
}

export function filterSearchableViewerChoices(
  choices,
  query = "",
  limit = DEFAULT_MAX_VISIBLE_CHOICES
) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const matches = choices.filter((choice) =>
    !normalizedQuery || choiceSearchText(choice).includes(normalizedQuery)
  );
  return {
    choices: matches.slice(0, positiveInteger(limit) || DEFAULT_MAX_VISIBLE_CHOICES),
    total: matches.length
  };
}

export function createSearchableViewerChoiceCombobox({
  choices,
  initialKey,
  inputLabel,
  toggleLabel,
  emptyText = "No matching choices",
  onChange
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "viewer-choice-combobox";
  const input = document.createElement("input");
  const toggle = document.createElement("button");
  const list = document.createElement("div");
  const controlNumber = nextChoiceControlId;
  nextChoiceControlId += 1;
  input.id = `viewerChoice${controlNumber}`;
  input.type = "search";
  input.required = true;
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", inputLabel);
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", `viewerChoiceList${controlNumber}`);
  toggle.type = "button";
  toggle.className = "viewer-choice-toggle";
  toggle.textContent = "▾";
  toggle.setAttribute("aria-label", toggleLabel);
  toggle.setAttribute("aria-controls", `viewerChoiceList${controlNumber}`);
  list.id = `viewerChoiceList${controlNumber}`;
  list.className = "viewer-choice-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  let selectedKey = "";
  let activeIndex = -1;
  let visibleChoices = [];

  const choiceForKey = (key) => choices.find((choice) => String(choice.key) === String(key));
  const exactChoiceForLabel = (label) => choices.find((choice) => choice.label === String(label).trim());
  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  };
  const selectChoice = (choice, { notify = true } = {}) => {
    selectedKey = String(choice?.key ?? "");
    input.value = choice?.label ?? "";
    close();
    if (notify) onChange?.(choice ?? null);
  };
  const setActiveIndex = (nextIndex) => {
    if (visibleChoices.length === 0) return;
    activeIndex = Math.max(0, Math.min(nextIndex, visibleChoices.length - 1));
    const options = list.querySelectorAll('[role="option"]');
    for (const [optionIndex, option] of options.entries()) {
      const active = optionIndex === activeIndex;
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", String(active));
      if (active) {
        input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    }
  };
  const open = ({ showAll = false } = {}) => {
    const filtered = filterSearchableViewerChoices(choices, showAll ? "" : input.value);
    visibleChoices = filtered.choices;
    const options = visibleChoices.map((choice, optionIndex) => {
      const option = document.createElement("button");
      option.type = "button";
      option.id = `viewerChoiceOption${controlNumber}-${optionIndex}`;
      option.className = "viewer-choice-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(String(choice.key) === selectedKey));
      const label = document.createElement("span");
      label.textContent = choice.label;
      const detail = document.createElement("span");
      detail.textContent = choice.detail || "";
      option.append(label, detail);
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => selectChoice(choice));
      return option;
    });
    if (filtered.total > visibleChoices.length) {
      const note = document.createElement("div");
      note.className = "viewer-choice-more";
      note.textContent = `Showing ${visibleChoices.length.toLocaleString()} of ${filtered.total.toLocaleString()} matches · type to narrow`;
      options.push(note);
    }
    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "viewer-choice-more";
      empty.textContent = emptyText;
      options.push(empty);
    }
    list.replaceChildren(...options);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  };

  input.addEventListener("input", () => {
    const exact = exactChoiceForLabel(input.value);
    selectedKey = String(exact?.key ?? "");
    open();
    onChange?.(exact ?? null);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) open({ showAll: true });
      const nextIndex = activeIndex < 0 && event.key === "ArrowUp"
        ? visibleChoices.length - 1
        : activeIndex + (event.key === "ArrowDown" ? 1 : -1);
      setActiveIndex(nextIndex);
    } else if (event.key === "Enter" && !list.hidden) {
      event.preventDefault();
      const selected = visibleChoices[activeIndex] ?? exactChoiceForLabel(input.value);
      if (selected) selectChoice(selected);
    } else if (event.key === "Escape") {
      close();
    }
  });
  input.addEventListener("blur", () => window.setTimeout(() => {
    if (!wrapper.contains(document.activeElement)) close();
  }, 0));
  toggle.addEventListener("click", () => {
    if (list.hidden) {
      open({ showAll: true });
      input.focus();
    } else {
      close();
    }
  });

  wrapper.append(input, toggle, list);
  selectChoice(choiceForKey(initialKey) ?? choices[0] ?? null, { notify: false });
  return {
    element: wrapper,
    input,
    toggle,
    getSelectedChoice: () => choiceForKey(selectedKey) ?? null,
    getValue: () => input.value,
    setSelectedKey: (key) => selectChoice(choiceForKey(key) ?? null, { notify: false }),
    setDisabled: (disabled) => {
      input.disabled = disabled;
      toggle.disabled = disabled;
      if (disabled) close();
    }
  };
}
