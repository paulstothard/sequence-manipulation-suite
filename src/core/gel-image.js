import { opticalRandom, renderFluorescenceImage } from "./gel-fluorescence.js";

// Shared optical layer. The caller owns molecule sizes, migration, abundance,
// co-migration and inspection text. Optical texture never adds DNA bands.
// Visual references (not a calibration of signal or electrophoretic mobility):
// https://biotium.com/technology/nucleic-acid-gel-stains/
// https://biotium.com/faqs/difference-gelred-gelgreen/
// https://theminione.com/product/500-bp-dna-ladder/
// Well depth and band shoulders also follow Paul's supplied gel photographs.
// Green fluorescence approximates a filtered GelGreen/SYBR Safe photograph.
// Deterministic geometry keeps a completed result and its exports identical.

function fraction(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

function xml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

const n = (v) => Number(v).toFixed(2);

// One draw seed per tool run; exports reuse the resulting SVG verbatim.
export function createGelAppearanceSeed() {
  return globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 4294967296);
}

// Post-run stain / imager palettes; no change to positions, mass, or band shape.
// The imager filter and exposure affect photographed colors substantially.
// Hue anchors follow Biotium's photographed GelRed / GelGreen comparison panels:
// https://biotium.com/wp-content/uploads/2017/01/GR-vs-EB-updated.jpg
// https://biotium.com/wp-content/uploads/2017/01/GG-vs-SS-updated.jpg
// Bright band pixels are approximately (253,1,0) and (4,249,3), respectively.
// They are photographic references, not universal spectral-to-sRGB conversions.
// Keep this hue through the core; only the strongest signals have a small,
// balanced secondary-channel lift. This photographic highlight cue is separate
// from the measured hue anchors and does not imply a changed emission spectrum.
const palettes = {
  green: { fluorescence: [[0, 255, 0], [62, 255, 62]], bloomStrength: 0.1, background: ["#081808", "#030905"], profile: ["#598329", "#9fcd54", "#d7f39a", "#b6e477"], scatter: "#21bd18", body: "#2acb20", texture: [0.30, 0.47, 0.27], cloud: [0.15, 0.35, 0.12], well: "#020803", rim: "#52664c" },
  red: { fluorescence: [[255, 1, 0], [255, 54, 54]], bloomStrength: 0.1, background: ["#170305", "#080203"], profile: ["#963d24", "#ec7845", "#ffd36b", "#ffa16c"], scatter: "#e61612", body: "#e52720", texture: [0.47, 0.29, 0.24], cloud: [0.35, 0.13, 0.10], well: "#090302", rim: "#74504a" },
  grayscale: { fluorescence: [[244, 244, 244], [244, 244, 244]], background: ["#141414", "#060606"], profile: ["#707070", "#bdbdbd", "#eeeeee", "#d8d8d8"], scatter: "#ababab", body: "#c2c2c2", texture: [0.38, 0.38, 0.38], cloud: [0.24, 0.24, 0.24], well: "#050505", rim: "#606060" }
};
const tintMatrix = ([r, g, b], alpha) => `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${alpha} 0`;

function renderSlabIllumination(bounds, palette, stain, id, seed) {
  const { x, y, width, height } = bounds;
  const random = key => opticalRandom(`${seed}:slab:${key}`);
  // Smooth illumination of the stained slab is separate from DNA fluorescence.
  // The weak cool component in red images suggests excitation/filter leakage;
  // these are photographic effects, not additional bands or a stain calibration.
  const ambient = { green: "#75ba54", red: "#85436f", grayscale: "#b5b5b5" }[stain];
  const gradient = (name, color) => `<radialGradient id="${id(name)}"><stop stop-color="${color}"/><stop offset="0.25" stop-color="${color}" stop-opacity="0.75"/><stop offset="0.5" stop-color="${color}" stop-opacity="0.35"/><stop offset="0.75" stop-color="${color}" stop-opacity="0.08"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  const ellipse = (cx, cy, rx, ry, opacity, paint) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${id(paint)})" opacity="${opacity.toFixed(4)}"/>`;
  const parts = [
    `<g class="gel-slab-illumination" pointer-events="none" aria-hidden="true">`,
    `<defs>${gradient("slab-warm", palette.body)}${gradient("slab-ambient", ambient)}</defs>`,
    ellipse(x + width * (0.32 + 0.12 * random("warm-x")), y + height * (0.38 + 0.12 * random("warm-y")), width * 0.72, height * 0.72, 0.065, "slab-warm"),
    ellipse(x + width * (0.63 + 0.09 * random("ambient-x")), y + height * (0.22 + 0.10 * random("ambient-y")), width * 0.60, height * 0.58, 0.065, "slab-ambient")
  ];
  // A few elongated, softly fading reflections along the slab edge, rather
  // than an outlined rectangle. The surrounding scatter is weaker and wider.
  const patches = [
    [x + width * (0.24 + 0.20 * random("top-x")), y + 1.5, width * 0.22, 2.5, true],
    [x + 1.5, y + height * (0.22 + 0.15 * random("left-y")), 2.1, height * 0.22, false],
    [x + width - 1.4, y + height * (0.58 + 0.18 * random("right-y")), 2.5, height * 0.19, false],
    [x + width * (0.50 + 0.18 * random("bottom-x")), y + height - 1.4, width * 0.19, 2.3, true]
  ];
  patches.forEach(([cx, cy, rx, ry, horizontal], index) => {
    const strength = 0.045 + 0.025 * random(`edge-${index}`);
    parts.push(`<g class="gel-edge-scatter">`,
      ellipse(cx, cy, horizontal ? rx : rx * 3.4, horizontal ? ry * 3.4 : ry, strength * 0.36, "slab-ambient"),
      ellipse(cx, cy, rx, ry, strength, "slab-warm"), `</g>`);
  });
  parts.push(`</g>`);
  return parts.join("");
}

function renderWell(well, index, top, palette, id, seed = 0) {
  const random = key => fraction(`${seed}:well:${index}:${well.x}:${key}`);
  const width = well.width * (0.975 + random("width") * 0.05);
  const left = well.x - width / 2;
  const right = well.x + width / 2;
  // Top-down view of a closed pocket in the horizontal slab. Leave visible
  // gel above the back rim; the aperture is not a notch in the gel's edge.
  const back = top + 7.5 + random("back") * 0.8;
  const bottom = top + 17; // Retain the DNA model's migration origin.
  const lip = bottom + 1.2 + random("lip") * 1.2;
  // Small casting/optical differences, not independently displaced lanes.
  // Both ends and the back/front rim vary smoothly; the pocket stays closed.
  const backLeft = back + (random("back-left") - 0.5) * 0.7;
  const backRight = back + (random("back-right") - 0.5) * 0.7;
  const lipLeft = lip + (random("lip-left") - 0.5) * 0.7;
  const lipRight = lip + (random("lip-right") - 0.5) * 0.7;
  const cornerLeft = 3.6 + random("corner-left") * 1.8;
  const cornerRight = 3.6 + random("corner-right") * 1.8;
  const backBow = (random("back-bow") - 0.5) * 1.2;
  const frontBow = 0.1 + random("front-bow") * 0.9;
  const outline = `M${n(left + cornerLeft)},${n(backLeft)} Q${n(well.x)},${n(back + backBow)} ${n(right - cornerRight)},${n(backRight)} Q${n(right)},${n(backRight)} ${n(right)},${n(backRight + 3)} L${n(right - 0.5)},${n(bottom - 1)} Q${n(right - 0.8)},${n(lipRight)} ${n(right - cornerRight)},${n(lipRight)} Q${n(well.x)},${n(lip + frontBow)} ${n(left + cornerLeft)},${n(lipLeft)} Q${n(left + 0.7)},${n(lipLeft)} ${n(left + 0.5)},${n(bottom - 1)} L${n(left)},${n(backLeft + 3)} Q${n(left)},${n(backLeft)} ${n(left + cornerLeft)},${n(backLeft)} Z`;
  const cavity = `M${n(left + cornerLeft)},${n(backLeft + 2)} Q${n(well.x)},${n(back + backBow + 1.4)} ${n(right - cornerRight)},${n(backRight + 2)} Q${n(right - 1.8)},${n(backRight + 2)} ${n(right - 2)},${n(backRight + 4)} L${n(right - 2.4)},${n(bottom - 1.5)} Q${n(right - 2.5)},${n(bottom)} ${n(right - cornerRight)},${n(bottom)} Q${n(well.x)},${n(bottom + 0.2)} ${n(left + cornerLeft)},${n(bottom)} Q${n(left + 2.5)},${n(bottom)} ${n(left + 2.4)},${n(bottom - 1.5)} L${n(left + 2)},${n(backLeft + 4)} Q${n(left + 1.8)},${n(backLeft + 2)} ${n(left + cornerLeft)},${n(backLeft + 2)} Z`;
  const nearEdge = `M${n(left + 1)},${n(bottom - 1)} Q${n(left + 1.5)},${n(lipLeft)} ${n(left + cornerLeft)},${n(lipLeft)} Q${n(well.x)},${n(lip + frontBow)} ${n(right - cornerRight)},${n(lipRight)} Q${n(right - 1.5)},${n(lipRight)} ${n(right - 1)},${n(bottom - 1)}`;
  const frontWall = `M${n(left + 3)},${n(bottom - 0.4)} Q${n(well.x)},${n(bottom - 0.7)} ${n(right - 3)},${n(bottom - 0.2)} Q${n(right - 2)},${n(lipRight)} ${n(right - cornerRight)},${n(lipRight)} Q${n(well.x)},${n(lip + frontBow)} ${n(left + cornerLeft)},${n(lipLeft)} Q${n(left + 2)},${n(lipLeft)} ${n(left + 3)},${n(bottom - 0.4)} Z`;
  const rimId = id(`well-rim-${index}`);
  const rimStops = [0, 0.18, 0.4, 0.64, 0.83, 1].map((offset, stop) =>
    `<stop offset="${offset}" stop-color="${palette.rim}" stop-opacity="${n(0.18 + 0.72 * random(`rim-${stop}:brightness`))}"/>`
  ).join("");
  return `<g class="gel-well" data-gel-well-loaded="${well.loaded !== false}" pointer-events="none" filter="url(#${id("well-soft")})"><defs><linearGradient id="${rimId}" gradientUnits="userSpaceOnUse" x1="${n(left)}" x2="${n(right)}" y1="0" y2="0">${rimStops}</linearGradient></defs><path class="gel-well-wall" d="${outline}" fill="${palette.well}" stroke="${palette.rim}" stroke-width="3.2" stroke-opacity="0.06"/><path class="gel-well-cavity" d="${cavity}" fill="${palette.well}"/><path class="gel-well-front-wall" d="${frontWall}" fill="url(#${rimId})" opacity="${n(0.13 + random("wall-light") * 0.12)}"/><path class="gel-well-rim" d="${outline}" fill="none" stroke="url(#${rimId})" stroke-width="1.15" opacity="${n(0.33 + random("light") * 0.14)}"/><path class="gel-well-near-edge" d="${nearEdge}" fill="none" stroke="url(#${rimId})" stroke-width="1.5" opacity="${n(0.30 + random("front-light") * 0.25)}"/></g>`;
}

function renderBandHaze(band, index, id, seed) {
  const signal = Math.max(0, Math.min(1, band.signal));
  const start = band.y + band.height * 0.3;
  const length = 42 + 28 * fraction(`${seed}:haze:${index}:${band.x}`) + 14 * signal;
  const halfWidth = band.width * 0.42;
  // A very low-amplitude downstream envelope, localized to actual bands.
  // This is photographic haze, not a prediction of degraded DNA quantities.
  // Soft lateral edges and a decaying tail avoid a painted lane rectangle.
  const d = `M${n(band.x - halfWidth)},${n(start)} Q${n(band.x)},${n(start - 2)} ${n(band.x + halfWidth)},${n(start)} L${n(band.x + halfWidth * 1.12)},${n(start + length)} Q${n(band.x)},${n(start + length + 4)} ${n(band.x - halfWidth * 1.12)},${n(start + length)} Z`;
  return `<path class="gel-band-haze" d="${d}" fill="url(#${id("haze-fade")})" opacity="${(0.003 + 0.007 * signal).toFixed(4)}" filter="url(#${id("haze-soft")})" pointer-events="none"/>`;
}

function renderTrackingDye(dye, wells, index, id, seed) {
  // Convolving a finite loading slot with a Gaussian gives a diffuse front
  // that can extend beyond a lane and overlap neighboring fronts. Diffusion
  // widths are illustrative image units; only migration has a sourced table.
  const spread = Math.sqrt(dye.relativeRunTime);
  const filterId = id(`tracking-soft-${index}`);
  const fronts = wells.flatMap((well, lane) => {
    if (well.loaded === false) return [];
    const light = 0.48 + 0.06 * fraction(`${seed}:tracking:${lane}:${index}`);
    return [`<rect x="${n(well.x - well.width / 2)}" y="${n(dye.y - 4 * spread)}" width="${n(well.width)}" height="${n(8 * spread)}" fill="#000" opacity="${n(light)}"/>`];
  }).join("");
  return `<g class="gel-tracking-dye" data-dye="${xml(dye.name)}" data-equivalent-bp="${n(dye.equivalentBp)}" data-dye-y="${n(dye.y)}" pointer-events="none" aria-hidden="true"><defs><filter id="${filterId}" x="-50%" y="-400%" width="200%" height="900%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(14 * spread)} ${n(6 * spread)}"/></filter></defs><g filter="url(#${filterId})">${fronts}</g></g>`;
}

function renderFluorescentFlecks(bounds, wells, bands, palette, id, seed) {
  // A few photographic specks, not DNA fragments or selectable result marks.
  // Keep them off the ruler, wells and bands, and fixed in a completed export.
  const random = key => opticalRandom(`${seed}:flecks:${key}`);
  const count = 3 + Math.min(2, Math.floor(random("count") * 3));
  const firstWellEdge = wells.length ? Math.min(...wells.map(well => well.x - well.width / 2)) : bounds.x;
  const left = Math.max(bounds.x + 10, firstWellEdge);
  const right = bounds.x + bounds.width - 10;
  const top = bounds.y + 38;
  const bottom = bounds.y + bounds.height - 12;
  // Independent shuffled ranges ensure a handful of specks do not all happen
  // to have the same size or brightness. Their positions stay continuous and
  // random, with a modest exclusion distance rather than a row or grid.
  const ranks = name => Array.from({ length: count }, (_, i) => i)
    .sort((a, b) => random(`${name}:${a}`) - random(`${name}:${b}`));
  const sizeRanks = ranks("size-order"), lightRanks = ranks("light-order");
  const lintIndex = random("lint-present") < 0.55 ? Math.floor(random("lint-index") * count) : -1;
  const separation = Math.min(120, Math.min(right - left, bottom - top) * 0.28);
  const marks = [];
  const placed = [];
  for (let index = 0; index < count; index++) {
    for (let attempt = 0; attempt < 48; attempt++) {
      const key = `${index}:${attempt}`;
      const x = left + random(`${key}:position-x`) * (right - left);
      const y = top + random(`${key}:position-y`) * (bottom - top);
      if (bands.some(band => Math.abs(x - band.x) < band.width / 2 + 6 && Math.abs(y - band.y) < band.height * 2 + 8)
        || placed.some(point => Math.hypot(x - point.x, y - point.y) < separation)) continue;
      const size = 0.30 + 0.55 * (sizeRanks[index] + random(`${key}:size`)) / count;
      const elongated = index === lintIndex;
      // Hard bounds keep even the occasional elongated speck minute relative
      // to a 46-unit well; variation must never produce a conspicuous blob.
      const rx = Math.min(0.95, size * (elongated ? 1.35 : 0.85 + 0.4 * random(`${key}:aspect-x`)));
      const ry = Math.min(0.70, size * (elongated ? 0.38 : 0.55 + 0.35 * random(`${key}:aspect-y`)));
      const angle = random(`${key}:angle`) * 180;
      const light = 0.13 + 0.39 * (lightRanks[index] + random(`${key}:brightness`)) / count;
      const blur = 0.10 + 0.16 * random(`${key}:softness`);
      // Smooth asymmetric outlines resemble tiny dust/debris, not repeated
      // circular pixels. Quadratic joins avoid sharp polygon corners at zoom.
      const outline = Array.from({ length: 7 }, (_, vertex) => {
        const theta = vertex * Math.PI * 2 / 7 + (random(`${key}:angle-${vertex}`) - 0.5) * 0.25;
        const radius = 0.72 + 0.56 * random(`${key}:edge-${vertex}`);
        return [Math.cos(theta) * rx * radius, Math.sin(theta) * ry * radius];
      });
      const midpoint = (a, b) => `${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}`;
      const shape = `M${midpoint(outline.at(-1), outline[0])} ` + outline.map((point, vertex) =>
        `Q${n(point[0])} ${n(point[1])} ${midpoint(point, outline[(vertex + 1) % outline.length])}`
      ).join(" ") + " Z";
      const filterId = id(`fleck-soft-${index}`);
      const halo = light > 0.39
        ? `<ellipse rx="${n(Math.min(2.2, rx * 2.7 + 0.4))}" ry="${n(Math.min(1.8, ry * 2.7 + 0.4))}" fill="url(#${id("fleck-halo")})" opacity="${n(light * 0.20)}"/>`
        : "";
      const halfLength = 0.65 + 0.5 * random(`${key}:lint-length`);
      const halfThickness = 0.09 + 0.07 * random(`${key}:lint-width`);
      // A short, uneven sliver with tapered ends, without a built-in curl.
      const lintShape = `M${n(-halfLength)} 0 L${n(-halfLength * 0.45)} ${n(-halfThickness * 0.7)} L${n(halfLength * 0.25)} ${n(-halfThickness)} L${n(halfLength)} ${n(-halfThickness * 0.15)} L${n(halfLength * 0.45)} ${n(halfThickness * 0.8)} L${n(-halfLength * 0.35)} ${n(halfThickness * 0.6)} Z`;
      const body = elongated
        ? `<path d="${lintShape}" fill="${palette.profile[2]}"/>`
        : `<path d="${shape}" fill="${palette.profile[2]}"/>`;
      marks.push(`<g class="gel-fluorescent-fleck" data-fleck-kind="${elongated ? "lint" : "speck"}" transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})"><defs><filter id="${filterId}" filterUnits="userSpaceOnUse" x="-4" y="-4" width="8" height="8" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(blur)}"/></filter></defs>${halo}<g opacity="${n(light)}" filter="url(#${filterId})">${body}</g></g>`);
      placed.push({ x, y });
      break;
    }
  }
  return `<g class="gel-fluorescent-flecks" pointer-events="none" aria-hidden="true">${marks.join("")}</g>`;
}

/** Shared gel composition: independent illumination/wells, additive fluorescence
 * with bright-pass bloom, tracking dye and photographic flecks, then fine grain.
 * The embedded fluorescence image is supersampled; labels and hit targets stay
 * vector and completed exports reuse the same image. No new DNA bands are added.
 */
export function renderGelImage({ prefix, bounds, wells, bands, trackingDyes = [], stain = "green", appearanceSeed = 0 }) {
  const palette = palettes[stain];
  if (!palette) throw new Error("Unsupported gel imaging palette.");
  const { x, y, width, height } = bounds;
  const id = (name) => `${prefix}-${name}`;
  const noiseSeed = name => Math.floor(fraction(`${appearanceSeed}:${name}`) * 65535);
  const coloredImage = stain !== "grayscale";
  const fluorescence = renderFluorescenceImage({ bounds, bands, colors: palette.fluorescence, appearanceSeed, exposure: coloredImage ? 2.0 : 2.2, bloomStrength: palette.bloomStrength, highlightGain: coloredImage ? 0.6 : 0 });
  const parts = [
    `<defs>`,
    `<clipPath id="${id("clip")}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath>`,
    `<radialGradient id="${id("background")}" cx="46%" cy="58%" r="75%"><stop stop-color="${palette.background[0]}"/><stop offset="1" stop-color="${palette.background[1]}"/></radialGradient>`,
    `<filter id="${id("texture")}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="2" seed="${noiseSeed("grain")}"/><feColorMatrix type="matrix" values="${tintMatrix(palette.texture, 0.11)}"/></filter>`,
    `<filter id="${id("cloud")}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.011 0.017" numOctaves="2" seed="${noiseSeed("cloud")}"/><feColorMatrix type="matrix" values="${tintMatrix(palette.cloud, 0.1)}"/></filter>`,
    `<filter id="${id("well-soft")}" x="-10%" y="-50%" width="120%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0.65 0.5"/></filter>`,
    `<radialGradient id="${id("fleck-halo")}"><stop stop-color="${palette.scatter}"/><stop offset="0.4" stop-color="${palette.scatter}" stop-opacity="0.3"/><stop offset="1" stop-color="${palette.scatter}" stop-opacity="0"/></radialGradient>`,
    `<filter id="${id("haze-soft")}" x="-40%" y="-30%" width="180%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="5 6"/></filter>`,
    `<linearGradient id="${id("haze-fade")}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${palette.body}"/><stop offset="0.2" stop-color="${palette.body}" stop-opacity="0.55"/><stop offset="0.55" stop-color="${palette.body}" stop-opacity="0.16"/><stop offset="1" stop-color="${palette.body}" stop-opacity="0"/></linearGradient>`,
    `</defs>`,
    `<g class="gel-image" data-gel-optics="fluorescence-field-v1" data-gel-appearance-seed="${appearanceSeed}" clip-path="url(#${id("clip")})">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id("background")})"/>`,
    `<rect class="gel-background-texture" x="${x}" y="${y}" width="${width}" height="${height}" filter="url(#${id("cloud")})" pointer-events="none"/>`,
    renderSlabIllumination(bounds, palette, stain, id, appearanceSeed)
  ];
  wells.forEach((well, index) => parts.push(renderWell(well, index, y, palette, id, appearanceSeed)));
  bands.forEach((band, index) => parts.push(renderBandHaze(band, index, id, appearanceSeed)));
  // Tracking dye is a background attenuation cue, not a calibrated absorption
  // measurement. Do not darken DNA after the mass-to-display mapping: xylene
  // cyanol otherwise suppresses the ladder's bright 3 kb reference band.
  trackingDyes.forEach((dye, index) => parts.push(renderTrackingDye(dye, wells, index, id, appearanceSeed)));
  parts.push(`<image id="${id("fluorescence-signal")}" class="gel-fluorescence-field" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none" href="${fluorescence.href}" data-fluorescence-width="${fluorescence.width}" data-fluorescence-height="${fluorescence.height}" data-bloom-strength="${fluorescence.bloomStrength}" data-bloom-sigma="${n(fluorescence.bloomSigma)}" pointer-events="none"/>`);
  parts.push(renderFluorescentFlecks(bounds, wells, bands, palette, id, appearanceSeed));
  // Keep the existing grain across empty gel and diffuse light. Its old tinted
  // overlay also darkened the bright cores; attenuate it there as their signal
  // rises above background noise. Alpha selects signal, independent of hue.
  if (coloredImage) {
    parts.push(`<defs><filter id="${id("grain-signal-mask")}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -0.92 1"/></filter><mask id="${id("grain-mask")}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}" style="mask-type:alpha"><use href="#${id("fluorescence-signal")}" filter="url(#${id("grain-signal-mask")})"/></mask></defs>`);
  }
  parts.push(`<rect class="gel-background-texture gel-final-grain" x="${x}" y="${y}" width="${width}" height="${height}" filter="url(#${id("texture")})"${coloredImage ? ` mask="url(#${id("grain-mask")})"` : ""} pointer-events="none"/>`);
  bands.forEach(band => {
    parts.push(`<g class="gel-band-inspection-mark" data-sms3-inspection-mark="gel-band" data-gel-band-y="${n(band.y)}" data-gel-band-signal="${n(band.signal)}"${Number.isFinite(band.massNg) ? ` data-gel-band-mass-ng="${n(band.massNg)}"` : ""}><title>${xml(band.inspectionText)}</title><rect class="gel-band-target" x="${n(band.x - band.width / 2)}" y="${n(band.y - Math.max(4, band.height / 2))}" width="${n(band.width)}" height="${n(Math.max(8, band.height))}" fill="transparent"/></g>`);
  });
  parts.push(`</g>`);
  return parts.join("");
}
