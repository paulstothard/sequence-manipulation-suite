import { geneticCodes, getCodonsForCode } from "../core/genetic-code.js";
import { complementDnaRnaSequence } from "../core/sequence.js";
import { restrictionEnzymeRecords } from "../reference-data/restriction-enzymes/records.js";
import { compareToolCategories } from "../tools/categories.js";
import { appendShowcase as appendGeneratedShowcase } from "./showcase-page.js";
import { getRestrictionOverhangLabel } from "./reference-page-data.js";

const CODON_BASE_ORDER = ["T", "C", "A", "G"];

export const smsCitationGuidance = {
  citationText:
    "Stothard P. The sequence manipulation suite: JavaScript programs for analyzing and formatting protein and DNA sequences. Biotechniques. 2000 Jun;28(6):1102, 1104. doi: 10.2144/00286ir01.",
  citationFormats: [
    {
      id: "nlm",
      label: "NLM",
      text: "Stothard P. The sequence manipulation suite: JavaScript programs for analyzing and formatting protein and DNA sequences. Biotechniques. 2000 Jun;28(6):1102, 1104. doi: 10.2144/00286ir01."
    },
    {
      id: "ama",
      label: "AMA",
      text: "Stothard P. The sequence manipulation suite: JavaScript programs for analyzing and formatting protein and DNA sequences. Biotechniques. 2000;28(6):1102-1104. doi:10.2144/00286ir01"
    },
    {
      id: "apa",
      label: "APA",
      text: "Stothard P. (2000). The sequence manipulation suite: JavaScript programs for analyzing and formatting protein and DNA sequences. BioTechniques, 28(6), 1102-1104. https://doi.org/10.2144/00286ir01"
    },
    {
      id: "mla",
      label: "MLA",
      text: "Stothard, P. \"The sequence manipulation suite: JavaScript programs for analyzing and formatting protein and DNA sequences.\" BioTechniques vol. 28,6 (2000): 1102, 1104. doi:10.2144/00286ir01"
    }
  ],
  bibtex: `@article{Stothard_2000,
  author = {Stothard, Paul},
  title = {{The Sequence Manipulation Suite: JavaScript Programs for Analyzing and Formatting Protein and DNA Sequences}},
  journal = {BioTechniques},
  publisher = {Informa UK Limited},
  volume = {28},
  number = {6},
  pages = {1102, 1104},
  year = {2000},
  month = {June},
  doi = {10.2144/00286ir01},
  url = {https://doi.org/10.2144/00286ir01},
  issn = {1940-9818}
}`
};

export function createReferencePageController({
  aminoAcidNames,
  container,
  elements,
  flattenOptions,
  getDefaultOptionValues,
  referenceTopics,
  renderCircularDnaViewer,
  renderDnaViewer,
  renderGenomeFigure,
  renderProteinStructureViewer,
  renderProteinViewer,
  runTool,
  selectTool,
  state,
  tools
}) {
  function appendReferenceTable(topic, parent = elements.selectedReferenceBody) {
    const searchable = topic.searchable === true || typeof topic.searchable === "object";
    const searchConfig = typeof topic.searchable === "object" ? topic.searchable : {};
    let searchInput = null;
    let count = null;
    if (searchable) {
      const controls = document.createElement("div");
      controls.className = "reference-table-toolbar";
      const label = document.createElement("label");
      label.className = "reference-search-label";
      label.textContent = searchConfig.label ?? "Search table";
      searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.className = "search-input";
      searchInput.placeholder = searchConfig.placeholder ?? "Search rows";
      searchInput.autocomplete = "off";
      searchInput.spellcheck = false;
      label.append(searchInput);
      count = document.createElement("span");
      count.className = "reference-filter-count";
      count.setAttribute("aria-live", "polite");
      controls.append(label, count);
      parent.append(controls);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "reference-table-wrap";
    const table = document.createElement("table");
    table.className = "reference-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const column of topic.columns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = column;
      headerRow.append(th);
    }
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const row of topic.rows) {
      const tr = document.createElement("tr");
      if (searchable) {
        tr.dataset.referenceRow = "";
        tr.dataset.searchText = row.join(" ").toLowerCase();
      }
      for (const cell of row) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.append(td);
      }
      tbody.append(tr);
    }
    let emptyRow = null;
    if (searchable) {
      emptyRow = document.createElement("tr");
      emptyRow.className = "reference-table-empty-row";
      emptyRow.hidden = true;
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = topic.columns.length;
      emptyCell.textContent = searchConfig.emptyMessage ?? "No rows match the current search.";
      emptyRow.append(emptyCell);
      tbody.append(emptyRow);
    }
    table.append(tbody);
    wrapper.append(table);
    parent.append(wrapper);

    if (searchable && searchInput && count && emptyRow) {
      const rows = Array.from(tbody.querySelectorAll("[data-reference-row]"));
      const noun = searchConfig.rowNoun ?? "row";
      const updateFilter = () => {
        const tokens = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let visibleCount = 0;
        for (const row of rows) {
          const text = row.dataset.searchText ?? "";
          const visible = tokens.every((token) => text.includes(token));
          row.hidden = !visible;
          if (visible) visibleCount += 1;
        }
        emptyRow.hidden = visibleCount !== 0;
        const nounLabel = rows.length === 1 ? noun : (searchConfig.rowPlural ?? `${noun}s`);
        count.textContent = `${visibleCount.toLocaleString()} of ${rows.length.toLocaleString()} ${nounLabel}`;
      };
      searchInput.addEventListener("input", updateFilter);
      updateFilter();
    }
  }

  function makeToolSummarySearchText(record) {
    return [
      record.name,
      record.summary,
      record.whenToUse,
      record.inputLabel,
      record.acceptedInputs,
      record.outputLabel,
      record.producedOutputs,
      record.tableOutputs,
      record.limits,
      record.optionNotes,
      record.metadataCheck,
      record.category,
      ...(record.tags ?? []),
      record.toolId,
      record.directLink
    ].join(" ").toLowerCase();
  }

  function appendToolSummaryField(parent, label, value, options = {}) {
    const field = document.createElement("div");
    field.className = `tool-summary-field${options.wide ? " wide" : ""}${options.monospace ? " monospace" : ""}`;

    const body = document.createElement("span");
    body.className = `tool-summary-field-value${options.hideLabel ? " no-label" : ""}`;
    body.textContent = value || "None";

    if (!options.hideLabel) {
      const heading = document.createElement("span");
      heading.className = "tool-summary-field-label";
      heading.textContent = label;
      field.append(heading);
    }
    field.append(body);
    parent.append(field);
  }

  function splitToolSummaryValues(value, { maxItems = 5 } = {}) {
    const text = String(value ?? "").trim();
    if (!text || text === "None" || text === "Not specified") {
      return [];
    }
    const values = text
      .split(/\s*;\s*/)
      .flatMap((part) => part.split(/\s*,\s*(?:or\s+)?(?=(?:optional|local|indexed|summary|table|viewer|report|warnings|alignment|coverage|region|sequence|[A-Z0-9/.-]+)(?:\s|$))/i))
      .flatMap((part) => part.split(/\s+\bor\b\s+(?=(?:optional|local|indexed|[A-Z0-9/.-]+)(?:\s|$))/i))
      .flatMap((part) => part.split(/\s+\bplus\b\s+(?=(?:optional|local|indexed|[A-Z0-9/.-]+)(?:\s|$))/i))
      .flatMap((part) => part.split(/\s+\band\b\s+(?=(?:optional|reference|local|indexed|[A-Z0-9/.-]+)(?:\s|$))/i))
      .map((part) => part.replace(/^or\s+/i, "").replace(/,$/, "").trim())
      .filter(Boolean);
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length <= maxItems) {
      return uniqueValues;
    }
    return [...uniqueValues.slice(0, maxItems), `+${uniqueValues.length - maxItems} more`];
  }

  function appendToolSummaryChips(parent, label, values, { subtle = false } = {}) {
    const row = document.createElement("div");
    row.className = `tool-summary-chip-row${subtle ? " subtle" : ""}`;
    const rowLabel = document.createElement("span");
    rowLabel.className = "tool-summary-chip-row-label";
    rowLabel.textContent = label;
    row.append(rowLabel);
    const chipValues = values.length > 0 ? values : ["None"];
    for (const value of chipValues) {
      const chip = document.createElement("span");
      chip.className = "tool-summary-chip";
      chip.textContent = value;
      row.append(chip);
    }
    parent.append(row);
  }

  function appendToolSummaryTags(parent, tags = [], { maxItems = Infinity } = {}) {
    if (!tags.length) {
      return;
    }
    const values = tags.length > maxItems
      ? [...tags.slice(0, maxItems), `+${tags.length - maxItems} more`]
      : tags;
    appendToolSummaryChips(parent, "Tags", values, { subtle: true });
  }

  function appendToolSummaryDetailsText(parent, title, value) {
    const text = String(value ?? "").trim();
    if (!text || text === "None" || text === "Not specified") {
      return;
    }
    const section = document.createElement("section");
    section.className = "tool-summary-card-section";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.className = "tool-summary-detail-text";
    paragraph.textContent = text;
    section.append(heading, paragraph);
    parent.append(section);
  }

  function appendToolSummaryDetailsList(parent, title, values) {
    const items = values.filter((value) => value && value !== "None" && value !== "Not specified");
    if (!items.length) {
      return;
    }
    const section = document.createElement("section");
    section.className = "tool-summary-card-section";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const list = document.createElement("ul");
    list.className = "tool-summary-detail-list";
    for (const value of items) {
      const item = document.createElement("li");
      item.textContent = value;
      list.append(item);
    }
    section.append(heading, list);
    parent.append(section);
  }

  function makeToolSummaryCard(record) {
    const card = document.createElement("article");
    card.className = "tool-summary-card";
    card.dataset.toolSummaryCard = "";
    card.dataset.searchText = makeToolSummarySearchText(record);

    const header = document.createElement("div");
    header.className = "tool-summary-card-header";

    const titleBlock = document.createElement("div");
    titleBlock.className = "tool-summary-title-block";
    const title = document.createElement("h3");
    title.textContent = record.name;
    const directLink = document.createElement("a");
    directLink.className = "tool-summary-direct-link";
    directLink.href = record.directLink;
    directLink.textContent = record.directLink;
    titleBlock.append(title, directLink);

    header.append(titleBlock);
    if (record.metadataCheck !== "OK") {
      const metadataCheck = document.createElement("span");
      metadataCheck.className = "tool-summary-status warning";
      metadataCheck.textContent = record.metadataCheck;
      header.append(metadataCheck);
    }
    card.append(header);

    const summary = document.createElement("p");
    summary.className = "tool-summary-card-summary";
    summary.textContent = record.summary;
    card.append(summary);

    const compact = document.createElement("div");
    compact.className = "tool-summary-compact";
    appendToolSummaryChips(compact, "Inputs", splitToolSummaryValues(record.inputLabel || record.acceptedInputs));
    appendToolSummaryChips(compact, "Outputs", splitToolSummaryValues(record.producedOutputs || record.outputLabel));
    appendToolSummaryTags(compact, record.tags ?? []);
    card.append(compact);

    const actions = document.createElement("div");
    actions.className = "tool-summary-actions";
    const openTool = document.createElement("a");
    openTool.className = "tool-summary-open-link";
    openTool.href = record.directLink;
    openTool.textContent = "Open tool";

    const details = document.createElement("details");
    details.className = "tool-summary-details";
    const detailsPanelId = `tool-summary-details-${record.toolId}`;
    const detailsSummary = document.createElement("summary");
    detailsSummary.setAttribute("aria-controls", detailsPanelId);
    const detailsClosed = document.createElement("span");
    detailsClosed.className = "tool-summary-details-closed";
    detailsClosed.textContent = "Details ▾";
    const detailsOpen = document.createElement("span");
    detailsOpen.className = "tool-summary-details-open";
    detailsOpen.textContent = "Hide details ▴";
    detailsSummary.append(detailsClosed, detailsOpen);
    details.append(detailsSummary);
    actions.append(openTool, details);
    card.append(actions);

    const detailBody = document.createElement("div");
    detailBody.className = "tool-summary-details-body";
    detailBody.id = detailsPanelId;
    detailBody.hidden = true;
    details.addEventListener("toggle", () => {
      detailBody.hidden = !details.open;
    });

    const detailHeading = document.createElement("h4");
    detailHeading.className = "tool-summary-details-heading";
    detailHeading.textContent = "Details";
    detailBody.append(detailHeading);

    appendToolSummaryDetailsText(detailBody, "When to use", record.whenToUse);
    appendToolSummaryDetailsList(detailBody, "Inputs", splitToolSummaryValues(record.inputLabel || record.acceptedInputs, { maxItems: Infinity }));
    appendToolSummaryDetailsList(detailBody, "Outputs", splitToolSummaryValues(record.producedOutputs || record.outputLabel, { maxItems: Infinity }));
    appendToolSummaryDetailsList(detailBody, "Table outputs", splitToolSummaryValues(record.tableOutputs, { maxItems: Infinity }));
    appendToolSummaryDetailsText(detailBody, "Limits", record.limits);
    appendToolSummaryDetailsText(detailBody, "Notes", record.optionNotes);

    const discovery = document.createElement("section");
    discovery.className = "tool-summary-card-section tool-summary-card-discovery";
    const discoveryHeading = document.createElement("h4");
    discoveryHeading.textContent = "Technical details";
    discovery.append(discoveryHeading);

    const discoveryGrid = document.createElement("div");
    discoveryGrid.className = "tool-summary-field-grid";
    appendToolSummaryField(discoveryGrid, "Category", record.category);
    appendToolSummaryField(discoveryGrid, "Tool ID", record.toolId, { monospace: true });
    appendToolSummaryField(discoveryGrid, "Direct link", record.directLink, { monospace: true });
    appendToolSummaryField(discoveryGrid, "Metadata check", record.metadataCheck, { wide: true });
    discovery.append(discoveryGrid);

    if ((record.tags ?? []).length > 0) {
      const tags = document.createElement("div");
      tags.className = "tool-summary-tags";
      const tagLabel = document.createElement("span");
      tagLabel.className = "tool-summary-field-label";
      tagLabel.textContent = "Tags";
      tags.append(tagLabel);
      for (const tag of record.tags) {
        const chip = document.createElement("span");
        chip.className = "tool-summary-tag";
        chip.textContent = tag;
        tags.append(chip);
      }
      discovery.append(tags);
    }

    detailBody.append(discovery);
    card.append(detailBody);
    return card;
  }

  function appendToolSummary(topic) {
    const records = topic.records ?? [];

    const controls = document.createElement("div");
    controls.className = "reference-table-toolbar tool-summary-toolbar";
    const label = document.createElement("label");
    label.className = "reference-search-label";
    label.textContent = "Search tools";
    const input = document.createElement("input");
    input.type = "search";
    input.className = "search-input";
    input.placeholder = "Tool name, category, tag, input, output, or ID";
    input.autocomplete = "off";
    input.spellcheck = false;
    label.append(input);
    const count = document.createElement("span");
    count.className = "reference-filter-count tool-summary-filter-count";
    count.setAttribute("aria-live", "polite");
    controls.append(label, count);
    elements.selectedReferenceBody.append(controls);

    const sectionWrap = document.createElement("div");
    sectionWrap.className = "tool-summary-sections";
    const sectionsByCategory = new Map();

    for (const record of records) {
      if (!sectionsByCategory.has(record.category)) {
        const section = document.createElement("section");
        section.className = "tool-summary-section";
        section.dataset.toolSummarySection = "";
        const header = document.createElement("div");
        header.className = "tool-summary-section-header";
        const heading = document.createElement("h2");
        heading.textContent = record.category;
        const sectionCount = document.createElement("span");
        sectionCount.className = "tool-summary-section-count";
        sectionCount.setAttribute("aria-live", "polite");
        header.append(heading, sectionCount);
        const grid = document.createElement("div");
        grid.className = "tool-summary-grid";
        section.append(header, grid);
        sectionWrap.append(section);
        sectionsByCategory.set(record.category, { section, grid, sectionCount });
      }
      sectionsByCategory.get(record.category).grid.append(makeToolSummaryCard(record));
    }

    const empty = document.createElement("p");
    empty.className = "tool-summary-empty";
    empty.hidden = true;
    empty.textContent = "No tools match the current search.";

    elements.selectedReferenceBody.append(sectionWrap, empty);

    const cards = Array.from(sectionWrap.querySelectorAll("[data-tool-summary-card]"));
    const sections = Array.from(sectionsByCategory.values());
    const updateFilter = () => {
      const tokens = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let visibleTotal = 0;
      for (const card of cards) {
        const text = card.dataset.searchText ?? "";
        const visible = tokens.every((token) => text.includes(token));
        card.hidden = !visible;
        if (visible) visibleTotal += 1;
      }
      for (const { section, sectionCount } of sections) {
        const visibleInSection = Array.from(section.querySelectorAll("[data-tool-summary-card]"))
          .filter((card) => !card.hidden).length;
        section.hidden = visibleInSection === 0;
        sectionCount.textContent = `${visibleInSection.toLocaleString()} tools`;
      }
      empty.hidden = visibleTotal !== 0;
      count.textContent = `${visibleTotal.toLocaleString()} of ${cards.length.toLocaleString()} tools`;
    };
    input.addEventListener("input", updateFilter);
    updateFilter();

    appendTopicNotesAndCitations(topic);
  }

  function makeRestrictionCutDiagram(enzyme) {
    const recognition = String(enzyme.recognition ?? "").toUpperCase();
    const complement = complementDnaRnaSequence(recognition, { preserveCase: false });
    const cutTop = Number.parseInt(enzyme.cutTop, 10);
    const cutBottom = Number.parseInt(enzyme.cutBottom, 10);
    const left = Math.min(cutTop, cutBottom);
    const right = Math.max(cutTop, cutBottom);
    const hasOverhang = right > left;
    const diagram = document.createElement("div");
    diagram.className = "restriction-cut-diagram";
    diagram.style.setProperty("--site-length", String(Math.max(1, recognition.length)));
    diagram.style.setProperty("--top-cut", String(Number.isFinite(cutTop) ? cutTop : 0));
    diagram.style.setProperty("--bottom-cut", String(Number.isFinite(cutBottom) ? cutBottom : 0));
    diagram.setAttribute(
      "aria-label",
      `${enzyme.name} recognition site ${recognition}; top strand cut after ${cutTop}; bottom strand cut after ${cutBottom}.`
    );

    const makeStrand = (sequence, startLabel, endLabel, strandClass) => {
      const row = document.createElement("div");
      row.className = `restriction-cut-strand ${strandClass}`;

      const start = document.createElement("span");
      start.className = "restriction-strand-end";
      start.textContent = startLabel;
      row.append(start);

      const bases = document.createElement("span");
      bases.className = "restriction-bases";
      bases.setAttribute("aria-hidden", "true");
      for (const [index, base] of Array.from(sequence).entries()) {
        const span = document.createElement("span");
        span.className = hasOverhang && index >= left && index < right
          ? "restriction-base overhang-region"
          : "restriction-base";
        span.textContent = base;
        bases.append(span);
      }
      const marker = document.createElement("span");
      marker.className = `restriction-cut-marker ${strandClass}`;
      bases.append(marker);
      row.append(bases);

      const end = document.createElement("span");
      end.className = "restriction-strand-end";
      end.textContent = endLabel;
      row.append(end);
      return row;
    };

    diagram.append(
      makeStrand(recognition, "5'", "3'", "top"),
      makeStrand(complement, "3'", "5'", "bottom")
    );
    return diagram;
  }

  function appendRestrictionEnzymeReference(topic) {
    const controls = document.createElement("div");
    controls.className = "reference-table-toolbar";
    const label = document.createElement("label");
    label.className = "reference-search-label";
    label.textContent = "Search enzymes";
    const input = document.createElement("input");
    input.type = "search";
    input.className = "search-input";
    input.placeholder = "Name, recognition sequence, overhang, source, or cut offset";
    input.autocomplete = "off";
    input.spellcheck = false;
    label.append(input);
    const count = document.createElement("span");
    count.className = "reference-filter-count";
    count.setAttribute("aria-live", "polite");
    controls.append(label, count);
    elements.selectedReferenceBody.append(controls);

    const wrapper = document.createElement("div");
    wrapper.className = "reference-table-wrap restriction-reference-table-wrap";
    const table = document.createElement("table");
    table.className = "reference-table restriction-reference-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const column of ["Name", "Recognition and cut sites", "Cut offsets", "Overhang", "Source"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = column;
      headerRow.append(th);
    }
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const enzyme of restrictionEnzymeRecords) {
      const row = document.createElement("tr");
      row.dataset.restrictionEnzymeRow = "";
      row.dataset.searchText = [
        enzyme.name,
        enzyme.id,
        enzyme.recognition,
        enzyme.cutTop,
        enzyme.cutBottom,
        enzyme.overhang,
        getRestrictionOverhangLabel(enzyme.overhang),
        enzyme.source
      ].join(" ").toLowerCase();

      const name = document.createElement("td");
      name.className = "restriction-enzyme-name-cell";
      name.textContent = enzyme.name;

      const recognition = document.createElement("td");
      recognition.className = "restriction-recognition-cell";
      recognition.append(makeRestrictionCutDiagram(enzyme));
      const raw = document.createElement("span");
      raw.className = "restriction-recognition-raw";
      raw.textContent = enzyme.recognition;
      recognition.append(raw);

      const cuts = document.createElement("td");
      cuts.className = "restriction-cut-offsets";
      cuts.textContent = `top ${enzyme.cutTop}; bottom ${enzyme.cutBottom}`;

      const overhang = document.createElement("td");
      overhang.textContent = getRestrictionOverhangLabel(enzyme.overhang);

      const source = document.createElement("td");
      source.textContent = enzyme.source;

      row.append(name, recognition, cuts, overhang, source);
      tbody.append(row);
    }

    const emptyRow = document.createElement("tr");
    emptyRow.className = "reference-table-empty-row";
    emptyRow.hidden = true;
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 5;
    emptyCell.textContent = "No restriction enzymes match the current search.";
    emptyRow.append(emptyCell);
    tbody.append(emptyRow);

    table.append(tbody);
    wrapper.append(table);
    elements.selectedReferenceBody.append(wrapper);

    const rows = Array.from(tbody.querySelectorAll("[data-restriction-enzyme-row]"));
    const updateFilter = () => {
      const tokens = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let visibleCount = 0;
      for (const row of rows) {
        const text = row.dataset.searchText ?? "";
        const visible = tokens.every((token) => text.includes(token));
        row.hidden = !visible;
        if (visible) visibleCount += 1;
      }
      emptyRow.hidden = visibleCount !== 0;
      count.textContent = `${visibleCount.toLocaleString()} of ${rows.length.toLocaleString()} enzymes`;
    };
    input.addEventListener("input", updateFilter);
    updateFilter();
    appendTopicNotesAndCitations(topic);
  }

  function getAminoAcidHighlightOptions(codons) {
    const present = new Set(codons.map((item) => item.aa));
    const ordered = "ACDEFGHIKLMNPQRSTVWYBJOUXZ".split("").filter((aa) => present.has(aa));
    if (present.has("*")) {
      ordered.push("*");
    }
    return ordered;
  }

  function makeCodonEntry(item, selectedAminoAcid = "all", selectedCodon = "all") {
    const entry = document.createElement("div");
    const classes = ["codon-cell"];
    const isSelectedCodon = selectedCodon !== "all" && item.codon === selectedCodon;
    if (item.isStop) {
      classes.push("stop");
    } else if (item.isStart) {
      classes.push("start");
    }
    if (isSelectedCodon) {
      classes.push("highlight", "codon-highlight");
    } else if (selectedCodon !== "all") {
      classes.push("dimmed");
    } else if (selectedAminoAcid !== "all") {
      classes.push(item.aa === selectedAminoAcid ? "highlight" : "dimmed");
    }
    entry.className = classes.join(" ");
    entry.title = `${item.codon}: ${aminoAcidNames.get(item.aa) ?? "Termination"}`;

    const codon = document.createElement("span");
    codon.className = "codon-triplet";
    codon.textContent = item.codon;

    const aa = document.createElement("span");
    aa.className = "codon-aa";
    aa.textContent = item.aa;

    entry.append(codon, aa);

    if (item.isStart || item.isStop) {
      const marker = document.createElement("span");
      marker.className = "codon-marker";
      marker.textContent = item.isStop ? "Stop" : "Start";
      entry.append(marker);
    }

    return entry;
  }

  function makeCodonBaseLabel(label) {
    const item = document.createElement("div");
    item.className = "codon-axis-label";
    item.textContent = label;
    return item;
  }

  function makeCodonFamilyPanel(firstBase, codonLookup, selectedAminoAcid, selectedCodon) {
    const panel = document.createElement("section");
    panel.className = "codon-family-panel";
    panel.dataset.codonFirstBase = firstBase;

    const heading = document.createElement("h3");
    heading.className = "codon-family-heading";
    heading.textContent = `First base ${firstBase}`;
    panel.append(heading);

    const matrix = document.createElement("div");
    matrix.className = "codon-family-matrix";
    matrix.append(makeCodonBaseLabel(""));
    for (const secondBase of CODON_BASE_ORDER) {
      matrix.append(makeCodonBaseLabel(`2nd ${secondBase}`));
    }

    for (const thirdBase of CODON_BASE_ORDER) {
      matrix.append(makeCodonBaseLabel(`3rd ${thirdBase}`));
      for (const secondBase of CODON_BASE_ORDER) {
        const codon = `${firstBase}${secondBase}${thirdBase}`;
        const item = codonLookup.get(codon);
        if (item) {
          matrix.append(makeCodonEntry(item, selectedAminoAcid, selectedCodon));
        }
      }
    }
    panel.append(matrix);
    return panel;
  }

  function makeStat(label, value) {
    const item = document.createElement("div");
    item.className = "reference-stat";
    const title = document.createElement("span");
    title.textContent = label;
    const detail = document.createElement("strong");
    detail.textContent = value || "None";
    item.append(title, detail);
    return item;
  }

  function formatCodonDifference(item) {
    const labels = [item.aa];
    if (item.isStart) {
      labels.push("start");
    }
    if (item.isStop) {
      labels.push("stop");
    }
    return labels.join(", ");
  }

  function appendGeneticCodeViewer(topic) {
    const selectedCode = geneticCodes.find((code) => code.id === state.selectedGeneticCode) ?? geneticCodes[0];
    const standardCode = geneticCodes[0];
    const selectedCodons = getCodonsForCode(selectedCode);
    const standardCodons = getCodonsForCode(standardCode);

    const controls = document.createElement("div");
    controls.className = "reference-controls genetic-code-controls";

    const label = document.createElement("label");
    label.className = "select-row";
    label.textContent = "NCBI genetic code";

    const select = document.createElement("select");
    for (const code of geneticCodes) {
      const option = document.createElement("option");
      option.value = code.id;
      option.textContent = `${code.id}. ${code.name}`;
      select.append(option);
    }
    select.value = selectedCode.id;
    select.addEventListener("change", () => {
      state.selectedGeneticCode = select.value;
      state.selectedGeneticCodeAminoAcid = "all";
      state.selectedGeneticCodeCodon = "all";
      renderSelectedReference();
    });
    label.append(select);
    controls.append(label);

    const aminoAcidLabel = document.createElement("label");
    aminoAcidLabel.className = "select-row";
    aminoAcidLabel.textContent = "Highlight amino acid";

    const aminoAcidSelect = document.createElement("select");
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All codons";
    aminoAcidSelect.append(allOption);

    for (const aa of getAminoAcidHighlightOptions(selectedCodons)) {
      const option = document.createElement("option");
      option.value = aa;
      option.textContent = `${aa} - ${aminoAcidNames.get(aa) ?? "Termination"}`;
      aminoAcidSelect.append(option);
    }

    aminoAcidSelect.value = state.selectedGeneticCodeAminoAcid;
    aminoAcidSelect.addEventListener("change", () => {
      state.selectedGeneticCodeAminoAcid = aminoAcidSelect.value;
      renderSelectedReference();
    });
    aminoAcidLabel.append(aminoAcidSelect);
    controls.append(aminoAcidLabel);

    const codonLabel = document.createElement("label");
    codonLabel.className = "select-row";
    codonLabel.textContent = "Highlight codon";

    const codonSelect = document.createElement("select");
    const allCodonOption = document.createElement("option");
    allCodonOption.value = "all";
    allCodonOption.textContent = "All codons";
    codonSelect.append(allCodonOption);

    for (const codon of selectedCodons.map((item) => item.codon).sort()) {
      const option = document.createElement("option");
      option.value = codon;
      option.textContent = codon;
      codonSelect.append(option);
    }

    codonSelect.value = state.selectedGeneticCodeCodon;
    codonSelect.addEventListener("change", () => {
      state.selectedGeneticCodeCodon = codonSelect.value;
      renderSelectedReference();
    });
    codonLabel.append(codonSelect);
    controls.append(codonLabel);
    elements.selectedReferenceBody.append(controls);

    const stats = document.createElement("div");
    stats.className = "reference-stats genetic-code-stats";
    stats.append(makeStat("Stops", selectedCodons.filter((item) => item.isStop).map((item) => item.codon).join(", ")));
    stats.append(makeStat("Starts", selectedCodons.filter((item) => item.isStart).map((item) => item.codon).join(", ")));
    elements.selectedReferenceBody.append(stats);

    const grid = document.createElement("div");
    grid.className = "codon-grid";
    const codonLookup = new Map(selectedCodons.map((item) => [item.codon, item]));
    for (const firstBase of CODON_BASE_ORDER) {
      grid.append(makeCodonFamilyPanel(
        firstBase,
        codonLookup,
        state.selectedGeneticCodeAminoAcid,
        state.selectedGeneticCodeCodon
      ));
    }
    elements.selectedReferenceBody.append(grid);

    const differences = selectedCodons
      .map((item, index) => ({ item, standard: standardCodons[index] }))
      .filter(({ item, standard }) => item.aa !== standard.aa || item.isStart !== standard.isStart);

    const differenceSection = document.createElement("section");
    differenceSection.className = "reference-subsection";
    const heading = document.createElement("h3");
    heading.textContent = "Differences From Standard Code";
    differenceSection.append(heading);

    if (differences.length === 0) {
      const none = document.createElement("p");
      none.className = "summary";
      none.textContent = "No codon assignment or start-codon differences.";
      differenceSection.append(none);
    } else {
      const differenceTopic = {
        columns: ["Codon", `${selectedCode.id}. ${selectedCode.name}`, "Standard"],
        rows: differences.map(({ item, standard }) => [
          item.codon,
          formatCodonDifference(item),
          formatCodonDifference(standard)
        ])
      };
      appendReferenceTable(differenceTopic, differenceSection);
    }
    elements.selectedReferenceBody.append(differenceSection);

    appendTopicNotesAndCitations(topic);
  }

  function appendCitationGuidance(topic) {
    const formatCard = document.createElement("section");
    formatCard.className = "citation-format-card";

    const formatHeader = document.createElement("div");
    formatHeader.className = "citation-format-header";
    const formatHeading = document.createElement("h3");
    formatHeading.textContent = "Citation";
    const formatTools = document.createElement("div");
    formatTools.className = "citation-format-tools";
    const formatControls = document.createElement("label");
    formatControls.className = "citation-format-select";
    formatControls.append("Format");
    const formatSelect = document.createElement("select");
    const copyFormats = [
      ...smsCitationGuidance.citationFormats,
      { id: "bibtex", label: "BibTeX", text: smsCitationGuidance.bibtex }
    ];
    for (const format of copyFormats) {
      const option = document.createElement("option");
      option.value = format.id;
      option.textContent = format.label;
      formatSelect.append(option);
    }
    formatControls.append(formatSelect);
    formatTools.append(formatControls);
    formatHeader.append(formatHeading, formatTools);

    const formattedCitation = document.createElement("textarea");
    formattedCitation.className = "citation-format-output";
    formattedCitation.readOnly = true;
    formattedCitation.spellcheck = false;

    const outputActions = document.createElement("div");
    outputActions.className = "citation-output-actions";
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "citation-copy-button";
    copyButton.textContent = "Copy citation";
    copyButton.title = "Copy selected citation";
    copyButton.setAttribute("aria-label", "Copy selected citation");
    const copyStatus = document.createElement("span");
    copyStatus.className = "citation-copy-status";
    copyStatus.setAttribute("aria-live", "polite");
    outputActions.append(copyButton, copyStatus);

    const updateFormat = () => {
      const selected = copyFormats.find((format) => format.id === formatSelect.value) ?? copyFormats[0];
      formattedCitation.value = selected?.text ?? "";
      formattedCitation.classList.toggle("citation-format-output-bibtex", selected?.id === "bibtex");
      copyButton.textContent = selected?.id === "bibtex" ? "Copy BibTeX" : "Copy citation";
      copyButton.title = selected?.id === "bibtex" ? "Copy BibTeX" : "Copy selected citation";
      copyButton.setAttribute(
        "aria-label",
        selected?.id === "bibtex" ? "Copy BibTeX" : "Copy selected citation"
      );
      copyStatus.textContent = "";
    };

    formatSelect.addEventListener("change", updateFormat);
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(formattedCitation.value);
        copyStatus.textContent = "Copied";
      } catch {
        copyStatus.textContent = "Copy unavailable";
      }
    });

    updateFormat();
    formatCard.append(formatHeader, formattedCitation, outputActions);
    elements.selectedReferenceBody.append(formatCard);
  }

  function appendTopicNotesAndCitations(topic) {
    if (topic.notes.length > 0) {
      const list = document.createElement("ul");
      list.className = "reference-notes";
      for (const note of topic.notes) {
        const item = document.createElement("li");
        item.textContent = note;
        list.append(item);
      }
      elements.selectedReferenceBody.append(list);
    }

    if (topic.citations.length > 0) {
      const citations = document.createElement("p");
      citations.className = "reference-citations";
      citations.append("Sources: ");
      topic.citations.forEach((citation, index) => {
        if (index > 0) {
          citations.append("; ");
        }
        const link = document.createElement("a");
        link.href = citation.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = citation.label;
        citations.append(link);
      });
      elements.selectedReferenceBody.append(citations);
    }
  }

  function renderSelectedReference() {
    const topic =
      referenceTopics.find((item) => item.id === state.selectedReference) ?? referenceTopics[0];
    elements.selectedReferenceTitle.textContent = topic.title;
    elements.selectedReferenceBody.textContent = "";

    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = topic.summary;
    elements.selectedReferenceBody.append(summary);

    if (topic.interactive === "genetic-codes") {
      appendGeneticCodeViewer(topic);
      return;
    }

    if (topic.interactive === "citation") {
      appendCitationGuidance(topic);
      return;
    }

    if (topic.interactive === "showcase") {
      appendGeneratedShowcase(topic, {
        appendTopicNotesAndCitations,
        compareToolCategories,
        container: container ?? elements.selectedReferenceBody,
        flattenOptions,
        getDefaultOptionValues,
        renderCircularDnaViewer,
        renderDnaViewer,
        renderGenomeFigure,
        renderProteinStructureViewer,
        renderProteinViewer,
        runTool,
        selectTool,
        state,
        tools
      });
      return;
    }

    if (topic.interactive === "restriction-enzymes") {
      appendRestrictionEnzymeReference(topic);
      return;
    }

    if (topic.interactive === "tool-summary") {
      appendToolSummary(topic);
      return;
    }

    if (topic.rows) {
      appendReferenceTable(topic);
    }

    appendTopicNotesAndCitations(topic);
  }

  return {
    renderSelectedReference
  };
}
