import { renderAlignedSequenceSvg, createAlignedSequenceSettings, validateAlignedSequenceSettings, ALIGNMENT_FIGURE_PRESETS } from '../core/aligned-sequence-viewer.js';
import { validateAlignedSequences } from '../core/aligned-sequences.js';
import { ALIGNMENT_SCHEMES, ALIGNMENT_SCHEME_HELP, PROTEIN_SCHEMES, NUCLEOTIDE_SCHEMES, COLUMN_STAT_SCHEMES, REFERENCE_SCHEMES, IDENTITY_SCHEMES, IDENTITY_PALETTES, DEFAULT_IDENTITY_CUTOFFS, alignmentIdentityStops, alignmentColorKeys } from '../core/aligned-sequence-colors.js';
import { IMAGE_FONTS } from '../core/image-fonts.js';
import { colorOpacity } from '../core/image-colors.js';
import { colorLuminance } from '../core/plot-color-scale.js';
import { loadImageFonts, embedImageFonts } from './image-fonts.js';
import { createEditorSession } from './editor-session.js';
import { downloadText } from './file-download.js';
import { downloadSvgAsPng } from './svg-export.js';
import { createColorPicker } from './color-picker.js';
import { createControlHelp } from './control-help.js';
import { installVisualInspection } from './visual-inspection.js';
import { createImageEditorNavigation } from './image-editor-navigation.js';
import { setUiText } from './set-ui-text.js';
import { copyTextWithFeedback } from './copy-feedback.js';

const make = (tag,text,cls) => {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
function inspectionCellShade(fill,paper) {
  const alpha=colorOpacity(fill),paperAlpha=colorOpacity(paper);
  const channels=[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16)*alpha
    +(parseInt(paper.slice(i,i+2),16)*paperAlpha+255*(1-paperAlpha))*(1-alpha));
  const hex=values=>'#'+values.map(value=>Math.round(value).toString(16).padStart(2,'0')).join('');
  const target=colorLuminance(hex(channels))<.18?255:0;
  return hex(channels.map(value=>value*.78+target*.22));
}
const colourModeHelp = protein => [
  'Percentage identity: show how often letters match at each aligned position. Choose grayscale or a colour palette, then stepped bands or a continuous scale.',
  protein ? 'Residue type: give each amino acid or chemical class a colour. The same residue keeps its colour across the alignment.' : 'Base type: give each base or purine/pyrimidine class a colour. The same base keeps its colour across the alignment.',
  ...(protein ? ['ClustalX profile: combine amino acid type with the composition of each column. A residue can receive different colours in different columns.'] : []),
  'Reference comparison: highlight matches and substitutions against one chosen sequence. Letters opposite a gap in the reference have a separate colour.',
  'Uniform colour: use the Letters and Cell background colours for every position.'
].join('\n\n');
const identityRuleHelp = [
  'For a column containing A, A, A, G:',
  'Consensus matches: the three As use 75% identity; G stays unshaded. Equally frequent letters are all included in a tie.',
  'Whole column: A and G all use the same 75% identity shade.',
  'By own frequency: A uses 75% and G uses 25%.',
  'Stepped cutoffs or the continuous scale convert these percentages to colours. Only exact matching letters count toward identity. Gaps never receive identity shading.'
].join('\n\n');
let measurement;
function measure(text,font,size) {
  measurement ??= document.createElement('canvas').getContext('2d');
  measurement.font=`400 ${size}px ${IMAGE_FONTS[font].family}`;
  measurement.fontKerning='none';
  return measurement.measureText(text).width;
}
const css = `
.asv-editor{border:1px solid var(--app-output-border);border-radius:8px;overflow:hidden;container-type:inline-size;min-width:0;color:var(--app-output-text);font-size:.75rem}
.asv-header{background:var(--app-output-surface-strong);padding:.55rem .7rem;border-bottom:1px solid var(--app-output-border)}
.asv-titlebar,.asv-footer,.asv-actions,.asv-row-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.asv-titlebar{justify-content:space-between;margin-bottom:8px}.asv-titlebar strong{font-size:14px}.asv-actions button,.asv-row-actions button{width:auto;min-height:30px}
.asv-workspace{display:grid;grid-template-columns:minmax(0,1fr) 260px;min-width:0}.asv-stage{min-width:0;display:flex;flex-direction:column;background:var(--app-output-surface-strong)}
.asv-viewport{height:580px;min-height:240px;overflow:auto;position:relative;padding:22px;box-sizing:border-box;touch-action:none;overscroll-behavior:auto;outline-offset:-3px}
.asv-artwork{margin:0 auto;flex:none;line-height:0;user-select:none;-webkit-user-select:none}.asv-artwork svg{display:block;width:100%;height:auto;max-width:none;background:transparent;user-select:none;-webkit-user-select:none}
.asv-artwork [data-sms3-inspection-active]{filter:none!important}.asv-artwork [data-sms3-inspection-active]>rect{fill:var(--asv-inspection-fill)!important;stroke:none!important}
.asv-footer{padding:7px 10px;border-top:1px solid var(--app-output-border);font-size:11px;justify-content:space-between}.asv-footer label{display:flex;align-items:center;gap:5px;margin:0}.asv-footer select{width:auto;max-width:120px;min-height:26px;padding:2px}
.asv-panel{border-left:1px solid var(--app-output-border);padding:10px;min-width:0;max-height:650px;overflow:auto}.asv-tabs{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:.2rem;position:sticky;top:-10px;background:var(--app-output-surface-soft);padding:.18rem;margin-bottom:.65rem;border:1px solid var(--app-output-border-strong);border-radius:8px;z-index:2}.asv-editor .asv-tabs button{font-size:.68rem;line-height:1.2;padding:.35rem .2rem;min-height:1.85rem;min-width:0;overflow-wrap:anywhere;border-color:transparent;background:transparent;color:var(--app-output-muted)}.asv-editor .asv-tabs button[aria-selected=true]{border-color:var(--app-output-accent);color:var(--app-output-accent-strong);background:var(--app-output-accent-soft)}
.asv-fields{display:grid;gap:9px}.asv-field{display:grid;gap:3px;margin:0!important;font-size:12px}.asv-field>span{font-weight:500}.asv-field input,.asv-field select,.asv-field textarea{width:100%;max-width:none;min-width:0;box-sizing:border-box;font:inherit;font-size:12px;min-height:29px;padding:5px 7px;color:var(--app-output-text);background:var(--app-output-surface);border:1px solid var(--app-output-border);border-radius:5px}.asv-field input[type=checkbox]{width:15px;min-height:15px;margin:0}.asv-field:has(input[type=checkbox]){display:flex;align-items:center;gap:7px}.asv-field small,.asv-help{font-size:11px;line-height:1.45;color:var(--app-output-muted);margin:0}
.asv-fields details{border-top:1px solid var(--app-output-border);padding-top:8px}.asv-fields details>summary{font-size:12px;font-weight:600;cursor:pointer;margin-bottom:8px}.asv-fields details>.asv-fields{padding-bottom:5px}.asv-palette{display:grid;grid-template-columns:1fr 1fr;gap:7px}.asv-palette .sms3-color-field{min-width:0;font-size:11px}
.asv-palette-classes,.asv-palette-conservation{grid-template-columns:1fr}.asv-palette-conservation{gap:6px}.asv-palette-conservation .sms3-color-field{font-size:12px}.asv-gradient{height:18px;border-radius:3px}.asv-gradient-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--app-output-muted)}
.asv-caption{display:flex;align-items:center;gap:5px;min-width:0}.asv-caption>label{font:inherit;margin:0}.asv-caption>.option-label{flex:none}.asv-editor button.option-help,.asv-editor button.option-help:hover{display:inline-grid;place-items:center;width:15px;height:15px;min-height:15px;min-width:15px;max-width:15px;max-height:15px;padding:0;border:1px solid var(--app-output-border-strong);border-radius:50%;font-size:10px;line-height:1;background:transparent;color:var(--app-output-muted);cursor:help}.asv-editor button.option-help:hover{color:var(--app-output-accent);border-color:var(--app-output-accent)}.asv-editor button.sms3-color-trigger:disabled{cursor:default}
.asv-editor .app-control-tooltip{white-space:pre-line;max-height:calc(100dvh - 16px);overflow-y:auto;box-sizing:border-box}
.asv-description{font-size:12px;line-height:1.5;padding:10px 12px;border-top:1px solid var(--app-output-border)}.asv-description summary{cursor:pointer;font-weight:600}.asv-description p{margin:8px 0 0}.asv-message{padding:0 12px;font-size:12px;color:var(--warning,#c65a20)}.asv-message:not(:empty){padding-top:8px;padding-bottom:8px}.asv-range-note{font-size:11px;color:var(--app-output-muted);padding:6px 10px;border-bottom:1px solid var(--app-output-border)}
@container(max-width:720px){.asv-workspace{grid-template-columns:1fr}.asv-panel{border-left:0;border-top:1px solid var(--app-output-border);max-height:420px}.asv-viewport{height:380px}.asv-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.asv-fields details,.asv-fields>.asv-help,.asv-fields>.asv-row-actions,.asv-fields>.asv-palette,.asv-fields>textarea{grid-column:1/-1}.asv-tabs{max-width:430px}.asv-fields details>.asv-fields{grid-template-columns:1fr}}
@container(max-width:400px){.asv-fields{grid-template-columns:1fr}.asv-titlebar{align-items:flex-start}.asv-viewport{padding:10px;height:320px}}
`;

export async function renderAlignedSequenceViewer(container,source,editorDocument,{preview=false}={}) {
  let disposed=false,session,inspection,nav,observer;
  const pickers=[],helps=[],controller=new AbortController();
  const clean=()=>{disposed=true;inspection?.();nav?.dispose();observer?.disconnect();session?.dispose();pickers.forEach(p=>p.dispose());helps.forEach(h=>h.dispose());controller.abort();};
  container._sms3VisualCleanup=clean;
  const loading=make('p','Loading alignment fonts…');loading.setAttribute('role','status');container.append(loading);
  try {await loadImageFonts();} catch(error) {if(!disposed)loading.textContent=error.message;return;}
  if(disposed)return;
  const model=validateAlignedSequences(source.model);
  let state=structuredClone(editorDocument?.state?.alignment??createAlignedSequenceSettings(model));
  validateAlignedSequenceSettings(model,state);
  let layout,selectedRow=state.rows[0].id,activeTab='style';
  const expandedSections=new Map();
  const root=make('section',undefined,'asv-editor');root.setAttribute('aria-label','Aligned Sequence Viewer');
  root.append(make('style',css));
  const header=make('header',undefined,'asv-header'),titlebar=make('div',undefined,'asv-titlebar'),actions=make('div',undefined,'asv-actions tti-exports'),history=make('div');
  titlebar.append(make('strong','Aligned sequences'),actions);header.append(titlebar,history);
  const message=make('div','','asv-message');message.setAttribute('role','status');
  const workspace=make('div',undefined,'asv-workspace'),stage=make('div',undefined,'asv-stage'),panel=make('div',undefined,'asv-panel');
  const rangeNote=make('div','','asv-range-note'),viewport=make('div',undefined,'asv-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','Alignment figure preview');
  const artwork=make('div',undefined,'asv-artwork'),drawing=make('div');
  drawing.style.position='relative';artwork.append(drawing);
  viewport.append(artwork);
  const footer=make('div',undefined,'asv-footer'),dimensions=make('span'),zoomLabel=make('label'),zoom=make('select');zoom.setAttribute('aria-label','Preview size');
  for(const [value,label] of [['fit','Fit width'],['.5','50%'],['1','100%'],['1.5','150%'],['2','200%']])zoom.add(new Option(label,value));
  zoomLabel.append(make('span','Preview'),zoom);footer.append(dimensions,zoomLabel);stage.append(rangeNote,viewport,footer);
  const tabs=make('div',undefined,'asv-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Alignment settings');
  const fields=make('div',undefined,'asv-fields');fields.setAttribute('role','tabpanel');panel.append(tabs,fields);
  workspace.append(stage,panel);
  const description=make('details',undefined,'asv-description'),descriptionText=make('p');description.append(make('summary','Figure description'),descriptionText);
  root.append(header,message,workspace,description);loading.replaceWith(root);
  const button=(parent,label,action)=>{const b=make('button',label);b.type='button';b.addEventListener('click',action);parent.append(b);return b;};
  const setMessage=value=>setUiText(message,value);
  const fontsForExport=()=>({items:layout.fontKeys.map(font=>({font})),annotations:[],style:{font:state.font}});
  const exportSvg=()=>embedImageFonts(layout.svg,fontsForExport());
  const runAction=async action=>{try{await action();setMessage('');}catch(error){setMessage(error.message);}};
  const exportButton=(label,name,icon,action)=>{
    const b=button(actions,'',()=>runAction(action));b.className='tti-icon-button';b.setAttribute('aria-label',name);b.title=name;
    b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;b.append(make('span',label));return b;
  };
  const downloadIcon='<path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/>';
  exportButton('PNG','Download PNG',downloadIcon,()=>downloadSvgAsPng(exportSvg(),'aligned-sequence-viewer.png',{background:null,maxPixels:64_000_000}));
  exportButton('SVG','Download SVG',downloadIcon,()=>downloadText(exportSvg(),'aligned-sequence-viewer.svg','image/svg+xml;charset=utf-8'));
  exportButton('Print / save PDF','Print / save PDF','<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6zM17 12h1"/>',printFigure);
  const descriptionActions=make('div',undefined,'asv-row-actions');description.append(descriptionActions);
  button(descriptionActions,'Copy description',event=>copyTextWithFeedback(event.currentTarget,layout.description));
  button(descriptionActions,'Download description',()=>downloadText(layout.description,'aligned-sequence-viewer-description.txt','text/plain'));
  function previewSize() {
    if(!layout)return;
    const pixels=layout.width*96/72;
    artwork.style.width=`${zoom.value==='fit'?Math.max(100,viewport.clientWidth-44):pixels*Number(zoom.value)}px`;
  }
  function draw() {
    const next=renderAlignedSequenceSvg(model,state,measure);
    const nextDrawing=document.createElement('div');nextDrawing.innerHTML=next.svg;
    // Shade only the preview background; letters and exported SVG stay intact.
    const shades=new Map();
    for(const background of nextDrawing.querySelectorAll('[data-alignment-column]>rect')) {
      const fill=background.getAttribute('fill');
      if(!shades.has(fill))shades.set(fill,inspectionCellShade(fill,state.colors.paper));
      background.style.setProperty('--asv-inspection-fill',shades.get(fill));
    }
    inspection?.();
    drawing.replaceChildren(...nextDrawing.childNodes);layout=next;
    inspection=installVisualInspection(drawing);
    previewSize();
    setUiText(dimensions,`${layout.widthMm.toFixed(1)} × ${layout.heightMm.toFixed(1)} mm · ${layout.columnsPerLine} columns/line`);
    setUiText(rangeNote,`${layout.visibleRows}/${model.records.length} sequences · ${model.length} aligned positions · ${model.alphabet.toUpperCase()}`);
    setUiText(descriptionText,layout.description);
  }
  function change(update,{rebuild=false}={}) {
    const previous=structuredClone(state);
    try {update();draw();setMessage('');if(rebuild)renderSettings();session?.changed('Alignment settings');}
    catch(error){state=previous;setMessage(`Change not applied: ${error.message}`);renderSettings();}
  }
  function field(parent,label,key,{choices,type='number',help,min,max,step=1,value,onChange}={}) {
    const wrap=make('div',undefined,'asv-field'),heading=make('div',undefined,'asv-caption'),caption=make('label',label),input=make(choices?'select':'input');
    input.id=`asv-${key}-${crypto.randomUUID()}`;caption.htmlFor=input.id;input.dataset.focusKey=key;
    heading.append(caption);
    if(help){const callout=createControlHelp(label,help);helps.push(callout);heading.append(callout.element);}
    input.setAttribute('aria-label',label);
    if(choices)for(const [v,l] of choices)input.add(new Option(l,v));else input.type=type;
    if(type==='number'&&!choices){if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;input.step=step;}
    const val=value??state[key];if(type==='checkbox'&&!choices)input.checked=val;else input.value=val;
    wrap.append(heading,input);parent.append(wrap);
    input.addEventListener('change',()=>{const val=choices?input.value:type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;if(onChange)onChange(val);else change(()=>{state[key]=val;});});
    return input;
  }
  function details(parent,label,open=false){const node=make('details');node.open=expandedSections.get(label)??open;node.dataset.section=label;node.append(make('summary',label));const content=make('div',undefined,'asv-fields');node.append(content);parent.append(node);return content;}
  function color(parent,label,key,value,{disabled=false,description}={}){
    const picker=createColorPicker(label,value);pickers.push(picker);parent.append(picker.element);
    const trigger=picker.element.querySelector('.sms3-color-trigger');trigger.disabled=disabled;
    if(description)trigger.setAttribute('aria-describedby',description);
    picker.input.addEventListener('input',()=>change(()=>{state.colors[key]=picker.input.value;}));
  }
  function renderSettings() {
    for(const section of fields.querySelectorAll('details'))expandedSections.set(section.dataset.section,section.open);
    const focused=fields.contains(document.activeElement)?document.activeElement.dataset.focusKey:null;
    const scroll=panel.scrollTop;pickers.splice(0).forEach(p=>p.dispose());helps.splice(0).forEach(h=>h.dispose());fields.replaceChildren();
    for(const tab of tabs.children)tab.setAttribute('aria-selected',String(tab.dataset.tab===activeTab));
    const protein=model.alphabet==='protein';
    if(activeTab==='style') {
      const groupFor=scheme=>IDENTITY_SCHEMES.includes(scheme)||scheme==='conservation'?'identity':REFERENCE_SCHEMES.includes(scheme)?'reference':['clustalx','plain'].includes(scheme)?scheme:'residue';
      const group=groupFor(state.scheme), graded=IDENTITY_SCHEMES.includes(state.scheme);
      field(fields,'Colour by','colourBy',{value:group,choices:[['identity','Percentage identity'],['residue',protein?'Residue type':'Base type'],...(protein?[['clustalx','ClustalX profile']]:[]),['reference','Reference comparison'],['plain','Uniform colour']],help:colourModeHelp(protein),onChange:value=>change(()=>{state.scheme={identity:'identity',residue:protein?'classes-okabe-ito':'nucleotide',clustalx:'clustalx',reference:'reference',plain:'plain'}[value];},{rebuild:true})});
      const schemes=Object.entries(ALIGNMENT_SCHEMES).filter(([key])=>groupFor(key)===group&&(protein?!NUCLEOTIDE_SCHEMES.includes(key):!PROTEIN_SCHEMES.includes(key))).map(([key,label])=>[key,IDENTITY_PALETTES[key]??({conservation:'Black and white',reference:'Colour','reference-gray':'Grayscale'}[key]??label)]);
      if(schemes.length>1)field(fields,'Colour scheme','scheme',{choices:schemes,help:state.scheme==='conservation'?'Black and white uses one shade for each letter whose own frequency reaches the Identity cutoff. Other letters use Unshaded. At 100%, only fully identical columns qualify when gaps are included.\n\nChoose Grayscale for three adjustable identity bands or a continuous scale.':graded?'Grayscale runs from light at low identity to dark at high identity. Jalview blue and the other palettes provide ready-made colour scales. Changing between these palettes keeps the same identity calculation.\n\nBlack and white uses a single identity cutoff. Conservation colours lets you edit the selected scheme’s shades; Reset scheme colours restores its defaults.':ALIGNMENT_SCHEME_HELP[state.scheme],onChange:value=>change(()=>{state.scheme=value;},{rebuild:true})});
      if(graded)field(fields,'Shading','identityMode',{value:state.identityMode??'steps',choices:[['steps','Stepped'],['continuous','Continuous']],help:'Stepped: use three distinct shades above the low, medium and high cutoffs in Advanced identity settings. A percentage exactly at a cutoff stays in the lower band.\n\nContinuous: use a smooth colour scale from 0% to 100%. Values below Minimum identity stay unshaded.\n\nIdentity shading rule determines which letters receive each percentage. For example, with Consensus matches, A/A/A/G gives the As 75% and leaves G unshaded.',onChange:value=>change(()=>{state.identityMode=value;},{rebuild:true})});
      if(state.scheme==='conservation')field(fields,'Identity cutoff (%)','threshold',{min:0,max:100,help:'Shade each letter when its own frequency in that column is at least this percentage. Gaps remain unshaded. At 100%, only identical columns without counted gaps qualify.'});
      if(group!=='plain') {
        const residueColors=details(fields,group==='identity'?'Conservation colours':protein?'Residue colours':'Base colours',true);
        if(graded&&state.identityMode==='continuous') {
          const ramp=make('div'),gradient=make('div',undefined,'asv-gradient'),labels=make('div',undefined,'asv-gradient-labels');
          gradient.style.background=`linear-gradient(to right,${alignmentIdentityStops(state.scheme).join(',')})`;
          gradient.setAttribute('role','img');gradient.setAttribute('aria-label',`${IDENTITY_PALETTES[state.scheme]} identity scale, 0 to 100 percent`);
          labels.append(make('span','0%'),make('span','100%'));ramp.append(gradient,labels);residueColors.append(ramp);
        }
        const palette=make('div',undefined,`asv-palette${group==='identity'?' asv-palette-conservation':state.scheme==='zappo'||state.scheme.startsWith('classes-')?' asv-palette-classes':''}`);residueColors.append(palette);
        for(const entry of alignmentColorKeys(state.scheme,model.alphabet,state))color(palette,entry.symbols?`${entry.label} (${entry.symbols})`:entry.label,`${state.scheme}:${entry.key}`,state.colors[`${state.scheme}:${entry.key}`]??(['other','gap'].includes(entry.key)?state.colors.cell:entry.color));
        const reset=make('div',undefined,'asv-row-actions');residueColors.append(reset);
        button(reset,'Reset scheme colours',()=>change(()=>{for(const key of Object.keys(state.colors))if(key.startsWith(`${state.scheme}:`))delete state.colors[key];},{rebuild:true}));
      }
      if(group!=='plain') {
        if(state.paint!=='letters')field(fields,'Automatic letter contrast','automaticContrast',{type:'checkbox',value:state.paint==='both'&&state.automaticContrast,help:'The colour scheme is applied to cell backgrounds. This setting chooses light or dark letters so they remain readable on each background.\n\nTurn it off to use your fixed Letters colour under Figure colours. To colour the letters themselves, enable Colour letters instead under Advanced colour settings.',onChange:value=>change(()=>{state.paint='both';state.automaticContrast=value;},{rebuild:true})});
        else fields.append(make('p','Colours are applied to letters; cell backgrounds stay uniform.','asv-help'));
      }
      if(COLUMN_STAT_SCHEMES.includes(state.scheme)) {
        const calculation=details(fields,group==='identity'?'Advanced identity settings':'Column settings');
        if(graded) {
          const target=state.identityScope??'consensus';
          field(calculation,'Identity shading rule','identityScope',{value:target,choices:[['consensus','Consensus matches'],['column','Whole column'],['residue','By own frequency']],help:identityRuleHelp,onChange:value=>change(()=>{state.identityScope=value;},{rebuild:true})});
          if(state.identityMode==='continuous')field(calculation,'Minimum identity (%)','identityMinimum',{value:state.identityMinimum??0,min:0,max:100,step:.1,help:'Lower values are unshaded. The palette always spans 0–100%.'});
          else {
            for(const [i,label] of ['Low cutoff (%)','Medium cutoff (%)','High cutoff (%)'].entries())field(calculation,label,`identityCutoff${i}`,{value:(state.identityCutoffs??DEFAULT_IDENTITY_CUTOFFS)[i],min:0,max:99.9,step:.1,help:['Values at or below this cutoff are unshaded. Higher values use the low shade until they pass the medium cutoff.','Values above this cutoff use the medium shade until they pass the high cutoff.','Values above this cutoff use the high shade. The three cutoffs must be in increasing order.'][i],onChange:value=>change(()=>{state.identityCutoffs=[...(state.identityCutoffs??DEFAULT_IDENTITY_CUTOFFS)];state.identityCutoffs[i]=value;},{rebuild:true})});
          }
        }
        field(calculation,'Gaps in percentages','gapPolicy',{choices:[['include','Include gaps'],['exclude','Exclude gaps']],help:group==='identity'?'Include gaps counts every sequence in the percentage denominator. Exclude gaps counts only sequences with a letter at that position. For A, A, A, gap: A is 75% with gaps included and 100% with gaps excluded.':'Choose whether gaps count in the column percentages used by the ClustalX colouring rules.'});
        field(calculation,'Calculate colours from','calculationRows',{choices:[['all','All source sequences'],['visible','Visible sequences']],help:group==='identity'?'All source sequences keeps identity percentages unchanged when you hide rows. Visible sequences recalculates percentages using only rows shown in the figure.':'All source sequences keeps the ClustalX column profile unchanged when you hide rows. Visible sequences recalculates the profile using only rows shown in the figure.'});
      }
      if(REFERENCE_SCHEMES.includes(state.scheme))field(fields,'Reference sequence','reference',{choices:state.rows.map(row=>[row.id,row.label]),help:'Use this sequence for matches, substitutions and reference-gap colours. It remains the reference even if you hide its row in the figure.'});
      if(group!=='plain') {
        const placement=details(fields,'Advanced colour settings',state.paint==='letters');
        field(placement,'Colour letters instead','colourLetters',{type:'checkbox',value:state.paint==='letters',help:'Off: the selected scheme colours cell backgrounds. Automatic letter contrast controls the text colour.\n\nOn: the scheme colours the letters on a uniform Cell background. Automatic letter contrast is hidden because the scheme now determines letter colours. Unshaded letters and gaps use the Letters colour under Figure colours.',onChange:value=>change(()=>{if(state.paint==='backgrounds')state.automaticContrast=false;state.paint=value?'letters':'both';},{rebuild:true})});
      }
      const figureColors=details(fields,'Figure colours'),figurePalette=make('div',undefined,'asv-palette');figureColors.append(figurePalette);
      const autoLetters=group!=='plain'&&state.paint==='both'&&state.automaticContrast;
      const letterNote=autoLetters?make('p','Letters are set automatically for contrast. Turn off Automatic letter contrast to choose a fixed colour.','asv-help'):group!=='plain'&&state.paint==='letters'?make('p','Letters sets the colour for unshaded letters and gaps. Other letters use the selected scheme.','asv-help'):null;
      if(letterNote)letterNote.id=`asv-letter-note-${crypto.randomUUID()}`;
      for(const [key,label] of [['paper','Figure background'],['cell','Cell background'],['letter','Letters'],['label','Labels'],['ruler','Numbers / consensus']])color(figurePalette,label,key,state.colors[key],key==='letter'?{disabled:autoLetters,description:letterNote?.id}:{});
      if(letterNote)figureColors.append(letterNote);
      const type=details(fields,'Fonts');
      field(type,'Sequence font','font',{choices:Object.entries(IMAGE_FONTS).filter(([,f])=>f.monospace).map(([key,f])=>[key,f.label])});
      field(type,'Sequence size (pt)','fontSize',{min:4,max:40,step:.5,help:'Physical letter size in the exported figure. Changing figure width rewraps the alignment and keeps this font size. Preview zoom changes only its size on screen.'});
      field(type,'Bold sequence letters','bold',{type:'checkbox'});
      field(type,'Label font','labelFont',{choices:Object.entries(IMAGE_FONTS).map(([key,f])=>[key,f.label])});
      field(type,'Label size (pt)','labelSize',{min:4,max:40,step:.5});
    } else if(activeTab==='layout') {
      field(fields,'Figure size','preset',{choices:[...Object.entries(ALIGNMENT_FIGURE_PRESETS).map(([key,p])=>[key,p.label]),['custom','Custom']],help:'Set the physical dimensions used by SVG, PNG and Print / save PDF. Single column is 89 mm wide. Presets rewrap the alignment while keeping your font sizes. Print at 100% scale to retain these dimensions.',onChange:value=>change(()=>{state.preset=value;if(ALIGNMENT_FIGURE_PRESETS[value]){Object.assign(state,ALIGNMENT_FIGURE_PRESETS[value]);state.columnsPerLine=0;}},{rebuild:true})});
      field(fields,'Units','units',{choices:[['mm','Millimetres'],['in','Inches']],onChange:value=>change(()=>{state.units=value;},{rebuild:true})});
      const unit=state.units==='in'?25.4:1;
      field(fields,`Width (${state.units})`,'widthMm',{value:state.widthMm/unit,min:30/unit,max:1000/unit,step:.01,onChange:value=>change(()=>{state.widthMm=value*unit;state.preset='custom';},{rebuild:true})});
      field(fields,'Automatic height','autoHeight',{type:'checkbox',value:state.heightMm===0,help:'Fit the figure height to all alignment blocks, spacing and margins. Changing the width may wrap the alignment onto more lines and increase the height. Font sizes stay fixed.\n\nTurn this off to enter a fixed height. If the alignment needs more room, the viewer reports the required height.',onChange:value=>change(()=>{state.heightMm=value?0:Math.ceil(layout.heightMm);},{rebuild:true})});
      if(state.heightMm)field(fields,`Height (${state.units})`,'heightMm',{value:state.heightMm/unit,min:1/unit,max:10000/unit,step:.01,onChange:value=>change(()=>{state.heightMm=value*unit;})});
      field(fields,'Residues per line','columnsPerLine',{min:0,max:1000,help:'0 fits complete columns to the figure width.'});
      field(fields,'Group every','groupSize',{min:0,max:100,help:'0 removes spacing between residue groups.'});
      field(fields,'Row spacing','rowSpacing',{min:1,max:3,step:.1});
      field(fields,'Block spacing (pt)','blockSpacing',{min:0,max:200});
      field(fields,'Margins (pt)','margin',{min:0,max:100});
      field(fields,'Figure title','title',{type:'text'});field(fields,'Title size (pt)','titleSize',{min:4,max:72});
      field(fields,'Show alignment ruler','showRuler',{type:'checkbox',help:'Show aligned column numbers above each block. Every column counts, including gap positions.'});field(fields,'Show sequence numbers','showCoordinates',{type:'checkbox',help:'Show residue numbers at the ends of each sequence row. Gaps are skipped. Set each sequence’s Starting number in the Sequences tab.'});field(fields,'Show CLUSTAL consensus','showConsensus',{type:'checkbox',help:protein?'Add a consensus line: * marks identical residues, : strong similarity and . weaker similarity under CLUSTAL rules. This line is independent of the colouring scheme.':'Add a consensus line: * marks identical bases. This line is independent of the colouring scheme.'});
      fields.append(make('p','SVG and PNG use these physical dimensions. PNG is 600 DPI. Preview zoom changes only the screen view.','asv-help'));
    } else if(activeTab==='sequences') {
      const row=state.rows.find(row=>row.id===selectedRow)??state.rows[0];selectedRow=row.id;
      field(fields,'Sequence','row',{choices:state.rows.map((r,i)=>[r.id,`${i+1}: ${r.label}`]),value:row.id,onChange:value=>{selectedRow=value;renderSettings();}});
      field(fields,'Display name','label',{type:'text',value:row.label,onChange:value=>change(()=>{row.label=value;})});
      field(fields,'Show sequence','visible',{type:'checkbox',value:row.visible,onChange:value=>change(()=>{row.visible=value;})});
      field(fields,'Starting number','start',{value:row.start,min:-1e9,max:1e9,help:'Number of the first letter in this sequence. Gaps are skipped.',onChange:value=>change(()=>{row.start=value;})});
      const order=make('div',undefined,'asv-row-actions');fields.append(order);
      for(const [label,offset]of[['Move up',-1],['Move down',1]])button(order,label,()=>change(()=>{const i=state.rows.indexOf(row),j=i+offset;if(j>=0&&j<state.rows.length)[state.rows[i],state.rows[j]]=[state.rows[j],state.rows[i]];},{rebuild:true}));
      button(fields,'Reset sequence names and numbers',()=>change(()=>{state.rows=createAlignedSequenceSettings(model).rows;},{rebuild:true}));
      fields.append(make('p','Names, numbering and row order change the figure only.','asv-help'));
    }
    if(focused)fields.querySelector(`[data-focus-key="${focused}"]`)?.focus({preventScroll:true});
    panel.scrollTop=scroll;
  }
  for(const [key,label]of[['style','Style'],['layout','Layout'],['sequences','Sequences']]){const b=button(tabs,label,()=>{activeTab=key;renderSettings();});b.dataset.tab=key;b.setAttribute('role','tab');}
  async function printFigure() {
    const frame=make('iframe');frame.title='Alignment print document';frame.style.cssText='position:fixed;left:-10000px;width:1000px;height:800px';document.body.append(frame);
    const doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html><head><title>Aligned Sequence Viewer</title></head><body></body></html>');doc.close();
    const printStyle=doc.createElement('style');printStyle.textContent=`@page{size:${layout.widthMm}mm ${layout.heightMm}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${layout.widthMm}mm;height:${layout.heightMm}mm}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}`;
    doc.head.append(printStyle);doc.body.innerHTML=exportSvg();await doc.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
    controller.signal.addEventListener('abort',()=>frame.remove(),{once:true});
    frame.contentWindow.focus();frame.contentWindow.print();
  }
  draw();renderSettings();
  session=createEditorSession({host:root,toolbar:history,tool:'aligned-sequence-viewer',source,read:()=>({alignment:state}),apply:value=>{state=structuredClone(value.alignment);draw();renderSettings();},initial:editorDocument?.state,persist:!preview});
  zoom.addEventListener('change',previewSize);
  observer=new ResizeObserver(previewSize);observer.observe(viewport);
  nav=createImageEditorNavigation(viewport,{image:()=>drawing.querySelector('svg'),width:()=>layout.width*96/72,zoom,redraw:previewSize,editable:event=>Boolean(event.target.closest?.('[data-alignment-column]')),clearSelection:()=>{},cancelEdit:()=>{}});
  container._sms3VisualCleanup=clean;
}
