import { formatFastaRecord } from "../../core/fasta.js";
import { parseBiologicalRecordInput } from "../../core/biological-record-format-converter.js";
import {
  extractLocationSequence,
  flatfileFeatureColumns,
  flatfileRecordsToFeatureRows,
  flatfileRecordsToSequenceRecords
} from "../../core/flatfile-records.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import {
  makeGenomeFigureDataFromFlatfileRecords,
  makeGenomeFigureStream
} from "../../core/genome-figure-data.js";
import { makeProteinViewerData, makeProteinViewerStream } from "../../core/protein-viewer-data.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

function escapeTsvValue(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function tableToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => escapeTsvValue(row[column.id])).join("\t"))
  ].join("\n");
}

function recordsToFasta(records, lineWidth = 60) {
  return records.map((record) => formatFastaRecord(record.title, record.sequence, lineWidth)).join("\n");
}

function parseFeatureFilter(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseOptionalInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getQualifierValues(feature, name) {
  if (!name || name === "any") {
    return Object.values(feature.qualifiers ?? {}).flat();
  }
  return feature.qualifiers?.[name] ?? [];
}

function featureSearchText(feature) {
  return [
    feature.feature,
    feature.location,
    feature.gene,
    feature.locus_tag,
    feature.product,
    feature.protein_id,
    feature.qualifiers?.note,
    feature.qualifiers?.function,
    feature.qualifiers?.bound_moiety,
    ...Object.values(feature.qualifiers ?? {}).flat()
  ].flat().join(" ").toLowerCase();
}

function overlapsRange(feature, start, end) {
  if (start === null && end === null) {
    return true;
  }
  if (!feature.parsedLocation?.supported) {
    return false;
  }
  const queryStart = start ?? Number.NEGATIVE_INFINITY;
  const queryEnd = end ?? Number.POSITIVE_INFINITY;
  return feature.parsedLocation.ranges.some((range) =>
    Math.max(range.start, queryStart) <= Math.min(range.end, queryEnd)
  );
}

function featureMatchesFilters(feature, options = {}) {
  const requested = parseFeatureFilter(options.featureFilter);
  if (requested.size > 0 && !requested.has(String(feature.feature ?? "").toLowerCase())) {
    return false;
  }
  const strand = options.strandFilter === "+" || options.strandFilter === "-" ? options.strandFilter : "all";
  if (strand !== "all" && feature.parsedLocation?.strand !== strand) {
    return false;
  }
  const rangeStart = parseOptionalInteger(options.coordinateStart);
  const rangeEnd = parseOptionalInteger(options.coordinateEnd);
  if (!overlapsRange(feature, rangeStart, rangeEnd)) {
    return false;
  }
  const qualifierName = String(options.qualifierName ?? "").trim();
  const qualifierValue = String(options.qualifierValue ?? "").trim().toLowerCase();
  if (qualifierName && !getQualifierValues(feature, qualifierName).length) {
    return false;
  }
  if (qualifierValue) {
    const values = getQualifierValues(feature, qualifierName || "any")
      .map((value) => String(value).toLowerCase());
    if (!values.some((value) => value.includes(qualifierValue))) {
      return false;
    }
  }
  const text = String(options.featureText ?? "").trim().toLowerCase();
  if (text && !featureSearchText(feature).includes(text)) {
    return false;
  }
  return true;
}

function filterRecordFeatures(records, options = {}) {
  return records.map((record) => ({
    ...record,
    features: record.features.filter((feature) => featureMatchesFilters(feature, options))
  }));
}

function makeReport(records, featureRows, allFeatureCount, wholeRecords, cdsRecords, proteinRecords, contextRecordCount = 0, recordClass = "all") {
  const formats = [...new Set(records.map((record) => record.format))].join(", ") || "none";
  const title = recordClass === "protein"
    ? "Annotated protein record extractor"
    : recordClass === "dna"
      ? "Annotated DNA record extractor"
      : "Record parser / extractor";
  return [
    title,
    `Records parsed: ${records.length}`,
    `Formats: ${formats}`,
    `Features parsed: ${allFeatureCount}`,
    `Features reported after filters: ${featureRows.length}`,
    `Whole DNA/RNA sequences: ${wholeRecords.length}`,
    `CDS DNA/RNA sequences: ${cdsRecords.length}`,
    `Protein sequences: ${proteinRecords.length}`,
    `Context sequences generated: ${contextRecordCount}`
  ].join("\n") + "\n";
}

function makeFeatureLabel(feature) {
  if (feature.gene) {
    return `${feature.feature} ${feature.gene}`;
  }
  if (feature.locus_tag) {
    return `${feature.feature} ${feature.locus_tag}`;
  }
  return feature.feature;
}

function shortQualifier(value, maxLength = 22) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function informativeQualifier(value, maxLength = 22) {
  const stop = new Set(["DNA", "RNA", "protein", "putative", "hypothetical", "fragment", "partial"]);
  const words = String(value ?? "")
    .replace(/[;,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((word) => !stop.has(word));
  return shortQualifier(words.join(" ") || value, maxLength);
}

function getFeatureLabel(feature) {
  const identifier = feature.gene || feature.locus_tag;
  if (feature.product) {
    return identifier
      ? `${feature.feature} ${shortQualifier(identifier, 12)} ${informativeQualifier(feature.product, 22)}`
      : `${feature.feature} ${informativeQualifier(feature.product)}`;
  }
  if (feature.note) {
    return identifier
      ? `${feature.feature} ${shortQualifier(identifier, 12)} ${shortQualifier(feature.note, 22)}`
      : `${feature.feature} ${shortQualifier(feature.note)}`;
  }
  if (feature.bound_moiety) {
    return identifier
      ? `${feature.feature} ${shortQualifier(identifier, 12)} ${shortQualifier(feature.bound_moiety, 22)}`
      : `${feature.feature} ${shortQualifier(feature.bound_moiety)}`;
  }
  if (feature.gene) {
    return `${feature.feature} ${shortQualifier(feature.gene, 18)}`;
  }
  if (feature.locus_tag) {
    return `${feature.feature} ${shortQualifier(feature.locus_tag, 18)}`;
  }
  if (feature.parsedLocation?.start && feature.parsedLocation?.end) {
    return `${feature.feature} ${feature.parsedLocation.start}-${feature.parsedLocation.end}`;
  }
  return feature.feature;
}

function getFeatureClass(featureKey) {
  const key = String(featureKey ?? "").toLowerCase();
  if (key === "cds" || key === "mrna" || key === "exon") {
    return "coding";
  }
  if (key === "gene") {
    return "gene";
  }
  if (key === "source") {
    return "source";
  }
  if (key.includes("regulatory") || key.includes("promoter") || key.includes("terminator") || key === "misc_binding") {
    return "regulatory";
  }
  if (key.includes("repeat")) {
    return "repeat";
  }
  if (key === "variation" || key === "variant") {
    return "variant";
  }
  return "other";
}

function isSvgMapFormat(format) {
  return format === "linear-svg-map" || format === "circular-svg-map";
}

function isGenomeFigureFormat(format) {
  return format === "linear-genome-figure" || format === "circular-genome-figure";
}

function mapLayoutForFormat(format) {
  return format === "circular-svg-map" ? "circular" : "linear";
}

function genomeFigureLayoutForFormat(format) {
  return format === "linear-genome-figure" ? "linear" : "circular";
}

function makeFeatureMapSvg(records, layout = "linear") {
  const nucleotideRecords = records.filter((record) => record.sequence && record.molecule !== "protein");
  const recordsToDraw = nucleotideRecords.length > 0 ? nucleotideRecords : records.filter((record) => record.sequence);
  return renderSequenceMap({
    title: layout === "circular" ? "Circular feature map" : "Linear feature map",
    layout,
    records: recordsToDraw.map((record) => ({
      title: record.accession,
      length: record.sequence.length,
      topology: layout === "circular" && record.molecule !== "protein" ? "circular" : "linear",
      molecule: record.molecule,
      features: record.features
        .filter((feature) => feature.parsedLocation.supported && feature.parsedLocation.start && feature.parsedLocation.end)
        .map((feature) => ({
          start: feature.parsedLocation.start,
          end: feature.parsedLocation.end,
          parts: feature.parsedLocation.ranges,
          strand: feature.parsedLocation.strand,
          className: getFeatureClass(feature.feature),
          label: getFeatureLabel(feature),
          type: feature.feature
        }))
    }))
  });
}

function featureParts(feature) {
  return (feature.parsedLocation?.ranges ?? []).map((range) => ({
    start: range.start,
    end: range.end,
    strand: range.strand
  }));
}

function featureJoinedStart(feature) {
  const parts = featureParts(feature);
  return parts.length > 0 ? parts[0].start : feature.parsedLocation.start;
}

function featureJoinedEnd(feature) {
  const parts = featureParts(feature);
  return parts.length > 0 ? parts[parts.length - 1].end : feature.parsedLocation.end;
}

function featureJoinedLength(feature) {
  const parts = featureParts(feature);
  if (parts.length === 0) {
    return feature.parsedLocation.end - feature.parsedLocation.start + 1;
  }
  return parts.reduce((sum, part) => sum + Math.max(0, part.end - part.start + 1), 0);
}

function makeFeatureViewer(records, options = {}) {
  const isProtein = options.recordClass === "protein";
  const viewerRecords = records.filter((record) => record.sequence).map((record) => ({
    id: record.accession,
    title: record.accession,
    sequence: record.sequence,
    length: record.sequence.length,
    topology: isProtein ? "linear" : record.topology,
    alphabet: isProtein ? "protein" : "dna-rna",
    tracks: [
      {
        id: isProtein ? "protein-features" : "annotated-features",
        type: "features",
        label: isProtein ? "Protein features" : "Annotated features",
        items: record.features
          .filter((feature) => feature.parsedLocation.supported && feature.parsedLocation.start && feature.parsedLocation.end)
          .map((feature) => ({
            start: featureJoinedStart(feature),
            end: featureJoinedEnd(feature),
            parts: featureParts(feature),
            label: getFeatureLabel(feature),
            name: feature.gene || feature.locus_tag || feature.product || feature.feature,
            type: feature.feature,
            strand: isProtein ? "" : feature.parsedLocation.strand,
            length: featureJoinedLength(feature),
            location: feature.location
          }))
      }
    ]
  }));
  const viewerOptions = {
    title: isProtein ? "Annotated protein sequence viewer" : "Annotated DNA record viewer",
    layout: isProtein ? "linear" : options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear",
    alphabet: isProtein ? "protein" : "dna-rna",
    geneticCode: options.geneticCode || "1"
  };
  return isProtein ? makeProteinViewerData(viewerRecords, viewerOptions) : makeDnaViewerData(viewerRecords, viewerOptions);
}

function makeFeatureTextMap(records) {
  return records.map((record) =>
    renderTextAnnotationMapFromItems([
      {
        title: record.accession,
        sequence: record.sequence,
        items: record.features
          .filter((feature) => feature.parsedLocation.supported && feature.parsedLocation.start && feature.parsedLocation.end)
          .map((feature) => ({
            start: featureJoinedStart(feature),
            end: featureJoinedEnd(feature),
            parts: featureParts(feature),
            strand: feature.parsedLocation.strand,
            label: makeFeatureLabel(feature)
          }))
      }
    ], {
      width: 60,
      alphabet: record.molecule === "protein" ? "protein" : "dna-rna",
      showSecondStrand: record.molecule !== "protein"
    })
  ).join("\n\n");
}

function makeGenomeFigureOutput(records, format, context = {}) {
  const prepared = makeGenomeFigureDataFromFlatfileRecords(records, {
    layout: genomeFigureLayoutForFormat(format),
    featureLayout: "type-slots",
    labelDensity: "medium"
  }, context);
  if (prepared.figure.records.length === 0) {
    return {
      ...prepared,
      output: ""
    };
  }
  return {
    ...prepared,
    output: [
      "Genome figure prepared",
      `Records: ${prepared.recordsProcessed}`,
      `Bases: ${prepared.basesProcessed}`,
      `Features available in table stream: ${prepared.rows.length}`,
      "Use the editable figure panel to adjust theme, plots, feature layout, labels, and export PNG/SVG."
    ].join("\n")
  };
}

function featureTitle(record, feature) {
  const label = [
    record.accession,
    feature.feature,
    feature.gene || feature.locus_tag || feature.protein_id || shortQualifier(feature.product, 30),
    feature.location
  ].filter(Boolean).join(" | ");
  return label.replace(/\s+/g, " ").trim();
}

function extractProteinFeatureSequence(record, feature) {
  if (!feature.parsedLocation?.ranges?.length) {
    return "";
  }
  return feature.parsedLocation.ranges
    .map((range) => record.sequence.slice(range.start - 1, range.end))
    .join("")
    .toUpperCase();
}

function makeSelectedFeatureRecords(records) {
  return records.flatMap((record) =>
    record.features
      .filter((feature) => feature.parsedLocation.supported && feature.parsedLocation.start && feature.parsedLocation.end)
      .map((feature) => ({
        title: featureTitle(record, feature),
        sequence: record.molecule === "protein"
          ? extractProteinFeatureSequence(record, feature)
          : extractLocationSequence(record.sequence, feature.parsedLocation),
        sourceTitle: record.accession,
        featureId: feature.id
      }))
      .filter((featureRecord) => featureRecord.sequence)
  );
}

function getContextPositions(record, feature, flank) {
  const length = record.sequence.length;
  const ranges = [...(feature.parsedLocation?.ranges ?? [])].sort((left, right) => left.start - right.start);
  if (length === 0 || ranges.length === 0) {
    return [];
  }
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  const touchesOrigin = record.topology === "circular" &&
    ranges.length > 1 &&
    first.start <= Math.max(1, flank + 1) &&
    last.end >= Math.max(1, length - flank);

  const positions = [];
  if (touchesOrigin) {
    const start = Math.max(1, last.start - flank);
    const end = Math.min(length, first.end + flank);
    for (let position = start; position <= length; position += 1) {
      positions.push(position);
    }
    for (let position = 1; position <= end; position += 1) {
      positions.push(position);
    }
    return positions;
  }

  const start = Math.max(1, Math.min(...ranges.map((range) => range.start)) - flank);
  const end = Math.min(length, Math.max(...ranges.map((range) => range.end)) + flank);
  for (let position = start; position <= end; position += 1) {
    positions.push(position);
  }
  return positions;
}

function positionIsInRanges(position, ranges) {
  return ranges.some((range) => position >= range.start && position <= range.end);
}

function makeUppercaseContextRecords(records, featureKey, flank) {
  return records.flatMap((record) => {
    if (!record.sequence || record.molecule === "protein") {
      return [];
    }
    return record.features
      .filter((feature) => feature.feature.toLowerCase() === featureKey && feature.parsedLocation.supported)
      .map((feature) => {
        const ranges = feature.parsedLocation.ranges;
        const positions = getContextPositions(record, feature, flank);
        const sequence = positions.map((position) => {
          const base = record.sequence[position - 1] ?? "";
          return positionIsInRanges(position, ranges) ? base.toUpperCase() : base.toLowerCase();
        }).join("");
        return {
          title: `${record.accession} | ${feature.feature} | ${feature.gene || feature.locus_tag || feature.protein_id || feature.location} | ${feature.location} | flank=${flank}`,
          sequence,
          sourceTitle: record.accession,
          featureId: feature.id
        };
      })
      .filter((contextRecord) => contextRecord.sequence);
  });
}

function addGuardrailWarnings(warnings, input, records, filteredRecords, format) {
  if (String(input ?? "").length > 1_000_000) {
    warnings.push("Large annotated-record input detected; parsing is worker-backed, but map and FASTA outputs may still be large.");
  }
  const featureCount = records.reduce((sum, record) => sum + record.features.length, 0);
  if (featureCount > 2000) {
    warnings.push(`Parsed ${featureCount} features; use filters before generating maps or feature-derived FASTA for dense records.`);
  }
  const filteredFeatureCount = filteredRecords.reduce((sum, record) => sum + record.features.length, 0);
  if ((isSvgMapFormat(format) || isGenomeFigureFormat(format) || format === "text-map") && filteredFeatureCount > 500) {
    warnings.push(`Selected map or figure contains ${filteredFeatureCount} features; dense labels may be summarized or omitted by the renderer.`);
  }
}

function makeDownload(format, text, recordClass = "all") {
  const stem = recordClass === "protein" ? "annotated-protein-record-extractor" : "annotated-dna-record-extractor";
  if (format === "report") {
    return {
      output: text,
      download: { filename: `${stem}.txt`, mimeType: "text/plain;charset=utf-8" }
    };
  }
  if (format.endsWith("fasta")) {
    return {
      output: text,
      download: { filename: `${stem}.${format}.fasta`, mimeType: "text/x-fasta;charset=utf-8" }
    };
  }
  if (format === "text-map") {
    return {
      output: text,
      download: { filename: `${stem}.text-map.txt`, mimeType: "text/plain;charset=utf-8" }
    };
  }
  if (isSvgMapFormat(format)) {
    return {
      output: text,
      download: { filename: `${stem}.feature-map.svg`, mimeType: "image/svg+xml;charset=utf-8" }
    };
  }
  if (isGenomeFigureFormat(format)) {
    return {
      output: text,
      download: { filename: `${stem}.genome-figure-report.txt`, mimeType: "text/plain;charset=utf-8" }
    };
  }
  if (format === "interactive-viewer" || format === "interactive-circular-viewer") {
    return {
      output: text,
      download: { filename: `${stem}.viewer.json`, mimeType: "application/json;charset=utf-8" }
    };
  }
  return {
    output: text,
    download: { filename: `${stem}.features.tsv`, mimeType: "text/tab-separated-values;charset=utf-8" }
  };
}

function filterParsedRecordsByClass(records, recordClass) {
  if (recordClass === "protein") {
    return records.filter((record) => record.molecule === "protein");
  }
  if (recordClass === "dna") {
    return records.filter((record) => record.molecule !== "protein");
  }
  return records;
}

function classWarning(recordClass) {
  return recordClass === "protein"
    ? "No UniProt or GenPept protein flatfile records were found."
    : recordClass === "dna"
      ? "No GenBank/DDBJ, EMBL, GFF3+FASTA, GTF+FASTA, or BED+FASTA nucleotide records were found."
      : "No GenBank/DDBJ, EMBL, GFF3+FASTA, GTF+FASTA, BED+FASTA, or UniProt flatfile records were found.";
}

function normalizeFormat(options, recordClass) {
  const requestedFormat = options.outputFormat === "svg-map" ? "linear-svg-map" : options.outputFormat;
  const dnaFormats = new Set([
    "features-tsv",
    "whole-fasta",
    "cds-fasta",
    "protein-fasta",
    "selected-feature-fasta",
    "cds-uppercase-fasta",
    "gene-uppercase-fasta",
    "linear-svg-map",
    "circular-svg-map",
    "linear-genome-figure",
    "circular-genome-figure",
    "text-map",
    "interactive-viewer",
    "interactive-circular-viewer",
    "report"
  ]);
  const proteinFormats = new Set([
    "features-tsv",
    "protein-fasta",
    "selected-feature-fasta",
    "linear-svg-map",
    "text-map",
    "interactive-viewer",
    "report"
  ]);
  const allowed = recordClass === "protein" ? proteinFormats : recordClass === "dna" ? dnaFormats : new Set([...dnaFormats, ...proteinFormats]);
  return allowed.has(requestedFormat) ? requestedFormat : "features-tsv";
}

function runAnnotatedRecordExtractor(input, options = {}, context = {}, recordClass = "all") {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const parsed = parseBiologicalRecordInput(input, options);
  const recordsForClass = filterParsedRecordsByClass(parsed.records, recordClass);
  context.reportProgress?.({ phase: "building-records", progress: 0.25 });
  context.throwIfCancelled?.();
  const warnings = [...parsed.warnings];
  if (recordsForClass.length === 0) {
    return makeToolResult({
      output: "",
      warnings: warnings.length > 0 ? [...warnings, classWarning(recordClass)] : [classWarning(recordClass)],
      recordsProcessed: 0
    });
  }

  const normalizedOptions = { ...options, recordClass };
  const format = normalizeFormat(options, recordClass);
  const filteredRecords = filterRecordFeatures(recordsForClass, normalizedOptions);
  addGuardrailWarnings(warnings, input, recordsForClass, filteredRecords, format);
  const allFeatureCount = recordsForClass.reduce((sum, record) => sum + record.features.length, 0);
  const featureRows = flatfileRecordsToFeatureRows(filteredRecords);
  context.throwIfCancelled?.();
  const wholeRecords = recordClass === "protein" ? [] : flatfileRecordsToSequenceRecords(recordsForClass, "whole");
  context.throwIfCancelled?.();
  const cdsRecords = recordClass === "protein" ? [] : flatfileRecordsToSequenceRecords(recordsForClass, "cds-nucleotide");
  context.throwIfCancelled?.();
  const proteinRecords = flatfileRecordsToSequenceRecords(recordsForClass, "protein");
  context.throwIfCancelled?.();
  const selectedFeatureRecords = format === "selected-feature-fasta" ? makeSelectedFeatureRecords(filteredRecords) : [];
  context.throwIfCancelled?.();
  const flankLength = Math.max(0, Math.min(5000, Number.parseInt(options.contextFlankLength, 10) || 0));
  const cdsContextRecords = format === "cds-uppercase-fasta" ? makeUppercaseContextRecords(filteredRecords, "cds", flankLength) : [];
  context.throwIfCancelled?.();
  const geneContextRecords = format === "gene-uppercase-fasta" ? makeUppercaseContextRecords(filteredRecords, "gene", flankLength) : [];
  if (format === "selected-feature-fasta" && selectedFeatureRecords.length === 0) {
    warnings.push("No features had supported coordinates and sequence available for FASTA export.");
  }
  if (format === "cds-uppercase-fasta" && cdsContextRecords.length === 0) {
    warnings.push("No selected CDS features had supported nucleotide coordinates for CDS-as-uppercase output.");
  }
  if (format === "gene-uppercase-fasta" && geneContextRecords.length === 0) {
    warnings.push("No selected gene features had supported nucleotide coordinates for gene-as-uppercase output.");
  }
  context.reportProgress?.({ phase: "building-output", progress: 0.55 });
  context.throwIfCancelled?.();
  const lineWidth = Number.parseInt(options.lineWidth, 10) || 60;
  const featuresTsv = tableToTsv(flatfileFeatureColumns, featureRows);
  const wholeFasta = recordsToFasta(wholeRecords, lineWidth);
  const cdsFasta = recordsToFasta(cdsRecords, lineWidth);
  const proteinFasta = recordsToFasta(proteinRecords, lineWidth);
  const selectedFeatureFasta = recordsToFasta(selectedFeatureRecords, lineWidth);
  const cdsContextFasta = recordsToFasta(cdsContextRecords, lineWidth);
  const geneContextFasta = recordsToFasta(geneContextRecords, lineWidth);
  const contextRecordCount = cdsContextRecords.length + geneContextRecords.length;
  const report = makeReport(recordsForClass, featureRows, allFeatureCount, wholeRecords, cdsRecords, proteinRecords, contextRecordCount, recordClass);
  context.reportProgress?.({ phase: "rendering-selected-output", progress: 0.75 });
  context.throwIfCancelled?.();
  const textMap = format === "text-map" ? makeFeatureTextMap(filteredRecords) : "";
  context.throwIfCancelled?.();
  const svgMap = isSvgMapFormat(format) ? makeFeatureMapSvg(filteredRecords, mapLayoutForFormat(format)) : "";
  context.throwIfCancelled?.();
  const viewer = format === "interactive-viewer" || format === "interactive-circular-viewer"
    ? makeFeatureViewer(filteredRecords, normalizedOptions)
    : null;
  context.throwIfCancelled?.();
  const genomeFigure = isGenomeFigureFormat(format) ? makeGenomeFigureOutput(filteredRecords, format, context) : null;
  if (genomeFigure) {
    warnings.push(...genomeFigure.warnings);
    if (genomeFigure.figure.records.length === 0) {
      warnings.push("No DNA sequence records were available for Genome Figure output.");
    }
  }
  context.throwIfCancelled?.();
  const selectedText = format === "whole-fasta"
    ? wholeFasta
    : format === "cds-fasta"
      ? cdsFasta
    : format === "protein-fasta"
      ? proteinFasta
    : format === "selected-feature-fasta"
      ? selectedFeatureFasta
    : format === "cds-uppercase-fasta"
      ? cdsContextFasta
    : format === "gene-uppercase-fasta"
      ? geneContextFasta
      : format === "text-map"
        ? textMap
      : isGenomeFigureFormat(format)
        ? genomeFigure.output
      : isSvgMapFormat(format)
        ? svgMap
      : format === "interactive-viewer" || format === "interactive-circular-viewer"
        ? JSON.stringify(viewer, null, 2)
        : format === "report"
          ? report
          : featuresTsv;
  const selected = makeDownload(format, selectedText, recordClass);
  context.reportProgress?.({ phase: "finalizing", progress: 0.92 });
  context.throwIfCancelled?.();

  return makeToolResult({
    output: selected.output,
    download: selected.download,
    warnings,
    recordsProcessed: recordsForClass.length,
    basesProcessed: recordsForClass.reduce((sum, record) => sum + record.sequence.length, 0),
    streams: {
      ...(format === "report" ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(format === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(isSvgMapFormat(format) ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: recordClass === "protein" ? makeProteinViewerStream(viewer) : makeDnaViewerStream(viewer) } : {}),
      ...(genomeFigure ? { figure: makeGenomeFigureStream(genomeFigure.figure) } : {}),
      ...(format === "features-tsv" ? { featuresTsv: makeTextStream(featuresTsv, "text/tab-separated-values") } : {}),
      table: makeTableStream(flatfileFeatureColumns, featureRows, "flatfile-features"),
      ...(recordClass !== "protein" ? { wholeSequenceRecords: {
        kind: "sequence-records",
        alphabet: "dna-rna",
        schema: "flatfile-whole-sequences",
        records: wholeRecords
      } } : {}),
      ...(recordClass !== "protein" ? { cdsSequenceRecords: {
        kind: "sequence-records",
        alphabet: "dna-rna",
        schema: "flatfile-cds-sequences",
        records: cdsRecords
      } } : {}),
      proteinRecords: {
        kind: "sequence-records",
        alphabet: "protein",
        schema: "flatfile-protein-sequences",
        records: proteinRecords
      },
      ...(format === "whole-fasta" ? { wholeFasta: makeTextStream(wholeFasta, "text/x-fasta") } : {}),
      ...(format === "cds-fasta" ? { cdsFasta: makeTextStream(cdsFasta, "text/x-fasta") } : {}),
      ...(format === "protein-fasta" ? { proteinFasta: makeTextStream(proteinFasta, "text/x-fasta") } : {}),
      ...(format === "selected-feature-fasta" ? { selectedFeatureFasta: makeTextStream(selectedFeatureFasta, "text/x-fasta") } : {}),
      ...(format === "cds-uppercase-fasta" ? { cdsContextFasta: makeTextStream(cdsContextFasta, "text/x-fasta") } : {}),
      ...(format === "gene-uppercase-fasta" ? { geneContextFasta: makeTextStream(geneContextFasta, "text/x-fasta") } : {})
    },
    visual: isSvgMapFormat(format)
      ? { svg: svgMap }
      : viewer
        ? { viewer }
      : genomeFigure
        ? { figure: genomeFigure.figure }
        : undefined
  });
}

export function runRecordParserExtractor(input, options = {}, context = {}) {
  return runAnnotatedRecordExtractor(input, options, context, "all");
}

export function runAnnotatedDnaRecordExtractor(input, options = {}, context = {}) {
  return runAnnotatedRecordExtractor(input, options, context, "dna");
}

export function runAnnotatedProteinRecordExtractor(input, options = {}, context = {}) {
  return runAnnotatedRecordExtractor(input, options, context, "protein");
}

export async function runRecordParserExtractorWorker(input, options = {}, context = {}) {
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  const result = runRecordParserExtractor(input, options, context);
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}

export async function runAnnotatedDnaRecordExtractorWorker(input, options = {}, context = {}) {
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  const result = runAnnotatedDnaRecordExtractor(input, options, context);
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}

export async function runAnnotatedProteinRecordExtractorWorker(input, options = {}, context = {}) {
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  const result = runAnnotatedProteinRecordExtractor(input, options, context);
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
