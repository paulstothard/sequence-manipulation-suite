export const WHOLE_FASTA_SCAN_NOTE =
  "Paste/upload mode loads plain FASTA or ordinary FASTA.GZ and scans records locally. Indexed FASTA modes can read prepared FASTA+FAI or BGZF FASTA+FAI+GZI bundles, but whole-record tools still materialize and inspect every record.";

export const FASTA_TABLE_CONVERTER_SCAN_NOTE =
  "FASTA To Table loads plain FASTA or ordinary FASTA.GZ in paste/upload mode. Indexed FASTA modes can materialize records from FASTA+FAI or BGZF FASTA+FAI+GZI bundles before building table rows; this is whole-record conversion, not targeted ID or coordinate retrieval.";

export const INDEXED_FASTA_BUNDLE_NOTE =
  "Prepared local FASTA files support random access in two forms: uncompressed FASTA+FAI, or BGZF FASTA+FAI+GZI. Ordinary .fa.gz is not random-access indexed FASTA; load it through paste/upload mode or provide a BGZF file plus its .fai and .gzi sidecars.";
