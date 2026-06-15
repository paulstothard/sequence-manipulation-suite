import { makeDnaViewerData } from "./dna-viewer-data.js";
import { readOptionalReferenceGenomeRegion } from "./optional-reference-genome.js";

const MAX_VIEWER_REGION_SPAN = 1000000;
const READ_SEQUENCE_DETAIL_LIMIT = 180;

function previewReadSequence(sequence) {
  const text = String(sequence ?? "").trim();
  if (!text) return "";
  if (text.length <= READ_SEQUENCE_DETAIL_LIMIT) return text;
  return `${text.slice(0, READ_SEQUENCE_DETAIL_LIMIT)}... (${text.length.toLocaleString()} bases)`;
}

function matchesReferenceBase(base, genomicPosition, regionStart, referenceSequence) {
  const referenceBase = String(referenceSequence ?? "")[genomicPosition - regionStart]?.toUpperCase();
  if (!referenceBase) return undefined;
  return String(base ?? "").toUpperCase() === referenceBase;
}

function makeAlignedReadBase(entry) {
  const { matchesReference, ...base } = entry;
  return matchesReference === undefined ? base : entry;
}

export function mapReadBasesToReference(row, regionStart, regionEnd, referenceSequence = "") {
  const readSequence = String(row.read_sequence ?? "").toUpperCase();
  const cigar = String(row.cigar ?? "").trim();
  const rowStart = Number(row.start);
  if (!readSequence || !Number.isFinite(rowStart)) {
    return {
      alignedReadBases: [],
      insertionSummary: "",
      deletionSummary: "",
      clippedBaseSummary: ""
    };
  }
  if (!cigar || cigar === "*") {
    const alignedReadBases = Array.from(readSequence, (base, index) => makeAlignedReadBase({
      position: rowStart + index - regionStart + 1,
      genomicPosition: rowStart + index,
      base,
      op: "M",
      matchesReference: matchesReferenceBase(base, rowStart + index, regionStart, referenceSequence)
    })).filter((base) => base.genomicPosition >= regionStart && base.genomicPosition <= regionEnd);
    return {
      alignedReadBases,
      insertionSummary: "",
      deletionSummary: "",
      clippedBaseSummary: ""
    };
  }

  const alignedReadBases = [];
  const insertions = [];
  const deletions = [];
  const clipped = [];
  let referencePosition = rowStart;
  let queryIndex = 0;
  const regex = /(\d+)([MIDNSHP=X])/g;
  let match = regex.exec(cigar);
  while (match) {
    const length = Number.parseInt(match[1], 10);
    const op = match[2];
    if ("M=X".includes(op)) {
      for (let offset = 0; offset < length; offset += 1) {
        const genomicPosition = referencePosition + offset;
        if (genomicPosition >= regionStart && genomicPosition <= regionEnd) {
          alignedReadBases.push(makeAlignedReadBase({
            position: genomicPosition - regionStart + 1,
            genomicPosition,
            base: readSequence[queryIndex + offset] || "N",
            op,
            matchesReference: matchesReferenceBase(readSequence[queryIndex + offset] || "N", genomicPosition, regionStart, referenceSequence)
          }));
        }
      }
      referencePosition += length;
      queryIndex += length;
    } else if (op === "I") {
      const inserted = readSequence.slice(queryIndex, queryIndex + length);
      insertions.push(`after ${Math.max(rowStart - 1, referencePosition - 1)}: ${inserted || `${length} bases`}`);
      queryIndex += length;
    } else if (op === "D" || op === "N") {
      const label = op === "D" ? "deletion" : "skipped region";
      deletions.push(`${label} ${referencePosition}-${referencePosition + length - 1}`);
      if (op === "D") {
        for (let offset = 0; offset < length; offset += 1) {
          const genomicPosition = referencePosition + offset;
          if (genomicPosition >= regionStart && genomicPosition <= regionEnd) {
            alignedReadBases.push({
              position: genomicPosition - regionStart + 1,
              genomicPosition,
              base: "-",
              op,
              matchesReference: false
            });
          }
        }
      }
      referencePosition += length;
    } else if (op === "S") {
      const bases = readSequence.slice(queryIndex, queryIndex + length);
      clipped.push(`soft-clipped ${bases || `${length} bases`}`);
      queryIndex += length;
    } else if (op === "H") {
      clipped.push(`hard-clipped ${length} bases`);
    }
    match = regex.exec(cigar);
  }

  return {
    alignedReadBases,
    insertionSummary: insertions.join("; "),
    deletionSummary: deletions.join("; "),
    clippedBaseSummary: clipped.join("; ")
  };
}

function classifyVariant(row) {
  const ref = String(row.ref ?? "");
  const alts = String(row.alt ?? "").split(",");
  if (alts.length > 1) return "multi-allelic";
  const alt = alts[0] ?? "";
  if (ref.length === 1 && alt.length === 1) return "SNV";
  if (ref.length === alt.length) return "MNV";
  if (ref.length < alt.length) return "insertion";
  if (ref.length > alt.length) return "deletion";
  return "variant";
}

function makeVariantLabel(row) {
  const id = row.id && row.id !== "." ? row.id : `${row.chrom}:${row.pos}`;
  return `${id} ${row.ref}>${row.alt}`;
}

function makeVariantItems(vcfRows = [], { reference, start, end, span }) {
  return vcfRows
    .map((row) => {
      const position = Number(row.pos);
      if (row.chrom !== reference || !Number.isFinite(position)) return null;
      const refLength = Math.max(1, String(row.ref ?? "").length);
      const localStart = position - start + 1;
      const localEnd = localStart + refLength - 1;
      if (localEnd < 1 || localStart > span) return null;
      return {
        start: Math.max(1, localStart),
        end: Math.min(span, localEnd),
        length: refLength,
        label: makeVariantLabel(row),
        name: makeVariantLabel(row),
        type: classifyVariant(row),
        genomicPosition: position,
        genomicCoordinates: `${row.chrom}:${position}-${position + refLength - 1}`,
        variantId: row.id && row.id !== "." ? row.id : "",
        refAllele: row.ref,
        altAllele: row.alt,
        filter: row.filter,
        qual: row.qual,
        info: row.info,
        source: "VCF variant"
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end || String(left.label).localeCompare(String(right.label)));
}

function makeAlignmentItems(rows = [], { start, end, span, referenceSequence }) {
  return rows
    .map((row) => {
      const rowStart = Number(row.start);
      const rowEnd = Number(row.end);
      if (!Number.isFinite(rowStart) || !Number.isFinite(rowEnd)) return null;
      const localStart = rowStart - start + 1;
      const localEnd = rowEnd - start + 1;
      if (localEnd < 1 || localStart > span) return null;
      const strandType = row.strand === "-" ? "reverse alignment" : "forward alignment";
      const readDetails = mapReadBasesToReference(row, start, end, referenceSequence);
      return {
        start: Math.max(1, localStart),
        end: Math.min(span, localEnd),
        length: Math.max(1, rowEnd - rowStart + 1),
        label: row.qname,
        name: row.qname,
        type: strandType,
        strand: row.strand,
        genomicCoordinates: `${row.reference}:${rowStart}-${rowEnd}`,
        readName: row.qname,
        flag: row.flag,
        mapq: row.mapq,
        cigar: row.cigar,
        readLength: row.read_length,
        readSequence: previewReadSequence(row.read_sequence),
        readQuality: previewReadSequence(row.read_quality),
        alignedReadBases: readDetails.alignedReadBases,
        insertionSummary: readDetails.insertionSummary,
        deletionSummary: readDetails.deletionSummary,
        clippedBaseSummary: readDetails.clippedBaseSummary,
        referenceSpan: row.reference_span,
        templateLength: row.template_length,
        readGroup: row.read_group,
        sample: row.sample,
        status: row.status,
        source: "SAM/BAM alignment"
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end || String(left.label).localeCompare(String(right.label)));
}

export async function makeAlignmentViewerData({
  samResult,
  vcfRows = [],
  options = {},
  warnings = [],
  title = "Alignment viewer",
  recordTitleSuffix = "alignments",
  context = {}
} = {}) {
  const region = samResult?.region ?? {};
  const reference = String(region.reference ?? "").trim();
  const start = Number(region.start);
  const end = Number(region.end);
  const span = end - start + 1;
  if (!reference || !Number.isFinite(span) || span <= 0) {
    warnings.push("Alignment viewer could not be built because no valid mapped reference region was available.");
    return makeDnaViewerData([], { title, layout: "linear" });
  }
  if (span > MAX_VIEWER_REGION_SPAN) {
    warnings.push(
      `Skipped the alignment viewer because the selected span is ${span.toLocaleString()} bp. Select a region of ${MAX_VIEWER_REGION_SPAN.toLocaleString()} bp or less.`
    );
    return makeDnaViewerData([], { title, layout: "linear" });
  }

  const referenceRegion = await readOptionalReferenceGenomeRegion(options, {
    seqid: reference,
    start,
    end,
    label: `${reference}:${start}-${end}`
  }, context);
  const referenceSequence = String(referenceRegion?.sequence ?? "").toUpperCase();
  if (referenceRegion?.warnings?.length) {
    warnings.push(...referenceRegion.warnings);
  }
  const hasReferenceSequence = referenceSequence.length === span;
  if (referenceSequence && !hasReferenceSequence) {
    warnings.push(`Reference genome sequence for ${reference}:${start}-${end} was ${referenceSequence.length.toLocaleString()} bp; expected ${span.toLocaleString()} bp, so placeholder bases were used in the alignment viewer.`);
  }

  const effectiveReferenceSequence = hasReferenceSequence ? referenceSequence : "";
  const alignmentItems = makeAlignmentItems(samResult?.regionRows ?? [], {
    start,
    end,
    span,
    referenceSequence: effectiveReferenceSequence
  });
  const variantItems = makeVariantItems(vcfRows, { reference, start, end, span });
  if (vcfRows.length > 0 && variantItems.length === 0) {
    warnings.push(`VCF records were supplied, but no variants overlapped ${reference}:${start}-${end}.`);
  }

  if (hasReferenceSequence) {
    warnings.push(`Alignment viewer uses reference bases from ${referenceRegion.sourceLabel || "the supplied reference genome"}. Zoom in to compare read bases and variants against the reference sequence.`);
  } else {
    warnings.push("Alignment viewer uses placeholder N bases because SAM/BAM alignments do not include reference sequence. Provide a reference genome in Options to show real bases. Zoom in on read features to see read bases from the SAM SEQ field; insertions and clipped bases are reported in selection details.");
  }

  const tracks = [
    ...(variantItems.length > 0 ? [{
      id: "vcf-variants",
      type: "features",
      label: "Variant sites",
      axisLabel: "Variants",
      layout: "stacked-intervals",
      featureOpacity: 0.82,
      items: variantItems
    }] : []),
    {
      id: "sam-alignments",
      type: "features",
      label: "Mapped alignments",
      axisLabel: "Reads",
      layout: "stacked-intervals",
      featureOpacity: 0.72,
      items: alignmentItems
    }
  ];

  return makeDnaViewerData([
    {
      id: `alignment-${reference}-${start}-${end}`,
      title: `${reference}:${start}-${end} ${recordTitleSuffix}`,
      sequence: hasReferenceSequence ? referenceSequence : "N".repeat(span),
      length: span,
      topology: "linear",
      hideSequenceInterpretationControls: !hasReferenceSequence,
      showSecondStrandDefault: hasReferenceSequence,
      showForwardTranslationsDefault: hasReferenceSequence,
      showReverseTranslationsDefault: hasReferenceSequence,
      tracks
    }
  ], {
    title,
    layout: "linear"
  });
}

export async function makeSamViewerData(result, options, warnings, context = {}) {
  return makeAlignmentViewerData({
    samResult: result,
    options,
    warnings,
    title: "SAM/BAM alignment viewer",
    recordTitleSuffix: "SAM/BAM alignments",
    context
  });
}
