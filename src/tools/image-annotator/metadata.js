import { graphicLimits, graphicWorkflow } from "../svg-editor/metadata.js";
import { imageAnnotatorExample } from "./example.js";
export { imageAnnotatorExample };
export const imageAnnotatorMetadata = {
  id: "image-annotator",
  name: "Image Annotator",
  category: "Text, Notes & Images",
  tags: ["annotation", "plot"],
  summary:
    "Draw on a PNG image and add editable labels, arrows and shapes.",
  whenToUse:
    "Annotate a PNG plot, diagram or other image from SMS3 or another source.",
  inputType: "PNG or saved annotation document",
  outputType: "Annotated PNG or editable document",
  fileInput: {
    accept: ".png,.json",
    dropLabel: "Drop PNG or saved annotation document here",
  },
  graphicInput: "png",
  runInWorker: true,
  workerModule: "../tools/image-annotator/run.js",
  workerExport: "runImageAnnotator",
  workflow: graphicWorkflow,
  showcaseOutputs: [
    { id: "image-annotator", label: "PNG annotation workspace", summary: "A PNG plot with a spaced pointer and label identifying the mean and standard deviation." },
  ],
  options: [
    {
      ...graphicLimits,
      options: graphicLimits.options.filter(
        (o) => o.label !== "SVG complexity",
      ),
    },
    {
      type: "note",
      text: "Download document keeps drawings and labels editable. Download PNG combines them with the image at its original dimensions.",
    },
  ],
};
