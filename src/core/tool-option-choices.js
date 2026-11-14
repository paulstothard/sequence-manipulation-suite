export function getToolOptionChoices(option, optionValues = {}) {
  const choices = option.choices ?? [];
  if (!option.dependsOn) return choices;
  const parents = Array.isArray(option.dependsOn) ? option.dependsOn : [option.dependsOn];
  const filtered = choices.filter((choice) => parents.every((parent) => {
    const parentValue = optionValues[parent];
    if (!parentValue || parentValue === "all" || choice.always) return true;
    const expected = choice.dependsOnValues?.[parent] ?? choice.dependsOnValue;
    if (choice.value === option.defaultValue && expected == null) return true;
    return Array.isArray(expected) ? expected.includes(parentValue) : expected === parentValue;
  }));
  const parentValue = optionValues[parents[0]];
  return filtered.map((choice) => ({
    ...choice,
    label: choice.labelsByParentValue?.[parentValue] ?? choice.label
  }));
}

function flattenOptions(options = []) {
  return options.flatMap((option) => option.type === "group" ? flattenOptions(option.options) : [option]);
}

export function getToolOutputFormatOption(metadata) {
  const id = metadata?.workflow?.outputFormatOption ?? "outputFormat";
  return flattenOptions(metadata?.options).find(option => option.id === id);
}

// Explicit output-format contracts share the tool's dependent choice rules.
export function getAvailableToolWorkflowOutputs(metadata, optionValues = {}) {
  const outputs = (metadata?.workflow?.outputs ?? []).map(output =>
    output.kind === 'viewer' && output.viewerType === 'dna-sequence-viewer' && optionValues.outputFormat === 'interactive-circular-viewer'
      ? { ...output, layout: 'circular', ...(output.outputFormat === 'interactive-viewer' ? { outputFormat: 'interactive-circular-viewer' } : {}) } : output
  );
  const options = flattenOptions(metadata?.options);
  const outputFormat = getToolOutputFormatOption(metadata);
  if (!outputFormat?.dependsOn) return outputs;
  const values = { ...Object.fromEntries(options.map((option) => [option.id, option.defaultValue])), ...optionValues };
  const choices = getToolOptionChoices(outputFormat, values);
  return outputs.flatMap((output) => {
    if (!output.outputFormat) return [output];
    const choice = choices.find((item) => item.value === output.outputFormat);
    return choice ? [{ ...output, label: choice.label }] : [];
  });
}
