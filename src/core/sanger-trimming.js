// Convert the explicit UI modes at the input boundary. Legacy callers without
// trimMode retain their saved trimMethod/autoTrim and coordinate semantics.
export function normalizeSangerTrimOptions(options = {}) {
  if (options.trimMode === undefined) return options;
  const { trimMode, ...rest } = options;
  if (!['none', 'manual', 'auto'].includes(trimMode)) {
    throw new Error('Choose no trimming, a specified base range, or automatic trimming.');
  }
  let clipStart = 1, clipEnd = 0;
  if (trimMode === 'manual') {
    clipStart = Number(options.clipStart || 1);
    clipEnd = Number(options.clipEnd || 0);
    if (!Number.isSafeInteger(clipStart) || clipStart < 1 ||
        !Number.isSafeInteger(clipEnd) || clipEnd < 0) {
      throw new Error('Trim coordinates must be positive whole numbers. Leave the last base blank to keep through the end of the read.');
    }
    if (clipEnd && clipEnd < clipStart) {
      throw new Error('First base to keep must be at or before the last base.');
    }
  }
  return { ...rest, trimMethod: trimMode === 'auto' ? 'mott' : 'manual',
    autoTrim: trimMode === 'auto', clipStart: trimMode === 'auto' ? 0 : clipStart, clipEnd };
}
