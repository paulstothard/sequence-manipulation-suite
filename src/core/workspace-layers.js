import {
  makeWorkflowStreamContract,
  normalizeTypedObjectAlphabet
} from "./typed-object-contracts.js";

function normalizeFeatureItem(item = {}) {
  const start = Number(item.start);
  const end = Number(item.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return {
    start,
    end,
    ...(Array.isArray(item.parts) ? { parts: item.parts } : {}),
    label: item.label ?? item.name ?? item.type ?? "feature",
    name: item.name ?? "",
    type: item.type ?? "feature",
    strand: item.strand ?? "",
    length: Number.isFinite(Number(item.length)) ? Number(item.length) : Math.abs(end - start) + 1,
    location: item.location ?? "",
    source: item.source ?? ""
  };
}

function makeLayerId(track, context) {
  return [
    context.sequenceId || "workspace-sequence",
    track.id || track.label || "features",
    "layer"
  ]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function viewerFeatureTrackToWorkspaceLayer(track = {}, context = {}) {
  if ((track.type ?? "features") !== "features") {
    return null;
  }
  const features = (track.items ?? track.features ?? [])
    .map(normalizeFeatureItem)
    .filter(Boolean);
  if (features.length === 0) {
    return null;
  }
  const alphabet = normalizeTypedObjectAlphabet(context.alphabet);
  return {
    id: context.layerId || makeLayerId(track, context),
    kind: "feature-layer",
    version: 1,
    contract: makeWorkflowStreamContract({ kind: "feature-layer", alphabet, id: track.id || "features" }),
    sequenceId: context.sequenceId ?? "",
    sequenceHash: context.sequenceHash ?? "",
    alphabet,
    coordinateUnit: context.coordinateUnit ?? (alphabet === "protein" ? "residue" : "base"),
    label: track.label || "Feature layer",
    trackId: track.id || "features",
    generatedBy: {
      toolId: context.sourceToolId ?? "",
      toolName: context.sourceToolName ?? "",
      options: context.options ?? {}
    },
    source: {
      streamId: context.sourceStreamId ?? "",
      recordId: context.recordId ?? "",
      recordTitle: context.recordTitle ?? ""
    },
    createdAt: context.createdAt ?? new Date().toISOString(),
    features,
    warnings: context.warnings ?? [],
    citations: context.citations ?? []
  };
}

export function viewerRecordToWorkspaceFeatureLayers(record = {}, context = {}) {
  return (record.tracks ?? [])
    .map((track) =>
      viewerFeatureTrackToWorkspaceLayer(track, {
        ...context,
        alphabet: context.alphabet ?? record.alphabet,
        recordId: context.recordId ?? record.id,
        recordTitle: context.recordTitle ?? record.title
      })
    )
    .filter(Boolean);
}

function viewerFromStream(value = {}) {
  if (value?.kind === "viewer") {
    return value.viewer;
  }
  if (value?.viewerType && Array.isArray(value.records)) {
    return value;
  }
  return null;
}

export function viewerStreamToWorkspaceFeatureLayers(value = {}, context = {}) {
  const viewer = viewerFromStream(value);
  if (!viewer?.records?.length) {
    return [];
  }
  return viewer.records.flatMap((record) =>
    viewerRecordToWorkspaceFeatureLayers(record, {
      ...context,
      alphabet: context.alphabet ?? viewer.alphabet ?? record.alphabet,
      sourceStreamId: context.sourceStreamId ?? value.id ?? "viewer",
      recordId: context.recordId ?? record.id,
      recordTitle: context.recordTitle ?? record.title
    })
  );
}

export function workflowViewerValueToWorkspaceFeatureLayers(value = {}, context = {}) {
  if (value?.kind === "collection") {
    return (value.items ?? []).flatMap((item, index) =>
      workflowViewerValueToWorkspaceFeatureLayers(item, {
        ...context,
        sourceStreamId: `${context.sourceStreamId ?? "workflow-output"}:${index + 1}`
      })
    );
  }
  return viewerStreamToWorkspaceFeatureLayers(value, context);
}

export function workspaceFeatureLayerToViewerTrack(layer = {}) {
  if (layer.kind !== "feature-layer") {
    return null;
  }
  return {
    id: layer.trackId || layer.id || "workspace-feature-layer",
    type: "features",
    label: layer.label || "Workspace feature layer",
    generatedBy: layer.generatedBy,
    items: (layer.features ?? [])
      .map(normalizeFeatureItem)
      .filter(Boolean)
      .map((feature) => ({
        start: feature.start,
        end: feature.end,
        ...(Array.isArray(feature.parts) ? { parts: feature.parts } : {}),
        label: feature.label,
        name: feature.name,
        type: feature.type,
        strand: feature.strand,
        length: feature.length,
        location: feature.location,
        source: feature.source
      }))
  };
}

function recordIdentityValues(record = {}) {
  return new Set(
    [record.id, record.title, record.accession, record.name]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );
}

function layerIdentityValues(layer = {}) {
  return new Set(
    [layer.sequenceId, layer.source?.recordId, layer.source?.recordTitle]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );
}

function recordLengthAllowsLayer(layer = {}, record = {}) {
  const length = Number(record.length ?? String(record.sequence ?? "").length);
  if (!Number.isFinite(length) || length <= 0) {
    return true;
  }
  return (layer.features ?? []).every((feature) => {
    const start = Number(feature.start);
    const end = Number(feature.end);
    return Number.isFinite(start) && Number.isFinite(end) && start >= 1 && end <= length;
  });
}

export function workspaceFeatureLayerMatchesRecord(layer = {}, record = {}, context = {}) {
  if (layer.kind !== "feature-layer" || !Array.isArray(layer.features) || layer.features.length === 0) {
    return false;
  }
  const layerAlphabet = normalizeTypedObjectAlphabet(layer.alphabet);
  const recordAlphabet = normalizeTypedObjectAlphabet(record.alphabet ?? context.alphabet);
  if (layerAlphabet && recordAlphabet && layerAlphabet !== recordAlphabet) {
    return false;
  }
  if (!recordLengthAllowsLayer(layer, record)) {
    return false;
  }

  const contextSequenceId = String(context.sequenceId ?? "").trim();
  const contextSequenceHash = String(context.sequenceHash ?? "").trim();
  if (layer.sequenceId && contextSequenceId) {
    return layer.sequenceId === contextSequenceId;
  }
  if (layer.sequenceHash && contextSequenceHash) {
    return layer.sequenceHash === contextSequenceHash;
  }

  const recordIds = recordIdentityValues(record);
  for (const value of layerIdentityValues(layer)) {
    if (recordIds.has(value)) {
      return true;
    }
  }
  return false;
}

function safeTrackId(value) {
  return String(value || "workspace-feature-layer")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace-feature-layer";
}

function makeUniqueId(baseId, usedIds) {
  let id = safeTrackId(baseId);
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${safeTrackId(baseId)}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function matchedWorkspaceLayerTracks(layers = [], record = {}, context = {}) {
  const usedIds = new Set((record.tracks ?? []).map((track) => track.id).filter(Boolean));
  return (layers ?? [])
    .filter((layer) => workspaceFeatureLayerMatchesRecord(layer, record, context))
    .map((layer) => {
      const track = workspaceFeatureLayerToViewerTrack(layer);
      if (!track) {
        return null;
      }
      return {
        ...track,
        id: makeUniqueId(`workspace-${layer.id || layer.trackId || track.id}`, usedIds),
        label: `Workspace: ${track.label}`,
        workspaceLayerId: layer.id || ""
      };
    })
    .filter(Boolean);
}

export function attachWorkspaceFeatureLayersToViewer(viewer = null, layers = [], context = {}) {
  if (!viewer?.records?.length || !Array.isArray(layers) || layers.length === 0) {
    return viewer;
  }
  let attachedCount = 0;
  const records = viewer.records.map((record) => {
    const tracks = matchedWorkspaceLayerTracks(layers, record, {
      ...context,
      alphabet: context.alphabet ?? viewer.alphabet ?? record.alphabet
    });
    if (tracks.length === 0) {
      return record;
    }
    attachedCount += tracks.length;
    return {
      ...record,
      tracks: [...(record.tracks ?? []), ...tracks]
    };
  });
  if (attachedCount === 0) {
    return viewer;
  }
  return {
    ...viewer,
    records,
    workspaceFeatureLayersAttached: attachedCount
  };
}

export function workspaceFeatureLayerToFigureFeatures(layer = {}) {
  if (layer.kind !== "feature-layer") {
    return [];
  }
  const layerId = safeTrackId(layer.id || layer.trackId || layer.label || "workspace-layer");
  return (layer.features ?? [])
    .map((feature, index) => normalizeFeatureItem(feature))
    .filter(Boolean)
    .map((feature, index) => ({
      id: `workspace:${layerId}:${index + 1}`,
      type: feature.type || "feature",
      label: feature.label || feature.name || layer.label || "Workspace feature",
      start: feature.start,
      end: feature.end,
      strand: feature.strand,
      parts: Array.isArray(feature.parts) && feature.parts.length > 0
        ? feature.parts
        : [{ start: feature.start, end: feature.end, strand: feature.strand }],
      source: feature.source || layer.label || "Workspace feature layer",
      workspaceLayerId: layer.id || "",
      workspaceLayerLabel: layer.label || ""
    }));
}

function matchedWorkspaceLayerFigureFeatures(layers = [], record = {}, context = {}) {
  const usedIds = new Set((record.features ?? []).map((feature) => feature.id).filter(Boolean));
  return (layers ?? [])
    .filter((layer) => workspaceFeatureLayerMatchesRecord(layer, record, {
      ...context,
      alphabet: context.alphabet ?? "dna-rna"
    }))
    .flatMap((layer) =>
      workspaceFeatureLayerToFigureFeatures(layer).map((feature) => ({
        ...feature,
        id: makeUniqueId(feature.id, usedIds)
      }))
    );
}

export function attachWorkspaceFeatureLayersToFigure(figure = null, layers = [], context = {}) {
  if (!figure?.records?.length || !Array.isArray(layers) || layers.length === 0) {
    return figure;
  }
  let attachedCount = 0;
  const records = figure.records.map((record) => {
    const features = matchedWorkspaceLayerFigureFeatures(layers, record, context);
    if (features.length === 0) {
      return record;
    }
    attachedCount += features.length;
    return {
      ...record,
      features: [...(record.features ?? []), ...features]
    };
  });
  if (attachedCount === 0) {
    return figure;
  }
  return {
    ...figure,
    records,
    workspaceFeatureLayersAttached: attachedCount
  };
}
