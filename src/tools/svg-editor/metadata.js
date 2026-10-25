export const svgEditorExample = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
<rect width="900" height="520" fill="#ffffff"/>
<g font-family="Arial, Helvetica, sans-serif" fill="#18232c">
<text x="55" y="50" font-size="24" font-weight="700">Relative expression after treatment</text>
<text x="55" y="78" font-size="15" fill="#64748b">Illustrative data · mean ± SD · n = 3</text>
<g stroke="#64748b" stroke-width="1"><path d="M100 120V420H820" fill="none"/><path d="M100 320H820 M100 220H820 M100 120H820" stroke="#e2e8f0"/></g>
<g font-size="15" text-anchor="end"><text x="88" y="425">0</text><text x="88" y="325">1</text><text x="88" y="225">2</text><text x="88" y="125">3</text></g>
<text x="35" y="275" text-anchor="middle" font-size="16" transform="rotate(-90 35 275)">Relative expression</text>
<g id="control"><rect x="185" y="320" width="110" height="100" fill="#0072b2"/><path d="M240 302V338 M226 302H254 M226 338H254" stroke="#18232c" stroke-width="2" fill="none"/><text x="240" y="451" text-anchor="middle" font-size="17">Control</text></g>
<g id="low-dose"><rect x="405" y="250" width="110" height="170" fill="#009e73"/><path d="M460 226V274 M446 226H474 M446 274H474" stroke="#18232c" stroke-width="2" fill="none"/><text x="460" y="451" text-anchor="middle" font-size="17">Low dose</text></g>
<g id="high-dose"><rect x="625" y="170" width="110" height="250" fill="#e69f00"/><path d="M680 140V200 M666 140H694 M666 200H694" stroke="#18232c" stroke-width="2" fill="none"/><text x="680" y="451" text-anchor="middle" font-size="17">High dose</text></g>
<text x="460" y="493" text-anchor="middle" font-size="16">Treatment group</text></g></svg>`;
export const graphicLimits = {
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    {
      type: "limit-value",
      label: "Uploaded file",
      value: "8 MiB",
      detail: "Larger files are refused before rendering.",
    },
    {
      type: "limit-value",
      label: "Image dimensions",
      value: "8,192 pixels per side; 16 million pixels",
      detail: "PNG exports retain the original dimensions.",
    },
    {
      type: "limit-value",
      label: "SVG complexity",
      value: "10,000 elements; 40 nesting levels; 200,000 geometry values",
      detail:
        "Scripts, animation, filters, foreignObject and external resources are refused. Embedded PNGs and WOFF fonts are supported.",
    },
    {
      type: "limit-value",
      label: "Annotations",
      value: "200; 50,000 drawing points",
      detail:
        "Each stroke supports 5,000 points. Labels support 2,000 characters.",
    },
    {
      type: "limit-value",
      label: "History",
      value: "50 edits; approximately 5 MiB",
      detail:
        "Older changes leave Undo history as the memory budget is reached. The original image stays in the editable document.",
    },
  ],
};
export const graphicWorkflow = {
  inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
  outputs: [
    {
      id: "primary",
      kind: "text",
      mediaType: "application/json",
      label: "Editable image",
      advanced: false,
    },
    {
      id: "document",
      kind: "text",
      mediaType: "application/json",
      label: "Editable image document",
    },
    { id: "warnings", kind: "warnings" },
  ],
};
export const svgEditorMetadata = {
  id: "svg-editor",
  name: "SVG Editor",
  category: "Text, Notes & Images",
  tags: ["text", "annotation", "plot"],
  summary:
    "Edit labels, colors and shapes in an SVG, and add drawings and annotations.",
  whenToUse:
    "Use this to adjust an SVG exported by SMS3 or another application before placing it in a document.",
  inputType: "SVG or saved editor document",
  outputType: "Editable SVG, PNG or editor document",
  fileInput: {
    accept: ".svg,.json",
    dropLabel: "Drop SVG or saved editor document here",
  },
  graphicInput: "svg",
  runInWorker: true,
  workerModule: "../tools/svg-editor/run.js",
  workerExport: "runSvgEditor",
  workflow: graphicWorkflow,
  showcaseOutputs: [{ id: "svg-editor", label: "Editable SVG", summary: "An illustrative expression plot with an editable rounded outline, pointer and fold-change label." }],
  options: [
    graphicLimits,
    {
      type: "note",
      text: "Edit existing text and shapes or add annotations. Text converted to outlines is edited as shapes. Complex text can be restyled and moved; replacing its wording requires plain text.",
    },
  ],
};
