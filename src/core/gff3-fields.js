// Decode once: an escaped percent may itself precede two hexadecimal digits.
// Parent lists must be split before decoding so escaped commas stay in IDs.
export function parseGff3Attributes(value, { parentLists = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text || text === '.') return {};
  const entries = [];
  for (const part of text.split(';')) {
    if (!part.trim()) continue;
    const equals = part.indexOf('=');
    if (equals < 1) throw new Error('GFF3 attributes must use tag=value pairs.');
    const key = decodeURIComponent(part.slice(0, equals).trim());
    if (!key) throw new Error('GFF3 attributes must have a tag.');
    const rawValue = part.slice(equals + 1).trim();
    entries.push([key, parentLists && key === 'Parent' ? rawValue.split(',').map(decodeURIComponent) : decodeURIComponent(rawValue)]);
  }
  return Object.fromEntries(entries);
}

export function encodeGff3Seqid(value) {
  // Encode whitespace, percent and delimiters; retain the GFF3 seqid alphabet.
  return encodeURIComponent(String(value)).replace(/[()']/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%(3A|5E|24|40|2B|3F|7C)/gi, escape => decodeURIComponent(escape));
}
