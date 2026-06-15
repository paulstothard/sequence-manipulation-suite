const countColumns = ["A", "C", "G", "T", "U", "R", "Y", "S", "W", "K", "M", "B", "D", "H", "V", "N", "X"];

export const sequenceStatsCountColumns = countColumns;

export const sequenceStatsTsvColumns = [
  "title",
  "length",
  "unambiguous_bases",
  "gc_count",
  "gc_percent",
  "ambiguous_symbols",
  "n_count",
  "x_count",
  ...countColumns
];

export const sequenceStatsTableColumns = [
  { id: "title", label: "Title", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "unambiguous_bases", label: "Unambiguous bases", type: "number" },
  { id: "gc_count", label: "GC count", type: "number" },
  { id: "gc_percent", label: "GC percent", type: "number" },
  { id: "ambiguous_symbols", label: "Ambiguous symbols", type: "number" },
  { id: "n_count", label: "N count", type: "number" },
  { id: "x_count", label: "X count", type: "number" },
  ...countColumns.map((column) => ({
    id: column,
    label: column,
    type: "number"
  }))
];
