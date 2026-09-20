export function isTechnicalLimitsGroup(option) {
  const label = String(option?.label ?? "");
  return option?.type === "group" && (
    /^limits$/i.test(label) ||
    option.id === "advancedLimits" ||
    option.id === "referenceMatchLimitsGroup"
  );
}

// Keep editable limits in the disclosure declared by the tool. The same
// metadata then drives visible controls, saved values, and the reference page.
export function prepareToolOptionsForDisplay(options = []) {
  return options;
}
