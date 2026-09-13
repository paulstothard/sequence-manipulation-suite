const DEFAULT_CROWDING_GRID_SIZE = 8;

function defaultGroup(point) {
  return point?.group ?? point?.series ?? "Data";
}

export function sampleStratifiedPoints(points, limit, options = {}) {
  const source = Array.isArray(points) ? points : [];
  const target = Math.max(0, Math.min(source.length, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 0));
  if (target === 0) return [];
  if (target === source.length) return source.slice();

  const getGroup = options.getGroup ?? defaultGroup;
  const buckets = new Map();
  for (const [sourceIndex, point] of source.entries()) {
    const group = String(getGroup(point) ?? "Data");
    const bucket = buckets.get(group) ?? [];
    bucket.push({ point, sourceIndex });
    buckets.set(group, bucket);
  }

  const groups = [...buckets.entries()].map(([group, entries]) => ({
    group,
    entries,
    allocation: target >= buckets.size ? 1 : 0,
    remainder: 0
  }));
  let remaining = target - groups.reduce((sum, group) => sum + group.allocation, 0);
  const capacity = groups.reduce((sum, group) => sum + Math.max(0, group.entries.length - group.allocation), 0);
  if (remaining > 0 && capacity > 0) {
    for (const group of groups) {
      const available = Math.max(0, group.entries.length - group.allocation);
      const ideal = remaining * available / capacity;
      const extra = Math.min(available, Math.floor(ideal));
      group.allocation += extra;
      group.remainder = ideal - extra;
    }
    remaining = target - groups.reduce((sum, group) => sum + group.allocation, 0);
    for (const group of groups
      .filter((candidate) => candidate.allocation < candidate.entries.length)
      .sort((left, right) => right.remainder - left.remainder || right.entries.length - left.entries.length)) {
      if (remaining <= 0) break;
      group.allocation += 1;
      remaining -= 1;
    }
  }

  const selected = new Set();
  for (const group of groups) {
    const count = Math.min(group.entries.length, group.allocation);
    for (let index = 0; index < count; index += 1) {
      const sampledIndex = Math.min(
        group.entries.length - 1,
        Math.floor(((index + 0.5) * group.entries.length) / count)
      );
      selected.add(group.entries[sampledIndex].sourceIndex);
    }
  }
  return source.filter((_point, index) => selected.has(index));
}

export function annotatePointCrowding(points, options = {}) {
  const source = Array.isArray(points) ? points : [];
  const getX = options.getX ?? ((point) => point?.x);
  const getY = options.getY ?? ((point) => point?.y);
  const getValue = options.getValue ?? (() => null);
  const gridSize = Math.max(1, Number(options.gridSize) || DEFAULT_CROWDING_GRID_SIZE);
  const bins = new Map();
  const geometry = source.map((point) => {
    const rawValue = getValue(point);
    return {
      point,
      x: Number(getX(point)),
      y: Number(getY(point)),
      value: rawValue === null || rawValue === undefined || rawValue === "" ? Number.NaN : Number(rawValue)
    };
  });

  for (const item of geometry) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
    const key = `${Math.floor(item.x / gridSize)}:${Math.floor(item.y / gridSize)}`;
    const bin = bins.get(key) ?? { count: 0, min: Infinity, max: -Infinity };
    bin.count += 1;
    if (Number.isFinite(item.value)) {
      bin.min = Math.min(bin.min, item.value);
      bin.max = Math.max(bin.max, item.value);
    }
    bins.set(key, bin);
  }

  return geometry.map((item) => {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) {
      return { ...item.point, inspectionCrowding: { count: 1, min: null, max: null } };
    }
    const xIndex = Math.floor(item.x / gridSize);
    const yIndex = Math.floor(item.y / gridSize);
    const nearby = { count: 0, min: Infinity, max: -Infinity };
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        const bin = bins.get(`${xIndex + xOffset}:${yIndex + yOffset}`);
        if (!bin) continue;
        nearby.count += bin.count;
        nearby.min = Math.min(nearby.min, bin.min);
        nearby.max = Math.max(nearby.max, bin.max);
      }
    }
    return {
      ...item.point,
      inspectionCrowding: {
        count: Math.max(1, nearby.count),
        min: Number.isFinite(nearby.min) ? nearby.min : null,
        max: Number.isFinite(nearby.max) ? nearby.max : null
      }
    };
  });
}

export function pointCrowdingFact(point, options = {}) {
  const count = Number(point?.inspectionCrowding?.count) || 0;
  if (count <= 1) return "";
  const noun = options.noun || "displayed points";
  return `nearest of ${count.toLocaleString()} ${noun} in this dense area`;
}

export function pointSamplingFact({ displayed, total, noun = "points", method = "group-stratified" } = {}) {
  const shown = Math.max(0, Number(displayed) || 0);
  const available = Math.max(shown, Number(total) || 0);
  if (available <= shown) return "";
  return `displayed ${noun} are a ${method} sample of ${shown.toLocaleString()} of ${available.toLocaleString()}`;
}
