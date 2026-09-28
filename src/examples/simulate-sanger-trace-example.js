import { formatFastaRecord } from '../core/fasta.js';
import { SANGER_SIMULATION_SEPARATOR } from '../core/simulate-sanger-trace.js';

// Synthetic amplicon: allele 2 has a SNP at position 31 and lacks
// positions 81–83 of allele 1. No biological accession is implied.
const allele1 = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGTTCCGATGACCTGCAGGCTTATCACCATTTTCACGCGCACAGGCCGGCCGACTTTCCCATGACCGTTAACGACGCTACGTTGACCTGACTGGAGTTCAGCTGACGATCGTACCTGAGCTAGGCTACGATCGTGCATCGATGCTAGCTAGGATCCTGACGTAGCTAGCGTACGATCGTACCTGA';
const allele2 = allele1.slice(0, 30) + 'A' + allele1.slice(31, 80) + allele1.slice(83);
export const simulateSangerTraceExample = [
  formatFastaRecord('allele_1 synthetic amplicon', allele1).trim(),
  formatFastaRecord('allele_2 SNP_31_and_deletion_81_83', allele2).trim()
].join(`\n${SANGER_SIMULATION_SEPARATOR}\n`);
