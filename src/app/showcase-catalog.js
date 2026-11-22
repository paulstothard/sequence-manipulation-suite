import { showcaseFamilies } from "../tools/showcase-families.js";

const flattenOptions = (options = []) => options.flatMap(option =>
  option.type === "group" ? flattenOptions(option.options) : [option]);
const outputOption = metadata => flattenOptions(metadata.options).find(option => option.id === "outputFormat");

// false explicitly classifies a non-graphical output. Missing/unknown declarations
// remain standalone at runtime, and the registry gate requires classification.
export function getShowcaseOutputs(metadata) {
  const menu = outputOption(metadata);
  const declared = metadata.showcaseOutputs ?? [];
  const outputs = declared.map(output => ({ ...output, outputFormat: output.options?.outputFormat ?? menu?.defaultValue }));
  for (const choice of menu?.choices ?? []) {
    if (choice.showcase === false) continue;
    if (outputs.some(output => output.outputFormat === choice.value && output.showcase === choice.showcase)) continue;
    outputs.push({ id: choice.value, label: choice.label, showcase: choice.showcase, outputFormat: choice.value });
  }
  return outputs.map(output => ({
    ...output,
    family: Object.hasOwn(showcaseFamilies, output.showcase)
      ? output.showcase : `unclassified:${metadata.id}:${output.id}`
  }));
}

export function validateShowcaseMetadata(tools) {
  const problems = [];
  const usedFamilies = new Map();
  for (const { metadata } of tools) {
    const menu = outputOption(metadata);
    const choices = menu?.choices ?? [];
    for (const choice of choices) {
      if (choice.showcase !== false && !Object.hasOwn(showcaseFamilies, choice.showcase)) {
        problems.push(`${metadata.id}:${choice.value}: declare showcase as a registered family or false`);
      }
    }
    const ids = new Set();
    for (const output of metadata.showcaseOutputs ?? []) {
      if (!output.id || ids.has(output.id)) problems.push(`${metadata.id}: duplicate or missing declared Showcase output id`);
      ids.add(output.id);
      if (!Object.hasOwn(showcaseFamilies, output.showcase)) problems.push(`${metadata.id}:${output.id}: unknown Showcase family`);
      const format = output.options?.outputFormat ?? menu?.defaultValue;
      if (menu && !choices.some(choice => choice.value === format && choice.showcase === output.showcase)) {
        problems.push(`${metadata.id}:${output.id}: declared example must match its output choice and family`);
      }
    }
    for (const output of getShowcaseOutputs(metadata)) {
      const members = usedFamilies.get(output.family) ?? new Set();
      members.add(metadata.id);
      usedFamilies.set(output.family, members);
    }
  }
  for (const [id, family] of Object.entries(showcaseFamilies)) {
    if (!family.label?.trim()) problems.push(`${id}: family needs a label`);
    if (!usedFamilies.has(id)) problems.push(`${id}: family has no registered producers`);
    if (family.preferredToolId && !usedFamilies.get(id)?.has(family.preferredToolId)) problems.push(`${id}: preferred tool does not produce this family`);
  }
  return problems;
}

export function isShowcaseVisualResult(result) {
  // Text/source previews and the Markdown editor do not produce graphical figures.
  return String(result.output ?? "").trimStart().startsWith("<svg") ||
    Object.entries(result.visual ?? {}).some(([key, value]) => value && !["notebook", "filePreview", "previewStatus"].includes(key));
}

export function groupShowcaseItems(items, tools, compareToolCategories) {
  const byId = new Map(tools.map(tool => [tool.metadata.id, tool]));
  const families = new Map();
  for (const item of items) {
    const members = families.get(item.family) ?? [];
    members.push(item);
    families.set(item.family, members);
  }
  const groups = [...families].map(([id, members]) => {
    const definition = showcaseFamilies[id];
    const representative = members.find(item => item.toolId === definition?.preferredToolId) ?? members[0];
    const producers = [...new Set(members.map(item => item.toolId))].map(id => byId.get(id)).filter(Boolean)
      .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    const categories = [...new Set(producers.map(tool => tool.metadata.category))].sort(compareToolCategories);
    return { id, title: definition?.label ?? representative.outputLabel, items: members, representative, producers, categories };
  });
  return groups.sort((a, b) => compareToolCategories(a.categories[0], b.categories[0]) || a.title.localeCompare(b.title));
}
