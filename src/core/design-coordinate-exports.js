import { formatFastaRecord } from "./fasta.js";
// Export coordinates against stable record IDs; original titles remain encoded
// metadata and GFF3 embeds the actual reference sequences used for the design.
const esc = value => encodeURIComponent(String(value));
export function makeGuideBed(result) {
  const lines = ["# BED6; 0-based half-open spacer coordinates; score=0 (uncalibrated)", ...result.records.map((r,i) => `# target-${i+1}\t${JSON.stringify(r.title)}`)];
  for (const r of result.rows) lines.push([`target-${r.recordIndex+1}`,r.guide_start-1,r.guide_end,r.candidate_id,0,r.strand].join("\t"));
  return lines.join("\n")+"\n";
}
export function makeGuideGff(result) {
  const lines = ["##gff-version 3", "# Guide and PAM annotations; estimated cleavage coordinate is an attribute, not a validated cut measurement.", ...result.records.map((r,i) => `##sequence-region target-${i+1} 1 ${r.sequence.length}`)];
  for (const r of result.rows) {
    const seqid=`target-${r.recordIndex+1}`;
    lines.push([seqid,"SMS3","sequence_feature",r.guide_start,r.guide_end,".",r.strand,".",`ID=${esc(r.candidate_id)};Name=${esc(r.record)};feature_role=guide_spacer;nuclease=${esc(r.nuclease)};cut_position_estimate=${esc(r.cut_position)}`].join("\t"));
    lines.push([seqid,"SMS3","sequence_feature",r.pam_start,r.pam_end,".",r.strand,".",`ID=${esc(r.candidate_id)}.pam;feature_role=PAM;guide_id=${esc(r.candidate_id)};sequence=${esc(r.pam_sequence)}`].join("\t"));
  }
  lines.push("##FASTA", ...result.records.map((r,i) => formatFastaRecord(`target-${i+1} original_title=${esc(r.title)}`,r.sequence,60).trimEnd()));
  return lines.join("\n")+"\n";
}
