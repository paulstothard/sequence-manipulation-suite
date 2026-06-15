export function makeAxisLimitsGroup({ x = true, y = true, yStartAtZero = true } = {}) {
  const options = [];
  if (y) {
    options.push({
      id: "yStartAtZero",
      type: "checkbox",
      label: "Start y axis at zero",
      defaultValue: false,
      help: "Keeps automatic scaling, but expands the y-axis to include zero."
    });
  }
  if (x) {
    options.push(
      { id: "xMin", type: "text", label: "X minimum", defaultValue: "", placeholder: "Auto" },
      { id: "xMax", type: "text", label: "X maximum", defaultValue: "", placeholder: "Auto" }
    );
  }
  if (y) {
    options.push(
      { id: "yMin", type: "text", label: "Y minimum", defaultValue: "", placeholder: "Auto" },
      { id: "yMax", type: "text", label: "Y maximum", defaultValue: "", placeholder: "Auto" }
    );
  }
  return {
    id: "axisLimits",
    type: "group",
    label: "Axis limits",
    collapsible: true,
    collapsed: true,
    help: "Optional display limits for the plot axes. Leave blank for automatic scaling.",
    options: yStartAtZero ? options : options.filter((option) => option.id !== "yStartAtZero")
  };
}
