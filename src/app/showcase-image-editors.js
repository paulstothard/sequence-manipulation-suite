import { initialGraphicState } from '../core/graphic-editor.js';

// Ordinary editor state, consumed by the production renderer and document
// export. Showcase keeps these edits temporary; tool inputs stay unchanged.
export function makeShowcaseGraphicDocument(source) {
  const state = initialGraphicState();
  const annotation = (id, type, box, extra = {}) => ({
    id: `a-showcase-${id}`, type, ...box, color: '#00796b', fill: '#00796b',
    filled: false, font: 'inter', fontSize: 20, strokeWidth: 2, opacity: 1,
    text: '', ...extra,
  });
  state.annotations = source.kind === 'svg' ? [
    annotation('high-dose-outline', 'box', { x:613, y:130, w:134, h:298 }, { cornerRadius:10, color:'#a66b00' }),
    annotation('fold-change', 'label', { x:410, y:140, w:180, h:26 }, { text:'2.5× control', color:'#8a5900' }),
    annotation('fold-change-pointer', 'pointer', { x:550, y:160, w:59, h:24 }, { color:'#a66b00' }),
  ] : [
    annotation('error-label', 'label', { x:408, y:137, w:150, h:26 }, { text:'Mean ± SD' }),
    annotation('error-pointer', 'pointer', { x:460, y:171, w:0, h:39 }),
  ];
  return { format:'sms3-editor-document', version:1,
    tool:source.kind === 'svg' ? 'svg-editor' : 'image-annotator', source, state };
}

export function makeShowcaseTextImageDocument(source) {
  const image = structuredClone(source.image);
  Object.assign(image.style, { font:'jetbrains', padding:48 });
  const annotation = (id, type, extra) => ({
    id:`showcase-${id}`, type, x:0, y:0, w:0, h:0, text:'', font:'inter',
    fontSize:14, color:'#d38a00', strokeWidth:1.5, ...extra,
  });
  // Anchor to the actual characters so changing typography retains alignment.
  const anchor = { row:2, start:10, end:12 };
  image.annotations = [
    annotation('start-highlight', 'highlight', { anchor, color:'#e69f00' }),
    annotation('start-outline', 'box', { anchor, cornerRadius:3 }),
    annotation('legend-swatch', 'box', { x:.061, y:.885, w:.016, h:.052, fillStyle:'solid', filled:true, fill:'#e69f00', color:'#e69f00' }),
    annotation('legend-label', 'label', { x:.088, y:.873, text:'Start codon (ATG)', color:'#875500' }),
  ];
  return { format:'sms3-editor-document', version:1, tool:'text-table-to-image', source, state:{ image } };
}
