export function createViewerGeneModelKey(record) {
  if (!record.geneFeatureLegend?.length && !record.tracks.some(track => track.items.some(item => item.geneModel))) return null;
  const key = document.createElement('span');
  key.className = 'dna-viewer-gene-model-key';
  key.title = 'UTRs are thin; CDS blocks are thick. Lines join introns.';
  for (const entry of record.geneFeatureLegend ?? []) {
    const label = document.createElement('span'), swatch = document.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.backgroundColor = entry.color;
    swatch.style.height = `${entry.height}px`;
    label.append(swatch, document.createTextNode(entry.label)); key.append(label);
  }
  if (!key.childNodes.length) key.textContent = 'UTR: thin · CDS: thick · intron: line';
  return key;
}
