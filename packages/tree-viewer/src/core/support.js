// Explicit profiles: numeric labels alone do not establish statistical meaning.
export function supportProfileOptions(profile = "unresolved") {
  switch (profile) {
    case "unresolved": return { internalLabels: "unresolved" };
    case "name": return { internalLabels: "name" };
    case "bootstrap-percent": return { internalLabels: "support", supportNames: ["bootstrap"], supportUnits: "percent" };
    case "bootstrap-proportion": return { internalLabels: "support", supportNames: ["bootstrap"], supportUnits: "proportion" };
    case "sh-alrt-ufboot": return { internalLabels: "support", supportNames: ["SH-aLRT", "UFBoot"], supportUnits: "percent" };
    default: throw new Error("Unknown branch support interpretation.");
  }
}
export function validateSupportRange(values, units) {
  const maximum = units === "percent" ? 100 : units === "proportion" ? 1 : null;
  if (maximum !== null && values.some(value => Number(value) < 0 || Number(value) > maximum))
    throw new Error(`Support values in ${units} must be between 0 and ${maximum}; check the selected interpretation.`);
}
