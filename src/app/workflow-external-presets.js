export const externalWorkflowPresets = [
  {
    id: 'retrieve-region-viewer',
    name: 'Genomic region feature viewer',
    summary: 'Retrieve native NCBI GenBank for an interval and open its annotated linear viewer. Enter chromosome:start-end (1-based, inclusive); set the reference assembly in Get Data. The example spans the human beta-globin cluster and intervening DNA on GRCh38.p14 (GCF_000001405.40). Viewer coordinates start at 1 within the interval.',
    example: '11:5200000-5300000',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'retrieve', type: 'tool', toolId: 'get-data', selectStream: 'primary', options: { retrieval: 'region:ncbi', assembly: 'GCF_000001405.40', strand: '1', format: 'gb' } },
      { id: 'viewer', type: 'tool', toolId: 'dna-sequence-viewer', selectStream: 'viewer', options: { inputFormat: 'genbank', outputFormat: 'interactive-viewer' } }
    ] }
  },
  {
    id: 'retrieve-region-cds-stats',
    name: 'Genomic region CDS statistics',
    summary: 'Compare the lengths and GC content of complete RefSeq CDS from transcripts overlapping an interval on either strand. Enter chromosome:start-end (1-based, inclusive); set the reference assembly in Get Data. The example includes TP53 and WRAP53 products on human GRCh38.p14 (GCF_000001405.40). Complete CDS can extend beyond the interval. Original FASTA and full base counts are available under Step outputs.',
    example: '17:7668421-7687490',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'retrieve', type: 'tool', toolId: 'get-data', selectStream: 'primary', options: { retrieval: 'region-cds:ncbi', assembly: 'GCF_000001405.40', transcriptSelection: 'all', format: 'fasta' } },
      { id: 'labels', type: 'tool', toolId: 'fasta-header-rename', selectStream: 'fasta', options: { findText: '^(\\S+).*', replaceText: '$1', findMode: 'regex', regexFlags: '', safeIds: false, outputFormat: 'fasta' } },
      { id: 'statistics', type: 'tool', toolId: 'sequence-stats-dna-rna', selectStream: 'table', options: { outputFormat: 'tsv' } },
      { id: 'comparison', type: 'tool', toolId: 'table-sql-query', selectStream: 'table', options: { sqlQuery: `SELECT "Title" AS "Transcript accession", "Length" AS "CDS length (nt)", "GC percent" AS "GC (%)", "Ambiguous symbols" AS "Ambiguous bases" FROM table WHERE "Title" != 'Total' ORDER BY "CDS length (nt)" DESC, "Transcript accession"`, outputFormat: 'table' } }
    ] }
  },
  {
    id: 'retrieve-region-protein-stats',
    name: 'Genomic region protein statistics',
    summary: 'Retrieve annotated protein products for transcripts overlapping a genomic interval on either strand, then compare length, molecular weight, net charge at pH 7 and estimated pI. Enter chromosome:start-end (1-based, inclusive); set the reference assembly in Get Data. The example includes TP53 and WRAP53 products on human GRCh38.p14 (GCF_000001405.40). Complete products can extend beyond the interval; protein FASTA is available under Step outputs.',
    example: '17:7668421-7687490',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'retrieve', type: 'tool', toolId: 'get-data', selectStream: 'primary', options: { retrieval: 'region-protein:ncbi', assembly: 'GCF_000001405.40', transcriptSelection: 'all', format: 'fasta' } },
      { id: 'labels', type: 'tool', toolId: 'fasta-header-rename', selectStream: 'fasta', options: { findText: '^(\\S+).*', replaceText: '$1', findMode: 'regex', regexFlags: '', safeIds: false, outputFormat: 'fasta' } },
      { id: 'statistics', type: 'tool', toolId: 'sequence-stats-protein', selectStream: 'table', options: { chargePh: 7, outputFormat: 'tsv' } },
      { id: 'comparison', type: 'tool', toolId: 'table-sql-query', selectStream: 'table', options: { sqlQuery: `SELECT "Title" AS "Protein accession", "Length" AS "Length (aa)", "Molecular weight (Da)" AS "Mass (Da)", "Charge pH", "Net charge", "Isoelectric point" AS "Estimated pI" FROM table WHERE "Title" != 'Total' ORDER BY "Length (aa)" DESC, "Protein accession"`, outputFormat: 'table' } }
    ] }
  },
  {
    id: 'retrieve-genbank-review',
    name: 'Retrieve GenBank and review features',
    summary: 'Enter one NCBI nucleotide accession to retrieve its complete GenBank record, calculate sequence statistics, and inspect an annotated circular view. The example is the 5,386-base phiX174 genome (NC_001422.1).',
    example: 'NC_001422.1',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'retrieve', type: 'tool', toolId: 'get-data', options: { retrieval: 'nucleotide:ncbi', format: 'gb' } },
      { id: 'sequence', type: 'tool', toolId: 'annotated-dna-record-extractor', selectStream: 'wholeSequenceRecords', options: { outputFormat: 'whole-fasta' } },
      { id: 'statistics', type: 'tool', toolId: 'sequence-stats-dna-rna', selectStream: 'table', options: { outputFormat: 'tsv' } },
      { id: 'features', type: 'tool', toolId: 'annotated-dna-record-extractor', input: { from: 'retrieve' }, selectStream: 'viewer', options: { outputFormat: 'interactive-circular-viewer' } }
    ] }
  },
  {
    id: 'retrieve-protein-blast',
    name: 'Retrieve protein and prepare BLAST',
    summary: 'Enter one NCBI protein accession to retrieve its complete GenPept record, extract the protein, review its statistics, and prepare a BLASTP search. Use Open in NCBI BLAST in the result to review and submit the search at NCBI. The example is human p53 (NP_000537.3).',
    example: 'NP_000537.3',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'retrieve', type: 'tool', toolId: 'get-data', options: { retrieval: 'protein:ncbi', format: 'gp' } },
      { id: 'protein', type: 'tool', toolId: 'annotated-protein-record-extractor', selectStream: 'proteinRecords', options: { outputFormat: 'protein-fasta' } },
      { id: 'statistics', type: 'tool', toolId: 'sequence-stats-protein', selectStream: 'table', options: { outputFormat: 'tsv' } },
      { id: 'blast', type: 'tool', toolId: 'send-data', input: { from: 'protein', stream: 'proteinRecords' }, options: { destination: 'similar:blast', program: 'blastp' } }
    ] }
  },
  {
    id: 'translate-protein-blast',
    name: 'Translate DNA and prepare BLAST',
    summary: 'Translate one coding DNA sequence in forward frame 1 with the standard genetic code, then prepare a BLASTP search for its protein. The example is the human HBB coding sequence from NM_000518.5. Open the prepared search from the result to continue at NCBI.',
    exampleId: 'human-hbb-cds',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'translate', type: 'tool', toolId: 'translate', selectStream: 'proteinRecords', options: { frame: '1', geneticCode: '1', outputFormat: 'fasta' } },
      { id: 'blast', type: 'tool', toolId: 'send-data', options: { destination: 'similar:blast', program: 'blastp' } }
    ] }
  }
];
