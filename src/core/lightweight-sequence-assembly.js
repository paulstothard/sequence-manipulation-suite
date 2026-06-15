import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";

export const lightweightAssemblyColumns = [
  { id: "contig", label: "Contig", type: "string" },
  { id: "read", label: "Read", type: "string" },
  { id: "read_length", label: "Read length", type: "number" },
  { id: "orientation", label: "Orientation", type: "string" },
  { id: "placement", label: "Placement", type: "string" },
  { id: "contig_start", label: "Contig start", type: "number" },
  { id: "contig_end", label: "Contig end", type: "number" },
  { id: "overlap_length", label: "Overlap length", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "mismatch_percent", label: "Mismatch percent", type: "number" },
  { id: "contig_length_after", label: "Contig length after", type: "number" }
];

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function padLeft(value, width) {
  return String(value ?? "").padStart(width, " ");
}

function padRight(value, width) {
  const text = String(value ?? "");
  return text.length > width ? `${text.slice(0, Math.max(0, width - 3))}...` : text.padEnd(width, " ");
}

function checkCancelled(context, counter = 0, interval = 256) {
  if (counter % interval === 0) {
    context.throwIfCancelled?.();
  }
}

function normalizeOptions(options = {}) {
  const minOverlap = Math.max(6, Math.min(10000, Number.parseInt(options.minOverlap ?? 20, 10) || 20));
  const requestedMismatchPercent = Number.parseFloat(options.maxMismatchPercent ?? 5);
  const maxMismatchPercent = Math.max(0, Math.min(40, Number.isFinite(requestedMismatchPercent) ? requestedMismatchPercent : 5));
  return {
    minOverlap,
    maxMismatchPercent,
    tryReverseComplement: options.tryReverseComplement !== false,
    maxReads: Math.max(2, Math.min(1000, Number.parseInt(options.maxReads, 10) || 100)),
    lineWidth: Math.max(10, Math.min(200, Number.parseInt(options.lineWidth, 10) || 60))
  };
}

function consensusBase(left, right) {
  if (left === right) return left;
  if (left === "N") return right;
  if (right === "N") return left;
  return "N";
}

function scoreOverlap(left, right, length) {
  let mismatches = 0;
  let consensus = "";
  for (let index = 0; index < length; index += 1) {
    const a = left[left.length - length + index];
    const b = right[index];
    if (a !== b && a !== "N" && b !== "N") {
      mismatches += 1;
    }
    consensus += consensusBase(a, b);
  }
  return { mismatches, mismatchPercent: (mismatches / length) * 100, consensus };
}

function scoreAlignedSegment(container, query, offset) {
  let mismatches = 0;
  for (let index = 0; index < query.length; index += 1) {
    const a = container[offset + index];
    const b = query[index];
    if (a !== b && a !== "N" && b !== "N") {
      mismatches += 1;
    }
  }
  return {
    mismatches,
    mismatchPercent: (mismatches / query.length) * 100
  };
}

function findContainedPlacement(container, query, options, context) {
  if (query.length > container.length || query.length < options.minOverlap) {
    return null;
  }

  let best = null;
  const lastOffset = container.length - query.length;
  for (let offset = 0; offset <= lastOffset; offset += 1) {
    checkCancelled(context, offset);
    const score = scoreAlignedSegment(container, query, offset);
    if (score.mismatchPercent > options.maxMismatchPercent) {
      continue;
    }
    const candidate = {
      length: query.length,
      start: offset + 1,
      end: offset + query.length,
      ...score
    };
    if (
      !best ||
      candidate.mismatches < best.mismatches ||
      (candidate.mismatches === best.mismatches && candidate.start < best.start)
    ) {
      best = candidate;
    }
  }
  return best;
}

function findSuffixPrefixOverlap(left, right, options, context) {
  const maxOverlap = Math.min(left.length, right.length);
  let best = null;
  for (let length = options.minOverlap; length <= maxOverlap; length += 1) {
    checkCancelled(context, length);
    const score = scoreOverlap(left, right, length);
    if (score.mismatchPercent > options.maxMismatchPercent) {
      continue;
    }
    const candidate = { length, ...score };
    if (
      !best ||
      candidate.length > best.length ||
      (candidate.length === best.length && candidate.mismatchPercent < best.mismatchPercent)
    ) {
      best = candidate;
    }
  }
  return best;
}

function mergeAppend(left, right, overlap) {
  return left.slice(0, left.length - overlap.length) + overlap.consensus + right.slice(overlap.length);
}

function isBetterPlacement(candidate, best, currentLength) {
  if (!best) return true;
  if (candidate.overlap.length !== best.overlap.length) {
    return candidate.overlap.length > best.overlap.length;
  }
  if (candidate.overlap.mismatches !== best.overlap.mismatches) {
    return candidate.overlap.mismatches < best.overlap.mismatches;
  }
  const candidateExtension = candidate.mergedSequence.length - currentLength;
  const bestExtension = best.mergedSequence.length - currentLength;
  return candidateExtension > bestExtension;
}

function findBestReadPlacement(contig, read, options, context) {
  const orientations = [
    { orientation: "forward", sequence: read.sequence }
  ];
  if (options.tryReverseComplement) {
    orientations.push({ orientation: "reverse-complement", sequence: reverseComplement(read.sequence) });
  }

  let best = null;
  for (const oriented of orientations) {
    const contained = findContainedPlacement(contig.sequence, oriented.sequence, options, context);
    if (contained) {
      const candidate = {
        read,
        orientation: oriented.orientation,
        placement: "contained",
        overlap: contained,
        sequence: oriented.sequence,
        shift: 0,
        start: contained.start,
        end: contained.end,
        mergedSequence: contig.sequence
      };
      if (isBetterPlacement(candidate, best, contig.sequence.length)) {
        best = candidate;
      }
    }

    const containsContig = findContainedPlacement(oriented.sequence, contig.sequence, options, context);
    if (containsContig && oriented.sequence.length > contig.sequence.length) {
      const candidate = {
        read,
        orientation: oriented.orientation,
        placement: "contains-contig",
        overlap: containsContig,
        sequence: oriented.sequence,
        shift: containsContig.start - 1,
        start: 1,
        end: oriented.sequence.length,
        mergedSequence: oriented.sequence
      };
      if (isBetterPlacement(candidate, best, contig.sequence.length)) {
        best = candidate;
      }
    }

    const append = findSuffixPrefixOverlap(contig.sequence, oriented.sequence, options, context);
    if (append) {
      const candidate = {
        read,
        orientation: oriented.orientation,
        placement: "append",
        overlap: append,
        sequence: oriented.sequence,
        shift: 0,
        start: contig.sequence.length - append.length + 1,
        end: contig.sequence.length + oriented.sequence.length - append.length,
        mergedSequence: mergeAppend(contig.sequence, oriented.sequence, append)
      };
      if (isBetterPlacement(candidate, best, contig.sequence.length)) {
        best = candidate;
      }
    }
    const prepend = findSuffixPrefixOverlap(oriented.sequence, contig.sequence, options, context);
    if (prepend) {
      const candidate = {
        read,
        orientation: oriented.orientation,
        placement: "prepend",
        overlap: prepend,
        sequence: oriented.sequence,
        shift: oriented.sequence.length - prepend.length,
        start: 1,
        end: oriented.sequence.length,
        mergedSequence: mergeAppend(oriented.sequence, contig.sequence, prepend)
      };
      if (isBetterPlacement(candidate, best, contig.sequence.length)) {
        best = candidate;
      }
    }
  }
  return best;
}

function parseReads(input, options, warnings) {
  const parsed = parseSequenceInput(input, "sequence");
  if (parsed.length === 0) {
    warnings.push("No DNA/RNA reads or contigs were provided.");
    return { reads: [], charactersRemoved: 0 };
  }
  if (parsed.length > options.maxReads) {
    warnings.push(`Only the first ${options.maxReads} reads/contigs were assembled; this tool is for small lab-scale assemblies.`);
  }
  let charactersRemoved = 0;
  const reads = parsed.slice(0, options.maxReads).map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title || `Read ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    return {
      title: record.title || `Read ${index + 1}`,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((record) => {
    if (!record.sequence) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
      return false;
    }
    return true;
  });
  return { reads, charactersRemoved };
}

function makeSeedRead(seed) {
  return {
    title: seed.title,
    sequence: seed.sequence,
    readLength: seed.sequence.length,
    orientation: "forward",
    placement: "seed",
    start: 1,
    end: seed.sequence.length,
    overlapLength: "",
    mismatches: "",
    mismatchPercent: "",
    contigLengthAfter: seed.sequence.length
  };
}

function applyPlacement(contig, best) {
  if (best.shift > 0) {
    for (const read of contig.reads) {
      read.start += best.shift;
      read.end += best.shift;
    }
  }

  contig.sequence = best.mergedSequence;
  contig.reads.push({
    title: best.read.title,
    sequence: best.sequence,
    readLength: best.read.sequence.length,
    orientation: best.orientation,
    placement: best.placement,
    start: best.start,
    end: best.end,
    overlapLength: best.overlap.length,
    mismatches: best.overlap.mismatches,
    mismatchPercent: round(best.overlap.mismatchPercent, 3),
    contigLengthAfter: contig.sequence.length
  });
}

function makePlacementRows(contigs) {
  return contigs.flatMap((contig) =>
    contig.reads.map((read) => ({
      contig: contig.id,
      read: read.title,
      read_length: read.readLength,
      orientation: read.orientation,
      placement: read.placement,
      contig_start: read.start,
      contig_end: read.end,
      overlap_length: read.overlapLength,
      mismatches: read.mismatches,
      mismatch_percent: read.mismatchPercent,
      contig_length_after: read.contigLengthAfter
    }))
  );
}

export function assembleLightweightSequences(input, options = {}, context = {}) {
  const normalized = normalizeOptions(options);
  const warnings = [];
  const parsed = parseReads(input, normalized, warnings);
  const reads = parsed.reads.sort((left, right) => right.sequence.length - left.sequence.length);
  const inputBasesProcessed = reads.reduce((sum, read) => sum + read.sequence.length, 0);
  const contigs = [];
  let contigNumber = 0;

  while (reads.length > 0) {
    context.throwIfCancelled?.();
    const seed = reads.shift();
    contigNumber += 1;
    const contig = {
      id: `contig_${contigNumber}`,
      title: `contig_${contigNumber}`,
      sequence: seed.sequence,
      reads: [makeSeedRead(seed)]
    };

    let extended = true;
    while (extended && reads.length > 0) {
      extended = false;
      let best = null;
      for (let index = 0; index < reads.length; index += 1) {
        checkCancelled(context, index);
        const read = reads[index];
        const candidate = findBestReadPlacement(contig, read, normalized, context);
        if (
          candidate && isBetterPlacement(candidate, best, contig.sequence.length)
        ) {
          best = candidate;
        }
      }
      if (best) {
        applyPlacement(contig, best);
        reads.splice(reads.indexOf(best.read), 1);
        extended = true;
      }
    }
    contigs.push(contig);
  }

  if (contigs.length > 1) {
    warnings.push(`${contigs.length} contigs remain after greedy overlap assembly.`);
  }
  const placements = makePlacementRows(contigs);
  return {
    contigs,
    placements,
    warnings,
    options: normalized,
    readsProcessed: contigs.reduce((sum, contig) => sum + contig.reads.length, 0),
    inputBasesProcessed,
    charactersRemoved: parsed.charactersRemoved
  };
}

export function makeAssemblyFasta(result, lineWidth = result.options?.lineWidth ?? 60) {
  return result.contigs.map((contig) =>
    formatFastaRecord(`${contig.title} reads=${contig.reads.length} length=${contig.sequence.length}`, contig.sequence, lineWidth)
  ).join("\n");
}

export function makeAssemblyTsv(rows) {
  const headers = lightweightAssemblyColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => String(row[header] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

function makeCoordinateRuler(start, end, width) {
  const ruler = Array.from({ length: width }, () => " ");
  let lastWrittenEnd = -1;
  for (let position = start; position <= end; position += 1) {
    if (position !== start && position % 10 !== 0 && position !== end) {
      continue;
    }
    const label = String(position);
    const index = position - start;
    if (index <= lastWrittenEnd + 1 || index + label.length > width) {
      continue;
    }
    for (let offset = 0; offset < label.length; offset += 1) {
      ruler[index + offset] = label[offset];
    }
    lastWrittenEnd = index + label.length - 1;
  }
  return ruler.join("");
}

function makeReadMapSegment(read, start, end) {
  const segment = Array.from({ length: end - start + 1 }, () => " ");
  const overlapStart = Math.max(start, read.start);
  const overlapEnd = Math.min(end, read.end);
  if (overlapStart > overlapEnd) {
    return null;
  }
  for (let contigPosition = overlapStart; contigPosition <= overlapEnd; contigPosition += 1) {
    const readIndex = contigPosition - read.start;
    segment[contigPosition - start] = read.sequence?.[readIndex] ?? "N";
  }
  return {
    sequence: segment.join(""),
    start: overlapStart,
    end: overlapEnd
  };
}

export function makeAssemblyTextMap(result, lineWidth = result.options?.lineWidth ?? 80) {
  const width = Math.max(40, Math.min(200, Number.parseInt(lineWidth, 10) || 80));
  const longestReadTitle = Math.max(
    "consensus".length,
    ...result.contigs.flatMap((contig) => contig.reads.map((read) => read.title.length))
  );
  const labelWidth = Math.max(9, Math.min(30, longestReadTitle));
  const orientationWidth = 2;
  const lines = [
    "Lightweight sequence assembly text map",
    "Consensus rows show assembled contigs. Read rows include -> for forward placements and <- for reverse-complement placements; blanks are outside the read span.",
    ""
  ];

  for (const contig of result.contigs) {
    const numberWidth = Math.max(1, String(contig.sequence.length).length);
    lines.push(`${contig.title} (${contig.sequence.length} bp; ${contig.reads.length} read${contig.reads.length === 1 ? "" : "s"})`);
    for (let start = 1; start <= contig.sequence.length; start += width) {
      const end = Math.min(contig.sequence.length, start + width - 1);
      const consensusSegment = contig.sequence.slice(start - 1, end);
      const ruler = makeCoordinateRuler(start, end, end - start + 1);
      lines.push(`${padRight("pos", labelWidth)} ${" ".repeat(orientationWidth)} ${" ".repeat(numberWidth)} ${ruler}`.trimEnd());
      lines.push(`${padRight("consensus", labelWidth)} ${" ".repeat(orientationWidth)} ${padLeft(start, numberWidth)} ${consensusSegment} ${end}`);
      for (const read of contig.reads) {
        const mapped = makeReadMapSegment(read, start, end);
        if (!mapped) {
          continue;
        }
        const orientationMarker = read.orientation === "reverse-complement" ? "<-" : "->";
        lines.push(`${padRight(read.title, labelWidth)} ${orientationMarker} ${padLeft(mapped.start, numberWidth)} ${mapped.sequence} ${mapped.end}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function makeAssemblyReport(result) {
  const lines = [
    "Lightweight sequence assembly",
    `Reads/contigs processed: ${result.readsProcessed}`,
    `Contigs produced: ${result.contigs.length}`,
    `Minimum overlap: ${result.options.minOverlap} bp`,
    `Maximum mismatch rate: ${result.options.maxMismatchPercent}%`,
    `Reverse-complement orientation testing: ${result.options.tryReverseComplement ? "automatic" : "disabled"}`,
    "",
    "Contigs"
  ];
  for (const contig of result.contigs) {
    lines.push(`${contig.title}: ${contig.sequence.length} bp from ${contig.reads.length} read(s)`);
    lines.push(`  ${contig.reads.map((read) => `${read.title} (${read.orientation}, ${read.placement})`).join("; ")}`);
  }
  lines.push("", "Scope note: this is a small lab-scale greedy overlap assembler, not a whole-genome or NGS assembler.");
  return lines.join("\n").trimEnd() + "\n";
}
