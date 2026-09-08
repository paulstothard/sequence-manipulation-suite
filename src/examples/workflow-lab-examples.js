import { complementDnaRnaSequence } from "../core/sequence.js";
import { formatFastaRecord, parseSequenceInput } from "../core/fasta.js";

// Deliberately synthetic region: primers select positions 101–1100 (1,000 bp).
// Two EcoRI sites, a phased loss of the first
// site, and a three-base insertion on the other haplotype. Not an assay design.
export function haplotypeRestrictionExample() {
  let seed = 1701;
  const bases = Array.from({ length: 1200 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return "ACGT"[seed >>> 30];
  }).join("").replaceAll("GAATTC", "GAGTTC").split("");
  bases.splice(349, 6, ..."GAATTC");
  bases.splice(849, 6, ..."GAATTC");
  const reference = bases.join("");
  return `${formatFastaRecord("amplicon Synthetic phased PCR-RFLP region", reference)}##SMS3_VARIANTS##
##fileformat=VCFv4.2
##contig=<ID=amplicon,length=1200>
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=PS,Number=1,Type=Integer,Description="Phase set">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tDemo
amplicon\t351\tEcoRI_loss\tA\tG\t60\tPASS\t.\tGT:PS\t0|1:351
amplicon\t610\tinsertion\t${reference[609]}\t${reference[609]}GCT\t60\tPASS\t.\tGT:PS\t1|0:351
##SMS3_PRIMERS##
${formatFastaRecord("Forward", reference.slice(100, 120))}${formatFastaRecord("Reverse", complementDnaRnaSequence(reference.slice(1080, 1100)).split("").reverse().join(""))}`;
}

export async function proteinDigestComparisonExample() {
  // Reuse the bundled NCBI NM_000518.5 / NP_000509.1 HBB protein sequence.
  // K18A is an SMS3-engineered teaching substitution, numbered with initiator M.
  const { multipleAlignProteinExample } = await import("./multiple-alignment-examples.js");
  const reference = parseSequenceInput(multipleAlignProteinExample)[0].sequence;
  if (reference[17] !== "K") throw new Error("Unexpected beta-globin example sequence.");
  return formatFastaRecord("HBB_reference", reference) + formatFastaRecord("HBB_K18A_engineered", reference.slice(0, 17) + "A" + reference.slice(18));
}

export async function sequencingWorkflowExample() {
  // Reuse the complete, unmodified NC_012920.1 sequence bundled with its
  // GenBank provenance in organellar-workflow-example.js (16,569 bases).
  const { humanMitochondrionGenBankExample } = await import("./organellar-workflow-example.js");
  const sequence = humanMitochondrionGenBankExample.split(/\nORIGIN[^\n]*\n/)[1].split("//")[0].replace(/[^a-z]/gi, "").toUpperCase();
  return formatFastaRecord("NC_012920.1 Human mitochondrial reference", sequence);
}

export function qpcrHeatmapExample() {
  // Simulated independent groups: 4 conditions × 4 biological samples ×
  // 6 assays × 3 technical replicates, plus 12 undetected negative controls.
  const assays = [["RPLP0", 21.4, 98], ["HPRT1", 24.2, 94], ["IL6", 28.8, 92], ["CXCL8", 26.6, 96], ["MKI67", 25.7, 97], ["CDKN1A", 27.1, 95]];
  const conditions = ["Control", "Low dose", "High dose", "Recovery"];
  const shifts = [[0, 0, 0, 0, 0, 0], [0.03, -0.02, -1.1, -0.7, 0.8, -0.5], [-0.02, 0.03, -2.3, -1.8, 1.6, -1.5], [0.02, 0.01, -0.2, -0.3, 0.4, -0.7]];
  const rows = ["sample,target,condition,cq,efficiency,replicate,role,run"];
  for (let c = 0; c < conditions.length; c++) for (let b = 0; b < 4; b++) for (let g = 0; g < assays.length; g++) {
    const [gene, base, efficiency] = assays[g];
    for (let t = 0; t < 3; t++) {
      const biological = [0.14, -0.27, 0.31, -0.1][b] + Math.sin((c + 1) * (b + 2) * (g + 1)) * (g < 2 ? 0.06 : 0.3);
      const cq = base + shifts[c][g] + biological + [-0.09, 0.02, 0.08][t];
      rows.push(`${["C", "L", "H", "R"][c]}${b + 1},${gene},${conditions[c]},${cq.toFixed(3)},${efficiency},${t + 1},sample,Run1`);
    }
  }
  for (const [gene, , efficiency] of assays) for (const role of ["ntc", "nort"]) rows.push(`${role.toUpperCase()},${gene},,undetermined,${efficiency},1,${role},Run1`);
  return rows.join("\n");
}

export function fastqTrimmingExample() {
  // 80 deterministic synthetic reads: 40 good, 20 with Q5 tails, 10 too short,
  // and 10 containing 8 Ns. No instrument provenance is implied.
  let seed = 4901;
  return Array.from({ length: 80 }, (_, i) => {
    const length = i >= 60 && i < 70 ? 40 : 100;
    let sequence = Array.from({ length }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return "ACGT"[seed >>> 30];
    }).join("");
    if (i >= 70) sequence = sequence.slice(0, 30) + "N".repeat(8) + sequence.slice(38);
    const quality = i >= 40 && i < 60 ? "D".repeat(80) + "&".repeat(20) : "D".repeat(length);
    return `@synthetic_${i + 1}\n${sequence}\n+\n${quality}\n`;
  }).join("");
}

export function targetVariantExample() {
  // Synthetic positions exercise BED boundaries, indel spans, overlapping
  // targets, low-quality calls and an unmatched target.
  const rows = ["##fileformat=VCFv4.2", "##contig=<ID=chrDemo,length=10000>",
    '##FILTER=<ID=LowQual,Description="Low quality">',
    "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO"];
  for (let i = 0; i < 36; i++) {
    const pos = 101 + i * 200;
    rows.push(`chrDemo\t${pos}\tv${i + 1}\tA\tG\t${i % 9 === 0 ? 15 : 60}\t${i % 11 === 0 ? "LowQual" : "PASS"}\t.`);
  }
  rows.push("chrDemo\t99\tboundary_deletion\tACG\tA\t60\tPASS\t.",
    "chrDemo\t500\tlast_base\tA\tT\t60\tPASS\t.",
    "chrDemo\t501\tafter_target\tA\tATG\t60\tPASS\t.");
  const targets = ["chrDemo\t100\t500\tTarget_A", "chrDemo\t300\t900\tTarget_B",
    "chrDemo\t2000\t3000\tTarget_C", "chrDemo\t4000\t5000\tTarget_D",
    "chrDemo\t6000\t7000\tTarget_E", "chrDemo\t9000\t9500\tNo_calls"];
  return rows.join("\n") + "\n##SMS3_TARGETS##\n" + targets.join("\n") + "\n";
}
