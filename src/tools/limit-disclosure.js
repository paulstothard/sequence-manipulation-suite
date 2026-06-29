const TECHNICAL_LIMIT_GROUP_IDS = new Set(["advancedLimits", "referenceMatchLimitsGroup"]);
const MAX_INLINE_LIMITS = 4;

function flattenOptionNodes(options = []) {
  const flattened = [];
  for (const option of options) {
    flattened.push(option);
    if (option.type === "group" && Array.isArray(option.options)) {
      flattened.push(...flattenOptionNodes(option.options));
    }
  }
  return flattened;
}

function isTechnicalLimitGroup(option) {
  const label = String(option.label ?? "");
  return option.type === "group" && (
    TECHNICAL_LIMIT_GROUP_IDS.has(option.id) ||
    /^limits$/i.test(label)
  );
}

function isReferenceMatchLimitGroup(option) {
  return option.id === "referenceMatchLimitsGroup";
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value);
  }
  const [integer, decimal] = String(value).split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal ? `${groupedInteger}.${decimal}` : groupedInteger;
}

function formatLimitRange(option) {
  const hasMin = option.min !== undefined;
  const hasMax = option.max !== undefined;
  if (hasMin && hasMax) {
    return `${formatNumber(option.min)}-${formatNumber(option.max)}`;
  }
  if (hasMin) {
    return `minimum ${formatNumber(option.min)}`;
  }
  if (hasMax) {
    return `maximum ${formatNumber(option.max)}`;
  }
  return "";
}

function formatLimitOption(option) {
  if (option.type === "note") {
    return String(option.text ?? option.label ?? option.id ?? "Limit").trim();
  }
  const label = String(option.label ?? option.id ?? "Limit").trim();
  const defaultText = option.defaultValue === undefined ? "" : `default ${formatNumber(option.defaultValue)}`;
  const rangeText = formatLimitRange(option);
  if (defaultText && rangeText) {
    return `${label}: ${defaultText} (${rangeText})`;
  }
  if (defaultText) {
    return `${label}: ${defaultText}`;
  }
  if (rangeText) {
    return `${label}: ${rangeText}`;
  }
  return label;
}

export function getToolLimitGroups(metadata) {
  return flattenOptionNodes(metadata.options ?? []).filter(isTechnicalLimitGroup);
}

export function classifyToolLimitDisclosure(metadata) {
  const groups = getToolLimitGroups(metadata);
  if (groups.length === 0) {
    return {
      profile: "general",
      label: "No tool-specific editable limits",
      controls: [],
      summary: "No tool-specific editable input or processing caps are exposed for this tool. Shared browser-local input, file, and output guardrails still apply."
    };
  }

  const controls = groups.flatMap((group) => group.options ?? []);
  const hasReferenceMatchLimits = groups.some(isReferenceMatchLimitGroup);
  const hasTechnicalLimits = groups.some((group) => !isReferenceMatchLimitGroup(group));
  const hasEditableControls = controls.some((control) => control.type !== "note");
  const label = hasTechnicalLimits && hasReferenceMatchLimits
    ? "Editable input, processing, and reference-hit limits"
    : hasReferenceMatchLimits
      ? "Editable reference-hit limits"
      : hasEditableControls
        ? "Editable input and processing limits"
        : "Input and processing limits";
  const inlineControls = controls.slice(0, MAX_INLINE_LIMITS).map(formatLimitOption);
  const omittedCount = Math.max(0, controls.length - inlineControls.length);
  const suffix = omittedCount > 0 ? `; and ${omittedCount} more` : "";

  return {
    profile: hasReferenceMatchLimits && !hasTechnicalLimits ? "editable-reference-match" : "editable-technical",
    label,
    controls,
    summary: `${label}: ${inlineControls.join("; ")}${suffix}.`
  };
}

export function formatToolLimitDisclosure(metadata) {
  return classifyToolLimitDisclosure(metadata).summary;
}
