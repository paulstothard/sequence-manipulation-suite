import { detectDelimiter, parseDelimitedRows } from "./table.js";
import { twoTailedPValue } from "./hypothesis-tests.js";

// Formula and interpretation sources:
// Pfaffl (2001), https://doi.org/10.1093/nar/29.9.e45
// Hellemans et al. (2007), https://doi.org/10.1186/gb-2007-8-2-r19
// Livak & Schmittgen (2001), https://doi.org/10.1006/meth.2001.1262
// MIQE 2.0 (2025), https://doi.org/10.1093/clinchem/hvaf043
// Efficiency mode averages reaction quantities; conventional ddcq averages Cq.
// Reference quantities and biological calibrators use geometric means. Supplied
// efficiencies are fixed: Welch intervals do not propagate efficiency error.
export const QPCR_LIMITS = Object.freeze({ characters: 5_000_000, reactions: 25_000, cells: 500_000, columns: 32, samples: 2000, targets: 64, conditions: 24, sampleResults: 50_000, plotPoints: 1000, plotTargets: 12, plotConditions: 12 });
const missing = new Set(["", "na", "n/a", "nan", "undetermined", "undetected", "no cq", "no ct", "no cp"]);
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = xs => { const m = mean(xs); return xs.length > 1 ? xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) : null; };
const key = (...xs) => JSON.stringify(xs);
const sorted = xs => [...xs].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
const number = (value, label, min, max, integer = false) => {
  const s = String(value).trim(), n = Number(s);
  if (!decimal.test(s) || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`${label} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}.`);
  return n;
};
const choose = (value, allowed, label) => { if (!allowed.includes(value)) throw new Error(`Invalid ${label}: ${value}.`); return value; };
const label = (value, name, required = true) => {
  const s = String(value ?? "").trim();
  if ((required && !s) || s.length > 160 || /[\x00-\x1f\x7f]/.test(s)) throw new Error(`${name} must be ${required ? "non-empty text" : "text"} of at most 160 characters without line breaks or control characters.`);
  return s;
};
function boolean(value, where) {
  const v = String(value ?? "").trim().toLowerCase();
  if (["", "false", "no", "0"].includes(v)) return false;
  if (["true", "yes", "1"].includes(v)) return true;
  throw new Error(`${where}: exclude must be true/false, yes/no, or 1/0.`);
}
async function checkpoint(context, phase, progress) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase, progress });
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
}
export function qpcrSettings(options = {}) {
  const refs = String(options.referenceGenes ?? "RPLP0,HPRT1").split(",").map(s => s.trim()).filter(Boolean);
  if (!refs.length || refs.length > 16 || new Set(refs).size !== refs.length) throw new Error("Choose 1–16 different reference genes, separated by commas.");
  refs.forEach(s => label(s, "Reference gene"));
  return {
    referenceGenes: refs,
    calibrator: label(options.calibrator ?? "Control", "Calibrator condition"),
    method: choose(options.method ?? "efficiency", ["efficiency", "ddcq"], "quantification method"),
    missingPolicy: choose(options.missingPolicy ?? "strict", ["strict", "available"], "missing-well policy"),
    minReplicates: number(options.minReplicates ?? 1, "Minimum detected technical replicates", 1, 12, true),
    maxCqSd: number(options.maxCqSd ?? 0.5, "Technical Cq SD warning threshold", 0.01, 10),
    comparisons: choose(options.comparisons ?? "welch", ["welch", "none"], "comparison method"),
    outputFormat: choose(options.outputFormat ?? "plot", ["plot", "groups", "samples", "technical", "reactions", "report"], "output format"),
    plotScale: choose(options.plotScale ?? "log2", ["log2", "fold"], "plot scale"),
    plotTarget: label(options.plotTarget ?? "", "Plot target", false),
    maxReactions: number(options.maxReactions ?? QPCR_LIMITS.reactions, "Maximum reactions", 1, QPCR_LIMITS.reactions, true)
  };
}
// 97.5th percentile from the shared small-tail Student t implementation, with
// monotone bisection. Tested against R qt for fractional df and extreme ranges.
export function qpcrTCritical(df) {
  if (!Number.isFinite(df) || df <= 0) throw new Error("Student t degrees of freedom must be positive and finite.");
  let low = 0, high = 1;
  while (twoTailedPValue(high, df) > 0.05) high *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (twoTailedPValue(mid, df) > 0.05) low = mid; else high = mid;
  }
  return (low + high) / 2;
}
export function qpcrWelch(a, b) {
  const blank = { se: null, df: null, p_value: null, ci_low_log2: null, ci_high_log2: null };
  if (a.length < 2 || b.length < 2) return { ...blank, inference: "At least 2 biological samples per group are required" };
  const vA = variance(a) / a.length, vB = variance(b) / b.length, se = Math.sqrt(vA + vB);
  if (!(se > 1e-12) || !Number.isFinite(se)) return { ...blank, inference: "No measurable biological variance; inference unavailable" };
  const df = (vA + vB) ** 2 / (vA ** 2 / (a.length - 1) + vB ** 2 / (b.length - 1));
  const difference = mean(a) - mean(b), width = qpcrTCritical(df) * se;
  return { se, df, p_value: twoTailedPValue(difference / se, df), ci_low_log2: difference - width, ci_high_log2: difference + width, inference: "Welch, independent biological samples" };
}
function logMeanQuantity(cqs, factor) {
  const values = cqs.map(cq => -cq * Math.log2(factor)), max = Math.max(...values);
  return max + Math.log2(mean(values.map(v => 2 ** (v - max))));
}
function fold(logValue) {
  if (logValue === null) return null;
  const value = 2 ** logValue;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function analyzeQpcr(input, options = {}, context = {}) {
  const settings = qpcrSettings(options), warnings = [];
  await checkpoint(context, "reading-cq-table", 0.02);
  const source = String(input ?? "").replace(/^\ufeff/, "");
  if (!source.trim()) throw new Error("Enter a Cq table with sample, target, condition, and cq columns.");
  if (source.length > QPCR_LIMITS.characters) throw new Error(`Input exceeds ${QPCR_LIMITS.characters.toLocaleString("en-US")} characters.`);
  const { delimiter } = detectDelimiter(source);
  const parsed = parseDelimitedRows(source, delimiter);
  if (parsed.warnings.length) throw new Error(`Invalid Cq table: ${parsed.warnings[0]}`);
  const rows = parsed.rows;
  if (rows.length < 2) throw new Error("The Cq table needs a header and at least one reaction.");
  if (rows.length - 1 > settings.maxReactions) throw new Error(`Input exceeds the maximum of ${settings.maxReactions} reactions.`);
  if (rows[0].length > QPCR_LIMITS.columns || rows.reduce((n, r) => n + r.length, 0) > QPCR_LIMITS.cells) throw new Error("Input exceeds 32 columns or 500,000 cells. Keep the columns needed for Cq analysis.");
  const header = rows[0].map(s => s.trim().toLowerCase());
  if (header.some(s => !s) || new Set(header).size !== header.length) throw new Error("Column names must be non-empty and unique (case-insensitive).");
  const cqNames = ["cq", "ct", "cp"].filter(s => header.includes(s));
  if (cqNames.length !== 1) throw new Error("Provide exactly one Cq column named cq, ct, or cp.");
  header[header.indexOf(cqNames[0])] = "cq";
  for (const name of ["sample", "target", "condition", "cq"]) if (!header.includes(name)) throw new Error(`Missing required column: ${name}.`);
  const indices = Object.fromEntries(header.map((s, i) => [s, i]));
  const reactions = [], sampleConditions = new Map(), efficiencies = new Map(), targetRuns = new Map(), technicalIds = new Set(), wells = new Set();
  const sets = new Map(), targets = new Set();
  for (let i = 1; i < rows.length; i++) {
    if (i % 256 === 1) await checkpoint(context, "reading-cq-table", 0.05 + 0.25 * i / rows.length);
    const raw = rows[i], where = `Table row ${i + 1}`;
    if (raw.length !== header.length) throw new Error(`${where} has ${raw.length} fields; the header has ${header.length}. Use CSV quotes around values containing commas.`);
    const cell = name => raw[indices[name]]?.trim() ?? "";
    const sample = label(cell("sample"), `${where}: sample`), target = label(cell("target"), `${where}: target`);
    const role = choose(cell("role").toLowerCase() || "sample", ["sample", "ntc", "nort"], `${where}: role`);
    const condition = label(cell("condition"), `${where}: condition`, role === "sample");
    const excluded = boolean(cell("exclude"), where), run = label(cell("run"), `${where}: run`, false);
    const replicate = label(cell("replicate"), `${where}: replicate`, false), well = label(cell("well"), `${where}: well`, false);
    const cqText = cell("cq"), cq = missing.has(cqText.toLowerCase()) ? null : Number(cqText);
    if (cq !== null && (!decimal.test(cqText) || !Number.isFinite(cq) || cq <= 0 || cq > 100)) throw new Error(`${where}: Cq must be a number greater than 0 and no more than 100, or an undetermined value.`);
    const efficiency = cell("efficiency") === "" ? null : number(cell("efficiency"), `${where}: efficiency (%)`, 1, 200);
    if (efficiency !== null) {
      if (efficiencies.has(target) && Math.abs(efficiencies.get(target) - efficiency) > 1e-8) throw new Error(`${where}: conflicting efficiencies for ${target}. Use one validated efficiency per assay.`);
      efficiencies.set(target, efficiency);
    }
    if (replicate) {
      const id = key(sample, target, role, replicate);
      if (technicalIds.has(id)) throw new Error(`${where}: duplicate replicate ${replicate} for ${sample} / ${target}.`);
      technicalIds.add(id);
    }
    // A well may contain several multiplex targets, but not two rows of one target.
    if (well) {
      const id = key(run, well.toUpperCase(), target);
      if (wells.has(id)) throw new Error(`${where}: duplicate well ${well} for ${target} in the same run.`);
      wells.add(id);
    }
    const r = { row: i + 1, sample, target, condition, role, replicate, run, well, cq, excluded, efficiency, status: excluded ? "Excluded by user" : cq === null ? "Undetermined" : "Detected" };
    reactions.push(r);
    if (role !== "sample") continue;
    if (sampleConditions.has(sample) && sampleConditions.get(sample) !== condition) throw new Error(`${where}: sample ${sample} belongs to more than one condition. Each biological sample needs a unique ID.`);
    sampleConditions.set(sample, condition);
    targets.add(target);
    if (!excluded) {
      if (!targetRuns.has(target)) targetRuns.set(target, new Set());
      targetRuns.get(target).add(run);
    }
    const id = key(sample, target);
    if (!sets.has(id)) sets.set(id, []);
    sets.get(id).push(r);
  }
  if (!sampleConditions.size) throw new Error("No biological sample reactions were found; negative controls are not expression samples.");
  const conditions = [...new Set(sampleConditions.values())], targetList = sorted(targets), samples = sorted(sampleConditions.keys());
  if (samples.length > QPCR_LIMITS.samples || targets.size > QPCR_LIMITS.targets || conditions.length > QPCR_LIMITS.conditions) throw new Error("Analysis supports at most 2,000 biological samples, 64 assays and 24 conditions.");
  for (const [target, runs] of targetRuns) if (runs.size > 1) throw new Error(`${target} spans multiple or unspecified runs. Analyze one run per assay; this tool does not perform inter-run calibration.`);
  for (const ref of settings.referenceGenes) if (!targets.has(ref)) throw new Error(`Reference gene ${ref} is not present among sample reactions. Gene names are case-sensitive.`);
  if (!conditions.includes(settings.calibrator)) throw new Error(`Calibrator condition ${settings.calibrator} was not found. Condition names are case-sensitive.`);
  const genes = targetList.filter(t => !settings.referenceGenes.includes(t));
  if (!genes.length) throw new Error("No target genes remain after selecting the reference genes.");
  if (samples.length * genes.length > QPCR_LIMITS.sampleResults) throw new Error("Analysis exceeds 50,000 sample/target results. Analyze fewer targets or samples together.");
  for (const target of targetList) {
    if (settings.method === "efficiency" && !efficiencies.has(target)) throw new Error(`Provide efficiency (%) for ${target}, or explicitly choose ΔΔCq (100% efficiency).`);
  }
  if (settings.method === "ddcq") warnings.push("ΔΔCq assumes 100% amplification efficiency for every assay; input efficiency values are not used.");
  else if ([...efficiencies.values()].some(e => e < 90 || e > 110)) warnings.push("One or more assay efficiencies are outside 90–110%. Review assay validation; no efficiency was changed automatically.");
  if (settings.referenceGenes.length === 1) warnings.push("Normalization uses one reference gene. Confirm that it is stable across these conditions.");
  const detectedControls = reactions.filter(r => r.role !== "sample" && !r.excluded && r.cq !== null);
  if (detectedControls.length) warnings.push(`${detectedControls.length} negative-control reaction(s) have detected Cq values. Review contamination, genomic DNA or nonspecific amplification before interpreting expression.`);
  const technical = [], technicalMap = new Map();
  let index = 0;
  for (const group of sets.values()) {
    if (index++ % 128 === 0) await checkpoint(context, "combining-technical-replicates", 0.35 + 0.15 * index / sets.size);
    const r = group[0], active = group.filter(x => !x.excluded), cqs = active.filter(x => x.cq !== null).map(x => x.cq);
    const undetermined = active.length - cqs.length;
    const cqSd = cqs.length > 1 ? Math.sqrt(variance(cqs)) : null;
    const factor = settings.method === "ddcq" ? 2 : 1 + efficiencies.get(r.target) / 100;
    let status = "Usable";
    if (!active.length) status = "All reactions excluded";
    else if (cqs.length < settings.minReplicates) status = "Too few detected technical replicates";
    else if (undetermined && settings.missingPolicy === "strict") status = "Undetermined technical replicate";
    const logQuantity = status === "Usable" ? settings.method === "ddcq" ? -mean(cqs) : logMeanQuantity(cqs, factor) : null;
    const entry = { sample: r.sample, condition: r.condition, target: r.target, reactions: group.length, excluded: group.length - active.length, detected: cqs.length, undetermined, mean_cq: cqs.length ? mean(cqs) : null, cq_sd: cqSd, efficiency_percent: (factor - 1) * 100, log2_quantity: logQuantity, status, qc: cqSd !== null && cqSd > settings.maxCqSd ? "High technical Cq SD" : "" };
    technical.push(entry); technicalMap.set(key(r.sample, r.target), entry);
  }
  technical.sort((a, b) => a.sample < b.sample ? -1 : a.sample > b.sample ? 1 : a.target < b.target ? -1 : 1);
  const highSd = technical.filter(t => t.qc).length, partial = technical.filter(t => t.undetermined && t.status === "Usable").length;
  if (highSd) warnings.push(`${highSd} sample/assay set(s) exceed technical Cq SD ${settings.maxCqSd}. They remain included when otherwise usable; review the Technical replicate table.`);
  if (partial) warnings.push(`${partial} sample/assay set(s) use only detected wells under the selected missing-well policy. This can bias expression estimates; inspect the Technical replicate table.`);
  const sampleRows = [], normalized = new Map();
  index = 0;
  for (const sample of samples) {
    if (index++ % 64 === 0) await checkpoint(context, "normalizing-expression", 0.5 + 0.15 * index / samples.length);
    const refs = settings.referenceGenes.map(ref => technicalMap.get(key(sample, ref)));
    const badRefs = settings.referenceGenes.filter((_, i) => refs[i]?.log2_quantity == null);
    const referenceLog = badRefs.length ? null : mean(refs.map(r => r.log2_quantity));
    for (const target of genes) {
      const t = technicalMap.get(key(sample, target)), condition = sampleConditions.get(sample);
      const status = badRefs.length ? `Missing or unusable reference: ${badRefs.join(", ")}` : !t ? "Target not measured" : t.status;
      const value = status === "Usable" ? t.log2_quantity - referenceLog : null;
      const r = { sample, condition, target, log2_normalized_quantity: value, log2_fold_change: null, fold_change: null, delta_cq: settings.method === "ddcq" && value !== null ? -value : null, delta_delta_cq: null, status, qc: [t?.qc ? "High target technical Cq SD" : "", refs.some(r => r?.qc) ? "High reference technical Cq SD" : ""].filter(Boolean).join("; ") };
      sampleRows.push(r);
      if (value !== null) { const k = key(target, condition); if (!normalized.has(k)) normalized.set(k, []); normalized.get(k).push(value); }
    }
  }
  const groupRows = [], calibrators = new Map();
  for (const target of genes) {
    const controls = normalized.get(key(target, settings.calibrator)) ?? [];
    const baseline = controls.length ? mean(controls) : null;
    calibrators.set(target, baseline);
    if (baseline === null) warnings.push(`${target}: no usable biological samples in calibrator condition ${settings.calibrator}; relative expression is unavailable.`);
    for (const condition of conditions) {
      const values = normalized.get(key(target, condition)) ?? [], n = values.length;
      const total = samples.filter(s => sampleConditions.get(s) === condition).length;
      const logFold = n && baseline !== null ? mean(values) - baseline : null;
      const isControl = condition === settings.calibrator;
      const inference = settings.comparisons === "none" ? "Not requested" : isControl ? "Calibrator (self-comparison)" : qpcrWelch(values, controls);
      const stats = typeof inference === "string" ? { inference, se: null, df: null, p_value: null, ci_low_log2: null, ci_high_log2: null } : inference;
      groupRows.push({ target, condition, n, excluded_samples: total - n, calibrator_n: controls.length, log2_fold_change: logFold, fold_change: fold(logFold), sd_log2: n > 1 ? Math.sqrt(variance(values)) : null, ...stats, ci_low_fold: fold(stats.ci_low_log2), ci_high_fold: fold(stats.ci_high_log2), p_adjusted: null, status: !n ? "No usable samples" : baseline === null ? "No usable calibrator" : "Usable" });
    }
  }
  // BH family is all estimable target/condition contrasts against the calibrator.
  const tested = groupRows.filter(r => r.p_value !== null).sort((a, b) => a.p_value - b.p_value);
  let adjusted = 1;
  for (let i = tested.length - 1; i >= 0; i--) { adjusted = Math.min(adjusted, tested[i].p_value * tested.length / (i + 1)); tested[i].p_adjusted = adjusted; }
  for (const r of sampleRows) {
    const baseline = calibrators.get(r.target);
    if (r.log2_normalized_quantity !== null && baseline !== null) {
      r.log2_fold_change = r.log2_normalized_quantity - baseline;
      r.fold_change = fold(r.log2_fold_change);
      if (settings.method === "ddcq") r.delta_delta_cq = -r.log2_fold_change;
    } else if (r.status === "Usable") r.status = "No usable calibrator";
  }
  const unusable = sampleRows.filter(r => r.status !== "Usable").length;
  if (unusable) warnings.push(`${unusable} of ${sampleRows.length} biological sample/target results are unavailable. The Sample expression table gives each reason; group sample counts exclude these results.`);
  if (settings.comparisons === "welch") {
    const unavailable = groupRows.filter(r => r.condition !== settings.calibrator && r.p_value === null).length;
    if (unavailable) warnings.push(`${unavailable} comparison(s) have no confidence interval or p value because biological replication or variance is insufficient.`);
  }
  if (groupRows.some(r => ["ci_low_log2", "ci_high_log2"].some(k => r[k] !== null && fold(r[k]) === null))) warnings.push("Some fold-change confidence bounds exceed the numeric range; log2 bounds remain available in the Group comparison table.");
  await checkpoint(context, "finishing-analysis", 0.85);
  return { settings, reactions, technical, sampleRows, groupRows, warnings, conditions, targets: genes, biologicalSamples: samples.length, comparisonsTested: tested.length };
}
