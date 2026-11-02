// SantaLucia 1998 unified DNA/DNA nearest-neighbor parameters and entropy salt
// correction: https://doi.org/10.1073/pnas.95.4.1460 (DNA_NN3 / saltcorr=5 in
// Biopython). Mg sodium-equivalent approximation: von Ahsen et al. 2001,
// https://doi.org/10.1093/clinchem/47.11.1956. Perfectly matched duplex only.
const NEIGHBORS = {
  AA: [-7.9, -22.2], TT: [-7.9, -22.2], AT: [-7.2, -20.4], TA: [-7.2, -21.3],
  CA: [-8.5, -22.7], TG: [-8.5, -22.7], GT: [-8.4, -22.4], AC: [-8.4, -22.4],
  CT: [-7.8, -21.0], AG: [-7.8, -21.0], GA: [-8.2, -22.2], TC: [-8.2, -22.2],
  CG: [-10.6, -27.2], GC: [-9.8, -24.4], GG: [-8.0, -19.9], CC: [-8.0, -19.9]
};

export function dnaNearestNeighborTm(sequence, { sodiumMm, magnesiumMm, dntpMm, oligoNm }) {
  if (!/^[ACGT]{2,1000}$/.test(sequence)) return null;
  const equivalentSalt = sodiumMm + (magnesiumMm > dntpMm ? 120 * Math.sqrt(magnesiumMm - dntpMm) : 0);
  if (!(equivalentSalt > 0) || !(oligoNm > 0)) return null;
  let enthalpy = 0;
  let entropy = 0;
  for (const end of [sequence[0], sequence.at(-1)]) {
    enthalpy += "AT".includes(end) ? 2.3 : 0.1;
    entropy += "AT".includes(end) ? 4.1 : -2.8;
  }
  for (let index = 0; index < sequence.length - 1; index += 1) {
    const [h, s] = NEIGHBORS[sequence.slice(index, index + 2)];
    enthalpy += h;
    entropy += s;
  }
  const reverseComplement = [...sequence].reverse().map((base) => ({ A: "T", T: "A", C: "G", G: "C" })[base]).join("");
  const selfComplementary = sequence === reverseComplement;
  if (selfComplementary) entropy -= 1.4;
  entropy += 0.368 * (sequence.length - 1) * Math.log(equivalentSalt / 1000);
  // Equal concentrations of two complementary strands; self-complementary
  // input denotes one strand species at the entered concentration.
  const effectiveConcentration = oligoNm * 1e-9 * (selfComplementary ? 1 : 0.5);
  const tm = 1000 * enthalpy / (entropy + 1.987 * Math.log(effectiveConcentration)) - 273.15;
  return { tm, selfComplementary, equivalentSaltMm: equivalentSalt };
}
