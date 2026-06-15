export const fastaFaiIndexColumns = [
  { id: "record", label: "Record", type: "number" },
  { id: "name", label: "FASTA ID", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "offset", label: "Byte offset", type: "number" },
  { id: "line_bases", label: "Bases per line", type: "number" },
  { id: "line_width", label: "Bytes per line", type: "number" },
  { id: "title", label: "Full title", type: "string" }
];

function makeWarning(message) {
  return message;
}

function splitLinesWithEndings(text) {
  const lines = [];
  const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const content = match[1];
    const eol = match[2];
    if (content.length === 0 && eol.length === 0) {
      break;
    }
    lines.push({ content, eol });
  }
  return lines;
}

function assertAscii(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) {
      throw new Error("FASTA indexing requires plain ASCII text so byte offsets match the FASTA file.");
    }
  }
}

function makeLineEndingSummary(lines) {
  const counts = new Map();
  for (const line of lines) {
    if (!line.eol) continue;
    const key = line.eol === "\r\n" ? "CRLF" : line.eol === "\r" ? "CR" : "LF";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return "none at end of file";
  }
  return [...counts.entries()]
    .map(([label, count]) => `${label} (${count})`)
    .join(", ");
}

function normalizeName(title, recordNumber) {
  const name = String(title ?? "").trim().split(/\s+/)[0] ?? "";
  return name || `record_${recordNumber}`;
}

function validateSequenceLines(record) {
  if (record.sequenceLines.length === 0) {
    return [makeWarning(`Record ${record.record} (${record.name}) has no sequence and was omitted from the FAI index.`)];
  }

  const [firstLine] = record.sequenceLines;
  for (let index = 0; index < record.sequenceLines.length - 1; index += 1) {
    const line = record.sequenceLines[index];
    if (line.bases !== firstLine.bases || line.width !== firstLine.width) {
      throw new Error(
        `Record ${record.record} (${record.name}) has inconsistent sequence line length before the final line at input line ${line.lineNumber}. Rewrap the FASTA before creating an index.`
      );
    }
  }

  const lastLine = record.sequenceLines.at(-1);
  if (record.sequenceLines.length > 1 && lastLine.bases > firstLine.bases) {
    throw new Error(
      `Record ${record.record} (${record.name}) has a final sequence line longer than the first sequence line. Rewrap the FASTA before creating an index.`
    );
  }

  return [];
}

function rowFromRecord(record) {
  const [firstLine] = record.sequenceLines;
  return {
    record: record.record,
    name: record.name,
    length: record.length,
    offset: record.offset,
    line_bases: firstLine?.bases ?? 0,
    line_width: firstLine?.width ?? 0,
    title: record.title
  };
}

export function makeFaiIndexText(rows) {
  return rows
    .map((row) => [
      row.name,
      row.length,
      row.offset,
      row.line_bases,
      row.line_width
    ].join("\t"))
    .join("\n") + (rows.length > 0 ? "\n" : "");
}

export function makeFastaIndexReport(result) {
  const duplicateText = result.duplicateNames.length > 0
    ? result.duplicateNames.join(", ")
    : "none";
  return [
    "FASTA index creator",
    "",
    "Output: .fai index for uncompressed FASTA.",
    `Records indexed: ${result.rows.length}`,
    `Total bases: ${result.totalBases}`,
    `Input characters: ${result.inputCharacters}`,
    `Line endings: ${result.lineEndings}`,
    `Duplicate FASTA IDs: ${duplicateText}`,
    "",
    "Index policy:",
    "- Coordinates that use this index are byte-based; the .fai must be kept with the exact FASTA file used to create it.",
    "- Ordinary .fa.gz files are not random-access indexed FASTA. Decompress them first, or use a BGZF-specific workflow that also creates a .gzi sidecar."
  ].join("\n") + "\n";
}

export async function buildFastaFaiIndex(input, options = {}, context = {}) {
  const text = String(input ?? "");
  if (!text.trim()) {
    throw new Error("FASTA input is required to create an index.");
  }
  if (options.inputFilename && /\.(gz|bgz|bgzf)$/i.test(String(options.inputFilename))) {
    throw new Error("This tool creates .fai indexes for uncompressed FASTA. Decompress ordinary .gz files first; BGZF FASTA also needs a .gzi sidecar.");
  }
  assertAscii(text);

  const lines = splitLinesWithEndings(text);
  const records = [];
  const warnings = [];
  let current = null;
  let byteOffset = 0;
  let sawHeader = false;
  let nextRecordNumber = 1;

  function finishRecord() {
    if (!current) {
      return;
    }
    const validationWarnings = validateSequenceLines(current);
    warnings.push(...validationWarnings);
    if (current.sequenceLines.length > 0) {
      records.push(current);
    }
    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    context.throwIfCancelled?.();
    if (index > 0 && index % 1000 === 0) {
      context.reportProgress?.({
        phase: "indexing-fasta",
        progress: Math.min(0.7, index / Math.max(lines.length, 1) * 0.7)
      });
      await context.yieldIfNeeded?.();
    }

    const lineNumber = index + 1;
    const { content, eol } = lines[index];
    const lineBytes = content.length + eol.length;

    if (content.startsWith(">")) {
      finishRecord();
      sawHeader = true;
      const title = content.slice(1).trim();
      const recordNumber = nextRecordNumber;
      nextRecordNumber += 1;
      current = {
        record: recordNumber,
        title,
        name: normalizeName(title, recordNumber),
        length: 0,
        offset: null,
        sequenceLines: []
      };
      if (!title) {
        warnings.push(makeWarning(`Record ${recordNumber} has an empty FASTA title; using ${current.name} in the index.`));
      }
      byteOffset += lineBytes;
      continue;
    }

    if (!current) {
      if (content.trim()) {
        warnings.push(makeWarning(`Ignored non-FASTA text before the first header at input line ${lineNumber}.`));
      }
      byteOffset += lineBytes;
      continue;
    }

    if (content.length === 0) {
      if (current.sequenceLines.length > 0) {
        throw new Error(`Record ${current.record} (${current.name}) contains a blank sequence line at input line ${lineNumber}; blank lines break FASTA random-access indexing.`);
      }
      byteOffset += lineBytes;
      continue;
    }

    if (/\s/.test(content)) {
      throw new Error(`Record ${current.record} (${current.name}) contains whitespace in a sequence line at input line ${lineNumber}; remove spaces before creating an index.`);
    }

    if (current.offset === null) {
      current.offset = byteOffset;
    }
    current.sequenceLines.push({
      lineNumber,
      bases: content.length,
      width: lineBytes
    });
    current.length += content.length;
    byteOffset += lineBytes;
  }

  finishRecord();

  if (!sawHeader || records.length === 0) {
    throw new Error("No FASTA records with sequence were found.");
  }

  const seenNames = new Map();
  for (const record of records) {
    seenNames.set(record.name, (seenNames.get(record.name) ?? 0) + 1);
  }
  const duplicateNames = [...seenNames.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  if (duplicateNames.length > 0) {
    warnings.push(makeWarning(`Duplicate FASTA IDs in the first title word: ${duplicateNames.join(", ")}. Random-access tools may return only the first matching name.`));
  }

  const rows = records.map(rowFromRecord);
  const totalBases = rows.reduce((sum, row) => sum + row.length, 0);
  return {
    rows,
    records,
    warnings,
    duplicateNames,
    totalBases,
    inputCharacters: text.length,
    lineEndings: makeLineEndingSummary(lines),
    faiText: makeFaiIndexText(rows)
  };
}
