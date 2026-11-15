import { isolateSvgStyles } from "./svg-style-scope.js";
import { renderGelImage } from "./gel-image.js";
import { dnaGelTrackingDyes } from "./dna-gel-tracking-dyes.js";
import { DNA_GEL_MODEL, normalizeDnaGelOptions, dnaGelRunFraction, dnaGelLengthIsCalibrated } from "./dna-gel-model.js";

// One real ladder's complete size/mass table; do not combine products or
// invent amounts for extra sizes. DPLUS-1K guide 20667263w, Rev 03/22, p. 1:
// masses are the manufacturer's approximate ng/band for the illustrated 5 µL
// load. Use the per-band values as published, not a claimed total-load assay
// (the diagram's sum differs from its nominal bulk-concentration statement).
export const DNA_GEL_LADDER = {
  id: "sigma-dplus-1k",
  name: "Sigma DirectLoad Plus 1 kb DNA Ladder (DPLUS-1K)",
  source: "https://www.sigmaaldrich.cn/deepweb/assets/sigmaaldrich/product/documents/378/264/20667263w-rev0322-mk.pdf",
  loadMicrolitres: 5,
  bands: [
    [10000, 30], [8000, 30], [6000, 30], [5000, 30], [4000, 30],
    [3000, 100], [2000, 30], [1500, 50], [1000, 80], [750, 50],
    [500, 30], [250, 40], [100, 40]
  ].map(([size, massNg]) => ({ size, massNg }))
};
export const COMMON_DNA_LADDER_BP = DNA_GEL_LADDER.bands.map(band => band.size);
// Sequence input supplies no concentration. Use a disclosed equal total load,
// not an independent brightest-band normalization for each sample lane.
export const DNA_GEL_SAMPLE_LOAD_NG = 100;
const COMMON_DNA_LADDER_MASS_NG = new Map(DNA_GEL_LADDER.bands.map(band => [band.size, band.massNg]));

function estimateTextWidth(text, characterWidth = 7.5) {
  return String(text ?? "").length * characterWidth;
}

function truncateTextToWidth(text, maxWidth, characterWidth = 7) {
  const source = String(text ?? "");
  const maxCharacters = Math.max(4, Math.floor(maxWidth / characterWidth));
  if (source.length <= maxCharacters) {
    return source;
  }
  return `${source.slice(0, maxCharacters - 3)}...`;
}

function makeStableFraction(seed) {
  let hash = 2166136261;
  for (const character of String(seed ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function deterministicRange(seed, min, max) {
  return min + makeStableFraction(seed) * (max - min);
}

function gelPaintPrefix(title, width, height, stain) {
  const source = String(title ?? "gel").trim() || "gel";
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "gel";
  let hash = 2166136261;
  for (const character of `${source}:${width}:${height}:${stain}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `sms3-gel-${slug}-${(hash >>> 0).toString(36)}`;
}

export function makeDnaGelSvg(...args) {
  // PCR predicts product identities, not their yields. For the explicit
  // equal-molar illustration, use one molecule-count scale across all lanes
  // (including additional panels), with 100 ng in the most heavily loaded lane.
  // Repeated products contribute independently before co-migration is merged.
  const [records, options = {}] = args;
  if (options.gelLoadingMode === "equal-molar-products") {
    const laneLengths = records.map(record => (record.fragments ?? []).reduce(
      (sum, fragment) => sum + Math.max(0, Number(fragment.length) || 0), 0));
    const referenceLength = options.poolLinearMolecules
      ? laneLengths.reduce((sum, length) => sum + length, 0)
      : Math.max(0, ...laneLengths);
    args[1] = { ...options, gelMassPerBaseNg: referenceLength > 0 ? DNA_GEL_SAMPLE_LOAD_NG / referenceLength : 0 };
  }
  return isolateSvgStyles(makeDnaGelSvgUnscoped(...args));
}

function makeGelPanels(records, options, note) {
  const count = Math.ceil(records.length / 19);
  const title = options.title || "Simulated restriction digest gel";
  const panels = Array.from({ length: count }, (_, index) => makeDnaGelSvgUnscoped(
    records.slice(index * 19, (index + 1) * 19),
    { ...options, poolLinearMolecules: false, gelCombCapacity: 20, note,
      title: `${title} · Gel ${index + 1} of ${count}` }
  ));
  const [width, panelHeight] = panels[0].match(/viewBox="0 0 (\d+) (\d+)"/u).slice(1).map(Number);
  const height = count * panelHeight + (count - 1) * 24;
  const root = panels[0].match(/^<svg\b[^>]*>/u)[0]
    .replace(/viewBox="[^"]+"/u, `viewBox="0 0 ${width} ${height}"`)
    .replace(/aria-label="[^"]+"/u, `aria-label="${escapeXml(title)}"`)
    .replace(/>$/u, ` data-gel-panel-count="${count}">`);
  return root + `<rect width="${width}" height="${height}" fill="white"/>` + panels.map((svg, index) =>
    `<g class="gel-panel" transform="translate(0 ${index * (panelHeight + 24)})">${svg.replace(/^<svg\b[^>]*>/u, "").replace(/<\/svg>$/u, "")}</g>`
  ).join("") + "</svg>";
}

function makeDnaGelSvgUnscoped(records, options = {}) {
  const settings = normalizeDnaGelOptions(options);
  const appearanceSeed = Number.isInteger(options.gelAppearanceSeed) ? options.gelAppearanceSeed >>> 0 : 0;
  const concentrationLabel = Number.isInteger(settings.gelAgarosePercent) ? settings.gelAgarosePercent.toFixed(1) : String(settings.gelAgarosePercent);
  if (options.poolLinearMolecules && records.length) {
    if (options.topology === "circular") throw new Error("Pooling gel lanes requires linear molecules.");
    // Pool already-digested molecules, never concatenate their DNA sequences.
    records = [{ title: "Pooled sample", length: records.reduce((sum, r) => sum + r.length, 0),
      fragments: records.flatMap((record) => (record.fragments?.length ? record.fragments : options.emptyFragmentsAsNoBand ? [] : [{ length: record.length }])
        .map((fragment) => ({ ...fragment, sourceRecordTitle: record.title }))) }, ...records];
  }
  const title = options.title || "Simulated restriction digest gel";
  const subtitle = options.subtitle || "Uncut plasmids are modeled as mixed conformations; restriction digests are modeled primarily as linear fragments.";
  const note = options.note || (options.poolLinearMolecules
    ? "Pooled lane assumes equal molecule counts. Intensity is illustrative; faint bands boosted for visibility."
    : "Illustrative band width and intensity; faint bands boosted for visibility. Overlapping bands are merged.");
  // Use a small set of actual comb capacities, including the ladder well.
  // Bio-Rad Mini/Sub-Cell GT kits supply 8-, 15- and 20-well combs:
  // https://www.bio-rad.com/webroot/web/pdf/lsr/literature/Bulletin_2660C.pdf
  // More samples occupy additional 20-well gels, each with its own ladder.
  if (records.length > 19) return makeGelPanels(records, options, note);
  const laneCount = records.length + 1;
  const combCapacity = options.gelCombCapacity === 20 ? 20 : [8, 15, 20].find(n => n >= laneCount);
  const ladderLabelGutter = 74;
  const margin = { top: 116, right: 30, bottom: 74, left: 58 };
  const width = 720 + (combCapacity - 8) * 70;
  const laneAreaLeft = margin.left + ladderLabelGutter;
  const laneWidth = (width - laneAreaLeft - margin.right) / combCapacity;
  const wellWidth = 46;
  // One lateral footprint for each loading slot. The optical renderer owns
  // the shoulder falloff inside this width; never widen the nominal band as
  // a second compensation for blur.
  // Fragment size/conformation affects migration and vertical breadth, not an
  // arbitrary lateral contraction of the ladder or supercoiled bands.
  const laneBandWidth = wellWidth;
  const gelWidth = width;
  const gelHeight = 430;
  const height = margin.top + gelHeight + margin.bottom;
  const paintPrefix = `${gelPaintPrefix(title, width, height, settings.gelStain)}-${appearanceSeed.toString(36)}`;
  const laneCenter = (index) => laneAreaLeft + laneWidth * index + laneWidth / 2;
  // Crop the photograph just outside the ladder slot. Keep the optical
  // canvas unchanged so this annotation/layout edit preserves the bands.
  const gelPhotoLeft = laneCenter(0) - wellWidth / 2 - 10;
  const sizeLabelX = gelPhotoLeft - 12;
  const gelPhotoWidth = gelWidth - margin.right - gelPhotoLeft;
  // Balance the photograph itself on the page. Its labels travel with it;
  // the resulting left margin still accommodates the full size column.
  const figureShiftX = (width - gelPhotoWidth) / 2 - gelPhotoLeft;
  const bandComponentsForRecord = (record) => {
    const length = Math.max(1, record.length);
    const isCircular = options.topology === "circular";
    const isUncutCircular = isCircular && (record.hits ?? []).length === 0;
    const component = (name, abundanceRange, apparentRange, trueMassMultiplier, type, scale = 1) => ({
      apparentSize: length * deterministicRange(`${record.title}:${name}:apparent`, apparentRange[0], apparentRange[1]),
      trueMass: length * trueMassMultiplier,
      trueSize: length,
      abundance: deterministicRange(`${record.title}:${name}:abundance`, abundanceRange[0], abundanceRange[1]) * scale,
      type,
      name,
      sourceRecordTitle: record.title,
      qualitativeConformation: true
    });
    if (isUncutCircular) {
      return [
        component("supercoiled", [0.75, 0.90], [0.55, 0.75], 1, "supercoiled"),
        component("open-circular", [0.08, 0.20], [1.6, 2.8], 1, "open"),
        component("linear", [0.01, 0.08], [0.96, 1.04], 1, "linear"),
        component("supercoiled-dimer", [0.01, 0.05], [1.1, 1.5], 2, "supercoiled"),
        component("open-circular-dimer", [0, 0.03], [3, 5], 2, "open")
      ];
    }
    const fragments = record.fragments?.length
      ? record.fragments
      : options.emptyFragmentsAsNoBand
        ? []
        : [{ length, topology: options.topology ?? "linear" }];
    const components = fragments
      .filter((fragment) => fragment.length > 0)
      .map((fragment) => ({
        apparentSize: fragment.length,
        trueMass: fragment.length,
        trueSize: fragment.length,
        abundance: 1,
        type: "linear",
        name: fragment.product !== undefined
          ? `PCR product ${fragment.product}`
          : fragment.fragment !== undefined
            ? `fragment ${fragment.fragment}`
            : fragment.label || "linear fragment",
        sourceRecordTitle: fragment.sourceRecordTitle || record.title,
        start: fragment.start,
        end: fragment.end,
        product: fragment.product,
        forwardPrimer: fragment.forward_primer,
        reversePrimer: fragment.reverse_primer
      }));
    // A complete digest contains only its cut fragments. Adding arbitrary
    // residual plasmids here incorrectly dilutes their mass fractions and
    // invents partial digestion. Mixed conformations belong only to uncut DNA.
    return components;
  };
  const allComponents = records.flatMap((record) => bandComponentsForRecord(record));
  // Origin is the bottom of the loading well. Keep physical relative distances;
  // never fit the ladder to both ends or change the run for a sample outlier.
  const originY = margin.top + 17;
  const trackHeight = gelHeight - 17;
  const yForSize = (size) => originY + trackHeight * dnaGelRunFraction(size, settings.gelAgarosePercent);
  const extrapolated = allComponents.some(c => !c.qualitativeConformation && !dnaGelLengthIsCalibrated(c.apparentSize));
  const conformations = allComponents.some(c => c.qualitativeConformation);
  const runOff = allComponents.some(c => dnaGelRunFraction(c.apparentSize, settings.gelAgarosePercent) > 1);
  const mergeLaneBands = (components) => {
    const sorted = components
      .map((component) => ({
        ...component,
        y: yForSize(component.apparentSize),
        mass: component.trueMass * component.abundance
      }))
      .sort((left, right) => left.y - right.y);
    const merged = [];
    for (const component of sorted) {
      const previous = merged.at(-1);
      if (previous && Math.abs(previous.y - component.y) <= 5) {
        const totalMass = previous.mass + component.mass;
        previous.y = (previous.y * previous.mass + component.y * component.mass) / totalMass;
        previous.mass = totalMass;
        previous.types.add(component.type);
        previous.components.push(component);
      } else {
        merged.push({ y: component.y, mass: component.mass, types: new Set([component.type]), components: [component] });
      }
    }
    const maxMass = Math.max(1, ...merged.map((band) => band.mass));
    const totalMass = merged.reduce((sum, band) => sum + band.mass, 0);
    // m_band = M_lane * sum(n_i * L_i in band) / sum(n_j * L_j in lane).
    // Each fragment from a complete digest occurs once per parent molecule.
    // Equal-length fragments remain separate components, so their masses add.
    // Include off-gel fragments in the denominator: migration cannot create DNA.
    // https://www.neb.com/en/products/n3012-dna-hindiii-digest
    const massPerBaseNg = options.gelLoadingMode === "equal-molar-products"
      ? options.gelMassPerBaseNg
      : totalMass > 0 ? DNA_GEL_SAMPLE_LOAD_NG / totalMass : 0;
    return merged.map((band) => ({
      ...band,
      relativeMass: band.mass / maxMass,
      massNg: massPerBaseNg * band.mass
    }));
  };
  const ladderMassForSize = (size) => COMMON_DNA_LADDER_MASS_NG.get(size);
  // Visual diffusion proxy: fast, small fragments have a broader vertical
  // distribution. This is an appearance model, not an agarose/run-time fit.
  const diffusionHeight = (size) => 2.8 / (1 + Math.max(1, size) / 550);
  const imageBands = [];
  const componentInspectionText = (component) => {
    const source = component.sourceRecordTitle || "sample";
    const trueSize = Math.max(1, Math.round(Number(component.trueSize) || Number(component.trueMass) || 1));
    const apparentSize = Math.max(1, Math.round(Number(component.apparentSize) || trueSize));
    const coordinates = Number.isFinite(Number(component.start)) && Number.isFinite(Number(component.end))
      ? `; coordinates ${Number(component.start).toLocaleString()}–${Number(component.end).toLocaleString()}`
      : "";
    const primers = component.forwardPrimer || component.reversePrimer
      ? `; primers ${component.forwardPrimer || "unspecified"} / ${component.reversePrimer || "unspecified"}`
      : "";
    if (component.type === "linear" && !component.qualitativeConformation) {
      return `${source}, ${component.name || "linear fragment"}: ${trueSize.toLocaleString()} bp${coordinates}${primers}${dnaGelLengthIsCalibrated(component.apparentSize) ? "" : "; migration extrapolated outside 100–10,000 bp"}${dnaGelRunFraction(component.apparentSize, settings.gelAgarosePercent) > 1 ? "; predicted beyond gel end" : ""}`;
    }
    return `${source}, ${component.name || component.type}: true molecule length ${trueSize.toLocaleString()} bp; apparent migration approximately ${apparentSize.toLocaleString()} bp; qualitative conformation model`;
  };
  const bandInspectionText = (record, band) => {
    const components = band.components ?? [];
    if (components.length <= 1) return componentInspectionText(components[0] ?? { sourceRecordTitle: record.title });
    const shown = components.slice(0, 8).map(componentInspectionText);
    const omitted = components.length - shown.length;
    return `${record.title}: merged band with ${components.length} co-migrating components — ${shown.join(" | ")}${omitted > 0 ? ` | ${omitted} more` : ""}`;
  };
  const placeLadderLabels = (sizes) => {
    const labelHeight = 11;
    const gap = 2;
    const x = sizeLabelX;
    let previousY = -Infinity;
    return sizes.map((size) => {
      const bandY = yForSize(size);
      const y = Math.max(bandY + 3, previousY + labelHeight + gap);
      previousY = y;
      const textWidth = estimateTextWidth(size.toLocaleString(), 5.8);
      return {
        size,
        bandY,
        x,
        y,
        box: { left: x - textWidth, right: x, top: y - labelHeight + gap, bottom: y + gap }
      };
    });
  };
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-sms3-gel-paint-prefix="${paintPrefix}" data-sms3-gel-renderer="photographic-v1" data-sms3-inspection-highlight="none" data-gel-model="${DNA_GEL_MODEL.id}" data-gel-agarose-percent="${settings.gelAgarosePercent}" data-gel-stain="${settings.gelStain}" data-gel-comb-wells="${combCapacity}" data-gel-loaded-lanes="${laneCount}">`,
    `<style>
      .title{font:600 18px Arial,Helvetica,sans-serif;fill:#18202a}
      .subtitle{font:12px Arial,Helvetica,sans-serif;fill:#53616d}
      .lane-label{font:600 11px Arial,Helvetica,sans-serif;fill:#24313d;text-anchor:middle}
      .size-label{font:11px Arial,Helvetica,sans-serif;fill:#53616d;text-anchor:end}
      .gel-note{font:11px Arial,Helvetica,sans-serif;fill:#53616d}
    </style>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="24" y="34">${escapeXml(title)}</text>`,
    `<text class="subtitle" x="24" y="54">${escapeXml(subtitle)}</text>`,
    `<text class="subtitle gel-conditions" x="24" y="74">${concentrationLabel}% agarose · ${escapeXml({ green: "Green fluorescence", red: "Red fluorescence", grayscale: "Grayscale imager" }[settings.gelStain])} · Run endpoint: 100 bp at 90%</text>`,
    `<g class="gel-figure-body" transform="translate(${figureShiftX} 0)">`,
    "<!-- gel image -->"
  ];

  parts.push(`<text class="lane-label" x="${laneCenter(0)}" y="${margin.top - 14}" data-gel-ladder="${DNA_GEL_LADDER.id}" data-gel-ladder-source="${escapeXml(DNA_GEL_LADDER.source)}"><title>${escapeXml(DNA_GEL_LADDER.name)}</title>1 kb ladder</text>`);
  parts.push(`<text class="size-label gel-size-unit" x="${sizeLabelX.toFixed(1)}" y="${margin.top - 14}">bp</text>`);
  const ladderLabels = placeLadderLabels(COMMON_DNA_LADDER_BP);
  const maxLadderMass = Math.max(...COMMON_DNA_LADDER_BP.map((size) => ladderMassForSize(size)));
  COMMON_DNA_LADDER_BP.forEach((size) => {
    const y = yForSize(size);
    // Drive ladder fluorescence from its documented relative DNA mass.
    // The former power transform compressed the reference-band contrast.
    // Optical blur, display exposure and band area still make the rendered
    // image illustrative rather than a calibrated densitometry measurement.
    const signal = ladderMassForSize(size) / maxLadderMass;
    // Keep the established visual thickness; mass controls contrast without
    // turning ordinary ladder bands back into hairlines.
    const bandHeight = 3.8 + Math.pow(signal, 0.55) * 3.1 + diffusionHeight(size);
    imageBands.push({
      x: laneCenter(0),
      y,
      width: laneBandWidth,
      height: bandHeight,
      migrationFraction: dnaGelRunFraction(size, settings.gelAgarosePercent),
      signal,
      massNg: ladderMassForSize(size),
      inspectionText: `DNA ladder: ${size.toLocaleString()} bp; ${DNA_GEL_LADDER.name}; approximate mass ${ladderMassForSize(size).toLocaleString()} ng at ${DNA_GEL_LADDER.loadMicrolitres} µL load; ${concentrationLabel}% agarose; published linear-DNA mobility model`
    });
  });
  for (const label of ladderLabels) {
    if (Math.abs(label.y - 3 - label.bandY) > 0.5) {
      parts.push(`<path class="gel-label-leader" d="M${label.x + 3},${label.y - 3} L${gelPhotoLeft + 1},${label.bandY} H${laneCenter(0) - wellWidth / 2 - 4}" stroke="#87918f" stroke-width="0.6" fill="none"/>`);
    }
    parts.push(`<text class="size-label" x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" data-label-left="${label.box.left.toFixed(1)}" data-label-right="${label.box.right.toFixed(1)}">${label.size.toLocaleString()}</text>`);
  }

  records.forEach((record, recordIndex) => {
    const laneIndex = recordIndex + 1;
    const center = laneCenter(laneIndex);
    const label = truncateTextToWidth(record.title, laneWidth - 8, 6.2);
    parts.push(`<text class="lane-label" x="${center.toFixed(1)}" y="${margin.top - 14}" data-full-title="${escapeXml(record.title)}">${escapeXml(label)}</text>`);
    const bands = mergeLaneBands(bandComponentsForRecord(record));
    for (const band of bands) {
      const isOpen = band.types.has("open");
      const isSupercoiled = band.types.has("supercoiled") && !isOpen;
      const massSignal = Math.pow(band.relativeMass, 0.55);
      const baseHeight = isOpen ? 8.5 : isSupercoiled ? 3.6 : 5.2;
      const apparentSize = band.mass > 0
        ? band.components.reduce((sum, c) => sum + c.apparentSize * c.mass, 0) / band.mass
        : band.components[0].apparentSize;
      const bandHeight = baseHeight * (0.82 + massSignal * 0.52) + diffusionHeight(apparentSize);
      imageBands.push({
        x: center,
        y: band.y,
        width: laneBandWidth,
        height: bandHeight,
        migrationFraction: (band.y - originY) / trackHeight,
        signal: band.massNg / maxLadderMass,
        profileSignal: band.relativeMass,
        massNg: band.massNg,
        inspectionText: `${bandInspectionText(record, band)}; assumed band mass ${band.massNg.toFixed(1)} ng; ${options.gelLoadingMode === "equal-molar-products" ? `equal molecule counts per PCR product, ${DNA_GEL_SAMPLE_LOAD_NG} ng in the most heavily loaded lane` : `${DNA_GEL_SAMPLE_LOAD_NG} ng total DNA per sample lane`}`
      });
    }
  });

  parts.push("</g>");
  const loadingNote = options.gelLoadingMode === "equal-molar-products"
    ? `Equal-molar PCR products; fullest lane ${DNA_GEL_SAMPLE_LOAD_NG} ng (assumed).`
    : `Sample load: ${DNA_GEL_SAMPLE_LOAD_NG} ng/lane (assumed).`;
  parts.push(`<text class="gel-note" x="24" y="${height - 48}">Model: 1× TBE, 22 °C, 2.78 V/cm; linear DNA 100–10,000 bp. ${loadingNote}</text>`);
  parts.push(`<text class="gel-note" x="24" y="${height - 32}">${escapeXml(note)}</text>`);
  if (extrapolated || conformations || runOff) parts.push(`<text class="gel-note gel-model-limit" x="24" y="${height - 16}">${[extrapolated ? "Outside 100–10,000 bp: extrapolated migration." : "", conformations ? "Plasmid forms are qualitative." : "", runOff ? "Some DNA has passed the gel end." : ""].filter(Boolean).join(" ")}</text>`);
  parts.push("</svg>");
  const gelImage = renderGelImage({
    prefix: paintPrefix,
    stain: settings.gelStain,
    appearanceSeed,
    bounds: { x: margin.left, y: margin.top, width: gelWidth - margin.left - margin.right, height: gelHeight },
    wells: Array.from({ length: combCapacity }, (_, index) => ({
      x: laneCenter(index), width: wellWidth, loaded: index < laneCount
    })),
    trackingDyes: dnaGelTrackingDyes(settings.gelAgarosePercent).map(dye => ({
      ...dye, y: originY + trackHeight * dye.runFraction
    })),
    bands: imageBands
  });
  const cropId = `${paintPrefix}-photo-crop`;
  const croppedGel = `<defs><clipPath id="${cropId}"><rect x="${gelPhotoLeft}" y="${margin.top}" width="${gelPhotoWidth}" height="${gelHeight}"/></clipPath></defs><g class="gel-photo-crop" clip-path="url(#${cropId})">${gelImage}</g>`;
  return parts.join("").replace("<!-- gel image -->", croppedGel);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
