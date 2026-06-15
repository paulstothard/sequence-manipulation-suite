import { formatFastaRecord } from "./fasta.js";
import {
  areTypedObjectContractsCompatible,
  makeWorkflowInputContract,
  makeWorkspaceSequenceContract,
  normalizeTypedObjectAlphabet
} from "./typed-object-contracts.js";

export function normalizeWorkspaceAlphabet(value) {
  return normalizeTypedObjectAlphabet(value);
}

function inferWorkspaceAlphabetFromMetadata(metadata = {}) {
  const text = [
    metadata.name,
    metadata.inputType,
    metadata.summary,
    ...(metadata.tags ?? [])
  ].join(" ").toLowerCase();
  const hasProtein = text.includes("protein");
  const hasNucleotide = text.includes("dna") || text.includes("rna") || text.includes("nucleotide");
  if (hasProtein && !hasNucleotide) {
    return "protein";
  }
  if (hasNucleotide && !hasProtein) {
    return "dna-rna";
  }
  return "";
}

export function getToolWorkspaceSequenceInputs(metadata = {}) {
  const inferredAlphabet = inferWorkspaceAlphabetFromMetadata(metadata);
  return (metadata.workflow?.inputs ?? [])
    .filter((input) => input?.kind === "sequence-records")
    .map((input) => ({
      ...input,
      alphabet: normalizeWorkspaceAlphabet(input.alphabet) || inferredAlphabet
    }));
}

export function toolAcceptsWorkspaceSequences(metadata = {}) {
  return getToolWorkspaceSequenceInputs(metadata).length > 0;
}

export function canToolUseWorkspaceSequence(metadata = {}, sequenceRecord = {}) {
  const acceptedInputs = getToolWorkspaceSequenceInputs(metadata);
  if (acceptedInputs.length === 0) {
    return false;
  }
  const sequenceContract = makeWorkspaceSequenceContract(sequenceRecord);
  return acceptedInputs.some((input) =>
    areTypedObjectContractsCompatible(makeWorkflowInputContract(input), sequenceContract)
  );
}

function makeWorkflowToolMap(tools = []) {
  return new Map(tools.map((tool) => [tool.metadata?.id, tool]).filter(([id]) => id));
}

function getWorkflowStepSequenceInputAlphabets(step = {}, toolMap) {
  if (step.type !== "tool" && step.type !== "map") {
    return [];
  }
  const tool = toolMap.get(step.toolId);
  return getToolWorkspaceSequenceInputs(tool?.metadata).map((input) => input.alphabet).filter(Boolean);
}

function getSequentialConsumerIndex(steps, inputIndex) {
  const nextIndex = inputIndex + 1;
  if (nextIndex >= steps.length) {
    return -1;
  }
  return steps[nextIndex]?.input ? -1 : nextIndex;
}

function getSplitConsumerAlphabets(steps, splitIndex, toolMap) {
  for (let index = splitIndex + 1; index < steps.length; index += 1) {
    const step = steps[index];
    if (step?.input) {
      continue;
    }
    const alphabets = getWorkflowStepSequenceInputAlphabets(step, toolMap);
    if (alphabets.length > 0) {
      return alphabets;
    }
    if (step?.type === "gather") {
      break;
    }
  }
  return ["dna-rna", "protein"];
}

function getWorkflowConsumerSequenceAlphabets(steps, consumerIndex, toolMap) {
  const step = steps[consumerIndex];
  if (!step) {
    return [];
  }
  if (step.type === "split") {
    return getSplitConsumerAlphabets(steps, consumerIndex, toolMap);
  }
  return getWorkflowStepSequenceInputAlphabets(step, toolMap);
}

function intersectAlphabetSets(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

export function getWorkflowWorkspaceSequenceAlphabets(workflow = {}, tools = []) {
  const steps = workflow.steps ?? [];
  const toolMap = makeWorkflowToolMap(tools);
  const inputSteps = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step?.type === "input");

  if (inputSteps.length === 0) {
    return [];
  }

  let allowedAlphabets;
  for (const { step: inputStep, index: inputIndex } of inputSteps) {
    const consumerIndexes = new Set();
    const sequentialIndex = getSequentialConsumerIndex(steps, inputIndex);
    if (sequentialIndex >= 0) {
      consumerIndexes.add(sequentialIndex);
    }
    steps.forEach((step, index) => {
      if (step?.input?.from === inputStep.id) {
        consumerIndexes.add(index);
      }
    });

    if (consumerIndexes.size === 0) {
      return [];
    }

    for (const consumerIndex of consumerIndexes) {
      const alphabets = getWorkflowConsumerSequenceAlphabets(steps, consumerIndex, toolMap);
      if (alphabets.length === 0) {
        return [];
      }
      const next = new Set(alphabets.map(normalizeWorkspaceAlphabet).filter(Boolean));
      allowedAlphabets = allowedAlphabets ? intersectAlphabetSets(allowedAlphabets, next) : next;
    }
  }

  return [...(allowedAlphabets ?? [])].sort();
}

export function canWorkflowUseWorkspaceSequence(workflow = {}, sequenceRecord = {}, tools = []) {
  const acceptedAlphabets = getWorkflowWorkspaceSequenceAlphabets(workflow, tools);
  const recordAlphabet = normalizeWorkspaceAlphabet(sequenceRecord.alphabet);
  return Boolean(recordAlphabet) && acceptedAlphabets.includes(recordAlphabet);
}

export function getWorkspaceSequenceTitle(record = {}, fallbackTitle = "workspace_sequence") {
  return String(record.title ?? record.name ?? record.id ?? fallbackTitle)
    .replace(/[\r\n>]+/g, " ")
    .trim() || fallbackTitle;
}

export function formatWorkspaceSequenceAsFasta(record = {}) {
  return formatFastaRecord(
    getWorkspaceSequenceTitle(record),
    String(record.sequence ?? ""),
    60
  );
}

export function getSequenceRecordStreams(result = {}) {
  return Object.entries(result.streams ?? {})
    .filter(([, stream]) => stream?.kind === "sequence-records" && Array.isArray(stream.records));
}

export function sequenceStreamRecordsToWorkspaceSequences(stream, context = {}) {
  const streamAlphabet = normalizeWorkspaceAlphabet(stream?.alphabet);
  const now = context.createdAt ?? new Date().toISOString();
  return (stream?.records ?? [])
    .map((record, index) => {
      const sequence = String(record.sequence ?? "").replace(/\s+/g, "");
      const alphabet = normalizeWorkspaceAlphabet(record.alphabet) || streamAlphabet;
      return {
        name: getWorkspaceSequenceTitle(record, `sequence_${index + 1}`),
        sequence,
        alphabet,
        length: sequence.length,
        topology: record.topology ?? "",
        sourceTitle: record.sourceTitle ?? "",
        sourceToolId: context.sourceToolId ?? "",
        sourceToolName: context.sourceToolName ?? "",
        sourceStreamId: context.sourceStreamId ?? "",
        createdAt: now,
        updatedAt: now
      };
    })
    .filter((record) => record.sequence && record.alphabet);
}

export function workflowSequenceValueToWorkspaceSequences(value, context = {}) {
  if (value?.kind === "sequence-records") {
    return sequenceStreamRecordsToWorkspaceSequences(value, context);
  }
  if (value?.kind === "collection") {
    return (value.items ?? []).flatMap((item, index) =>
      workflowSequenceValueToWorkspaceSequences(item, {
        ...context,
        sourceStreamId: context.sourceStreamId ?? `workflow-item-${index + 1}`
      })
    );
  }
  return [];
}
