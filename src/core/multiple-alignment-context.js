// Pairwise alignments poll frequently. Pace worker timers/messages across the
// whole MSA while retaining cancellation checks at every requested checkpoint.
const paced = Symbol('multiple-alignment-context');
export function makeMultipleAlignmentContext(context = {}) {
  if (context[paced]) return context;
  let lastYield = -Infinity;
  let lastProgress = -Infinity;
  let lastPhase = '';
  return {
    ...context,
    [paced]: true,
    async yieldIfNeeded() {
      context.throwIfCancelled?.();
      if (performance.now() - lastYield >= 8) {
        await context.yieldIfNeeded?.();
        lastYield = performance.now();
      }
      context.throwIfCancelled?.();
    },
    reportProgress(detail = {}) {
      // A restarted DP-row percentage is not overall MSA progress.
      if (detail.phase === 'filling-matrix') return;
      const now = performance.now();
      if (detail.phase !== lastPhase || detail.progress === 1 || now - lastProgress >= 50) {
        context.reportProgress?.(detail);
        lastProgress = now;
        lastPhase = detail.phase;
      }
    }
  };
}
