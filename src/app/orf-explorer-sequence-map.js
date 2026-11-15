import { complementBase, shouldDrawLinearSequenceLetter } from './dna-viewer-canvas.js';
import { getViewerCanvasTheme, getViewerBaseColor } from './viewer-canvas-theme.js';
import { featureChevronSegments } from '../core/feature-chevron-geometry.js';
import { makeOrfTranslationModel, visibleOrfTranslationCodons } from '../core/orf-explorer-translation.js';
import { setUiText } from './set-ui-text.js';

const ns = 'http://www.w3.org/2000/svg';
const make = tag => document.createElementNS(ns, tag);
const attrs = (el, values) => { for (const [key, value] of Object.entries(values)) el.setAttribute(key, value); };

// SVG counterpart of the linear viewer's sequence rows, sharing its codon
// bounds, base palette, CDS translation model and directional geometry.
// Retain even hidden touch origins until the navigation controller is idle.
export function createOrfSequenceMap(svg, clipId, selectOrf) {
  const layer = make('g'); layer.classList.add('orf-explorer-sequence-layer'); svg.append(layer);
  const nodes = new Map();
  let context, theme, used, models = new WeakMap(), previousRecord;
  function item(key, attributes = {}, title = '') {
    used.add(key);
    let group = nodes.get(key);
    if (!group) {
      group = make('g'); group.append(make('path'), make('text'), make('title'));
      group.dataset.detailKey = key;
      group.setAttribute('data-sms3-inspection-highlight', 'none');
      group.addEventListener('click', () => { if (group.dataset.orfSelect) selectOrf(Number(group.dataset.orfSelect)); });
      layer.append(group); nodes.set(key, group);
    }
    group.style.display = '';
    attrs(group, attributes);
    if (title) {
      group.dataset.sms3TitleText = title;
      group.setAttribute('aria-label', title);
      if (!group.hasAttribute('data-sms3-title-mark')) setUiText(group.querySelector('title'), title);
    }
    return { group, path: group.querySelector('path'), text: group.querySelector('text') };
  }
  function line(key, left, right, y, color, width = 4) {
    const { path } = item(key);
    attrs(path, { d: `M${left} ${y} H${right}`, stroke: color, 'stroke-width': width, fill: 'none' });
  }
  function text(key, value, x, y, color, className = 'orf-explorer-base') {
    const result = item(key);
    attrs(result.text, { x, y, fill: color, class: className }); setUiText(result.text, value);
    return result;
  }
  return {
    begin(next) {
      context = next; used = new Set(); theme = getViewerCanvasTheme(svg);
      if (previousRecord !== next.record) { models = new WeakMap(); previousRecord = next.record; }
    },
    dna(y) {
      const { record, left, right, toX, start, end, pxPerBase } = context;
      const strands = ['+', '-'];
      for (const [row, strand] of strands.entries()) {
        const center = y + row * 22;
        const label = text(`dna-label:${strand}`, `DNA ${strand}`, left - 9, center, theme.muted, 'orf-explorer-sequence-label');
        label.text.setAttribute('text-anchor', 'end');
        if (pxPerBase < 10) { line(`dna-line:${strand}`, left, right, center, theme.sequenceLine, 2); continue; }
        for (let index = Math.max(0, Math.floor(start)); index < Math.min(record.length, Math.ceil(end)); index++) {
          const x = toX(index + .5);
          if (!shouldDrawLinearSequenceLetter(x, left, right, 5)) continue;
          const base = strand === '+' ? record.sequence[index] : complementBase(record.sequence[index]);
          const { group, path, text: glyph } = item(`base:${strand}:${index}`, { 'data-base-position': index + 1, 'data-strand': strand }, `DNA ${strand}; base: ${base}; position: ${index + 1}`);
          attrs(path, { d: `M${Math.max(left, toX(index))} ${center-10} H${Math.min(right,toX(index+1))} V${center+10} H${Math.max(left,toX(index))} Z`, fill: 'transparent' });
          attrs(glyph, { x, y: center, fill: getViewerBaseColor(theme, base), class: 'orf-explorer-base' }); setUiText(glyph, base);
          group.setAttribute('role', 'img');
        }
      }
      return y + strands.length * 22;
    },
    orf(orf, { x1, x2, y, height, labelWidth, inView, shapeClipId }) {
      if (!inView) return false;
      const { record, options, settings, start, end, pxPerBase, toX, left, right } = context;
      if (settings.orfTranslation && pxPerBase >= 4 && height >= 10) {
        if (!models.has(orf)) models.set(orf, makeOrfTranslationModel(record, orf, options));
        const codons = visibleOrfTranslationCodons(models.get(orf), start, end);
        for (const codon of codons) {
          const part = codon.parts[0], from = Math.max(left,toX(part.start-1)), to = Math.min(right,toX(part.end)), center = toX((part.start-1+part.end)/2);
          if (to <= from) continue;
          const { path, text: glyph } = item(`orf-codon:${orf.id}:${codon.index}`, { 'data-orf-select': orf.id, 'data-orf-residue': codon.index,
            'data-codon': codon.codon, 'data-amino-acid': codon.aminoAcid, 'data-start': part.start, 'data-end': part.end,
            'clip-path': `url(#${shapeClipId ?? clipId})`, role: 'img' }, `ORF ${orf.id}; ${codon.aminoAcid === '*' ? `terminal stop after residue ${codon.index-1}` : `residue ${codon.index}: ${codon.aminoAcid}`}; codon: ${codon.codon}; bases (5′ → 3′): ${codon.positions.join(', ')}`);
          attrs(path, { d: `M${from} ${y-height/2} H${to} V${y+height/2} H${from} Z`, fill: codon.index%2 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.06)' });
          attrs(glyph, { x: center, y, class: 'orf-explorer-residue', fill: theme.dark ? '#101b20' : '#fff' });
          setUiText(glyph, center-3 >= from && center+3 <= to ? codon.aminoAcid : '');
        }
        return codons.length > 0;
      }
      const exclusions = labelWidth ? [{ start: (x1+x2-labelWidth)/2, end: (x1+x2+labelWidth)/2 }] : [];
      const segments = featureChevronSegments(x1,x2,height,orf.strand,exclusions);
      if (segments.length) {
        const { group, path } = item(`chevrons:${orf.id}`, { 'data-orf-chevrons': orf.id, 'clip-path': `url(#${shapeClipId ?? clipId})` });
        group.style.pointerEvents = 'none';
        attrs(path, { d: segments.map(segment=>segment.map(([x,dy],i)=>`${i?'L':'M'}${x} ${y+dy}`).join(' ')).join(' '), fill: 'none',
          stroke: theme.dark ? '#101b20' : '#fff', 'stroke-opacity': .6, 'stroke-width': 1.25, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      }
      return false;
    },
    finish(interacting) {
      let retained = false;
      for (const [key, group] of nodes) if (!used.has(key)) {
        group.style.display = 'none';
        if (interacting) retained = true;
        else { group.remove(); nodes.delete(key); }
      }
      return retained;
    }
  };
}
