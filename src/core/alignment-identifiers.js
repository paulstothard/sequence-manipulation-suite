/** CLUSTAL has whitespace-delimited identifiers; preserve full names where
 * possible and reserve every normalized input name before assigning suffixes. */
export function makeClustalIdentifiers(titles) {
  const bases = titles.map(title => {
    const base = String(title ?? '').trim().replace(/\s+/g, '_') || 'sequence';
    return /^(CLUSTAL|MUSCLE)\b/i.test(base) || /^[*:.]+$/.test(base) ? `sequence_${base}` : base;
  });
  const reserved = new Set(bases);
  const used = new Set();
  return bases.map(base => {
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      do { name = `${base}_${suffix++}`; } while (reserved.has(name));
    }
    used.add(name);
    return name;
  });
}

export function clustalIdentifierNotes(titles) {
  return makeClustalIdentifiers(titles).flatMap((name, index) => name === titles[index] ? [] :
    [`CLUSTAL identifier ${JSON.stringify(name)} represents input record ${index + 1}, ${JSON.stringify(titles[index])}.`]);
}
