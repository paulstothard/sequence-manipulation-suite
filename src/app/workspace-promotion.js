import {
  getSequenceRecordStreams,
  sequenceStreamRecordsToWorkspaceSequences,
  workflowSequenceValueToWorkspaceSequences
} from "../core/workspace.js";
import {
  viewerRecordToWorkspaceFeatureLayers,
  workflowViewerValueToWorkspaceFeatureLayers
} from "../core/workspace-layers.js";

function viewerFromValue(value = {}) {
  if (value?.kind === "viewer") {
    return value.viewer;
  }
  if (value?.viewerType && Array.isArray(value.records)) {
    return value;
  }
  return null;
}

function viewerValueToSequenceLayerGroups(value = {}, context = {}) {
  if (value?.kind === "collection") {
    return (value.items ?? []).flatMap((item, index) =>
      viewerValueToSequenceLayerGroups(item, {
        ...context,
        sourceStreamId: `${context.sourceStreamId ?? "viewer"}:${index + 1}`
      })
    );
  }

  const viewer = viewerFromValue(value);
  if (!viewer?.records?.length) {
    return [];
  }

  return viewer.records
    .map((record) => {
      const sequenceDraft = sequenceStreamRecordsToWorkspaceSequences(
        {
          kind: "sequence-records",
          alphabet: viewer.alphabet ?? record.alphabet,
          records: [
            {
              title: record.title ?? record.name ?? record.id,
              sequence: record.sequence,
              alphabet: record.alphabet ?? viewer.alphabet,
              topology: record.topology
            }
          ]
        },
        context
      )[0];

      const layerDrafts = viewerRecordToWorkspaceFeatureLayers(record, {
        ...context,
        alphabet: viewer.alphabet ?? record.alphabet,
        sourceStreamId: context.sourceStreamId ?? value.id ?? "viewer",
        recordId: record.id,
        recordTitle: record.title
      });

      return sequenceDraft && layerDrafts.length > 0
        ? { sequenceDraft, layerDrafts }
        : null;
    })
    .filter(Boolean);
}

export function getResultWorkspaceSequenceDrafts(result = {}, context = {}) {
  return getSequenceRecordStreams(result).flatMap(([streamId, stream]) =>
    sequenceStreamRecordsToWorkspaceSequences(stream, {
      ...context,
      sourceStreamId: streamId
    })
  );
}

export function getResultWorkspaceFeatureLayerDrafts(result = {}, context = {}) {
  const viewer = result?.visual?.viewer;
  if (!viewer?.records?.length) {
    return [];
  }
  return viewer.records.flatMap((record) =>
    viewerRecordToWorkspaceFeatureLayers(record, {
      ...context,
      alphabet: viewer.alphabet ?? record.alphabet,
      sourceStreamId: context.sourceStreamId ?? "visual.viewer",
      recordId: record.id,
      recordTitle: record.title
    })
  );
}

export function getResultWorkspaceSequenceLayerGroups(result = {}, context = {}) {
  return viewerValueToSequenceLayerGroups(result?.visual?.viewer, {
    ...context,
    sourceStreamId: context.sourceStreamId ?? "visual.viewer"
  });
}

export function getWorkflowWorkspaceSequenceDrafts(value, context = {}) {
  return workflowSequenceValueToWorkspaceSequences(value, context);
}

export function getWorkflowWorkspaceFeatureLayerDrafts(value, context = {}) {
  return workflowViewerValueToWorkspaceFeatureLayers(value, context);
}

export function getWorkflowWorkspaceSequenceLayerGroups(value, context = {}) {
  return viewerValueToSequenceLayerGroups(value, {
    ...context,
    sourceStreamId: context.sourceStreamId ?? "workflow-output"
  });
}
