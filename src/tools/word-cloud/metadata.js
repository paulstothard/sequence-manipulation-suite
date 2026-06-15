import { wordCloudColumns } from "../../core/text-word-cloud.js";

export const wordCloudMetadata = {
  id: "word-cloud",
  name: "Word Cloud",
  category: "Plots",
  tags: ["text", "plot"],
  summary: "Count words in plain text and draw a deterministic word cloud plot with a machine-readable word-count table.",
  inputType: "Plain text",
  outputType: "Word cloud plot or word-count table",
  runInWorker: true,
  workerModule: "../tools/word-cloud/run.js",
  workerExport: "runWordCloud",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "wordTable", kind: "table", schema: "word-cloud-counts", columns: wordCloudColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Word filtering",
      options: [
        { id: "minimumWordLength", type: "number", label: "Minimum word length", defaultValue: 3, min: 1, max: 30, step: 1 },
        { id: "maxWords", type: "number", label: "Maximum words", defaultValue: 80, min: 5, max: 250, step: 5 },
        { id: "caseSensitive", type: "checkbox", label: "Keep case distinctions", defaultValue: false },
        {
          id: "extraStopWords",
          type: "textarea",
          label: "Additional stop words",
          defaultValue: "sample\nresult\nresults",
          help: "One word per line or comma-separated. SMS3 always applies its bundled English stop-word reference first, then removes these extra words."
        }
      ]
    },
    {
      type: "group",
      label: "Plot",
      options: [
        { id: "title", type: "text", label: "Plot title", defaultValue: "Lab notes word cloud" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Word cloud plot" },
          { value: "word-tsv", label: "Word-count table" }
        ] }
      ]
    }
  ],
  examples: [
    {
      label: "Sequencing project notes",
      input: `The ligation control produced a strong colony count, while the insert ligation produced fewer colonies.
Colony PCR confirmed the expected insert in most colonies, but two colonies showed the empty-vector band.
The sequencing reads had strong signal through the promoter, coding sequence, and terminator, although one read
showed lower quality near the final repeat. Follow-up analysis should compare the confirmed insert sequence with
the design sequence and check the restriction sites used for cloning.

The assembly notebook emphasized cloning, insert verification, promoter orientation, and sequence quality.
The team repeated the digest with fresh enzyme mix, checked the backbone band, and sequenced both junctions.
Read quality improved after trimming the primer sequence, but the terminator repeat remained difficult to call.
The final report should highlight insert sequence, promoter sequence, terminator sequence, colony PCR, digest
confirmation, read quality, and the two junction reads that confirmed the intended construct.`
    }
  ],
  citations: [
    {
      text: "Default English stop words are bundled as SMS3 reference data derived from the Snowball English stop-word list."
    }
  ]
};
