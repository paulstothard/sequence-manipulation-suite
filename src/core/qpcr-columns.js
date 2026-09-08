const columns = (items) => items.map(([id, label, type = "number"]) => ({ id, label, type }));
const identity = [["sample", "Biological sample", "string"], ["condition", "Condition", "string"], ["target", "Target", "string"]];
const provenance = [["method", "Method", "string"], ["calibrator", "Calibrator", "string"], ["reference_genes", "Reference genes", "string"], ["missing_policy", "Missing-well policy", "string"]];
export const qpcrGroupColumns = columns([
  ["target", "Target", "string"], ["condition", "Condition", "string"], ["n", "Biological n"], ["excluded_samples", "Unavailable samples"], ["calibrator_n", "Calibrator n"],
  ["fold_change", "Relative expression"], ["log2_fold_change", "Log2 fold change"], ["ci_low_fold", "95% CI lower (fold)"], ["ci_high_fold", "95% CI upper (fold)"],
  ["ci_low_log2", "95% CI lower (log2)"], ["ci_high_log2", "95% CI upper (log2)"], ["sd_log2", "Biological SD (log2)"], ["se", "Contrast SE (log2)"], ["df", "Welch df"],
  ["p_value", "P value"], ["p_adjusted", "BH adjusted P"], ["inference", "Inference", "string"], ["status", "Status", "string"], ...provenance
]);
export const qpcrSampleColumns = columns([...identity, ["fold_change", "Relative expression"], ["log2_fold_change", "Log2 fold change"], ["log2_normalized_quantity", "Log2 normalized quantity"], ["delta_cq", "ΔCq (ΔΔCq method only)"], ["delta_delta_cq", "ΔΔCq (ΔΔCq method only)"], ["status", "Status", "string"], ["qc", "Review flags", "string"], ...provenance]);
export const qpcrTechnicalColumns = columns([...identity, ["reactions", "Total wells"], ["excluded", "Excluded wells"], ["detected", "Detected wells"], ["undetermined", "Undetermined wells"], ["mean_cq", "Mean Cq"], ["cq_sd", "Cq SD"], ["efficiency_percent", "Efficiency used (%)"], ["log2_quantity", "Log2 mean quantity"], ["status", "Status", "string"], ["qc", "Review flags", "string"], ...provenance]);
export const qpcrReactionColumns = columns([["row", "Input row"], ...identity, ["role", "Role", "string"], ["replicate", "Technical replicate", "string"], ["run", "Run", "string"], ["well", "Well", "string"], ["cq", "Cq"], ["efficiency", "Input efficiency (%)"], ["status", "Status", "string"]]);
