// Coordinates stay in the reference orientation even for the complementary row.
export function viewerAlignmentPosition(state, length) {
  const target = state.inspectedTarget?.kind === 'base' ? state.inspectedTarget : state.selectedTarget;
  if (target?.kind !== 'base') return null;
  const position = Number(target.position ?? target.start);
  return Number.isInteger(position) && position >= 1 && position <= length ? position : null;
}

export function drawViewerAlignmentGuide(ctx, from, to, theme) {
  ctx.save();
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}
