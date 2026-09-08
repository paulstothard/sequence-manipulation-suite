import {
  treeDocumentContract,
  TREE_DOCUMENT_MEDIA_TYPE,
} from "../../core/tree-document-stream.js";
export const treeViewerMetadata = {
  id: "tree-viewer",
  name: "Tree Viewer",
  category: "Viewers & Figures",
  tags: ["phylogeny", "plot"],
  summary: "View and style Newick/NHX, NEXUS, phyloXML, NeXML, or Tree Viewer JSON trees, with branch support, sample metadata tracks, and figure export.",
  whenToUse:
    "Prepare an existing phylogenetic tree for inspection or a figure, with reusable appearance settings and sample metadata.",
  inputType: "Newick (including NHX), NEXUS TREES, phyloXML, NeXML, or Tree Viewer JSON",
  outputType:
    "Interactive tree, styled figures, metadata tables, and reusable tree document",
  showcaseOutputs: [
    {
      id: "tree-figure",
      label: "Bcl-2 family with bootstrap support",
      summary: "An intact 18-tip vertebrate clade from the Biopython Bcl-2 example, with source bootstrap values, species-group colors, and terminal branch-length bars."
    }
  ],
  fileInput: {
    accept: ".nwk,.newick,.nhx,.tree,.tre,.treefile,.contree,.nex,.nexus,.phyloxml,.nexml,.xml,.json,.txt",
    dropLabel: "Drop Newick / NHX, NEXUS, phyloXML, NeXML, or Tree Viewer JSON here",
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      treeDocumentContract,
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: TREE_DOCUMENT_MEDIA_TYPE },
      treeDocumentContract,
      { id: "warnings", kind: "warnings" },
    ],
  },
  runInWorker: true,
  workerModule: "../tools/tree-viewer/run.js",
  workerExport: "runTreeViewer",
  options: [
    {
      id: "supportProfile", type: "select", label: "Numeric internal labels", defaultValue: "unresolved",
      choices: [
        { value: "unresolved", label: "Choose meaning after import" },
        { value: "bootstrap-percent", label: "Bootstrap (%)" },
        { value: "bootstrap-proportion", label: "Bootstrap (0–1)" },
        { value: "sh-alrt-ufboot", label: "SH-aLRT / ultrafast bootstrap (%)" },
        { value: "name", label: "Node names" },
      ],
      help: "For Newick/NEXUS numeric internal labels such as (A,B)95. Values are displayed without rescaling. For paired values, verify SH-aLRT / UFBoot order in the producing program’s report. XML confidence and JSON support are read directly. This viewer displays support; it does not calculate bootstrap replicates.",
    },
    {
      type: "note",
      placement: "input",
      text: "Paste or upload one or more trees; the format is detected automatically. Optional CSV/TSV/Excel sample metadata can be added under Style → Metadata tracks.",
    },
    {
      type: "note",
      text: "Style and export after Run. Rectangular and circular layouts use the input tree's top-level node as the initial root; an unrooted layout changes only the drawing. Under Style → Tree layout, root at the branch leading to a selected outgroup or use midpoint rooting. Original labels, branch lengths and topology remain intact. Interpret numeric internal labels here or under Style → Branch support after Run. Figures support up to 1,000 visible tips and 4,001 visible nodes; larger documents can be inspected in the table and focused or collapsed explicitly.",
    },
  ],
};
