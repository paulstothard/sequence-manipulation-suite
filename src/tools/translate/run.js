import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { getGeneticCode, makeCodonMap } from "../../core/genetic-code.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const FRAME_SETS = {
  "1": [{ label: "+1", offset: 0, reverse: false }],
  "2": [{ label: "+2", offset: 1, reverse: false }],
  "3": [{ label: "+3", offset: 2, reverse: false }],
  "all-forward": [
    { label: "+1", offset: 0, reverse: false },
    { label: "+2", offset: 1, reverse: false },
    { label: "+3", offset: 2, reverse: false }
  ],
  "all-reverse": [
    { label: "-1", offset: 0, reverse: true },
    { label: "-2", offset: 1, reverse: true },
    { label: "-3", offset: 2, reverse: true }
  ],
  "all-six": [
    { label: "+1", offset: 0, reverse: false },
    { label: "+2", offset: 1, reverse: false },
    { label: "+3", offset: 2, reverse: false },
    { label: "-1", offset: 0, reverse: true },
    { label: "-2", offset: 1, reverse: true },
    { label: "-3", offset: 2, reverse: true }
  ],
  uppercase: [{ label: "uppercase text", offset: 0, reverse: false, uppercaseOnly: true }]
};

const UPPERCASE_DNA_RNA_TEXT = /[A-Z]/;

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

export function translateSequence(sequence, options = {}) {
  const code = getGeneticCode(options.geneticCode ?? "1");
  const codonMap = makeCodonMap(code);
  const offset = Math.max(0, Math.min(2, Number.parseInt(options.offset, 10) || 0));
  const source = String(sequence ?? "").toUpperCase().replaceAll("U", "T");
  let protein = "";
  let ambiguousCodons = 0;

  for (let index = offset; index + 3 <= source.length; index += 3) {
    const codon = source.slice(index, index + 3);
    const aa = codonMap.get(codon);

    if (aa) {
      protein += aa;
    } else {
      protein += "X";
      ambiguousCodons += 1;
    }
  }

  return {
    protein,
    ambiguousCodons,
    trailingBases: Math.max(0, (source.length - offset) % 3)
  };
}

export function cleanUppercaseDnaRnaText(sequence) {
  let uppercaseText = "";
  for (const character of String(sequence ?? "")) {
    if (UPPERCASE_DNA_RNA_TEXT.test(character)) {
      uppercaseText += character;
    }
  }

  return cleanDnaRnaSequence(uppercaseText, {
    preserveCase: false,
    keepGaps: false
  });
}

function getFrames(frameOption) {
  return FRAME_SETS[frameOption] ?? FRAME_SETS["1"];
}

function formatPlainTranslation(recordTitle, frame, protein, includeTitle) {
  if (!includeTitle) {
    return protein;
  }

  return `${recordTitle} translated ${frame.label}\n${protein}`;
}

function makeTsv(rows) {
  return [
    translationTableColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => translationTableColumns.map((column) => row[column.id] ?? "").join("\t"))
  ].join("\n");
}

function makeRuler(start, end, width) {
  const line = Array.from({ length: width }, () => " ");
  const labels = [String(start), String(end)];
  const place = (label, index) => {
    const safeIndex = Math.max(0, Math.min(width - label.length, index));
    for (let offset = 0; offset < label.length && safeIndex + offset < width; offset += 1) {
      line[safeIndex + offset] = label[offset];
    }
  };
  place(labels[0], 0);
  place(labels[1], width - labels[1].length);
  return line.join("").trimEnd();
}

function formatMapLine(label, value) {
  return `${label.padEnd(10)}${value}`;
}

function makeTranslationTextMap(mapRecords, options = {}) {
  const width = Math.max(30, Number.parseInt(options.textMapWidth ?? 60, 10) || 60);
  const sections = [];
  for (const record of mapRecords) {
    const sequence = record.sequence;
    const sourceDescription = record.uppercaseOnly
      ? "uppercase text"
      : record.reverse
        ? "reverse complement"
        : "forward";
    const lines = [
      `>${record.title} translation map`,
      `displayed sequence: ${sourceDescription}; frame ${record.frame}; genetic code ${record.geneticCode}`
    ];
    for (let start = 1; start <= sequence.length; start += width) {
      const end = Math.min(sequence.length, start + width - 1);
      const chunk = sequence.slice(start - 1, end);
      const aaLine = Array.from({ length: chunk.length }, () => " ");
      let aaIndex = 0;
      for (let codonStart = record.offset + 1; codonStart + 2 <= sequence.length; codonStart += 3) {
        if (codonStart >= start && codonStart <= end) {
          aaLine[codonStart - start] = record.protein[aaIndex] ?? " ";
        }
        aaIndex += 1;
      }
      lines.push(
        "",
        formatMapLine("pos", makeRuler(start, end, chunk.length)),
        formatMapLine("aa", aaLine.join("").trimEnd()),
        formatMapLine("seq", chunk)
      );
    }
    sections.push(lines.join("\n").trimEnd());
  }
  return sections.join("\n\n");
}

export const translationTableColumns = [
  { id: "source_title", label: "Source title", type: "string" },
  { id: "title", label: "Protein title", type: "string" },
  { id: "frame", label: "Frame", type: "string" },
  { id: "genetic_code", label: "Genetic code", type: "string" },
  { id: "length", label: "Protein length", type: "number" },
  { id: "ambiguous_codons", label: "Ambiguous codons", type: "number" },
  { id: "trailing_bases", label: "Trailing bases", type: "number" },
  { id: "reverse", label: "Reverse strand", type: "boolean" },
  { id: "offset", label: "Offset", type: "number" }
];

export function runTranslate(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const outputParts = [];
  const translatedRecords = [];
  const textMapRecords = [];
  const translationRows = [];
  const frames = getFrames(options.frame);
  const outputFormat = options.outputFormat === "plain" || options.outputFormat === "tsv" || options.outputFormat === "text-map" || options.outputFormat === "fasta"
    ? options.outputFormat
    : options.formatFasta === false
      ? "plain"
      : "fasta";
  const formatFasta = outputFormat === "fasta";
  const lineWidth = options.lineWidth ?? 60;
  const code = getGeneticCode(options.geneticCode ?? "1");
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    const usesUppercaseText = frames.some((frame) => frame.uppercaseOnly);
    const cleaned = usesUppercaseText
      ? cleanUppercaseDnaRnaText(record.sequence)
      : cleanDnaRnaSequence(record.sequence, {
        preserveCase: false,
        keepGaps: false
      });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        usesUppercaseText
          ? `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA uppercase character(s).`
          : `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(
        usesUppercaseText
          ? `${record.title}: no uppercase DNA/RNA sequence characters were found.`
          : `${record.title}: no DNA/RNA sequence characters were found.`
      );
    }

    for (const frame of frames) {
      const sequence = frame.reverse ? reverseComplement(cleaned.sequence) : cleaned.sequence;
      const result = translateSequence(sequence, {
        geneticCode: code.id,
        offset: frame.offset
      });

      if (result.ambiguousCodons > 0) {
        warnings.push(
          `${record.title} ${frame.label}: translated ${result.ambiguousCodons} ambiguous codon(s) as X.`
        );
      }

      if (result.trailingBases > 0) {
        warnings.push(
          `${record.title} ${frame.label}: ignored ${result.trailingBases} trailing base(s) outside a complete codon.`
        );
      }

      const title = `${record.title} translated ${frame.label} code ${code.id}`;
      translatedRecords.push({
        title,
        sequence: result.protein,
        sourceTitle: record.title,
        frame: frame.label,
        geneticCode: code.id,
        reverse: frame.reverse,
        offset: frame.offset,
        ambiguousCodons: result.ambiguousCodons,
        trailingBases: result.trailingBases
      });
      textMapRecords.push({
        title,
        sequence,
        frame: frame.label,
        geneticCode: code.id,
        reverse: frame.reverse,
        offset: frame.offset,
        uppercaseOnly: frame.uppercaseOnly === true,
        protein: result.protein
      });
      translationRows.push({
        source_title: record.title,
        title,
        frame: frame.label,
        genetic_code: code.id,
        length: result.protein.length,
        ambiguous_codons: result.ambiguousCodons,
        trailing_bases: result.trailingBases,
        reverse: frame.reverse,
        offset: frame.offset
      });

      if (formatFasta) {
        outputParts.push(
          formatFastaRecord(
            title,
            result.protein,
            lineWidth
          )
        );
      } else {
        outputParts.push(formatPlainTranslation(record.title, frame, result.protein, frames.length > 1));
      }
    }
  }

  const fastaOutput = translatedRecords
    .map((record) => formatFastaRecord(record.title, record.sequence, lineWidth))
    .join("\n");
  const tableOutput = makeTsv(translationRows);
  const textMapOutput = outputFormat === "text-map" ? makeTranslationTextMap(textMapRecords, options) : "";
  const plainOutput = outputParts.join("\n\n");
  const output = outputFormat === "tsv"
    ? tableOutput
    : outputFormat === "text-map"
      ? textMapOutput
      : formatFasta
        ? outputParts.join("\n")
        : plainOutput;

  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "tsv" ? "translate.tsv" : outputFormat === "fasta" ? "translate.fasta" : "translate.txt",
      mimeType: outputFormat === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      fasta: makeTextStream(fastaOutput, "text/x-fasta"),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMapOutput, "text/plain") } : {}),
      table: makeTableStream(translationTableColumns, translationRows, "translate-dna-rna"),
      translations: makeTableStream(translationTableColumns, translationRows, "translate-dna-rna"),
      proteinRecords: {
        kind: "sequence-records",
        schema: "translated-protein-records",
        alphabet: "protein",
        records: translatedRecords
      }
    }
  });
}

export async function runTranslateWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "translating", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const result = runTranslate(input, options);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
