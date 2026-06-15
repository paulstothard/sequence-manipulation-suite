export function normalizeTypedObjectAlphabet(value) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("protein")) {
    return "protein";
  }
  if (text.includes("dna") || text.includes("rna") || text.includes("nucleotide")) {
    return "dna-rna";
  }
  return "";
}

export function normalizeTypedObjectKind(value) {
  const text = String(value ?? "").toLowerCase().replace(/[_\s]+/g, "-");
  if (text === "sequence" || text === "sequence-record" || text === "sequence-records") {
    return "sequence-records";
  }
  if (text === "table" || text === "tsv" || text === "csv") {
    return "table";
  }
  if (text === "text" || text === "report" || text === "primary") {
    return "text";
  }
  if (text === "collection") {
    return "collection";
  }
  if (text.includes("feature") && text.includes("layer")) {
    return "feature-layer";
  }
  if (text.includes("variant") && text.includes("layer")) {
    return "variant-layer";
  }
  return text;
}

export function makeWorkspaceSequenceContract(record = {}) {
  return {
    kind: "sequence-records",
    alphabet: normalizeTypedObjectAlphabet(record.alphabet),
    multiplicity: "one-record",
    role: "workspace-sequence"
  };
}

export function makeWorkflowInputContract(input = {}, fallback = {}) {
  return {
    kind: normalizeTypedObjectKind(input.kind),
    alphabet: normalizeTypedObjectAlphabet(input.alphabet) || normalizeTypedObjectAlphabet(fallback.alphabet),
    multiplicity: input.multiplicity ?? fallback.multiplicity ?? "",
    role: input.role ?? input.id ?? fallback.role ?? ""
  };
}

export function makeWorkflowStreamContract(stream = {}, fallback = {}) {
  return {
    kind: normalizeTypedObjectKind(stream.kind),
    alphabet: normalizeTypedObjectAlphabet(stream.alphabet) || normalizeTypedObjectAlphabet(fallback.alphabet),
    multiplicity: stream.multiplicity ?? fallback.multiplicity ?? "",
    role: stream.role ?? stream.id ?? fallback.role ?? "",
    schema: stream.schema ?? fallback.schema ?? ""
  };
}

export function areTypedObjectContractsCompatible(consumer = {}, producer = {}) {
  const consumerKind = normalizeTypedObjectKind(consumer.kind);
  const producerKind = normalizeTypedObjectKind(producer.kind);
  if (!consumerKind || !producerKind || consumerKind !== producerKind) {
    return false;
  }

  const consumerAlphabet = normalizeTypedObjectAlphabet(consumer.alphabet);
  const producerAlphabet = normalizeTypedObjectAlphabet(producer.alphabet);
  if (consumerAlphabet && !producerAlphabet) {
    return false;
  }
  if (consumerAlphabet && producerAlphabet && consumerAlphabet !== producerAlphabet) {
    return false;
  }

  return true;
}
