import { DESIGN_FEATURE_PREVIEW_MAX_CHARACTERS } from "../core/design-feature-targets.js";

export const designFeaturePreviewLimit = {
  id: "designFeaturePreviewLimit", type: "limit-value", label: "Feature selector preview characters",
  value: DESIGN_FEATURE_PREVIEW_MAX_CHARACTERS,
  detail: "Larger input cannot populate the feature selector. Load a smaller annotated template to select a feature. Analysis limits apply separately."
};

export function makeDesignFeatureOptions(kind) {
  const instructions = kind === "pcr"
    ? "Amplify entire feature places primers outside its span. Design within feature keeps the product in one contiguous part. Product-size limits and manual region filters still apply."
    : kind === "crispr"
      ? "Keep guides whose estimated cut position lies within a feature part, on either strand. Gaps between joined parts are excluded. Requires a PAM model with a cut-position estimate."
      : "Keep pairs whose entire spacer lies within one feature part, on either strand. Half-sites may extend outside the feature. Gaps between joined parts are excluded.";
  return {
    id: "featureTargeting", type: "group", label: "Feature targeting",
    options: [
      {
        id: "targetFeature", type: "select", label: "Target feature", defaultValue: "",
        choicesFrom: "input-features",
        choices: [{ value: "", label: "All input sequences" }]
      },
      ...(kind === "pcr" ? [{
        id: "featureTargetMode", type: "select", label: "Design relative to feature", defaultValue: "flank",
        choices: [{ value: "flank", label: "Amplify entire feature" }, { value: "within", label: "Design within feature" }]
      }] : []),
      { id: "featureTargetInstructions", type: "note", text: `Uses original coordinates and searches only the selected record. ${instructions}` }
    ]
  };
}
