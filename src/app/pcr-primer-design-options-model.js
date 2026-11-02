import { PCR_PRIMER_DESIGN_DEFAULTS, PCR_PRIMER_DESIGN_PRESETS } from '../core/pcr-primer-design-options.js';
export { PCR_PRIMER_DESIGN_PRESETS } from '../core/pcr-primer-design-options.js';

export const PCR_PRIMER_CONSTRAINT_DETAIL_IDS = [
  "templateRegions",
  "primerLength",
  "tmAndGc",
  "threePrimeAndClamp",
  "secondaryStructure"
];

export function formatPcrPrimerDesignSummary(values = {}) {
  const presetId = values.designPreset ?? "custom";
  const presetLabel = PCR_PRIMER_DESIGN_PRESETS[presetId]?.label ?? "Custom";
  const productMin = values.minProductLength ?? PCR_PRIMER_DESIGN_DEFAULTS.minProductLength;
  const productMax = values.maxProductLength ?? PCR_PRIMER_DESIGN_DEFAULTS.maxProductLength;
  const primerMin = values.primerMinLength ?? PCR_PRIMER_DESIGN_DEFAULTS.primerMinLength;
  const primerMax = values.primerMaxLength ?? PCR_PRIMER_DESIGN_DEFAULTS.primerMaxLength;
  const optTm = values.primerOptTm ?? PCR_PRIMER_DESIGN_DEFAULTS.primerOptTm;
  const gcMin = values.primerMinGc ?? PCR_PRIMER_DESIGN_DEFAULTS.primerMinGc;
  const gcMax = values.primerMaxGc ?? PCR_PRIMER_DESIGN_DEFAULTS.primerMaxGc;
  const target = String(values.targetRegion ?? "").trim();
  const excluded = String(values.excludedRegions ?? "")
    .trim()
    .replace(/\s*[\r\n]+\s*/g, ", ");
  const regionText = [
    target ? `target ${target}` : "",
    excluded ? `excluded ${excluded}` : ""
  ].filter(Boolean);
  return `${presetLabel}: ${productMin}-${productMax} bp products, ${primerMin}-${primerMax} nt primers, Tm around ${optTm} C, GC ${gcMin}-${gcMax}%${regionText.length ? `; ${regionText.join("; ")}` : ""}.`;
}
