// Container detection shared by the bounded reader and file-option applicability UI.
// Only a 512-byte prefix is needed; the archive engine still validates the container.
export function containerType(bytes, name = '') {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && [[3, 4], [5, 6], [6, 6], [6, 7], [7, 8]].some(([a, b]) => bytes[2] === a && bytes[3] === b)) return 'zip';
  if (new TextDecoder().decode(bytes.subarray(257, 262)) === 'ustar' || /\.tar$/i.test(name)) return 'tar';
  return null;
}
