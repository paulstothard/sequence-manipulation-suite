export const textStopWordsProvenance = {
  "dataset": "text-stop-words",
  "version": "2026-05-17-snowball-english-seed",
  "language": "english",
  "source": "Snowball English stop-word list, with common contraction fragments retained for browser tokenization.",
  "sourceUrl": "https://snowballstem.org/algorithms/english/stop.txt",
  "sourceProjectUrl": "https://snowballstem.org/",
  "license": "BSD-3-Clause style Snowball project terms",
  "accessDate": "2026-05-17",
  "buildScript": "scripts/reference-data/build-text-stop-word-data.mjs",
  "wordCount": 158,
  "notes": "This is the default English list used by Word Cloud. Additional user-provided stop words are merged at run time."
};

export default textStopWordsProvenance;
