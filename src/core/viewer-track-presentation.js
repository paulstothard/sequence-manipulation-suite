// Representation changes never change the viewport or lane budget.
export function chooseViewerTrackPresentation({ compact, expanded, density = false, preferExpanded = false, visibleCount = 0 }) {
  const summary = density && !preferExpanded;
  const layout = expanded ?? compact;
  const action = density && visibleCount ? {
    expand: summary,
    label: summary ? 'Show individual features' : 'Show feature density',
    title: summary
      ? 'Show individual features in the available lanes. Additional features remain available in the hidden-feature list and search.'
      : 'Show feature density at this zoom. Zoom in for individual features.'
  } : null;
  return { summary, layout, action, expanded: true };
}
