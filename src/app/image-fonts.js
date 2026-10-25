import { IMAGE_FONTS, usedImageFonts } from '../core/image-fonts.js';

const loaded = new Map();
let pending;
const xml = value => value.replace(/[&<>]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;'}[c]));
const base64 = buffer => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
};

// Loaded only when this editor is opened, never by the app shell or worker.
// Waiting for FontFace.load before measuring prevents fallback-font geometry.
export function loadImageFonts() {
  if (pending) return pending;
  pending = Promise.all(Object.entries(IMAGE_FONTS).filter(([,font]) => font.files).map(async ([key,font]) => {
    if (loaded.has(key)) return;
    const asset = async file => {
      const response = await fetch(new URL(`../vendor/image-fonts/${font.folder}/${file}`, import.meta.url), {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`Could not load ${font.label}. Retry loading the bundled fonts.`);
      return response;
    };
    const [license, faces] = await Promise.all([
      asset('OFL.txt').then(response => response.text()),
      Promise.all(font.files.map(async ([file,weight]) => {
        const bytes = await (await asset(file)).arrayBuffer();
        const face = new FontFace(font.face, bytes, {weight, ...(font.variations ? {variationSettings:font.variations} : {})});
        await face.load();
        document.fonts.add(face);
        return `@font-face{font-family:"${font.face}";font-style:normal;font-weight:${weight};${font.variations ? `font-variation-settings:${font.variations};` : ''}src:url(data:font/woff2;base64,${base64(bytes)}) format("woff2");}`;
      }))
    ]);
    loaded.set(key, {css:faces.join('\n'), license});
  })).catch(error => { pending = undefined; throw error; });
  return pending;
}

// Include only the families actually used, keeping downloads self-contained.
// Preview uses registered FontFaces; embedding is done only on export.
export function embedImageFonts(svg, layout) {
  const families = usedImageFonts(layout).filter(key => IMAGE_FONTS[key].files);
  if (!families.length) return svg;
  const entries = families.map(key => {
    const entry = loaded.get(key);
    if (!entry) throw new Error('Image fonts are still loading. Try the download again.');
    return entry;
  });
  return svg.replace(/(<svg\b[^>]*>)/, `$1\n<defs><style>${xml(entries.map(entry => entry.css).join('\n'))}</style></defs>\n<metadata>${xml(entries.map(entry => entry.license).join('\n\n'))}</metadata>`);
}
