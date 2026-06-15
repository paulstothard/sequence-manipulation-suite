const viewerStreamLabels = {
  "dna-sequence-viewer": {
    sentence: "Linear DNA sequence viewer",
    label: "Linear DNA sequence viewer",
    heading: "Linear DNA Sequence Viewer"
  },
  "protein-sequence-viewer": {
    sentence: "protein sequence viewer",
    label: "Protein sequence viewer",
    heading: "Protein Sequence Viewer"
  },
  "protein-structure-viewer": {
    sentence: "protein structure viewer",
    label: "Protein structure viewer",
    heading: "Protein Structure Viewer"
  }
};

const circularDnaViewerLabels = {
  sentence: "Circular DNA sequence viewer",
  label: "Circular DNA sequence viewer",
  heading: "Circular DNA Sequence Viewer"
};

const genericViewerTitles = new Set([
  "linear dna sequence viewer",
  "circular dna sequence viewer",
  "protein sequence viewer",
  "protein structure viewer"
]);

export function describeViewerStream(stream, style = "sentence") {
  const viewerType = stream?.viewerType ?? stream?.viewer?.viewerType;
  const layout = stream?.layout ?? stream?.viewer?.layout;
  const explicitTitle = stream?.title ?? stream?.viewer?.title;
  if (explicitTitle && !genericViewerTitles.has(explicitTitle.toLowerCase())) {
    return explicitTitle;
  }
  let labels = viewerStreamLabels[viewerType] ?? {
    sentence: "viewer",
    label: "Viewer",
    heading: "Viewer"
  };
  if (viewerType === "dna-sequence-viewer" && layout === "circular") {
    labels = circularDnaViewerLabels;
  }
  return labels[style] ?? labels.sentence;
}

export function describeStream(stream) {
  if (!stream) {
    return "unknown result";
  }
  if (stream.label) {
    return stream.label;
  }
  if (stream.kind === "sequence-records") {
    if (stream.id === "cdsSequenceRecords") {
      return "CDS DNA/RNA sequences";
    }
    if (stream.id === "wholeSequenceRecords") {
      return "Whole DNA/RNA sequences";
    }
    return stream.alphabet === "protein" ? "protein sequences" : "DNA/RNA sequences";
  }
  if (stream.kind === "collection") {
    const itemDescription =
      stream.itemDescription ??
      (stream.itemKind === "sequence-records" ? "sequence records" : stream.itemKind);
    return itemDescription ? `set of ${itemDescription}` : "set";
  }
  if (stream.kind === "table") {
    return "table rows";
  }
  if (stream.kind === "viewer") {
    return describeViewerStream(stream);
  }
  if (stream.kind === "figure") {
    return "Genome Figure";
  }
  if (stream.kind === "orf-records") {
    return "ORFs";
  }
  if (stream.kind === "stats-records") {
    return "statistics records";
  }
  if (stream.kind === "text-records") {
    return "text records";
  }
  if (stream.kind === "warnings") {
    return "warnings";
  }
  if (stream.kind === "text") {
    if (stream.mediaType?.includes("fasta")) {
      return "FASTA records";
    }
    if (stream.mediaType?.includes("svg")) {
      return "plot or image";
    }
    if (stream.mediaType?.includes("tab-separated-values")) {
      return "Table";
    }
    return "Text output";
  }
  return stream.kind;
}

function getWorkflowSchemaLabel(schema) {
  const labels = {
    "base-composition-plot": "Composition table",
    "codon-usage": "Codon usage table",
    "dna-rna-pattern-finder": "Match table",
    "dna-rna-motif-scanner": "Motif match table",
    "extract-subsequences": "Extracted-region table",
    "generic-table": "Table rows",
    "orf-finder": "ORF table",
    "protein-hydropathy": "Hydropathy table",
    "protein-motif-scanner": "Motif match table",
    "protein-pattern-finder": "Match table",
    "protein-stats": "Protein sequence statistics table",
    "restriction-fragments": "Digest fragments",
    "restriction-map": "Map features",
    "restriction-sites": "Restriction site table",
    "reverse-translate": "Codon choice table",
    "sequence-stats-dna-rna": "Sequence statistics table",
    "sequence-stats-protein": "Protein sequence statistics table",
    "technical-sequence-scanner": "Technical sequence match table",
    "vector-contamination-scanner": "Vector contamination match table",
    "translate-dna-rna": "Translation table"
  };
  return labels[schema];
}

export function describeWorkflowStreamChoice(stream) {
  if (!stream) {
    return "Unknown result";
  }
  if (stream.label) {
    return stream.label;
  }
  if (stream.id === "primary") {
    return stream.mediaType?.includes("fasta") ? "FASTA records" : "Displayed output";
  }
  if (stream.id === "sequenceRecords") {
    return stream.alphabet === "protein" ? "Protein sequences" : "DNA/RNA sequences";
  }
  if (stream.id === "cleanedText") {
    return "Cleaned text";
  }
  if (stream.id === "proteinRecords") {
    return "Protein sequences";
  }
  if (stream.id === "wholeSequenceRecords") {
    return "Whole DNA/RNA sequences";
  }
  if (stream.id === "cdsSequenceRecords") {
    return "CDS DNA/RNA sequences";
  }
  if (stream.id === "dnaRecords") {
    return "DNA/RNA sequences";
  }
  if (stream.id === "orfRecords") {
    return "ORFs";
  }
  if (stream.id === "matchedRegions") {
    return "Matched sequence regions";
  }
  if (stream.id === "nucleotideFasta") {
    return "ORF nucleotide FASTA";
  }
  if (stream.id === "proteinFasta") {
    return "ORF protein FASTA";
  }
  if (stream.id === "fasta") {
    return "FASTA records";
  }
  if (stream.id === "report") {
    return "Summary report";
  }
  if (stream.id === "tsv") {
    return "Table";
  }
  if (stream.id === "groupedText") {
    return "Grouped sequence text";
  }
  if (stream.id === "translations") {
    return "Translation table";
  }
  if (stream.id === "fragments") {
    return "Digest fragments";
  }
  if (stream.id === "mapTable") {
    return "Map features";
  }
  if (stream.id === "plot") {
    return "Plot";
  }
  if (stream.id === "viewer") {
    return describeViewerStream(stream, "label");
  }
  if (stream.id === "overview") {
    return "Overview graphic";
  }
  if (stream.id === "table") {
    return getWorkflowSchemaLabel(stream.schema) ?? "Table rows";
  }
  if (stream.id === "statsRecords") {
    return "Statistics records";
  }
  if (stream.id === "textRecords") {
    return "Text records";
  }
  if (stream.id === "warnings") {
    return "Warnings";
  }
  return describeStream(stream);
}
