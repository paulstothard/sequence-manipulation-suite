export const toolCategoryOrder = [
  "Sequence Utilities",
  "Sequence Analysis",
  "Sequence Alignment & Assembly",
  "High-Throughput Sequencing",
  "Restriction, PCR & Primers",
  "FASTA",
  "Annotated Records & Features",
  "Viewers & Figures",
  "Sanger Traces",
  "Tables",
  "Statistics",
  "Plots",
  "Text & Notes",
  "Random & Mutagenesis"
];

export const toolCategorySet = new Set(toolCategoryOrder);

export function compareToolCategories(left, right) {
  const leftIndex = toolCategoryOrder.indexOf(left);
  const rightIndex = toolCategoryOrder.indexOf(right);
  if (leftIndex !== -1 && rightIndex !== -1) {
    return leftIndex - rightIndex;
  }
  if (leftIndex !== -1) return -1;
  if (rightIndex !== -1) return 1;
  return String(left).localeCompare(String(right));
}
