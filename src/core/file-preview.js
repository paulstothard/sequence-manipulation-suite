import { FILE_TOOL_LIMITS as LIMIT, boundedInteger, readByteRange, requireLocalFile, textFile } from './local-file-bytes.js';
import { containerType, readArchive } from './file-archive-reader.js';
import { inspectFileSample, decodeFileSample, hasBinaryCharacters, sampleStartsAtLineBoundary } from './file-preview-content.js';

function hexPreview(bytes, offset) {
  const rows = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const block = bytes.subarray(i, i + 16);
    rows.push(`${(offset + i).toString(16).padStart(12, '0')}  ${Array.from(block, b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47)}  |${Array.from(block, b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')}|`);
  }
  return rows.join('\n');
}

// Keep a bounded ring of physical lines, including blank lines and original terminators.
// The download is one contiguous slice; display shortening never alters that slice.
function extractLines(text, { tail, partialStart, partialEnd, limit, knownLineNumbers }) {
  const kept = [];
  let count = 0, physical = 0, start = 0;
  const accept = (end, contentEnd, incomplete = false) => {
    const number = ++physical;
    const fragment = incomplete || (partialStart && start === 0);
    if (!fragment) {
      const row = { start, end, contentEnd, number: knownLineNumbers ? number : null, fragment: false };
      if (tail) kept[count % limit] = row;
      else if (count < limit) kept.push(row);
      count++;
    }
    start = end;
  };
  const endings = /\r\n|\r|\n/g;
  let match;
  while ((match = endings.exec(text))) accept(endings.lastIndex, match.index, partialEnd && endings.lastIndex === text.length && match[0] === '\r');
  if (start < text.length) accept(text.length, text.length, partialEnd);
  let selected = tail && count > limit ? [...kept.slice(count % limit), ...kept.slice(0, count % limit)] : kept;
  if (!selected.length && text.length) selected = [{ start: 0, end: text.length, contentEnd: text.replace(/[\r\n]+$/, '').length, number: knownLineNumbers ? 1 : null, fragment: true }];
  const first = selected[0], last = selected.at(-1);
  return {
    text: first ? text.slice(first.start, last.end) : '',
    lineCount: selected.length,
    startLine: first?.number ?? null,
    endLine: last?.number ?? null,
    omittedLines: count > limit,
    fragment: selected.some(row => row.fragment),
    lines: selected.map(row => {
      const source = text.slice(row.start, row.contentEnd);
      const shortened = source.length > LIMIT.lineCharacters;
      return { number: row.number, text: shortened ? tail ? source.slice(-LIMIT.lineCharacters) : source.slice(0, LIMIT.lineCharacters) : source, shortened, fragment: row.fragment };
    })
  };
}

export async function previewFile(input, options = {}, context = {}) {
  const mode = options.fileSourceMode ?? 'text';
  if (!['text', 'file'].includes(mode)) throw new Error('Choose pasted text or a local file.');
  const file = mode === 'file' ? requireLocalFile(options.previewFile) : textFile(input);
  const lines = boundedInteger(options.lines, 50, LIMIT.previewLines, 'Preview lines');
  const bytes = boundedInteger(options.bytes, 800, 16000, 'Preview bytes');
  const format = options.outputFormat ?? 'preview';
  if (!['preview', 'text', 'hex', 'report', 'beginning', 'end'].includes(format)) throw new Error('Table conversion is not supported by File And Archive Preview. Choose a source excerpt or summary report.');
  if ((options.delimiter && options.delimiter !== 'auto') || (options.header && options.header !== 'auto')) throw new Error('Table interpretation settings are not supported. File previews preserve source lines.');
  const region = format === 'beginning' ? 'head' : format === 'end' ? 'tail' : options.region ?? 'head';
  if (!['head', 'tail', 'both'].includes(region)) throw new Error('Choose the beginning, end, or both.');
  if (region === 'both' && ['text', 'hex'].includes(format)) throw new Error('Choose one region for a text or hexadecimal workflow excerpt. Beginning and end are separate outputs.');
  const prefix = await readByteRange(file, 0, Math.min(65536, file.size), context);
  const container = containerType(prefix, file.name);
  const warnings = [];
  let archive = null, samples = [], bytesRead = prefix.length, name = file.name ?? 'local-file', total = file.size;
  if (container) {
    if (region !== 'head') throw new Error('End previews are available only for uncompressed files. Choose Beginning for archive or compressed content.');
    archive = await readArchive(file, container, String(options.archiveEntry ?? ''), context);
    bytesRead += archive.stats.bytesRead;
    warnings.push(...archive.warnings);
    if (archive.entries && !archive.selected) {
      if (!['preview', 'report'].includes(format)) throw new Error('Select an archive entry before requesting its content. Use Automatic preview to list the archive.');
      if (lines !== 50 || bytes !== 800 || (options.encoding && options.encoding !== 'auto')) throw new Error('Content sampling settings require an archive entry. Use the default settings to list the archive.');
      if (!archive.complete) warnings.push('Partial archive listing. Unlisted entries may still exist.');
      warnings.push('Entry sizes and names come from archive metadata. Listing does not verify file contents. Choose an entry and run again to preview it.');
      return { name, total, bytesRead, format: archive.format, warnings, archive, sections: [], partial: !archive.complete };
    }
    name = archive.selected?.path ?? name.replace(/\.gz$/i, '');
    total = archive.selected?.bytes ?? (archive.sample.complete ? archive.sample.bytes.length : null);
    samples = [{ ...archive.sample, offset: 0, label: 'Beginning' }];
    warnings.push('Archive previews inspect sampled content without validating the complete archive or compressed stream. Nested archives are not recursively opened.');
  } else {
    const max = LIMIT.previewBytes;
    if (region !== 'tail') samples.push({ bytes: await readByteRange(file, 0, Math.min(max, file.size), context), offset: 0, label: 'Beginning', complete: file.size <= max });
    if (region !== 'head') {
      const offset = Math.max(0, file.size - max);
      const previous = await readByteRange(file, Math.max(0, offset - 4), offset, context);
      bytesRead += previous.length;
      samples.push({ bytes: await readByteRange(file, offset, file.size, context), previous, offset, label: 'End', complete: offset === 0 });
    }
    bytesRead += samples.reduce((sum, sample) => sum + sample.bytes.length, 0);
  }
  const sniff = await inspectFileSample((archive ? samples[0].bytes : prefix).subarray(0, 65536), options.encoding ?? 'auto');
  const { encoding, identified } = sniff;
  const signature = identified ? `.${identified.ext} (${identified.mime})` : 'No recognized binary signature';
  const sections = [];
  for (const sample of samples) {
    let text = '', binary = sniff.binary;
    try { text = decodeFileSample(sample.bytes, encoding, sample.offset, sample.label === 'End' || sample.complete); binary ||= hasBinaryCharacters(text); } catch { binary = true; }
    if (format === 'text' && binary) throw new Error('Text preview requires decodable text. Use Automatic preview for binary or undecodable input.');
    if (binary && options.encoding && options.encoding !== 'auto') throw new Error('The selected encoding cannot decode this content. Use automatic detection.');
    const key = sample.label.toLowerCase(), tail = key === 'end';
    if (binary || format === 'hex') {
      const selected = tail ? sample.bytes.subarray(-bytes) : sample.bytes.subarray(0, bytes);
      const offset = sample.offset + (tail ? sample.bytes.length - selected.length : 0);
      const hex = hexPreview(selected, offset);
      sections.push({ key, label: sample.label, kind: 'binary', text: hex, hex, byteCount: selected.length, requested: bytes, offset, bytes: sample.bytes.length, partial: !sample.complete || selected.length < sample.bytes.length, complete: sample.complete, binary: true, lines: hex ? hex.split('\n').map(text => ({ text, number: null })) : [] });
    } else {
      const selected = extractLines(text, { tail, partialStart: !sampleStartsAtLineBoundary(sample.bytes, sample.previous, encoding, sample.offset), partialEnd: !tail && !sample.complete, limit: lines, knownLineNumbers: sample.offset === 0 });
      sections.push({ ...selected, key, label: sample.label, kind: 'text', requested: lines, offset: sample.offset, bytes: sample.bytes.length, partial: !sample.complete || selected.omittedLines || selected.fragment, complete: sample.complete, binary: false });
      if (selected.fragment) warnings.push(`${sample.label}: the byte limit falls inside a long source line; the excerpt contains a line fragment.`);
      if (selected.lines.some(row => row.shortened)) warnings.push(`${sample.label}: long lines are shortened on screen. Copy and download retain the full sampled text.`);
    }
  }
  const isBinary = sections.some(section => section.binary);
  if (isBinary) warnings.push(`Binary or undecodable content is shown as hexadecimal bytes with ASCII alongside (${signature}).`);
  if (identified && ['rar', '7z', 'bz2', 'xz', 'zst'].includes(identified.ext)) warnings.push(`Previewing .${identified.ext} archive contents is unsupported. The byte preview describes the original file.`);
  const partial = sections.some(section => section.partial);
  if (partial) warnings.unshift('Partial preview: showing sampled excerpts.');
  let separation = '';
  if (sections.length === 2) {
    const [head, tail] = sections;
    const gap = head.kind === 'text' && tail.kind === 'text' && tail.startLine != null ? tail.startLine - head.endLine - 1 : null;
    separation = gap > 0 ? `${gap} source lines omitted between excerpts.` : gap != null ? 'These excerpts overlap; they remain separate.' : 'Beginning and end are separate excerpts; intervening content may be omitted.';
  }
  return { name, total, bytesRead, format: archive?.format ?? signature, encoding, warnings: [...new Set(warnings)], archive, sections, partial, isBinary, separation };
}
