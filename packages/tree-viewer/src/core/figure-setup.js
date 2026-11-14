// The viewer has one publication size. Existing style controls retain their
// relative scales; the renderer receives calibrated point sizes at 180 mm.
export function fixedViewerFigure(p) {
  return {
    active: true, preset: "custom", width: 180, height: 180, autoHeight: true,
    text: p.fontSize * 6.2 / 12, ticks: (p.supportSize ?? 10) * 5.2 / 10,
    title: 6.8, line: Math.max(0.1, p.branchWidth * 0.68 / 1.5),
    spacing: p.spacing * 6.2 * 1.4 / 22,
    legendSize: (p.legendSize ?? 12) * 6.2 / 12,
  };
}

export function validateFigureSetup(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.active !== 'boolean' ||
      typeof s.autoHeight !== 'boolean' || !['original','single','double','slide','poster','custom'].includes(s.preset) ||
      (s.showTitle !== undefined && typeof s.showTitle !== 'boolean') ||
      (s.titleText !== undefined && (typeof s.titleText !== 'string' || s.titleText.length > 300)))
    throw new Error('Invalid figure setup.');
  for (const key of ['width', 'height', 'text', 'ticks', 'title', 'line']) {
    const min = ['width','height'].includes(key) ? 10 : key === 'line' ? .1 : 1;
    const max = ['width','height'].includes(key) ? 2000 : key === 'line' ? 10 : 100;
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw new Error('Invalid figure dimensions, point sizes or line weight.');
  }
  for (const key of ['spacing', 'legendSize']) {
    if (s[key] !== undefined && (!Number.isFinite(s[key]) || s[key] < 1 || s[key] > 200))
      throw new Error('Invalid figure label spacing or legend size.');
  }
}
