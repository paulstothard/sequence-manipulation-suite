// Paired annotation formats end at the directive or the first FASTA header.
// GFF3 permits the header itself to imply ##FASTA. Keep plain FASTA distinct.
// https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md
export function splitPairedAnnotationAndFasta(input) {
  const text = String(input ?? '').replace(/\r\n?/g, '\n');
  const boundary = /^(##FASTA[ \t]*|---[ \t]*FASTA[ \t]*---[ \t]*|>[^\n]*)$/im.exec(text);
  if (!boundary) return { annotationPart: text, fastaPart: '', hasMarker: false, paired: false };
  const hasMarker = !boundary[0].startsWith('>');
  const annotationPart = text.slice(0, boundary.index);
  return {
    annotationPart,
    fastaPart: text.slice(boundary.index + (hasMarker ? boundary[0].length : 0)),
    hasMarker,
    paired: hasMarker || Boolean(annotationPart.trim())
  };
}

export function hasPairedAnnotation(input) {
  return splitPairedAnnotationAndFasta(input).paired;
}
