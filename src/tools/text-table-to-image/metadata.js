export const textTableImageExample = `TP53 coding-region fragment
       1 ATGGAGGAGC CGCAGTCAGA TCCTAGCGTC GAGCCCCCTC TGAGTCAGGA AACATTTTCA
         TACCTCCTCG GCGTCAGTCT AGGATCGCAG CTCGGGGGAG ACTCAGTCCT TTGTAAAAGT
      61 GACCTATGGA AACTACTTCC TGAAAACAAC GTTCTGTCCC CCTTGCCGTC CCAAGCAATG
         CTGGATACCT TTGATGAAGG ACTTTTGTTG CAAGACAGGG GGAACGGCAG GGTTCGTTAC
     121 GATGATTTGA TGCTGTCCCC GGACGATATT GAACAATGGT TCACTGAAGA
         CTACTAAACT ACGACAGGGG CCTGCTATAA CTTGTTACCA AGTGACTTCT`;
export const textTableImageTableExample = `Primer\tSequence (5′ → 3′)\tLength (nt)\tGC (%)\tInput (nM)
TP53_F\tATGGAGGAGCCGCAGTCAG\t19\t63.2\t500
TP53_R\tTCAGTCTGAGTCAGGCCCT\t19\t57.9\t500
KRAS_F\tATGACTGAATATAAACTTGTGGTAG\t25\t32.0\t500
KRAS_R\tTTACTAGTATTATCTTGTAACCTTG\t25\t28.0\t500`;

export const textTableImageMetadata = {
  id: 'text-table-to-image', name: 'Text & Table to Image', category: 'Text, Notes & Images',
  tags: ['table', 'text', 'CSV', 'TSV', 'Excel', 'annotation', 'format conversion'],
  summary: 'Create images from formatted text or tables, with optional labels, arrows, boxes, and highlights.',
  whenToUse: 'Use this to prepare a compact sequence display, report excerpt, or table for a slide or other document.',
  inputType: 'Text, CSV, TSV, Excel table, or saved image document', outputType: 'Editable text or table image',
  fileInput: { accept: '.txt,.csv,.tsv,.tab,.xlsx,.json', dropLabel: 'Drop text, a table, or a saved image document here' },
  inputTable: { label: 'Table input', visibleWhen: { option: 'inputMode', value: 'table' }, maxCharacters: 100000, description: 'Paste tab-separated spreadsheet cells or CSV. Cell values and header spelling are preserved.' },
  runInWorker: true, workerModule: '../tools/text-table-to-image/run.js', workerExport: 'runTextTableImage',
  workflow: { inputs: [{ id: 'input', kind: 'text', mediaType: 'text/plain' }, { id: 'table', kind: 'table' }], outputs: [
    { id: 'primary', kind: 'text', mediaType: 'application/json', label: 'Editable image', advanced: false },
    { id: 'document', kind: 'text', mediaType: 'application/json', label: 'Editable image document' },
    { id: 'warnings', kind: 'warnings' }
  ] },
  showcaseOutputs: [{ id: 'image-editor', label: 'Editable text image', summary: 'A TP53 sequence excerpt in bundled JetBrains Mono, with a start-codon highlight attached to its characters and an editable legend.' }],
  options: [
    { id: 'inputMode', type: 'radio', placement: 'input', presentation: 'tabs', label: 'Input type', defaultValue: 'text', choices: [{ value: 'text', label: 'Text', example: textTableImageExample }, { value: 'table', label: 'Table', example: textTableImageTableExample }] },
    { id: 'tableInputOptions', type: 'group', label: 'Table input', visibleWhen: { option: 'inputMode', value: 'table' }, options: [
      { id: 'delimiter', type: 'select', label: 'Delimiter', defaultValue: 'auto', choices: [{ value: 'auto', label: 'Automatic' }, { value: 'tab', label: 'Tab' }, { value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'pipe', label: 'Pipe' }] },
      { id: 'hasHeader', type: 'checkbox', label: 'First row is a header', defaultValue: true }
    ] },
    { type: 'group', label: 'Limits', collapsible: true, collapsed: true, options: [
      { type: 'limit-value', label: 'Input', value: '100,000 characters', detail: 'Larger input is refused; choose a smaller passage or table.' },
      { type: 'limit-value', label: 'Text image', value: '120 lines; 200 characters per line', detail: 'Tabs expand to four-character tab stops. Oversized text is refused without truncation.' },
      { type: 'limit-value', label: 'Table image', value: '60 rows; 12 columns; 600 cells', detail: 'The header counts as a row. Cells support up to 1,000 characters; larger tables are refused.' },
      { type: 'limit-value', label: 'Image layout', value: '2,400 pixels per side; 2 million pixels', detail: 'Oversized layouts are refused. PNG uses the shared high-resolution export scale.' },
      { type: 'limit-value', label: 'Annotations', value: '100', detail: 'Further annotations are refused. Labels support up to 200 characters.' }
    ] }
  ]
};
