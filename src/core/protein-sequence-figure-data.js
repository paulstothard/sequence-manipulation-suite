const BOND_FEATURE_TYPES = new Set(["CROSSLNK", "DISULFID"]);
const PROCESSING_FEATURE_TYPES = new Set(["CHAIN", "INIT_MET", "PEPTIDE", "PROPEP", "SIGNAL", "TRANSIT"]);
const DOMAIN_FEATURE_TYPES = new Set(["CA_BIND", "DNA_BIND", "DOMAIN", "NP_BIND", "TRANSMEM"]);
const MOTIF_FEATURE_TYPES = new Set(["COILED", "COMPBIAS", "MOTIF", "REPEAT", "ZN_FING"]);
const CLEAVAGE_FEATURE_TYPES = new Set(["PEPTIDE", "PROPEP", "SIGNAL", "TRANSIT"]);

export const PROTEIN_SEQUENCE_FIGURE_LIMITS = Object.freeze({
  residuesPerRecord: 10_000,
  featuresPerRecord: 2_000
});

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function firstQualifier(feature, names) {
  for (const name of names) {
    const value = feature.qualifiers?.[name];
    const first = Array.isArray(value) ? value[0] : value;
    if (cleanText(first)) return cleanText(first);
  }
  return "";
}

export function formatProteinFeatureType(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getProteinFigureFeatureLabel(feature) {
  return cleanText(feature.product)
    || firstQualifier(feature, ["note", "function", "bound_moiety", "ligand", "ligand_label", "label", "standard_name"])
    || formatProteinFeatureType(feature.feature)
    || "Feature";
}

function spanKind(type) {
  if (PROCESSING_FEATURE_TYPES.has(type)) return "processing";
  if (DOMAIN_FEATURE_TYPES.has(type)) return "domain";
  if (MOTIF_FEATURE_TYPES.has(type)) return "motif";
  if (type === "REGION") return "region";
  return "other";
}

function siteKind(type) {
  if (type === "ACT_SITE") return "active";
  if (["BINDING", "CA_BIND", "METAL", "NP_BIND"].includes(type)) return "binding";
  if (["CARBOHYD", "LIPID", "MOD_RES", "NON_STD"].includes(type)) return "ptm";
  if (["CONFLICT", "MUTAGEN", "VARIANT"].includes(type)) return "variant";
  return "site";
}

function validRange(range, sequenceLength) {
  const start = Number(range?.start);
  const end = Number(range?.end);
  return Number.isInteger(start)
    && Number.isInteger(end)
    && start >= 1
    && end >= start
    && end <= sequenceLength;
}

function inspectionDetails(feature) {
  return [
    ["location", feature.location],
    ["note", firstQualifier(feature, ["note"])],
    ["function", firstQualifier(feature, ["function"])],
    ["bound moiety", firstQualifier(feature, ["bound_moiety"])],
    ["ligand", firstQualifier(feature, ["ligand", "ligand_label"])],
    ["evidence", firstQualifier(feature, ["evidence"])]
  ].filter(([, value]) => cleanText(value));
}

function makeFeatureBase(feature, index) {
  const type = cleanText(feature.feature).toUpperCase();
  return {
    id: cleanText(feature.id) || `feature-${index + 1}`,
    type,
    label: getProteinFigureFeatureLabel(feature),
    location: cleanText(feature.location),
    partial: Boolean(feature.parsedLocation?.partial),
    details: inspectionDetails(feature)
  };
}

function makeBoundaryLabel(feature, type, label, boundaryRole) {
  const generic = formatProteinFeatureType(type);
  if (boundaryRole === "start") return label === generic ? `${generic} start` : `${label} start`;
  return label === generic ? `${generic} cleavage` : `${label} cleavage`;
}

function combineBoundaries(boundaries) {
  const grouped = new Map();
  for (const boundary of boundaries) {
    const current = grouped.get(boundary.after);
    if (!current) {
      grouped.set(boundary.after, { ...boundary, labels: [boundary.label] });
      continue;
    }
    if (!current.labels.includes(boundary.label)) current.labels.push(boundary.label);
    current.explicit ||= boundary.explicit;
    current.details.push(...boundary.details);
  }
  return [...grouped.values()]
    .sort((left, right) => left.after - right.after)
    .map((boundary, index) => ({
      ...boundary,
      id: `boundary-${index + 1}`,
      label: boundary.labels.join(" / "),
      details: [...new Map(boundary.details.map((detail) => [detail.join("\u0000"), detail])).values()]
    }));
}

function recordFeatures(record) {
  const sequenceLength = record.sequence.length;
  const spans = [];
  const sites = [];
  const boundaries = [];
  const bonds = [];

  for (const [index, feature] of record.features.entries()) {
    const base = makeFeatureBase(feature, index);
    const ranges = (feature.parsedLocation?.ranges ?? []).filter((range) => validRange(range, sequenceLength));
    const betweenSites = (feature.parsedLocation?.sites ?? []).filter((site) =>
      Number.isInteger(Number(site.after))
      && Number.isInteger(Number(site.before))
      && Number(site.after) >= 0
      && Number(site.before) <= sequenceLength + 1
    );

    for (const site of betweenSites) {
      boundaries.push({
        ...base,
        after: Number(site.after),
        before: Number(site.before),
        explicit: true
      });
    }
    if (betweenSites.length > 0 && ranges.length === 0) continue;

    if (BOND_FEATURE_TYPES.has(base.type) && ranges.length > 0) {
      const positions = ranges.flatMap((range) => [Number(range.start), Number(range.end)]);
      const start = Math.min(...positions);
      const end = Math.max(...positions);
      if (start !== end) {
        bonds.push({ ...base, start, end, kind: base.type === "DISULFID" ? "disulfide" : "crosslink" });
      } else {
        sites.push({ ...base, position: start, kind: siteKind(base.type) });
      }
      continue;
    }

    const totalResidues = ranges.reduce((sum, range) => sum + range.end - range.start + 1, 0);
    if (ranges.length > 0 && totalResidues === 1) {
      for (const range of ranges) {
        for (let position = range.start; position <= range.end; position += 1) {
          sites.push({ ...base, id: `${base.id}:${position}`, position, kind: siteKind(base.type) });
        }
      }
      continue;
    }

    if (ranges.length > 0) {
      spans.push({
        ...base,
        start: Math.min(...ranges.map((range) => range.start)),
        end: Math.max(...ranges.map((range) => range.end)),
        parts: ranges.map((range) => ({ start: range.start, end: range.end })),
        kind: spanKind(base.type),
        uncertainStart: /^</.test(base.location) || /\(<\d/.test(base.location),
        uncertainEnd: />\d/.test(base.location)
      });

      if (CLEAVAGE_FEATURE_TYPES.has(base.type)) {
        const end = Math.max(...ranges.map((range) => range.end));
        if (end < sequenceLength) {
          boundaries.push({
            ...base,
            id: `${base.id}:cleavage`,
            after: end,
            before: end + 1,
            label: makeBoundaryLabel(feature, base.type, base.label, "end"),
            explicit: false
          });
        }
      }
      if (base.type === "CHAIN") {
        const start = Math.min(...ranges.map((range) => range.start));
        if (start > 1) {
          boundaries.push({
            ...base,
            id: `${base.id}:start`,
            after: start - 1,
            before: start,
            label: makeBoundaryLabel(feature, base.type, base.label, "start"),
            explicit: false
          });
        }
      }
    }
  }

  return {
    spans,
    sites,
    boundaries: combineBoundaries(boundaries),
    bonds
  };
}

export function makeProteinSequenceFigureData(records, options = {}) {
  const proteinRecords = records.filter((record) => record.molecule === "protein" && record.sequence);
  for (const record of proteinRecords) {
    const name = cleanText(record.accession) || cleanText(record.title) || "Protein record";
    if (record.sequence.length > PROTEIN_SEQUENCE_FIGURE_LIMITS.residuesPerRecord) {
      throw new Error(`${name} has ${record.sequence.length.toLocaleString()} residues. Protein sequence figures support at most ${PROTEIN_SEQUENCE_FIGURE_LIMITS.residuesPerRecord.toLocaleString()} residues per record; use the protein viewer, feature table, or FASTA output for larger proteins.`);
    }
    if (record.features.length > PROTEIN_SEQUENCE_FIGURE_LIMITS.featuresPerRecord) {
      throw new Error(`${name} has ${record.features.length.toLocaleString()} selected features. Protein sequence figures support at most ${PROTEIN_SEQUENCE_FIGURE_LIMITS.featuresPerRecord.toLocaleString()} selected features per record; narrow the feature filters or use the protein viewer or feature table.`);
    }
  }
  const figureRecords = proteinRecords
    .map((record, index) => ({
      id: cleanText(record.accession) || `protein-${index + 1}`,
      title: cleanText(record.title) || cleanText(record.accession) || `Protein ${index + 1}`,
      accession: cleanText(record.accession),
      organism: cleanText(record.organism),
      sequence: cleanText(record.sequence).toUpperCase(),
      ...recordFeatures(record)
    }));

  return {
    figureType: "protein-sequence-figure",
    title: cleanText(options.title) || "Annotated protein sequence figure",
    records: figureRecords,
    appearance: {
      residueCode: options.residueCode === "three" ? "three" : "one",
      residueColor: options.residueColor === "neutral" ? "neutral" : "chemistry",
      palette: options.palette === "grayscale" ? "grayscale" : "color",
      annotations: options.annotations === "sequence-only" ? "sequence-only" : "compact"
    }
  };
}

export function makeProteinSequenceFigureStream(figure) {
  return {
    kind: "figure",
    figureType: "protein-sequence-figure",
    label: "Protein sequence figure",
    figure
  };
}
