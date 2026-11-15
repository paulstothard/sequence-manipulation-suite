import { dnaGelMobility, dnaGelRunFraction, normalizeDnaGelOptions } from "./dna-gel-model.js";

// Thermo Fisher, Five Main Nucleic Acid Gel Electrophoresis Steps, Table 7.
// Apparent DNA sizes (bp) for tracking dyes in standard agarose / TBE.
// https://www.thermofisher.com/us/en/home/life-science/cloning/cloning-learning-center/invitrogen-school-of-molecular-biology/na-electrophoresis-education/na-electrophoresis-workflow.html
// These are approximate vendor mobility equivalents, not measurements under
// the exact SeaKem/field/temperature conditions of our DNA fit. Agarose brands
// and loading-buffer formulations differ. Do not use the low-melting-point or
// TAE tables here. Log-size interpolation preserves positive, monotonic sizes.
const TBE_EQUIVALENTS = [
  [0.5, 750, 13000],
  [0.6, 540, 8820],
  [0.7, 410, 6400],
  [0.8, 320, 4830],
  [0.9, 260, 3770],
  [1.0, 220, 3030],
  [1.2, 160, 2070],
  [1.5, 110, 1300]
];

export function dnaGelTrackingDyes(agarosePercent) {
  const { gelAgarosePercent: c } = normalizeDnaGelOptions({ gelAgarosePercent: agarosePercent });
  const upperIndex = Math.max(1, TBE_EQUIVALENTS.findIndex(row => row[0] >= c));
  const low = TBE_EQUIVALENTS[upperIndex - 1];
  const high = TBE_EQUIVALENTS[upperIndex];
  const weight = (c - low[0]) / (high[0] - low[0]);
  // Same physical run length/field: t(C)/t(1%) = mu_ref(1%)/mu_ref(C).
  // This scale can drive an illustrative sqrt(time) diffusion width without
  // asserting an absolute run time, gel size or measured diffusion coefficient.
  const relativeRunTime = dnaGelMobility(100, 1) / dnaGelMobility(100, c);
  return ["Bromophenol blue", "Xylene cyanol"].map((name, index) => {
    const equivalentBp = Math.exp(Math.log(low[index + 1]) * (1 - weight) + Math.log(high[index + 1]) * weight);
    return { name, equivalentBp, runFraction: dnaGelRunFraction(equivalentBp, c), relativeRunTime };
  });
}
