import { geneticCodes, getStartCodons } from "../../core/genetic-code.js";
import { listCodonUsageReferences } from "../../core/codon-reference.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";
import {
  RANDOM_MAX_FRAGMENTS_PER_RECORD,
  RANDOM_MAX_GENERATED_CHARACTERS,
  RANDOM_MAX_GENERATED_RECORDS,
  RANDOM_MAX_MUTATIONS_PER_RECORD,
  RANDOM_MAX_REGION_ROWS,
  randomFragmentTableColumns,
  randomMutationTableColumns,
  randomRegionTableColumns
} from "./run.js";

const codonReferenceChoices = listCodonUsageReferences(codonUsageReferences).map((reference) => ({
  value: reference.id,
  label: `${reference.name}${reference.geneticCodeId ? ` (code ${reference.geneticCodeId})` : ""}`
}));

const randomSeedOption = {
  id: "seed",
  type: "text",
  label: "Random seed",
  help: "Enter a seed to reproduce the same result; leave empty for a new random draw.",
  defaultValue: ""
};

const nucleotideAlphabetOption = {
  id: "nucleotideAlphabet",
  type: "radio",
  label: "Generated sequence type",
  defaultValue: "dna",
  choices: [
    { value: "dna", label: "DNA (uses T)" },
    { value: "rna", label: "RNA (uses U)" }
  ]
};

const replacementNucleotideAlphabetOption = {
  ...nucleotideAlphabetOption,
  label: "Replacement bases"
};

const fastaReportOutputOptions = [
  {
    id: "outputFormat",
    type: "radio",
    label: "Output format",
    defaultValue: "fasta",
    choices: [
      { value: "fasta", label: "FASTA" },
      { value: "report", label: "Summary report" }
    ]
  }
];

const fastaReportTableOutputOptions = [
  {
    id: "outputFormat",
    type: "radio",
    label: "Output format",
    defaultValue: "fasta",
    choices: [
      { value: "fasta", label: "FASTA" },
      { value: "report", label: "Summary report" },
      { value: "tsv", label: "Table" }
    ]
  }
];

const generatedOutputLimitsGroup = {
  id: "advancedLimits",
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    {
      id: "generatedOutputLimitNote",
      type: "note",
      text: `Generated FASTA output is capped at ${RANDOM_MAX_GENERATED_RECORDS.toLocaleString()} records and ${RANDOM_MAX_GENERATED_CHARACTERS.toLocaleString()} characters. Requests above those caps are reduced with a warning.`
    }
  ]
};

const mutationLimitsGroup = {
  id: "advancedLimits",
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    {
      id: "mutationLimitNote",
      type: "note",
      text: `Mutation event materialization is capped at ${RANDOM_MAX_MUTATIONS_PER_RECORD.toLocaleString()} events per input record. Requests above that cap are reduced with a warning.`
    }
  ]
};

const randomRegionLimitsGroup = {
  id: "advancedLimits",
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    {
      id: "randomRegionLimitNote",
      type: "note",
      text: `Random region materialization is capped at ${RANDOM_MAX_REGION_ROWS.toLocaleString()} regions per input record. Requests above that cap are reduced with a warning.`
    }
  ]
};

const randomFragmentLimitsGroup = {
  id: "advancedLimits",
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    {
      id: "randomFragmentLimitNote",
      type: "note",
      text: `Random DNA fragmentation is capped at ${RANDOM_MAX_FRAGMENTS_PER_RECORD.toLocaleString()} fragments per input record. Requests above that cap are reduced with a warning.`
    }
  ]
};

const dependentOptionGroup = (id, visibleWhen, options, label = "") => ({
  id,
  type: "group",
  layout: "dependent",
  label,
  visibleWhen,
  options
});

const optionGroup = (label, options, help = "") => ({
  type: "group",
  label,
  help,
  options
});

const dnaRnaCompositionOptions = (id = "compositionMode", label = "Base composition") => [
  {
    id,
    type: "radio",
    label,
    defaultValue: "equal",
    choices: [
      { value: "equal", label: "Equal A/C/G/T or U" },
      { value: "gc", label: "Set GC percent" },
      { value: "custom", label: "Custom base weights" }
    ]
  },
  dependentOptionGroup(`${id}GcSettings`, { option: id, value: "gc" }, [
    {
      id: "gcPercent",
      type: "number",
      label: "GC percent",
      defaultValue: 50,
      min: 0,
      max: 100
    }
  ]),
  dependentOptionGroup(`${id}CustomWeights`, { option: id, value: "custom" }, [
    {
      id: "weightA",
      type: "number",
      label: "A weight",
      defaultValue: 1,
      min: 0,
      max: 1000000
    },
    {
      id: "weightC",
      type: "number",
      label: "C weight",
      defaultValue: 1,
      min: 0,
      max: 1000000
    },
    {
      id: "weightG",
      type: "number",
      label: "G weight",
      defaultValue: 1,
      min: 0,
      max: 1000000
    },
    {
      id: "weightT",
      type: "number",
      label: "T/U weight",
      defaultValue: 1,
      min: 0,
      max: 1000000
    }
  ])
];

const codonUsageReferenceOption = {
  id: "codonUsageReference",
  type: "select",
  label: "Codon usage reference",
  defaultValue: codonReferenceChoices[0]?.value ?? "",
  choices: codonReferenceChoices
};

const codonUsageReferenceGroup = (id, parentOption) => dependentOptionGroup(id, parentOption, [
  codonUsageReferenceOption
]);

const mutationEventOptions = [
  {
    id: "mutationMode",
    type: "radio",
    label: "Event amount",
    defaultValue: "counts",
    choices: [
      { value: "counts", label: "Fixed counts per record" },
      { value: "probability", label: "Per-position probabilities" }
    ],
    help: "Fixed counts are easiest to reproduce. Probability mode scans mutable positions and may produce different numbers of substitutions, insertions, and deletions per record."
  },
  dependentOptionGroup("mutationCountSettings", { option: "mutationMode", value: "counts" }, [
    {
      id: "mutationCount",
      type: "number",
      label: "Substitutions per record",
      defaultValue: 5,
      min: 0,
      max: 50000,
      help: "Each substitution changes one mutable original position and is recorded in the event table."
    },
    {
      id: "insertionCount",
      type: "number",
      label: "Insertions per record",
      defaultValue: 0,
      min: 0,
      max: 50000,
      help: "Each insertion adds a random run after a mutable original position; insertion position 0 means before the first character."
    },
    {
      id: "deletionCount",
      type: "number",
      label: "Deletions per record",
      defaultValue: 0,
      min: 0,
      max: 50000,
      help: "Each deletion removes a random run from original coordinates. Overlapping deletions are avoided."
    }
  ]),
  dependentOptionGroup("mutationProbabilitySettings", { option: "mutationMode", value: "probability" }, [
    {
      id: "substitutionProbability",
      type: "number",
      label: "Substitution probability (%)",
      defaultValue: 1,
      min: 0,
      max: 100,
      step: 0.1
    },
    {
      id: "insertionProbability",
      type: "number",
      label: "Insertion probability (%)",
      defaultValue: 0,
      min: 0,
      max: 100,
      step: 0.1
    },
    {
      id: "deletionProbability",
      type: "number",
      label: "Deletion probability (%)",
      defaultValue: 0,
      min: 0,
      max: 100,
      step: 0.1
    }
  ]),
  {
    id: "insertionLength",
    type: "number",
    label: "Insertion length",
    defaultValue: 1,
    min: 1,
    max: 1000,
    help: "Number of bases or residues added for each insertion event."
  },
  {
    id: "deletionLength",
    type: "number",
    label: "Deletion length",
    defaultValue: 1,
    min: 1,
    max: 1000,
    help: "Number of original bases or residues removed for each deletion event."
  }
];

function sequenceWorkflow(alphabet, schema, includeTable = false, tableSchema = "", columns = []) {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet, schema },
      ...(includeTable ? [{ id: "tsv", kind: "text", mediaType: "text/tab-separated-values" }] : []),
      ...(includeTable ? [{ id: "table", kind: "table", schema: tableSchema, columns }] : []),
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function generatorWorkflow(alphabet, schema) {
  return {
    inputs: [],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet, schema },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function makeStartCodonChoices() {
  const choices = [
    { value: "random", label: "Random valid start codon", always: true },
    { value: "none", label: "No fixed start codon", always: true },
    { value: "custom", label: "Custom codon", always: true }
  ];
  for (const code of geneticCodes) {
    for (const codon of getStartCodons(code.id)) {
      choices.push({
        value: `codon:${codon}`,
        label: codon,
        dependsOnValue: code.id
      });
    }
  }
  return choices;
}

const mutateOptions = (preserveLabel) => [
  optionGroup("Mutation events", mutationEventOptions),
  optionGroup("Protected positions", [
    {
      id: "preserveEnds",
      type: "checkbox",
      label: preserveLabel,
      defaultValue: true,
      help: "The first residue is protected from substitution/deletion, and insertions are not placed before it."
    },
    {
      id: "preserveLastResidue",
      type: "checkbox",
      label: "Preserve last residue",
      defaultValue: true,
      help: "Useful when a protein sequence ends with * to represent a stop marker. The last residue is protected from substitution/deletion, and insertions are not placed after it."
    }
  ]),
  optionGroup("Inserted/replacement residues", [
    {
      id: "replacementResidueModel",
      type: "radio",
      label: "Residue model",
      defaultValue: "equal",
      choices: [
        { value: "equal", label: "Equal standard amino acids" },
        { value: "input", label: "Match input residue composition" },
        { value: "codon-usage-reference", label: "From codon usage reference" }
      ],
      help: "Stop markers (*) in the input can be preserved but are not introduced as random insertions or substitutions."
    },
    codonUsageReferenceGroup("mutationResidueReferenceSettings", { option: "replacementResidueModel", value: "codon-usage-reference" })
  ]),
  optionGroup("Output and reproducibility", [
    randomSeedOption,
    ...fastaReportTableOutputOptions
  ]),
  mutationLimitsGroup
];

const mutateDnaRnaOptions = (preserveLabel) => [
  optionGroup("Mutation events", mutationEventOptions),
  optionGroup("Protected positions", [
    {
      id: "preserveEnds",
      type: "checkbox",
      label: preserveLabel,
      defaultValue: true,
      help: "The preserved bases are protected from substitution/deletion, and insertions are not placed outside the mutable interior."
    }
  ]),
  optionGroup("Inserted/replacement bases", [
    replacementNucleotideAlphabetOption,
    {
      id: "replacementCompositionMode",
      type: "radio",
      label: "Composition model",
      defaultValue: "equal",
      choices: [
        { value: "equal", label: "Equal bases" },
        { value: "input", label: "Match input base composition" },
        { value: "gc", label: "Set GC percent" },
        { value: "custom", label: "Custom base weights" }
      ]
    },
    ...dnaRnaCompositionOptions("replacementCompositionMode", "Composition model").slice(1)
  ]),
  optionGroup("Output and reproducibility", [
    randomSeedOption,
    ...fastaReportTableOutputOptions
  ]),
  mutationLimitsGroup
];

const randomDnaRnaSequenceOptions = [
  nucleotideAlphabetOption,
  { id: "sequenceLength", type: "number", label: "Sequence length", defaultValue: 1000000, min: 1, max: 5000000 },
  { id: "sequenceCount", type: "number", label: "Number of sequences", defaultValue: 1, min: 1, max: 10000 },
  ...dnaRnaCompositionOptions("compositionMode", "Base composition"),
  randomSeedOption,
  ...fastaReportOutputOptions,
  generatedOutputLimitsGroup
];

const randomProteinSequenceOptions = [
  { id: "sequenceLength", type: "number", label: "Sequence length", defaultValue: 120, min: 1, max: 5000000 },
  { id: "sequenceCount", type: "number", label: "Number of sequences", defaultValue: 3, min: 1, max: 10000 },
  {
    id: "residueModel",
    type: "radio",
    label: "Residue model",
    defaultValue: "equal",
    choices: [
      { value: "equal", label: "Equal standard amino acids" },
      { value: "codon-usage-reference", label: "From codon usage reference" }
    ],
    help: "Reference mode samples amino acids from the amino-acid frequencies implied by a bundled codon usage table; it does not introduce stop symbols."
  },
  codonUsageReferenceGroup("residueModelReferenceSettings", { option: "residueModel", value: "codon-usage-reference" }),
  randomSeedOption,
  ...fastaReportOutputOptions,
  generatedOutputLimitsGroup
];

const sampleOptions = [
  { id: "sampleLength", type: "number", label: "Sample length", defaultValue: 120, min: 1, max: 5000000 },
  { id: "samplesPerRecord", type: "number", label: "Number of sampled sequences", defaultValue: 2, min: 1, max: 10000 },
  {
    id: "sampleSource",
    type: "radio",
    label: "Sampling source",
    defaultValue: "combined",
    choices: [
      { value: "combined", label: "All input records combined" },
      { value: "per-record", label: "Each input record separately" }
    ],
    help: "Combined mode builds one residue/base pool from all input records before sampling with replacement."
  },
  randomSeedOption,
  ...fastaReportOutputOptions,
  generatedOutputLimitsGroup
];

const regionOptions = [
  { id: "regionCount", type: "number", label: "Random regions per record", defaultValue: 3, min: 0, max: 50000 },
  { id: "regionLength", type: "number", label: "Region length", defaultValue: 8, min: 1, max: 5000000 },
  {
    id: "regionTarget",
    type: "radio",
    label: "Region target",
    defaultValue: "randomize-selected",
    choices: [
      { value: "randomize-selected", label: "Randomize selected regions" },
      { value: "preserve-selected", label: "Preserve selected regions; randomize the rest" }
    ]
  },
  {
    id: "replacementResidueModel",
    type: "radio",
    label: "Replacement residues",
    defaultValue: "equal",
    choices: [
      { value: "equal", label: "Equal standard amino acids" },
      { value: "input", label: "Match input residue composition" },
      { value: "codon-usage-reference", label: "From codon usage reference" }
    ]
  },
  codonUsageReferenceGroup("replacementResidueReferenceSettings", { option: "replacementResidueModel", value: "codon-usage-reference" }),
  randomSeedOption,
  ...fastaReportTableOutputOptions,
  randomRegionLimitsGroup
];

const dnaRnaRegionOptions = [
  { id: "regionCount", type: "number", label: "Random regions per record", defaultValue: 3, min: 0, max: 50000 },
  { id: "regionLength", type: "number", label: "Region length", defaultValue: 8, min: 1, max: 5000000 },
  {
    id: "regionTarget",
    type: "radio",
    label: "Region target",
    defaultValue: "randomize-selected",
    choices: [
      { value: "randomize-selected", label: "Randomize selected regions" },
      { value: "preserve-selected", label: "Preserve selected regions; randomize the rest" }
    ]
  },
  replacementNucleotideAlphabetOption,
  {
    id: "replacementCompositionMode",
    type: "radio",
    label: "Replacement composition",
    defaultValue: "equal",
    choices: [
      { value: "equal", label: "Equal bases" },
      { value: "input", label: "Match input base composition" },
      { value: "gc", label: "Set GC percent" },
      { value: "custom", label: "Custom base weights" }
    ]
  },
  ...dnaRnaCompositionOptions("replacementCompositionMode", "Replacement composition").slice(1),
  randomSeedOption,
  ...fastaReportTableOutputOptions,
  randomRegionLimitsGroup
];

const shuffleOptions = [randomSeedOption, ...fastaReportOutputOptions];

export const mutateDnaRnaMetadata = {
  id: "mutate-dna-rna",
  name: "Mutate DNA/RNA",
  category: "Random & Mutagenesis",
  tags: ["DNA", "RNA", "raw", "FASTA"],
  summary: "Introduce random substitutions, insertions, and deletions into DNA/RNA sequences with an optional reproducible seed.",
  inputType: "DNA/RNA sequence",
  outputType: "Mutated DNA/RNA FASTA, mutation event table",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runMutateDnaRna",
  workflow: sequenceWorkflow("dna-rna", "mutate-dna-rna", true, "random-mutations", randomMutationTableColumns),
  options: mutateDnaRnaOptions("Preserve first and last 3 bases")
};

export const mutateProteinMetadata = {
  id: "mutate-protein",
  name: "Mutate Protein",
  category: "Random & Mutagenesis",
  tags: ["protein", "raw", "FASTA"],
  summary: "Introduce random residue substitutions, insertions, and deletions into protein sequences with an optional reproducible seed.",
  inputType: "Protein sequence",
  outputType: "Mutated protein FASTA, mutation event table",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runMutateProtein",
  workflow: sequenceWorkflow("protein", "mutate-protein", true, "random-mutations", randomMutationTableColumns),
  options: mutateOptions("Preserve first residue")
};

export const randomDnaRnaMetadata = {
  id: "random-dna-rna",
  name: "Random DNA/RNA Sequence",
  category: "Random & Mutagenesis",
  tags: ["DNA", "RNA", "FASTA"],
  summary: "Generate random DNA or RNA sequences of a requested length with an optional reproducible seed.",
  inputType: "No input required",
  inputRequired: false,
  outputType: "Random DNA/RNA FASTA",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runRandomDnaRna",
  workflow: generatorWorkflow("dna-rna", "random-dna-rna"),
  options: randomDnaRnaSequenceOptions
};

export const randomProteinMetadata = {
  id: "random-protein",
  name: "Random Protein Sequence",
  category: "Random & Mutagenesis",
  tags: ["protein", "FASTA"],
  summary: "Generate random protein sequences of a requested length with an optional reproducible seed.",
  inputType: "No input required",
  inputRequired: false,
  outputType: "Random protein FASTA",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runRandomProtein",
  workflow: generatorWorkflow("protein", "random-protein"),
  options: randomProteinSequenceOptions
};

export const randomCodingDnaMetadata = {
  id: "random-coding-dna",
  name: "Random Coding DNA",
  category: "Random & Mutagenesis",
  tags: ["DNA", "FASTA", "genetic code", "codon"],
  summary: "Generate random coding DNA with a start codon, internal sense codons, and a stop codon.",
  inputType: "No input required",
  inputRequired: false,
  outputType: "Random coding DNA FASTA",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runRandomCodingDna",
  workflow: generatorWorkflow("dna-rna", "random-coding-dna"),
  options: [
    { id: "codonCount", type: "number", label: "Codons including start and stop", defaultValue: 30, min: 2, max: 1000000 },
    {
      id: "geneticCode",
      type: "select",
      label: "Genetic code",
      defaultValue: "1",
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
    },
    {
      id: "startCodonChoice",
      type: "select",
      label: "Start codon",
      defaultValue: "random",
      dependsOn: "geneticCode",
      choices: makeStartCodonChoices()
    },
    dependentOptionGroup("customStartCodonSettings", { option: "startCodonChoice", value: "custom" }, [
      {
        id: "customStartCodon",
        type: "text",
        label: "Custom start codon",
        help: "Used only when Start codon is set to Custom codon. Enter one DNA sense codon, for example ATG, GTG, or TTG.",
        defaultValue: "ATG"
      }
    ]),
    {
      id: "codonModel",
      type: "radio",
      label: "Internal codon model",
      defaultValue: "equal",
      choices: [
        { value: "equal", label: "Equal sense codons" },
        { value: "codon-usage-reference", label: "Codon usage reference" }
      ],
      help: "Reference mode weights internal sense codons by a bundled codon usage table; the selected start and final stop codon are controlled separately."
    },
    codonUsageReferenceGroup("codonModelReferenceSettings", { option: "codonModel", value: "codon-usage-reference" }),
    { id: "sequenceCount", type: "number", label: "Number of sequences", defaultValue: 3, min: 1, max: 10000 },
    randomSeedOption,
    ...fastaReportOutputOptions,
    generatedOutputLimitsGroup
  ]
};

export const randomDnaRnaRegionsMetadata = {
  id: "random-dna-rna-regions",
  name: "Random DNA/RNA Regions",
  category: "Random & Mutagenesis",
  tags: ["DNA", "RNA", "raw", "FASTA"],
  summary: "Replace randomly selected DNA/RNA regions with random bases using an optional reproducible seed.",
  inputType: "DNA/RNA sequence",
  outputType: "Randomized DNA/RNA FASTA, region table",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runRandomDnaRnaRegions",
  workflow: sequenceWorkflow("dna-rna", "random-dna-rna-regions", true, "random-regions", randomRegionTableColumns),
  options: dnaRnaRegionOptions
};

export const randomProteinRegionsMetadata = {
  id: "random-protein-regions",
  name: "Random Protein Regions",
  category: "Random & Mutagenesis",
  tags: ["protein", "raw", "FASTA"],
  summary: "Replace randomly selected protein regions with random residues using an optional reproducible seed.",
  inputType: "Protein sequence",
  outputType: "Randomized protein FASTA, region table",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runRandomProteinRegions",
  workflow: sequenceWorkflow("protein", "random-protein-regions", true, "random-regions", randomRegionTableColumns),
  options: regionOptions
};

export const sampleDnaRnaMetadata = {
  id: "sample-dna-rna",
  name: "Sample DNA/RNA",
  category: "Random & Mutagenesis",
  tags: ["DNA", "RNA", "raw", "FASTA"],
  summary: "Sample bases with replacement from each DNA/RNA input record to build new sequences.",
  inputType: "DNA/RNA sequence",
  outputType: "Sampled DNA/RNA FASTA",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runSampleDnaRna",
  workflow: sequenceWorkflow("dna-rna", "sampled-dna-rna"),
  options: sampleOptions
};

export const sampleProteinMetadata = {
  id: "sample-protein",
  name: "Sample Protein",
  category: "Random & Mutagenesis",
  tags: ["protein", "raw", "FASTA"],
  summary: "Sample residues with replacement from each protein input record to build new sequences.",
  inputType: "Protein sequence",
  outputType: "Sampled protein FASTA",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runSampleProtein",
  workflow: sequenceWorkflow("protein", "sampled-protein"),
  options: sampleOptions
};

export const shuffleDnaRnaMetadata = {
  id: "shuffle-dna-rna",
  name: "Shuffle DNA/RNA",
  category: "Random & Mutagenesis",
  tags: ["DNA", "RNA", "raw", "FASTA"],
  summary: "Randomly shuffle each DNA/RNA input sequence while preserving composition.",
  inputType: "DNA/RNA sequence",
  outputType: "Shuffled DNA/RNA FASTA",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runShuffleDnaRna",
  workflow: sequenceWorkflow("dna-rna", "shuffled-dna-rna"),
  options: shuffleOptions
};

export const shuffleProteinMetadata = {
  id: "shuffle-protein",
  name: "Shuffle Protein",
  category: "Random & Mutagenesis",
  tags: ["protein", "raw", "FASTA"],
  summary: "Randomly shuffle each protein input sequence while preserving composition.",
  inputType: "Protein sequence",
  outputType: "Shuffled protein FASTA",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runShuffleProtein",
  workflow: sequenceWorkflow("protein", "shuffled-protein"),
  options: shuffleOptions
};

export const randomDnaFragmenterMetadata = {
  id: "random-dna-fragmenter",
  name: "Random DNA Fragmenter",
  category: "Random & Mutagenesis",
  tags: ["DNA", "raw", "FASTA", "coordinates"],
  summary: "Fragment DNA sequences reproducibly by random cut count or approximate target fragment size, with optional overlaps.",
  inputType: "DNA sequence",
  outputType: "Fragment FASTA, coordinate table",
  runInWorker: true,
  workerModule: "../tools/random-sequence/run.js",
  workerExport: "runRandomDnaFragmenter",
  workflow: sequenceWorkflow("dna-rna", "random-dna-fragments", true, "random-dna-fragments", randomFragmentTableColumns),
  options: [
    {
      id: "fragmentMode",
      type: "radio",
      label: "Fragment mode",
      defaultValue: "count",
      choices: [
        { value: "count", label: "Desired fragment count" },
        { value: "target-size", label: "Approximate target size" }
      ]
    },
    dependentOptionGroup("fragmentCountSettings", { option: "fragmentMode", value: "count" }, [
      {
        id: "fragmentCount",
        type: "number",
        label: "Fragments per record",
        defaultValue: 8,
        min: 1,
        max: 20000
      }
    ]),
    dependentOptionGroup("targetFragmentSizeSettings", { option: "fragmentMode", value: "target-size" }, [
      {
        id: "targetSize",
        type: "number",
        label: "Target fragment size",
        defaultValue: 120,
        min: 1,
        max: 5000000
      },
      {
        id: "sizeVariationPercent",
        type: "number",
        label: "Size variation percent",
        defaultValue: 20,
        min: 0,
        max: 90
      }
    ]),
    {
      id: "overlapLength",
      type: "number",
      label: "Desired overlap",
      defaultValue: 0,
      min: 0,
      max: 1000000
    },
    {
      id: "topology",
      type: "radio",
      label: "Input topology",
      defaultValue: "linear",
      choices: [
        { value: "linear", label: "Linear" },
        { value: "circular", label: "Circular" }
      ]
    },
    {
      id: "randomReverseComplement",
      type: "checkbox",
      label: "Randomly reverse-complement fragments",
      defaultValue: false,
      help: "When enabled, each fragment has an independent 50% chance of being reported in reverse-complement orientation. Coordinates still refer to the original input strand."
    },
    randomSeedOption,
    ...fastaReportTableOutputOptions,
    randomFragmentLimitsGroup
  ]
};
