import { makeAlignedSequences } from './aligned-sequences.js';

export function pairwiseAlignedSequenceModel(records,alignment,alphabet) {
  const coding=alphabet==='coding-dna';
  const reversed=!coding&&alignment.orientationSelection?.selected==='reverse-complement';
  return makeAlignedSequences(records.map((record,index)=>({title:record.title,
    sequence:coding?(index?alignment.codonAlignmentB:alignment.codonAlignmentA).join(''):(index?alignment.alignmentB:alignment.alignmentA),
    start:coding?(index?alignment.nucleotideStartB:alignment.nucleotideStartA):index?(reversed?record.sequence.length-alignment.startB+1:alignment.startB):alignment.startA,
    step:index&&reversed?-1:1
  })),alphabet,{provenance:reversed?'Sequence B is displayed as its reverse complement; decreasing coordinates refer to the submitted sequence.':coding?'Protein-guided coding-DNA alignment; the displayed symbols and coordinates are nucleotides.':''});
}
export function multipleAlignedSequenceModel(alignment) {
  return makeAlignedSequences(alignment.titles.map((title,index)=>({title,sequence:alignment.aligned[index]})),alignment.alphabet,
    {provenance:alignment.alphabet==='coding-dna'?'Protein-guided coding-DNA alignment; the displayed symbols and coordinates are nucleotides.':''});
}
