export function setPngDpi(bytes, dpi) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24 || !Number.isFinite(dpi) || dpi <= 0)
    throw new Error("Invalid PNG resolution.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return setPngPhysicalSize(bytes, view.getUint32(16) * 25.4 / dpi, view.getUint32(20) * 25.4 / dpi);
}

// Same PNG pHYs/CRC encoding used by the standalone tree-viewer exporter.
// Physical dimensions come from the figure, independently of raster pixel count.
export function setPngPhysicalSize(bytes, widthMm, heightMm) {
  if (!(bytes instanceof Uint8Array) || !Number.isFinite(widthMm) || widthMm <= 0 ||
      !Number.isFinite(heightMm) || heightMm <= 0) throw new Error("Invalid PNG physical dimensions.");
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value)) throw new Error("Invalid PNG signature.");
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const xPpm = Math.round(source.getUint32(16) * 1000 / widthMm);
  const yPpm = Math.round(source.getUint32(20) * 1000 / heightMm);
  if (![xPpm, yPpm].every(value => value > 0 && value <= 0xffffffff)) throw new Error("PNG physical dimensions are outside the supported range.");
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, xPpm);
  view.setUint32(12, yPpm);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts = [bytes.subarray(0, 8)];
  let offset = 8, inserted = false, ended = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("Truncated PNG chunk.");
    const length = source.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error("Truncated PNG chunk.");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(bytes.subarray(offset, end));
    if (type === "IHDR") { parts.push(chunk); inserted = true; }
    if (type === "IEND") ended = true;
    offset = end;
  }
  if (!inserted || !ended) throw new Error("Incomplete PNG.");
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { output.set(part, at); at += part.length; }
  return output;
}
