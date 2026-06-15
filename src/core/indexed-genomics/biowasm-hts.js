import { canRunBioWasm, createBioWasmCli } from "../biowasm-runner.js";

const SAMTOOLS_VERSION = "1.21";
const BCFTOOLS_VERSION = "1.10";

let samtoolsCliPromise = null;
let bcftoolsCliPromise = null;
let runCounter = 0;

function nextRunId(prefix) {
  runCounter += 1;
  return `${prefix}_${Date.now()}_${runCounter}`;
}

function fileNameLower(file) {
  return String(file?.name ?? "").toLowerCase();
}

function indexedVcfBaseName(file, runId) {
  const name = fileNameLower(file);
  if (name.endsWith(".bcf")) {
    return `${runId}.bcf`;
  }
  return `${runId}.vcf.gz`;
}

export function canRunBioWasmHtsTools() {
  return canRunBioWasm();
}

export async function getBioWasmSamtoolsCli() {
  if (!samtoolsCliPromise) {
    samtoolsCliPromise = createBioWasmCli({
      tool: "samtools",
      program: "samtools",
      version: SAMTOOLS_VERSION,
      assetPath: "../vendor/biowasm/samtools/1.21"
    });
  }
  return samtoolsCliPromise;
}

export async function getBioWasmBcftoolsCli() {
  if (!bcftoolsCliPromise) {
    bcftoolsCliPromise = createBioWasmCli({
      tool: "bcftools",
      program: "bcftools",
      version: BCFTOOLS_VERSION,
      assetPath: "../vendor/biowasm/bcftools/1.10"
    });
  }
  return bcftoolsCliPromise;
}

function makeMountItem(name, data) {
  return { name, data };
}

function assertCleanRegionString(region) {
  if (!region || /\s/.test(region)) {
    throw new Error(`Invalid region for indexed query: ${region || "(empty)"}`);
  }
  return region;
}

function htsError(stderr, toolName) {
  const message = String(stderr ?? "").trim();
  if (!message) {
    return "";
  }
  if (/error|failed|fail to|could not|not found|no such file|truncated|corrupt|invalid/i.test(message)) {
    return `${toolName} reported an error: ${message}`;
  }
  return "";
}

export async function runSamtoolsFaidx({ fastaFile, faiText, gziFile, isBgzip, regions }, context = {}) {
  if (!canRunBioWasmHtsTools()) {
    throw new Error("BioWasm SAMtools requires browser Worker execution.");
  }
  if (!fastaFile?.slice) {
    throw new Error("SAMtools faidx requires a FASTA file.");
  }
  if (!faiText) {
    throw new Error("SAMtools faidx requires a matching FAI index.");
  }
  if (isBgzip && !gziFile?.slice) {
    throw new Error("SAMtools faidx requires a matching GZI index for BGZF FASTA.");
  }

  const cli = await getBioWasmSamtoolsCli();
  const runId = nextRunId("sms3_faidx");
  const fastaName = isBgzip ? `${runId}.fa.gz` : `${runId}.fa`;
  const mounts = [
    makeMountItem(fastaName, fastaFile),
    makeMountItem(`${fastaName}.fai`, new Blob([faiText], { type: "text/plain" }))
  ];
  if (isBgzip) {
    mounts.push(makeMountItem(`${fastaName}.gzi`, gziFile));
  }

  context.reportProgress?.({ phase: "mounting-biowasm-fasta", progress: 0.18 });
  const [fastaPath] = await cli.mount(mounts);
  context.throwIfCancelled?.();

  const requestedRegions = regions.map(assertCleanRegionString);
  context.reportProgress?.({ phase: "running-samtools-faidx", progress: 0.45 });
  const result = await cli.exec("samtools", ["faidx", fastaPath, ...requestedRegions]);
  context.throwIfCancelled?.();
  const error = htsError(result?.stderr, "samtools faidx");
  if (error) {
    throw new Error(error);
  }
  return String(result?.stdout ?? "");
}

function indexedBamBaseName(file, runId) {
  const name = fileNameLower(file);
  if (name.endsWith(".cram")) {
    return `${runId}.cram`;
  }
  if (name.endsWith(".sam")) {
    return `${runId}.sam`;
  }
  return `${runId}.bam`;
}

async function mountIndexedBamBundle({ bamFile, indexFile }, context = {}) {
  if (!bamFile?.slice || !indexFile?.slice) {
    throw new Error("SAMtools indexed BAM region queries require a BAM file and matching BAI or CSI index.");
  }
  const cli = await getBioWasmSamtoolsCli();
  const runId = nextRunId("sms3_bam");
  const bamName = indexedBamBaseName(bamFile, runId);
  const indexSuffix = fileNameLower(indexFile).endsWith(".csi") ? ".csi" : ".bai";
  const indexName = `${bamName}${indexSuffix}`;

  context.reportProgress?.({ phase: "mounting-biowasm-bam", progress: 0.14 });
  const [bamPath] = await cli.mount([
    makeMountItem(bamName, bamFile),
    makeMountItem(indexName, indexFile)
  ]);
  context.throwIfCancelled?.();
  return { cli, bamPath };
}

export async function runSamtoolsIndexedBamRegion({ bamFile, indexFile, region }, context = {}) {
  if (!canRunBioWasmHtsTools()) {
    throw new Error("BioWasm SAMtools requires browser Worker execution.");
  }
  const { cli, bamPath } = await mountIndexedBamBundle({ bamFile, indexFile }, context);
  context.reportProgress?.({ phase: "querying-biowasm-bam-region", progress: 0.5 });
  const result = await cli.exec("samtools", ["view", "-h", bamPath, assertCleanRegionString(region)]);
  context.throwIfCancelled?.();
  const error = htsError(result?.stderr, "samtools view");
  if (error) {
    throw new Error(error);
  }
  return String(result?.stdout ?? "");
}

export async function runBcftoolsViewHeader({ vcfFile, indexFile }, context = {}) {
  if (!canRunBioWasmHtsTools()) {
    throw new Error("BioWasm BCFtools requires browser Worker execution.");
  }
  const { cli, vcfPath } = await mountIndexedVcfBundle({ vcfFile, indexFile }, context);
  context.reportProgress?.({ phase: "reading-biowasm-vcf-header", progress: 0.18 });
  const result = await cli.exec("bcftools", ["view", "-h", vcfPath]);
  context.throwIfCancelled?.();
  const error = htsError(result?.stderr, "bcftools view");
  if (error) {
    throw new Error(error);
  }
  return String(result?.stdout ?? "");
}

export async function runBcftoolsViewRegion({ vcfFile, indexFile, region }, context = {}) {
  if (!canRunBioWasmHtsTools()) {
    throw new Error("BioWasm BCFtools requires browser Worker execution.");
  }
  const { cli, vcfPath } = await mountIndexedVcfBundle({ vcfFile, indexFile }, context);
  context.reportProgress?.({ phase: "querying-biowasm-vcf-region", progress: 0.45 });
  const result = await cli.exec("bcftools", ["view", "-H", "-r", assertCleanRegionString(region), vcfPath]);
  context.throwIfCancelled?.();
  const error = htsError(result?.stderr, "bcftools view");
  if (error) {
    throw new Error(error);
  }
  return String(result?.stdout ?? "");
}

export async function runBcftoolsIndexedRegion({ vcfFile, indexFile, region }, context = {}) {
  if (!canRunBioWasmHtsTools()) {
    throw new Error("BioWasm BCFtools requires browser Worker execution.");
  }
  const { cli, vcfPath } = await mountIndexedVcfBundle({ vcfFile, indexFile }, context);
  context.reportProgress?.({ phase: "reading-biowasm-vcf-header", progress: 0.22 });
  const headerResult = await cli.exec("bcftools", ["view", "-h", vcfPath]);
  context.throwIfCancelled?.();
  const headerError = htsError(headerResult?.stderr, "bcftools view");
  if (headerError) {
    throw new Error(headerError);
  }
  context.reportProgress?.({ phase: "querying-biowasm-vcf-region", progress: 0.5 });
  const dataResult = await cli.exec("bcftools", ["view", "-H", "-r", assertCleanRegionString(region), vcfPath]);
  context.throwIfCancelled?.();
  const dataError = htsError(dataResult?.stderr, "bcftools view");
  if (dataError) {
    throw new Error(dataError);
  }
  return {
    headerText: String(headerResult?.stdout ?? ""),
    dataText: String(dataResult?.stdout ?? "")
  };
}

async function mountIndexedVcfBundle({ vcfFile, indexFile }, context = {}) {
  if (!vcfFile?.slice || !indexFile?.slice) {
    throw new Error("BCFtools indexed region queries require a VCF/BCF file and matching index.");
  }
  const cli = await getBioWasmBcftoolsCli();
  const runId = nextRunId("sms3_vcf");
  const vcfName = indexedVcfBaseName(vcfFile, runId);
  const indexSuffix = fileNameLower(indexFile).endsWith(".csi") ? ".csi" : ".tbi";
  const indexName = `${vcfName}${indexSuffix}`;

  context.reportProgress?.({ phase: "mounting-biowasm-vcf", progress: 0.14 });
  const [vcfPath] = await cli.mount([
    makeMountItem(vcfName, vcfFile),
    makeMountItem(indexName, indexFile)
  ]);
  context.throwIfCancelled?.();
  return { cli, vcfPath };
}
