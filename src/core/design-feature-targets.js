export const DESIGN_FEATURE_PREVIEW_MAX_CHARACTERS = 2_000_000;

// Feature targets keep original record coordinates; they never crop or concatenate sequence.
function fingerprint(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

function qualifier(feature, name) {
  const value = feature.qualifiers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function listDesignFeatureTargets(records) {
  return records.flatMap((record, recordIndex) => {
    const sequence = String(record.sequence ?? "");
    const identityIndex = record.featureTargetRecordIndex ?? recordIndex;
    const recordKey = `${identityIndex}:${sequence.length}:${fingerprint(sequence)}`;
    return (record.sourceFeatures ?? record.features ?? []).flatMap((feature, featureIndex) => {
      const location = feature.parsedLocation;
      if (feature.feature === "source" || !location?.supported || !location.ranges?.length) return [];
      if (location.ranges.some(({ start, end }) => !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > sequence.length)) return [];
      const ranges = location.ranges.map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start || a.end - b.end);
      // Merge overlapping/adjacent parts, retaining gaps between exons or other joined parts.
      const parts = [];
      for (const range of ranges) {
        const previous = parts.at(-1);
        if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
        else parts.push({ ...range });
      }
      const name = qualifier(feature, "label") || qualifier(feature, "Name") || feature.gene || feature.locus_tag || qualifier(feature, "ID") || feature.product || feature.feature;
      const span = parts.map(({ start, end }) => `${start}-${end}`).join(", ");
      const label = `${record.title || record.accession || "Record"} [${identityIndex + 1}] · ${name} (${feature.feature}; ${span}; ${location.strand || "+"})`;
      const value = JSON.stringify({ key: `${recordKey}:${featureIndex}:${fingerprint(JSON.stringify([record.title, feature]))}`, label });
      const crossesOrigin = location.ranges.some((range, index, all) => index > 0 && range.start < all[index - 1].start);
      return [{ value, label, recordIndex, featureIndex, parts, start: parts[0].start, end: parts.at(-1).end, partial: location.partial === true, crossesOrigin }];
    });
  });
}

export function resolveDesignFeatureTarget(records, value) {
  if (!value) return null;
  const matches = listDesignFeatureTargets(records).filter(feature => feature.value === value);
  if (matches.length > 1) throw new Error("The selected target feature matches multiple workflow records. Keep one source record before designing candidates.");
  const target = matches[0];
  if (!target) throw new Error("The selected target feature is no longer available in this input. Select a current feature or choose All input sequences.");
  return target;
}

export function designFeatureTargetLabel(value) {
  if (!value) return "All input sequences";
  try { return JSON.parse(value).label || "Selected feature"; } catch { return "Selected feature"; }
}

export function featureContainsInterval(target, start, end = start) {
  return Number.isFinite(start) && Number.isFinite(end) && target.parts.some(part => start >= part.start && end <= part.end);
}

export function primerPairMatchesFeature(target, mode, left, right) {
  if (!target) return true;
  return mode === "within"
    ? featureContainsInterval(target, left.start, right.end)
    : left.end < target.start && right.start > target.end;
}
