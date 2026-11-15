// Van Winkle, Beheshti & Rill, Electrophoresis 23 (2002), 15–19.
// https://pubmed.ncbi.nlm.nih.gov/11824615/
// Coefficients: Beheshti's 2002 dissertation, Eq. 2.56 and Fig. 4.4 (p. 62):
// https://studyres.com/doc/15301051/dna-electrophoresis-in-th-agarose-gels--a-new-mobility
// Linear dsDNA, 100–10,000 bp; 0.5–1.5% SeaKem LE agarose, 1× TBE,
// ~22 °C, 2.78 V/cm, stained after electrophoresis. This is an empirical
// interpolation of published fits, not a universal first-principles model.
export const DNA_GEL_DEFAULTS = Object.freeze({ gelAgarosePercent: 1, gelStain: "green" });
export const DNA_GEL_STAINS = Object.freeze({
  green: "Green",
  red: "Red",
  grayscale: "Grayscale"
});
export const DNA_GEL_MODEL = Object.freeze({
  id: "van-winkle-beheshti-rill-2002",
  minAgarosePercent: 0.5, maxAgarosePercent: 1.5,
  minBp: 100, maxBp: 10000,
  referenceBp: 100, referenceRunFraction: 0.9
});

export function normalizeDnaGelOptions(options = {}) {
  const value = options.gelAgarosePercent;
  const concentration = value == null || value === "" ? DNA_GEL_DEFAULTS.gelAgarosePercent
    : typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(concentration) || concentration < DNA_GEL_MODEL.minAgarosePercent || concentration > DNA_GEL_MODEL.maxAgarosePercent) {
    throw new Error("Agarose concentration must be between 0.5% and 1.5%, the supported migration-model range.");
  }
  const gelStain = options.gelStain ?? DNA_GEL_DEFAULTS.gelStain;
  if (!Object.hasOwn(DNA_GEL_STAINS, gelStain)) throw new Error("Choose a supported gel stain / imaging appearance.");
  return { gelAgarosePercent: concentration, gelStain };
}

/** Mobility in the common scale of the published coefficients. Only ratios
 * enter the image: that scale cancels, so no absolute run time is claimed.
 * L is bp, γ is converted from the published kbp; C is percent (1 means 1%).
 * Beyond the measured length domain, callers must disclose extrapolation.
 */
export function dnaGelMobility(lengthBp, agarosePercent = DNA_GEL_DEFAULTS.gelAgarosePercent) {
  if (!Number.isFinite(lengthBp) || lengthBp <= 0) throw new Error("DNA gel fragment length must be positive and finite.");
  const { gelAgarosePercent: c } = normalizeDnaGelOptions({ gelAgarosePercent: agarosePercent });
  const muShort = 3.56 - 0.58 * c;
  const muLong = 1.99 * Math.exp(-1.59 * c);
  const gammaBp = 1000 * (7.49 + 2.78 * c);
  return 1 / (1 / muShort + (1 / muLong - 1 / muShort) * -Math.expm1(-lengthBp / gammaBp));
}

/** Stop when the 100 bp reference reaches 90% of the track. From d = μEt,
 * t = d_ref/(μ_ref E), hence d/L_track = 0.9 μ/μ_ref for every lane.
 * No sample-dependent rescaling or independent top/bottom stretching.
 */
export function dnaGelRunFraction(lengthBp, agarosePercent) {
  return DNA_GEL_MODEL.referenceRunFraction * dnaGelMobility(lengthBp, agarosePercent)
    / dnaGelMobility(DNA_GEL_MODEL.referenceBp, agarosePercent);
}

export function dnaGelLengthIsCalibrated(lengthBp) {
  return lengthBp >= DNA_GEL_MODEL.minBp && lengthBp <= DNA_GEL_MODEL.maxBp;
}
