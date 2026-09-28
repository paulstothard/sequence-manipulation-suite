// ABIF 1.01, with the sequencing-analysis tags from the Applied Biosystems spec:
// https://archive.gfjc.fiu.edu/workshops/resources/articles/ABIF_File_Format.pdf
// Analyzed signal only: no invented instrument run or raw acquisition metadata.
const CHANNEL_ORDER = 'GATC';
const DIRECTORY_ENTRY_SIZE = 28;

export function encodeSimulatedAb1(trace) {
  const count = trace.bases.length, samples = trace.traces.A.length;
  if (!count || trace.basePositions.length !== count || trace.qualities.length !== count) {
    throw new Error('AB1 export requires matching base calls, positions and qualities.');
  }
  const positions = trace.basePositions.map(position => position - 1);
  if (positions.some((position, i) => !Number.isInteger(position) || position < 0 || position > 32767 || position >= samples || (i > 0 && position <= positions[i - 1]))) {
    throw new Error('AB1 export supports at most 2,047 read positions, including flanks. Reduce the flanks or use SCF or Trace JSON.');
  }
  if (trace.qualities.some(q => !Number.isInteger(q) || q < 0 || q > 93)) throw new Error('Invalid AB1 quality value.');
  const ascii = value => new TextEncoder().encode(value);
  const pascal = value => Uint8Array.from([value.length, ...ascii(value)]);
  const shorts = values => {
    const bytes = new Uint8Array(values.length * 2), view = new DataView(bytes.buffer);
    values.forEach((value, i) => {
      if (!Number.isInteger(value) || value < 0 || value > 32767) throw new Error('AB1 signal exceeds the signed 16-bit range.');
      view.setInt16(i * 2, value, false);
    });
    return bytes;
  };
  const entries = [];
  const add = (name, number, type, size, data) => entries.push({ name, number, type, size, data });
  add('CMNT', 1, 18, 1, pascal('SMS3_SIMULATED=1\nSynthetic signal and confidence scores; not measured data or calibrated Phred qualities.'));
  for (const [i, channel] of [...CHANNEL_ORDER].entries()) {
    if (trace.traces[channel].length !== samples) throw new Error('AB1 export requires equally sized signal channels.');
    add('DATA', 9 + i, 4, 2, shorts(trace.traces[channel]));
  }
  add('FWO_', 1, 2, 1, ascii(CHANNEL_ORDER));
  // Both edited and original tag sets start with the same simulated calls.
  for (const number of [1, 2]) {
    add('PBAS', number, 2, 1, ascii(trace.bases));
    add('PCON', number, 2, 1, Uint8Array.from(trace.qualities));
    add('PLOC', number, 4, 2, shorts(positions));
  }
  // Application tag, using a standard cString type. JSON escapes retain Unicode seeds
  // without violating ABIF's ASCII string encoding or Pascal-string length limit.
  const seed = JSON.stringify(trace.simulation.seed).replace(/[^\x20-\x7e]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  add('SM3S', 1, 19, 1, ascii(`${seed}\0`));
  add('SMPL', 1, 18, 1, pascal('simulated_sanger_trace'));
  const spacing = new Uint8Array(4);
  new DataView(spacing.buffer).setFloat32(0, 16, false);
  add('SPAC', 1, 7, 4, spacing);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.number - b.number));

  const directoryOffset = 128;
  let nextOffset = directoryOffset + entries.length * DIRECTORY_ENTRY_SIZE;
  for (const entry of entries) {
    if (entry.data.length <= 4) continue;
    entry.offset = nextOffset;
    nextOffset += Math.ceil(entry.data.length / 4) * 4;
  }
  const bytes = new Uint8Array(nextOffset), view = new DataView(bytes.buffer);
  const writeEntry = (offset, entry, elements, dataSize, dataOffset) => {
    bytes.set(ascii(entry.name), offset);
    view.setInt32(offset + 4, entry.number, false);
    view.setInt16(offset + 8, entry.type, false);
    view.setInt16(offset + 10, entry.size, false);
    view.setInt32(offset + 12, elements, false);
    view.setInt32(offset + 16, dataSize, false);
    view.setInt32(offset + 20, dataOffset, false);
    // Reserved data handle and unused header bytes remain zero.
  };
  bytes.set(ascii('ABIF'));
  view.setUint16(4, 101, false);
  writeEntry(6, { name: 'tdir', number: 1, type: 1023, size: DIRECTORY_ENTRY_SIZE }, entries.length, entries.length * DIRECTORY_ENTRY_SIZE, directoryOffset);
  entries.forEach((entry, i) => {
    const offset = directoryOffset + i * DIRECTORY_ENTRY_SIZE;
    writeEntry(offset, entry, entry.data.length / entry.size, entry.data.length, entry.offset ?? 0);
    bytes.set(entry.data, entry.offset ?? offset + 20);
  });
  return Array.from(bytes);
}
