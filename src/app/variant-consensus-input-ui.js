import { createTabbedInputWorkflowTabs } from './tabbed-input-workflow.js';
import { readTextFile, streamTextFileChunks } from '../core/compressed-text-reader.js';
export function renderVariantConsensusInput({root,tool,onChange,onMessage}) {
  root.textContent='';let headerRevision=0; const token={}; root.consensusRenderToken=token;
  const alive=()=>root.isConnected&&root.consensusRenderToken===token&&Boolean(root.querySelector('[data-consensus-card]'));
  root.onconsensusclear=()=>{headerRevision++;root.querySelectorAll('input[type=file]').forEach(input=>{input.value='';input.dispatchEvent(new Event('change'));});root.querySelectorAll('datalist').forEach(list=>list.replaceChildren());};
  const parts=tool.example.split(/^##SMS3_VARIANTS##$/m);
  const notify=()=>{onChange();};
  async function refreshSamples(text, file=null) {
    const revision=++headerRevision;
    try {
      if(file) {
        text='';
        for await(const chunk of streamTextFileChunks(file,{compressed:/\.(gz|bgz)$/i.test(file.name),maxDecodedBytes:2_000_000})) {
          text+=chunk;
          if(/^#CHROM\t[^\n]*\n/m.test(text)) break;
        }
      }
      if(revision!==headerRevision||!alive()) return;
      const samples=(text.match(/^#CHROM\t[^\r\n]*/m)?.[0].split('\t').slice(9))??[];
      const field=document.querySelector('#sample');if(!field) return;
      let list=document.getElementById('consensusSampleNames');
      if(!list) {list=document.createElement('datalist');list.id='consensusSampleNames';root.append(list);}
      list.replaceChildren(...samples.map(value=>{const o=document.createElement('option');o.value=value;return o;}));
      field.setAttribute('list',list.id);
      const chrom=document.querySelector('#chromosome');
      let contigs=document.getElementById('consensusContigNames');
      if(!contigs){contigs=document.createElement('datalist');contigs.id='consensusContigNames';root.append(contigs);}
      const names=[...text.matchAll(/^##contig=<ID=([^,>]+)/gm)].map(m=>m[1]);
      contigs.replaceChildren(...names.map(value=>{const o=document.createElement('option');o.value=value;return o;}));
      chrom?.setAttribute('list',contigs.id);
      if(samples.length===1) field.value=samples[0];
      else if(!samples.includes(field.value)) field.value='';
      field.placeholder=samples.length?'Choose a VCF sample':'Load VCF to list samples';
    } catch(error) {if(revision===headerRevision) onMessage(`Could not read VCF sample names: ${error.message}`,'warning');}
  }
  for(const [index,kind] of ['Ref','Vcf'].entries()) {
    const reference=kind==='Ref', modeId=`consensus${kind}Mode`, fileId=`consensus${kind}File`;
    const card=document.createElement('section');card.className='split-input-section';card.dataset.consensusCard=kind;
    const heading=document.createElement('h4');heading.textContent=reference?'Reference FASTA':'Variants (VCF)';
    const source=document.createElement('input');source.type='hidden';source.id=modeId;source.name=modeId;source.value='loaded';
    const description=document.createElement('p');description.className='split-input-description';
    const textarea=document.createElement('textarea');textarea.className='split-input-textarea';textarea.dataset.splitInputIndex=String(index);textarea.setAttribute('aria-label',reference?'Reference FASTA text':'VCF text');textarea.spellcheck=false;textarea.wrap='off';textarea.value=(parts[index]??'').trim();
    const slots=[];
    function slot(id,label,accept,allowed) {
      const box=document.createElement('div');box.className='alignment-viewer-file-slot';box.dataset.allowedModes=allowed.join(' ');
      const h=document.createElement('div');h.className='split-input-heading';const title=document.createElement('span');title.textContent=label;
      const picker=document.createElement('label');picker.className='file-button';const input=document.createElement('input');input.type='file';input.id=id;input.name=id;input.accept=accept;input.setAttribute('aria-label',label);const span=document.createElement('span');span.textContent='Choose file';picker.append(input,span);h.append(title,picker);
      const drop=document.createElement('div');drop.className='drop-zone split-drop-zone';drop.textContent=`Drop ${label} here`;drop.tabIndex=0;drop.setAttribute('role','button');
      const status=document.createElement('p');status.className='split-input-description';status.hidden=true;
      const update=async()=>{
        notify();status.textContent=input.files[0]?.name??'';status.hidden=!input.files.length;
        const file=input.files[0];if(!file)return;
        try {
          if(id===fileId&&source.value==='loaded') {
            const mode=source.value, revision=file;
            const text=await readTextFile(file,{maxDecodedBytes:20_000_000});
            if(!card.isConnected||source.value!==mode||input.files[0]!==revision)return;
            textarea.value=text;input.value='';status.hidden=true;
            if(!reference) await refreshSamples(text);
            notify();onMessage(`Loaded ${file.name}.`);
          } else if(!reference&&id===fileId) await refreshSamples('',file);
        }catch(error){onMessage(error.message,'error');input.value='';status.hidden=true;}
      };
      input.addEventListener('change',update);drop.addEventListener('click',()=>input.click());drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
      drop.addEventListener('dragover',e=>e.preventDefault());drop.addEventListener('drop',e=>{e.preventDefault();const transfer=new DataTransfer();if(e.dataTransfer.files[0])transfer.items.add(e.dataTransfer.files[0]);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
      box.append(h,drop,status);slots.push(box);return box;
    }
    const modes=reference?{loaded:{label:'Paste/upload FASTA'},indexed:{label:'FASTA + FAI'},bgzf:{label:'BGZF FASTA + FAI + GZI'}}:{loaded:{label:'Paste/upload VCF'},indexed:{label:'Indexed VCF + TBI/CSI'}};
    const updateMode=mode=>{
      source.value=mode;textarea.hidden=mode!=='loaded';
      description.textContent=mode==='loaded'?(reference?'FASTA or ordinary FASTA.GZ. IDs must match VCF CHROM names; sequence characters are never removed.':'VCF or ordinary VCF.GZ. Choose one sample in Options after loading the file.'):(reference?'Choose matching reference and index files. Set a bounded reference region in Options.':'Use BGZF-compressed VCF.GZ and matching TBI/CSI. Set a bounded reference region in Options.');
      for(const box of slots) box.hidden=!box.dataset.allowedModes.split(' ').includes(mode);
      notify();
    };
    const tabs=createTabbedInputWorkflowTabs({modes,selectedMode:'loaded',ariaLabel:reference?'Reference source':'VCF source',onSelect:updateMode});
    card.append(heading,tabs,source,description,slot(fileId,reference?'reference FASTA':'VCF or VCF.GZ',reference?'.fa,.fasta,.fna,.fa.gz,.fasta.gz,.gz,.bgz':'.vcf,.vcf.gz,.gz,.bgz',Object.keys(modes)),textarea);
    if(reference) card.append(slot('consensusFaiFile','matching FAI','.fai',['indexed','bgzf']),slot('consensusGziFile','matching GZI','.gzi',['bgzf']));
    else card.append(slot('consensusVcfIndex','matching TBI or CSI','.tbi,.csi',['indexed']));
    textarea.addEventListener('input',()=>{const input=card.querySelector(`#${fileId}`);input.value='';input.dispatchEvent(new Event('change'));notify();if(!reference) refreshSamples(textarea.value);});
    root.append(card);updateMode('loaded');
  }
  // Options are rendered immediately after the split input panels.
  queueMicrotask(()=>refreshSamples(parts[1]??''));
}
