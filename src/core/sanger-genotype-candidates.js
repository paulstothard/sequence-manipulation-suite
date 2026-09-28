// Candidate labels are local to one input trace. They never establish phase
// between replicate traces or across separately reconstructed shifted regions.
export const SANGER_CANDIDATE_ALIGNMENT_CELL_LIMIT = 20000;
export const sangerCandidateColumnsOption = {
  id: "includeCandidateHaplotypes", type: "checkbox", label: "Include candidate haplotype columns", defaultValue: false,
  help: "Adds each candidate haplotype's allele, its source trace and phase status to genotype tables. Candidate numbering applies within one trace. IUPAC codes retain unphased bases. Multiple supporting traces are listed separately in Candidate FASTA and Candidate alignment. A clean trace has one distinguishable sequence.",
};
export const sangerHaplotypeColumns = [
  ["candidateTrace", "Candidate trace"],
  ["haplotype1Allele", "Candidate haplotype 1 allele"],
  ["haplotype2Allele", "Candidate haplotype 2 allele"],
  ["phaseStatus", "Phase status"],
  ["phaseBlock", "Phase block"],
].map(([id, label]) => ({ id, label, type: "string" }));

export function hasSangerGenotypeCandidates(read) {
  return Boolean(read.resolution?.components.length &&
    (read.ploidy === 2 || read.resolution.diagnostics.distinguishableSequences === 1));
}

export function sangerCandidatePhaseBlocks(read, traceIndex) {
  return (read.resolution?.phaseBlocks ?? []).map((block, index) => ({
    id: `trace${traceIndex + 1}:block${index + 1}`,
    start: block.startReadPosition + read.trim.start - 1,
    end: block.endReadPosition + read.trim.start - 1,
  }));
}

export function sangerCandidateSiteDetails(site, call, supporting, readIndices) {
  const blank = (phaseStatus) => ({ candidateTrace: ".", haplotype1Allele: ".",
    haplotype2Allele: ".", phaseStatus, phaseBlock: "." });
  if (call.status !== "called") return blank("Unresolved");
  const eligible = supporting.filter(({ read }) => hasSangerGenotypeCandidates(read));
  if (eligible.length > 1) return blank("Multiple supporting traces; inspect candidates separately");
  if (eligible.length !== 1) return blank("Unresolved");
  const { read } = eligible[0];
  const traceIndex = readIndices.get(read);
  const indel = site.ref.length > 1 || site.alternates.some(alt => alt.length > 1);
  const alleles = read.projections.map(projection => indel
    ? (projection.events.find(event => event.position === site.position && event.ref === site.ref)?.alt ?? site.ref)
    : projection.bases.get(site.position)?.base);
  if (alleles.some(allele => !allele)) return blank("Outside candidate coverage");
  const ambiguous = alleles.some(allele => /[^ACGT]/.test(allele));
  const expected = alleles.length === 1 ? Array(read.ploidy).fill(alleles[0]) : alleles;
  if (!ambiguous && expected.slice().sort().join("/") !== call.genotype.slice().sort().join("/"))
    return blank("Candidate alleles disagree with genotype");
  const sources = read.projections.flatMap(projection =>
    (indel ? [site.position, site.end + 1] : [site.position])
      .map(position => projection.bases.get(position)?.source?.readPosition)
      .filter(Number.isFinite).map(position => position + read.trim.start - 1));
  const blocks = sangerCandidatePhaseBlocks(read, traceIndex).filter(block =>
    sources.some(position => position >= block.start && position <= block.end));
  return {
    candidateTrace: `Trace ${traceIndex + 1}: ${read.name}`,
    haplotype1Allele: alleles[0],
    haplotype2Allele: alleles[1] ?? ".",
    phaseStatus: alleles.length === 1 ? "One distinguishable sequence" : ambiguous ? "Unphased" :
      "Reference-guided; global phase unconfirmed",
    phaseBlock: ambiguous || !blocks.length ? "." : blocks.map(block => block.id).join("; "),
  };
}

// Keep every original trace index, including withheld traces, so table and
// sequence identifiers agree. The scientific result remains untouched.
export function sangerGenotypeCandidateView(result) {
  return { ...result, reads: result.reads.map((read, index) => ({
    ...read,
    resolution: hasSangerGenotypeCandidates(read) ? read.resolution : null,
    candidatePhaseBlocks: sangerCandidatePhaseBlocks(read, index),
  })) };
}

export function sangerGenotypeCandidateSummary(read, index) {
  if (!read.resolution?.components.length) return `Trace ${index + 1}: ${read.sample}; candidate haplotypes unresolved.`;
  if (!hasSangerGenotypeCandidates(read)) return `Trace ${index + 1}: ${read.sample}; candidate haplotypes withheld for the supplied ploidy.`;
  const blocks = sangerCandidatePhaseBlocks(read, index);
  return `Trace ${index + 1}: ${read.sample}; ${read.resolution.components.length} candidate sequence(s); ${read.resolution.components[0].phase}.` +
    (blocks.length ? ` Phase blocks (original read bases): ${blocks.map(block => `${block.id}=${block.start}-${block.end}`).join(', ')}.` : '');
}
