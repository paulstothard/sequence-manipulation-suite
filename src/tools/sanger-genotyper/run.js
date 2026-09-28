import {
  genotypeSangerTraces,
  sangerGenotypeColumns,
} from "../../core/sanger-genotype.js";
import {
  sangerGenotypeVcf,
  sangerGenotypeJson,
  sangerGenotypeReport,
  sangerGenotypeReviewSvg,
  sangerGenotypeCoverageSvg,
  sangerCandidateOutput,
} from "../../core/sanger-genotype-output.js";
import { sangerHaplotypeColumns, sangerGenotypeCandidateView, SANGER_CANDIDATE_ALIGNMENT_CELL_LIMIT } from "../../core/sanger-genotype-candidates.js";
import {
  makeToolResult,
  makeTableStream,
  makeTextStream,
} from "../../core/workflow.js";
export async function runSangerGenotyper(input, options = {}, context = {}) {
  const format = options.outputFormat ?? "tsv";
  if (
    ![
      "tsv",
      "variants-tsv",
      "vcf",
      "json",
      "report",
      "review-svg",
      "coverage-svg",
      "candidate-fasta",
      "candidate-alignment-svg",
    ].includes(format)
  )
    throw new Error("Choose a supported output format.");
  const result = await genotypeSangerTraces(input, options, context),
    streams = {};
  let output, filename, mimeType, visual, sequenceSearch;
  if (["tsv", "variants-tsv"].includes(format)) {
    const columns = options.includeCandidateHaplotypes ? [...sangerGenotypeColumns, ...sangerHaplotypeColumns] : sangerGenotypeColumns;
    const variantIds = new Set(
      result.sites
        .filter((site) => site.alternates.length)
        .map((site) => site.id),
    );
    const rows =
      format === "variants-tsv"
        ? result.rows.filter((row) => variantIds.has(row.siteId))
        : result.rows;
    output = [
      columns.map((column) => column.label).join("\t"),
      ...rows.map((row) =>
        columns
          .map((column) =>
            String(row[column.id] ?? "").replace(/[\t\r\n]/g, " "),
          )
          .join("\t"),
      ),
    ].join("\n");
    filename =
      format === "tsv" ? "sanger-genotypes.tsv" : "sanger-variants.tsv";
    mimeType = "text/tab-separated-values";
    streams[format === "tsv" ? "table" : "variants"] = makeTableStream(
      columns,
      rows,
      "sanger-genotypes",
    );
  } else if (format === "candidate-fasta" || format === "candidate-alignment-svg") {
    const candidates = sangerGenotypeCandidateView(result);
    const available = candidates.reads.filter(read => read.resolution);
    const withheld = candidates.reads.length - available.length;
    if (withheld) result.warnings.push(`${withheld} trace(s) have no supported candidate haplotypes for the supplied ploidy. See Summary report for trace details.`);
    if (!available.length && format === "candidate-fasta") {
      output = "No supported candidate haplotypes.\n\n" + sangerGenotypeReport(result);
      filename = "sanger-candidates-report.txt";
      mimeType = "text/plain";
      sequenceSearch = false;
      streams.report = makeTextStream(output, mimeType);
    } else {
      if (format === "candidate-alignment-svg") {
        const cells = available.reduce((total, read) => total + read.resolution.alignmentRows.reduce((sum, row) => sum + row.aligned.length, 0), 0);
        if (cells > SANGER_CANDIDATE_ALIGNMENT_CELL_LIMIT) throw new Error("Candidate alignment exceeds 20,000 cells. Use fewer trace inputs or choose Candidate FASTA.");
      }
      output = await sangerCandidateOutput([candidates], format, { haplotypeLabels: true, context });
      const fasta = format === "candidate-fasta";
      filename = fasta ? "sanger-candidate-haplotypes.fasta" : "sanger-candidate-haplotypes.svg";
      mimeType = fasta ? "text/x-fasta" : "image/svg+xml";
      streams[fasta ? "candidateFasta" : "candidateAlignmentSvg"] = makeTextStream(output, mimeType);
      if (!fasta) visual = { svg: output };
    }
  } else {
    const renderers = {
      vcf: [sangerGenotypeVcf, "vcf", "text/vcf", "vcf"],
      json: [sangerGenotypeJson, "json", "application/json", "analysisJson"],
      report: [sangerGenotypeReport, "txt", "text/plain", "report"],
      "review-svg": [
        sangerGenotypeReviewSvg,
        "svg",
        "image/svg+xml",
        "reviewSvg",
      ],
      "coverage-svg": [
        sangerGenotypeCoverageSvg,
        "svg",
        "image/svg+xml",
        "coverageSvg",
      ],
    };
    const [render, extension, mime, key] = renderers[format];
    output = render(result);
    filename = `sanger-genotypes-${format}.${extension}`;
    mimeType = mime;
    streams[key] = makeTextStream(output, mime);
    if (extension === "svg") visual = { svg: output };
  }
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "Finished", progress: 1 });
  return makeToolResult({
    output,
    sequenceSearch,
    download: { filename, mimeType },
    streams,
    visual,
    warnings: result.warnings,
    recordsProcessed: result.reads.length,
    basesProcessed: result.reads.reduce(
      (sum, read) => sum + read.trace.bases.length,
      0,
    ),
  });
}
