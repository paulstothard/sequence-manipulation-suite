import { imageToolId, layoutImage } from '../core/text-table-image.js';
import { initialGraphicState } from '../core/graphic-editor.js';
import { showcaseExpressionImage } from './showcase-expression-image.js';
import { loadImageFonts } from './image-fonts.js';
import { measureImageText } from './text-table-image-ui.js';

// Ordinary editor state, consumed by the production renderer and document
// export. Showcase keeps these edits temporary; tool inputs stay unchanged.
export async function makeShowcaseGraphicDocument(source) {
  if (source.kind === 'png') source = await showcaseExpressionImage();
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
    annotation('error-label', 'label', { x:840, y:296, w:300, h:52 }, { text:'Mean ± SD', fontSize:36 }),
    annotation('error-pointer', 'pointer', { x:940, y:364, w:0, h:70 }, { strokeWidth:4 }),
  ];
  return { format:'sms3-editor-document', version:1,
    tool:source.kind === 'svg' ? 'svg-editor' : 'image-annotator', source, state };
}

export async function makeShowcaseTextImageDocument(source) {
  const image = structuredClone(source.image);
  const table = image.mode === 'table';
  Object.assign(image.style, { font:table ? 'inter' : 'jetbrains', padding:table ? 32 : 48 });
  const annotation = (id, type, extra) => ({
    id:`showcase-${id}`, type, x:0, y:0, w:0, h:0, text:'', font:'inter',
    fontSize:14, color:'#d38a00', strokeWidth:1.5, ...extra,
  });
  if (table) {
    image.style.columnFonts[1] = 'jetbrains'; image.style.columnFontSizes[1] = 14;
    image.style.columnFontHeaders = { ...image.style.columnFontHeaders, 1:false };
    image.annotations = [];
    await loadImageFonts();
    const layout = layoutImage(image, measureImageText);
    const row = layout.cells.filter(cell => cell.row === 2), first = row[0], last = row.at(-1);
    // A normal movable/resizable box, sized from the actual row after fonts load.
    image.annotations = [annotation('primer-row', 'box', {
      x:first.x / layout.width, y:first.y / layout.height,
      w:(last.x + last.w - first.x) / layout.width, h:first.h / layout.height,
      cornerRadius:3, strokeWidth:1, fillStyle:'solid', fill:'#e69f0026',
    })];
  } else {
    // Keep the text example's highlight attached to the source characters.
    image.annotations = [
      annotation('start-outline', 'box', { anchor:{ row:2, start:10, end:12 }, cornerRadius:3, fillStyle:'solid', fill:'#e69f0040' }),
      annotation('legend-swatch', 'box', { x:.061, y:.885, w:.016, h:.052, fillStyle:'solid', filled:true, fill:'#e69f00', color:'#e69f00' }),
      annotation('legend-label', 'label', { x:.088, y:.873, text:'Start codon (ATG)', font:image.style.font, fontSize:image.style.fontSize, color:'#875500' }),
    ];
  }
  return { format:'sms3-editor-document', version:1, tool:imageToolId(image.mode), source, state:{ image } };
}
