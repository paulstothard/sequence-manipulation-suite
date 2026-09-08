import { consensusAuditColumns, consensusCoordinateColumns } from '../../core/variant-consensus-output.js';
const file=(id,label,accept)=>({id,type:'file',placement:'input',label,accept,dropLabel:`Drop ${label} here`,defaultValue:null});
export const variantConsensusMetadata={
  id:'variant-consensus-builder',name:'Variant Consensus Builder',category:'High-Throughput Sequencing',
  tags:['DNA','FASTA','VCF','coordinates','format conversion'],
  summary:'Apply a sample’s variant calls to reference FASTA, with explicit consensus and phased haplotype outputs.',
  whenToUse:'Use this to construct a sample sequence from an existing VCF and matching reference, and audit how substitutions and indels change its coordinates.',
  inputType:'Reference FASTA / FASTA.GZ plus VCF / VCF.GZ, or matching indexed bundles for a bounded region',
  outputType:'Consensus FASTA, variant audit table, coordinate map table, variant map, or report',
  splitInput:{separator:'##SMS3_VARIANTS##',panels:[{id:'reference',label:'Reference FASTA',dropLabel:'Drop reference FASTA records here',accept:'.fa,.fasta,.fna,.gz'},{id:'variants',label:'Variants (VCF)',dropLabel:'Drop VCF or VCF.GZ here',accept:'.vcf,.vcf.gz,.gz'}]},
  runInWorker:true,workerModule:'../tools/variant-consensus-builder/run.js',workerExport:'runVariantConsensus',
  workflow:{inputs:[{id:'input',kind:'text',mediaType:'text/plain'}],outputs:[
    {id:'primary',kind:'text',mediaType:'text/plain'},{id:'fasta',kind:'text',mediaType:'text/x-fasta',label:'Consensus FASTA'},
    {id:'sequenceRecords',kind:'sequence-records',alphabet:'dna-rna',label:'Consensus sequences'},
    {id:'audit',kind:'table',schema:'variant-consensus-audit',columns:consensusAuditColumns,label:'Variant audit table'},
    {id:'coordinates',kind:'table',schema:'variant-consensus-coordinates',columns:consensusCoordinateColumns,label:'Coordinate map table'},
    {id:'map',kind:'text',mediaType:'image/svg+xml',label:'Variant map'},
    {id:'report',kind:'text',mediaType:'text/plain',label:'Summary report'},{id:'warnings',kind:'warnings'}]},
  options:[
    {id:'consensusRefMode',type:'select',placement:'input',label:'Reference source',defaultValue:'loaded',choices:[{value:'loaded',label:'Paste/upload FASTA'},{value:'indexed',label:'FASTA + FAI'},{value:'bgzf',label:'BGZF FASTA + FAI + GZI'}]},
    {id:'consensusVcfMode',type:'select',placement:'input',label:'VCF source',defaultValue:'loaded',choices:[{value:'loaded',label:'Paste/upload VCF'},{value:'indexed',label:'Indexed VCF + TBI/CSI'}]},
    file('consensusRefFile','Reference FASTA','.fa,.fasta,.fna,.fa.gz,.fasta.gz,.gz,.bgz'),file('consensusFaiFile','Matching FAI','.fai'),file('consensusGziFile','Matching GZI','.gzi'),
    file('consensusVcfFile','VCF / VCF.GZ','.vcf,.vcf.gz,.gz,.bgz'),file('consensusVcfIndex','Matching TBI or CSI','.tbi,.csi'),
    {type:'group',label:'Sample and region',options:[
      {id:'sample',type:'text',label:'Sample',defaultValue:'Sample_A',help:'Select one sample from the VCF header. A single-sample file can be selected automatically. Samples are never combined; haploid and diploid calls are supported.'},
      {id:'chromosome',type:'text',label:'Reference / chromosome',defaultValue:'',help:'Exact FASTA ID and VCF CHROM name. Leave blank for all loaded reference records. Required for indexed input.'},
      {id:'regionStart',type:'text',label:'Start position',defaultValue:'',help:'1-based inclusive. Blank starts at position 1. Set a reference name when restricting the region.'},
      {id:'regionEnd',type:'text',label:'End position',defaultValue:'',help:'1-based inclusive. Blank ends at the loaded reference length. Indexed input requires an explicit end, within 5 million bases of the start. Edits crossing a region boundary stop with guidance.'}
    ]},
    {type:'group',label:'Sequence interpretation',options:[
      {id:'sequenceMode',type:'select',label:'Sequence to build',defaultValue:'consensus',choices:[{value:'consensus',label:'Single consensus (IUPAC)'},{value:'haplotype1',label:'Phased haplotype 1'},{value:'haplotype2',label:'Phased haplotype 2'},{value:'both',label:'Both phased haplotypes'}],help:'Haploid calls select one allele. For diploid calls, a consensus uses ambiguity codes for heterozygous SNPs and stops at heterozygous indels. Phased outputs follow GT allele order (0|1 versus 1|0), including indels. Unphased heterozygotes stop phased output. Haplotype numbers do not imply parental origin. Both emits one sequence in haploid regions; ploidy transitions require separate region runs.'},
      {id:'phasePolicy',type:'radio',label:'Phase blocks',defaultValue:'continuous',visibleWhen:{option:'sequenceMode',value:['haplotype1','haplotype2','both']},choices:[{value:'continuous',label:'Require one connected phase block'},{value:'blocks',label:'Export separate phase blocks'}],help:'Different PS values do not establish chromosome-wide phase. Separate blocks export each block’s first-to-last heterozygous REF span and omit flanking/inter-block sequence. Interleaved blocks stop. Phased GT without PS uses the VCF implicit phase-set convention.'},
      {id:'missingPolicy',type:'select',label:'Missing genotypes',defaultValue:'error',choices:[{value:'error',label:'Stop and report missing calls'},{value:'mask',label:'Mask the reference span with N'},{value:'reference',label:'Retain reference bases with a warning'}],help:'Includes partially missing calls such as 0/. . Masking preserves the REF span length and cannot reconstruct an unknown insertion or deletion. Positions absent from a variants-only VCF keep reference bases, without establishing coverage.'},
      {id:'filterPolicy',type:'select',label:'VCF FILTER',defaultValue:'pass-or-unfiltered',choices:[{value:'pass-or-unfiltered',label:'PASS and unfiltered (.)'},{value:'pass',label:'PASS only'},{value:'all',label:'All records'}],help:'Skipped calls retain reference sequence and appear in the audit. FILTER=. means filters were not applied, not that quality passed. This tool uses existing GT calls; it does not call variants from depths or likelihoods.'},
      {id:'unsupportedPolicy',type:'radio',label:'Unsupported selected alleles',defaultValue:'error',choices:[{value:'error',label:'Stop with an explanation'},{value:'skip',label:'Skip and retain reference'}],help:'Symbolic structural alleles, breakends and spanning-deletion * alleles cannot be applied. Skipping is reported. Supported sequence alleles must still match REF and be nonconflicting.'}
    ]},
    {type:'group',label:'Output',options:[{id:'outputFormat',type:'select',label:'Output format',defaultValue:'fasta',choices:[{value:'fasta',label:'Consensus FASTA'},{value:'audit',label:'Variant audit table'},{value:'coordinates',label:'Coordinate map table'},{value:'map',label:'Variant map'},{value:'report',label:'Summary report'}],help:'FASTA exports the selected sequence interpretation. Audit positions are 1-based VCF coordinates. Coordinate-map intervals are 0-based, end-exclusive: an insertion has an empty reference interval and a deletion an empty output interval. The map shows calls on reference coordinates; it is not an alignment.'}]},
    {type:'group',label:'Limits',id:'advancedLimits',collapsible:true,collapsed:true,options:[{id:'maxVariants',type:'number',label:'Maximum variants in scope',defaultValue:50000,min:1,max:50000,step:1,help:'Maximum 20 million input characters per source, 5 million loaded or indexed reference bases, 10 million output bases, 2,000 samples and 2,000 reference contigs (IDs up to 200 characters), 200 phase blocks per contig and 4,000 output sequences. Tables allow 20 million output characters. Maps allow 12 output sequences and 240 audit rows. Exceeding a limit stops; no consensus is silently truncated.'}]},
    {id:'methodNote',type:'note',text:'Uses existing sample GT calls and GT/PS phasing. Reference IDs and REF alleles must match. The example contains simulated calls. No phase inference, structural-variant reconstruction or variant calling is performed.'},
    {id:'citationNote',type:'note',text:'References:\n\nGenotypes and phase sets: VCF specification.\n\nReference calculations: BCFtools consensus documentation.'}
  ]
};
