export class BoundedTextBuilder {
  constructor(maxCharacters, label = "Materialized output") {
    this.maxCharacters = maxCharacters;
    this.label = label;
    this.length = 0;
    this.parts = [];
  }

  append(value) {
    const text = String(value ?? "");
    const nextLength = this.length + text.length;
    if (nextLength > this.maxCharacters) {
      throw new Error(`${this.label} would contain more than ${this.maxCharacters.toLocaleString()} characters. Choose a summary/table output or reduce the selected source.`);
    }
    if (text) this.parts.push(text);
    this.length = nextLength;
  }

  toString() {
    return this.parts.join("");
  }
}

export class StreamingFastaFormatter {
  constructor(builder, lineWidth = 60) {
    this.builder = builder;
    this.lineWidth = Math.max(1, Number.parseInt(lineWidth, 10) || 60);
    this.pending = "";
    this.inRecord = false;
  }

  startRecord(title) {
    if (this.inRecord) throw new Error("Finish the current FASTA record before starting another.");
    if (/\r|\n/.test(String(title))) throw new Error("FASTA titles must not contain line breaks.");
    this.builder.append(`>${title}\n`);
    this.pending = "";
    this.inRecord = true;
  }

  appendSequence(value) {
    if (!this.inRecord) throw new Error("Start a FASTA record before appending sequence.");
    const text = this.pending + String(value ?? "");
    const completeLength = text.length - (text.length % this.lineWidth);
    if (completeLength > 0) {
      const lines = [];
      for (let start = 0; start < completeLength; start += this.lineWidth) {
        lines.push(text.slice(start, start + this.lineWidth));
      }
      this.builder.append(`${lines.join("\n")}\n`);
    }
    this.pending = text.slice(completeLength);
  }

  finishRecord() {
    if (!this.inRecord) return;
    if (this.pending) this.builder.append(`${this.pending}\n`);
    this.pending = "";
    this.inRecord = false;
  }
}

function escapeDelimitedValue(value, delimiter) {
  return String(value ?? "")
    .replaceAll(delimiter, " ")
    .replace(/\r?\n/g, " ");
}

export function makeBoundedTsv(columns, rows, maxCharacters, label = "Selected table output") {
  const builder = new BoundedTextBuilder(maxCharacters, label);
  const ids = columns.map((column) => typeof column === "string" ? column : column.id);
  builder.append(ids.join("\t"));
  for (const row of rows) {
    builder.append("\n");
    builder.append(ids.map((id) => escapeDelimitedValue(row[id], "\t")).join("\t"));
  }
  return builder.toString();
}
