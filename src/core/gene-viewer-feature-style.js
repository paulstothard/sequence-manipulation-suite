export const GENE_FEATURE_STYLES = {
  transcript: { label: 'Transcript / UTR', color: '#7c3aed', height: 5 },
  protein: { label: 'Protein / CDS', color: '#d97706', height: 12 }
};

const proteinTypes = new Set(['CDS', 'mat_peptide', 'sig_peptide', 'transit_peptide', 'propeptide', 'protein', 'Protein']);
const transcriptTypes = new Set(['transcript', 'exon', 'intron', "5'UTR", "3'UTR"]);

export function geneFeatureClass(type) {
  if (/RNA$/.test(type) || transcriptTypes.has(type)) return 'transcript';
  if (proteinTypes.has(type)) return 'protein';
  return '';
}
