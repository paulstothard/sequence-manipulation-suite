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
    help: "Optional display limits for the plot axes. Leave blank for automatic scaling.",
    options: yStartAtZero ? options : options.filter((option) => option.id !== "yStartAtZero")
  };
}

export function makePublicationPlotGroup({ x = true, y = true, value = false, grid = true } = {}) {
  const options = [
    {
      id: "publicationWidthMm",
      type: "select",
      label: "Final figure width",
      defaultValue: "180",
      choices: [
        { value: "180", label: "180 mm (double column)" },
        { value: "90", label: "90 mm (single column)" }
      ],
      help: "Sets the intended physical export width so figure text is rendered at publication size. Use the matching width when placing the exported figure."
    },
    {
      id: "showTitle",
      type: "checkbox",
      label: "Show title inside figure",
      defaultValue: true,
      help: "Turn this off when the manuscript caption supplies the figure title."
    }
  ];
  if (grid) {
    options.push({
      id: "showGridLines",
      type: "checkbox",
      label: "Show background grid lines",
      defaultValue: false,
      help: "Publication plots use short axis ticks by default; enable grid lines only when they materially help quantitative reading."
    });
  }
  if (x) {
    options.push(
      { id: "xAxisLabel", type: "text", label: "X-axis label", defaultValue: "", placeholder: "Automatic" },
      { id: "xAxisUnit", type: "text", label: "X-axis unit", defaultValue: "", placeholder: "Optional" }
    );
  }
  if (y) {
    options.push(
      { id: "yAxisLabel", type: "text", label: "Y-axis label", defaultValue: "", placeholder: "Automatic" },
      { id: "yAxisUnit", type: "text", label: "Y-axis unit", defaultValue: "", placeholder: "Optional" }
    );
  }
  if (value) {
    options.push(
      { id: "valueAxisLabel", type: "text", label: "Color scale label", defaultValue: "", placeholder: "Automatic" },
      { id: "valueAxisUnit", type: "text", label: "Color scale unit", defaultValue: "", placeholder: "Optional" }
    );
  }
  return {
    id: "publicationStyle",
    type: "group",
    label: "Publication styling",
    collapsible: true,
    collapsed: true,
    options
  };
}
