import { createGraphicSource } from '../core/graphic-editor.js';
import { IMAGE_FONTS } from '../core/image-fonts.js';
import { loadImageFonts } from './image-fonts.js';

let source;

// A real PNG input for the annotation workspace, rendered with bundled type at
// twice the design resolution. Keep labels and error bars on the same scale.
export async function showcaseExpressionImage() {
  if (source) return source;
  await loadImageFonts();
  const canvas = document.createElement('canvas');
  canvas.width = 1800; canvas.height = 1040;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 900, 520);
  ctx.fontKerning = 'normal';
  const text = (value, x, y, size, weight = 400, align = 'left', color = '#253343') => {
    ctx.font = `${weight} ${size}px ${IMAGE_FONTS.inter.family}`;
    ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(value, x, y);
  };
  const line = (x1, y1, x2, y2, color = '#64748b', width = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  text('Relative expression after treatment', 64, 54, 26, 600);
  text('Illustrative data · mean ± SD · n = 3 per group', 64, 84, 14, 400, 'left', '#64748b');

  const y = value => 414 - value * 94;
  line(112, 132, 112, 414); line(112, 414, 844, 414);
  for (const value of [0, 1, 2, 3]) {
    line(106, y(value), 112, y(value));
    text(String(value), 96, y(value) + 5, 15, 400, 'right', '#526174');
  }
  ctx.save(); ctx.translate(44, 273); ctx.rotate(-Math.PI / 2);
  text('Relative expression', 0, 0, 16, 500, 'center'); ctx.restore();

  for (const [label, x, mean, sd, color] of [
    ['Control', 240, 1, .18, '#0072b2'],
    ['Low dose', 470, 1.7, .24, '#009e73'],
    ['High dose', 700, 2.5, .3, '#e69f00'],
  ]) {
    ctx.fillStyle = color; ctx.fillRect(x - 50, y(mean), 100, y(0) - y(mean));
    const top = y(mean + sd), bottom = y(mean - sd);
    line(x, top, x, bottom, '#253343', 1.7);
    line(x - 12, top, x + 12, top, '#253343', 1.7);
    line(x - 12, bottom, x + 12, bottom, '#253343', 1.7);
    text(label, x, 448, 18, 500, 'center');
  }
  text('Treatment group', 478, 486, 16, 500, 'center', '#526174');
  source = createGraphicSource(JSON.stringify({ dataUrl:canvas.toDataURL('image/png') }), 'png');
  return source;
}
