export const alignedSequenceViewerMetadata = {
  id: 'aligned-sequence-viewer', name: 'Aligned Sequence Viewer', category: 'Viewers & Figures',
  tags: ['DNA', 'RNA', 'protein', 'FASTA', 'alignment', 'coordinates', 'plot'],
  summary: 'Display pre-aligned sequences with editable colours, numbering, fonts and figure dimensions.',
  whenToUse: 'Format an existing DNA, RNA or protein alignment for a figure, including colour and grayscale identity or residue-type shading.',
  inputType: 'Aligned FASTA, CLUSTAL, GDE, or an aligned sequence viewer document',
  outputType: 'Aligned sequence viewer', inputTable: false,
  fileInput: { accept: '.fasta,.fa,.faa,.fna,.aln,.clustal,.gde,.txt,.json', dropLabel: 'Drop aligned FASTA, CLUSTAL, GDE or a saved viewer document here' },
  runInWorker: true, workerModule: '../tools/aligned-sequence-viewer/run.js', workerExport: 'runAlignedSequenceViewer',
  workflow: { inputs: [{ id: 'input', kind: 'text', mediaType: 'text/plain' }], outputs: [
    { id:'primary',kind:'text',mediaType:'application/json',label:'Aligned sequence viewer' },
    { id:'alignmentDocument',kind:'text',mediaType:'application/json',label:'Aligned sequence viewer document' },
    { id:'warnings',kind:'warnings' }
  ] },
  showcaseOutputs: [{ id:'aligned-sequences', label:'Aligned sequence viewer', showcase:'aligned-sequence-viewer' }],
  options: [
    { id:'alphabet',type:'select',label:'Sequence type',defaultValue:'auto',choices:[{value:'auto',label:'Auto detect'},{value:'dna',label:'DNA'},{value:'rna',label:'RNA'},{value:'protein',label:'Protein'}],help:'Auto detect treats sequences made entirely of nucleotide IUPAC symbols as DNA/RNA. Select Protein for short or ambiguous protein alignments. Gaps and letter case are preserved.' },
    { type:'group',label:'Limits',collapsible:true,collapsed:true,options:[
      {type:'limit-value',label:'Input',value:'2,000,000 characters; 1,000 sequences; 250,000 alignment cells'},
      {type:'limit-value',label:'Displayed figure',value:'20,000 cells',detail:'The complete figure is limited to 20,000 cells (sequences × aligned length). Larger figures require a smaller input alignment.'}
    ] },
    { type:'note',text:'Sequences must already be aligned and have equal lengths, including gaps. Styling and numbering are edited in the result.' },
    { type:'note',text:'References:\n\nColour schemes: Jalview and UGENE documentation.\n\nPercentage identity uses literal residue frequencies, with stepped or continuous shading. Zappo and Taylor colour amino acid types; ClustalX uses its published column-profile rules.\n\nPublication palettes: Viridis, Cividis, Plasma, Inferno and Magma, shared with Genome Loom and Genome Artistry. Categorical palettes: Okabe–Ito and Tol Bright.\n\nHydrophobicity: Kyte and Doolittle 1982. Taylor colours: Taylor 1997.' }
  ]
};
