import { digestProteinsWithContext, proteases } from "../../core/protein-digest.js";
import { formatFastaRecord } from "../../core/fasta.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const proteinDigestTableColumns = [
  { id: "record_index", label: "Record index", type: "number" },
  { id: "record", label: "Protein", type: "string" },
  { id: "peptide_id", label: "Peptide ID", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "length", label: "Length (aa)", type: "number" },
  { id: "missed_cleavages", label: "Missed cleavages", type: "number" },
  { id: "mass_type", label: "Mass type", type: "string" },
  { id: "mass_da", label: "Neutral mass (Da)", type: "number" },
  { id: "sequence", label: "Peptide sequence", type: "string" }
];

function makePeptideMap(analysis, enzyme) {
  const colors = ["#0072b2", "#009e73", "#e69f00", "#cc79a7", "#d55e00", "#56b4e9"];
  const allowsMissedCleavages = analysis.settings.missedCleavages > 0;
  const styles = Object.fromEntries(colors.map((color, i) => [
    `missed-${i}`, {
      label: `${i} uncut site${i === 1 ? "" : "s"}`,
      fill: color, stroke: color, legend: allowsMissedCleavages
    }
  ]));
  const records = analysis.records.map(record => ({
    title: `R${record.record_index} · ${record.title.length > 70 ? `${record.title.slice(0, 67)}…` : record.title}`,
    molecule: "protein", length: record.sequence.length,
    features: record.peptides.map(peptide => ({
      start: peptide.start, end: peptide.end,
      className: `missed-${peptide.missed_cleavages}`,
      label: `${peptide.peptide_id.split("-")[1]} · ${peptide.start}–${peptide.end}`
    })),
    notes: [
      `${record.cuts.length} predicted cleavage sites · ${record.peptides.length} ${allowsMissedCleavages ? "possible peptides" : "peptides"} in the selected length range.`,
      ...(allowsMissedCleavages ? [
        `Alternatives with up to ${analysis.settings.missedCleavages} missed cleavage${analysis.settings.missedCleavages === 1 ? "" : "s"} per peptide; amounts are not predicted.`,
        "Colors count predicted cut sites left uncut inside each peptide."
      ] : ["Complete digestion assumed: every predicted site is cut."]),
      "Bars span original residue positions (1-based, inclusive)."
    ]
  }));
  // Exported maps retain a white paper background in both app themes.
  return renderSequenceMap({ title: `${enzyme.name} peptide map`, records, styles, layout: "linear" })
    .replace("</style>", '</style><rect width="100%" height="100%" fill="#ffffff"/>');
}

export async function runProteinDigest(input, options = {}, context = {}) {
  const analysis = await digestProteinsWithContext(input, options, context);
  const { settings, records } = analysis;
  const enzyme = proteases.find(record => record.id === settings.enzyme);
  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  let output, download, visual;
  const streams = {};
  if (settings.outputFormat === "svg-map") {
    output = makePeptideMap(analysis, enzyme);
    streams.map = makeTextStream(output, "image/svg+xml");
    visual = { svg: output, pngDownload: true };
    download = { filename: `protein-digest-${settings.enzyme}.svg`, mimeType: "image/svg+xml;charset=utf-8" };
  } else {
    const rows = [], fastaRecords = [], fastaParts = [];
    let emitted = 0;
    for (const record of records) {
      for (const peptide of record.peptides) {
        if (emitted++ % 512 === 0) {
          await context.yieldIfNeeded?.();
          context.throwIfCancelled?.();
        }
        const sequence = record.sequence.slice(peptide.start - 1, peptide.end);
        if (settings.outputFormat === "table") {
          rows.push({ record_index: record.record_index, record: record.title, ...peptide, mass_type: settings.massType, sequence });
        } else {
          const title = `${peptide.peptide_id} source=${record.title.replace(/\s+/g, " ")} range=${peptide.start}-${peptide.end} missed=${peptide.missed_cleavages} ${settings.massType}_mass_Da=${peptide.mass_da ?? "unavailable"}`;
          fastaRecords.push({ title, sequence });
          fastaParts.push(formatFastaRecord(title, sequence));
        }
      }
    }
    context.throwIfCancelled?.();
    if (settings.outputFormat === "table") {
      output = exportDelimitedTable(proteinDigestTableColumns, rows);
      streams.table = makeTableStream(proteinDigestTableColumns, rows, "protein-digest-peptides");
      download = { filename: `protein-digest-${settings.enzyme}.tsv`, mimeType: "text/tab-separated-values;charset=utf-8" };
    } else {
      output = fastaParts.join("");
      streams.fasta = makeTextStream(output, "text/x-fasta");
      streams.sequenceRecords = { kind: "sequence-records", alphabet: "protein", records: fastaRecords };
      download = { filename: `protein-digest-${settings.enzyme}.fasta`, mimeType: "text/x-fasta;charset=utf-8" };
    }
  }
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "complete", progress: 1 });
  return makeToolResult({
    output, download, visual, streams, warnings: analysis.warnings,
    recordsProcessed: records.length, basesProcessed: analysis.totalResidues,
    processedUnitLabel: "residue", charactersRemoved: analysis.charactersRemoved,
    optionsUsed: { ...settings, enzymeName: enzyme.name, peptideCount: analysis.peptideCount, massConvention: "Neutral, unmodified linear peptide with free termini; residue masses plus one water." }
  });
}

export const runProteinDigestWorker = runProteinDigest;
