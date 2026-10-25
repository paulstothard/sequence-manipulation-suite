// Stable keys are stored in editable image documents. Keep the legacy system
// families so existing documents retain their typography.
export const IMAGE_FONTS = Object.freeze({
  jetbrains: { label: 'JetBrains Mono', family: '"SMS3 JetBrains Mono", monospace', face: 'SMS3 JetBrains Mono', monospace: true, folder: 'jetbrainsmono', files: [['JetBrainsMono.woff2', '100 800']] },
  sourcecode: { label: 'Source Code Pro', family: '"SMS3 Source Code Pro", monospace', face: 'SMS3 Source Code Pro', monospace: true, folder: 'sourcecodepro', files: [['SourceCodePro.woff2', '200 900']] },
  plexmono: { label: 'IBM Plex Mono', family: '"SMS3 IBM Plex Mono", monospace', face: 'SMS3 IBM Plex Mono', monospace: true, folder: 'ibmplexmono', files: [['IBMPlexMono-Regular.woff2', '400'], ['IBMPlexMono-Bold.woff2', '700']] },
  inconsolata: { label: 'Inconsolata', family: '"SMS3 Inconsolata", monospace', face: 'SMS3 Inconsolata', monospace: true, folder: 'inconsolata', files: [['Inconsolata.woff2', '200 900']], variations: '"wdth" 100' },
  inter: { label: 'Inter', family: '"SMS3 Inter", sans-serif', face: 'SMS3 Inter', folder: 'inter', files: [['Inter.woff2', '100 900']], variations: '"opsz" 14' },
  sourceserif: { label: 'Source Serif 4', family: '"SMS3 Source Serif 4", serif', face: 'SMS3 Source Serif 4', folder: 'sourceserif4', files: [['SourceSerif4.woff2', '200 900']], variations: '"opsz" 20' },
  mono: { label: 'Courier New', family: '"Courier New", Courier, monospace', monospace: true },
  sans: { label: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  serif: { label: 'Georgia', family: 'Georgia, "Times New Roman", serif' }
});

export function usedImageFonts(layout) {
  return [...new Set([
    ...layout.items.map(item => item.font ?? layout.style.font),
    ...layout.annotations.filter(a => a.type === 'label').map(a => a.font ?? layout.style.font)
  ])];
}
