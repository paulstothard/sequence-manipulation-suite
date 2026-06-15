import { technicalSequenceSummary } from "../technical-sequences/summary.js";

export const plasmidCommonFeatureProvenance = {
  dataset: "SMS3 plasmid common feature seed set",
  version: "0.3.0",
  date: "2026-05-26",
  status: "seed",
  license: "SMS3-curated sequence seed; expand only with source-specific license review",
  notes:
    "This seed set combines SMS3-curated plasmid signatures with Addgene-listed plasmid/Sanger sequencing primers already tracked in the SMS3 technical-sequence references. Larger plasmid-feature databases still need source-specific license review."
};

const addgeneSequencingPrimerRecords = technicalSequenceSummary
  .filter((record) => record.class === "sequencing-primer" && record.source?.name === "Addgene sequencing primers")
  .map((record) => ({
    id: record.id,
    name: record.name,
    type: "primer",
    sequence: record.pattern,
    orientation: "forward",
    provenance: plasmidCommonFeatureProvenance,
    source: {
      name: record.source.name,
      version: record.source.version,
      citation: record.source.citation || "Addgene Molecular Biology Reference: Sequencing Primers."
    }
  }));

export const plasmidCommonFeatureRecords = [
  {
    id: "t7-promoter-core",
    name: "T7 promoter core",
    type: "promoter",
    sequence: "TAATACGACTCACTATAGGG",
    orientation: "forward",
    provenance: plasmidCommonFeatureProvenance,
    source: {
      name: "Addgene sequencing primers",
      version: "accessed 2026-05",
      citation: "Addgene Molecular Biology Reference: Sequencing Primers."
    }
  },
  {
    id: "sp6-promoter-core",
    name: "SP6 promoter core",
    type: "promoter",
    sequence: "ATTTAGGTGACACTATAG",
    orientation: "forward",
    provenance: plasmidCommonFeatureProvenance,
    source: {
      name: "Addgene sequencing primers",
      version: "accessed 2026-05",
      citation: "Addgene Molecular Biology Reference: Sequencing Primers."
    }
  },
  {
    id: "t3-promoter-core",
    name: "T3 promoter core",
    type: "promoter",
    sequence: "AATTAACCCTCACTAAAGGG",
    orientation: "forward",
    provenance: plasmidCommonFeatureProvenance,
    source: {
      name: "SMS3 curated plasmid signatures",
      version: "0.2.0",
      citation: "Project-curated T3 promoter-core signature."
    }
  },
  {
    id: "lac-operator-core",
    name: "lac operator core",
    type: "operator",
    sequence: "AATTGTGAGCGGATAACAATT",
    orientation: "forward",
    provenance: plasmidCommonFeatureProvenance,
    source: {
      name: "SMS3 curated plasmid signatures",
      version: "0.2.0",
      citation: "Project-curated lac operator core signature."
    }
  }
].concat(addgeneSequencingPrimerRecords)
  .sort((left, right) =>
    left.type.localeCompare(right.type) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
