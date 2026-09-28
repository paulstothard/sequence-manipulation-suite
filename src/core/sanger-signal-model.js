// Processed-signal approximation guided by six public AB1 traces.
// Measurements, independent Biopython reader and limitations:
// test/fixtures/sanger-signal/README.md and docs/sanger-signal-model.md.
// Rounded parameters describe a small convenience panel, not a fitted instrument.
export const SANGER_SIGNAL_PROFILE = 'public-ab1-profile-v1';

export function measuredPeakShape(random, spacing, flank = false) {
  const centerOffset = spacing * 0.1 * (2 * random() - 1);
  const fwhm = spacing * (0.53 + 0.045 * (2 * random() - 1));
  const sigma = fwhm / (2 * Math.sqrt(2 * Math.log(2))) * (flank ? 1.3 : 1);
  const asymmetry = 0.025 * (2 * random() - 1);
  return { centerOffset, leftSigma: sigma * (1 - asymmetry), rightSigma: sigma * (1 + asymmetry) };
}

export function measuredPeakHeight(random, variation) {
  // Lognormal variation keeps amplitudes positive, including at large settings.
  // Bound extreme tails for predictable exported signal ranges.
  const normal = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random());
  const sigma = Math.sqrt(Math.log(1 + variation ** 2));
  return Math.exp(sigma * Math.max(-2.5, Math.min(2.5, normal)) - sigma ** 2 / 2);
}

export function makeMeasuredBackground(random) {
  const level = () => Math.min(6, -Math.log(Math.max(Number.EPSILON, 1 - random())));
  let left = level(), right = level();
  return sample => {
    // Four samples = one quarter of a simulated base spacing. Independent
    // channels have smooth positive residuals with a small fine-grained component.
    if (sample > 0 && sample % 4 === 0) { left = right; right = level(); }
    const fraction = (sample % 4) / 4;
    return 0.9 * (left + fraction * (right - left)) + 0.1 * random();
  };
}
