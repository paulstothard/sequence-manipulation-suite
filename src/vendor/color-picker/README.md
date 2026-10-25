# Color picker

The browser bundle contains the standard `hex-alpha-color-picker` from
[vanilla-colorful](https://github.com/web-padawan/vanilla-colorful), version 0.7.2
(MIT). Rebuild with `node scripts/vendor/build-color-picker.mjs`; the exact npm
dependency and integrity hash are retained in `package-lock.json`.

SMS3 provides its preset swatches and popover shell. The dependency supplies
pointer and keyboard interaction for hue, saturation and opacity. SMS3 labels
the alpha slider “Opacity” and corrects its accessible maximum to 100, matching
the dependency's reported percentage. Presets retain the current opacity. Color
changes apply immediately; no RGB fields or Apply action are shown.

SMS3 preserves the exact RGB bytes during alpha-only gestures, avoiding hue
rounding in the library's HSV conversion. Image sampling and the bounded recent
color list belong to the shared application wrapper.
