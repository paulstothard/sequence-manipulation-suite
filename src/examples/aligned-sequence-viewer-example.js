// Full-length human/mouse alpha- and beta-globins, pre-aligned with SMS3's
// bundled MUSCLE 5.2.linux32 (BioWasm 5.1.0; molecule fix 1), -align / -amino,
// on 2026-11-21. Each ungapped sequence is preserved exactly. The 149-column
// alignment contains single gaps and multi-residue internal gap runs.
// Beta-globin source provenance: multiple-alignment-examples.js.
// Alpha-globin sequences: UniProt sequence version 2, retrieved 2026-11-21:
// https://rest.uniprot.org/uniprotkb/P69905.fasta
// https://rest.uniprot.org/uniprotkb/P01942.fasta
// Kept pre-aligned so loading the viewer never runs an alignment algorithm.
export const alignedSequenceViewerExample = `>Human HBB · NP_000509.1
MVHLTPEEKSAVTALWGKVN--VDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGN
PKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHH
FGKEFTPPVQAAYQKVVAGVANALAHKYH
>Mouse Hbb-bt · NP_032246.2
MVHLTDAEKAAVSGLWGKVN--ADEVGGEALGRLLVVYPWTQRYFDSFGDLSSASAIMGN
AKVKAHGKKVITAFNDGLNHLDSLKGTFASLSELHCDKLHVDPENFRLLGNMIVIVLGHH
LGKDFTPAAQAAFQKVVAGVAAALAHKYH
>Human HBA · P69905
MV-LSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHF-DLS-----HGS
AQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAH
LPAEFTPAVHASLDKFLASVSTVLTSKYR
>Mouse Hba · P01942
MV-LSGEDKSNIKAAWGKIGGHGAEYGAEALERMFASFPTTKTYFPHF-DVS-----HGS
AQVKGHGKKVADALASAAGHLDDLPGALSALSDLHAHKLRVDPVNFKLLSHCLLVTLASH
HPADFTPAVHASLDKFLASVSTVLTSKYR
`;
