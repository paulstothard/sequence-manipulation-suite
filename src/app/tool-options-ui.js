import { classifyToolLimitDisclosure } from "../tools/limit-disclosure.js";
import { readToolInputFileText } from "./input-file-readers.js";
import {
  getStoredLimitOptionValues,
  persistLimitOptionValue
} from "./limit-option-storage.js";

export function createToolOptionsController({
  elements,
  state,
  callbacks
}) {
  const {
    addMessage,
    clearToolOutput,
    updateToolOptionSuggestions
  } = callbacks;

  function renderToolOptions(options) {
    const visibleOptions = options.filter(shouldRenderToolOption);
    const shouldAppendLimitDisclosure = shouldAppendGeneratedLimitDisclosure(state.selectedTool?.metadata);
    if (visibleOptions.length === 0 && !shouldAppendLimitDisclosure) {
      elements.toolOptions.textContent = "";
      return;
    }

    const fragment = document.createDocumentFragment();
    const defaultValues = {
      ...getDefaultOptionValues(options),
      ...getStoredLimitOptionValues(state.selectedTool?.metadata?.id, options)
    };

    let appendedLimitDisclosure = false;
    for (const option of visibleOptions) {
      appendToolOptionControl(fragment, option, defaultValues);
      if (shouldAppendLimitDisclosure && !appendedLimitDisclosure && optionTreeIncludesId(option, "outputFormat")) {
        fragment.append(createGeneratedLimitDisclosure(state.selectedTool.metadata));
        appendedLimitDisclosure = true;
      }
    }
    if (shouldAppendLimitDisclosure && !appendedLimitDisclosure) {
      fragment.append(createGeneratedLimitDisclosure(state.selectedTool.metadata));
    }
    const flatOptions = flattenOptions(options);
    for (const source of getSuggestionSourcesForOptions(flatOptions)) {
      if (source === "vcf-chromosomes") {
        continue;
      }
      const datalistId = getSuggestionListId(source);
      if (!datalistId) {
        continue;
      }
      const datalist = document.createElement("datalist");
      datalist.id = datalistId;
      fragment.append(datalist);
    }
    if (flatOptions.some((option) => option.suggestionsFrom === "vcf-chromosomes")) {
      const datalist = document.createElement("datalist");
      datalist.id = "vcfChromosomeSuggestions";
      fragment.append(datalist);
    }

    elements.toolOptions.replaceChildren(fragment);
    wireDependentToolOptions(options);
    updateToolOptionSuggestions({ autofillColumns: true });
  }

  function shouldAppendGeneratedLimitDisclosure(metadata) {
    const visibleOptions = (metadata?.options ?? []).filter(shouldRenderToolOption);
    return Boolean(metadata) && !visibleOptions.some(isTopLevelToolLimitGroup);
  }

  function isTopLevelToolLimitGroup(option) {
    const label = String(option.label ?? "");
    return option.type === "group" && (
      option.id === "advancedLimits" ||
      option.id === "referenceMatchLimitsGroup" ||
      /^limits$/i.test(label)
    );
  }

  function optionTreeIncludesId(option, id) {
    return option.id === id || (option.options ?? []).some((child) => optionTreeIncludesId(child, id));
  }

  function createGeneratedLimitDisclosure(metadata) {
    const disclosure = classifyToolLimitDisclosure(metadata);
    const details = document.createElement("details");
    details.className = "option-group option-group-collapsible option-limit-disclosure";
    details.dataset.optionId = "generatedLimits";
    const summary = document.createElement("summary");
    summary.append(createOptionLabelContent({
      label: "Limits",
      help: "Input, processing, output, and browser-local guardrails for this tool."
    }));
    const text = document.createElement("p");
    text.className = "option-limit-summary";
    text.textContent = disclosure.summary;
    details.append(summary, text);
    return details;
  }

  function getSuggestionSourcesForOptions(options) {
    return [...new Set(options.flatMap((option) => [option.suggestionsFrom, option.columnSuggestionsFrom]).filter(Boolean))];
  }

  function shouldRenderToolOption(option) {
    if (option.type === "group") {
      return (option.options ?? []).some(shouldRenderToolOption);
    }
    if (option.placement === "input") {
      return false;
    }
    return true;
  }

  function getSuggestionListId(source) {
    return {
      "table-columns": "tableColumnSuggestions",
      "table-numeric-columns": "tableNumericColumnSuggestions",
      "table-left-columns": "tableLeftColumnSuggestions",
      "table-right-columns": "tableRightColumnSuggestions",
      "vcf-chromosomes": "vcfChromosomeSuggestions",
      "vcf-samples": "vcfSampleSuggestions",
      "vcf-genes": "vcfGeneSuggestions",
      "sam-bam-references": "samBamReferenceSuggestions",
      "protein-structure-models": "proteinStructureModelSuggestions",
      "protein-structure-chains": "proteinStructureChainSuggestions",
      "protein-structure-chains-auto": "proteinStructureChainAutoSuggestions",
      "protein-alignment-rows": "proteinAlignmentRowSuggestions"
    }[source] ?? "";
  }

  function serializeRuleListControl(root) {
    const kind = root.dataset.ruleKind;
    return [...root.querySelectorAll(".option-rule-row")]
      .map((row) => {
        const column = row.querySelector(".option-rule-column")?.value.trim() ?? "";
        const operator = row.querySelector(".option-rule-operator")?.value ?? "";
        const value = row.querySelector(".option-rule-value")?.value.trim() ?? "";
        if (kind === "column-filter") {
          if (!value) {
            return "";
          }
          return `${operator || "contains"} | ${value}`;
        }
        if (!column && !value) {
          return "";
        }
        return kind === "sort"
          ? `${column} | ${operator || "asc"}`
          : `${column} | ${operator || "contains"} | ${value}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  function serializeValueListControl(root) {
    return [...root.querySelectorAll(".option-value-list-input")]
      .map((input) => input.value.trim())
      .filter(Boolean)
      .join(",");
  }

  function parseRuleListValue(value, kind) {
    return String(value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.includes("|")
          ? line.split("|").map((part) => part.trim())
          : line.split(",").map((part) => part.trim());
        if (kind === "column-filter") {
          return {
            column: "",
            operator: parts[0] || "contains",
            value: parts.slice(1).join("|").trim()
          };
        }
        return {
          column: parts[0] ?? "",
          operator: parts[1] || (kind === "sort" ? "asc" : "contains"),
          value: kind === "sort" ? "" : parts.slice(2).join("|").trim()
        };
      });
  }

  function parseValueListValue(value) {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function appendValueListRow(list, option, value = "", onChange = null) {
    const row = document.createElement("div");
    row.className = "option-value-list-row";

    const input = document.createElement("input");
    input.className = "option-value-list-input";
    input.type = "text";
    input.placeholder = option.itemPlaceholder ?? "Column";
    input.value = value;
    const suggestionListId = getSuggestionListId(option.suggestionsFrom);
    if (suggestionListId) {
      input.setAttribute("list", suggestionListId);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "option-rule-remove option-value-list-remove";
    remove.setAttribute("aria-label", `Remove ${option.itemLabel ?? "item"}`);
    remove.textContent = "×";

    const emitChange = () => {
      list.dataset.value = serializeValueListControl(list);
      onChange?.(list.dataset.value);
    };
    input.addEventListener("input", emitChange);
    remove.addEventListener("click", () => {
      row.remove();
      emitChange();
    });

    row.append(input, remove);
    list.querySelector(".option-value-list-rows").append(row);
    emitChange();
  }

  function appendValueListControl(parent, option, value = option.defaultValue ?? "", onChange = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "option-value-list";
    wrapper.id = option.id;
    wrapper.dataset.optionId = option.id;
    wrapper.dataset.value = "";

    const header = document.createElement("div");
    header.className = "option-rule-list-header";
    header.append(createOptionLabelContent(option));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "option-rule-add";
    add.textContent = option.addLabel ?? "Add";
    header.append(add);

    const rows = document.createElement("div");
    rows.className = "option-value-list-rows";
    wrapper.append(header, rows);

    add.addEventListener("click", () => appendValueListRow(wrapper, option, "", onChange));
    for (const item of parseValueListValue(value)) {
      appendValueListRow(wrapper, option, item, onChange);
    }
    parent.append(wrapper);
  }

  function appendRuleListRow(list, option, rule = {}, onChange = null) {
    const kind = option.ruleKind ?? "filter";
    const isColumnFilter = kind === "column-filter";
    const row = document.createElement("div");
    row.className = `option-rule-row ${kind === "sort" ? "option-rule-row-sort" : ""}`;

    const makeField = (className, labelText, control) => {
      const label = document.createElement("label");
      label.className = `option-rule-field ${className}`;
      const labelTextElement = document.createElement("span");
      labelTextElement.textContent = labelText;
      label.append(labelTextElement, control);
      return label;
    };

    const column = document.createElement("input");
    column.className = "option-rule-column";
    column.type = "text";
    column.placeholder = "Column";
    column.value = rule.column ?? "";
    const columnSuggestionListId = getSuggestionListId(option.columnSuggestionsFrom);
    if (columnSuggestionListId) {
      column.setAttribute("list", columnSuggestionListId);
    }

    const operator = document.createElement("select");
    operator.className = "option-rule-operator";
    for (const choice of option.ruleChoices ?? []) {
      const item = document.createElement("option");
      item.value = choice.value;
      item.textContent = choice.label;
      operator.append(item);
    }
    operator.value = rule.operator ?? option.defaultRule ?? (kind === "sort" ? "asc" : "contains");

    const value = document.createElement("input");
    value.className = "option-rule-value";
    value.type = "text";
    value.placeholder = isColumnFilter ? "Column name or id" : kind === "sort" ? "" : "Value";
    value.value = rule.value ?? "";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "option-rule-remove";
    remove.setAttribute("aria-label", `Remove ${kind} rule`);
    remove.textContent = "×";

    const emitChange = () => {
      list.dataset.value = serializeRuleListControl(list);
      onChange?.(list.dataset.value);
    };
    column.addEventListener("input", emitChange);
    operator.addEventListener("change", emitChange);
    value.addEventListener("input", emitChange);
    remove.addEventListener("click", () => {
      row.remove();
      emitChange();
    });

    if (!isColumnFilter) {
      row.append(makeField("option-rule-field-column", "Column", column));
    }
    row.append(makeField("option-rule-field-operator", kind === "sort" ? "Direction" : "Rule", operator));
    if (kind !== "sort") {
      row.append(makeField("option-rule-field-value", option.valueLabel ?? "Value", value));
    }
    row.append(remove);
    list.querySelector(".option-rule-rows").append(row);
    emitChange();
  }

  function appendRuleListControl(parent, option, value = option.defaultValue ?? "", onChange = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "option-rule-list";
    wrapper.id = option.id;
    wrapper.dataset.optionId = option.id;
    wrapper.dataset.ruleKind = option.ruleKind ?? "filter";
    wrapper.dataset.value = "";

    const header = document.createElement("div");
    header.className = "option-rule-list-header";
    header.append(createOptionLabelContent(option));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "option-rule-add";
    add.textContent = option.addLabel ?? "Add rule";
    header.append(add);

    const rows = document.createElement("div");
    rows.className = "option-rule-rows";
    wrapper.append(header, rows);

    add.addEventListener("click", () => appendRuleListRow(wrapper, option, {}, onChange));
    for (const rule of parseRuleListValue(value, option.ruleKind ?? "filter")) {
      appendRuleListRow(wrapper, option, rule, onChange);
    }
    parent.append(wrapper);
  }

  function normalizeOptionLabel(label) {
    return String(label ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function optionLabelDuplicatesParent(option, parentGroupLabel) {
    const childLabel = normalizeOptionLabel(option.label);
    return Boolean(childLabel) && childLabel === normalizeOptionLabel(parentGroupLabel);
  }

  function createOptionLabelContentForContext(option, parentGroupLabel = "") {
    const label = createOptionLabelContent(option);
    if (optionLabelDuplicatesParent(option, parentGroupLabel)) {
      label.classList.add("visually-hidden");
    }
    return label;
  }

  function appendToolOptionControl(parent, option, defaultValues, parentGroupLabel = "") {
    if (option.type === "group") {
      const group = document.createElement(option.collapsible ? "details" : "section");
      group.className = "option-group";
      if (option.collapsible) {
        group.classList.add("option-group-collapsible");
        if (option.collapsed !== true) {
          group.open = true;
        }
      }
      if (option.layout) {
        group.classList.add(`option-group-${option.layout}`);
      }
      if (option.id) {
        group.dataset.optionId = option.id;
      }
      if (option.label || option.help) {
        if (option.collapsible) {
          const heading = document.createElement("summary");
          heading.append(createOptionLabelContent(option));
          group.append(heading);
        } else {
          const heading = document.createElement("h4");
          heading.append(createOptionLabelContent(option));
          group.append(heading);
        }
      }
      for (const child of option.options ?? []) {
        if (shouldRenderToolOption(child)) {
          appendToolOptionControl(group, child, defaultValues, option.label ?? "");
        }
      }
      parent.append(group);
      return;
    }

    if (option.type === "summary-card") {
      const card = document.createElement("div");
      card.className = "option-summary-card";
      if (option.id) {
        card.dataset.optionId = option.id;
      }
      const title = document.createElement("strong");
      title.textContent = option.title ?? option.label ?? "Summary";
      const text = document.createElement("p");
      text.dataset.summaryText = "";
      text.textContent = option.text ?? "";
      card.append(title, text);
      parent.append(card);
      return;
    }

    if (option.type === "reference-table") {
      appendOptionReferenceTable(parent, option);
      return;
    }

    if (option.type === "select" || (option.type === "radio" && (option.choices ?? []).length > 3)) {
      const optionValue = getOptionDefaultValue(option, defaultValues);
      const label = document.createElement("label");
      label.className = "select-row";
      label.dataset.optionId = option.id;
      label.append(createOptionLabelContentForContext(option, parentGroupLabel));
      const select = document.createElement("select");
      select.id = option.id;
      select.name = option.id;
      populateDependentSelect(select, option, defaultValues, optionValue);
      label.append(select);
      parent.append(label);
      return;
    }

    if (option.type === "radio" && option.presentation === "tabs") {
      const optionValue = getOptionDefaultValue(option, defaultValues);
      const wrapper = document.createElement("div");
      wrapper.className = "radio-tab-row";
      wrapper.dataset.optionId = option.id;
      if (option.label || option.help) {
        const heading = document.createElement("div");
        heading.className = "radio-tab-heading";
        heading.append(createOptionLabelContentForContext(option, parentGroupLabel));
        wrapper.append(heading);
      }
      const tabs = document.createElement("div");
      tabs.className = option.className ?? "file-source-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", option.label ?? "Options");
      const radios = [];
      for (const choice of option.choices) {
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = option.id;
        radio.value = choice.value;
        radio.checked = choice.value === optionValue;
        radio.hidden = true;
        radios.push(radio);

        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "file-source-tab";
        tab.setAttribute("role", "tab");
        tab.dataset.value = choice.value;
        tab.textContent = choice.label;
        const selectTab = () => {
          for (const input of radios) {
            input.checked = input === radio;
          }
          for (const button of tabs.querySelectorAll("[role='tab']")) {
            const active = button === tab;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
            button.tabIndex = active ? 0 : -1;
          }
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        };
        tab.addEventListener("click", selectTab);
        tab.classList.toggle("active", radio.checked);
        tab.setAttribute("aria-selected", radio.checked ? "true" : "false");
        tab.tabIndex = radio.checked ? 0 : -1;
        tabs.append(tab, radio);
      }
      wrapper.append(tabs);
      parent.append(wrapper);
      return;
    }

    if (option.type === "radio") {
      const optionValue = getOptionDefaultValue(option, defaultValues);
      const fieldset = document.createElement("fieldset");
      fieldset.dataset.optionId = option.id;
      const legend = document.createElement("legend");
      legend.append(createOptionLabelContentForContext(option, parentGroupLabel));
      fieldset.append(legend);

      for (const choice of option.choices) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = option.id;
        input.value = choice.value;
        input.checked = choice.value === optionValue;
        label.append(input, ` ${choice.label}`);
        fieldset.append(label);
      }

      parent.append(fieldset);
      return;
    }

    if (option.type === "checkbox") {
      const optionValue = getOptionDefaultValue(option, defaultValues);
      const label = document.createElement("label");
      label.className = "checkbox-row";
      label.dataset.optionId = option.id;
      const input = document.createElement("input");
      input.id = option.id;
      input.name = option.id;
      input.type = "checkbox";
      input.checked = optionValue === true;
      label.append(input, createOptionLabelContentForContext(option, parentGroupLabel));
      parent.append(label);
      return;
    }

    if (option.type === "number") {
      const optionValue = getOptionDefaultValue(option, defaultValues);
      const label = document.createElement("label");
      label.className = "number-row";
      label.dataset.optionId = option.id;
      label.append(createOptionLabelContentForContext(option, parentGroupLabel));
      const input = document.createElement("input");
      input.id = option.id;
      input.type = "number";
      input.min = option.min;
      input.max = option.max;
      input.value = optionValue;
      label.append(input);
      parent.append(label);
      return;
    }

    if (option.type === "text") {
      const optionValue = getOptionDefaultValue(option, defaultValues);
      const label = document.createElement("label");
      label.className = "text-row";
      label.dataset.optionId = option.id;
      label.append(createOptionLabelContentForContext(option, parentGroupLabel));
      const input = document.createElement("input");
      input.id = option.id;
      input.type = "text";
      input.value = optionValue ?? "";
      if (option.placeholder) {
        input.placeholder = option.placeholder;
      }
      const suggestionListId = getSuggestionListId(option.suggestionsFrom);
      if (suggestionListId) {
        input.setAttribute("list", suggestionListId);
      }
      label.append(input);
      parent.append(label);
      return;
    }

    if (option.type === "textarea") {
      const optionValue = getOptionDefaultValue(option, defaultValues);
      const hasFileDrop = Boolean(option.accept || option.dropLabel);
      const wrapper = document.createElement(hasFileDrop ? "div" : "label");
      wrapper.className = hasFileDrop ? "text-row textarea-file-option-row" : "text-row";
      wrapper.dataset.optionId = option.id;
      const heading = document.createElement("div");
      if (hasFileDrop) {
        heading.className = "file-option-heading";
      }
      heading.append(createOptionLabelContentForContext(option, parentGroupLabel));
      const input = document.createElement("textarea");
      input.id = option.id;
      input.name = option.id;
      input.rows = option.rows ?? 5;
      input.spellcheck = false;
      input.wrap = "off";
      input.value = optionValue ?? "";
      if (option.placeholder) {
        input.placeholder = option.placeholder;
      }
      if (hasFileDrop) {
        const browseLabel = document.createElement("label");
        browseLabel.className = "file-button file-option-browse";
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = option.accept ?? ".txt";
        const browseText = document.createElement("span");
        browseText.textContent = "Choose file";
        browseLabel.append(fileInput, browseText);
        heading.append(browseLabel);
        const dropZone = document.createElement("div");
        dropZone.className = "drop-zone file-option-drop-zone";
        dropZone.tabIndex = 0;
        dropZone.textContent = option.dropLabel ?? "Drop text file here";
        const status = document.createElement("div");
        status.className = "file-option-status";
        status.id = `${option.id}Status`;
        status.textContent = "No file loaded";
        fileInput.setAttribute("aria-describedby", status.id);
        const loadFile = async (file) => {
          if (!file) {
            return;
          }
          if (file.size > 25 * 1024 * 1024) {
            addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
            return;
          }
          input.value = await readToolInputFileText(file, { onMessage: addMessage });
          status.textContent = `${file.name} (${file.size.toLocaleString()} bytes)`;
          clearToolOutput();
          updateToolOptionSuggestions();
          addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
        };
        fileInput.addEventListener("change", async () => {
          await loadFile(fileInput.files?.[0]);
          fileInput.value = "";
        });
        dropZone.addEventListener("dragover", (event) => {
          event.preventDefault();
          dropZone.classList.add("drag-over");
        });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
        dropZone.addEventListener("drop", async (event) => {
          event.preventDefault();
          dropZone.classList.remove("drag-over");
          await loadFile(event.dataTransfer?.files?.[0]);
        });
        dropZone.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          fileInput.click();
        });
        wrapper.append(heading, dropZone, status, input);
      } else {
        wrapper.append(heading, input);
      }
      parent.append(wrapper);
      return;
    }

    if (option.type === "file") {
      const hasPasteArea = option.pasteArea === true;
      const wrapper = document.createElement("div");
      wrapper.className = "text-row file-option-row";
      wrapper.dataset.optionId = option.id;
      const heading = document.createElement("div");
      heading.className = "file-option-heading";
      heading.append(createOptionLabelContent(option));
      const browseLabel = document.createElement("label");
      browseLabel.className = "file-button file-option-browse";
      const input = document.createElement("input");
      input.id = option.id;
      input.type = "file";
      input.multiple = option.multiple === true;
      input.setAttribute("aria-label", option.label ?? (input.multiple ? "Files" : "File"));
      if (option.accept) {
        input.accept = option.accept;
      }
      const browseText = document.createElement("span");
      browseText.textContent = input.multiple ? "Browse files" : "Browse file";
      browseLabel.append(input, browseText);
      heading.append(browseLabel);
      const dropZone = document.createElement("div");
      dropZone.className = "drop-zone file-option-drop-zone";
      dropZone.tabIndex = 0;
      dropZone.textContent = option.dropLabel ?? (input.multiple ? "Drop files here" : "Drop file here");
      const status = document.createElement("div");
      status.className = "file-option-status";
      status.id = `${option.id}Status`;
      status.textContent = input.multiple ? "No files selected" : "No file selected";
      input.setAttribute("aria-describedby", status.id);
      const pasteArea = document.createElement("textarea");
      if (hasPasteArea) {
        pasteArea.id = `${option.id}Text`;
        pasteArea.name = `${option.id}Text`;
        pasteArea.className = "file-option-textarea";
        pasteArea.rows = option.pasteRows ?? 7;
        pasteArea.spellcheck = false;
        pasteArea.wrap = "off";
        pasteArea.placeholder = option.pastePlaceholder ?? "Paste text here";
      }
      input.addEventListener("change", () => {
        updateFileOptionStatus(input, status);
        if (hasPasteArea && input.files?.length) {
          pasteArea.value = "";
        }
      });
      dropZone.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropZone.classList.add("drag-over");
      });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
      dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropZone.classList.remove("drag-over");
        setFileOptionFiles(input, event.dataTransfer?.files, input.multiple);
      });
      dropZone.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        input.click();
      });
      if (hasPasteArea) {
        pasteArea.addEventListener("input", () => {
          if (pasteArea.value.trim() && input.files?.length) {
            input.value = "";
            updateFileOptionStatus(input, status);
          }
          clearToolOutput();
          updateToolOptionSuggestions();
        });
        wrapper.append(heading, dropZone, status, pasteArea);
      } else {
        wrapper.append(heading, dropZone, status);
      }
      parent.append(wrapper);
      return;
    }

    if (option.type === "rule-list") {
      appendRuleListControl(parent, option, getOptionDefaultValue(option, defaultValues));
      return;
    }

    if (option.type === "value-list") {
      appendValueListControl(parent, option, getOptionDefaultValue(option, defaultValues));
      return;
    }

    if (option.type === "note") {
      const note = document.createElement("p");
      note.className = "option-note";
      if (option.id) {
        note.dataset.optionId = option.id;
      }
      note.textContent = option.text;
      parent.append(note);
    }
  }

  function appendOptionReferenceTable(parent, option) {
    const wrapper = document.createElement("div");
    wrapper.className = "option-reference-table-wrap";
    if (option.id) {
      wrapper.dataset.optionId = option.id;
    }

    if (option.text) {
      const text = document.createElement("p");
      text.className = "option-note";
      text.textContent = option.text;
      wrapper.append(text);
    }

    const scroller = document.createElement("div");
    scroller.className = "option-reference-table-scroll";
    const table = document.createElement("table");
    table.className = "option-reference-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const column of option.columns ?? []) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = column;
      headerRow.append(th);
    }
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const row of option.rows ?? []) {
      const tr = document.createElement("tr");
      for (const cell of row) {
        const td = document.createElement("td");
        td.textContent = String(cell ?? "");
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    scroller.append(table);
    wrapper.append(scroller);
    parent.append(wrapper);
  }

  function updateFileOptionStatus(input, status) {
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      status.textContent = input.multiple ? "No files selected" : "No file selected";
      return;
    }
    const names = files.map((file) => file.name || "unnamed file");
    const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    status.textContent = `${names.join(", ")} (${totalBytes.toLocaleString()} bytes)`;
    clearToolOutput();
  }

  function setFileOptionFiles(input, fileList, allowMultiple = false) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }
    const transfer = new DataTransfer();
    for (const file of allowMultiple ? files : files.slice(0, 1)) {
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function createOptionLabelContent(option) {
    const label = document.createElement("span");
    label.className = "option-label";
    label.append(String(option.label ?? ""));
    const helpText = String(option.help ?? "").trim();
    if (!helpText) {
      return label;
    }

    const help = document.createElement("span");
    help.className = "option-help";
    help.tabIndex = 0;
    help.setAttribute("role", "button");
    help.setAttribute("aria-label", "Show option help");
    help.textContent = "?";

    const popover = document.createElement("span");
    popover.className = "option-help-popover";
    popover.setAttribute("aria-hidden", "true");
    popover.textContent = helpText;
    const positionPopover = () => positionOptionHelpPopover(help, popover);
    help.addEventListener("mouseenter", positionPopover);
    help.addEventListener("focus", positionPopover);
    help.addEventListener("click", positionPopover);
    label.append(" ", help, popover);
    return label;
  }

  function positionOptionHelpPopover(help, popover) {
    const margin = 12;
    const maxWidth = Math.min(384, Math.max(160, window.innerWidth - margin * 2));
    popover.style.width = `${maxWidth}px`;
    popover.style.maxWidth = `${maxWidth}px`;

    const helpRect = help.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const width = Math.min(popoverRect.width || maxWidth, maxWidth);
    const height = popoverRect.height || 80;
    const preferredLeft = helpRect.left;
    const preferredTop = helpRect.bottom + 8;
    const left = Math.min(
      Math.max(margin, preferredLeft),
      Math.max(margin, window.innerWidth - width - margin)
    );
    let top = preferredTop;
    if (top + height > window.innerHeight - margin) {
      top = helpRect.top - height - 8;
    }
    top = Math.min(
      Math.max(margin, top),
      Math.max(margin, window.innerHeight - height - margin)
    );

    popover.style.setProperty("--option-help-left", `${left}px`);
    popover.style.setProperty("--option-help-top", `${top}px`);
  }

  function flattenOptions(options = []) {
    return options.flatMap((option) => option.type === "group" ? flattenOptions(option.options ?? []) : [option]);
  }

  function flattenOptionNodes(options = []) {
    return options.flatMap((option) => (
      option.type === "group"
        ? [option, ...flattenOptionNodes(option.options ?? [])]
        : [option]
    ));
  }

  function normalizeVisibleWhenConditions(visibleWhen) {
    if (!visibleWhen) {
      return [];
    }
    return Array.isArray(visibleWhen) ? visibleWhen : [visibleWhen];
  }

  function visibleWhenMatches(visibleWhen, optionValues) {
    return normalizeVisibleWhenConditions(visibleWhen).every((condition) => {
      const expectedValues = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      return expectedValues.includes(optionValues[condition.option]);
    });
  }

  function getVisibleWhenOptionIds(visibleWhen) {
    return normalizeVisibleWhenConditions(visibleWhen)
      .map((condition) => condition.option)
      .filter(Boolean);
  }

  function getDefaultOptionValues(options) {
    return Object.fromEntries(
      flattenOptions(options)
        .filter((option) => option.id)
        .map((option) => [option.id, option.defaultValue])
    );
  }

  function getOptionDefaultValue(option, defaultValues) {
    return option.id && Object.hasOwn(defaultValues, option.id)
      ? defaultValues[option.id]
      : option.defaultValue;
  }

  function getOptionControlValue(root, option, fallback = option.defaultValue) {
    if (option.type === "checkbox") {
      return root.querySelector(`#${option.id}, [name="${option.id}"]`)?.checked ?? fallback;
    }
    return (
      root.querySelector(`select[name="${option.id}"]`)?.value ??
      root.querySelector(`input[name="${option.id}"]:checked`)?.value ??
      root.querySelector(`#${option.id}`)?.value ??
      root.querySelector(`[name="${option.id}"]`)?.value ??
      fallback
    );
  }

  function persistLimitOptionControlValue(target) {
    const optionId = target?.name || target?.id;
    if (!optionId) {
      return;
    }
    const option = flattenOptions(state.selectedTool?.metadata.options ?? [])
      .find((candidate) => candidate.id === optionId);
    if (!option) {
      return;
    }
    persistLimitOptionValue(
      state.selectedTool,
      optionId,
      getOptionControlValue(elements.toolOptions, option)
    );
  }

  function getOptionControlValueFromRoots(roots, option, fallback = option.defaultValue) {
    const searchRoots = Array.isArray(roots) ? roots : [roots];
    for (const root of searchRoots) {
      if (!root) {
        continue;
      }
      const value = getOptionControlValue(root, option, undefined);
      if (value !== undefined) {
        return value;
      }
    }
    return fallback;
  }

  function getCurrentOptionValues(root, options) {
    return Object.fromEntries(
      flattenOptions(options)
        .filter((option) => option.id)
        .map((option) => [option.id, getOptionControlValueFromRoots(root, option)])
    );
  }

  function getFilteredChoices(option, optionValues) {
    const choices = option.choices ?? [];
    if (!option.dependsOn) {
      return choices;
    }
    const parentValue = optionValues[option.dependsOn];
    if (!parentValue || parentValue === "all") {
      return choices;
    }
    return choices.filter((choice) =>
      choice.always ||
      (choice.value === option.defaultValue && !choice.dependsOnValue) ||
      (Array.isArray(choice.dependsOnValue)
        ? choice.dependsOnValue.includes(parentValue)
        : choice.dependsOnValue === parentValue)
    );
  }

  function populateDependentSelect(select, option, optionValues, preferredValue) {
    const choices = getFilteredChoices(option, optionValues);
    select.textContent = "";
    for (const choice of choices) {
      const choiceOption = document.createElement("option");
      choiceOption.value = choice.value;
      choiceOption.textContent = choice.label;
      select.append(choiceOption);
    }
    const fallback = choices.some((choice) => choice.value === option.defaultValue)
      ? option.defaultValue
      : choices[0]?.value ?? "";
    select.value = choices.some((choice) => choice.value === preferredValue) ? preferredValue : fallback;
  }

  function normalizeDependentOptionValues(options, optionValues) {
    const normalized = { ...optionValues };
    for (const option of options) {
      if (!option.dependsOn) {
        continue;
      }
      const choices = getFilteredChoices(option, normalized);
      if (!choices.some((choice) => choice.value === normalized[option.id])) {
        normalized[option.id] = option.defaultValue;
      }
    }
    return normalized;
  }

  function wireDependentToolOptions(options) {
    const allOptions = flattenOptionNodes(options);
    const flatOptions = flattenOptions(options);
    const dependentOptions = flatOptions.filter((option) => option.dependsOn);
    const visibilityOptions = allOptions.filter((option) => option.visibleWhen);
    if (dependentOptions.length === 0 && visibilityOptions.length === 0) {
      return;
    }

    function refreshDynamicOptions() {
      const roots = [elements.toolOptions, elements.inputPanel];
      const optionValues = getCurrentOptionValues(roots, flatOptions);
      for (const option of dependentOptions) {
        const select = roots
          .map((root) => root?.querySelector(`select[name="${option.id}"]`))
          .find(Boolean);
        if (!select) {
          continue;
        }
        populateDependentSelect(select, option, optionValues, select.value);
        optionValues[option.id] = select.value;
      }
      for (const option of visibilityOptions) {
        const rows = roots.flatMap((root) =>
          root ? [...root.querySelectorAll(`[data-option-id="${option.id}"]`)] : []
        );
        for (const row of rows) {
          row.hidden = !visibleWhenMatches(option.visibleWhen, optionValues);
        }
      }
    }

    const visibilityParentIds = new Set(
      visibilityOptions.flatMap((option) => getVisibleWhenOptionIds(option.visibleWhen))
    );

    for (const option of flatOptions) {
      if (
        dependentOptions.some((dependent) => dependent.dependsOn === option.id) ||
        visibilityParentIds.has(option.id)
      ) {
        for (const root of [elements.toolOptions, elements.inputPanel]) {
          root
            ?.querySelectorAll(`select[name="${option.id}"], input[name="${option.id}"]`)
            .forEach((control) => control.addEventListener("change", refreshDynamicOptions));
        }
      }
    }
    refreshDynamicOptions();
  }

  return {
    renderToolOptions,
    shouldAppendGeneratedLimitDisclosure,
    isTopLevelToolLimitGroup,
    optionTreeIncludesId,
    createGeneratedLimitDisclosure,
    getSuggestionSourcesForOptions,
    shouldRenderToolOption,
    getSuggestionListId,
    serializeRuleListControl,
    serializeValueListControl,
    parseRuleListValue,
    parseValueListValue,
    appendValueListRow,
    appendValueListControl,
    appendRuleListRow,
    appendRuleListControl,
    appendToolOptionControl,
    appendOptionReferenceTable,
    updateFileOptionStatus,
    setFileOptionFiles,
    createOptionLabelContent,
    positionOptionHelpPopover,
    flattenOptions,
    flattenOptionNodes,
    normalizeVisibleWhenConditions,
    visibleWhenMatches,
    getVisibleWhenOptionIds,
    getDefaultOptionValues,
    getOptionDefaultValue,
    getOptionControlValue,
    getOptionControlValueFromRoots,
    persistLimitOptionControlValue,
    getCurrentOptionValues,
    getFilteredChoices,
    populateDependentSelect,
    normalizeDependentOptionValues,
    wireDependentToolOptions
  };
}
