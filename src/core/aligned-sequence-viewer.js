import { ALIGNED_SEQUENCE_LIMITS, validateAlignedSequences, isAlignmentGap } from './aligned-sequences.js';
import { ALIGNMENT_SCHEMES, ALIGNMENT_SCHEME_HELP, PROTEIN_SCHEMES, NUCLEOTIDE_SCHEMES, COLUMN_STAT_SCHEMES, REFERENCE_SCHEMES, IDENTITY_SCHEMES, DEFAULT_IDENTITY_CUTOFFS, alignmentColumnStats, alignmentCellColor, alignmentColorKeys } from './aligned-sequence-colors.js';
import { IMAGE_FONTS } from './image-fonts.js';
import { makeClustalConsensus } from './clustal-consensus.js';

export const ALIGNMENT_FIGURE_PRESETS = Object.freeze({
  original: { label: 'Original', widthMm: 240, heightMm: 0 },
  single: { label: 'Single column · 89 mm', widthMm: 89, heightMm: 0 },
  double: { label: 'Double column · 183 mm', widthMm: 183, heightMm: 0 },
  slide: { label: 'Presentation · 16:9', widthMm: 338.666667, heightMm: 190.5 },
  poster: { label: 'Poster figure · 300 × 300 mm', widthMm: 300, heightMm: 300 }
});
export function createAlignedSequenceSettings(model) {
  return { version: 1, scheme: 'identity', paint: 'both', automaticContrast: true, threshold: 100,
    identityMode:'steps', identityScope:'consensus', identityCutoffs:[...DEFAULT_IDENTITY_CUTOFFS], identityMinimum:0,
    gapPolicy: 'include', calculationRows: 'all', reference: model.records[0].id,
    colors: { paper:'#ffffff', cell:'#ffffff', letter:'#111111', label:'#17212b', ruler:'#5b6470' },
    preset: 'double', units: 'mm', fontSize: 9, labelSize: 8, titleSize: 12, ...ALIGNMENT_FIGURE_PRESETS.double, title: '', font: 'plexmono', labelFont: 'sans', bold: false,
    margin: 12, rowSpacing: 1.4, blockSpacing: 18, groupSize: 0, columnsPerLine: 0,
    showRuler: false, showCoordinates: true, showConsensus: false,
    rows: model.records.map(row => ({ id:row.id, label:row.title, visible:true, start:row.start, step:row.step })) };
}
export function validateAlignedSequenceSettings(model, state) {
  const fail = message => { throw new Error(message); };
  if (!state || state.version !== 1 || !Object.hasOwn(ALIGNMENT_SCHEMES,state.scheme)) fail('Unsupported alignment settings.');
  if (PROTEIN_SCHEMES.includes(state.scheme) && model.alphabet !== 'protein') fail('This colour scheme requires a protein alignment.');
  if (NUCLEOTIDE_SCHEMES.includes(state.scheme) && model.alphabet === 'protein') fail('This colour scheme requires a nucleotide alignment.');
  for (const [key, allowed] of Object.entries({ units:['mm','in'], paint:['letters','backgrounds','both'], gapPolicy:['include','exclude'], calculationRows:['all','visible'] })) if (!allowed.includes(state[key])) fail(`Invalid ${key} setting.`);
  for (const [key,allowed] of Object.entries({identityMode:['steps','continuous'],identityScope:['consensus','column','residue']})) if (state[key] !== undefined && !allowed.includes(state[key])) fail(`Invalid ${key} setting.`);
  if (state.identityCutoffs !== undefined && (!Array.isArray(state.identityCutoffs) || state.identityCutoffs.length !== 3 || state.identityCutoffs.some((value,i,all)=>typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 100 || (i>0 && value<=all[i-1])))) fail('Identity cutoffs must increase from low to high, between 0% and less than 100%.');
  if (state.identityMinimum !== undefined && (typeof state.identityMinimum !== 'number' || !Number.isFinite(state.identityMinimum) || state.identityMinimum < 0 || state.identityMinimum > 100)) fail('Minimum identity must be between 0% and 100%.');
  if (!Object.hasOwn(IMAGE_FONTS,state.font) || !IMAGE_FONTS[state.font].monospace || !Object.hasOwn(IMAGE_FONTS,state.labelFont)) fail('Choose an available sequence and label font.');
  for (const [key,min,max] of [['threshold',0,100],['widthMm',30,1000],['heightMm',0,10000],['fontSize',4,40],['labelSize',4,40],['titleSize',4,72],['margin',0,100],['rowSpacing',1,3],['blockSpacing',0,200],['groupSize',0,100],['columnsPerLine',0,1000]]) {
    if (typeof state[key] !== 'number' || !Number.isFinite(state[key]) || state[key] < min || state[key] > max) fail(`Invalid ${key}; use ${min}–${max}.`);
  }
  for (const key of ['groupSize','columnsPerLine']) if (!Number.isInteger(state[key])) fail(`${key} must be a whole number.`);
  for (const key of ['automaticContrast','bold','showRuler','showCoordinates','showConsensus']) if (typeof state[key] !== 'boolean') fail(`Invalid ${key}.`);
  if (typeof state.title !== 'string' || state.title.length > 200 || /[\r\n\u0000-\u001f]/.test(state.title)) fail('Use a one-line title of at most 200 characters.');
  if (!state.colors || typeof state.colors !== 'object' || Array.isArray(state.colors) || Object.keys(state.colors).length > 400) fail('Invalid alignment colours.');
  for (const key of ['paper','cell','letter','label','ruler']) if (!state.colors[key]) fail('Missing alignment colours.');
  if (Object.values(state.colors).some(color => typeof color !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color))) fail('Use hexadecimal colours with optional opacity.');
  // Removed review controls must not survive in the editable document.
  for (const key of ['similarityGroups','rangeStart','rangeEnd','firstColumn']) delete state[key];
  if (!Array.isArray(state.rows) || state.rows.length !== model.records.length || new Set(state.rows.map(row => row.id)).size !== model.records.length) fail('Sequence display rows must match the source.');
  const ids = new Set(model.records.map(row => row.id));
  if (!ids.has(state.reference)) fail('Choose a reference sequence.');
  for (const row of state.rows) {
    if (!ids.has(row.id) || typeof row.label !== 'string' || row.label.length > 500 || /[\r\n\u0000-\u001f]/.test(row.label) || typeof row.visible !== 'boolean' || !Number.isSafeInteger(row.start) || Math.abs(row.start) > 1e9 || ![1,-1].includes(row.step)) fail('Invalid sequence label, visibility, coordinate or direction.');
  }
  const visible = state.rows.filter(row => row.visible).length;
  if (!visible) fail('Show at least one sequence.');
  if (visible * model.length > ALIGNED_SEQUENCE_LIMITS.displayedCells) fail('The complete alignment exceeds the 20,000-cell figure limit (sequences × aligned length). Use a smaller input alignment.');
  return state;
}
export function validateAlignedSequenceDocument(doc) {
  if (!doc?.source?.model || !doc.state?.alignment) throw new Error('Missing aligned sequence source or settings.');
  validateAlignedSequences(doc.source.model);
  if (typeof doc.source.input !== 'string' || doc.source.input.length > ALIGNED_SEQUENCE_LIMITS.input) throw new Error('Invalid alignment source text.');
  validateAlignedSequenceSettings(doc.source.model, doc.state.alignment);
  return doc;
}
export function makeAlignedSequenceDocument(model, input = '', settings) {
  const state = settings ?? createAlignedSequenceSettings(model);
  const doc = { format:'sms3-editor-document',version:1,tool:'aligned-sequence-viewer',source:{model,input},state:{alignment:state} };
  return validateAlignedSequenceDocument(doc);
}
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const mmToPt = value => value * 72 / 25.4;
const ptToMm = value => value * 25.4 / 72;
const number = value => Number(value.toFixed(4));
export const alignmentTextMeasure = (text, font, size) => [...String(text)].reduce((n,c) => n + size * (IMAGE_FONTS[font]?.monospace ? .62 : /[MW@]/.test(c) ? .9 : /[il.,\s]/.test(c) ? .3 : .58),0);
function fitLabel(label, width, font, size, measure) {
  if (measure(label,font,size) <= width) return label;
  let low = 0, high = label.length;
  while (low < high) { const mid = Math.ceil((low+high)/2); if (measure(`${label.slice(0,mid)}…`,font,size) <= width) low = mid; else high = mid-1; }
  return `${label.slice(0,low)}…`;
}
export function alignedSequenceDescription(model, state) {
  const visible = state.rows.filter(r => r.visible).length;
  const scope = state.calculationRows === 'all' ? `all ${model.records.length} source sequences` : `${visible} visible sequences`;
  const placement=state.scheme==='plain'?'uniform letters and backgrounds':state.paint==='letters'?'letters':state.paint==='both'&&state.automaticContrast?'backgrounds with contrasting letters':'backgrounds with a fixed letter colour';
  const parts = [`${visible} of ${model.records.length} ${model.alphabet.toUpperCase()} sequences; complete alignment of ${model.length} positions.`, `${ALIGNMENT_SCHEMES[state.scheme]}; colours applied to ${placement}.`];
  parts.push(ALIGNMENT_SCHEME_HELP[state.scheme]);
  if (COLUMN_STAT_SCHEMES.includes(state.scheme)) {
    parts.push(`Column statistics use ${scope}; gaps ${state.gapPolicy === 'include' ? 'count in' : 'are excluded from'} the denominator. Ambiguous symbols are compared literally; they do not expand to possible residues.`);
    if (state.scheme === 'conservation') parts.push(`Only literal residue frequencies at ≥${state.threshold}% are shaded. Gaps, stops and question marks remain unshaded.`);
    if (IDENTITY_SCHEMES.includes(state.scheme)) {
      const target = state.identityScope ?? 'consensus';
      parts.push(target === 'consensus' ? 'Only residues matching a most frequent symbol in each column are shaded; tied consensus residues are treated equally.' : target === 'column' ? 'Every residue is shaded by the frequency of the most common symbol in its column.' : 'Each residue is shaded by its own literal frequency within its column.');
      parts.push(state.identityMode === 'continuous' ? `Continuous colours use the fixed 0–100% identity scale, with values below ${state.identityMinimum ?? 0}% unshaded.` : `Stepped colours use strict >${(state.identityCutoffs ?? DEFAULT_IDENTITY_CUTOFFS).join('%, >')}% identity cutoffs.`);
      parts.push('Gaps, stops and question marks remain unshaded.');
    }
  }
  if (REFERENCE_SCHEMES.includes(state.scheme)) parts.push(`Reference: ${state.rows.find(r => r.id === state.reference).label}. Substitutions compare literal symbols; residues opposite a reference gap use the reference-gap colour.`);
  parts.push(`Sequence numbers begin at each sequence’s Starting number and skip gaps. Imported reverse-strand sequences retain decreasing numbering.`);
  if (state.showRuler) parts.push('The optional alignment ruler counts positions from 1, including gaps.');
  if (state.showConsensus) parts.push(`CLUSTAL consensus uses ${scope}: * marks identical residues; protein : and . mark strong and weak similarity groups. Gaps break consensus.`);
  if (model.provenance) parts.push(model.provenance);
  return parts.join(' ');
}

export function renderAlignedSequenceSvg(model, state, measure = alignmentTextMeasure) {
  validateAlignedSequenceSettings(model,state);
  const width = mmToPt(state.widthMm), margin = state.margin, fs = state.fontSize;
  const modelIndex = new Map(model.records.map((r,i)=>[r.id,i]));
  const rows = state.rows.filter(r=>r.visible).map(r=>({...r,index:modelIndex.get(r.id)}));
  const all = model.records.map((_,i)=>i), calcRows = state.calculationRows === 'visible' ? rows.map(r=>r.index) : all;
  const start = 0, end = model.length;
  const stats = alignmentColumnStats(model,calcRows,start,end,state.gapPolicy);
  const coordinateMaps = new Map(rows.map(row => {
    let pos = row.start;
    return [row.id,Array.from(model.records[row.index].sequence, symbol => isAlignmentGap(symbol) ? null : (pos += row.step, pos-row.step))];
  }));
  const labelGap = Math.max(3,state.labelSize*.5), coordinateGap = labelGap;
  const maxCoordinateWidth = rows.reduce((max,row) => coordinateMaps.get(row.id).reduce((m,value) => value === null ? m : Math.max(m,measure(String(value),state.font,state.labelSize)),max),measure('—',state.font,state.labelSize));
  const coordWidth = state.showCoordinates ? maxCoordinateWidth + coordinateGap : 0;
  const maxLabel = Math.max(...rows.map(row=>measure(row.label,state.labelFont,state.labelSize)), state.showConsensus ? measure('Consensus',state.labelFont,state.labelSize) : 0);
  const labelWidth = Math.min(maxLabel, (width-2*margin)*.28);
  const sequenceX = margin+labelWidth+(labelWidth ? labelGap : 0)+coordWidth;
  const cellWidth = Math.max(...[...'MWACGT'].map(s=>measure(s,state.font,fs))) + fs*.18;
  const groupGap = fs*.4;
  const xOffset = i => i*cellWidth+(state.groupSize ? Math.floor(i/state.groupSize)*groupGap : 0);
  const available = width-margin-sequenceX-coordWidth;
  let fitColumns = Math.min(1000,end-start);
  while (fitColumns > 0 && xOffset(fitColumns-1)+cellWidth > available) fitColumns--;
  if (fitColumns < 1) throw new Error('The figure is too narrow for its labels, coordinates and font. Increase width or reduce font size.');
  const columns = state.columnsPerLine || fitColumns;
  if (Math.min(columns,end-start) > fitColumns) throw new Error(`Only ${fitColumns} residues fit per line at this size. Use automatic wrapping or increase figure width.`);
  const perLine = Math.min(columns,end-start,fitColumns);
  const rowHeight = fs*state.rowSpacing;
  const rulerHeight = state.showRuler ? Math.max(fs,state.labelSize)*1.6 : 0;
  const consensusHeight = state.showConsensus ? rowHeight : 0;
  const titleHeight = state.title ? state.titleSize*1.6 : 0;
  const blockHeight = rulerHeight+rows.length*rowHeight+consensusHeight;
  const blockCount = Math.ceil((end-start)/perLine);
  const naturalHeight = 2*margin+titleHeight+blockCount*blockHeight+(blockCount-1)*state.blockSpacing;
  const height = state.heightMm ? mmToPt(state.heightMm) : naturalHeight;
  if (height+0.01 < naturalHeight) throw new Error(`This layout needs ${ptToMm(naturalHeight).toFixed(1)} mm height. Enable automatic height, increase height, or reduce font size.`);
  if (height > mmToPt(10000)) throw new Error('The figure exceeds 10,000 mm height. Use a smaller input alignment.');
  const description = alignedSequenceDescription(model,state);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${number(state.widthMm)}mm" height="${number(ptToMm(height))}mm" viewBox="0 0 ${number(width)} ${number(height)}" role="img" aria-label="Aligned sequence figure" data-sms3-figure-family="aligned-sequence-viewer">`, `<desc>${xml(description)}</desc>`, `<rect width="${number(width)}" height="${number(height)}" fill="${state.colors.paper}"/>`];
  const text = (x,y,value,size=state.labelSize,font=state.labelFont,fill=state.colors.label,attrs='') => `<text x="${number(x)}" y="${number(y)}" font-family="${xml(IMAGE_FONTS[font].family)}" font-size="${size}" fill="${fill}" style="font-family:${xml(IMAGE_FONTS[font].family)};font-size:${size}px;fill:${fill};font-weight:${attrs.includes('font-weight="700"')?700:400};font-kerning:none;font-variant-ligatures:none" ${attrs}>${xml(value)}</text>`;
  if (state.title) {
    if (measure(state.title,state.labelFont,state.titleSize) > width-2*margin) throw new Error('The title does not fit. Shorten it, reduce title size, or increase figure width.');
    parts.push(text(margin,margin+state.titleSize,state.title,state.titleSize));
  }
  const reference = model.records[modelIndex.get(state.reference)].sequence;
  const prepared = {keys:alignmentColorKeys(state.scheme,model.alphabet,state)};
  const consensus = state.showConsensus ? makeClustalConsensus(calcRows.map(i=>model.records[i].sequence.slice(start,end)),model.alphabet === 'protein' ? 'protein' : 'dna-rna') : '';
  const blocks = [];
  for (let c0=start,block=0;c0<end;c0+=perLine,block++) {
    const c1=Math.min(end,c0+perLine), top=margin+titleHeight+block*(blockHeight+state.blockSpacing);
    const blockParts=[];
    if (state.showRuler) {
      let lastRight=-Infinity;
      for(let c=c0;c<c1;c++) if(c===c0 || (c+1)%10===0 || c===c1-1) {
        const label=String(c+1), tw=measure(label,state.font,state.labelSize), center=sequenceX+xOffset(c-c0)+cellWidth/2;
        const x=Math.min(width-margin-tw,Math.max(sequenceX,center-tw/2));
        if(x>lastRight+3) {blockParts.push(text(x,top+state.labelSize,label,state.labelSize,state.font,state.colors.ruler));lastRight=x+tw;}
      }
    }
    for (const [rowIndex,row] of rows.entries()) {
      const seq=model.records[row.index].sequence, map=coordinateMaps.get(row.id), y=top+rulerHeight+rowIndex*rowHeight;
      blockParts.push(`<g><title>${xml(row.label)} · ${xml(model.records[row.index].title)}</title>${text(margin,y+rowHeight*.74,fitLabel(row.label,labelWidth,state.labelFont,state.labelSize,measure))}</g>`);
      const positions=map.slice(c0,c1).filter(value=>value!==null);
      if(state.showCoordinates) {
        blockParts.push(text(sequenceX-coordinateGap,y+rowHeight*.74,positions[0]??'—',state.labelSize,state.font,state.colors.ruler,'text-anchor="end"'));
        blockParts.push(text(sequenceX+xOffset(c1-c0-1)+cellWidth+coordinateGap,y+rowHeight*.74,positions.at(-1)??'—',state.labelSize,state.font,state.colors.ruler));
      }
      for(let c=c0;c<c1;c++) {
        const color=alignmentCellColor(seq[c],stats[c-start],state,model.alphabet,reference[c],prepared), x=sequenceX+xOffset(c-c0);
        const title=`${row.label}; Symbol: ${seq[c]}; Alignment column: ${c+1}; Residue coordinate: ${map[c]??'gap'}; Shading: ${color.label}; Identical symbols: ${color.count}/${stats[c-start].denominator}; Gaps: ${stats[c-start].gaps}/${stats[c-start].total}`;
        blockParts.push(`<g data-alignment-column="${c+1}" data-sequence-id="${xml(row.id)}" data-shading="${color.key}" data-sms3-inspection-text="${xml(title)}"><title>${xml(title)}</title><rect x="${number(x)}" y="${number(y)}" width="${number(cellWidth)}" height="${number(rowHeight)}" shape-rendering="crispEdges" fill="${color.background}"/>${text(x+cellWidth/2,y+rowHeight*.74,seq[c],fs,state.font,color.foreground,`text-anchor="middle" font-weight="${state.bold?700:400}"`)}</g>`);
      }
    }
    if(state.showConsensus) {
      const y=top+rulerHeight+rows.length*rowHeight+rowHeight*.74;
      blockParts.push(text(margin,y,'Consensus'));
      for(let c=c0;c<c1;c++) if(consensus[c-start]!==' ') blockParts.push(text(sequenceX+xOffset(c-c0)+cellWidth/2,y,consensus[c-start],fs,state.font,state.colors.ruler,'text-anchor="middle"'));
    }
    const markup=blockParts.join(''); parts.push(`<g data-alignment-block="${block+1}">${markup}</g>`);
    blocks.push({top,height:blockHeight,markup,start:c0+1,end:c1});
  }
  parts.push('</svg>');
  return {svg:parts.join(''),width,height,widthMm:state.widthMm,heightMm:ptToMm(height),columnsPerLine:perLine,blocks,description,
    cells:rows.length*(end-start),fontKeys:[state.font,state.labelFont],visibleRows:rows.length};
}
