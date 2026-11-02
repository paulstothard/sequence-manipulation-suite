import { complementDnaRnaSequence } from "./sequence.js";
import { finalizeReferenceCoverage, referenceCoverageColumns } from "./design-analysis.js";

export const talenReferenceHitColumns = [
  ...["pair_id", "reference_id", "reference_record", "design_strand", "left_strand", "right_strand"].map(id => ({ id, label: id.replaceAll("_", " "), type: "string" })),
  ...["left_start", "left_end", "right_start", "right_end", "spacer_length"].map(id => ({ id, label: id.replaceAll("_", " "), type: "number" })),
  ...["left_binding_dna", "right_binding_dna", "spacer_dna", "search_model"].map(id => ({ id, label: id.replaceAll("_", " "), type: "string" })),
  ...referenceCoverageColumns
];
const rc = s => Array.from(complementDnaRnaSequence(s, { preserveCase: false })).reverse().join("");
const pattern = (s, nn) => Array.from(s, b => b === "G" && nn ? "[AG]" : b).join("");
const positions = (s, p) => {
  const re = new RegExp(`(?=(${p}))`, "g"), out = [];
  let m;
  while ((m = re.exec(s))) { out.push(m.index); re.lastIndex = m.index + 1; }
  return out;
};

// Limited recognition-code screen, not a binding-energy/cleavage model.
// NN cross-recognition: Meckler et al. 2013, doi:10.1093/nar/gkt085.
// Spacer architecture: https://tale-nt.cac.cornell.edu/tutorials/talentargeterupdated
export async function screenTalenPairs(rows, records, options, context, warnings) {
  const hitRows = [], visited = new Set(), skippedPairs = [];
  const model = `paired RVD-code matches; NN=G/A; NH=G; spacer ${options.minSpacerLength}-${options.maxSpacerLength} nt; position-0 T ${options.requireFivePrimeT ? "required" : "not required"}; no additional mismatches/bulges`;
  const screen = { status: records.length ? "run" : options.referenceSource && options.referenceSource !== "none" ? "skipped" : "not run", source: options.referenceSource ?? "", records: records.length,
    recordsScanned: 0, recordsSkipped: options.referenceRecordsSkipped ?? 0, basesProcessed: 0, searchModel: model, hitDetailsTruncated: false, detailRowsOmitted: 0, limits: { orientedBaseWork: 50000000, hitDetailRows: 5000 } };
  let work = 0;
  const workLimit = 50000000, hitLimit = 5000;
  for (const row of rows) {
    row.reference_match_count = 0;
    if (!/^[ACGT]+$/.test(row.left_site_dna + row.right_binding_dna)) { skippedPairs.push(row); continue; }
    const seen = new Set();
    const lp = pattern(row.left_site_dna, options.guanineRvd === "NN");
    // Reverse the binding pattern by constructing from its base alphabet.
    const rp = Array.from(row.right_binding_dna).reverse().map(b => b === "G" && options.guanineRvd === "NN" ? "[CT]" : rc(b)).join("");
    for (const [ri, record] of records.entries()) {
      const seq = String(record.sequence).toUpperCase().replaceAll("U", "T");
      if (work + seq.length * 2 > workLimit) { skippedPairs.push(row); break; }
      work += seq.length * 2; visited.add(ri);
      for (const strand of ["+", "-"]) {
        const oriented = strand === "+" ? seq : rc(seq);
        const rightPositions = new Set(positions(oriented, rp));
        for (const left of positions(oriented, lp)) {
          if (options.requireFivePrimeT && oriented[left - 1] !== "T") continue;
          for (let spacer = options.minSpacerLength; spacer <= options.maxSpacerLength; spacer++) {
            const right = left + row.left_length + spacer;
            if (!rightPositions.has(right) || (options.requireFivePrimeT && oriented[right + row.right_length] !== "A")) continue;
            const project = (start, length) => strand === "+" ? [start + 1, start + length] : [seq.length - start - length + 1, seq.length - start];
            const [ls, le] = project(left, row.left_length), [rs, re] = project(right, row.right_length);
            const key = `${ri}:${Math.min(ls, rs)}:${Math.max(le, re)}:${[`${ls}-${le}`, `${rs}-${re}`].sort().join(":")}`;
            if (seen.has(key)) continue;
            seen.add(key); row.reference_match_count++;
            if (hitRows.length < hitLimit) hitRows.push({ pair_id: row.pair_id, reference_id: `reference-${ri + 1}`, reference_record: record.title, design_strand: strand, left_strand: strand, right_strand: strand === "+" ? "-" : "+", left_start: ls, left_end: le, right_start: rs, right_end: re, spacer_length: spacer, left_binding_dna: oriented.slice(left, left + row.left_length), right_binding_dna: rc(oriented.slice(right, right + row.right_length)), spacer_dna: oriented.slice(left + row.left_length, right), search_model: model });
            else { screen.hitDetailsTruncated = true; screen.detailRowsOmitted++; }
          }
        }
      }
      context.throwIfCancelled?.(); await context.yieldIfNeeded?.();
    }
  }
  screen.recordsScanned = visited.size;
  screen.basesProcessed = [...visited].reduce((sum, i) => sum + records[i].sequence.length, 0);
  screen.candidatesIncomplete = new Set(skippedPairs).size;
  if (rows.length === 0) screen.status = "not run";
  const ambiguous = records.some(r => /[^ACGT]/.test(r.sequence));
  if (records.length && (skippedPairs.length || ambiguous || options.referenceCharactersRemoved)) {
    screen.status = visited.size ? "partial" : "skipped";
    screen.skipReason = [skippedPairs.length ? "some candidate searches incomplete (ambiguous designs or work limit)" : "", ambiguous ? "unresolved reference bases can hide half-site matches" : "", options.referenceCharactersRemoved ? "unsupported reference characters removed; coordinates refer to normalized sequence" : ""].filter(Boolean).join("; ");
    warnings.push(`TALEN reference search ${screen.status}: ${screen.skipReason}.`);
  }
  if (screen.hitDetailsTruncated) warnings.push(`Reference hit details limited to ${hitLimit}; candidate counts include all hits found in scanned regions.`);
  finalizeReferenceCoverage(rows, screen);
  finalizeReferenceCoverage(hitRows, screen);
  return { screen, hitRows };
}
