import { makeTextMapRuler } from "./text-annotation-map.js";
import { exportDelimitedTable } from "./table.js";
import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";
import { normalizeAssemblyOptions, ASSEMBLY_LIMITS as limits } from "./lightweight-assembly-options.js";
export { MAX_ASSEMBLY_RECORDS } from "./lightweight-assembly-options.js";

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
  { id: "contig_length_after", label: "Contig length after", type: "number" },
  { id: "source_index", label: "Input record", type: "number" }
];

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
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

function consensusBase(left, right) {
  if (left === right) return left;
  if (left === "N") return right;
  if (right === "N") return left;
  return "N";
}

function* scoreOverlap(left, right, length, options, context) {
  let mismatches = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[left.length - length + index];
    const b = right[index];
    if (a !== b && a !== "N" && b !== "N") {
      mismatches += 1;
    }
    if (++context.assemblyWork.comparisons > limits.comparisons) throw new Error(`Assembly exceeds the fixed ${limits.comparisons.toLocaleString()} base-comparison budget. Reduce the read set or increase minimum overlap.`);
    if (context.assemblyWork.comparisons % 8192 === 0) { context.throwIfCancelled?.(); yield {phase:'assembling',comparisons:context.assemblyWork.comparisons}; }
    if ((mismatches / length) * 100 > options.maxMismatchPercent) break;
  }
  return { mismatches, mismatchPercent: (mismatches / length) * 100 };
}

function* scoreAlignedSegment(container, query, offset, options, context) {
  let mismatches = 0;
  for (let index = 0; index < query.length; index += 1) {
    const a = container[offset + index];
    const b = query[index];
    if (a !== b && a !== "N" && b !== "N") {
      mismatches += 1;
    }
    if (++context.assemblyWork.comparisons > limits.comparisons) throw new Error(`Assembly exceeds the fixed ${limits.comparisons.toLocaleString()} base-comparison budget. Reduce the read set or increase minimum overlap.`);
    if (context.assemblyWork.comparisons % 8192 === 0) { context.throwIfCancelled?.(); yield {phase:'assembling',comparisons:context.assemblyWork.comparisons}; }
    if ((mismatches / query.length) * 100 > options.maxMismatchPercent) break;
  }
  return {
    mismatches,
    mismatchPercent: (mismatches / query.length) * 100
  };
}

function* findContainedPlacement(container, query, options, context) {
  if (query.length > container.length || query.length < options.minOverlap) {
    return null;
  }

  let best = null;
  const lastOffset = container.length - query.length;
  for (let offset = 0; offset <= lastOffset; offset += 1) {
    checkCancelled(context, offset);
    const score = yield* scoreAlignedSegment(container, query, offset, options, context);
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

function* findSuffixPrefixOverlap(left, right, options, context) {
  const maxOverlap = Math.min(left.length, right.length);
  for (let length = maxOverlap; length >= options.minOverlap; length -= 1) {
    checkCancelled(context, length);
    const score = yield* scoreOverlap(left, right, length, options, context);
    if (score.mismatchPercent > options.maxMismatchPercent) {
      continue;
    }
    // Longest qualifying overlap wins; shorter lengths cannot improve it.
    return { length, ...score };
  }
  return null;
}

function mergeAppend(left, right, overlap) {
  const consensus = Array.from({length:overlap.length}, (_,i)=>consensusBase(left[left.length-overlap.length+i],right[i])).join('');
  return left.slice(0, left.length - overlap.length) + consensus + right.slice(overlap.length);
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

function* findBestReadPlacement(contig, read, options, context) {
  const orientations = [
    { orientation: "forward", sequence: read.sequence }
  ];
  if (options.tryReverseComplement) {
    orientations.push({ orientation: "reverse-complement", sequence: reverseComplement(read.sequence) });
  }

  let best = null;
  for (const oriented of orientations) {
    const contained = yield* findContainedPlacement(contig.sequence, oriented.sequence, options, context);
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

    const containsContig = yield* findContainedPlacement(oriented.sequence, contig.sequence, options, context);
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

    const append = yield* findSuffixPrefixOverlap(contig.sequence, oriented.sequence, options, context);
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
    const prepend = yield* findSuffixPrefixOverlap(oriented.sequence, contig.sequence, options, context);
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

function parseReads(input, options, warnings, notes) {
  const source=String(input??'');
  if(source.length>limits.inputCharacters)throw new Error(`Assembly input exceeds the fixed ${limits.inputCharacters.toLocaleString()}-character limit.`);
  const parsed = parseSequenceInput(source, "sequence", { strictHeaders: true });
  if(parsed.length>limits.inputRecords)throw new Error(`Assembly exceeds the fixed ${limits.inputRecords.toLocaleString()}-record limit.`);
  if (parsed.length === 0) {
    warnings.push("No DNA/RNA reads or contigs were provided.");
    return { reads: [], charactersRemoved: 0 };
  }
  const maxAssemblyRecords = options.maxAssemblyRecords;
  if (parsed.length > maxAssemblyRecords) {
    throw new Error(`Assembly input has ${parsed.length.toLocaleString()} reads/contigs, above the supported maximum of ${maxAssemblyRecords.toLocaleString()}. Reduce the input to run the assembly.`);
  }
  let charactersRemoved = 0, totalBases = 0, gapsRemoved = 0, uracilsConverted = 0;
  const reads = parsed.map((record, index) => {
    if(record.title.length>limits.titleCharacters)throw new Error(`Read ${index+1}: use a title of at most ${limits.titleCharacters} characters.`);
    if(record.sequence.length>limits.readCharacters)throw new Error(`Read ${index+1} exceeds the fixed ${limits.readCharacters.toLocaleString()}-character limit.`);
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    if(cleaned.sequence.length>limits.readBases)throw new Error(`Read ${index+1} exceeds the fixed ${limits.readBases.toLocaleString()}-base limit.`);
    totalBases+=cleaned.sequence.length;
    if(totalBases>limits.totalBases)throw new Error(`Assembly exceeds the fixed ${limits.totalBases.toLocaleString()}-base total limit.`);
    charactersRemoved += cleaned.removedCount;
    const gaps = (record.sequence.match(/[-.]/g) ?? []).length;
    gapsRemoved += gaps;
    uracilsConverted += (cleaned.sequence.match(/U/g) ?? []).length;
    const invalid = cleaned.removedCount - gaps;
    if (invalid > 0) warnings.push(`Input ${index + 1} (${record.title}): removed ${invalid} non-DNA/RNA character(s).`);
    return {
      title: record.title || `Read ${index + 1}`,
      sourceIndex: index + 1,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((record) => {
    if (!record.sequence) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
      return false;
    }
    return true;
  });
  if (gapsRemoved) notes.push(`Removed ${gapsRemoved} alignment gap character(s) before ungapped assembly.`);
  if (uracilsConverted) notes.push(`Converted ${uracilsConverted} uracil base(s) to thymine for DNA consensus.`);
  return { reads, charactersRemoved };
}

function makeSeedRead(seed) {
  return {
    title: seed.title,
    sourceIndex: seed.sourceIndex,
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
  // Keep conflict evidence separately from unknown input Ns: later reads may
  // resolve an unknown call, but must not erase an observed disagreement.
  const conflicts = new Set([...contig.conflicts].map(position => position + best.shift));
  let uncertain = false;
  const consensus = Array.from(best.mergedSequence);
  for (let index = 0; index < contig.sequence.length; index += 1) {
    consensus[index + best.shift] = contig.sequence[index];
  }
  for (let index = 0; index < best.sequence.length; index += 1) {
    const position = best.start - 1 + index;
    const oldPosition = position - best.shift;
    const base = best.sequence[index];
    if (oldPosition < 0 || oldPosition >= contig.sequence.length) {
      consensus[position] = base;
      continue;
    }
    const previous = contig.sequence[oldPosition];
    if (previous === "N" || base === "N") uncertain = true;
    if (previous !== base && previous !== "N" && base !== "N") conflicts.add(position);
    consensus[position] = conflicts.has(position) ? "N" : consensusBase(previous, base);
  }
  contig.conflicts = conflicts;
  if (uncertain) contig.uncertainPlacements += 1;
  if (best.shift > 0) {
    for (const read of contig.reads) {
      read.start += best.shift;
      read.end += best.shift;
    }
  }

  contig.sequence = consensus.join("");
  contig.reads.push({
    title: best.read.title,
    sourceIndex: best.read.sourceIndex,
    sequence: best.sequence,
    readLength: best.read.sequence.length,
    orientation: best.orientation,
    placement: best.placement,
    start: best.start,
    end: best.end,
    overlapLength: best.overlap.length,
    mismatches: best.overlap.mismatches,
    mismatchPercent: best.overlap.mismatchPercent,
    contigLengthAfter: contig.sequence.length
  });
}

function makePlacementRows(contigs) {
  return contigs.flatMap((contig) =>
    contig.reads.map((read) => ({
      contig: contig.id,
      read: read.title,
      source_index: read.sourceIndex,
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

export function* lightweightAssemblySteps(input, options = {}, context = {}) {
  context={...context,assemblyWork:{comparisons:0,readTrials:0}};
  context.throwIfCancelled?.();
  const normalized = normalizeAssemblyOptions(options);
  const warnings = [], notes = [];
  const parsed = parseReads(input, normalized, warnings, notes);
  const reads = parsed.reads.sort((left, right) => right.sequence.length - left.sequence.length);
  const inputBasesProcessed = reads.reduce((sum, read) => sum + read.sequence.length, 0);
  const contigs = [];
  let contigNumber = 0, conflictPositions = 0, uncertainPlacements = 0;

  while (reads.length > 0) {
    context.throwIfCancelled?.();
    const seed = reads.shift();
    contigNumber += 1;
    const contig = {
      id: `contig_${contigNumber}`,
      title: `contig_${contigNumber}`,
      sequence: seed.sequence,
      conflicts: new Set(),
      uncertainPlacements: 0,
      reads: [makeSeedRead(seed)]
    };

    let extended = true;
    while (extended && reads.length > 0) {
      extended = false;
      let best = null;
      for (let index = 0; index < reads.length; index += 1) {
        if(++context.assemblyWork.readTrials>limits.readTrials)throw new Error(`Assembly exceeds the fixed ${limits.readTrials.toLocaleString()} read-trial budget. Reduce the read set.`);
        if(context.assemblyWork.readTrials % 256 === 0)yield {phase:'assembling',readTrials:context.assemblyWork.readTrials};
        checkCancelled(context, index);
        const read = reads[index];
        // Optional domain-specific compatibility (e.g. alternative Sanger
        // candidates sharing one observation). Ordinary assembly is unchanged.
        if (context.canCombineReads?.(contig.reads, read) === false) continue;
        const candidate = yield* findBestReadPlacement(contig, read, normalized, context);
        if (candidate && context.canPlaceRead?.(contig, candidate) === false) continue;
        if (
          candidate && isBetterPlacement(candidate, best, contig.sequence.length)
        ) {
          best = candidate;
          // Remaining reads are no longer than this read. A full, exact overlap
          // reaches the ranking upper bound; stable input order wins ties.
          if(best.overlap.mismatches===0 && best.overlap.length===Math.min(contig.sequence.length,read.sequence.length))break;
        }
      }
      if (best) {
        applyPlacement(contig, best);
        reads.splice(reads.indexOf(best.read), 1);
        extended = true;
      }
    }
    conflictPositions += contig.conflicts.size;
    uncertainPlacements += contig.uncertainPlacements;
    delete contig.conflicts;
    delete contig.uncertainPlacements;
    contigs.push(contig);
  }

  if (conflictPositions) warnings.push(`${conflictPositions} consensus position(s) contain conflicting read calls. Inspect the read map before using the consensus.`);
  if (uncertainPlacements) warnings.push(`${uncertainPlacements} accepted read placement(s) include N in the overlap; these positions do not establish base agreement.`);
  const placements = context.includePlacementRows === false ? undefined : makePlacementRows(contigs);
  return {
    contigs,
    work: {...context.assemblyWork},
    placements,
    warnings,
    notes,
    options: normalized,
    readsProcessed: contigs.reduce((sum, contig) => sum + contig.reads.length, 0),
    inputBasesProcessed,
    charactersRemoved: parsed.charactersRemoved
  };
}

// Synchronous callers and native workers drain the same scientific generator.
export function assembleLightweightSequences(input, options = {}, context = {}) {
  const steps=lightweightAssemblySteps(input,options,context);
  let step=steps.next();
  while(!step.done){context.throwIfCancelled?.();step=steps.next();}
  return step.value;
}

export async function assembleLightweightSequencesAsync(input, options = {}, context = {}) {
  const steps=lightweightAssemblySteps(input,options,context);
  let lastYield=performance.now(), step=steps.next();
  while(!step.done){
    context.throwIfCancelled?.();
    if(performance.now()-lastYield>=8){context.reportProgress?.(step.value);await context.yieldIfNeeded?.();lastYield=performance.now();context.throwIfCancelled?.();}
    step=steps.next();
  }
  return step.value;
}

export function makeAssemblyFasta(result, lineWidth = result.options?.lineWidth ?? 60) {
  return result.contigs.map((contig) =>
    formatFastaRecord(`${contig.title} reads=${contig.reads.length} length=${contig.sequence.length}`, contig.sequence, lineWidth)
  ).join("\n");
}

export function makeAssemblyTsv(rows) {
  return exportDelimitedTable(lightweightAssemblyColumns.map(column => ({...column, label:column.id})), rows);
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
  if(result.contigs.reduce((sum,c)=>sum+c.sequence.length*c.reads.length,0)>limits.mapCells)throw new Error(`Assembly text map exceeds the fixed ${limits.mapCells.toLocaleString()} alignment-cell budget. Choose Consensus FASTA or Read placement table.`);
  const width = Math.max(40, Math.min(200, Number.parseInt(lineWidth, 10) || 80));
  const labels = new Map(result.contigs.flatMap(contig => contig.reads.map((read,index) => [read, `r${read.sourceIndex ?? index+1}${/^[A-Za-z0-9_. -]+$/.test(read.title) ? ` ${read.title}` : ""}`])));
  const longestReadTitle = Math.max(
    "consensus".length,
    ...result.contigs.flatMap((contig) => contig.reads.map((read) => labels.get(read).length))
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
    lines.push('Read key (input record numbers):');
    contig.reads.forEach((read,index)=>lines.push(`r${read.sourceIndex ?? index+1} = ${JSON.stringify(read.title)}`));
    for (let start = 1; start <= contig.sequence.length; start += width) {
      const end = Math.min(contig.sequence.length, start + width - 1);
      const consensusSegment = contig.sequence.slice(start - 1, end);
      const ruler = makeTextMapRuler(start, end);
      lines.push(`${padRight("pos", labelWidth)} ${" ".repeat(orientationWidth)} ${" ".repeat(numberWidth)} ${ruler}`.trimEnd());
      lines.push(`${padRight("consensus", labelWidth)} ${" ".repeat(orientationWidth)} ${padLeft(start, numberWidth)} ${consensusSegment} ${end}`);
      for (const read of contig.reads) {
        const mapped = makeReadMapSegment(read, start, end);
        if (!mapped) {
          continue;
        }
        const orientationMarker = read.orientation === "reverse-complement" ? "<-" : "->";
        lines.push(`${padRight(labels.get(read), labelWidth)} ${orientationMarker} ${padLeft(mapped.start, numberWidth)} ${mapped.sequence} ${mapped.end}`);
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
    lines.push(`  ${contig.reads.map((read) => `${read.title} [input ${read.sourceIndex}] (${read.orientation}, ${read.placement})`).join("; ")}`);
  }
  if (result.notes?.length) lines.push("", "Run notes", ...result.notes);
  if (result.warnings.length) lines.push("", "Warnings", ...result.warnings);
  return lines.join("\n").trimEnd() + "\n";
}
