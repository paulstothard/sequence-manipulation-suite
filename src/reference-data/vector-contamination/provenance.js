export const vectorContaminationProvenance = {
  "dataset": "SMS3 vector contamination references",
  "version": "UniVec_Core build 10.0",
  "buildDate": "2026-05-02",
  "accessDate": "2026-05-02",
  "source": {
    "name": "NCBI UniVec_Core",
    "version": "UniVec_Core build 10.0",
    "url": "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/UniVec_Core",
    "readmeUrl": "https://ftp.ncbi.nlm.nih.gov/pub/UniVec/README.uv",
    "license": "NCBI public reference data with README.uv disclaimer."
  },
  "sourceFileHash": "sha256:ea5d15248a4f438069ffa70bb6088f28935379354ea3e924cc5d6db40be92c5c",
  "readmeFileHash": "sha256:c5fd2af898c5eab73578d40bcb983f56d69c3296774db572252d7094f84400d8",
  "buildScript": "scripts/reference-data/build-vector-contamination-index.mjs",
  "indexFormatVersion": 2,
  "kmerLength": 11,
  "filters": [
    "Uppercase DNA/RNA symbols only.",
    "UniVec_Core FASTA definition lines are normalized to stable SMS3 ids.",
    "The scanner uses an ungapped local extension model and does not claim BLAST/VecScreen equivalence."
  ],
  "validation": {
    "recordCount": 3155,
    "totalBases": 688131,
    "indexedKmers": 0,
    "indexMode": "runtime-kmer-map"
  },
  "redistribution": "NCBI UniVec_Core data are bundled as derived browser-local reference data. README.uv states a United States Government disclaimer and identifies company-contributed non-GenBank sources.",
  "oracleFixtures": [
    "BLAST+ 2.16.0 fixtures: test/fixtures/vector-contamination/expected/manifest.json covers perfect, reverse-strand, short high-identity, near-threshold mismatch, clean no-hit and gapped-insertion cases. The gapped case documents an unsupported alignment model."
  ],
  "notes": [
    "SMS3 uses an ungapped 11-base seed-and-extend candidate screen. Confidence tiers are local length/identity heuristics; NCBI VecScreen classifications are not reproduced.",
    "The browser app does not fetch external contamination databases at runtime."
  ]
};

export default vectorContaminationProvenance;
