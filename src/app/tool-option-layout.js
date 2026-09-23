import { getApplicableSharedToolLimits, isTechnicalLimitsGroup } from "../core/tool-limit-options.js";
import { getToolLimitPolicy } from "../core/tool-limit-policy.js";
import { presentToolLimitNote } from "./tool-limit-note-presentations.js";

export { isTechnicalLimitsGroup };

function includesOptionId(option, id) {
  return option.id === id || (option.options ?? []).some((child) => includesOptionId(child, id));
}

function flattenOptions(options = []) {
  return options.flatMap((option) => option.type === "group"
    ? flattenOptions(option.options ?? [])
    : [option]);
}

function describeCondition(visibleWhen, optionById) {
  if (!visibleWhen) return "";
  if (visibleWhen.any) {
    return visibleWhen.any.map((condition) => describeCondition(condition, optionById)).filter(Boolean).join(" or ");
  }
  if (Array.isArray(visibleWhen)) {
    return visibleWhen.map((condition) => describeCondition(condition, optionById)).filter(Boolean).join(" and ");
  }
  const source = optionById.get(visibleWhen.option);
  const values = Array.isArray(visibleWhen.value) ? visibleWhen.value : [visibleWhen.value];
  const labels = values.map((value) => source?.choices?.find((choice) => choice.value === value)?.label ?? String(value));
  return `${source?.label ?? visibleWhen.option} is ${labels.join(" or ")}`;
}

function withLimitPolicy(option, metadata) {
  const policy = getToolLimitPolicy(metadata?.id, option.id);
  return policy ? { ...option, limitOverride: policy } : option;
}

function limitDisplayOption(option, groupCondition, optionById, metadata) {
  const ownCondition = option.visibleWhen;
  const groupScope = describeCondition(groupCondition, optionById);
  const additionalCondition = ownCondition && JSON.stringify(ownCondition) !== JSON.stringify(groupCondition)
    ? describeCondition(ownCondition, optionById)
    : "";
  const scope = groupScope && additionalCondition.startsWith(`${groupScope} and `)
    ? additionalCondition
    : [groupScope, additionalCondition].filter(Boolean).join(" and ");
  const details = [option.detail ?? option.help, scope ? `Applies when ${scope}.` : ""].filter(Boolean);
  return withLimitPolicy({
    ...option,
    type: "limit-value",
    ...(ownCondition ? { displayId: `limit-display-${option.id}` } : {}),
    visibleWhen: undefined,
    label: option.label ?? option.id,
    value: option.type === "limit-value" ? option.value : option.defaultValue,
    detail: details.join(" ")
  }, metadata);
}

// Tool metadata retains the enforced values used by runners and workflows.
// Audited resource ceilings may also expose an enforce/disable checkbox.
export function prepareToolOptionsForDisplay(options = [], metadata = {}) {
  const groups = options.filter(isTechnicalLimitsGroup);
  const optionById = new Map(flattenOptions(options).filter((option) => option.id).map((option) => [option.id, option]));
  let noteIndex = 0;
  const toolLimits = groups.flatMap((group) => {
    const scope = describeCondition(group.visibleWhen, optionById);
    return (group.options ?? []).flatMap((option) => {
      if (option.type !== "note") return [limitDisplayOption(option, group.visibleWhen, optionById, metadata)];
      const presentation = presentToolLimitNote(metadata.id, noteIndex++);
      const rows = presentation ?? [{
        id: option.id ?? `limit-note-${noteIndex}`,
        type: "limit-value",
        label: "Limit details",
        value: option.text ?? ""
      }];
      return rows.map((row) => withLimitPolicy({
        ...row,
        detail: [row.detail, scope ? `Applies when ${scope}.` : ""].filter(Boolean).join(" ")
      }, metadata));
    });
  });
  const sharedLimits = getApplicableSharedToolLimits(metadata).map((row) => withLimitPolicy(row, metadata));
  const disclosure = {
    id: groups[0]?.id && !groups[0].visibleWhen ? groups[0].id : "limitsDisclosure",
    type: "group",
    label: "Limits",
    collapsible: true,
    collapsed: true,
    options: [
      ...toolLimits,
      ...sharedLimits,
      ...(!toolLimits.length && !sharedLimits.length
        ? [{ id: "browserCapacity", type: "limit-value", label: "Processing capacity", value: "Available browser memory" }]
        : [])
    ]
  };

  const displayOptions = options.filter((option) => !isTechnicalLimitsGroup(option));
  const firstLimitIndex = options.findIndex(isTechnicalLimitsGroup);
  if (firstLimitIndex !== -1) {
    displayOptions.splice(options.slice(0, firstLimitIndex).filter((option) => !isTechnicalLimitsGroup(option)).length, 0, disclosure);
    return displayOptions;
  }
  const outputIndex = displayOptions.findIndex((option) => includesOptionId(option, "outputFormat"));
  const firstNoteIndex = displayOptions.findIndex((option) => option.type === "note" && option.placement !== "input");
  const insertionIndex = outputIndex !== -1 ? outputIndex + 1 : firstNoteIndex !== -1 ? firstNoteIndex : displayOptions.length;
  displayOptions.splice(insertionIndex, 0, disclosure);
  return displayOptions;
}
