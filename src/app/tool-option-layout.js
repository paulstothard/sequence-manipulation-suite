import { classifyToolLimitDisclosure } from "../tools/limit-disclosure.js";

const EDITABLE_OPTION_TYPES = new Set([
  "checkbox",
  "file",
  "number",
  "radio",
  "rule-list",
  "select",
  "text",
  "textarea",
  "value-list"
]);

function optionTreeIncludesId(option, id) {
  return option.id === id || (option.options ?? []).some((child) => optionTreeIncludesId(child, id));
}

export function isTechnicalLimitsGroup(option) {
  const label = String(option?.label ?? "");
  return option?.type === "group" && (
    /^limits$/i.test(label) ||
    option.id === "advancedLimits" ||
    option.id === "referenceMatchLimitsGroup"
  );
}

function getSettingsLabel(group) {
  if (group.settingsLabel) return group.settingsLabel;
  if (group.id === "referenceMatchLimitsGroup") return "Reference match settings";
  return "Processing settings";
}

function makePromotedSettingsGroup(group, controls) {
  return {
    ...group,
    label: getSettingsLabel(group),
    collapsible: false,
    collapsed: false,
    options: controls,
    presentation: "promoted-limit-settings"
  };
}

function makeInformationalLimitsGroup(group, controls, notes) {
  const disclosure = classifyToolLimitDisclosure({ options: [{ ...group, options: controls }] });
  const summaryId = `${group.id || "limits"}Disclosure`;
  return {
    ...group,
    label: "Limits",
    collapsible: true,
    collapsed: true,
    options: [
      {
        id: summaryId,
        type: "note",
        text: disclosure.summary
      },
      ...notes
    ],
    presentation: "informational-limits"
  };
}

// Metadata keeps technical caps together for persistence and reference summaries.
// The visible tool panel separates those editable controls from the informational
// Limits disclosure so Limits never behaves like a settings drawer.
export function prepareToolOptionsForDisplay(options = []) {
  const promotedGroups = [];
  const displayedOptions = options.map((option) => {
    if (!isTechnicalLimitsGroup(option)) return option;
    const controls = (option.options ?? []).filter((child) => EDITABLE_OPTION_TYPES.has(child.type));
    if (controls.length === 0) return option;
    const notes = (option.options ?? []).filter((child) => !EDITABLE_OPTION_TYPES.has(child.type));
    promotedGroups.push(makePromotedSettingsGroup(option, controls));
    return makeInformationalLimitsGroup(option, controls, notes);
  });

  if (promotedGroups.length === 0) return displayedOptions;
  const outputIndex = displayedOptions.findIndex((option) => optionTreeIncludesId(option, "outputFormat"));
  const firstLimitsIndex = displayedOptions.findIndex(isTechnicalLimitsGroup);
  const insertionIndex = outputIndex >= 0
    ? outputIndex
    : firstLimitsIndex >= 0
      ? firstLimitsIndex
      : displayedOptions.length;
  return [
    ...displayedOptions.slice(0, insertionIndex),
    ...promotedGroups,
    ...displayedOptions.slice(insertionIndex)
  ];
}
