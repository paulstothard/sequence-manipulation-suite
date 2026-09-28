import { formatFastaRecord } from '../core/fasta.js';
import { complementDnaRnaSequence } from '../core/sequence.js';

// Fixed synthetic DNA; no biological accession or measured data is implied.
export const sangerWorkflowRegion = [
  'GTAAGAAAGTCCATCGCGGTTAATTAACTAATTGATCTATTGGTGTTAAACATCAAAGCC',
  'ATTCACGCCGTCAAACTAGTCACGGGTGTAAATTGACGTATGATCCAGCACAACTTGACG',
  'TGTCCCAGCTCAGTGACCCGGTCACACTGGCAGCTGTGGTAGCAATTTAAGAGCTACGAC',
  'CATGCAGTTCACCAATGCGCAAATTGGCTACGGTTATCCGTCATAATTGACCGAATGGAC',
  'AGCGAGCCACCCGTTGAGCTCGGTGTCATCATTTCGCCTTAATGTAATCGGTTACATCCA',
  'TTTCTGCGGAGTGGTGGAGACCCCGTCGGGATACCTGCGGCTGGCAGGTTCTTAATCCTT',
  'TTCACGGCCAGCGACACCCCCGATCTCTGCCATGGAGGAGGCCAGAGGCAGAATTAGAAT',
  'GGAAATCCCGATCAGTGCCCCTGGAGTGTCGACCCCAAAGGATTCGTGGTCGCTTCCCCC',
  'TTTATCACCACCAGGGTCCTTCACTGGCTTTTCGCTACCCGTGAATCTTGTGAAGCATAA',
  'GCACAAATTGAGGGTTCCCCTTACCCTGCGTGGGCCGGTCTGTTAAGTCTGGCAGTAAAT',
  'TGAGTCCGTCACTAATTTCTAACCGCTCACTGATGTCAAAAAAAATCAGTTCGGGTGTCT',
  'TGTGATGCAGCGGAAATTAATCGGCCTACCAGTCGGCTAAAATTGAGATCGGTAAACCAT',
  'CCCCTACGCTAGCACGTCCGATACTCTGGGTTTTCTTAGGGTATCGACCGTTCCCGGCCG',
  'CTTTGGATGCAAAAGGCAGCCCGCAAGACCGGTAGTGGGGATGTGGGTTTATGTATAGAG',
  'GTGTCCTGATCGGAATTGTCATAAATAGTAAAGTTAGTGTCTGGTTGCATTTATTGTTTC',
].join('');
export const sangerWorkflowReference = sangerWorkflowRegion.slice(0, 420);
// SNP at reference position 121; deletion of reference positions 201–203.
const replacement = sangerWorkflowReference[120] === 'A' ? 'G' : 'A';
export const sangerWorkflowVariant = sangerWorkflowReference.slice(0, 120) + replacement +
  sangerWorkflowReference.slice(121, 200) + sangerWorkflowReference.slice(203);
const fasta = formatFastaRecord;
const reference = fasta('synthetic_reference', sangerWorkflowReference);
const variant = fasta('variant_SNP_121_deletion_201_203', sangerWorkflowVariant);
export const sangerWorkflowExamples = {
  'assemble-simulated-sanger-traces': fasta('forward_1_600', sangerWorkflowRegion.slice(0, 600)) +
    fasta('reverse_900_301', complementDnaRnaSequence(sangerWorkflowRegion.slice(300), { preserveCase: false }).split('').reverse().join('')),
  'compare-simulated-sanger-trace': variant + '##SMS3_REFERENCE##\n' + reference,
  'mixed-sanger-indel-trace': fasta('allele_1', sangerWorkflowReference) + variant + '##SMS3_REFERENCE##\n' + reference
};
