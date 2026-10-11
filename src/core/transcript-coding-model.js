// Coordinates remain 1-based inclusive. Only complete, compatible CDS
// annotations define UTR boundaries; never infer them from sequence translation.
export function transcriptUtrParts(transcript, cds) {
  if (!['+', '-'].includes(transcript.strand) || transcript.strand !== cds.strand || cds.sequenceLocation?.partial) return null;
  const exons = transcript.parts?.length ? transcript.parts : [transcript];
  const coding = [...(cds.parts?.length ? cds.parts : [cds])].sort((a, b) => a.start - b.start);
  if (!coding.length || coding.some(part => !exons.some(exon => exon.start <= part.start && exon.end >= part.end))) return null;
  const codingStart = coding[0].start, codingEnd = Math.max(...coding.map(part => part.end));
  const utrs = [];
  for (const exon of exons) {
    let cursor = exon.start;
    const gaps = [];
    for (const part of coding.filter(part => part.end >= exon.start && part.start <= exon.end)) {
      if (part.start > cursor) gaps.push({ start: cursor, end: part.start - 1 });
      cursor = Math.max(cursor, part.end + 1);
    }
    if (cursor <= exon.end) gaps.push({ start: cursor, end: exon.end });
    for (const gap of gaps) {
      // An unexplained internal exonic gap is not a UTR.
      if (gap.start >= codingStart && gap.end <= codingEnd) return null;
      const before = gap.end < codingStart;
      utrs.push({ ...gap, type: before === (transcript.strand === '+') ? '5′ UTR' : '3′ UTR' });
    }
  }
  return utrs.sort((a, b) => a.start - b.start);
}
