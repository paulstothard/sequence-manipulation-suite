export const motifProvenance = {
  "dataset": "SMS3 motif references",
  "version": "2026-05 expanded motif references with JASPAR CORE",
  "accessDate": "2026-05-22",
  "description": "Bundled DNA/RNA and protein motif records for SMS3 motif scanners, including curated exact/IUPAC/regex records, expanded cited protein short-linear-motif records, and JASPAR CORE DNA transcription-factor PWM/PSSM profiles.",
  "license": "Mixed project-curated cited motif records and JASPAR CORE CC BY 4.0 derived PWM records. Protein databases with more restrictive terms are tracked as candidates and are not bundled wholesale.",
  "notes": [
    "Motif matches are candidate sites, not functional annotation.",
    "JASPAR CORE records are scored as PWM/PSSM profiles using SMS3's documented conversion from PFM counts.",
    "High-frequency short linear motifs and permissive PWM thresholds can produce many false positives."
  ],
  "sources": [
    {
      "name": "JASPAR 2024 CORE",
      "version": "2024 non-redundant CORE PFMs",
      "url": "https://jaspar2024.elixir.no/downloads/",
      "license": "CC BY 4.0",
      "records": 2346,
      "notes": "Bundled as PWM/PSSM-ready DNA transcription-factor profiles derived from the downloaded JASPAR PFM file."
    },
    {
      "name": "SMS3 curated motif set",
      "version": "2026-05 curated patterns",
      "license": "Project-curated cited consensus and regex records.",
      "records": 37,
      "notes": "Project-curated exact/IUPAC/regex motifs retained for teaching and protein scanning while larger protein databases are reviewed for redistribution constraints."
    }
  ],
  "proteinDatabaseCandidates": [
    {
      "name": "PROSITE",
      "license": "CC BY-NC-ND 4.0 / PROSITE license; not bundled wholesale without explicit redistribution review.",
      "url": "https://prosite.expasy.org/prosite_license.html"
    },
    {
      "name": "ELM",
      "license": "Requires source-specific licensing review before bundling generated records.",
      "url": "http://elm.eu.org/"
    }
  ]
};
export default motifProvenance;
