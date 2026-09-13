const DNA_RNA_SYMBOLS = new Set("ACGTUNRYSWKMBDHV".split(""));
const PROTEIN_SYMBOLS = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ*".split(""));

function getLines(text = "") {
  const source = String(text ?? "");
  const lines = [];
  let start = 0;
  while (start <= source.length) {
    const newline = source.indexOf("\n", start);
    const rawEnd = newline === -1 ? source.length : newline;
    const end = rawEnd > start && source[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
    lines.push({ text: source.slice(start, end), start, end });
    if (newline === -1) break;
    start = newline + 1;
  }
  return lines;
}

function normalizedAlphabet(value = "") {
  const alphabet = String(value ?? "").toLowerCase();
  if (alphabet === "coding-dna") return "dna-rna";
  if (alphabet === "dna" || alphabet === "rna" || alphabet === "nucleotide") return "dna-rna";
  return alphabet === "protein" ? "protein" : alphabet === "dna-rna" ? "dna-rna" : "sequence";
}

function symbolAllowed(symbol, alphabet) {
  if (alphabet === "dna-rna") return DNA_RNA_SYMBOLS.has(symbol);
  if (alphabet === "protein") return PROTEIN_SYMBOLS.has(symbol);
  return PROTEIN_SYMBOLS.has(symbol);
}

function makeTrackCollector(defaultAlphabet = "sequence") {
  const tracks = new Map();

  function getTrack(id, label, alphabet = defaultAlphabet) {
    if (!tracks.has(id)) {
      tracks.set(id, {
        id,
        label: label || "sequence",
        alphabet: normalizedAlphabet(alphabet || defaultAlphabet),
        sequenceParts: [],
        offsets: []
      });
    }
    return tracks.get(id);
  }

  function append(id, label, alphabet, chunk, displayStart) {
    const track = getTrack(id, label, alphabet);
    let sequencePart = "";
    for (let index = 0; index < chunk.length; index += 1) {
      const symbol = chunk[index].toUpperCase();
      if (!symbolAllowed(symbol, track.alphabet)) continue;
      sequencePart += symbol;
      track.offsets.push(displayStart + index);
    }
    if (sequencePart) track.sequenceParts.push(sequencePart);
  }

  function finish() {
    return [...tracks.values()]
      .map((track) => ({
        id: track.id,
        label: track.label,
        alphabet: track.alphabet,
        sequence: track.sequenceParts.join(""),
        displayOffsets: Uint32Array.from(track.offsets)
      }))
      .filter((track) => track.sequence.length > 0);
  }

  return { append, finish };
}

function parseFasta(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  let recordIndex = -1;
  let title = "";
  let inRecord = false;
  for (const line of getLines(text)) {
    if (line.text.startsWith(">")) {
      recordIndex += 1;
      title = line.text.slice(1).trim() || `record ${recordIndex + 1}`;
      inRecord = true;
      continue;
    }
    if (!inRecord || !line.text.trim()) continue;
    collector.append(`record-${recordIndex}`, title, descriptor.alphabet, line.text, line.start);
  }
  return collector.finish();
}

function parsePlainSequence(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  let section = 0;
  let active = false;
  for (const line of getLines(text)) {
    const trimmed = line.text.trim();
    if (!trimmed) {
      if (active) section += 1;
      active = false;
      continue;
    }
    const compact = trimmed.replace(/\s+/g, "").toUpperCase();
    const alphabet = normalizedAlphabet(descriptor.alphabet);
    if (!compact || [...compact].some((symbol) => !symbolAllowed(symbol, alphabet))) {
      if (active) section += 1;
      active = false;
      continue;
    }
    collector.append(`plain-${section}`, `sequence ${section + 1}`, alphabet, line.text, line.start);
    active = true;
  }
  return collector.finish();
}

function parseGrouped(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  const lines = getLines(text);
  let recordIndex = -1;
  let title = "";
  let sequenceLine = 0;
  let needsTitle = true;
  for (const line of lines) {
    if (!line.text.trim()) {
      needsTitle = true;
      continue;
    }
    if (needsTitle) {
      recordIndex += 1;
      title = line.text.trim().replace(/\s+grouped$/i, "") || `record ${recordIndex + 1}`;
      sequenceLine = 0;
      needsTitle = false;
      continue;
    }
    const strand = descriptor.showComplement && sequenceLine % 2 === 1 ? "complement" : "forward";
    collector.append(
      `record-${recordIndex}-${strand}`,
      `${title} · ${strand}`,
      descriptor.alphabet,
      line.text,
      line.start
    );
    sequenceLine += 1;
  }
  return collector.finish();
}

function parseLabelledBlocks(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  let recordIndex = 0;
  let title = "record 1";
  for (const line of getLines(text)) {
    if (line.text.startsWith(">")) {
      title = line.text.slice(1).replace(/\s+(?:text annotation|translation) map$/i, "").trim() || `record ${recordIndex + 1}`;
      recordIndex += 1;
      continue;
    }
    const match = line.text.match(/^\s*(seq|comp|aa)\s+(.+)$/i);
    if (!match) continue;
    const lane = match[1].toLowerCase();
    const chunk = match[2];
    const chunkStart = line.start + line.text.indexOf(chunk);
    const alphabet = lane === "aa" ? "protein" : descriptor.alphabet;
    const laneLabel = lane === "comp" ? "complement" : lane === "aa" ? "translation" : "forward";
    collector.append(
      `record-${recordIndex}-${lane}`,
      `${title} · ${laneLabel}`,
      alphabet,
      chunk,
      chunkStart
    );
  }
  return collector.finish();
}

function parseClustal(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  let laneIndex = 0;
  for (const line of getLines(text)) {
    if (!line.text) {
      laneIndex = 0;
      continue;
    }
    if (/^\s/.test(line.text) || /^CLUSTAL\b/i.test(line.text)) continue;
    const match = line.text.match(/^(\S+)\s+([A-Za-z*.-]+)(?:\s+\d+)?\s*$/);
    if (!match) continue;
    const chunkStart = line.start + line.text.indexOf(match[2], match[1].length);
    collector.append(`clustal-lane-${laneIndex}`, match[1], descriptor.alphabet, match[2], chunkStart);
    laneIndex += 1;
  }
  return collector.finish();
}

function parsePairwise(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  let proteinRow = 0;
  let sequenceLane = 0;
  for (const line of getLines(text)) {
    if (!line.text.trim()) {
      proteinRow = 0;
      sequenceLane = 0;
      continue;
    }
    const coordinateMatch = line.text.match(/^(.+?)\s+(\d+)\s+([A-Za-z*.-]+(?:\s+[A-Za-z*.-]+)*)\s+(-?\d+)\s*$/);
    if (coordinateMatch) {
      const label = coordinateMatch[1].trim();
      const chunk = coordinateMatch[3];
      const chunkStart = line.start + line.text.indexOf(chunk, coordinateMatch[1].length);
      collector.append(`pairwise-lane-${sequenceLane}`, label, descriptor.alphabet, chunk, chunkStart);
      sequenceLane += 1;
      continue;
    }
    const proteinMatch = line.text.match(/^\s*protein\s+((?:[A-Za-z*.-]\s*)+)$/i);
    if (!proteinMatch) continue;
    const chunk = proteinMatch[1];
    const chunkStart = line.start + line.text.lastIndexOf(chunk);
    collector.append(`pairwise-protein-${proteinRow}`, `translation ${proteinRow + 1}`, "protein", chunk, chunkStart);
    proteinRow = (proteinRow + 1) % 2;
  }
  return collector.finish();
}

function parseAssembly(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  let section = 0;
  let sectionTitle = "contig 1";
  let labelOccurrences = new Map();
  for (const line of getLines(text)) {
    const heading = line.text.match(/^(.+?)\s+\(\d+\s+bp;\s+\d+\s+read/i);
    if (heading) {
      section += 1;
      sectionTitle = heading[1].trim();
      labelOccurrences = new Map();
      continue;
    }
    if (/^pos\s+/i.test(line.text)) {
      labelOccurrences = new Map();
      continue;
    }
    const match = line.text.match(/^(.*?)(?:\s+(->|<-))?\s+(\d+)\s+([A-Za-z*.-][A-Za-z* .-]*?)\s+(-?\d+)\s*$/);
    if (!match) continue;
    const label = match[1].trim();
    if (!label || label.toLowerCase() === "pos") continue;
    const orientation = match[2] === "<-" ? "reverse complement" : match[2] === "->" ? "forward" : "consensus";
    const chunk = match[4];
    const chunkStart = line.start + line.text.indexOf(chunk, match[1].length);
    const occurrence = labelOccurrences.get(label) ?? 0;
    labelOccurrences.set(label, occurrence + 1);
    collector.append(
      `assembly-${section}-${label}-${orientation}-${occurrence}`,
      `${sectionTitle} · ${label} · ${orientation}`,
      descriptor.alphabet,
      chunk,
      chunkStart
    );
  }
  return collector.finish();
}

function parseContext(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet);
  const acceptedLabels = /^(guide(?: rna| antisense)?|sense target|context|pam|target|left(?: site)?|right(?: site)?)$/i;
  let section = 0;
  for (const line of getLines(text)) {
    if (!line.text.trim()) {
      section += 1;
      continue;
    }
    const labelled = line.text.match(/^\s*([^:]+):\s*([A-Za-z*.-]+)/);
    if (labelled && acceptedLabels.test(labelled[1].trim())) {
      const chunk = labelled[2];
      const chunkStart = line.start + line.text.indexOf(chunk, line.text.indexOf(":") + 1);
      collector.append(`context-${section}-${labelled[1].trim()}`, labelled[1].trim(), descriptor.alphabet, chunk, chunkStart);
      continue;
    }
    const bare = line.text.match(/^\s*([A-Za-z*.-]+)\s*$/);
    if (bare) {
      const chunkStart = line.start + line.text.indexOf(bare[1]);
      collector.append(`context-${section}-sequence`, `candidate ${section + 1}`, descriptor.alphabet, bare[1], chunkStart);
    }
  }
  return collector.finish();
}

function parseFlatfile(text, descriptor) {
  const collector = makeTrackCollector(descriptor.alphabet || "dna-rna");
  let recordIndex = 0;
  let title = "record 1";
  let inSequence = false;
  for (const line of getLines(text)) {
    const locus = line.text.match(/^LOCUS\s+(\S+)/i) ?? line.text.match(/^ID\s+(\S+)/i);
    if (locus) title = locus[1];
    if (/^(ORIGIN|SQ\s)/i.test(line.text)) {
      inSequence = true;
      continue;
    }
    if (line.text.startsWith("//")) {
      if (inSequence) recordIndex += 1;
      inSequence = false;
      title = `record ${recordIndex + 1}`;
      continue;
    }
    if (!inSequence) continue;
    collector.append(`flatfile-${recordIndex}`, title, descriptor.alphabet || "dna-rna", line.text, line.start);
  }
  const flatfileTracks = collector.finish();
  const fastaTracks = parseFasta(text, descriptor).map((track) => ({ ...track, id: `embedded-${track.id}` }));
  return [...flatfileTracks, ...fastaTracks];
}

export function inferSequenceSearchDescriptor({
  descriptor,
  format = "",
  filename = "",
  mimeType = "",
  toolId = "",
  alphabet = "",
  options = {}
} = {}) {
  if (descriptor?.format) return { ...descriptor, alphabet: normalizedAlphabet(descriptor.alphabet || alphabet) };
  const normalizedFormat = String(format ?? "").toLowerCase();
  const normalizedFilename = String(filename ?? "").toLowerCase();
  const normalizedMime = String(mimeType ?? "").toLowerCase();
  const normalizedTool = String(toolId ?? "").toLowerCase();
  const inferredAlphabet = normalizedAlphabet(
    alphabet || (normalizedFormat.includes("protein") || normalizedTool.includes("protein") ? "protein" : "dna-rna")
  );

  if (normalizedTool.startsWith("group-number-")) {
    return {
      format: "grouped",
      alphabet: inferredAlphabet,
      showComplement: normalizedTool.endsWith("dna-rna") && options.showComplement !== false
    };
  }
  if (normalizedFormat === "plain" && normalizedTool === "translate") {
    return { format: "plain", alphabet: "protein" };
  }
  if (normalizedFormat.includes("assembly-text-map") || (normalizedFormat === "text-map" && normalizedTool.includes("assembly"))) {
    return { format: "assembly", alphabet: "dna-rna" };
  }
  if (normalizedFormat.includes("text-map")) {
    return { format: "labelled-blocks", alphabet: inferredAlphabet };
  }
  if (normalizedFormat === "clustal") {
    return { format: "clustal", alphabet: inferredAlphabet };
  }
  if (normalizedFormat === "alignment-text") {
    return { format: "pairwise", alphabet: inferredAlphabet };
  }
  if (normalizedFormat === "context-text") {
    return { format: "context", alphabet: inferredAlphabet };
  }
  if (["genbank", "embl", "ddbj", "gff3-bundle", "bed-bundle", "gff3-fasta", "bed-fasta"].includes(normalizedFormat)) {
    return { format: "flatfile", alphabet: "dna-rna" };
  }
  const fastaFilename = /\.(?:fa|fasta|fna|ffn|faa)(?:\.[^.]+)?$/i.test(normalizedFilename) && !normalizedFilename.endsWith(".fai");
  if (normalizedMime.includes("text/x-fasta") || normalizedFormat.includes("fasta") || fastaFilename) {
    return { format: "fasta", alphabet: inferredAlphabet };
  }
  return null;
}

export function buildSequenceSearchDocument(text = "", descriptor = null) {
  if (!descriptor?.format) return null;
  const normalized = {
    ...descriptor,
    alphabet: normalizedAlphabet(descriptor.alphabet)
  };
  const parsers = {
    fasta: parseFasta,
    plain: parsePlainSequence,
    grouped: parseGrouped,
    "labelled-blocks": parseLabelledBlocks,
    clustal: parseClustal,
    pairwise: parsePairwise,
    assembly: parseAssembly,
    context: parseContext,
    flatfile: parseFlatfile
  };
  const tracks = parsers[normalized.format]?.(String(text ?? ""), normalized) ?? [];
  return tracks.length > 0 ? { format: normalized.format, tracks } : null;
}

export function normalizeSequenceQuery(query = "") {
  return String(query ?? "").replace(/\s+/g, "").toUpperCase();
}

function coalesceDisplayOffsets(offsets) {
  const ranges = [];
  for (const offset of offsets) {
    const previous = ranges.at(-1);
    if (previous && previous.end === offset) {
      previous.end = offset + 1;
    } else {
      ranges.push({ start: offset, end: offset + 1 });
    }
  }
  return ranges;
}

export function findSequenceTextMatches(document, query = "") {
  const needle = normalizeSequenceQuery(query);
  if (!needle || !document?.tracks?.length) return [];
  const matches = [];
  for (const track of document.tracks) {
    if ([...needle].some((symbol) => !symbolAllowed(symbol, track.alphabet))) continue;
    let index = track.sequence.indexOf(needle);
    while (index !== -1) {
      const ranges = coalesceDisplayOffsets(track.displayOffsets.slice(index, index + needle.length));
      if (ranges.length > 0) {
        matches.push({
          start: ranges[0].start,
          end: ranges.at(-1).end,
          ranges,
          type: "sequence",
          trackId: track.id,
          trackLabel: track.label,
          alphabet: track.alphabet
        });
      }
      index = track.sequence.indexOf(needle, index + needle.length);
    }
  }
  return matches.sort((left, right) => left.start - right.start || left.end - right.end || left.trackId.localeCompare(right.trackId));
}
