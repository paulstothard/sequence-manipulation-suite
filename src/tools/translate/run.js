import { normalizeTranslateOptions, TRANSLATE_LIMITS as limits } from "../../core/translate-options.js";
import { exportDelimitedTable } from "../../core/table.js";
import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { getGeneticCode } from "../../core/genetic-code.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "../../core/sequence.js";
import { translateSequence } from "../../core/translation.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export { translateSequence } from "../../core/translation.js";

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
  return FRAME_SETS[frameOption];
}

function formatPlainTranslation(recordTitle, frame, protein, includeTitle) {
  if (!includeTitle) {
    return protein;
  }

  return `${recordTitle} translated ${frame.label}\n${protein}`;
}

function makeTsv(rows) {
  return exportDelimitedTable(translationTableColumns.map(column => ({ ...column, label: column.id })), rows);
}

function makeRuler(start, end, width) {
  if (start === end) return String(start);
  if (width < String(start).length + String(end).length + 1) return `${start}-${end}`;
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

function* makeTranslationTextMap(mapRecords, options = {}) {
  const width = options.textMapWidth;
  const sections = [];
  let outputSize = 0;
  for (const record of mapRecords) {
    const sequence = record.sequence;
    const sourceDescription = record.uppercaseOnly
      ? "uppercase text"
      : record.reverse
        ? "reverse complement"
        : "forward";
    const lines = [
      `${record.title} text annotation map`,
      `displayed sequence: ${sourceDescription}; frame ${record.frame}; genetic code ${record.geneticCode}; positions in displayed sequence`
    ];
    for (let start = 1; start <= sequence.length; start += width) {
      const end = Math.min(sequence.length, start + width - 1);
      const chunk = sequence.slice(start - 1, end);
      const aaLine = Array.from({ length: chunk.length }, () => " ");
      const firstCodon = Math.max(0, Math.ceil((start - record.offset - 1) / 3));
      for (let aaIndex = firstCodon, codonStart = record.offset + 1 + firstCodon * 3;
        codonStart <= end && codonStart + 2 <= sequence.length; aaIndex += 1, codonStart += 3) {
        aaLine[codonStart - start] = record.protein[aaIndex];
      }
      if ((start - 1) % (width * 256) === 0) yield {phase: "building-map"};
      lines.push(
        "",
        formatMapLine("pos", makeRuler(start, end, chunk.length)),
        formatMapLine("aa", aaLine.join("").trimEnd()),
        formatMapLine("seq", chunk)
      );
    }
    const section = lines.join("\n").trimEnd();
    outputSize += section.length + (sections.length ? 2 : 0);
    if (outputSize > limits.outputCharacters) throw new Error(`Selected output exceeds ${limits.outputCharacters.toLocaleString()} characters. Split the input.`);
    sections.push(section);
  }
  return sections.join("\n\n");
}

export const translationTableColumns = [
  { id: "record_index", label: "Source record", type: "number" },
  { id: "source_title", label: "Source title", type: "string" },
  { id: "title", label: "Protein title", type: "string" },
  { id: "frame", label: "Frame", type: "string" },
  { id: "genetic_code", label: "Genetic code", type: "string" },
  { id: "length", label: "Protein positions", type: "number" },
  { id: "ambiguous_codons", label: "Ambiguous codons", type: "number" },
  { id: "trailing_bases", label: "Trailing bases", type: "number" },
  { id: "reverse", label: "Reverse strand", type: "boolean" },
  { id: "offset", label: "Offset", type: "number" }
];

function* translateSteps(input, options = {}) {
  yield {phase: "reading-input", progress: 0};
  options = normalizeTranslateOptions(options);
  const source = String(input ?? "");
  if (source.length > limits.inputCharacters) throw new Error(`Translation accepts at most ${limits.inputCharacters.toLocaleString()} input characters. Split the input into smaller batches.`);
  const records = parseSequenceInput(source, "sequence", { strictHeaders: true });
  if (records.length > limits.records) throw new Error(`Translation accepts at most ${limits.records.toLocaleString()} records per run.`);
  const warnings = [], notes = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0, optionsUsed: options
    });
  }

  const outputParts = [];
  const translatedRecords = [];
  const textMapRecords = [];
  const translationRows = [];
  const frames = getFrames(options.frame);
  const {outputFormat, lineWidth} = options;
  const formatFasta = outputFormat === "fasta";
  const code = getGeneticCode(options.geneticCode);
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let mapBases = 0, outputSize = 0;

  for (const [recordIndex, record] of records.entries()) {
    yield {phase: "translating", progress: 0.1 + 0.75 * recordIndex / records.length};
    if (record.title.length > limits.titleCharacters) throw new Error(`Record ${recordIndex + 1}: use a title of at most ${limits.titleCharacters} characters.`);
    const usesUppercaseText = frames.some((frame) => frame.uppercaseOnly);
    const cleaned = usesUppercaseText
      ? cleanUppercaseDnaRnaText(record.sequence)
      : cleanDnaRnaSequence(record.sequence, {
        preserveCase: false,
        keepGaps: false
      });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += record.sequence.length - cleaned.sequence.length;
    if (basesProcessed > limits.bases) throw new Error(`Translation accepts at most ${limits.bases.toLocaleString()} cleaned bases per run.`);
    mapBases += cleaned.sequence.length * frames.length;
    if (outputFormat === "text-map" && mapBases > limits.mapBases) throw new Error(`Text annotation maps accept at most ${limits.mapBases.toLocaleString()} displayed bases across records and frames. Select fewer records or frames, or another output.`);

    const excludedCharacters = usesUppercaseText ? record.sequence.length - cleaned.sequence.length - cleaned.removedCount : 0;
    const gapCount = usesUppercaseText ? 0 : (record.sequence.match(/[.-]/g) ?? []).length;
    const recordLabel = `R${recordIndex + 1} (${record.title})`;
    if (excludedCharacters) notes.push(`${recordLabel}: excluded ${excludedCharacters} non-uppercase character(s); retained uppercase DNA/RNA letters were joined before translation.`);
    if (gapCount) notes.push(`${recordLabel}: removed ${gapCount} alignment gap character(s).`);
    if (cleaned.removedCount > gapCount) {
      warnings.push(
        usesUppercaseText
          ? `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA uppercase character(s).`
          : `${record.title}: removed ${cleaned.removedCount - gapCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(
        usesUppercaseText
          ? `${record.title}: no uppercase DNA/RNA sequence characters were found.`
          : `${record.title}: no DNA/RNA sequence characters were found.`
      );
    }

    let reverseSequence;
    for (const frame of frames) {
      const sequence = frame.reverse ? (reverseSequence ??= reverseComplement(cleaned.sequence)) : cleaned.sequence;
      const parts = [];
      let length = 0, ambiguousCodons = 0;
      for (let start = frame.offset; start + 3 <= sequence.length; start += 24_576) {
        const chunk = translateSequence(sequence.slice(start, start + 24_576), {geneticCode: code.id});
        if (outputFormat !== "tsv") parts.push(chunk.protein);
        length += chunk.protein.length;
        ambiguousCodons += chunk.ambiguousCodons;
        yield {phase: "translating"};
      }
      const result = {protein: parts.join(""), length, ambiguousCodons, trailingBases: Math.max(0, (sequence.length - frame.offset) % 3)};

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

      const title = `${record.title} translated ${frame.label} code ${code.id}; record_index=${recordIndex + 1}`;
      if (formatFasta) translatedRecords.push({
        record_index: recordIndex + 1,
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
      if (outputFormat === "text-map") textMapRecords.push({
        title,
        sequence,
        frame: frame.label,
        geneticCode: code.id,
        reverse: frame.reverse,
        offset: frame.offset,
        uppercaseOnly: frame.uppercaseOnly === true,
        protein: result.protein
      });
      if (outputFormat === "tsv") {
        const row = {
        record_index: recordIndex + 1,
        source_title: record.title,
        title,
        frame: frame.label,
        genetic_code: code.id,
        length: result.length,
        ambiguous_codons: result.ambiguousCodons,
        trailing_bases: result.trailingBases,
        reverse: frame.reverse,
        offset: frame.offset
        };
        if (translationRows.length >= limits.tableRows) throw new Error(`Translation tables accept at most ${limits.tableRows.toLocaleString()} rows.`);
        outputSize += makeTsv([row]).length - makeTsv([]).length + 1;
        if (outputSize > limits.outputCharacters) throw new Error(`Selected output exceeds ${limits.outputCharacters.toLocaleString()} characters. Split the input.`);
        translationRows.push(row);
      }

      if (formatFasta) {
        outputParts.push(
          formatFastaRecord(
            title,
            result.protein,
            lineWidth
          )
        );
      } else if (outputFormat === "plain") {
        outputParts.push(formatPlainTranslation(records.length > 1 ? `R${recordIndex + 1} · ${record.title}` : record.title, frame, result.protein, frames.length > 1 || records.length > 1));
      }
      if (outputFormat === "fasta" || outputFormat === "plain") {
        outputSize += outputParts.at(-1).length + (outputParts.length > 1 ? (formatFasta ? 1 : 2) : 0);
        if (outputSize > limits.outputCharacters) throw new Error(`Selected output exceeds ${limits.outputCharacters.toLocaleString()} characters. Split the input.`);
      }
    }
  }

  const output = outputFormat === "tsv"
    ? makeTsv(translationRows)
    : outputFormat === "text-map"
      ? yield* makeTranslationTextMap(textMapRecords, options)
      : outputParts.join(formatFasta ? "\n" : "\n\n");
  if (output.length > limits.outputCharacters) throw new Error(`Selected output exceeds ${limits.outputCharacters.toLocaleString()} characters. Split the input.`);
  yield {phase: "building-output", progress: 0.95};
  const streams = {};
  if (formatFasta) {
    streams.fasta = makeTextStream(output, "text/x-fasta");
    streams.proteinRecords = {kind: "sequence-records", schema: "translated-protein-records", alphabet: "protein", records: translatedRecords};
  } else if (outputFormat === "tsv") {
    streams.table = makeTableStream(translationTableColumns, translationRows, "translate-dna-rna");
    streams.translations = streams.table;
  } else if (outputFormat === "text-map") {
    streams.textMap = makeTextStream(output, "text/plain", {format: "labelled-blocks", alphabet: "dna-rna", plainMapHeadings: true});
  }

  return makeToolResult({
    output,
    sequenceSearch: outputFormat === "fasta"
      ? { format: "fasta", alphabet: "protein" }
      : outputFormat === "plain"
        ? { format: "plain", alphabet: "protein" }
        : outputFormat === "text-map"
          ? { format: "labelled-blocks", alphabet: "dna-rna", plainMapHeadings: true }
          : undefined,
    download: {
      filename: outputFormat === "tsv" ? "translate.tsv" : outputFormat === "fasta" ? "translate.fasta" : "translate.txt",
      mimeType: outputFormat === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings, notes,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    optionsUsed: options,
    streams
  });
}

// Both public entry points drain the same computation. The worker only adds scheduling.
export function runTranslate(input, options = {}) {
  const steps = translateSteps(input, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export async function runTranslateWorker(input, options = {}, context = {}) {
  const steps = translateSteps(input, options);
  let lastYield = -Infinity;
  context.throwIfCancelled?.();
  let step = steps.next();
  while (!step.done) {
    context.throwIfCancelled?.();
    if (performance.now() - lastYield >= 8) {
      context.reportProgress?.(step.value);
      await context.yieldIfNeeded?.();
      lastYield = performance.now();
    }
    context.throwIfCancelled?.();
    step = steps.next();
  }
  context.throwIfCancelled?.();
  context.reportProgress?.({phase: "finished", progress: 1});
  return step.value;
}
