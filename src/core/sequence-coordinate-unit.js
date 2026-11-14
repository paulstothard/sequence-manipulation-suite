// Stop symbols occupy protein sequence coordinates but are not amino acids.
// Use character units for those records without changing their stored positions.
export function sequenceCoordinateUnit(record = {}) {
  if (record.alphabet !== "protein" && record.molecule !== "protein") return "bp";
  return String(record.sequence ?? record.matchedText ?? "").includes("*") ? "characters" : "aa";
}
