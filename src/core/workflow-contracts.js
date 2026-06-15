export const workflowStreamKinds = [
  "text",
  "sequence-records",
  "table",
  "orf-records",
  "stats-records",
  "text-records",
  "viewer",
  "figure",
  "warnings"
];

export const workflowAlphabets = ["dna-rna", "protein"];

export function validateWorkflowContract(metadata) {
  const errors = [];

  if (!metadata.workflow || typeof metadata.workflow !== "object") {
    return [`${metadata.id}: missing workflow contract`];
  }

  for (const key of ["inputs", "outputs"]) {
    const streams = metadata.workflow[key];
    if (!Array.isArray(streams)) {
      errors.push(`${metadata.id}: workflow.${key} must be an array`);
      continue;
    }

    if (key === "outputs" && streams.length === 0) {
      errors.push(`${metadata.id}: workflow.outputs must be a non-empty array`);
      continue;
    }

    if (key === "inputs" && streams.length === 0 && metadata.inputRequired !== false) {
      errors.push(`${metadata.id}: workflow.inputs must be non-empty unless inputRequired is false`);
      continue;
    }

    for (const stream of streams) {
      if (!stream.id || typeof stream.id !== "string") {
        errors.push(`${metadata.id}: workflow.${key} stream is missing a string id`);
      }
      if (!workflowStreamKinds.includes(stream.kind)) {
        errors.push(`${metadata.id}: workflow.${key}.${stream.id ?? "unknown"} has unsupported kind "${stream.kind}"`);
      }
      if (stream.alphabet && !workflowAlphabets.includes(stream.alphabet)) {
        errors.push(`${metadata.id}: workflow.${key}.${stream.id ?? "unknown"} has unsupported alphabet "${stream.alphabet}"`);
      }
    }
  }

  return errors;
}

export function isWorkflowStreamCompatible(output, input) {
  if (!output || !input || output.kind !== input.kind) {
    return false;
  }

  if (input.alphabet && output.alphabet && input.alphabet !== output.alphabet) {
    return false;
  }

  if (input.schema && output.schema && input.schema !== output.schema) {
    return false;
  }

  return true;
}

export function getCompatibleWorkflowInputs(output, tools = []) {
  return tools.flatMap((tool) =>
    (tool.metadata.workflow?.inputs ?? [])
      .filter((input) => isWorkflowStreamCompatible(output, input))
      .map((input) => ({
        toolId: tool.metadata.id,
        toolName: tool.metadata.name,
        input
      }))
  );
}
