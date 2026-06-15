export const vectorContaminationSummary = {
  "dataset": "SMS3 vector contamination references",
  "version": "UniVec_Core build 10.0",
  "buildDate": "2026-05-02",
  "sourceName": "NCBI UniVec_Core",
  "sourceVersion": "UniVec_Core build 10.0",
  "recordCount": 3155,
  "totalBases": 688131,
  "indexFormatVersion": 2,
  "kmerLength": 11,
  "matchModel": "Browser-local ungapped seed-and-extend scanner using a runtime k-mer map built from bundled UniVec_Core sequences.",
  "notes": [
    "UniVec_Core is a subset of UniVec selected by NCBI to minimize false positives for automatic processing.",
    "SMS3 uses a browser-local ungapped seed-and-extend implementation, not NCBI VecScreen BLAST.",
    "Hits should be reviewed as candidate vector contamination."
  ]
};

export default vectorContaminationSummary;
