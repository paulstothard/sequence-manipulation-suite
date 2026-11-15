import { DNA_GEL_DEFAULTS, DNA_GEL_STAINS } from "../core/dna-gel-model.js";

export function makeDnaGelOptions() {
  const visibleWhen = { option: "outputFormat", value: "svg-gel" };
  // Workflow options flatten groups, so each child also owns its visibility.
  return [{ type: "group", label: "Gel", visibleWhen, options: [
    { id: "gelAgarosePercent", type: "number", label: "Agarose (%)", visibleWhen,
      defaultValue: DNA_GEL_DEFAULTS.gelAgarosePercent,
      min: 0.5, max: 1.5, step: 0.1,
      help: "Changes size separation using a published mobility model. The run ends with the 100 bp ladder band near the bottom. Range: 0.5–1.5%; fixed 1× TBE, 22 °C and 2.78 V/cm." },
    { id: "gelStain", type: "select", label: "Stain / imaging", visibleWhen,
      defaultValue: DNA_GEL_DEFAULTS.gelStain,
      choices: Object.entries(DNA_GEL_STAINS).map(([value, label]) => ({ value, label })),
      help: "Green: GelGreen / SYBR Safe. Red: GelRed / ethidium bromide. Grayscale: monochrome imager. Changes the displayed appearance; fragment sizes and migration are unchanged. Photographed color depends on illumination and filters." }
  ] }];
}
