import {
  proteinStructureAssemblyColumns,
  proteinStructureAtomColumns,
  proteinStructureMissingResidueColumns,
  proteinStructureResidueColumns
} from "../../core/protein-structure.js";

export const proteinStructureViewerMetadata = {
  id: "protein-structure-viewer",
  name: "Protein Structure Viewer",
  category: "Viewers & Figures",
  tags: ["protein", "coordinates", "map"],
  summary: "Open PDB or mmCIF protein structures in an interactive viewer with model, assembly, and chain selection.",
  inputType: "Protein structure file (PDB or mmCIF)",
  outputType: "Protein structure viewer, summary report, residue table, or atom table",
  runInWorker: true,
  workerModule: "../tools/protein-structure-viewer/run.js",
  workerExport: "runProteinStructureViewer",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "viewer", kind: "viewer", viewerType: "protein-structure-viewer" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "residues", kind: "table", schema: "protein-structure-residues", columns: proteinStructureResidueColumns },
      { id: "missingResidues", kind: "table", schema: "protein-structure-missing-residues", columns: proteinStructureMissingResidueColumns },
      { id: "biologicalAssemblies", kind: "table", schema: "protein-structure-biological-assemblies", columns: proteinStructureAssemblyColumns },
      { id: "atoms", kind: "table", schema: "protein-structure-atoms", columns: proteinStructureAtomColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Structure selection",
      options: [
        {
          id: "format",
          type: "select",
          label: "Input format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto-detect PDB or mmCIF" },
            { value: "pdb", label: "PDB" },
            { value: "mmcif", label: "mmCIF" }
          ]
        },
        {
          id: "modelSelection",
          type: "select",
          label: "Structure model",
          defaultValue: "first",
          choices: [
            { value: "first", label: "First model" },
            { value: "all", label: "All models" }
          ],
          help: "For NMR or other multi-model structures, show the first model, all models, or a specific model number detected from the file."
        },
        {
          id: "biologicalAssembly",
          type: "select",
          label: "Assembly to display",
          defaultValue: "asymmetric",
          choices: [
            { value: "asymmetric", label: "Asymmetric unit" }
          ],
          help: "Use the coordinate file as supplied, or choose a biological assembly detected from PDB REMARK 350 or mmCIF assembly metadata."
        },
        {
          id: "chainSelection",
          type: "text",
          label: "Chains",
          defaultValue: "all",
          placeholder: "all or A,B",
          suggestionsFrom: "protein-structure-chains",
          help: "Use all to render every chain in the selected model, or enter one or more chain IDs separated by commas."
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
          help: "Controls how alternate atom locations are handled. Preferred conformer keeps blank atom sites when present, otherwise the highest-occupancy alternate location."
        },
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
            { value: "interactive-viewer", label: "Protein structure viewer" },
            { value: "report", label: "Summary report" },
            { value: "residue-tsv", label: "Residue table" },
            { value: "atom-tsv", label: "Atom table" }
          ]
        }
      ]
    },
    {
      type: "group",
      id: "advancedLimits",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "maxViewerAtoms",
          type: "number",
          label: "Interactive atom limit",
          defaultValue: 75000,
          min: 1000,
          max: 500000,
          step: 1000,
          help: "If the selected model, chains, and assembly exceed this many atoms, SMS3 returns the report instead of opening the 3D viewer. Lower it for slower browsers; raise it only if your browser can handle the structure."
        }
      ]
    }
  ]
};
