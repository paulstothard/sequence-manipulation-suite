export const markdownNotebookMetadata = {
  id: "markdown-notebook",
  name: "Markdown Notebook",
  category: "Text & Notes",
  tags: ["text"],
  summary: "Open a standalone Markdown workspace from a blank note, an uploaded Markdown file, or a saved browser draft.",
  inputType: "Standalone Markdown workspace",
  outputType: "Markdown editor, Markdown file, or workflow text output",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/markdown" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/markdown" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/markdown-notebook/run.js",
  workerExport: "runMarkdownNotebook",
  options: [
    {
      type: "group",
      label: "Notebook",
      options: [
        { id: "title", type: "text", label: "Title", defaultValue: "Untitled notes" },
        { id: "date", type: "text", label: "Date", defaultValue: "", help: "Leave blank to use today's date." },
        { id: "fileName", type: "text", label: "Download name", defaultValue: "untitled-notes" },
        { id: "includeFrontMatter", type: "checkbox", label: "Add YAML front matter", defaultValue: false }
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
          defaultValue: "notebook",
          choices: [
            { value: "notebook", label: "Markdown editor" },
            { value: "markdown", label: "Markdown" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
