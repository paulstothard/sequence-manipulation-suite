import { sangerCandidateColumnRelations } from "./resolve-mixed-sanger-trace.js";
import { sangerGenotypeCandidateSummary } from "./sanger-genotype-candidates.js";
import { makeAlignmentSvg } from "./alignment-svg.js";
import { formatFastaRecord } from "./fasta.js";
import { prepareSangerTrace, makeSangerTraceSvg } from "./sanger-trace.js";
import {
  PUBLICATION_PLOT_FONT_FAMILY,
  SMS3_PLOT_THEME,
} from "./publication-plot-style.js";
const xml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const identifier = (value) =>
  String(value).replace(/[^A-Za-z0-9_.-]/g, "_") || "reference";

export function sangerGenotypeVcf(result) {
  const chrom = identifier(result.reference.title.split(/\s/)[0]);
  const samples = result.samples.map(
    (sample, index) => `${identifier(sample)}_${index + 1}`,
  );
  const lines = [
    "##fileformat=VCFv4.3",
    "##source=SMS3_Sanger_Genotyper",
    `##contig=<ID=${chrom}>`,
    `##reference=${encodeURIComponent(result.reference.title)}`,
    `##sms3_reference_first_base=${result.reference.firstBase}`,
    `##sms3_reference_fingerprint=${result.reference.fingerprint}`,
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Unphased genotype; missing when evidence is insufficient">',
    '##FORMAT=<ID=FT,Number=1,Type=String,Description="Sample call status">',
    '##FILTER=<ID=Missing,Description="Sample has insufficient or conflicting allele evidence">',
    '##FILTER=<ID=Uncertain,Description="Every sample genotype is missing">',
    ...samples.map(
      (sample, index) =>
        `##SAMPLE=<ID=${sample},Description="${result.samples[index].replaceAll("\\", "\\\\").replaceAll('"', '\\"')}">`,
    ),
    "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t" +
      samples.join("\t"),
  ];
  const calls = new Map(
    result.rows.map((row) => [JSON.stringify([row.siteId, row.sample]), row]),
  );
  for (const site of result.sites) {
    const rows = result.samples.map((sample) =>
      calls.get(JSON.stringify([site.id, sample])),
    );
    lines.push(
      [
        chrom,
        site.position,
        ".",
        site.ref,
        site.alternates.join(",") || ".",
        ".",
        rows.some((row) => row.status === "called") ? "PASS" : "Uncertain",
        ".",
        "GT:FT",
        ...rows.map(
          (row) => `${row.gt}:${row.status === "called" ? "PASS" : "Missing"}`,
        ),
      ].join("\t"),
    );
  }
  return lines.join("\n") + "\n";
}

export function sangerGenotypeJson(result) {
  return JSON.stringify(result, (_key, value) =>
    value instanceof Map ? [...value.entries()] : value,
  );
}

export function sangerGenotypeReport(result) {
  return [
    "Sanger genotypes",
    `Reference: ${result.reference.title}; bases ${result.reference.firstBase}–${result.reference.lastBase}`,
    `Samples: ${result.samples.length}; traces: ${result.reads.length}; sites: ${result.sites.length}`,
    `Called genotypes: ${result.rows.filter((row) => row.status === "called").length}; missing: ${result.rows.filter((row) => row.status === "missing").length}`,
    `Method: ${result.method}`,
    "",
    ...result.reads.map(
      (read) =>
        `${read.sample} / ${read.name}: retained original bases ${read.trim.start}–${read.trim.end}; ${read.status}${read.reason ? "; " + read.reason : ""}`,
    ),
    "",
    "Candidate haplotypes",
    ...result.reads.map(sangerGenotypeCandidateSummary),
    "Candidate numbering is local to each trace. Phase between separate blocks remains unresolved.",
    "",
    ...result.warnings.map((warning) => "Note: " + warning),
  ].join("\n");
}

export function sangerGenotypeReviewSvg(result) {
  if (
    result.sites.length > 40 ||
    result.sites.length * result.reads.length > 200
  )
    throw new Error(
      "The review plot supports 40 sites and 200 trace panels. Choose Specified sites for a smaller view.",
    );
  const panels = [];
  let y = 76;
  for (const site of result.sites) {
    panels.push(
      `<text x="28" y="${y}" font-size="16" font-weight="600">${site.position}: ${xml(site.ref)} → ${xml(site.alternates.join(", ") || "reference")}</text>`,
    );
    y += 24;
    for (const read of result.reads) {
      const row = result.rows.find(
        (row) => row.sample === read.sample && row.siteId === site.id,
      );
      const projection = read.projections.find((projection) =>
        projection.bases.has(site.position),
      );
      const source = projection?.bases.get(site.position)?.source;
      panels.push(
        `<text x="28" y="${y}" font-size="13">${xml(read.sample)} / ${xml(read.name)}: ${xml(row?.genotype)}${row?.reason ? " — " + xml(row.reason) : ""}</text>`,
      );
      y += 10;
      if (source) {
        const base = source.readPosition + read.trim.start - 1;
        const view = prepareSangerTrace(
          JSON.stringify({ ...read.trace, baseCalls: read.inputBaseCalls }),
          {
            clipStart: Math.max(1, base - 8),
            clipEnd: Math.min(read.inputBaseCalls.length, base + 8),
          },
        );
        const svg = makeSangerTraceSvg(view, {
          width: 980,
          height: 360,
          highlightBase: base,
        }).replace("<svg ", `<svg x="0" y="${y}" `);
        panels.push(svg);
        y += 374;
      } else {
        panels.push(
          `<text x="40" y="${y + 22}" font-size="12">No usable placement at this site.</text>`,
        );
        y += 58;
      }
    }
    y += 18;
  }
  if (!result.sites.length) {
    panels.push(
      '<text x="28" y="100" font-size="14">No sites selected. Use Specified sites to review reference calls.</text>',
    );
    y = 150;
  }
  return `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="980" height="${y}" viewBox="0 0 980 ${y}" role="img" aria-label="Sanger variant review"><rect width="980" height="${y}" fill="white"/><g font-family="${PUBLICATION_PLOT_FONT_FAMILY}" fill="${SMS3_PLOT_THEME.text}"><text x="28" y="30" font-size="20" font-weight="600">Sanger variant review</text><text x="28" y="52" font-size="12">${xml(result.reference.title)}; reference positions above, original trace orientation and base calls below</text>${panels.join("")}</g></svg>`;
}

export function sangerGenotypeCoverageSvg(result) {
  const width = 980,
    height = 110 + result.reads.length * 42,
    first = result.reference.firstBase,
    last = result.reference.lastBase;
  const x = (position) =>
    220 + ((position - first) / Math.max(1, last - first)) * 720;
  const rows = result.reads.map((read, index) => {
    const y = 70 + index * 42,
      positions = [...read.positions.keys()],
      start = positions.length ? Math.min(...positions) : null,
      end = positions.length ? Math.max(...positions) : null;
    return `<text x="24" y="${y + 14}" font-size="12">${xml(read.sample.slice(0, 25))}</text>${start === null ? `<text x="220" y="${y + 14}" font-size="12">${xml(read.reason)}</text>` : `<rect data-sanger-inspection-target="" x="${x(start)}" y="${y}" width="${Math.max(2, x(end) - x(start))}" height="22" fill="${SMS3_PLOT_THEME.categorical[0]}"><title>${xml(read.sample)}; ${xml(read.name)}; reference ${start}–${end}; original bases ${read.trim.start}–${read.trim.end}; ${read.orientation}</title></rect>`}`;
  });
  return `<svg class="sanger-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sanger coverage"><rect width="100%" height="100%" fill="white"/><g font-family="${PUBLICATION_PLOT_FONT_FAMILY}" fill="${SMS3_PLOT_THEME.text}"><text x="24" y="28" font-size="20">Sanger reference coverage</text><text x="220" y="54" font-size="12">${first}</text><text x="940" y="54" text-anchor="end" font-size="12">${last}</text><line x1="220" y1="59" x2="940" y2="59" stroke="${SMS3_PLOT_THEME.axis}"/>${rows.join("")}</g></svg>`;
}

export async function sangerCandidateOutput(results, format, { haplotypeLabels = false, context = {} } = {}) {
  const records = [],
    plots = [];
  let y = 0;
  for (const result of results)
    for (const [index, read] of result.reads.entries()) {
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
      const resolution = read.resolution;
      if (!resolution?.components.length) continue;
      const blocks = (read.candidatePhaseBlocks ?? []).map(block => `${block.id}=${block.start}-${block.end}`).join(", ");
      const phaseNote = haplotypeLabels
        ? `Candidate numbering is local to Trace ${index + 1}. Phase between separate blocks remains unresolved.${blocks ? ` Blocks (original read bases): ${blocks}.` : ''}` : '';
      if (format === "candidate-fasta") for (const component of resolution.components)
        records.push(
          formatFastaRecord(
            `${identifier(read.sample)}_trace${index + 1}_${component.id} reference=${result.reference.title}; span=${component.referenceStart}-${component.referenceEnd}; ${component.phase}${haplotypeLabels ? `; assumed_ploidy=${read.ploidy}; ${phaseNote}` : ''}`,
            component.sequence,
          ),
        );
      if (format === "candidate-alignment-svg") {
        const svg = makeAlignmentSvg({
          title: `${read.sample}: candidate ${haplotypeLabels ? 'haplotypes' : 'sequences'}`,
          rows: haplotypeLabels ? resolution.alignmentRows.map((row, i) => ({ ...row, label: i ? `Candidate haplotype ${i}` : row.label })) : resolution.alignmentRows,
          columnRelations: sangerCandidateColumnRelations(
            resolution.alignmentRows,
          ),
          showConsensusLine: false,
          summary: `${haplotypeLabels ? `Trace ${index + 1}; ` : ''}${read.name}; ${resolution.status}`,
          note: `Candidates from one trace share the same evidence. IUPAC bases preserve uncertain phase.${phaseNote ? ` ${phaseNote}` : ''}`,
        });
        // Shared publication figures use millimetres for outer dimensions;
        // nested SVGs must use their viewBox coordinates for sizing/placement.
        const dimensions = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
        if (!dimensions)
          throw new Error("Candidate alignment is missing figure bounds.");
        const height = (Number(dimensions[2]) * 1240) / Number(dimensions[1]);
        plots.push(
          svg.replace(/^<svg\b[^>]*>/, (root) =>
            root
              .replace(/ width="[^"]+"/, ' width="1240"')
              .replace(/ height="[^"]+"/, ` height="${height}"`)
              .replace("<svg ", `<svg x="0" y="${y}" `),
          ),
        );
        y += height + 20;
      }
    }
  if (format === "candidate-fasta") return records.join("");
  if (!plots.length)
    return '<svg xmlns="http://www.w3.org/2000/svg" width="980" height="120"><text x="24" y="48">No supported candidate alignments.</text></svg>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="${y}" viewBox="0 0 1240 ${y}">${plots.join("")}</svg>`;
}
