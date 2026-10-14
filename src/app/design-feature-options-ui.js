import { previewDesignFeatures } from "../core/design-feature-input.js";
import { designFeatureTargetLabel } from "../core/design-feature-targets.js";

const previews = new WeakMap();

export function updateDesignFeatureOptions(root, metadata, input) {
  const select = root.querySelector('select[name="targetFeature"]');
  if (!select) return;
  const group = root.querySelector('[data-option-id="featureTargeting"]');
  const current = select.value;
  let preview = previews.get(select);
  if (!preview || preview.input !== input) {
    preview = { input, ...previewDesignFeatures(input, metadata.id) };
    previews.set(select, preview);
    const choices = [{ value: "", label: "All input sequences" }, ...preview.features];
    if (current && !choices.some(choice => choice.value === current)) {
      choices.push({ value: current, label: `Unavailable: ${designFeatureTargetLabel(current)}` });
    }
    select.replaceChildren(...choices.map(choice => {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      return option;
    }));
    select.value = current;
  }
  const unavailable = current && !preview.features.some(feature => feature.value === current);
  group.hidden = !preview.features.length && !preview.message && !current;
  const mode = group.querySelector('[data-option-id="featureTargetMode"]');
  if (mode) mode.hidden = !current;
  let status = group.querySelector('[data-feature-target-status]');
  if (!status) {
    status = document.createElement("p");
    status.className = "option-note";
    status.dataset.featureTargetStatus = "";
    status.setAttribute("role", "status");
    select.closest('[data-option-id="targetFeature"]').after(status);
  }
  status.textContent = unavailable
    ? "The selected feature is unavailable. Select a current feature or choose All input sequences before running."
    : current ? designFeatureTargetLabel(current) : preview.message;
  status.hidden = !status.textContent;
  select.setAttribute("aria-invalid", unavailable ? "true" : "false");
}
