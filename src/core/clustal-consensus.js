// CLUSTAL protein conservation groups, as documented by EMBL-EBI:
// https://www.ebi.ac.uk/jdispatcher/docs/faqs/clustal/#what-do-the-consensus-symbols-mean-in-the-alignment
const STRONG_GROUPS = ['STA', 'NEQK', 'NHQK', 'NDEQ', 'QHRK', 'MILV', 'MILF', 'HY', 'FYW'];
const WEAK_GROUPS = ['CSA', 'ATV', 'SAG', 'STNK', 'STPA', 'SGND', 'SNDEQK', 'NDEQHK', 'NEQHRK', 'FVLIM', 'HFY'];

export function makeClustalConsensus(aligned, alphabet) {
  const columns = [];
  for (let index = 0; index < (aligned[0]?.length ?? 0); index += 1) {
    const symbols = aligned.map(sequence => sequence[index]?.toUpperCase());
    if (symbols.some(symbol => !symbol || symbol === '-' || symbol === '.')) columns.push(' ');
    else if (symbols.every(symbol => symbol === symbols[0])) columns.push('*');
    else if (alphabet === 'protein' && STRONG_GROUPS.some(group => symbols.every(symbol => group.includes(symbol)))) columns.push(':');
    else if (alphabet === 'protein' && WEAK_GROUPS.some(group => symbols.every(symbol => group.includes(symbol)))) columns.push('.');
    else columns.push(' ');
  }
  return columns.join('');
}
