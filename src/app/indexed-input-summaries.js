export function summarizeVcfFromText(inputText, { lineLimit = 5000 } = {}) {
  const contigs = [];
  const samples = [];
  const genes = [];
  let version = "";
  let metadataLines = 0;
  let definitionCount = 0;
  let infoDefinitions = 0;
  let formatDefinitions = 0;
  let filterDefinitions = 0;
  let variantLines = 0;
  let hasColumnHeader = false;
  let scannedLines = 0;
  for (const line of String(inputText ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    scannedLines += 1;
    if (scannedLines > lineLimit) {
      break;
    }
    if (line.startsWith("##fileformat=")) {
      version = line.slice("##fileformat=".length).trim();
    }
    if (line.startsWith("##")) {
      metadataLines += 1;
      const key = line.slice(2, line.indexOf("=") > 0 ? line.indexOf("=") : undefined);
      if (["INFO", "FORMAT", "FILTER", "contig"].includes(key)) {
        definitionCount += 1;
      }
      if (key === "INFO") infoDefinitions += 1;
      if (key === "FORMAT") formatDefinitions += 1;
      if (key === "FILTER") filterDefinitions += 1;
    }
    if (line.startsWith("#CHROM")) {
      hasColumnHeader = true;
      samples.push(...line.split("\t").slice(9).filter(Boolean));
      continue;
    }
    const match = line.match(/^##contig=<ID=([^,>]+)/);
    if (match) {
      const lengthMatch = line.match(/(?:^|,)length=([^,>]+)/);
      contigs.push({
        id: match[1],
        length: lengthMatch ? Number.parseInt(lengthMatch[1], 10) : null
      });
    } else if (!line.startsWith("#")) {
      variantLines += 1;
      const fields = line.split("\t");
      const info = fields[7] ?? "";
      for (const match of info.matchAll(/(?:^|;)(?:ANN|CSQ)=([^;\t]+)/g)) {
        for (const entry of match[1].split(",")) {
          const parts = entry.split("|");
          for (const value of [parts[3], parts[4]]) {
            if (value && value !== ".") {
              genes.push(value);
            }
          }
        }
      }
    }
  }
  return {
    version,
    contigs: [...new Map(contigs.map((contig) => [contig.id, contig])).values()],
    samples: [...new Set(samples)],
    genes: [...new Set(genes)],
    metadataLines,
    definitionCount,
    infoDefinitions,
    formatDefinitions,
    filterDefinitions,
    variantLines,
    hasColumnHeader,
    scannedLines,
    truncated: scannedLines > lineLimit
  };
}

export function summarizeSamReferencesFromText(text, { lineLimit = 5000 } = {}) {
  const references = [];
  const alignmentReferences = [];
  let sortOrder = "";
  let alignmentLines = 0;
  let scannedLines = 0;
  let hasSamHeader = false;
  for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    scannedLines += 1;
    if (scannedLines > lineLimit) {
      break;
    }
    if (line.startsWith("@")) {
      hasSamHeader = true;
      const fields = line.split("\t");
      const refName = line.startsWith("@SQ\t")
        ? fields.find((field) => field.startsWith("SN:"))?.slice(3)
        : "";
      if (refName) {
        const lengthField = fields.find((field) => field.startsWith("LN:"));
        references.push({
          name: refName,
          length: lengthField ? Number.parseInt(lengthField.slice(3), 10) : null
        });
      }
      const sortField = line.startsWith("@HD\t")
        ? fields.find((field) => field.startsWith("SO:"))
        : null;
      if (sortField) {
        sortOrder = sortField.slice(3);
      }
      continue;
    }
    const fields = line.split("\t");
    if (fields.length >= 3) {
      alignmentLines += 1;
      if (fields[2] && fields[2] !== "*") {
        alignmentReferences.push(fields[2]);
      }
    }
  }
  const uniqueReferences = references.length > 0
    ? references
    : [...new Set(alignmentReferences)].map((name) => ({ name, length: null }));
  return {
    references: uniqueReferences,
    sortOrder,
    alignmentLines,
    hasSamHeader,
    scannedLines,
    truncated: scannedLines > lineLimit
  };
}

export function bamIndexLooksMatched(bamFile, indexFile) {
  if (!bamFile || !indexFile) {
    return false;
  }
  const bamName = String(bamFile.name ?? "").toLowerCase();
  const stem = bamName.replace(/\.bam$/i, "");
  const indexName = String(indexFile.name ?? "").toLowerCase();
  return [
    `${bamName}.bai`,
    `${stem}.bai`,
    `${bamName}.csi`,
    `${stem}.csi`
  ].includes(indexName);
}

export function vcfIndexLooksMatched(vcfFile, indexFile) {
  if (!vcfFile || !indexFile) {
    return false;
  }
  const vcfName = String(vcfFile.name ?? "").toLowerCase();
  const stem = vcfName.replace(/(\.vcf)?\.(gz|bgz)$/i, "");
  const indexName = String(indexFile.name ?? "").toLowerCase();
  return [
    `${vcfName}.tbi`,
    `${vcfName}.csi`,
    `${stem}.tbi`,
    `${stem}.csi`
  ].includes(indexName);
}

export function looksLikeCompressedVcfForIndexing(file) {
  return /\.(vcf\.gz|bgz|gz)$/i.test(file?.name ?? "");
}

export function indexedGenomeFastaLooksCompressed(file) {
  return /\.(gz|bgz)$/i.test(file?.name ?? "") || /gzip/i.test(file?.type ?? "");
}

export function indexedGenomeFaiLooksMatched(fastaFile, faiFile) {
  if (!fastaFile || !faiFile) {
    return false;
  }
  const fastaName = String(fastaFile.name ?? "").toLowerCase();
  const faiName = String(faiFile.name ?? "").toLowerCase();
  const uncompressedName = fastaName.replace(/\.gz$/i, "");
  return faiName === `${fastaName}.fai` || faiName === `${uncompressedName}.fai`;
}

export function indexedGenomeGziLooksMatched(fastaFile, gziFile) {
  if (!fastaFile || !gziFile) {
    return false;
  }
  const fastaName = String(fastaFile.name ?? "").toLowerCase();
  const gziName = String(gziFile.name ?? "").toLowerCase();
  return gziName === `${fastaName}.gzi`;
}
