import { viewerFeatureVisibility, VIEWER_VISIBILITY_FOOTER_HEIGHT } from '../core/viewer-feature-visibility.js';

export function drawViewerFeatureVisibility(ctx, record, state, width, legendTop, theme) {
  const disclosure = viewerFeatureVisibility(record, state);
  state.featureVisibilityText = disclosure.lines.join('\n');
  ctx.canvas.dataset.featureVisibility = state.featureVisibilityText;
  if (!disclosure.lines.length) return;
  const top = legendTop - VIEWER_VISIBILITY_FOOTER_HEIGHT;
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, top, width, VIEWER_VISIBILITY_FOOTER_HEIGHT);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  disclosure.lines.forEach((line, index) => {
    ctx.fillStyle = /display limit/.test(line) ? theme.warning : theme.text;
    ctx.fillText(line, 12, top + 10 + index * 14, Math.max(1, width - 24));
  });
  ctx.restore();
}
