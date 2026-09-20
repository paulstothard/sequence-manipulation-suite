import { getApplicableSharedToolLimits, getToolLimitGroups } from "../core/tool-limit-options.js";

export { getToolLimitGroups };
const MAX_INLINE_LIMITS = 4;

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

function formatLimitOption(option) {
  if (option.type === "note") {
    return String(option.text ?? option.label ?? option.id ?? "Limit").trim();
  }
  const label = String(option.label ?? option.id ?? "Limit").trim();
  if (option.type === "limit-value") {
    return `${label}: ${formatNumber(option.value)}`;
  }
  return option.defaultValue === undefined
    ? label
    : `${label}: ${formatNumber(option.defaultValue)}`;
}

export function classifyToolLimitDisclosure(metadata) {
  const groups = getToolLimitGroups(metadata);
  const sharedLimits = getApplicableSharedToolLimits(metadata);
  const sharedSummary = sharedLimits.length
    ? ` File and display limits: ${sharedLimits.map(formatLimitOption).join("; ")}.`
    : "";
  if (groups.length === 0) {
    return {
      profile: "general",
      label: "Applicable limits",
      controls: [],
      summary: sharedLimits.length
        ? `Applicable limits: ${sharedLimits.map(formatLimitOption).join("; ")}.`
        : "Large runs depend on available browser memory."
    };
  }

  const controls = groups.flatMap((group) => group.options ?? []);
  const hasReferenceMatchLimits = groups.some(isReferenceMatchLimitGroup);
  const hasTechnicalLimits = groups.some((group) => !isReferenceMatchLimitGroup(group));
  const label = hasTechnicalLimits && hasReferenceMatchLimits
    ? "Input, processing, and reference-hit limits"
    : hasReferenceMatchLimits
      ? "Reference-hit limits"
      : "Input and processing limits";
  const inlineControls = controls.slice(0, MAX_INLINE_LIMITS).map(formatLimitOption);
  const omittedCount = Math.max(0, controls.length - inlineControls.length);
  const suffix = omittedCount > 0 ? `; and ${omittedCount} more` : "";

  return {
    profile: hasReferenceMatchLimits && !hasTechnicalLimits ? "reference-match" : "technical",
    label,
    controls,
    summary: `${label}: ${inlineControls.join("; ")}${suffix}.${sharedSummary}`
  };
}

export function formatToolLimitDisclosure(metadata) {
  return classifyToolLimitDisclosure(metadata).summary;
}
