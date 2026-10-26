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

// Shared contracts for the two presentation editors.
export function imageToolMetadata(mode) {
  const table = mode === 'table';
  const id = table ? 'table-to-image' : 'text-to-image';
  return {
    id, name: table ? 'Table to Image' : 'Text to Image', category: 'Text, Notes & Images',
    tags: table ? ['table', 'CSV', 'TSV', 'Excel', 'annotation', 'format conversion'] : ['text', 'annotation', 'format conversion'],
    summary: table ? 'Create images from tables, with column formatting and annotations.' : 'Create images from formatted text, with labels, pointers, and shapes.',
    whenToUse: table ? 'Turn a table into an image for a slide or document, with annotations and separate column fonts for sequences or identifiers.' : 'Turn formatted text or a sequence excerpt into an image for a slide or document, preserving spacing and adding annotations.',
    inputType: table ? 'CSV, TSV, Excel workbook, plain-text table, or saved table image document' : 'Text or saved text image document',
    outputType: table ? 'Editable table image' : 'Editable text image',
    ...(table ? { inputTable: { maxCharacters: 100000 } } : { inputTable: false, fileInput: { accept: '.txt,.json', dropLabel: 'Drop text or a saved text image document here' } }),
    runInWorker: true, workerModule: `../tools/${id}/run.js`, workerExport: table ? 'runTableImage' : 'runTextImage',
    workflow: { inputs: [{ id: 'input', kind: 'text', mediaType: 'text/plain' }, ...(table ? [{ id: 'table', kind: 'table' }] : [])], outputs: [
      { id: 'primary', kind: 'text', mediaType: 'application/json', label: 'Editable image', advanced: false },
      { id: 'document', kind: 'text', mediaType: 'application/json', label: 'Editable image document' },
      { id: 'warnings', kind: 'warnings' }
    ] },
    showcaseOutputs: [{ id: 'image-editor', label: table ? 'Editable table image' : 'Editable text image', summary: table ? 'A primer table with Inter headers, fixed-width sequences and an editable highlight across the TP53_F row.' : 'A TP53 sequence excerpt in bundled JetBrains Mono, with a start-codon highlight attached to its characters and an editable legend.' }],
    options: [
      ...(table ? [{ id: 'tableInputOptions', type: 'group', label: 'Input', options: [
        { id: 'delimiter', type: 'select', label: 'Delimiter', defaultValue: 'auto', help: 'Auto detect checks common delimiters while respecting quoted fields.', choices: [{ value: 'auto', label: 'Auto detect' }, { value: 'tab', label: 'Tab' }, { value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'pipe', label: 'Pipe' }] },
        { id: 'hasHeader', type: 'checkbox', label: 'First row contains column names', defaultValue: true }
      ] }] : []),
      { type: 'group', label: 'Limits', collapsible: true, collapsed: true, options: [
        { type: 'limit-value', label: 'Input', value: '100,000 characters', detail: table ? 'Larger input is refused; choose a smaller table.' : 'Larger input is refused; choose a smaller passage.' },
        table ? { type: 'limit-value', label: 'Table image', value: '60 rows; 12 columns; 600 cells', detail: 'The header counts as a row. Cells support up to 1,000 characters; larger tables are refused.' } : { type: 'limit-value', label: 'Text image', value: '120 lines; 200 characters per line', detail: 'Tabs expand to four-character tab stops. Oversized text is refused without truncation.' },
        { type: 'limit-value', label: 'Image layout', value: '2,400 pixels per side; 2 million pixels', detail: 'Oversized layouts are refused. PNG uses the shared high-resolution export scale.' },
        { type: 'limit-value', label: 'Annotations', value: '100', detail: 'Further annotations are refused. Labels support up to 200 characters.' }
      ] }
    ]
  };
}
