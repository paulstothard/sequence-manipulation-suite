import { proteinStructureConservationColumns } from "../../core/protein-structure-conservation.js";
import { MULTIPLE_ALIGNMENT_ENGINES } from "../../core/multiple-sequence-alignment.js";

export const proteinConservationStructureViewerMetadata = {
  id: "protein-conservation-structure-viewer",
  name: "Protein Conservation Structure Viewer",
  category: "Viewers & Figures",
  tags: ["protein", "alignment", "coordinates", "map"],
  summary: "Color a PDB or mmCIF protein structure by residue conservation after anchoring the alignment to one structure chain and detecting equivalent chains.",
  inputType: "Protein structure file plus protein FASTA records",
  outputType: "Conservation-colored protein structure viewer, mapping report, or conservation table",
  splitInput: {
    separator: "---",
    panels: [
      {
        id: "structure",
        label: "Protein structure",
        dropLabel: "Drop PDB or mmCIF protein structure here",
        accept: ".pdb,.cif,.mmcif,.txt"
      },
      {
        id: "alignment",
        label: "Protein sequences to compare",
        dropLabel: "Drop protein FASTA records to align with the structure here",
        description: "SMS3 extracts the anchor structure chain, inserts it as the required alignment row, and projects the mapping onto equivalent chains.",
        accept: ".fa,.faa,.fasta,.aln,.txt"
      }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "viewer", kind: "viewer", viewerType: "protein-structure-viewer" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "conservation", kind: "table", schema: "protein-structure-conservation", columns: proteinStructureConservationColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/protein-conservation-structure-viewer/run.js",
  workerExport: "runProteinConservationStructureViewer",
  options: [
    {
      type: "group",
      label: "Mapping",
      options: [
        {
          id: "format",
          type: "select",
          label: "Structure format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto-detect PDB or mmCIF" },
            { value: "pdb", label: "PDB" },
            { value: "mmcif", label: "mmCIF" }
          ]
        },
        {
          id: "modelSelection",
          type: "text",
          label: "Structure model",
          defaultValue: "all",
          placeholder: "all or 1",
          suggestionsFrom: "protein-structure-models",
          help: "Use all to summarize every model, or enter a model number to map conservation onto one selected structure model."
        },
        {
          id: "altLocationPolicy",
          type: "select",
          label: "Alternate locations",
          defaultValue: "preferred",
          choices: [
            { value: "preferred", label: "Preferred conformer" },
            { value: "highest-occupancy", label: "Highest occupancy" },
            { value: "first", label: "First listed" },
            { value: "all", label: "All locations" }
          ],
          help: "Controls alternate atom locations before residue mapping. Preferred conformer keeps blank atom sites when present, otherwise the highest-occupancy alternate location."
        },
        {
          id: "chainId",
          type: "text",
          label: "Anchor structure chain",
          defaultValue: "auto",
          suggestionsFrom: "protein-structure-chains-auto",
          help: "Use auto for the longest protein chain, or enter a chain ID such as A. SMS3 uses this chain for the alignment and automatically colors equivalent chains in the same structure."
        }
      ]
    },
    {
      id: "alignmentSetup",
      type: "group",
      label: "Alignment",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "alignmentInputMode",
          type: "radio",
          label: "Alignment input",
          defaultValue: "unaligned",
          choices: [
            { value: "unaligned", label: "Align sequences with structure chain" },
            { value: "aligned", label: "Use supplied aligned FASTA containing structure row" }
          ],
          help: "The default is safest: SMS3 extracts the selected structure chain and forces it into the alignment. Use supplied aligned FASTA only when your second input already contains the exact structure sequence row."
        },
        {
          id: "alignmentEngine",
          type: "select",
          label: "Alignment engine",
          defaultValue: MULTIPLE_ALIGNMENT_ENGINES.muscle,
          visibleWhen: { option: "alignmentInputMode", value: "unaligned" },
          choices: [
            { value: MULTIPLE_ALIGNMENT_ENGINES.muscle, label: "MUSCLE" },
            { value: MULTIPLE_ALIGNMENT_ENGINES.sms3, label: "SMS3 progressive" }
          ],
          help: "Used only when SMS3 builds the alignment from unaligned protein FASTA records."
        },
        {
          id: "gapOpen",
          type: "number",
          label: "Gap-open penalty",
          defaultValue: 10,
          min: 0,
          step: 0.5,
          visibleWhen: [
            { option: "alignmentInputMode", value: "unaligned" },
            { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 }
          ]
        },
        {
          id: "gapExtend",
          type: "number",
          label: "Gap-extension penalty",
          defaultValue: 1,
          min: 0,
          step: 0.1,
          visibleWhen: [
            { option: "alignmentInputMode", value: "unaligned" },
            { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 }
          ]
        },
        {
          id: "alignmentRow",
          type: "text",
          label: "Structure row in supplied alignment",
          defaultValue: "auto",
          suggestionsFrom: "protein-alignment-rows",
          visibleWhen: { option: "alignmentInputMode", value: "aligned" },
          help: "Only used for supplied aligned FASTA. Use auto to pick the row whose ungapped sequence best matches the selected structure chain, or enter part of the FASTA title."
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "interactive-viewer",
          choices: [
            { value: "interactive-viewer", label: "Conservation protein structure viewer" },
            { value: "report", label: "Mapping report" },
            { value: "conservation-tsv", label: "Conservation table" }
          ]
        }
      ]
    }
  ],
  citations: [
    {
      text: "Conservation coloring follows the solved-sequence-to-structure mapping model described in Stothard PM. COMBOSA3D: combining sequence alignments with three-dimensional structures. Bioinformatics. 2001;17(2):198-199. doi:10.1093/bioinformatics/17.2.198."
    },
    {
      text: "The default p53 example is based on PDB 1TUP and the p53-DNA complex described in Cho Y, Gorina S, Jeffrey PD, Pavletich NP. Crystal structure of a p53 tumor suppressor-DNA complex: understanding tumorigenic mutations. Science. 1994;265(5170):346-355. doi:10.1126/science.8023157."
    },
    {
      text: "The default p53 comparison FASTA uses NCBI Protein records for the COMBOSA3D p53 panel species and is trimmed by alignment to the columns corresponding to 1TUP chain A / human p53 residues 94-289."
    }
  ]
};
