import { workflowSequenceRecordsToFasta } from "./workflow-sequence-input.js";
import { listDesignFeatureTargets, DESIGN_FEATURE_PREVIEW_MAX_CHARACTERS } from "./design-feature-targets.js";
import { parsePcrTemplateInput } from "./pcr-template-input.js";
import { parseDnaRnaSequenceOrFlatfile } from "./dna-input-records.js";

export function previewDesignFeatures(input, toolId) {
  const stream = input?.kind === "sequence-records" ? input : null;
  if (stream && JSON.stringify(stream).length > DESIGN_FEATURE_PREVIEW_MAX_CHARACTERS) return { features: [], message: "Feature selection previews support up to 2 million input characters. Load a smaller annotated template to choose a feature." };
  const text = stream ? workflowSequenceRecordsToFasta(stream) : String(input ?? "");
  // Interactive previews are bounded; the analysis runner retains its own input limits.
  if (text.length > DESIGN_FEATURE_PREVIEW_MAX_CHARACTERS) return { features: [], message: "Feature selection previews support up to 2 million input characters. Load a smaller annotated template to choose a feature." };
  if (!stream && !/^\s*(LOCUS\s|ID\s|##FASTA\s*$)/m.test(text)) return { features: [], message: "" };
  try {
    const parsed = toolId === "pcr-primer-design"
      ? parsePcrTemplateInput(text, { convertUtoT: true, workflowSequenceRecords: stream ?? undefined })
      : parseDnaRnaSequenceOrFlatfile(text.split(/^\s*##REFERENCE\s*$/m)[0], { convertUtoT: true, workflowSequenceRecords: stream ?? undefined });
    const features = listDesignFeatureTargets(parsed.records);
    return { features, message: features.length ? "" : "No features with supported local coordinates were found in this input." };
  } catch (error) {
    return { features: [], message: `Feature list unavailable: ${error.message}` };
  }
}
