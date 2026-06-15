export function parseSequenceInput(input, fallbackTitle = "sequence") {
  const text = String(input ?? "").trim();
  if (!text) {
    return [];
  }

  if (!text.startsWith(">")) {
    return [
      {
        title: fallbackTitle,
        sequence: text.replace(/\s+/g, ""),
        hadHeader: false
      }
    ];
  }

  const records = [];
  const entries = text.split(/\n(?=>)/);

  for (const entry of entries) {
    const lines = entry.split(/\r?\n/);
    const header = lines.shift() ?? "";
    const title = header.replace(/^>\s*/, "").trim() || fallbackTitle;
    const sequence = lines.join("").replace(/\s+/g, "");
    records.push({ title, sequence, hadHeader: true });
  }

  return records;
}

export function formatFastaRecord(title, sequence, lineWidth = 60) {
  const width = Math.max(1, Number.parseInt(lineWidth, 10) || 60);
  const lines = [`>${title}`];

  for (let index = 0; index < sequence.length; index += width) {
    lines.push(sequence.slice(index, index + width));
  }

  return `${lines.join("\n")}\n`;
}

function isLikelySequenceLine(line) {
  const text = String(line ?? "").trim();
  return /[A-Za-z*?]/.test(text) && /^[A-Za-z*.?-]+$/.test(text);
}

function flushFastaRecord(record, output, lineWidth) {
  if (!record) {
    return;
  }
  output.push(record.header);
  const sequence = record.sequenceParts.join("").replace(/\s+/g, "");
  for (let index = 0; index < sequence.length; index += lineWidth) {
    output.push(sequence.slice(index, index + lineWidth));
  }
}

export function wrapFastaText(input, lineWidth = 60) {
  const text = String(input ?? "");
  if (!text.trim().startsWith(">")) {
    return text;
  }
  const width = Math.max(1, Number.parseInt(lineWidth, 10) || 60);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let record = null;

  for (const line of lines) {
    if (line.startsWith(">")) {
      flushFastaRecord(record, output, width);
      record = { header: line, sequenceParts: [] };
      continue;
    }
    if (record && isLikelySequenceLine(line)) {
      record.sequenceParts.push(line.trim());
      continue;
    }
    flushFastaRecord(record, output, width);
    record = null;
    output.push(line);
  }
  flushFastaRecord(record, output, width);

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}
