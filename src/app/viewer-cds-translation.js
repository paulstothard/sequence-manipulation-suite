import { isCdsFeature, makeCdsTranslationModel, visibleCdsTranslationCodons } from '../core/viewer-cds-translation.js';
import { addRectHit, addPolarHit, makeTargetKey } from './dna-viewer-interactions.js';

export const hasCdsTranslations = record => record.alphabet !== 'protein' && Boolean(record.sequence)
  && (record.tracks ?? []).some(track => track.items?.some(isCdsFeature));
export const CDS_TRANSLATION_HELP = 'Show amino acids inside CDS blocks when zoomed in. Uses the annotated protein when available; otherwise the spliced CDS and its genetic code. Hover a letter for its residue number and codon. Split codons keep their frame across introns.';

function modelFor(record, item, state) {
  state.cdsTranslationCache ??= new WeakMap();
  let cached = state.cdsTranslationCache.get(item);
  if (!cached || cached.code !== state.geneticCode || cached.sequence !== record.sequence) {
    cached = { code: state.geneticCode, sequence: record.sequence, model: makeCdsTranslationModel(record, item, state.geneticCode) };
    state.cdsTranslationCache.set(item, cached);
  }
  return cached.model;
}

function piecesFor(record, item, state, placement, pxPerBase, height, target) {
  if (!state.showCdsTranslations || !isCdsFeature(item)) return [];
  const model = modelFor(record, item, state);
  if (!model.available) {
    (target.details ??= []).push(['CDS translation', model.reason || 'No complete codons in this CDS.']);
    return [];
  }
  if (pxPerBase < 4 || height < 10) return [];
  const shift = Number.isFinite(placement.fullStart) ? placement.fullStart - placement.sourceStart : 0;
  const start = placement.start - shift, end = placement.end - shift;
  return visibleCdsTranslationCodons(model, start, end).flatMap(codon => codon.parts.flatMap(part => {
    const from = Math.max(part.start - 1, start), to = Math.min(part.end, end);
    if (to <= from) return [];
    const labelPosition = (part.start - 1 + part.end) / 2 + shift;
    return [{ codon, start: from + shift, end: to + shift, labelPosition,
      label: part.hasMiddle && labelPosition >= placement.start && labelPosition <= placement.end }];
  }));
}

function codonTarget(target, codon) {
  const parentKey = makeTargetKey(target);
  return { ...target, key: `${parentKey}|cds:${codon.index}`, cdsParentKey: parentKey,
    cdsResidueIndex: codon.index, codon: codon.codon, aminoAcid: codon.aminoAcid,
    cdsPositions: codon.positions, cdsSplitCodon: codon.split,
    details: [...(target.details ?? []), ['Protein residue', codon.aminoAcid === '*' ? `Stop after residue ${codon.index - 1}` : codon.index], ['Codon bases (5′ → 3′)', codon.positions.join(', ')],
      ['Split codon', codon.split ? 'Across joined CDS segments' : 'No'], ['CDS translation', codon.source]] };
}

function glyphMetrics(ctx, letter) {
  const metrics = ctx.measureText(letter);
  // A middle text baseline centers the font's em box, not the visible capital
  // letter. Center its ink instead, in local coordinates before any rotation.
  const offset = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  return { halfWidth: metrics.width / 2, offset: Number.isFinite(offset) ? offset : 0 };
}

export function drawLinearCdsTranslation(ctx, record, item, state, placement, target, { toX, y, height, pxPerBase, ink }) {
  const pieces = piecesFor(record, item, state, placement, pxPerBase, height, target);
  if (!pieces.length) return false;
  ctx.save();
  ctx.beginPath(); ctx.rect(toX(placement.start), y - height / 2, toX(placement.end) - toX(placement.start), height); ctx.clip();
  ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const piece of pieces) {
    const x1 = toX(piece.start), x2 = toX(piece.end), x = toX(piece.labelPosition);
    ctx.fillStyle = piece.codon.index % 2 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x1, y - height / 2, x2 - x1, height);
    addRectHit(state, { x1, x2, y1: y - height / 2, y2: y + height / 2 }, codonTarget(target, piece.codon));
    const { halfWidth: half, offset } = glyphMetrics(ctx, piece.codon.aminoAcid);
    if (piece.label && x - half >= x1 + .5 && x + half <= x2 - .5) {
      ctx.fillStyle = ink;
      ctx.fillText(piece.codon.aminoAcid, x, y + offset);
    }
  }
  ctx.restore();
  return true;
}

export function drawCircularCdsTranslation(ctx, record, item, state, placement, target, { cx, cy, innerRadius, outerRadius, toAngle, pxPerBase, ink }) {
  const height = outerRadius - innerRadius, radius = (innerRadius + outerRadius) / 2;
  const pieces = piecesFor(record, item, state, placement, pxPerBase, height, target);
  if (!pieces.length) return false;
  ctx.save(); ctx.clip(); // The feature's existing arrow/arc path bounds the overlay.
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const piece of pieces) {
    const startAngle = toAngle(piece.start), endAngle = toAngle(piece.end), angle = toAngle(piece.labelPosition);
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
    ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = piece.codon.index % 2 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.06)'; ctx.fill();
    addPolarHit(state, { cx, cy, innerRadius, outerRadius, startAngle, endAngle }, codonTarget(target, piece.codon));
    const { halfWidth: half, offset } = glyphMetrics(ctx, piece.codon.aminoAcid);
    if (piece.label && (angle - startAngle) * radius > half + .5 && (endAngle - angle) * radius > half + .5) {
      ctx.save(); ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      let rotation = angle + Math.PI / 2;
      if (Math.cos(rotation) < 0) rotation += Math.PI;
      ctx.rotate(rotation); ctx.fillStyle = ink; ctx.fillText(piece.codon.aminoAcid, 0, offset); ctx.restore();
    }
  }
  ctx.restore();
  return true;
}
