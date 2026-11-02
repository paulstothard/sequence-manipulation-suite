import { formatFastaRecord } from "./fasta.js";
import { parsePrimerRecords } from "./primer-input.js";
import { complementDnaRnaSequence } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";
import { dnaNearestNeighborTm } from "./oligo-thermodynamics.js";
import { normalizeOligoOptions } from "./primer-oligo-options.js";
export { normalizeOligoOptions } from "./primer-oligo-options.js";

export const primerOligoPropertyColumns = [
  { id: "record", label: "Record", type: "string" },
  // Keep the established ID/header for saved table workflows; show the entered
  // strand before derived properties and the opposite strand.
  { id: "normalized_sequence", label: "Normalized sequence", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "gc_percent", label: "GC percent", type: "number" },
  { id: "a_count", label: "A count", type: "number" },
  { id: "c_count", label: "C count", type: "number" },
  { id: "g_count", label: "G count", type: "number" },
  { id: "t_count", label: "T/U count", type: "number" },
  { id: "n_count", label: "N/other count", type: "number" },
  { id: "tm_c", label: "Tm C", type: "number" },
  { id: "tm_method", label: "Tm method", type: "string" },
  { id: "reverse_complement", label: "Reverse complement", type: "string" },
  { id: "record_id", label: "Record ID", type: "string" },
  { id: "original_sequence", label: "Original sequence", type: "string" },
  { id: "molecule_type", label: "Molecule type", type: "string" },
  { id: "validity", label: "Validity", type: "string" },
  { id: "gc_min_percent", label: "GC minimum percent", type: "number" },
  { id: "gc_max_percent", label: "GC maximum percent", type: "number" },
  { id: "tm_min_c", label: "Formula Tm minimum C", type: "number" },
  { id: "tm_max_c", label: "Formula Tm maximum C", type: "number" },
  { id: "tm_status", label: "Tm interpretation", type: "string" },
  { id: "conditions", label: "Calculation conditions", type: "string" },
  { id: "characters_removed", label: "Characters removed", type: "number" },
  { id: "warnings", label: "Warnings", type: "string" },
  { id: "notes", label: "Notes", type: "string" }
];

const IUPAC = { A: "A", C: "C", G: "G", T: "T", U: "T", R: "AG", Y: "CT", S: "CG", W: "AT", K: "GT", M: "AC", B: "CGT", D: "AGT", H: "ACT", V: "ACG", N: "ACGT" };
const round = (n) => Number.isFinite(n) ? Number(n.toFixed(2)) : "";

// Bounds are exact evaluations of the chosen composition formula across allowed
// bases, not a predicted melting interval of a mixture. S/W have fixed GC class.
// https://biopython.org/docs/latest/api/Bio.SeqUtils.MeltingTemp.html
function basicTm(gcCount, length) {
  return length < 14 ? 2 * (length - gcCount) + 4 * gcCount : 69.3 + 0.41 * gcCount / length * 100 - 650 / length;
}

export function analyzePrimerOligos(input, options = {}) {
  const normalized = normalizeOligoOptions(options);
  const records = parsePrimerRecords(input, "Oligo");
  const warnings = [];
  const notes = [];
  const rows = records.map((record, index) => {
    const rowWarnings = [];
    const rowNotes = [];
    const original = record.sequence;
    let sequence = original.toUpperCase().replace(/[.\-]/g, "");
    const removed = original.length - sequence.length;
    if (removed) rowWarnings.push(`Removed ${removed} alignment gap character(s).`);
    const invalid = [...new Set([...sequence].filter((base) => !IUPAC[base]))].join("");
    const hasT = sequence.includes("T");
    const hasU = sequence.includes("U");
    const mixed = normalized.moleculeType === "auto" && hasT && hasU;
    const molecule = normalized.moleculeType === "auto" ? (hasU && !hasT ? "RNA" : "DNA") : normalized.moleculeType.toUpperCase();
    if (invalid) rowWarnings.push(`Unsupported sequence symbols: ${invalid}. Properties are unavailable.`);
    if (mixed) rowWarnings.push("Mixed T/U input has an unspecified molecule type. Select DNA or RNA explicitly.");
    if (!sequence.length) rowWarnings.push("No nucleotides remain after cleanup.");
    if (molecule === "RNA" && hasT && !mixed) { sequence = sequence.replaceAll("T", "U"); rowNotes.push("T converted to U for selected RNA mode."); }
    if (molecule === "DNA" && hasU && !mixed) { sequence = sequence.replaceAll("U", "T"); rowNotes.push("U converted to T for selected DNA mode."); }
    if (normalized.moleculeType === "auto" && !hasU) rowNotes.push("DNA assumed; select RNA explicitly for RNA sequences without U.");
    const valid = !invalid && !mixed && sequence.length > 0;
    const counts = { A: 0, C: 0, G: 0, T: 0, N: 0 };
    let minGc = 0;
    let maxGc = 0;
    if (valid) for (const base of sequence) {
      const equivalent = base === "U" ? "T" : base;
      if ("ACGT".includes(equivalent)) counts[equivalent] += 1; else counts.N += 1;
      const alternatives = IUPAC[base];
      if ([...alternatives].every((b) => "GC".includes(b))) minGc += 1;
      if ([...alternatives].some((b) => "GC".includes(b))) maxGc += 1;
    }
    const useNn = normalized.tmModel === "nearest-neighbor";
    const nn = valid && molecule === "DNA" && useNn ? dnaNearestNeighborTm(sequence, normalized) : null;
    const tmSupported = valid && molecule === "DNA" && (!useNn || nn !== null);
    const tmMin = tmSupported ? (useNn ? nn.tm : basicTm(minGc, sequence.length)) : NaN;
    const tmMax = tmSupported ? (useNn ? nn.tm : basicTm(maxGc, sequence.length)) : NaN;
    if (valid && molecule === "RNA") rowWarnings.push("Tm unavailable: these models support DNA; RNA duplex thermodynamics are not modeled.");
    if (valid && molecule === "DNA" && useNn && !nn) rowWarnings.push("Nearest-neighbor Tm unavailable: requires 2–1000 unambiguous DNA bases and a perfectly matched complement.");
    if (valid && counts.N) rowWarnings.push("IUPAC alternatives retained. Composition/formula bounds do not predict a degenerate mixture's melting behavior.");
    const tmMethod = tmSupported ? (useNn ? "SantaLucia 1998 DNA/DNA NN; entropy salt correction" : sequence.length < 14 ? "Wallace" : "Marmur-Doty GC") : "";
    const row = {
      record: record.title,
      length: valid ? sequence.length : "",
      gc_percent: valid && minGc === maxGc ? round(100 * minGc / sequence.length) : "",
      a_count: valid ? counts.A : "", c_count: valid ? counts.C : "", g_count: valid ? counts.G : "", t_count: valid ? counts.T : "", n_count: valid ? counts.N : "",
      tm_c: tmSupported && minGc === maxGc ? round(tmMin) : "",
      tm_method: tmMethod,
      reverse_complement: valid ? complementDnaRnaSequence(sequence.replaceAll("U", "T")).split("").reverse().join("").replaceAll("T", molecule === "RNA" ? "U" : "T") : "",
      record_id: `oligo-${index + 1}`, original_sequence: original, normalized_sequence: sequence,
      molecule_type: mixed ? "unspecified mixed T/U" : molecule,
      validity: valid ? (counts.N ? "valid IUPAC; unresolved variants" : "valid") : "invalid",
      gc_min_percent: valid ? round(100 * minGc / sequence.length) : "",
      gc_max_percent: valid ? round(100 * maxGc / sequence.length) : "",
      tm_min_c: round(tmMin), tm_max_c: round(tmMax),
      tm_status: !tmSupported ? "unavailable" : useNn ? `perfect DNA/DNA duplex prediction; ${nn.selfComplementary ? "self-complementary strand" : "equal complementary strand concentrations"}` : minGc === maxGc ? "approximate composition formula" : "formula bounds across allowed sequences; mixture Tm unresolved",
      conditions: useNn ? `DNA/DNA; Na ${normalized.sodiumMm} mM; Mg ${normalized.magnesiumMm} mM; dNTP ${normalized.dntpMm} mM; each strand ${normalized.oligoNm} nM; von Ahsen sodium-equivalent correction` : "Basic DNA composition formula; no salt or concentration correction",
      characters_removed: removed, warnings: rowWarnings.join(" "), notes: rowNotes.join(" ")
    };
    warnings.push(...rowWarnings.map((warning) => `${record.title}: ${warning}`));
    notes.push(...rowNotes.map((note) => `${record.title}: ${note}`));
    return row;
  });
  const report = [
    "Primer / oligo basic properties", "", `Records: ${records.length}`,
    "Normalized sequence is the input oligo in 5′→3′ order after cleanup and any selected DNA/RNA conversion. Reverse complement is the opposite strand, also written 5′→3′.",
    normalized.tmModel === "nearest-neighbor" ? "Tm method: SantaLucia 1998 DNA/DNA nearest-neighbor parameters; entropy salt correction and von Ahsen 2001 sodium equivalent. Perfect duplexes only; no hairpin/dimer equilibrium model." : "Tm method: Wallace rule below 14 nt; Marmur-Doty GC approximation at 14 nt and above. DNA only.",
    "GC bounds reflect allowed IUPAC bases. Formula Tm bounds are not the melting range of a mixture.",
    "References: Wallace et al. 1979; Marmur and Doty 1962. https://biopython.org/docs/latest/api/Bio.SeqUtils.MeltingTemp.html",
    ...(normalized.tmModel === "nearest-neighbor" ? ["DNA duplex model: SantaLucia 1998, https://doi.org/10.1073/pnas.95.4.1460; von Ahsen et al. 2001, https://doi.org/10.1093/clinchem/47.11.1956"] : []), "",
    ...rows.flatMap((row) => [
      `${row.record}: ${row.length === "" ? "unavailable" : row.length} nt; ${row.molecule_type}; ${row.validity}; ID=${row.record_id}`,
      `Sequence (5′→3′): ${row.normalized_sequence}`,
      `Reverse complement (5′→3′): ${row.reverse_complement || "unavailable"}`,
      `Conditions: ${row.conditions}`,
      `GC: ${row.gc_percent !== "" ? row.gc_percent + "%" : row.gc_min_percent !== "" ? row.gc_min_percent + "–" + row.gc_max_percent + "%" : "unavailable"}; Tm: ${row.tm_c !== "" ? row.tm_c + " C" : row.tm_min_c !== "" ? row.tm_min_c + "–" + row.tm_max_c + " C" : "unavailable"}; ${row.tm_method} ${row.tm_status}`,
      ...(row.warnings ? [`Warning: ${row.warnings}`] : []), ...(row.notes ? [`Note: ${row.notes}`] : []), ""
    ])
  ].join("\n");
  return { records, rows, report, warnings, notes, options: normalized, charactersRemoved: rows.reduce((n, row) => n + row.characters_removed, 0) };
}

export function makePrimerOligoPropertiesTsv(rows) {
  return exportDelimitedTable(primerOligoPropertyColumns, rows, "\t");
}

export function makeOligoReverseComplementFasta(rows) {
  return rows.filter((row) => row.reverse_complement).map((row) => formatFastaRecord(`${row.record_id}_reverse_complement ${row.record}; molecule=${row.molecule_type}; ${row.validity}`, row.reverse_complement, 60)).join("");
}

export const oligoPairColumns = [
  { id: "first_id", label: "First oligo ID", type: "string" },
  { id: "second_id", label: "Second oligo ID", type: "string" },
  { id: "first_record", label: "First record", type: "string" },
  { id: "second_record", label: "Second record", type: "string" },
  { id: "tm_difference_c", label: "Tm difference C", type: "number" },
  { id: "method", label: "Tm model", type: "string" },
  { id: "conditions", label: "Conditions", type: "string" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "comparison_status", label: "Comparison enumeration", type: "string" }
];

export function makeOligoPairComparison(result) {
  const rows = [];
  const total = result.rows.length * (result.rows.length - 1) / 2;
  const status = total > 1000 ? "partial; first 1000 pairs in input order" : "complete";
  for (let i = 0; i < result.rows.length && rows.length < 1000; i += 1) {
    for (let j = i + 1; j < result.rows.length && rows.length < 1000; j += 1) {
      const a = result.rows[i], b = result.rows[j];
      const comparable = a.tm_c !== "" && b.tm_c !== "" && a.tm_method === b.tm_method && a.molecule_type === b.molecule_type;
      rows.push({ first_id: a.record_id, second_id: b.record_id, first_record: a.record, second_record: b.record,
        tm_difference_c: comparable ? round(Math.abs(a.tm_c - b.tm_c)) : "", method: comparable ? a.tm_method : "unavailable or different models",
        conditions: a.conditions, interpretation: "Tm comparison only; hairpins and heterodimers are not assessed.", comparison_status: status });
    }
  }
  return { rows, warnings: total > 1000 ? [`Pair comparison capped at 1000 of ${total} pairs; later input pairs are omitted.`] : [], output: exportDelimitedTable(oligoPairColumns, rows, "\t") };
}
