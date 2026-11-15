import { zlibSync } from "../vendor/file-tools/compression-runtime.js";

// FNV with a final avalanche: merely hashing keys ending in x/y left their
// coordinates correlated, arranging the old photographic flecks diagonally.
export function opticalRandom(seed) {
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const sqrtTwo = Math.sqrt(2);
// Teaching/display aid: a genuine band has at least this peak opacity. This
// does not change its calculated mass or create signal in empty lanes.
const minimumBandDisplay = 0.18;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function pngChunk(name, data) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set([...name].map(character => character.charCodeAt(0)), 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}

function indexedPng(width, height, rows, colors) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  header[8] = 8; header[9] = 3; // 8-bit indexed PNG, with transparent zero.
  const palette = new Uint8Array(256 * 3);
  const alpha = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    // Keep faint/mid-tone emission saturated. Only the strongest cores receive
    // a small, smooth lightening; equal secondary channels preserve the hue.
    const knee = clamp((i / 255 - 0.72) / 0.28, 0, 1);
    const highlight = knee * knee * (3 - 2 * knee);
    for (let channel = 0; channel < 3; channel++) {
      palette[i * 3 + channel] = Math.round(colors[0][channel] + highlight * (colors[1][channel] - colors[0][channel]));
    }
    alpha[i] = i;
  }
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("PLTE", palette), pngChunk("tRNS", alpha),
    pngChunk("IDAT", zlibSync(rows, { level: 6 })), pngChunk("IEND", new Uint8Array())];
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const binary = [];
  for (let start = 0; start < bytes.length; start += 32768) binary.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
  return `data:image/png;base64,${btoa(binary.join(""))}`;
}

// Abramowitz–Stegun erf approximation. A finite loading slot convolved with a
// Gaussian has this flat-topped horizontal profile and continuous shoulders.
function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}

function displayResponse(intensity, exposure, highlightGain) {
  const knee = clamp((intensity - 0.35) / 0.6, 0, 1);
  const exposed = intensity * (1 + highlightGain * knee * knee * (3 - 2 * knee));
  return -Math.expm1(-exposure * Math.max(0, exposed));
}

function addBand(field, dimmedField, width, height, scale, bounds, band, index, seed, exposure, highlightGain) {
  const random = key => opticalRandom(`${seed}:band:${index}:${band.x}:${key}`);
  const signal = Math.max(0, band.signal);
  if (signal === 0) return;
  // Keep the accepted photographic profile independent of the new mass gain.
  // A global exposure reduction narrowed its visible shoulders and core.
  const profileSignal = clamp(band.profileSignal ?? signal, 0, 1);
  let brightnessGain = Math.pow(clamp(signal, 0, 1), 0.24);
  const distance = clamp(Number(band.migrationFraction) || 0, 0, 1);
  const sigma = Math.sqrt((band.height * (0.29 + random("softness") * 0.035)) ** 2 + 0.24 * distance);
  const shoulder = 1.25 + random("shoulder") * 0.3 + distance * 0.12;
  // Reserve the outer shoulder for optical falloff so the visible band, not
  // merely the unblurred plateau, fits the loading well.
  const halfSlot = band.width / 2 - 2 * shoulder;
  const tailSigma = sigma * (1.55 + random("tail-width") * 0.3);
  const tailFraction = 0.06 + random("tail-strength") * 0.04;
  const tailOffset = -band.height * 0.43;
  const hotSigma = band.height * (0.205 + random("core-softness") * 0.015);
  const hotFraction = 0.60;
  const hotOffset = band.height * 0.13;
  const bodyFraction = 1 - hotFraction - tailFraction;
  // Keep the full fluorescence centroid at the nominal migration position.
  const bodyOffset = -(hotFraction * hotOffset + tailFraction * tailOffset) / bodyFraction;
  // The middle stays straight. Restore the visible, restrained smile only
  // in the outer shoulders, with a little variation between bands.
  const lift = 0.75 + random("end-lift") * 0.25;
  const tilt = (random("tilt") - 0.5) * 0.18;
  const phase = random("tail-phase") * Math.PI * 2;
  const centerX = band.x - bounds.x, centerY = band.y - bounds.y;
  const x0 = clamp(Math.floor((centerX - halfSlot - shoulder * 4) * scale), 0, width);
  const x1 = clamp(Math.ceil((centerX + halfSlot + shoulder * 4) * scale), 0, width);
  const y0 = clamp(Math.floor((centerY + tailOffset - tailSigma * 4.5 - 1) * scale), 0, height);
  const y1 = clamp(Math.ceil((centerY + tailSigma * 4.5 + 1) * scale), 0, height);
  // Normalize the Gaussian widths so softening redistributes the fluorescence
  // instead of inventing mass. Exposure remains an illustrative imager setting.
  const amplitude = profileSignal * 2.6;
  const coreAmplitude = amplitude / sigma * bodyFraction;
  const hotAmplitude = amplitude / hotSigma * hotFraction;
  const tailAmplitude = amplitude / tailSigma * tailFraction;
  const patchWidth = x1 - x0;
  const profile = new Float64Array(patchWidth * (y1 - y0));
  let peak = 0;
  for (let px = x0; px < x1; px++) {
    const dx = (px + 0.5) / scale - centerX;
    const horizontal = 0.5 * (erf((dx + halfSlot) / (sqrtTwo * shoulder)) - erf((dx - halfSlot) / (sqrtTwo * shoulder)));
    const u = clamp(dx / halfSlot, -1, 1);
    const shoulderLift = Math.max(0, (Math.abs(u) - 0.6) / 0.4) ** 2;
    const center = centerY + lift * (2 / 15 - shoulderLift) + tilt * u;
    const tailCenter = center + tailOffset + 0.16 * Math.sin(4 * u + phase);
    for (let py = y0; py < y1; py++) {
      const y = (py + 0.5) / scale;
      const core = coreAmplitude * Math.exp(-0.5 * ((y - center - bodyOffset) / sigma) ** 2);
      const hotCore = hotAmplitude * Math.exp(-0.5 * ((y - center - hotOffset) / hotSigma) ** 2);
      const tail = tailAmplitude * Math.exp(-0.5 * ((y - tailCenter) / tailSigma) ** 2);
      // Sum overlapping profiles before the display curve. A second sum carries
      // the mass-dependent gain; for an isolated band its ratio is constant
      // across the whole profile, preserving thickness, smile and edge fades.
      const value = horizontal * (core + hotCore + tail);
      profile[(py - y0) * patchWidth + px - x0] = value;
      peak = Math.max(peak, value);
    }
  }
  if (peak === 0) return;
  // Scale the complete faint-band profile, never clamp individual pixels:
  // edge fades, thickness and smile survive, without rectangular boundaries.
  // Brighter bands keep their exact existing gain and fluorescence samples.
  brightnessGain = Math.max(brightnessGain, minimumBandDisplay / displayResponse(peak, exposure, highlightGain));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const value = profile[(py - y0) * patchWidth + px - x0];
      field[py * width + px] += value;
      dimmedField[py * width + px] += value * brightnessGain;
    }
  }
}

function boxBlur(source, width, height, radius) {
  const horizontal = new Float32Array(source.length);
  const output = new Float32Array(source.length);
  const diameter = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= radius && x < width; x++) sum += source[row + x];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / diameter;
      if (x - radius >= 0) sum -= source[row + x - radius];
      if (x + radius + 1 < width) sum += source[row + x + radius + 1];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= radius && y < height; y++) sum += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / diameter;
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x];
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x];
    }
  }
  return output;
}

/** Additive fluorescence image, embedded without a browser canvas or network
 * resource. Labels/inspection remain vector SVG. Four samples per drawing unit
 * resolve the Gaussian edges; a six-million-pixel cap bounds wide-comb memory.
 */
export function renderFluorescenceImage({ bounds, bands, colors, appearanceSeed, exposure = 2.2, bloomStrength = 0.08, highlightGain = 0 }) {
  const scale = Math.min(4, Math.sqrt(6000000 / (bounds.width * bounds.height)));
  const width = Math.ceil(bounds.width * scale), height = Math.ceil(bounds.height * scale);
  const field = new Float32Array(width * height);
  const dimmedField = new Float32Array(width * height);
  bands.forEach((band, index) => addBand(field, dimmedField, width, height, scale, bounds, band, index, appearanceSeed, exposure, highlightGain));

  // Bloom from the bright part of the summed signal. Thresholding is smooth;
  // faint bands contribute almost nothing. Blur on a coarser grid because its
  // sigma is much wider than a pixel, then interpolate before the display curve.
  const bw = Math.ceil(bounds.width), bh = Math.ceil(bounds.height);
  let bloom = new Float32Array(bw * bh);
  let dimmedBloom = new Float32Array(bw * bh);
  const samples = new Uint16Array(bloom.length);
  for (let y = 0; y < height; y++) {
    const row = Math.min(bh - 1, Math.floor(y / scale)) * bw;
    for (let x = 0; x < width; x++) {
      const value = field[y * width + x];
      const t = clamp((value - 0.28) / 0.42, 0, 1);
      const target = row + Math.min(bw - 1, Math.floor(x / scale));
      bloom[target] += value * t * t * (3 - 2 * t);
      dimmedBloom[target] += dimmedField[y * width + x] * t * t * (3 - 2 * t);
      samples[target]++;
    }
  }
  for (let i = 0; i < bloom.length; i++) {
    bloom[i] /= Math.max(1, samples[i]);
    dimmedBloom[i] /= Math.max(1, samples[i]);
  }
  const heights = bands.map(band => band.height).sort((a, b) => a - b);
  const bloomSigma = (heights[Math.floor(heights.length / 2)] || 7) * 1.3;
  // Three normalized box filters approximate a Gaussian with sigma²=r(r+1).
  const radius = Math.max(1, Math.round((Math.sqrt(4 * bloomSigma ** 2 + 1) - 1) / 2));
  for (let pass = 0; pass < 3; pass++) {
    bloom = boxBlur(bloom, bw, bh, radius);
    dimmedBloom = boxBlur(dimmedBloom, bw, bh, radius);
  }

  const rows = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const gy = clamp((y + 0.5) / scale - 0.5, 0, bh - 1);
    const y0 = Math.floor(gy), y1 = Math.min(bh - 1, y0 + 1), fy = gy - y0;
    const row = y * (width + 1);
    rows[row] = 1; // PNG Sub filter compresses the smooth intensity image.
    let previous = 0;
    for (let x = 0; x < width; x++) {
      const gx = clamp((x + 0.5) / scale - 0.5, 0, bw - 1);
      const x0 = Math.floor(gx), x1 = Math.min(bw - 1, x0 + 1), fx = gx - x0;
      const upper = bloom[y0 * bw + x0] * (1 - fx) + bloom[y0 * bw + x1] * fx;
      const lower = bloom[y1 * bw + x0] * (1 - fx) + bloom[y1 * bw + x1] * fx;
      const intensity = field[y * width + x] + bloomStrength * (upper * (1 - fy) + lower * fy);
      const dimmedUpper = dimmedBloom[y0 * bw + x0] * (1 - fx) + dimmedBloom[y0 * bw + x1] * fx;
      const dimmedLower = dimmedBloom[y1 * bw + x0] * (1 - fx) + dimmedBloom[y1 * bw + x1] * fx;
      const dimmedIntensity = dimmedField[y * width + x] + bloomStrength * (dimmedUpper * (1 - fy) + dimmedLower * fy);
      // Restore the accepted exposure/profile, then dim a complete band evenly.
      // This is an illustrative photographic contrast mapping, not a calibrated
      // densitometry scale. At 30/50/80/100 ng the extra gain is .75/.85/.95/1.
      // Hue lightening still follows the resulting brightness in indexedPng.
      const gain = intensity > 0 ? Math.max(0, dimmedIntensity / intensity) : 0;
      const display = Math.round(255 * clamp(displayResponse(intensity, exposure, highlightGain) * gain, 0, 1));
      rows[row + x + 1] = (display - previous) & 255;
      previous = display;
    }
  }
  return { href: indexedPng(width, height, rows, colors), width, height,
    bloomStrength, bloomSigma };
}
