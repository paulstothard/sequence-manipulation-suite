export const proteinStructureResidueColumns = [
  { id: "chain", label: "Chain", type: "string" },
  { id: "residue_number", label: "Residue number", type: "number" },
  { id: "insertion_code", label: "Insertion code", type: "string" },
  { id: "residue_name", label: "Residue", type: "string" },
  { id: "atom_count", label: "Atom count", type: "number" },
  { id: "has_ca", label: "Has CA", type: "boolean" },
  { id: "hetero", label: "Hetero", type: "boolean" },
  { id: "first_atom_serial", label: "First atom serial", type: "number" },
  { id: "last_atom_serial", label: "Last atom serial", type: "number" },
  { id: "assembly_operator", label: "Assembly operator", type: "string" }
];

export const proteinStructureAtomColumns = [
  { id: "serial", label: "Serial", type: "number" },
  { id: "model", label: "Model", type: "number" },
  { id: "chain", label: "Chain", type: "string" },
  { id: "residue_number", label: "Residue number", type: "number" },
  { id: "residue_name", label: "Residue", type: "string" },
  { id: "atom_name", label: "Atom", type: "string" },
  { id: "element", label: "Element", type: "string" },
  { id: "x", label: "X", type: "number" },
  { id: "y", label: "Y", type: "number" },
  { id: "z", label: "Z", type: "number" },
  { id: "hetero", label: "Hetero", type: "boolean" },
  { id: "alt_loc", label: "Alt location", type: "string" },
  { id: "occupancy", label: "Occupancy", type: "number" },
  { id: "assembly_operator", label: "Assembly operator", type: "string" }
];

export const proteinStructureMissingResidueColumns = [
  { id: "model", label: "Model", type: "number" },
  { id: "chain", label: "Chain", type: "string" },
  { id: "residue_number", label: "Residue number", type: "number" },
  { id: "insertion_code", label: "Insertion code", type: "string" },
  { id: "residue_name", label: "Residue", type: "string" },
  { id: "source", label: "Source", type: "string" },
  { id: "details", label: "Details", type: "string" }
];

export const proteinStructureAssemblyColumns = [
  { id: "assembly_id", label: "Assembly ID", type: "string" },
  { id: "operator", label: "Operator", type: "string" },
  { id: "chains", label: "Chains", type: "string" },
  { id: "row", label: "Matrix row", type: "number" },
  { id: "m1", label: "M1", type: "number" },
  { id: "m2", label: "M2", type: "number" },
  { id: "m3", label: "M3", type: "number" },
  { id: "t", label: "Translation", type: "number" }
];

const WATER_NAMES = new Set(["HOH", "WAT", "H2O", "DOD"]);
const KNOWN_FORMATS = new Set(["pdb", "mmcif"]);
const ALT_LOCATION_POLICIES = new Set(["preferred", "highest-occupancy", "first", "all"]);

export const PROTEIN_RESIDUE_3_TO_1 = {
  ALA: "A",
  ARG: "R",
  ASN: "N",
  ASP: "D",
  CYS: "C",
  GLN: "Q",
  GLU: "E",
  GLY: "G",
  HIS: "H",
  ILE: "I",
  LEU: "L",
  LYS: "K",
  MET: "M",
  PHE: "F",
  PRO: "P",
  SER: "S",
  THR: "T",
  TRP: "W",
  TYR: "Y",
  VAL: "V",
  SEC: "U",
  PYL: "O",
  ASX: "B",
  GLX: "Z",
  XLE: "J",
  UNK: "X"
};

function cleanInput(input) {
  return String(input ?? "").replace(/\r\n?/g, "\n").trim();
}

export function detectProteinStructureFormat(input, requested = "auto") {
  const explicit = String(requested ?? "auto").toLowerCase();
  if (KNOWN_FORMATS.has(explicit)) {
    return explicit;
  }
  const text = cleanInput(input);
  if (/^(ATOM  |HETATM|HEADER|TITLE |COMPND|MODEL |CRYST1)/m.test(text)) {
    return "pdb";
  }
  if (/^data_/m.test(text) || /_atom_site\./.test(text)) {
    return "mmcif";
  }
  return "unknown";
}

function parseNumber(value) {
  const number = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) ? number : null;
}

function fallbackElement(atomName) {
  const cleaned = String(atomName ?? "").trim().replace(/^[0-9]+/, "");
  return cleaned.slice(0, 2).trim().replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "";
}

function parsePdbAtom(line, model = 1) {
  const recordType = line.slice(0, 6).trim();
  const atomName = line.slice(12, 16).trim();
  const resName = line.slice(17, 20).trim();
  const chain = line.slice(21, 22).trim() || "_";
  const residueNumber = parseInteger(line.slice(22, 26));
  const insertionCode = line.slice(26, 27).trim();
  return {
    serial: parseInteger(line.slice(6, 11)) ?? 0,
    model,
    atom_name: atomName,
    alt_loc: line.slice(16, 17).trim(),
    residue_name: resName,
    chain,
    residue_number: residueNumber ?? 0,
    insertion_code: insertionCode,
    x: parseNumber(line.slice(30, 38)),
    y: parseNumber(line.slice(38, 46)),
    z: parseNumber(line.slice(46, 54)),
    occupancy: parseNumber(line.slice(54, 60)),
    element: line.slice(76, 78).trim().toUpperCase() || fallbackElement(atomName),
    hetero: recordType === "HETATM",
    water: WATER_NAMES.has(resName.toUpperCase())
  };
}

function parseResidueNumberToken(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(-?\d+)([A-Za-z]?)$/);
  if (!match) {
    return { residueNumber: parseInteger(text) ?? 0, insertionCode: "" };
  }
  return {
    residueNumber: Number.parseInt(match[1], 10),
    insertionCode: match[2] ?? ""
  };
}

function parsePdbMissingResidue(line) {
  const body = line.slice(10).trim();
  if (!body || /^M\s+RES\b/i.test(body) || /^RES\s+C\s+SSSEQI/i.test(body) || /MISSING RESIDUES/i.test(body)) {
    return null;
  }
  const tokens = body.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }
  let cursor = 0;
  let model = null;
  if (/^\d+$/.test(tokens[cursor]) && /^[A-Za-z0-9]{3}$/.test(tokens[cursor + 1] ?? "")) {
    model = Number.parseInt(tokens[cursor], 10);
    cursor += 1;
  }
  const residueName = String(tokens[cursor] ?? "").toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(residueName)) {
    return null;
  }
  cursor += 1;
  let chain = "_";
  let residueToken = tokens[cursor] ?? "";
  if ((tokens[cursor + 1] ?? "") && /^[A-Za-z0-9_]$/.test(tokens[cursor] ?? "")) {
    chain = tokens[cursor] || "_";
    residueToken = tokens[cursor + 1] ?? "";
  }
  const { residueNumber, insertionCode } = parseResidueNumberToken(residueToken);
  if (!Number.isFinite(residueNumber)) {
    return null;
  }
  return {
    model,
    chain,
    residue_number: residueNumber,
    insertion_code: insertionCode,
    residue_name: residueName,
    source: "PDB REMARK 465",
    details: "Missing residue reported by the structure file."
  };
}

function parseRemark350Chains(text) {
  const match = String(text ?? "").match(/(?:APPLY THE FOLLOWING TO CHAINS|AND CHAINS)\s*:\s*(.+)$/i);
  if (!match) {
    return [];
  }
  return match[1]
    .replace(/\.$/, "")
    .split(/[,;]\s*|\s+/)
    .map((chain) => chain.trim())
    .filter((chain) => chain && !/^and$/i.test(chain) && !/^chains?$/i.test(chain))
    .map((chain) => chain === "NULL" ? "_" : chain);
}

function ensureAssembly(assemblies, id = "1") {
  const assemblyId = String(id || "1").trim() || "1";
  let assembly = assemblies.find((item) => item.id === assemblyId);
  if (!assembly) {
    assembly = {
      id: assemblyId,
      chains: [],
      operators: new Map()
    };
    assemblies.push(assembly);
  }
  return assembly;
}

function parsePdbBiomtLine(text) {
  const match = String(text ?? "").match(/^BIOMT([123])\s+(\d+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }
  return {
    row: Number.parseInt(match[1], 10),
    operator: match[2],
    values: [
      Number.parseFloat(match[3]),
      Number.parseFloat(match[4]),
      Number.parseFloat(match[5]),
      Number.parseFloat(match[6])
    ]
  };
}

function finalizeBiologicalAssemblies(rawAssemblies) {
  return rawAssemblies
    .map((assembly) => {
      const transforms = Array.from(assembly.operators.entries())
        .map(([operator, rows]) => {
          if (!rows[1] || !rows[2] || !rows[3]) {
            return null;
          }
          return {
            operator,
            matrix: [
              rows[1].slice(0, 3),
              rows[2].slice(0, 3),
              rows[3].slice(0, 3)
            ],
            vector: [rows[1][3], rows[2][3], rows[3][3]]
          };
        })
        .filter(Boolean)
        .sort((left, right) => Number(left.operator) - Number(right.operator) || String(left.operator).localeCompare(String(right.operator)));
      return {
        id: assembly.id,
        chains: [...new Set(assembly.chains)].sort((left, right) => String(left).localeCompare(String(right))),
        transforms
      };
    })
    .filter((assembly) => assembly.transforms.length > 0);
}

function sortOperatorIds(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function parsePdb(input) {
  const atoms = [];
  const titles = [];
  const missingResidues = [];
  const rawAssemblies = [];
  let currentAssembly = null;
  let modelCount = 0;
  let currentModel = 1;
  for (const line of cleanInput(input).split("\n")) {
    const record = line.slice(0, 6);
    if (record === "ATOM  " || record === "HETATM") {
      atoms.push(parsePdbAtom(line.padEnd(80, " "), currentModel));
    } else if (record === "TITLE ") {
      const title = line.slice(10).trim();
      if (title) titles.push(title);
    } else if (record === "HEADER" && titles.length === 0) {
      const header = line.slice(10, 50).trim();
      if (header) titles.push(header);
    } else if (record === "MODEL ") {
      modelCount += 1;
      currentModel = parseInteger(line.slice(10)) ?? modelCount;
    } else if (line.startsWith("REMARK 465")) {
      const missing = parsePdbMissingResidue(line);
      if (missing) missingResidues.push(missing);
    } else if (line.startsWith("REMARK 350")) {
      const body = line.slice(10).trim();
      const assemblyMatch = body.match(/^BIOMOLECULE:\s*(.+)$/i);
      if (assemblyMatch) {
        currentAssembly = ensureAssembly(rawAssemblies, assemblyMatch[1].split(/\s*,\s*/)[0]);
        continue;
      }
      const chains = parseRemark350Chains(body);
      if (chains.length > 0) {
        currentAssembly = currentAssembly || ensureAssembly(rawAssemblies, "1");
        currentAssembly.chains.push(...chains);
        continue;
      }
      const biomt = parsePdbBiomtLine(body);
      if (biomt) {
        currentAssembly = currentAssembly || ensureAssembly(rawAssemblies, "1");
        const rows = currentAssembly.operators.get(biomt.operator) ?? {};
        rows[biomt.row] = biomt.values;
        currentAssembly.operators.set(biomt.operator, rows);
      }
    }
  }
  return {
    atoms,
    missingResidues,
    biologicalAssemblies: finalizeBiologicalAssemblies(rawAssemblies),
    title: titles.join(" ").replace(/\s+/g, " ").trim(),
    modelCount
  };
}

function tokenizeCifLine(line) {
  const tokens = [];
  const pattern = /'(?:[^']|'')*'|"(?:[^"]|"")*"|\S+/g;
  for (const match of line.matchAll(pattern)) {
    let token = match[0];
    if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith("\"") && token.endsWith("\""))) {
      token = token.slice(1, -1).replace(/''/g, "'").replace(/""/g, "\"");
    }
    tokens.push(token === "?" || token === "." ? "" : token);
  }
  return tokens;
}

function expandMmcifOperatorList(text) {
  return String(text ?? "")
    .split(/\s*,\s*/)
    .flatMap((part) => {
      const trimmed = part.trim();
      const range = trimmed.match(/^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$/);
      if (!range || range[1] !== range[3]) {
        return trimmed ? [trimmed] : [];
      }
      const prefix = range[1] ?? "";
      const start = Number.parseInt(range[2], 10);
      const end = Number.parseInt(range[4], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 500) {
        return [trimmed];
      }
      return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${start + index}`);
    });
}

function expandMmcifOperatorExpression(expression) {
  const text = String(expression ?? "").trim().replace(/\s+/g, "");
  if (!text) {
    return [];
  }
  const groups = [...text.matchAll(/\(([^()]+)\)/g)].map((match) => expandMmcifOperatorList(match[1]));
  if (groups.length === 0) {
    return expandMmcifOperatorList(text).map((operator) => [operator]);
  }
  return groups.reduce((combinations, group) =>
    combinations.flatMap((prefix) => group.map((operator) => [...prefix, operator])),
  [[]]);
}

function composeTransforms(first, second, operator) {
  const matrix = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) =>
      second.matrix[row][0] * first.matrix[0][column] +
      second.matrix[row][1] * first.matrix[1][column] +
      second.matrix[row][2] * first.matrix[2][column]
    )
  );
  const vector = Array.from({ length: 3 }, (_, row) =>
    second.matrix[row][0] * first.vector[0] +
    second.matrix[row][1] * first.vector[1] +
    second.matrix[row][2] * first.vector[2] +
    second.vector[row]
  );
  return { operator, matrix, vector };
}

function transformFromOperatorIds(operatorIds, operatorMap) {
  const transforms = operatorIds.map((operator) => operatorMap.get(operator)).filter(Boolean);
  if (transforms.length !== operatorIds.length || transforms.length === 0) {
    return null;
  }
  return transforms.reduce((current, next, index) =>
    index === 0 ? next : composeTransforms(current, next, operatorIds.join("x")),
  null);
}

function buildMmcifBiologicalAssemblies(assemblyGens, operatorMap) {
  const assemblies = new Map();
  for (const gen of assemblyGens) {
    const assembly = assemblies.get(gen.assemblyId) ?? {
      id: gen.assemblyId,
      chains: new Set(),
      transforms: new Map()
    };
    for (const chain of gen.chains) {
      assembly.chains.add(chain);
    }
    for (const operatorIds of expandMmcifOperatorExpression(gen.operatorExpression)) {
      const transform = transformFromOperatorIds(operatorIds, operatorMap);
      if (transform) {
        assembly.transforms.set(transform.operator, transform);
      }
    }
    assemblies.set(assembly.id, assembly);
  }
  return Array.from(assemblies.values())
    .map((assembly) => ({
      id: assembly.id,
      chains: Array.from(assembly.chains).sort((left, right) => String(left).localeCompare(String(right))),
      transforms: Array.from(assembly.transforms.values()).sort((left, right) => sortOperatorIds(left.operator, right.operator))
    }))
    .filter((assembly) => assembly.transforms.length > 0)
    .sort((left, right) => sortOperatorIds(left.id, right.id));
}

function parseMmcifOperator(fields, columnIndex) {
  const get = (name) => fields[columnIndex.get(name)] ?? "";
  const id = String(get("id") || "").trim();
  if (!id) {
    return null;
  }
  const matrix = [
    [parseNumber(get("matrix[1][1]")), parseNumber(get("matrix[1][2]")), parseNumber(get("matrix[1][3]"))],
    [parseNumber(get("matrix[2][1]")), parseNumber(get("matrix[2][2]")), parseNumber(get("matrix[2][3]"))],
    [parseNumber(get("matrix[3][1]")), parseNumber(get("matrix[3][2]")), parseNumber(get("matrix[3][3]"))]
  ];
  const vector = [parseNumber(get("vector[1]")), parseNumber(get("vector[2]")), parseNumber(get("vector[3]"))];
  if (matrix.flat().some((value) => !Number.isFinite(value)) || vector.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { operator: id, matrix, vector };
}

function splitMmcifAsymList(value) {
  return String(value ?? "")
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item === "?" || item === "." ? "_" : item);
}

function parseMmcif(input) {
  const lines = cleanInput(input).split("\n");
  const atoms = [];
  const missingResidues = [];
  const assemblyGens = [];
  const operatorMap = new Map();
  let title = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("_struct.title")) {
      title = tokenizeCifLine(line.replace(/^_struct\.title\s+/, ""))[0] || "";
    }
    if (line !== "loop_") {
      continue;
    }
    const columns = [];
    let cursor = index + 1;
    const firstColumn = lines[cursor]?.trim() ?? "";
    let category = "";
    if (firstColumn.startsWith("_atom_site.")) {
      category = "atom_site";
    } else if (firstColumn.startsWith("_pdbx_unobs_or_zero_occ_residues.")) {
      category = "pdbx_unobs_or_zero_occ_residues";
    } else if (firstColumn.startsWith("_pdbx_struct_assembly_gen.")) {
      category = "pdbx_struct_assembly_gen";
    } else if (firstColumn.startsWith("_pdbx_struct_oper_list.")) {
      category = "pdbx_struct_oper_list";
    }
    if (!category) {
      continue;
    }
    const prefix = `_${category}.`;
    while (cursor < lines.length && lines[cursor].trim().startsWith(prefix)) {
      columns.push(lines[cursor].trim());
      cursor += 1;
    }
    if (columns.length === 0) {
      continue;
    }
    const columnIndex = new Map(columns.map((column, columnOffset) => [column.replace(prefix, ""), columnOffset]));
    while (cursor < lines.length) {
      const dataLine = lines[cursor].trim();
      if (!dataLine || dataLine === "#" || dataLine === "loop_" || dataLine.startsWith("_")) {
        break;
      }
      const fields = tokenizeCifLine(dataLine);
      if (fields.length >= columns.length && category === "atom_site") {
        const atomName = fields[columnIndex.get("label_atom_id")] || fields[columnIndex.get("auth_atom_id")] || "";
        const residueName = fields[columnIndex.get("label_comp_id")] || fields[columnIndex.get("auth_comp_id")] || "";
        const labelChain = fields[columnIndex.get("label_asym_id")] || "_";
        const chain = fields[columnIndex.get("auth_asym_id")] || labelChain || "_";
        const residueNumber = parseInteger(fields[columnIndex.get("auth_seq_id")] || fields[columnIndex.get("label_seq_id")]);
        const group = fields[columnIndex.get("group_PDB")] || "ATOM";
        atoms.push({
          serial: parseInteger(fields[columnIndex.get("id")]) ?? atoms.length + 1,
          model: parseInteger(fields[columnIndex.get("pdbx_PDB_model_num")]) ?? 1,
          atom_name: atomName,
          alt_loc: fields[columnIndex.get("label_alt_id")] || "",
          residue_name: residueName,
          chain,
          label_chain: labelChain,
          residue_number: residueNumber ?? 0,
          insertion_code: fields[columnIndex.get("pdbx_PDB_ins_code")] || "",
          x: parseNumber(fields[columnIndex.get("Cartn_x")]),
          y: parseNumber(fields[columnIndex.get("Cartn_y")]),
          z: parseNumber(fields[columnIndex.get("Cartn_z")]),
          occupancy: parseNumber(fields[columnIndex.get("occupancy")]),
          element: String(fields[columnIndex.get("type_symbol")] || fallbackElement(atomName)).toUpperCase(),
          hetero: group === "HETATM",
          water: WATER_NAMES.has(String(residueName).toUpperCase())
        });
      } else if (fields.length >= columns.length && category === "pdbx_unobs_or_zero_occ_residues") {
        const residueNumber = parseInteger(fields[columnIndex.get("auth_seq_id")] || fields[columnIndex.get("label_seq_id")]);
        if (Number.isFinite(residueNumber)) {
          missingResidues.push({
            model: parseInteger(fields[columnIndex.get("auth_model_id")] || fields[columnIndex.get("PDB_model_num")]) ?? null,
            chain: fields[columnIndex.get("auth_asym_id")] || fields[columnIndex.get("label_asym_id")] || "_",
            residue_number: residueNumber,
            insertion_code: fields[columnIndex.get("PDB_ins_code")] || "",
            residue_name: String(fields[columnIndex.get("auth_comp_id")] || fields[columnIndex.get("label_comp_id")] || "UNK").toUpperCase(),
            source: "mmCIF unobserved residue",
            details: fields[columnIndex.get("details")] || fields[columnIndex.get("occupancy_flag")] || "Missing residue reported by the structure file."
          });
        }
      } else if (fields.length >= columns.length && category === "pdbx_struct_assembly_gen") {
        const assemblyId = fields[columnIndex.get("assembly_id")] || "";
        const operatorExpression = fields[columnIndex.get("oper_expression")] || "";
        const asymIdList = fields[columnIndex.get("asym_id_list")] || "";
        if (assemblyId && operatorExpression) {
          assemblyGens.push({
            assemblyId,
            operatorExpression,
            chains: splitMmcifAsymList(asymIdList)
          });
        }
      } else if (fields.length >= columns.length && category === "pdbx_struct_oper_list") {
        const transform = parseMmcifOperator(fields, columnIndex);
        if (transform) {
          operatorMap.set(transform.operator, transform);
        }
      }
      cursor += 1;
    }
  }
  return {
    atoms,
    missingResidues,
    biologicalAssemblies: buildMmcifBiologicalAssemblies(assemblyGens, operatorMap),
    title,
    modelCount: 0
  };
}

function residueKey(atom) {
  return `${atom.chain}\t${atom.residue_number}\t${atom.insertion_code}\t${atom.residue_name}\t${atom.hetero ? "H" : "A"}\t${atom.assembly_operator || ""}`;
}

function availableModelsForAtoms(atoms) {
  return Array.from(new Set(atoms.map((atom) => atom.model ?? 1)))
    .filter((model) => Number.isFinite(model))
    .sort((left, right) => left - right);
}

function normalizeModelSelection(value, availableModels = []) {
  const text = String(value ?? "all").trim().toLowerCase();
  if (!text || text === "all" || text === "auto" || text === "all models") {
    return "all";
  }
  if (text === "first" || text === "first model") {
    return availableModels[0] ?? 1;
  }
  const match = text.match(/^(?:model\s*)?([0-9]+)$/);
  const model = match ? Number.parseInt(match[1], 10) : Number.NaN;
  if (!Number.isFinite(model) || model < 1) {
    throw new Error("Structure model must be all, first, or a positive model number such as 1.");
  }
  return model;
}

function normalizeBiologicalAssemblySelection(value) {
  const text = String(value ?? "asymmetric").trim();
  const lowered = text.toLowerCase();
  if (!text || ["asymmetric", "asymmetric unit", "coordinate file", "coordinates", "none", "off", "au"].includes(lowered)) {
    return "asymmetric";
  }
  const match = lowered.match(/^(?:biomolecule|bioassembly|biological assembly|assembly)\s*([A-Za-z0-9_.-]+)$/);
  return match ? match[1] : text;
}

function transformAtom(atom, transform, serial) {
  const matrix = transform.matrix;
  const vector = transform.vector;
  const x = Number(atom.x) || 0;
  const y = Number(atom.y) || 0;
  const z = Number(atom.z) || 0;
  return {
    ...atom,
    serial,
    x: matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + vector[0],
    y: matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + vector[1],
    z: matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + vector[2],
    assembly_operator: transform.operator
  };
}

function applyBiologicalAssembly(atoms, assemblies, requestedAssembly) {
  if (requestedAssembly === "asymmetric") {
    return {
      atoms,
      selectedBiologicalAssembly: "asymmetric",
      biologicalAssemblyApplied: false,
      assemblyTransformCount: 0,
      assemblySourceAtomCount: atoms.length
    };
  }
  const assembly = (assemblies ?? []).find((item) => String(item.id) === String(requestedAssembly));
  if (!assembly) {
    const available = (assemblies ?? []).map((item) => item.id).join(", ");
    throw new Error(`Biological assembly ${requestedAssembly} was not found. Available assemblies: ${available || "none"}.`);
  }
  const chainSet = assembly.chains?.length ? new Set(assembly.chains) : null;
  const sourceAtoms = atoms.filter((atom) => !chainSet || chainSet.has(atom.chain || "_") || chainSet.has(atom.label_chain || "_"));
  if (sourceAtoms.length === 0) {
    throw new Error(`Biological assembly ${assembly.id} did not match any atoms after model/chain filtering. Assembly chains: ${assembly.chains.join(", ") || "all"}.`);
  }
  let serial = 1;
  const transformed = [];
  for (const transform of assembly.transforms) {
    for (const atom of sourceAtoms) {
      transformed.push(transformAtom(atom, transform, serial));
      serial += 1;
    }
  }
  return {
    atoms: transformed,
    selectedBiologicalAssembly: assembly.id,
    biologicalAssemblyApplied: true,
    assemblyTransformCount: assembly.transforms.length,
    assemblySourceAtomCount: sourceAtoms.length
  };
}

function filterAtomsByModel(atoms, requestedModel) {
  if (requestedModel === "all") {
    return atoms;
  }
  const filtered = atoms.filter((atom) => (atom.model ?? 1) === requestedModel);
  if (filtered.length === 0) {
    const available = availableModelsForAtoms(atoms);
    throw new Error(`Model ${requestedModel} was not found. Available models: ${available.join(", ") || "none"}.`);
  }
  return filtered;
}

function availableChainsForAtoms(atoms) {
  return Array.from(new Set(atoms.map((atom) => atom.chain || "_")))
    .sort((left, right) => String(left).localeCompare(String(right)));
}

function normalizeChainSelection(value) {
  const text = String(value ?? "all").trim();
  if (!text || text.toLowerCase() === "all" || text.toLowerCase() === "all chains") {
    return "all";
  }
  const chains = text.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  if (chains.length === 0) {
    return "all";
  }
  return [...new Set(chains)];
}

function filterAtomsByChains(atoms, requestedChains) {
  if (requestedChains === "all") {
    return atoms;
  }
  const requested = new Set(requestedChains);
  const filtered = atoms.filter((atom) => requested.has(atom.chain || "_"));
  if (filtered.length === 0) {
    const available = availableChainsForAtoms(atoms);
    throw new Error(`No atoms were found for chain selection ${requestedChains.join(", ")}. Available chains: ${available.join(", ") || "none"}.`);
  }
  return filtered;
}

function normalizeAltLocationPolicy(value) {
  const text = String(value ?? "preferred").trim().toLowerCase();
  return ALT_LOCATION_POLICIES.has(text) ? text : "preferred";
}

function alternateAtomSiteKey(atom) {
  return [
    atom.model ?? 1,
    atom.chain || "_",
    atom.residue_number,
    atom.insertion_code ?? "",
    atom.residue_name,
    atom.hetero ? "H" : "A",
    atom.atom_name,
    atom.element
  ].join("\t");
}

function compareAlternateAtoms(left, right) {
  const leftOccupancy = Number.isFinite(left.occupancy) ? left.occupancy : -1;
  const rightOccupancy = Number.isFinite(right.occupancy) ? right.occupancy : -1;
  if (leftOccupancy !== rightOccupancy) {
    return rightOccupancy - leftOccupancy;
  }
  const leftAlt = left.alt_loc || "";
  const rightAlt = right.alt_loc || "";
  if (leftAlt !== rightAlt) {
    if (!leftAlt) return -1;
    if (!rightAlt) return 1;
    return leftAlt.localeCompare(rightAlt);
  }
  return (left.serial ?? 0) - (right.serial ?? 0);
}

function applyAlternateLocationPolicy(atoms, policy) {
  if (policy === "all") {
    return atoms;
  }
  const groups = new Map();
  atoms.forEach((atom, index) => {
    const key = alternateAtomSiteKey(atom);
    const group = groups.get(key) ?? [];
    group.push({ atom, index });
    groups.set(key, group);
  });
  const keptIndexes = new Set();
  for (const group of groups.values()) {
    if (group.length === 1 && !group[0].atom.alt_loc) {
      keptIndexes.add(group[0].index);
      continue;
    }
    let candidates = group;
    if (policy === "preferred") {
      const blank = group.filter(({ atom }) => !atom.alt_loc);
      if (blank.length > 0) {
        candidates = blank;
      }
    }
    const selected = policy === "first"
      ? [...candidates].sort((left, right) => left.index - right.index)[0]
      : [...candidates].sort((left, right) => compareAlternateAtoms(left.atom, right.atom))[0];
    keptIndexes.add(selected.index);
  }
  return atoms.filter((atom, index) => keptIndexes.has(index));
}

function filterMissingResidues(rows, selectedModel, selectedChains) {
  const requestedChains = selectedChains === "all" ? null : new Set(selectedChains);
  return rows
    .filter((row) => selectedModel === "all" || row.model == null || row.model === selectedModel)
    .filter((row) => !requestedChains || requestedChains.has(row.chain || "_"))
    .sort((left, right) =>
      (left.model ?? 0) - (right.model ?? 0) ||
      String(left.chain).localeCompare(String(right.chain)) ||
      left.residue_number - right.residue_number ||
      String(left.insertion_code).localeCompare(String(right.insertion_code)) ||
      String(left.residue_name).localeCompare(String(right.residue_name))
    );
}

function formatPdbAtomName(atomName) {
  const text = String(atomName ?? "").trim().slice(0, 4);
  if (text.length < 4 && /^[A-Za-z]/.test(text)) {
    return ` ${text.padEnd(3)}`;
  }
  return text.padEnd(4);
}

function formatPdbAtomLine(atom) {
  const record = atom.hetero ? "HETATM" : "ATOM  ";
  const serial = String(atom.serial ?? 0).slice(-5).padStart(5);
  const atomName = formatPdbAtomName(atom.atom_name);
  const altLoc = String(atom.alt_loc ?? " ").slice(0, 1) || " ";
  const residueName = String(atom.residue_name ?? "UNK").slice(0, 3).padStart(3);
  const chain = String(atom.chain ?? "_").slice(0, 1) || "_";
  const residueNumber = String(atom.residue_number ?? 0).slice(-4).padStart(4);
  const insertionCode = String(atom.insertion_code ?? " ").slice(0, 1) || " ";
  const x = Number.isFinite(atom.x) ? atom.x.toFixed(3).padStart(8) : "   0.000";
  const y = Number.isFinite(atom.y) ? atom.y.toFixed(3).padStart(8) : "   0.000";
  const z = Number.isFinite(atom.z) ? atom.z.toFixed(3).padStart(8) : "   0.000";
  const occupancy = Number.isFinite(atom.occupancy) ? atom.occupancy.toFixed(2).padStart(6) : "  1.00";
  const element = String(atom.element ?? "").slice(0, 2).padStart(2);
  return `${record}${serial} ${atomName}${altLoc}${residueName} ${chain}${residueNumber}${insertionCode}   ${x}${y}${z}${occupancy} 20.00          ${element}`;
}

function serializeAtomsAsPdb(atoms, title, selectedModel) {
  const lines = [];
  const cleanTitle = String(title ?? "Selected structure model").replace(/\s+/g, " ").trim();
  if (cleanTitle) {
    lines.push(`TITLE     ${cleanTitle}`.slice(0, 80));
  }
  if (selectedModel !== "all") {
    lines.push(`MODEL     ${String(selectedModel).padStart(4)}`);
  }
  for (const atom of atoms) {
    lines.push(formatPdbAtomLine(atom));
  }
  if (selectedModel !== "all") {
    lines.push("ENDMDL");
  }
  lines.push("END");
  return `${lines.join("\n")}\n`;
}

function summarizeAtoms(atoms) {
  const residueMap = new Map();
  const chains = new Set();
  const elements = new Map();
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };
  let heteroAtomCount = 0;
  let waterAtomCount = 0;
  for (const atom of atoms) {
    chains.add(atom.chain);
    elements.set(atom.element || "?", (elements.get(atom.element || "?") ?? 0) + 1);
    if (atom.hetero) heteroAtomCount += 1;
    if (atom.water) waterAtomCount += 1;
    if (Number.isFinite(atom.x)) {
      bounds.minX = Math.min(bounds.minX, atom.x);
      bounds.maxX = Math.max(bounds.maxX, atom.x);
    }
    if (Number.isFinite(atom.y)) {
      bounds.minY = Math.min(bounds.minY, atom.y);
      bounds.maxY = Math.max(bounds.maxY, atom.y);
    }
    if (Number.isFinite(atom.z)) {
      bounds.minZ = Math.min(bounds.minZ, atom.z);
      bounds.maxZ = Math.max(bounds.maxZ, atom.z);
    }
    const key = residueKey(atom);
    const residue = residueMap.get(key) ?? {
      chain: atom.chain,
      residue_number: atom.residue_number,
      insertion_code: atom.insertion_code,
      residue_name: atom.residue_name,
      atom_count: 0,
      has_ca: false,
      hetero: atom.hetero,
      first_atom_serial: atom.serial,
      last_atom_serial: atom.serial,
      assembly_operator: atom.assembly_operator || ""
    };
    residue.atom_count += 1;
    residue.has_ca = residue.has_ca || atom.atom_name === "CA";
    residue.first_atom_serial = Math.min(residue.first_atom_serial, atom.serial);
    residue.last_atom_serial = Math.max(residue.last_atom_serial, atom.serial);
    residueMap.set(key, residue);
  }
  const residueRows = Array.from(residueMap.values()).sort((left, right) =>
    String(left.chain).localeCompare(String(right.chain)) ||
    left.residue_number - right.residue_number ||
    String(left.insertion_code).localeCompare(String(right.insertion_code)) ||
    String(left.assembly_operator).localeCompare(String(right.assembly_operator), undefined, { numeric: true })
  );
  return {
    atomCount: atoms.length,
    residueCount: residueRows.length,
    chainCount: chains.size,
    chains: Array.from(chains).sort(),
    heteroAtomCount,
    waterAtomCount,
    elements: Object.fromEntries(Array.from(elements.entries()).sort((a, b) => a[0].localeCompare(b[0]))),
    bounds: Number.isFinite(bounds.minX) ? bounds : null,
    residueRows
  };
}

function makeBiologicalAssemblyRows(assemblies = []) {
  return assemblies.flatMap((assembly) =>
    (assembly.transforms ?? []).flatMap((transform) =>
      transform.matrix.map((row, index) => ({
        assembly_id: assembly.id,
        operator: transform.operator,
        chains: (assembly.chains ?? []).join(", "),
        row: index + 1,
        m1: row[0],
        m2: row[1],
        m3: row[2],
        t: transform.vector[index]
      }))
    )
  );
}

export function summarizeProteinStructure(input, options = {}) {
  const format = detectProteinStructureFormat(input, options.format);
  if (format === "unknown") {
    throw new Error("Could not detect a PDB or mmCIF protein structure file.");
  }
  const parsed = format === "mmcif" ? parseMmcif(input) : parsePdb(input);
  if (parsed.atoms.length === 0) {
    throw new Error(`No atom coordinate records were found in the ${format === "mmcif" ? "mmCIF" : "PDB"} input.`);
  }
  const biologicalAssemblies = parsed.biologicalAssemblies ?? [];
  const biologicalAssemblyRows = makeBiologicalAssemblyRows(biologicalAssemblies);
  const availableModels = availableModelsForAtoms(parsed.atoms);
  const selectedModel = normalizeModelSelection(options.modelSelection, availableModels);
  const requestedBiologicalAssembly = normalizeBiologicalAssemblySelection(options.biologicalAssembly);
  const altLocationPolicy = normalizeAltLocationPolicy(options.altLocationPolicy);
  const modelAtoms = filterAtomsByModel(parsed.atoms, selectedModel);
  const availableChains = availableChainsForAtoms(modelAtoms);
  const selectedChains = normalizeChainSelection(options.chainSelection);
  const chainAtoms = filterAtomsByChains(modelAtoms, selectedChains);
  const alternateLocationAtomCount = chainAtoms.filter((atom) => atom.alt_loc).length;
  const selectedAtoms = applyAlternateLocationPolicy(chainAtoms, altLocationPolicy);
  const omittedAlternateLocationAtomCount = Math.max(0, chainAtoms.length - selectedAtoms.length);
  const assemblyResult = applyBiologicalAssembly(selectedAtoms, biologicalAssemblies, requestedBiologicalAssembly);
  const atoms = assemblyResult.atoms;
  const summary = summarizeAtoms(atoms);
  const missingResidueRows = filterMissingResidues(parsed.missingResidues ?? [], selectedModel, selectedChains);
  const modelCount = parsed.modelCount > 0 ? parsed.modelCount : availableModels.length > 1 ? availableModels.length : 0;
  const modelSelectionChangesAtoms = selectedModel !== "all" && !(availableModels.length <= 1 && selectedModel === (availableModels[0] ?? 1));
  const viewerNeedsSerializedPdb = modelSelectionChangesAtoms || selectedChains !== "all" || omittedAlternateLocationAtomCount > 0 || assemblyResult.biologicalAssemblyApplied;
  return {
    format,
    title: parsed.title || (format === "mmcif" ? "mmCIF structure" : "PDB structure"),
    modelCount,
    availableModels,
    selectedModel,
    biologicalAssemblyCount: biologicalAssemblies.length,
    availableBiologicalAssemblies: biologicalAssemblies.map((assembly) => assembly.id),
    biologicalAssemblies,
    biologicalAssemblyRows,
    selectedBiologicalAssembly: assemblyResult.selectedBiologicalAssembly,
    biologicalAssemblyApplied: assemblyResult.biologicalAssemblyApplied,
    assemblyTransformCount: assemblyResult.assemblyTransformCount,
    assemblySourceAtomCount: assemblyResult.assemblySourceAtomCount,
    availableChains,
    selectedChains,
    altLocationPolicy,
    alternateLocationAtomCount,
    omittedAlternateLocationAtomCount,
    missingResidueCount: missingResidueRows.length,
    missingResidueRows,
    viewerFormat: viewerNeedsSerializedPdb ? "pdb" : format,
    viewerStructureText: viewerNeedsSerializedPdb ? serializeAtomsAsPdb(atoms, parsed.title, selectedModel) : "",
    ...summary,
    atomRows: atoms.map((atom) => ({
      serial: atom.serial,
      model: atom.model ?? 1,
      chain: atom.chain,
      residue_number: atom.residue_number,
      residue_name: atom.residue_name,
      atom_name: atom.atom_name,
      element: atom.element,
      x: atom.x,
      y: atom.y,
      z: atom.z,
      hetero: atom.hetero,
      alt_loc: atom.alt_loc,
      occupancy: atom.occupancy,
      assembly_operator: atom.assembly_operator || ""
    }))
  };
}

function formatBounds(bounds) {
  if (!bounds) return "not available";
  return [
    `X ${bounds.minX.toFixed(2)} to ${bounds.maxX.toFixed(2)}`,
    `Y ${bounds.minY.toFixed(2)} to ${bounds.maxY.toFixed(2)}`,
    `Z ${bounds.minZ.toFixed(2)} to ${bounds.maxZ.toFixed(2)}`
  ].join("; ");
}

export function makeProteinStructureReport(summary, options = {}) {
  const lines = [
    "Protein Structure Viewer",
    "",
    `Title: ${summary.title}`,
    `Format: ${summary.format === "mmcif" ? "mmCIF" : "PDB"}`
  ];
  if (summary.modelCount > 0) {
    const selection = summary.selectedModel === "all" ? "all models" : `model ${summary.selectedModel}`;
    const available = summary.availableModels?.length ? ` (${summary.availableModels.join(", ")})` : "";
    lines.push(`Models: ${summary.modelCount.toLocaleString()}${available}`);
    lines.push(`Model selection: ${selection}`);
  }
  if (summary.availableChains?.length) {
    const selection = summary.selectedChains === "all" ? "all chains" : summary.selectedChains.join(", ");
    lines.push(`Available chains: ${summary.availableChains.join(", ")}`);
    lines.push(`Chain selection: ${selection}`);
  }
  if (summary.biologicalAssemblyCount > 0 || summary.selectedBiologicalAssembly !== "asymmetric") {
    lines.push(`Biological assemblies: ${(summary.biologicalAssemblyCount ?? 0).toLocaleString()}${summary.availableBiologicalAssemblies?.length ? ` (${summary.availableBiologicalAssemblies.join(", ")})` : ""}`);
    lines.push(`Assembly selection: ${summary.selectedBiologicalAssembly === "asymmetric" ? "coordinate file / asymmetric unit" : `biomolecule ${summary.selectedBiologicalAssembly}`}`);
    if (summary.biologicalAssemblyApplied) {
      lines.push(`Assembly transforms applied: ${(summary.assemblyTransformCount ?? 0).toLocaleString()} to ${(summary.assemblySourceAtomCount ?? 0).toLocaleString()} source atom(s)`);
    }
  }
  lines.push(
    `Atoms: ${summary.atomCount.toLocaleString()}`,
    `Residues: ${summary.residueCount.toLocaleString()}`,
    `Missing residues reported: ${(summary.missingResidueCount ?? 0).toLocaleString()}`,
    `Alternate-location atoms in selection: ${(summary.alternateLocationAtomCount ?? 0).toLocaleString()}`,
    `Alternate-location policy: ${summary.altLocationPolicy ?? "preferred"}${summary.omittedAlternateLocationAtomCount ? ` (${summary.omittedAlternateLocationAtomCount.toLocaleString()} alternate atom record(s) omitted)` : ""}`,
    `Chains: ${summary.chainCount.toLocaleString()} (${summary.chains.join(", ") || "none"})`,
    `Hetero atoms: ${summary.heteroAtomCount.toLocaleString()}`,
    `Water atoms: ${summary.waterAtomCount.toLocaleString()}`,
    `Coordinate bounds: ${formatBounds(summary.bounds)}`,
    "",
    "Viewer settings:",
    `Representation: ${options.representation ?? "cartoon-stick"}`,
    `Coloring: ${options.colorScheme ?? "chain"}`,
    `Hetero atoms shown: ${options.showHetAtoms === false ? "no" : "yes"}`,
    `Waters shown: ${options.showWaters ? "yes" : "no"}`
  );
  return `${lines.join("\n")}\n`;
}
