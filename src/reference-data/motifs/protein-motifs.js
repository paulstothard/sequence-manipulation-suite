export const proteinMotifs = [
  {
    "id": "protein-factor-xa-cleavage-site",
    "name": "Factor Xa cleavage site IEGR",
    "alphabet": "protein",
    "class": "cleavage-site",
    "syntax": "regex",
    "pattern": "IEGR",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/S1046-5928(03)00119-0",
      "citation": "Jenny RJ et al. A critical review of the methods for cleavage of fusion proteins with thrombin and factor Xa. Protein Expr Purif. 2003;31:1-11.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Common engineered factor Xa cleavage-site candidate.",
    "scope": "Protein sequences; engineered cleavage-site motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Exact IEGR match; cleavage efficiency and folded-protein accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-tev-protease-site",
    "name": "TEV protease cleavage site",
    "alphabet": "protein",
    "class": "cleavage-site",
    "syntax": "regex",
    "pattern": "ENLYFQ[GS]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1093/protein/14.12.993",
      "citation": "Kapust RB et al. Tobacco etch virus protease: mechanism of autolysis and rational design of stable mutants with wild-type catalytic proficiency. Protein Eng. 2001;14:993-1000.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Canonical engineered TEV protease cleavage-site candidate.",
    "scope": "Protein sequences; engineered cleavage-site motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match reports ENLYFQ-G/S sites; cleavage efficiency and folded-protein accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-thrombin-cleavage-site",
    "name": "Thrombin cleavage site LVPRGS",
    "alphabet": "protein",
    "class": "cleavage-site",
    "syntax": "regex",
    "pattern": "LVPRGS",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/S1046-5928(03)00119-0",
      "citation": "Jenny RJ et al. A critical review of the methods for cleavage of fusion proteins with thrombin and factor Xa. Protein Expr Purif. 2003;31:1-11.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Common engineered thrombin cleavage-site candidate.",
    "scope": "Protein sequences; engineered cleavage-site motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Exact LVPRGS match; cleavage efficiency and folded-protein accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-cdc4-phosphodegron-like",
    "name": "Cdc4 phosphodegron-like motif",
    "alphabet": "protein",
    "class": "degradation-signal",
    "syntax": "regex",
    "pattern": "[ST]P..[STDE]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1038/35107009",
      "citation": "Nash P et al. Multisite phosphorylation of a CDK inhibitor sets a threshold for the onset of DNA replication. Nature. 2001;414:514-521.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Broad candidate Cdc4 phosphodegron-like S/T-P-x-x-S/T/D/E motif.",
    "scope": "Protein sequences; phosphorylation-dependent degron candidate only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match does not require actual phosphorylation, priming, spacing variants, or F-box protein context."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-d-box-destruction-motif",
    "name": "Cyclin destruction box D box",
    "alphabet": "protein",
    "class": "degradation-signal",
    "syntax": "regex",
    "pattern": "R..L....N",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1038/349132a0",
      "citation": "Glotzer M et al. Cyclin is degraded by the ubiquitin pathway. Nature. 1991;349:132-138.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate RxxLxxxxN destruction box motif.",
    "scope": "Protein sequences; candidate APC/C-related degradation motif with many false positives.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses a compact D-box consensus; cell-cycle state, degron accessibility, and cofactor context are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-ken-box",
    "name": "KEN box degradation motif",
    "alphabet": "protein",
    "class": "degradation-signal",
    "syntax": "regex",
    "pattern": "KEN",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1101/gad.14.5.655",
      "citation": "Pfleger CM, Kirschner MW. The KEN box: an APC recognition signal distinct from the D box targeted by Cdh1. Genes Dev. 2000;14:655-665.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate KEN box APC/C recognition motif.",
    "scope": "Protein sequences; short candidate motif with many false positives.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Exact KEN match against cleaned protein sequence; degron accessibility and APC/C co-activator context are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-c2h2-zinc-finger",
    "name": "C2H2 zinc-finger signature",
    "alphabet": "protein",
    "class": "domain-signature",
    "syntax": "regex",
    "pattern": "C.{2,4}C.{12}H.{3,5}H",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1101/SQB.1987.052.01.054",
      "citation": "Klug A, Rhodes D. Zinc fingers: a novel protein fold for nucleic acid recognition. Cold Spring Harb Symp Quant Biol. 1987;52:473-482.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate C2H2 zinc-finger spacing signature.",
    "scope": "Protein sequences; domain-signature candidate only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match captures broad Cys/His spacing and does not model zinc coordination, fold quality, or DNA-binding specificity."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-p-loop-ntp-binding",
    "name": "P-loop NTP-binding Walker A motif",
    "alphabet": "protein",
    "class": "domain-signature",
    "syntax": "regex",
    "pattern": "G....GK[ST]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/0968-0004(90)90281-F",
      "citation": "Saraste M et al. The P-loop - a common motif in ATP- and GTP-binding proteins. Trends Biochem Sci. 1990;15:430-434.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate Walker A / P-loop NTP-binding motif.",
    "scope": "Protein sequences; domain-signature candidate only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses GxxxxGKS/T; full fold, phosphate-binding loop context, and NTP specificity are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-pdz-class-i-cterm",
    "name": "Class I PDZ-binding C-terminal motif",
    "alphabet": "protein",
    "class": "interaction-motif",
    "syntax": "regex",
    "pattern": "[ST].[VIL]$",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1126/science.275.5296.73",
      "citation": "Songyang Z et al. Recognition of unique carboxyl-terminal motifs by distinct PDZ domains. Science. 1997;275:73-77.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate class I PDZ-binding motif at the protein C terminus.",
    "scope": "Protein sequences; terminal candidate motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match requires S/T-x-hydrophobic at the cleaned protein C terminus; PDZ-domain specificity is not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-sh3-class-i-pxxp",
    "name": "Class I SH3-binding PxxP motif",
    "alphabet": "protein",
    "class": "interaction-motif",
    "syntax": "regex",
    "pattern": "R..P..P",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/0092-8674(94)90360-3",
      "citation": "Yu H et al. Structural basis for the binding of proline-rich peptides to SH3 domains. Cell. 1994;76:933-945.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate class I SH3-binding proline-rich motif.",
    "scope": "Protein sequences; broad proline-rich interaction candidate.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses RxxPxxP only; SH3-domain specificity, peptide orientation variants, and flanking charge are simplified."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-pdz-class-ii-cterm",
    "name": "Class II PDZ-binding C-terminal motif",
    "alphabet": "protein",
    "class": "interaction-motif",
    "syntax": "regex",
    "pattern": "[VILFY].[VIL]$",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1126/science.275.5296.73",
      "citation": "Songyang Z et al. Recognition of unique carboxyl-terminal motifs by distinct PDZ domains. Science. 1997;275:73-77.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate class II PDZ-binding motif at the protein C terminus.",
    "scope": "Protein sequences; terminal candidate motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match requires hydrophobic/aromatic-x-hydrophobic at the cleaned protein C terminus; PDZ-domain specificity is not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-sh3-class-ii-pxxp",
    "name": "Class II SH3-binding PxxP motif",
    "alphabet": "protein",
    "class": "interaction-motif",
    "syntax": "regex",
    "pattern": "P..P.R",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/0092-8674(94)90360-3",
      "citation": "Yu H et al. Structural basis for the binding of proline-rich peptides to SH3 domains. Cell. 1994;76:933-945.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate class II SH3-binding proline-rich motif.",
    "scope": "Protein sequences; broad proline-rich interaction candidate.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses PxxPxR only; SH3-domain specificity, peptide orientation variants, and flanking charge are simplified."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-pdz-class-iii-cterm",
    "name": "Class III PDZ-binding C-terminal motif",
    "alphabet": "protein",
    "class": "interaction-motif",
    "syntax": "regex",
    "pattern": "[DE].[VIL]$",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1126/science.275.5296.73",
      "citation": "Songyang Z et al. Recognition of unique carboxyl-terminal motifs by distinct PDZ domains. Science. 1997;275:73-77.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate class III PDZ-binding motif at the protein C terminus.",
    "scope": "Protein sequences; terminal candidate motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match requires acidic-x-hydrophobic at the cleaned protein C terminus; PDZ-domain specificity is not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-lir-aim",
    "name": "LC3-interacting region or Atg8-interacting motif",
    "alphabet": "protein",
    "class": "interaction-motif",
    "syntax": "regex",
    "pattern": "[WFY]..[LIV]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1074/jbc.M702824200",
      "citation": "Pankiv S et al. p62/SQSTM1 binds directly to Atg8/LC3 to facilitate degradation of ubiquitinated protein aggregates by autophagy. J Biol Chem. 2007;282:24131-24145.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Broad candidate LC3-interacting region / Atg8-interacting motif.",
    "scope": "Protein sequences; short hydrophobic candidate motif with many false positives.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses W/F/Y-x-x-L/I/V; acidic flanks, disorder, phosphorylation, and accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-caax-prenylation-signal",
    "name": "C-terminal CaaX prenylation signal",
    "alphabet": "protein",
    "class": "lipidation-site",
    "syntax": "regex",
    "pattern": "C..[AILMSTV]$",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/0092-8674(90)90294-O",
      "citation": "Hancock JF et al. A polybasic domain or palmitoylation is required in addition to the CAAX motif to localize p21ras to the plasma membrane. Cell. 1990;63:133-139.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Broad candidate CaaX prenylation signal at the protein C terminus.",
    "scope": "Protein sequences; C-terminal candidate motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match requires CaaX-like terminal sequence; prenyltransferase preference and upstream context are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-n-myristoylation-site",
    "name": "N-myristoylation site",
    "alphabet": "protein",
    "class": "lipidation-site",
    "syntax": "regex",
    "pattern": "G[^EDRKHPFYW]..[STAGCN][^P]",
    "source": {
      "name": "PROSITE",
      "version": "PS00008 pattern version 1",
      "accessDate": "2026-05-02",
      "url": "https://prosite.expasy.org/PS00008",
      "citation": "PROSITE PS00008 / PDOC00008; consensus G-{EDRKHPFYW}-x(2)-[STAGCN]-{P}.",
      "license": "Pattern represented as project-curated metadata; review PROSITE terms before bundling larger derived datasets."
    },
    "description": "Candidate N-myristoylation motif near glycine.",
    "scope": "Protein sequences; candidate motif only, usually interpreted near an exposed N terminus.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression translation of PROSITE pattern G-{EDRKHPFYW}-x(2)-[STAGCN]-{P}; N-terminal processing context is not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-n-glycosylation-sequon",
    "name": "N-glycosylation sequon",
    "alphabet": "protein",
    "class": "modification-site",
    "syntax": "regex",
    "pattern": "N[^P][ST][^P]",
    "source": {
      "name": "PROSITE",
      "version": "PS00001 pattern version 1",
      "accessDate": "2026-05-02",
      "url": "https://prosite.expasy.org/PS00001",
      "citation": "PROSITE PS00001 / PDOC00001; consensus N-{P}-[ST]-{P}.",
      "license": "Pattern represented as project-curated metadata; review PROSITE terms before bundling larger derived datasets."
    },
    "description": "Canonical N-X-S/T sequon excluding proline at X and immediately after S/T.",
    "scope": "Protein sequences; candidate sequon only, not evidence of glycosylation.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression translation of PROSITE pattern N-{P}-[ST]-{P}; no structural or cellular-context prediction."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-sumo-consensus-site",
    "name": "SUMOylation consensus site",
    "alphabet": "protein",
    "class": "modification-site",
    "syntax": "regex",
    "pattern": "[VILMFPC]K.[DE]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1093/emboj/18.22.6455",
      "citation": "Rodriguez MS et al. SUMO-1 modification activates the transcriptional response of p53. EMBO J. 1999;18:6455-6461.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate hydrophobic-K-x-acidic SUMOylation consensus site.",
    "scope": "Protein sequences; candidate motif only, not evidence of SUMOylation.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses a broad hydrophobic-K-x-D/E consensus; enzyme, structure, and conservation context are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-leucine-rich-nes",
    "name": "Leucine-rich nuclear export signal",
    "alphabet": "protein",
    "class": "NES",
    "syntax": "regex",
    "pattern": "[LIVFM].{2,3}[LIVFM].{2,3}[LIVFM].{1,2}[LIVFM]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1093/protein/gzh062",
      "citation": "la Cour T et al. Analysis and prediction of leucine-rich nuclear export signals. Protein Eng Des Sel. 2004;17:527-536.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Broad candidate leucine-rich nuclear export signal.",
    "scope": "Protein sequences; permissive hydrophobic spacing pattern, not an export prediction.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match against cleaned protein sequence; CRM1 context, disorder, charge, and accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-nls-basic-cluster",
    "name": "Basic cluster nuclear localization signal",
    "alphabet": "protein",
    "class": "NLS",
    "syntax": "regex",
    "pattern": "[KR]{4,}",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 seed",
      "accessDate": "2026-05-02",
      "url": "",
      "citation": "Curated as a broad basic-cluster candidate NLS pattern; not a substitute for sequence-context or localization prediction.",
      "license": "Project-curated illustrative motif."
    },
    "description": "Broad candidate pattern for monopartite basic-cluster nuclear localization signals.",
    "scope": "Protein sequences; broad candidate motif with many false positives.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression exact match against cleaned protein sequence; no structural, disorder, or localization context is modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-bipartite-basic-nls",
    "name": "Bipartite basic nuclear localization signal",
    "alphabet": "protein",
    "class": "NLS",
    "syntax": "regex",
    "pattern": "[KR]{2}.{10,12}[KR]{3,}",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/0968-0004(91)90184-W",
      "citation": "Dingwall C, Laskey RA. Nuclear targeting sequences - a consensus? Trends Biochem Sci. 1991;16:478-481.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Broad candidate bipartite basic nuclear localization signal.",
    "scope": "Protein sequences; broad candidate NLS with many false positives.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match for two basic residues followed 10-12 residues later by a basic cluster; spacing and structural accessibility are simplified."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-14-3-3-mode-i",
    "name": "14-3-3 mode I phosphopeptide motif",
    "alphabet": "protein",
    "class": "phospho-binding-motif",
    "syntax": "regex",
    "pattern": "R..[ST]P",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/S0092-8674(00)80487-0",
      "citation": "Yaffe MB et al. The structural basis for 14-3-3:phosphopeptide binding specificity. Cell. 1997;91:961-971.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate mode I 14-3-3 phosphopeptide motif.",
    "scope": "Protein sequences; phosphorylation-dependent candidate motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses R-x-x-S/T-P but does not require phosphorylation or model 14-3-3 isoform specificity."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-atm-atr-sq-tq-site",
    "name": "ATM/ATR SQ/TQ phosphorylation site",
    "alphabet": "protein",
    "class": "phosphorylation-site",
    "syntax": "regex",
    "pattern": "[ST]Q",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1074/jbc.274.53.37538",
      "citation": "Kim ST et al. Substrate specificities and identification of putative substrates of ATM kinase family members. J Biol Chem. 1999;274:37538-37543.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate SQ/TQ phosphorylation motif for ATM/ATR-family kinases.",
    "scope": "Protein sequences; very short high-frequency candidate motif.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match reports S/T-Q pairs only; DNA-damage signaling context and surrounding determinants are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-casein-kinase-ii-site",
    "name": "Casein kinase II phosphorylation site",
    "alphabet": "protein",
    "class": "phosphorylation-site",
    "syntax": "regex",
    "pattern": "[ST]..[DE]",
    "source": {
      "name": "PROSITE",
      "version": "PS00006 pattern version 1",
      "accessDate": "2026-05-02",
      "url": "https://prosite.expasy.org/PS00006",
      "citation": "PROSITE PS00006 / PDOC00006; consensus [ST]-x(2)-[DE].",
      "license": "Pattern represented as project-curated metadata; review PROSITE terms before bundling larger derived datasets."
    },
    "description": "Short candidate casein kinase II phosphorylation motif.",
    "scope": "Protein sequences; high-frequency candidate motif with many false positives.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression translation of PROSITE pattern [ST]-x(2)-[DE]; kinase context and accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-pka-phosphorylation-site",
    "name": "Protein kinase A phosphorylation site",
    "alphabet": "protein",
    "class": "phosphorylation-site",
    "syntax": "regex",
    "pattern": "[RK][RK].[ST]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/0968-0004(90)90087-F",
      "citation": "Kemp BE, Pearson RB. Protein kinase recognition sequence motifs. Trends Biochem Sci. 1990;15:342-346.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Short candidate basophilic protein kinase A phosphorylation motif.",
    "scope": "Protein sequences; high-frequency candidate phosphorylation motif.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses an R/K-R/K-x-S/T consensus; kinase context and accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-pkc-phosphorylation-site",
    "name": "Protein kinase C phosphorylation site",
    "alphabet": "protein",
    "class": "phosphorylation-site",
    "syntax": "regex",
    "pattern": "[ST].[RK]",
    "source": {
      "name": "PROSITE",
      "version": "PS00005 pattern version 1",
      "accessDate": "2026-05-02",
      "url": "https://prosite.expasy.org/PS00005",
      "citation": "PROSITE PS00005 / PDOC00005; consensus [ST]-x-[RK].",
      "license": "Pattern represented as project-curated metadata; review PROSITE terms before bundling larger derived datasets."
    },
    "description": "Short candidate protein kinase C phosphorylation motif.",
    "scope": "Protein sequences; high-frequency candidate motif with many false positives.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression translation of PROSITE pattern [ST]-x-[RK]; kinase context and accessibility are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-c-terminal-peroxisomal-targeting-signal",
    "name": "C-terminal peroxisomal targeting signal type 1",
    "alphabet": "protein",
    "class": "targeting-signal",
    "syntax": "regex",
    "pattern": "[SAPTC][KRH][LMI]$",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 seed",
      "accessDate": "2026-05-02",
      "url": "",
      "citation": "Curated broad PTS1 candidate pattern based on common SKL-like C-terminal tripeptides.",
      "license": "Project-curated illustrative motif."
    },
    "description": "Broad SKL-like candidate peroxisomal targeting signal at the protein C terminus.",
    "scope": "Protein sequences; candidate C-terminal motif only.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match requires the motif at the cleaned protein C terminus; organism-specific PTS1 rules are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-er-retrieval-kdel-hdel",
    "name": "ER retrieval KDEL/HDEL signal",
    "alphabet": "protein",
    "class": "targeting-signal",
    "syntax": "regex",
    "pattern": "[KH]DEL$",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1016/0092-8674(87)90086-9",
      "citation": "Munro S, Pelham HRB. A C-terminal signal prevents secretion of luminal ER proteins. Cell. 1987;48:899-907.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate KDEL/HDEL-like endoplasmic-reticulum retrieval signal at the protein C terminus.",
    "scope": "Protein sequences; C-terminal motif only; lumenal topology and organism-specific variants are not modeled.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match requires KDEL or HDEL at the cleaned protein C terminus; ER localization context is not inferred."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-n-terminal-pts2",
    "name": "N-terminal peroxisomal targeting signal type 2",
    "alphabet": "protein",
    "class": "targeting-signal",
    "syntax": "regex",
    "pattern": "^.{0,40}R[LI].{5}HL",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC453027/",
      "citation": "Swinkels BW et al. A novel, cleavable peroxisomal targeting signal at the amino-terminus of the rat 3-ketoacyl-CoA thiolase. EMBO J. 1991;10:3255-3262.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Broad candidate PTS2-like N-terminal peroxisomal targeting signal.",
    "scope": "Protein sequences; N-terminal candidate motif within the first 40 residues.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match requires an R-L/I-x5-HL pattern near the cleaned protein N terminus; cleavage and receptor specificity are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-acidic-dileucine-sorting",
    "name": "Acidic dileucine sorting signal",
    "alphabet": "protein",
    "class": "trafficking-signal",
    "syntax": "regex",
    "pattern": "[DE].{0,4}LL",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1146/annurev.biochem.72.121801.161800",
      "citation": "Bonifacino JS, Traub LM. Signals for sorting of transmembrane proteins to endosomes and lysosomes. Annu Rev Biochem. 2003;72:395-447.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate acidic dileucine sorting signal.",
    "scope": "Protein sequences; candidate trafficking signal, usually interpreted in cytosolic tails of membrane proteins.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses acidic residue within four residues of LL; membrane topology and adaptor specificity are not modeled."
    },
    "database": "sms3-curated"
  },
  {
    "id": "protein-tyrosine-sorting-yxxphi",
    "name": "Tyrosine-based YxxPhi sorting signal",
    "alphabet": "protein",
    "class": "trafficking-signal",
    "syntax": "regex",
    "pattern": "Y..[LIVMF]",
    "source": {
      "name": "SMS3 curated motif set",
      "version": "2026-05 expanded protein motifs",
      "accessDate": "2026-05-22",
      "url": "https://doi.org/10.1146/annurev.biochem.72.121801.161800",
      "citation": "Bonifacino JS, Traub LM. Signals for sorting of transmembrane proteins to endosomes and lysosomes. Annu Rev Biochem. 2003;72:395-447.",
      "license": "Project-curated short consensus record from cited literature; not copied from a motif database."
    },
    "description": "Candidate tyrosine-based Yxx hydrophobic sorting signal.",
    "scope": "Protein sequences; candidate trafficking signal, usually interpreted in cytosolic tails of membrane proteins.",
    "match": {
      "strand": "not-applicable",
      "coordinateSystem": "1-based inclusive",
      "overlappingDefault": true,
      "score": "not-applicable",
      "assumptions": "Regular-expression match uses Y-x-x-hydrophobic; membrane topology and adaptor specificity are not modeled."
    },
    "database": "sms3-curated"
  }
];
export default proteinMotifs;
