import { runGraphicEditor } from "../svg-editor/run.js";
export const runImageAnnotator = (input, options, context) =>
  runGraphicEditor(input, "png", context);
