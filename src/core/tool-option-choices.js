export function getToolOptionChoices(option, optionValues = {}) {
  const choices = option.choices ?? [];
  if (!option.dependsOn) return choices;
  const parentValue = optionValues[option.dependsOn];
  if (!parentValue || parentValue === "all") return choices;
  return choices.filter((choice) =>
    choice.always ||
    (choice.value === option.defaultValue && !choice.dependsOnValue) ||
    (Array.isArray(choice.dependsOnValue)
      ? choice.dependsOnValue.includes(parentValue)
      : choice.dependsOnValue === parentValue)
  ).map((choice) => ({
    ...choice,
    label: choice.labelsByParentValue?.[parentValue] ?? choice.label
  }));
}

function flattenOptions(options = []) {
  return options.flatMap((option) => option.type === "group" ? flattenOptions(option.options) : [option]);
}

// Explicit output-format contracts share the tool's dependent choice rules.
export function getAvailableToolWorkflowOutputs(metadata, optionValues = {}) {
  const outputs = metadata?.workflow?.outputs ?? [];
  const options = flattenOptions(metadata?.options);
  const outputFormat = options.find((option) => option.id === "outputFormat");
  if (!outputFormat?.dependsOn) return outputs;
  const values = { ...Object.fromEntries(options.map((option) => [option.id, option.defaultValue])), ...optionValues };
  const choices = getToolOptionChoices(outputFormat, values);
  return outputs.flatMap((output) => {
    if (!output.outputFormat) return [output];
    const choice = choices.find((item) => item.value === output.outputFormat);
    return choice ? [{ ...output, label: choice.label }] : [];
  });
}
