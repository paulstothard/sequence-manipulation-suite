import { fileTypeFromBuffer } from '../vendor/file-tools/archive-runtime.js';

export function sampleEncoding(bytes, requested = 'auto') {
  if (requested !== 'auto') {
    if (!['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'].includes(requested)) throw new Error('Unsupported text encoding.');
    return requested;
  }
  if (bytes[0] === 255 && bytes[1] === 254) return 'utf-16le';
  if (bytes[0] === 254 && bytes[1] === 255) return 'utf-16be';
  return 'utf-8';
}

function sampleStart(bytes, encoding, offset) {
  let start = 0;
  if (offset && encoding === 'utf-8') while (start < 3 && (bytes[start] & 0xc0) === 0x80) start++;
  if (offset && encoding.startsWith('utf-16')) {
    start = offset % 2;
    const unit = encoding === 'utf-16le' ? bytes[start] | bytes[start + 1] << 8 : bytes[start] << 8 | bytes[start + 1];
    if (unit >= 0xdc00 && unit <= 0xdfff) start += 2;
  }
  return start;
}

export function sampleStartsAtLineBoundary(bytes, previous, encoding, offset) {
  if (!offset) return true;
  const start = sampleStart(bytes, encoding, offset);
  const prefix = new Uint8Array(previous.length + Math.min(8, bytes.length));
  prefix.set(previous);prefix.set(bytes.subarray(0,8), previous.length);
  const at = previous.length + start;
  const unit = index => encoding === 'utf-16le' ? prefix[index] | prefix[index + 1] << 8
    : encoding === 'utf-16be' ? prefix[index] << 8 | prefix[index + 1] : prefix[index];
  const before = unit(at - (encoding.startsWith('utf-16') ? 2 : 1));
  return before === 10 || (before === 13 && unit(at) !== 10);
}

export function decodeFileSample(bytes, encoding, offset = 0, complete = false) {
  const start = sampleStart(bytes, encoding, offset);
  return new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(start), { stream: !complete });
}

export function hasBinaryCharacters(text) {
  return /[\u0000-\u0008\u000e-\u001f]/.test(text);
}

// Shared by the bounded reader and the quick input applicability check.
export async function inspectFileSample(bytes, requestedEncoding = 'auto') {
  const encoding = sampleEncoding(bytes, requestedEncoding);
  let identified = null;
  try { identified = await fileTypeFromBuffer(bytes); } catch { /* A prefix may not contain a complete signature. */ }
  let binary = Boolean(identified && !/^text\//.test(identified.mime) && !['application/xml', 'application/json'].includes(identified.mime));
  try { binary ||= hasBinaryCharacters(decodeFileSample(bytes, encoding)); } catch { binary = true; }
  return { encoding, binary, identified };
}
