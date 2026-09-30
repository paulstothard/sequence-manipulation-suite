import {
  parseSangerTraceInput,
  calculateMottTrimRange,
  SANGER_SESSION_SEPARATOR,
} from "./sanger-trace.js";
import {
  parseSangerReference,
  sangerReferenceBase,
} from "./sanger-reference.js";
import {
  extractSangerEvidence,
  reverseSangerEvidence,
  resolveMixedSangerTrace,
} from "./resolve-mixed-sanger-trace.js";
import { effectiveToolLimit, isToolLimitDisabled } from "./tool-limit-policy.js";
import { normalizeSangerTrimOptions } from './sanger-trimming.js';
import { sangerCandidateSiteDetails } from "./sanger-genotype-candidates.js";

export const SANGER_GENOTYPE_LIMITS = {
  traces: 20,
  readPositions: 1200,
  signalSamples: 200000,
  inputCharacters: 32 * 1024 * 1024,
  sites: 20000,
  plotSites: 40,
};
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
const missing = (reason) => ({
  genotype: null,
  status: "missing",
  reason,
  score: null,
  proportions: null,
});
export const sangerGenotypeColumns = [
  ["sample", "Sample", "string"],
  ["reference", "Reference", "string"],
  ["position", "Position", "number"],
  ["end", "End", "number"],
  ["ref", "Reference allele", "string"],
  ["alt", "Alternate alleles", "string"],
  ["genotype", "Genotype", "string"],
  ["gt", "GT", "string"],
  ["ploidy", "Ploidy", "number"],
  ["status", "Status", "string"],
  ["reason", "Reason", "string"],
  ["score", "Model score margin", "number"],
  ["traces", "Supporting traces", "string"],
].map(([id, label, type]) => ({ id, label, type }));

export function parseSangerGenotypeInput(input, options = {}) {
  const inputLimit = effectiveToolLimit(options, "maxInputCharacters", SANGER_GENOTYPE_LIMITS.inputCharacters);
  if (
    typeof input === "string" &&
    input.length > inputLimit
  )
    throw new Error("Genotyper input exceeds 32 MiB of text.");
  let session = input;
  if (typeof input === "string") {
    const parts = input.split(SANGER_SESSION_SEPARATOR);
    if (parts.length > 1)
      session = {
        traces: parts.slice(0, -1).map((text) => text.trim()),
        reference: parts.at(-1).trim(),
      };
    else {
      try {
        session = JSON.parse(input);
      } catch {
        throw new Error("Provide Sanger traces and one reference sequence.");
      }
    }
  }
  if (!session || !Array.isArray(session.traces) || !session.traces.length)
    throw new Error("Provide at least one Sanger trace and a reference.");
  if (session.traces.length > SANGER_GENOTYPE_LIMITS.traces)
    throw new Error("Use at most 20 traces per run.");
  if (typeof input !== "string") {
    let size = JSON.stringify(session.reference ?? "").length;
    for (const entry of session.traces) {
      const value = entry?.trace ?? entry;
      size +=
        value instanceof ArrayBuffer || ArrayBuffer.isView(value)
          ? value.byteLength
          : JSON.stringify(entry).length;
      if (size > inputLimit)
        throw new Error("Genotyper input exceeds 32 MiB.");
    }
  }
  const reference =
    typeof session.reference === "string"
      ? session.reference
      : `>${session.reference?.title ?? session.reference?.name ?? "Reference"}\n${session.reference?.sequence ?? ""}`;
  return {
    traces: session.traces,
    reference,
    referenceStart: session.reference?.firstBase,
  };
}

export function assessSangerGenotypeSignal(record) {
  const evidence = extractSangerEvidence(record, 0.2);
  const scale = median(
    evidence.map(
      (item) =>
        item.intensities[item.ranked[0]] + item.intensities[item.ranked[1]],
    ),
  );
  for (const [index, item] of evidence.entries()) {
    const values = item.ranked.map((base) => item.intensities[base]);
    const total = values.reduce((a, b) => a + b, 0);
    item.noiseFraction = total ? (values[2] + values[3]) / total : 1;
    item.relativeSignal = scale ? (values[0] + values[1]) / scale : 0;
    const mixed = values[1] >= values[0] * 0.18;
    item.usable =
      total > 0 &&
      item.relativeSignal >= 0.15 &&
      item.noiseFraction < 0.12 &&
      (mixed ||
        record.baseCalls[index].quality === null ||
        record.baseCalls[index].quality >= 10);
  }
  return evidence;
}

/** Continuous-signal model. Margin is a fit statistic, with no Phred interpretation. */
export function callSangerPeakGenotype(item, ploidy = 2, options = {}) {
  if (!item?.usable) return missing("low signal or poor peak separation");
  const bases = [..."ACGT"],
    total = bases.reduce((sum, base) => sum + item.intensities[base], 0);
  const proportions = Object.fromEntries(
    bases.map((base) => [base, item.intensities[base] / total]),
  );
  const ranked = bases.slice().sort((a, b) => proportions[b] - proportions[a]);
  const second = proportions[ranked[1]],
    third = proportions[ranked[2]];
  if (third > 0.1) return missing("more than two supported alleles");
  if (ploidy > 2 && second > 0.1)
    return {
      ...missing("mixed allele dosage is unresolved at this ploidy"),
      proportions,
    };
  const noise = Math.max(0.025, Math.min(0.1, item.noiseFraction / 2 + 0.025));
  const sigma = Math.max(0.045, noise * 1.5);
  const candidates = [];
  const score = (expected) =>
    bases.reduce(
      (sum, base) => sum + ((proportions[base] - expected[base]) / sigma) ** 2,
      0,
    );
  for (const base of bases)
    candidates.push({
      alleles: Array(ploidy).fill(base),
      loss: score(
        Object.fromEntries(
          bases.map((b) => [b, b === base ? 1 - 3 * noise : noise]),
        ),
      ),
    });
  if (ploidy === 2)
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++) {
        // Fit an allele proportion within a conservative imbalance range. Values
        // outside it remain uncertain instead of being assigned a forced dosage.
        const weight = Math.max(
          0.2,
          Math.min(
            0.8,
            proportions[bases[a]] /
              (proportions[bases[a]] + proportions[bases[b]] || 1),
          ),
        );
        const expected = Object.fromEntries(
          bases.map((base) => [
            base,
            base === bases[a]
              ? (1 - 2 * noise) * weight
              : base === bases[b]
                ? (1 - 2 * noise) * (1 - weight)
                : noise,
          ]),
        );
        candidates.push({
          alleles: [bases[a], bases[b]],
          loss: score(expected),
        });
      }
  candidates.sort((a, b) => a.loss - b.loss);
  const best = candidates[0],
    margin = candidates[1].loss - best.loss;
  if (
    best.loss > 12 ||
    margin < Number(options.minimumScoreMargin ?? 4) ||
    (second > 0.08 && second < 0.17)
  )
    return {
      ...missing("allele evidence is inconclusive"),
      proportions,
      score: margin,
    };
  if (ploidy === 1 && second > 0.1)
    return {
      ...missing("mixed signal conflicts with haploid assumption"),
      proportions,
    };
  return {
    genotype: best.alleles.slice().sort(),
    status: "called",
    reason: "",
    score: margin,
    proportions,
  };
}

export function normalizeSangerVariant(reference, position, ref, alt) {
  // VCF alleles include a common anchor for insertions/deletions.
  while (ref.length > 1 && alt.length > 1 && ref.at(-1) === alt.at(-1)) {
    ref = ref.slice(0, -1);
    alt = alt.slice(0, -1);
  }
  while (ref.length > 1 && alt.length > 1 && ref[0] === alt[0]) {
    ref = ref.slice(1);
    alt = alt.slice(1);
    position++;
  }
  if (ref.length !== alt.length) {
    while (position > (reference.firstBase ?? 1) && ref.at(-1) === alt.at(-1)) {
      const base = sangerReferenceBase(reference, position - 1);
      if (!/^[ACGT]$/.test(base ?? "")) break;
      ref = base + ref.slice(0, -1);
      alt = base + alt.slice(0, -1);
      position--;
    }
  }
  return { position, end: position + ref.length - 1, ref, alt };
}

function componentProjection(component, reference) {
  const bases = new Map(),
    events = [];
  let anchor = component.alignment.startA - 1;
  const columns = component.alignment.columns;
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    if (column.sequence_a_position) anchor = column.sequence_a_position;
    if (column.sequence_a !== "-" && column.sequence_b !== "-")
      bases.set(anchor, {
        base: column.sequence_b,
        source: component.sourcePositions[column.sequence_b_position - 1],
      });
    if (column.sequence_a === "-" || column.sequence_b === "-") {
      const insertion = column.sequence_a === "-";
      let text = "",
        j = i;
      while (
        j < columns.length &&
        (insertion
          ? columns[j].sequence_a === "-"
          : columns[j].sequence_b === "-")
      ) {
        text += insertion ? columns[j].sequence_b : columns[j].sequence_a;
        j++;
      }
      const position = insertion ? anchor : column.sequence_a_position - 1;
      const prefix = sangerReferenceBase(reference, position);
      // A cropped boundary without an anchor cannot support a normalized event.
      if (prefix && /^[ACGT]+$/.test(prefix + text))
        events.push(
          normalizeSangerVariant(
            reference,
            position,
            insertion ? prefix : prefix + text,
            insertion ? prefix + text : prefix,
          ),
        );
      i = j - 1;
      if (!insertion) anchor = columns[i].sequence_a_position;
    }
  }
  return {
    bases,
    events,
    start: component.referenceStart,
    end: component.referenceEnd,
  };
}

async function analyzeTrace(entry, index, reference, options, context) {
  if (typeof entry === "string" && entry.trim().startsWith("{")) {
    const parsed = JSON.parse(entry);
    if (parsed.trace && ("sample" in parsed || "ploidy" in parsed))
      entry = parsed;
  }
  const structured = entry && typeof entry === "object" && "trace" in entry;
  options = normalizeSangerTrimOptions(options);
  const input = structured ? entry.trace : entry;
  const decoded =
    typeof input === "string" && /^[\s]*[\[{]/.test(input)
      ? JSON.parse(input)
      : input;
  if (
    (Array.isArray(decoded) && decoded.length !== 1) ||
    (Array.isArray(decoded?.records) && decoded.records.length !== 1)
  )
    throw new Error(
      "Provide one trace per input card. Add another trace input for each record.",
    );
  const record = parseSangerTraceInput(
    typeof input === "object" &&
      !(input instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(input)
      ? JSON.stringify(input)
      : input,
  );
  if (record.traceMode === "base-call-preview")
    throw new Error(
      "Genotyping requires AB1, SCF or Trace JSON with A/C/G/T signal channels.",
    );
  if (record.baseCalls.length < 40 || record.baseCalls.length > 1200)
    throw new Error("Use traces with 40–1,200 base calls.");
  if (record.sampleCount > effectiveToolLimit(options, "maxSignalSamples", SANGER_GENOTYPE_LIMITS.signalSamples))
    throw new Error("Use at most 200,000 signal measurements per channel.");
  if (
    record.baseCalls.some(
      (call, i) =>
        call.originalTracePosition < 1 ||
        call.originalTracePosition > record.traces.A.length ||
        (i > 0 &&
          call.originalTracePosition <=
            record.baseCalls[i - 1].originalTracePosition),
    )
  )
    throw new Error(
      "Trace peak positions must increase and lie within the signal channels.",
    );
  const ploidy = Number(
    (structured ? entry.ploidy : undefined) ?? options.ploidy ?? 2,
  );
  if (![1, 2, 3, 4].includes(ploidy))
    throw new Error("Ploidy must be 1, 2, 3 or 4.");
  const sample = String(
    (structured ? entry.sample : undefined) ??
      record.name ??
      `Sample ${index + 1}`,
  ).trim();
  if (!sample || /[\t\r\n]/.test(sample))
    throw new Error("Sample names must be nonempty single-line text.");
  const evidence = assessSangerGenotypeSignal(record);
  const adjusted = evidence.map((item, i) => ({
    quality: item.usable ? Math.max(20, record.baseCalls[i].quality ?? 20) : 0,
  }));
  const automatic = (options.autoTrim ?? true) ? calculateMottTrimRange(adjusted, {
    errorLimit: 0.05,
    minimumBases: 40,
  }) : null;
  const manualStart = Number(
      (structured ? entry.clipStart : undefined) ?? options.clipStart ?? 0,
    ),
    manualEnd = Number(
      (structured ? entry.clipEnd : undefined) ?? options.clipEnd ?? 0,
    );
  if (
    !Number.isInteger(manualStart) ||
    !Number.isInteger(manualEnd) ||
    manualStart < 0 ||
    manualEnd < 0 ||
    manualStart > record.baseCalls.length ||
    manualEnd > record.baseCalls.length
  )
    throw new Error(
      "Trim coordinates must be within the trace. Leave the last base blank to keep through the end of the read.",
    );
  const start =
      manualStart || ((options.autoTrim ?? true) ? automatic.start : 1),
    end =
      manualEnd ||
      ((options.autoTrim ?? true) ? automatic.end : record.baseCalls.length);
  if (end < start)
    throw new Error("Last base to keep must follow the first base.");
  const calls = record.baseCalls.slice(start - 1, end),
    retained = evidence.slice(start - 1, end);
  const trace = {
    format: "sms3-sanger-trace-v1",
    name: record.name,
    traceMode: record.traceMode,
    bases: calls.map((call) => call.base).join(""),
    qualities: calls.map((call) => call.quality),
    basePositions: calls.map((call) => call.originalTracePosition),
    traces: record.traces,
  };
  const result = {
    sample,
    ploidy,
    name: record.name,
    trace,
    inputBaseCalls: record.baseCalls,
    warnings: record.warnings,
    trim: { start, end, automatic },
    status: "missing",
    reason: "insufficient usable signal",
    resolution: null,
    positions: new Map(),
    events: [],
    projections: [],
    evidence,
  };
  if (
    retained.filter((item) => item.usable).length < 40 ||
    retained.length < 40
  )
    return result;
  const resolution = await resolveMixedSangerTrace(
    { trace, reference: `>${reference.title}\n${reference.sequence}` },
    {
      referenceStart: reference.firstBase,
      secondaryPeakPercent: options.secondaryPeakPercent ?? 20,
      // The outer genotyper has already applied its aggregate input ceiling.
      // Preserve the independent signal-size choice through reconstruction.
      disabledToolLimitIds: ["maxInputCharacters", ...(isToolLimitDisabled(options, "maxSignalSamples") ? ["maxSignalSamples"] : [])],
    },
    context,
  );
  result.resolution = resolution;
  if (!resolution.components.length) {
    result.reason =
      resolution.diagnostics.placementStatus ??
      resolution.warnings.at(-1) ??
      "unsupported mixture or reference fit";
    return result;
  }
  const oriented =
    resolution.orientation === "reverse-complement"
      ? reverseSangerEvidence(retained)
      : retained;
  const originalByRead = new Map(retained.map((item, i) => [i + 1, item]));
  const signalAt = (source) => {
    const original = originalByRead.get(source?.readPosition);
    return resolution.orientation === "reverse-complement" && original
      ? reverseSangerEvidence([original])[0]
      : original;
  };
  result.projections = resolution.components.map((component) =>
    componentProjection(component, reference),
  );
  const positions = new Set(
    result.projections.flatMap((projection) => [...projection.bases.keys()]),
  );
  for (const position of positions) {
    const entries = result.projections.map((projection) =>
      projection.bases.get(position),
    );
    if (entries.some((entry) => !entry)) continue;
    const signals = entries.map((entry) => signalAt(entry.source));
    let call;
    if (
      result.projections.length === 1 ||
      new Set(entries.map((entry) => entry.source?.readPosition)).size === 1
    ) {
      call = callSangerPeakGenotype(signals[0], ploidy, options);
      const signal = signals[0];
      if (signal?.relativeSignal >= 0.15 && signal.noiseFraction < 0.12) {
        const total = Object.values(signal.intensities).reduce(
          (a, b) => a + b,
          0,
        );
        call.observedAlleles = Object.entries(signal.intensities)
          .filter(([, value]) => value / total >= 0.08)
          .map(([base]) => base);
      }
    } else {
      const alleles = entries.map((entry) => entry.base);
      call =
        signals.every((item) => item?.usable) &&
        alleles.every((base) => /^[ACGT]$/.test(base)) &&
        ploidy === 2
          ? {
              genotype: alleles.sort(),
              status: "called",
              reason: "reference-guided indel reconstruction",
              score: null,
              proportions: null,
            }
          : missing("candidate alleles or dosage are unresolved");
    }
    call.observedAlleles ??= call.proportions
      ? Object.entries(call.proportions)
          .filter(([, value]) => value >= 0.08)
          .map(([base]) => base)
      : [];
    result.positions.set(position, call);
  }
  result.events = result.projections.flatMap((projection) => projection.events);
  result.status = "analyzed";
  result.reason = "";
  result.orientation = resolution.orientation;
  result.orientedEvidence = oriented;
  return result;
}

function eventCall(read, site) {
  if (!read.projections.length) return missing(read.reason);
  const alleles = [];
  for (const projection of read.projections) {
    if (projection.start > site.position || projection.end < site.end)
      return missing("insufficient coverage across the event");
    const events = projection.events.filter(
      (event) => event.position <= site.end && event.end >= site.position,
    );
    if (events.length > 1)
      return missing("overlapping complex events require review");
    const event = events[0];
    if (event && (event.position !== site.position || event.ref !== site.ref))
      return missing("overlapping allele representations require review");
    // Both flanks must carry usable signal, including the deletion anchor.
    if (
      read.positions.get(site.position)?.status !== "called" ||
      read.positions.get(site.end + 1)?.status !== "called"
    )
      return missing("low signal at event boundaries");
    alleles.push(event?.alt ?? site.ref);
  }
  if (alleles.length === 1)
    return {
      genotype: Array(read.ploidy).fill(alleles[0]),
      status: "called",
      reason: "",
      score: null,
    };
  if (read.ploidy !== 2)
    return missing("mixed allele dosage is unresolved at this ploidy");
  return {
    genotype: alleles.sort(),
    status: "called",
    reason: "reference-guided indel reconstruction",
    score: null,
  };
}

function selectedPositions(text, reference) {
  const positions = new Set();
  for (const term of String(text ?? "")
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(term);
    if (!match)
      throw new Error(
        "Sites must be reference positions or ranges, separated by commas or spaces.",
      );
    const first = Number(match[1]),
      last = Number(match[2] ?? first);
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      first < reference.firstBase ||
      last > reference.lastBase ||
      last < first
    )
      throw new Error("Requested sites must be within the numbered reference.");
    if (last - first + 1 + positions.size > 20000)
      throw new Error("Request at most 20,000 sites.");
    for (let position = first; position <= last; position++)
      positions.add(position);
  }
  return positions;
}

export async function genotypeSangerTraces(input, options = {}, context = {}) {
  const parsed = parseSangerGenotypeInput(input, options);
  const reference = parseSangerReference(parsed.reference, {
    referenceStart: options.referenceStart ?? parsed.referenceStart ?? 1,
  });
  if (reference.sequence.length < 40)
    throw new Error("Provide at least 40 reference bases.");
  const mode = options.siteMode ?? "variants";
  if (!["variants", "specified", "all"].includes(mode))
    throw new Error("Choose variants, specified sites or all covered sites.");
  const margin = Number(options.minimumScoreMargin ?? 4);
  if (!Number.isFinite(margin) || margin < 0 || margin > 100)
    throw new Error("Minimum model score margin must be from 0 to 100.");
  const targets = selectedPositions(options.sites, reference);
  if (mode === "specified" && !targets.size)
    throw new Error("Enter at least one reference position or range.");
  const reads = [];
  for (const [index, entry] of parsed.traces.entries()) {
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    context.reportProgress?.({
      phase: `Analyzing trace ${index + 1} of ${parsed.traces.length}`,
      progress: (index / parsed.traces.length) * 0.8,
    });
    reads.push(await analyzeTrace(entry, index, reference, options, context));
  }
  const samples = [...new Set(reads.map((read) => read.sample))];
  for (const sample of samples)
    if (
      new Set(
        reads
          .filter((read) => read.sample === sample)
          .map((read) => read.ploidy),
      ).size > 1
    )
      throw new Error(`Sample ${sample} has conflicting ploidy values.`);
  const siteMap = new Map();
  const addSite = (position, ref, alt) => {
    const key = `${position}:${ref}`;
    if (!siteMap.has(key))
      siteMap.set(key, {
        id: key,
        position,
        end: position + ref.length - 1,
        ref,
        alternates: new Set(),
      });
    if (alt && alt !== ref) siteMap.get(key).alternates.add(alt);
    if (siteMap.size > 20000)
      throw new Error(
        "Result exceeds 20,000 sites; choose a smaller site range.",
      );
  };
  for (const read of reads) {
    for (const [position, call] of read.positions) {
      if (mode === "specified" && !targets.has(position)) continue;
      const ref = sangerReferenceBase(reference, position);
      if (!/^[ACGT]$/.test(ref)) continue;
      const observed = call.genotype ?? call.observedAlleles ?? [];
      if (mode !== "variants" || observed.some((base) => base !== ref)) {
        addSite(position, ref);
        for (const base of observed) addSite(position, ref, base);
      }
    }
    for (const event of read.events)
      if (
        mode !== "specified" ||
        [...targets].some(
          (position) => position >= event.position && position <= event.end,
        )
      )
        addSite(event.position, event.ref, event.alt);
  }
  for (const position of targets)
    if (mode === "specified")
      addSite(position, sangerReferenceBase(reference, position));
  const sites = [...siteMap.values()]
    .sort((a, b) => a.position - b.position || a.ref.length - b.ref.length)
    .map((site) => ({ ...site, alternates: [...site.alternates].sort() }));
  const readIndices = new Map(reads.map((read, index) => [read, index]));
  const rows = [],
    readsBySample = new Map(
      samples.map((sample) => [
        sample,
        reads.filter((read) => read.sample === sample),
      ]),
    );
  for (const site of sites)
    for (const sample of samples) {
      if (rows.length % 256 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      const sampleReads = readsBySample.get(sample),
        ploidy = sampleReads[0].ploidy;
      const indel =
        site.ref.length > 1 || site.alternates.some((alt) => alt.length > 1);
      const evidence = sampleReads.map((read) => ({
        read,
        call: indel
          ? eventCall(read, site)
          : (read.positions.get(site.position) ??
            missing(read.reason || "no usable coverage")),
      }));
      const called = evidence.filter((item) => item.call.status === "called");
      const signatures = new Set(
        called.map((item) => item.call.genotype.slice().sort().join("/")),
      );
      const call = !/^[ACGT]+$/.test(site.ref)
        ? missing("ambiguous reference bases")
        : signatures.size > 1
          ? missing("conflicting replicate genotypes")
          : (called[0]?.call ?? evidence[0].call);
      const alleles = [site.ref, ...site.alternates];
      const genotype = call.genotype;
      // A different allele seen in a sample must remain represented in shared ALT.
      if (genotype)
        for (const allele of genotype)
          if (!alleles.includes(allele)) {
            site.alternates.push(allele);
            alleles.push(allele);
          }
      rows.push({
        sample,
        reference: reference.title,
        position: site.position,
        end: site.end,
        ref: site.ref,
        alt: "",
        genotype: genotype?.join("/") ?? ".",
        gt: genotype
          ? genotype
              .map((base) => alleles.indexOf(base))
              .sort((a, b) => a - b)
              .join("/")
          : Array(ploidy).fill(".").join("/"),
        ploidy,
        status: call.status,
        reason: call.reason,
        score: call.score,
        traces: called.map((item) => item.read.name).join("; "),
        siteId: site.id,
        ...(options.includeCandidateHaplotypes ? sangerCandidateSiteDetails(site, call, called, readIndices) : {}),
      });
    }
  const byId = new Map(sites.map((site) => [site.id, site]));
  for (const row of rows) row.alt = byId.get(row.siteId).alternates.join(",");
  const warnings = reads
    .filter((read) => read.status !== "analyzed")
    .map((read) => `${read.sample} (${read.name}): ${read.reason}.`);
  warnings.push(
    ...reads.flatMap((read) =>
      read.warnings.map((warning) => `${read.sample}: ${warning}`),
    ),
  );
  if (reads.some((read) => read.trace.traceMode === "simulated-channels"))
    warnings.push("This input contains simulated signals and generated quality values.");
  warnings.push(
    "Model scores measure how clearly peak signals favor a SNP genotype. Their relationship to real error rates still needs validation.",
  );
  return {
    format: "sms3-sanger-genotypes-v1",
    reference,
    samples,
    sites,
    rows,
    reads,
    warnings,
    method:
      "Continuous peak-proportion fits with bounded reference-guided indel reconstruction",
  };
}
