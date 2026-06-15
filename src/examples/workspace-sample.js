const sampleCreatedAt = "2026-06-06T00:00:00.000Z";

const lacZAlphaSequence = [
  "TTGACAGGATCCGCTAGCGAATTCACCATGACCATGATCACCCCCAGCCTGCACGCCTGCCGCAGCACCCTGGAAGACGAC",
  "GGATCCGCATGCGACTACAAGCTTAACGTTGACGACTGAGAATTCAAGCTTGGGATCCCTCGAGTCGACCTGCAGAAATTCC",
  "GGATCCGCTAGCTAGCT"
].join("");

const primerTemplateSequence = [
  "TTGACCATGATTACGCCAAGGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTCGTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTC",
  "ACAATTCCACACAACATACGAGCCGGAAGCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTATTGCGTTGCGCTCACTGCCCGCTTTCCAGTCGGGAAACCTGTC",
  "GTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTATTGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTC"
].join("");

const proteinMotifSequence = "MTEITAAMVKELRESTGAGMMDCKNALSETQHEWAYDGLKEMEKKLQDKAKGQPMTSVYRRVAVMSKNP";

function makeSequence(record) {
  return {
    ...record,
    length: record.sequence.length,
    sourceToolId: "workspace-sample",
    sourceToolName: record.sourceToolName || "Sample workspace",
    sourceStreamId: "sample",
    createdAt: sampleCreatedAt,
    updatedAt: sampleCreatedAt
  };
}

function makeLayer(record) {
  return {
    kind: "feature-layer",
    version: 1,
    sequenceHash: "",
    coordinateUnit: record.alphabet === "protein" ? "residue" : "base",
    generatedBy: {
      toolId: "workspace-sample",
      toolName: record.sourceToolName || "Sample workspace",
      options: {}
    },
    source: {
      streamId: "sample",
      recordId: record.sequenceId,
      recordTitle: record.recordTitle || ""
    },
    createdAt: sampleCreatedAt,
    updatedAt: sampleCreatedAt,
    warnings: [],
    citations: [],
    ...record
  };
}

export const workspaceSamples = [
  {
    id: "lacz-alpha-annotations",
    name: "Circular lacZ-alpha record",
    description: "A circular DNA/RNA plasmid-region record with separate annotation and restriction-site layers, plus the translated peptide sequence.",
    sourceTypes: ["Circular DNA/RNA record", "Protein record"],
    sequences: [
      makeSequence({
        id: "sample-workspace-lacz-plasmid",
        name: "Sample lacZ-alpha plasmid region",
        sequence: lacZAlphaSequence,
        alphabet: "dna-rna",
        topology: "circular"
      }),
      makeSequence({
        id: "sample-workspace-lacz-alpha-protein",
        name: "Sample lacZ-alpha peptide",
        sequence: "MTMITPSLHACRSTLED",
        alphabet: "protein",
        topology: ""
      })
    ],
    featureLayers: [
      makeLayer({
        id: "sample-workspace-lacz-plasmid-annotation-layer",
        sequenceId: "sample-workspace-lacz-plasmid",
        alphabet: "dna-rna",
        label: "Sample annotations",
        trackId: "sample-annotations",
        recordTitle: "Sample lacZ-alpha plasmid region",
        features: [
          {
            start: 15,
            end: 45,
            label: "lac promoter",
            name: "lac promoter",
            type: "promoter",
            strand: "+",
            length: 31,
            location: "15..45",
            source: "Sample workspace"
          },
          {
            start: 54,
            end: 137,
            label: "lacZ-alpha",
            name: "lacZ-alpha",
            type: "gene",
            strand: "+",
            length: 84,
            location: "54..137",
            source: "Sample workspace"
          },
          {
            start: 54,
            end: 137,
            label: "lacZ-alpha CDS",
            name: "lacZ-alpha CDS",
            type: "CDS",
            strand: "+",
            length: 84,
            location: "54..137",
            source: "Sample workspace"
          },
          {
            start: 143,
            end: 171,
            label: "multiple cloning site",
            name: "multiple cloning site",
            type: "misc_feature",
            strand: "+",
            length: 29,
            location: "143..171",
            source: "Sample workspace"
          }
        ]
      }),
      makeLayer({
        id: "sample-workspace-lacz-plasmid-restriction-layer",
        sequenceId: "sample-workspace-lacz-plasmid",
        alphabet: "dna-rna",
        label: "Restriction markers",
        trackId: "sample-restriction-markers",
        recordTitle: "Sample lacZ-alpha plasmid region",
        features: [
          {
            start: 7,
            end: 12,
            label: "BamHI",
            name: "BamHI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "7..12",
            source: "Sample workspace"
          },
          {
            start: 19,
            end: 24,
            label: "EcoRI",
            name: "EcoRI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "19..24",
            source: "Sample workspace"
          },
          {
            start: 100,
            end: 105,
            label: "HindIII",
            name: "HindIII",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "100..105",
            source: "Sample workspace"
          },
          {
            start: 140,
            end: 145,
            label: "XhoI",
            name: "XhoI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "140..145",
            source: "Sample workspace"
          },
          {
            start: 145,
            end: 150,
            label: "SalI",
            name: "SalI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "145..150",
            source: "Sample workspace"
          },
          {
            start: 151,
            end: 156,
            label: "PstI",
            name: "PstI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "151..156",
            source: "Sample workspace"
          }
        ]
      })
    ]
  },
  {
    id: "primer-restriction-review",
    name: "Linear cloning template",
    description: "A linear DNA/RNA template with separate primer-binding and restriction-site layers attached to the same saved sequence.",
    sourceTypes: ["Linear DNA/RNA record"],
    sequences: [
      makeSequence({
        id: "sample-workspace-primer-template",
        name: "Sample cloning template",
        sequence: primerTemplateSequence,
        alphabet: "dna-rna",
        topology: "linear"
      })
    ],
    featureLayers: [
      makeLayer({
        id: "sample-workspace-primer-template-primer-layer",
        sequenceId: "sample-workspace-primer-template",
        alphabet: "dna-rna",
        label: "Primer binding sites",
        trackId: "primer-binding-sites",
        recordTitle: "Sample cloning template",
        features: [
          {
            start: 1,
            end: 20,
            label: "lac_forward_20",
            name: "lac_forward_20",
            type: "primer",
            strand: "+",
            length: 20,
            location: "1..20",
            source: "Sample workspace"
          },
          {
            start: 37,
            end: 56,
            label: "mcs_forward_20",
            name: "mcs_forward_20",
            type: "primer",
            strand: "+",
            length: 20,
            location: "37..56",
            source: "Sample workspace"
          },
          {
            start: 78,
            end: 97,
            label: "lac_reverse_20",
            name: "lac_reverse_20",
            type: "primer",
            strand: "-",
            length: 20,
            location: "complement(78..97)",
            source: "Sample workspace"
          },
          {
            start: 116,
            end: 135,
            label: "mcs_reverse_20",
            name: "mcs_reverse_20",
            type: "primer",
            strand: "-",
            length: 20,
            location: "complement(116..135)",
            source: "Sample workspace"
          }
        ]
      }),
      makeLayer({
        id: "sample-workspace-primer-template-restriction-layer",
        sequenceId: "sample-workspace-primer-template",
        alphabet: "dna-rna",
        label: "Restriction sites",
        trackId: "restriction-sites",
        recordTitle: "Sample cloning template",
        features: [
          {
            start: 36,
            end: 41,
            label: "PstI",
            name: "PstI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "36..41",
            source: "Sample workspace"
          },
          {
            start: 49,
            end: 54,
            label: "BamHI",
            name: "BamHI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "49..54",
            source: "Sample workspace"
          },
          {
            start: 65,
            end: 70,
            label: "EcoRI",
            name: "EcoRI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "65..70",
            source: "Sample workspace"
          },
          {
            start: 174,
            end: 179,
            label: "PstI",
            name: "PstI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "174..179",
            source: "Sample workspace"
          },
          {
            start: 226,
            end: 231,
            label: "EcoRI",
            name: "EcoRI",
            type: "restriction_site",
            strand: "+",
            length: 6,
            location: "226..231",
            source: "Sample workspace"
          }
        ]
      })
    ]
  },
  {
    id: "protein-feature-review",
    name: "Protein feature record",
    description: "A protein record with separate region and motif layers for checking protein viewer overlays.",
    sourceTypes: ["Protein record"],
    sequences: [
      makeSequence({
        id: "sample-workspace-protein-motif-record",
        name: "Sample motif-rich protein",
        sequence: proteinMotifSequence,
        alphabet: "protein",
        topology: ""
      })
    ],
    featureLayers: [
      makeLayer({
        id: "sample-workspace-protein-motif-layer",
        sequenceId: "sample-workspace-protein-motif-record",
        alphabet: "protein",
        label: "Protein regions",
        trackId: "protein-regions",
        recordTitle: "Sample motif-rich protein",
        features: [
          {
            start: 1,
            end: 8,
            label: "N-terminal segment",
            name: "N-terminal segment",
            type: "region",
            strand: "",
            length: 8,
            location: "1..8",
            source: "Sample workspace"
          },
          {
            start: 9,
            end: 24,
            label: "helical domain",
            name: "helical domain",
            type: "domain",
            strand: "",
            length: 16,
            location: "9..24",
            source: "Sample workspace"
          },
          {
            start: 25,
            end: 32,
            label: "acidic patch",
            name: "acidic patch",
            type: "low_complexity",
            strand: "",
            length: 8,
            location: "25..32",
            source: "Sample workspace"
          }
        ]
      }),
      makeLayer({
        id: "sample-workspace-protein-motif-hit-layer",
        sequenceId: "sample-workspace-protein-motif-record",
        alphabet: "protein",
        label: "Protein motif hits",
        trackId: "protein-motif-hits",
        recordTitle: "Sample motif-rich protein",
        features: [
          {
            start: 23,
            end: 24,
            label: "Cys-Lys site",
            name: "Cys-Lys site",
            type: "motif",
            strand: "",
            length: 2,
            location: "23..24",
            source: "Sample workspace"
          },
          {
            start: 40,
            end: 51,
            label: "Lys-rich patch",
            name: "Lys-rich patch",
            type: "motif",
            strand: "",
            length: 12,
            location: "40..51",
            source: "Sample workspace"
          },
          {
            start: 54,
            end: 62,
            label: "basic motif",
            name: "basic motif",
            type: "motif",
            strand: "",
            length: 9,
            location: "54..62",
            source: "Sample workspace"
          }
        ]
      })
    ]
  }
];

export const sampleWorkspaceSequences = workspaceSamples[0].sequences;
export const sampleWorkspaceFeatureLayers = workspaceSamples[0].featureLayers;
