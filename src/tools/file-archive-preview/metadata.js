import {archiveColumns} from '../../core/file-archive-reader.js';
export const fileArchivePreviewExample=[
  '## RNA-seq cohort: 80 control and 80 treated samples',
  '## Counts are aligned read pairs; values are illustrative.',
  'sample_id\tcondition\tread_pairs\taligned_percent',
  ...Array.from({length:160},(_,index)=>{
    const condition=index<80?'control':'treated';
    const sample=`${condition}_${String(index%80+1).padStart(2,'0')}`;
    const readPairs=18000000+(index*1047293)%8500000;
    const alignedPercent=(95+(index*17)%48/10).toFixed(1);
    return `${sample}\t${condition}\t${readPairs}\t${alignedPercent}`;
  }),
  ''
].join('\n');
export const fileArchivePreviewMetadata={
  id:'file-archive-preview',name:'File And Archive Preview',category:'Text & Notes',tags:['table','text'],
  summary:'Preview beginning or end excerpts of text and binary files, and inspect .gz, .zip, .tar, or .tar.gz files.',
  whenToUse:'Inspect source lines or bytes from a large local file, or list an archive and preview the beginning of a selected member.',
  inputType:'Pasted text or one local file',outputType:'Source-line or hexadecimal excerpts, archive listing, or summary report',
  inputSource:{option:'fileSourceMode',textValue:'text'},fileInput:{accept:'',dropLabel:'Drop file or archive here'},
  workflow:{inputs:[{id:'input',kind:'text',mediaType:'text/plain'}],outputs:[
    {id:'primary',kind:'text',mediaType:'text/plain',catalogVisible:false},
    {id:'beginning',kind:'text',mediaType:'text/plain',label:'Beginning excerpt',outputFormat:'beginning'},
    {id:'end',kind:'text',mediaType:'text/plain',label:'End excerpt',outputFormat:'end'},
    {id:'preview',kind:'text',mediaType:'text/plain',label:'Single-region excerpt',outputFormat:'preview',advanced:true,catalogVisible:false},
    {id:'previewText',kind:'text',mediaType:'text/plain',label:'Text preview',outputFormat:'text',advanced:true,catalogVisible:false},
    {id:'hex',kind:'text',mediaType:'text/plain',label:'Hexadecimal preview',outputFormat:'hex',advanced:true,catalogVisible:false},
    {id:'archiveEntries',kind:'table',schema:'archive-entries',columns:archiveColumns,label:'Archive listing',outputFormat:'preview',advanced:true,catalogVisible:false},
    {id:'report',kind:'text',mediaType:'text/plain',label:'Summary report',outputFormat:'report'},
    {id:'warnings',kind:'warnings'}
  ]},
  runInWorker:true,workerModule:'../tools/file-archive-preview/run.js',workerExport:'runFileArchivePreview',
  options:[
    {id:'fileSourceMode',type:'radio',placement:'input',presentation:'tabs',label:'Input source',defaultValue:'text',choices:[{value:'text',label:'Paste text'},{value:'file',label:'Local file'}]},
    {id:'previewFile',type:'file',placement:'input',label:'File or archive',dropLabel:'Drop file or archive here',defaultValue:null,visibleWhen:{option:'fileSourceMode',value:'file'}},
    {id:'archiveEntry',type:'select',label:'Archive entry',defaultValue:'',choices:[{value:'',label:'List archive contents'}],choicesFromStream:{streamId:'archiveEntries',value:'id',label:'path',hideWhenEmpty:true,where:{preview:'Available'}},visibleWhen:{option:'fileSourceMode',value:'file'},help:'Choose an available file from the archive listing and run again to preview its beginning. Folders, links, encrypted files, and unsupported compression remain in the listing but cannot be selected.'},
    {id:'region',type:'radio',visibleWhen:{option:'outputFormat',value:['preview','report','text','hex']},label:'File region',defaultValue:'head',choices:[{value:'head',label:'Beginning'},{value:'tail',label:'End'},{value:'both',label:'Beginning and end'}],help:'End previews apply to uncompressed files. Archives and compressed content always preview the beginning.'},
    {id:'lines',type:'number',label:'Lines per region',defaultValue:50,min:1,max:1000,step:1,help:'Count physical source lines, including headers, comments, and blank lines. A final newline terminates the last source line.'},
    {id:'bytes',workflowHidden:true,type:'number',label:'Bytes per region',defaultValue:800,min:1,max:16000,step:1,help:'Binary excerpts show this many source bytes as hexadecimal and ASCII.'},
    {id:'outputFormat',type:'radio',label:'Output format',defaultValue:'preview',choices:[{value:'preview',label:'Automatic preview'},{value:'report',label:'Summary report'}],help:'Preserve physical source lines, or show hexadecimal bytes for binary content. Beginning and end are separate excerpts. Archives first show an entry listing.'},
    {type:'group',label:'Limits',collapsible:true,collapsed:true,options:[
      {type:'limit-value',label:'Pasted text',value:'5,000,000 characters',detail:'Larger text must be supplied as a local file.'},
      {type:'limit-value',label:'Content sample',value:'1 MiB per region; 1,000 lines',detail:'Preview stops at either limit. Long lines are shortened to 16,384 characters on screen; excerpt downloads preserve all sampled characters. Binary excerpts show up to 16,000 bytes.'},
      {type:'limit-value',label:'Archive listing',value:'10,000 entries; 4,096 characters per path',detail:'Entry-limited listings are marked partial. Longer paths are rejected.'},
      {type:'limit-value',label:'Archive scan',value:'512 MiB of source and decoded data',detail:'Scanning .tar files stops with a partial listing. Members beyond this budget cannot be previewed.'},
      {type:'limit-value',label:'Archive metadata',value:'16 MiB .zip read range; 8 MiB .tar metadata entry',detail:'Larger directories or metadata entries are rejected before allocating their contents.'}
    ]},
    {type:'note',text:'Comments, headers, blank lines, and line endings remain in each text excerpt. UTF-8 and Unicode byte-order marks are recognized; binary or undecodable content is shown as hexadecimal bytes. Beginning and end excerpts have separate search, copy, and download actions.'},
    {type:'note',text:'Supported files: .zip (including ZIP64), .gz (including concatenated members), .tar, and .tar.gz. Encrypted members and other compression formats are identified where possible but cannot be opened. Paths and links are listed as data; files are never extracted to your disk.'},
    {type:'note',text:'References:\n\nArchive reading: zip.js, fflate, and modern-tar documentation. Binary format hints: file-type documentation.'}
  ]
};
