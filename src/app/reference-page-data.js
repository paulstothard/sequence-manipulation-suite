import { codonUsageReferences } from "../reference-data/codon-usage/references.js";
import dnaRnaMotifs from "../reference-data/motifs/dna-rna-motifs.js";
import proteinMotifs from "../reference-data/motifs/protein-motifs.js";
import motifProvenance from "../reference-data/motifs/provenance.js";
import technicalSequenceSummary from "../reference-data/technical-sequences/summary.js";
import technicalSequenceProvenance from "../reference-data/technical-sequences/provenance.js";
import vectorContaminationSummary from "../reference-data/vector-contamination/summary.js";
import vectorContaminationProvenance from "../reference-data/vector-contamination/provenance.js";
import { restrictionEnzymeRecords } from "../reference-data/restriction-enzymes/records.js";
import referenceDataManifest from "../reference-data/datasets.js";
import {
  referenceDataLicenseTerms,
  softwareLicenseAttributions
} from "../reference-data/license-attributions.js";
import { formatToolLimitDisclosure } from "../tools/limit-disclosure.js";
import { describeWorkflowStreamChoice } from "./workflow-stream-labels.js";

function flattenOptions(options = []) {
  const flattened = [];
  for (const option of options) {
    if (option.type === "group" && Array.isArray(option.options)) {
      flattened.push(...flattenOptions(option.options));
    } else {
      flattened.push(option);
    }
  }
  return flattened;
}

// Reference values below are UI reference content, not analysis logic.
// Nucleotide base codes cite the DDBJ/ENA/GenBank Feature Table Definition:
// https://www.ddbj.nig.ac.jp/ddbj/feature-table.html
// Amino-acid abbreviations cite the same maintained INSDC feature-table spec.
// Genetic-code names and transl_table identifiers cite NCBI Genetic Codes:
// https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi
function makeCodonReferenceRows() {
  return codonUsageReferences.map((reference) => {
    const skipped = reference.buildStats?.skipped
      ? Object.entries(reference.buildStats.skipped)
          .filter(([, count]) => count > 0)
          .map(([key, count]) => `${key}: ${count}`)
          .join("; ") || "none"
      : "not applicable";
    return [
      reference.name,
      reference.organism,
      `${reference.geneticCode.id}. ${reference.geneticCode.name}`,
      String(reference.totals.senseCodons),
      String(reference.buildStats?.countedCds ?? ""),
      skipped,
      reference.source.accessDate,
      `${reference.source.name} ${reference.source.version}`.trim(),
      reference.description
    ];
  });
}

function makeMotifReferenceRows() {
  return [...dnaRnaMotifs, ...proteinMotifs]
    .sort(
      (left, right) =>
        left.alphabet.localeCompare(right.alphabet) ||
        left.class.localeCompare(right.class) ||
        left.name.localeCompare(right.name)
    )
    .map((motif) => [
      motif.name,
      motif.alphabet === "protein" ? "Protein" : "DNA/RNA",
      motif.class,
      motif.syntax,
      motif.pattern,
      `${motif.source.name} ${motif.source.version}`.trim(),
      motif.source.accessDate,
      motif.description
    ]);
}

function makeTechnicalSequenceReferenceRows() {
  return technicalSequenceSummary
    .map((record) => [
      record.name,
      record.class,
      record.syntax,
      record.pattern,
      `${record.source.name} ${record.source.version}`.trim(),
      record.source.accessDate,
      record.description
    ])
    .sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]));
}

function makeVectorContaminationReferenceRows() {
  return [
    [
      vectorContaminationSummary.dataset,
      vectorContaminationSummary.sourceName,
      vectorContaminationSummary.sourceVersion,
      String(vectorContaminationSummary.recordCount),
      String(vectorContaminationSummary.totalBases),
      String(vectorContaminationSummary.kmerLength),
      String(vectorContaminationSummary.indexFormatVersion),
      vectorContaminationProvenance.accessDate,
      vectorContaminationProvenance.buildScript,
      vectorContaminationSummary.matchModel
    ]
  ];
}

function makeReferenceDataManifestRows() {
  return referenceDataManifest.datasets.map((dataset) => [
    dataset.name,
    dataset.id,
    dataset.fetchScript ?? "none",
    dataset.buildScript,
    dataset.offlineBuild ? "yes" : "no",
    dataset.requiresNetworkForFetch ? "yes" : "no",
    dataset.sourceDirectory ?? "none",
    dataset.generatedFiles.join("; "),
    dataset.validationTest,
    dataset.notes
  ]);
}

function makeLicenseAttributionRows() {
  const softwareRows = softwareLicenseAttributions.map((entry) => [
    entry.category,
    entry.name,
    entry.version,
    entry.license,
    entry.sourceUrl,
    entry.bundledPath,
    entry.notes
  ]);

  const referenceRows = referenceDataManifest.datasets.map((dataset) => {
    const terms = referenceDataLicenseTerms[dataset.id] ?? {};
    return [
      "Reference data",
      dataset.name,
      terms.version ?? "see generated files",
      terms.license ?? "not recorded",
      terms.sourceUrl ?? terms.source ?? "see provenance files",
      dataset.generatedFiles.join("; "),
      [
        terms.source ? `Source: ${terms.source}` : "",
        terms.notes ?? dataset.notes,
        `Build: ${dataset.buildScript}`,
        `Validation: ${dataset.validationTest}`
      ]
        .filter(Boolean)
        .join(" ")
    ];
  });

  return [...softwareRows, ...referenceRows];
}

function formatToolSummaryContract(contracts, fallback) {
  const visibleContracts = (contracts ?? []).filter((contract) =>
    contract.id !== "primary" || (contracts ?? []).length === 1
  );
  const labels = visibleContracts
    .map((contract) => describeWorkflowStreamChoice(contract))
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];
  return uniqueLabels.length > 0 ? uniqueLabels.join("; ") : fallback;
}

function formatToolSummaryTableOutputs(outputs) {
  const labels = (outputs ?? [])
    .filter((output) => output.kind === "table" || output.mediaType?.includes("tab-separated-values") || output.mediaType?.includes("csv"))
    .map((output) => describeWorkflowStreamChoice(output))
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];
  return uniqueLabels.length > 0 ? uniqueLabels.join("; ") : "None";
}

function formatToolSummaryWhenToUse(metadata) {
  return String(metadata.whenToUse ?? "").trim() || "Not specified";
}

function formatToolSummaryOptionNotes(metadata) {
  const notes = flattenOptions(metadata.options ?? [])
    .filter((option) => option.type === "note")
    .map((option) => String(option.text ?? "").trim())
    .filter(Boolean);
  const uniqueNotes = [...new Set(notes)];
  return uniqueNotes.length > 0 ? uniqueNotes.join(" ") : "None";
}

function formatToolSummaryMetadataChecks(metadata) {
  const checks = [];
  const outputs = metadata.workflow?.outputs ?? [];
  const outputIds = outputs.map((output) => output.id);
  const duplicateOutputIds = [...new Set(outputIds.filter((id, index) => outputIds.indexOf(id) !== index))];
  if (!metadata.workflow?.inputs?.length && metadata.inputRequired !== false) {
    checks.push("missing workflow inputs");
  }
  if (!outputs.length) {
    checks.push("missing workflow outputs");
  }
  if (duplicateOutputIds.length > 0) {
    checks.push(`duplicate outputs: ${duplicateOutputIds.join(", ")}`);
  }
  const tableOutputs = outputs.filter((output) => output.kind === "table");
  for (const output of tableOutputs) {
    if (!output.schema) {
      checks.push(`${output.id} table has no schema`);
    }
    if (output.schema !== "generic-table" && !(output.columns ?? []).length) {
      checks.push(`${output.id} table has no columns`);
    }
  }
  const outputFormat = flattenOptions(metadata.options ?? []).find((option) => option.id === "outputFormat");
  const hasDelimitedChoice = (outputFormat?.choices ?? []).some((choice) => choice.value === "tsv" || choice.value === "csv");
  if (hasDelimitedChoice && tableOutputs.length === 0) {
    checks.push("TSV/CSV format has no table output");
  }
  return checks.length > 0 ? checks.join("; ") : "OK";
}

function makeToolSummaryRecords(sortedTools) {
  return sortedTools.map((tool) => {
    const { metadata } = tool;
    return {
      name: metadata.name,
      summary: metadata.summary,
      whenToUse: formatToolSummaryWhenToUse(metadata),
      inputLabel: metadata.inputType,
      acceptedInputs: formatToolSummaryContract(metadata.workflow?.inputs, metadata.inputType),
      outputLabel: metadata.outputType,
      producedOutputs: formatToolSummaryContract(metadata.workflow?.outputs, metadata.outputType),
      tableOutputs: formatToolSummaryTableOutputs(metadata.workflow?.outputs),
      limits: formatToolLimitDisclosure(metadata),
      optionNotes: formatToolSummaryOptionNotes(metadata),
      metadataCheck: formatToolSummaryMetadataChecks(metadata),
      category: metadata.category,
      tags: metadata.tags,
      toolId: metadata.id,
      directLink: `#tool=${metadata.id}`
    };
  });
}

function makeRestrictionEnzymeRows() {
  return restrictionEnzymeRecords.map((enzyme) => [
    enzyme.name,
    enzyme.recognition,
    enzyme.cutTop,
    enzyme.cutBottom,
    enzyme.overhang,
    enzyme.source
  ]);
}

export function getRestrictionOverhangLabel(overhang) {
  if (overhang === "5 prime") return "5' overhang";
  if (overhang === "3 prime") return "3' overhang";
  return overhang || "unknown";
}

export function makeReferenceTopics(sortedTools) {
  return [
  {
    id: "tool-summary",
    label: "Tool catalog",
    title: "Tool Catalog",
    summary: `Search registered SMS3 tools by name, category, tag, input, output, or ID. ${sortedTools.length.toLocaleString()} tools are listed by category with compact summaries and expandable metadata.`,
    interactive: "tool-summary",
    records: makeToolSummaryRecords(sortedTools),
    notes: [
      "Compact cards show the user-facing summary plus high-level inputs, outputs, and tags for scanning.",
      "Details sections show when-to-use text, concise input/output lists, limits, notes, direct-link IDs, tags, and metadata checks.",
      "Warnings from metadata checks are shown on compact cards; normal OK checks are kept inside Details."
    ],
    citations: []
  },
  {
    id: "iupac-nucleotide",
    label: "IUPAC nucleotide codes",
    title: "IUPAC Nucleotide Codes",
    summary: "DNA/RNA base symbols, ambiguity symbols, and complements used by sequence tools.",
    columns: ["Code", "Meaning", "Complement"],
    rows: [
      ["A", "Adenine", "T or U"],
      ["C", "Cytosine", "G"],
      ["G", "Guanine", "C"],
      ["T", "Thymine", "A"],
      ["U", "Uracil", "A"],
      ["R", "A or G", "Y"],
      ["Y", "C or T/U", "R"],
      ["S", "G or C", "S"],
      ["W", "A or T/U", "W"],
      ["K", "G or T/U", "M"],
      ["M", "A or C", "K"],
      ["B", "C, G, or T/U", "V"],
      ["D", "A, G, or T/U", "H"],
      ["H", "A, C, or T/U", "D"],
      ["V", "A, C, or G", "B"],
      ["N", "Any base", "N"],
      [". or -", "Gap", ". or -"]
    ],
    notes: [
      "SMS3 treats U as the RNA counterpart of T when complementing mixed DNA/RNA input.",
      "Gap handling is tool-specific; tools that preserve gaps should document that behavior."
    ],
    citations: [
      {
        label: "DDBJ/ENA/GenBank Feature Table Definition v11.3, nucleotide base codes",
        url: "https://www.ddbj.nig.ac.jp/ddbj/feature-table.html"
      }
    ]
  },
  {
    id: "iupac-amino-acid",
    label: "IUPAC amino acid codes",
    title: "IUPAC Amino Acid Codes",
    summary: "One-letter and three-letter symbols used for protein sequence input and output.",
    columns: ["Code", "Three-letter", "Meaning"],
    rows: [
      ["A", "Ala", "Alanine"],
      ["B", "Asx", "Aspartic acid or asparagine"],
      ["C", "Cys", "Cysteine"],
      ["D", "Asp", "Aspartic acid"],
      ["E", "Glu", "Glutamic acid"],
      ["F", "Phe", "Phenylalanine"],
      ["G", "Gly", "Glycine"],
      ["H", "His", "Histidine"],
      ["I", "Ile", "Isoleucine"],
      ["J", "Xle", "Leucine or isoleucine"],
      ["K", "Lys", "Lysine"],
      ["L", "Leu", "Leucine"],
      ["M", "Met", "Methionine"],
      ["N", "Asn", "Asparagine"],
      ["O", "Pyl", "Pyrrolysine"],
      ["P", "Pro", "Proline"],
      ["Q", "Gln", "Glutamine"],
      ["R", "Arg", "Arginine"],
      ["S", "Ser", "Serine"],
      ["T", "Thr", "Threonine"],
      ["U", "Sec", "Selenocysteine"],
      ["V", "Val", "Valine"],
      ["W", "Trp", "Tryptophan"],
      ["X", "Xaa", "Unknown or any amino acid"],
      ["Y", "Tyr", "Tyrosine"],
      ["Z", "Glx", "Glutamic acid or glutamine"],
      ["*", "Ter", "Termination"],
      [". or -", "Gap", "Gap"]
    ],
    notes: [
      "Ambiguous and uncommon residue symbols should be handled explicitly by each protein tool.",
      "Protein property tools must document how B, J, O, U, X, Z, stop, and gap symbols affect calculations."
    ],
    citations: [
      {
        label: "DDBJ/ENA/GenBank Feature Table Definition v11.3, amino acid abbreviations",
        url: "https://www.ddbj.nig.ac.jp/ddbj/feature-table.html"
      }
    ]
  },
  {
    id: "javascript-regex",
    label: "JavaScript regex",
    title: "JavaScript Regex Reference",
    summary: "Common JavaScript regular-expression syntax for SMS3 tools that offer regex search.",
    columns: ["Syntax", "Meaning", "Example"],
    rows: [
      ["ATG", "Literal text", "Find ATG exactly."],
      [".", "Any one character", "A.G matches ACG, AGG, or ATG."],
      ["[ACGT]", "One character from a set", "ATG[ACGT] matches ATGA, ATGC, ATGG, or ATGT."],
      ["[^ACGT]", "One character not in a set", "N[^ACGT] matches N followed by a non-ACGT character."],
      ["A|T", "Either alternative", "ATG|TTG matches either start codon."],
      ["(...)", "Capture group", "(ATG)([ACGT]{3}) captures the start codon and next codon."],
      ["(?:...)", "Non-capturing group", "(?:ATG|TTG)[ACGT]{3} groups alternatives without capture output."],
      ["+", "One or more repeats", "A+ matches one or more A characters."],
      ["*", "Zero or more repeats", "A* can match zero characters, so avoid it by itself in sequence search."],
      ["?", "Optional item", "ATG? matches AT or ATG."],
      ["{n}", "Exactly n repeats", "[ACGT]{3} matches one codon."],
      ["{min,max}", "Repeat range", "[ACGT]{6,12} matches 6 to 12 bases."],
      ["^", "Start anchor", "^ATG matches ATG only at the start of the searched text or sequence."],
      ["$", "End anchor", "TAA$ matches TAA only at the end of the searched text or sequence."],
      ["\\s", "Whitespace", "\\s+ matches one or more spaces, tabs, or line breaks in text tools."],
      ["\\d", "Digit", "\\d+ matches one or more numeric digits in text tools."]
    ],
    notes: [
      "SMS3 regex fields expect the JavaScript regex source only. Enter ATG[ACGT], not /ATG[ACGT]/i.",
      "DNA/RNA Pattern Finder and Protein Pattern Finder expose only case-insensitive matching; that checkbox controls JavaScript i-flag behavior. Other flags such as g, m, s, u, and y are not user options in those tools.",
      "Text Search / Replace exposes case sensitivity and multiline anchors. Its multiline option controls JavaScript m-flag behavior for ^ and $. Global matching is handled internally.",
      "Use IUPAC motif mode for biological ambiguity symbols when a tool offers it. Regex character classes such as [AG] are syntax rules, not biological complement or ambiguity logic.",
      "Avoid patterns that can match zero characters, such as A* by itself, empty alternatives, or some anchor-only expressions; SMS3 tools warn or stop when zero-length matches would make coordinates misleading."
    ],
    citations: [
      {
        label: "MDN JavaScript regular expressions guide",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions"
      },
      {
        label: "MDN RegExp reference",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp"
      }
    ]
  },
  {
    id: "genetic-codes",
    label: "Genetic codes",
    title: "Genetic Codes",
    summary: "Inspect NCBI transl_table codon assignments, starts, stops, and differences from the standard code.",
    interactive: "genetic-codes",
    notes: [
      "Use NCBI transl_table IDs in options and structured output so results are reproducible.",
      "Start codons are context dependent: codons marked as starts may initiate translation and be represented as methionine at the beginning of a CDS or ORF, but the same codons use their normal amino-acid assignment when translated internally.",
      "Start-codon behavior is separate from internal codon translation and must be tested separately."
    ],
    citations: [
      {
        label: "NCBI Genetic Codes, last updated Sep. 23, 2024",
        url: "https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi"
      }
    ]
  },
  {
    id: "codon-usage-references",
    label: "Codon usage references",
    title: "Codon Usage References",
    summary: "Bundled codon usage references available to codon comparison and reverse-translation tools.",
    columns: [
      "Reference",
      "Organism",
      "Genetic code",
      "Sense codons",
      "Counted CDS",
      "Skipped records",
      "Access date",
      "Source",
      "Description"
    ],
    rows: makeCodonReferenceRows(),
    notes: [
      "The synthetic equal-synonymous seed is for testing and deterministic examples, not biological interpretation.",
      "This page lists the codon-usage records available to tools; use Reference data inventory for build scripts, generated files, and validation tests.",
      "Organism-specific references are generated by scripts under scripts/reference-data/ and checked in for offline browser use.",
      "Use docs/reference-data-authoring-guide.md when adding or updating bundled reference datasets."
    ],
    citations: [
      {
        label: "NCBI RefSeq record NC_000913.3",
        url: "https://www.ncbi.nlm.nih.gov/nuccore/NC_000913.3"
      },
      {
        label: "NCBI RefSeq record NC_000964.3",
        url: "https://www.ncbi.nlm.nih.gov/nuccore/NC_000964.3"
      },
      {
        label: "S. cerevisiae S288C RefSeq nuclear chromosomes",
        url: "https://www.ncbi.nlm.nih.gov/nuccore/?term=NC_001133+OR+NC_001134+OR+NC_001135+OR+NC_001136+OR+NC_001137+OR+NC_001138+OR+NC_001139+OR+NC_001140+OR+NC_001141+OR+NC_001142+OR+NC_001143+OR+NC_001144+OR+NC_001145+OR+NC_001146+OR+NC_001147+OR+NC_001148"
      }
    ]
  },
  {
    id: "restriction-enzymes",
    label: "Restriction enzymes",
    title: "Restriction Enzymes",
    summary: "Bundled restriction enzyme recognition sites used by restriction analysis tools.",
    interactive: "restriction-enzymes",
    columns: ["Name", "Recognition", "Cut top", "Cut bottom", "Overhang", "Source"],
    rows: makeRestrictionEnzymeRows(),
    notes: [
      "Use the table search to locate enzymes by name, recognition sequence, overhang, source, or cut offset.",
      "Cut offsets use the same semantics as the Restriction Summary and Restriction Digest tools."
    ],
    citations: [
      {
        label: "REBASE restriction enzyme database",
        url: "https://rebase.neb.com/"
      },
      {
        label: "NEB restriction enzyme resources",
        url: "https://www.neb.com/tools-and-resources/selection-charts/alphabetized-list-of-recognition-specificities"
      }
    ]
  },
  {
    id: "motif-references",
    label: "Motif references",
    title: "Motif References",
    summary: "Bundled motif records available to DNA/RNA and protein motif scanner tools.",
    columns: [
      "Motif",
      "Alphabet",
      "Class",
      "Syntax",
      "Pattern",
      "Source",
      "Access date",
      "Description"
    ],
    rows: makeMotifReferenceRows(),
    searchable: {
      label: "Search motifs",
      placeholder: "Motif name, alphabet, class, syntax, pattern, source, or description",
      rowNoun: "motif",
      emptyMessage: "No motif records match the current search."
    },
    notes: [
      `${motifProvenance.dataset} ${motifProvenance.version}: ${motifProvenance.description}`,
      `License note: ${motifProvenance.license}`,
      ...motifProvenance.notes,
      "This page lists the motif records available to scanner tools; use Reference data inventory for build scripts, generated files, and validation tests.",
      "The current motif set is intentionally small. It validates the scanner, UI, workflow table output, and provenance model before larger external databases are imported.",
      "PFM/PWM transcription-factor profile scanning, such as JASPAR-style searching, is planned as a separate future matrix-scanning tool."
    ],
    citations: [
      {
        label: "PROSITE",
        url: "https://prosite.expasy.org/"
      },
      {
        label: "EMBOSS patmatmotifs project documentation",
        url: "https://emboss.sourceforge.net/apps/release/6.5/emboss/apps/patmatmotifs.html"
      },
      {
        label: "JASPAR",
        url: "https://jaspar.elixir.no/"
      }
    ]
  },
  {
    id: "technical-sequence-references",
    label: "Technical sequence references",
    title: "Technical Sequence References",
    summary: "Bundled primer, adapter, and technical-sequence records available to the Technical Sequence Scanner.",
    columns: ["Sequence", "Class", "Syntax", "Pattern", "Source", "Access date", "Description"],
    rows: makeTechnicalSequenceReferenceRows(),
    searchable: {
      label: "Search technical sequences",
      placeholder: "Sequence name, class, syntax, pattern, source, or description",
      rowNoun: "record",
      emptyMessage: "No technical sequence records match the current search."
    },
    notes: [
      `${technicalSequenceProvenance.dataset} ${technicalSequenceProvenance.version}: ${technicalSequenceProvenance.description}`,
      `License note: ${technicalSequenceProvenance.license}`,
      ...technicalSequenceProvenance.notes,
      "This page lists the technical-sequence records available to the scanner; use Reference data inventory for build scripts, generated files, and validation tests.",
      "The scanner searches both DNA strands by default and can report conservative 5-prime/3-prime partial end matches.",
      "Use dedicated FASTQ trimming tools for error-tolerant adapter removal."
    ],
    citations: [
      {
        label: "Illumina adapter trimming guidance",
        url: "https://knowledge.illumina.com/library-preparation/general/library-preparation-general-reference_material-list/000001314"
      },
      {
        label: "Addgene sequencing primers",
        url: "https://www.addgene.org/mol-bio-reference/sequencing-primers/"
      },
      {
        label: "Cutadapt user guide",
        url: "https://cutadapt.readthedocs.io/en/stable/guide.html"
      },
      {
        label: "NCBI UniVec",
        url: "https://www.ncbi.nlm.nih.gov/tools/vecscreen/univec/"
      }
    ]
  },
  {
    id: "vector-contamination-references",
    label: "Vector contamination references",
    title: "Vector Contamination References",
    summary: "Bundled UniVec_Core-derived records available to the Vector Contamination Scanner.",
    columns: [
      "Dataset",
      "Source",
      "Source version",
      "Records",
      "Bases",
      "Seed length",
      "Index format",
      "Access date",
      "Build script",
      "Match model"
    ],
    rows: makeVectorContaminationReferenceRows(),
    notes: [
      `${vectorContaminationProvenance.dataset} ${vectorContaminationProvenance.version}.`,
      `Redistribution note: ${vectorContaminationProvenance.redistribution}`,
      ...vectorContaminationSummary.notes,
      ...vectorContaminationProvenance.notes,
      "This page summarizes the vector-contamination dataset available to the scanner; use Reference data inventory for build scripts, generated files, and validation tests.",
      "The bundled files are used locally in the browser worker; SMS3 does not send user sequences to NCBI."
    ],
    citations: [
      {
        label: "NCBI UniVec_Core",
        url: "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/UniVec_Core"
      },
      {
        label: "NCBI UniVec README",
        url: "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/README.uv"
      },
      {
        label: "NCBI VecScreen",
        url: "https://www.ncbi.nlm.nih.gov/tools/vecscreen/"
      }
    ]
  },
  {
    id: "reference-data-builds",
    label: "Reference data inventory",
    title: "Reference Data Inventory",
    summary: "Maintainer inventory for bundled reference-data families: sources, build scripts, generated files, and validation tests.",
    columns: [
      "Dataset",
      "ID",
      "Fetch script",
      "Build script",
      "Offline build",
      "Network fetch",
      "Source cache",
      "Generated files",
      "Validation test",
      "Notes"
    ],
    rows: makeReferenceDataManifestRows(),
    notes: [
      "Dataset-specific reference pages list the actual biological or technical records available to tools. This inventory page explains how those bundled datasets are fetched, built, checked in, and tested.",
      `Manifest schema version ${referenceDataManifest.schemaVersion}.`,
      "Fetch scripts are maintenance steps and may use network access. Normal browser use and normal tests consume checked-in generated app data.",
      "Run npm run reference-data:build and npm test after changing bundled reference-data files."
    ],
    citations: []
  },
  {
    id: "licenses-attributions",
    label: "Licenses and attributions",
    title: "Licenses And Attributions",
    summary:
      "Third-party software, vendored browser bundles, generated reference data, and bundled source-data terms used by SMS3.",
    columns: ["Category", "Name", "Version", "License or terms", "Source or terms URL", "Bundled files or use", "Notes"],
    rows: makeLicenseAttributionRows(),
    notes: [
      "This page is a working attribution index for the development app. It does not replace the full upstream license text stored with vendored libraries or provided by package registries.",
      "Reference-data rows summarize bundled SMS3 datasets. Use the dataset-specific reference pages and provenance files for record-level sources, access dates, build scripts, and validation tests.",
      "Before bundling larger external biological databases, record source URL, version or access date, license terms, redistribution decision, build script, generated files, and validation tests."
    ],
    citations: [
      {
        label: "D3 license file",
        url: "https://github.com/d3/d3/blob/main/LICENSE"
      },
      {
        label: "Observable Plot license file",
        url: "https://github.com/observablehq/plot/blob/main/LICENSE"
      },
      {
        label: "3Dmol.js license",
        url: "https://github.com/3dmol/3Dmol.js/blob/master/LICENSE"
      },
      {
        label: "ExcelJS license",
        url: "https://github.com/exceljs/exceljs/blob/master/LICENSE"
      },
      {
        label: "JASPAR downloads and license information",
        url: "https://jaspar.elixir.no/downloads/"
      },
      {
        label: "NCBI UniVec_Core",
        url: "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/UniVec_Core"
      },
      {
        label: "NCBI UniVec README",
        url: "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/README.uv"
      },
      {
        label: "Addgene sequencing primers",
        url: "https://www.addgene.org/mol-bio-reference/sequencing-primers/"
      },
      {
        label: "REBASE",
        url: "https://rebase.neb.com/"
      }
    ]
  },
  {
    id: "privacy-offline",
    label: "Privacy and local processing",
    title: "Privacy And Local Processing",
    summary: "SMS3 runs normal tool analysis in this browser; sequence data is not submitted to an SMS3 server.",
    notes: [
      "Sequence text is processed by the app's loaded JavaScript in your browser, and downloads are generated in the browser.",
      "SMS3 does not use cookies.",
      "The app uses browser storage only for explicit app state: localStorage keeps UI preferences (sms3-theme, sms3-sidebar, sms3-sidebar-width, sms3-tool-options-width, and sms3-tool-limit-options), while IndexedDB keeps Workspace records (sms3-workspace-library), saved workflows (sms3-workflow-library), and Markdown Notebook drafts or documents (sms3-markdown-notebooks) when you use those features.",
      "Ordinary tool input, workflow input, and output text are not saved to browser storage unless you explicitly save them through Workspace, Workflows, or Markdown Notebook features."
    ],
    citations: []
  },
  {
    id: "sms3-showcase",
    label: "SMS3 showcase",
    title: "SMS3 Showcase",
    summary:
      "SMS3 visual outputs generated from registered tool metadata, bundled examples, and current tool code. Use this page for public-site and teaching checks without maintaining separate hand-made screenshots.",
    interactive: "showcase",
    notes: [
      "These previews are discovered from registered visual output-format metadata and generated locally in the browser from current SMS3 tool runners and bundled examples.",
      "Open the linked tool to inspect the full example, options, machine-readable output, downloads, and workflow streams.",
      "If a preview fails, treat it as a real showcase/regression problem rather than replacing it with a static image."
    ],
    citations: []
  },
  {
    id: "citation-guidance",
    label: "How to cite SMS",
    title: "How To Cite SMS",
    summary:
      "Please cite the original Sequence Manipulation Suite paper when SMS3 or legacy SMS tools are useful in your work.",
    interactive: "citation",
    notes: [],
    citations: []
  }
  ];
}

export function makeAminoAcidNames(referenceTopics) {
  return new Map(
    referenceTopics
      .find((topic) => topic.id === "iupac-amino-acid")
      .rows.map(([code, threeLetter, meaning]) => [code, `${meaning} (${threeLetter})`])
  );
}
